import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';

const sources = JSON.parse(await readFile(new URL('../public/sources.json', import.meta.url)));
const {default: worker} = await import('../dist/server/index.js');
const origin = 'https://color-study.example';
const context = {waitUntil() {}, passThroughOnException() {}};
let runtime, env;
before(async () => {
  runtime = new Miniflare({modules: true, script: 'export default {fetch() {return new Response("catalog test");}}', compatibilityDate: '2026-05-15', d1Databases: ['DB'], r2Buckets: ['PHOTOS']});
  env = {DB: await runtime.getD1Database('DB'), PHOTOS: await runtime.getR2Bucket('PHOTOS')};
});
after(async () => {await runtime?.dispose();});
const send = (path = '/api/catalog', init, bindings = env) => worker.fetch(new Request(origin + path, init), bindings, context);
const page = async (path, bindings) => {const response = await send(path, undefined, bindings); assert.equal(response.status, 200); return response.json();};

test('the collection seeds once into D1, persists across bindings, and preserves community records', async () => {
  const [first, concurrent] = await Promise.all([page(), page()]);
  assert.equal(first.collection_total, sources.length); assert.equal(first.total, sources.length);
  assert.equal(first.photos.length, 18); assert.equal(first.revision, concurrent.revision);
  assert.match(first.revision, /^[a-f0-9]{64}$/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS total FROM catalog_releases').first()).total, 1);
  const fresh = await page(undefined, {...env, DB: await runtime.getD1Database('DB')});
  assert.deepEqual(first, fresh);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS total FROM catalog_photos').first()).total, sources.length);
  assert.equal((await page('/api/community')).total, 0);
  assert.equal(first.metadata_license, 'CC0');
});

test('material, region, date and multiword search combine without treating SQL or wildcards as commands', async () => {
  const textiles = await page('/api/catalog?category=Textiles&download=all');
  assert.equal(textiles.total, sources.filter(source => source.study_type === 'textile').length);
  assert.ok(textiles.total >= 20);
  assert.ok(textiles.photos.every(photo => photo.category === 'Textiles'));
  const matches = await page('/api/catalog?q=painted%20cotton&region=Andes&before=500');
  assert.ok(matches.photos.some(photo => photo.id === 'cma-294034'));
  assert.ok(matches.photos.every(photo => photo.region === 'Andes' && photo.year_end < 500));
  const accented = await page('/api/catalog?q=chavin');
  assert.ok(accented.photos.some(photo => photo.id === 'cma-294034'));
  for (const query of ["' OR 1=1 --", '%', '_', 'DROP TABLE catalog_photos']) {
    assert.equal((await page('/api/catalog?q=' + encodeURIComponent(query))).total, 0);
  }
  assert.equal((await page('/api/catalog?before=500&download=all')).total, sources.filter(source => source.year_end !== null && source.year_end < 500).length);
  const counts = Object.fromEntries(textiles.filters.category.map(item => [item.value, item.count]));
  assert.equal(counts.Textiles, textiles.total);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), sources.length);
});

test('catalog pagination covers every record once and sorting leaves undated works last', async () => {
  const all = await page('/api/catalog?download=all');
  const ids = [];
  for (let number = 1; number <= all.pages; number++) {
    const result = await page(`/api/catalog?page=${number}`);
    ids.push(...result.photos.map(photo => photo.id));
  }
  assert.deepEqual(ids, all.photos.map(photo => photo.id));
  assert.equal(new Set(ids).size, sources.length);
  for (const [sort, field, direction] of [['oldest', 'year_start', 1], ['newest', 'year_end', -1]]) {
    const sorted = (await page(`/api/catalog?download=all&sort=${sort}`)).photos;
    let undated = false, previous;
    for (const photo of sorted) {
      if (photo[field] === null) {undated = true; continue;}
      assert.ok(!undated, 'dated record after an undated record');
      if (previous !== undefined) assert.ok((photo[field] - previous) * direction >= 0);
      previous = photo[field];
    }
  }
  assert.deepEqual((await page('/api/catalog?page=99999')).photos, []);
});

test('detail links open the selected lab study and export only the filtered public records', async () => {
  const {photo} = await page('/api/catalog/cma-294034');
  assert.equal(photo.id, 'cma-294034');
  assert.equal(new URL(photo.study_url).hash, '#sample=cma-294034');
  assert.equal(photo.image_url, origin + '/originals/cma-294034.jpg');
  assert.ok(photo.master_dimensions[0] > photo.expected_dimensions[0]);
  assert.equal(photo.master_format, 'TIFF');
  const response = await send('/api/catalog?category=Textiles&region=Andes&download=all');
  assert.match(response.headers.get('Content-Disposition'), /attachment/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  const value = await response.json();
  assert.equal(value.photos.length, value.total);
  assert.ok(value.photos.every(item => item.category === 'Textiles' && item.region === 'Andes'));
  const exported = await page('/api/dataset?download=all');
  assert.equal(exported.curated.length, sources.length); assert.equal(exported.catalog_revision, value.revision);
  assert.doesNotMatch(JSON.stringify(exported), /removal_hash|removal_key|image_key|rate_limit/);
});

test('invalid filters fail clearly, unknown IDs stay missing and public catalog writes are rejected', async () => {
  for (const query of ['page=0', 'page=-1', 'page=1.2', 'before=2026', 'sort=invalid', 'sort=constructor', 'q=' + 'a'.repeat(121)]) {
    assert.equal((await send('/api/catalog?' + query)).status, 400, query);
  }
  assert.equal((await send('/api/catalog/no-such-photo')).status, 404);
  for (const method of ['POST', 'DELETE', 'PUT']) assert.equal((await send('/api/catalog/cma-294034', {method})).status, 405);
  assert.equal((await send('/api/catalog', undefined, {})).status, 503);
});

test('museum originals resolve to the exact archived image release without arbitrary redirects', async () => {
  const release = JSON.parse(await readFile(new URL('../public/photo-release.json', import.meta.url)));
  assert.match(release.commit, /^[a-f0-9]{40}$/);
  for (const source of sources.filter(item => item.source_api)) {
    const response = await send('/' + source.original_file + '?url=https://example.invalid/other.jpg');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), release.public_base_url + source.original_file);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  }
  assert.equal((await send('/originals/cma-294034.jpg', {method: 'HEAD'})).status, 302);
  assert.equal((await send('/originals/cma-294034.jpg', {method: 'POST'})).status, 405);
});

test('every museum import has a reviewable rights snapshot, dated provenance and distinct original bytes', async () => {
  const selected = JSON.parse(await readFile(new URL('../data/museum-selection.json', import.meta.url)));
  const hashes = new Set();
  for (const spec of selected) {
    const id = `${spec.provider}-${spec.object_id}`, source = sources.find(item => item.id === id);
    assert.ok(source, id); assert.ok(!hashes.has(source.sha256), 'duplicate photograph'); hashes.add(source.sha256);
    const snapshot = JSON.parse(await readFile(new URL(`../data/museum-records/${id}.json`, import.meta.url)));
    assert.equal(snapshot[source.rights_evidence.field], source.rights_evidence.value);
    assert.ok(source.license.includes('CC0') && source.source_api && source.accession_number);
    assert.ok(source.object_date && source.material && source.region && source.provider);
    assert.ok(Number.isInteger(source.year_start) && Number.isInteger(source.year_end) && source.year_start <= source.year_end);
    assert.match(source.rights_checked_at, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(source.expected_dimensions.some(edge => edge >= 1600));
  }
});
