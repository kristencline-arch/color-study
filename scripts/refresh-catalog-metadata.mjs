import {readFile, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root)));
const save = async (path, data) => writeFile(new URL(path, root), JSON.stringify(data, null, 2) + '\n');
const sources = await read('public/sources.json');
const collections = await read('public/collections.json');
const featured = await read('data/featured-order.json');
const ids = new Set(sources.map(source => source.id));
if (ids.size !== sources.length || new Set(featured).size !== featured.length) throw new Error('Duplicate catalog or featured ID.');
for (const id of featured) if (!ids.has(id)) throw new Error(`Missing featured photograph: ${id}`);
for (const collection of collections) {
  if (!collection.photo_ids.includes(collection.cover)) throw new Error(`Missing collection cover: ${collection.id}`);
  for (const id of collection.photo_ids) if (!ids.has(id)) throw new Error(`Missing collection photograph: ${id}`);
  if (new Set(collection.photo_ids).size !== collection.photo_ids.length) throw new Error(`Duplicate collection entry: ${collection.id}`);
  collection.count = collection.photo_ids.length;
}
const order = [...featured, ...sources.filter(source => !featured.includes(source.id)).map(source => source.id)];
for (const source of sources) {
  source.collections = collections.filter(collection => collection.photo_ids.includes(source.id)).map(collection => collection.id);
  source.catalog_order = order.indexOf(source.id);
}
await save('public/sources.json', sources);
await save('public/collections.json', collections);
console.log(`Updated ${sources.length} photographs across ${collections.length} curated collections.`);
