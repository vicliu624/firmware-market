import json
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITE_DIR = os.path.join(ROOT, "site")
DIST_DIR = os.path.join(ROOT, "dist")
DOCS_DIR = os.path.join(ROOT, "docs")
PACKAGES_DIR = os.path.join(ROOT, "packages")


def list_manifests():
    manifests = []
    if not os.path.isdir(PACKAGES_DIR):
        return manifests
    for root, _, files in os.walk(PACKAGES_DIR):
        for name in files:
            if not name.lower().endswith(".json"):
                continue
            if name.startswith("_"):
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, ROOT).replace("\\", "/")
            manifests.append(rel)
    manifests.sort()
    return manifests


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
    copy_tree(PACKAGES_DIR, os.path.join(DIST_DIR, "packages"))
    copy_tree(DOCS_DIR, os.path.join(DIST_DIR, "docs"))

    manifests = list_manifests()
    with open(os.path.join(DIST_DIR, "manifests.json"), "w", encoding="utf-8") as f:
        json.dump(manifests, f, indent=2, ensure_ascii=True)
        f.write("\n")

    print(f"Built site in {DIST_DIR}")


if __name__ == "__main__":
    main()
