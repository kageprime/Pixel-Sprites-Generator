// Versus-ring renderer + HUD: iso arena, dressing, fighters, FX, debug.
// Bodies moved verbatim from the legacy page; all live state arrives via
// bind(S) each call (S = DuelApi from sim/duel), canvas host + shell bits via
// deps. Nothing here is owned locally except const art tables.
import { TAU, clamp, wrap, rad, deg, hash } from '../engine/math';
import { $, poly } from '../engine/dom';
import { animFps } from '../engine/moves';
import { VFX } from '../engine/fx';
import {
  setCamMatrix as setCamMatrixBase, proj as projBase,
  depthOf as depthOfBase, rowOf as rowOfBase,
} from '../engine/projection';
import { BRAZ, ARENA_A, ARENA_N, HP_MAX, Fighter, DuelApi, frameIdx } from '../sim/duel';
import { REDUCED_MOTION as RM } from '../engine/env';

const N = ARENA_N;
const A = ARENA_A;
const CELL = 96, AX = 48, AY = 74;

const POSTC = 4.35;
const tileXY = (u: number, v: number): [number, number] => [(u - v) * 32, (u + v) * 32];
const POSTS = [[POSTC, POSTC], [-POSTC, -POSTC], [POSTC, -POSTC], [-POSTC, POSTC]].map(([u, v]) => { const [x, y] = tileXY(u, v); return { x, y }; });
const ROPES = [[0, 2], [0, 3], [1, 2], [1, 3]];
const AUDV = [1, 3, 9, 12, 14, 17, 18, 22];
const CROWD: any[] = [];
for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; CROWD.push({ x: Math.cos(a) * 295, y: Math.sin(a) * 295, v: k % AUDV.length, ph: (k * 2.39) % TAU }); }
for (let k = 0; k < 20; k++) { const a = (k + .5) / 20 * TAU; CROWD.push({ x: Math.cos(a) * 365, y: Math.sin(a) * 365, v: (k * 3 + 1) % AUDV.length, ph: (k * 1.71) % TAU }); }
const BANP = [[198, 198], [-198, -198], [198, -198], [-198, 198]];

export interface DuelGfx {
  sg: any; cg: any; S: any;
  Lc: any; lg: any; Q2: any; q2g: any; Q4: any; q4g: any; Q8: any; q8g: any;
  B1: any; b1g: any; B2: any; b2g: any;
  VW: number; VH: number; baseZoom: number;
}

export interface DuelRenderDeps {
  IMG: Record<string, any>;
  UI: any;
  opt: any;
  getPA: () => string;
  getPB: () => string;
  getSKP: () => [string, string];
  gfx: () => DuelGfx;
}

export function createDuelRenderer(deps: DuelRenderDeps) {
  const { IMG } = deps;
  const UI = deps.UI;
  const opt = deps.opt;
  let S!: DuelApi;
  let P: any, E: any, combo: any, cam: any, dir: any, bot: any, dbg: any;
  let parts: any[], rings: any[], nums: any[], flashes: any[], embers: any[];
  let sg: any, cg: any, S_: any;
  let Lc: any, lg: any, Q2: any, q2g: any, Q4: any, q4g: any, Q8: any, q8g: any;
  let B1: any, b1g: any, B2: any, b2g: any;
  let VW = 0, VH = 0, baseZoom = 1;
  let SKP1 = 'pixel', SKP2 = 'pixel';
  const skinEnt = (e: any) => (e === P ? UI.s1 : UI.s2) === 'toon' ? 'toon/' : '';
  function flick(b: any) { return .82 + .18 * Math.sin(S.tick * .21 + b.ph) * Math.sin(S.tick * .093 + b.ph * 2.3) + .06 * Math.sin(S.tick * .57 + b.ph); }
  let hpfill: any, hpghost: any, hpn: any, comboEl: any, cn: any, cl: any, cs: any, mvEl: any;
  let lastHud = '';
  let lastHpW = '', lastGhW = '', lastHpn = '', lastCombo = '';

  function bind(s: DuelApi) {
    S = s; P = s.P; E = s.E; combo = s.combo; cam = s.cam; dir = s.dir; dbg = s.dbg;
    parts = s.parts; rings = s.rings; nums = s.nums; flashes = s.flashes; embers = s.embers;
    const g = deps.gfx();
    sg = g.sg; cg = g.cg; S_ = g.S;
    Lc = g.Lc; lg = g.lg; Q2 = g.Q2; q2g = g.q2g; Q4 = g.Q4; q4g = g.q4g; Q8 = g.Q8; q8g = g.q8g;
    B1 = g.B1; b1g = g.b1g; B2 = g.B2; b2g = g.b2g;
    VW = g.VW; VH = g.VH; baseZoom = g.baseZoom;
    const sk = deps.getSKP(); SKP1 = sk[0]; SKP2 = sk[1];
  }

  function proj(x: number, y: number, z: number) { return projBase(cam, VW, VH, x, y, z); }
  function setCamMatrix() { setCamMatrixBase(cam); }
  const depthOf = (x: number, y: number) => depthOfBase(cam, x, y);
  const rowOf = (face: number) => rowOfBase(cam, face);

  function drawBackdrop() {
    const g = sg, T = AR();
    const gr = g.createLinearGradient(0, 0, 0, VH);
    for (let i = 0; i < 4; i++) gr.addColorStop(T.skyStops[i], T.sky[i]);
    g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    const sx = VW * T.sunXY[0], sy = VH * T.sunXY[1], R = Math.max(VW, VH) * .32;
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, R);
    sun.addColorStop(0, T.sun[0]); sun.addColorStop(.25, T.sun[1]); sun.addColorStop(1, T.sun[2]);
    g.fillStyle = sun; g.fillRect(0, 0, VW, VH);
    g.fillStyle = T.stands[0]; g.fillRect(0, VH * .6, VW, VH * .09);
    g.fillStyle = T.stands[1]; g.fillRect(0, VH * .69, VW, VH * .07);
    g.fillStyle = T.stands[2]; g.fillRect(0, VH * .76, VW, VH * .24);
    if (T.windows) {
      const cols = 26, rows = 3;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const h = hash(c * 3 + r * 17, arenaId.length);
        if (h < .28) continue;
        const lit = h > .62;
        g.fillStyle = lit ? 'rgba(190,215,255,.75)' : 'rgba(12,16,28,.8)';
        const w = VW / cols;
        g.fillRect(c * w + w * .22, VH * (.615 + r * .045), w * .56, VH * .028);
      }
    }
    if (T.rift) {
      const cx = VW * .5;
      g.fillStyle = '#020306';
      g.beginPath(); g.moveTo(cx - 14, 0);
      for (let y = 0; y <= VH * .62; y += VH * .062) g.lineTo(cx + (hash(y | 0, 7) - .5) * 56, y);
      for (let y = VH * .62; y >= 0; y -= VH * .062) g.lineTo(cx + (hash(y | 0, 13) - .5) * 56 + 18, y);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,122,42,.55)'; g.lineWidth = 2; g.beginPath();
      for (let y = 0; y <= VH * .62; y += VH * .062) { const x = cx + (hash(y | 0, 7) - .5) * 56; y ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.fillStyle = 'rgba(216,224,236,.10)'; g.font = '11px ui-monospace,Menlo,monospace'; g.textAlign = 'center';
      const GL = '§I II III IV V VI Ø 0123456789';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 30; c++) {
        const h = hash(c * 7 + r * 31, arenaId.length); if (h < .55) continue;
        g.fillText(GL[(h * GL.length) | 0], c * VW / 30 + VW / 60, VH * (.12 + r * .05));
      }
    }
  }
  function drawFloor() {
    const g = sg, h = N / 2, T = AR();
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([u, v]) => { const [x, y] = tileXY(u, v); return [x, y]; });
    const cs = proj(0, 0, 0)[1];
    const th = 12 * cam.Z;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const pa = proj(a[0], a[1], 0), pb = proj(b[0], b[1], 0);
      if ((pa[1] + pb[1]) / 2 > cs + 3) {
        g.fillStyle = i % 2 ? T.slab[0] : T.slab[1];
        poly(g, [pa, pb, [pb[0], pb[1] + th], [pa[0], pa[1] + th]]); g.fill();
        g.strokeStyle = T.slabEdge; g.lineWidth = 1; g.beginPath(); g.moveTo(pa[0], pa[1] + .5); g.lineTo(pb[0], pb[1] + .5); g.stroke();
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const u0 = i - h, v0 = j - h;
      const pts = [[u0, v0], [u0 + 1, v0], [u0 + 1, v0 + 1], [u0, v0 + 1]].map(([u, v]) => { const [x, y] = tileXY(u, v); return proj(x, y, 0); });
      const hs = hash(i, j), chk = (i + j) & 1;
      const am = Math.max(Math.abs(u0 + .5), Math.abs(v0 + .5));
      let fill, stroke;
      if (am <= 1) {
        const worn = Math.abs(v0 + .5) <= .5 ? T.mat.worn : 0;
        const l = (chk ? T.mat.l0 : T.mat.l1) - worn + hs * T.mat.hs;
        fill = `rgb(${(l + T.mat.t[0]) | 0},${(l + T.mat.t[1]) | 0},${(l + T.mat.t[2]) | 0})`; stroke = T.mat.stroke;
      } else if (am <= 2) {
        const l = (chk ? T.ring.l0 : T.ring.l1) + hs * T.ring.hs;
        fill = `rgb(${(l * T.ring.m[0]) | 0},${(l * T.ring.m[1]) | 0},${(l * T.ring.m[2]) | 0})`; stroke = T.ring.stroke;
      } else {
        const l = (chk ? T.apron.l0 : T.apron.l1) + hs * T.apron.hs;
        fill = `rgb(${(l + 2) | 0},${(l + 2) | 0},${(l - 12) | 0})`; stroke = T.apron.stroke;
      }
      poly(g, pts); g.fillStyle = fill; g.fill();
      g.strokeStyle = stroke; g.lineWidth = 1; g.stroke();
      if (am > 2 && hs > .55) {
        const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
        const e = (hs * 4) | 0, ex = (pts[e][0] + pts[(e + 1) % 4][0]) / 2, ey = (pts[e][1] + pts[(e + 1) % 4][1]) / 2;
        g.strokeStyle = T.apron.crack; g.beginPath(); g.moveTo(ex, ey); g.lineTo(cx, cy); g.stroke();
      }
    }
    const ringPts = (r: number, n = 72) => { const o: any[] = []; for (let k = 0; k < n; k++) { const a = k / n * TAU; o.push(proj(Math.cos(a) * r, Math.sin(a) * r, 0)); } return o; };
    g.strokeStyle = T.emblem[0]; g.lineWidth = 2;
    poly(g, ringPts(96)); g.stroke();
    g.strokeStyle = T.emblem[1]; g.lineWidth = 1; poly(g, ringPts(70)); g.stroke();
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU + Math.PI / 8;
      const p1 = proj(Math.cos(a) * 70, Math.sin(a) * 70, 0), p2 = proj(Math.cos(a) * 96, Math.sin(a) * 96, 0);
      g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke();
    }
  }
  function drawRingsFloor() {
    const g = sg;
    for (const r of rings) {
      const u = r.t / r.dur, R = r.maxR * (1 - (1 - u) * (1 - u)), [x, y] = proj(r.x, r.y, 0);
      g.strokeStyle = r.col; g.globalAlpha = (1 - u) * .8; g.lineWidth = Math.max(1, Math.round(r.w * (1 - u) * cam.Z));
      g.beginPath(); g.ellipse(x, y, R * cam.Z, R * cam.Z * cam.py, 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }
  function drawShadow(e: Fighter) {
    const [x, y] = proj(e.x, e.y, 0), s = 1 / (1 + Math.max(0, e.z) / 80), Z = cam.Z * s * (1 + cam.pk * clamp(depthOf(e.x, e.y) / A, -1, 1)), V = cam.py / .5;
    sg.globalAlpha = clamp(.35 + .65 * s, 0, 1);
    sg.drawImage(IMG[skinEnt(e) + 'shadow'] || IMG.shadow, Math.round(x - AX * Z), Math.round(y - AY * Z * V), CELL * Z, CELL * Z * V);
    sg.globalAlpha = 1;
  }
  function drawEnt(e: Fighter, pre: string, shk: boolean) {
    const anim = e.anim, key = pre + '/' + anim, sk = skinEnt(e);
    const img = IMG[sk + pre + '/' + cam.pv + anim] || IMG[sk + key] || IMG[pre + '/' + cam.pv + anim] || IMG[key]; if (!img) return;
    let f = e.frame;
    if (f === null || f === undefined) {
      const loop = (anim === 'idle' || anim === 'walk' || anim === 'tumble');
      f = loop ? Math.floor(e.t * animFps(anim)) % 6 : Math.min(5, Math.floor(e.t * animFps(anim)));
    }
    const [x, y] = proj(e.x, e.y, e.z), Z = cam.Z * (1 + cam.pk * clamp(depthOf(e.x, e.y) / A, -1, 1));
    if (e === P && cam.ch > .2 && Math.abs(x - proj(E.x, E.y, E.z)[0]) < 34 && depthOf(P.x, P.y) > depthOf(E.x, E.y)) sg.globalAlpha = 1 - .3 * cam.ch;
    let ox = 0, oy = 0, pop = 1;
    if (shk && S.hitstop > 0 && E.shk > 0) { ox = (S.tick & 1 ? 1 : -1) * 2 * Z; oy = 0; pop = 1 + .12 * Math.min(1, S.hitstop / 8); }
    const C = img.width / 6, k = C >= 190 ? 2 : 1, c = C / k, ax = c / 2, ay = c > 100 ? 100 : 74;
    sg.imageSmoothingEnabled = k > 1; sg.drawImage(img, f * C, rowOf(e.face) * C, C, C, Math.round(x - ax * Z * pop + ox), Math.round(y - ay * Z * pop + oy), c * Z * pop, c * Z * pop); sg.imageSmoothingEnabled = false; sg.globalAlpha = 1;
  }
  function drawBrazier(b: any) {
    const g = sg, [x, y] = proj(b.x, b.y, 0), Z = cam.Z, X = Math.round(x), Y = Math.round(y);
    const r = (a: number, bb: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(X + a * Z), Math.round(Y + bb * Z), Math.max(1, Math.round(w * Z)), Math.max(1, Math.round(h * Z))); };
    const D = AR().dress;
    if (D && D.braz === 'vent') {
      const fl = flick(b), F = AR().flame;
      r(-11, -4, 22, 4, '#1c1c22'); r(-8, -7, 16, 3, '#2a2a32'); r(-5, -9, 10, 2, '#3a2a20');
      r(-3, -44 * fl, 6, 38 * fl, F[0]); r(-2, -52 * fl, 4, 46 * fl, F[1]); r(-1, -58 * fl, 2, 52 * fl, F[2]);
      return;
    }
    r(-6, -3, 12, 3, '#232733'); r(-4, -18, 8, 15, '#3a4050'); r(-3, -18, 2, 15, '#4a5164');
    r(-9, -24, 18, 3, '#2c313f'); r(-8, -27, 16, 3, '#434a5c'); r(-7, -28, 14, 1, '#5a6277'); r(-6, -26, 12, 2, '#14161d');
    const fl = flick(b), F = AR().flame;
    r(-4, -32 * fl - 0, 8, 6 * fl, F[0]); r(-3, -37 * fl, 6, 8 * fl, F[1]); r(-1.5, -41 * fl, 3, 6 * fl, F[2]);
  }
  function drawPost(p: any, i: number) {
    const g = sg, [x, y] = proj(p.x, p.y, 0), Z = cam.Z, X = Math.round(x), Y = Math.round(y);
    const D = AR().dress;
    if (D && D.post === 'pillar') {
      const H = Math.round((96 + ((i * 53) % 56)) * Z), Wd = Math.max(2, Math.round(14 * Z));
      g.fillStyle = '#33333b'; g.fillRect(Math.round(X - Wd / 2), Math.round(Y - H), Wd, H);
      g.fillStyle = '#43434e'; g.fillRect(Math.round(X - Wd / 2), Math.round(Y - H), Math.max(1, Math.round(Wd * .35)), H);
      g.fillStyle = '#33333b';
      g.fillRect(Math.round(X - Wd / 2), Math.round(Y - H - 7 * Z), Math.round(Wd * .6), Math.round(7 * Z));
      g.fillRect(Math.round(X + Wd * .1), Math.round(Y - H - 11 * Z), Math.round(Wd * .4), Math.round(11 * Z));
      g.fillStyle = AR().postCap; g.fillRect(Math.round(X - Wd / 2), Math.round(Y - H - 11 * Z), Wd, Math.max(1, Math.round(2 * Z)));
      g.fillStyle = 'rgba(220,228,240,.75)'; g.fillRect(Math.round(X - 1 * Z), Math.round(Y - H * .55), Math.max(1, Math.round(2 * Z)), Math.round(14 * Z));
      return;
    }
    const H = Math.round(86 * Z), Wd = Math.max(2, Math.round(11 * Z));
    g.fillStyle = '#4a3220'; g.fillRect(Math.round(X - Wd / 2), Math.round(Y - H), Wd, H);
    g.fillStyle = '#6b4a2e'; g.fillRect(Math.round(X - Wd / 2), Math.round(Y - H), Math.max(1, Math.round(Wd * .4)), H);
    g.fillStyle = AR().postCap; g.fillRect(Math.round(X - Wd / 2 - 2 * Z), Math.round(Y - H - 8 * Z), Math.round(Wd + 4 * Z), Math.round(8 * Z));
  }
  function drawRope(a: any, b: any, z: number, col: string) {
    const g = sg; g.strokeStyle = col; g.lineWidth = Math.max(1, Math.round(3 * cam.Z));
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, sag = Math.sin(t * Math.PI) * -5;
      const [x, y] = proj(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z + sag);
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  function drawCrowd(c: any) {
    const D = AR().dress;
    if (D && D.crowd === 'host') {
      const g = sg, Z = cam.Z * (1 + cam.pk * clamp(depthOf(c.x, c.y) / A, -1, 1));
      const br = RM ? 0 : Math.sin(S.tick * .03 + c.ph) * .015 + .015;
      const [x, y] = proj(c.x, c.y, 0), w = 44 * Z * (1 + br), h = 64 * Z * (1 + br);
      g.fillStyle = '#0b0b0e';
      g.fillRect(Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
      g.beginPath(); g.arc(Math.round(x), Math.round(y - h), Math.round(w * .28), 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,220,170,.9)';
      g.fillRect(Math.round(x - w * .12), Math.round(y - h - w * .3), Math.max(1, Math.round(2 * Z)), Math.max(1, Math.round(2 * Z)));
      g.fillRect(Math.round(x + w * .12) - Math.max(1, Math.round(2 * Z)), Math.round(y - h - w * .3), Math.max(1, Math.round(2 * Z)), Math.max(1, Math.round(2 * Z)));
      return;
    }
    const fr = (Math.floor(S.tick / 28 + c.ph) % 2) ? 'b' : 'a';
    const img = IMG['arena/aud' + String(AUDV[c.v]).padStart(2, '0') + '_' + fr]; if (!img) return;
    const Z = cam.Z * (1 + cam.pk * clamp(depthOf(c.x, c.y) / A, -1, 1));
    const bounce = RM ? 0 : Math.abs(Math.sin(S.tick * .09 + c.ph)) * 4 * Z;
    const [x, y] = proj(c.x, c.y, 0), w = 64 * Z, h = 64 * Z;
    sg.drawImage(img, Math.round(x - w / 2), Math.round(y - h - bounce), Math.round(w), Math.round(h));
  }
  function drawBannerPole(p: any, i: number) {
    const g = sg, [x, y] = proj(p.x, p.y, 0), Z = cam.Z;
    const H = Math.round(150 * Z), Wd = Math.max(2, Math.round(7 * Z));
    g.fillStyle = '#3d3f4d'; g.fillRect(Math.round(x - Wd / 2), Math.round(y - H), Wd, H);
    const D = AR().dress;
    if (D && D.banner === 'seal') {
      const sway = RM ? 0 : Math.sin(S.tick * .04 + i * 1.7) * 2 * Z;
      const w = Math.round(56 * Z), h = Math.round(104 * Z);
      g.fillStyle = 'rgba(216,224,236,.92)'; g.fillRect(Math.round(x - w / 2), Math.round(y - H + sway), w, h);
      g.fillStyle = '#2a2f3d'; g.font = `700 ${Math.max(8, Math.round(30 * Z))}px Georgia,serif`; g.textAlign = 'center';
      g.fillText(['I', 'II', 'III', 'Ø'][i % 4], Math.round(x), Math.round(y - H + h * .62 + sway));
      return;
    }
    const img = IMG['arena/banner' + (i % 4)]; if (!img) return;
    const sway = RM ? 0 : Math.sin(S.tick * .05 + i * 1.7) * 3 * Z;
    const w = Math.round(110 * Z), h = Math.round(55 * Z);
    g.drawImage(img, Math.round(x - w / 2), Math.round(y - H + sway), w, h);
  }
  function drawFxWorld() {
    const g = sg;
    for (const p of parts) {
      if (p.type !== 'dust') continue;
      const [x, y] = proj(p.x, p.y, p.z), u = p.life / p.max;
      g.globalAlpha = (1 - u) * .5; g.fillStyle = '#aab2c4';
      const r = p.size * (1 + u * .8) * cam.Z; g.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), Math.max(1, Math.round(r)), Math.max(1, Math.round(r)));
    }
    g.globalAlpha = 1;
  }
  function drawLights() {
    const k = Lc.width / VW, g = lg;
    g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgb(172,176,192)'; g.fillRect(0, 0, Lc.width, Lc.height);
    g.globalCompositeOperation = 'lighter';
    const L = (wx: number, wy: number, wz: number, r: number, c: string, i: number, sq = .62, lift = 10) => {
      const [x, y] = proj(wx, wy, wz), R = r * cam.Z * k;
      g.save(); g.translate(x * k, (y - lift * cam.Z) * k); g.scale(1, sq);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, `rgba(${c},${i})`); gr.addColorStop(.5, `rgba(${c},${i * .4})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(-R, -R, R * 2, R * 2); g.restore();
    };
    L(0, 0, 0, 380, AR().centerLight, .55, .66, 0);
    for (const b of BRAZ) L(b.x * .97, b.y * .97, 22, 230, AR().brazLight, .9 * flick(b), .7, 0);
    L(P.x, P.y, P.z * .5, 92, '130,175,255', .38, .7, 16);
    L(E.x, E.y, E.z * .5, 86, '255,140,80', .3, .7, 16);
    for (const f of flashes) { const u = f.t / f.dur; L(f.x, f.y, f.z * .4, f.r * (1 + u * .4), f.col.join(','), f.I * (1 - u), .8, 10); }
    sg.globalCompositeOperation = 'multiply'; sg.imageSmoothingEnabled = true;
    sg.drawImage(Lc, 0, 0, VW, VH);
    sg.imageSmoothingEnabled = false; sg.globalCompositeOperation = 'source-over';
  }
  function drawGlow() {
    const g = sg;
    g.globalCompositeOperation = 'lighter';
    for (const b of BRAZ) {
      const [x, y] = proj(b.x, b.y, 34), R = 44 * cam.Z, fl = flick(b), BG = AR().brazGlow;
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(${BG[0]},${.34 * fl})`); gr.addColorStop(1, `rgba(${BG[1]},0)`);
      g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
    }
    for (const f of flashes) {
      const [x, y] = proj(f.x, f.y, f.z), u = f.t / f.dur, R = f.r * .8 * cam.Z;
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(255,235,200,${.55 * f.I * (1 - u)})`); gr.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
    }
    for (const p of parts) {
      if (p.type !== 'strip') continue;
      const img = S.vfxTint(p), V = VFX[p.key]; if (!img) continue;
      const f = Math.min(V.frames - 1, Math.floor(p.life * p.fps)), u = p.life / p.max;
      const [x, y] = proj(p.x, p.y, p.z), s = p.scale * cam.Z;
      g.save(); g.globalAlpha = clamp(1 - u, 0, 1); g.translate(Math.round(x), Math.round(y)); g.rotate(p.ang); g.scale(s, s * (p.squash || 1));
      g.drawImage(img, (f % V.cols) * V.fw, ((f / V.cols) | 0) * V.fh, V.fw, V.fh, -V.fw / 2, -V.fh / 2, V.fw, V.fh); g.restore();
    }
    g.globalAlpha = 1;
    for (const r of rings) {
      const u = r.t / r.dur, R = r.maxR * (1 - (1 - u) * (1 - u)), [x, y] = proj(r.x, r.y, 0);
      g.strokeStyle = 'rgba(255,210,150,' + (1 - u) * .55 + ')'; g.lineWidth = Math.max(1, Math.round(3 * (1 - u) * cam.Z));
      g.beginPath(); g.ellipse(x, y, R * cam.Z, R * cam.Z * cam.py, 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
    for (const e of embers) {
      const [x, y] = proj(e.x, e.y, e.z), a = Math.sin(e.z / 170 * Math.PI) * .7;
      g.fillStyle = `rgba(${AR().ember},${a})`; g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    for (const p of parts) {
      if (p.type === 'dust') continue;
      const [x, y] = proj(p.x, p.y, p.z), u = p.life / p.max;
      if (p.type === 'spark') {
        g.fillStyle = p.col; g.globalAlpha = 1 - u * .8;
        const [x2, y2] = proj(p.x - p.vx * .025, p.y - p.vy * .025, p.z - p.vz * .025);
        g.strokeStyle = p.col; g.lineWidth = Math.max(1, Math.round(p.size * cam.Z));
        g.beginPath(); g.moveTo(Math.round(x2), Math.round(y2)); g.lineTo(Math.round(x), Math.round(y)); g.stroke();
        g.globalAlpha = 1;
      } else if (p.type === 'flare') {
        const R = p.size * (1 - u * .4) * cam.Z; g.fillStyle = `rgba(255,248,225,${1 - u})`;
        g.fillRect(Math.round(x - R), Math.round(y - 1), Math.round(R * 2), 2); g.fillRect(Math.round(x - 1), Math.round(y - R), 2, Math.round(R * 2));
        g.fillRect(Math.round(x - R * .5), Math.round(y - R * .5), Math.round(R), Math.round(R));
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.font = 'bold ' + Math.round(10 * Math.max(1, cam.Z)) + 'px ui-monospace,Menlo,monospace'; g.textAlign = 'center';
    for (const n of nums) {
      const [x, y] = proj(n.x, n.y, n.z + n.t * 26), a = n.t < .6 ? 1 : 1 - (n.t - .6) / .3;
      g.globalAlpha = a; g.lineWidth = 3; g.strokeStyle = '#14161d'; g.strokeText(n.text, Math.round(x), Math.round(y));
      g.fillStyle = n.col; g.fillText(n.text, Math.round(x), Math.round(y));
    }
    g.globalAlpha = 1;
  }
  function drawDebug() {
    const g = sg;
    const [ex, ey] = proj(E.x, E.y, 0);
    g.strokeStyle = 'rgba(90,220,140,.9)'; g.lineWidth = 1; g.beginPath(); g.ellipse(ex, ey, 14 * cam.Z, 7 * cam.Z, 0, 0, TAU); g.stroke();
    const [ez0, ez1] = [proj(E.x, E.y, E.z), proj(E.x, E.y, E.z + 40)];
    g.beginPath(); g.moveTo(ez0[0], ez0[1]); g.lineTo(ez1[0], ez1[1]); g.stroke();
    if (dbg.cone) {
      const c = dbg.cone, pts = [proj(c.x, c.y, 0)];
      const n = c.arc >= 360 ? 48 : 14;
      for (let i = 0; i <= n; i++) { const a = rad(c.arc >= 360 ? i / n * 360 : c.face - c.arc + 2 * c.arc * i / n); pts.push(proj(c.x + Math.cos(a) * c.reach, c.y + Math.sin(a) * c.reach, 0)); }
      g.fillStyle = 'rgba(255,70,70,.25)'; g.strokeStyle = 'rgba(255,110,110,.9)'; poly(g, c.arc >= 360 ? pts.slice(1) : pts); g.fill(); g.stroke();
    }
    g.font = '10px ui-monospace,Menlo,monospace'; g.textAlign = 'left'; g.fillStyle = '#d6dae6';
    const L = [`Bram  ${P.state}  ${P.slot || P.anim}  f${P.state === 'atk' || P.state === 'airatk' || P.state === 'plunge' ? frameIdx(P) + 1 : '-'}  z${P.z.toFixed(0)}  air${P.airCount}`,
      `Cinder ${E.state}${E.kd ? '/' + E.kd.phase : ''}  z${E.z.toFixed(0)}  vz${E.vz.toFixed(0)}  juggle${E.juggle}`,
      `hitstop ${S.hitstop}  cam ${wrap(cam.target)}°  zoom ${cam.zoom.toFixed(2)}  auto ${opt.autocam ? (dir.pause > 0 ? 'paused' : 'on') : 'off'} q${dir.cur.toFixed(2)} cd ${(Math.max(0, 90 - (S.tick - dir.last)) / 60).toFixed(1)}s ${dir.latch ? 'LATCH ' : ''}last ${dir.why}`];
    L.forEach((t, i) => { g.fillText(t, 8, VH - 44 + i * 12); });
    {
      const cx = VW - 40, cy = 44; g.save();
      for (let i = 0; i < 8; i++) { const a = rad(i * 45 - 90), r = 6 + Math.max(0, dir.sc[i]) * 24, on = i * 45 === wrap(cam.target); g.strokeStyle = on ? '#ffd37a' : 'rgba(214,218,230,.7)'; g.lineWidth = on ? 3 : 1; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
      g.fillStyle = '#d6dae6'; g.textAlign = 'right'; dir.log.slice(-3).forEach((t, i) => g.fillText(t, VW - 8, VH - 74 + i * 12)); g.restore();
    }
    if (P.move && (P.state === 'atk' || P.state === 'airatk' || P.state === 'plunge')) {
      const m = P.move, fps = animFps(P.anim), f = frameIdx(P), w = 26, h = 9, x0 = Math.round(VW / 2 - 3 * w), y0 = VH - 22;
      for (let i = 0; i < 6; i++) {
        const hit = m.hit_frames.includes(i), start = i < m.hit_frames[0];
        g.fillStyle = hit ? '#e0524b' : start ? '#4d78b0' : '#555b6b'; g.fillRect(x0 + i * w, y0, w - 2, h);
        if (i >= m.cancel_from) { g.fillStyle = '#53c27d'; g.fillRect(x0 + i * w, y0 + h + 1, w - 2, 2); }
      }
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x0 + f * w - .5, y0 - 1.5, w - 1, h + 2);
      g.fillStyle = '#d6dae6'; g.textAlign = 'center'; g.fillText(`${m.name}  startup ${m.startup}  cancel ${m.cancel_from}  (${fps}fps)`, VW / 2, y0 - 5);
    }
  }
  function render(s: DuelApi) {
    bind(s);
    setCamMatrix();
    sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1; sg.imageSmoothingEnabled = false;
    drawBackdrop(); drawFloor(); drawRingsFloor();
    drawShadow(P); drawShadow(E);
    const list = [
      { d: depthOf(P.x, P.y), f: () => drawEnt(P, deps.getPA(), false) },
      { d: depthOf(E.x, E.y), f: () => drawEnt(E, deps.getPB(), true) },
    ];
    for (const b of BRAZ) list.push({ d: depthOf(b.x, b.y), f: () => drawBrazier(b) });
    POSTS.forEach((p, i) => list.push({ d: depthOf(p.x, p.y), f: () => drawPost(p, i) }));
    for (const [ia, ib] of ROPES) {
      const a = POSTS[ia], b = POSTS[ib], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (!AR().dress || AR().dress.ropes !== false) list.push({ d: depthOf(mx, my), f: () => { drawRope(a, b, 64, AR().ropes[0]); drawRope(a, b, 46, AR().ropes[1]); } });
    }
    for (const c of CROWD) list.push({ d: depthOf(c.x, c.y), f: () => drawCrowd(c) });
    BANP.forEach(([x, y], i) => list.push({ d: depthOf(x, y), f: () => drawBannerPole({ x, y }, i) }));
    list.sort((a, b) => a.d - b.d); list.forEach((o) => o.f());
    drawFxWorld();
    if (opt.light) drawLights();
    drawGlow();
    if (opt.debug) drawDebug();
    composite();
  }
  function maskBlur(g: any, fx: number, fy: number, r0: number, r1: number) {
    g.globalCompositeOperation = 'destination-in';
    g.setTransform(1.7, 0, 0, 1, fx * (1 - 1.7), 0);
    const gr = g.createRadialGradient(fx, fy, r0, fx, fy, r1);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(-2000, -2000, 5000, 5000);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
  }
  function composite() {
    cg.imageSmoothingEnabled = false; cg.globalCompositeOperation = 'source-over';
    cg.drawImage(S_, 0, 0);
    if (opt.dof) {
      q2g.imageSmoothingEnabled = true; q4g.imageSmoothingEnabled = true; q8g.imageSmoothingEnabled = true;
      q2g.drawImage(S_, 0, 0, Q2.width, Q2.height); q4g.drawImage(Q2, 0, 0, Q4.width, Q4.height); q8g.drawImage(Q4, 0, 0, Q8.width, Q8.height);
      const mid = proj((P.x + E.x) / 2, (P.y + E.y) / 2, 10);
      const fx = mid[0], fy = mid[1], k = 1 - cam.fk * .4;
      b1g.globalCompositeOperation = 'source-over'; b1g.clearRect(0, 0, VW, VH); b1g.imageSmoothingEnabled = true; b1g.drawImage(Q4, 0, 0, VW, VH);
      maskBlur(b1g, fx, fy, 95 * k, 205 * k);
      b2g.globalCompositeOperation = 'source-over'; b2g.clearRect(0, 0, VW, VH); b2g.imageSmoothingEnabled = true; b2g.drawImage(Q8, 0, 0, VW, VH);
      maskBlur(b2g, fx, fy, 175 * k, 300 * k);
      cg.imageSmoothingEnabled = true; cg.drawImage(B1, 0, 0); cg.drawImage(B2, 0, 0); cg.imageSmoothingEnabled = false;
    }
    if (dir.flash > 0) { cg.fillStyle = 'rgba(255,244,225,' + (dir.flash / 8 * .14) + ')'; cg.fillRect(0, 0, VW, VH); }
    if (dir.bar > 0) { const e = Math.min(1, (54 - dir.bar) / 8, dir.bar / 14), h = Math.round(VH * .07 * e); cg.fillStyle = '#000'; cg.fillRect(0, 0, VW, h); cg.fillRect(0, VH - h, VW, h); }
    const vg = cg.createRadialGradient(VW / 2, VH / 2, VH * .35, VW / 2, VH / 2, Math.max(VW, VH) * .72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    cg.fillStyle = vg; cg.fillRect(0, 0, VW, VH);
  }

  function hud(s: DuelApi) {
    bind(s);
    if (!hpfill) {
      hpfill = $('hpfill'); hpghost = $('hpghost'); hpn = $('hpn'); comboEl = $('combo');
      cn = $('cn'); cl = $('cl'); cs = $('cs'); mvEl = $('mv');
    }
    const hp = E.hp / HP_MAX;
    const hpW = (hp * 100).toFixed(1) + '%', ghW = (E.hpShown / HP_MAX * 100).toFixed(1) + '%';
    if (hpW !== lastHpW) { hpfill.style.width = hpW; lastHpW = hpW; }
    if (ghW !== lastGhW) { hpghost.style.width = ghW; lastGhW = ghW; }
    const hpnT = String(Math.round(E.hp));
    if (hpnT !== lastHpn) { hpn.textContent = hpnT; lastHpn = hpnT; }
    const on = combo.hits > 0;
    comboEl.classList.toggle('on', on && combo.hits > 1);
    const alive = combo.active || S.tick - combo.endT <= 75;
    const comboT = combo.hits + '|' + (combo.hits === 1) + '|' + combo.dmg + '|' + combo.air + '|' + alive;
    if (comboT !== lastCombo) {
      lastCombo = comboT;
      cn.textContent = combo.hits; cl.textContent = combo.hits === 1 ? 'HIT' : 'HITS';
      cs.textContent = combo.dmg + ' damage' + (combo.air ? '  ·  air ' + combo.air : '') + (alive ? '' : '  ·  done');
    }
    const txt = combo.chain.length ? combo.chain.map((c, i) => i === combo.chain.length - 1 ? '<b>' + c + '</b>' : c).join(' › ') : '';
    if (txt !== lastHud) { mvEl.innerHTML = txt; lastHud = txt; }
  }

  return { render, hud };
}

/* ---------- arenas: day tournament + heavens tower (night interior) ----------
   Dressing positions (BRAZ/POSTS/CROWD/BANP) are shared so the camera director
   scores identically on both; only the palette and backdrop change. */
export const ARENAS: Record<string, any> = {
  day:{label:'Day Tournament',sky:['#1e6cc0','#57aae6','#bcdcf2','#e6d3a8'],skyStops:[0,.5,.75,1],
    sun:['rgba(255,252,230,.9)','rgba(255,246,205,.35)','rgba(255,246,205,0)'],sunXY:[.78,.18],
    stands:['rgba(125,138,160,.85)','rgba(105,118,142,.9)','rgba(234,240,244,.5)'],windows:false,
    mat:{l0:198,l1:206,worn:14,hs:6,t:[0,-8,-38],stroke:'#8a8468'},
    ring:{m:[.72,.95,1.55],l0:58,l1:68,hs:8,stroke:'#2c3a5e'},
    apron:{l0:120,l1:133,hs:7,stroke:'#6b6a5e',crack:'rgba(70,68,58,.55)'},
    emblem:['rgba(150,84,24,.6)','rgba(150,84,24,.35)'],slab:['#a09c8e','#8f8b7d'],slabEdge:'#c9c4b2',
    flame:['#ff7a2a','#ffb347','#fff0b0'],brazLight:'255,150,70',brazGlow:['255,160,70','255,120,40'],
    centerLight:'255,244,220',ember:'255,170,90',postCap:'#2c3a5e',ropes:['#c8483c','#e8e0cc']},
  heavens:{label:'Heavens Tower',sky:['#05070f','#0b1226','#1a2440','#2a3350'],skyStops:[0,.55,.8,1],
    sun:['rgba(190,210,255,.55)','rgba(150,180,240,.18)','rgba(150,180,240,0)'],sunXY:[.78,.18],
    stands:['rgba(30,36,52,.92)','rgba(24,29,44,.95)','rgba(40,48,70,.55)'],windows:true,
    mat:{l0:168,l1:176,worn:10,hs:6,t:[-16,-8,14],stroke:'#5a6278'},
    ring:{m:[.45,1.0,1.35],l0:52,l1:62,hs:8,stroke:'#1d2c47'},
    apron:{l0:74,l1:84,hs:7,stroke:'#3a3f52',crack:'rgba(20,22,32,.6)'},
    emblem:['rgba(120,180,230,.55)','rgba(120,180,230,.3)'],slab:['#4a5068','#3e4459'],slabEdge:'#7a86a8',
    flame:['#7ab8ff','#cfe6ff','#ffffff'],brazLight:'150,190,255',brazGlow:['150,190,255','120,150,255'],
    centerLight:'200,215,255',ember:'150,190,255',postCap:'#1d2438',ropes:['#3fa8c8','#dfe9f2']},
  hollow:{label:'Ash Hollow',sky:['#030408','#0a0c14','#141821','#1e222e'],skyStops:[0,.5,.8,1],
    sun:['rgba(255,122,42,.5)','rgba(255,122,42,.16)','rgba(255,122,42,0)'],sunXY:[.5,.42],
    stands:['rgba(16,18,26,.95)','rgba(12,14,22,.97)','rgba(26,28,38,.6)'],windows:false,rift:true,
    mat:{l0:96,l1:104,worn:8,hs:6,t:[-6,-6,-4],stroke:'#43434a'},
    ring:{m:[1.25,.62,.3],l0:64,l1:74,hs:8,stroke:'#4a2418'},
    apron:{l0:52,l1:60,hs:7,stroke:'#2c2c33',crack:'rgba(255,122,42,.5)'},
    emblem:['rgba(220,228,240,.5)','rgba(220,228,240,.28)'],slab:['#33333b','#2b2b32'],slabEdge:'#5a5a64',
    flame:['#ff5a1e','#ff8a3c','#ffd9a0'],brazLight:'255,120,50',brazGlow:['255,130,60','255,90,30'],
    centerLight:'255,220,190',ember:'255,140,70',postCap:'#3d3a44',ropes:['#3fa8c8','#dfe9f2'],
    dress:{braz:'vent',post:'pillar',ropes:false,crowd:'host',banner:'seal'}}
};
let arenaId = 'day';
export const AR = () => ARENAS[arenaId] || ARENAS.day;
export function setArena(id: string) { if (ARENAS[id]) { arenaId = id; try { localStorage.setItem('vs_arena', id); } catch (e) {} } }
export function getArenaId() { return arenaId; }

export type DuelRenderer = ReturnType<typeof createDuelRenderer>;
