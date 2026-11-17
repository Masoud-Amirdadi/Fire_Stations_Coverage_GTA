# Service & Space — GTA Learning Lab

An interactive learning tool connecting GIS, transportation and operations research through fire service case studies in the Greater Toronto Area.

**Website:** https://masoud-amirdadi.github.io/Fire_Stations_Coverage_GTA/

**Developer:** [Masoud Amirdadi](https://www.linkedin.com/in/masoud-amirdadi-058742201/)

## Learning path

1. **Vaughan — Observe:** explore historical incidents, response times and estimated occupied capacity in the integrated station atlas.
2. **Toronto — Model:** experiment with distance coverage, sampled demand and station territories.
3. **Mississauga — Transfer:** repeat scenarios and consider which assumptions need local calibration.

The cream overview includes a hypothetical speed and time experiment. Guided case studies include browser-local observation notes. Both coverage maps offer presets, a distance scale, fit-city navigation, result visibility, settings import/export and GeoJSON export.

## Local preview

From this repository:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/ and keep the server running while using the app. Opening HTML files directly does not support the city GeoJSON fetches. Internet access is needed for map tiles and the existing Leaflet/Turf CDN dependencies.

## GitHub Pages

This is a static site with no build step. All page, script and data paths are relative so the site works under `/Fire_Stations_Coverage_GTA/`.

In repository **Settings → Pages**, the publishing source should be **Deploy from a branch**, **main**, **/(root)**. The existing public site already serves the root entry page. The `.nojekyll` file preserves ordinary static delivery, including underscore-prefixed raster directories.

After reviewing and committing changes, push `main` to `origin`. GitHub Pages then publishes the selected branch. Check the repository Actions/Pages deployment status before expecting the public URL to show the new revision. No custom domain or CNAME file is needed.

## Checks

```sh
python scripts/validate_site.py
node --check learning.js
node --check case-guide.js
node --check map-tools.js
git diff --check
```

The Python check validates page assets, the GitHub Pages project prefix, data-file presence and imported atlas licenses. Browser checks are still needed for interactive behavior and visual layout.

## Files

- `index.html`, `learning.css`, `learning.js`: overview and guided study UI.
- `explore.html`: case study workspace.
- `case-guide.js`, `case.css`, `map-tools.js`: shared city guidance and tools.
- `City of Toronto/`, `City of Mississauga/`: existing city models and spatial data.
- `Vaughan/`: integrated atlas distribution and its license/source notes.

Local rollback copies in `_before_learning_lab/` are ignored by Git and are not part of the release.

## Interpretation and provenance

The original city algorithms are retained. Coverage is a greedy heuristic over sampled points using a distance approximation, not routed travel time or population coverage. Raster-derived weights are illustrative proxies. Some raster tiles are absent outside their supplied extent; weighted scenarios need further validation. The models do not represent vehicle availability, dispatch or operational constraints.

Vaughan describes historical activity; Toronto and Mississauga illustrate spatial scenarios. The cases demonstrate transfer of a method, not a city performance ranking. Estimated idle capacity does not imply staffing availability.

The Vaughan distribution comes from [vaughan-station-atlas](https://github.com/Masoud-Amirdadi/vaughan-station-atlas), commit `50a7ffd357fecc03fd9efdbf5adefc7778188192`, with presentation wording refinements. Its MIT license, vendor licenses, data notes and generalized incident data are retained. Original incident CSVs and geocoding caches are not included. Vaughan Fire and Rescue Service contributed the incident data used in that atlas.

Maps use [Leaflet](https://leafletjs.com/) and © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The Vaughan atlas also uses Chart.js and a York Region municipal boundary; its About data panel describes the sources and limitations.
