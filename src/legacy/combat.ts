// @ts-nocheck — Phase 1 lift-and-shift: extracted verbatim from combat.src.html.
// Proper typing happens in Phase 2 modularization; behavior must stay identical.
import { DATA } from '../assets/art';
import { TICK, clamp } from '../engine/math';
import { $, mk } from '../engine/dom';
import { snd, toggleMute, paintMute, resumeAudio } from '../engine/audio';
import { setCamMatrix as setCamMatrixBase, proj as projBase, depthOf as depthOfBase, rowOf as rowOfBase } from '../engine/projection';
import { CHR, setP1 as setP1Moves } from '../engine/moves';
import { REDUCED_MOTION as RM } from '../engine/env';
import { createDuel, ARENA_A } from '../sim/duel';
import { createDuelRenderer, setArena, getArenaId } from '../render/duel';
import { createSpriteLoader } from '../engine/sprites';
(()=>{
'use strict';
const M=DATA.M, IMG={};
/* N/A world size: single source sim/duel (ARENA_A) */
const CELL=96, AX=48, AY=74;

let PA='bram_holt', PB='cinder';

function setP1(id){PA=id;setP1Moves(id)}
setP1(PA);

/* ---------- canvases ---------- */
const cv=document.getElementById('c'), cg=cv.getContext('2d');
let VW=640,VH=360, S,sg, Lc,lg, Q2,q2g,Q4,q4g,Q8,q8g, B1,b1g, B2,b2g, baseZoom=1;
function setSize(w,h){
  VW=w;VH=h;cv.width=w;cv.height=h;
  S=mk(w,h);sg=S.getContext('2d');
  Lc=mk(w>>1,h>>1);lg=Lc.getContext('2d');
  Q2=mk(w>>1,h>>1);q2g=Q2.getContext('2d');
  Q4=mk(w>>2,h>>2);q4g=Q4.getContext('2d');
  Q8=mk(w>>3,h>>3);q8g=Q8.getContext('2d');
  B1=mk(w,h);b1g=B1.getContext('2d');
  B2=mk(w,h);b2g=B2.getContext('2d');
  baseZoom=Math.min(1.14,(w-26)/(2*ARENA_A));
}
function fit(){
  const st=document.getElementById('stage');
  const narrow=(innerWidth-32)<700;                     // layout switch follows the window, not the stage
  const w=narrow?480:640, h=narrow?430:360;
  if(w!==VW||h!==VH||!S)setSize(w,h);
  st.style.setProperty('--s',clamp((st.clientWidth||w)/(narrow?480:640),1,2.2).toFixed(3));   // HUD grows with the screen
}

/* ---------- options / input ---------- */
const opt={dof:true,light:true,shake:true,push:true,debug:false,speed:1,autocam:true,immersive:true,dguard:false,fx:true};
const DEBUG=new URLSearchParams(location.search).get('debug')==='1';   // dev tools (frame data, demo, reset, speed) only surface with ?debug=1
try{const sv=localStorage.getItem('vs_autocam');if(sv!==null)opt.autocam=sv==='1';else if(RM)opt.autocam=false}catch(e){if(RM)opt.autocam=false}
const SPEEDS=[1,.5,.25];
/* input state + duel sim: shared sim/duel (see factory) */
const DS=createDuel({IMG,opt,getPA:()=>PA,getView:()=>({baseZoom,vw:VW}),project:(x,y,z)=>proj(x,y,z),onResult:()=>showResult()});
const P=DS.P, E=DS.E, combo=DS.combo, cam=DS.cam, dir=DS.dir, bot=DS.bot, dbg=DS.dbg;
const parts=DS.parts, rings=DS.rings, nums=DS.nums, flashes=DS.flashes, embers=DS.embers;
const input=DS.input, keys=input.keys, buf=input.buf, touchMove=input.touchMove;

/* ---------- projection (shared engine/projection; Z stays local) ---------- */
function setCamMatrix(){cam.Z=baseZoom*cam.zoom;setCamMatrixBase(cam)}
function proj(x,y,z){return projBase(cam,VW,VH,x,y,z)}
const depthOf=(x,y)=>depthOfBase(cam,x,y);
const rowOf=face=>rowOfBase(cam,face);

/* ---------- skins: pixel (embedded) + toon (lazy-loaded 2x sheets) ----------
   Toon sheets live as files under /toons/ (gitignored public/ mirror) and
   load per fight; IMG keys are namespaced 'toon/<id>/[p16|p38/]<anim>'. */
const SKINS={pixel:{label:'Pixel'},toon:{label:'Toon'}};
const SKIN_ORDER=['pixel','toon'];
const TOON_URL='/toons';
let SKP1='pixel',SKP2='pixel';   // fight-time skins for P1/P2 (B cycles P1 live)
function setSkin(n,id){ if(SKINS[id]){UI['s'+n]=id;try{localStorage.setItem('vs_skin'+n,id)}catch(e){}} }
function cycleSkin(n,d){const o=SKIN_ORDER;setSkin(n,o[(o.indexOf(UI['s'+n])+d+o.length)%o.length])}
function cycleP1Skin(){cycleSkin(1,1);SKP1=UI.s1;
  if(SKP1==='toon'){const need=[];ANIM_P1.forEach(a=>['','p16/','p38/'].forEach(p=>need.push('toon/'+PA+'/'+p+a)));need.push('toon/shadow');
    loadToons(need,()=>{},true)}   // quiet mid-fight: no eviction, no overlay; pixel covers the gap via the drawEnt fallback
  paintSkin();}
function skinBusy(n,on){const el=document.querySelector('.slot.s1 .skinname');if(!el)return;
  if(on){if(!el.dataset.orig)el.dataset.orig=el.textContent;el.textContent=el.dataset.orig+'…'}
  else if(el.dataset.orig){el.textContent=el.dataset.orig;delete el.dataset.orig}}

/* ---------- main loop ---------- */
let last=performance.now(),acc=0,ready=false;
function frame(now){
  requestAnimationFrame(frame);
  if(!ready)return;
  if(UI.open){last=now;DR.render(DS);return}
  const dt=Math.min(.1,(now-last)/1000);last=now;
  acc+=dt*opt.speed;
  let n=0;
  while(acc>=TICK&&n<8){DS.simTick();acc-=TICK;n++}
  if(n===8)acc=0;
  DR.render(DS);DR.hud(DS);
}

/* ---------- input wiring ---------- */
const ACT={j:'light',z:'light',k:'special',x:'special',' ':'jump',shift:'dash',v:'dash'};
addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if(UI.open){
    if(UI.open==='title'){if(k==='enter'){e.preventDefault();enterRing()}return}
    if(UI.open==='sel'){if(k==='enter'){e.preventDefault();closePick()}else if(k==='escape'){cancelPick()}return}
    if(UI.open==='result'){if(k==='r')rematch();else if(k==='escape')openPick('result');return}
    if(k==='escape'){
      if(UI.open==='set'||UI.open==='pause')hideOv();
      else if(UI.open==='how'||UI.open==='credits')goOv('title');
      return}
    return}
  if(k==='l'||k==='h'){e.preventDefault();if(!e.repeat){DS.userTouched();keys.add('l');DS.press('guard')}return}
  if(ACT[k]){e.preventDefault();if(!e.repeat){DS.userTouched();DS.press(ACT[k])}return}
  if('wasd'.includes(k)&&k.length===1||k.startsWith('arrow')){e.preventDefault();DS.userTouched();keys.add(k);return}
  if(e.repeat)return;
  if(k==='q')DS.rotate(-1);else if(k==='e')DS.rotate(1);
  else if(k==='c')toggle('autocam');
  else if(k==='r'){if(DEBUG)DS.resetAll()}
  else if(k==='f'){if(DEBUG)toggle('debug')}
  else if(k==='t')cycleSpeed();
  else if(k==='b')cycleP1Skin();
  else if(k==='m')toggleMute();
});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys.delete(k);if(k==='h')keys.delete('l');if(k===' ')e.preventDefault()});
addEventListener('blur',()=>keys.clear());
$('camL').onclick=e=>{DS.rotate(-1);e.currentTarget.blur()};
$('camR').onclick=e=>{DS.rotate(1);e.currentTarget.blur()};
/* mouse controls: left-click light, right-click special (same buffered actions as J/K) */
$('c').addEventListener('mousedown',e=>{
  if(UI.open)return;
  if(e.button===0){e.preventDefault();DS.userTouched();DS.press('light')}
  else if(e.button===2){e.preventDefault();DS.userTouched();DS.press('special')}
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
});
$('stage').addEventListener('contextmenu',e=>e.preventDefault());
function cycleSpeed(){const i=(SPEEDS.indexOf(opt.speed)+1)%SPEEDS.length;opt.speed=SPEEDS[i];document.querySelector('[data-o=speed]').textContent='Speed '+(opt.speed===1?'1×':opt.speed+'×')}
function toggle(name){
  opt[name]=!opt[name];
  if(name==='autocam'){dir.pause=dir.grace=0;try{localStorage.setItem('vs_autocam',opt.autocam?'1':'0')}catch(e){}}
  document.querySelector(`[data-o=${name}]`).setAttribute('aria-pressed',String(opt[name]));
}
document.querySelectorAll('#opts [data-o]').forEach(b=>b.addEventListener('click',()=>{
  const o=b.dataset.o;
  if(o==='demo')DS.setBot(!bot.on);
  else if(o==='reset')DS.resetAll();
  else if(o==='speed')cycleSpeed();
  else toggle(o);
  b.blur();
}));
/* touch controls */
const touchBar=$('touch');
function showTouch(){touchBar.classList.add('show');document.body.classList.add('gb');fit()}
if(matchMedia('(pointer:coarse)').matches)showTouch();
addEventListener('touchstart',showTouch,{once:true,passive:true});
const stick=$('stick'),knob=$('knob');let stickId=null;
function stickMove(e){
  const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  let dx=(e.clientX-cx)/(r.width/2),dy=(e.clientY-cy)/(r.height/2);const m=Math.hypot(dx,dy);
  if(m>1){dx/=m;dy/=m}
  touchMove.x=Math.abs(dx)<.15?0:dx;touchMove.y=Math.abs(dy)<.15?0:dy;
  knob.style.transform=`translate(${dx*36}px,${dy*36}px)`;
}
stick.addEventListener('pointerdown',e=>{stickId=e.pointerId;stick.setPointerCapture(e.pointerId);DS.userTouched();stickMove(e)});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)stickMove(e)});
const stickEnd=e=>{if(e.pointerId===stickId){stickId=null;touchMove.x=0;touchMove.y=0;knob.style.transform=''}};
stick.addEventListener('pointerup',stickEnd);stick.addEventListener('pointercancel',stickEnd);
document.querySelectorAll('#btns button[data-a]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{e.preventDefault();if(UI.open)return;DS.userTouched();DS.press(b.dataset.a);b.classList.add('dn')});
  const up=()=>b.classList.remove('dn');b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up);
});
const bPause=$('bPause');
if(bPause){bPause.addEventListener('pointerdown',e=>{e.preventDefault();if(!UI.open)showOv('pause')})}
/* touch guard is hold-to-guard like the L/H keys: track 'l' in the keys set */
const bGuard=$('bGuard');
if(bGuard){
  bGuard.addEventListener('pointerdown',()=>keys.add('l'));
  const guardUp=()=>keys.delete('l');
  bGuard.addEventListener('pointerup',guardUp);bGuard.addEventListener('pointercancel',guardUp);bGuard.addEventListener('pointerleave',guardUp);
}
/* context label on the special button */
setInterval(()=>{const ab=document.querySelector('[data-o=autocam]');if(ab)ab.textContent=opt.autocam&&dir.pause>0?'Auto paused '+Math.ceil(dir.pause/60)+'s':'Auto camera (C)'},150);
setInterval(()=>{const air=P.state==='air'||P.state==='airatk';$('bSpec').lastChild.textContent=air?'Plunge':'Launch'},150);
addEventListener('resize',()=>{fit()});

/* ---------- game shell: story lines, SFX, flow ---------- */
const QUOTES={ren_calder:['The weakest licensed body in the city.','The Ledger writes to him. It bargains.'],
sera_quill:['Polite in cities. Absolute inside a rift.','The air holds still for no one else.'],
kade_morr:['He works the edges of other parties.','Red Vein collects.'],
bram_holt:['He walks in first because someone has to.','The Bastion holds.'],
nyx_lumen:['She sees the true layout of the Floor.','The lantern keeps them honest.'],
orin_vale:['A spear longer than he is honest.','The corridor is closed.'],
mairen_solas:['She keeps the branded from becoming Ash.','Mend refuses the wipe.'],
irix_venn:['A national-level closer.','The Chair is adjourned.'],
juno_rake:['She burns Hollows down to a usable path.','Emberwake takes its cut.'],
cinder:['A fallen Ashwalker, pressed into service.','The Host is filed again.'],
the_carapace:['A Hollow that learned to stand.','The floor reclaims its own.'],
floor_voice:['It sets the test. It is not allied.','The test is met. The Hollow opens.']};
addEventListener('pointerdown',()=>resumeAudio());

function goOv(id){hideOv();showOv(id)}
function openPick(returnTo){pickReturn=returnTo||'title';paintSlot(1);paintSkin();goOv('sel')}
function closePick(){const b=$('fight');b.disabled=true;snd(440,.08);applyPick(()=>{b.disabled=false;hideOv()})}
function cancelPick(){if(pickReturn==='run')hideOv();else goOv(pickReturn||'title')}
function enterRing(){snd(440,.08);applyPick(()=>{hideOv()})}
function showResult(){const A=CHR[PA],Q=QUOTES[PA]||['',''];
  $('resTitle').textContent=`${A.name} takes the Hollow.`;
  $('resLine').textContent=Q[1]||'';
  const secs=Math.max(.1,(DS.tick-DS.fightStart)/60).toFixed(1);
  $('resStats').innerHTML=`<div><b>${DS.fsHits}</b>hits</div><div><b>${DS.fsDmg}</b>damage</div><div><b>${secs}s</b>bout</div>`;
  goOv('result');snd(180,.25,'sawtooth');setTimeout(()=>snd(520,.2,'triangle'),180)}
function rematch(){hideOv();DS.resetAll();snd(440,.08)}

/* ---------- boot ---------- */
/* sheets load on demand: portraits first, then only the two chosen fighters at all three camera pitches */
const ANIM_P1=['idle','walk','attack1','attack2','attack3','launcher','air1','plunge','jump','dash','guard','victory'], ANIM_P2=['idle','hit','hit_heavy','hit_back','block_hit','guard','launch','tumble','knockdown','getup','death'];
const BASEIDLE=/^[a-z_]+\/idle$/;
/* sprite loading: shared engine/sprites */
const SL=createSpriteLoader(IMG,DATA,{toonBase:TOON_URL,busyOn:()=>busyOn(),busyOff:()=>busyOff(),onImgError:(k)=>{$('load').textContent='Could not load '+k}});
function loadImgs(keys,done){return SL.loadImgs(keys,done)}
function busyOn(){$('busy').classList.add('on')}
function busyOff(){$('busy').classList.remove('on')}
function loadToons(keys,done,quiet){return SL.loadToons(keys,done,quiet)}
function loadFighters(p1,s1,p2,s2,done,quiet){
  const needPx=new Set(),needTx=[];
  [[p1,s1,ANIM_P1],[p2,s2,ANIM_P2]].forEach(([id,sk,an])=>an.forEach(a=>['','p16/','p38/'].forEach(p=>{
    if(sk==='toon')needTx.push('toon/'+id+'/'+p+a);else needPx.add(`${id}/${p}${a}`)})));
  Object.keys(IMG).forEach(k=>{if(k!=='shadow'&&!k.startsWith('arena/')&&!k.startsWith('vfx/')&&!k.startsWith('toon/')&&!BASEIDLE.test(k)&&!needPx.has(k))delete IMG[k]});
  Object.keys(IMG).forEach(k=>{if(k.startsWith('toon/')&&!needTx.includes(k)&&!/^toon\/[a-z_]+\/idle$/.test(k)&&k!=='toon/shadow')delete IMG[k]});
  if(!quiet)busyOn();
  loadImgs([...needPx],()=>{
    if(s1==='toon'||s2==='toon'){Object.values(CHR).forEach(c=>needTx.push('toon/'+c.id+'/idle'));needTx.push('toon/shadow')}
    loadToons(needTx,()=>{if(!quiet)busyOff();paintCards();done()},quiet)});
}
loadImgs(Object.keys(DATA.img).filter(k=>k==='shadow'||k.startsWith('arena/')||k.startsWith('vfx/')||BASEIDLE.test(k)),boot);
const UI={open:null,slot:1,p1:'bram_holt',p2:'cinder',arena:'day',s1:'pixel',s2:'pixel'}, ROLE={Breaker:'#d9894f',Shade:'#9b8bdc',Lance:'#6fbfa8',Beacon:'#dcc66e',Weaver:'#7fb2ea',Warden:'#a9c07a'};
/* duel renderer: UI/skins/canvases all exist from here on */
const DR=createDuelRenderer({IMG,UI,opt,getPA:()=>PA,getPB:()=>PB,getSKP:()=>[SKP1,SKP2],
  gfx:()=>({sg,cg,S,Lc,lg,Q2,q2g,Q4,q4g,Q8,q8g,B1,b1g,B2,b2g,VW,VH,baseZoom})});
let pickReturn='title';
function paintArena(){document.querySelectorAll('.acard[data-arena]').forEach(k=>k.classList.toggle('on',k.dataset.arena===UI.arena))}
function paintSkin(){document.querySelectorAll('.slot.s1 .skinname').forEach(lab=>{lab.textContent=SKINS[UI.s1].label})}
function paintCur(){}
const OVFOCUS={title:'mFight',sel:'fight',how:'howBack',credits:'credBack',result:'resGo',pause:'pResume',set:'setX'};
function showOv(id){if(UI.open)$(UI.open).classList.remove('on');UI.open=id;keys.clear();$(id).classList.add('on');document.body.style.overflow='hidden';
  const f=OVFOCUS[id]&&$(OVFOCUS[id]);if(f)try{f.focus({preventScroll:true})}catch(e){}}
function hideOv(){if(!UI.open)return;$(UI.open).classList.remove('on');UI.open=null;document.body.style.overflow='';last=performance.now()}
function paintSlot(){const c=CHR[UI.p1],el=document.querySelector('.slot.s1');if(!el||!c)return;
  el.querySelector('.sn').textContent=c.name;el.querySelector('.st').textContent=`${c.title||''} · ${c.role}, ${c.weapon}`.replace(/^ · /,'');
  document.querySelectorAll('.card').forEach(k=>{k.classList.toggle('p1',k.dataset.id===UI.p1);k.classList.remove('p2')})}
function sprite(g,id,row,f,size,skin){const sk=skin==='toon'?'toon/':'';const im=IMG[sk+id+'/idle']||IMG[id+'/idle'];if(!im)return;const C=im.width/6,k=C/96;g.imageSmoothingEnabled=C>=190;g.clearRect(0,0,size,size);
  g.drawImage(im,f*C+12*k,row*C+6*k,72*k,72*k,0,0,size,size)}
function paintCards(){const sk=UI['s'+UI.slot];document.querySelectorAll('#roster .card').forEach(k=>{sprite(k.querySelector('canvas').getContext('2d'),k.dataset.id,2,0,72,sk)})}
function applyPick(done){loadFighters(UI.p1,UI.s1,UI.p2,UI.s2,()=>{setP1(UI.p1);PB='cinder';setArena('day');SKP1=UI.s1;SKP2=UI.s2;$('hpl').textContent=CHR[PB].name;DS.resetAll();if(done)done()})}
function initUI(){
  const ros=$('roster');
  ros.innerHTML=Object.values(CHR).map(c=>`<button class="card" data-id="${c.id}" style="--rc:${ROLE[c.role]||'#999'}" aria-label="${c.name}, ${c.role}, ${c.weapon}"><canvas width="72" height="72"></canvas><span class="nm">${c.name}</span><span class="rl">${c.role}</span><i class="b1">1</i><i class="b2">2</i></button>`).join('');
  paintCards();
  ros.querySelectorAll('.card').forEach(k=>{
    k.onmouseenter=()=>{hov=k.dataset.id};k.onmouseleave=()=>{if(hov===k.dataset.id)hov=null};
    k.onfocus=()=>{hov=k.dataset.id};k.onblur=()=>{if(hov===k.dataset.id)hov=null};
    k.onclick=()=>{UI.p1=k.dataset.id;hov=null;paintSlot(1);snd(440,.05)}});
  $('rndBtn').onclick=()=>{const ids=Object.keys(CHR);UI.p1=ids[(Math.random()*ids.length)|0];hov=null;paintSlot(1)};
  $('fight').onclick=()=>closePick();$('openSel').onclick=()=>{openPick('run')};
  $('mFight').onclick=()=>{enterRing()};
  $('mPick').onclick=()=>{snd(440,.06);openPick('title')};
  $('mHow').onclick=()=>{snd(660,.05);goOv('how')};
  $('mCred').onclick=()=>{snd(660,.05);goOv('credits')};
  $('mMute').onclick=()=>{toggleMute();snd(660,.05)};
  $('howBack').onclick=()=>{snd(440,.05);goOv('title')};
  $('credBack').onclick=()=>{snd(440,.05);goOv('title')};
  $('pResume').onclick=()=>{snd(440,.05);hideOv()};
  $('pQuit').onclick=()=>{snd(330,.1);DS.resetAll();goOv('title')};
  $('pMute').onclick=()=>{toggleMute();snd(660,.05)};
  $('resGo').onclick=()=>rematch();
  $('resSel').onclick=()=>{snd(440,.05);openPick('result')};
  $('openPause').onclick=e=>{if(!UI.open)showOv('pause');e.currentTarget.blur()};
  paintMute();
  $('openSet').onclick=()=>showOv('set');$('setX').onclick=hideOv;
  const cs0=document.querySelector('.slot.s1 canvas').getContext('2d');
  let hov=null;
  (function loop(t){requestAnimationFrame(loop);if(UI.open!=='sel')return;const f=Math.floor(t/1000*6)%6;sprite(cs0,hov||UI.p1,1,f,256,UI.s1)})(0);
  const q=new URLSearchParams(location.search);
  if(CHR[q.get('p1')])UI.p1=q.get('p1');
  document.querySelectorAll('.slot.s1 [data-sk]').forEach(b=>{b.onclick=e=>{e.stopPropagation();cycleSkin(1,+b.dataset.sk);paintSkin();paintSlot(1);skinBusy(1,true);loadFighters(UI.p1,UI.s1,UI.p2,UI.s2,()=>{skinBusy(1,false)},true)}});
  paintSkin();
  if(SKINS[q.get('s1')])UI.s1=q.get('s1');
  if(SKINS[q.get('skin')])UI.s1=q.get('skin');
  try{const a=localStorage.getItem('vs_skin1');
    if(!q.get('s1')&&!q.get('skin')&&SKINS[a])UI.s1=a;
    const legacy=localStorage.getItem('vs_skin');
    if(!q.get('s1')&&!q.get('skin')&&!a&&SKINS[legacy])UI.s1=legacy}catch(e){}
  paintSlot(1);paintArena();paintSkin();
  if(q.get('demo')==='1'){applyPick()}
  else{showOv('title')}}
function boot(){initUI();
  if(!DEBUG){const dp=document.querySelector('#devplay');if(dp)dp.style.display='none';const db=document.querySelector('[data-o=debug]');if(db)db.style.display='none'}
  fit();DS.resetAll();
  document.querySelector('[data-o=autocam]').setAttribute('aria-pressed',String(opt.autocam));
  $('load').remove();ready=true;
  const q=new URLSearchParams(location.search);
  if(q.get('demo')==='1')DS.setBot(true);
  if(q.get('debug')==='1')toggle('debug');
  if(q.get('auto')!==null){opt.autocam=q.get('auto')!=='0';document.querySelector('[data-o=autocam]').setAttribute('aria-pressed',String(opt.autocam))}
  setArena('day');
  SKP1=UI.s1;SKP2=UI.s2;
}
window.__vs={P,E,combo,cam,dir,bot,opt,press:(a)=>DS.press(a),resetAll:()=>DS.resetAll(),setBot:(on)=>DS.setBot(on),rotate:(d)=>DS.rotate(d),setArena,setSkin,cycleSkin,cycleP1Skin,simTick:()=>DS.simTick(),render:(s)=>DR.render(s||DS),hud:(s)=>DR.hud(s||DS),get arena(){return getArenaId()},get skins(){return {p1:UI.s1,p2:UI.s2,fight:[SKP1,SKP2]}},get tick(){return DS.tick},get hitstop(){return DS.hitstop},parts,rings,keys};
requestAnimationFrame(frame);
})();