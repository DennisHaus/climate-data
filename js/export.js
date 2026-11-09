/* climate-data · Grafiken herunterladen (SVG/PNG, transparenter Hintergrund) */
(function(){
let MODE='light';
try{MODE=localStorage.getItem('climate-data-export')||'light';}catch(e){}
const slug=t=>(t||'grafik').toLowerCase().replace(/[äöü]/g,m=>({'ä':'ae','ö':'oe','ü':'ue'}[m])).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
function place(){return (window.KK&&window.KK.place&&window.KK.place())||'';}

/* render once with export colours (transparent surfaces, chosen ink), run fn, restore */
function withInk(fn){
  const root=document.documentElement;root.dataset.export=MODE;
  try{window.KK&&window.KK.redraw&&window.KK.redraw();return fn();}
  finally{delete root.dataset.export;window.KK&&window.KK.redraw&&window.KK.redraw();}
}
const PROPS=['fill','stroke','stroke-width','stroke-dasharray','stroke-opacity','fill-opacity','opacity','font-family','font-size','font-weight','text-anchor','stroke-linejoin','stroke-linecap','visibility'];
function svgString(svg,title,sub){
  const clone=svg.cloneNode(true);const src=svg.querySelectorAll('*'),dst=clone.querySelectorAll('*');
  src.forEach((el,i)=>{const cs=getComputedStyle(el);const d=dst[i];PROPS.forEach(p=>{const v=cs.getPropertyValue(p);if(v)d.style.setProperty(p,v);});d.removeAttribute('class');});
  clone.querySelectorAll('.xh,[visibility="hidden"]').forEach(e=>e.remove());
  const vb=(svg.getAttribute('viewBox')||`0 0 ${svg.clientWidth} ${svg.clientHeight}`).split(/\s+/).map(Number);
  const ink=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()||'#eee';
  const ink3=getComputedStyle(document.documentElement).getPropertyValue('--ink-3').trim()||'#888';
  const top=title?(sub?40:24):0;const W=vb[2],H=vb[3]+top;
  const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let head=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb[0]} ${vb[1]-top} ${W} ${H}" width="${W*2}" height="${H*2}">`;
  if(title)head+=`<text x="${vb[0]}" y="${vb[1]-top+13}" style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;fill:${ink};letter-spacing:.06em">${esc(title.toUpperCase())}</text>`;
  if(sub)head+=`<text x="${vb[0]}" y="${vb[1]-top+29}" style="font-family:Geist Mono,monospace;font-size:9.5px;fill:${ink3}">${esc(sub)}</text>`;
  return head+clone.innerHTML+'</svg>';
}
function svgToPng(str,name){const img=new Image();const url=URL.createObjectURL(new Blob([str],{type:'image/svg+xml'}));
  img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);c.toBlob(b=>save(b,name));URL.revokeObjectURL(url);};img.src=url;}
function chartMeta(el){const h=el.querySelector('h3');return [h?h.textContent.trim():'',place()];}

function exportChart(el,fmt){
  const [title,sub]=chartMeta(el);const name=slug(title+'-'+sub);
  withInk(()=>{
    const svg=el.querySelector('svg');
    if(svg){const s=svgString(svg,title,sub);if(fmt==='svg')save(new Blob([s],{type:'image/svg+xml'}),name+'.svg');else svgToPng(s,name+'.png');return;}
    const cv=el.querySelector('canvas');if(cv)canvasPng(cv,el.querySelector('.legend'),title,sub,name);
  });
}
/* canvas + optional legend composed into one transparent PNG */
function canvasPng(cv,legend,title,sub,name){
  const dpr=cv.width/cv.clientWidth||1,top=title?44*dpr:0,lgH=legend?40*dpr:0;
  const c=document.createElement('canvas');c.width=cv.width;c.height=cv.height+top+lgH;const g=c.getContext('2d');
  const cs=getComputedStyle(document.documentElement),ink=cs.getPropertyValue('--ink').trim(),ink3=cs.getPropertyValue('--ink-3').trim();
  if(title){g.fillStyle=ink;g.font=`700 ${13*dpr}px Geist Mono, monospace`;g.fillText(title.toUpperCase(),0,16*dpr);g.fillStyle=ink3;g.font=`${10*dpr}px Geist Mono, monospace`;g.fillText(sub,0,33*dpr);}
  g.drawImage(cv,0,top);
  if(legend){const lc=legend.querySelector('canvas');const y=top+cv.height+8*dpr;const w=Math.min(360*dpr,c.width*0.6);
    if(lc)g.drawImage(lc,0,y,w,10*dpr);g.fillStyle=ink3;g.font=`${10*dpr}px Geist Mono, monospace`;
    const ticks=[...legend.querySelectorAll('.lgticks span')].map(s=>s.textContent);ticks.forEach((t,i)=>{g.textAlign=i===0?'left':i===ticks.length-1?'right':'center';g.fillText(t,w*i/(ticks.length-1),y+24*dpr);});
    const lab=legend.querySelector('span');if(lab){g.textAlign='left';g.fillText(lab.textContent,w+16*dpr,y+9*dpr);}}
  c.toBlob(b=>save(b,name+'.png'));
}
function addButtons(el,opts){
  if(el.querySelector(':scope > .dl'))return;const d=document.createElement('div');d.className='dl';
  d.innerHTML=(opts.svg?'<button type="button" data-f="svg">SVG</button>':'')+'<button type="button" data-f="png">PNG</button>';
  d.querySelectorAll('button').forEach(b=>b.onclick=()=>opts.run(b.dataset.f));el.appendChild(d);
}
function scan(){
  document.querySelectorAll('.chart').forEach(el=>{const svg=el.querySelector('svg'),cv=el.querySelector('canvas');if(!svg&&!cv)return;if(el.id==='mapWrap')return;addButtons(el,{svg:!!svg,run:f=>exportChart(el,f)});});
  const cal=document.getElementById('vizbox');
  if(cal&&!cal.parentElement.querySelector(':scope > .dl')){const p=cal.parentElement;p.style.position='relative';
    addButtons(p,{svg:false,run:()=>{const t=document.getElementById('lgTitle').textContent;const name=slug('klimakalender-'+t+'-'+place());
      withInk(()=>canvasPng(document.getElementById('cal'),p.querySelector('.legend'),'Klimakalender · '+t,place(),name));}});
    const dl=p.querySelector(':scope > .dl');dl.style.top='18px';dl.style.right='18px';}
}
const mo=new MutationObserver(()=>{clearTimeout(mo.t);mo.t=setTimeout(scan,60);});
window.addEventListener('DOMContentLoaded',()=>{
  mo.observe(document.body,{childList:true,subtree:true});scan();
  const seg=document.getElementById('expSeg');if(seg){const sync=()=>seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.e===MODE)));sync();
    seg.querySelectorAll('button').forEach(b=>b.onclick=()=>{MODE=b.dataset.e;try{localStorage.setItem('climate-data-export',MODE);}catch(e){}sync();});}
  const rb=document.getElementById('btnReadme');if(rb)rb.onclick=()=>{const d=document.getElementById('readmeDetails');d.open=true;d.scrollIntoView({behavior:'smooth'});};
});
window.CDX={save,slug,svgString,withInk,get mode(){return MODE;}};
})();
