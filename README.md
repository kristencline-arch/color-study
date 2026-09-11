# Color Study

Explore faint color in photographs of painted surfaces using regularized RGB decorrelation stretch.

## Files

- [Image engine](public/dcs-core.mjs) and [browser worker](public/dcs-worker.js)
- [Python image processor](process_images.py)
- [Browser app](app/ColorStudy.tsx)
- [11 full-resolution photographs](public/originals/) and [image credits](CREDITS.md)
- [20-target research guide](public/targets.md)
- [Source records, dimensions and licenses](public/sources.json)

## Run the app

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by the server. Import a photo, adjust the color separation, select an area to fit, compare, and export a full-resolution PNG. Imported photos stay in your browser. No account or API key is required.

## Run the Python processor

Requires Python 3.11 or newer.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python process_images.py --study marble-sphinx --output outputs/sphinx
```

Omit `--study` to process all 11 examples, or repeat it to choose several. Outputs include PNGs, comparisons, exact processing settings and a ZIP. Use a new output directory for each run; existing results are preserved.

## Checks

```sh
npm test
npm run lint
npx tsc --noEmit
```

Tests compare the JavaScript math with the original Python engine and exercise worker loading, selected-area fitting, exports, app HTML and image integrity. The worker tests use an in-memory canvas; browser codecs and interaction need a browser walkthrough.

## About the method

Inspired by [NASA's article on decorrelation stretch](https://spinoff.nasa.gov/Manipulating_Satellite_Photos_Now_Reveals_Ancient_Images) and [Jon Harman's algorithm description](https://www.dstretch.com/AlgorithmDescription.html). This is an independent RGB implementation, not the DStretch plugin.

Enhancement exaggerates color already present in a photo. It does not reconstruct the original ancient palette or establish pigment identity, hidden paint, dates or deliberate damage.

## License

Code and original documentation: [MIT](LICENSE). Photographs retain their individual licenses in [CREDITS.md](CREDITS.md) and [sources.json](public/sources.json). Keep those credits and license links when redistributing images, and identify enhanced images as modified. The MIT license does not relicense third-party images or dependencies.
