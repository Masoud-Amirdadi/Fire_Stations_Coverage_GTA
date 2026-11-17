/* All incident processing stays in this browser. Only basemap tiles use the network. */
'use strict';
(() => {
  const D = window.VFRS_DATA;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number(value || 0).toLocaleString('en-CA', {maximumFractionDigits:0});
  const fixed = (value, places=2) => Number.isFinite(value) ? value.toFixed(places) : '—';
  const pct = value => `${fixed(value * 100)}%`;
  const yearLabel = year => year === 'all' ? '2023–2025' : year;
  const palette = ['#355d78','#8ba9b3','#bf8659'];
  const state = {station:'all',year:'all',view:'overall',breakdown:'Annual',mapMetric:'incidents',showIncidents:true,status:'all'};
  const charts = {};
  let map, stationLayer, incidentLayer, boundaryLayer, markers = {}, currentIncidents = [], renderToken = 0;
  if (!D || !window.L || !window.Chart) {
    $('view-title').textContent='Unable to load dashboard';
    $('map-error').hidden=false;
    $('map-error').textContent='A local dashboard file is missing. Rebuild data.js and check the vendor folder; see README.md.';
    return;
  }
  const scope = (station=state.station, year=state.year) => D.scopes[`${station}|${year}`];
  const annual = (station=state.station, year=state.year) => scope(String(station),String(year)).Annual[0];
  const selectedStation = () => D.stations.find(s => String(s.id) === state.station);
  const selectedResponses = incident => incident.responses.filter(r => state.station === 'all' || String(r[1]) === state.station);
  const isLocated = incident => D.addresses[incident.address].lat !== null;
  function filterIncidents() {
    return D.incidents.filter(i => {
      if (state.year !== 'all' && String(i.year) !== state.year) return false;
      const responses = selectedResponses(i);
      if (!responses.length) return false;
      if (state.status === 'non-cancelled') return responses.some(r => r[2] === 0);
      if (state.status === 'cancelled') return responses.some(r => r[2] === 1);
      return true;
    });
  }
  function setView(view) {
    state.view=view;
    if (view === 'overall') {state.station='all';state.year='all';}
    if (view === 'station' && state.station === 'all') state.station='1';
    if (view === 'year') {state.station='all';if(state.year==='all') state.year='2025';}
    render({locate:view==='station'});
  }
  function selectStation(id, locate=true) {
    state.station=String(id);state.view='station';render({locate});
  }
  function updateControls() {
    $('station-select').value=state.station;$('year-select').value=state.year;
    document.querySelectorAll('[data-view]').forEach(b => {const on=b.dataset.view===state.view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    const station=selectedStation();
    $('breakdown-select').querySelector('option[value="Annual"]').textContent=state.station==='all'&&state.year!=='all'?'By station':state.year!=='all'?'Selected year':'By year';
    $('view-title').textContent=station?`Station ${station.label}`:state.year!=='all'?`${state.year} in focus`:'Analytics';
    $('selection-context').textContent=`${station?`Station ${station.label}`:'All 10 stations'} · ${yearLabel(state.year)}`;
  }
  function updateMetrics() {
    const s=annual();const station=selectedStation();
    const incidentTotal=station?s.incidents:(state.year==='all'?Object.values(D.rawIncidentTotals).reduce((a,b)=>a+b,0):D.rawIncidentTotals[state.year]);
    const unitCount=station?station.units:D.stations.reduce((n,s)=>n+s.units,0);
    const kpis=[
      ['Unique incidents',num(incidentTotal),'',station?'Non-cancelled station involvement':'All source incidents, including cancellations'],
      ['Estimated operating units',num(unitCount),'',station?'Inferred from response activity':'Across 10 stations · inferred complement'],
      ['Average response',fixed(s.avg),'min',`90th percentile ${fixed(s.p90)} min`],
      ['Estimated idle capacity',fixed(s.idle_pct*100),'%',`${num(s.idle)} idle unit-hours`],
    ];
    $('kpis').innerHTML=kpis.map(([label,value,unit,note])=>`<div class="kpi"><small>${label}</small><strong>${value}<span>${unit}</span></strong><p>${note}</p></div>`).join('');
    $('station-detail').hidden=!station;
    if(station) $('station-detail').innerHTML=`<strong>${esc(station.address)}</strong><p>${station.units} estimated operating unit${station.units>1?'s':''} · ${esc(station.listedUnits.join(', '))}</p><p>Listed apparatus are not a count of staffed units. Selection follows unit codes, not incident district.</p>`;
    const details=[['Incidents with a non-cancelled mapped response',num(s.incidents)],['Non-cancelled unit responses',num(s.responses)],['Cancelled unit responses',num(s.cancelled)],['Average processing & turnout',`${fixed(s.turnout)} min`],['Average occupied · non-cancelled',`${fixed(s.occupied)} min`],['Average occupied · cancelled',`${fixed(s.cancel_occupied)} min`],['Station time with no occupied units',pct(s.empty_pct)],['Station-hours above estimated complement',`${fixed(s.excess,1)} h`],['Zero response times',`${num(s.zero_response)} (${pct(s.zero_response/s.responses)})`],['Zero occupied times',`${num(s.zero_occupied)} (${pct(s.zero_occupied/(s.responses+s.cancelled))})`]];
    $('detail-metrics').innerHTML=details.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }
  function drawChart(id,type,data,options={}) {
    charts[id]?.destroy();
    const defaults={responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#233e4b',padding:10,cornerRadius:6,titleFont:{size:12},bodyFont:{size:11}}}};
    charts[id]=new Chart($(id),{type,data,options:{...defaults,...options,plugins:{...defaults.plugins,...options.plugins}}});
  }
  function updateShare() {
    const station=selectedStation();let labels,values,colors;
    if(station) {
      const s=annual();const overall=annual('all',state.year);
      labels=[`Station ${station.label}`,'Other incidents'];values=[s.incidents,overall.incidents-s.incidents];colors=['#b44338','#e6ebe7'];
      $('share-title').textContent='Share of incidents involving this station';
      $('share-description').textContent=`Non-cancelled mapped incidents · ${yearLabel(state.year)}`;
    } else {
      labels=['2023','2024','2025'];values=labels.map(y=>D.rawIncidentTotals[y]);
      colors=palette.map((c,i)=>state.year==='all'||labels[i]===state.year?c:c+'55');
      $('share-title').textContent='Incident share by year';
      $('share-description').textContent=state.year==='all'?'All unique source incidents · three year total':`${state.year} highlighted within the three year total`;
    }
    const total=values.reduce((a,b)=>a+b,0);
    drawChart('share-chart','doughnut',{labels,datasets:[{data:values,backgroundColor:colors,borderColor:'#ffffff',borderWidth:3,hoverOffset:3}]},{cutout:'66%',plugins:{tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${num(ctx.raw)} (${pct(ctx.raw/total)})`}}}});
    $('share-legend').innerHTML=labels.map((label,i)=>`<div class="share-item"><i style="background:${colors[i]}"></i><span>${esc(label)}<small>${num(values[i])} incidents</small></span><b>${pct(values[i]/total)}</b></div>`).join('');
  }
  function chartRows() {
    if(state.breakdown!=='Annual')return scope()[state.breakdown].map(r=>({...r,label:state.breakdown==='Month'?new Date(2000,Number(r.label)-1,1).toLocaleString('en',{month:'short'}):r.label}));
    if(state.station==='all'&&state.year!=='all')return D.stations.map(st=>({...annual(String(st.id),state.year),label:`7-${st.id}`}));
    if(state.year!=='all')return [{...annual(),label:state.year}];
    return ['2023','2024','2025'].map(y=>({...annual(state.station,y),label:y}));
  }
  function updateTimeCharts() {
    const rows=chartRows();const labels=rows.map(r=>r.label);
    const fonts={family:'Inter, Segoe UI, Arial, sans-serif',size:10};
    const scales={x:{grid:{display:false},ticks:{font:fonts,maxRotation:35,autoSkip:false},border:{display:false}},y:{beginAtZero:true,grid:{color:'#edf0ed'},ticks:{font:fonts},border:{display:false}}};
    const legend={display:true,position:'bottom',align:'start',labels:{boxWidth:7,boxHeight:7,usePointStyle:true,pointStyle:'rectRounded',padding:13,font:{size:10},color:'#75838b'}};
    drawChart('response-chart','bar',{labels,datasets:[['Average','avg','#355d78'],['Median','median','#a5bbc4'],['90th percentile','p90','#bf8659']].map(([label,key,color])=>({label,data:rows.map(r=>r[key]),backgroundColor:color,borderRadius:2,maxBarThickness:25})).concat([4,6].map((minutes,i)=>({type:'line',label:`${minutes}-minute threshold`,data:rows.map(()=>minutes),borderColor:['#547b67','#b65c51'][i],borderDash:[5,4],borderWidth:1.5,pointRadius:rows.length===1?4:0,fill:false,order:-1})))},{scales,plugins:{legend,tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fixed(c.raw)} min`}}}});
    drawChart('idle-chart','bar',{labels,datasets:[{label:'Idle capacity',data:rows.map(r=>r.idle_pct*100),backgroundColor:'#60836e',borderRadius:2,maxBarThickness:40},{label:'Occupied capacity',data:rows.map(r=>(1-r.idle_pct)*100),backgroundColor:'#caa37c',maxBarThickness:40}]},{scales:{x:{...scales.x,stacked:true},y:{...scales.y,stacked:true,max:100,ticks:{font:fonts,callback:v=>`${v}%`}}},plugins:{legend,tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fixed(c.raw)}%`}}}});
  }
  function updateComparison() {
    $('comparison-body').innerHTML=D.stations.map(st=>{
      const s=annual(String(st.id),state.year);
      return `<tr class="${state.station===String(st.id)?'selected':''}" data-station="${st.id}"><td><button data-station="${st.id}"><span class="table-dot"></span>7-${st.id}</button></td><td>${num(s.incidents)}</td><td>${fixed(s.avg)} min</td><td>${pct(s.idle_pct)}</td></tr>`;
    }).join('');
  }
  function updateThresholds() {
    const summarize=window.VFRS_THRESHOLDS.summarize;
    const total=summarize(D.incidents,state.station,state.year);
    $('threshold-summary').innerHTML=[[4,total.within4,total.rate4],[6,total.within6,total.rate6]].map(([minutes,count,rate])=>`<div><small>Within ${minutes} minutes</small><strong>${rate===null?'—':pct(rate)}</strong><span>${num(count)} of ${num(total.total)} unit responses</span></div>`).join('');
    const groups=state.station==='all'?D.stations.map(st=>({label:st.label,station:String(st.id),year:state.year})):state.year==='all'?['2023','2024','2025'].map(year=>({label:year,station:state.station,year})):[{label:state.year,station:state.station,year:state.year}];
    const rows=groups.map(g=>({...g,...summarize(D.incidents,g.station,g.year)}));
    const labels=['Within 4 min','Over 4 to 6 min','Over 6 min'];
    const keys=['within4','between4and6','above6'];
    drawChart('threshold-chart','bar',{labels:rows.map(r=>r.label),datasets:keys.map((key,i)=>({label:labels[i],data:rows.map(r=>r.total?r[key]/r.total*100:null),backgroundColor:['#547b67','#c4a16c','#b65c51'][i],maxBarThickness:40}))},{scales:{x:{stacked:true,grid:{display:false},ticks:{font:{size:10},autoSkip:false},border:{display:false}},y:{stacked:true,min:0,max:100,ticks:{callback:v=>`${v}%`,font:{size:10}},grid:{color:'#edf0ed'},border:{display:false}}},plugins:{tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fixed(c.raw)}% (${num(rows[c.dataIndex][keys[c.datasetIndex]])} responses)`}}}});
    $('threshold-scope').textContent=`${selectedStation()?`Station ${selectedStation().label}`:'All mapped stations'} · ${yearLabel(state.year)} · ${num(total.total)} responses. Bands are mutually exclusive; the ≤6-minute summary includes the ≤4-minute group.`;
  }
  function stationPopup(st) {
    const s=annual(String(st.id),state.year);
    return `<div class="popup-eyebrow">VAUGHAN FIRE SERVICES</div><div class="popup-title">Station ${st.label}</div><div class="popup-address">${esc(st.address)}</div><div class="popup-metrics"><div class="popup-metric"><small>Incidents responded</small><b>${num(s.incidents)}</b></div><div class="popup-metric"><small>Estimated operating units</small><b>${st.units}</b></div><div class="popup-metric"><small>Average response</small><b>${fixed(s.avg)} <em>min</em></b></div><div class="popup-metric"><small>Average occupied</small><b>${fixed(s.occupied)} <em>min</em></b></div></div><div class="popup-idle">Estimated idle capacity <b>${pct(s.idle_pct)}</b><div class="popup-track"><i style="width:${s.idle_pct*100}%"></i></div></div><div class="popup-scope">${yearLabel(state.year)} · Non-cancelled response statistics<br>Cancelled assignments are included in occupancy.</div>`;
  }
  function updateStationMarkers(locate=false) {
    map.stop();
    map.eachLayer(layer=>{if(layer instanceof L.Popup)map.removeLayer(layer);});
    stationLayer.clearLayers();markers={};
    D.stations.forEach(st=>{
      const s=annual(String(st.id),state.year);const selected=state.station===String(st.id);
      const metric=state.mapMetric==='response'?`${fixed(s.avg)} min response`:state.mapMetric==='idle'?`${pct(s.idle_pct)} idle capacity`:`${num(s.incidents)} incidents`;
      const shortMetric=state.mapMetric==='response'?`${fixed(s.avg)} min`:state.mapMetric==='idle'?pct(s.idle_pct):num(s.incidents);
      const marker=L.marker([st.lat,st.lng],{icon:L.divIcon({className:'station-marker',html:`<div class="station-pin ${selected?'selected':''}">${st.label}</div><div class="station-badge">${shortMetric}</div>`,iconSize:[38,54],iconAnchor:[19,19],popupAnchor:[0,-22]}),title:`Station ${st.label}, ${st.address}, ${metric}`,alt:`Station ${st.label}`,zIndexOffset:selected?1000:100});
      marker.bindPopup(stationPopup(st),{className:'station-popup',maxWidth:310,minWidth:280,autoPanPaddingTopLeft:[35,210],autoPanPaddingBottomRight:[35,100]});
      marker.bindTooltip(`Station ${st.label} · ${metric}`,{direction:'top',offset:[0,-20],className:'station-tooltip'});
      marker.on('click',()=>selectStation(st.id,false));marker.addTo(stationLayer);markers[st.id]=marker;
    });
    const station=selectedStation();
    if(station) {
      if(locate)map.flyTo([station.lat,station.lng],Math.max(map.getZoom(),12),{duration:.55});
      markers[station.id].openPopup();
    }
  }
  function categoryRows(incidents) {
    const counts=new Map();
    incidents.forEach(i=>{const key=`${i.year}|${i.category}`;counts.set(key,(counts.get(key)||0)+1);});
    return [...counts].map(([key,count])=>[...key.split('|'),count]).sort((a,b)=>b[0].localeCompare(a[0])||b[2]-a[2]||a[1].localeCompare(b[1]));
  }
  function incidentPopup(group) {
    const rows=categoryRows(group.incidents);
    return `<div class="incident-popup"><span class="popup-eyebrow">AREA SUMMARY</span><h4>Incident activity</h4><div class="incident-total"><strong>${num(group.incidents.length)}</strong><span>incidents in this selection</span></div><p class="area-note">Approximate 500 metre area · ${yearLabel(state.year)}</p><table class="category-table"><caption class="sr-only">Incidents by year and broad category</caption><thead><tr><th>Year</th><th>Category</th><th>Count</th></tr></thead><tbody>${rows.map(([year,category,count])=>`<tr><td>${esc(year)}</td><td><span class="category-chip">${esc(category)}</span></td><td>${num(count)}</td></tr>`).join('')}</tbody></table><p class="privacy-note">Locations are generalized. Individual incident details are not displayed.</p></div>`;
  }
  function updateIncidents() {
    currentIncidents=filterIncidents();const located=currentIncidents.filter(isLocated);const missing=currentIncidents.length-located.length;
    $('coverage-title').textContent=`${pct(currentIncidents.length?located.length/currentIncidents.length:0)} of selected incidents located`;
    $('coverage-detail').textContent=`${num(located.length)} matched · ${num(missing)} unmatched or incomplete. Shown in approximate 500 metre areas.`;
    $('map-count').textContent=`${num(located.length)} located / ${num(currentIncidents.length)} selected incidents`;
    incidentLayer.clearLayers();
    if(!state.showIncidents)return;
    const groups=new Map();
    located.forEach(i=>{let g=groups.get(i.address);if(!g){g={address:i.address,incidents:[]};groups.set(i.address,g);}g.incidents.push(i);});
    // Canvas renders generalized area summaries without property locations.
    groups.forEach(group=>{
      const a=D.addresses[group.address];
      const marker=L.circleMarker([a.lat,a.lng],{radius:Math.min(11,2.4+Math.log2(group.incidents.length+1)*1.1),color:'#467d9d',weight:.55,fillColor:'#739ab3',fillOpacity:.38,pane:'incidentPane'});
      marker.bindPopup(()=>incidentPopup(group),{className:'area-popup',minWidth:280,maxWidth:340,maxHeight:380});marker.addTo(incidentLayer);
    });
  }
  function render({locate=false}={}) {
    $('panel-scroll').scrollTop=0;
    updateControls();updateMetrics();updateShare();updateTimeCharts();updateThresholds();updateComparison();updateStationMarkers(locate);
    const token=++renderToken;
    requestAnimationFrame(()=>{if(token===renderToken)updateIncidents();});
  }
  function downloadCsv(filename,headers,rows) {
    const cell=value=>{let s=String(value??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    const text='\ufeff'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function initMap() {
    map=L.map('map',{zoomControl:false,preferCanvas:true,minZoom:9,maxZoom:19,zoomSnap:.25,zoomDelta:.5});
    map.attributionControl.addAttribution('<a href="https://www.linkedin.com/in/masoud-amirdadi-058742201/" target="_blank" rel="noopener noreferrer">Developed by Masoud Amirdadi</a>');
    map.createPane('incidentPane');map.getPane('incidentPane').style.zIndex=410;
    map.createPane('boundaryPane');map.getPane('boundaryPane').style.zIndex=420;
    map.getPane('boundaryPane').style.pointerEvents='none';
    if(window.VFRS_BOUNDARY?.features?.length){
      boundaryLayer=L.geoJSON(window.VFRS_BOUNDARY,{
        pane:'boundaryPane',interactive:false,
        style:{color:'#486774',weight:2.4,opacity:1,dashArray:'7 5',fill:false},
        attribution:'Boundary: <a href="https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Boundary/MapServer/1">York Region</a>'
      }).addTo(map);
      $('about-content').insertAdjacentHTML('beforeend','<p><b>City boundary.</b> The Vaughan outline comes from <a href="https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Boundary/MapServer/1" target="_blank" rel="noopener">York Region’s official municipal-boundary layer</a>, downloaded 15 October 2026. This is a reference outline; incidents are not excluded by it. The light basemap uses the same direct OpenStreetMap tiles with a visual colour treatment.</p>');
    } else {
      $('show-boundary').checked=false;$('show-boundary').disabled=true;
    }
    // A file:// document cannot supply the real HTTP referrer required by OSM.
    // Do not send tile requests in that context or spoof request identification.
    if(!['http:','https:'].includes(location.protocol)) {
      $('map-error').hidden=false;
      $('map-error').textContent='Open this dashboard with Start Dashboard.cmd in the leaflet-dashboard folder. Direct HTML-file launch cannot provide the HTTP referrer required by OpenStreetMap. Station and incident data remain available.';
    } else {
      let tileErrors=0;
      const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,referrerPolicy:'origin',updateWhenIdle:true,keepBuffer:1,
        attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      tiles.on('tileerror',()=>{
        if(++tileErrors>3){
          $('map-error').hidden=false;
          $('map-error').textContent='OpenStreetMap tiles are unavailable or access has been blocked. Use Start Dashboard.cmd and its HTTP address. Requests are not automatically retried; station data and charts remain usable. If the block persists, the browser/network restriction needs review.';
        }
      });
      tiles.addTo(map);
    }
    stationLayer=L.layerGroup().addTo(map);incidentLayer=L.layerGroup().addTo(map);
    L.control.zoom({position:'topright'}).addTo(map);
    fitMap();
  }
  function fitMap(){map.fitBounds(boundaryLayer?boundaryLayer.getBounds():L.latLngBounds(D.stations.map(s=>[s.lat,s.lng])),{paddingTopLeft:[45,75],paddingBottomRight:[45,90],maxZoom:12});}
  D.stations.forEach(st=>$('station-select').insertAdjacentHTML('beforeend',`<option value="${st.id}">Station ${st.label}</option>`));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('station-select').addEventListener('change',e=>{state.station=e.target.value;state.view=state.station==='all'?(state.year==='all'?'overall':'year'):'station';render({locate:state.station!=='all'});});
  $('year-select').addEventListener('change',e=>{state.year=e.target.value;state.view=state.station==='all'?(state.year==='all'?'overall':'year'):'station';render();});
  $('breakdown-select').addEventListener('change',e=>{state.breakdown=e.target.value;updateTimeCharts();});
  $('map-metric').addEventListener('change',e=>{state.mapMetric=e.target.value;updateStationMarkers();});
  $('show-incidents').addEventListener('change',e=>{state.showIncidents=e.target.checked;updateIncidents();});
  $('show-boundary').addEventListener('change',e=>{if(boundaryLayer){if(e.target.checked)boundaryLayer.addTo(map);else map.removeLayer(boundaryLayer);}});
  $('incident-status').addEventListener('change',e=>{state.status=e.target.value;updateIncidents();});
  $('fit-map').addEventListener('click',fitMap);
  for(const [id,className,label] of [['toggle-header','header-hidden','header'],['toggle-map-tools','map-tools-hidden','map controls'],['toggle-panel','panel-hidden','analytics']]) {
    $(id).addEventListener('click',()=>{
      const hidden=document.querySelector('.workspace').classList.toggle(className);
      $(id).textContent=`${hidden?'Show':'Hide'} ${label}`;
      $(id).setAttribute('aria-expanded',String(!hidden));
      requestAnimationFrame(()=>{map.invalidateSize();Object.values(charts).forEach(chart=>chart.resize());});
    });
  }
  $('comparison-body').addEventListener('click',e=>{const row=e.target.closest('[data-station]');if(row)selectStation(row.dataset.station);});
  $('download-summary').addEventListener('click',()=>downloadCsv(`VFRS_station_comparison_${state.year}.csv`,['Period','Station','Estimated units','Incidents non-cancelled','Unit responses non-cancelled','Cancelled unit responses','Average response minutes','Average occupied minutes','Estimated idle percent'],D.stations.map(st=>{const s=annual(String(st.id));return[yearLabel(state.year),st.label,st.units,s.incidents,s.responses,s.cancelled,s.avg,s.occupied,s.idle_pct*100];})));
  $('download-unmatched').addEventListener('click',()=>downloadCsv(`VFRS_unlocated_summary_${state.station}_${state.year}.csv`,['Year','Category','Incident count'],categoryRows(currentIncidents.filter(i=>!isLocated(i)))));
  $('about-content').innerHTML=`<p><b>Incident counts.</b> Overall totals include all ${num(D.incidents.length)} unique source incidents. Station response metrics exclude cancelled responses and vehicles without a station mapping. Station incident counts overlap when multiple stations attend.</p><p><b>Occupied and idle.</b> Non-cancelled responses are occupied from notification to clear time; cancelled responses from notification to cancellation. Overlapping assignments for the same unit are merged. Capacity is estimated at two units for Stations 1, 2, 3 and 5 and one for all other stations. Activity above that estimate is flagged and idle capacity is capped at zero.</p><p><b>Time and reporting.</b> Aggregate statistics are calculated from source alarm dates and times; these are not included in the incident layer. Occupancy hours follow the inferred actual intervals. Daytime is 07:00–19:00. Seasons are winter Dec–Feb, spring Mar–May, summer Jun–Aug and autumn Sep–Nov. Times crossing midnight assume the next day; time-only fields cannot establish multi-day event duration.</p><p><b>Presentation privacy.</b> Incident locations are grouped into approximate 500 metre grid areas. Popups and unlocated downloads show broad categories and reporting years only. Incident IDs, street addresses, exact dates and times, detailed descriptions, unit identifiers and individual response durations are excluded from the distributed incident data. These generalized summaries reduce detail; they are not a guarantee of anonymity.</p><p><b>Incident locations.</b> Addresses were matched locally to <a href="${esc(D.sources.addresses.replace('/query',''))}" target="_blank" rel="noopener">official York Region address points</a> downloaded ${esc(D.sources.addressReferenceDate)}. No incident addresses were submitted to a geocoding service. Multiple matching reference points are accepted only within 50 metres; otherwise locations remain unmatched. Current address points may differ from historical incident locations.</p><p><b>Map filters.</b> The incident-status selector filters map points and matching coverage only. Charts and KPIs retain their stated non-cancelled and occupied-capacity definitions. Unmapped incidents remain in overall incident totals and the incident map, but not station metrics.</p><p><b>Station locations.</b> Coordinates were supplied by the user. Unit-code assignment indicates nominal station affiliation, not confirmed dispatch location. Estimated idle capacity does not account for training, inspections or maintenance. Basemap tiles are the only live map requests.</p>`;
  $('about-button').addEventListener('click',()=>$('about-dialog').showModal());
  $('close-about').addEventListener('click',()=>$('about-dialog').close());
  $('about-dialog').addEventListener('click',e=>{if(e.target===$('about-dialog'))$('about-dialog').close();});
  Chart.defaults.font.family='Inter, Segoe UI, Arial, sans-serif';Chart.defaults.color='#73838c';
  initMap();render();
  window.VFRS_APP={state,scope,annual,filterIncidents,isLocated,chartRows,selectStation,setView,map,charts};
})();
