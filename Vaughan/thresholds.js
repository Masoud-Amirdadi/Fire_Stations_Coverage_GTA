'use strict';
window.VFRS_THRESHOLDS = {
  summarize(incidents, station='all', year='all') {
    if (incidents === window.VFRS_DATA?.incidents && window.VFRS_DATA.thresholds) return window.VFRS_DATA.thresholds[`${station}|${year}`];
    let total=0,within4=0,within6=0;
    for(const incident of incidents) {
      if(year!=='all'&&String(incident.year)!==String(year))continue;
      for(const r of incident.responses) {
        if(r[1]===null||r[2]!==0||!Number.isFinite(r[3])||r[3]<0)continue;
        if(station!=='all'&&String(r[1])!==String(station))continue;
        total++;if(r[3]<=240)within4++;if(r[3]<=360)within6++;
      }
    }
    return {total,within4,within6,between4and6:within6-within4,above6:total-within6,rate4:total?within4/total:null,rate6:total?within6/total:null};
  }
};
