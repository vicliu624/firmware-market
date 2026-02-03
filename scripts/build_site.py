import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITE_DIR = os.path.join(ROOT, "site")
DIST_DIR = os.path.join(ROOT, "dist")
INDEX_PATH = os.path.join(ROOT, "index.json")
DOCS_DIR = os.path.join(ROOT, "docs")


def ensure_index():
    if not os.path.exists(INDEX_PATH):
        raise FileNotFoundError("index.json not found. Run scripts/build_index.py first.")


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
    ensure_index()
    clean_dir(DIST_DIR)

    copy_tree(SITE_DIR, DIST_DIR)
    shutil.copy2(INDEX_PATH, os.path.join(DIST_DIR, "index.json"))
    copy_tree(DOCS_DIR, os.path.join(DIST_DIR, "docs"))

    print(f"Built site in {DIST_DIR}")


if __name__ == "__main__":
    main()
