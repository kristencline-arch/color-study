import sources from '../public/sources.json';
import release from '../public/photo-release.json';

const originals = new Map(sources.filter(source => source.source_api).map(source => ['/' + source.original_file, new URL(source.original_file, release.public_base_url).href]));

// Only exact catalog paths can redirect, and every target is pinned to the
// reviewed image commit. No request parameter can select an arbitrary URL.
export function handleMuseumImage(request) {
  const target = originals.get(new URL(request.url).pathname);
  if (!target) return null;
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
  return new Response(null, {status: 302, headers: {
    Location: target, 'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff',
  }});
}
