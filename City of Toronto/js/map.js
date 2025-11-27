
const DATA_ROOT = './data/';
const FILE_BOUNDARY = 'City_of_Toronto_Boundary_Areas.geojson';
const FILE_SERVICE = 'Service_Areas.geojson';
const FILE_STATIONS = 'Fire_Stations.geojson';

/* ================= Map & Base ================= */
const map = L.map('map', { preferCanvas: true }).setView([43.653, -79.383], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* ================= EBK raster ================= */
let EBK_TILE_Z = 14; // clamp to 10..16 on sampling
const ebk = L.tileLayer(`${DATA_ROOT}Raster_EBK/{z}/{x}/{y}.png`, {
    maxZoom: 18, opacity: 0.8, detectRetina: true
}).addTo(map);

/* ================= Layers ================= */
const boundary = L.geoJSON(null, { style: { color: '#000', weight: 2, fill: false, fillOpacity: 0 } }).addTo(map);
const serviceAreas = L.geoJSON(null, { style: { color: '#555', weight: 3, dashArray: '6,4', fill: false, fillOpacity: 0 } });
const stations = L.layerGroup().addTo(map);

const bufferStroke = '#60a5fa', bufferFill = '#bfdbfe';
const coverageUnion = L.geoJSON(null, { style: { color: bufferStroke, weight: 2, fillColor: bufferFill, fillOpacity: 0.25 } }).addTo(map);
const coverageBuffers = L.layerGroup().addTo(map);
const selectedStationsLayer = L.geoJSON(null, {
    pointToLayer: (_, latlng) => L.circleMarker(latlng, { radius: 7, weight: 2, color: '#111', fillColor: '#111', fillOpacity: 1 })
}).addTo(map);
const territories = L.geoJSON(null, {
    style: f => ({ color: '#111', weight: 1, fillOpacity: 0.25, fillColor: f.properties?.fill || '#ddd' })
}).addTo(map);
let gridLayer = L.layerGroup().addTo(map);

/* ================= UI refs ================= */
const $op = document.getElementById('op');
const $chkEbk = document.getElementById('chk-ebk');
const $chkBoundary = document.getElementById('chk-boundary');
const $chkStations = document.getElementById('chk-stations');
const $chkService = document.getElementById('chk-serviceareas');

const $bufMetric = document.getElementById('buf-metric');
const $radius = document.getElementById('radius');
const $grid = document.getElementById('grid');
const $bufLambda = document.getElementById('buf-lambda');
const $run = document.getElementById('run');

const $vorMetric = document.getElementById('vor-metric');
const $vorCell = document.getElementById('vor-cell');
const $vorEBK = document.getElementById('vor-ebk');
const $vorLambda = document.getElementById('vor-lambda');
const $runVor = document.getElementById('run-vor');

const $status = document.getElementById('status');

/* ================= UI wiring ================= */
function toggleWeights() {
    if ($bufLambda) $bufLambda.disabled = ($bufMetric.value !== 'ebkdist');
    if ($vorLambda) $vorLambda.disabled = ($vorMetric.value !== 'ebkdist');
}
$bufMetric?.addEventListener('change', toggleWeights);
$vorMetric?.addEventListener('change', toggleWeights);
toggleWeights();

$op?.addEventListener('input', e => ebk.setOpacity(parseFloat(e.target.value)));
$chkEbk?.addEventListener('change', e => { if (e.target.checked) ebk.addTo(map); else map.removeLayer(ebk); });
$chkBoundary?.addEventListener('change', e => { if (e.target.checked) boundary.addTo(map); else map.removeLayer(boundary); });
$chkStations?.addEventListener('change', e => { if (e.target.checked) stations.addTo(map); else map.removeLayer(stations); });
$chkService?.addEventListener('change', e => { if (e.target.checked) serviceAreas.addTo(map); else map.removeLayer(serviceAreas); });

/* ================= Safe loader ================= */
async function loadJSON(url, label) {
    const abs = new URL(url, location.href).href;
    console.log(`[LOAD] ${label}: ${abs}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${label} → HTTP ${r.status} (${abs})`);
    return r.json();
}

/* ================= Stations helpers ================= */
function flattenStationsFC(fc) {
    const out = [];
    if (!fc || !fc.features) return { type: 'FeatureCollection', features: out };
    fc.features.forEach(feat => {
        const props = feat.properties || {};
        const g = feat.geometry || {};
        if (g.type === 'Point' && Array.isArray(g.coordinates)) {
            out.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: g.coordinates } });
        } else if (g.type === 'MultiPoint' && Array.isArray(g.coordinates)) {
            g.coordinates.forEach(c => {
                if (Array.isArray(c) && c.length >= 2) {
                    out.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c } });
                }
            });
        }
    });
    return { type: 'FeatureCollection', features: out };
}

function addStationsToMap(flatFC) {
    flatFC.features.forEach(f => {
        const p = f.properties || {};
        const id = (p.STATION ?? p.ID ?? '').toString().trim() || 'ID';
        const [lng, lat] = f.geometry.coordinates;

        const dot = L.circleMarker([lat, lng], { radius: 6, weight: 2, color: '#000', fillColor: '#fff', fillOpacity: 1 });
        const label = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'station-label',    
                html: `<span class="label-text"> ${id}</span>`,
                iconSize: [0, 0],
                iconAnchor: [-14, -14]
            })
        });


        const group = L.layerGroup([dot, label]);
        group.feature = f; 
        stations.addLayer(group);
    });
}

function stationArray() {
    const arr = [];
    stations.eachLayer(group => {
        let latlng = null, props = group.feature?.properties || {};
        if (group instanceof L.LayerGroup) {
            group.eachLayer(l => { if (!latlng && typeof l.getLatLng === 'function') latlng = l.getLatLng(); });
        } else if (typeof group.getLatLng === 'function') { latlng = group.getLatLng(); }
        if (latlng) arr.push({ coord: [latlng.lng, latlng.lat], props });
    });
    return arr;
}

/* ================= Load all data ================= */
(async () => {
    try {
        const boundaryData = await loadJSON(`${DATA_ROOT}${FILE_BOUNDARY}`, 'Boundary');
        boundary.clearLayers();
        boundary.addData(boundaryData);
        try { map.fitBounds(boundary.getBounds(), { padding: [20, 20] }); } catch { }

        try {
            const serviceData = await loadJSON(`${DATA_ROOT}${FILE_SERVICE}`, 'Service Areas');
            serviceAreas.clearLayers();
            serviceAreas.addData(serviceData);
            if ($chkService?.checked) serviceAreas.addTo(map);
            console.log(`[LOAD] Service Areas features:`, (serviceData.features || []).length);
        } catch (e) {
            console.warn('[WARN] Service Areas failed (visual-only):', e);
        }

        const stationData = await loadJSON(`${DATA_ROOT}${FILE_STATIONS}`, 'Stations');
        stations.clearLayers();
        const flat = flattenStationsFC(stationData);
        addStationsToMap(flat);

        $status.textContent = `Loaded boundary, ${flat.features.length} station points${serviceAreas.getLayers().length ? ', service areas OK.' : ' (toggle to view).'} Ready.`;
    } catch (err) {
        console.error(err);
        $status.textContent = 'Could not load one or more GeoJSON files. Check file paths and run a local server.';
        alert(err);
    }
})();

/* ================= Geometry helpers ================= */
const R = 6378137;
function lonLatToMeters(lon, lat) {
    const x = R * lon * Math.PI / 180;
    const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    return [x, y];
}
function metersToLonLat(x, y) {
    const lon = (x / R) * 180 / Math.PI;
    const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
    return [lon, lat];
}
function featureCollection(features) { return { type: 'FeatureCollection', features }; }
function unionMany(fc) {
    if (!fc || !fc.features || !fc.features.length) return null;
    let u = fc.features[0];
    for (let i = 1; i < fc.features.length; i++) { try { u = turf.union(u, fc.features[i]) || u; } catch { } }
    return u;
}
function buildDemandPoints(spacingMeters) {
    const b = boundary.toGeoJSON(); if (!b || !b.features || !b.features.length) return [];
    const poly = unionMany(b); const bb = turf.bbox(poly);
    const grid = turf.pointGrid(bb, spacingMeters / 1000, { units: 'kilometers', mask: poly });
    return grid.features.map((f, i) => ({ idx: i, coord: f.geometry.coordinates, w: 1 }));
}

/* ================= EBK sampling ================= */
function lonLatToTile(lon, lat, z) {
    const n = Math.pow(2, z);
    const xtile = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const ytile = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    const xpix = Math.floor((((lon + 180) / 360 * n) - xtile) * 256);
    const ypix = Math.floor((((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - ytile) * 256);
    return { xtile, ytile, xpix, ypix };
}
function tileUrl(z, x, y) { return `${DATA_ROOT}Raster_EBK/${z}/${x}/${y}.png`; }

const tileImgCache = new Map(), tileDataCache = new Map();
function loadTileImage(z, x, y) {
    const key = `${z}/${x}/${y}`; if (tileImgCache.has(key)) return Promise.resolve(tileImgCache.get(key));
    return new Promise((resolve, reject) => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => { tileImgCache.set(key, img); resolve(img); };
        img.onerror = reject; img.src = tileUrl(z, x, y);
    });
}
async function getTileImageData(z, x, y) {
    const key = `${z}/${x}/${y}`; if (tileDataCache.has(key)) return tileDataCache.get(key);
    const img = await loadTileImage(z, x, y);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, 256, 256);
    tileDataCache.set(key, imgData); return imgData;
}
async function sampleEBKWeight(lon, lat) {
    try {
        const z = Math.max(10, Math.min(16, Math.round(map.getZoom() || EBK_TILE_Z)));
        const { xtile, ytile, xpix, ypix } = lonLatToTile(lon, lat, z);
        const imgData = await getTileImageData(z, xtile, ytile);
        const idx = (ypix * 256 + xpix) * 4;
        const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2];
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; // 0..1
    } catch { return 0; }
}
async function stationEBKMean(lon, lat, sampleR = 600) {
    const [sx, sy] = lonLatToMeters(lon, lat);
    const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
    let sum = 0, n = 0;
    for (const [dx, dy] of dirs) {
        const [lx, ly] = [sx + dx * sampleR, sy + dy * sampleR];
        const [llon, llat] = metersToLonLat(lx, ly);
        sum += await sampleEBKWeight(llon, llat); n++;
    }
    return n ? sum / n : 0;
}
async function computeStationWeights(stationsArr, sampleR = 600) {
    const raw = []; for (const s of stationsArr) raw.push(await stationEBKMean(s.coord[0], s.coord[1], sampleR));
    const minW = Math.min(...raw), maxW = Math.max(...raw), rng = Math.max(1e-6, maxW - minW);
    return raw.map(w => (w - minW) / rng);
}

/* ================= Coverage (Set Cover) ================= */
function buildDemandIndex(demandsMeters, cell) {
    const index = new Map(); const key = (ix, iy) => ix + ':' + iy;
    for (let i = 0; i < demandsMeters.length; i++) {
        const [x, y] = demandsMeters[i].m;
        const ix = Math.floor(x / cell), iy = Math.floor(y / cell);
        const k = key(ix, iy); if (!index.has(k)) index.set(k, []); index.get(k).push(i);
    }
    return { index, keyFn: (x, y) => [Math.floor(x / cell), Math.floor(y / cell)] };
}
function precomputeCoverFast(stationsArr, demands, radius_m) {
    const dm = demands.map(d => ({ ...d, m: lonLatToMeters(d.coord[0], d.coord[1]) }));
    const sm = stationsArr.map(s => ({ ...s, m: lonLatToMeters(s.coord[0], s.coord[1]) }));
    const cell = radius_m; const { index, keyFn } = buildDemandIndex(dm, cell);
    const r2 = radius_m * radius_m; const cover = new Array(stationsArr.length).fill(0).map(() => []);
    for (let s = 0; s < sm.length; s++) {
        const [sx, sy] = sm[s].m; const [ix, iy] = keyFn(sx, sy);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const bucket = index.get((ix + dx) + ':' + (iy + dy)); if (!bucket) continue;
            for (const di of bucket) { const [x, y] = dm[di].m; const ddx = sx - x, ddy = sy - y; if ((ddx * ddx + ddy * ddy) <= r2) cover[s].push(di); }
        }
    }
    return cover;
}
function radiiFromWeights(baseR, weights, lambda, minFac = 0.7, maxFac = 1.2) {
    return weights.map(w => baseR * Math.min(maxFac, Math.max(minFac, 1 - lambda * w)));
}
function precomputeCoverVar(stationsArr, demands, radii_m) {
    const dm = demands.map(d => ({ ...d, m: lonLatToMeters(d.coord[0], d.coord[1]) }));
    const sm = stationsArr.map(s => ({ ...s, m: lonLatToMeters(s.coord[0], s.coord[1]) }));
    const cell = Math.max(...radii_m); const { index, keyFn } = buildDemandIndex(dm, cell);
    const cover = new Array(stationsArr.length).fill(0).map(() => []);
    for (let s = 0; s < sm.length; s++) {
        const [sx, sy] = sm[s].m; const [ix, iy] = keyFn(sx, sy); const r2 = radii_m[s] * radii_m[s];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const bucket = index.get((ix + dx) + ':' + (iy + dy)); if (!bucket) continue;
            for (const di of bucket) { const [x, y] = dm[di].m; const ddx = sx - x, ddy = sy - y; if ((ddx * ddx + ddy * ddy) <= r2) cover[s].push(di); }
        }
    }
    return cover;
}
function greedySetCover(stationsArr, demands, cover) {
    const selected = [], covered = new Array(demands.length).fill(false); let remaining = demands.length;
    while (remaining > 0 && selected.length < stationsArr.length) {
        let bestS = -1, bestGain = 0;
        for (let s = 0; s < stationsArr.length; s++) {
            if (selected.includes(s)) continue; let gain = 0;
            for (const d of cover[s]) if (!covered[d]) gain++;
            if (gain > bestGain) { bestGain = gain; bestS = s; }
        }
        if (bestS === -1 || bestGain === 0) break;
        selected.push(bestS);
        for (const d of cover[bestS]) if (!covered[d]) { covered[d] = true; remaining--; }
    }
    return { selected, coveredCount: demands.length - remaining, total: demands.length };
}
function clearOutputs() {
    coverageUnion.clearLayers(); coverageBuffers.clearLayers(); selectedStationsLayer.clearLayers();
    territories.clearLayers(); gridLayer.clearLayers();
}
function drawSelectionVar(selectedIdx, stationsArr, radii_m) {
    coverageUnion.clearLayers(); coverageBuffers.clearLayers(); selectedStationsLayer.clearLayers();
    const buffers = [];
    for (const s of selectedIdx) {
        const buf = turf.buffer(turf.point(stationsArr[s].coord), radii_m[s], { units: 'meters' });
        buffers.push(buf);
        L.geoJSON(buf, { style: { color: bufferStroke, weight: 1, fillColor: bufferFill, fillOpacity: 0.18 } }).addTo(coverageBuffers);
    }
    let unioned = null; for (const b of buffers) unioned = unioned ? turf.union(unioned, b) : b;
    const bFC = boundary.toGeoJSON(), bUnion = unionMany(bFC);
    const clipped = (unioned && bUnion) ? (turf.intersect(unioned, bUnion) || unioned) : unioned;
    if (clipped) coverageUnion.addData(clipped);
    const selFC = featureCollection(selectedIdx.map(i => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: stationsArr[i].coord } })));
    selectedStationsLayer.addData(selFC);
    try { map.fitBounds(coverageUnion.getBounds(), { padding: [20, 20] }); } catch { }
}

/* ================= Color & Voronoi ================= */
function turboColor(t) {
    const r = Math.round(255 * Math.min(1, Math.max(0, 1.0 + 0.5 * Math.sin(5.1 * t + 1.7))));
    const g = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 0.5 * Math.sin(5.1 * t - 0.5))));
    const b = Math.round(255 * Math.min(1, Math.max(0, 0.2 + 0.8 * Math.sin(5.1 * t - 2.8))));
    return `rgb(${r},${g},${b})`;
}
function percentile(vals, p) {
    if (!vals.length) return 0;
    const v = vals.slice().sort((a, b) => a - b); const k = (v.length - 1) * p; const f = Math.floor(k), c = Math.ceil(k);
    if (f === c) return v[f]; return v[f] + (k - f) * (v[c] - v[f]);
}
function niceColor(i) { const hues = [10, 35, 55, 80, 110, 140, 170, 200, 230, 260, 290, 320]; const h = hues[i % hues.length]; return `hsl(${h},70%,70%)`; }

function buildVoronoiTerritories() {
    const bFC = boundary.toGeoJSON(); const bUnion = unionMany(bFC); if (!bUnion) return [];
    const sArr = stationArray(); if (!sArr.length) return [];
    const pts = { type: 'FeatureCollection', features: sArr.map((s, i) => ({ type: 'Feature', properties: { idx: i }, geometry: { type: 'Point', coordinates: s.coord } })) };
    const bbox = turf.bbox(bUnion); const vor = turf.voronoi(pts, { bbox }); if (!vor || !vor.features) return [];
    const out = [];
    vor.features.forEach((cell, i) => {
        if (!cell || !cell.geometry) return;
        const clipped = turf.intersect(cell, bUnion); if (!clipped) return;
        clipped.properties = { fill: niceColor(i), idx: i };
        out.push(clipped);
    });
    return out;
}
async function shadeVoronoiByEBK(cells, spacingMeters = 600) {
    const bFC = boundary.toGeoJSON(); const bUnion = unionMany(bFC);
    if (!bUnion) return cells;
    const bb = turf.bbox(bUnion);
    const grid = turf.pointGrid(bb, spacingMeters / 1000, { units: 'kilometers', mask: bUnion });
    await Promise.all(grid.features.map(async pt => {
        const [lon, lat] = pt.geometry.coordinates;
        pt.properties = { w: await sampleEBKWeight(lon, lat) };
    }));
    const means = [];
    for (const c of cells) {
        const inside = turf.pointsWithinPolygon(grid, c);
        let sum = 0, n = 0; inside.features.forEach(p => { sum += (p.properties?.w || 0); n++; });
        const mean = n ? (sum / n) : 0; c.properties.ebk_mean = mean; means.push(mean);
    }
    const p2 = percentile(means, 0.02), p98 = percentile(means, 0.98);
    const rng = Math.max(1e-6, p98 - p2);
    for (const c of cells) {
        const t = Math.min(1, Math.max(0, (c.properties.ebk_mean - p2) / rng));
        c.properties.fill = turboColor(t);
    }
    return cells;
}

/* ================= Run: Buffers ================= */
$run?.addEventListener('click', async () => {
    $run.disabled = true; $status.textContent = 'Building grid…';
    clearOutputs();

    const spacing = Math.max(50, parseInt($grid.value || '400', 10));
    const demands = buildDemandPoints(spacing);
    if (!demands.length) { $status.textContent = 'No boundary/demand found.'; $run.disabled = false; return; }

    const baseR = Math.max(1, parseInt($radius.value || '480', 10));
    const sArr = stationArray();
    if (!sArr.length) { $status.textContent = 'No stations found.'; $run.disabled = false; return; }

    const metric = $bufMetric.value;
    let cover, radii = sArr.map(() => baseR);

    if (metric === 'ebkdist') {
        $status.textContent = 'Computing EBK weights per station…';
        const w = await computeStationWeights(sArr, 600);
        const lambda = parseFloat($bufLambda.value || '0.6');
        radii = radiiFromWeights(baseR, w, lambda);
        $status.textContent = 'Precomputing coverage (variable radii)…';
        cover = precomputeCoverVar(sArr, demands, radii);
    } else {
        $status.textContent = 'Precomputing coverage…';
        cover = precomputeCoverFast(sArr, demands, baseR);
    }

    const t0 = performance.now();
    const res = greedySetCover(sArr, demands, cover);
    drawSelectionVar(res.selected, sArr, radii);
    const ms = Math.round(performance.now() - t0);
    const coveredPct = (100 * res.coveredCount / Math.max(res.total, 1)).toFixed(1);
    $status.textContent = `Set Cover: ${res.selected.length} station(s), ${coveredPct}% points covered in ${ms} ms.`;
    $run.disabled = false;
});

/* ================= Run: Voronoi ================= */
$runVor?.addEventListener('click', async () => {
    $runVor.disabled = true; $status.textContent = 'Computing territories…';
    coverageUnion.clearLayers(); coverageBuffers.clearLayers(); selectedStationsLayer.clearLayers(); territories.clearLayers(); gridLayer.clearLayers();

    const shade = $vorEBK.checked;
    const metric = $vorMetric.value;
    let cellSize = Math.max(200, parseInt($vorCell.value || '600', 10));

    if (metric === 'dist') {
        let cells = buildVoronoiTerritories();
        if (!cells.length) { $status.textContent = 'Could not build territories.'; $runVor.disabled = false; return; }
        if (shade) { $status.textContent = 'Shading by EBK…'; cells = await shadeVoronoiByEBK(cells, cellSize); }
        territories.addData({ type: 'FeatureCollection', features: cells });
        try { map.fitBounds(territories.getBounds(), { padding: [20, 20] }); } catch { }
        $status.textContent = `Built ${cells.length} territories${shade ? ' (EBK-shaded)' : ''}.`;
        $runVor.disabled = false; return;
    }

    // EBK + Distance
    const sArr = stationArray(); if (!sArr.length) { $status.textContent = 'No stations.'; $runVor.disabled = false; return; }
    $status.textContent = 'Computing EBK weights per station…';
    const w = await computeStationWeights(sArr, 600);
    const lambda = parseFloat($vorLambda.value || '0.6');

    const bFC = boundary.toGeoJSON(); const bUnion = unionMany(bFC); if (!bUnion) { $status.textContent = 'Bad boundary.'; $runVor.disabled = false; return; }
    const bb = turf.bbox(bUnion);
    if (cellSize > 300) cellSize = 300;
    $status.textContent = 'Generating assignment grid…';
    const hex = turf.hexGrid(bb, cellSize / 1000, { units: 'kilometers', mask: bUnion });

    const sm = sArr.map(s => ({ ...s, m: lonLatToMeters(s.coord[0], s.coord[1]) }));
    $status.textContent = 'Assigning cells (EBK + Distance)…';
    const colored = [];
    for (const c of hex.features) {
        const cent = turf.centroid(c).geometry.coordinates;
        const [cx, cy] = lonLatToMeters(cent[0], cent[1]);
        let best = -1, bestVal = Infinity;
        for (let j = 0; j < sm.length; j++) {
            const [sx, sy] = sm[j].m; const dx = cx - sx, dy = cy - sy;
            const d = Math.hypot(dx, dy);
            const dprime = d * (1 + lambda * w[j]); 
            if (dprime < bestVal) { bestVal = dprime; best = j; }
        }
        c.properties = { idx: best, fill: niceColor(best) };
        colored.push(c);
    }

    // dissolve per station
    $status.textContent = 'Merging cells per station…';
    const groups = {}; for (const f of colored) (groups[f.properties.idx] ||= []).push(f);
    const polys = [];
    for (const k of Object.keys(groups)) {
        let u = null; for (const f of groups[k]) u = u ? turf.union(u, f) : f;
        if (u) { u.properties = { idx: +k, fill: niceColor(+k) }; polys.push(u); }
    }

    let features = polys;
    if (shade) { $status.textContent = 'Shading by EBK…'; features = await shadeVoronoiByEBK(polys, cellSize); }

    territories.addData({ type: 'FeatureCollection', features });
    try { map.fitBounds(territories.getBounds(), { padding: [20, 20] }); } catch { }
    $status.textContent = `Built ${features.length} EBK+Distance territories.`;
    $runVor.disabled = false;
});

/* ================= Clear ================= */
document.getElementById('clear')?.addEventListener('click', () => {
    coverageUnion.clearLayers();
    coverageBuffers.clearLayers();
    selectedStationsLayer.clearLayers();
    territories.clearLayers();
    if (gridLayer && gridLayer.clearLayers) gridLayer.clearLayers();
    $status.textContent = 'Cleared.';
});
