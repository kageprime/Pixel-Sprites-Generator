// @ts-nocheck — Phase 1 lift-and-shift: extracted verbatim from hollow.src.html.
// Proper typing happens in Phase 2 modularization; behavior must stay identical.
import { DATA } from '../assets/art';
import { TICK, clamp } from '../engine/math';
import { $, mk } from '../engine/dom';
import { snd, toggleMute, paintMute } from '../engine/audio';
import { CHR } from '../engine/moves';
import { setCamMatrix as setCamMatrixBase, proj as projBase, depthOf as depthOfBase, rowOf as rowOfBase } from '../engine/projection';
import { createHollow } from '../sim/hollow';
import { createHollowRenderer, PROP_LIST } from '../render/hollow';
import { createSpriteLoader } from '../engine/sprites';
(()=>{
'use strict';
/* ================= Hollow I: Cinder Hall — iso rebuild of the prototype ================
   World design mirrors `Veilspire_ Hollow I, Cinder Hall.html`: 38x36 tiles, carved rooms,
   5 zones, 12 braziers, 6 named Hosts + Pell boss, rest seal, 2 chests, intro LINES.
   Rendering/input/sprite pipeline mirrors combat.src.html (proj/cam/IMG/loaders). */
const IMG={};
/* shell-owned intro copy (sim owns map/AI data) */
const LINES=["The Spire does not ask who you were.","Ren Calder. Porter. The weakest licensed body in the city.","He carried Bram Holt's pack into a rift that ate the whole party.","He walked out with a cracked seal, and a Ledger that would not close.","Others read their Ledger as a rank. Ren's writes to him. It bargains.","Floor One. The fallen are pressed into Hosts, and they wait below.","Hollow I. Cinder Hall. Go down."];

/* ---------- canvases ---------- */
const cv=$('c'), cg=cv.getContext('2d');
let VW=640,VH=360,S,sg,baseZoom=.85,DPRS=1;
function setSize(w,h){VW=w;VH=h;cv.width=w;cv.height=h;S=mk(w,h);sg=S.getContext('2d');}
function fit(){const st=$('stage');const cw=st.clientWidth||640,ch=st.clientHeight||430;
  DPRS=Math.min(window.devicePixelRatio||1,1.5);
  const w=Math.max(320,Math.round(cw*DPRS)),h=Math.max(240,Math.round(ch*DPRS));
  if(w!==VW||h!==VH||!S)setSize(w,h);
  baseZoom=clamp(Math.min(cw,ch)/520,.55,1);
  st.style.setProperty('--s',clamp(cw/640,1,2.2).toFixed(3));}

/* ---------- options/input/audio ---------- */
const opt={light:true,shake:true,fx:true};
/* ---------- state (owned by HS; UI stays shell) ---------- */
const UI={open:null,p1:'ren_calder',s1:'pixel'};
/* input state + hollow sim + renderer: shared sim/hollow, render/hollow */
const HS=createHollow({IMG,opt,UI,project:(x,y,z)=>proj(x,y,z)});
const keys=HS.input.keys, touchMove=HS.input.touchMove;
const HR=createHollowRenderer({IMG,UI,opt,getView:()=>({VW,VH,baseZoom,DPRS}),gfx:()=>({sg,cg,S,VW,VH,baseZoom,DPRS})});

/* ---------- projection (shared engine/projection; Z stays local) ---------- */
function setCamMatrix(){HS.cam.Z=baseZoom*HS.cam.zoom*DPRS;setCamMatrixBase(HS.cam)}
function proj(x,y,z){return projBase(HS.cam,VW,VH,x,y,z)}
const depthOf=(x,y)=>depthOfBase(HS.cam,x,y);
const rowOf=face=>rowOfBase(HS.cam,face);

/* ---------- shell ---------- */
const ROLE={Breaker:'#d9894f',Shade:'#9b8bdc',Lance:'#6fbfa8',Beacon:'#dcc66e',Weaver:'#7fb2ea',Warden:'#a9c07a'};
let introIl=0,introTi=0,introIv=0,hov=null;
function showOv(id){if(UI.open)$(UI.open).classList.remove('on');UI.open=id;keys.clear();$(id).classList.add('on');document.body.style.overflow='hidden'}
function hideOv(){if(!UI.open)return;$(UI.open).classList.remove('on');UI.open=null;document.body.style.overflow='';last=performance.now()}
function goOv(id){hideOv();showOv(id)}
function paintCreate(){const c=CHR[UI.p1];if(!c)return;
  const el=document.querySelector('.slot.s1');
  el.querySelector('.sn').textContent=c.name;
  el.querySelector('.st').textContent=((c.title||'')+' · '+c.role+', '+c.weapon).replace(/^ · /,'');
  el.querySelector('.sm').innerHTML=['attack1','attack2','attack3','launcher'].map(s=>{const a=(CHR[UI.p1].attacks||[]).find(x=>x.slot===s);return a?`<li>${a.name}</li>`:''}).join('')||'<li>Surface Cut — crack seals</li>';
  el.querySelector('.skinname').textContent=UI.s1==='toon'?'Toon':'Pixel';
  document.querySelectorAll('#roster .card').forEach(k=>k.classList.toggle('picked',k.dataset.id===UI.p1));}
function sprite(g,id,row,f,size,skin){const sk=skin==='toon'?'toon/':'';const im=IMG[sk+id+'/idle']||IMG[id+'/idle'];if(!im)return;
  const C=im.width/6,k=C/96;g.imageSmoothingEnabled=C>=190;g.clearRect(0,0,size,size);
  g.drawImage(im,f*C+12*k,row*C+6*k,72*k,72*k,0,0,size,size)}
function paintCards(){document.querySelectorAll('#roster .card').forEach(k=>{sprite(k.querySelector('canvas').getContext('2d'),k.dataset.id,2,0,72,UI.s1)})}
function startIntro(){introIl=0;showOv('intro');snd(220,.08);typeLine()}
function typeLine(){const T=$('introText'),Hh=$('introHint');clearInterval(introIv);introTi=0;Hh.textContent='space to continue';
  introIv=setInterval(()=>{introTi++;T.textContent=LINES[introIl].slice(0,introTi);
    if(introTi>=LINES[introIl].length){clearInterval(introIv);Hh.textContent=introIl>=LINES.length-1?'press space to enter the Hollow':'space to continue'}},36)}
function advanceIntro(){snd(440,.05);
  if(introTi<LINES[introIl].length){introTi=LINES[introIl].length;$('introText').textContent=LINES[introIl];clearInterval(introIv);
    $('introHint').textContent=introIl>=LINES.length-1?'press space to enter the Hollow':'space to continue';return}
  introIl++;
  if(introIl>=LINES.length){HS.reset();hideOv();try{sessionStorage.vs_hollow_intro='1'}catch(e){}}
  else typeLine()}
function descend(){busyOn();try{localStorage.setItem('vs_hollow_p1',UI.p1);localStorage.setItem('vs_hollow_s1',UI.s1)}catch(e){}
  loadFighter(UI.p1,UI.s1,()=>{busyOff();HS.reset();startIntro()})}
function busyOn(){$('busy').classList.add('on')}
function busyOff(){$('busy').classList.remove('on')}

/* loaders: portraits for all, full kit for chosen */
const ANIM_NEED=['idle','walk','attack1','attack2','attack3','jump','dash','guard','hit','death','victory'];
/* sprite loading: shared engine/sprites */
const SL=createSpriteLoader(IMG,DATA,{toonBase:'/toons',busyOn:()=>busyOn(),busyOff:()=>busyOff()});
function loadImgs(keys,done){return SL.loadImgs(keys,done)}
function loadPortraits(done){loadImgs(Object.values(CHR).map(c=>c.id+'/idle').filter(k=>DATA.img[k]),()=>{paintCards();if(done)done()})}
function loadFighter(id,skin,done){const px=[],tx=[];
  ANIM_NEED.forEach(a=>['','p16/','p38/'].forEach(p=>{if(skin==='toon')tx.push('toon/'+id+'/'+p+a);else px.push(id+'/'+p+a)}));
  loadImgs(px,()=>{if(skin==='toon'){loadToons(tx,done)}else done()})}
function loadToons(keys,done){return SL.loadToons(keys,done)}

/* ---------- boot ---------- */
function initUI(){const ros=$('roster');
  ros.innerHTML=Object.values(CHR).map(c=>'<button class="card" data-id="'+c.id+'" style="--rc:'+(ROLE[c.role]||'#999')+'" aria-label="'+c.name+'"><canvas width="72" height="72"></canvas><span class="nm">'+c.name+'</span><span class="rl">'+c.role+'</span><i>✓</i></button>').join('');
  ros.querySelectorAll('.card').forEach(k=>{
    k.onmouseenter=()=>{hov=k.dataset.id};k.onmouseleave=()=>{if(hov===k.dataset.id)hov=null};
    k.onfocus=()=>{hov=k.dataset.id};k.onblur=()=>{if(hov===k.dataset.id)hov=null};
    k.onclick=()=>{UI.p1=k.dataset.id;hov=null;paintCreate();snd(440,.05)}});
  document.querySelector('.slot.s1').querySelectorAll('[data-sk]').forEach(b=>{b.onclick=e=>{e.stopPropagation();
    UI.s1=UI.s1==='pixel'?'toon':'pixel';try{localStorage.setItem('vs_hollow_s1',UI.s1)}catch(e2){}
    paintCreate();paintCards();
    busyOn();loadFighter(UI.p1,UI.s1,()=>busyOff())}});
  $('descend').onclick=()=>{snd(440,.08);descend()};
  $('mCreate').onclick=()=>{snd(440,.06);createReturn='title';paintCreate();showOv('create')};
  $('mHow').onclick=()=>{snd(660,.05);howReturn='title';showOv('how')};
  $('mCred').onclick=()=>{snd(660,.05);showOv('credits')};
  $('mMute').onclick=()=>{toggleMute();snd(660,.05)};
  $('mPractice').onclick=()=>{location.href='combat.html?arena=day'};
  $('howBack').onclick=()=>{snd(440,.05);if(howReturn==='run')hideOv();else goOv(howReturn||'title')};
  $('credBack').onclick=()=>{snd(440,.05);goOv('title')};
  $('pResume').onclick=()=>{snd(440,.05);hideOv()};
  $('pQuit').onclick=()=>{snd(330,.1);HS.reset();goOv('title')};
  $('pMute').onclick=()=>{toggleMute();snd(660,.05)};
  $('deadGo').onclick=()=>{HS.reset();hideOv();snd(440,.08)};
  $('deadTitle').onclick=()=>{HS.reset();goOv('title')};
  $('endGo').onclick=()=>{HS.reset();hideOv();snd(440,.08)};
  $('endTitle').onclick=()=>{HS.reset();goOv('title')};
  $('openCreate').onclick=e=>{if(!UI.open){createReturn='run';paintCreate();showOv('create')}e.currentTarget.blur()};
  $('openHow').onclick=e=>{if(!UI.open){howReturn='run';showOv('how')}e.currentTarget.blur()};
  $('openPause').onclick=e=>{if(!UI.open)showOv('pause');e.currentTarget.blur()};
  const cs=document.querySelector('.slot.s1 canvas').getContext('2d');
  (function loop(t){requestAnimationFrame(loop);if(UI.open!=='create')return;
    const f=Math.floor(t/1000*6)%6;sprite(cs,hov||UI.p1,1,f,256,UI.s1)})(0);
  try{const s=localStorage.getItem('vs_hollow_p1');if(s&&CHR[s])UI.p1=s;
    const sk=localStorage.getItem('vs_hollow_s1');if(sk==='pixel'||sk==='toon')UI.s1=sk}catch(e){}
  paintCreate();paintMute();}
/* input */
const ACT={j:'light',z:'light',k:'special',x:'special',' ':'jump',e:'dash',y:'dash'};
addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;const k=e.key.toLowerCase();
  if(UI.open){if(UI.open==='intro'){if(k===' '||k==='enter'){e.preventDefault();advanceIntro()}return}
    if(UI.open==='title'){if(k==='enter'){e.preventDefault();createReturn='title';paintCreate();showOv('create')}return}
    if(UI.open==='create'){if(k==='enter'){e.preventDefault();descend()}else if(k==='escape'){if(createReturn==='run')hideOv();else goOv('title')}return}
    if(UI.open==='dead'){if(k==='r'){HS.reset();hideOv()}else if(k==='escape'){HS.reset();goOv('title')}return}
    if(UI.open==='end'){if(k==='r'){HS.reset();hideOv()}else if(k==='escape'){HS.reset();goOv('title')}return}
    if(k==='escape'){if(UI.open==='pause')hideOv();else if(UI.open==='how'||UI.open==='credits')goOv('title');else if(UI.open)hideOv();return}
    return}
  if(k==='e'&&!e.repeat){e.preventDefault();HS.press('dash');return}
  if(ACT[k]){e.preventDefault();if(!e.repeat)HS.press(ACT[k]);return}
  if('wasd'.includes(k)&&k.length===1||k.startsWith('arrow')){e.preventDefault();keys.add(k);return}
  if(k==='l'||k==='h'){e.preventDefault();if(!e.repeat){keys.add('l');HS.press('guard')}return}
  if(e.repeat)return;
  if(k==='q')HS.rotate(-1);
  else if(k==='m')toggleMute();
  else if(k==='r'&&(HS.dead||HS.won)){HS.reset();hideOv()}});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys.delete(k);if(k==='h')keys.delete('l');if(k===' ')e.preventDefault()});
addEventListener('blur',()=>keys.clear());
$('camL').onclick=e=>{HS.rotate(-1);e.currentTarget.blur()};
$('camR').onclick=e=>{HS.rotate(1);e.currentTarget.blur()};
$('c').addEventListener('mousedown',e=>{if(UI.open)return;
  if(e.button===0){e.preventDefault();HS.press('light')}else if(e.button===2){e.preventDefault();HS.press('special')}});
$('stage').addEventListener('contextmenu',e=>e.preventDefault());
$('stage').addEventListener('click',e=>{if(UI.open)return});
const touchBar=$('touch');
function showTouch(){touchBar.classList.add('show');document.body.classList.add('gb');fit()}
if(matchMedia('(pointer:coarse)').matches)showTouch();
addEventListener('touchstart',showTouch,{once:true,passive:true});
const stick=$('stick'),knob=$('knob');let stickId=null;
function stickMove(e){const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  let dx=(e.clientX-cx)/(r.width/2),dy=(e.clientY-cy)/(r.height/2);const m=Math.hypot(dx,dy);
  if(m>1){dx/=m;dy/=m}touchMove.x=Math.abs(dx)<.15?0:dx;touchMove.y=Math.abs(dy)<.15?0:dy;
  knob.style.transform='translate('+(dx*36)+'px,'+(dy*36)+'px)'}
stick.addEventListener('pointerdown',e=>{stickId=e.pointerId;stick.setPointerCapture(e.pointerId);stickMove(e)});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)stickMove(e)});
const stickEnd=e=>{if(e.pointerId===stickId){stickId=null;touchMove.x=0;touchMove.y=0;knob.style.transform=''}};
stick.addEventListener('pointerup',stickEnd);stick.addEventListener('pointercancel',stickEnd);
document.querySelectorAll('#btns button[data-a]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{e.preventDefault();if(UI.open)return;HS.press(b.dataset.a);b.classList.add('dn')});
  const up=()=>b.classList.remove('dn');b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up)});
const bPause=$('bPause');
if(bPause)bPause.addEventListener('pointerdown',e=>{e.preventDefault();if(!UI.open)showOv('pause')});
/* touch guard is hold-to-guard like the L/H keys */
const bGuard=document.querySelector('#btns button[data-a="guard"]');
if(bGuard){bGuard.addEventListener('pointerdown',()=>keys.add('l'));
  const guardUp=()=>keys.delete('l');
  bGuard.addEventListener('pointerup',guardUp);bGuard.addEventListener('pointercancel',guardUp);bGuard.addEventListener('pointerleave',guardUp)}
addEventListener('resize',()=>fit());
/* camera keys: Q rotate left, C rotate right (E is use) */
let howReturn='title';
let createReturn='title';
addEventListener('keydown',e=>{const k=e.key.toLowerCase();
  if(k==='q'&&!UI.open)HS.rotate(-1);if(k==='c'&&!UI.open)HS.rotate(1)});

/* ---------- main loop ---------- */
let last=performance.now(),acc=0,ready=false;
function frame(now){requestAnimationFrame(frame);if(!ready)return;
  if(HS.dead&&HS.endT>1.2&&!UI.open){showOv('dead')}
  if(HS.won&&HS.endT>1.0&&!UI.open){showOv('end')}
  if(UI.open){last=now;HR.render(HS);return}
  const dt=Math.min(.1,(now-last)/1000);last=now;acc+=dt;
  let n=0;while(acc>=TICK&&n<8){HS.simTick();acc-=TICK;n++}if(n===8)acc=0;
  HR.render(HS);HR.hud(HS);}
function boot(){initUI();fit();HS.reset();
  const artKeys=['tile/cursed_ground'].concat(PROP_LIST.map(p=>'prop/'+p),['idle','run','attack','hit','death'].map(a=>'foe/sw_'+a));
  loadImgs(Object.keys(DATA.img).filter(k=>k==='shadow'||k.startsWith('arena/')||k.startsWith('vfx/')||artKeys.includes(k)),()=>{
    HR.bakeAvgs();
    loadImgs(Object.values(CHR).map(c=>c.id+'/idle'),()=>{
      loadFighter(UI.p1,UI.s1,()=>{$('load').remove();ready=true;showOv('title');paintCards()})})});
  requestAnimationFrame(frame);}
loadImgs(Object.keys(DATA.img).filter(k=>k==='shadow'),()=>{});
/* defer boot until DATA ready (injected by build) */
if(DATA&&DATA.M)boot();else addEventListener('load',()=>{if(DATA&&DATA.M)boot()});
window.__hollow={R:HS.R,get H(){return HS.H},reset:()=>HS.reset(),UI,cam:HS.cam,tick:()=>HS.tick};
})();