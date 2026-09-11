# Color Study

Explore surviving color in textiles and ancient art using regularized RGB decorrelation stretch. The searchable open database contains 66 photographs, including 29 textiles.

[Open the website](https://color-study-painted-surfaces.kristen368163.chatgpt.site) · [Read the original NASA article](https://spinoff.nasa.gov/Manipulating_Satellite_Photos_Now_Reveals_Ancient_Images) · [Download the open photo database](https://color-study-painted-surfaces.kristen368163.chatgpt.site/api/dataset?download=all)

## Files

- [Image engine](public/dcs-core.mjs) and [browser worker](public/dcs-worker.js)
- [Python image processor](process_images.py)
- [Website and browser app](app/ColorStudy.tsx)
- [Community collection server](server/community.mjs) and [database schema](db/schema.ts)
- [Reproducible showcase previews](scripts/build-showcase.py)
- [66 study photographs, including 29 textiles](public/originals/) and [image credits](CREDITS.md)
- [20-target research guide](public/targets.md)
- [Source records, dimensions and licenses](public/sources.json)

## Run the app

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by the server. Import a photo, adjust the color separation, select an area to fit, compare, and export a full-resolution PNG. Private image-lab imports stay in your browser. The separate contribution form publishes a JPEG copy only after explicit consent. No account or API key is required to run the app locally; D1 and R2 are emulated locally and persist under `.wrangler/`. A production deployment needs its own `DB` (D1) and `PHOTOS` (R2) bindings. Schema migrations are in `drizzle/`.

## Explore and expand the catalog

[Browse the collection](https://color-study-painted-surfaces.kristen368163.chatgpt.site/#collection) by material, region, date and museum. Open any photograph in the image lab, download its JPEG or follow the original museum record. Some records also link to a larger archival TIFF.

[Catalog documentation](CATALOG.md) explains the selection, licenses, schema, search API and reproducible imports. `GET /api/catalog?category=Textiles&download=all` downloads every textile record. `GET /api/catalog` provides filtered, paginated access backed by D1.

To add museum images, edit `data/museum-selection.json` and run `python3 scripts/import-museums.py`. Reviewed museum metadata snapshots are included under `data/museum-records/`. The importer checks image-rights flags, retains source JPEG bytes and hashes, and generates sRGB thumbnails. Use `--refresh` to refetch museum records. All 66 originals occupy approximately 312 MiB; page browsing loads small previews.

## Community contributions

Visitors may contribute photographs they took, with a public credit and general location. The photo and description are published immediately under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The browser prepares a full-size sRGB JPEG copy and thumbnail; the server validates the JPEG structure and removes camera metadata before storage. The raw original file input is not uploaded.

Every contribution includes download, study and report links. Reports open a GitHub issue. A private removal-key file lets the contributor remove this site’s public copy later; copies already downloaded and their valid reuse rights are unaffected. Private keys and rate-limit identifiers are excluded from public exports.

`GET /api/community` lists 24 contributions per page using `next_cursor`. `GET /api/dataset?download=all` streams the complete database as JSON, including all image URLs, credits, licenses, dimensions and hashes. `GET /api/dataset` is a paginated alternative. Public read endpoints support cross-origin requests. Community data lives in the database and object storage, rather than automatically creating Git commits.

## Run the Python processor

Requires Python 3.11 or newer.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python process_images.py --study marble-sphinx --output outputs/sphinx
```

Omit `--study` to process all 66 examples, or repeat it to choose several. Outputs include PNGs, comparisons, exact processing settings and a ZIP. Use a new output directory for each run; existing results are preserved.

## Checks

```sh
npm test
npm run lint
npx tsc --noEmit
```

Tests compare the JavaScript math with the original Python engine and exercise worker loading, selected-area fitting, exports, app HTML and image integrity. Catalog tests check persistent seeding, combined search/date filters, stable pagination, complete exports and source-rights evidence. Image-worker tests use an in-memory canvas; browser codecs and interaction need a browser walkthrough. Community tests use real local D1/R2 emulation to check consent, persistent uploads, metadata removal, deletion authorization, export pagination, full database downloads, rate limits and storage-failure cleanup.

## About the method

Inspired by [NASA's article on decorrelation stretch](https://spinoff.nasa.gov/Manipulating_Satellite_Photos_Now_Reveals_Ancient_Images) and [Jon Harman's algorithm description](https://www.dstretch.com/AlgorithmDescription.html). This is an independent RGB implementation, not the DStretch plugin.

Enhancement exaggerates color already present in a photo. It does not reconstruct the original ancient palette or establish pigment identity, hidden paint, dates or deliberate damage.

## License

Code and original documentation: [MIT](LICENSE). Curated metadata and original catalog annotations: [CC0](CATALOG-LICENSE.md). Photographs retain their individual licenses in [CREDITS.md](CREDITS.md) and [sources.json](public/sources.json). Keep those credits and license links when redistributing images, and identify enhanced images as modified. The MIT license does not relicense third-party images or dependencies.

Run `python scripts/build-showcase.py` to regenerate the resized originals and enhanced website comparisons. Their original hashes, fitting regions, settings and exact matrices are recorded in `public/showcase.json`.

Operators can set a server-only `COMMUNITY_ADMIN_TOKEN` of at least 32 characters and send `DELETE /api/community/{id}` with `Authorization: Bearer <token>` to remove a reported contribution. The token is never part of the public site, image records or database download. Keep it in the hosting service’s secret settings, not in Git.

The production website loads museum JPEGs from the pinned GitHub image release in `public/photo-release.json`; all original files remain in this repository. Thumbnails, comparisons and the D1 catalog are hosted with the website. The build omits only generated museum JPEG copies from the deployment archive to respect its size limit.
