export const emptyCatalogFilters = {q: '', category: '', region: '', provider: '', before: '', from: '', to: '', sort: 'featured', page: 1};

export function readCatalogFilters(location) {
  const url = new URL(location, 'https://color-study.example');
  const values = {...emptyCatalogFilters};
  for (const key of Object.keys(values)) {
    const value = url.searchParams.get(key);
    if (value !== null && key !== 'page') values[key] = value.slice(0, 120);
  }
  const page = url.searchParams.get('page');
  values.page = /^[1-9]\d{0,4}$/.test(page || '') ? Number(page) : 1;
  if (!['featured', 'oldest', 'newest'].includes(values.sort)) values.sort = 'featured';
  return values;
}

export function catalogHref(filters, collection = '') {
  const params = new URLSearchParams();
  if (collection) params.set('collection', collection);
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && !(key === 'sort' && value === 'featured') && !(key === 'page' && value === 1)) params.set(key, String(value));
  }
  return '/' + (params.size ? '?' + params : '') + '#collection';
}

export function studyHref(id, settings, region) {
  const params = new URLSearchParams();
  if (settings) {params.set('strength', String(settings.targetStd)); params.set('gain', String(settings.maxGain));}
  if (region) params.set('area', region.map(value => value.toFixed(5)).join(','));
  else if (region === null) params.set('area', 'whole');
  return '/study/' + encodeURIComponent(id) + (params.size ? '?' + params : '');
}

/** @param {string | null} value @param {number[] | null} fallback */
export function readStudyRegion(value, fallback = null) {
  if (value === 'whole') return null;
  const box = value?.split(',').map(Number);
  return box?.length === 4 && box.every(x => Number.isFinite(x) && x >= 0 && x <= 1) && box[2] > box[0] && box[3] > box[1] ? box : fallback;
}
