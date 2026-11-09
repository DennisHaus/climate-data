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
async function metSeries(id,k){
  const s=ST.met.find(x=>x.id===id);if(!s||!s.v[k])return null;const [,, ,coll,col]=s.v[k];const ab=id.toLowerCase();
  const parts=await Promise.all(['historical','recent'].map(p=>tget(`${MS}${coll}/${ab}/${coll}_${ab}_d_${p}.csv`)));
  const daily=[];
  for(const t of parts){if(!t)continue;const L=t.split(/\r?\n/);const h=L[0].split(';');const ti=h.indexOf('reference_timestamp'),ci=h.indexOf(col);if(ci<0)continue;
    for(let i=1;i<L.length;i++){const a=L[i].split(';');const v=a[ci];if(v===undefined||v===''||v==='-')continue;const ts=a[ti];const d=+ts.slice(0,2),m=+ts.slice(3,5),y=+ts.slice(6,10);
      const doy=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,1))/864e5);daily.push([y,doy,+v]);}}
  return weekGrid(daily,k==='P'?'sum7':'mean');
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
  return ST.met.filter(s=>s.v&&s.v[k]&&len(s,k)>=15).map(s=>{
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
  const v=s.v[k];return `${mark}${s.name} (${s.id}) · ${o.d.toFixed(0)} km · ${s.elev??'?'} m · ${v[0]}–${v[1]}${v[2]?' · homogenisiert':''}`;}

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
  L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg',{maxZoom:17,className:'basemap',attribution:'© swisstopo, BAFU'}).addTo(map);
  riverTiles=L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.vec25-gewaessernetz_referenz/default/current/3857/{z}/{x}/{y}.png',{maxZoom:17,minZoom:11,opacity:0.8});
  basinLayer=L.layerGroup().addTo(map);bilLayer=L.layerGroup().addTo(map);riverLayer=L.layerGroup().addTo(map);
  layerMet=L.layerGroup().addTo(map);layerQ=L.layerGroup().addTo(map);selLayer=L.layerGroup().addTo(map);
  if(document.getElementById('chkRivers').checked)riverTiles.addTo(map);
  for(const s of ST.met)L.circleMarker([s.lat,s.lon],{radius:s.v.T&&s.v.T[2]?3.5:2.5,weight:1,color:'#8d8d8d',fillColor:s.v.T?'#eeeeee':'#666666',fillOpacity:0.9})
    .bindTooltip(`${s.name} (${s.id}) · ${s.elev??'?'} m<br>${Object.entries(s.v).map(([k,v])=>`${LAB[k]} ${v[0]}–${v[1]}${v[2]?' hom.':''}`).join('<br>')}`).addTo(layerMet);
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
      const s=ST.met.find(x=>x.id===SEL[k]);if(gr)out[k]=gr;if(k==='T')elev.Th=!!(s&&s.v.T&&s.v.T[2]);names[k]=s?s.name:SEL[k];elev[k]=s?s.elev:null;});
    if(SEL.Q)jobs.push(loadSeries('q',SEL.Q).then(j=>{out.Q={y0:j.y0,g:j.g};const s=ST.hydro.find(x=>x.id===SEL.Q);names.Q=s?s.name:SEL.Q;}).catch(()=>{}));
    await Promise.all(jobs);
    window.KK.setData(out,names,elev,LOC);
    status.textContent='';
  }catch(e){status.textContent='Daten konnten nicht geladen werden: '+e.message;}
  const q=new URLSearchParams({lat:LOC.lat.toFixed(4),lon:LOC.lon.toFixed(4),r:radius()});for(const k in SEL)q.set(k,SEL[k]||'');
  history.replaceState(null,'','?'+q.toString());
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
  const [met,hyd]=await Promise.all([metStations().catch(e=>{console.error(e);return [];}),jget(DATA+'hydro.json').catch(()=>({hydro:[],updated:null}))]);
  ST.met=met;ST.hydro=hyd.hydro||[];ST.updated=hyd.updated;
  if(!ST.met.length){document.getElementById('selNote').textContent='Die Stationsliste von MeteoSchweiz konnte nicht geladen werden.';}
  document.getElementById('updated').textContent=ST.updated?ST.updated.split('-').reverse().join('.'):'–';
  document.getElementById('nSt').textContent=`${ST.met.length} Wetterstationen (live von MeteoSchweiz), ${ST.hydro.length} Abflussstationen`;
  initMap();initSearch();initDownloads();
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
