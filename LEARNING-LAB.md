# Service & Space — GTA Learning Lab

Run `python -m http.server 8000 --bind 127.0.0.1` from this project and open http://localhost:8000.

The overview leads to `explore.html`: Vaughan (observe), Toronto (model), Mississauga (transfer). The city models remain available at their existing paths. Local notes use browser storage and can be downloaded. External basemap tiles and the city Leaflet CDN dependency require internet access.

Vaughan integrates the distributed atlas at commit 56cf0a2353b986d64fe3591b92232edee5974133 from https://github.com/Masoud-Amirdadi/vaughan-station-atlas. The embedded copy includes the Trucks workload and deployment tab. Its license, bundled vendor licenses, generalized data and About data panel are retained. Local integration changes remove the developer attribution and version browser asset URLs. No source incident CSVs are imported.

The shared engine retains a greedy coverage heuristic, with corrected ground distance and explicit missing-data handling. Buffer outputs are not network isochrones or observed response-time predictions. The homepage speed/time experiment is hypothetical and is not an input to the city algorithms. Cross-city comparisons demonstrate method transfer, not performance rankings.

Original entry pages are backed up in `_before_learning_lab`. New interface files: learning.css, learning.js, explore.html, case.css and case-guide.js.


Reliability update: both cities now use the same worker engine. Coverage membership is tested against the exact displayed 64-step ground-distance buffer polygons, clipped to the city. Territory cells use spherical ground distance, are clipped to the city, and remain separate to avoid costly unions. Hexagon side length is honored. Grids are bounded at 15,000 estimated cells; calculations can be cancelled and have a 60-second timeout.

Mississauga uses its existing raster image, sampled at fixed zoom 14 at nine points per station (centre and eight offsets at 600 m). Values are normalized across stations. Missing tiles and transparent pixels contribute zero; a uniform raster uses zero relative weights. Toronto uses numeric TIFF values as described below.

## Toronto paramedic case (November 2026 update)

Toronto uses 47 land-based paramedic stations/posts from the City of Toronto Ambulance Service Facility layer, retrieved 2026-11-17. The Marine Unit is excluded from the land-distance model. Source: https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/1 . Original facility names, addresses and object IDs are retained. Source terms: https://open.toronto.ca/open-data-license/ . These are facility locations, not available ambulance counts.

The supplied Para_Troronto.tif is an EBK surface built by the user from combined 2021–2025 paramedic incident totals per FSA. It represents estimated incident count based on area totals, not incident density or exact event locations. EPSG:3347, 329 × 291 cells, stored pixel dimensions 156.723 × 166.977 m. Valid range: 6038.5195–22034.7012. Original TIFF is preserved under City of Toronto/data.

For Leaflet, nearest-neighbour reprojection creates a 512 × 494 Web Mercator PNG plus a separate little-endian Float32 grid and metadata. The colour ramp never enters the calculation. Weights average nine numeric samples (centre and eight points 600 m away), normalize across stations to 0–1 and apply the existing model penalty. No-data/outside samples are zero. This is station-neighbourhood weighting, not demand-weighted population coverage. The original fire-station and fire-service-area data are no longer used by the Toronto case. Mississauga retains its existing fire data and image-based raster weighting.
