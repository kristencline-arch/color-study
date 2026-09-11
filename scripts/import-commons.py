#!/usr/bin/env python3
"""Import explicitly selected Commons originals with item-specific rights evidence.

No discovery or automatic selection happens here. Review data/commons-selection.json
and the saved metadata before importing. Requires Pillow, as does the museum importer.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import html
from io import BytesIO
import importlib.util
import json
from pathlib import Path
import re
import time
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
module = importlib.util.spec_from_file_location("museum_import", ROOT / "scripts/import-museums.py")
museum = importlib.util.module_from_spec(module)
module.loader.exec_module(museum)
ALLOWED = {"CC0", "Public domain", "CC BY 2.0", "CC BY 2.5", "CC BY 3.0", "CC BY 4.0", "CC BY-SA 2.0", "CC BY-SA 2.5", "CC BY-SA 3.0", "CC BY-SA 4.0"}


def plain(value):
    return " ".join(html.unescape(re.sub(r"<[^>]*>", " ", value)).split())


def fetch(url):
    for attempt in range(4):
        try:
            time.sleep(1.1)
            request = Request(url, headers={"User-Agent": "Mozilla/5.0 ColorStudy/1.0 (https://github.com/kristencline-arch/color-study)"})
            with urlopen(request, timeout=60) as response:
                data = response.read(museum.MAX_BYTES + 1)
            if len(data) > museum.MAX_BYTES:
                raise ValueError("Original exceeds the image size limit")
            return data
        except Exception as error:
            if attempt == 3:
                raise
            retry_after = getattr(error, "headers", {}).get("Retry-After", "")
            time.sleep(min(45, int(retry_after) if retry_after.isdigit() else 5 * (attempt + 1)))


def validate_photo_license(spec, page):
    """Keep the photographer's grant when artwork metadata says public domain."""
    name = spec["photo_license"]
    assert spec["expected_license"] in {"Public domain", "CC0"}
    assert name in ALLOWED and name.startswith("CC BY"), "Invalid photograph license"
    assert page["title"] == spec["file_title"], "Wrong license evidence page"
    revision = page["revisions"][0]
    assert isinstance(revision["revid"], int), "Missing license revision"
    template = name.lower().replace(" ", "-")
    # Require the photographer's explicit self-license in the saved page,
    # not a mention of a license elsewhere or the artwork's PD-Art template.
    pattern = r"\{\{self\b(?:(?!\}\}).)*?\|\s*" + re.escape(template) + r"\s*(?:\||\}\})"
    assert re.search(pattern, revision["slots"]["main"]["*"], re.I | re.S), "Photograph license changed; review required"
    suffix = template.removeprefix("cc-").rsplit("-", 1)
    return name, "https://creativecommons.org/licenses/" + "/".join(suffix) + "/", revision["revid"]


def photo_license_evidence(spec, refresh):
    snapshot = ROOT / "data/commons-records" / (spec["id"] + "-license.json")
    if refresh or not snapshot.exists():
        api = "https://commons.wikimedia.org/w/api.php?" + urlencode(dict(action="query", format="json", prop="revisions", rvprop="ids|timestamp|content", rvslots="main", titles=spec["file_title"]))
        pages = list(json.loads(fetch(api))["query"]["pages"].values())
        assert len(pages) == 1
        validate_photo_license(spec, pages[0])
        museum.write_json(snapshot, pages[0])
    name, url, revision = validate_photo_license(spec, json.loads(snapshot.read_text()))
    return {"name": name, "url": url, "snapshot": str(snapshot.relative_to(ROOT)),
            "revision_id": revision, "evidence_url": f"https://commons.wikimedia.org/w/index.php?oldid={revision}"}


def main():
    if not __debug__:
        raise RuntimeError("Run without Python -O: import validation must remain enabled.")
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--refresh", action="store_true")
    mode.add_argument("--only-new", action="store_true", help="Import only newly selected photographs")
    args = parser.parse_args()
    sources_path = ROOT / "public/sources.json"
    existing = json.loads(sources_path.read_text())
    prior = {item["id"]: item for item in existing}
    selection = json.loads((ROOT / "data/commons-selection.json").read_text())
    if args.only_new:
        selection = [spec for spec in selection if spec["id"] not in prior]
    imported = []
    for spec in selection:
        key = spec["id"]
        assert re.fullmatch(r"commons-[a-z0-9]+(?:-[a-z0-9]+)*", key)
        api = "https://commons.wikimedia.org/w/api.php?" + urlencode(dict(action="query", format="json", prop="imageinfo", iiprop="url|size|extmetadata", titles=spec["file_title"]))
        snapshot = ROOT / "data/commons-records" / (key + ".json")
        if args.refresh or not snapshot.exists():
            response = json.loads(fetch(api))
            pages = list(response["query"]["pages"].values())
            assert len(pages) == 1 and "imageinfo" in pages[0]
            museum.write_json(snapshot, pages[0])
        page = json.loads(snapshot.read_text())
        assert page["title"] == spec["file_title"], key
        info = page["imageinfo"][0]
        metadata = info["extmetadata"]
        license_name = metadata["LicenseShortName"]["value"]
        assert license_name in ALLOWED and license_name == spec["expected_license"], f"Review changed image rights: {key}"
        license_url = metadata.get("LicenseUrl", {}).get("value")
        if license_name == "Public domain":
            license_url = "https://creativecommons.org/publicdomain/mark/1.0/"
        elif license_name == "CC0":
            license_url = "https://creativecommons.org/publicdomain/zero/1.0/"
        metadata_license_name = license_name
        photograph_evidence = None
        if spec.get("photo_license"):
            photograph_evidence = photo_license_evidence(spec, args.refresh)
            license_name, license_url = photograph_evidence["name"], photograph_evidence["url"]
        assert license_url and license_url.startswith("https://creativecommons.org/")
        original_url = info["url"].split("?", 1)[0]
        if key in prior:
            assert prior[key]["download_url"] == original_url, f"Review changed original URL: {key}"
        path = ROOT / "public/originals" / (key + ".jpg")
        if not path.exists():
            content = fetch(original_url)
            with ImageOpen(content) as decoded:
                assert decoded.format == "JPEG", key
                decoded.verify()
            path.write_bytes(content)
        content = path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        if key in prior:
            assert digest == prior[key]["sha256"], f"Original bytes changed: {key}"
        with museum.Image.open(path) as decoded:
            encoded_dimensions = list(decoded.size)
            width, height = museum.ImageOps.exif_transpose(decoded).size
        assert [width, height] == [info["width"], info["height"]], key
        assert max(width, height) >= 1600 and max(width, height) <= 16000 and width * height <= 64000000, key
        author = spec.get("photo_credit") or plain(metadata.get("Artist", {}).get("value", ""))
        assert author, f"Missing image credit: {key}"
        source = {**{k: v for k, v in spec.items() if k not in ["file_title", "expected_license", "photo_credit"]},
                  "title": spec["short_title"], "source_title": spec["file_title"][5:],
                  "study_type": "textile" if spec["category"] == "Textiles" else "paint",
                  "provider": spec.get("provider", "Wikimedia Commons"), "author": author,
                  "source_page": "https://commons.wikimedia.org/wiki/" + quote(spec["file_title"].replace(" ", "_"), safe=":()_-.,'"),
                  "source_api": api, "download_url": original_url,
                  "license": license_name, "license_url": license_url, "metadata_license": "CC0",
                  "rights_checked_at": datetime.now(timezone.utc).date().isoformat(),
                  "rights_evidence": {"field": "LicenseShortName", "value": metadata_license_name, "snapshot": str(snapshot.relative_to(ROOT))},
                  "photographed": spec.get("photographed", plain(metadata.get("DateTimeOriginal", {}).get("value", "")) if re.match(r"^\d{4}-\d{2}", metadata.get("DateTimeOriginal", {}).get("value", "")) else "Not established; see source file metadata"),
                  "original_file": f"originals/{key}.jpg", "expected_dimensions": [width, height],
                  "encoded_dimensions": encoded_dimensions,
                  "size_bytes": len(content), "sha256": digest,
                  "focus_box_fraction": spec.get("focus_box_fraction", [0.15, 0.15, 0.85, 0.85])}
        if photograph_evidence:
            source["rights_evidence"]["photograph_license"] = photograph_evidence
        museum.thumbnail(source)
        imported.append(source)
        print(f"{key}: {width} × {height} | {license_name}", flush=True)
    imported_ids = {item["id"] for item in imported}
    # Replace the manifest only after every selected file passes validation.
    result = [item for item in existing if item["id"] not in imported_ids] + imported
    hashes = [item["sha256"] for item in result]
    assert len(hashes) == len(set(hashes)), "Duplicate original bytes in the collection"
    museum.write_json(sources_path, result)
    print(f"Saved {len(result)} catalog photographs, including {len(imported)} new field/archive views.")


def ImageOpen(content):
    return museum.Image.open(BytesIO(content))


if __name__ == "__main__":
    main()
