// Exercise the real worker's messages, races and stripe exports with a small
// in-memory canvas adapter. Browser codec/rendering validation is separate.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { fitTransform, applyTransform } from '../public/dcs-core.mjs';

const workerCode = (await readFile(new URL('../public/dcs-worker.js', import.meta.url), 'utf8')).replace(/^import .*;\n/, '');
function bitmap(width = 40, height = 600) {
  return { width, height, closed: false, close() { this.closed = true; }, pixels: new Uint8ClampedArray(Array.from({length: width * height}, (_, i) => [30 + i % 130, 60 + i * 7 % 110, 40 + i * 13 % 160, 255]).flat()) };
}
class Canvas {
  constructor(width, height) { this.width = width; this.height = height; this.pixels = new Uint8ClampedArray(width * height * 4); }
  getContext() { return this; }
  drawImage(source, ...args) {
    let sx = 0, sy = 0, sw = source.width, sh = source.height, dx = 0, dy = 0, dw = sw, dh = sh;
    if (args.length === 2) [dx, dy] = args;
    if (args.length === 4) [dx, dy, dw, dh] = args;
    if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const from = (Math.min(source.height - 1, Math.floor(sy + (y + .5) * sh / dh)) * source.width + Math.min(source.width - 1, Math.floor(sx + (x + .5) * sw / dw))) * 4;
      this.pixels.set(source.pixels.subarray(from, from + 4), ((dy + y) * this.width + dx + x) * 4);
    }
  }
  getImageData(x, y, width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) data.set(this.pixels.subarray(((y + row) * this.width + x) * 4, ((y + row) * this.width + x + width) * 4), row * width * 4);
    return { data, width, height };
  }
  putImageData(image, x, y) {
    for (let row = 0; row < image.height; row++) this.pixels.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((y + row) * this.width + x) * 4);
  }
  async convertToBlob() { return new Blob([JSON.stringify({ width: this.width, height: this.height, pixels: [...this.pixels] })]); }
}
function harness(decoder = async blob => blob.bitmap) {
  const messages = [];
  const self = { postMessage(message) { messages.push(message); } };
  const context = vm.createContext({ self, createImageBitmap: decoder, OffscreenCanvas: Canvas, crypto: webcrypto, fitTransform, applyTransform, Blob, Uint8ClampedArray, setTimeout });
  vm.runInContext(workerCode, context);
  let sequence = 0;
  return { messages, send: data => self.onmessage({data: {jobId: ++sequence, ...data}}), last: () => messages.at(-1) };
}
const blobFor = image => ({bitmap: image, arrayBuffer: async () => new Uint8Array([1, 2, 3, image.width % 256]).buffer});

test('load, selected-area preview and native-size striped export retain the same fit', async () => {
  const h = harness(), image = bitmap();
  await h.send({type: 'load', imageId: 1, blob: blobFor(image)});
  assert.equal(h.last().type, 'loaded');
  assert.equal(h.last().height, 600);
  const region = [.1, .2, .9, .8], settings = {targetStd: 34, maxGain: 8};
  await h.send({type: 'preview', imageId: 1, region, settings});
  const preview = h.last();
  assert.equal(preview.type, 'preview');
  assert.deepEqual([...preview.fit.fitBoxPixels], [4, 120, 36, 480]);
  assert.match(preview.fit.sourceSHA256, /^[a-f0-9]{64}$/);
  await h.send({type: 'export', imageId: 1, region, settings});
  const result = h.last();
  assert.equal(result.type, 'export');
  assert.deepEqual(result.fit.matrix, preview.fit.matrix);
  const output = JSON.parse(await result.blob.text());
  assert.equal(output.width, 40); assert.equal(output.height, 600);
  assert.deepEqual(output.pixels, [...applyTransform(new Uint8ClampedArray(image.pixels), result.fit)]);
  assert.ok(h.messages.filter(message => message.type === 'progress').length >= 3);
});

test('invalid regions and stale image requests fail without returning an enhancement', async () => {
  const h = harness();
  await h.send({type: 'load', imageId: 1, blob: blobFor(bitmap())});
  for (const region of [[.5, .5, .2, .2], [0, 0, 1.1, 1], [0, 0, .001, .001]]) {
    await h.send({type: 'preview', imageId: 1, region});
    assert.equal(h.last().type, 'error');
  }
  await h.send({type: 'export', imageId: 2}); assert.equal(h.last().type, 'error');
});

test('a slow old image cannot replace the latest selection', async () => {
  let finishOld;
  const h = harness(blob => blob.slow ? new Promise(resolve => {finishOld = resolve;}) : Promise.resolve(blob.bitmap));
  const old = bitmap(20, 20), newer = bitmap(30, 30);
  const waiting = h.send({type: 'load', imageId: 1, blob: {...blobFor(old), slow: true}});
  await h.send({type: 'load', imageId: 2, blob: blobFor(newer)});
  finishOld(old); await waiting;
  assert.equal(old.closed, true);
  await h.send({type: 'preview', imageId: 2});
  assert.equal(h.last().type, 'preview'); assert.equal(h.last().fit.width, 30);
});

test('decode failures and excessive image dimensions report errors and release decoded bitmaps', async () => {
  const h = harness(async blob => { if (blob.bad) throw Error('Invalid JPEG'); return blob.bitmap; });
  await h.send({type: 'load', imageId: 1, blob: {bad: true}});
  assert.match(h.last().error, /could not be opened/);
  const image = {width: 16001, height: 1, close() {this.closed = true;}};
  await h.send({type: 'load', imageId: 2, blob: blobFor(image)});
  assert.match(h.last().error, /16,000/); assert.equal(image.closed, true);
});
