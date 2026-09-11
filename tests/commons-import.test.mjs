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
    assert.equal(source.license, spec.photo_license ?? spec.expected_license);
    assert.equal(info.extmetadata[source.rights_evidence.field].value, source.rights_evidence.value);
    if (spec.photo_license) {
      const evidence = source.rights_evidence.photograph_license;
      const revision = JSON.parse(await readFile(new URL(`../${evidence.snapshot}`, import.meta.url)));
      assert.equal(revision.title, spec.file_title);
      assert.equal(evidence.name, source.license);
      assert.equal(evidence.url, source.license_url);
      assert.equal(evidence.revision_id, revision.revisions[0].revid);
    } else assert.equal(source.license, source.rights_evidence.value);
    assert.equal(source.download_url, info.url.split('?')[0]);
    assert.deepEqual(source.expected_dimensions, [info.width, info.height]);
    assert.match(source.license_url, /^https:\/\/creativecommons\.org\//);
    assert.ok(source.author && source.object_date && source.material && source.notes);
  }
});

test('photograph licenses require a matching explicit grant even when the artwork is public domain', () => {
  execFileSync('python3', ['-c', `
import copy, importlib.util, json
from pathlib import Path
module = importlib.util.spec_from_file_location('commons', Path('scripts/import-commons.py'))
commons = importlib.util.module_from_spec(module)
module.loader.exec_module(commons)
selection = json.loads(Path('data/commons-selection.json').read_text())
reviewed = [s for s in selection if s.get('photo_license')]
assert reviewed
for spec in reviewed:
    page = json.loads(Path('data/commons-records', spec['id'] + '-license.json').read_text())
    name, url, revision = commons.validate_photo_license(spec, page)
    assert name == spec['photo_license'] and url.startswith('https://creativecommons.org/licenses/by-sa/')
    for changed in ['title', 'grant']:
        bad = copy.deepcopy(page)
        if changed == 'title': bad['title'] = 'File:Different photograph.jpg'
        else: bad['revisions'][0]['slots']['main']['*'] = '{{PD-Art|PD-old-100}}'
        try: commons.validate_photo_license(spec, bad)
        except AssertionError: pass
        else: raise AssertionError('Accepted changed photograph license evidence')
`], {cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000});
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
        assert image.format in ('JPEG', 'MPO'), source['id']
        if image.format == 'MPO':
            assert source['encoded_format'] == 'MPO' and source['frame_count'] == image.n_frames
            assert source['study_frame'] == image.tell() == 0
        assert list(image.size) == source['encoded_dimensions'], source['id']
        # Unrotated JPEG dimensions are available in the image header. Decode
        # the actual rotated photographs to exercise Pillow's display behavior
        # without allocating every full-resolution image in this growing set.
        if image.getexif().get(274, 1) != 1:
            with ImageOps.exif_transpose(image) as displayed:
                assert list(displayed.size) == source['expected_dimensions'], source['id']
                rotated += image.size != displayed.size
        else:
            assert list(image.size) == source['expected_dimensions'], source['id']
    with Image.open(root / 'public' / source['thumbnail_file']) as thumbnail:
        width, height = source['expected_dimensions']
        assert max(thumbnail.size) <= 720, source['id']
        assert abs(thumbnail.width / thumbnail.height - width / height) < .015, source['id']
    count += 1
print(json.dumps(dict(count=count, rotated=rotated)))
`], {cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 60000});
  const value = JSON.parse(result);
  assert.equal(value.count, selection.length);
  assert.ok(value.rotated > 0, 'exercise original images with a rotated EXIF orientation');
});

test('downloaded and cached originals accept native JPEG containers and reject other image formats', () => {
  execFileSync('python3', ['-c', `
import importlib.util
from pathlib import Path
module = importlib.util.spec_from_file_location('commons', Path('scripts/import-commons.py'))
commons = importlib.util.module_from_spec(module)
module.loader.exec_module(commons)
for filename, expected in [('commons-fontein-6.jpg', 'JPEG'), ('commons-keldby-3.jpg', 'MPO')]:
    data = Path('public/originals', filename).read_bytes()
    result = commons.validate_original(data, filename)
    assert result['encoded_format'] == expected and result['study_frame'] == 0
    assert result['frame_count'] >= 1
try: commons.validate_original(Path('public/og.png').read_bytes(), 'mislabeled.jpg')
except AssertionError: pass
else: raise AssertionError('Accepted a PNG with a JPEG filename')
`], {cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000});
});
