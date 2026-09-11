"""Build honest, reproducible website previews from the credited originals."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from process_images import SRGB, fit_transform


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', type=Path, default=ROOT / 'public')
    args = parser.parse_args()
    public = args.public.resolve()
    out = public / 'showcase'
    out.mkdir(exist_ok=True)
    sources = json.loads((public / 'sources.json').read_text())
    records = []
    for source in sources:
        if source['study_type'] != 'paint':
            continue
        with Image.open(public / source['original_file']) as opened:
            original = ImageOps.exif_transpose(opened).convert('RGB')
            if opened.info.get('icc_profile'):
                original = ImageCms.profileToProfile(original, ImageCms.ImageCmsProfile(io.BytesIO(opened.info['icc_profile'])), SRGB, outputMode='RGB')
        box = tuple(round(f * (original.width if i % 2 == 0 else original.height)) for i, f in enumerate(source['focus_box_fraction']))
        enhanced, fit = fit_transform(original, box, target_std=34, max_gain=12)
        record = {'id': source['id'], 'source_sha256': source['sha256'], 'settings': {'targetStd': 34, 'maxGain': 12}, 'region': source['focus_box_fraction'], 'fit': fit, 'files': {}}
        for label, image in [('original', original), ('enhanced', enhanced)]:
            preview = ImageOps.contain(image, (1600, 1600), Image.Resampling.LANCZOS)
            path = out / f"{source['id']}-{label}.webp"
            preview.save(path, quality=88, method=6, icc_profile=SRGB.tobytes())
            record['files'][label] = {'path': str(path.relative_to(public)), 'width': preview.width, 'height': preview.height, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        records.append(record)
        print(source['id'], flush=True)
    (public / 'showcase.json').write_text(json.dumps(records, indent=2) + '\n')


if __name__ == '__main__':
    main()
