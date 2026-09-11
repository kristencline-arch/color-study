import sources from '../public/sources.json';
import {getCommunityDb} from './community.mjs';

export const catalogSchema = [
  'CREATE TABLE IF NOT EXISTS catalog_releases (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS catalog_photos (
    release_id TEXT NOT NULL, id TEXT NOT NULL,
    category TEXT NOT NULL, region TEXT NOT NULL, provider TEXT NOT NULL,
    year_start INTEGER, year_end INTEGER, search_text TEXT NOT NULL,
    sort_order INTEGER NOT NULL, data_json TEXT NOT NULL,
    PRIMARY KEY (release_id, id)
  )`,
  'CREATE INDEX IF NOT EXISTS catalog_photos_browse ON catalog_photos (release_id, category, sort_order)',
];

export const normalizeSearch = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const initialized = new WeakMap();
let revisionPromise;

export async function getCatalogDb(env) {
  const db = await getCommunityDb(env);
  if (!initialized.has(db)) {
    const ready = (async () => {
      await db.batch(catalogSchema.map(sql => db.prepare(sql)));
      revisionPromise ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sources)))
        .then(bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''));
      const revision = await revisionPromise;
      const existing = await db.prepare('SELECT id FROM catalog_releases WHERE id = ?').bind(revision).first();
      if (!existing) {
        const statements = sources.map((source, index) => {
          const category = source.category || (source.study_type === 'limits' ? 'Technique limits' : 'Painted surfaces');
          const region = source.region || source.location || 'Not recorded';
          const provider = source.provider || 'Wikimedia Commons';
          const search = normalizeSearch([source.title, source.short_title, source.material, source.culture, source.location, source.object_date, source.notes, source.accession_number, category, region, provider].filter(Boolean).join(' '));
          return db.prepare(`INSERT INTO catalog_photos
            (release_id, id, category, region, provider, year_start, year_end, search_text, sort_order, data_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (release_id, id) DO NOTHING`).bind(revision, source.id, category, region, provider,
              source.year_start ?? null, source.year_end ?? null, search, source.catalog_order ?? index, JSON.stringify(source));
        });
        statements.push(db.prepare('INSERT INTO catalog_releases (id, created_at) VALUES (?, ?) ON CONFLICT (id) DO NOTHING').bind(revision, new Date().toISOString()));
        // D1 batches are transactional. Versioned rows let overlapping deployments
        // serve their own complete catalog without overwriting each other's seed.
        await db.batch(statements);
      }
      return {db, revision};
    })().catch(error => { initialized.delete(db); throw error; });
    initialized.set(db, ready);
  }
  return initialized.get(db);
}

export function publicCatalogPhoto(row, origin) {
  const source = JSON.parse(row.data_json);
  return {...source, category: row.category, region: row.region, provider: row.provider,
    image_url: `${origin}/${source.original_file}`,
    thumbnail_url: `${origin}/thumbnails/${source.id}.jpg`,
    study_url: `${origin}/#sample=${encodeURIComponent(source.id)}`};
}

export async function allCatalogPhotos(catalog, origin) {
  const rows = await catalog.db.prepare('SELECT * FROM catalog_photos WHERE release_id = ? ORDER BY sort_order, id').bind(catalog.revision).all();
  return rows.results.map(row => publicCatalogPhoto(row, origin));
}
