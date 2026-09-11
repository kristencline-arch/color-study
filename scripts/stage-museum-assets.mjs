import {readFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('../', import.meta.url);
const sources = JSON.parse(await readFile(new URL('public/sources.json', root)));
const release = JSON.parse(await readFile(new URL('public/photo-release.json', root)));
if (!/^[a-f0-9]{40}$/.test(release.commit) || release.public_base_url !== `https://raw.githubusercontent.com/kristencline-arch/color-study/${release.commit}/public/`) throw new Error('Invalid pinned image release.');
let removedBytes = 0;
for (const source of sources.filter(item => item.source_api)) {
  if (!/^originals\/(cma|met|aic)-\d+\.jpg$/.test(source.original_file)) throw new Error('Unexpected museum asset path.');
  const original = await readFile(new URL('public/' + source.original_file, root));
  if (createHash('sha256').update(original).digest('hex') !== source.sha256) throw new Error(`Original hash mismatch: ${source.id}`);
  // Keep all originals in the source checkout and GitHub. Remove only their
  // generated deployment copies to stay below the hosting archive's limit.
  await rm(new URL('dist/client/' + source.original_file, root), {force: true});
  removedBytes += original.length;
}
console.log(`Museum originals use the pinned GitHub release; omitted ${(removedBytes / 1048576).toFixed(1)} MiB from the deployment archive.`);
