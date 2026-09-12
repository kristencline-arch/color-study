# Color Study open image catalog

[Browse the collection](https://color-study-painted-surfaces.kristen368163.chatgpt.site/#collection) · [Download the database](https://color-study-painted-surfaces.kristen368163.chatgpt.site/api/dataset?download=all) · [Image files](public/originals/)

The September 2026 collection contains **675 photographs and scans, including 177 textiles and 118 scroll or manuscript views**. There are 424 museum API imports, 240 additional field or archive images, and the original eleven studies. The latest 27 additions include Cacaxtla, Bonampak and Teotihuacán murals, Hawaiian kapa, a Buka/Bougainville painted paddle, Timbuktu manuscript leaves and Yoruba painted woodwork. There are 66 prepared comparisons and 18 overlapping collections. Counts describe photographs, not unique artifacts. See the [coverage review](public/photo-search.md).

This is a curated starting collection, not a comprehensive inventory of ancient art. Images were selected for surviving dyes or paint, useful resolution, available original bytes and clear reuse rights. The two existing technique-limit examples remain explicitly labeled. Visually similar Teotihuacán fragments from Cleveland and Chicago are separate objects, with different accession numbers and dimensions.

## Files and licenses

- `public/sources.json` is the complete curated catalog. Stable IDs keep existing study links working.
- `public/originals/` holds unmodified museum or source JPEGs. The 675 originals total approximately 2,960 MiB. Four Keldby originals use the JPEG-based MPO container: their auxiliary images are preserved, and the study uses the first image (`study_frame: 0`). The importer validates cached files as well as new downloads. The study JPEG can be smaller than a museum's archival master; record dimensions describe the actual packaged JPEG.
- `public/thumbnails/` contains resized, orientation-corrected sRGB derivatives. Original bytes are unchanged.
- `data/museum-selection.json` records the explicit selection, categories and study guidance.
- `data/museum-records/` contains museum API snapshots, including image-rights flags, dates and accession numbers. Chicago image-service snapshots retain the advertised native dimensions.
- `data/commons-selection.json` and `data/commons-records/` preserve the explicit field/archive selection and item-specific rights snapshots.
- `public/collections.json` records 18 curated groups, their covers and explicit membership. `data/featured-order.json` records the first gallery page.
- `public/showcase.json` records the mathematical transforms and hashes of the prepared comparison previews.

Curated metadata, original catalog annotations and the compilation are dedicated under [CC0](CATALOG-LICENSE.md). **Each image retains its listed license**: museum additions are CC0/public domain; existing field photographs include attribution and share-alike licenses. Community photographs and descriptions are CC BY 4.0. The code is MIT. Raw provider snapshots retain their original provider terms, including any third-party descriptive text. These are separate grants; the catalog's CC0 dedication does not relicense third-party photographs or community descriptions.

Use the `author`, `license`, `license_url` and `source_page` fields when sharing a photograph, and identify any enhanced image as modified. Museums, photographers and NASA do not endorse this project.

## Record fields

| Field | Meaning |
| --- | --- |
| `id` | Stable study ID; museum IDs use `cma-`, `met-` or `aic-` plus the museum object ID. |
| `collections`, `catalog_order` | Explicit curated group IDs and the selected-first browsing order. |
| `title`, `short_title` | Museum/source title and a shorter browsing label. |
| `category`, `study_type` | Browsing category and `textile`, `paint` or `limits`. |
| `region`, `location`, `culture` | Broad browsing region and the more specific source wording. Uncertain origins stay uncertain. |
| `object_date` | Source's display date, distinct from the photograph date. |
| `year_start`, `year_end` | Source-supported bounds for filtering; negative years mean BCE, positive years CE. Null means no verified object date in this catalog. Bounds are estimates and may differ slightly from the museum's display wording. |
| `material` | Museum's medium or textile technique. It does not claim the algorithm identified a pigment. |
| `provider`, `museum_object_id`, `accession_number` | Holding/image institution and its identifiers. |
| `source_page`, `source_api`, `context_url`, `credit_line` | Original record, machine-readable evidence, optional separate historical context and museum credit. |
| `rights_evidence`, `rights_checked_at` | Snapshot field/value used to verify public-domain status, and the date it was checked. Refresh snapshots to check for later changes. |
| `original_file`, `download_url` | Repository image path and the source JPEG URL. |
| `expected_dimensions`, `encoded_dimensions`, `size_bytes`, `sha256` | Display dimensions after EXIF orientation, optional raw encoded dimensions, byte count where recorded, and SHA-256 of the unchanged JPEG. |
| `master_url`, `master_dimensions`, `master_size_bytes` | Optional larger museum master, often a TIFF. It may exceed the image lab's limits. |
| `focus_box_fraction`, `notes` | Suggested fitting area and interpretation guidance. Coordinates are fractions of image width/height: left, top, right, bottom. |

Museum dates are not independently established by this project. Legacy photographs without a verified object date remain undated rather than borrowing the photograph's date. Catalog categories are editorial groupings, not revised museum attributions.

## Read API

`GET /api/catalog` returns 36 records per page, a total, collection totals, category/region/provider facets and a catalog revision. Parameters combine:

```text
/api/catalog?collection=egypt&category=Textiles
/api/catalog?collection=rome&from=-100&to=79
/api/catalog?category=Textiles&region=Andes
/api/catalog?q=painted%20cotton&before=500
/api/catalog?provider=Cleveland%20Museum%20of%20Art&sort=oldest&page=2
/api/catalog?category=Textiles&download=all
/api/catalog/cma-294034
```

`collection` accepts the IDs in `public/collections.json`: `egypt`, `rome`, `greece`, `europe`, `ice-age-europe`, `early-medieval-europe`, `mesopotamia`, `persia`, `textiles`, `asia`, `macedonia`, `oceania`, `caribbean`, `indigenous-north-america`, `manuscripts`, `south-america`, `africa`. It combines with the other filters. Unknown collection IDs return 400. New shared collection links use `/?collection=egypt#collection` and retain other filters. Older `#collection=egypt` links still work.

`q` matches all supplied words, case- and accent-insensitively, as literal text. `before` accepts 500, 1000 or 1500 and uses the latest year of an object's range; undated records are excluded. `from` and `to` accept integer calendar years from -50000 to 2100, excluding zero. A record must have each required bound; its dated interval must overlap the requested range. An inverted range is rejected. The existing strict `before` filter can be combined with these bounds. `sort` accepts `featured`, `oldest` or `newest`. Date sorts place undated records last. `download=all` exports all matching records. API responses add absolute image, thumbnail and lab-study links.

`GET /api/dataset?download=all` exports the curated catalog plus the complete live community collection. Version 2 retains the existing `curated` and `contributions` arrays and adds `catalog_revision` and `curated_metadata_license`. The paginated alternative at `/api/dataset` includes the curated catalog only on the first page. No private removal keys, internal storage keys or rate-limit identifiers are exported.

D1 stores each catalog release under its manifest hash. The first request seeds a complete release transactionally; repeated requests reuse it. Overlapping deployments read their own revision, so an old worker cannot overwrite a new catalog. Catalog seeding never deletes community records. The migration in `drizzle/` and runtime schema have the same tables and indexes.

## Add museum records

1. Select a real object with an openly licensed image; add its institution ID and browsing context to `data/museum-selection.json`.
2. Install `requirements.txt`, then run `python3 scripts/import-museums.py`. Use `--only-new` for an additive batch that preserves existing entries and previews, or `--refresh` to retrieve current museum metadata. These modes are mutually exclusive. Existing snapshots allow offline reproduction.
3. Inspect the JPEG and thumbnail. Keep original bytes unchanged. Review the museum's dates, rights flag, actual dimensions and relevance to surviving dyes or paint. The importer rejects unavailable rights, undersized images, unsupported lab dimensions and original-hash changes.
4. For field/archive photographs, add explicit records to `data/commons-selection.json`, review the saved item-specific license, and run `python3 scripts/import-commons.py`. Existing bytes and rights changes fail closed. The importer preserves original JPEG bytes and EXIF metadata; only thumbnails are reoriented.
5. Update collection membership and featured order, then run `node scripts/refresh-catalog-metadata.mjs` after either importer. This reapplies the curated groups and browsing order to every source record.
6. Push the new image files to GitHub and update `public/photo-release.json` to that exact image commit before deploying the website. Keep that commit available; never point at a moving branch.
7. Run `npm test`, `npm run lint` and `npx tsc --noEmit`, then publish the source and website through the usual workflow.

The importer caches source records, bounds downloads and throttles Chicago requests. It supports the official [Cleveland API](https://openaccess-api.clevelandart.org/), [Met collection API](https://metmuseum.github.io/) and [Art Institute API](https://api.artic.edu/docs/). Use the Met's paginated v1.1 search for new discovery; object-detail URLs continue to use v1. Imported museum and field originals are archived in GitHub, and production image requests resolve to the immutable commit in `public/photo-release.json`. Previews and the database are hosted with the website. The deployment archive omits the imported JPEG copies to fit the host's 256 MiB limit; the source repository retains every original. Full-resolution studies and downloads therefore require access to GitHub's raw image service, which supports browser CORS.

To reproduce the textile comparison only, run `python3 scripts/build-showcase.py --study cma-294034`. Existing comparison records are retained. With no study argument, the script rebuilds the comparisons already named in the showcase manifest.

## Interpretation and contributions

Color separation amplifies existing differences, including dye, paint, stains, lighting, weave, reflections and noise. It does not reconstruct an original palette, expose opaque overpainting, identify pigments, date marks or prove deliberate destruction. Preserve the original next to an enhancement. Painted surfaces and textiles are candidates for comparison, not evidence of newly discovered markings.

Visitors can use the website's contribution form to publish their own photographs immediately under CC BY 4.0. Private lab imports remain local. Every contribution and catalog record has a report link. Museum corrections can also be submitted through GitHub with the stable record ID and supporting source.

## Separate artwork and photograph rights

Commons can summarize an ancient artwork as public domain while the photographer supplies a separate CC BY-SA grant. An explicit `photo_license` in the curated selection preserves that grant. The importer verifies the matching file title, saved revision and photographer self-license; `--refresh` rechecks it. `rights_evidence.photograph_license` retains the effective license, revision link and raw evidence snapshot. The image’s displayed and exported `license` follows the photograph grant. This release corrects the earlier Afrasiyab boat photograph to CC BY-SA 3.0 and preserves CC BY-SA 4.0 for four Taüll photographs.

## Ice Age and early medieval image context

The Ice Age group contains original cave-surface photographs from Altxerri, Pech Merle and Bernifal, plus one clearly labeled Azilian transition object. Dates in years BP remain in their original convention; approximate cultural attribution is not converted into a falsely precise calendar date. The source collage of the Azilian pebble shows several views of one object. Early medieval additions include library scans and six explicitly identified published color reproductions; printing and scanning can affect their recorded colors. These are not new direct captures of the walls. The original source files remain unmodified.

## Study navigation, context and reports

`public/object-groups.json` groups related images by site, object or manuscript. It does not claim a complete unique-object census. `public/study-notes.json` provides observation prompts and normalized rectangles; `public/context-references.json` separates external research and reconstructions from ancient source photographs. `public/social-previews.json` records source hashes, credits, licenses and any comparison settings used in sharing cards.

Curated `study_url` values use `/study/<id>`. Optional `strength`, `gain` and `area` parameters preserve processing settings; `area=whole` explicitly restores whole-image fitting. A region changes the fitting sample, not the original bytes. Both viewer layers share the same pan and magnification, and the worker processes a bounded native crop for detailed viewing.

`POST /api/reports` accepts a private, bounded report without a visitor account. Owner-only GET/PATCH endpoints use the existing server admin token. Reports never enter the public dataset or automatically remove a photograph. See [OWNER-GUIDE.md](OWNER-GUIDE.md).
