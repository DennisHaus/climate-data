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
    const jobs=['T','P','S'].filter(k=>SEL[k]).map(async k=>{const j=await loadSeries('met',SEL[k]);if(j[k]){out[k]={y0:j[k].y0,g:j[k].g};if(k==='T')elev.Th=!!j[k].h;}
      const s=ST.met.find(x=>x.id===SEL[k]);names[k]=s?s.name:SEL[k];elev[k]=s?s.elev:null;});
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
  try{ST=await jget(DATA+'stations.json');}catch(e){document.getElementById('selNote').textContent='Stationsliste fehlt (data/stations.json).';return;}
  document.getElementById('updated').textContent=ST.updated?ST.updated.split('-').reverse().join('.'):'–';
  document.getElementById('nSt').textContent=`${ST.met.length} Wetterstationen, ${ST.hydro.length} Abflussstationen`;
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
