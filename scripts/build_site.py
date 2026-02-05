import json
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITE_DIR = os.path.join(ROOT, "site")
DIST_DIR = os.path.join(ROOT, "dist")
DOCS_DIR = os.path.join(ROOT, "docs")
PACKAGES_DIR = os.path.join(ROOT, "packages")


def iter_manifest_paths():
    if not os.path.isdir(PACKAGES_DIR):
        return
    for root, _, files in os.walk(PACKAGES_DIR):
        for name in files:
            if not name.lower().endswith(".json"):
                continue
            if name.startswith("_"):
                continue
            yield os.path.join(root, name)


def load_manifest(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def manifest_key(manifest):
    release = manifest.get("release") or {}
    return (release.get("date", ""), manifest.get("version", ""))


def select_latest_manifests():
    latest = {}
    for path in iter_manifest_paths():
        manifest = load_manifest(path)
        manifest_id = manifest.get("id") or ""
        key = manifest_key(manifest)
        current = latest.get(manifest_id)
        if not current or key > current["key"]:
            latest[manifest_id] = {"path": path, "manifest": manifest, "key": key}
    return latest


def copy_selected_manifests(entries):
    dest_root = os.path.join(DIST_DIR, "packages")
    os.makedirs(dest_root, exist_ok=True)
    for entry in entries:
        src = entry["path"]
        rel = os.path.relpath(src, PACKAGES_DIR)
        dest = os.path.join(dest_root, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(src, dest)


def collect_flash_assets(entries):
    assets = set()
    for entry in entries:
        manifest = entry["manifest"]
        for artifact in manifest.get("artifacts", []):
            flash_url = artifact.get("flash_url") or ""
            if not flash_url:
                continue
            if flash_url.startswith("http://") or flash_url.startswith("https://"):
                continue
            assets.add(os.path.normpath(os.path.join(DIST_DIR, flash_url)))
    return assets


def prune_firmware_assets(allowed_assets):
    firmware_dir = os.path.join(DIST_DIR, "assets", "firmware")
    if not os.path.isdir(firmware_dir):
        return
    for root, _, files in os.walk(firmware_dir):
        for name in files:
            path = os.path.normpath(os.path.join(root, name))
            if path not in allowed_assets:
                os.remove(path)


def clean_dir(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
    os.makedirs(path, exist_ok=True)


def copy_tree(src, dest):
    if not os.path.isdir(src):
        return
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        target_dir = os.path.join(dest, rel) if rel != "." else dest
        os.makedirs(target_dir, exist_ok=True)
        for name in files:
            shutil.copy2(os.path.join(root, name), os.path.join(target_dir, name))


def main():
    clean_dir(DIST_DIR)

    copy_tree(SITE_DIR, DIST_DIR)
    copy_tree(DOCS_DIR, os.path.join(DIST_DIR, "docs"))

    latest = select_latest_manifests()
    entries = list(latest.values())
    copy_selected_manifests(entries)

    manifests = []
    for entry in entries:
        rel = os.path.relpath(entry["path"], ROOT).replace("\\", "/")
        manifests.append(rel)
    manifests.sort()
    with open(os.path.join(DIST_DIR, "manifests.json"), "w", encoding="utf-8") as f:
        json.dump(manifests, f, indent=2, ensure_ascii=True)
        f.write("\n")

    prune_firmware_assets(collect_flash_assets(entries))

    print(f"Built site in {DIST_DIR}")


if __name__ == "__main__":
    main()
