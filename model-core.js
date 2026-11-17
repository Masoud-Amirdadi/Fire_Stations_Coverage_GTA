/* Shared, deterministic geometry engine. Turf 6.5.0; no DOM or map zoom inputs. */
(function (scope) {
    'use strict';
    const LIMIT = 15000;
    function validate(p) {
        if (!['coverage', 'territories'].includes(p.mode)) throw Error('Unknown model.');
        if (!Array.isArray(p.stations) || !p.stations.length) throw Error('Station data is not ready.');
        if (!p.boundary?.features?.length) throw Error('City boundary is not ready.');
        if (!Number.isFinite(p.spacing) || p.spacing < 200 || p.spacing > 5000) throw Error('Use a spacing from 200 to 5000 m.');
        if (!Number.isFinite(p.radius) || p.radius < 50 || p.radius > 10000) throw Error('Use a radius from 50 to 10000 m.');
        if (!Number.isFinite(p.lambda) || p.lambda < 0 || p.lambda > 1) throw Error('Influence must be from 0 to 1.');
        if (p.weights && (p.weights.length !== p.stations.length || p.weights.some(w => !Number.isFinite(w) || w < 0 || w > 1))) throw Error('Weights must contain a valid value for every station.');
    }
    function boundaryPolygon(fc) {
        const coords = [];
        for (const f of fc.features) {
            if (f.geometry.type === 'Polygon') coords.push(f.geometry.coordinates);
            else if (f.geometry.type === 'MultiPolygon') coords.push(...f.geometry.coordinates);
            else throw Error('City boundary must contain polygons.');
        }
        return turf.multiPolygon(coords);
    }
    function budget(poly, spacing, factor = 1) {
        const b = turf.bbox(poly);
        const width = turf.distance([b[0], b[1]], [b[2], b[1]], {units:'meters'});
        const height = turf.distance([b[0], b[1]], [b[0], b[3]], {units:'meters'});
        if ((width / spacing + 2) * (height / spacing + 2) * factor > LIMIT) throw Error('This grid is too detailed. Increase spacing to reduce it below 15,000 cells.');
    }
    function greedy(cover, count) {
        const covered = new Uint8Array(count), selected = [], used = new Set();
        let coveredCount = 0;
        while (coveredCount < count) {
            let best = -1, gain = 0;
            cover.forEach((indices, i) => {
                if (used.has(i)) return;
                const n = indices.reduce((sum, j) => sum + (covered[j] ? 0 : 1), 0);
                if (n > gain) { best = i; gain = n; }
            });
            if (best < 0) break;
            selected.push(best); used.add(best);
            for (const j of cover[best]) if (!covered[j]) { covered[j] = 1; coveredCount++; }
        }
        return {selected, coveredCount, total:count};
    }
    function run(p, progress = () => {}) {
        validate(p);
        const poly = boundaryPolygon(p.boundary);
        budget(poly, p.spacing);
        if (p.mode === 'coverage') {
            progress('Building ground-distance buffers and demand samples…');
            const points = turf.pointGrid(turf.bbox(poly), p.spacing / 1000, {units:'kilometers', mask:poly});
            if (!points.features.length) throw Error('No demand samples at this spacing. Use a smaller spacing.');
            const buffers = p.stations.map((s, i) => {
                const radius = p.radius * (p.weights ? Math.max(.7, 1 - p.lambda * p.weights[i]) : 1);
                const f = turf.buffer(turf.point(s.coord), radius, {units:'meters', steps:64});
                f.properties = {idx:i, radius_m:radius};
                return f;
            });
            // Membership is evaluated against the exact displayed buffer polygon.
            // This also avoids disagreements at the polygon's tessellated edge.
            const cover = buffers.map(f => points.features.flatMap((pt, j) => turf.booleanPointInPolygon(pt, f) ? [j] : []));
            const result = greedy(cover, points.features.length);
            const features = result.selected.map(i => {
                const f = turf.intersect(buffers[i], poly);
                if (!f) return null;
                f.properties = buffers[i].properties;
                return f;
            }).filter(Boolean);
            return {...result, coverage:turf.featureCollection(features), selected:turf.featureCollection(result.selected.map(i => turf.point(p.stations[i].coord, {idx:i}))), mode:p.mode};
        }
        progress('Assigning territory cells using ground distance…');
        // Keep cells separate: repeated polygon union was the main source of freezes.
        // Spacing is the hexagon side length; boundary cells are clipped.
        const cells = turf.hexGrid(turf.bbox(poly), p.spacing / 1000, {units:'kilometers', mask:poly});
        if (cells.features.length > LIMIT) throw Error('Too many territory cells. Increase spacing.');
        const segments = [];
        for (const polygon of poly.geometry.coordinates) for (const ring of polygon) {
            for (let i=1; i<ring.length; i++) {
                const a=ring[i-1], b=ring[i];
                segments.push([Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]);
            }
        }
        const features = [];
        const assigned = new Set();
        for (const cell of cells.features) {
            const bb = turf.bbox(cell);
            const touchesBoundary = segments.some(b => b[0]<=bb[2] && b[2]>=bb[0] && b[1]<=bb[3] && b[3]>=bb[1]);
            // With no boundary segments in the cell bbox, one vertex establishes
            // containment. Only edge cells need expensive polygon clipping.
            const clipped = touchesBoundary ? turf.intersect(cell, poly)
                : (turf.booleanPointInPolygon(cell.geometry.coordinates[0][0],poly) ? cell : null);
            if (!clipped) continue;
            const center = turf.pointOnFeature(clipped);
            let best = 0, value = Infinity;
            p.stations.forEach((s, i) => {
                const cost = turf.distance(center, s.coord, {units:'meters'}) * (1 + p.lambda * (p.weights?.[i] || 0));
                if (cost < value) { value = cost; best = i; }
            });
            clipped.properties = {idx:best, fill:`hsl(${(best * 137.508) % 360},55%,67%)`, cell_side_m:p.spacing};
            features.push(clipped); assigned.add(best);
        }
        if (!features.length) throw Error('No territory cells at this spacing. Use a smaller spacing.');
        return {mode:p.mode, territories:turf.featureCollection(features), count:assigned.size, cells:features.length};
    }
    scope.CityModel = {run, validate, greedy, boundaryPolygon};
})(typeof self !== 'undefined' ? self : globalThis);
