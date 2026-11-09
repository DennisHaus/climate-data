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

/* ---------- candidates ---------- */
function len(s,k){const v=s.v&&s.v[k];return v?v[1]-v[0]+1:0;}
function candidates(k){
  if(!ST||!LOC)return [];
  const h=LOC.elev;
  if(k==='Q'){return ST.hydro.map(s=>{const d=km(LOC.lat,LOC.lon,s.lat,s.lon),n=s.y[1]-s.y[0]+1;return {s,d,score:d-Math.min(n,40)/8+(s.area&&s.area>3000?15:0)};})
    .filter(o=>o.d<80).sort((a,b)=>a.score-b.score).slice(0,8);}
  return ST.met.filter(s=>s.v&&s.v[k]&&len(s,k)>=15).map(s=>{
    const d=km(LOC.lat,LOC.lon,s.lat,s.lon),dh=h==null||s.elev==null?0:Math.abs(s.elev-h),n=len(s,k),hom=s.v[k][2];
    let score;
    if(k==='T')score=d+dh/40-(hom?6:0)-Math.min(n,150)/30;
    else if(k==='P')score=d+dh/100-Math.min(n,150)/15;
    else score=d+dh/30-Math.min(n,80)/20;
    return {s,d,score};}).filter(o=>o.d<100).sort((a,b)=>a.score-b.score).slice(0,8);
}
function optLabel(k,o){const s=o.s;
  if(k==='Q')return `${s.name} · ${o.d.toFixed(0)} km · ${s.y[0]}–${s.y[1]}${s.area?` · ${Math.round(s.area)} km²`:''}`;
  const v=s.v[k];return `${s.name} (${s.id}) · ${o.d.toFixed(0)} km · ${s.elev??'?'} m · ${v[0]}–${v[1]}${v[2]?' · homogenisiert':''}`;}

function fillSelects(preset){
  for(const k of ['T','P','S','Q']){
    const c=candidates(k),sel=document.getElementById('sel'+k);
    sel.innerHTML=c.length?c.map(o=>`<option value="${o.s.id}">${optLabel(k,o)}</option>`).join(''):'<option value="">keine Station in der Nähe</option>';
    if(k==='S'||k==='Q')sel.insertAdjacentHTML('beforeend','<option value="">– ohne –</option>');
    const want=preset&&preset[k];
    if(want&&[...sel.options].some(o=>o.value===want))sel.value=want;
    SEL[k]=sel.value||null;
  }
}

/* ---------- map ---------- */
function initMap(){
  if(typeof L==='undefined'){document.getElementById('map').innerHTML='<p class="note" style="padding:16px">Die Karte konnte nicht geladen werden. Ort über die Suche wählen.</p>';map=null;return;}
  map=L.map('map',{zoomControl:true,attributionControl:true,minZoom:7,maxBounds:[[45.4,5.4],[48.2,11.0]]}).setView([46.8,8.2],8);
  L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg',{maxZoom:17,attribution:'© swisstopo'}).addTo(map);
  layerMet=L.layerGroup().addTo(map);layerQ=L.layerGroup().addTo(map);selLayer=L.layerGroup().addTo(map);
  for(const s of ST.met)L.circleMarker([s.lat,s.lon],{radius:s.v.T&&s.v.T[2]?4:3,weight:1,color:'#52514e',fillColor:s.v.T?'#f0efec':'#c3c2b7',fillOpacity:0.9})
    .bindTooltip(`${s.name} (${s.id}) · ${s.elev??'?'} m<br>${Object.entries(s.v).map(([k,v])=>`${LAB[k]} ${v[0]}–${v[1]}${v[2]?' hom.':''}`).join('<br>')}`).addTo(layerMet);
  for(const s of ST.hydro)L.circleMarker([s.lat,s.lon],{radius:3.5,weight:1,color:'#1c5cab',fillColor:'#9cc6e0',fillOpacity:0.95})
    .bindTooltip(`${s.name} (${s.id})<br>Abfluss ${s.y[0]}–${s.y[1]}${s.area?`<br>Einzugsgebiet ${Math.round(s.area)} km²`:''}`).addTo(layerQ);
  map.on('click',e=>setLocation(e.latlng.lat,e.latlng.lng));
}
function drawSelection(){
  if(!map)return;selLayer.clearLayers();if(!LOC)return;
  if(!locMarker)locMarker=L.circleMarker([LOC.lat,LOC.lon],{radius:7,weight:3,color:'#b0412e',fillColor:'#fff',fillOpacity:1}).addTo(map);
  locMarker.setLatLng([LOC.lat,LOC.lon]);
  const col={T:'#eb6834',P:'#2a78d6',S:'#6250d6',Q:'#1baf7a'};
  for(const k of ['T','P','S','Q']){const id=SEL[k];if(!id)continue;const s=(k==='Q'?ST.hydro:ST.met).find(x=>x.id===id);if(!s)continue;
    L.polyline([[LOC.lat,LOC.lon],[s.lat,s.lon]],{color:col[k],weight:2,dashArray:'4 4',opacity:0.9}).addTo(selLayer);
    L.circleMarker([s.lat,s.lon],{radius:6,weight:2,color:col[k],fillColor:'#fff',fillOpacity:1}).bindTooltip(`${LAB[k]}: ${s.name}`,{permanent:false}).addTo(selLayer);}
}

/* ---------- location ---------- */
async function setLocation(lat,lon,preset){
  LOC={lat,lon,elev:null,name:`${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E`};
  document.getElementById('locTitle').textContent='Ort wird gesucht …';
  const [E,N]=wgs84ToLv95(lat,lon);
  const tasks=[
    jget(`https://api3.geo.admin.ch/rest/services/height?easting=${E.toFixed(1)}&northing=${N.toFixed(1)}&sr=2056`).then(j=>{LOC.elev=Math.round(+j.height);}).catch(()=>{}),
    jget(`https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint&geometry=${E.toFixed(1)},${N.toFixed(1)}&sr=2056&layers=all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill&tolerance=0&returnGeometry=false&lang=de`)
      .then(j=>{const a=j.results&&j.results[0]&&j.results[0].attributes;if(a)LOC.name=a.gemname||a.label||LOC.name;}).catch(()=>{})];
  await Promise.race([Promise.all(tasks),new Promise(r=>setTimeout(r,2500))]);
  if(LOC.elev==null){const n=ST.met.slice().sort((a,b)=>km(lat,lon,a.lat,a.lon)-km(lat,lon,b.lat,b.lon))[0];LOC.elev=n?n.elev:null;}
  document.getElementById('locTitle').textContent=LOC.name;
  document.getElementById('locInfo').textContent=`${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E${LOC.elev!=null?` · ${LOC.elev} m ü. M.`:''}`;
  fillSelects(preset);drawSelection();await loadData();
}

/* ---------- data ---------- */
const cache={};
async function loadSeries(kind,id){const key=kind+id;if(!cache[key])cache[key]=jget(`${DATA}${kind}/${id}.json`);return cache[key];}
async function loadData(){
  const status=document.getElementById('selNote');status.textContent='Daten werden geladen …';
  try{
    const out={},names={},elev={};
    const jobs=['T','P','S'].filter(k=>SEL[k]).map(async k=>{const key=k+SEL[k];if(!cache[key])cache[key]=metSeries(SEL[k],k);const gr=await cache[key];
      const s=ST.met.find(x=>x.id===SEL[k]);if(gr)out[k]=gr;if(k==='T')elev.Th=!!(s&&s.v.T&&s.v.T[2]);names[k]=s?s.name:SEL[k];elev[k]=s?s.elev:null;});
    if(SEL.Q)jobs.push(loadSeries('q',SEL.Q).then(j=>{out.Q={y0:j.y0,g:j.g};const s=ST.hydro.find(x=>x.id===SEL.Q);names.Q=s?s.name:SEL.Q;}));
    await Promise.all(jobs);
    window.KK.setData(out,names,elev,LOC);
    status.textContent='';
  }catch(e){status.textContent='Daten konnten nicht geladen werden: '+e.message;}
  const q=new URLSearchParams({lat:LOC.lat.toFixed(4),lon:LOC.lon.toFixed(4)});for(const k in SEL)if(SEL[k])q.set(k,SEL[k]);
  history.replaceState(null,'','?'+q.toString());
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
  const [met,hyd]=await Promise.all([metStations().catch(e=>{console.error(e);return [];}),jget(DATA+'hydro.json').catch(()=>({hydro:[],updated:null}))]);
  ST.met=met;ST.hydro=hyd.hydro||[];ST.updated=hyd.updated;
  if(!ST.met.length){document.getElementById('selNote').textContent='Die Stationsliste von MeteoSchweiz konnte nicht geladen werden.';}
  document.getElementById('updated').textContent=ST.updated?ST.updated.split('-').reverse().join('.'):'–';
  document.getElementById('nSt').textContent=`${ST.met.length} Wetterstationen (live von MeteoSchweiz), ${ST.hydro.length} Abflussstationen`;
  initMap();initSearch();
  for(const k of ['T','P','S','Q'])document.getElementById('sel'+k).addEventListener('change',e=>{SEL[k]=e.target.value||null;drawSelection();loadData();});
  const q=new URLSearchParams(location.search);
  const lat=+q.get('lat')||DEFAULT.lat,lon=+q.get('lon')||DEFAULT.lon;
  const preset=q.has('lat')?{T:q.get('T'),P:q.get('P'),S:q.get('S'),Q:q.get('Q')}:DEFAULT;
  if(map)map.setView([lat,lon],10);
  setLocation(lat,lon,preset);
}
window.addEventListener('DOMContentLoaded',boot);
})();
