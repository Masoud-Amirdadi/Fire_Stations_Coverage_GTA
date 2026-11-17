# Service & Space — GTA Learning Lab

Run `python -m http.server 8000 --bind 127.0.0.1` from this project and open http://localhost:8000.

The overview leads to `explore.html`: Vaughan (observe), Toronto (model), Mississauga (transfer). The city models remain available at their existing paths. Local notes use browser storage and can be downloaded. External basemap tiles and the city Leaflet CDN dependency require internet access.

Vaughan integrates the distributed atlas at commit 50a7ffd357fecc03fd9efdbf5adefc7778188192 from https://github.com/Masoud-Amirdadi/vaughan-station-atlas. Its license, bundled vendor licenses, generalized data and About data panel are retained. No source incident CSVs are imported.

The shared engine retains a greedy coverage heuristic, with corrected ground distance and explicit missing-data handling. Its scenarios are illustrative. Buffer outputs are not network isochrones or observed response-time predictions. The homepage speed/time experiment is hypothetical and is not an input to the city algorithms. Cross-city comparisons demonstrate method transfer, not performance rankings.

Original entry pages are backed up in `_before_learning_lab`. New interface files: learning.css, learning.js, explore.html, case.css and case-guide.js.


Reliability update: both cities now use the same worker engine. Coverage membership is tested against the exact displayed 64-step ground-distance buffer polygons, clipped to the city. Territory cells use spherical ground distance, are clipped to the city, and remain separate to avoid costly unions. Hexagon side length is honored. Grids are bounded at 15,000 estimated cells; calculations can be cancelled and have a 60-second timeout.

Raster brightness is explicitly illustrative, not incident intensity. Samples use fixed zoom 14, nine points per station (center plus eight ground-distance offsets at 600 m), opaque pixels only, and station min/max normalization. Any missing/transparent sample or uniform raster stops the weighted run without producing a result. No calibrated numeric raster or color scale was supplied, so incident shading is unavailable rather than inferred from image colors.
