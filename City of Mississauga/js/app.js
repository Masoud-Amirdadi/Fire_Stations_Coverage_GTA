

/* ========= City config ========= */
const CFG = {
    center: [43.59, -79.64],
    zoom: 11,
    polyCandidates: ['City Of Mississauag_Boundary.geojson']
};
const DATA_ROOT = './data/';

/* ========= Helpers ========= */
async function loadFirstExisting(fileNames) {
    for (const name of fileNames) {
        try {
            const r = await fetch(`${DATA_ROOT}${name}`);
            if (r.ok) return r.json();
        } catch (_) { }
    }
    return null;
}

/* ========= Base map & layers ========= */
const map = L.map('map', { preferCanvas: true }).setView(CFG.center, CFG.zoom);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
}).addTo(map);

// EBK raster tiles (visual + sampling source)
let EBK_TILE_Z = 14;
const ebk = L.tileLayer(`${DATA_ROOT}Raster_EBK/{z}/{x}/{y}.png`, {
    maxZoom: 18, minNativeZoom: 10, maxNativeZoom: 16, opacity: 0.8
}).addTo(map);

// Boundary (outline, used for computations)
const boundary = L.geoJSON(null, {
    style: { color: '#000', weight: 2, fill: false, fillOpacity: 0 }
}).addTo(map);

// Stations (dot + label group)
const stations = L.layerGroup().addTo(map);

/* Outputs */
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

/* ========= Load data ========= */
(async () => {
    try {
        const polyData = await loadFirstExisting(CFG.polyCandidates);
        if (!polyData) throw new Error('City boundary failed to load.');
        boundary.addData(polyData);

        const stationData = await (await fetch(`${DATA_ROOT}Fire_Stations.geojson`)).json();
        addStationsFromFC(stationData);

        try {
            const target = polyData ? L.geoJSON(polyData) : stations;
            map.fitBounds(target.getBounds(), { padding: [20, 20] });
        } catch { }
        setStatus(`Loaded boundary and ${stationCount()} station points. Ready.`);
    } catch (err) {
        console.error('GeoJSON load error:', err);
        setStatus('Could not load city data. Reload the page to retry.');
    }
})();

/* ========= UI ========= */
const $op = document.getElementById('op');
const $chkEbk = document.getElementById('chk-ebk');
const $chkBoundary = document.getElementById('chk-boundary');
const $chkStations = document.getElementById('chk-stations');

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

function setStatus(t) { if ($status) $status.textContent = t; }

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

/* ========= Stations helpers ========= */
function addStationsFromFC(fc) {
    stations.clearLayers();
    if (!fc || !fc.features) return;
    fc.features.forEach(f => {
        const p = f.properties || {};
        // Use LANDMARKTY as in your Mississauga data (keep as-is)
        const id = (p.LANDMARKTY ?? p.STATION ?? p.ID ?? '').toString().trim() || 'ID';
        const [lng, lat] = f.geometry.coordinates;
        const dot = L.circleMarker([lat, lng], { radius: 6, weight: 2, color: '#000', fillColor: '#fff', fillOpacity: 1 });
        const label = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'station-label',
                html: `<span class="label-text">${id}</span>`,
                iconSize: [0, 0], iconAnchor: [-14, -14]
            })
        });
        stations.addLayer(L.layerGroup([dot, label]));
    });
}
function stationArray() {
    const arr = [];
    stations.eachLayer(group => {
        let latlng = null, props = {};
        if (group instanceof L.LayerGroup) {
            group.eachLayer(l => { if (!latlng && typeof l.getLatLng === 'function') latlng = l.getLatLng(); });
        } else if (typeof group.getLatLng === 'function') { latlng = group.getLatLng(); }
        if (latlng) arr.push({ coord: [latlng.lng, latlng.lat], props });
    });
    return arr;
}
function stationCount() {
    let n = 0; stations.eachLayer(() => n++); return n;
}
