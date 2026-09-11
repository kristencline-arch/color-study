import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {Miniflare} from 'miniflare';
const {default: worker} = await import('../dist/server/index.js');
const origin = 'https://color-study.example', token = 'test-only-admin-token-for-reports-2026';
const context = {waitUntil() {}, passThroughOnException() {}};
let runtime, env;
before(async () => {
  runtime = new Miniflare({modules: true, script: 'export default {fetch() {return new Response("reports test");}}', compatibilityDate: '2026-05-15', d1Databases: ['DB'], r2Buckets: ['PHOTOS']});
  env = {DB: await runtime.getD1Database('DB'), PHOTOS: await runtime.getR2Bucket('PHOTOS'), COMMUNITY_ADMIN_TOKEN: token};
});
after(async () => {await runtime?.dispose();});
const send = (path, init = {}, bindings = env) => worker.fetch(new Request(origin + path, init), bindings, context);
const report = {photo_type: 'curated', photo_id: 'marble-sphinx', reason: 'context', details: 'Private review detail for the site owner: please check the date.'};
const post = (value = report, headers = {}) => send('/api/reports', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin, ...headers}, body: JSON.stringify(value)});

test('visitors can report without an account; only the owner can read and resolve reports', async () => {
  const response = await post(); assert.equal(response.status, 201);
  const receipt = await response.json(); assert.match(receipt.reference, /^[0-9a-f-]{36}$/);
  assert.equal((await send('/api/reports')).status, 403);
  assert.equal((await send('/api/reports', {headers: {Authorization: 'Bearer incorrect'}})).status, 403);
  const listed = await send('/api/reports', {headers: {Authorization: `Bearer ${token}`}});
  assert.equal(listed.status, 200);
  const records = await listed.json(); assert.equal(records.reports.length, 1); assert.equal(records.reports[0].details, report.details);
  const dataset = await send('/api/dataset?download=all');
  const publicData = await dataset.text(); assert.ok(!publicData.includes(report.details)); assert.ok(!publicData.includes(receipt.reference));
  const invalid = await send('/api/reports/' + receipt.reference, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status: 'resolved'})});
  assert.equal(invalid.status, 403);
  const resolved = await send('/api/reports/' + receipt.reference, {method: 'PATCH', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({status: 'resolved'})});
  assert.equal(resolved.status, 200); assert.equal((await resolved.json()).status, 'resolved');
  assert.equal((await (await send('/api/reports', {headers: {Authorization: `Bearer ${token}`}})).json()).reports.length, 0);
  assert.equal((await send('/api/catalog/marble-sphinx')).status, 200, 'A report never deletes its subject automatically');
});

test('reports validate their target, reject cross-site writes and bound private text', async () => {
  assert.equal((await post(report, {Origin: 'https://other.example'})).status, 403);
  assert.equal((await post({...report, photo_id: 'missing-photo'})).status, 404);
  assert.equal((await post({...report, photo_type: 'community', photo_id: 'not-an-existing-contribution'})).status, 404);
  for (const value of [{...report, reason: 'invalid'}, {...report, website: 'spam'}, {...report, details: 'short'}, {...report, details: 'x'.repeat(1801)}]) assert.equal((await post(value)).status, 400);
  assert.equal((await post({...report, details: 'x'.repeat(10000)})).status, 413);
  assert.equal((await post({...report, details: '文字'.repeat(800)})).status, 201, 'Unicode reports within the stated character limit are accepted');
});

test('anonymous reporting has a separate per-day limit and persists no raw IP address', async () => {
  const ip = '198.51.100.72';
  for (let i = 0; i < 5; i++) assert.equal((await post(report, {'CF-Connecting-IP': ip})).status, 201);
  assert.equal((await post(report, {'CF-Connecting-IP': ip})).status, 429);
  const rows = await env.DB.prepare('SELECT * FROM community_limits').all();
  assert.ok(!JSON.stringify(rows).includes(ip));
  assert.ok(rows.results.every(row => row.bucket.includes(':report:')));
});
