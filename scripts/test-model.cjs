const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
global.turf = require(path.join(root, 'vendor/turf.min.js'));
require(path.join(root,'model-core.js'));
const read = name => JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const center = [-79.4,43.7];
const box = turf.bboxPolygon([-79.43,43.67,-79.37,43.73]);
const params = {mode:'coverage',stations:[{coord:center}],boundary:turf.featureCollection([box]),spacing:400,radius:1000,lambda:.6};
const result = CityModel.run(params);
const points = turf.pointGrid(turf.bbox(box),.4,{units:'kilometers',mask:box});
const expected = points.features.filter(pt => turf.booleanPointInPolygon(pt,result.coverage.features[0])).length;
assert.equal(result.coveredCount,expected,'reported coverage matches exported geometry');
for(const bearing of [0,45,90,180,270]) {
    const inside = turf.destination(center,.99,bearing), outside = turf.destination(center,1.01,bearing);
    assert(turf.booleanPointInPolygon(inside,result.coverage.features[0]));
    assert(!turf.booleanPointInPolygon(outside,result.coverage.features[0]));
}
assert.throws(()=>CityModel.run({...params,weights:[null]}),/Weights/);
assert.throws(()=>CityModel.run({...params,spacing:0}),/spacing/);
assert.throws(()=>CityModel.run({...params,stations:[]}),/Station/);
assert.throws(()=>CityModel.run({...params,boundary:turf.featureCollection([turf.bboxPolygon([-81,42,-78,45])]),spacing:200}),/too detailed/);
const zero = CityModel.run({...params,weights:[1],lambda:0});
assert.equal(zero.coveredCount,result.coveredCount,'zero influence preserves baseline');
const weighted = CityModel.run({...params,weights:[1]});
assert(weighted.coveredCount<=result.coveredCount);
assert.equal(weighted.coverage.features[0].properties.radius_m,700);
for(const [city,boundaryName] of [['City of Toronto','City_of_Toronto_Boundary_Areas.geojson'],['City of Mississauga','City Of Mississauag_Boundary.geojson']]) {
    const boundary = read(`${city}/data/${boundaryName}`);
    const stations = read(`${city}/data/${city==='City of Toronto'?'Paramedic_Stations':'Fire_Stations'}.geojson`).features.flatMap(f => (f.geometry.type==='MultiPoint'?f.geometry.coordinates:[f.geometry.coordinates]).map(coord=>({coord})));
    const base = {...params,boundary,stations};
    const start=Date.now();
    const coverage=CityModel.run(base);
    assert(coverage.total>0 && coverage.coveredCount>0);
    const demand=turf.pointGrid(turf.bbox(boundary),.4,{units:'kilometers',mask:CityModel.boundaryPolygon(boundary)});
    assert.equal(demand.features.filter(pt=>coverage.coverage.features.some(f=>turf.booleanPointInPolygon(pt,f))).length,coverage.coveredCount);
    const wider=CityModel.run({...base,radius:2000});
    assert(wider.coveredCount>=coverage.coveredCount);
    for(const weights of [undefined,stations.map((_,i)=>i/(stations.length-1))]) {
        const territories=CityModel.run({...base,mode:'territories',weights});
        assert(territories.cells>0);
        const poly=CityModel.boundaryPolygon(boundary);
        for(const f of territories.territories.features) {
            assert(turf.booleanPointInPolygon(turf.pointOnFeature(f),poly));
            const pt=turf.pointOnFeature(f);
            const costs=stations.map((s,i)=>turf.distance(pt,s.coord,{units:'meters'})*(1+.6*(weights?.[i]||0)));
            assert.equal(f.properties.idx,costs.indexOf(Math.min(...costs)));
        }
        console.log(`${city}: ${territories.cells} ${weights?'weighted':'distance'} cells passed`);
    }
    console.log(`${city}: ${stations.length} stations; ${coverage.coveredCount}/${coverage.total} covered; ${Date.now()-start} ms including assertions`);
}
console.log('PASS: geometry consistency, distance thresholds, weights, bounds, limits and real-city scenarios');
