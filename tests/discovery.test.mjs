import assert from 'node:assert/strict';
import test from 'node:test';
import {catalogHref, readCatalogFilters, studyHref, readStudyRegion, emptyCatalogFilters} from '../app/catalog-location.mjs';

test('shared searches round-trip Unicode terms, BCE dates, material and pagination', () => {
  const filters = {...emptyCatalogFilters, q: 'Diné woven cotton', category: 'Textiles', region: 'Egypt', provider: 'The Metropolitan Museum of Art', from: '-3000', to: '600', sort: 'oldest', page: 3};
  const url = catalogHref(filters, 'egypt');
  assert.deepEqual(readCatalogFilters(url), filters);
  const parsed = new URL(url, 'https://color-study.example');
  assert.equal(parsed.searchParams.get('collection'), 'egypt');
  assert.equal(parsed.hash, '#collection');
  assert.equal(catalogHref(emptyCatalogFilters), '/#collection');
  assert.equal(readCatalogFilters('/?page=-10&sort=constructor').page, 1);
  assert.equal(readCatalogFilters('/?sort=constructor').sort, 'featured');
});

test('canonical study links preserve settings and the selected source area', () => {
  const url = new URL(studyHref('commons-durrow-125v', {targetStd: 34, maxGain: 12}, [.1, .2, .8, .9]), 'https://color-study.example');
  assert.equal(url.pathname, '/study/commons-durrow-125v');
  assert.equal(url.searchParams.get('strength'), '34');
  assert.deepEqual(url.searchParams.get('area').split(',').map(Number), [.1, .2, .8, .9]);
  assert.equal(url.hash, '');
  assert.deepEqual(readStudyRegion(url.searchParams.get('area')), [.1, .2, .8, .9]);
  const whole = new URL(studyHref('marble-sphinx', {targetStd: 30, maxGain: 8}, null), 'https://color-study.example');
  assert.equal(readStudyRegion(whole.searchParams.get('area'), [.2,.2,.8,.8]), null);
  assert.deepEqual(readStudyRegion('0,0,Infinity,1', [.2,.2,.8,.8]), [.2,.2,.8,.8]);
});
