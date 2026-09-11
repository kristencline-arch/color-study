#!/usr/bin/env python3
"""Reproducible, regularized RGB decorrelation stretch. Requires Pillow only.

No generative model or spatial reconstruction is used. A Jacobi eigensolver
fits a 3x3 color transform; Pillow applies it to every native-resolution pixel.
References and limitations are in README.md. Original downloads are read-only.
"""

import argparse
import hashlib
import io
import json
import math
import platform
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

import PIL
from PIL import Image, ImageCms, ImageDraw, ImageFont, ImageOps, PngImagePlugin

BASE = Path(__file__).resolve().parent
DATA = BASE / "public"
PAPER = (245, 242, 235)
INK = (32, 43, 45)
MUTED = (89, 96, 96)
SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))


def multiply(a, b):
    return [[sum(x * y for x, y in zip(row, col)) for col in zip(*b)] for row in a]


def transpose(a):
    return [list(row) for row in zip(*a)]


def eigen_symmetric(cov):
    """Jacobi rotations for a real symmetric 3x3 covariance matrix."""
    a = [row[:] for row in cov]
    v = [[float(i == j) for j in range(3)] for i in range(3)]
    tolerance = max(1.0, sum(abs(a[i][i]) for i in range(3))) * 1e-13
    for _ in range(100):
        p, q = max(((0, 1), (0, 2), (1, 2)), key=lambda ij: abs(a[ij[0]][ij[1]]))
        if abs(a[p][q]) <= tolerance:
            break
        tau = (a[q][q] - a[p][p]) / (2.0 * a[p][q])
        t = math.copysign(1.0, tau) / (abs(tau) + math.hypot(1.0, tau))
        c = 1.0 / math.sqrt(1.0 + t * t)
        s = t * c
        off = a[p][q]
        a[p][p] -= t * off
        a[q][q] += t * off
        a[p][q] = a[q][p] = 0.0
        for k in range(3):
            if k not in (p, q):
                kp, kq = a[k][p], a[k][q]
                a[k][p] = a[p][k] = c * kp - s * kq
                a[k][q] = a[q][k] = s * kp + c * kq
            vp, vq = v[k][p], v[k][q]
            v[k][p], v[k][q] = c * vp - s * vq, s * vp + c * vq
    else:
        raise ArithmeticError("Covariance eigensolver did not converge")
    values = [max(0.0, a[i][i]) for i in range(3)]
    reconstructed = multiply(multiply(v, [[values[i] if i == j else 0.0 for j in range(3)] for i in range(3)]), transpose(v))
    error = max(abs(reconstructed[i][j] - cov[i][j]) for i in range(3) for j in range(3))
    if error > max(1.0, max(values)) * 1e-8:
        raise ArithmeticError(f"Covariance reconstruction error: {error}")
    return values, v, error


def fit_transform(img, box, target_std, max_gain=12.0, noise_floor=2.0):
    region = img.crop(box)
    factor = min(1.0, 720.0 / max(region.size))
    grid = region.resize(tuple(max(1, round(s * factor)) for s in region.size), Image.Resampling.NEAREST)
    pixels = list(grid.getdata())
    samples = [p for p in pixels if 8.0 <= (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) <= 247.0 and max(p) < 250]
    if len(samples) < 32:
        raise ValueError("Too few usable, non-clipped color samples in selected area")
    count = len(samples)
    mean = [sum(p[i] for p in samples) / count for i in range(3)]
    cov = [[0.0] * 3 for _ in range(3)]
    for pixel in samples:
        d = [pixel[i] - mean[i] for i in range(3)]
        for i in range(3):
            for j in range(i, 3):
                cov[i][j] += d[i] * d[j]
    for i in range(3):
        for j in range(i, 3):
            cov[i][j] /= count - 1
            cov[j][i] = cov[i][j]
    eigenvalues, vectors, residual = eigen_symmetric(cov)
    gains = [min(max_gain, target_std / math.sqrt(max(value, noise_floor ** 2))) for value in eigenvalues]
    matrix = [[sum(vectors[i][k] * gains[k] * vectors[j][k] for k in range(3)) for j in range(3)] for i in range(3)]
    # A neutral display center maximizes room for the expanded false colors.
    offset = [127.5 - sum(matrix[i][j] * mean[j] for j in range(3)) for i in range(3)]
    pillow_matrix = tuple(value for row, shift in zip(matrix, offset) for value in (*row, shift))
    clip_count = sum(any(not 0 <= sum(matrix[i][j] * p[j] for j in range(3)) + offset[i] <= 255 for i in range(3)) for p in samples)
    info = {
        "fit_box_pixels_xyxy": list(box),
        "sampling": "deterministic nearest-neighbor grid, longest side <= 720 pixels",
        "sample_grid_size": list(grid.size),
        "sample_count": count,
        "excluded_samples": len(pixels) - count,
        "sample_filter": "BT.601 luma in [8,247], all RGB channels below 250",
        "mean_rgb": mean,
        "covariance_rgb": cov,
        "eigenvalues": eigenvalues,
        "eigenvectors_columns": vectors,
        "eigen_reconstruction_max_abs_error": residual,
        "target_std_in_8bit_units": target_std,
        "noise_floor_std": noise_floor,
        "max_gain": max_gain,
        "gains": gains,
        "regularized_axes": sum(value < noise_floor ** 2 or target_std / math.sqrt(max(value, 1e-30)) > max_gain for value in eigenvalues),
        "matrix_rgb": matrix,
        "offset_rgb": offset,
        "display_mean_rgb": [127.5, 127.5, 127.5],
        "fit_sample_any_channel_clipped_fraction": clip_count / count,
        "application": "global affine RGB transform, then clipping to [0,255] and 8-bit rounding",
    }
    return img.convert("RGB", pillow_matrix), info


def font(size, heading=False):
    path = "/System/Library/Fonts/Supplemental/Georgia.ttf" if heading else "/System/Library/Fonts/Helvetica.ttc"
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default(size=size)


def save_new(img, path, **kwargs):
    if path.exists():
        raise FileExistsError(f"Output already exists; choose another --output directory: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, **kwargs)
    # Confirm that the exported file decodes at the intended size and mode.
    with Image.open(path) as decoded:
        decoded.load()
        if decoded.size != img.size or decoded.mode != img.mode:
            raise ValueError(f"Image export changed dimensions or mode: {path}")


def write_new(path, content):
    with path.open("x", encoding="utf-8") as file:
        file.write(content)


def sha256(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def comparison(original, enhanced, source, subtitle, path, box=None):
    left = original.crop(box) if box else original
    right = enhanced.crop(box) if box else enhanced
    factor = min(1.0, 1350 / left.width, 1300 / left.height)
    size = tuple(max(1, round(s * factor)) for s in left.size)
    left = left.resize(size, Image.Resampling.LANCZOS)
    right = right.resize(size, Image.Resampling.LANCZOS)
    width, height = size
    board = Image.new("RGB", (2 * width + 84, height + 220), PAPER)
    draw = ImageDraw.Draw(board)
    draw.text((28, 22), source["title"], font=font(27, True), fill=INK)
    draw.text((28, 68), subtitle, font=font(19), fill=MUTED)
    draw.text((28, 110), "ORIGINAL", font=font(17), fill=INK)
    draw.text((width + 56, 110), "DECORRELATION STRETCH / FALSE COLOR", font=font(17), fill=INK)
    board.paste(left, (28, 141))
    board.paste(right, (width + 56, 141))
    credit = f"Photo: {source['author']} | {source['license']}"
    draw.text((28, height + 159), credit, font=font(14), fill=MUTED)
    draw.text((28, height + 187), "Color differences are enhanced; interpretation requires independent evidence. Full source and license links: README.md", font=font(13), fill=MUTED)
    save_new(board, path, quality=94, subsampling=0, icc_profile=SRGB.tobytes())


def overview(rows, path):
    cell_w, cell_h = 680, 420
    top, row_h = 138, 508
    board = Image.new("RGB", (2 * cell_w + 84, top + row_h * len(rows) + 52), PAPER)
    draw = ImageDraw.Draw(board)
    draw.text((28, 25), "Reading subtle color", font=font(37, True), fill=INK)
    draw.text((28, 79), f"{len(rows)} real photographs | reproducible RGB decorrelation stretch | full-resolution exports included", font=font(18), fill=MUTED)
    draw.text((28, 112), "ORIGINAL", font=font(16), fill=INK)
    draw.text((cell_w + 56, 112), "ENHANCED / FALSE COLOR", font=font(16), fill=INK)
    for index, (source, left, right) in enumerate(rows):
        y = top + index * row_h
        draw.line((28, y, board.width - 28, y), fill=(203, 206, 197))
        draw.text((28, y + 12), source["title"], font=font(22, True), fill=INK)
        for x, panel in ((28, left), (cell_w + 56, right)):
            thumb = ImageOps.contain(panel, (cell_w, cell_h), Image.Resampling.LANCZOS)
            board.paste(thumb, (x + (cell_w - thumb.width) // 2, y + 51 + (cell_h - thumb.height) // 2))
        draw.text((28, y + 478), f"{left.width} x {left.height} pixels | Photo: {source['author']}", font=font(13), fill=MUTED)
    draw.text((28, board.height - 35), "No new historical marking is established by these images. Source credits, licenses, selected areas and exact transforms accompany the files.", font=font(14), fill=MUTED)
    save_new(board, path, quality=94, subsampling=0, icc_profile=SRGB.tobytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=BASE / "outputs")
    parser.add_argument("--study", action="append", help="Study id from public/sources.json; repeat to select several")
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    sources = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))
    if args.study:
        unknown = set(args.study) - {source["id"] for source in sources}
        if unknown:
            parser.error("Unknown study id(s): " + ", ".join(sorted(unknown)))
        sources = [source for source in sources if source["id"] in args.study]
    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "algorithm": "independent regularized RGB covariance decorrelation stretch; not the DStretch plugin or its proprietary presets",
        "python": platform.python_version(),
        "pillow": PIL.__version__,
        "script_sha256": sha256(Path(__file__)),
        "source_manifest_sha256": sha256(DATA / "sources.json"),
        "sources": [],
    }
    rows, artifacts = [], []
    for source in sources:
        source_path = DATA / source["original_file"]
        with Image.open(source_path) as opened:
            opened.load()
            encoded_dimensions = list(opened.size)
            img = ImageOps.exif_transpose(opened).convert("RGB")
            if list(img.size) != source["expected_dimensions"]:
                raise ValueError(f"Unexpected displayed source dimensions: {source_path}: {img.size}")
            if opened.info.get("icc_profile"):
                input_profile = ImageCms.ImageCmsProfile(io.BytesIO(opened.info["icc_profile"]))
                img = ImageCms.profileToProfile(img, input_profile, SRGB, outputMode="RGB")
                profile_note = "embedded ICC profile converted to sRGB before fitting"
            else:
                profile_note = "no embedded ICC profile; decoded RGB treated as sRGB"
        focus_box = tuple(round(f * (img.width if i % 2 == 0 else img.height)) for i, f in enumerate(source["focus_box_fraction"]))
        global_img, global_fit = fit_transform(img, (0, 0, img.width, img.height), target_std=42.0)
        focused_img, focused_fit = fit_transform(img, focus_box, target_std=34.0)
        record = {**source, "source_sha256": sha256(source_path), "encoded_dimensions_before_exif_orientation": encoded_dimensions, "working_dimensions": list(img.size), "color_profile_handling": profile_note, "variants": {}}
        for variant, result, transform in (("rgb", global_img, global_fit), ("focused", focused_img, focused_fit)):
            destination = out / "enhanced" / f"{source['id']}-{variant}.png"
            metadata = PngImagePlugin.PngInfo()
            metadata.add_text("Title", source["title"])
            metadata.add_text("Author", source["author"])
            metadata.add_text("Source", source["source_page"])
            metadata.add_text("Copyright", source["license"] + " " + source["license_url"])
            metadata.add_text("Description", "Modified by regularized RGB decorrelation stretch. False colors; not evidence of newly discovered markings. Native pixel dimensions retained.")
            metadata.add_text("Processing", json.dumps(transform))
            save_new(result, destination, pnginfo=metadata, icc_profile=SRGB.tobytes(), compress_level=6)
            artifacts.append(destination)
            record["variants"][variant] = {"file": str(destination.relative_to(out)), "sha256": sha256(destination), **transform}
        full_comparison = out / "comparisons" / f"{source['id']}.jpg"
        detail_comparison = out / "comparisons" / f"{source['id']}-detail.jpg"
        comparison(img, global_img, source, f"Whole-image fit | original and result both {img.width} x {img.height} pixels", full_comparison)
        comparison(img, focused_img, source, f"Selected surface crop | fit and crop rectangle {focus_box}", detail_comparison, focus_box)
        artifacts.extend((full_comparison, detail_comparison))
        rows.append((source, img, global_img))
        report["sources"].append(record)
        print(f"{source['id']}: {img.width}x{img.height}, 2 native-size PNGs + 2 comparisons; fit clipping RGB {global_fit['fit_sample_any_channel_clipped_fraction']:.2%}, focused {focused_fit['fit_sample_any_channel_clipped_fraction']:.2%}", flush=True)
    overview_path = out / "overview.jpg"
    overview(rows, overview_path)
    artifacts.append(overview_path)
    report["validation"] = f"All {len(sources)} source dimensions match their manifests; all {2 * len(sources)} PNGs and {2 * len(sources) + 1} comparison/overview JPEGs re-opened successfully at intended sizes. Covariance eigendecompositions passed numerical reconstruction checks."
    report_path = out / "processing.json"
    write_new(report_path, json.dumps(report, indent=2, ensure_ascii=True) + "\n")
    bundle = out / "decorrelation-study.zip"
    with ZipFile(bundle, "x", compression=ZIP_STORED) as archive:
        for artifact in artifacts + [report_path]:
            archive.write(artifact, str(artifact.relative_to(out)))
        for source in sources:
            archive.write(DATA / source["original_file"], "public/" + source["original_file"])
        archive.writestr("public/sources.json", json.dumps(sources, indent=2) + "\n")
        for name in ("README.md", "CREDITS.md", "LICENSE", "requirements.txt", "process_images.py"):
            archive.write(BASE / name, name)
    print(f"Overview: {overview_path}", flush=True)
    print(f"Complete bundle: {bundle} ({bundle.stat().st_size / 1048576:.1f} MiB)", flush=True)
    print(report["validation"], flush=True)


if __name__ == "__main__":
    main()
