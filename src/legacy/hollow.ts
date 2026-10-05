// @ts-nocheck — Phase 1 lift-and-shift: extracted verbatim from hollow.src.html.
// Proper typing happens in Phase 2 modularization; behavior must stay identical.
import { DATA } from '../assets/art';
import { TAU, TICK, rad, deg, wrap, snap8, angDiff, clamp, lerp, rnd, hash, hash as h2 } from '../engine/math';
import { $, mk, poly } from '../engine/dom';
import { ac, snd, toggleMute, paintMute, resumeAudio } from '../engine/audio';
import { createFx, VFX, EL } from '../engine/fx';
import { CHR, META, MOVE, STYLE, setP1, animFps, CHAIN_NEXT } from '../engine/moves';
(()=>{
'use strict';
/* ================= Hollow I: Cinder Hall — iso rebuild of the prototype ================
   World design mirrors `Veilspire_ Hollow I, Cinder Hall.html`: 38x36 tiles, carved rooms,
   5 zones, 12 braziers, 6 named Hosts + Pell boss, rest seal, 2 chests, intro LINES.
   Rendering/input/sprite pipeline mirrors combat.src.html (proj/cam/IMG/loaders). */
const M0=DATA.M, IMG={};
const TILE=32, MW=38, MH=36;
const t2w=(tx,ty)=>[(tx-MW/2)*TILE,(ty-MH/2)*TILE];
const w2t=(x,y)=>[x/TILE+MW/2,y/TILE+MH/2];
/* CHR, META, MOVE, animFps: shared engine/moves */

/* ---------- Hollow data (from prototype) ---------- */
const LINES=["The Spire does not ask who you were.","Ren Calder. Porter. The weakest licensed body in the city.","He carried Bram Holt's pack into a rift that ate the whole party.","He walked out with a cracked seal, and a Ledger that would not close.","Others read their Ledger as a rank. Ren's writes to him. It bargains.","Floor One. The fallen are pressed into Hosts, and they wait below.","Hollow I. Cinder Hall. Go down."];
const NAMES=["Tam Orrel","Edda Voss","Wick","Marra Dunn","Corrin","Sul Hask"];
const ZONES=[[8,10,13,13,'The Bone Alcove'],[14,14,20,18,'The Quiet Seal'],[26,11,34,20,'Depth II · The Pressing Floor'],[24,25,36,34,'Depth III · The Last Carrier'],[1,1,21,10,'Depth I · The Ash Hall']];
const BRZ_T=[[2.7,2.7],[13.7,2.7],[19.3,2.7],[8.7,10.7],[14.7,14.7],[19.3,17.3],[26.7,11.7],[33.3,19.3],[24.7,25.7],[35.3,25.7],[24.7,33.3],[35.3,33.3]];
const HOST_T=[[15,3],[18,7],[10,11],[28,13],[32,13],[30,18]];
const REST_T=[16.5,15.5], CHEST_A_T=[10.5,11.5], CHEST_B_T=[30.5,32];
let M=[];
function buildMap(){M=[];for(let y=0;y<MH;y++)M.push(new Array(MW).fill(1));
  const cv=(x,y,w,h)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)M[j][i]=0};
  cv(2,2,5,5);cv(7,4,6,2);cv(13,2,7,7);cv(16,9,2,5);cv(14,14,6,4);cv(20,15,6,2);cv(26,11,8,9);cv(29,20,2,5);cv(24,25,12,9);cv(13,11,3,1);cv(8,10,5,3);
  [[15,5],[18,5],[16,7],[29,15],[31,15],[27,28],[32,28],[27,31],[32,31]].forEach(p=>M[p[1]][p[0]]=1);M[24][29]=3;M[24][30]=3;
  ZMAP=[];for(let y=0;y<MH;y++){ZMAP.push([]);for(let x=0;x<MW;x++){ZMAP[y].push(ZONES.findIndex(z=>x>=z[0]&&x<z[2]&&y>=z[1]&&y<z[3]))}}}
const solidT=(x,y)=>x<0||y<0||x>=MW||y>=MH||M[Math.floor(y)][Math.floor(x)]===1;
function freeT(x,y,r){r=r||.22;return !(solidT(x-r,y-r)||solidT(x+r,y-r)||solidT(x-r,y+r)||solidT(x+r,y+r));}
function mvT(o,dx,dy){if(freeT(o.tx+dx,o.ty))o.tx+=dx;if(freeT(o.tx,o.ty+dy))o.ty+=dy;o.x=(o.tx-MW/2)*TILE;o.y=(o.ty-MH/2)*TILE;}

/* world-space mirrors (iso engine works in world px) */
const BRZ=BRZ_T.map(([a,b],i)=>{const [x,y]=t2w(a,b);return {x,y,ph:i*1.7,tx:a,ty:b};});
const REST=(()=>{const [x,y]=t2w(REST_T[0],REST_T[1]);return {x,y,tx:REST_T[0],ty:REST_T[1]};})();

/* ---------- tile art: cursed ground sheet + undead/city props + swordwarrior foes ----------
   Ground.png is a 40x56 grid of 16px tiles (verified by sampling: tan ash fills,
   pale sand accents, mauve-gray stone, dark red-brown cliff). Props follow the
   characters/ manifest split: flat = sheared ground decals, h = billboards. */
const GCOLS=40;
const POOL={ash:[402,405,527,899,975,1952,404,407,528,898,1951],mid:[404,407,528,898,1951,402,405],
  pale:[60,581,921,928,934,402],stone:[821,1021,1523,1816,1901,2021,1525,2045,1535,2048]};
const PROP_LIST=['chest1','campfire1','lamp1','column1','u_grave1','u_grave2','u_grave3','u_bones1','u_bones2','u_bones3',
  'u_skulls1','u_skulls2','u_skulls3','u_deadtree1','u_deadtree2','u_deadtree3','u_ruin1','u_ruin2','u_ruin3',
  'u_rock1','u_rock2','u_rock3','u_thorn1','u_thorn2','u_thorn3'];
const FLAT_DECAL={u_grave1:1,u_grave2:1,u_grave3:1,u_bones1:1,u_bones2:1,u_bones3:1,u_rock1:2,u_rock2:2,u_rock3:2,
  u_rock1:2,u_rock2:2,u_rock3:2,u_thorn1:4,u_thorn2:4,u_thorn3:4};
const BOARD_H={u_skulls1:.7,u_skulls2:.7,u_skulls3:.7,u_deadtree1:2.6,u_deadtree2:2.6,u_deadtree3:2.6,
  u_ruin1:1.8,u_ruin2:1.8,u_ruin3:1.8,chest1:.8,campfire1:.9,lamp1:1.6,column1:2.2};
const FOE_FR={idle:16,run:20,attack:24,hit:16,death:30};
const foeRow=face=>((Math.round(wrap(face+cam.ang-90)/45)%8)+8)%8;
const AVGC={};
let DECOR=[], LAMPS=[];
const h2=(x,y)=>{const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s)};
let ZMAP=[];

/* ---------- canvases ---------- */
/* $, mk, poly: shared engine/dom */
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
let RM=false;try{RM=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
const keys=new Set(), buf=[];
let tick=0, hitstop=0, shake=0;
const touchMove={x:0,y:0};
function press(a){buf.push({a,t:tick});if(buf.length>6)buf.shift()}
/* audio: shared engine/audio */
addEventListener('pointerdown',()=>resumeAudio());

/* ---------- state ---------- */
const UI={open:null,p1:'ren_calder',s1:'pixel'};
let PA='ren_calder';
const R={x:0,y:0,tx:4.5,ty:4.5,face:0,fx:1,fy:0,anim:'idle',t:0,seal:4,rev:false,ash:0,chain:0,ct:0,a:null,lock:0,veil:0,vcd:0,dwin:0,inv:0,fl:0,mv:0,guard:false,gt:0,ht:0,vd:[0,1]};
let H=[], CHESTS=[], texts=[], dead=false, won=false, zone='', zt=0, bossOn=false, bossDone=false, endT=0, t=0;
const cam={ang:0,target:0,zoom:1,fx:0,fy:0,shake:0,shx:0,shy:0,c:1,s:0,Z:1,py:.5};
const {parts,rings,nums,flashes,spark,dust,ring,flash,num,updateFx,vfxTint,stripFx}=createFx(opt,IMG);
function mkH(tx,ty,n,boss){const [x,y]=t2w(tx,ty);return {x,y,tx,ty,seal:boss?16:8,smax:boss?16:8,n:boss?'Pell, the last carrier':n,st:boss?'ap':'sl',tm:0,broken:0,fl:0,reg:0,cd:1,sp:(boss?1.5:1.25)*TILE,ty2:0,boss:!!boss,lives:boss?2:1,mt:1,face:180,anim:'idle',t:0}}
function reset(){buildMap();
  const [rx,ry]=t2w(4.5,4.5);
  Object.assign(R,{x:rx,y:ry,tx:4.5,ty:4.5,face:0,fx:1,fy:0,anim:'idle',t:0,seal:4,rev:false,ash:0,chain:0,ct:0,a:null,lock:0,veil:0,vcd:0,dwin:0,inv:0,fl:0,mv:0,guard:false,gt:0,ht:0});
  H=HOST_T.map((p,i)=>mkH(p[0]+.5,p[1]+.5,NAMES[i]));
  const [ax,ay]=t2w(CHEST_A_T[0],CHEST_A_T[1]),[bx,by]=t2w(CHEST_B_T[0],CHEST_B_T[1]);
  CHESTS=[{x:ax,y:ay,tx:CHEST_A_T[0],ty:CHEST_A_T[1],s:'a bone fragment',ash:3,o:0},{x:bx,y:by,tx:CHEST_B_T[0],ty:CHEST_B_T[1],s:'the Ember Shard',ash:5,o:0,hid:1,fin:1}];
  texts=[];dead=false;won=false;zone='';zt=0;bossOn=false;bossDone=false;endT=0;t=0;tick=0;hitstop=0;shake=0;
  parts.length=rings.length=nums.length=flashes.length=0;buf.length=0;
  cam.fx=R.x;cam.fy=R.y;cam.ang=cam.target=0;
  PA=UI.p1;setP1(PA);$('hpl').textContent=(CHR[PA]||{}).name||'Ren Calder';
  scatterDecor();}
const KEEP=[[4.5,4.5],[16.5,15.5],[10.5,11.5],[30.5,32],[30.5,29.5],[29.5,24.5],[15.5,3.5],[18.5,7.5],[28.5,13.5],[32.5,13.5],[30.5,18.5]];
function scatterDecor(){DECOR=[];LAMPS=[];
  const clear=(i,j)=>KEEP.every(([a,b])=>Math.hypot(i-a,j-b)>2.2);
  const wallNear=(i,j)=>{for(let a=-1;a<2;a++)for(let b=-1;b<2;b++){const y=j+b,x=i+a;
    if(y>=0&&x>=0&&y<MH&&x<MW&&M[y][x]!==0)return true}return false};
  const vein=(i,j)=>((i*7+j*3)%9===1)||((i*7+j*3)%9===4);
  for(let j=0;j<MH;j++)for(let i=0;i<MW;i++){if(M[j][i]!==0||!clear(i+.5,j+.5))continue;
    const r=h2(i,j),v=(r*3)|0;
    if(r<.055)DECOR.push({k:'flat',p:'u_grave'+(v+1),i:i+.5,j:j+.5});
    else if(r<.10)DECOR.push({k:'flat',p:'u_bones'+(v+1),i:i+.5,j:j+.5});
    else if(r<.115){const [x,y]=t2w(i+.5,j+.5);DECOR.push({k:'board',p:'u_skulls'+(v+1),x,y})}
    else if(r<.14)DECOR.push({k:'flat',p:'u_rock'+(v+1),i:i+.5,j:j+.5});
    else if(r<.155&&wallNear(i,j))DECOR.push({k:'flat',p:'u_thorn'+(v+1),i:i+.5,j:j+.5});}
  [[3,3],[6,6],[19,3],[27,12],[33,18],[25,26],[34,32],[14,15]].forEach(([a,b],n)=>{
    if(a>=0&&b>=0&&a<MW&&b<MH&&M[b][a]===0){const [x,y]=t2w(a+.5,b+.5);
      DECOR.push({k:'board',p:'u_deadtree'+(n%3+1),x,y})}});
  [[13,3],[33,12],[25,26]].forEach(([a,b],n)=>{
    if(a>=0&&b>=0&&a<MW&&b<MH&&M[b][a]===0){const [x,y]=t2w(a+.5,b+.5);
      DECOR.push({k:'board',p:'u_ruin'+(n%3+1),x,y})}});
  [[28.5,25.5],[31.5,25.5]].forEach(([a,b])=>{
    const [x,y]=t2w(a,b);DECOR.push({k:'board',p:'column1',x,y})});
  [[16.5,17.8],[29.5,23.5],[30.5,26.5]].forEach(([a,b])=>{
    const [x,y]=t2w(a,b);LAMPS.push({x,y,tx:a,ty:b,ph:(a+b)*1.3});});}
function say(x,y,s,d){texts.push({x,y,s,t:d||1.6,m:d||1.6});snd(110,.07)}
function nearHost(){let b=null,bd=3.5*TILE;H.forEach(h=>{if(h.st==='dying')return;const d=Math.hypot(h.x-R.x,h.y-R.y);if(d<bd){bd=d;b=h}});return b}

/* ---------- actions (fighter kit on shared engine/moves) ---------- */
function beginAttack(slot){
  const meta=META[slot];if(!meta||!meta.hit_frames)return false;
  const n=nearHost();if(n){const dx=n.x-R.x,dy=n.y-R.y,d=Math.hypot(dx,dy)||1;R.fx=dx/d;R.fy=dy/d;R.face=snap8(deg(Math.atan2(R.fy,R.fx)))}
  R.a={slot,move:meta,cur:MOVE[slot]||STYLE.slash,hitDone:new Set(),t:0,land:0};
  R.anim=slot;R.t=0;R.dwin=.3;return true;
}
function cut(){if(R.a||R.guard||R.veil>0||R.lock>0||dead||won)return false;
  if(!beginAttack('attack1'))return false;snd(300,.05);return true}
function wheel(){if(R.a||R.guard||R.veil>0||R.lock>0||R.ash<2||dead||won)return false;R.ash-=2;
  if(!beginAttack('launcher')){R.ash+=2;return false}snd(180,.2,'sawtooth');return true}
function veil(){if(R.vcd>0||R.a||R.guard||dead||won)return;R.veil=.28;R.vcd=.9;R.inv=.35;R.anim='dash';R.t=0;
  let dx=(keys.has('d')?1:0)-(keys.has('a')?1:0)+touchMove.x,dy=(keys.has('s')?1:0)-(keys.has('w')?1:0)+touchMove.y;
  const m=Math.hypot(dx,dy);
  if(m<.1){dx=R.fx;dy=R.fy}else{dx/=Math.max(1,m);dy/=Math.max(1,m)}
  const a=-rad(cam.ang),c=Math.cos(a),s=Math.sin(a);
  let vx=dx*c-dy*s,vy=dx*s+dy*c;const l=Math.hypot(vx,vy)||1;R.vd=[vx/l,vy/l];snd(520,.12,'triangle')}
function use(){if(dead||won)return;
  if(Math.hypot(R.x-REST.x,R.y-REST.y)<1.6*TILE){R.seal=4;R.rev=false;say(R.x,R.y,'THE LEDGER IS QUIET',2);return}
  for(const ch of CHESTS){if(!ch.o&&!ch.hid&&Math.hypot(R.x-ch.x,R.y-ch.y)<1.4*TILE){ch.o=1;R.ash=Math.min(5,R.ash+ch.ash);say(ch.x,ch.y,'CLAIMED: '+ch.s,2.5);
    if(ch.fin){won=true;endT=0;try{localStorage.setItem('vs_hollow_cleared','1')}catch(e){}}}}}
function sealDmg(h,d){if(h.st==='dying')return;if(h.st==='sl')h.st='ap';if(h.broken>0){killH(h);return}
  h.seal-=d;h.reg=0;h.fl=.12;if(h.seal<=0){h.seal=0;h.broken=2.5;h.st='broken';say(h.x,h.y,'SEAL BROKEN',1.4);
    stripFx('hitspark',h.x,h.y,30,{fps:30,scale:1,tint:EL[PA]||'#fff'});flash(h.x,h.y,30,90,[255,200,140],.7,.2)}}
function killH(h){if(h.boss&&--h.lives>0){h.seal=h.smax;h.broken=0;h.st='stag';h.tm=1.3;say(h.x,h.y,'THE PRESSING HOLDS',2.2);shake=10;return}
  h.st='dying';h.dt=0;h.anim='death';R.rev=false;R.ash=Math.min(5,R.ash+1);say(h.x,h.y,'FILED: '+h.n,2.4);shake=8;snd(70,.25,'sawtooth');
  stripFx('fire',h.x,h.y,8,{fps:20,scale:1.2});flash(h.x,h.y,20,120,[255,190,120],.9,.25);
  if(h.boss){bossDone=true;M[24][29]=0;M[24][30]=0;CHESTS[1].hid=0;say(CHESTS[1].x,CHESTS[1].y-16,'The way opens.',3)}}
function hurt(unblockable){if(R.inv>0||R.veil>0||dead||won)return;
  if(R.guard&&!unblockable){R.guard=false;R.inv=.35;say(R.x,R.y-20,'Blocked',.8);
    spark(R.x,R.y-20,26,6,150,'#bcd6ff',.4);stripFx('hitspark',R.x,R.y-20,30,{fps:30,scale:.45,tint:'#bcd6ff'});snd(660,.05);return}
  if(R.guard&&unblockable){R.guard=false;say(R.x,R.y-20,'Guard broken',1)}
  R.seal--;R.chain=0;R.inv=.7;R.fl=.15;R.ht=.25;shake=7;say(R.x,R.y,'CRACK',1);snd(140,.12,'sawtooth');
  if(R.seal<=0){if(!R.rev){R.rev=true;R.seal=1;say(R.x,R.y-24,'THE SEAL HOLDS',2)}else{dead=true;endT=0;R.anim='death';R.t=0}}}

/* ---------- FX (shared engine/fx) ---------- */
function slashAt(ax,ay,h,big){const sa=proj(ax,ay,26),sb=proj(h.x,h.y,26),sang=Math.atan2(sb[1]-sa[1],sb[0]-sa[0]);
  stripFx('slash',(ax+h.x)/2,(ay+h.y)/2,26,{fps:big?20:24,scale:big?1.2:.75,ang:sang,tint:EL[PA]||'#fff'})}
function shakeCam(a){cam.shake=Math.min(1,Math.max(cam.shake,a))}

/* ---------- sim ---------- */
function rawMove(){let x=((keys.has('d')||keys.has('arrowright'))?1:0)-((keys.has('a')||keys.has('arrowleft'))?1:0);
  let y=((keys.has('s')||keys.has('arrowdown'))?1:0)-((keys.has('w')||keys.has('arrowup'))?1:0);
  x+=touchMove.x;y+=touchMove.y;const m=Math.hypot(x,y);if(m>1){x/=m;y/=m}return {x,y,m:Math.min(1,m)}}
function worldMove(){const r=rawMove();const a=-rad(cam.ang),c=Math.cos(a),s=Math.sin(a);
  return {x:r.x*c-r.y*s,y:r.x*s+r.y*c,m:r.m}}
function tryDo(a){if(dead||won)return false;
  if(a==='light'){
    if(!R.a&&!R.guard){return cut()}
    if(R.a){const f=Math.min(5,Math.floor(R.a.t*animFps(R.a.slot)));
      if(f>=R.a.move.cancel_from){const nx=CHAIN_NEXT[R.a.slot]||'attack1';
        if(!beginAttack(nx))return false;snd(nx==='launcher'?180:300,.05);return true}}
    return false}
  if(a==='special'){if(!R.a&&!R.guard){return wheel()}return false}
  if(a==='jump'){veil();return true}
  if(a==='dash'){use();return true}
  if(a==='guard'){if(!R.a&&!R.guard&&!dead&&!won){R.guard=true;R.gt=0;R.anim='guard';R.t=0;return true}return false}
  return false}
function consumeBuffer(){for(let i=0;i<buf.length;i++){if(tick-buf[i].t>18){buf.splice(i--,1);continue}
  if(tryDo(buf[i].a)){buf.splice(i,1);return true}}return false}
function updatePlayer(dt){R.t+=dt;
  R.lock-=dt;R.vcd-=dt;R.dwin-=dt;R.inv-=dt;R.fl-=dt;R.ct-=dt;R.ht-=dt;
  if(R.ct<=0&&R.chain>0){R.chain=0;say(R.x,R.y-20,'CHAIN BROKEN',.9)}
  const w=worldMove(),want=w.m>.15;
  if(R.guard){R.gt+=dt;R.anim='guard';if(!keys.has('l')&&R.gt>.12)R.guard=false}
  else if(R.veil>0){R.veil-=dt;mvT(R,R.vd[0]*9*dt,R.vd[1]*9*dt)}
  else if(!R.a&&!dead&&!won&&(want)){let vx=w.x+w.y,vy=w.y-w.x;const l=Math.hypot(vx,vy)||1;vx/=l;vy/=l;
    mvT(R,vx*3.2*dt,vy*3.2*dt);R.fx=vx;R.fy=vy;R.face=snap8(deg(Math.atan2(vy,vx)));R.mv+=dt;R.anim='walk'}
  else if(!R.a){R.anim='idle'}
  if(R.ht>0&&!R.a&&!R.guard)R.anim='hit';
  // camera follow
  cam.fx+=(R.x-cam.fx)*Math.min(1,dt*5);cam.fy+=(R.y-cam.fy)*Math.min(1,dt*5);
  const [rtx,rty]=w2t(R.x,R.y);
  const z=ZONES.find(z=>rtx>=z[0]&&rtx<z[2]&&rty>=z[1]&&rty<z[3]);
  if(z&&z[4]!==zone){zone=z[4];zt=3.5}
  if(!bossOn&&rty>25.6){bossOn=true;M[24][29]=1;M[24][30]=1;const b=mkH(30.5,29.5,0,true);H.push(b);say(b.x,b.y-32,'THE WAY CLOSES',2.5)}
  const a=R.a;
  if(a){a.t+=dt;R.anim=a.slot;
    const f=Math.min(5,Math.floor(a.t*animFps(a.slot)));
    for(const hf of a.move.hit_frames){
      if(hf!==f||a.hitDone.has(f))continue;a.hitDone.add(f);
      if(a.slot==='launcher'){a.land=1;R.ct=1.3;
        H.slice().forEach(h=>{if(h.st==='dying')return;const dx=h.x-R.x,dy=h.y-R.y,d=Math.hypot(dx,dy)||.01;
          if(d<1.9*TILE){const push=.7*TILE;h.x+=dx/d*push;h.y+=dy/d*push;h.tx=h.x/TILE+MW/2;h.ty=h.y/TILE+MH/2;
            sealDmg(h,4/a.move.hit_frames.length);
            spark(h.x,h.y,26,10,200,'#fff3d8',.6)}});
        slashAt(R.x,R.y,{x:R.x+R.fx*40,y:R.y+R.fy*40},true);hitstop=Math.max(hitstop,4);shakeCam(.25)}
      else{const reach=a.cur.reach||1.5*TILE;
        H.slice().forEach(h=>{if(h.st==='dying')return;const dx=h.x-R.x,dy=h.y-R.y,d=Math.hypot(dx,dy)||.01;
          if(d<reach+8&&angDiff(deg(Math.atan2(dy,dx)),R.face)<=a.cur.arc){a.land=1;R.chain++;R.ct=1.3;R.ash=Math.min(5,R.ash+1);
            const push=.25*TILE;h.x+=dx/d*push;h.y+=dy/d*push;h.tx=h.x/TILE+MW/2;h.ty=h.y/TILE+MH/2;
            if(h.st==='wind'&&h.ty2===0){h.st='stag';h.tm=.4}sealDmg(h,1+R.chain*.5);say(h.x,h.y-16,R.chain>2?'CHAIN x'+R.chain:a.move.name,.7);
            spark((R.x+h.x)/2,(R.y+h.y)/2,26,8,190,'#ffe2b0',.6);slashAt(R.x,R.y,h,false);hitstop=Math.max(hitstop,3);shakeCam(.15)}})}}
    if(a.t>=6/animFps(a.slot)){if(!a.land)R.lock=.35;R.a=null}}
  if(dead||won)endT+=dt;
}
function updateHosts(dt){H.forEach(h=>{h.t+=dt;h.fl-=dt;h.tm-=dt;
  if(h.st==='dying'){h.anim='death';h.dt=(h.dt||0)+dt;return}
  const dx=R.x-h.x,dy=R.y-h.y,d=Math.hypot(dx,dy)||.01,k=h.boss?1.3:1;
  if(h.st==='sl'){h.anim='idle';if(d<4.5*TILE){h.st='ap';h.cd=.8}return}
  h.reg+=dt;if(h.st!=='broken'&&h.seal<h.smax&&h.reg>.6)h.seal=Math.min(h.smax,h.seal+(R.chain?.4:1.6)*dt);
  if(h.st==='ap'){h.anim='walk';h.cd-=dt;h.face=snap8(deg(Math.atan2(dy,dx)));
    if(d>1.1*TILE){h.x+=dx/d*h.sp*dt;h.y+=dy/d*h.sp*dt;h.tx=h.x/TILE+MW/2;h.ty=h.y/TILE+MH/2}
    if(h.cd<=0&&d<2.4*k*TILE){h.ty2=(d>1.2*TILE||Math.random()<.35)?1:0;if(h.boss)h.ty2=Math.random()<.5?1:0;
      h.st='wind';h.tm=h.ty2?(h.boss?.85:1):(h.boss?.5:.55);h.mt=h.tm;if(h.ty2)say(h.x,h.y-40,'UNBLOCKABLE',1)}}
  else if(h.st==='wind'&&h.tm<=0){h.anim='attack1';
    if(h.ty2===1){if(d<1.8*k*TILE)hurt(true)}
    else if(d<1.5*k*TILE){if(R.dwin>0&&R.a){h.st='stag';h.tm=.9;R.ct=1.3;R.chain++;sealDmg(h,3);say(R.x,R.y-24,'DEFLECT',1);snd(800,.1);shake=5;stripFx('hitspark',R.x,R.y-10,30,{fps:30,scale:.7,tint:'#bcd6ff'})}else hurt(false)}
    if(h.st==='wind'){h.st='rec';h.tm=.7}}
  else if(h.st==='wind'){h.anim='attack1'}
  else if((h.st==='rec'||h.st==='stag')&&h.tm<=0){h.st='ap';h.cd=(h.boss?.6:1)+Math.random()*.8;h.anim='idle'}
  else if(h.st==='broken'){h.anim='hit';h.broken-=dt;if(h.broken<=0){h.seal=h.smax;h.st='ap';h.cd=1.2}}
  else if(h.st==='stag'){h.anim='hit'}});
  H=H.filter(h=>h.st!=='dying'||h.dt<1.9);}
/* updateFx: shared engine/fx (hollow passes dt explicitly) */
function simTick(){tick++;t+=TICK;
  texts.forEach(x=>x.t-=TICK);texts=texts.filter(x=>x.t>0);zt-=TICK;
  updateCam();
  if(hitstop>0){hitstop--;return}
  if(!UI.open){consumeBuffer();updatePlayer(TICK);updateHosts(TICK);updateFx(TICK);
    if(dead&&endT>1.2&&UI.open==null){/* wait for key */}}
  else{updateFx(TICK*0.25)}
  cam.shake=Math.max(0,cam.shake-TICK*1.7);
  const m=cam.shake*cam.shake*9+shake*shake*.02;
  cam.shx=opt.shake&&m>.05?Math.round(m*.6*Math.sin(tick*1.1)):0;
  cam.shy=opt.shake&&m>.05?Math.round(m*.6*Math.sin(tick*1.3+2.1)):0;
  shake*=.85;
}
function updateCam(){const want=cam.target;
  let d=((want-cam.ang+540)%360)-180;cam.ang+=d*(1-Math.exp(-9*TICK));
  if(Math.abs(d)<.05)cam.ang=want;}

/* ---------- projection ---------- */
function setCamMatrix(){const a=rad(cam.ang);cam.c=Math.cos(a);cam.s=Math.sin(a);cam.Z=baseZoom*cam.zoom*DPRS;
  cam.frx=cam.fx*cam.c-cam.fy*cam.s;cam.fry=(cam.fx*cam.s+cam.fy*cam.c)*cam.py;}
function proj(x,y,z){const rx=x*cam.c-y*cam.s,ry=x*cam.s+y*cam.c;
  return [VW/2+cam.Z*(rx-cam.frx)+cam.shx,VH/2+VH*.035+cam.Z*(ry*cam.py-z-cam.fry)+cam.shy]}
const depthOf=(x,y)=>x*cam.s+y*cam.c;
const rowOf=face=>Math.round(wrap(face+cam.ang)/45)%8;

/* ---------- drawing ---------- */
/* poly, hash: shared engine (hash as h2 via import) */
function drawBackdrop(){const g=sg;const gr=g.createLinearGradient(0,0,0,VH);
  ['#030408','#0a0c14','#141821','#1e222e'].forEach((c,i)=>gr.addColorStop([0,.5,.8,1][i],c));
  g.fillStyle=gr;g.fillRect(0,0,VW,VH);
  const cx=VW*.5;g.fillStyle='#020306';g.beginPath();g.moveTo(cx-14,0);
  for(let y=0;y<=VH*.62;y+=VH*.062)g.lineTo(cx+(hash(y|0,7)-.5)*56,y);
  for(let y=VH*.62;y>=0;y-=VH*.062)g.lineTo(cx+(hash(y|0,13)-.5)*56+18,y);
  g.closePath();g.fill();g.strokeStyle='rgba(255,122,42,.55)';g.lineWidth=2;g.beginPath();
  for(let y=0;y<=VH*.62;y+=VH*.062){const x=cx+(hash(y|0,7)-.5)*56;y?g.lineTo(x,y):g.moveTo(x,y)}g.stroke();}
function tileWorld(i,j){const x0=(i-MW/2)*TILE,x1=(i+1-MW/2)*TILE,y0=(j-MH/2)*TILE,y1=(j+1-MH/2)*TILE;
  return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]}
function tilePts(i,j,k){const pts=tileWorld(i,j).map(([x,y])=>proj(x,y,0));
  if(!k||k===1)return pts;const cx=(pts[0][0]+pts[2][0])/2,cy=(pts[0][1]+pts[2][1])/2;
  return pts.map(p=>[cx+(p[0]-cx)*k,cy+(p[1]-cy)*k])}
/* map a source rect onto a screen parallelogram (L=left,T=top,B=bottom by position) */
function quadBlit(img,sx,sy,sw,sh,p0,p1,p2,p3){
  const srt=[p0,p1,p2,p3].slice().sort((a,b)=>a[1]-b[1]);
  const T=srt[0],B=srt[3],mid=[srt[1],srt[2]].sort((a,b)=>a[0]-b[0]),L=mid[0];
  const g=sg;g.save();g.imageSmoothingEnabled=true;
  g.setTransform((T[0]-L[0])/sw,(T[1]-L[1])/sw,(B[0]-L[0])/sh,(B[1]-L[1])/sh,L[0],L[1]);
  g.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
  g.restore();g.imageSmoothingEnabled=false;}
function poolFor(i,j){const z=ZMAP[j]&&ZMAP[j][i];
  if(z===2||z===3)return POOL.stone;if(z===1)return POOL.pale;return POOL.ash}
function bakeAvgs(){const gi=IMG['tile/cursed_ground'];if(!gi||!gi.naturalWidth)return;
  const c=mk(16,16),g=c.getContext('2d');
  Object.values(POOL).flat().forEach(idx=>{if(AVGC[idx])return;
    try{g.clearRect(0,0,16,16);g.drawImage(gi,(idx%GCOLS)*16,((idx/GCOLS)|0)*16,16,16,0,0,16,16);
      const d=g.getImageData(0,0,16,16).data;let r=0,gg=0,b=0;
      for(let k=0;k<d.length;k+=4){r+=d[k];gg+=d[k+1];b+=d[k+2]}
      const n=d.length/4;AVGC[idx]=`rgb(${r/n|0},${gg/n|0},${b/n|0})`}catch(e){}});}
function cullRange(){const r=Math.ceil(Math.max(VW,VH)/cam.Z/TILE/2)+3;return r}
function drawFloor(){const g=sg;const [ccx,ccy]=w2t(cam.fx,cam.fy);
  const gi=IMG['tile/cursed_ground'],hasT=gi&&gi.complete&&gi.naturalWidth;
  const cr=cullRange();
  const i0=clamp(Math.floor(ccx)-cr,0,MW-1),i1=clamp(Math.floor(ccx)+cr,0,MW-1);
  const j0=clamp(Math.floor(ccy)-cr,0,MH-1),j1=clamp(Math.floor(ccy)+cr,0,MH-1);
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){if(M[j][i]!==0)continue;
    const pts=tilePts(i,j);
    if((pts[0][0]<-90&&pts[1][0]<-90&&pts[2][0]<-90&&pts[3][0]<-90)||
       (pts[0][0]>VW+90&&pts[1][0]>VW+90&&pts[2][0]>VW+90&&pts[3][0]>VW+90)||
       (pts[0][1]<-90&&pts[1][1]<-90&&pts[2][1]<-90&&pts[3][1]<-90)||
       (pts[0][1]>VH+90&&pts[1][1]>VH+90&&pts[2][1]>VH+90&&pts[3][1]>VH+90))continue;
    const pool=poolFor(i,j),idx=pool[h2(i,j)*pool.length|0];
    poly(g,pts);g.fillStyle=AVGC[idx]||'#2d2c31';g.fill();
    if(hasT)quadBlit(gi,(idx%GCOLS)*16,((idx/GCOLS)|0)*16,16,16,pts[0],pts[1],pts[2],pts[3]);
    const v=(i*7+j*3)%9;if(v===1||v===4){const f=.5+.5*Math.sin(t*2+i*3+j);
      g.strokeStyle='rgba(217,119,43,'+(.3+.3*f)+')';g.lineWidth=1;g.beginPath();
      const a=proj((i+.1-MW/2)*TILE,(j+.2-MH/2)*TILE,0),b=proj((i+.6-MW/2)*TILE,(j+.5-MH/2)*TILE,0),c=proj((i+.4-MW/2)*TILE,(j+.9-MH/2)*TILE,0);
      g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.lineTo(c[0],c[1]);g.stroke()}}
  const rp=[];for(let k=0;k<=28;k++){const a=k/28*TAU;rp.push(proj(REST.x+Math.cos(a)*1.5*TILE,REST.y+Math.sin(a)*1.5*TILE,0))}
  poly(g,rp);g.strokeStyle='#d8d0bc';g.lineWidth=Math.max(1,1.5*cam.Z);g.stroke();}
function drawWall(i,j,fade){const g=sg,Hh=30;
  const c=tileWorld(i,j),b=c.map(([x,y])=>proj(x,y,0)),tp=c.map(([x,y])=>proj(x,y,Hh));
  if(fade)g.globalAlpha=.28;
  g.fillStyle='#3d201c';poly(g,[b[3],b[2],tp[2],tp[3]]);g.fill();
  g.fillStyle='#54302a';poly(g,[b[2],b[1],tp[1],tp[2]]);g.fill();
  g.fillStyle='#33201c';poly(g,[b[1],b[0],tp[0],tp[1]]);g.fill();
  g.fillStyle='#47271f';poly(g,[b[0],b[3],tp[3],tp[0]]);g.fill();
  const idx=POOL.stone[h2(i*3+1,j*3+2)*POOL.stone.length|0];
  poly(g,tp);g.fillStyle=AVGC[idx]||'#4a4442';g.fill();
  const gi=IMG['tile/cursed_ground'];
  if(gi&&gi.complete&&gi.naturalWidth)quadBlit(gi,(idx%GCOLS)*16,((idx/GCOLS)|0)*16,16,16,tp[0],tp[1],tp[2],tp[3]);
  g.strokeStyle='#8a6a5e';g.lineWidth=1;poly(g,tp);g.stroke();g.globalAlpha=1;}
function drawGate(i,j){const g=sg;const c=tileWorld(i,j),b=c.map(([x,y])=>proj(x,y,0)),tp=c.map(([x,y])=>proj(x,y,40));
  const [wx,wy]=t2w(i+.5,j+.5);
  const fa=(depthOf(wx,wy)>depthOf(R.x,R.y)+8&&Math.hypot(wx-R.x,wy-R.y)<2.6*TILE)?.3:1;
  const fl=.12+.08*Math.sin(t*3);g.globalAlpha=fa;
  g.fillStyle='rgba(216,208,188,.9)';poly(g,[b[3],b[2],tp[2],tp[3]]);g.fill();
  g.fillStyle='rgba(216,208,188,'+fl+')';poly(g,tp);g.fill();g.globalAlpha=1;}
function flick(b){return .82+.18*Math.sin(tick*.21+b.ph)*Math.sin(tick*.093+b.ph*2.3)+.06*Math.sin(tick*.57+b.ph)}
function billboard(key,wx,wy,hTiles){const img=IMG['prop/'+key];if(!img||!img.complete||!img.naturalWidth)return false;
  const [x,y]=proj(wx,wy,0),h=hTiles*TILE*cam.Z,w=h*img.width/img.height;
  sg.imageSmoothingEnabled=true;
  sg.drawImage(img,Math.round(x-w/2),Math.round(y-h),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
  sg.imageSmoothingEnabled=false;return true}
function propShadow(wx,wy,rx){const [x,y]=proj(wx,wy,0);
  sg.fillStyle='rgba(0,0,0,.4)';sg.beginPath();sg.ellipse(x,y,rx*cam.Z,rx*cam.Z*.4,0,0,TAU);sg.fill()}
function drawBrazier(b){propShadow(b.x,b.y,10);billboard('campfire1',b.x,b.y,.9)}
function drawLamp(l){propShadow(l.x,l.y,8);billboard('lamp1',l.x,l.y,1.6)}
function drawChest(ch){const g=sg;propShadow(ch.x,ch.y,10);
  if(ch.o)g.globalAlpha=.55;billboard('chest1',ch.x,ch.y,.8);g.globalAlpha=1}
function drawShadow(e){const [x,y]=proj(e.x,e.y,0);
  sg.globalAlpha=.45;sg.fillStyle='#000';
  sg.beginPath();sg.ellipse(x,y,10*cam.Z,4*cam.Z,0,0,TAU);sg.fill();sg.globalAlpha=1;}
function drawEnt(){const g=sg,e=R,key=PA+'/'+e.anim;
  const img=IMG[key]||IMG[PA+'/idle'];if(!img)return;
  let f;if(e.anim==='guard')f=Math.min(3,Math.floor(e.t*animFps('guard')));
  else{const loop=e.anim==='idle'||e.anim==='walk';f=loop?Math.floor(e.t*animFps(e.anim))%6:Math.min(5,Math.floor(e.t*animFps(e.anim)))}
  if(dead)f=Math.min(5,Math.floor(endT*8));
  const [x,y]=proj(e.x,e.y,0),Z=cam.Z;
  if(R.veil>0)g.globalAlpha=.45;
  if(R.fl>0&&Math.floor(t*30)%2)g.globalAlpha=.6;
  const C=img.width/6,k=C>=190?2:1,c=C/k,ax=c/2,ay=c>100?100:74;
  g.imageSmoothingEnabled=k>1;
  g.drawImage(img,f*C,rowOf(e.face)*C,C,C,Math.round(x-ax*Z),Math.round(y-ay*Z),c*Z,c*Z);
  g.imageSmoothingEnabled=false;g.globalAlpha=1;
  // seal pips above head
  const sy=y-46*Z;g.lineWidth=2;
  for(let i=0;i<4;i++){g.strokeStyle=i<R.seal?'#d8d0bc':'#333339';
    g.beginPath();g.arc(x+(i>=R.seal?(i%2?1.5:-1.5):0),sy+(i>=R.seal?1:0),7*Z,i*1.571+.2,(i+1)*1.571-.2);g.stroke()}
  g.lineWidth=1;}
function drawFoe(h){const g=sg;
  const dying=h.st==='dying';
  let key='sw_idle',fr=16,fps=6;
  if(dying){key='sw_death';fr=30;fps=16}
  else if(h.st==='ap'){key='sw_run';fr=20;fps=10}
  else if(h.st==='wind'){key='sw_attack';fr=24;fps=14}
  else if(h.st==='broken'||h.st==='stag'||h.st==='rec'){key='sw_hit';fr=16;fps=12}
  const img=IMG['foe/'+key];
  const [x,y]=proj(h.x,h.y,0),Z=cam.Z*(h.boss?1.35:1);
  if(!img||!img.complete||!img.naturalWidth){
    g.fillStyle='#0c0c0f';const w=16*Z;g.fillRect(x-w/2,y-30*Z,w,30*Z);
    g.fillStyle='#111114';g.fillRect(x-4*Z,y-37*Z,8*Z,9*Z);return}
  const f=dying?Math.min(fr-1,Math.floor((h.dt||0)*fps)):Math.floor(h.t*fps)%fr;
  const row=foeRow(h.face),C=90;
  if(h.fl>0&&Math.floor(t*30)%2)g.globalAlpha=.55;
  g.imageSmoothingEnabled=true;
  g.drawImage(img,f*C,row*C,C,C,Math.round(x-45*Z),Math.round(y-84*Z),Math.round(90*Z),Math.round(90*Z));
  g.imageSmoothingEnabled=false;g.globalAlpha=1;
  if(dying||h.st==='sl')return;
  if(windUp(h)){g.strokeStyle='rgba(216,208,188,.6)';g.lineWidth=1;
    g.beginPath();for(let a=0;a<=20;a++){const qx=h.x+Math.cos(a/20*6.283)*1.5*TILE,qy=h.y+Math.sin(a/20*6.283)*1.5*TILE;
      const q=proj(qx,qy,0);a?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1])}g.stroke();
    if(h.ty2){g.fillStyle='rgba(216,208,188,.12)';g.fill()}}
  const sy=y-100*Z;g.lineWidth=2;
  if(h.smax===4){for(let i=0;i<4;i++){g.strokeStyle=i<h.seal?'#d8d0bc':'#333339';
    g.beginPath();g.arc(x,sy,6*Z,i*1.571+.2,(i+1)*1.571-.2);g.stroke()}}
  else{if(h.broken>0){g.strokeStyle='#d8d0bc';
      g.beginPath();g.arc(x-2*Z,sy,6*Z,1.9,4.4);g.stroke();
      g.beginPath();g.arc(x+2*Z,sy+2*Z,6*Z,5,7.5);g.stroke()}
    else{g.strokeStyle='#d8d0bc';g.beginPath();
      g.arc(x,sy,6*Z,-1.57,-1.57+6.283*Math.max(.02,h.seal/h.smax));g.stroke()}}
  g.lineWidth=1;
  if(h.ty2&&windUp(h)){g.fillStyle='#d8d0bc';g.font=Math.max(8,8*Z)+'px monospace';g.fillText('<!>',x+14*Z,y-64*Z)}}
function windUp(h){return h.st==='wind'}
function drawFxWorld(){const g=sg;
  for(const p of parts){if(p.type!=='dust')continue;const [x,y]=proj(p.x,p.y,p.z),u=p.life/p.max;
    g.globalAlpha=(1-u)*.5;g.fillStyle='#aab2c4';const r=p.size*(1+u*.8)*cam.Z;
    g.fillRect(Math.round(x-r/2),Math.round(y-r/2),Math.max(1,Math.round(r)),Math.max(1,Math.round(r)))}
  g.globalAlpha=1;}
function drawGlow(){const g=sg;g.globalCompositeOperation='lighter';
  for(const b of BRZ){const [x,y]=proj(b.x,b.y,30),Rr=44*cam.Z,fl=flick(b);
    const gr0=g.createRadialGradient(x,y,0,x,y,Rr);
    gr0.addColorStop(0,'rgba(255,130,60,'+(.34*fl)+')');gr0.addColorStop(1,'rgba(255,90,30,0)');
    g.fillStyle=gr0;g.fillRect(x-Rr,y-Rr,Rr*2,Rr*2)}
  for(const b of LAMPS){const [x,y]=proj(b.x,b.y,40),Rr=60*cam.Z,fl=flick(b);
    const gr=g.createRadialGradient(x,y,0,x,y,Rr);
    gr.addColorStop(0,'rgba(255,190,120,'+(.30*fl)+')');gr.addColorStop(1,'rgba(255,120,50,0)');
    g.fillStyle=gr;g.fillRect(x-Rr,y-Rr,Rr*2,Rr*2)}
  const [rx,ry]=proj(REST.x,REST.y,10),Rr2=70*cam.Z;
  const rg=g.createRadialGradient(rx,ry,2,rx,ry,Rr2);
  rg.addColorStop(0,'rgba(217,119,43,.22)');rg.addColorStop(1,'rgba(217,119,43,0)');
  g.fillStyle=rg;g.fillRect(rx-Rr2,ry-Rr2,Rr2*2,Rr2*2);
  for(const f of flashes){const [x,y]=proj(f.x,f.y,f.z),u=f.t/f.dur,Rr=f.r*.8*cam.Z;
    const gr=g.createRadialGradient(x,y,0,x,y,Rr);
    gr.addColorStop(0,'rgba(255,235,200,'+(.55*f.I*(1-u))+')');gr.addColorStop(1,'rgba(255,170,90,0)');
    g.fillStyle=gr;g.fillRect(x-Rr,y-Rr,Rr*2,Rr*2)}
  for(const p of parts){if(p.type!=='spark')continue;const [x,y]=proj(p.x,p.y,p.z),u=p.life/p.max;
    g.globalAlpha=1-u*.5;g.fillStyle=p.col;g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(p.size*cam.Z)),Math.max(1,Math.round(p.size*cam.Z)))}
  for(const p of parts){
    if(p.type!=='strip')continue;
    const img=vfxTint(p),V=VFX[p.key];if(!img)continue;
    const f=Math.min(V.frames-1,Math.floor(p.life*p.fps)),u=p.life/p.max;
    const [x,y]=proj(p.x,p.y,p.z),s=p.scale*cam.Z;
    g.save();g.globalAlpha=clamp(1-u,0,1);g.translate(Math.round(x),Math.round(y));g.rotate(p.ang);g.scale(s,s*(p.squash||1));
    g.drawImage(img,(f%V.cols)*V.fw,((f/V.cols)|0)*V.fh,V.fw,V.fh,-V.fw/2,-V.fh/2,V.fw,V.fh);g.restore();
  }
  g.globalAlpha=1;g.globalCompositeOperation='source-over';
  for(const r of rings){const u=r.t/r.dur,Rr=r.maxR*(1-(1-u)*(1-u)),[x,y]=proj(r.x,r.y,0);
    g.strokeStyle=r.col;g.globalAlpha=(1-u)*.8;g.lineWidth=Math.max(1,Math.round(r.w*(1-u)*cam.Z));
    g.beginPath();g.ellipse(x,y,Rr*cam.Z,Rr*cam.Z*cam.py,0,0,TAU);g.stroke()}
  g.globalAlpha=1;}
function render(){setCamMatrix();const g=sg;
  g.globalCompositeOperation='source-over';g.globalAlpha=1;g.imageSmoothingEnabled=false;
  drawBackdrop();drawFloor();
  const [ccx,ccy]=w2t(cam.fx,cam.fy);
  const list=[];
  const pd=depthOf(R.x,R.y), fadeR=2.6*TILE;
  const occludes=(wx,wy)=>depthOf(wx,wy)>pd+8&&Math.hypot(wx-R.x,wy-R.y)<fadeR;
  const fadeWrap=(wx,wy,fn)=>()=>{const a=occludes(wx,wy)?.3:1;if(a<1)sg.globalAlpha=a;fn();sg.globalAlpha=1};
  const cr=cullRange();
  for(let j=clamp(Math.floor(ccy)-cr,0,MH-1);j<=clamp(Math.floor(ccy)+cr,0,MH-1);j++)
    for(let i=clamp(Math.floor(ccx)-cr,0,MW-1);i<=clamp(Math.floor(ccx)+cr,0,MW-1);i++){
      if(M[j][i]!==1&&M[j][i]!==3)continue;
      const [wx,wy]=t2w(i+.5,j+.5),sp=proj(wx,wy,0);
      if(sp[0]<-140||sp[0]>VW+140||sp[1]<-220||sp[1]>VH+140)continue;
      if(M[j][i]===1){let n=0;for(let a=-1;a<2;a++)for(let b=-1;b<2;b++){const yy=j+b,xx=i+a;
        if(yy>=0&&xx>=0&&yy<MH&&xx<MW&&M[yy][xx]!==1)n=1}
        if(n)list.push({d:depthOf(wx,wy),f:(()=>{const a=i,b=j;return ()=>drawWall(a,b,occludes(wx,wy))})()})}
      else list.push({d:depthOf(wx,wy),f:()=>drawGate(i,j)});}
  for(const b of BRZ){if(Math.abs(b.tx-ccx)<cr+1&&Math.abs(b.ty-ccy)<cr+1)list.push({d:depthOf(b.x,b.y),f:fadeWrap(b.x,b.y,()=>drawBrazier(b))})}
  for(const l of LAMPS)list.push({d:depthOf(l.x,l.y),f:fadeWrap(l.x,l.y,()=>drawLamp(l))});
  for(const d of DECOR){
    if(d.k==='flat'){const img=IMG['prop/'+d.p];
      if(img&&img.complete&&img.naturalWidth){const k=FLAT_DECAL[d.p]||1,pts=tilePts(d.i,d.j,k);
        list.push({d:depthOf((d.i+.5-MW/2)*TILE,(d.j+.5-MH/2)*TILE),f:(()=>{const P=pts;return ()=>quadBlit(img,0,0,img.naturalWidth,img.naturalHeight,P[0],P[1],P[2],P[3])})()})}}
    else{list.push({d:depthOf(d.x,d.y),f:fadeWrap(d.x,d.y,()=>{propShadow(d.x,d.y,8);billboard(d.p,d.x,d.y,BOARD_H[d.p]||1)})})}}
  for(const ch of CHESTS){if(!ch.hid)list.push({d:depthOf(ch.x,ch.y),f:fadeWrap(ch.x,ch.y,()=>drawChest(ch))})}
  list.push({d:depthOf(R.x,R.y),f:()=>{drawShadow(R);drawEnt()}});
  H.forEach(h=>list.push({d:depthOf(h.x,h.y),f:()=>{drawShadow(h);drawFoe(h)}}));
  list.sort((a,b)=>a.d-b.d);list.forEach(o=>o.f());
  drawFxWorld();
  if(opt.light){/* baked into glow for hollow */}
  drawGlow();
  // floaters
  texts.forEach(x=>{const [sx,sy]=proj(x.x,x.y,0);g.globalAlpha=Math.min(1,x.t/x.m*2);
    g.font='italic '+Math.round(11*DPRS)+'px Georgia';g.fillStyle='#d8d0bc';const w=g.measureText(x.s).width;
    g.fillText(x.s,sx-w/2,sy-58*DPRS-(x.m-x.t)*10*DPRS);g.globalAlpha=1});
  // prompts
  g.fillStyle='#d8d0bc';g.font='italic '+Math.round(11*DPRS)+'px Georgia';g.textAlign='center';
  if(!dead&&!won&&Math.hypot(R.x-REST.x,R.y-REST.y)<1.6*TILE)g.fillText('E · rest at the seal',VW/2,100*DPRS);
  for(const ch of CHESTS){if(!ch.o&&!ch.hid&&Math.hypot(R.x-ch.x,R.y-ch.y)<1.4*TILE)g.fillText('E · take '+ch.s,VW/2,100*DPRS)}
  g.textAlign='left';
  g.fillStyle='rgba(90,90,96,.9)';g.font=Math.round(10*DPRS)+'px Georgia';
  g.fillText('WASD move   J Cut chain   K Wheel (2 Ash)   Space Veil   E use   L Guard',10*DPRS,VH-8*DPRS);
  cg.imageSmoothingEnabled=false;cg.globalCompositeOperation='source-over';cg.drawImage(S,0,0);
  const vg=cg.createRadialGradient(VW/2,VH/2,VH*.35,VW/2,VH/2,Math.max(VW,VH)*.72);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.55)');
  cg.fillStyle=vg;cg.fillRect(0,0,VW,VH);}

/* ---------- HUD ---------- */
const hpfill=$('hpfill'),hpghost=$('hpghost'),hpn=$('hpn'),comboEl=$('combo'),cn=$('cn'),cl=$('cl'),cs=$('cs'),mvEl=$('mv'),zoneEl=$('zone');
let lastHpW='',lastHpn='',lastCombo='',lastMv='',lastZone=0;
function hud(){const hpW=(R.seal/4*100)+'%';
  if(hpW!==lastHpW){hpfill.style.width=hpW;hpghost.style.width=hpW;lastHpW=hpW}
  const sealT='◆'.repeat(Math.max(0,R.seal))+'◇'.repeat(Math.max(0,4-R.seal))+(R.rev?' · holds':'');
  if(sealT!==lastHpn){hpn.textContent=sealT;lastHpn=sealT}
  const on=R.ash>0||R.chain>0;comboEl.classList.toggle('on',on);
  const ct=R.ash+'|'+R.chain;if(ct!==lastCombo){lastCombo=ct;cn.textContent=R.ash;cl.textContent='ASH';
    cs.textContent=(R.chain>1?'chain x'+R.chain:'')+(R.chain>1?' · ':'')+H.length+' hosts';}
  const mv=dead?'the seal scatters':won?'the test is met':(zone||'Cinder Hall')+' · find Pell';
  if(mv!==lastMv){mvEl.innerHTML='<b>'+mv+'</b>';lastMv=mv}
  if(zt>0&&lastZone<=0)zoneEl.classList.add('on');if(zt<=0&&lastZone>0)zoneEl.classList.remove('on');
  lastZone=zt;if(zt>0)zoneEl.textContent=zone;}

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
  if(introIl>=LINES.length){reset();hideOv();try{sessionStorage.vs_hollow_intro='1'}catch(e){}}
  else typeLine()}
function descend(){busyOn();try{localStorage.setItem('vs_hollow_p1',UI.p1);localStorage.setItem('vs_hollow_s1',UI.s1)}catch(e){}
  loadFighter(UI.p1,UI.s1,()=>{busyOff();PA=UI.p1;reset();startIntro()})}
function busyOn(){$('busy').classList.add('on')}
function busyOff(){$('busy').classList.remove('on')}

/* loaders: portraits for all, full kit for chosen */
const ANIM_NEED=['idle','walk','attack1','attack2','attack3','jump','dash','guard','hit','death','victory'];
function loadImgs(keys,done){keys=keys.filter(k=>DATA.img[k]&&!IMG[k]);let n=keys.length;if(!n)return done();
  keys.forEach(k=>{const i=new Image();i.onload=()=>{if(--n===0)done()};i.onerror=()=>{if(--n===0)done()};i.src=DATA.img[k];IMG[k]=i})}
function loadPortraits(done){loadImgs(Object.values(CHR).map(c=>c.id+'/idle').filter(k=>DATA.img[k]),()=>{paintCards();if(done)done()})}
function loadFighter(id,skin,done){const px=[],tx=[];
  ANIM_NEED.forEach(a=>['','p16/','p38/'].forEach(p=>{if(skin==='toon')tx.push('toon/'+id+'/'+p+a);else px.push(id+'/'+p+a)}));
  loadImgs(px,()=>{if(skin==='toon'){loadToons(tx,done)}else done()})}
function loadToons(keys,done){keys=keys.filter(k=>!IMG[k]);let n=keys.length;if(!n)return done();busyOn();
  const fin=()=>{if(--n===0){busyOff();done()}};
  keys.forEach(k=>{const i=new Image();const url=k==='toon/shadow'?'/toons/shadow_standard.png':'/toons/'+k.slice(5)+'.png';
    i.onload=()=>{IMG[k]=i;fin()};i.onerror=fin;i.src=url})}

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
  $('pQuit').onclick=()=>{snd(330,.1);reset();goOv('title')};
  $('pMute').onclick=()=>{toggleMute();snd(660,.05)};
  $('deadGo').onclick=()=>{reset();hideOv();snd(440,.08)};
  $('deadTitle').onclick=()=>{reset();goOv('title')};
  $('endGo').onclick=()=>{reset();hideOv();snd(440,.08)};
  $('endTitle').onclick=()=>{reset();goOv('title')};
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
    if(UI.open==='dead'){if(k==='r'){reset();hideOv()}else if(k==='escape'){reset();goOv('title')}return}
    if(UI.open==='end'){if(k==='r'){reset();hideOv()}else if(k==='escape'){reset();goOv('title')}return}
    if(k==='escape'){if(UI.open==='pause')hideOv();else if(UI.open==='how'||UI.open==='credits')goOv('title');else if(UI.open)hideOv();return}
    return}
  if(k==='e'&&!e.repeat){e.preventDefault();press('dash');return}
  if(ACT[k]){e.preventDefault();if(!e.repeat)press(ACT[k]);return}
  if('wasd'.includes(k)&&k.length===1||k.startsWith('arrow')){e.preventDefault();keys.add(k);return}
  if(k==='l'||k==='h'){e.preventDefault();if(!e.repeat){keys.add('l');press('guard')}return}
  if(e.repeat)return;
  if(k==='q')rotate(-1);
  else if(k==='m')toggleMute();
  else if(k==='r'&&(dead||won)){reset();hideOv()}});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys.delete(k);if(k==='h')keys.delete('l');if(k===' ')e.preventDefault()});
addEventListener('blur',()=>keys.clear());
function rotate(d){cam.target+=45*d}
$('camL').onclick=e=>{rotate(-1);e.currentTarget.blur()};
$('camR').onclick=e=>{rotate(1);e.currentTarget.blur()};
$('c').addEventListener('mousedown',e=>{if(UI.open)return;
  if(e.button===0){e.preventDefault();press('light')}else if(e.button===2){e.preventDefault();press('special')}});
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
  b.addEventListener('pointerdown',e=>{e.preventDefault();if(UI.open)return;press(b.dataset.a);b.classList.add('dn')});
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
  if(k==='q'&&!UI.open)rotate(-1);if(k==='c'&&!UI.open)rotate(1)});

/* ---------- main loop ---------- */
let last=performance.now(),acc=0,ready=false;
function frame(now){requestAnimationFrame(frame);if(!ready)return;
  if(dead&&endT>1.2&&!UI.open){showOv('dead')}
  if(won&&endT>1.0&&!UI.open){showOv('end')}
  if(UI.open){last=now;render();return}
  const dt=Math.min(.1,(now-last)/1000);last=now;acc+=dt;
  let n=0;while(acc>=TICK&&n<8){simTick();acc-=TICK;n++}if(n===8)acc=0;
  render();hud();}
function boot(){initUI();fit();reset();
  const artKeys=['tile/cursed_ground'].concat(PROP_LIST.map(p=>'prop/'+p),['idle','run','attack','hit','death'].map(a=>'foe/sw_'+a));
  loadImgs(Object.keys(DATA.img).filter(k=>k==='shadow'||k.startsWith('arena/')||k.startsWith('vfx/')||artKeys.includes(k)),()=>{
    bakeAvgs();
    loadImgs(Object.values(CHR).map(c=>c.id+'/idle'),()=>{
      loadFighter(UI.p1,UI.s1,()=>{$('load').remove();ready=true;showOv('title');paintCards()})})});
  requestAnimationFrame(frame);}
loadImgs(Object.keys(DATA.img).filter(k=>k==='shadow'),()=>{});
/* defer boot until DATA ready (injected by build) */
if(DATA&&DATA.M)boot();else addEventListener('load',()=>{if(DATA&&DATA.M)boot()});
window.__hollow={R,get H(){return H},reset,UI,cam,tick:()=>tick};
})();
