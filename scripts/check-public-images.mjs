// A bounded, read-only rotating check. Never downloads full native images.
import {readFile} from 'node:fs/promises';
const [sources, release] = await Promise.all(['sources.json', 'photo-release.json'].map(async name => JSON.parse(await readFile(new URL('../public/' + name, import.meta.url)))));
const args = new Map(process.argv.slice(2).map(value => {const [key, ...rest] = value.split('='); return [key, rest.join('=')];}));
const origin = args.get('--origin') || 'https://color-study-painted-surfaces.kristen368163.chatgpt.site';
const limit = Number(args.get('--limit') || 24);
const day = Math.floor(Date.now() / 86400000);
const offset = Number(args.get('--offset') || (day * limit) % sources.length);
if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) throw new Error('Use --limit=1..100 and a nonnegative --offset.');
const selected = Array.from({length: Math.min(limit, sources.length)}, (_, index) => sources[(offset + index) % sources.length]);
const jobs = selected.flatMap(photo => [photo.original_file, photo.thumbnail_file, `social/${photo.id}.jpg`].map(path => ({id: photo.id, path})));
const results = []; let next = 0;
await Promise.all(Array.from({length: 3}, async () => {
  while (next < jobs.length) {
    const job = jobs[next++]; let failure;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(new URL('/' + job.path, origin), {method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(20000)});
        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
        // GitHub sometimes serves JPEGs as generic binary data. Accept that
        // header only for the exact immutable original recorded in this release.
        const pinnedOriginal = job.path.startsWith('originals/') && response.url === new URL(job.path, release.public_base_url).href;
        if (!response.ok || !(/^image\//.test(contentType) || (contentType === 'application/octet-stream' && pinnedOriginal))) throw new Error(`HTTP ${response.status}, ${contentType}`);
        results.push({...job, status: response.status}); failure = null; break;
      } catch (error) {failure = error.message;}
    }
    if (failure) results.push({...job, error: failure});
  }
}));
const failed = results.filter(result => result.error);
console.log(JSON.stringify({checked_at: new Date().toISOString(), origin, offset, photographs: selected.length, requests: results.length, failures: failed}, null, 2));
if (failed.length) process.exitCode = 1;
