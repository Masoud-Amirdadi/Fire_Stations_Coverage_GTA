'use strict';
window.incidentRaster = (() => {
 let meta,values;
 const ready = Promise.all([
  fetch('./data/incidents-raster.json').then(r=>{if(!r.ok)throw Error('Raster metadata unavailable');return r.json();}),
  fetch('./data/incidents-values.bin.gz').then(async r=>{if(!r.ok)throw Error('Raster values unavailable');return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();})
 ]).then(([m,buffer])=>{
  if(buffer.byteLength!==m.width*m.height*4)throw Error('Raster data size mismatch');
  meta=m;const view=new DataView(buffer);values=new Float32Array(m.width*m.height);
  for(let i=0;i<values.length;i++)values[i]=view.getFloat32(i*4,true);
  return m;
 });
 ready.catch(error=>{document.getElementById('status').textContent=error.message;});
 function sample(lon,lat){
  if(!meta||!values)throw Error('Raster is not ready');
  const R=6378137,x=R*lon*Math.PI/180,y=R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  const [xmin,ymin,xmax,ymax]=meta.mercatorBounds;
  const col=Math.floor((x-xmin)/(xmax-xmin)*meta.width),row=Math.floor((ymax-y)/(ymax-ymin)*meta.height);
  if(col<0||row<0||col>=meta.width||row>=meta.height)return NaN;
  return values[row*meta.width+col];
 }
 return {ready,sample};
})();
