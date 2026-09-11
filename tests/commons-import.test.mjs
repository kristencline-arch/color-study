import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const sources = JSON.parse(await readFile(new URL('../public/sources.json', import.meta.url)));
const selection = JSON.parse(await readFile(new URL('../data/commons-selection.json', import.meta.url)));

test('field imports retain item-specific rights, native source URLs and distinct original photographs', async () => {
  assert.equal(new Set(sources.map(source => source.sha256)).size, sources.length);
  for (const spec of selection) {
    const source = sources.find(item => item.id === spec.id);
    assert.ok(source, spec.id);
    const snapshot = JSON.parse(await readFile(new URL(`../${source.rights_evidence.snapshot}`, import.meta.url)));
    const info = snapshot.imageinfo[0];
    assert.equal(snapshot.title, spec.file_title);
    assert.equal(source.license, spec.expected_license);
    assert.equal(info.extmetadata[source.rights_evidence.field].value, source.rights_evidence.value);
    assert.equal(source.license, source.rights_evidence.value);
    assert.equal(source.download_url, info.url.split('?')[0]);
    assert.deepEqual(source.expected_dimensions, [info.width, info.height]);
    assert.match(source.license_url, /^https:\/\/creativecommons\.org\//);
    assert.ok(source.author && source.object_date && source.material && source.notes);
  }
});

test('native JPEGs keep EXIF orientation while catalog and thumbnail dimensions describe the displayed image', () => {
  const result = execFileSync('python3', ['-c', `
import json
from pathlib import Path
from PIL import Image, ImageOps
root = Path.cwd()
count = 0
rotated = 0
for source in json.loads((root / 'public/sources.json').read_text()):
    if not source['id'].startswith('commons-'):
        continue
    with Image.open(root / 'public' / source['original_file']) as image:
        assert image.format == 'JPEG', source['id']
        assert list(image.size) == source['encoded_dimensions'], source['id']
        displayed = ImageOps.exif_transpose(image)
        assert list(displayed.size) == source['expected_dimensions'], source['id']
        rotated += image.size != displayed.size
    with Image.open(root / 'public' / source['thumbnail_file']) as thumbnail:
        width, height = source['expected_dimensions']
        assert max(thumbnail.size) <= 720, source['id']
        assert abs(thumbnail.width / thumbnail.height - width / height) < .015, source['id']
    count += 1
print(json.dumps(dict(count=count, rotated=rotated)))
`], {cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 30000});
  const value = JSON.parse(result);
  assert.equal(value.count, selection.length);
  assert.ok(value.rotated > 0, 'exercise original images with a rotated EXIF orientation');
});
