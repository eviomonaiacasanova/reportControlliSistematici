#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_HTML="$ROOT_DIR/index.html"
OUT_HTML="$ROOT_DIR/dist/index_single.html"

python3 - "$ROOT_DIR" <<'PY'
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]).resolve()
src = root / "index.html"
out = root / "dist" / "single.html"

html = src.read_text(encoding="utf-8")

def inline_css(html: str, href: str) -> str:
    path = root / href
    css = path.read_text(encoding="utf-8")
    tag = f'<link rel="stylesheet" href="{href}" />'
    repl = f'<style>\n{css}\n</style>'
    if tag not in html:
        raise SystemExit(f"Missing tag for CSS: {tag}")
    return html.replace(tag, repl, 1)

def inline_js(html: str, src_path: str) -> str:
    path = root / src_path
    js = path.read_text(encoding="utf-8")
    tag = f'<script src="{src_path}"></script>'
    repl = f'<script>\n{js}\n</script>'
    if tag not in html:
        raise SystemExit(f"Missing tag for JS: {tag}")
    return html.replace(tag, repl, 1)

html = inline_css(html, "style.css")

# Inline logo <img> src with hardcoded data URL (for standalone)
logo_inline = (root / "assets" / "logo.inline.js").read_text(encoding="utf-8")
m = re.search(r'(?:window\.)?LOGO_DATA_URL\s*=\s*"([^"]+)"', logo_inline)
if not m:
    raise SystemExit("LOGO_DATA_URL not found in assets/logo.inline.js")
data_url = m.group(1)
html = re.sub(r'<img\s+class="app-logo"\s+src="[^"]+"', f'<img class="app-logo" src="{data_url}"', html, count=1)

# Inline favicon <link> using assets/favicon.inline.js (if present)
fav_inline_path = root / "assets" / "favicon.inline.js"
if fav_inline_path.exists():
    fav_inline = fav_inline_path.read_text(encoding="utf-8")
    fm = re.search(r'(?:window\.)?FAVICON_DATA_URL\s*=\s*"([^"]+)"', fav_inline)
    if not fm:
        raise SystemExit("FAVICON_DATA_URL not found in assets/favicon.inline.js")
    fav_url = fm.group(1)
    if re.search(r'<link\s+rel="icon"[^>]*>', html):
        html = re.sub(r'<link\s+rel="icon"[^>]*>', f'<link rel="icon" href="{fav_url}" type="image/png" />', html, count=1)
    else:
        html = re.sub(r'</title>', '</title>\n  ' + f'<link rel="icon" href="{fav_url}" type="image/png" />', html, count=1)

# Inline JS in the same order as index.html
for js in [
    "libs/jspdf.umd.min.js",
    "libs/jspdf-autotable.min.js",
    "assets/logo.inline.js",
    "js/utils.js",
    "js/model.js",
    "js/image-utils.js",
    "js/pdf.js",
    "js/app.js",
]:
    html = inline_js(html, js)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"Wrote: {out}")
PY
