"""Validate static assets at the GitHub Pages project path; no dependencies."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://masoud-amirdadi.github.io/Fire_Stations_Coverage_GTA/"
PREFIX = urlsplit(BASE).path
errors = []

class PageLinks(HTMLParser):
    def __init__(self, page):
        super().__init__()
        self.page = page
        self.url = urljoin(BASE, page.as_posix())

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name not in ("src", "href") or not value or value.startswith("#"):
                continue
            resolved = urlsplit(urljoin(self.url, value))
            if resolved.netloc != urlsplit(BASE).netloc:
                continue
            if not resolved.path.startswith(PREFIX):
                errors.append(f"{self.page}: URL escapes project prefix: {value}")
                continue
            path = ROOT / unquote(resolved.path[len(PREFIX):])
            if path.is_dir():
                path = path / "index.html"
            if not path.is_file():
                errors.append(f"{self.page}: missing asset {value}")

pages = [Path(p) for p in ["index.html", "explore.html", "Vaughan/index.html",
    "City of Toronto/index.html", "City of Mississauga/index.html"]]
for page in pages:
    PageLinks(page).feed((ROOT/page).read_text(encoding="utf-8-sig"))
for asset in [".nojekyll", "Vaughan/LICENSE", "Vaughan/SOURCE-README.md",
    "City of Toronto/data/Fire_Stations.geojson",
    "City of Toronto/data/City_of_Toronto_Boundary_Areas.geojson",
    "City of Toronto/data/Service_Areas.geojson",
    "City of Mississauga/data/Fire_Stations.geojson",
    "City of Mississauga/data/City Of Mississauag_Boundary.geojson"]:
    if not (ROOT/asset).is_file(): errors.append(f"Missing {asset}")
if not list((ROOT/"Vaughan/vendor").glob("*LICENSE*")):
    errors.append("Missing vendor licenses")
if errors:
    raise SystemExit("\n".join(errors))
print(f"PASS: {len(pages)} entry pages, relative assets, project prefix, city data and licenses")
