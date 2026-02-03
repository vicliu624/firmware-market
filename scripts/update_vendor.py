import os
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

ASSETS = [
    ("https://unpkg.com/esptool-js/bundle.js", "site/vendor/esptool-js/esptool.min.js"),
    ("https://unpkg.com/dfu/dist/index.js", "site/vendor/webdfu/index.js"),
    ("https://unpkg.com/nanoevents/index.js", "site/vendor/webdfu/nanoevents.js"),
]


def download(url, dest):
    path = os.path.join(ROOT, dest)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(url) as resp, open(path, "wb") as f:
        f.write(resp.read())
    print(f"Downloaded {url} -> {dest}")


def main():
    for url, dest in ASSETS:
        download(url, dest)


if __name__ == "__main__":
    main()
