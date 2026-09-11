#!/usr/bin/env python3
"""Import an explicitly curated selection, retaining licensed museum JPEG bytes.

Requires Pillow. Run from any directory; --refresh refetches museum metadata.
Museum JSON snapshots are committed so dates and rights checks are reviewable.
Existing originals must match their recorded hash; a changed source needs review.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import time
import threading
import urllib.request
from urllib.parse import urlparse

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
MAX_BYTES = 24 * 1024 * 1024
PROVIDERS = {"cma": "Cleveland Museum of Art", "met": "The Metropolitan Museum of Art", "aic": "Art Institute of Chicago"}
CHICAGO_LOCK = threading.Lock()


def fetch(url, max_bytes=MAX_BYTES):
    # Chicago asks for single-threaded requests with a pause between downloads.
    if urlparse(url).hostname in ("www.artic.edu", "api.artic.edu"):
        with CHICAGO_LOCK:
            time.sleep(1.1)
            return fetch_bytes(url, max_bytes, chicago=True)
    return fetch_bytes(url, max_bytes)


def fetch_bytes(url, max_bytes, chicago=False):
    for attempt in range(3):
        try:
            agent = "ColorStudy/1.0 (github.com/kristencline-arch/color-study)"
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0" if chicago else agent, "AIC-User-Agent": agent})
            with urllib.request.urlopen(request, timeout=90) as response:
                content = response.read(max_bytes + 1)
            if len(content) > max_bytes:
                raise ValueError(f"Source exceeds the {max_bytes}-byte download limit: {url}")
            return content
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def source_record(spec, refresh):
    provider, object_id = spec["provider"], spec["object_id"]
    key = f"{provider}-{object_id}"
    path = ROOT / "data/museum-records" / f"{key}.json"
    api = {"cma": f"https://openaccess-api.clevelandart.org/api/artworks/{object_id}", "met": f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{object_id}", "aic": f"https://api.artic.edu/api/v1/artworks/{object_id}"}[provider]
    if refresh or not path.exists():
        raw = json.loads(fetch(api))
        write_json(path, raw.get("data", raw))
    record = json.loads(path.read_text())
    base = dict(id=key, title=record["title"], short_title=spec["short_title"],
                study_type="textile" if spec["category"] == "Textiles" else "paint",
                category=spec["category"], region=spec["region"], provider=PROVIDERS[provider],
                source_title=record["title"], source_api=api, author=PROVIDERS[provider],
                license="CC0 / Public domain", license_url=CC0,
                metadata_license="CC0", rights_checked_at=datetime.now(timezone.utc).date().isoformat(),
                museum_object_id=str(object_id), photographed="Not recorded by the museum API",
                original_file=f"originals/{key}.jpg", thumbnail_file=f"thumbnails/{key}.jpg",
                focus_box_fraction=spec.get("focus_box_fraction", [0.15, 0.15, 0.85, 0.85]),
                notes="Study surviving dyes and painted detail alongside the original photograph. Color separation also amplifies stains, lighting and damage; the enhanced palette is not a reconstruction.")
    if provider == "cma":
        assert record["share_license_status"] == "CC0", f"Image rights not open: {key}"
        photo, master = record["images"]["print"], record["images"].get("full")
        base.update(material=record["technique"], culture="; ".join(record.get("culture") or []),
                    location="; ".join(record.get("culture") or []) or "Not recorded",
                    object_date=record["creation_date"], year_start=record["creation_date_earliest"], year_end=record["creation_date_latest"],
                    source_page=record["url"], accession_number=record["accession_number"],
                    credit_line=record.get("creditline") or "", download_url=photo["url"],
                    rights_evidence={"field": "share_license_status", "value": "CC0"})
        if master:
            base.update(master_url=master["url"], master_dimensions=[int(master["width"]), int(master["height"])], master_size_bytes=int(master["filesize"]) if master.get("filesize") else None, master_format="TIFF")
    elif provider == "met":
        assert record["isPublicDomain"] is True and record["primaryImage"], f"Image rights not open: {key}"
        place = ", ".join(dict.fromkeys(record.get(k) for k in ["country", "region", "subregion", "city"] if record.get(k)))
        base.update(material=record["medium"], culture=record.get("culture") or record.get("period") or "Not recorded",
                    location=place or "Findspot not recorded in the API; see museum record",
                    object_date=record["objectDate"] or "Not recorded", year_start=record["objectBeginDate"], year_end=record["objectEndDate"],
                    source_page=record["objectURL"], accession_number=record["accessionNumber"],
                    credit_line=record.get("creditLine") or "", download_url=record["primaryImage"],
                    rights_evidence={"field": "isPublicDomain", "value": True})
    else:
        assert record["is_public_domain"] is True and record["image_id"], f"Image rights not open: {key}"
        iiif = f"https://www.artic.edu/iiif/2/{record['image_id']}"
        info_path = ROOT / "data/museum-records" / f"{key}-image.json"
        if refresh or not info_path.exists():
            write_json(info_path, json.loads(fetch(iiif + "/info.json")))
        info = json.loads(info_path.read_text())
        # The museum's IIIF JPEG at native dimensions, without upscaling.
        base.update(material=record["medium_display"], culture=record.get("artist_display") or "Not recorded",
                    location=record.get("place_of_origin") or "Not recorded", object_date=record["date_display"],
                    year_start=record["date_start"], year_end=record["date_end"],
                    source_page=f"https://www.artic.edu/artworks/{object_id}", accession_number=record["main_reference_number"],
                    credit_line=record.get("credit_line") or "", download_url=iiif + f"/full/{info['width']},/0/default.jpg",
                    rights_evidence={"field": "is_public_domain", "value": True}, image_service=iiif,
                    museum_image_dimensions=[info["width"], info["height"]])
    if spec.get("notes"):
        base["notes"] = spec["notes"]
    return base


def thumbnail(source):
    path = ROOT / "public" / source["original_file"]
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        if opened.info.get("icc_profile"):
            image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(BytesIO(opened.info["icc_profile"])), srgb, outputMode="RGB")
    image.thumbnail((720, 720), Image.Resampling.LANCZOS)
    target = ROOT / "public/thumbnails" / f"{source['id']}.jpg"
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, quality=86, optimize=True, icc_profile=srgb.tobytes())
    source["thumbnail_file"] = f"thumbnails/{source['id']}.jpg"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Refetch museum records and recheck image rights")
    args = parser.parse_args()
    sources_path = ROOT / "public/sources.json"
    existing = json.loads(sources_path.read_text())
    by_id = {item["id"]: item for item in existing}
    selection = json.loads((ROOT / "data/museum-selection.json").read_text())

    def ingest(spec):
        source = source_record(spec, args.refresh)
        prior = by_id.get(source["id"])
        if prior and prior["download_url"] != source["download_url"]:
            raise ValueError(f"Museum image URL changed; review the replacement before importing {source['id']}")
        path = ROOT / "public" / source["original_file"]
        if not path.exists():
            content = fetch(source["download_url"])
            decoded = Image.open(BytesIO(content))
            assert decoded.format == "JPEG", f"Expected museum JPEG: {source['id']}"
            decoded.verify()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        content = path.read_bytes()
        source["sha256"] = hashlib.sha256(content).hexdigest()
        if prior and prior["sha256"] != source["sha256"]:
            raise ValueError(f"Original bytes changed; inspect before replacing {source['id']}")
        with Image.open(path) as photo:
            width, height = photo.size
        assert max(width, height) <= 16000 and width * height <= 64000000, f"Image exceeds lab dimensions: {source['id']}"
        assert max(width, height) >= 1600, f"Image is too small for the curated collection: {source['id']}"
        source.update(expected_dimensions=[width, height], size_bytes=len(content))
        thumbnail(source)
        print(f"{source['id']}: {width} × {height}, {len(content):,} bytes — {source['short_title']}", flush=True)
        return source

    with ThreadPoolExecutor(max_workers=3) as executor:
        tasks = [executor.submit(ingest, spec) for spec in selection]
        imported, errors = [], []
        for spec, task in zip(selection, tasks):
            try:
                imported.append(task.result())
            except Exception as error:
                errors.append(f"{spec['provider']}-{spec['object_id']}: {error}")
        if errors:
            raise RuntimeError("Import incomplete; source manifest preserved.\n" + "\n".join(errors))
    imported_ids = {item["id"] for item in imported}
    preserved = [item for item in existing if item["id"] not in imported_ids]
    for item in preserved:
        thumbnail(item)
    # Preserve original study IDs and order for existing links and lab defaults.
    result = preserved + imported
    for index, item in enumerate(imported):
        item["catalog_order"] = index
    for index, item in enumerate(preserved):
        item["catalog_order"] = len(imported) + index
    write_json(sources_path, result)
    print(f"Saved {len(result)} catalog records ({len(imported)} museum imports).")


if __name__ == "__main__":
    main()
