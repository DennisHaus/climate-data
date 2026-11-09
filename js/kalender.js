
/* climate-data · Klimakalender – generic app (data loaded per selected stations) */
let V={}, NW=52, N={T:'',P:'',S:'',Q:'',loc:''}, ELEV={};
const META={
  T:{name:'Temperatur',unit:'°C',kind:'anom',fmtRaw:v=>v.toFixed(1)+' °C'},
  P:{name:'Niederschlag',unit:'mm',kind:'ratio',fmtRaw:v=>v.toFixed(1)+' mm/Woche'},
  S:{name:'Schneehöhe',unit:'cm',kind:'diff',fmtRaw:v=>v.toFixed(0)+' cm'},
  Q:{name:'Abfluss',unit:'m³/s',kind:'ratio',fmtRaw:v=>v.toFixed(1)+' m³/s'},
  F:{name:'Schneeanteil',unit:'%',kind:'pp',fmtRaw:v=>v.toFixed(0)+' % als Schnee'},
  B:{name:'Bodenfeuchte',unit:'%',kind:'pp',fmtRaw:v=>v.toFixed(0)+' % Speicherfüllung'}};
function setWhere(){META.T.where=N.T;META.P.where=N.P;META.S.where=N.S;META.Q.where=N.Q;META.F.where=N.T+', geschätzt';META.B.where=N.loc+', modelliert';}
/* derived series: snow share at T station, soil-moisture bucket model at the P station */
function buildDerived(lat){
  const T=V.T,P=V.P;if(!T||!P)return;
  const absT=(y,w)=>{const r=T.g[y-T.y0];return r&&r[w]!=null?r[w]:null;};
  const fs=t=>1/(1+Math.exp((t-1)/1.0));
  V.F={y0:T.y0,g:T.g.map(r=>r.map(x=>x==null?null:Math.round(fs(x)*1000)/10))};
  const phi=(lat||46.8)*Math.PI/180,CAP=150,dT=0.0065*((ELEV.T??ELEV.P??0)-(ELEV.P??ELEV.T??0));
  const dayLen=w=>{const doy=7*w+3.5,d=23.44*Math.PI/180*Math.sin(2*Math.PI*(284+doy)/365);return 24/Math.PI*Math.acos(Math.max(-1,Math.min(1,-Math.tan(phi)*Math.tan(d))));};
  const pet=(t,w)=>{const es=6.108*Math.exp(17.27*t/(t+237.3)),rho=216.7*es/(t+273.3);return Math.max(0,0.1651*(dayLen(w)/12)*rho*1.2)*7;};
  let S=CAP,snow=0;const gB=[],gE=[],y0=Math.max(P.y0,T.y0),y1=Math.min(P.y0+P.g.length-1,T.y0+T.g.length-1);
  for(let y=y0;y<=y1;y++){const rb=[],re=[];for(let w=0;w<NW;w++){const t0=absT(y,w),p=P.g[y-P.y0][w];if(t0==null||p==null){rb.push(null);re.push(null);continue;}
    const t=t0+dT,sf=p*fs(t);snow+=sf;const melt=Math.min(snow,21*Math.max(t,0));snow-=melt;const inp=p-sf+melt;const e=pet(t,w);
    const aet=e*Math.min(1,S/(0.7*CAP));S=Math.max(0,Math.min(CAP,S+inp-aet));rb.push(Math.round(S/CAP*1000)/10);re.push(Math.round(e*10)/10);}
    gB.push(rb);gE.push(re);}
  if(gB.length){V.B={y0,g:gB};V.E={y0,g:gE};}
}
function finishV(){for(const k in V){V[k].n=V[k].g.length;V[k].y1=V[k].y0+V[k].n-1;}}
const has=k=>!!(V[k]&&V[k].g&&V[k].g.length);
const $=id=>document.getElementById(id);
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const HAWK=['#08306b','#08519c','#2171b5','#4292c6','#6baed6','#9ecae1','#c6dbef','#deebf7','#fee0d2','#fcbba1','#fc9272','#fb6a4a','#ef3b2c','#cb181d','#a50f15','#67000d'];
const PALS={gtb:['#e3ef7a','#c2e26a','#97d05f','#6bbd63','#47a86e','#2f9d8f','#2a8fae','#2a76bf','#255cb0','#1d4391','#142c66'],
  vp:['#ffd1e6','#f9a8cc','#ef7fb3','#de5c9f','#c64592','#a93a93','#8b3594','#6f3191','#562b88','#3f2378','#2a1a5c'],
  yp:['#fff27a','#f0e05c','#d8cf4c','#b9bf49','#97ae50','#73a05a','#4f9064','#327f6b','#1d6c6c','#105a66','#0a4652']};
const PALNAME={gtb:['Gelbgrün','Blau'],vp:['Pink','Violett'],yp:['Gelb','Petrol']};
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const HK=HAWK.map(hex);let BB=PALS.gtb.map(hex);
function ramp(C,t){t=Math.max(0,Math.min(1,t));const x=t*(C.length-1),i=Math.min(C.length-2,Math.floor(x)),f=x-i;return C[i].map((c,k)=>Math.round(c+(C[i+1][k]-c)*f));}

const DEF={v:'P',view:'ring',r0:1961,rl:30,ys:1975,gam:3,sy:25,sw:5,sm:11,sm2:3,n:12,s0:0,sv:'P',pal:'gtb',hm:'d'};
const st=Object.assign({},DEF);
try{Object.assign(st,JSON.parse(localStorage.getItem('climate-data-ui')||'{}'));}catch(e){}
function save(){try{localStorage.setItem('climate-data-ui',JSON.stringify(st));}catch(e){}}
if(!PALS[st.pal])st.pal='gtb';BB=PALS[st.pal].map(hex);

/* reference window per variable (falls back to earliest available window of same length) */
function refFor(k){const v=V[k];let a=st.r0,b=st.r0+st.rl-1;const lastFull=Math.min(v.y1,2025);
  if(a<v.y0||b>lastFull){const len=Math.min(st.rl,lastFull-v.y0+1);if(a<v.y0||a+len-1>lastFull){a=Math.max(v.y0,Math.min(a,lastFull-len+1));}b=a+len-1;}
  return [a,b,a!==st.r0||b!==st.r0+st.rl-1];}

function smoothGrid(G,wy,ww){
  const n=G.length,hy=(wy-1)/2, hw=(ww-1)/2, out=[];
  const A=G.map(r=>r.map((_,w)=>{let s=0,c=0;for(let k=-hw;k<=hw;k++){const v=r[(w+k+NW)%NW];if(v!=null){s+=v;c++;}}return c?s/c:null;}));
  for(let y=0;y<n;y++){const row=[];for(let w=0;w<NW;w++){let s=0,c=0;for(let k=-hy;k<=hy;k++){const yy=y+k;if(yy<0||yy>=n)continue;const v=A[yy][w];if(v!=null){s+=v;c++;}}row.push(c>=Math.max(1,Math.ceil(wy*0.5))&&A[y][w]!=null?s/c:null);}out.push(row);}
  return out;}
function climFor(k,G,a,b){const v=V[k];const cl=[];for(let w=0;w<NW;w++){let s=0,c=0;for(let y=a;y<=b;y++){const x=G[y-v.y0][w];if(x!=null){s+=x;c++;}}cl.push(c?s/c:null);}return cl;}
function fieldFor(k){
  const v=V[k],m=META[k],[a,b]=refFor(k);
  if(m.kind==='anom'){const off=climFor(k,v.g,a,b);return smoothGrid(v.g.map(r=>r.map((x,w)=>x==null?null:x-off[w])),st.sy,st.sw);}
  const S=smoothGrid(v.g,st.sy,st.sw),W=smoothGrid(v.g,1,st.sw),cl=climFor(k,W,a,b);
  if(m.kind==='diff'||m.kind==='pp')return S.map(r=>r.map((x,w)=>x==null?null:x-cl[w]));
  return S.map(r=>r.map((x,w)=>x==null?null:Math.log2(Math.max(x,0.05)/Math.max(cl[w],0.05))));
}
function pctl(a,q){if(!a.length)return 0;const i=(a.length-1)*q,l=Math.floor(i),h=Math.ceil(i);return a[l]+(a[h]-a[l])*(i-l);}
function niceNum(x){if(x===0)return 0;const m=Math.pow(10,Math.floor(Math.log10(Math.abs(x)))-1);return Math.round(x/m)*m;}
/* data-adaptive diverging range [lo,hi] with 0 in the middle (2nd/98th percentile) */
function autoRange(vals,minSpan){const a=vals.filter(v=>v!=null&&isFinite(v)).sort((x,y)=>x-y);let lo=pctl(a,0.02),hi=pctl(a,0.98);
  const span=Math.max(Math.abs(lo),Math.abs(hi),minSpan||0.1);lo=Math.min(lo,-0.12*span);hi=Math.max(hi,0.12*span);return [niceNum(lo),niceNum(hi)];}
const tNorm=(v,[lo,hi])=>v<0?0.5*(1-v/lo):0.5+0.5*v/hi;
function scaleLim(F){const vals=[];F.forEach(r=>r.forEach(v=>{if(v!=null)vals.push(v);}));const k=META[st.v].kind;return autoRange(vals,k==='anom'?0.3:(k==='diff'||k==='pp')?2:0.1);}
const colFor=(v,R)=>META[st.v].kind==='anom'?ramp(HK,tNorm(v,R)):ramp(BB,tNorm(v,R));
const fmtV=v=>{const k=META[st.v].kind;return k==='anom'?(v>0?'+':'')+v.toFixed(1)+' °C':k==='diff'?(v>0?'+':'')+v.toFixed(0)+' cm':k==='pp'?(v>0?'+':'')+v.toFixed(0)+' Pp':(v>=0?'+':'')+Math.round((Math.pow(2,v)-1)*100)+' %';};

const MON=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const wDate=w=>new Date(Date.UTC(2001,0,1+7*w));
const fD=d=>d.getUTCDate()+'. '+MON[d.getUTCMonth()];
const weekLabel=w=>fD(wDate(w))+' – '+fD(new Date(Date.UTC(2001,0,1+7*w+(w===51?7:6))));
const monthStartWeek=MON.map((_,m)=>Math.floor((Date.UTC(2001,m,1)-Date.UTC(2001,0,1))/864e5)/7);

const cv=$('cal'),ctx=cv.getContext('2d'),tip=$('tip');
let F=null,LIM=[-1,1],geo=null;
function draw(){
  if(!has(st.v))st.v=has('P')?'P':'T';
  const k=st.v,v=V[k];F=fieldFor(k);
  const ys=Math.min(Math.max(st.ys,v.y0),v.y1-5),i0=ys-v.y0,n=v.n-i0;
  LIM=scaleLim(F.slice(i0));
  const box=$('vizbox').clientWidth,dpr=window.devicePixelRatio||1,ring=st.view==='ring';
  const W=box,H=ring?Math.min(box,700):Math.max(260,Math.min(460,box*0.42));
  cv.style.height=H+'px';cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const ink3=css('--ink-3'),ink2=css('--ink-2'),missing=css('--grid');ctx.font='11px '+css('--f-data');
  const fill=x=>{if(x==null)ctx.fillStyle=missing;else ctx.fillStyle=`rgb(${colFor(x,LIM)})`;};
  if(!ring){
    const L=46,R=8,T=6,B=24,pw=W-L-R,ph=H-T-B,cw=pw/n,rh=ph/NW;geo={ring:false,L,T,cw,rh,i0,n};
    for(let j=0;j<n;j++)for(let w=0;w<NW;w++){fill(F[i0+j][w]);ctx.fillRect(L+j*cw,T+w*rh,Math.ceil(cw+0.6),Math.ceil(rh+0.6));}
    ctx.fillStyle=ink3;ctx.textAlign='right';ctx.textBaseline='middle';
    MON.forEach((m,i)=>{if(W<520&&i%2)return;ctx.fillText(m,L-8,T+(monthStartWeek[i]+2)*rh);});
    ctx.textAlign='center';ctx.textBaseline='top';const step=n>120?(W<520?40:20):n>60?(W<520?20:10):(W<520?10:5);
    for(let yr=Math.ceil(ys/step)*step;yr<=v.y1;yr+=step){const x=L+(yr-ys+0.5)*cw;ctx.fillText(yr,x,T+ph+7);ctx.fillRect(x-0.5,T+ph,1,4);}
  }else{
    const cx=W/2,cy=H/2,R1=Math.min(W,H)/2-26,R0=R1*0.14,g=st.gam,rad=t=>R0+(R1-R0)*Math.pow(t,g);geo={ring:true,cx,cy,R0,R1,g,i0,n};
    for(let j=0;j<n;j++){const r0=rad(j/n),r1=rad((j+1)/n)+0.4;
      for(let w=0;w<NW;w++){fill(F[i0+j][w]);const a0=-Math.PI/2+w/NW*2*Math.PI,a1=-Math.PI/2+(w+1)/NW*2*Math.PI+0.004;ctx.beginPath();ctx.arc(cx,cy,r1,a0,a1);ctx.arc(cx,cy,r0,a1,a0,true);ctx.closePath();ctx.fill();}}
    ctx.strokeStyle=css('--surface');ctx.lineWidth=1;ctx.globalAlpha=0.6;
    for(let yr=Math.ceil((ys+1)/10)*10;yr<=v.y1;yr+=10){const r=rad((yr-ys)/n);ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.stroke();}
    ctx.globalAlpha=1;ctx.fillStyle=ink3;ctx.textAlign='center';ctx.textBaseline='middle';
    MON.forEach((m,i)=>{const a=-Math.PI/2+(monthStartWeek[i]+2)/NW*2*Math.PI;ctx.fillText(m,cx+Math.cos(a)*(R1+14),cy+Math.sin(a)*(R1+14));});
    ctx.fillStyle=ink2;ctx.fillText(ys,cx,cy);
    // decade labels along 12 o'clock
    ctx.font='10px '+css('--f-data');ctx.fillStyle=css('--ink');ctx.globalAlpha=0.75;ctx.textAlign='left';
    for(let yr=Math.ceil((ys+1)/10)*10;yr<=v.y1;yr+=10){const r=rad((yr-ys)/n);if(r-R0<14)continue;ctx.fillText(yr,cx+3,cy-r+7);}ctx.globalAlpha=1;
  }
  drawLegend();
  const [a,b,fb]=refFor(k),m=META[k];
  const what=m.kind==='anom'?`Abweichung vom Wochenmittel ${a}–${b}`:m.kind==='diff'?`Differenz zur mittleren Schneehöhe ${a}–${b}`:m.kind==='pp'?`Differenz zum Wochenmittel ${a}–${b} in Prozentpunkten`:`Verhältnis zum Wochenmittel ${a}–${b}`;
  $('calNote').textContent=`${m.name} ${m.where}, ${ys}–${v.y1}. ${what}${fb?` (gewählte Referenz ${st.r0}–${st.r0+st.rl-1} liegt ausserhalb der Messreihe)`:''}, geglättet über ${st.sy} Jahr${st.sy>1?'e':''} und ${st.sw} Woche${st.sw>1?'n':''}.`+(ring?' Innen das Startjahr, aussen heute, Januar oben, im Uhrzeigersinn.':'')+(m.kind==='anom'?' Farbskala nach Ed Hawkins.':` ${PALNAME[st.pal][0]}: weniger, ${PALNAME[st.pal][1]}: mehr.`);
}
function drawLegend(){const c=$('lg'),g=c.getContext('2d'),anom=META[st.v].kind==='anom';for(let x=0;x<360;x++){g.fillStyle=`rgb(${anom?ramp(HK,x/359):ramp(BB,x/359)})`;g.fillRect(x,0,1,12);}
  $('lgTitle').textContent=META[st.v].name+' gegenüber Referenz';const t=[LIM[0],LIM[0]/2,0,LIM[1]/2,LIM[1]];
  $('lgt').innerHTML=t.map(v=>`<span>${fmtV(v).replace(' °C','°')}</span>`).join('');}
function hit(e){if(!geo)return null;const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let j,w;
  if(!geo.ring){j=Math.floor((x-geo.L)/geo.cw);w=Math.floor((y-geo.T)/geo.rh);}
  else{const dx=x-geo.cx,dy=y-geo.cy,rr=Math.hypot(dx,dy);if(rr<geo.R0||rr>geo.R1)return null;j=Math.min(geo.n-1,Math.floor(Math.pow((rr-geo.R0)/(geo.R1-geo.R0),1/geo.g)*geo.n));let a=Math.atan2(dy,dx)+Math.PI/2;if(a<0)a+=2*Math.PI;w=Math.floor(a/(2*Math.PI)*NW);}
  if(j<0||j>=geo.n||w<0||w>=NW)return null;return {yi:geo.i0+j,w,x,y};}
function onMove(e){const h=hit(e);if(!h){tip.hidden=true;return;}const v=V[st.v],val=F[h.yi][h.w],raw=v.g[h.yi][h.w];
  tip.innerHTML=`<b>${v.y0+h.yi}</b> · ${weekLabel(h.w)}<br>${val==null?'<span class="k">keine Daten</span>':`<span class="k">geglättet</span> <b>${fmtV(val)}</b>`}<br><span class="k">diese Woche</span> ${raw==null?'–':META[st.v].fmtRaw(raw)}`;
  tip.hidden=false;const bw=$('vizbox').clientWidth,tw=tip.offsetWidth;tip.style.left=Math.min(bw-tw-4,Math.max(4,h.x+14))+'px';tip.style.top=Math.max(4,h.y-60)+'px';}
cv.addEventListener('pointermove',onMove);cv.addEventListener('pointerdown',onMove);cv.addEventListener('pointerleave',()=>tip.hidden=true);

/* ---------- controls ---------- */
const plural=(n,a,b)=>n+' '+(n>1?b:a);
function syncControls(){
  const press=(sel,attr,val)=>document.querySelectorAll(sel).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[attr]===String(val))));
  press('#varSeg button','v',st.v);press('#palSeg button','p',st.pal);press('#viewSeg button','w',st.view);press('#nSeg button','n',st.n);press('#segVar button','s',st.sv);press('#heatMode button','h',st.hm);
  for(const k of ['r0','rl','ys','gam','sy','sw','sm','sm2'])$(k).value=st[k];$('segStart').value=st.s0;
  $('r0o').textContent=`${st.r0}–${st.r0+st.rl-1}`;$('rlo').textContent=plural(st.rl,'Jahr','Jahre');
  $('yso').textContent=st.ys;$('gamo').textContent=st.gam<=1?'aus':'×'+(+st.gam).toFixed(1);
  $('syo').textContent=plural(st.sy,'Jahr','Jahre');$('swo').textContent=plural(st.sw,'Woche','Wochen');$('smo').textContent=plural(st.sm,'Jahr','Jahre');$('sm2o').textContent=plural(st.sm2,'Jahr','Jahre');
  $('gamCtl').style.opacity=st.view==='ring'?1:0.45;$('gam').disabled=st.view!=='ring';
}
const on=(sel,fn)=>document.querySelectorAll(sel).forEach(b=>b.onclick=()=>{fn(b);syncControls();save();});
on('#varSeg button',b=>{st.v=b.dataset.v;draw();});
on('#palSeg button',b=>{st.pal=b.dataset.p;BB=PALS[st.pal].map(hex);draw();drawSeg();});
on('#viewSeg button',b=>{st.view=b.dataset.w;draw();});
on('#nSeg button',b=>{st.n=+b.dataset.n;drawSeg();});
on('#heatMode button',b=>{st.hm=b.dataset.h;drawSeg();});
on('#segVar button',b=>{st.sv=b.dataset.s;drawCum();});
$('reset').onclick=()=>{Object.assign(st,DEF);BB=PALS.gtb.map(hex);syncControls();save();all();};
const slide=(id,fn)=>$(id).oninput=e=>{st[id]=+e.target.value;if(id==='r0'&&st.r0+st.rl-1>2025)st.rl=2026-st.r0;if(id==='rl'&&st.r0+st.rl-1>2025)st.r0=2026-st.rl;syncControls();save();fn();};
slide('r0',()=>{draw();drawLand();drawJG();drawCharts();drawSeg();});slide('rl',()=>{draw();drawLand();drawJG();drawCharts();drawSeg();});
slide('ys',draw);slide('gam',draw);slide('sy',draw);slide('sw',draw);slide('sm',drawCharts);slide('sm2',drawSeg);
$('segStart').innerHTML=MON.map((m,i)=>`<option value="${Math.round(monthStartWeek[i])}">1. ${m}</option>`).join('');
$('segStart').onchange=e=>{st.s0=+e.target.value;save();drawSeg();};

/* ---------- chart helpers ---------- */
function runMean(a,w){const h=(w-1)/2;return a.map((_,i)=>{if(i-h<0||i+h>=a.length)return null;let s=0,c=0;for(let k=-h;k<=h;k++){if(a[i+k]!=null){s+=a[i+k];c++;}}return c>=w*0.7?s/c:null;});}
function niceTicks(lo,hi,n){const span=hi-lo,s0=span/n,mag=Math.pow(10,Math.floor(Math.log10(s0)));const s=[1,2,2.5,5,10].map(k=>k*mag).find(k=>k>=s0);const out=[];for(let t=Math.ceil(lo/s)*s;t<=hi+1e-9;t+=s)out.push(+t.toFixed(6));return out;}
const legendHTML=ser=>`<div class="legend" style="font-size:12px">${ser.map(se=>`<span class="sw"><i style="background:${se.c}"></i>${se.name}</span>`).join('')}</div>`;
function attachHover(el,svg,Wd,L,pw,n,xOf,html){const xh=svg.querySelector('.xh'),tp=el.querySelector('.tip');
  const mv=e=>{const r=svg.getBoundingClientRect();const sx=(e.clientX-r.left)*Wd/r.width;const i=Math.round((sx-L)/pw*(n-1));if(i<0||i>=n){tp.hidden=true;xh.setAttribute('visibility','hidden');return;}
    xh.setAttribute('x1',xOf(i));xh.setAttribute('x2',xOf(i));xh.setAttribute('visibility','visible');tp.innerHTML=html(i);tp.hidden=false;
    const ew=el.clientWidth,tw=tp.offsetWidth,px=xOf(i)/Wd*r.width;tp.style.left=Math.min(ew-tw-2,Math.max(0,px+12))+'px';tp.style.top=(svg.offsetTop+8)+'px';};
  svg.addEventListener('pointermove',mv);svg.addEventListener('pointerdown',mv);svg.addEventListener('pointerleave',()=>{tp.hidden=true;xh.setAttribute('visibility','hidden');});}

/* yearly line chart; years = array of x values */
function lineChart(el,cfg){
  const YRS=cfg.years,Wd=cfg.w||360,Ht=cfg.h||200,L=44,R=cfg.rightPad||10,T=10,B=22,pw=Wd-L-R,ph=Ht-T-B,sm=cfg.sm??st.sm;
  const all=[];cfg.series.forEach(s=>s.v.forEach(x=>{if(x!=null)all.push(x);}));(cfg.refLines||[]).forEach(r=>all.push(r.v));
  let lo=cfg.min??Math.min(...all),hi=cfg.max??Math.max(...all);const pad=(hi-lo)*0.06||1;if(cfg.min==null)lo-=pad;if(cfg.max==null)hi+=pad;
  const X=i=>L+i/(YRS.length-1)*pw,Yv=v=>T+(1-(v-lo)/(hi-lo))*ph;
  let s=`<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="${cfg.title}">`;
  (cfg.ticks||niceTicks(lo,hi,4)).forEach(t=>{s+=`<line x1="${L}" x2="${L+pw}" y1="${Yv(t)}" y2="${Yv(t)}" stroke="var(--grid)"/><text x="${L-6}" y="${Yv(t)+3.5}" text-anchor="end">${cfg.tf?cfg.tf(t):t}</text>`;});
  if(cfg.zero!=null)s+=`<line x1="${L}" x2="${L+pw}" y1="${Yv(cfg.zero)}" y2="${Yv(cfg.zero)}" stroke="var(--ink-3)"/>`;
  const span=YRS[YRS.length-1]-YRS[0],step=span>100?40:span>50?20:10;
  for(let yr=Math.ceil(YRS[0]/step)*step;yr<=YRS[YRS.length-1];yr+=step){const x=X(yr-YRS[0]);s+=`<text x="${x}" y="${Ht-6}" text-anchor="middle">${yr}</text>`;}
  (cfg.refLines||[]).forEach(r=>{s+=`<line x1="${L}" x2="${L+pw}" y1="${Yv(r.v)}" y2="${Yv(r.v)}" stroke="var(--target)" stroke-dasharray="4 3"/><text class="tgt" x="${L+4}" y="${Yv(r.v)-4}">${r.label}</text>`;});
  if(cfg.stack){let base=YRS.map(()=>0);
    cfg.series.forEach(se=>{const smv=sm>1?runMean(se.v,sm).map((v,i)=>v==null?se.v[i]:v):se.v.slice();const top=base.map((b,i)=>b+(smv[i]??0));
      s+=`<path d="M${top.map((v,i)=>`${X(i).toFixed(1)},${Yv(v).toFixed(1)}`).join('L')}L${base.map((v,i)=>`${X(i).toFixed(1)},${Yv(v).toFixed(1)}`).reverse().join('L')}Z" fill="${se.c}" stroke="var(--surface)" stroke-width="2" stroke-linejoin="round"/>`;
      const li=YRS.length-1;s+=`<text class="lab" x="${L+pw+6}" y="${Yv((top[li]+base[li])/2)+3.5}">${se.name}</text>`;se._sm=smv;base=top;});
  }else cfg.series.forEach(se=>{const raw=se.v,smv=sm>1?runMean(raw,sm):null;se._sm=smv;
    const seg=arr=>{let d='',pen=false;arr.forEach((v,i)=>{if(v==null){pen=false;return;}d+=(pen?'L':'M')+X(i).toFixed(1)+','+Yv(v).toFixed(1);pen=true;});return d;};
    s+=`<path d="${seg(raw)}" fill="none" stroke="${se.c}" stroke-opacity="${smv?0.28:1}" stroke-width="${smv?1:1.5}"/>`;
    if(smv){s+=`<path d="${seg(smv)}" fill="none" stroke="${se.c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const li=smv.length-1-smv.slice().reverse().findIndex(v=>v!=null);if(cfg.series.length>1&&li<smv.length)s+=`<text class="lab" x="${X(li)+5}" y="${Yv(smv[li])+3.5}">${se.name}</text>`;}});
  s+=`<line class="xh" x1="0" x2="0" y1="${T}" y2="${T+ph}" stroke="var(--ink-3)" visibility="hidden"/></svg>`;
  el.innerHTML=`<h3>${cfg.title}</h3><p>${cfg.sub}</p>`+(cfg.legend?legendHTML(cfg.series):'')+s+`<div class="tip" hidden></div>`;
  const f=cfg.vf||(v=>v.toFixed(1));
  attachHover(el,el.querySelector('svg'),Wd,L,pw,YRS.length,X,i=>`<b>${YRS[i]}</b>`+cfg.series.map(se=>`<br><span class="k">${se.name}</span> <b>${se.v[i]==null?'–':f(se.v[i])}</b>${se._sm&&se._sm[i]!=null&&sm>1?` <span class="k">· Mittel ${f(se._sm[i])}</span>`:''}`).join(''));
}

/* ---------- Jahresgang früher vs heute ---------- */
function weeklyMean(k,a,b){const v=V[k];const out=[];for(let w=0;w<NW;w++){let s=0,c=0;for(let y=Math.max(a,v.y0);y<=Math.min(b,v.y1);y++){const x=v.g[y-v.y0][w];if(x!=null){s+=x;c++;}}out.push(c?s/c:null);}return out;}
function drawJG(){
  const g=$('jg');g.innerHTML='';const c1=css('--q3'),c2=css('--s2');
  const recent=[2011,2025];
  const sm3=a=>a.map((_,w)=>{let s=0,c=0;for(let k=-1;k<=1;k++){const x=a[(w+k+NW)%NW];if(x!=null){s+=x;c++;}}return c?s/c:null;});
  const notes=[];
  const steps=[['T','1 Wärme','°C'],['F','2 Niederschlag als Schnee','% des Niederschlags'],['S','3 Schneedecke','cm'],['P','Niederschlag','mm pro Woche'],['B','Bodenfeuchte','% Speicherfüllung'],['Q','4 Abfluss','m³/s']];
  for(const [k,label,unit] of steps){
    if(!has(k))continue;
    let [a,b]=refFor(k);let r=[Math.max(recent[0],b+1),recent[1]];
    if(r[1]-r[0]<9){const mid=Math.floor((V[k].y0+2025)/2);a=V[k].y0;b=mid;r=[mid+1,2025];}
    let A=weeklyMean(k,a,b),B=weeklyMean(k,r[0],r[1]);
    A=sm3(A);B=sm3(B);notes.push(`${META[k].name} ${a}–${b} / ${r[0]}–${r[1]}`);
    const el=document.createElement('div');el.className='chart';g.appendChild(el);
    const Wd=360,Ht=180,L=40,R=8,T=10,Bm=22,pw=Wd-L-R,ph=Ht-T-Bm;
    const all=A.concat(B).filter(x=>x!=null);let lo=k==='T'?Math.min(...all):0,hi=k==='F'||k==='B'?100:Math.max(...all);const pd=(hi-lo)*0.06;if(k!=='F'&&k!=='B')hi+=pd;if(k==='T')lo-=pd;
    const X=w=>L+(w+0.5)/NW*pw,Yv=v=>T+(1-(v-lo)/(hi-lo))*ph;
    let s=`<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Jahresgang ${META[k].name}">`;
    niceTicks(lo,hi,4).forEach(t=>{s+=`<line x1="${L}" x2="${L+pw}" y1="${Yv(t)}" y2="${Yv(t)}" stroke="var(--grid)"/><text x="${L-6}" y="${Yv(t)+3.5}" text-anchor="end">${t}</text>`;});
    MON.forEach((m,i)=>{if(i%2)return;s+=`<text x="${X(monthStartWeek[i]+1.5)}" y="${Ht-6}" text-anchor="middle">${m}</text>`;});
    const path=arr=>'M'+arr.map((v,w)=>v==null?null:`${X(w).toFixed(1)},${Yv(v).toFixed(1)}`).filter(Boolean).join('L');
    // shade difference
    const area='M'+A.map((v,w)=>`${X(w).toFixed(1)},${Yv(v??0).toFixed(1)}`).join('L')+'L'+B.map((v,w)=>`${X(w).toFixed(1)},${Yv(v??0).toFixed(1)}`).reverse().join('L')+'Z';
    s+=`<path d="${area}" fill="${c2}" fill-opacity="0.10" stroke="none"/><path d="${path(A)}" fill="none" stroke="${c1}" stroke-width="2"/><path d="${path(B)}" fill="none" stroke="${c2}" stroke-width="2.2"/>`;
    s+=`<line class="xh" x1="0" x2="0" y1="${T}" y2="${T+ph}" stroke="var(--ink-3)" visibility="hidden"/></svg>`;
    const [st_,nm]=label.match(/^(\d)?\s?(.*)$/).slice(1);
    el.innerHTML=`<h3>${st_?`<span class="step">${st_}</span>`:''}${nm} <span style="font-weight:400;color:var(--ink-3)">${META[k].where}</span></h3><p>${unit}</p>`+legendHTML([{name:`${a}–${b}`,c:c1},{name:`${r[0]}–${r[1]}`,c:c2}])+s+`<div class="tip" hidden></div>`;
    const f=v=>v==null?'–':v.toFixed(1)+' '+unit.split(' ')[0];
    attachHover(el,el.querySelector('svg'),Wd,L,pw*(NW-1)/NW,NW,X,w=>`<b>${weekLabel(w)}</b><br><span class="k">${a}–${b}</span> <b>${f(A[w])}</b><br><span class="k">${r[0]}–${r[1]}</span> <b>${f(B[w])}</b>`);
  }
  $('jgNote').textContent='Mittlerer Jahresgang in der Referenzperiode (blau) und in den letzten 15 Jahren (orange), über 3 Wochen geglättet; die Fläche dazwischen zeigt die Veränderung. Die Nummern 1–4 folgen der Kette Wärme → Schnee → Abfluss. '+notes.join(' · ')+'.';
}

/* ---------- scatter: year-to-year links ---------- */
function seasonVal(k,y,weeks,agg){const v=V[k];let s=0,c=0;for(const [yy,w] of weeks(y)){const r=v.g[yy-v.y0];if(!r||r[w]==null)continue;s+=r[w];c++;}if(c<weeks(y).length*0.8)return null;return agg==='sum'?s:s/c;}
const wk=(a,b,prev)=>y=>{const o=[];if(prev)for(let w=prev;w<NW;w++)o.push([y-1,w]);for(let w=a;w<=b;w++)o.push([y,w]);return o;};
function scatter(el,cfg){
  const pts=cfg.pts.filter(p=>p.x!=null&&p.y!=null);if(pts.length<8){el.remove();return;}const Wd=360,Ht=240,L=44,R=10,T=10,B=30,pw=Wd-L-R,ph=Ht-T-B;
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);let x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);const px=(x1-x0)*0.06,py=(y1-y0)*0.08;x0-=px;x1+=px;y0-=py;y1+=py;
  const X=x=>L+(x-x0)/(x1-x0)*pw,Y=y=>T+(1-(y-y0)/(y1-y0))*ph;
  const n=pts.length,mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0,syy=0;pts.forEach(p=>{sxy+=(p.x-mx)*(p.y-my);sxx+=(p.x-mx)**2;syy+=(p.y-my)**2;});
  const k=sxy/sxx,r=sxy/Math.sqrt(sxx*syy),ya=my+k*(x0+px-mx),yb=my+k*(x1-px-mx);
  const yrs=pts.map(p=>p.yr),ymin=Math.min(...yrs),ymax=Math.max(...yrs);const seq=[[203,226,251],[109,167,236],[42,120,214],[28,92,171],[13,54,107]];
  const col=yr=>`rgb(${ramp(seq,(yr-ymin)/(ymax-ymin||1))})`;
  let s=`<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="${cfg.title}">`;
  niceTicks(y0,y1,4).forEach(t=>{s+=`<line x1="${L}" x2="${L+pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)"/><text x="${L-6}" y="${Y(t)+3.5}" text-anchor="end">${cfg.yf?cfg.yf(t):t}</text>`;});
  niceTicks(x0,x1,4).forEach(t=>{s+=`<text x="${X(t)}" y="${Ht-14}" text-anchor="middle">${cfg.xf?cfg.xf(t):t}</text>`;});
  s+=`<text x="${L+pw}" y="${Ht-2}" text-anchor="end">${cfg.xl}</text>`;
  s+=`<line x1="${X(x0+px)}" x2="${X(x1-px)}" y1="${Y(ya)}" y2="${Y(yb)}" stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="5 3"/>`;
  pts.forEach((p,i)=>{s+=`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4.5" fill="${col(p.yr)}" stroke="var(--surface)" stroke-width="1.5" data-i="${i}"/>`;});
  s+=`<text class="lab" x="${L+6}" y="${T+12}">r = ${r.toFixed(2)} · ${n} Jahre</text></svg>`;
  el.innerHTML=`<h3>${cfg.title}</h3><p>${cfg.sub}</p>`+s+`<div class="legend" style="font-size:11px"><span>${ymin}</span><span style="display:inline-block;width:90px;height:8px;border-radius:2px;background:linear-gradient(90deg,rgb(203,226,251),rgb(42,120,214),rgb(13,54,107))"></span><span>${ymax}</span></div><div class="tip" hidden></div>`;
  const svg=el.querySelector('svg'),tp=el.querySelector('.tip');
  svg.addEventListener('pointermove',e=>{const rr=svg.getBoundingClientRect();const sx=(e.clientX-rr.left)*Wd/rr.width,sy=(e.clientY-rr.top)*Ht/rr.height;let best=-1,bd=1e9;pts.forEach((p,i)=>{const d=(X(p.x)-sx)**2+(Y(p.y)-sy)**2;if(d<bd){bd=d;best=i;}});
    if(bd>400){tp.hidden=true;return;}const p=pts[best];tp.innerHTML=`<b>${p.yr}</b><br><span class="k">${cfg.xl}</span> <b>${cfg.xf?cfg.xf(p.x):p.x.toFixed(1)}</b><br><span class="k">${cfg.yl}</span> <b>${cfg.yf?cfg.yf(p.y):p.y.toFixed(1)}</b>`;tp.hidden=false;
    tp.style.left=Math.min(el.clientWidth-tp.offsetWidth-2,X(p.x)/Wd*rr.width+12)+'px';tp.style.top=(svg.offsetTop+Y(p.y)/Ht*rr.height-20)+'px';});
  svg.addEventListener('pointerleave',()=>tp.hidden=true);
}
function meltWeek(r){for(let w=5;w<30;w++){if(r[w]!=null&&r[w]<5){let ok=true;for(let j=w;j<30;j++)if(r[j]!=null&&r[j]>=5)ok=false;if(ok)return w;}}return null;}
function drawScatter(){
  if(!has('B')){$('sc').innerHTML='';return;}
  const g=$('sc');g.innerHTML='';const add=cfg=>{const d=document.createElement('div');d.className='chart';g.appendChild(d);scatter(d,cfg);};
  const tAbs=(y,ws)=>seasonVal('T',y,ws);
  const yr=k=>[V[k].y0+1,Math.min(V[k].y1,2025)],both=(a,b)=>[Math.max(yr(a)[0],yr(b)[0]),Math.min(yr(a)[1],yr(b)[1])];
  const Y=(a,b)=>{const o=[];for(let y=a;y<=b;y++)o.push(y);return o;};
  const winter=wk(0,12,48),spring=wk(9,21),snowWin=wk(0,16,48),qEarly=wk(17,30),summer=wk(22,34),late=wk(30,38);
  if(has('S'))add({title:'Wärmerer Winter → weniger Schnee',sub:`Wintertemperatur ${N.T} (Dez–Mär) gegen mittlere Schneehöhe ${N.S} (Dez–Apr)`,xl:'Winter °C',yl:'Schneehöhe cm',xf:t=>t.toFixed(1),yf:t=>t.toFixed(0),
    pts:has('S')?Y(...both('T','S')).map(y=>({yr:y,x:tAbs(y,winter),y:seasonVal('S',y,snowWin)})):[]});
  if(has('S'))add({title:'Wärmerer Frühling → frühere Schmelze',sub:`Frühlingstemperatur ${N.T} (Mär–Mai) gegen Datum der Ausaperung ${N.S}`,xl:'Frühling °C',yl:'Ausaperung',xf:t=>t.toFixed(1),yf:t=>fD(wDate(t)),
    pts:!has('S')?[]:Y(...both('T','S')).map(y=>{const r=V.S.g[y-V.S.y0];const m=r?meltWeek(r):null;return {yr:y,x:tAbs(y,spring),y:m};})});
  if(has('S')&&has('Q'))add({title:'Mehr Schnee → mehr Frühsommer-Abfluss',sub:`Mittlere Schneehöhe ${N.S} (Dez–Apr) gegen Abfluss ${N.Q} Mai–Juli`,xl:'Schneehöhe cm',yl:'Abfluss m³/s',xf:t=>t.toFixed(0),yf:t=>t.toFixed(0),
    pts:!(has('S')&&has('Q'))?[]:Y(...both('S','Q')).map(y=>({yr:y,x:seasonVal('S',y,snowWin),y:seasonVal('Q',y,qEarly)}))});
  add({title:'Sommer-Wasserbilanz → Bodenfeuchte',sub:`Niederschlag minus Verdunstung Jun–Aug gegen Bodenfeuchte Aug–Sep (modelliert, ${N.loc})`,xl:'N − V mm',yl:'Bodenfeuchte %',xf:t=>t.toFixed(0),yf:t=>t.toFixed(0),
    pts:Y(...yr('B')).map(y=>{const p=seasonVal('P',y,summer,'sum'),e=seasonVal('E',y,summer,'sum');return {yr:y,x:p==null||e==null?null:p-e,y:seasonVal('B',y,late)};})});
  add({title:'Wärmerer Sommer → trockenerer Boden',sub:`Sommertemperatur ${N.T} (Jun–Aug) gegen Bodenfeuchte Aug–Sep (modelliert)`,xl:'Sommer °C',yl:'Bodenfeuchte %',xf:t=>t.toFixed(1),yf:t=>t.toFixed(0),
    pts:Y(...yr('B')).map(y=>({yr:y,x:tAbs(y,summer),y:seasonVal('B',y,late)}))});
  if(has('Q'))add({title:'Bodenfeuchte und Spätsommer-Abfluss',sub:`Bodenfeuchte Aug–Sep (${N.loc}, modelliert) gegen Abfluss ${N.Q} Aug–Sep`,xl:'Bodenfeuchte %',yl:'Abfluss m³/s',xf:t=>t.toFixed(0),yf:t=>t.toFixed(0),
    pts:!has('Q')?[]:Y(...both('B','Q')).map(y=>({yr:y,x:seasonVal('B',y,late),y:seasonVal('Q',y,late)}))});
}

/* ---------- cumulative curve & segments (P or Q) ---------- */
function periodsFor(k){const v=V[k],a=v.y0,b=Math.min(v.y1,2025),len=b-a+1;
  if(len<60){const n=len>=32?4:len>=16?2:1,st_=len/n;return [...Array(n).keys()].map(i=>[Math.round(a+i*st_),Math.round(a+(i+1)*st_)-1]);}
  const out=[];for(let e=b;e-29>=a&&out.length<5;e-=30)out.unshift([e-29,e]);out[out.length-1][0]=Math.max(out[out.length-1][0],b-14);return out;}
function drawCum(){
  if(!has(st.sv))st.sv=has('P')?'P':'Q';
  const k=st.sv,v=V[k],el=$('cum'),Wd=520,Ht=260,L=44,R=12,T=12,B=24,pw=Wd-L-R,ph=Ht-T-B;
  const P=periodsFor(k),cols=(P.length===4?['--q2','--q3','--q4','--q5']:['--q1','--q2','--q3','--q4','--q5']).map(css);
  const ser=P.map(([a,b],i)=>{const wk=weeklyMean(k,a,b);const tot=wk.reduce((s,x)=>s+x,0);let c=0;const dev=[0];wk.forEach((x,w)=>{c+=x;dev.push((c/tot-(w+1)/NW)*100);});return {name:`${a}–${b}`,v:dev,c:cols[i]};});
  const all=ser.flatMap(s=>s.v);let lo=Math.min(...all),hi=Math.max(...all);const pd=(hi-lo)*0.1;lo-=pd;hi+=pd;
  const X=w=>L+w/NW*pw,Yv=x=>T+(1-(x-lo)/(hi-lo))*ph;
  let s=`<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Summenkurve">`;
  niceTicks(lo,hi,4).forEach(t=>{s+=`<line x1="${L}" x2="${L+pw}" y1="${Yv(t)}" y2="${Yv(t)}" stroke="var(--grid)"/><text x="${L-6}" y="${Yv(t)+3.5}" text-anchor="end">${t>0?'+':''}${t}</text>`;});
  s+=`<line x1="${L}" x2="${L+pw}" y1="${Yv(0)}" y2="${Yv(0)}" stroke="var(--ink-3)"/>`;
  MON.forEach((m,i)=>{s+=`<text x="${X(monthStartWeek[i]+2)}" y="${Ht-6}" text-anchor="middle">${m}</text>`;});
  ser.forEach(se=>{s+=`<path d="M${se.v.map((x,w)=>`${X(w).toFixed(1)},${Yv(x).toFixed(1)}`).join('L')}" fill="none" stroke="${se.c}" stroke-width="2" stroke-linejoin="round"/>`;});
  s+=`<line class="xh" x1="0" x2="0" y1="${T}" y2="${T+ph}" stroke="var(--ink-3)" visibility="hidden"/></svg>`;
  el.innerHTML=`<h3>Wann im Jahr? ${META[k].name} ${META[k].where}</h3><p>Kumulierter Anteil an der Jahressumme minus gleichmässige Verteilung, in Prozentpunkten, je Periode. Steigt eine Kurve früher, kommt das Wasser früher im Jahr.</p>`+legendHTML(ser)+s+`<div class="tip" hidden></div>`;
  attachHover(el,el.querySelector('svg'),Wd,L,pw,NW+1,X,w=>`<b>bis ${w===0?'1. Jan':fD(wDate(w))}</b>`+ser.map(se=>`<br><span class="k">${se.name}</span> <b>${se.v[w]>0?'+':''}${se.v[w].toFixed(1)} Pp</b>`).join(''));
}
function segInfo(){const n=st.n,s0=st.s0,segOf=w=>Math.floor(((w-s0+NW)%NW)*n/NW);const len=new Array(n).fill(0);for(let w=0;w<NW;w++)len[segOf(w)]++;
  const first=new Array(n).fill(-1);for(let p=0;p<NW;p++){const w=(s0+p)%NW,i=segOf(w);if(first[i]<0)first[i]=w;}
  const label=i=>{const a=first[i],b=(a+len[i]-1)%NW;return len[i]===1?fD(wDate(a)):fD(wDate(a))+' – '+fD(new Date(Date.UTC(2001,0,1+7*b+6)));};
  return {n,segOf,len,first,label};}
function shares(k,y,si){const v=V[k],r=v.g[y-v.y0];if(!r||r.some(x=>x==null))return null;const sv=new Array(si.n).fill(0);let t=0;r.forEach((x,w)=>{sv[si.segOf(w)]+=x;t+=x;});return sv.map((x,i)=>x/t*100*(NW/si.n)/si.len[i]);}
function drawSeg(){
  if(!has('P'))return;
  const si=segInfo(),n=si.n,cP=css('--cP'),cQ=css('--cQ');
  // ---- profile: P and Q, two periods
  const qa=has('Q')?V.Q.y0:Math.max(V.P.y0,1961),qb=has('Q')?Math.min(V.Q.y1,2025):2025,mid=Math.floor((qa+qb)/2);const per=[[qa,mid],[mid+1,qb]];
  const prof=(k,[a,b])=>{const acc=new Array(n).fill(0);let c=0;for(let y=a;y<=b;y++){const s=shares(k,y,si);if(!s)continue;s.forEach((x,i)=>acc[i]+=x);c++;}return acc.map(x=>x/c);};
  const ser=[{k:'P',p:per[0],c:cP,dash:'4 3',op:0.6},{k:'P',p:per[1],c:cP},{k:'Q',p:per[0],c:cQ,dash:'4 3',op:0.6},{k:'Q',p:per[1],c:cQ}].filter(o=>has(o.k)).map(o=>Object.assign(o,{v:prof(o.k,o.p),name:`${META[o.k].name} ${o.p[0]}–${o.p[1]}`}));
  const el=$('segProfile'),Wd=1080,Ht=260,L=44,R=12,T=12,B=26,pw=Wd-L-R,ph=Ht-T-B;
  const all=ser.flatMap(s=>s.v);const hi=Math.max(...all)*1.08,lo=0,eq=100/n;
  const X=p=>L+p/n*pw,Y=v=>T+(1-(v-lo)/(hi-lo))*ph;
  let s=`<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Jahresverteilung Niederschlag und Abfluss">`;
  niceTicks(lo,hi,4).forEach(t=>{s+=`<line x1="${L}" x2="${L+pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)"/><text x="${L-6}" y="${Y(t)+3.5}" text-anchor="end">${t}</text>`;});
  s+=`<line x1="${L}" x2="${L+pw}" y1="${Y(eq)}" y2="${Y(eq)}" stroke="var(--ink-3)" stroke-dasharray="2 3"/><text x="${L+pw}" y="${Y(eq)-4}" text-anchor="end">gleichmässig</text>`;
  for(let p=0;p<n;p++){const w=(st.s0+Math.floor((p+0.5)*NW/n))%NW,d=new Date(Date.UTC(2001,0,1+7*w+3));const w0=(st.s0+Math.floor(p*NW/n))%NW,d0=wDate(w0);if(n<=13||d0.getUTCDate()<=7)s+=`<text x="${X(p+0.5)}" y="${Ht-8}" text-anchor="middle">${MON[(n<=13?d:d0).getUTCMonth()]}</text>`;}
  const step=v=>v.map((x,p)=>`${p?'L':'M'}${X(p).toFixed(1)},${Y(x).toFixed(1)}L${X(p+1).toFixed(1)},${Y(x).toFixed(1)}`).join('');
  ser.forEach(o=>{s+=`<path d="${step(o.v)}" fill="none" stroke="${o.c}" stroke-width="${o.dash?1.6:2.4}" ${o.dash?`stroke-dasharray="${o.dash}" stroke-opacity="${o.op}"`:''} stroke-linejoin="round"/>`;});
  s+=`<line class="xh" x1="0" x2="0" y1="${T}" y2="${T+ph}" stroke="var(--ink-3)" visibility="hidden"/></svg>`;
  el.innerHTML=`<h3>Wann kommt das Wasser? Niederschlag ${N.P}${has('Q')?` und Abfluss ${N.Q}`:''}</h3><p>Anteil an der Jahressumme je Abschnitt, auf gleiche Abschnittslänge bereinigt. Über der gepunkteten Linie: mehr als bei gleichmässiger Verteilung. Gestrichelt ${per[0][0]}–${per[0][1]}, durchgezogen ${per[1][0]}–${per[1][1]}. Wo die violette Linie über der blauen liegt, gibt das Einzugsgebiet gespeichertes Wasser ab (Schneeschmelze); wo sie darunter liegt, wird Wasser zurückgehalten (Schnee, Boden, Verdunstung).</p>`+
    `<div class="legend" style="font-size:12px"><span class="sw"><i style="background:${cP}"></i>Niederschlag</span><span class="sw"><i style="background:${cQ}"></i>Abfluss</span><span>– – ${per[0][0]}–${per[0][1]}</span><span>—— ${per[1][0]}–${per[1][1]}</span></div>`+s+`<div class="tip" hidden></div>`;
  attachHover(el,el.querySelector('svg'),Wd,L,pw*(n-1)/n,n,p=>X(p+0.5),p=>`<b>${si.label(p)}</b>`+ser.map(o=>`<br><span class="k">${o.name}</span> <b>${o.v[p].toFixed(1)} %</b>`).join(''));

  // ---- heatmap
  if(!has('Q')&&st.hm!=='P')st.hm='P';
  const mode=st.hm,ks=mode==='d'?['P','Q']:[mode];const ya=Math.max(...ks.map(k=>V[k].y0)),yb=Math.min(...ks.map(k=>Math.min(V[k].y1,2025)));
  let rows=[];const years=[];
  for(let y=ya;y<=yb;y++){let r;if(mode==='d'){const p=shares('P',y,si),q=shares('Q',y,si);r=p&&q?q.map((x,i)=>x-p[i]):null;}else r=shares(mode,y,si);years.push(y);rows.push(r);}
  if(mode!=='d'){const [a,b2]=refFor(mode);const m=new Array(n).fill(0);let c=0;rows.forEach((r,i)=>{if(r&&years[i]>=a&&years[i]<=b2){r.forEach((x,j)=>m[j]+=x);c++;}});rows=rows.map(r=>r?r.map((x,j)=>x-m[j]/c):null);}
  const h=(st.sm2-1)/2;const sm=rows.map((_,i)=>{const acc=new Array(n).fill(0);let c=0;for(let k=-h;k<=h;k++){const r=rows[i+k];if(r){r.forEach((x,j)=>acc[j]+=x);c++;}}return c&&rows[i]?acc.map(x=>x/c):null;});
  const vals=sm.flat().filter(x=>x!=null);const mean=vals.reduce((a,b)=>a+b,0)/vals.length;const sd=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
  const lim=autoRange(vals,0.5);
  const cvs=$('heat'),box=cvs.parentElement.clientWidth,dpr=window.devicePixelRatio||1,HL=46,HT=4,HB=22,rh=Math.max(3,Math.min(12,360/years.length)),H=HT+HB+rh*years.length;
  cvs.style.height=H+'px';cvs.width=Math.round(box*dpr);cvs.height=Math.round(H*dpr);const g=cvs.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,box,H);
  const cw=(box-HL-8)/n,miss=css('--grid');
  sm.forEach((r,i)=>{for(let j=0;j<n;j++){g.fillStyle=r?`rgb(${ramp(BB,tNorm(r[j],lim))})`:miss;g.fillRect(HL+j*cw,HT+i*rh,Math.ceil(cw)+0.5,Math.ceil(rh)+0.5);}});
  g.fillStyle=css('--ink-3');g.font='11px '+css('--f-data');g.textAlign='right';g.textBaseline='middle';
  years.forEach((y,i)=>{if(y%(years.length>60?20:5)===0)g.fillText(y,HL-6,HT+(i+0.5)*rh);});
  g.textAlign='center';g.textBaseline='top';for(let p=0;p<n;p++){const w=(st.s0+Math.floor((p+0.5)*NW/n))%NW,d=new Date(Date.UTC(2001,0,1+7*w+3)),d0=wDate((st.s0+Math.floor(p*NW/n))%NW);if(n<=13||d0.getUTCDate()<=7)g.fillText(MON[(n<=13?d:d0).getUTCMonth()],HL+(p+0.5)*cw,HT+rh*years.length+6);}
  $('shTitle').textContent=mode==='d'?'Abfluss minus Niederschlag, Jahr für Jahr':`${META[mode].name}: Anteil je Abschnitt, Jahr für Jahr`;
  $('shSub').textContent=mode==='d'?`Anteil am Jahresabfluss minus Anteil am Jahresniederschlag je Abschnitt, in Prozentpunkten. ${PALNAME[st.pal][1]}: mehr Abfluss als Niederschlag (Schmelze, Speicher gibt Wasser ab). ${PALNAME[st.pal][0]}: weniger Abfluss als Niederschlag (Wasser bleibt als Schnee, im Boden oder verdunstet).`:
    `Abweichung vom mittleren Anteil ${refFor(mode)[0]}–${refFor(mode)[1]} in Prozentpunkten. ${PALNAME[st.pal][1]}: in diesem Abschnitt mehr als üblich, ${PALNAME[st.pal][0]}: weniger.`;
  const lc=$('lg2').getContext('2d');for(let x=0;x<360;x++){lc.fillStyle=`rgb(${ramp(BB,x/359)})`;lc.fillRect(x,0,1,12);}
  $('shLg').textContent='Prozentpunkte';$('lgt2').innerHTML=[lim[0],lim[0]/2,0,lim[1]/2,lim[1]].map(v=>`<span>${v>0?'+':''}${v.toFixed(1)}</span>`).join('');
  const tp=$('htip');cvs.onpointermove=e=>{const r=cvs.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const j=Math.floor((x-HL)/cw),i=Math.floor((y-HT)/rh);if(j<0||j>=n||i<0||i>=years.length||!sm[i]){tp.hidden=true;return;}
    const p=shares('P',years[i],si),q=shares('Q',years[i],si);
    tp.innerHTML=`<b>${years[i]}</b> · ${si.label(j)}<br><span class="k">Wert</span> <b>${sm[i][j]>0?'+':''}${sm[i][j].toFixed(1)} Pp</b>`+(p?`<br><span class="k">Niederschlag</span> ${p[j].toFixed(1)} %`:'')+(q?`<br><span class="k">Abfluss</span> ${q[j].toFixed(1)} %`:'');
    tp.hidden=false;tp.style.left=Math.min(box-tp.offsetWidth-4,x+14)+'px';tp.style.top=Math.max(0,y-50)+'px';};
  cvs.onpointerleave=()=>tp.hidden=true;
}

/* ---------- yearly indicators from weekly data ---------- */
function yearly(k,fn){if(!has(k))return {years:[],vals:[]};const v=V[k],years=[],vals=[];for(let y=v.y0;y<=Math.min(v.y1,2025);y++){const row=v.g[y-v.y0];if(row.filter(x=>x!=null).length<50){continue;}years.push(y);vals.push(fn(row,y));}return {years,vals};}
function drawCharts(){
  const g=$('charts');g.innerHTML='';const add=(cfg,wide)=>{if(!cfg.years||cfg.years.length<8)return;const d=document.createElement('div');d.className='chart'+(wide?' wide':'');g.appendChild(d);lineChart(d,cfg);};
  const c1=css('--s1'),c2=css('--s2'),c3=css('--s3');
  // temperature anomaly vs ref
  {const [a,b]=refFor('T');const t=yearly('T',r=>r.reduce((s,x)=>s+(x??0),0)/r.filter(x=>x!=null).length);let ref=0,c=0;t.years.forEach((y,i)=>{if(y>=a&&y<=b){ref+=t.vals[i];c++;}});ref/=c;
   add({years:t.years,title:`Jahresmitteltemperatur ${N.T} gegenüber ${a}–${b}`,sub:(ELEV.Th?'°C, homogenisiert. ':'°C, nicht homogenisiert. ')+(b<=1900?'Gestrichelt: Paris-Ziele (globales Mittel); der Alpenraum erwärmt sich etwa doppelt so stark.':`Für den Vergleich mit den Paris-Zielen die Referenz auf ${V.T.y0}–1900 stellen.`),
     series:[{name:'Abweichung',v:t.vals.map(x=>x-ref),c:c2}],zero:0,tf:x=>(x>0?'+':'')+x,vf:x=>(x>0?'+':'')+x.toFixed(2)+' °C',w:1080,h:230,refLines:b<=1900?[{v:1.5,label:'+1.5 °C'},{v:2,label:'+2 °C'}]:[]},true);}
  {const p=yearly('P',r=>r.reduce((s,x)=>s+(x??0),0)*365/364);add({years:p.years,title:`Jahresniederschlag ${N.P}`,sub:'mm pro Jahr',series:[{name:'Summe',v:p.vals,c:c1}],vf:x=>Math.round(x)+' mm'});}
  {const p=yearly('P',r=>{let a=0,t=0;r.forEach((x,w)=>{t+=x;const m=wDate(w+0.5).getUTCMonth();if(m>=5&&m<=7)a+=x;});return a/t*100;});add({years:p.years,title:'Sommeranteil Niederschlag',sub:`% des Jahresniederschlags in Juni–August, ${N.P}`,series:[{name:'Sommer',v:p.vals,c:c1}],vf:x=>x.toFixed(0)+' %'});}
  {const s=yearly('S',r=>{let w0=-1;for(let w=5;w<NW;w++){if(r[w]!=null&&r[w]<5){let ok=true;for(let j=w;j<Math.min(w+8,30);j++)if(r[j]!=null&&r[j]>=5)ok=false;if(ok){w0=w;break;}}}return w0<0?null:w0*7+3;});
   add({years:s.years,title:`Schneeschmelze ${N.S}`,sub:'Datum, ab dem die Schneehöhe unter 5 cm bleibt',series:[{name:'Ausaperung',v:s.vals,c:c1}],tf:x=>fD(new Date(Date.UTC(2001,0,1+x))),vf:x=>fD(new Date(Date.UTC(2001,0,1+Math.round(x)))),ticks:[31,59,90,120]});}
  {const s=yearly('S',r=>r.reduce((s,x)=>s+(x??0),0)/52);add({years:s.years,title:`Mittlere Schneehöhe ${N.S}`,sub:'cm, Jahresmittel',series:[{name:'Schneehöhe',v:s.vals,c:c1}],vf:x=>x.toFixed(1)+' cm'});}
  {const s=yearly('B',r=>{const v=r.slice(30,39).filter(x=>x!=null);return v.reduce((a,b)=>a+b,0)/v.length;});add({years:s.years,title:'Bodenfeuchte im Spätsommer',sub:`% Speicherfüllung Aug–Sep, ${N.loc}, modelliert`,series:[{name:'Bodenfeuchte',v:s.vals,c:c1}],vf:x=>x.toFixed(0)+' %'});}
  {const s=yearly('F',r=>{let a=0,c=0;for(const w of [...Array(13).keys(),48,49,50,51]){if(r[w]!=null){a+=r[w];c++;}}return a/c;});add({years:s.years,title:'Winterniederschlag als Schnee',sub:`geschätzter Schneeanteil Dez–Mär, ${N.T}, %`,series:[{name:'Schneeanteil',v:s.vals,c:c1}],vf:x=>x.toFixed(0)+' %'});}
  {const q=yearly('Q',r=>r.reduce((s,x)=>s+x,0)/52);add({years:q.years,title:`Jahresabfluss ${N.Q}`,sub:'m³/s, Jahresmittel',series:[{name:'Abfluss',v:q.vals,c:c3}],vf:x=>x.toFixed(1)+' m³/s',sm:Math.min(st.sm,9)});}
  {const q=yearly('Q',r=>{const t=r.reduce((s,x)=>s+x,0);let c=0;for(let w=0;w<NW;w++){c+=r[w];if(c>=t/2)return w*7+3;}return null;});
   add({years:q.years,title:'Abfluss-Schwerpunkt',sub:'Datum, an dem die Hälfte des Jahresabflusses durchgeflossen ist',series:[{name:'Schwerpunkt',v:q.vals,c:c3}],tf:x=>fD(new Date(Date.UTC(2001,0,1+x))),vf:x=>fD(new Date(Date.UTC(2001,0,1+Math.round(x)))),sm:Math.min(st.sm,9)});}
  {const q=yearly('Q',r=>{let a=0,t=0;r.forEach((x,w)=>{t+=x;const m=wDate(w+0.5).getUTCMonth();if(m>=6&&m<=8)a+=x;});return a/t*100;});
   add({years:q.years,title:'Spätsommer-Anteil Abfluss',sub:'% des Jahresabflusses in Juli–September, wenn Schnee- und Gletscherschmelze den Fluss speisen',series:[{name:'Jul–Sep',v:q.vals,c:c3}],vf:x=>x.toFixed(0)+' %',sm:Math.min(st.sm,9)});}
}

/* ---------- Landschaft: indicators for landscape planning ---------- */
const LAPSE=0.55; // °C per 100 m (mean annual lapse rate, Swiss Alps)
const ZONES=[['kollin',0,600],['montan',600,1300],['subalpin',1300,1900],['alpin',1900,2600],['nival',2600,4600]];
const mean=a=>{const b=a.filter(x=>x!=null&&isFinite(x));return b.length?b.reduce((s,x)=>s+x,0)/b.length:null;};
function cmp(years,vals,a,b,rec){const A=[],B=[];years.forEach((y,i)=>{if(y>=a&&y<=b)A.push(vals[i]);if(y>=rec[0]&&y<=rec[1])B.push(vals[i]);});return [mean(A),mean(B),A.filter(x=>x!=null).length,B.filter(x=>x!=null).length];}
const RECENT=[2016,2025];
const fmtSign=(x,d=1)=>x==null?'–':(x>0?'+':x<0?'−':'±')+Math.abs(x).toFixed(d);
const doyD=x=>x==null?'–':fD(new Date(Date.UTC(2001,0,1+Math.round(x))));
function seasonMean(k,y,weeks){const v=V[k];const vals=[];for(const [yy,w] of weeks){const r=v.g[yy-v.y0];if(r&&r[w]!=null)vals.push(r[w]);}return vals.length>=weeks.length*0.8?mean(vals):null;}
function landData(){
  const D={};
  if(has('T')){const T=V.T,ys=[],ta=[],h0=[];
    for(let y=T.y0;y<=Math.min(T.y1,2025);y++){const r=T.g[y-T.y0];if(r.filter(x=>x!=null).length<48)continue;ys.push(y);ta.push(mean(r));
      const w=[];for(let k=48;k<52;k++)w.push([y-1,k]);for(let k=0;k<9;k++)w.push([y,k]);const tw=seasonMean('T',y,w);h0.push(tw==null||ELEV.T==null?null:ELEV.T+tw/LAPSE*100);}
    D.ty=ys;D.ta=ta;D.h0=h0;}
  if(has('P')&&has('E')){const P=V.P,E=V.E,ys=[],bal=[],mon={};
    for(let y=E.y0;y<=Math.min(E.y1,2025);y++){const rp=P.g[y-P.y0],re=E.g[y-E.y0];if(!rp||!re)continue;const m=new Array(12).fill(0),c=new Array(12).fill(0);let s=0,n=0;
      for(let w=0;w<NW;w++){if(rp[w]==null||re[w]==null)continue;const mo=wDate(w+0.5).getUTCMonth();m[mo]+=rp[w]-re[w];c[mo]++;if(mo>=5&&mo<=7){s+=rp[w]-re[w];n++;}}
      mon[y]=m.map((x,i)=>c[i]>=3?x:null);if(n>=11){ys.push(y);bal.push(s);}}
    D.by=ys;D.bal=bal;D.mon=mon;}
  if(has('Q')){const Q=V.Q,ys=[],mn=[],tw=[],q347=[];
    for(let y=Q.y0;y<=Math.min(Q.y1,2025);y++){const r=Q.g[y-Q.y0];if(!r||r.filter(x=>x!=null).length<50)continue;let m=1e9,wm=0;r.forEach((x,w)=>{if(x!=null&&x<m){m=x;wm=w;}});
      const s=r.filter(x=>x!=null).sort((a,b)=>a-b);ys.push(y);mn.push(m);tw.push(wm*7+3);q347.push(pctl(s,0.05));}
    D.qy=ys;D.qmin=mn;D.qtw=tw;D.q347=q347;}
  return D;
}
/* standardised 3-month climatic water balance (SPEI-like, z-scores per calendar month vs reference) */
function speiGrid(mon,a,b){
  const ys=Object.keys(mon).map(Number).sort((x,y)=>x-y);const acc={};
  for(const y of ys)acc[y]=mon[y].map((_,m)=>{let s=0;for(let k=0;k<3;k++){let mm=m-k,yy=y;if(mm<0){mm+=12;yy--;}const v=mon[yy]&&mon[yy][mm];if(v==null)return null;s+=v;}return s;});
  const z={};for(let m=0;m<12;m++){let vals=ys.filter(y=>y>=a&&y<=b).map(y=>acc[y][m]).filter(x=>x!=null);if(vals.length<8)vals=ys.map(y=>acc[y][m]).filter(x=>x!=null);
    const mu=mean(vals),sd=Math.sqrt(mean(vals.map(x=>(x-mu)**2))||1);for(const y of ys){(z[y]=z[y]||new Array(12).fill(null))[m]=acc[y][m]==null?null:(acc[y][m]-mu)/sd;}}
  return {ys,z};
}
function tiles(D){
  const out=[];const [a,b]=refFor(has('T')?'T':'P');const ref=`${a}–${b}`,rec=`${RECENT[0]}–${RECENT[1]}`;
  if(D.ty){const [A,B]=cmp(D.ty,D.ta,a,b,RECENT);if(A!=null&&B!=null){const dT=B-A;out.push(['Temperatur',`${fmtSign(dT)} °C`,`Jahresmittel ${N.T}, ${rec} gegenüber ${ref}`]);
    out.push(['Höhenverschiebung',`≈ ${fmtSign(dT/LAPSE*100,0)} m`,`So viel höher liegt heute das Klima von ${ref} (ΔT ÷ ${LAPSE} °C/100 m)`]);}
    const [h1,h2]=cmp(D.ty,D.h0,a,b,RECENT);if(h1!=null&&h2!=null)out.push(['Nullgradgrenze Winter',`${Math.round(h1/10)*10} → ${Math.round(h2/10)*10} m`,`Dez–Feb, geschätzt aus ${N.T}`]);}
  const A=V.T&&V.T.ann;
  if(A&&A.year.length){const vl=cmp(A.year,A.vl,a,b,RECENT),vs=cmp(A.year,A.vs,a,b,RECENT);if(vl[0]!=null&&vl[1]!=null)out.push(['Vegetationsperiode',`${fmtSign(vl[1]-vl[0],0)} Tage`,`${Math.round(vl[0])} → ${Math.round(vl[1])} Tage, Beginn ${doyD(vs[0])} → ${doyD(vs[1])}`]);
    const ho=cmp(A.year,A.hot,a,b,RECENT),tr=cmp(A.year,A.trop,a,b,RECENT);if(ho[2]>=5&&ho[3]>=5)out.push(['Hitzetage ≥ 30 °C',`${ho[0].toFixed(1)} → ${ho[1].toFixed(1)}`,`pro Jahr${tr[2]>=5?` · Tropennächte ${tr[0].toFixed(1)} → ${tr[1].toFixed(1)}`:''}`]);
    const fa=cmp(A.year,A.frostAfter,a,b,RECENT);if(fa[2]>=5&&fa[3]>=5)out.push(['Spätfrost',`${fa[0].toFixed(1)} → ${fa[1].toFixed(1)}`,'Frosttage nach Vegetationsbeginn pro Jahr']);}
  if(D.by){const [x,y]=cmp(D.by,D.bal,a,b,RECENT);if(x!=null&&y!=null)out.push(['Sommer-Wasserbilanz',`${fmtSign(y-x,0)} mm`,`Niederschlag − Verdunstung Jun–Aug: ${Math.round(x)} → ${Math.round(y)} mm`]);}
  if(D.qy){const [qa,qb]=refFor('Q');const r=cmp(D.qy,D.qmin,qa,qb,[Math.max(qb+1,RECENT[0]),RECENT[1]]);if(r[0]&&r[1]&&r[3]>=3)out.push(['Niedrigwasser',`${fmtSign((r[1]/r[0]-1)*100,0)} %`,`tiefstes Wochenmittel ${N.Q}: ${r[0].toFixed(1)} → ${r[1].toFixed(1)} m³/s (${qa}–${qb} vs. ${Math.max(qb+1,RECENT[0])}–${RECENT[1]})`]);}
  return out;
}
function drawProfile(el,dh){
  const Wd=360,Ht=320,L=46,T=12,B=26,ph=Ht-T-B,lo=200,hi=3600,Y=h=>T+(1-(h-lo)/(hi-lo))*ph,cw=110,x1=L+30,x2=x1+cw+50;
  const fills=['#1a1a1a','#232323','#2c2c2c','#363636','#444444'];
  let s=`<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Höhenstufen Referenz und heute">`;
  [500,1000,1500,2000,2500,3000,3500].forEach(h=>{s+=`<line x1="${L}" x2="${Wd-6}" y1="${Y(h)}" y2="${Y(h)}" stroke="var(--grid)"/><text x="${L-6}" y="${Y(h)+3.5}" text-anchor="end">${h}</text>`;});
  const col=(x,shift,label)=>{let t='';ZONES.forEach(([n,a,b],i)=>{const ya=Y(Math.min(hi,b+(i<4?shift:0))),yb=Y(Math.max(lo,a+(i>0?shift:0)));if(yb<=T)return;t+=`<rect x="${x}" y="${Math.max(T,ya).toFixed(1)}" width="${cw}" height="${(yb-Math.max(T,ya)).toFixed(1)}" fill="${fills[i]}" stroke="var(--surface)" stroke-width="2"/>`;
    const ym=(Math.max(T,ya)+yb)/2;if(yb-Math.max(T,ya)>14)t+=`<text class="lab" x="${x+cw/2}" y="${ym+3.5}" text-anchor="middle">${n}</text>`;});
    t+=`<text class="lab" x="${x+cw/2}" y="${Ht-8}" text-anchor="middle">${label}</text>`;return t;};
  const [a,b]=refFor('T');s+=col(x1,0,`${a}–${b}`)+col(x2,dh,`${RECENT[0]}–${RECENT[1]}`);
  ZONES.slice(1).forEach(([n,a_])=>{s+=`<line x1="${x1+cw}" y1="${Y(a_)}" x2="${x2}" y2="${Y(a_+dh)}" stroke="var(--ink-3)" stroke-dasharray="2 3"/>`;});
  if(N.loc&&window.__locElev!=null){const yy=Y(window.__locElev);s+=`<line x1="${L}" x2="${Wd-6}" y1="${yy}" y2="${yy}" stroke="var(--target)" stroke-width="1.5"/><text class="tgt" x="${L+2}" y="${yy-4}">${N.loc} ${window.__locElev} m</text>`;}
  s+='</svg>';
  el.innerHTML=`<h3>Höhenstufen rücken nach oben</h3><p>Schematische Vegetationshöhenstufen (nördliche Randalpen) und ihre Verschiebung um ${Math.round(dh)} m bei gleicher Temperatur. Lokale Grenzen variieren je nach Region, Exposition und Boden.</p>`+s;
}
function drawSpei(el,sp){
  const ys=sp.ys.filter(y=>sp.z[y]&&sp.z[y].some(v=>v!=null));if(ys.length<8){el.remove();return;}
  el.innerHTML=`<h3>Trockenstress im Jahreslauf</h3><p>Standardisierte klimatische Wasserbilanz über 3 Monate (wie SPEI-3), je Kalendermonat verglichen mit der Referenz. ${PALNAME[st.pal][0]}: trockener, ${PALNAME[st.pal][1]}: feuchter. Unter −1 gilt als trocken, unter −1.5 als sehr trocken.</p><div class="vizbox"><canvas style="display:block;width:100%"></canvas><div class="tip" hidden></div></div><div class="legend"><span>Standardabweichungen</span><div class="lgscale"><canvas width="360" height="12"></canvas><div class="lgticks"><span>−2</span><span>−1</span><span>0</span><span>+1</span><span>+2</span></div></div></div>`;
  const cv=el.querySelector('.vizbox canvas'),box=el.clientWidth,dpr=window.devicePixelRatio||1,HL=40,HT=4,HB=20,rh=Math.max(2.5,Math.min(9,300/ys.length)),H=HT+HB+rh*ys.length,cw=(box-HL-6)/12;
  cv.style.height=H+'px';cv.width=Math.round(box*dpr);cv.height=Math.round(H*dpr);const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
  ys.forEach((y,i)=>sp.z[y].forEach((v,m)=>{g.fillStyle=v==null?css('--grid'):`rgb(${ramp(BB,(Math.max(-2,Math.min(2,v))+2)/4)})`;g.fillRect(HL+m*cw,HT+i*rh,Math.ceil(cw)+0.5,Math.ceil(rh)+0.5);}));
  g.fillStyle=css('--ink-3');g.font='10px '+css('--f-data');g.textAlign='right';g.textBaseline='middle';ys.forEach((y,i)=>{if(y%(ys.length>60?20:10)===0)g.fillText(y,HL-6,HT+(i+0.5)*rh);});
  g.textAlign='center';g.textBaseline='top';MON.forEach((m,i)=>g.fillText(m,HL+(i+0.5)*cw,HT+rh*ys.length+5));
  const lc=el.querySelector('.legend canvas').getContext('2d');for(let x=0;x<360;x++){lc.fillStyle=`rgb(${ramp(BB,x/359)})`;lc.fillRect(x,0,1,12);}
  const tp=el.querySelector('.tip');cv.onpointermove=e=>{const r=cv.getBoundingClientRect(),x=e.clientX-r.left,yy=e.clientY-r.top;const m=Math.floor((x-HL)/cw),i=Math.floor((yy-HT)/rh);if(m<0||m>11||i<0||i>=ys.length){tp.hidden=true;return;}
    const v=sp.z[ys[i]][m];tp.innerHTML=`<b>${MON[m]} ${ys[i]}</b><br><span class="k">3 Monate bis Ende ${MON[m]}</span> <b>${v==null?'–':fmtSign(v,2)}</b>`;tp.hidden=false;tp.style.left=Math.min(box-tp.offsetWidth-4,x+12)+'px';tp.style.top=Math.max(0,yy-44)+'px';};
  cv.onpointerleave=()=>tp.hidden=true;
}
function drawLand(){
  const g=$('landCharts'),tl=$('landTiles');if(!g)return;g.innerHTML='';
  const D=landData();window.__locElev=ELEV.loc??null;
  tl.innerHTML=tiles(D).map(([k,v,s])=>`<div class="tile"><div class="eyebrow">${k}</div><div class="big">${v}</div><div class="note">${s}</div></div>`).join('');
  const add=(cfg,wide)=>{if(!cfg.years||cfg.years.filter((_,i)=>cfg.series.some(s=>s.v[i]!=null)).length<8)return null;const d=document.createElement('div');d.className='chart'+(wide?' wide':'');g.appendChild(d);lineChart(d,cfg);return d;};
  const box=()=>{const d=document.createElement('div');d.className='chart';g.appendChild(d);return d;};
  const c1=css('--s1'),c2=css('--s2'),c3=css('--s3'),c4=css('--s4'),c5=css('--s5');const [a,b]=refFor(has('T')?'T':'P');
  if(D.ty){const [A]=cmp(D.ty,D.ta,a,b,RECENT);if(A!=null){
    add({years:D.ty,title:'Höhenverschiebung des Klimas',sub:`Temperaturabweichung gegenüber ${a}–${b} in Höhenmetern ausgedrückt (${LAPSE} °C pro 100 m). +300 m heisst: Es ist so warm wie früher 300 m tiefer.`,series:[{name:'Höhenverschiebung',v:D.ta.map(x=>x==null?null:(x-A)/LAPSE*100),c:c2}],zero:0,tf:x=>(x>0?'+':'')+x+' m',vf:x=>fmtSign(x,0)+' m',w:1080,h:220},true);
    const [B]=cmp(D.ty,D.ta,RECENT[0],RECENT[1],RECENT);drawProfile(box(),B!=null?(B-A)/LAPSE*100:0);}
    add({years:D.ty,title:'Nullgradgrenze im Winter',sub:`Höhe, auf der das Dez–Feb-Mittel 0 °C beträgt, geschätzt aus ${N.T} (${ELEV.T??'?'} m) mit ${LAPSE} °C/100 m. Darunter fällt Niederschlag zunehmend als Regen.`,series:[{name:'Nullgradgrenze',v:D.h0,c:c1}],vf:x=>Math.round(x)+' m',tf:x=>x+' m'});}
  const A=V.T&&V.T.ann;
  if(A&&A.year.length){
    add({years:A.year,title:'Vegetationsperiode: Beginn und Ende',sub:'Beginn: erste 6 Tage in Folge über 5 °C; Ende: erste 6 Tage in Folge unter 5 °C ab Juli',series:[{name:'Ende',v:A.ve,c:c2},{name:'Beginn',v:A.vs,c:c3}],tf:doyD,vf:doyD,ticks:[31,90,151,212,273,334],rightPad:40,legend:true});
    add({years:A.year,title:'Länge der Vegetationsperiode',sub:'Tage pro Jahr',series:[{name:'Länge',v:A.vl,c:c3}],vf:x=>Math.round(x)+' Tage'});
    add({years:A.year,title:'Spätfrost nach Vegetationsbeginn',sub:'Frosttage (Minimum unter 0 °C) zwischen Vegetationsbeginn und Ende Juni; je mehr, desto grösser das Risiko für Blüten und Austrieb',series:[{name:'Frosttage',v:A.frostAfter,c:c1}],vf:x=>x.toFixed(1)+' Tage'});
    add({years:A.year,title:'Letzter Frost im Frühling',sub:'Datum des letzten Tages mit Minimum unter 0 °C vor Juli',series:[{name:'Letzter Frost',v:A.lastFrost,c:c1}],tf:doyD,vf:doyD});
    add({years:A.year,title:'Hitze',sub:'Sommertage (Maximum ≥ 25 °C), Hitzetage (≥ 30 °C) und Tropennächte (Minimum ≥ 20 °C) pro Jahr',series:[{name:'Sommertage',v:A.summer,c:c4},{name:'Hitzetage',v:A.hot,c:c2},{name:'Tropennächte',v:A.trop,c:c5}],vf:x=>x.toFixed(1)+' Tage',rightPad:70,legend:true});}
  if(D.mon){drawSpei(box(),speiGrid(D.mon,a,b));
    add({years:D.by,title:'Sommer-Wasserbilanz',sub:`Niederschlag ${N.P} minus geschätzte Verdunstung, Juni–August, mm. Unter null verliert der Boden über den Sommer Wasser.`,series:[{name:'Wasserbilanz',v:D.bal,c:c1}],zero:0,vf:x=>Math.round(x)+' mm'});}
  const AP=V.P&&V.P.ann;
  if(AP&&AP.year.length)add({years:AP.year,title:'Längste Trockenperiode Apr–Sep',sub:`Tage in Folge mit weniger als 1 mm, ${N.P}`,series:[{name:'Trockenperiode',v:AP.dry,c:c2}],vf:x=>Math.round(x)+' Tage'});
  if(D.qy){
    add({years:D.qy,title:'Niedrigwasser',sub:`Tiefstes Wochenmittel und Abfluss, der an 95 % der Wochen erreicht wird (ähnlich Q347), ${N.Q}`,series:[{name:'Q95 Woche',v:D.q347,c:c3},{name:'Minimum',v:D.qmin,c:c1}],vf:x=>x.toFixed(1)+' m³/s',sm:Math.min(st.sm,7),rightPad:70,legend:true});
    add({years:D.qy,title:'Wann ist das Wasser am tiefsten?',sub:'Datum des tiefsten Wochenmittels. Alpine Flüsse haben ihr Minimum im Winter; rückt es in den Spätsommer, prägen Regen und Verdunstung den Fluss stärker als Schnee.',series:[{name:'Minimum',v:D.qtw,c:c1}],tf:doyD,vf:doyD,ticks:[31,120,212,304],sm:Math.min(st.sm,7)});}
}

function all(){if(!has('T')&&!has('P'))return;setWhere();updateVarButtons();draw();drawLand();drawJG();drawScatter();drawCum();drawSeg();drawCharts();}
function updateVarButtons(){document.querySelectorAll('#varSeg button').forEach(b=>{b.hidden=!has(b.dataset.v);});document.querySelectorAll('#segVar button').forEach(b=>{b.hidden=!has(b.dataset.s);});document.querySelectorAll('#heatMode button').forEach(b=>{b.hidden=b.dataset.h!=='P'&&!has('Q');});}
syncControls();
let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(has('T')||has('P')){draw();drawSeg();}},120);});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',all);
new MutationObserver(all).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});


window.KK={redraw(){if(has('T')||has('P'))all();},place(){const st_=['T','P','S','Q'].filter(k=>N[k]).map(k=>META[k].name+' '+N[k]).join(', ');return (N.loc?N.loc+' · ':'')+st_;},setData(out,names,elev,loc){
  V=out;ELEV.loc=null;N={T:names.T||'',P:names.P||'',S:names.S||'',Q:names.Q||'',loc:loc&&loc.name?loc.name:''};ELEV=elev||{};
  ELEV.loc=loc&&loc.elev!=null?loc.elev:null;buildDerived(loc&&loc.lat);finishV();
  const ysMin=Math.min(...Object.values(V).map(v=>v.y0));$('ys').min=ysMin;$('r0').min=ysMin;
  all();
}};
