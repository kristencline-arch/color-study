import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {cleanJPEG} from '../server/jpeg.mjs';

const origin = 'https://color-study.example';
const fixture = await readFile(new URL('./fixtures/community-test.jpg', import.meta.url));
const {default: worker} = await import('../dist/server/index.js');
let runtime, env;
const context = {waitUntil() {}, passThroughOnException() {}};

before(async () => {
  runtime = new Miniflare({modules: true, script: 'export default {fetch() {return new Response("storage test");}}', compatibilityDate: '2026-05-15', d1Databases: ['DB'], r2Buckets: ['PHOTOS']});
  env = {DB: await runtime.getD1Database('DB'), PHOTOS: await runtime.getR2Bucket('PHOTOS')};
});
after(async () => {await runtime?.dispose();});

const send = (path, init, bindings = env) => worker.fetch(new Request(origin + path, init), bindings, context);
function form(overrides = {}) {
  const value = new FormData();
  for (const [key, content] of Object.entries({title: 'Synthetic integration check', author: 'Color Study test', location: 'Test fixture — not a heritage site', description: '<script>plain text only</script>', consent: 'cc-by-4.0-v1', website: '', ...overrides})) value.set(key, content);
  value.set('photo', new Blob([fixture], {type: 'image/jpeg'}), 'test.jpg');
  value.set('thumbnail', new Blob([fixture], {type: 'image/jpeg'}), 'thumbnail.jpg');
  return value;
}
const submit = (body = form(), ip = '192.0.2.1', bindings) => send('/api/community', {method: 'POST', headers: {Origin: origin, 'CF-Connecting-IP': ip}, body}, bindings);
const remove = receipt => send('/api/community/remove', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: JSON.stringify({id: receipt.photo.id, removal_key: receipt.removal_key})});

test('JPEG sanitation preserves pixels and dimensions while removing EXIF and trailing content', () => {
  const cleaned = cleanJPEG(fixture);
  assert.equal(cleaned.width, 512); assert.equal(cleaned.height, 384);
  assert.ok(!Buffer.from(cleaned.bytes).includes('PRIVATE TEST METADATA'));
  assert.ok(!Buffer.from(cleaned.bytes).includes('<script>'));
  assert.deepEqual(Array.from(cleaned.bytes.slice(-2)), [255, 217]);
  assert.throws(() => cleanJPEG(fixture.subarray(0, 90)), /incomplete|dimensions|photograph/i);
  assert.throws(() => cleanJPEG(Buffer.from('<html>not a photograph</html>')), /JPEG/);
  assert.throws(() => cleanJPEG(fixture, 20), /too large/);
});

test('the open dataset starts with credited curated sources and no invented community contributions', async () => {
  const response = await send('/api/dataset');
  assert.equal(response.status, 200); assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  const result = await response.json();
  assert.equal(result.curated.length, 11); assert.equal(result.total_contributions, 0);
  assert.deepEqual(result.contributions, []);
  for (const photo of result.curated) assert.ok(photo.author && photo.license_url && photo.sha256 && photo.image_url.startsWith(origin));
});

test('publication requires explicit licensing consent and same-origin form submission', async () => {
  const unlicensed = await submit(form({consent: ''}));
  assert.equal(unlicensed.status, 400); assert.match((await unlicensed.json()).error, /CC BY/);
  const crossSite = await send('/api/community', {method: 'POST', headers: {Origin: 'https://other.example'}, body: form()});
  assert.equal(crossSite.status, 403);
  const invalid = form(); invalid.set('photo', new Blob(['<html>not JPEG</html>'], {type: 'image/jpeg'}), 'test.jpg');
  assert.equal((await submit(invalid)).status, 400);
  assert.equal((await env.PHOTOS.list()).objects.length, 0);
});

test('a published image persists in D1/R2, appears immediately, exports attribution, and requires its secret key for removal', async () => {
  const response = await submit(); assert.equal(response.status, 201);
  const receipt = await response.json(); assert.equal(receipt.removal_key.length, 72);
  const {id} = receipt.photo;
  const freshBindings = {DB: await runtime.getD1Database('DB'), PHOTOS: await runtime.getR2Bucket('PHOTOS')};
  const page = await (await send('/api/community', undefined, freshBindings)).json();
  assert.equal(page.total, 1); assert.equal(page.photos[0].id, id); assert.equal(page.photos[0].license, 'CC BY 4.0');
  const exported = JSON.stringify(page);
  assert.ok(!exported.includes('removal')); assert.ok(!exported.includes(receipt.removal_key)); assert.ok(!exported.includes('image_key')); assert.ok(!exported.includes('192.0.2.1'));
  const image = await send(`/api/community/${id}/image`); assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg'); assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.photo.sha256);
  assert.ok(!bytes.includes('PRIVATE TEST METADATA')); assert.ok(!bytes.includes('TRAILING TEST DATA'));
  assert.deepEqual(bytes, Buffer.from(cleanJPEG(fixture).bytes));
  const manifest = await (await send('/api/dataset')).json(); assert.equal(manifest.contributions[0].author, 'Color Study test');
  assert.equal((await send(`/api/community/${id}`)).status, 200);
  const denied = await remove({...receipt, removal_key: randomUUID() + randomUUID()}); assert.equal(denied.status, 404);
  assert.equal((await remove(receipt)).status, 200);
  assert.equal((await send(`/api/community/${id}/image`)).status, 404);
  assert.equal((await (await send('/api/community')).json()).total, 0);
  assert.equal((await env.PHOTOS.list()).objects.length, 0);
});

test('failed blob storage never leaves a public record or its first uploaded object', async () => {
  const bucket = env.PHOTOS;
  const failing = {put: (key, value, options) => key.endsWith('/thumbnail.jpg') ? Promise.reject(new Error('Injected storage failure')) : bucket.put(key, value, options), delete: key => bucket.delete(key)};
  const response = await submit(form(), '192.0.2.2', {...env, PHOTOS: failing});
  assert.equal(response.status, 503);
  assert.equal((await (await send('/api/community')).json()).total, 0);
  assert.equal((await env.PHOTOS.list()).objects.length, 0);
});

test('per-visitor rate limits are enforced in persistent storage', async () => {
  const receipts = [];
  for (let i = 0; i < 5; i++) {
    const response = await submit(form(), '192.0.2.3'); assert.equal(response.status, 201);
    receipts.push(await response.json());
  }
  const denied = await submit(form(), '192.0.2.3'); assert.equal(denied.status, 429);
  assert.match((await denied.json()).error, /tomorrow/);
  for (const receipt of receipts) assert.equal((await remove(receipt)).status, 200);
});

test('dataset pagination is stable when several contributions have the same timestamp', async () => {
  const ids = Array.from({length: 27}, () => randomUUID());
  await env.DB.batch(ids.map(id => env.DB.prepare('INSERT INTO community_photos (id, created_at, title, location, author, description, image_key, thumbnail_key, width, height, size_bytes, sha256, removal_hash, license) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, '2026-09-10T00:00:00.000Z', 'Pagination fixture', 'Test', 'Test author', '', 'not-a-public-object', 'not-a-public-object', 512, 384, 100, 'fixture', 'private-fixture', 'CC BY 4.0')));
  const first = await (await send('/api/dataset')).json(); assert.equal(first.contributions.length, 24); assert.ok(first.next);
  const second = await (await worker.fetch(new Request(first.next), env, context)).json();
  assert.equal(second.contributions.length, 3); assert.equal(second.next, null); assert.deepEqual(second.curated, []);
  assert.deepEqual(new Set([...first.contributions, ...second.contributions].map(photo => photo.id)), new Set(ids));
  const full = await (await send('/api/dataset?download=all')).json();
  assert.equal(full.curated.length, 11); assert.equal(full.total_contributions, 27);
  assert.deepEqual(new Set(full.contributions.map(photo => photo.id)), new Set(ids));
  assert.equal((await send('/api/community?cursor=malformed')).status, 400);
  await env.DB.batch(ids.map(id => env.DB.prepare('DELETE FROM community_photos WHERE id = ?').bind(id)));
});

test('operator removal requires the server-only secret and can act on a reported photo', async () => {
  const response = await submit(form(), '192.0.2.9'); assert.equal(response.status, 201);
  const receipt = await response.json(), token = randomUUID() + randomUUID();
  const bindings = {...env, COMMUNITY_ADMIN_TOKEN: token};
  const path = `/api/community/${receipt.photo.id}`;
  assert.equal((await send(path, {method: 'DELETE'}, bindings)).status, 403);
  assert.equal((await send(path, {method: 'DELETE', headers: {Authorization: 'Bearer incorrect'}}, bindings)).status, 403);
  assert.equal((await send(path)).status, 200);
  assert.equal((await send(path, {method: 'DELETE', headers: {Authorization: `Bearer ${token}`}}, bindings)).status, 200);
  assert.equal((await send(path)).status, 404);
  assert.equal((await env.PHOTOS.list()).objects.length, 0);
});
