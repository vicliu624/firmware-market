import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PACKAGES_DIR = os.path.join(ROOT, "packages")
SCHEMA_PATH = os.path.join(ROOT, "schemas", "manifest.schema.json")
ALLOWED_PATH = os.path.join(ROOT, "schemas", "allowed.json")


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_schema():
    if not os.path.exists(SCHEMA_PATH):
        raise FileNotFoundError(f"Missing schema at {SCHEMA_PATH}")
    return load_json(SCHEMA_PATH)


def load_allowed():
    if not os.path.exists(ALLOWED_PATH):
        return None
    return load_json(ALLOWED_PATH)


def validate_schema(manifest, schema):
    try:
        import jsonschema  # type: ignore
    except Exception:
        raise RuntimeError(
            "jsonschema is required. Install with: python -m pip install jsonschema"
        )
    jsonschema.validate(instance=manifest, schema=schema)


def validate_allowed(manifest, allowed):
    if not allowed:
        return
    errors = []
    def check_list(key, allowed_key):
        values = manifest.get(key) or []
        allowed_values = set(allowed.get(allowed_key, []))
        for value in values:
            if value not in allowed_values:
                errors.append(f"{key}: '{value}' is not in allowed list")

    def check_boards():
        boards = manifest.get("boards") or []
        allowed_brands = set(allowed.get("brands", []))
        allowed_models = set(allowed.get("models", []))
        for board in boards:
            brand = board.get("brand")
            model = board.get("model")
            if allowed_brands and brand not in allowed_brands:
                errors.append(f"boards.brand: '{brand}' is not in allowed list")
            if allowed_models and model not in allowed_models:
                errors.append(f"boards.model: '{model}' is not in allowed list")

    check_boards()
    check_list("mcu", "mcus")
    check_list("regions", "regions")
    check_list("features", "features")
    check_list("scenes", "scenes")

    if errors:
        raise ValueError("; ".join(errors))


def iter_manifests():
    if not os.path.isdir(PACKAGES_DIR):
        return
    for name in os.listdir(PACKAGES_DIR):
        if name.startswith("_"):
            continue
        if not name.lower().endswith(".json"):
            continue
        yield os.path.join(PACKAGES_DIR, name)


def url_head(url, timeout):
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status


def url_range_get(url, timeout):
    req = urllib.request.Request(url)
    req.add_header("Range", "bytes=0-0")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status


def validate_urls(manifest, timeout):
    for artifact in manifest.get("artifacts", []):
        url = artifact.get("url")
        if not url:
            continue
        try:
            status = url_head(url, timeout)
            if status < 200 or status >= 400:
                raise ValueError(f"URL not reachable ({status}): {url}")
        except urllib.error.HTTPError as exc:
            if exc.code in (405, 403):
                status = url_range_get(url, timeout)
                if status < 200 or status >= 400:
                    raise ValueError(f"URL not reachable ({status}): {url}")
            else:
                raise
        except Exception as exc:
            raise ValueError(f"URL check failed for {url}: {exc}")


def sha256_file(url, timeout):
    digest = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def validate_sha(manifest, timeout):
    for artifact in manifest.get("artifacts", []):
        url = artifact.get("url")
        expected = artifact.get("sha256", "").lower()
        if not url or not expected:
            continue
        actual = sha256_file(url, timeout)
        if actual != expected:
            raise ValueError(f"SHA256 mismatch for {url}: {actual} != {expected}")


def build_index(manifests):
    entries = []
    for item in manifests:
        entry = dict(item)
        entry["source"] = item.get("source")
        entries.append(entry)
    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(entries),
        "packages": entries,
    }


def main():
    parser = argparse.ArgumentParser(description="Validate manifests and build index.json")
    parser.add_argument("--out", default=os.path.join(ROOT, "index.json"))
    parser.add_argument("--check-urls", action="store_true")
    parser.add_argument("--check-sha", action="store_true")
    parser.add_argument("--timeout", type=int, default=20)
    args = parser.parse_args()

    schema = load_schema()
    allowed = load_allowed()

    manifests = []
    seen = set()

    for path in iter_manifests():
        with open(path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        validate_schema(manifest, schema)
        validate_allowed(manifest, allowed)
        manifest["source"] = os.path.relpath(path, ROOT).replace("\\", "/")

        key = (manifest.get("id"), manifest.get("version"))
        if key in seen:
            raise ValueError(f"Duplicate package version: {key}")
        seen.add(key)

        if args.check_urls:
            validate_urls(manifest, args.timeout)
        if args.check_sha:
            validate_sha(manifest, args.timeout)

        manifests.append(manifest)

    index = build_index(manifests)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=True)
        f.write("\n")

    print(f"Wrote {args.out} with {len(manifests)} entries")


if __name__ == "__main__":
    main()
