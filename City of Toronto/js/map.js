
const DATA_ROOT = './data/';
const FILE_BOUNDARY = 'City_of_Toronto_Boundary_Areas.geojson';
const FILE_STATIONS = 'Paramedic_Stations.geojson';

/* ================= Map & Base ================= */
const map = L.map('map', { preferCanvas: true }).setView([43.653, -79.383], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
}).addTo(map);

/* ================= Paramedic incident raster ================= */
const ebk = L.imageOverlay('./data/paramedic-raster.png', [[43.46777336462709,-79.75620376298339],[43.97504658024278,-79.02843856792042]], {opacity:0.8, interactive:false}).addTo(map);

/* ================= Layers ================= */
const boundary = L.geoJSON(null, { style: { color: '#000', weight: 2, fill: false, fillOpacity: 0 } }).addTo(map);
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

const $bufMetric = document.getElementById('buf-metric');
const $radius = document.getElementById('radius');
const $grid = document.getElementById('grid');
const $bufLambda = document.getElementById('buf-lambda');
const $run = document.getElementById('run');

const $vorMetric = document.getElementById('vor-metric');
const $vorCell = document.getElementById('vor-cell');
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


        dot.bindPopup(() => {const el=document.createElement('div');el.textContent=`${p.NAME || 'Paramedic station'} · ${p.ADDRESS || ''}`;return el;});
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

        const stationData = await loadJSON(`${DATA_ROOT}${FILE_STATIONS}`, 'Stations');
        stations.clearLayers();
        const flat = flattenStationsFC(stationData);
        addStationsToMap(flat);

        $status.textContent = `Loaded ${flat.features.length} paramedic stations and posts. Ready.`;
    } catch (err) {
        console.error(err);
        $status.textContent = 'Could not load one or more GeoJSON files. Check file paths and run a local server.';

    }
})();
