'use strict';
window.VFRS_TRUCK_UI=(()=>{
 const $=id=>document.getElementById(id),D=window.VFRS_TRUCKS;
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>Number(v).toLocaleString('en-CA',{maximumFractionDigits:0}),f=v=>Number.isFinite(v)?v.toFixed(2):'—';
 let selection='all',current={station:'all',year:'all'},taskChart,deploymentChart;
 function records(){return D.records.filter(r=>r.year===current.year&&(current.station==='all'||String(r.station)===current.station)).sort((a,b)=>b.assignments-a.assignments||a.truck.localeCompare(b.truck));}
 function render(state){current={station:state.station,year:state.year};const rows=records();if(selection!=='all'&&!rows.some(r=>r.truck===selection))selection='all';
  $('truck-workload-scope').textContent=`${current.station==='all'?'All mapped stations':`Station 7-${current.station}`} · ${current.year==='all'?'2023–2025':current.year} · ${rows.length} vehicle IDs`;
  $('truck-select').innerHTML='<option value="all">All station trucks</option>'+rows.map(r=>`<option value="${esc(r.truck)}">${esc(r.truck)} · Station 7-${r.station}</option>`).join('');$('truck-select').value=selection;
  $('truck-workload-body').innerHTML=rows.map(r=>`<tr class="${r.truck===selection?'selected':''}"><td><button data-truck="${esc(r.truck)}">${esc(r.truck)}</button></td><td>${n(r.assignments)}</td><td>${f(r.mean)}</td><td>${f(r.p90)}</td><td>${f(r.occupied)}</td></tr>`).join('');
  tasks(rows);deploy();
 }
 function tasks(rows){const rs=selection==='all'?rows:rows.filter(r=>r.truck===selection),counts=new Map();for(const r of rs)for(const [t,k] of r.tasks)counts.set(t,(counts.get(t)||0)+k);
  const list=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));const top=list.slice(0,5);if(list.length>5)top.push(['Other incident types',list.slice(5).reduce((a,r)=>a+r[1],0)]);
  $('truck-task-scope').textContent=`${selection==='all'?'All selected station trucks':selection} · ${n(rs.reduce((a,r)=>a+r.assignments,0))} recorded assignments. Tasks mean incident types, not protocol requirements.`;
  $('truck-task-list').innerHTML=list.map(([t,k])=>`<div><dt>${esc(t)}</dt><dd>${n(k)}</dd></div>`).join('');
  taskChart?.destroy();taskChart=new Chart($('truck-task-chart'),{type:'bar',data:{labels:top.map(r=>r[0]),datasets:[{label:'Assignments',data:top.map(r=>r[1]),backgroundColor:'#355d78',maxBarThickness:22,borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,animation:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0,font:{size:10}},grid:{color:'#edf0ed'}},y:{grid:{display:false},ticks:{font:{size:10},callback:function(v){const label=this.getLabelForValue(v);return label.length>30?label.slice(0,28)+'…':label;}}}}}});
 }
 function deploy(){const period=$('truck-deployment-period').value,rows=D.deployment.filter(r=>r.year===current.year&&r.period===period&&(current.station==='all'||String(r.station)===current.station));$('truck-deployment-card').hidden=!rows.length;
  deploymentChart?.destroy();deploymentChart=null;if(!rows.length)return;
  $('truck-deployment-summary').innerHTML=rows.map(r=>`<p><b>Station 7-${r.station}</b><span>Neither ${f(r.none)}% · One ${f(r.one)}% · Two+ ${f(r.two)}%</span><small>${f(r.hours)} hours with two or more occupied</small></p>`).join('');
  deploymentChart=new Chart($('truck-deployment-chart'),{type:'bar',data:{labels:rows.map(r=>`7-${r.station}`),datasets:[['Neither','none','#60836e'],['One','one','#c79c68'],['Two or more','two','#b65c51']].map(([label,key,color])=>({label,data:rows.map(r=>r[key]),backgroundColor:color,maxBarThickness:50}))},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{position:'bottom',labels:{boxWidth:9,font:{size:10}}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${f(c.raw)}%`}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,min:0,max:100,ticks:{callback:v=>`${v}%`},grid:{color:'#edf0ed'}}}}});
 }
 $('truck-select').addEventListener('change',e=>{selection=e.target.value;render(current);});
 $('truck-workload-body').addEventListener('click',e=>{const b=e.target.closest('[data-truck]');if(b){selection=b.dataset.truck;render(current);}});
 $('truck-deployment-period').addEventListener('change',deploy);
 return {render};
})();
