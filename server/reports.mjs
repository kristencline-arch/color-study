import sources from '../public/sources.json';
import {getCommunityDb} from '../db/community.mjs';

export const reportSchema = [
  `CREATE TABLE IF NOT EXISTS photo_reports (
    id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL,
    photo_id TEXT NOT NULL, photo_type TEXT NOT NULL,
    reason TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open'
  )`,
  'CREATE INDEX IF NOT EXISTS photo_reports_status ON photo_reports (status, created_at, id)',
];
const initialized = new WeakMap();
const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
const failure = (message, status = 400) => Object.assign(new Error(message), {status});
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');

async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) throw failure('Use the report form.');
  const reader = request.body.getReader(); let length = 0; const chunks = [];
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.length;
    if (length > 8192) {await reader.cancel(); throw failure('Keep the report under 1,800 characters.', 413);}
    chunks.push(part.value);
  }
  try {const value = JSON.parse(await new Blob(chunks).text()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value;}
  catch {throw failure('The report could not be read.');}
}
async function authorize(request, env) {
  const expected = env.COMMUNITY_ADMIN_TOKEN, actual = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (typeof expected !== 'string' || expected.length < 32 || typeof actual !== 'string' || actual.length > 256) throw failure('Not authorized.', 403);
  const a = await hash(expected), b = await hash(actual); let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (diff) throw failure('Not authorized.', 403);
}
export async function handleReports(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/reports' && !url.pathname.startsWith('/api/reports/')) return null;
  try {
    const db = await getCommunityDb(env);
    if (!initialized.has(db)) initialized.set(db, db.batch(reportSchema.map(sql => db.prepare(sql))).catch(error => {initialized.delete(db); throw error;}));
    await initialized.get(db);
    if (request.method === 'GET' && url.pathname === '/api/reports') {
      await authorize(request, env);
      const status = url.searchParams.get('status') || 'open';
      if (!['open', 'resolved'].includes(status)) throw failure('Choose a valid report status.');
      const rows = await db.prepare('SELECT * FROM photo_reports WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT 100').bind(status).all();
      return json({reports: rows.results, limit: 100});
    }
    const detail = url.pathname.match(/^\/api\/reports\/([0-9a-f-]{36})$/);
    if (detail && request.method === 'PATCH') {
      await authorize(request, env);
      const value = await body(request);
      if (!['open', 'resolved'].includes(value.status)) throw failure('Choose a valid report status.');
      const result = await db.prepare('UPDATE photo_reports SET status = ? WHERE id = ? RETURNING id, status').bind(value.status, detail[1]).first();
      return result ? json(result) : json({error: 'Report not found.'}, 404);
    }
    if (url.pathname !== '/api/reports' || request.method !== 'POST') return json({error: 'This report endpoint is not available.'}, 405);
    if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') throw failure('Submit the report from this website.', 403);
    const value = await body(request);
    if (value.website) throw failure('The report could not be accepted.');
    if (!['curated', 'community'].includes(value.photo_type) || typeof value.photo_id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(value.photo_id)) throw failure('Choose a photograph to report.');
    if (!['rights', 'attribution', 'context', 'privacy', 'content', 'other'].includes(value.reason)) throw failure('Choose a reason for the report.');
    if (typeof value.details !== 'string' || value.details.trim().length < 10 || value.details.length > 1800 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.details)) throw failure('Describe the concern in 10–1,800 characters.');
    const exists = value.photo_type === 'curated' ? sources.some(source => source.id === value.photo_id) : await db.prepare('SELECT id FROM community_photos WHERE id = ?').bind(value.photo_id).first();
    if (!exists) throw failure('Photograph not found.', 404);
    const day = new Date().toISOString().slice(0, 10), ip = request.headers.get('cf-connecting-ip');
    const limits = [{bucket: `${day}:report:all`, max: 200}];
    if (ip) limits.unshift({bucket: `${day}:report:${await hash(day + ':' + ip)}`, max: 5});
    for (const limit of limits) {
      const reserved = await db.prepare('INSERT INTO community_limits (bucket, used) VALUES (?, 1) ON CONFLICT (bucket) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used').bind(limit.bucket, limit.max).first();
      if (!reserved) throw failure('The daily report limit has been reached. Please try again tomorrow.', 429);
    }
    await db.prepare('DELETE FROM community_limits WHERE bucket < ?').bind(day).run();
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO photo_reports (id, created_at, photo_id, photo_type, reason, details, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, new Date().toISOString(), value.photo_id, value.photo_type, value.reason, value.details.trim(), 'open').run();
    return json({reference: id, message: 'Your report is saved for the site owner to review. Reports are not published in the photo database.'}, 201);
  } catch (error) {
    if (error.status) return json({error: error.message}, error.status);
    console.error('Photo report unavailable', {message: error.message});
    return json({error: 'Reports are temporarily unavailable. Please try again shortly or use the GitHub report link.'}, 503);
  }
}
