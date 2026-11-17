# Service & Space — GTA Learning Lab

Run `python -m http.server 8000 --bind 127.0.0.1` from this project and open http://localhost:8000.

The overview leads to `explore.html`: Vaughan (observe), Toronto (model), Mississauga (transfer). The original city models remain available at their existing paths. Local notes use browser storage and can be downloaded. External basemap tiles and the existing city Leaflet/Turf CDN dependencies require internet access.

Vaughan integrates the distributed atlas at commit 50a7ffd357fecc03fd9efdbf5adefc7778188192 from https://github.com/Masoud-Amirdadi/vaughan-station-atlas. Its license, bundled vendor licenses, generalized data and About data panel are retained. No source incident CSVs are imported.

The original coverage algorithms are unchanged. Their greedy coverage calculation, distance approximation and raster-derived intensity proxy are illustrative. Buffer outputs are not network isochrones or observed response-time predictions. The homepage speed/time experiment is hypothetical and is not an input to the city algorithms. Cross-city comparisons demonstrate method transfer, not performance rankings.

Original entry pages are backed up in `_before_learning_lab`. New interface files: learning.css, learning.js, explore.html, case.css and case-guide.js.
