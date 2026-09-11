# Color Study

An open-source photographic showcase and browser lab for regularized RGB decorrelation stretch. It includes a searchable database of 437 photographs, including 143 textiles, a [62-target painted-surface guide](public/targets.md), and an open community photo collection. The [public source repository](https://github.com/kristencline-arch/color-study) contains the portable app and processing tools.

Curated metadata and original annotations are [CC0](CATALOG-LICENSE.md); photographs retain their individual licenses. [Browse the collection](https://color-study-painted-surfaces.kristen368163.chatgpt.site/#collection) or [view all image credits](CREDITS.md).

[Explore Egypt](https://color-study-painted-surfaces.kristen368163.chatgpt.site/#collection=egypt) · [Pompeii & Rome](https://color-study-painted-surfaces.kristen368163.chatgpt.site/#collection=rome) · [Search expansion and remaining gaps](public/photo-search.md)

## Use

Run `npm run dev` and open the URL printed by the server. Import JPEG, PNG, WebP or AVIF; adjust color separation; fit to a selected surface; compare and export a native-size PNG. Save the separate JSON processing record for settings, fitted matrix, input hash and source credit. Sharing a study link includes a built-in photo and its settings. Private lab imports are never uploaded or included in shared links. The separate contribution form publishes only after the visitor explicitly agrees to the public license.

Browser Worker, OffscreenCanvas, ImageBitmap and secure-context Web Crypto are required. Inputs are capped at 80 MiB, 64 MP and a 16,000-pixel edge. Browser memory may limit exports below those caps. A 1,600-pixel preview uses the same fitted matrix as native-size striped exports. Canvas decodes into sRGB with EXIF orientation applied. Different image decoders can produce slightly different results.

## Open community collection

Visitors can publish their own photographs and descriptions immediately under CC BY 4.0, with a public photographer credit. The form converts the original to a full-size sRGB JPEG copy and a thumbnail; the server removes metadata again, validates dimensions and JPEG structure, and limits file size and daily contributions. The original file input is removed from the submission before upload. Public data contains no email, removal secret or rate-limit identifier.

D1 stores attribution and photo records; R2 stores image bytes. The logical bindings are `DB` and `PHOTOS`. The migration is in `drizzle/`; the local runtime also initializes the same tables idempotently.

`GET /api/community` lists 24 public contributions with a cursor. `GET /api/dataset?download=all` streams a complete downloadable JSON database, including all curated sources and community contributions with image URLs, licenses, dimensions and hashes. `/api/dataset` provides the same data in pages for programmatic use. Public reads allow cross-origin access.

Each photo has a report link to the GitHub issue form. The contributor receives a private removal key; `POST /api/community/remove` removes the photo from this collection when that key matches. Downloaded copies and valid CC BY 4.0 reuse rights cannot be recalled. No imported image is submitted automatically and no account is required.

## Evidence and interpretation

[The NASA article](https://spinoff.nasa.gov/Manipulating_Satellite_Photos_Now_Reveals_Ancient_Images) describes the history and applications. This is an independent implementation of the underlying principle, not DStretch or its custom color presets. False-color enhancement amplifies existing signals and noise. It does not recover the original palette, expose paint beneath opaque layers, date marks, identify pigments or prove deliberate damage.

Browse 13 overlapping collections, including Asia, Macedonia, Oceania, Indigenous North America, scrolls and manuscripts, South America, and Africa beyond Egypt. Museum and source records retain specific cultural attributions and dates.

The collection includes 143 textiles and ancient or historic painted art, alongside the original field studies in Turkey, Iran, India, Argentina, Pompeii, Unas and Greek marble sculpture. [Catalog documentation](CATALOG.md) explains the selection, source metadata, image rights, read API and repeatable museum and Commons importers. The original Great Pyramid and Titanic examples remain available under technique limits. New original files are unchanged; thumbnails are resized derivatives. `public/sources.json` records dimensions, hashes, authors, license and source links. The original standalone gallery and Python engine in the parent folder are preserved.

## Validation

`npm test` builds the production worker and runs numeric comparisons against the preserved Python engine, worker lifecycle and export tests, production HTML and metadata checks, and source/asset integrity tests. `npm run lint` and `npx tsc --noEmit` check the app. Worker image-processing tests use an in-memory canvas adapter; they do not validate browser codecs or replace an interactive browser walkthrough. Community tests use real local D1 and R2 emulation and exercise consent, publication, metadata removal, persistence, complete exports, pagination, removal authorization, rate limits and storage-failure cleanup.

## Photo credits

- **Bhimbetka, India** — Bernard Gagnon. [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) · [Source](https://commons.wikimedia.org/wiki/File:Rock_Shelter_8,_Bhimbetka_03.jpg).
- **House of the Vettii** — Chappsnet. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) · [Source](https://commons.wikimedia.org/wiki/File:Fresco_depicting_the_metamorphosis_of_Cyparissus,_House_of_the_Vettii,_Pompeii.jpg).
- **Cappadocia, Turkey** — José Luiz. [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) · [Source](https://commons.wikimedia.org/wiki/File:Fresco_at_the_Dark_Church,_in_Goreme_(6).JPG).
- **Painted marble sphinx** — The Metropolitan Museum of Art. [CC0 / Public domain](https://creativecommons.org/publicdomain/zero/1.0/) · [Source](https://www.metmuseum.org/art/collection/search/248501).
- **Pyramid of Unas** — Aidan McRae Thomson. [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) · [Source](https://commons.wikimedia.org/wiki/File:Pyramid_Texts_in_Unas%E2%80%99_Pyramid_2017.jpg).
- **Chehel Sotoun, Iran** — Amir Pashaei. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) · [Source](https://commons.wikimedia.org/wiki/File:A_painting_in_Chehel_Sotoun2.jpg).
- **Cueva de las Manos** — Pablo A. Gimenez from Buenos Aires, Argentina. [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) · [Source](https://commons.wikimedia.org/wiki/File:Cueva_de_las_Manos_(6811931046).jpg).
- **Villa of the Mysteries** — Gary Todd from Xinzheng, China. [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) · [Source](https://commons.wikimedia.org/wiki/File:Pompeii_Ruins_Scenes_of_a_Dionysiac_Mystery_Cult,_Villa_of_the_Mysteries_Fresco,_c._50_BC_(48445609592).jpg).
- **House of Menander** — Marco Ober. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) · [Source](https://commons.wikimedia.org/wiki/File:Casa_del_Menandro,_Interior,_Pompeii_(4979).jpg).
- **Great Pyramid (limits)** — Ovedc. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) · [Source](https://commons.wikimedia.org/wiki/File:By_ovedc_-_Interior_of_the_Great_Pyramid_-_02.jpg).
- **Titanic (limits)** — Lori Johnston / RMS Titanic Expedition 2003 / NOAA Ocean Exploration. [Public domain (NOAA; attribution retained)](https://commons.wikimedia.org/wiki/File:Captain_Smith%27s_bathroom.jpg) · [Source](https://oceanexplorer.noaa.gov/multimedia/edu-themes-archaeology-media-multimedia-titanic-bathtub/).

Retain attribution, license links and a notice that colors were changed when sharing enhancements. No endorsement by photographers, museums, NASA or DStretch is implied. The generated social card is an illustration, not archaeological evidence.

Website showcase previews are resized originals and mathematical color enhancements. `public/showcase.json` preserves their exact fitting settings, matrices and file hashes; the public repository includes `scripts/build-showcase.py` to reproduce them. The existing social card remains an illustration, not evidence.

Operators can set a server-only `COMMUNITY_ADMIN_TOKEN` of at least 32 characters and send `DELETE /api/community/{id}` with `Authorization: Bearer <token>` to remove a reported contribution. The token is never part of the public site, image records or database download. Keep it in the hosting service’s secret settings, not in Git.

The production website loads imported museum and field JPEGs from the pinned GitHub image release in `public/photo-release.json`; all original files remain in this repository. Thumbnails, comparisons and the D1 catalog are hosted with the website. The build omits only generated imported JPEG copies from the deployment archive to respect its size limit.
