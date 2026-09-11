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
  const html = await response.text();
  for (const label of ['Color Study', 'Try the image lab', 'Contribute', 'Share Color Study', 'https://github.com/kristencline-arch/color-study', 'https://spinoff.nasa.gov/Manipulating_Satellite_Photos_Now_Reveals_Ancient_Images', '/showcase/cueva-hands-original.webp', '/showcase/cueva-hands-enhanced.webp', '/api/dataset', 'og:image', 'https://color-study.example/og.png']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Your site is taking shape|Starter Project|codex-preview|react-loading-skeleton/);
});

test('showcase comparisons retain source hashes, the fitted transform and packaged previews', async () => {
  const records = JSON.parse(await readFile(new URL('../public/showcase.json', import.meta.url)));
  assert.equal(records.length, sources.filter(source => source.study_type === 'paint').length);
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
    await access(new URL('../dist/client/' + source.original_file, import.meta.url));
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
