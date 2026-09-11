import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fitTransform, applyTransform, eigenSymmetric } from '../public/dcs-core.mjs';

const { fixtures } = JSON.parse(await readFile(new URL('./fixtures/reference.json', import.meta.url)));
const near = (actual, expected, tolerance = 1e-7) => {
  if (Array.isArray(expected)) return expected.forEach((value, i) => near(actual[i], value, tolerance));
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

for (const fixture of fixtures) test(`${fixture.id}: matches the preserved Python engine`, () => {
  const pixels = new Uint8ClampedArray(fixture.rgba);
  const fit = fitTransform(pixels, { targetStd: 42, maxGain: 12 });
  near(fit.mean, fixture.expected.mean_rgb);
  near(fit.covariance, fixture.expected.covariance_rgb);
  near(fit.matrix, fixture.expected.matrix_rgb);
  near(fit.offset, fixture.expected.offset_rgb);
  near(fit.fitClippedFraction, fixture.expected.fit_sample_any_channel_clipped_fraction);
  assert.equal(fit.sampleCount, fixture.expected.sample_count);
  assert.deepEqual([...pixels], fixture.rgba, 'fitting must preserve source pixels');
  applyTransform(pixels, fit);
  pixels.forEach((value, i) => near(value, fixture.expectedRGBA[i], 1));
});

test('eigendecomposition handles equal eigenvalues and highly correlated channels', () => {
  for (const covariance of [[[4, 0, 0], [0, 4, 0], [0, 0, 4]], [[100, 100, 100], [100, 100, 100], [100, 100, 100]]]) {
    const result = eigenSymmetric(covariance);
    assert.ok(result.residual < 1e-8);
    near(result.values.reduce((a, b) => a + b), covariance.reduce((sum, row, i) => sum + row[i], 0));
  }
});

test('transparency is excluded from fitting and alpha is preserved on export', () => {
  const source = new Uint8ClampedArray(fixtures[0].rgba);
  const extended = new Uint8ClampedArray([...source, 200, 20, 40, 0, 80, 30, 100, 120]);
  const fit = fitTransform(extended);
  near(fit.matrix, fitTransform(source).matrix);
  applyTransform(extended, fit);
  assert.deepEqual([...extended.slice(-8, -4)], [200, 20, 40, 0]);
  assert.equal(extended.at(-1), 120);
});

test('blank, clipped, tiny and malformed images produce useful errors', () => {
  assert.throws(() => fitTransform(new Uint8ClampedArray(400).fill(255)), /larger area/);
  assert.throws(() => fitTransform(new Uint8ClampedArray([80, 90, 100, 255])), /larger area/);
  assert.throws(() => fitTransform(new Uint8ClampedArray(401)), /RGBA/);
  assert.throws(() => fitTransform(new Uint8ClampedArray(Array(40).fill([90, 90, 90, 255]).flat())), /no color variation/);
  for (const settings of [{targetStd: NaN}, {targetStd: 81}, {maxGain: 25}, {maxGain: -1}]) assert.throws(() => fitTransform(new Uint8ClampedArray(fixtures[0].rgba), settings), /supported range/);
});

test('grayscale remains neutral and gain stays bounded', () => {
  const gray = new Uint8ClampedArray(Array.from({length: 160}, (_, i) => [20 + i, 20 + i, 20 + i, 255]).flat());
  const fit = fitTransform(gray, {targetStd: 65, maxGain: 3});
  assert.equal(fit.independentColorAxes, 1);
  assert.ok(fit.gains.every(value => value <= 3));
  applyTransform(gray, fit);
  for (let i = 0; i < gray.length; i += 4) { assert.equal(gray[i], gray[i + 1]); assert.equal(gray[i], gray[i + 2]); }
});
