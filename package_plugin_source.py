#!/usr/bin/env python3
"""
Package the built plugins as a Stash plugin source (index.yml + ZIPs).

Mirrors the stable packaging in .github/workflows/publish.yml, but writes to a
local folder so it can be committed and served from raw.githubusercontent.com
without GitHub Pages. The repo root on main is the published source:
https://raw.githubusercontent.com/bakumetsu/Stash-Downloader/main/index.yml

Usage (after `npm run build`):
    python package_plugin_source.py . [--repo-url URL]
"""

import argparse
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent

PLUGINS = [
    {
        "id": "stash-downloader",
        "name": "Stash Downloader",
        "description": "Download images/videos with metadata extraction",
        "extra_files": ["README.md", "LICENSE"],
    },
    {
        "id": "stash-browser",
        "name": "Stash Browser",
        "description": "Browse booru sites and add content to Stash Downloader queue",
        "extra_files": ["LICENSE"],
    },
]


def git_short_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()


def build_zip(plugin_dir: Path, plugin_id: str, extra_files: list, zip_path: Path) -> None:
    """ZIP layout matches CI: dist/, scripts/, {id}.yml at the root."""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for folder in ("dist", "scripts"):
            for f in sorted((plugin_dir / folder).rglob("*")):
                if f.is_file() and "__pycache__" not in f.parts:
                    zf.write(f, f.relative_to(plugin_dir).as_posix())
        zf.write(plugin_dir / f"{plugin_id}.yml", f"{plugin_id}.yml")
        for name in extra_files:
            zf.write(ROOT / name, name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--repo-url", default="https://github.com/bakumetsu/Stash-Downloader")
    args = parser.parse_args()

    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    sha = git_short_sha()
    # Go's time.Parse in Stash requires the time component
    date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    entries = []
    for p in PLUGINS:
        plugin_dir = ROOT / "plugins" / p["id"]
        if not (plugin_dir / "dist").is_dir():
            raise SystemExit(f"{plugin_dir / 'dist'} missing - run `npm run build` first")

        version = json.loads((plugin_dir / "package.json").read_text(encoding="utf-8"))["version"]
        zip_name = f"{p['id']}.zip"
        zip_path = out / zip_name
        build_zip(plugin_dir, p["id"], p["extra_files"], zip_path)
        sha256 = hashlib.sha256(zip_path.read_bytes()).hexdigest()

        entries.append(
            f"- id: {p['id']}\n"
            f"  name: {p['name']}\n"
            f"  version: {version}-fork.{sha}\n"
            f"  date: {date}\n"
            f"  path: {zip_name}\n"
            f"  sha256: {sha256}\n"
            f"  description: \"{p['description']}\"\n"
            f"  url: {args.repo_url}\n"
        )
        print(f"Packaged {zip_name} ({version}-fork.{sha})")

    # Flat YAML array at root - required by Stash's plugin source format
    (out / "index.yml").write_text("".join(entries), encoding="utf-8", newline="\n")
    print(f"Wrote {out / 'index.yml'}")


if __name__ == "__main__":
    main()
