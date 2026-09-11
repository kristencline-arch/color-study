export const communitySchema = [
  `CREATE TABLE IF NOT EXISTS community_photos (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    author TEXT NOT NULL,
    description TEXT NOT NULL,
    image_key TEXT NOT NULL,
    thumbnail_key TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    removal_hash TEXT NOT NULL,
    license TEXT NOT NULL DEFAULT 'CC BY 4.0'
  )`,
  'CREATE INDEX IF NOT EXISTS community_photos_created ON community_photos (created_at, id)',
  'CREATE TABLE IF NOT EXISTS community_limits (bucket TEXT PRIMARY KEY NOT NULL, used INTEGER NOT NULL)',
];

const initialized = new WeakMap();
export async function getCommunityDb(env) {
  if (!env.DB || !env.PHOTOS) throw new Error('Community storage is not available yet. Your photo has not been published.');
  if (!initialized.has(env.DB)) {
    const ready = env.DB.batch(communitySchema.map(sql => env.DB.prepare(sql))).catch(error => { initialized.delete(env.DB); throw error; });
    initialized.set(env.DB, ready);
  }
  await initialized.get(env.DB);
  return env.DB;
}
