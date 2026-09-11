import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';

const sources = JSON.parse(await readFile(new URL('../public/sources.json', import.meta.url)));
const targets = JSON.parse(await readFile(new URL('../public/targets.json', import.meta.url)));

test('production worker renders the photographic showcase, public links and sharing metadata', async () => {
  const {default: worker} = await import('../dist/server/index.js');
  const response = await worker.fetch(new Request('https://color-study.example/', {headers: {accept: 'text/html', host: 'color-study.example'}}), {ASSETS: {fetch: async () => new Response('Not found', {status: 404})}}, {waitUntil() {}, passThroughOnException() {}});
  assert.equal(response.status, 200);
  const html = (await response.text()).replace(/<!--.*?-->/g, "");
  for (const label of ['Color Study', 'Try the image lab', 'Contribute', 'Share Color Study', 'Explore the collection', `${sources.filter(source => source.study_type === 'textile').length} textiles`, 'https://github.com/kristencline-arch/color-study', 'https://spinoff.nasa.gov/Manipulating_Satellite_Photos_Now_Reveals_Ancient_Images', '/showcase/commons-nefertari-68-original.webp', '/showcase/commons-nefertari-68-enhanced.webp', 'Choose a collection.', 'Babylon &amp; Sumer', 'Persia &amp; Iran', '/api/dataset', '/api/catalog', 'og:image', 'https://color-study.example/social/commons-nefertari-68.jpg', 'Other projects:', 'https://nightingaleos.com/']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Your site is taking shape|Starter Project|codex-preview|react-loading-skeleton/);
});

test('individual study pages render their own title, canonical URL and photographic metadata', async () => {
  const {default: worker} = await import('../dist/server/index.js');
  const env = {ASSETS: {fetch: async () => new Response('Not found', {status: 404})}}, ctx = {waitUntil() {}, passThroughOnException() {}};
  for (const id of ['commons-beni-hassan-19', 'commons-durrow-125v']) {
    const response = await worker.fetch(new Request(`https://color-study.example/study/${id}`, {headers: {accept: 'text/html', host: 'color-study.example'}}), env, ctx);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`https://color-study.example/social/${id}.jpg`));
    assert.ok(html.includes(`https://color-study.example/study/${id}`));
    assert.ok(html.includes(sources.find(s => s.id === id).short_title));
    assert.ok(html.includes('application/ld+json'));
  }
  const missing = await worker.fetch(new Request('https://color-study.example/study/missing-photo', {headers: {accept: 'text/html'}}), env, ctx);
  assert.equal(missing.status, 404);
});

test('guided studies and social cards preserve valid source relationships and credits', async () => {
  const read = async path => JSON.parse(await readFile(new URL('../public/' + path, import.meta.url)));
  const [notes, groups, cards, references] = await Promise.all(['study-notes.json', 'object-groups.json', 'social-previews.json', 'context-references.json'].map(read));
  const ids = new Set(sources.map(s => s.id));
  for (const [id, prompts] of Object.entries(notes)) {
    assert.ok(ids.has(id));
    for (const note of prompts) {assert.ok(note.title && note.text); assert.ok(note.box.every(v => v >= 0 && v <= 1)); assert.ok(note.box[0] < note.box[2] && note.box[1] < note.box[3]);}
  }
  for (const group of groups) {assert.ok(['site', 'object', 'manuscript'].includes(group.scope)); assert.ok(group.photo_ids.every(id => ids.has(id))); assert.equal(new Set(group.photo_ids).size, group.photo_ids.length);}
  assert.equal(cards.length, sources.length);
  for (const card of cards) {
    const source = sources.find(s => s.id === card.id); assert.equal(card.source_sha256, source.sha256); assert.equal(card.credit, source.author); assert.equal(card.license, source.license);
    const bytes = await readFile(new URL('../public/' + card.file, import.meta.url)); assert.equal(createHash('sha256').update(bytes).digest('hex'), card.sha256);
    await access(new URL('../dist/client/' + card.file, import.meta.url));
  }
  for (const reference of references) {
    assert.ok(reference.study_ids.every(id => ids.has(id))); assert.match(reference.source, /^https:\/\//);
    if (reference.image) {assert.ok(reference.author && reference.license_url && reference.image_source); await access(new URL('../public/' + reference.image, import.meta.url)); assert.ok(!ids.has(reference.id), 'A research reconstruction is separate from the original-image catalog');}
  }
});

test('showcase comparisons retain source hashes, the fitted transform and packaged previews', async () => {
  const records = JSON.parse(await readFile(new URL('../public/showcase.json', import.meta.url)));
  assert.ok(records.length >= 9, 'preserve the original nine showcase comparisons');
  assert.equal(new Set(records.map(record => record.id)).size, records.length);
  for (const source of sources.filter(item => item.study_type === 'paint' && !item.source_api)) assert.ok(records.some(record => record.id === source.id), source.id);
  assert.ok(records.some(record => record.id === 'cma-294034'), 'painted textile comparison');
  for (const record of records) {
    assert.equal(record.source_sha256, sources.find(source => source.id === record.id).sha256);
    assert.equal(record.settings.targetStd, record.fit.target_std_in_8bit_units);
    assert.equal(record.settings.maxGain, record.fit.max_gain);
    for (const file of Object.values(record.files)) {
      const bytes = await readFile(new URL('../public/' + file.path, import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
      await access(new URL('../dist/client/' + file.path, import.meta.url));
    }
  }
});

test('every study has packaged native originals, thumbnails, credit and source links', async () => {
  assert.ok(sources.length >= 4);
  const ids = new Set();
  for (const source of sources) {
    assert.ok(!ids.has(source.id), 'duplicate study'); ids.add(source.id);
    assert.match(source.source_page, /^https:\/\//); assert.match(source.license_url, /^https:\/\//);
    assert.ok(source.author && source.license && source.expected_dimensions.every(value => value > 0));
    const original = await readFile(new URL('../public/' + source.original_file, import.meta.url));
    assert.ok(original.length < 25 * 1024 * 1024, 'individual hosting asset limit');
    if (source.sha256) assert.equal(createHash('sha256').update(original).digest('hex'), source.sha256);
    await access(new URL('../public/thumbnails/' + source.id + '.jpg', import.meta.url));
    if (source.source_api) await assert.rejects(access(new URL('../dist/client/' + source.original_file, import.meta.url)), {code: 'ENOENT'});
    else await access(new URL('../dist/client/' + source.original_file, import.meta.url));
  }
});

test('guide links only to real studies and distinguishes technique evidence from candidate use', () => {
  assert.ok(targets.length >= 12);
  for (const target of targets) {
    assert.ok(['Documented', 'Candidate', 'Exploratory'].includes(target.kind));
    assert.ok(target.why && target.photo && target.caveat && target.sourceLabel);
    assert.match(target.source, /^https:\/\//);
    if (target.sample) assert.ok(sources.some(source => source.id === target.sample), target.name);
  }
});
