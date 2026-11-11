/* climate-data · Karte, Stationswahl, Datenladen */
(function(){
const DATA='data/';
let ST=null,map=null,locMarker=null,layerMet=null,layerQ=null,selLayer=null;
let LOC=null; // {lat,lon,elev,name}
const SEL={T:null,P:null,S:null,Q:null};
const LAB={T:'Temperatur',P:'Niederschlag',S:'Schneehöhe',Q:'Abfluss'};
const DEFAULT={lat:47.15,lon:9.06,T:'ELM',P:'WEE',S:'ELM',Q:'2372'};

/* ---------- geo helpers ---------- */
const R=6371;
function km(a,b,c,d){const p=Math.PI/180,x=Math.sin((c-a)*p/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin((d-b)*p/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function wgs84ToLv95(lat,lon){const p=(lat*3600-169028.66)/10000,l=(lon*3600-26782.5)/10000;
  const E=2600072.37+211455.93*l-10938.51*l*p-0.36*l*p*p-44.54*l*l*l;
  const N=1200147.07+308807.95*p+3745.25*l*l+76.63*p*p-194.56*l*l*p+119.79*p*p*p;return [E,N];}
async function jget(url){const r=await fetch(url);if(!r.ok)throw new Error(r.status+' '+url);return r.json();}
async function tget(url){const r=await fetch(url);if(!r.ok){if(r.status===404)return null;throw new Error(r.status+' '+url);}return new TextDecoder('windows-1252').decode(await r.arrayBuffer());}

/* ---------- MeteoSchweiz live: station list and daily data ---------- */
const MS='https://data.geo.admin.ch/ch.meteoschweiz.';
// variable -> candidate sources in order of preference [collection, column, homogenised]
const SRC={T:[['ogd-nbcn','ths200d0',1],['ogd-smn','tre200d0',0]],
           P:[['ogd-smn','rre150d0',0],['ogd-smn-precip','rre150d0',0],['ogd-nime','rre150d0',0]],
           S:[['ogd-nime','hto000d0',0],['ogd-smn','htoautd0',0]]};
const COLLS=['ogd-smn','ogd-nbcn','ogd-smn-precip','ogd-nime'];
function csvRows(t){const L=t.split(/\r?\n/).filter(Boolean);const h=L[0].split(';');return L.slice(1).map(l=>{const a=l.split(';'),o={};h.forEach((k,i)=>o[k]=a[i]);return o;});}
const yr=s=>s?+s.slice(6,10):null;
async function metStations(){
  const cacheKey='climate-data-stations-v1';
  try{const c=JSON.parse(sessionStorage.getItem(cacheKey)||'null');if(c&&Date.now()-c.t<6*3600e3)return c.d;}catch(e){}
  const res=await Promise.all(COLLS.flatMap(c=>[tget(`${MS}${c}/${c}_meta_stations.csv`),tget(`${MS}${c}/${c}_meta_datainventory.csv`)]));
  const st={},now=new Date().getFullYear();
  COLLS.forEach((c,i)=>{const meta=res[2*i],inv=res[2*i+1];if(!meta||!inv)return;
    for(const r of csvRows(meta)){const id=r.station_abbr;if(!id)continue;const s=st[id]||(st[id]={id,name:r.station_name,kt:r.station_canton,lat:+r.station_coordinates_wgs84_lat,lon:+r.station_coordinates_wgs84_lon,elev:Math.round(+r.station_height_masl),v:{}});}
    const inv_={};for(const r of csvRows(inv))inv_[r.station_abbr+'|'+r.parameter_shortname]=r;
    for(const k in SRC)for(const [coll,col,h] of SRC[k]){if(coll!==c)continue;
      for(const id in st){const r=inv_[id+'|'+col];if(!r)continue;const y0=yr(r.data_since),y1=yr(r.data_till)||now;if(!y0||y1-y0<10)continue;
        const old=st[id].v[k],cand=[y0,y1,h,coll,col];
        if(!old||(h&&!old[2])||(!old[2]&&!h&&y1-y0>old[1]-old[0]))st[id].v[k]=cand;}}});
  const d=Object.values(st).filter(s=>Object.keys(s.v).length&&isFinite(s.lat)&&isFinite(s.lon));
  try{sessionStorage.setItem(cacheKey,JSON.stringify({t:Date.now(),d}));}catch(e){}
  return d;
}
const NWK=52;
function weekGrid(daily,how){ // daily: [[y,doy,value]] -> {y0,g}
  const acc={};for(const [y,doy,v] of daily){const a=acc[y]||(acc[y]=Array.from({length:NWK},()=>[0,0]));const w=Math.min(Math.floor(doy/7),NWK-1);a[w][0]+=v;a[w][1]++;}
  const ys=Object.keys(acc).map(Number).filter(y=>acc[y].filter(x=>x[1]>=4).length>=8).sort((a,b)=>a-b);if(!ys.length)return null;
  const g=[];for(let y=ys[0];y<=ys[ys.length-1];y++){const a=acc[y];g.push(a?a.map(([s,n])=>n<4?null:how==='sum7'?Math.round(s*7/n*10)/10:Math.round(s/n*10)/10):Array(NWK).fill(null));}
  return {y0:ys[0],g};
}
/* ---------- further networks: Agrometeo (Agroscope & cantons), own CSV ---------- */
const AGRO='https://www.agrometeo.ch/backend/api/';
const SRCNAME={meteoswiss:'MeteoSchweiz',agrometeo:'Agrometeo',user:'eigene Daten'};
const titleCase=t=>t.toLowerCase().replace(/(^|[\s\-\/(])([a-zäöüéèà])/g,(m,a,b)=>a+b.toUpperCase());
async function agroStations(){
  const j=await jget(AGRO+'stations?lang=de');const now=new Date(),cut=now.getTime()-90*864e5;
  return (j.data||[]).filter(s=>s.active&&s.data_until&&Date.parse(s.data_until)>cut&&s.into_service_at).map(s=>{
    const d0=new Date(s.into_service_at),y0=d0.getUTCMonth()>0||d0.getUTCDate()>1?d0.getUTCFullYear()+1:d0.getUTCFullYear(),y1=now.getFullYear();
    return {id:'AG'+s.id,agId:s.id,src:'agrometeo',name:titleCase(s.name),kt:'',lat:+s.lat_dec,lon:+s.long_dec,elev:s.altitude,since:s.into_service_at,v:{T:[y0,y1,0,'agrometeo','1'],P:[y0,y1,0,'agrometeo','6']}};})
    .filter(s=>isFinite(s.lat)&&isFinite(s.lon)&&s.lat>45&&s.lat<48.5);
}
const agroCache={};
function agroDaily(s){
  if(agroCache[s.id])return agroCache[s.id];
  const to=new Date().toISOString().slice(0,10);
  const u=`${AGRO}meteo/data?from=${s.since}&to=${to}&scale=day&sensors=${encodeURIComponent('1:avg,1:min,1:max,6:sum')}&stations=${s.agId}`;
  return agroCache[s.id]=jget(u).then(j=>{const T={},P={};const a=s.agId;
    for(const r of j.data||[]){const y=+r.date.slice(0,4),m=+r.date.slice(5,7),d=+r.date.slice(8,10);const doy=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,1))/864e5);
      const num=v=>v===''||v==null?null:+v;const tm=num(r[`${a}_1_avg`]),tn=num(r[`${a}_1_min`]),tx=num(r[`${a}_1_max`]),pp=num(r[`${a}_6_sum`]);
      if(tm!=null){const e=T[y]||(T[y]={mean:new Array(366).fill(null),min:new Array(366).fill(null),max:new Array(366).fill(null)});e.mean[doy]=tm;e.min[doy]=tn;e.max[doy]=tx;}
      if(pp!=null){const e=P[y]||(P[y]={mean:new Array(366).fill(null),min:[],max:[]});e.mean[doy]=pp;}}
    return {T,P};});
}
function extToSeries(ext,k){const daily=[];for(const y in ext){const m=ext[y].mean;for(let i=0;i<m.length;i++)if(m[i]!=null)daily.push([+y,i,m[i]]);}
  const gr=weekGrid(daily,k==='P'?'sum7':'mean');if(!gr)return null;gr.ann=k==='T'?annualT(ext):k==='P'?annualP(ext):null;return gr;}
async function metSeries(id,k){
  const s=ST.met.find(x=>x.id===id);if(!s||!s.v[k])return null;
  if(s.src==='agrometeo'){const d=await agroDaily(s);return extToSeries(d[k]||{},k);}
  if(s.src==='user')return s.data[k]?extToSeries(s.data[k],k):null;const [,, ,coll,col]=s.v[k];const ab=id.toLowerCase();
  const parts=await Promise.all(['historical','recent'].map(p=>tget(`${MS}${coll}/${ab}/${coll}_${ab}_d_${p}.csv`)));
  const daily=[],ext={};  // ext[year] = {mean:[],min:[],max:[]} per day of year (T) or {p:[]} (P)
  const cMin=col.replace(/d0$/,'dn'),cMax=col.replace(/d0$/,'dx');
  for(const t of parts){if(!t)continue;const L=t.split(/\r?\n/);const h=L[0].split(';');const ti=h.indexOf('reference_timestamp'),ci=h.indexOf(col);if(ci<0)continue;
    const ni=k==='T'?h.indexOf(cMin):-1,xi=k==='T'?h.indexOf(cMax):-1;
    for(let i=1;i<L.length;i++){const a=L[i].split(';');const v=a[ci];if(v===undefined||v===''||v==='-')continue;const ts=a[ti];const d=+ts.slice(0,2),m=+ts.slice(3,5),y=+ts.slice(6,10);
      const doy=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,1))/864e5);daily.push([y,doy,+v]);
      if(k==='T'||k==='P'){const e=ext[y]||(ext[y]={mean:new Array(366).fill(null),min:new Array(366).fill(null),max:new Array(366).fill(null)});e.mean[doy]=+v;
        if(ni>=0&&a[ni]!==''&&a[ni]!==undefined)e.min[doy]=+a[ni];if(xi>=0&&a[xi]!==''&&a[xi]!==undefined)e.max[doy]=+a[xi];}}}
  const gr=weekGrid(daily,k==='P'?'sum7':'mean');if(!gr)return null;
  gr.ann=k==='T'?annualT(ext):k==='P'?annualP(ext):null;
  return gr;
}
/* yearly landscape indicators from daily values */
function annualT(ext){
  const out={year:[],vs:[],ve:[],vl:[],lastFrost:[],frostAfter:[],frost:[],summer:[],hot:[],trop:[]};
  const thisYear=new Date().getFullYear();
  for(const y of Object.keys(ext).map(Number).sort((a,b)=>a-b)){if(y>=thisYear)continue;const e=ext[y];const n=e.mean.filter(v=>v!=null).length;if(n<330)continue;
    const T=e.mean,run=(i,f)=>{for(let j=0;j<6;j++){const v=T[i+j];if(v==null||!f(v))return false;}return true;};
    let vs=null,ve=null;for(let i=0;i<300;i++)if(run(i,v=>v>5)){vs=i;break;}
    for(let i=181;i<360;i++)if(run(i,v=>v<5)){ve=i-1;break;}if(vs!=null&&ve==null)ve=364;
    const nMin=e.min.filter(v=>v!=null).length,nMax=e.max.filter(v=>v!=null).length;
    let lf=null,fa=0,fr=0,su=0,ho=0,tr=0;
    if(nMin>=330){for(let i=0;i<181;i++)if(e.min[i]!=null&&e.min[i]<0)lf=i;
      for(let i=0;i<366;i++){const m=e.min[i];if(m==null)continue;if(m<0){fr++;if(vs!=null&&i>=vs&&i<181)fa++;}if(m>=20)tr++;}}
    if(nMax>=330)for(let i=0;i<366;i++){const x=e.max[i];if(x==null)continue;if(x>=25)su++;if(x>=30)ho++;}
    out.year.push(y);out.vs.push(vs);out.ve.push(ve);out.vl.push(vs!=null&&ve!=null?ve-vs+1:null);
    out.lastFrost.push(nMin>=330?lf:null);out.frostAfter.push(nMin>=330&&vs!=null?fa:null);out.frost.push(nMin>=330?fr:null);
    out.summer.push(nMax>=330?su:null);out.hot.push(nMax>=330?ho:null);out.trop.push(nMin>=330?tr:null);}
  return out;
}
function annualP(ext){
  const out={year:[],dry:[],heavy:[]};const thisYear=new Date().getFullYear();
  for(const y of Object.keys(ext).map(Number).sort((a,b)=>a-b)){if(y>=thisYear)continue;const P=ext[y].mean;if(P.filter(v=>v!=null).length<330)continue;
    let run=0,mx=0,hv=0;for(let i=0;i<366;i++){const v=P[i];if(v==null)continue;if(v>=20)hv++;if(i>=90&&i<273){if(v<1){run++;mx=Math.max(mx,run);}else run=0;}}
    out.year.push(y);out.dry.push(mx);out.heavy.push(hv);}
  return out;
}

/* ---------- basin (BAFU Hydrologischer Atlas) & rivers ---------- */
const API='https://api3.geo.admin.ch/rest/services/api/MapServer/identify';
let BASIN=null,BIL=null,RIVERS=[],MAINRIVER=null,basinLayer=null,bilLayer=null,riverLayer=null,riverTiles=null;
function identifyPoint(layer,lat,lon){const d=0.05;return jget(`${API}?geometryType=esriGeometryPoint&geometry=${lon},${lat}&sr=4326&layers=all:${layer}&tolerance=0&mapExtent=${lon-d},${lat-d},${lon+d},${lat+d}&imageDisplay=1000,1000,96&returnGeometry=true&geometryFormat=geojson&lang=de`).then(j=>(j.results||[])[0]||null);}
function bboxOf(g){let a=[180,90,-180,-90];const walk=c=>{if(typeof c[0]==='number'){a[0]=Math.min(a[0],c[0]);a[1]=Math.min(a[1],c[1]);a[2]=Math.max(a[2],c[0]);a[3]=Math.max(a[3],c[1]);}else c.forEach(walk);};walk(g.coordinates);return a;}
function inRing(x,y,r){let ins=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins;}return ins;}
function inGeom(lon,lat,g){if(!g)return false;const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  return polys.some(p=>inRing(lon,lat,p[0])&&!p.slice(1).some(h=>inRing(lon,lat,h)));}
function segDist(lat,lon,a,b){const kx=111.32*Math.cos(lat*Math.PI/180),ky=110.57;const ax=(a[0]-lon)*kx,ay=(a[1]-lat)*ky,bx=(b[0]-lon)*kx,by=(b[1]-lat)*ky;
  const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?-(ax*dx+ay*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(ax+t*dx,ay+t*dy);}
function distToFeature(lat,lon,f){let m=1e9;const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;for(const l of lines)for(let i=1;i<l.length;i++)m=Math.min(m,segDist(lat,lon,l[i-1],l[i]));return m;}
async function loadBasin(lat,lon){
  BASIN=BIL=MAINRIVER=null;RIVERS=[];
  try{
    const [fg,bg]=await Promise.all([identifyPoint('ch.bafu.hydrologischer-atlas_flussgebiete',lat,lon),identifyPoint('ch.bafu.hydrologischer-atlas_bilanzgebiete',lat,lon)]);
    BASIN=fg;BIL=bg;
    if(BASIN){const b=bboxOf(BASIN.geometry);
      const j=await jget(`${API}?geometryType=esriGeometryEnvelope&geometry=${b.join(',')}&sr=4326&layers=all:ch.bafu.vec25-gewaessernetz_2000&tolerance=0&mapExtent=${b.join(',')}&imageDisplay=1000,1000,96&returnGeometry=true&geometryFormat=geojson&limit=500`);
      RIVERS=(j.results||[]).filter(f=>{const c=f.geometry.type==='LineString'?f.geometry.coordinates:f.geometry.coordinates.flat();return c.some(p=>inGeom(p[0],p[1],BASIN.geometry));})
        .map(f=>({type:'Feature',properties:f.properties,geometry:f.geometry}));
      let best=null,bd=1e9;for(const f of RIVERS){if(!f.properties.name||!f.properties.name.trim())continue;const d=distToFeature(lat,lon,f);if(d<bd){bd=d;best=f;}}
      if(best)MAINRIVER={name:best.properties.name.trim(),gwlnr:best.properties.gwlnr,d:bd};}
  }catch(e){console.warn('basin',e);}
  const el=document.getElementById('basinInfo');
  el.innerHTML=BASIN?`Flussgebiet <b>${BASIN.properties.flussgb}</b> (${BASIN.properties.flaeche} km²)${BIL?` · Bilanzgebiet ${BIL.properties.nummer}`:''}${MAINRIVER?`<br>Nächster grösserer Fluss: <b>${MAINRIVER.name}</b>, ${MAINRIVER.d.toFixed(1)} km`:''}`:'Flussgebiet: nicht gefunden (ausserhalb der Schweiz?)';
  drawBasin();
}
function onMainRiver(s){if(!MAINRIVER)return false;return RIVERS.some(f=>f.properties.gwlnr===MAINRIVER.gwlnr&&distToFeature(s.lat,s.lon,f)<0.6);}
function drawBasin(){
  if(!map)return;basinLayer.clearLayers();bilLayer.clearLayers();riverLayer.clearLayers();
  if(BASIN&&document.getElementById('chkBasin').checked)L.geoJSON(BASIN.geometry,{style:{color:'#eeeeee',weight:1.5,fill:true,fillColor:'#ffffff',fillOpacity:0.04,interactive:false}}).addTo(basinLayer);
  if(BIL&&document.getElementById('chkBil').checked)L.geoJSON(BIL.geometry,{style:{color:'#ccccff',weight:1.2,dashArray:'4 4',fillOpacity:0,interactive:false}}).addTo(bilLayer);
  if(RIVERS.length&&document.getElementById('chkRivers').checked)L.geoJSON({type:'FeatureCollection',features:RIVERS},{style:f=>({color:MAINRIVER&&f.properties.gwlnr===MAINRIVER.gwlnr?'#9fdcff':'#3f87c4',weight:MAINRIVER&&f.properties.gwlnr===MAINRIVER.gwlnr?3:1.4,opacity:0.95}),
    onEachFeature:(f,l)=>{if(f.properties.name&&f.properties.name.trim())l.bindTooltip(f.properties.name.trim());}}).addTo(riverLayer);
}

/* ---------- candidates ---------- */
function len(s,k){const v=s.v&&s.v[k];return v?v[1]-v[0]+1:0;}
const radius=()=>+document.getElementById('radius').value;
const preferBasin=()=>document.getElementById('chkSameBasin').checked;
function candidates(k){
  if(!ST||!LOC)return [];
  const h=LOC.elev,R=radius(),pb=preferBasin()&&BASIN;
  const sameB=s=>BASIN?inGeom(s.lon,s.lat,BASIN.geometry):false;
  if(k==='Q'){return ST.hydro.map(s=>{const d=km(LOC.lat,LOC.lon,s.lat,s.lon),n=s.y[1]-s.y[0]+1,sb=sameB(s),onR=sb&&onMainRiver(s);
      return {s,d,sb,onR,score:d-Math.min(n,40)/8+(pb&&!sb?R:0)-(pb&&onR?8:0)};})
    .filter(o=>o.d<=R).sort((a,b)=>a.score-b.score).slice(0,10);}
  return ST.met.filter(s=>s.v&&s.v[k]&&(len(s,k)>=15||(s.src&&s.src!=='meteoswiss'&&len(s,k)>=5))).map(s=>{
    const d=km(LOC.lat,LOC.lon,s.lat,s.lon),dh=h==null||s.elev==null?0:Math.abs(s.elev-h),n=len(s,k),hom=s.v[k][2],sb=sameB(s);
    let score;
    if(k==='T')score=d+dh/40-(hom?6:0)-Math.min(n,150)/30;
    else if(k==='P')score=d+dh/100-Math.min(n,150)/15;
    else score=d+dh/30-Math.min(n,80)/20;
    if(pb&&!sb)score+=R*0.5;
    return {s,d,sb,score};}).filter(o=>o.d<=R).sort((a,b)=>a.score-b.score).slice(0,10);
}
function optLabel(k,o){const s=o.s,mark=o.sb?'◆ ':'';
  if(k==='Q')return `${mark}${s.name} · ${o.d.toFixed(0)} km${o.onR?' · am '+MAINRIVER.name:''} · ${s.y[0]}–${s.y[1]}${s.area?` · ${Math.round(s.area)} km²`:''}`;
  const v=s.v[k],tag=s.src&&s.src!=='meteoswiss'?` · ${SRCNAME[s.src]}`:` (${s.id})`;return `${mark}${s.name}${tag} · ${o.d.toFixed(0)} km · ${s.elev??'?'} m · ${v[0]}–${v[1]}${v[2]?' · homogenisiert':''}`;}

function fillSelects(preset){
  for(const k of ['T','P','S','Q']){
    const c=candidates(k),sel=document.getElementById('sel'+k),prev=preset&&preset[k]!==undefined?preset[k]:SEL[k];
    sel.innerHTML=c.length?c.map(o=>`<option value="${o.s.id}">${optLabel(k,o)}</option>`).join(''):`<option value="">keine Station im Radius von ${radius()} km</option>`;
    if((k==='S'||k==='Q')&&c.length)sel.insertAdjacentHTML('beforeend','<option value="">– ohne –</option>');
    if(prev&&[...sel.options].some(o=>o.value===prev))sel.value=prev;
    SEL[k]=sel.value||null;
  }
}

/* ---------- map ---------- */
function initMap(){
  if(typeof L==='undefined'){document.getElementById('map').innerHTML='<p class="note" style="padding:16px">Die Karte konnte nicht geladen werden. Ort über die Suche wählen.</p>';map=null;return;}
  map=L.map('map',{zoomControl:true,attributionControl:true,minZoom:7,maxBounds:[[45.4,5.4],[48.2,11.0]]}).setView([46.8,8.2],8);
  const W='https://wmts.geo.admin.ch/1.0.0/';
  const bases={relief:L.tileLayer(W+'ch.swisstopo.leichte-basiskarte_reliefschattierung/default/current/3857/{z}/{x}/{y}.png',{maxZoom:17,className:'basemap',attribution:'© swisstopo, BAFU'}),
    lk:L.tileLayer(W+'ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg',{maxZoom:17,className:'basemap',attribution:'© swisstopo, BAFU'})};
  let base='relief';try{base=localStorage.getItem('climate-data-base')||'relief';}catch(e){}if(!bases[base])base='relief';bases[base].addTo(map);
  document.querySelectorAll('#baseSeg button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.b===base));b.onclick=()=>{map.removeLayer(bases[base]);base=b.dataset.b;bases[base].addTo(map).bringToBack();
    document.querySelectorAll('#baseSeg button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.b===base)));try{localStorage.setItem('climate-data-base',base);}catch(e){}};});
  riverTiles=L.layerGroup([L.tileLayer(W+'ch.bafu.vec25-gewaessernetz_2000/default/current/3857/{z}/{x}/{y}.png',{maxZoom:10,opacity:0.85}),
    L.tileLayer(W+'ch.swisstopo.vec25-gewaessernetz_referenz/default/current/3857/{z}/{x}/{y}.png',{maxZoom:17,minZoom:11,opacity:0.8})]);
  basinLayer=L.layerGroup().addTo(map);bilLayer=L.layerGroup().addTo(map);riverLayer=L.layerGroup().addTo(map);
  layerMet=L.layerGroup().addTo(map);layerQ=L.layerGroup().addTo(map);selLayer=L.layerGroup().addTo(map);
  if(document.getElementById('chkRivers').checked)riverTiles.addTo(map);
  for(const s of ST.met)L.circleMarker([s.lat,s.lon],s.src==='agrometeo'?{radius:2.8,weight:1,color:'#d7b66d',fillColor:'#2a2414',fillOpacity:0.9}:s.src==='user'?{radius:4,weight:2,color:'#ccccff',fillColor:'#000',fillOpacity:1}:{radius:s.v.T&&s.v.T[2]?3.5:2.5,weight:1,color:'#8d8d8d',fillColor:s.v.T?'#eeeeee':'#666666',fillOpacity:0.9})
    .bindTooltip(`${s.name} ${s.src&&s.src!=='meteoswiss'?'· '+SRCNAME[s.src]:'('+s.id+')'} · ${s.elev??'?'} m<br>${Object.entries(s.v).map(([k,v])=>`${LAB[k]} ${v[0]}–${v[1]}${v[2]?' hom.':''}`).join('<br>')}`).addTo(layerMet);
  for(const s of ST.hydro)L.circleMarker([s.lat,s.lon],{radius:3.5,weight:1,color:'#3f87c4',fillColor:'#9fdcff',fillOpacity:0.95})
    .bindTooltip(`${s.name} (${s.id})<br>Abfluss ${s.y[0]}–${s.y[1]}${s.area?`<br>Einzugsgebiet ${Math.round(s.area)} km²`:''}`).addTo(layerQ);
  map.on('click',e=>setLocation(e.latlng.lat,e.latlng.lng));
  const tog=(id,fn)=>document.getElementById(id).addEventListener('change',fn);
  tog('chkBasin',drawBasin);tog('chkBil',drawBasin);
  tog('chkRivers',e=>{e.target.checked?riverTiles.addTo(map):map.removeLayer(riverTiles);drawBasin();});
  tog('chkStations',e=>{if(e.target.checked){layerMet.addTo(map);layerQ.addTo(map);}else{map.removeLayer(layerMet);map.removeLayer(layerQ);}});
}
let radCircle=null;
function drawSelection(){
  if(!map)return;selLayer.clearLayers();if(!LOC)return;
  if(!locMarker)locMarker=L.circleMarker([LOC.lat,LOC.lon],{radius:7,weight:3,color:'#ffffff',fillColor:'#000',fillOpacity:1}).addTo(map);
  locMarker.setLatLng([LOC.lat,LOC.lon]);
  L.circle([LOC.lat,LOC.lon],{radius:radius()*1000,color:'#666',weight:1,dashArray:'2 6',fill:false,interactive:false}).addTo(selLayer);
  for(const k of ['T','P','S','Q']){const id=SEL[k];if(!id)continue;const s=(k==='Q'?ST.hydro:ST.met).find(x=>x.id===id);if(!s)continue;
    L.polyline([[LOC.lat,LOC.lon],[s.lat,s.lon]],{color:COL[k],weight:1.5,dashArray:'4 4',opacity:0.95}).addTo(selLayer);
    L.circleMarker([s.lat,s.lon],{radius:6,weight:2,color:COL[k],fillColor:'#000',fillOpacity:1}).bindTooltip(`${LAB[k]}: ${s.name}`).addTo(selLayer);}
}
const COL={T:'#e8775f',P:'#5a9ccc',S:'#b9a6ff',Q:'#3fbf8f'};

/* ---------- location ---------- */
async function setLocation(lat,lon,preset){
  LOC={lat,lon,elev:null,name:`${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E`};
  document.getElementById('locTitle').textContent='Ort wird gesucht …';
  if(map&&locMarker)locMarker.setLatLng([lat,lon]);
  const [E,N]=wgs84ToLv95(lat,lon);
  const tasks=[
    jget(`https://api3.geo.admin.ch/rest/services/height?easting=${E.toFixed(1)}&northing=${N.toFixed(1)}&sr=2056`).then(j=>{LOC.elev=Math.round(+j.height);}).catch(()=>{}),
    jget(`${API}?geometryType=esriGeometryPoint&geometry=${E.toFixed(1)},${N.toFixed(1)}&sr=2056&layers=all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill&tolerance=0&returnGeometry=false&lang=de`)
      .then(j=>{const a=j.results&&j.results[0]&&j.results[0].attributes;if(a)LOC.name=a.gemname||a.label||LOC.name;}).catch(()=>{}),
    loadBasin(lat,lon)];
  await Promise.race([Promise.all(tasks),new Promise(r=>setTimeout(r,4000))]);
  if(LOC.elev==null){const n=ST.met.slice().sort((a,b)=>km(lat,lon,a.lat,a.lon)-km(lat,lon,b.lat,b.lon))[0];LOC.elev=n?n.elev:null;}
  document.getElementById('locTitle').textContent=LOC.name;
  document.getElementById('locInfo').textContent=`${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E${LOC.elev!=null?` · ${LOC.elev} m ü. M.`:''}`;
  fillSelects(preset||{T:null,P:null,S:null,Q:null});drawSelection();await loadData();
}
function reselect(){fillSelects();drawSelection();loadData();}

/* ---------- data ---------- */
const cache={};
async function loadSeries(kind,id){const key=kind+id;if(!cache[key])cache[key]=jget(`${DATA}${kind}/${id}.json`);return cache[key];}
async function loadData(){
  const status=document.getElementById('selNote');status.textContent='Daten werden live bei MeteoSchweiz geladen …';
  try{
    const out={},names={},elev={};
    const jobs=['T','P','S'].filter(k=>SEL[k]).map(async k=>{const key=k+SEL[k];if(!cache[key])cache[key]=metSeries(SEL[k],k);const gr=await cache[key];
      const s=ST.met.find(x=>x.id===SEL[k]);if(gr)out[k]={y0:gr.y0,g:gr.g,ann:gr.ann};if(k==='T')elev.Th=!!(s&&s.v.T&&s.v.T[2]);names[k]=s?s.name+(s.src&&s.src!=='meteoswiss'?` (${SRCNAME[s.src]})`:''):SEL[k];elev[k]=s?s.elev:null;});
    if(SEL.Q)jobs.push(loadSeries('q',SEL.Q).then(j=>{out.Q={y0:j.y0,g:j.g};const s=ST.hydro.find(x=>x.id===SEL.Q);names.Q=s?s.name:SEL.Q;}).catch(()=>{}));
    await Promise.all(jobs);
    if(FILL!=='warn')for(const k of ['T','P'])if(out[k]){try{await extendSeries(k,out[k]);}catch(e){console.warn('extend',e);}}
    window.KK.setData(out,names,elev,LOC);
    status.textContent='';
  }catch(e){status.textContent='Daten konnten nicht geladen werden: '+e.message;}
  const q=new URLSearchParams({lat:LOC.lat.toFixed(4),lon:LOC.lon.toFixed(4),r:radius()});for(const k in SEL)q.set(k,SEL[k]||'');
  history.replaceState(null,'','?'+q.toString());
}

/* ---------- short records: reconstruct the reference period from long-term stations ---------- */
let FILL='warn';try{FILL=localStorage.getItem('climate-data-fill')||'warn';}catch(e){}
const CH_IDS=['BAS','BER','GVE','LUG','SIO','DAV','SMA','NEU','LUZ','CHU','STG','ALT'];
function regionStations(k,tgtId,y0){
  const long=ST.met.filter(s=>s.src==='meteoswiss'&&s.id!==tgtId&&s.v[k]&&s.v[k][0]<=Math.min(1931,y0-10)&&s.v[k][1]>=2020);
  if(FILL==='ch'){const l=long.filter(s=>CH_IDS.includes(s.id));return (k==='T'?l.filter(s=>s.v.T[2]):l).slice(0,8);}
  const c=long.map(s=>({s,d:km(LOC.lat,LOC.lon,s.lat,s.lon)})).filter(o=>o.d<=120);
  c.sort((a,b)=>(a.d-(k==='T'&&a.s.v.T[2]?15:0))-(b.d-(k==='T'&&b.s.v.T[2]?15:0)));return c.slice(0,3).map(o=>o.s);
}
async function extendSeries(k,tgt){
  const regs=regionStations(k,SEL[k],tgt.y0);if(!regs.length)return;
  const grids=(await Promise.all(regs.map(async s=>{const key=k+s.id;if(!cache[key])cache[key]=metSeries(s.id,k);return [s,await cache[key]];}))).filter(([,g])=>g);
  if(!grids.length)return;const y0=Math.min(...grids.map(([,g])=>g.y0));if(y0>=tgt.y0-5)return;
  const at=(g,y,w)=>{const r=g.g[y-g.y0];return r?r[w]:null;};
  // weekly means over the overlap (= measured target years) for target and each station
  const ov=[];for(let y=tgt.y0;y<=Math.min(tgt.y0+tgt.g.length-1,2025);y++){const r=tgt.g[y-tgt.y0];if(r&&r.filter(x=>x!=null).length>=40)ov.push(y);}
  if(ov.length<8)return;
  const wmean=(g)=>[...Array(52).keys()].map(w=>{let s=0,n=0;for(const y of ov){const v=at(g,y,w);if(v!=null&&at(tgt,y,w)!=null){s+=v;n++;}}return n>=Math.max(5,ov.length*0.5)?s/n:null;});
  const mt=wmean(tgt),ms=grids.map(([,g])=>wmean(g));
  const rows=[];
  for(let y=y0;y<tgt.y0;y++){const row=[];for(let w=0;w<52;w++){let s=0,n=0;
      grids.forEach(([,g],i)=>{const v=at(g,y,w),m=ms[i][w];if(v==null||m==null)return;if(k==='P'){if(m>0.5){s+=v/m;n++;}}else{s+=v-m;n++;}});
      row.push(n&&mt[w]!=null?Math.round((k==='P'?mt[w]*s/n:mt[w]+s/n)*10)/10:null);}
    rows.push(row);}
  tgt.g=rows.concat(tgt.g);tgt.recon={y1:tgt.y0-1,src:(FILL==='ch'?'Schweizer Langzeitstationen (':'Langzeitstationen der Region (')+grids.map(([s])=>s.name).join(', ')+')'};tgt.y0=y0;
}
function initFill(){const seg=document.getElementById('fillSeg');if(!seg)return;const sync=()=>seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.f===FILL)));sync();
  seg.querySelectorAll('button').forEach(b=>b.onclick=()=>{FILL=b.dataset.f;try{localStorage.setItem('climate-data-fill',FILL);}catch(e){}sync();
    for(const key in cache)if(key.startsWith('T')||key.startsWith('P'))delete cache[key];if(FILL==='ch')document.getElementById('selNote').textContent='Lädt Schweizer Langzeitstationen …';loadData();});}

/* ---------- own measurement series (CSV) ---------- */
function parseCSV(text){
  const lines=text.replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim());if(lines.length<20)throw new Error('zu wenige Zeilen');
  const delim=[';','\t',','].map(d=>[d,lines[0].split(d).length]).sort((a,b)=>b[1]-a[1])[0][0];
  const head=lines[0].split(delim).map(h=>h.trim().toLowerCase().replace(/"/g,''));
  const di=head.findIndex(h=>/date|datum|time|zeit|timestamp|tag/.test(h));if(di<0)throw new Error('keine Datumsspalte gefunden');
  const find=re=>head.findIndex((h,i)=>i!==di&&re.test(h));
  const col={T:find(/^(?!.*(min|max|boden|soil|dn|dx)).*(temp|tre200|ths200|°c|lufttemp|tavg|tmean|^t$)/),Tn:find(/(tmin|min.*temp|temp.*min|tre200dn|ths200dn)/),Tx:find(/(tmax|max.*temp|temp.*max|tre200dx|ths200dx)/),
    P:find(/(nieder|precip|rre150|regen|rain|^p$|mm)/),S:find(/(schnee|snow|hto|^hs$)/)};
  const parseDate=v=>{v=v.replace(/"/g,'').trim();let m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return [+m[1],+m[2],+m[3]];m=v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);if(m)return [+m[3],+m[2],+m[1]];m=v.match(/^(\d{4})(\d{2})(\d{2})/);if(m)return [+m[1],+m[2],+m[3]];return null;};
  const acc={};
  for(const l of lines.slice(1)){const a=l.split(delim);const d=parseDate(a[di]||'');if(!d)continue;const key=d.join('-');const o=acc[key]||(acc[key]={d,T:[],Tn:[],Tx:[],P:[],S:[]});
    for(const k in col){const i=col[k];if(i<0)continue;const v=parseFloat((a[i]||'').replace(',','.'));if(isFinite(v))o[k].push(v);}}
  const ext={T:{},P:{},S:{}};const mk=()=>({mean:new Array(366).fill(null),min:new Array(366).fill(null),max:new Array(366).fill(null)});
  for(const key in acc){const o=acc[key],[y,m,d]=o.d,doy=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,1))/864e5);const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
    if(o.T.length||o.Tn.length){const e=ext.T[y]||(ext.T[y]=mk());e.mean[doy]=o.T.length?avg(o.T):(o.Tn.length&&o.Tx.length?(avg(o.Tn)+avg(o.Tx))/2:null);e.min[doy]=o.Tn.length?Math.min(...o.Tn):(o.T.length>1?Math.min(...o.T):null);e.max[doy]=o.Tx.length?Math.max(...o.Tx):(o.T.length>1?Math.max(...o.T):null);}
    if(o.P.length){const e=ext.P[y]||(ext.P[y]=mk());e.mean[doy]=o.P.reduce((s,x)=>s+x,0);}
    if(o.S.length){const e=ext.S[y]||(ext.S[y]=mk());e.mean[doy]=avg(o.S);}}
  const range=k=>{const ys=Object.keys(ext[k]).map(Number).sort((a,b)=>a-b);return ys.length?[ys[0],ys[ys.length-1]]:null;};
  return {ext,range,found:Object.keys(col).filter(k=>col[k]>=0)};
}
let userN=0;
function initUpload(){
  const btn=document.getElementById('upAdd');if(!btn)return;const note=document.getElementById('upNote');
  btn.onclick=async()=>{const f=document.getElementById('upFile').files[0];if(!f){note.textContent='Bitte eine CSV-Datei wählen.';return;}
    try{const r=parseCSV(await f.text());const v={};for(const k of ['T','P','S']){const rg=r.range(k);if(rg)v[k]=[rg[0],rg[1],0,'user',k];}
      if(!Object.keys(v).length)throw new Error('keine Spalte für Temperatur, Niederschlag oder Schnee erkannt');
      const id='USR'+(++userN),name=document.getElementById('upName').value.trim()||f.name.replace(/\.[^.]+$/,''),elev=+document.getElementById('upElev').value||LOC.elev;
      const st={id,src:'user',name,kt:'',lat:LOC.lat,lon:LOC.lon,elev,v,data:r.ext};ST.met.push(st);
      if(map)L.circleMarker([st.lat,st.lon],{radius:4,weight:2,color:'#ccccff',fillColor:'#000',fillOpacity:1}).bindTooltip(`${name} · eigene Daten`).addTo(layerMet);
      const pre={};for(const k in v)pre[k]=id;fillSelects(Object.assign({T:SEL.T,P:SEL.P,S:SEL.S,Q:SEL.Q},pre));drawSelection();await loadData();
      note.textContent=`Hinzugefügt: ${Object.keys(v).map(k=>LAB[k]+' '+v[k][0]+'–'+v[k][1]).join(', ')}. Die Daten bleiben in diesem Browserfenster und werden nicht hochgeladen.`;
    }catch(e){note.textContent='Datei konnte nicht gelesen werden: '+e.message;}};
}

/* ---------- downloads: GeoJSON & map SVG ---------- */
function dlJSON(obj,name){window.CDX.save(new Blob([JSON.stringify(obj)],{type:'application/geo+json'}),name);}
const fileBase=()=>window.CDX.slug((LOC&&LOC.name)||'ort');
function stationFeatures(){const f=[{type:'Feature',properties:{role:'Ort',name:LOC.name,elev:LOC.elev},geometry:{type:'Point',coordinates:[LOC.lon,LOC.lat]}}];
  for(const k of ['T','P','S','Q']){const id=SEL[k];if(!id)continue;const s=(k==='Q'?ST.hydro:ST.met).find(x=>x.id===id);if(s)f.push({type:'Feature',properties:{role:LAB[k],id:s.id,name:s.name,elev:s.elev??null},geometry:{type:'Point',coordinates:[s.lon,s.lat]}});}
  return f;}
function mapSvg(){
  const ink=getComputedStyle(document.documentElement).getPropertyValue(window.CDX.mode==='dark'?'--ink':'--ink').trim();
  const dark=window.CDX.mode==='dark',INK=dark?'#111111':'#eeeeee',INK3=dark?'#6b6b6b':'#8d8d8d',RIV=dark?'#1f5f9e':'#7fc4f0';
  const geoms=[];if(BASIN)geoms.push(BASIN.geometry);const pts=stationFeatures().map(f=>f.geometry.coordinates);
  let b=BASIN?bboxOf(BASIN.geometry):[LOC.lon-0.3,LOC.lat-0.2,LOC.lon+0.3,LOC.lat+0.2];pts.forEach(([x,y])=>{b=[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)];});
  const kx=Math.cos((b[1]+b[3])/2*Math.PI/180),W=900,pad=30,sc=(W-2*pad)/((b[2]-b[0])*kx),H=Math.round((b[3]-b[1])*sc+2*pad+40);
  const X=x=>(pad+(x-b[0])*kx*sc).toFixed(1),Y=y=>(40+pad+(b[3]-y)*sc).toFixed(1);
  const ring=r=>'M'+r.map(p=>X(p[0])+','+Y(p[1])).join('L')+'Z';
  const polyPath=g=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(p=>p.map(ring).join('')).join('');
  const line=c=>'M'+c.map(p=>X(p[0])+','+Y(p[1])).join('L');
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W*2}" height="${H*2}" style="font-family:Geist Mono,monospace">`;
  s+=`<text x="${pad}" y="22" font-size="13" font-weight="700" fill="${INK}" letter-spacing="1">${(LOC.name||'').toUpperCase()}${BASIN?' · FLUSSGEBIET '+BASIN.properties.flussgb.toUpperCase():''}</text>`;
  if(BASIN)s+=`<path d="${polyPath(BASIN.geometry)}" fill="none" stroke="${INK}" stroke-width="1.2" fill-rule="evenodd"/>`;
  if(BIL)s+=`<path d="${polyPath(BIL.geometry)}" fill="none" stroke="${INK3}" stroke-width="1" stroke-dasharray="4 4"/>`;
  for(const f of RIVERS){const main=MAINRIVER&&f.properties.gwlnr===MAINRIVER.gwlnr;const ls=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const l of ls)s+=`<path d="${line(l)}" fill="none" stroke="${RIV}" stroke-width="${main?2.6:1.1}" stroke-linecap="round" stroke-linejoin="round"/>`;}
  const fs=stationFeatures();const lx=+X(LOC.lon),ly=+Y(LOC.lat);
  for(const f of fs.slice(1)){const k=Object.keys(LAB).find(k=>LAB[k]===f.properties.role);const [x,y]=f.geometry.coordinates;
    s+=`<line x1="${lx}" y1="${ly}" x2="${X(x)}" y2="${Y(y)}" stroke="${COL[k]}" stroke-width="1" stroke-dasharray="3 3"/><circle cx="${X(x)}" cy="${Y(y)}" r="5" fill="none" stroke="${COL[k]}" stroke-width="2"/><text x="${+X(x)+8}" y="${+Y(y)+4}" font-size="10" fill="${INK}">${f.properties.role}: ${f.properties.name}</text>`;}
  s+=`<circle cx="${lx}" cy="${ly}" r="6" fill="${INK}"/><text x="${lx+9}" y="${ly-8}" font-size="11" font-weight="700" fill="${INK}">${LOC.name}</text>`;
  s+=`<text x="${pad}" y="${H-8}" font-size="9" fill="${INK3}">Quellen: BAFU Hydrologischer Atlas (Flussgebiete), BAFU Gewässernetz 1:2 Mio., MeteoSchweiz, BAFU Hydrodaten</text></svg>`;
  return s;
}
function initDownloads(){
  const on=(id,fn)=>document.getElementById(id).addEventListener('click',fn);
  on('dlBasin',()=>{if(!BASIN)return;const fc={type:'FeatureCollection',features:[{type:'Feature',properties:{level:'Flussgebiet',...BASIN.properties},geometry:BASIN.geometry}]};
    if(BIL)fc.features.push({type:'Feature',properties:{level:'Bilanzgebiet',...BIL.properties},geometry:BIL.geometry});dlJSON(fc,`flussgebiet-${window.CDX.slug(BASIN.properties.flussgb)}.geojson`);});
  on('dlRivers',()=>dlJSON({type:'FeatureCollection',features:RIVERS},`gewaesser-${BASIN?window.CDX.slug(BASIN.properties.flussgb):fileBase()}.geojson`));
  on('dlStations',()=>dlJSON({type:'FeatureCollection',features:stationFeatures()},`stationen-${fileBase()}.geojson`));
  on('dlMapSvg',()=>window.CDX.save(new Blob([mapSvg()],{type:'image/svg+xml'}),`karte-${fileBase()}.svg`));
}

/* ---------- search (swisstopo) ---------- */
function initSearch(){
  const inp=document.getElementById('search'),list=document.getElementById('searchList');let t;
  inp.addEventListener('input',()=>{clearTimeout(t);const q=inp.value.trim();if(q.length<2){list.innerHTML='';return;}
    t=setTimeout(async()=>{try{const j=await jget(`https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&origins=gg25,zipcode,gazetteer&limit=8&sr=4326&searchText=${encodeURIComponent(q)}`);
      list.innerHTML=(j.results||[]).map((r,i)=>`<li><button data-i="${i}">${r.attrs.label.replace(/<[^>]+>/g,'')}</button></li>`).join('');
      list.querySelectorAll('button').forEach(b=>b.onclick=()=>{const a=j.results[+b.dataset.i].attrs;list.innerHTML='';inp.value=a.label.replace(/<[^>]+>/g,'');if(map)map.setView([a.lat,a.lon],11);setLocation(a.lat,a.lon);});
    }catch(e){list.innerHTML='';}},250);});
}

/* ---------- boot ---------- */
async function boot(){
  document.getElementById('selNote').textContent='Stationsliste wird bei MeteoSchweiz abgefragt …';
  ST={met:[],hydro:[]};
  const q=new URLSearchParams(location.search);
  if(q.get('r'))document.getElementById('radius').value=q.get('r');
  const ro=document.getElementById('radiuso');const syncR=()=>ro.textContent=radius()+' km';syncR();
  const [met,hyd,agro]=await Promise.all([metStations().catch(e=>{console.error(e);return [];}),jget(DATA+'hydro.json').catch(()=>({hydro:[],updated:null})),agroStations().catch(e=>{console.warn('agrometeo',e);return [];})]);
  met.forEach(s=>s.src='meteoswiss');ST.met=met.concat(agro);ST.nAgro=agro.length;ST.hydro=hyd.hydro||[];ST.updated=hyd.updated;
  if(!ST.met.length){document.getElementById('selNote').textContent='Die Stationsliste von MeteoSchweiz konnte nicht geladen werden.';}
  document.getElementById('updated').textContent=ST.updated?ST.updated.split('-').reverse().join('.'):'–';
  document.getElementById('nSt').textContent=`${ST.met.length-(ST.nAgro||0)} Stationen MeteoSchweiz, ${ST.nAgro||0} Stationen Agrometeo (live), ${ST.hydro.length} Abflussstationen BAFU`;
  initMap();initSearch();initDownloads();initFill();initUpload();
  for(const k of ['T','P','S','Q'])document.getElementById('sel'+k).addEventListener('change',e=>{SEL[k]=e.target.value||null;drawSelection();loadData();});
  let rt;document.getElementById('radius').addEventListener('input',()=>{syncR();clearTimeout(rt);rt=setTimeout(reselect,350);});
  document.getElementById('chkSameBasin').addEventListener('change',reselect);
  const lat=+q.get('lat')||DEFAULT.lat,lon=+q.get('lon')||DEFAULT.lon;
  const preset=q.has('lat')?{T:q.get('T'),P:q.get('P'),S:q.get('S'),Q:q.get('Q')}:DEFAULT;
  if(map)map.setView([lat,lon],10);
  setLocation(lat,lon,preset);
}
window.addEventListener('DOMContentLoaded',boot);
window.CDAPP={place:()=>LOC?LOC.name:''};
})();
