/* Shared presentation tools for the Toronto and Mississauga Leaflet models.
 * Loaded after each city's model and case-guide.js; algorithms stay city-owned.
 */
'use strict';

(() => {
    const panel = document.getElementById('panel');
    if (!panel || typeof map === 'undefined') return;

    const city = document.title.includes('Mississauga') ? 'Mississauga' : 'Toronto';
    const developerUrl = 'https://www.linkedin.com/in/masoud-amirdadi-058742201/';
    const fields = ['buf-metric', 'radius', 'grid', 'buf-lambda', 'vor-metric', 'vor-cell', 'vor-lambda', 'vor-ebk'];
    const resultLayers = [coverageUnion, coverageBuffers, selectedStationsLayer, territories, gridLayer];
    const status = document.getElementById('status');

    map.attributionControl.addAttribution(`<a href="${developerUrl}" target="_blank" rel="noopener">Developed by Masoud Amirdadi</a>`);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    function announce(message) {
        status.textContent = message;
    }

    function download(filename, content, type) {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function readSettings() {
        return Object.fromEntries(fields.map(id => {
            const input = document.getElementById(id);
            return [id, input.type === 'checkbox' ? input.checked : input.value];
        }));
    }

    // Validate the complete file before changing any controls.
    function validateSettings(data) {
        if (data?.format !== 'service-space-settings' || data.version !== 1 || !data.settings) {
            throw new Error('Choose a settings file exported by this learning lab.');
        }
        for (const id of fields) {
            const input = document.getElementById(id);
            const value = data.settings[id];
            if (input.type === 'checkbox') {
                if (typeof value !== 'boolean') throw new Error(`Invalid setting: ${id}.`);
            } else if (input.tagName === 'SELECT') {
                if (![...input.options].some(option => option.value === value)) throw new Error(`Invalid setting: ${id}.`);
            } else {
                const candidate = input.cloneNode();
                candidate.disabled = false;
                candidate.value = String(value ?? '');
                if (!candidate.value || !Number.isFinite(Number(candidate.value)) || !candidate.checkValidity()) {
                    throw new Error(`Invalid setting: ${id}.`);
                }
            }
        }
        return data.settings;
    }

    const box = document.createElement('section');
    box.className = 'box map-tools-box';
    box.setAttribute('aria-labelledby', 'map-tools-heading');
    box.innerHTML = `
        <h2 id="map-tools-heading">Map & scenario tools</h2>
        <div class="tool-actions">
            <button type="button" data-action="fit">Fit city</button>
            <button type="button" data-action="export">Export results · GeoJSON</button>
            <button type="button" data-action="save">Save model settings</button>
            <button type="button" data-action="load">Load model settings</button>
        </div>
        <label class="result-toggle"><input id="show-results" type="checkbox" checked> Show model results</label>
        <p class="model-help">Save settings to repeat a scenario in either city. Loading changes inputs only; run the model to update results. GeoJSON contains the current result geometry, not a validated service plan.</p>
        <input type="file" accept=".json,application/json" id="settings-file" hidden aria-label="Choose model settings file">
    `;
    panel.querySelector('.model-warning').after(box);

    box.querySelector('[data-action="fit"]').addEventListener('click', () => {
        const bounds = boundary.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
        else announce('City boundary is still loading. Try again shortly.');
    });

    const visibility = box.querySelector('#show-results');
    visibility.addEventListener('change', () => {
        for (const layer of resultLayers) {
            if (visibility.checked) layer.addTo(map);
            else map.removeLayer(layer);
        }
    });
    // A new calculation should always be visible after hiding an earlier result.
    for (const id of ['run', 'run-vor']) {
        document.getElementById(id).addEventListener('click', () => {
            visibility.checked = true;
            visibility.dispatchEvent(new Event('change'));
        }, true);
    }

    box.querySelector('[data-action="save"]').addEventListener('click', () => {
        const data = { format: 'service-space-settings', version: 1, city, settings: readSettings() };
        download(`${city.toLowerCase()}-settings.json`, JSON.stringify(data, null, 2), 'application/json');
        announce('Model settings downloaded. Results are not included in this file.');
    });

    const fileInput = box.querySelector('#settings-file');
    box.querySelector('[data-action="load"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
            if (file.size > 100000) throw new Error('Settings files must be smaller than 100 KB.');
            const values = validateSettings(JSON.parse(await file.text()));
            for (const id of fields) {
                const input = document.getElementById(id);
                if (input.type === 'checkbox') input.checked = values[id];
                else input.value = values[id];
                input.dispatchEvent(new Event('change'));
            }
            announce('Settings loaded. Run a model to calculate new results for this city.');
        } catch (error) {
            announce(`Settings not loaded: ${error.message}`);
        } finally {
            fileInput.value = '';
        }
    });

    box.querySelector('[data-action="export"]').addEventListener('click', () => {
        const features = [];
        for (const [name, layer] of [['coverage', coverageUnion], ['selected_station', selectedStationsLayer], ['territory', territories]]) {
            const collection = layer.toGeoJSON();
            for (const feature of collection.features || []) {
                features.push({ ...feature, properties: { ...feature.properties, result_layer: name, city } });
            }
        }
        if (!features.length) {
            announce('Run coverage or build territories before exporting results.');
            return;
        }
        download(`${city.toLowerCase()}-results.geojson`, JSON.stringify({
            type: 'FeatureCollection',
            description: 'Illustrative spatial model output; not road network travel times or an operational service plan.',
            features
        }), 'application/geo+json');
        announce(`Exported ${features.length} result features.`);
    });
})();
