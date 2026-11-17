/* Shared model lifecycle: validated inputs, cancellable worker, numeric raster sampling. */
'use strict';
(() => {
    const status = document.getElementById('status');
    const buttons = [document.getElementById('run'), document.getElementById('run-vor')];
    const clear = document.getElementById('clear');
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel calculation'; cancel.hidden = true;
    clear.before(cancel);
    let active = null;
    const cache = new Map();
    const say = text => { status.textContent = text; };
    function clearLayers() {
        [coverageUnion, coverageBuffers, selectedStationsLayer, territories, gridLayer].forEach(layer => layer.clearLayers());
    }
    function finish(job) {
        if (active !== job) return;
        job.worker?.terminate(); clearTimeout(job.timeout);
        active = null; buttons.forEach(b => { b.disabled = false; }); cancel.hidden = true;
        document.querySelectorAll('#panel input, #panel select, #panel .preset-row button, #panel .tool-actions button').forEach(el => { el.disabled = job.disabled.get(el) || false; });
        toggleWeights();
    }
    function stop() {
        if (!active) return;
        const job = active; job.cancelled = true; finish(job);
        say('Calculation cancelled. Change settings or run again.');
    }
    cancel.addEventListener('click', stop);
    clear.addEventListener('click', () => { stop(); clearLayers(); say('Cleared.'); });
    function pixelTile(lon, lat) {
        const z = 14, n = 2 ** z, r = lat * Math.PI / 180;
        const x = (lon + 180) / 360 * n;
        const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
        return {key:`${z}/${Math.floor(x)}/${Math.floor(y)}`, x:Math.floor((x % 1) * 256), y:Math.floor((y % 1) * 256)};
    }
    function tileData(key) {
        if (!cache.has(key)) cache.set(key, new Promise(resolve => {
            const img = new Image();
            const timer = setTimeout(() => { img.onload = img.onerror = null; resolve(null); }, 8000);
            img.onload = () => {
                clearTimeout(timer);
                try {
                    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
                    const ctx = canvas.getContext('2d', {willReadFrequently:true}); ctx.drawImage(img,0,0,256,256);
                    resolve(ctx.getImageData(0,0,256,256).data);
                } catch { resolve(null); }
            };
            img.onerror = () => { clearTimeout(timer); resolve(null); };
            img.src = `./data/Raster_EBK/${key}.png`;
        }));
        return cache.get(key);
    }
    async function weights(stationList, job) {
        const raw = [];
        if (window.paramedicRaster) await window.paramedicRaster.ready;
        for (let i = 0; i < stationList.length; i++) {
            if (job.cancelled) throw Error('Cancelled');
            const origin = stationList[i].coord;
            const samples = [origin, ...Array.from({length:8}, (_, k) => turf.destination(origin, .6, k*45).geometry.coordinates)];
            const values = await Promise.all(samples.map(async coord => {
                if (window.paramedicRaster) return window.paramedicRaster.sample(...coord);
                const tile = pixelTile(...coord), data = await tileData(tile.key);
                if (!data) return 0;
                const offset = (tile.y * 256 + tile.x) * 4;
                if (data[offset+3] === 0) return 0;
                return (.2126*data[offset]+.7152*data[offset+1]+.0722*data[offset+2])/255;
            }));
            raw.push(values.reduce((a,b) => a+b,0)/values.length);
            if (active === job) say(`Reading raster values: ${i+1}/${stationList.length} stations…`);
        }
        const min = Math.min(...raw), range = Math.max(...raw)-min;
        if (range < 1e-6) return raw.map(() => 0);
        return raw.map(w => (w-min)/range);
    }
    async function run(mode) {
        if (active) return;
        const id = mode === 'coverage' ? 'buf' : 'vor';
        const relevant = mode === 'coverage' ? ['radius','grid','buf-lambda'] : ['vor-cell','vor-lambda'];
        for (const name of relevant) {
            const el = document.getElementById(name);
            if (!el.disabled && (!el.value || !el.checkValidity())) { el.reportValidity(); say('Enter valid model settings.'); return; }
        }
        const list = stationArray();
        if (!list.length || !boundary.getLayers().length) { say('City data is not ready. Wait for loading, or reload if it failed.'); return; }
        const params = {mode, boundary:boundary.toGeoJSON(), stations:list,
            spacing:Number(document.getElementById(mode === 'coverage' ? 'grid' : 'vor-cell').value),
            radius:Number(document.getElementById('radius').value), lambda:Number(document.getElementById(`${id}-lambda`).value)};
        const weighted = document.getElementById(`${id}-metric`).value === 'ebkdist';
        const job = {cancelled:false, disabled:new Map()}; active = job;
        document.querySelectorAll('#panel input, #panel select, #panel .preset-row button, #panel .tool-actions button').forEach(el => { job.disabled.set(el,el.disabled); el.disabled = true; });
        buttons.forEach(b => { b.disabled = true; }); cancel.hidden = false;
        clearLayers(); say('Preparing calculation…');
        job.timeout = setTimeout(() => { if (active === job) { job.cancelled = true; finish(job); say('Calculation timed out. Increase spacing and retry.'); } }, 60000);
        try {
            if (weighted) params.weights = await weights(list, job);
            if (active !== job) return;
            const worker = new Worker('../model-worker.js'); job.worker = worker;
            worker.onerror = event => { event.preventDefault(); if (active === job) { say('The calculation worker failed. Reload the page and retry.'); finish(job); } };
            worker.onmessage = ({data}) => {
                if (active !== job) return;
                if (data.progress) { say(data.progress); return; }
                try {
                    if (data.error) throw Error(data.error);
                    const result = data.result;
                    if (mode === 'coverage') {
                        coverageUnion.addData(result.coverage); selectedStationsLayer.addData(result.selected);
                        say(`Coverage: ${result.selected.features.length} stations; ${(100*result.coveredCount/result.total).toFixed(1)}% of ${result.total} sampled points covered.${weighted?' Raster weighting applied.':''}`);
                    } else {
                        territories.addData(result.territories);
                        say(`Built ${result.cells} territory cells assigned to ${result.count} stations; ${params.spacing} m hexagon side.${weighted?' Raster weighting applied.':''}`);
                    }
                } catch (error) { clearLayers(); say(`No result: ${error.message}`); }
                finally { finish(job); }
            };
            worker.postMessage(params);
        } catch (error) {
            if (active === job) { cache.clear(); say(`No result: ${error.message}`); finish(job); }
        }
    }
    buttons[0].addEventListener('click', () => run('coverage'));
    buttons[1].addEventListener('click', () => run('territories'));
})();
