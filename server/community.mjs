import {getCatalogDb, allCatalogPhotos} from '../db/catalog.mjs';
import { getCommunityDb } from '../db/community.mjs';
import { cleanJPEG } from './jpeg.mjs';

const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const FIELDS = 'id, created_at, title, location, author, description, width, height, size_bytes, sha256, license';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json = (value, status = 200, extra = {}) => Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra}});
const failure = (message, status = 400) => Object.assign(new Error(message), {status});
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const hashText = value => digest(new TextEncoder().encode(value));

function publicPhoto(row, origin) {
  return {...row, license_url: LICENSE_URL, image_url: `${origin}/api/community/${row.id}/image`, thumbnail_url: `${origin}/api/community/${row.id}/thumbnail`, provenance: 'Contributor-submitted photograph; attribution and description are supplied by the contributor.'};
}

function textField(form, key, max, required = true) {
  const value = form.get(key);
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) throw failure(`Please provide a valid ${key} (up to ${max} characters).`);
  return value.trim();
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) throw failure('Submit the form from this website.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw failure('Submit the form from this website.', 403);
}

async function boundedForm(request, limit = 14 * 1024 * 1024) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw failure('Use the photo contribution form.');
  if (Number(request.headers.get('content-length')) > limit) throw failure('The upload is too large.', 413);
  if (!request.body) throw failure('Choose a photograph.');
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw failure('The upload is too large.', 413); }
    chunks.push(value);
  }
  try { return await new Response(new Blob(chunks), {headers: {'content-type': request.headers.get('content-type')}}).formData(); }
  catch { throw failure('The upload could not be read. Please try again.'); }
}

async function boundedJSON(request, limit = 500) {
  if (!request.body) throw failure('Provide the removal key.');
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw failure('The removal key is invalid.'); }
    text += decoder.decode(value, {stream: true});
  }
  text += decoder.decode();
  try { return JSON.parse(text); } catch { throw failure('The removal key is invalid.'); }
}

async function reserveUpload(db, request) {
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip');
  const limits = [{bucket: `${day}:all`, max: 50}];
  if (ip) limits.unshift({bucket: `${day}:${await hashText(`${day}:${ip}`)}`, max: 5});
  for (const limit of limits) {
    const row = await db.prepare('INSERT INTO community_limits (bucket, used) VALUES (?, 1) ON CONFLICT (bucket) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used').bind(limit.bucket, limit.max).first();
    if (!row) throw failure('The daily contribution limit has been reached. Please try again tomorrow.', 429);
  }
  await db.prepare('DELETE FROM community_limits WHERE bucket < ?').bind(day).run();
}

async function list(db, url) {
  const cursor = url.searchParams.get('cursor');
  let query = `SELECT ${FIELDS} FROM community_photos`, args = [];
  if (cursor) {
    const [date, id] = cursor.split('|');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date || '') || !ID.test(id || '')) throw failure('The collection page is invalid.');
    query += ' WHERE created_at < ? OR (created_at = ? AND id < ?)'; args = [date, date, id];
  }
  const result = await db.prepare(query + ' ORDER BY created_at DESC, id DESC LIMIT 25').bind(...args).all();
  const rows = result.results, more = rows.length > 24, page = rows.slice(0, 24);
  const last = page.at(-1);
  const count = await db.prepare('SELECT COUNT(*) AS total FROM community_photos').first();
  return {photos: page.map(row => publicPhoto(row, url.origin)), total: count.total, next_cursor: more ? `${last.created_at}|${last.id}` : null};
}

async function contribute(request, env, db, url) {
  sameOrigin(request);
  const form = await boundedForm(request);
  if (form.get('consent') !== 'cc-by-4.0-v1') throw failure('Confirm that you own the photograph and agree to publish it under CC BY 4.0.');
  const title = textField(form, 'title', 120), location = textField(form, 'location', 120), author = textField(form, 'author', 100), description = textField(form, 'description', 1200, false);
  if (form.get('website')) throw failure('The submission could not be accepted.');
  const file = form.get('photo'), thumbnail = form.get('thumbnail');
  if (!(file instanceof File) || !(thumbnail instanceof File) || file.type !== 'image/jpeg' || thumbnail.type !== 'image/jpeg') throw failure('The contribution form must prepare a JPEG copy and thumbnail.');
  let image, thumb;
  try {
    image = cleanJPEG(await file.arrayBuffer());
    thumb = cleanJPEG(await thumbnail.arrayBuffer(), 1024 * 1024, 1000000);
  } catch (error) { throw failure(error.message); }
  if (image.width < 320 || image.height < 320 || thumb.width > 1000 || thumb.height > 1000) throw failure('Choose a photograph at least 320 pixels on each side.');
  if (Math.abs(thumb.width / thumb.height - image.width / image.height) > .02) throw failure('The thumbnail does not match the photograph dimensions.');
  await reserveUpload(db, request);
  const id = crypto.randomUUID(), removalKey = crypto.randomUUID() + crypto.randomUUID();
  const imageKey = `community/${id}/image.jpg`, thumbnailKey = `community/${id}/thumbnail.jpg`;
  const sha256 = await digest(image.bytes), removalHash = await hashText(removalKey), created = new Date().toISOString();
  try {
    await env.PHOTOS.put(imageKey, image.bytes, {httpMetadata: {contentType: 'image/jpeg'}});
    await env.PHOTOS.put(thumbnailKey, thumb.bytes, {httpMetadata: {contentType: 'image/jpeg'}});
    await db.prepare('INSERT INTO community_photos (id, created_at, title, location, author, description, image_key, thumbnail_key, width, height, size_bytes, sha256, removal_hash, license) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, created, title, location, author, description, imageKey, thumbnailKey, image.width, image.height, image.bytes.length, sha256, removalHash, 'CC BY 4.0').run();
  } catch (error) {
    await Promise.allSettled([env.PHOTOS.delete(imageKey), env.PHOTOS.delete(thumbnailKey)]);
    throw error;
  }
  const photo = publicPhoto({id, created_at: created, title, location, author, description, width: image.width, height: image.height, size_bytes: image.bytes.length, sha256, license: 'CC BY 4.0'}, url.origin);
  return json({photo, removal_key: removalKey, removal_note: 'Keep this key private. It removes this site’s copy; copies already downloaded and their CC BY 4.0 rights are unaffected.'}, 201);
}

function fullDataset(db, url, curated, revision) {
  const encoder = new TextEncoder();
  async function* records() {
    const metadata = {name: 'Color Study open photo collection', version: 2, catalog_revision: revision, curated_metadata_license: 'CC0', generated_at: new Date().toISOString(), repository: 'https://github.com/kristencline-arch/color-study', license_note: 'Community photographs and descriptions are CC BY 4.0. Curated sources retain their individual image licenses. Preserve credit, license links and notices of changes.', curated};
    yield JSON.stringify(metadata).slice(0, -1) + ',"contributions":[';
    let cursor = null, total = 0;
    do {
      const pageURL = new URL(url);
      if (cursor) pageURL.searchParams.set('cursor', cursor); else pageURL.searchParams.delete('cursor');
      const page = await list(db, pageURL);
      for (const photo of page.photos) {yield (total++ ? ',' : '') + JSON.stringify(photo);}
      cursor = page.next_cursor;
    } while (cursor);
    yield `],"total_contributions":${total}}\n`;
  }
  const iterator = records();
  const body = new ReadableStream({
    async pull(controller) {
      try {const part = await iterator.next(); if (part.done) controller.close(); else controller.enqueue(encoder.encode(part.value));}
      catch (error) {controller.error(error);}
    },
    async cancel() {await iterator.return();},
  });
  return new Response(body, {headers: {'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="color-study-dataset.json"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*'}});
}

export async function handleCommunity(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/dataset' && !/^\/api\/community(?:\/|$)/.test(url.pathname)) return null;
  try {
    const db = await getCommunityDb(env);
    if (url.pathname === '/api/community' && request.method === 'GET') return json(await list(db, url));
    if (url.pathname === '/api/dataset' && request.method === 'GET') {
      const catalog = await getCatalogDb(env);
      const curated = cursorFirstPage(url) || url.searchParams.get('download') === 'all' ? await allCatalogPhotos(catalog, url.origin) : [];
      if (url.searchParams.get('download') === 'all') return fullDataset(db, url, curated, catalog.revision);
      const page = await list(db, url);
      const next = page.next_cursor ? `${url.origin}/api/dataset?cursor=${encodeURIComponent(page.next_cursor)}` : null;
      return json({name: 'Color Study open photo collection', version: 2, catalog_revision: catalog.revision, curated_metadata_license: 'CC0', generated_at: new Date().toISOString(), repository: 'https://github.com/kristencline-arch/color-study', license_note: 'Preserve each photograph’s attribution and individual license. Community photographs and descriptions are CC BY 4.0; curated sources retain their listed image licenses.', curated, contributions: page.photos, total_contributions: page.total, next}, 200, {'Content-Disposition': 'attachment; filename="color-study-dataset.json"'});
    }
    if (url.pathname === '/api/community' && request.method === 'POST') return await contribute(request, env, db, url);
    if (url.pathname === '/api/community/remove' && request.method === 'POST') {
      sameOrigin(request);
      const value = await boundedJSON(request);
      if (!value || typeof value !== 'object') throw failure('The removal key is invalid.');
      if (!ID.test(value.id || '') || typeof value.removal_key !== 'string' || value.removal_key.length !== 72) throw failure('The removal key is invalid.');
      const row = await db.prepare('SELECT image_key, thumbnail_key FROM community_photos WHERE id = ? AND removal_hash = ?').bind(value.id, await hashText(value.removal_key)).first();
      if (!row) throw failure('No contribution matches this removal key.', 404);
      await db.prepare('DELETE FROM community_photos WHERE id = ? AND removal_hash = ?').bind(value.id, await hashText(value.removal_key)).run();
      await Promise.allSettled([env.PHOTOS.delete(row.image_key), env.PHOTOS.delete(row.thumbnail_key)]);
      return json({removed: true});
    }
    const detail = url.pathname.match(/^\/api\/community\/([^/]+)$/);
    if (detail && request.method === 'DELETE' && ID.test(detail[1])) {
      const configured = env.COMMUNITY_ADMIN_TOKEN;
      const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '');
      if (typeof configured !== 'string' || configured.length < 32 || typeof supplied !== 'string' || supplied.length > 256) throw failure('Not authorized.', 403);
      const expectedHash = await hashText(configured), suppliedHash = await hashText(supplied);
      let difference = 0;
      for (let i = 0; i < expectedHash.length; i++) difference |= expectedHash.charCodeAt(i) ^ suppliedHash.charCodeAt(i);
      if (difference) throw failure('Not authorized.', 403);
      const row = await db.prepare('SELECT image_key, thumbnail_key FROM community_photos WHERE id = ?').bind(detail[1]).first();
      if (!row) throw failure('Photograph not found.', 404);
      await db.prepare('DELETE FROM community_photos WHERE id = ?').bind(detail[1]).run();
      await Promise.allSettled([env.PHOTOS.delete(row.image_key), env.PHOTOS.delete(row.thumbnail_key)]);
      return json({removed: true});
    }
    if (detail && request.method === 'GET' && ID.test(detail[1])) {
      const row = await db.prepare(`SELECT ${FIELDS} FROM community_photos WHERE id = ?`).bind(detail[1]).first();
      if (!row) throw failure('Photograph not found.', 404);
      return json({photo: publicPhoto(row, url.origin)});
    }
    const match = url.pathname.match(/^\/api\/community\/([^/]+)\/(image|thumbnail)$/);
    if (match && ['GET', 'HEAD'].includes(request.method)) {
      if (!ID.test(match[1])) throw failure('Photograph not found.', 404);
      const row = await db.prepare('SELECT image_key, thumbnail_key FROM community_photos WHERE id = ?').bind(match[1]).first();
      if (!row) throw failure('Photograph not found.', 404);
      const object = await env.PHOTOS.get(match[2] === 'image' ? row.image_key : row.thumbnail_key);
      if (!object) throw failure('Photograph not found.', 404);
      return new Response(request.method === 'HEAD' ? null : object.body, {headers: {'Content-Type': 'image/jpeg', 'Content-Length': String(object.size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="color-study-${match[1]}.jpg"`, 'Content-Security-Policy': "default-src 'none'; sandbox"}});
    }
    return json({error: 'This collection endpoint is not available.'}, 404);
  } catch (error) {
    if (error.status) return json({error: error.message}, error.status);
    console.error('Community request failed', {path: url.pathname, message: error.message});
    return json({error: 'The community collection is temporarily unavailable. Please try again shortly.'}, 503);
  }
}

function cursorFirstPage(url) { return !url.searchParams.has('cursor'); }
