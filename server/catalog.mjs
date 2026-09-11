import {getCatalogDb, normalizeSearch, publicCatalogPhoto} from '../db/catalog.mjs';

const response = (value, status = 200, headers = {}) => Response.json(value, {status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*', ...headers,
}});
const invalid = message => Object.assign(new Error(message), {status: 400});

function filters(params, revision) {
  const where = ['release_id = ?'], args = [revision];
  const query = params.get('q')?.trim() || '';
  if (query.length > 120) throw invalid('Search with up to 120 characters.');
  for (const word of normalizeSearch(query).split(/\s+/).filter(Boolean)) {
    where.push('instr(search_text, ?) > 0'); args.push(word);
  }
  for (const field of ['category', 'region', 'provider']) {
    const value = params.get(field);
    if (value && value !== 'All') {
      if (value.length > 120) throw invalid('Choose a valid collection filter.');
      where.push(`${field} = ?`); args.push(value);
    }
  }
  const before = params.get('before');
  if (before) {
    if (!['500', '1000', '1500'].includes(before)) throw invalid('Choose a valid date range.');
    where.push('year_end < ?'); args.push(Number(before));
  }
  return {where: where.join(' AND '), args};
}

export async function handleCatalog(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/catalog' && !url.pathname.startsWith('/api/catalog/')) return null;
  if (request.method !== 'GET') return response({error: 'The museum catalog is read-only. Use the community form to contribute a photograph.'}, 405, {Allow: 'GET'});
  try {
    const catalog = await getCatalogDb(env), {db, revision} = catalog;
    if (url.pathname !== '/api/catalog') {
      const id = url.pathname.slice('/api/catalog/'.length);
      if (!/^[a-z0-9-]{1,100}$/.test(id)) return response({error: 'Study not found.'}, 404);
      const row = await db.prepare('SELECT * FROM catalog_photos WHERE release_id = ? AND id = ?').bind(revision, id).first();
      return row ? response({photo: publicCatalogPhoto(row, url.origin), revision}) : response({error: 'Study not found.'}, 404);
    }
    const pageText = url.searchParams.get('page') || '1';
    if (!/^[1-9]\d{0,4}$/.test(pageText)) throw invalid('Choose a valid collection page.');
    const page = Number(pageText), limit = 18;
    const {where, args} = filters(url.searchParams, revision);
    const sort = url.searchParams.get('sort') || 'featured';
    const order = new Map([['featured', 'sort_order, id'], ['oldest', '(year_start IS NULL), year_start, id'], ['newest', '(year_end IS NULL), year_end DESC, id']]).get(sort);
    if (!order) throw invalid('Choose a valid sort order.');
    const download = url.searchParams.get('download') === 'all';
    const query = `SELECT * FROM catalog_photos WHERE ${where} ORDER BY ${order}`;
    const [rows, count, allCount, facets] = await Promise.all([
      download ? db.prepare(query).bind(...args).all() : db.prepare(query + ' LIMIT ? OFFSET ?').bind(...args, limit, (page - 1) * limit).all(),
      db.prepare(`SELECT COUNT(*) AS total FROM catalog_photos WHERE ${where}`).bind(...args).first(),
      db.prepare('SELECT COUNT(*) AS total FROM catalog_photos WHERE release_id = ?').bind(revision).first(),
      Promise.all(['category', 'region', 'provider'].map(field => db.prepare(`SELECT ${field} AS value, COUNT(*) AS count FROM catalog_photos WHERE release_id = ? GROUP BY ${field} ORDER BY ${field}`).bind(revision).all())),
    ]);
    return response({name: 'Color Study museum and field collection', revision,
      metadata_license: 'CC0', metadata_license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      image_license_note: 'Each photograph retains its own listed license. Museum master files may be larger than the study JPEG.',
      total: count.total, collection_total: allCount.total, page, page_size: limit,
      pages: Math.ceil(count.total / limit),
      filters: Object.fromEntries(['category', 'region', 'provider'].map((field, i) => [field, facets[i].results])),
      photos: rows.results.map(row => publicCatalogPhoto(row, url.origin)),
    }, 200, download ? {'Content-Disposition': 'attachment; filename="color-study-catalog.json"'} : {});
  } catch (error) {
    if (error.status) return response({error: error.message}, error.status);
    console.error('Catalog request failed', {path: url.pathname, message: error.message});
    return response({error: 'The collection is temporarily unavailable. Please try again shortly.'}, 503);
  }
}
