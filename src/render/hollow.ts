// Hollow I renderer + HUD: tile-art floor, walls, props, carrier, foes.
// Bodies moved verbatim from the legacy page; live state binds per call.
// R/cam are stable refs (mutated in place); reassigned collections and
// flags are read via S each call. Canvas host + shell bits arrive via deps.
import { TAU, clamp, wrap, deg, hash, angDiff } from '../engine/math';
import { $, mk, poly } from '../engine/dom';
import { animFps } from '../engine/moves';
import { VFX } from '../engine/fx';
import {
  setCamMatrix as setCamMatrixBase, proj as projBase,
  depthOf as depthOfBase, rowOf as rowOfBase,
} from '../engine/projection';
import { TILE, MW, MH, HollowApi } from '../sim/hollow';

const GCOLS = 40;
const POOL: Record<string, number[]> = {
  ash: [402, 405, 527, 899, 975, 1952, 404, 407, 528, 898, 1951],
  mid: [404, 407, 528, 898, 1951, 402, 405],
  pale: [60, 581, 921, 928, 934, 402],
  stone: [821, 1021, 1523, 1816, 1901, 2021, 1525, 2045, 1535, 2048],
};
export const PROP_LIST = [
  'chest1', 'campfire1', 'lamp1', 'column1', 'u_grave1', 'u_grave2', 'u_grave3',
  'u_bones1', 'u_bones2', 'u_bones3', 'u_skulls1', 'u_skulls2', 'u_skulls3',
  'u_deadtree1', 'u_deadtree2', 'u_deadtree3', 'u_ruin1', 'u_ruin2', 'u_ruin3',
  'u_rock1', 'u_rock2', 'u_rock3', 'u_thorn1', 'u_thorn2', 'u_thorn3',
];
const FLAT_DECAL: Record<string, number> = {
  u_grave1: 1, u_grave2: 1, u_grave3: 1, u_bones1: 1, u_bones2: 1, u_bones3: 1,
  u_rock1: 2, u_rock2: 2, u_rock3: 2, u_thorn1: 4, u_thorn2: 4, u_thorn3: 4,
};
const BOARD_H: Record<string, number> = {
  u_skulls1: .7, u_skulls2: .7, u_skulls3: .7,
  u_deadtree1: 2.6, u_deadtree2: 2.6, u_deadtree3: 2.6,
  u_ruin1: 1.8, u_ruin2: 1.8, u_ruin3: 1.8,
  chest1: .8, campfire1: .9, lamp1: 1.6, column1: 2.2,
};
const FOE_FR: Record<string, number> = { idle: 16, run: 20, attack: 24, hit: 16, death: 30 };
const AVGC: Record<number, string> = {};

export interface HollowGfx {
  sg: any; cg: any; S: any;
  VW: number; VH: number; baseZoom: number; DPRS: number;
}

export interface HollowRenderDeps {
  IMG: Record<string, any>;
  UI: any;
  opt: any;
  getView: () => { VW: number; VH: number; baseZoom: number; DPRS: number };
  gfx: () => HollowGfx;
}

export function createHollowRenderer(deps: HollowRenderDeps) {
  const { IMG } = deps;
  const UI = deps.UI;
  const opt = deps.opt;
  let S!: HollowApi;
  let R: any, cam: any;
  let parts: any[], rings: any[], nums: any[], flashes: any[];
  let BRZ: any[], REST: any;
  let sg: any, cg: any, S_: any;
  let VW = 0, VH = 0, baseZoom = 1, DPRS = 1;
  let hpfill: any, hpghost: any, hpn: any, comboEl: any, cn: any, cl: any, cs: any, mvEl: any, zoneEl: any;
  let lastHpW = '', lastHpn = '', lastCombo = '', lastMv = '', lastZone = 0;

  function bind(s: HollowApi) {
    S = s; R = s.R; cam = s.cam;
    parts = s.parts; rings = s.rings; nums = s.nums; flashes = s.flashes;
    BRZ = (s as any).BRZ; REST = (s as any).REST;
    const g = deps.gfx();
    sg = g.sg; cg = g.cg; S_ = g.S;
    VW = g.VW; VH = g.VH; baseZoom = g.baseZoom; DPRS = g.DPRS;
  }

  function proj(x: number, y: number, z: number) { return projBase(cam, VW, VH, x, y, z); }
  function setCamMatrix() { setCamMatrixBase(cam); }
  const depthOf = (x: number, y: number) => depthOfBase(cam, x, y);
  const rowOf = (face: number) => rowOfBase(cam, face);
  const foeRow = (face: number) => ((Math.round(wrap(face + cam.ang - 90) / 45) % 8) + 8) % 8;
  function flick(b: any) { return .82 + .18 * Math.sin(S.tick * .21 + b.ph) * Math.sin(S.tick * .093 + b.ph * 2.3) + .06 * Math.sin(S.tick * .57 + b.ph); }
  function shakeCam(a: number) { cam.shake = Math.min(1, Math.max(cam.shake, a)); }

  function tileWorld(i: number, j: number) {
    const x0 = (i - MW / 2) * TILE, x1 = (i + 1 - MW / 2) * TILE;
    const y0 = (j - MH / 2) * TILE, y1 = (j + 1 - MH / 2) * TILE;
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  function tilePts(i: number, j: number, k?: number) {
    const pts = tileWorld(i, j).map(([x, y]) => proj(x, y, 0));
    if (!k || k === 1) return pts;
    const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
    return pts.map(p => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
  }
  function quadBlit(img: any, sx: number, sy: number, sw: number, sh: number, p0: number[], p1: number[], p2: number[], p3: number[]) {
    const srt = [p0, p1, p2, p3].slice().sort((a, b) => a[1] - b[1]);
    const T = srt[0], B = srt[3], mid = [srt[1], srt[2]].sort((a, b) => a[0] - b[0]), L = mid[0];
    const g = sg; g.save(); g.imageSmoothingEnabled = true;
    g.setTransform((T[0] - L[0]) / sw, (T[1] - L[1]) / sw, (B[0] - L[0]) / sh, (B[1] - L[1]) / sh, L[0], L[1]);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    g.restore(); g.imageSmoothingEnabled = false;
  }
  function poolFor(i: number, j: number) {
    const ZMAP = S.world.ZMAP;
    const z = ZMAP[j] && ZMAP[j][i];
    if (z === 2 || z === 3) return POOL.stone; if (z === 1) return POOL.pale; return POOL.ash;
  }
  function bakeAvgs() {
    const gi = IMG['tile/cursed_ground'];
    if (!gi || !gi.naturalWidth) return;
    const c = mk(16, 16), g = c.getContext('2d');
    Object.values(POOL).flat().forEach(idx => {
      if (AVGC[idx]) return;
      try {
        g.clearRect(0, 0, 16, 16);
        g.drawImage(gi, (idx % GCOLS) * 16, ((idx / GCOLS) | 0) * 16, 16, 16, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data;
        let r = 0, gg = 0, b = 0;
        for (let k = 0; k < d.length; k += 4) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; }
        const n = d.length / 4;
        AVGC[idx] = `rgb(${r / n | 0},${gg / n | 0},${b / n | 0})`;
      } catch (e) {}
    });
  }
  function w2t(x: number, y: number): [number, number] { return [x / TILE + MW / 2, y / TILE + MH / 2]; }
  function t2w(tx: number, ty: number): [number, number] { return [(tx - MW / 2) * TILE, (ty - MH / 2) * TILE]; }
  function cullRange() { const r = Math.ceil(Math.max(VW, VH) / cam.Z / TILE / 2) + 3; return r; }
  function drawBackdrop() {
    const g = sg;
    const gr = g.createLinearGradient(0, 0, 0, VH);
    ['#030408', '#0a0c14', '#141821', '#1e222e'].forEach((c, i) => gr.addColorStop([0, .5, .8, 1][i], c));
    g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    const cx = VW * .5; g.fillStyle = '#020306'; g.beginPath(); g.moveTo(cx - 14, 0);
    for (let y = 0; y <= VH * .62; y += VH * .062) g.lineTo(cx + (hash(y | 0, 7) - .5) * 56, y);
    for (let y = VH * .62; y >= 0; y -= VH * .062) g.lineTo(cx + (hash(y | 0, 13) - .5) * 56 + 18, y);
    g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,122,42,.55)'; g.lineWidth = 2; g.beginPath();
    for (let y = 0; y <= VH * .62; y += VH * .062) { const x = cx + (hash(y | 0, 7) - .5) * 56; y ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  function drawFloor() {
    const g = sg; const [ccx, ccy] = w2t(cam.fx, cam.fy);
    const gi = IMG['tile/cursed_ground'], hasT = gi && gi.complete && gi.naturalWidth;
    const cr = cullRange();
    const i0 = clamp(Math.floor(ccx) - cr, 0, MW - 1), i1 = clamp(Math.floor(ccx) + cr, 0, MW - 1);
    const j0 = clamp(Math.floor(ccy) - cr, 0, MH - 1), j1 = clamp(Math.floor(ccy) + cr, 0, MH - 1);
    const M = S.world.M, t = S.t;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (M[j][i] !== 0) continue;
      const pts = tilePts(i, j);
      if ((pts[0][0] < -90 && pts[1][0] < -90 && pts[2][0] < -90 && pts[3][0] < -90) ||
        (pts[0][0] > VW + 90 && pts[1][0] > VW + 90 && pts[2][0] > VW + 90 && pts[3][0] > VW + 90) ||
        (pts[0][1] < -90 && pts[1][1] < -90 && pts[2][1] < -90 && pts[3][1] < -90) ||
        (pts[0][1] > VH + 90 && pts[1][1] > VH + 90 && pts[2][1] > VH + 90 && pts[3][1] > VH + 90)) continue;
      const pool = poolFor(i, j), idx = pool[hash(i, j) * pool.length | 0];
      poly(g, pts); g.fillStyle = AVGC[idx] || '#2d2c31'; g.fill();
      if (hasT) quadBlit(gi, (idx % GCOLS) * 16, ((idx / GCOLS) | 0) * 16, 16, 16, pts[0], pts[1], pts[2], pts[3]);
      const v = (i * 7 + j * 3) % 9;
      if (v === 1 || v === 4) {
        const f = .5 + .5 * Math.sin(t * 2 + i * 3 + j);
        g.strokeStyle = 'rgba(217,119,43,' + (.3 + .3 * f) + ')'; g.lineWidth = 1; g.beginPath();
        const a = proj((i + .1 - MW / 2) * TILE, (j + .2 - MH / 2) * TILE, 0);
        const b = proj((i + .6 - MW / 2) * TILE, (j + .5 - MH / 2) * TILE, 0);
        const c = proj((i + .4 - MW / 2) * TILE, (j + .9 - MH / 2) * TILE, 0);
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
      }
    }
    const rp = [];
    for (let k = 0; k <= 28; k++) { const a = k / 28 * TAU; rp.push(proj(REST.x + Math.cos(a) * 1.5 * TILE, REST.y + Math.sin(a) * 1.5 * TILE, 0)); }
    poly(g, rp); g.strokeStyle = '#d8d0bc'; g.lineWidth = Math.max(1, 1.5 * cam.Z); g.stroke();
  }
  function drawWall(i: number, j: number, fade: boolean) {
    const g = sg, Hh = 30;
    const c = tileWorld(i, j), b = c.map(([x, y]) => proj(x, y, 0)), tp = c.map(([x, y]) => proj(x, y, Hh));
    if (fade) g.globalAlpha = .28;
    g.fillStyle = '#3d201c'; poly(g, [b[3], b[2], tp[2], tp[3]]); g.fill();
    g.fillStyle = '#54302a'; poly(g, [b[2], b[1], tp[1], tp[2]]); g.fill();
    g.fillStyle = '#33201c'; poly(g, [b[1], b[0], tp[0], tp[1]]); g.fill();
    g.fillStyle = '#47271f'; poly(g, [b[0], b[3], tp[3], tp[0]]); g.fill();
    const idx = POOL.stone[hash(i * 3 + 1, j * 3 + 2) * POOL.stone.length | 0];
    poly(g, tp); g.fillStyle = AVGC[idx] || '#4a4442'; g.fill();
    const gi = IMG['tile/cursed_ground'];
    if (gi && gi.complete && gi.naturalWidth) quadBlit(gi, (idx % GCOLS) * 16, ((idx / GCOLS) | 0) * 16, 16, 16, tp[0], tp[1], tp[2], tp[3]);
    g.strokeStyle = '#8a6a5e'; g.lineWidth = 1; poly(g, tp); g.stroke(); g.globalAlpha = 1;
  }
  function drawGate(i: number, j: number) {
    const g = sg;
    const c = tileWorld(i, j), b = c.map(([x, y]) => proj(x, y, 0)), tp = c.map(([x, y]) => proj(x, y, 40));
    const [wx, wy] = t2w(i + .5, j + .5);
    const fa = (depthOf(wx, wy) > depthOf(R.x, R.y) + 8 && Math.hypot(wx - R.x, wy - R.y) < 2.6 * TILE) ? .3 : 1;
    const fl = .12 + .08 * Math.sin(S.t * 3); g.globalAlpha = fa;
    g.fillStyle = 'rgba(216,208,188,.9)'; poly(g, [b[3], b[2], tp[2], tp[3]]); g.fill();
    g.fillStyle = 'rgba(216,208,188,' + fl + ')'; poly(g, tp); g.fill(); g.globalAlpha = 1;
  }
  function billboard(key: string, wx: number, wy: number, hTiles: number) {
    const img = IMG['prop/' + key];
    if (!img || !img.complete || !img.naturalWidth) return false;
    const [x, y] = proj(wx, wy, 0), h = hTiles * TILE * cam.Z, w = h * img.width / img.height;
    sg.imageSmoothingEnabled = true;
    sg.drawImage(img, Math.round(x - w / 2), Math.round(y - h), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    sg.imageSmoothingEnabled = false; return true;
  }
  function propShadow(wx: number, wy: number, rx: number) {
    const [x, y] = proj(wx, wy, 0);
    sg.fillStyle = 'rgba(0,0,0,.4)'; sg.beginPath(); sg.ellipse(x, y, rx * cam.Z, rx * cam.Z * .4, 0, 0, TAU); sg.fill();
  }
  function drawBrazier(b: any) { propShadow(b.x, b.y, 10); billboard('campfire1', b.x, b.y, .9); }
  function drawLamp(l: any) { propShadow(l.x, l.y, 8); billboard('lamp1', l.x, l.y, 1.6); }
  function drawChest(ch: any) {
    const g = sg; propShadow(ch.x, ch.y, 10);
    if (ch.o) g.globalAlpha = .55; billboard('chest1', ch.x, ch.y, .8); g.globalAlpha = 1;
  }
  function drawShadow(e: any) {
    const [x, y] = proj(e.x, e.y, 0);
    sg.globalAlpha = .45; sg.fillStyle = '#000';
    sg.beginPath(); sg.ellipse(x, y, 10 * cam.Z, 4 * cam.Z, 0, 0, TAU); sg.fill(); sg.globalAlpha = 1;
  }
  function drawEnt() {
    const g = sg, e = R, key = S.pa + '/' + e.anim;
    const img = IMG[key] || IMG[S.pa + '/idle']; if (!img) return;
    let f;
    if (e.anim === 'guard') f = Math.min(3, Math.floor(e.t * animFps('guard')));
    else { const loop = e.anim === 'idle' || e.anim === 'walk'; f = loop ? Math.floor(e.t * animFps(e.anim)) % 6 : Math.min(5, Math.floor(e.t * animFps(e.anim))); }
    if (S.dead) f = Math.min(5, Math.floor(S.endT * 8));
    const [x, y] = proj(e.x, e.y, 0), Z = cam.Z;
    if (R.veil > 0) g.globalAlpha = .45;
    if (R.fl > 0 && Math.floor(S.t * 30) % 2) g.globalAlpha = .6;
    const C = img.width / 6, k = C >= 190 ? 2 : 1, c = C / k, ax = c / 2, ay = c > 100 ? 100 : 74;
    g.imageSmoothingEnabled = k > 1;
    g.drawImage(img, f * C, rowOf(e.face) * C, C, C, Math.round(x - ax * Z), Math.round(y - ay * Z), c * Z, c * Z);
    g.imageSmoothingEnabled = false; g.globalAlpha = 1;
    const sy = y - 46 * Z; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = i < R.seal ? '#d8d0bc' : '#333339';
      g.beginPath(); g.arc(x + (i >= R.seal ? (i % 2 ? 1.5 : -1.5) : 0), sy + (i >= R.seal ? 1 : 0), 7 * Z, i * 1.571 + .2, (i + 1) * 1.571 - .2); g.stroke();
    }
    g.lineWidth = 1;
  }
  function windUp(h: any) { return h.st === 'wind'; }
  function drawFoe(h: any) {
    const g = sg;
    const dying = h.st === 'dying';
    let key = 'sw_idle', fr = 16, fps = 6;
    if (dying) { key = 'sw_death'; fr = 30; fps = 16; }
    else if (h.st === 'ap') { key = 'sw_run'; fr = 20; fps = 10; }
    else if (h.st === 'wind') { key = 'sw_attack'; fr = 24; fps = 14; }
    else if (h.st === 'broken' || h.st === 'stag' || h.st === 'rec') { key = 'sw_hit'; fr = 16; fps = 12; }
    const img = IMG['foe/' + key];
    const [x, y] = proj(h.x, h.y, 0), Z = cam.Z * (h.boss ? 1.35 : 1);
    if (!img || !img.complete || !img.naturalWidth) {
      g.fillStyle = '#0c0c0f'; const w = 16 * Z; g.fillRect(x - w / 2, y - 30 * Z, w, 30 * Z);
      g.fillStyle = '#111114'; g.fillRect(x - 4 * Z, y - 37 * Z, 8 * Z, 9 * Z); return;
    }
    const f = dying ? Math.min(fr - 1, Math.floor((h.dt || 0) * fps)) : Math.floor(h.t * fps) % fr;
    const row = foeRow(h.face), C = 90;
    if (h.fl > 0 && Math.floor(S.t * 30) % 2) g.globalAlpha = .55;
    g.imageSmoothingEnabled = true;
    g.drawImage(img, f * C, row * C, C, C, Math.round(x - 45 * Z), Math.round(y - 84 * Z), Math.round(90 * Z), Math.round(90 * Z));
    g.imageSmoothingEnabled = false; g.globalAlpha = 1;
    if (dying || h.st === 'sl') return;
    if (windUp(h)) {
      g.strokeStyle = 'rgba(216,208,188,.6)'; g.lineWidth = 1;
      g.beginPath();
      for (let a = 0; a <= 20; a++) {
        const qx = h.x + Math.cos(a / 20 * 6.283) * 1.5 * TILE, qy = h.y + Math.sin(a / 20 * 6.283) * 1.5 * TILE;
        const q = proj(qx, qy, 0); a ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
      }
      g.stroke();
      if (h.ty2) { g.fillStyle = 'rgba(216,208,188,.12)'; g.fill(); }
    }
    const sy = y - 100 * Z; g.lineWidth = 2;
    if (h.smax === 4) {
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = i < h.seal ? '#d8d0bc' : '#333339';
        g.beginPath(); g.arc(x, sy, 6 * Z, i * 1.571 + .2, (i + 1) * 1.571 - .2); g.stroke();
      }
    }
    else {
      if (h.broken > 0) {
        g.strokeStyle = '#d8d0bc';
        g.beginPath(); g.arc(x - 2 * Z, sy, 6 * Z, 1.9, 4.4); g.stroke();
        g.beginPath(); g.arc(x + 2 * Z, sy + 2 * Z, 6 * Z, 5, 7.5); g.stroke();
      }
      else {
        g.strokeStyle = '#d8d0bc'; g.beginPath();
        g.arc(x, sy, 6 * Z, -1.57, -1.57 + 6.283 * Math.max(.02, h.seal / h.smax)); g.stroke();
      }
    }
    g.lineWidth = 1;
    if (h.ty2 && windUp(h)) { g.fillStyle = '#d8d0bc'; g.font = Math.max(8, 8 * Z) + 'px monospace'; g.fillText('<!>', x + 14 * Z, y - 64 * Z); }
  }
  function drawFxWorld() {
    const g = sg;
    for (const p of parts) {
      if (p.type !== 'dust') continue;
      const [x, y] = proj(p.x, p.y, p.z), u = p.life / p.max;
      g.globalAlpha = (1 - u) * .5; g.fillStyle = '#aab2c4';
      const r = p.size * (1 + u * .8) * cam.Z;
      g.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), Math.max(1, Math.round(r)), Math.max(1, Math.round(r)));
    }
    g.globalAlpha = 1;
  }
  function drawGlow() {
    const g = sg; g.globalCompositeOperation = 'lighter';
    for (const b of BRZ) {
      const [x, y] = proj(b.x, b.y, 30), Rr = 44 * cam.Z, fl = flick(b);
      const gr0 = g.createRadialGradient(x, y, 0, x, y, Rr);
      gr0.addColorStop(0, 'rgba(255,130,60,' + (.34 * fl) + ')'); gr0.addColorStop(1, 'rgba(255,90,30,0)');
      g.fillStyle = gr0; g.fillRect(x - Rr, y - Rr, Rr * 2, Rr * 2);
    }
    for (const b of S.world.LAMPS) {
      const [x, y] = proj(b.x, b.y, 40), Rr = 60 * cam.Z, fl = flick(b);
      const gr = g.createRadialGradient(x, y, 0, x, y, Rr);
      gr.addColorStop(0, 'rgba(255,190,120,' + (.30 * fl) + ')'); gr.addColorStop(1, 'rgba(255,120,50,0)');
      g.fillStyle = gr; g.fillRect(x - Rr, y - Rr, Rr * 2, Rr * 2);
    }
    const [rx, ry] = proj(REST.x, REST.y, 10), Rr2 = 70 * cam.Z;
    const rg = g.createRadialGradient(rx, ry, 2, rx, ry, Rr2);
    rg.addColorStop(0, 'rgba(217,119,43,.22)'); rg.addColorStop(1, 'rgba(217,119,43,0)');
    g.fillStyle = rg; g.fillRect(rx - Rr2, ry - Rr2, Rr2 * 2, Rr2 * 2);
    for (const f of flashes) {
      const [x, y] = proj(f.x, f.y, f.z), u = f.t / f.dur, Rr = f.r * .8 * cam.Z;
      const gr = g.createRadialGradient(x, y, 0, x, y, Rr);
      gr.addColorStop(0, `rgba(255,235,200,${.55 * f.I * (1 - u)})`); gr.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = gr; g.fillRect(x - Rr, y - Rr, Rr * 2, Rr * 2);
    }
    for (const p of parts) {
      if (p.type !== 'spark') continue;
      const [x, y] = proj(p.x, p.y, p.z), u = p.life / p.max;
      g.globalAlpha = 1 - u * .5; g.fillStyle = p.col;
      g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(p.size * cam.Z)), Math.max(1, Math.round(p.size * cam.Z)));
    }
    for (const p of parts) {
      if (p.type !== 'strip') continue;
      const img = S.vfxTint(p), V = VFX[p.key]; if (!img) continue;
      const f = Math.min(V.frames - 1, Math.floor(p.life * p.fps)), u = p.life / p.max;
      const [x, y] = proj(p.x, p.y, p.z), s = p.scale * cam.Z;
      g.save(); g.globalAlpha = clamp(1 - u, 0, 1); g.translate(Math.round(x), Math.round(y)); g.rotate(p.ang); g.scale(s, s * (p.squash || 1));
      g.drawImage(img, (f % V.cols) * V.fw, ((f / V.cols) | 0) * V.fh, V.fw, V.fh, -V.fw / 2, -V.fh / 2, V.fw, V.fh); g.restore();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    for (const r of rings) {
      const u = r.t / r.dur, Rr = r.maxR * (1 - (1 - u) * (1 - u)), [x, y] = proj(r.x, r.y, 0);
      g.strokeStyle = r.col; g.globalAlpha = (1 - u) * .8; g.lineWidth = Math.max(1, Math.round(r.w * (1 - u) * cam.Z));
      g.beginPath(); g.ellipse(x, y, Rr * cam.Z, Rr * cam.Z * cam.py, 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }
  function render(st: HollowApi) {
    bind(st);
    setCamMatrix();
    const g = sg;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingEnabled = false;
    drawBackdrop(); drawFloor();
    const [ccx, ccy] = w2t(cam.fx, cam.fy);
    const list: any[] = [];
    const pd = depthOf(R.x, R.y), fadeR = 2.6 * TILE;
    const occludes = (wx: number, wy: number) => depthOf(wx, wy) > pd + 8 && Math.hypot(wx - R.x, wy - R.y) < fadeR;
    const fadeWrap = (wx: number, wy: number, fn: () => void) => () => { const a = occludes(wx, wy) ? .3 : 1; if (a < 1) sg.globalAlpha = a; fn(); sg.globalAlpha = 1; };
    const cr = cullRange();
    const M = S.world.M;
    for (let j = clamp(Math.floor(ccy) - cr, 0, MH - 1); j <= clamp(Math.floor(ccy) + cr, 0, MH - 1); j++)
      for (let i = clamp(Math.floor(ccx) - cr, 0, MW - 1); i <= clamp(Math.floor(ccx) + cr, 0, MW - 1); i++) {
        if (M[j][i] !== 1 && M[j][i] !== 3) continue;
        const [wx, wy] = t2w(i + .5, j + .5), sp = proj(wx, wy, 0);
        if (sp[0] < -140 || sp[0] > VW + 140 || sp[1] < -220 || sp[1] > VH + 140) continue;
        if (M[j][i] === 1) {
          let n = 0;
          for (let a = -1; a < 2; a++) for (let b = -1; b < 2; b++) { const yy = j + b, xx = i + a; if (yy >= 0 && xx >= 0 && yy < MH && xx < MW && M[yy][xx] !== 1) n = 1; }
          if (n) list.push({ d: depthOf(wx, wy), f: (() => { const a = i, b = j; return () => drawWall(a, b, occludes(wx, wy)); })() });
        }
        else list.push({ d: depthOf(wx, wy), f: () => drawGate(i, j) });
      }
    for (const b of BRZ) { if (Math.abs(b.tx - ccx) < cr + 1 && Math.abs(b.ty - ccy) < cr + 1) list.push({ d: depthOf(b.x, b.y), f: fadeWrap(b.x, b.y, () => drawBrazier(b)) }); }
    for (const l of S.world.LAMPS) list.push({ d: depthOf(l.x, l.y), f: fadeWrap(l.x, l.y, () => drawLamp(l)) });
    for (const d of S.world.DECOR) {
      if (d.k === 'flat') {
        const img = IMG['prop/' + d.p];
        if (img && img.complete && img.naturalWidth) {
          const k = FLAT_DECAL[d.p] || 1, pts = tilePts(d.i, d.j, k);
          list.push({
            d: depthOf((d.i + .5 - MW / 2) * TILE, (d.j + .5 - MH / 2) * TILE),
            f: (() => { const P = pts; return () => quadBlit(img, 0, 0, img.naturalWidth, img.naturalHeight, P[0], P[1], P[2], P[3]); })(),
          });
        }
      }
      else { list.push({ d: depthOf(d.x, d.y), f: fadeWrap(d.x, d.y, () => { propShadow(d.x, d.y, 8); billboard(d.p, d.x, d.y, BOARD_H[d.p] || 1); }) }); }
    }
    for (const ch of S.CHESTS) { if (!ch.hid) list.push({ d: depthOf(ch.x, ch.y), f: fadeWrap(ch.x, ch.y, () => drawChest(ch)) }); }
    list.push({ d: depthOf(R.x, R.y), f: () => { drawShadow(R); drawEnt(); } });
    S.H.forEach((h: any) => list.push({ d: depthOf(h.x, h.y), f: () => { drawShadow(h); drawFoe(h); } }));
    list.sort((a, b) => a.d - b.d); list.forEach(o => o.f());
    drawFxWorld();
    drawGlow();
    const texts = S.texts;
    texts.forEach((x: any) => {
      const [sx, sy] = proj(x.x, x.y, 0);
      g.globalAlpha = Math.min(1, x.t / x.m * 2);
      g.font = 'italic ' + Math.round(11 * DPRS) + 'px Georgia'; g.fillStyle = '#d8d0bc';
      const w = g.measureText(x.s).width;
      g.fillText(x.s, sx - w / 2, sy - 58 * DPRS - (x.m - x.t) * 10 * DPRS); g.globalAlpha = 1;
    });
    g.fillStyle = '#d8d0bc'; g.font = 'italic ' + Math.round(11 * DPRS) + 'px Georgia'; g.textAlign = 'center';
    if (!S.dead && !S.won && Math.hypot(R.x - REST.x, R.y - REST.y) < 1.6 * TILE) g.fillText('E · rest at the seal', VW / 2, 100 * DPRS);
    for (const ch of S.CHESTS) { if (!ch.o && !ch.hid && Math.hypot(R.x - ch.x, R.y - ch.y) < 1.4 * TILE) g.fillText('E · take ' + ch.s, VW / 2, 100 * DPRS); }
    g.textAlign = 'left';
    g.fillStyle = 'rgba(90,90,96,.9)'; g.font = Math.round(10 * DPRS) + 'px Georgia';
    g.fillText('WASD move   J Cut chain   K Wheel (2 Ash)   Space Veil   E use   L Guard', 10 * DPRS, VH - 8 * DPRS);
    cg.imageSmoothingEnabled = false; cg.globalCompositeOperation = 'source-over'; cg.drawImage(S_, 0, 0);
    const vg = cg.createRadialGradient(VW / 2, VH / 2, VH * .35, VW / 2, VH / 2, Math.max(VW, VH) * .72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    cg.fillStyle = vg; cg.fillRect(0, 0, VW, VH);
  }

  function hud(st: HollowApi) {
    bind(st);
    if (!hpfill) {
      hpfill = $('hpfill'); hpghost = $('hpghost'); hpn = $('hpn'); comboEl = $('combo');
      cn = $('cn'); cl = $('cl'); cs = $('cs'); mvEl = $('mv'); zoneEl = $('zone');
    }
    const hpW = (R.seal / 4 * 100) + '%';
    if (hpW !== lastHpW) { hpfill.style.width = hpW; hpghost.style.width = hpW; lastHpW = hpW; }
    const sealT = '◆'.repeat(Math.max(0, R.seal)) + '◇'.repeat(Math.max(0, 4 - R.seal)) + (R.rev ? ' · holds' : '');
    if (sealT !== lastHpn) { hpn.textContent = sealT; lastHpn = sealT; }
    const on = R.ash > 0 || R.chain > 0; comboEl.classList.toggle('on', on);
    const ct = R.ash + '|' + R.chain;
    if (ct !== lastCombo) {
      lastCombo = ct; cn.textContent = R.ash; cl.textContent = 'ASH';
      cs.textContent = (R.chain > 1 ? 'chain x' + R.chain : '') + (R.chain > 1 ? ' · ' : '') + S.H.length + ' hosts';
    }
    const mv = S.dead ? 'the seal scatters' : S.won ? 'the test is met' : (S.zone || 'Cinder Hall') + ' · find Pell';
    if (mv !== lastMv) { mvEl.innerHTML = '<b>' + mv + '</b>'; lastMv = mv; }
    if (S.zt > 0 && lastZone <= 0) zoneEl.classList.add('on');
    if (S.zt <= 0 && lastZone > 0) zoneEl.classList.remove('on');
    lastZone = S.zt; if (S.zt > 0) zoneEl.textContent = S.zone;
  }


  return { render, hud, bakeAvgs };
}

export type HollowRenderer = ReturnType<typeof createHollowRenderer>;