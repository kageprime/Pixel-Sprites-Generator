// Versus-ring simulation: fighters, dummy AI, camera director, combos.
// Owned by createDuel() — each call gets isolated state (multi-instance,
// testable). Cross-cutting page services arrive via deps and are read live:
//   IMG/opt      mutable refs owned by the shell (sprite loading, settings)
//   getPA()      current P1 fighter id (shell-owned roster pick)
//   getView()    {baseZoom, vw} for director edge scoring (shell-owned canvas)
//   project()    world->screen for VFX angles (shell-owned projection)
//   onResult()   fight-over callback (shell overlay)
import { TAU, TICK, rad, deg, wrap, snap8, angDiff, clamp, lerp, rnd } from '../engine/math';
import { META, MOVE, STYLE, animFps, CHAIN_NEXT } from '../engine/moves';
import { createFx, EL } from '../engine/fx';
import { $ } from '../engine/dom';
import { snd } from '../engine/audio';
import { REDUCED_MOTION as RM } from '../engine/env';

export const ARENA_N = 7;
export const ARENA_A = 32 * ARENA_N;

export const G_PLAYER = 1500, JUMP_VZ = 410, SPEED = 112, AIR_SPEED = 96, AIR_MAX = 3, BUF_TICKS = 18;
export const E_GRAV = 900, E_JUGGLE_SCALE = 0.12, E_BOUNCE_G = 1100, HP_MAX = 2000;

export const BRAZ = [[4.05, 4.05], [-4.05, -4.05], [4.05, -4.05], [-4.05, 4.05]].map(([u, v], i) => {
  const x = (u - v) * 32, y = (u + v) * 32;
  return { x, y, ph: i * 1.7 };
});

export interface Fighter {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  face: number; anim: string; t: number;
  frame: any; state: string;
  [k: string]: any;
}

export interface DuelDeps {
  IMG: Record<string, any>;
  opt: { fx: boolean; [k: string]: any };
  getPA: () => string;
  getView: () => { baseZoom: number; vw: number };
  project: (x: number, y: number, z: number) => [number, number];
  onResult: () => void;
}

export function setAnim(e: Fighter, a: string): void { if (e.anim !== a) { e.anim = a; e.t = 0; } }
export function frameIdx(e: Fighter): number { return Math.min(5, Math.floor(e.t * animFps(e.anim))); }

const mkEnt = (): Fighter => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, face: 0, anim: 'idle', t: 0, state: 'idle', frame: null });

export function createDuel(deps: DuelDeps) {
  const { IMG, opt } = deps;
  let tick = 0, hitstop = 0;
  const input = { keys: new Set<string>(), buf: [] as Array<{ a: string; t: number }>, touchMove: { x: 0, y: 0 } };
  const { keys, buf } = input;
  const P: Fighter = mkEnt(), E: Fighter = mkEnt();
  P.state = 'ground'; P.airCount = 0; P.plunged = false; P.hitDone = new Set(); P.slot = null; P.move = null; P.cur = null;
  E.hp = HP_MAX; E.hpShown = HP_MAX; E.juggle = 0; E.stunT = 0; E.spiked = false; E.launchT = 0; E.kd = null; E.shk = 0; E.bounceSlam = false;
  const combo = { hits: 0, dmg: 0, air: 0, max: 0, active: false, endT: 0, show: 0, lastName: '', chain: [] as string[] };
  const cam: any = { pv: '', py: .5, pt: .5, pk: 0, pkt: 0, ch: 0, fz: 0, ang: 0, target: 0, zoom: 1, zv: 0, fx: 0, fy: 0, fk: 0, shake: 0, shx: 0, shy: 0, c: 1, s: 0, frx: 0, fry: 0, Z: 1 };
  const fx = createFx(opt, IMG);
  const { parts, rings, nums, flashes, spark, dust, flare, ring, flash, num, updateFx, vfxTint, stripFx } = fx;
  const embers: any[] = [];
  const dbg: any = { cone: null, t: 0 };
  const bot = { on: false, st: 'wait', timer: 0, cool: 0, mv: { x: 0, y: 0 } };
  const dir: any = { shot: 0, chT: 0, chBest: 0, tw: null, tH: 12, tL: 16, q: null, qT: 0, last: -1e9, lastPri: 0, pause: 0, grace: 0, latch: null, bad: 0, bar: 0, flash: 0, cur: 1, why: '-', sc: new Array(8).fill(0), log: [] as string[], beats: { plunge: 1, launcher: 1, heavy: 1, knock: 1, neutral: 1 } };
  let fsHits = 0, fsDmg = 0, fightStart = 0;
  const PRI: any = { plunge: 3, launcher: 3, heavy: 2, knock: 2, neutral: 1, chase: 1 };

  function resetAll() {
    E.dead = false; fightStart = tick; fsHits = 0; fsDmg = 0;
    Object.assign(P, mkEnt(), { x: -64, y: -6, face: 0, state: 'ground', airCount: 0, plunged: false, slot: null, move: null });
    P.hitDone = new Set();
    Object.assign(E, mkEnt(), { x: 44, y: 14, face: 180, hp: HP_MAX, hpShown: HP_MAX, juggle: 0, stunT: 0, spiked: false, launchT: 0, kd: null, shk: 0 });
    combo.hits = combo.dmg = combo.air = 0; combo.active = false; combo.show = 0; combo.chain = [];
    parts.length = rings.length = nums.length = flashes.length = 0; buf.length = 0; hitstop = 0;
    dir.q = null; dir.tw = null; dir.shot = 0; dir.latch = null; dir.last = -1e9; dir.pause = dir.grace = dir.bar = dir.flash = 0;
  }
  for (let i = 0; i < 34; i++) embers.push({ x: rnd(-ARENA_A * .9, ARENA_A * .9), y: rnd(-ARENA_A * .9, ARENA_A * .9), z: rnd(0, 150), s: rnd(6, 16), ph: rnd(TAU) });

  function arenaClamp(e: Fighter, r: number) {
    const lim = ARENA_A - r * 1.5; let hit = false;
    const u = e.x + e.y, v = e.y - e.x;
    if (u > lim) { const d = u - lim; e.x -= d / 2; e.y -= d / 2; hit = true; }
    else if (u < -lim) { const d = u + lim; e.x -= d / 2; e.y -= d / 2; hit = true; }
    if (v > lim) { const d = v - lim; e.y -= d / 2; e.x += d / 2; hit = true; }
    else if (v < -lim) { const d = v + lim; e.y -= d / 2; e.x += d / 2; hit = true; }
    if (hit) { e.vx *= .4; e.vy *= .4; }
    return hit;
  }
  const dirVec = (a: number) => ({ x: Math.cos(rad(a)), y: Math.sin(rad(a)) });
  function faceToward(e: Fighter, o: Fighter) { e.face = snap8(deg(Math.atan2(o.y - e.y, o.x - e.x))); }
  const distPE = () => Math.hypot(E.x - P.x, E.y - P.y);

  function shakeCam(a: number) { cam.shake = Math.min(1, Math.max(cam.shake, a)); }
  function pushIn(a: number) { if (opt.push && a > 0) cam.zv += a * 40; }
  function focusKick(a: number) { cam.fk = Math.max(cam.fk, a); }

  function directorBeat(n: string) { if (dir.beats[n] && (!dir.q || PRI[n] >= PRI[dir.q])) { dir.q = n; dir.qT = tick; } }
  function quality(th: number) {
    const a = rad(th), c = Math.cos(a), s = Math.sin(a), dx = E.x - P.x, dy = E.y - P.y, d = Math.hypot(dx, dy) || 1;
    const rx = dx * c - dy * s, ry = (dx * s + dy * c) * .5 - (E.z - P.z);
    const side = Math.abs(rx) / d;
    const ov = clamp((44 - Math.abs(rx)) / 16, 0, 1) * clamp((60 - Math.abs(ry)) / 16, 0, 1);
    let br = 0;
    for (const b of BRAZ) { const db = b.x * s + b.y * c; for (const f of [P, E]) { if (db > f.x * s + f.y * c) { const bx = (b.x - f.x) * c - (b.y - f.y) * s, by = ((b.x - f.x) * s + (b.y - f.y) * c) * .5; br = Math.max(br, 1 - Math.hypot(bx, by) / 40); } } }
    const { baseZoom, vw } = deps.getView();
    const edge = clamp((Math.abs(rx) * .5 * baseZoom - (vw / 2 - 70)) / 30, 0, 1);
    return .55 * side + .25 * (1 - ov) + .1 * (1 - clamp(br, 0, 1)) + .1 * (1 - edge) - .05 * angDiff(wrap(th), wrap(cam.target)) / 45;
  }
  function cutTo(ang: number, why: string) {
    latchNow();
    const from = wrap(cam.target), d = ((ang - from + 540) % 360) - 180, hero = PRI[why] === 3, h = RM ? .5 : 1;
    let a0 = cam.ang, to = cam.target + d;
    if (Math.abs(to) >= 360) { const k = Math.floor(to / 360) * 360; to -= k; a0 -= k; }
    cam.target = to; cam.ang = a0;
    const T = hero ? dir.tH : dir.tL; dir.tw = T > 0 ? { from: a0, to, t: 0, T } : (cam.ang = to, null);
    if (hero) dir.shot = 70; dir.last = tick; dir.lastPri = PRI[why]; dir.q = null; dir.why = why + ' ' + from + '→' + wrap(ang);
    dir.log.push(tick + ' ' + dir.why + ' q' + dir.sc[wrap(ang) / 45].toFixed(2)); if (dir.log.length > 8) dir.log.shift();
    if (opt.push) cam.zv += (hero ? 3 : 1.8) * h;
    if (!RM) { dir.flash = hero ? 8 : 0; if (why === 'plunge') dir.bar = 54; }
  }
  function directorTick() {
    if (dir.pause > 0) dir.pause--; else if (dir.grace > 0) dir.grace--;
    if (dir.flash > 0) dir.flash--; if (dir.bar > 0) dir.bar--;
    for (let i = 0; i < 8; i++) dir.sc[i] = quality(i * 45);
    const cur = wrap(cam.target); dir.cur = dir.sc[cur / 45];
    const imm = opt.immersive; if (dir.shot > 0) dir.shot--;
    cam.pt = dir.shot > 0 ? .33 : (imm ? .46 : .5);
    { const el = deg(Math.atan(cam.pt)); cam.pv = el < 21.3 ? 'p16/' : el > 32.3 ? 'p38/' : ''; }
    cam.pkt = imm ? (dir.shot > 0 ? .26 : .18) : 0;
    const calm0 = P.state === 'ground' && (E.state === 'idle' || E.state === 'stun' || E.state === 'getup');
    cam.ch += ((imm && opt.autocam && dir.pause <= 0 && calm0 ? 1 : 0) - cam.ch) * .04;
    if (dir.q && tick - dir.qT > 6) dir.q = null;
    if (!opt.autocam || dir.pause > 0 || dir.grace > 0 || opt.speed < 1) { dir.q = null; dir.bad = 0; return; }
    const calm = P.state === 'ground' && (E.state === 'idle' || E.state === 'stun' || E.state === 'getup');
    dir.bad = (calm && !imm && dir.cur < .4) ? dir.bad + 1 : 0;
    let beat = dir.q; if (!beat && dir.bad >= 30 && dir.beats.neutral) beat = 'neutral';
    if (!beat && imm && calm && Math.hypot(E.x - P.x, E.y - P.y) > 50) {
      const adv = (th: number) => { const a = rad(th); return (P.x - E.x) * Math.sin(a) + (P.y - E.y) * Math.cos(a); };
      let bi = -1, ba = adv(cur) + 35;
      for (const k of [-2, -1, 1, 2]) { const i = (cur / 45 + k + 8) % 8, v = adv(i * 45); if (v > ba) { ba = v; bi = i; } }
      dir.chT = bi >= 0 ? dir.chT + 1 : 0; if (dir.chT >= 24) { beat = 'chase'; dir.chBest = bi; }
    } else if (!beat) dir.chT = 0;
    if (!beat) return;
    const pri = PRI[beat], hero = pri === 3, since = tick - dir.last;
    if (since < 36 || (since < 90 && pri <= dir.lastPri)) return;
    if (E.state === 'air' && !E.spiked && beat !== 'launcher' && beat !== 'heavy') return;
    if (beat === 'chase') { dir.chT = 0; cutTo(dir.chBest * 45, 'chase'); return; }
    if (pri === 2 && dir.cur >= .4) { dir.q = null; return; }
    const need = hero ? .6 : dir.cur + .25, maxk = beat === 'neutral' ? 1 : 2, ci = cur / 45;
    let best = -1, bq = -9;
    for (const k of [-2, -1, 1, 2]) { if (Math.abs(k) > maxk) continue; const i = (ci + k + 8) % 8, q = dir.sc[i]; if (q >= need && q > bq) { bq = q; best = i; } }
    if (best < 0) { dir.q = null; return; }
    cutTo(best * 45, beat);
  }

  function hittable() {
    if (E.state === 'getup' || E.state === 'down' && !(E.kd && E.kd.phase === 'bounce')) return false;
    if (E.state === 'down' && E.kd && E.kd.phase === 'bounce' && E.z < 8) return false;
    return true;
  }
  function vertOK(az: number, reachUp = 46, reachDown = 46) { const dz = E.z - az; return dz < reachUp + 6 && dz > -reachDown; }
  function inCone(att: Fighter, reach: number, arc: number) {
    const dx = E.x - att.x, dy = E.y - att.y, d = Math.hypot(dx, dy);
    if (d > reach + 12) return false;
    if (d < 20) return true;
    return angDiff(deg(Math.atan2(dy, dx)), att.face) <= arc;
  }
  function comboName(n: string) { combo.lastName = n; if (combo.chain[combo.chain.length - 1] !== n) combo.chain.push(n); if (combo.chain.length > 6) combo.chain.shift(); }
  function hurt(slot: string, idx: number, att: Fighter) {
    const mv = MOVE[slot], meta = META[slot];
    const wasAir = E.z > 6 || E.state === 'air' || (E.state === 'down' && E.kd && E.kd.phase === 'bounce');
    const dv = dirVec(att.face);
    if (E.state === 'guard' || E.state === 'block') {
      if (mv.kind === 'light' || mv.kind === 'air') {
        const chip = Math.round(mv.dmg[Math.min(idx, mv.dmg.length - 1)] * .12); E.hp = Math.max(1, E.hp - chip); E.hpHit = tick;
        E.state = 'block'; E.t = 0; E.stunT = .3; E.vx = dv.x * (mv.kb || 60) * .45; E.vy = dv.y * (mv.kb || 60) * .45; E.anim = 'block_hit'; E.frame = null; faceToward(E, att);
        num(E.x, E.y, E.z + 48, 'Blocked', '#9fc4ff'); spark(lerp(att.x, E.x, .7), lerp(att.y, E.y, .7), E.z + 26, 6, 150, '#bcd6ff', .4, deg(Math.atan2(dv.y, dv.x)));
        stripFx('hitspark', lerp(att.x, E.x, .7), lerp(att.y, E.y, .7), E.z + 26, { fps: 30, scale: .45, tint: '#bcd6ff' });
        hitstop = Math.max(hitstop, 3); shakeCam(.08); combo.endT = tick; return;
      }
      num(E.x, E.y, E.z + 60, 'Guard broken', '#ffcf8a'); E.state = 'idle';
    }
    if (!combo.active) { combo.hits = 0; combo.dmg = 0; combo.air = 0; combo.chain = []; }
    combo.active = true; combo.hits++;
    const scale = Math.max(.35, 1 - .07 * (combo.hits - 1));
    const base = (mv.dmg[Math.min(idx, mv.dmg.length - 1)]);
    const dmg = Math.round(base * scale);
    combo.dmg += dmg; combo.max = Math.max(combo.max, combo.hits);
    E.hp = Math.max(0, E.hp - dmg); E.hpHit = tick;
    combo.endT = tick;
    comboName(meta.name);
    const hx = lerp(att.x, E.x, .7), hy = lerp(att.y, E.y, .7), hz = E.z + 26;
    num(E.x + rnd(-9, 9), E.y, E.z + 48 + rnd(-4, 8), String(dmg), idx ? '#ffd9a8' : '#fff');
    const hsArr = (a: any) => Array.isArray(a) ? a[Math.min(idx, a.length - 1)] : a;
    let hs = hsArr(mv.hs) || 4, sh = hsArr(mv.shake) || .15, pu = hsArr(mv.push) || 0;
    const kind = mv.kind;
    if (E.state === 'down' && E.kd && E.kd.phase === 'bounce') { E.state = 'air'; E.kd = null; E.spiked = false; }
    if (kind === 'light' && !wasAir) {
      const behind = angDiff(att.face, E.face) < 70;
      E.state = 'stun'; E.anim = behind ? 'hit_back' : (mv.kb >= 100 || ((mv.shake as number) || 0) >= .2) ? 'hit_heavy' : 'hit'; E.t = 0; E.stunT = mv.stun; E.vx = dv.x * mv.kb; E.vy = dv.y * mv.kb; if (!behind) faceToward(E, att); E.shk = hs;
    } else if (kind === 'heavy') {
      E.state = 'air'; E.vz = mv.vz as number; E.vx = dv.x * mv.kb; E.vy = dv.y * mv.kb; E.launchT = 0; E.juggle = 0; E.spiked = false; faceToward(E, att); E.shk = hs;
      if (E.z < 1) E.z = 1;
    } else if (kind === 'launch') {
      if (!wasAir) faceToward(E, att);
      E.state = 'air'; E.vz = Math.max(E.vz, hsArr(mv.vz)); E.vx += dv.x * mv.kb; E.vy += dv.y * mv.kb; E.launchT = 0; E.spiked = false; E.shk = hs;
      if (E.z < 1) E.z = 1; if (!wasAir) E.juggle = 0;
    } else if (kind === 'air' || (kind === 'light' && wasAir)) {
      const pop = mv.pop || 130;
      if (!wasAir) { faceToward(E, att); E.z = Math.max(E.z, 1); }
      E.state = 'air'; E.vz = Math.max(E.vz, pop - E.juggle * 14); E.vx += dv.x * (mv.kb || 40); E.vy += dv.y * (mv.kb || 40); E.launchT = 0; E.juggle++; E.spiked = false; E.shk = hs;
      combo.air = Math.max(combo.air, E.juggle);
    } else if (kind === 'spike') {
      E.state = 'air'; E.vz = -760; E.vx = dv.x * 30; E.vy = dv.y * 30; E.spiked = true; E.launchT = 0; E.juggle++; E.shk = hs; combo.air = Math.max(combo.air, E.juggle);
      if (!wasAir) { E.z = Math.max(E.z, 1); faceToward(E, att); }
    }
    hitstop = Math.max(hitstop, hs);
    shakeCam(sh); pushIn(pu); if (pu > 0.09) focusKick(.7);
    if (kind === 'launch' && !wasAir) directorBeat('launcher'); else if (kind === 'heavy') directorBeat('heavy');
    spark(hx, hy, hz, kind === 'heavy' || kind === 'spike' ? 16 : 9, kind === 'heavy' ? 240 : 190, kind === 'light' ? '#ffe2b0' : '#fff3d8', .6, deg(Math.atan2(dv.y, dv.x)));
    flare(hx, hy, hz, kind === 'light' ? 8 : 13);
    const elc = EL[deps.getPA()] || '#fff';
    const sa = deps.project(att.x, att.y, att.z), sb = deps.project(E.x, E.y, E.z), sang = Math.atan2(sb[1] - sa[1], sb[0] - sa[0]);
    stripFx('hitspark', hx, hy, hz, { fps: 30, scale: kind === 'light' ? .8 : 1, tint: elc });
    if (kind === 'heavy' || kind === 'launch' || kind === 'air') stripFx('slash', hx, hy, hz, { fps: 20, scale: 1.2, ang: sang, tint: elc });
    else if (kind === 'light') stripFx('slash', hx, hy, hz, { fps: 24, scale: .75, ang: sang, tint: elc });
    if (kind === 'spike') stripFx('fire', E.x, E.y, 2, { fps: 20, scale: 1.5, squash: .5 });
    flash(hx, hy, hz, kind === 'light' ? 70 : 105, [255, 200, 140], kind === 'light' ? .6 : .95, .2);
    dbg.cone = { x: att.x, y: att.y, face: att.face, reach: mv.reach || mv.radius, arc: mv.arc || 360, t: 14 };
    snd(kind === 'launch' ? 300 : kind === 'spike' ? 140 : 190, .06);
    if (att === P && P.z > 6 && (slot === 'air1')) { P.vz = Math.max(P.vz, 110); }
  }
  function playerHit(slot: string, idx: number) {
    const mv = MOVE[slot];
    if (!hittable()) return false;
    if (slot === 'plunge') {
      const tip = { x: P.x + dirVec(P.face).x * mv.fwd, y: P.y + dirVec(P.face).y * mv.fwd };
      if (Math.hypot(E.x - tip.x, E.y - tip.y) > mv.radius + 8) return false;
      if (!vertOK(P.z, 40, 46)) return false;
    } else {
      if (!inCone(P, mv.reach, mv.arc)) return false;
      if (!vertOK(P.z)) return false;
    }
    hurt(slot, idx, P); return true;
  }

  function press(a: string) { buf.push({ a, t: tick }); if (buf.length > 6) buf.shift(); }
  function rawMove() {
    const keys = input.keys, tm = input.touchMove;
    let x = ((keys.has('d') || keys.has('arrowright')) ? 1 : 0) - ((keys.has('a') || keys.has('arrowleft')) ? 1 : 0);
    let y = ((keys.has('s') || keys.has('arrowdown')) ? 1 : 0) - ((keys.has('w') || keys.has('arrowup')) ? 1 : 0);
    x += tm.x; y += tm.y;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y, m: Math.min(1, m) };
  }
  function latchNow() { if (dir.latch || bot.on) return; const r = rawMove(); if (r.m >= .1) dir.latch = { ang: cam.ang, dir: deg(Math.atan2(r.y, r.x)) }; }
  function worldMove() {
    if (bot.on) return bot.mv;
    const r = rawMove(), L = dir.latch;
    if (L && (r.m < .1 || angDiff(wrap(deg(Math.atan2(r.y, r.x))), wrap(L.dir)) >= 20)) dir.latch = null;
    const a = -rad(dir.latch ? dir.latch.ang : cam.ang), c = Math.cos(a), s = Math.sin(a);
    return { x: r.x * c - r.y * s, y: r.x * s + r.y * c };
  }
  function rotate(d: number) { dir.tw = null; latchNow(); cam.target += 45 * d; dir.pause = 240; dir.grace = 60; dir.q = null; }
  function startAttack(slot: string, air?: boolean) {
    const meta = META[slot]; if (!meta || !meta.hit_frames) return false;
    P.state = air ? 'airatk' : 'atk'; P.slot = slot; P.move = meta; P.cur = MOVE[slot] || STYLE.slash; setAnim(P, slot); P.anim = slot; P.t = 0; P.hitDone = new Set(); P.frame = null;
    if (distPE() < 130 && hittable() || distPE() < 130 && E.state !== 'down') faceToward(P, E);
    const dv = dirVec(P.face), l = P.cur.lunge || 0;
    P.vx = dv.x * l; P.vy = dv.y * l;
    if (air) { P.airCount++; P.vz = P.vz * .3 + 55; }
    return true;
  }
  function startJump() { P.state = 'squat'; P.t = 0; P.anim = 'jump'; P.frame = 0; P.vx = P.vy = 0; }
  function startPlunge() {
    P.state = 'plunge'; P.anim = 'plunge'; P.t = 0; P.hitDone = new Set(); P.slot = 'plunge'; P.move = META.plunge; P.cur = MOVE.plunge; P.plunged = true; P.frame = null; P.z0 = P.z; P.vz = 0;
    if (distPE() < 150) faceToward(P, E);
    const dv = dirVec(P.face); P.vx = dv.x * 70; P.vy = dv.y * 70;
  }
  function land(fromPlunge: boolean) {
    P.z = 0; P.vz = 0; P.state = 'land'; P.t = 0; P.frame = 5; P.anim = 'jump'; P.airCount = 0; P.plunged = false;
    dust(P.x, P.y, fromPlunge ? 5 : 7, 40);
  }
  function startDash() {
    const w = worldMove(), m = Math.hypot(w.x, w.y) > .2, d = m ? { x: w.x / Math.hypot(w.x, w.y), y: w.y / Math.hypot(w.x, w.y) } : dirVec(P.face);
    if (m) P.face = snap8(deg(Math.atan2(d.y, d.x))); P.state = 'dash'; P.t = 0; P.slot = null; P.anim = 'dash'; P.frame = null; P.vx = d.x * 300; P.vy = d.y * 300; dust(P.x, P.y, 6, 50);
  }
  function tryDo(a: string) {
    const s = P.state, f = (s === 'atk' || s === 'airatk') ? frameIdx(P) : 0;
    const neutral = s === 'ground' || (s === 'land' && P.t > .04);
    const cancel = (s === 'atk' || s === 'airatk') && f >= P.move.cancel_from;
    const grounded = neutral || (s === 'atk' && cancel);
    const airish = s === 'air' || (s === 'airatk' && cancel);
    if (a === 'jump') { if (grounded) { startJump(); return true; } }
    else if (a === 'dash') { if (grounded) { startDash(); return true; } }
    else if (a === 'guard') { if (neutral) { P.state = 'guard'; P.t = 0; P.vx = P.vy = 0; return true; } }
    else if (a === 'light') {
      if (neutral) { return startAttack('attack1'); }
      if (s === 'atk' && cancel) { const nx = CHAIN_NEXT[P.slot] || 'attack1'; return startAttack(nx); }
      if (airish && P.airCount < AIR_MAX) { return startAttack('air1', true); }
    } else if (a === 'special') {
      if (grounded) { return startAttack('launcher'); }
      if (airish && !P.plunged) { startPlunge(); return true; }
    }
    return false;
  }
  function consumeBuffer() {
    for (let i = 0; i < buf.length; i++) {
      if (tick - buf[i].t > BUF_TICKS) { buf.splice(i--, 1); continue; }
      if (tryDo(buf[i].a)) { buf.splice(i, 1); return true; }
    }
    return false;
  }
  function updatePlayer() {
    const p = P; p.t += TICK;
    const w = worldMove(), mag = Math.hypot(w.x, w.y), want = mag > .2;
    switch (p.state) {
      case 'ground': {
        p.anim = want ? 'walk' : 'idle'; p.frame = null;
        if (want) p.face = snap8(deg(Math.atan2(w.y, w.x)));
        const k = 1 - Math.exp(-18 * TICK);
        p.vx = lerp(p.vx, want ? w.x * SPEED : 0, k); p.vy = lerp(p.vy, want ? w.y * SPEED : 0, k);
        if (p.anim === 'idle' && Math.hypot(p.vx, p.vy) > 10) p.anim = 'walk';
        consumeBuffer(); break;
      }
      case 'dash': {
        p.anim = 'dash'; p.frame = null; p.vx *= .93; p.vy *= .93;
        if (p.t > .2) consumeBuffer();
        if (P.state === 'dash' && p.t >= 6 / animFps('dash')) { p.state = 'ground'; p.vx *= .3; p.vy *= .3; }
        break;
      }
      case 'guard': {
        p.anim = 'guard'; p.vx *= .7; p.vy *= .7; p.frame = Math.min(3, Math.floor(p.t * animFps('guard')));
        if (!keys.has('l') && p.t > .12) { p.state = 'ground'; }
        break;
      }
      case 'atk': {
        const f = frameIdx(p), m = p.move;
        p.vx *= .88; p.vy *= .88;
        if (E.state === 'stun') {
          const dx = E.x - p.x, dy = E.y - p.y, d = Math.hypot(dx, dy);
          if (d > 30 && d < 150) { p.vx += dx / d * 220 * TICK; p.vy += dy / d * 220 * TICK; }
        }
        if (m.hit_frames.includes(f) && !p.hitDone.has(f)) { p.hitDone.add(f); playerHit(p.slot, m.hit_frames.indexOf(f)); }
        consumeBuffer();
        if (P.state === 'atk' && p.t >= 6 / animFps(p.anim)) { p.state = 'ground'; p.slot = null; p.vx *= .5; p.vy *= .5; }
        break;
      }
      case 'squat': {
        p.vx *= .8; p.vy *= .8;
        if (p.t >= .07) {
          p.state = 'air'; p.vz = JUMP_VZ; p.z = .01; p.airCount = 0; p.plunged = false; dust(p.x, p.y, 4, 30);
          if (want) { p.vx = w.x * AIR_SPEED; p.vy = w.y * AIR_SPEED; }
        }
        break;
      }
      case 'air': case 'airatk': {
        const atk = p.state === 'airatk', f = atk ? frameIdx(p) : 0;
        if (!atk || f >= p.move.cancel_from) { const k = 1 - Math.exp(-8 * TICK); p.vx = lerp(p.vx, want ? w.x * AIR_SPEED : 0, k); p.vy = lerp(p.vy, want ? w.y * AIR_SPEED : 0, k); if (want && !atk) p.face = snap8(deg(Math.atan2(w.y, w.x))); }
        else {
          p.vx *= .96; p.vy *= .96;
          if (hittable()) {
            const dx = E.x - p.x, dy = E.y - p.y, d = Math.hypot(dx, dy);
            if (d > 24 && d < 140) { p.vx += dx / d * 320 * TICK; p.vy += dy / d * 320 * TICK; const sp = Math.hypot(p.vx, p.vy); if (sp > 95) { p.vx *= 95 / sp; p.vy *= 95 / sp; } }
          }
        }
        const gs = atk ? (f < p.move.cancel_from ? .28 : .6) : 1;
        p.vz -= G_PLAYER * gs * TICK; p.z += p.vz * TICK;
        if (atk && m_hit(p, f)) { /* noop */ }
        if (p.z <= 0 && p.vz < 0) { land(false); break; }
        if (!atk) {
          p.anim = 'jump';
          p.frame = p.vz > 150 ? 1 : p.vz > -150 ? 2 : (p.z < 16 && p.vz < 0 ? 4 : 3);
          consumeBuffer();
        } else {
          consumeBuffer();
          if (P.state === 'airatk' && p.t >= 6 / animFps(p.anim)) { p.state = 'air'; p.slot = null; }
        }
        break;
      }
      case 'plunge': {
        const fps = animFps('plunge'), T2 = 2 / fps, T3 = 3 / fps, T5 = 5 / fps, f = frameIdx(p);
        if (p.t < T2) { p.vz = 0; p.z = p.z0 + 5 * Math.sin(clamp(p.t / T2, 0, 1) * Math.PI); p.vx *= .95; p.vy *= .95; p.zd = p.z; }
        else if (p.t < T3) {
          const u = (p.t - T2) / (T3 - T2);
          const zt = Math.min(p.zd, Math.max(16, (hittable() ? E.z - 8 : 0)));
          p.z = p.zd + (zt - p.zd) * u * u; p.vz = 0;
          let dv = dirVec(p.face), sp = 150;
          if (hittable()) { const tx = E.x - p.x, ty = E.y - p.y, td = Math.hypot(tx, ty); if (td > 6 && td < 150) { dv = { x: tx / td, y: ty / td }; sp = clamp(td * 5, 0, 170); } }
          p.vx = dv.x * sp; p.vy = dv.y * sp;
        } else if (p.t < T5) {
          p.vz = 0; p.vx *= .8; p.vy *= .8;
        } else {
          p.vx *= .8; p.vy *= .8; p.vz -= G_PLAYER * TICK; p.z += p.vz * TICK;
        }
        if (f >= 3 && !p.hitDone.has(3)) {
          p.hitDone.add(3);
          const connected = playerHit('plunge', 0);
          const tip = { x: p.x + dirVec(p.face).x * MOVE.plunge.fwd, y: p.y + dirVec(p.face).y * MOVE.plunge.fwd };
          if (p.z < 28) {
            ring(tip.x, tip.y, 60, .4, '#f3c58f', 2); dust(tip.x, tip.y, connected ? 4 : 8, 60);
            if (!connected) { shakeCam(.35); hitstop = Math.max(hitstop, 4); flash(tip.x, tip.y, 4, 90, [255, 190, 120], .7, .2); }
          }
        }
        if (p.z <= 0 && p.t >= T5) { p.z = 0; p.vz = 0; }
        if (p.t >= 6 / fps) { if (p.z <= 1) { land(true); } else { p.state = 'air'; p.slot = null; p.anim = 'jump'; } }
        break;
      }
      case 'land': {
        p.vx *= .8; p.vy *= .8;
        if (p.t > .04) consumeBuffer();
        if (P.state === 'land' && p.t >= .1) { p.state = 'ground'; p.frame = null; }
        break;
      }
    }
    p.x += p.vx * TICK; p.y += p.vy * TICK;
    if (p.z < 0) p.z = 0;
    arenaClamp(p, 14);
    if (E.state === 'idle' || E.state === 'stun') {
      const dx = p.x - E.x, dy = p.y - E.y, d = Math.hypot(dx, dy);
      if (d < 26 && Math.abs(p.z - E.z) < 34 && d > 0.01) { const k = (26 - d) / d; p.x += dx * k; p.y += dy * k; }
    }
  }
  function m_hit(p: Fighter, f: number) {
    const m = p.move;
    if (m.hit_frames.includes(f) && !p.hitDone.has(f)) { p.hitDone.add(f); playerHit(p.slot, m.hit_frames.indexOf(f)); }
    return true;
  }

  function enemyLand() {
    const s = -E.vz;
    E.z = 0;
    const spiked = E.spiked;
    let bv = 0;
    if (spiked) bv = 330; else if (s > 260) bv = Math.min(200, s * .33);
    E.spiked = false;
    E.state = 'down'; E.vz = 0; E.vx *= .3; E.vy *= .3;
    E.kd = { phase: spiked ? 'slam' : 'land', t: 0, bv, spike: spiked };
    E.launchT = 0;
    const big = spiked ? 1 : clamp((s - 200) / 500, 0, .6);
    dust(E.x, E.y, spiked ? 14 : 8, spiked ? 90 : 55);
    if (spiked || s > 420) { ring(E.x, E.y, spiked ? 78 : 50, spiked ? .5 : .35, spiked ? '#f3c58f' : '#b9c4d6', spiked ? 3 : 2); }
    flash(E.x, E.y, 6, spiked ? 150 : 90, [255, 190, 120], spiked ? 1 : .6, .25);
    hitstop = Math.max(hitstop, spiked ? 9 : 3); E.shk = spiked ? 9 : 3;
    shakeCam(.2 + big * .6); pushIn(spiked ? .12 : big * .07); if (spiked) focusKick(1);
    if (spiked) directorBeat('plunge'); else if (s > 420) directorBeat('knock');
    const sd = spiked ? 60 : 0;
    if (sd) { combo.dmg += sd; E.hp = Math.max(0, E.hp - sd); num(E.x, E.y, 40, String(sd), '#ffcf8a'); combo.hits++; combo.max = Math.max(combo.max, combo.hits); comboName('Ground bounce'); }
  }
  function updateEnemy() {
    const e = E; e.t += TICK; e.frame = null;
    switch (e.state) {
      case 'idle':
        setAnim(e, 'idle'); faceToward(e, P); e.vx *= .8; e.vy *= .8;
        if (opt.dguard) { e.state = 'guard'; e.t = 0; }
        break;
      case 'guard':
        setAnim(e, 'guard'); e.frame = 3; faceToward(e, P); e.vx *= .8; e.vy *= .8;
        if (!opt.dguard) { e.state = 'idle'; setAnim(e, 'idle'); }
        break;
      case 'block':
        e.stunT -= TICK; e.vx *= .9; e.vy *= .9;
        if (e.stunT <= 0) { e.state = opt.dguard ? 'guard' : 'idle'; e.t = 0; setAnim(e, e.state === 'guard' ? 'guard' : 'idle'); }
        break;
      case 'stun':
        e.stunT -= TICK; e.vx *= .92; e.vy *= .92;
        if (e.stunT <= 0) { e.state = 'idle'; setAnim(e, 'idle'); }
        break;
      case 'air': {
        e.launchT += TICK;
        const gs = 1 + E_JUGGLE_SCALE * Math.min(e.juggle, 6);
        const hover = (P.state === 'plunge' && P.t < 3 / animFps('plunge') && !e.spiked) ? .3 : 1;
        e.vz -= (e.spiked ? 3400 : E_GRAV * gs * hover) * TICK; e.z += e.vz * TICK;
        if (hover < 1) { e.vx *= .9; e.vy *= .9; } else { e.vx *= .965; e.vy *= .965; }
        if (e.launchT < .36) { e.anim = 'launch'; e.frame = Math.min(5, Math.floor(e.launchT * animFps('launch'))); }
        else { e.anim = 'tumble'; e.frame = Math.floor((e.launchT - .36) * animFps('tumble')) % 6; }
        if (e.z <= 0 && e.vz < 0) enemyLand();
        break;
      }
      case 'down': {
        const kd = e.kd; kd.t += TICK; e.anim = 'knockdown';
        e.vx *= .9; e.vy *= .9;
        const next = (ph: string) => { kd.phase = ph; kd.t = 0; };
        switch (kd.phase) {
          case 'land': e.frame = 0; if (kd.t >= .05) next('slam'); break;
          case 'slam': e.frame = 1;
            if (kd.t >= .07) { if (kd.bv > 0) { next('bounce'); e.vz = kd.bv; e.z = .01; } else next('settle1'); }
            break;
          case 'bounce':
            e.frame = 2; e.vz -= E_BOUNCE_G * TICK; e.z += e.vz * TICK;
            if (e.z <= 0 && e.vz < 0) {
              const s = -e.vz; e.z = 0; e.vz = 0; next('slam2');
              dust(e.x, e.y, 6, 45); ring(e.x, e.y, 38, .3, '#b9c4d6', 2); shakeCam(.3); hitstop = Math.max(hitstop, 3); e.shk = 3;
              flash(e.x, e.y, 4, 80, [255, 190, 120], .7, .2);
            }
            break;
          case 'slam2': e.frame = 3; if (kd.t >= .08) next('settle1'); break;
          case 'settle1': e.frame = 4; if (kd.t >= .12) next('lie'); break;
          case 'lie': e.frame = 5; if (kd.t >= .42) { e.state = 'getup'; e.t = 0; e.kd = null; } break;
        }
        break;
      }
      case 'getup':
        setAnim(e, 'getup');
        if (e.t >= 6 / animFps('getup')) { e.state = 'idle'; setAnim(e, 'idle'); e.juggle = 0; }
        break;
    }
    e.x += e.vx * TICK; e.y += e.vy * TICK;
    arenaClamp(e, 14);
    if (e.state === 'idle' && combo.active) {
      if (tick - combo.endT > 75) { combo.active = false; combo.endT = tick; }
    }
    if (e.state === 'stun' || e.state === 'idle' || e.state === 'getup') { /* nothing */ }
  }

  function setBot(on: boolean) {
    bot.on = on; bot.st = 'wait'; bot.timer = 0; bot.cool = 20; bot.mv = { x: 0, y: 0 };
    document.querySelector('[data-o=demo]')!.setAttribute('aria-pressed', String(on));
  }
  function userTouched() { if (bot.on) setBot(false); }
  function botTick() {
    const b = bot; b.mv = { x: 0, y: 0 }; b.timer++;
    if (b.cool > 0) b.cool--;
    const dx = E.x - P.x, dy = E.y - P.y, d = Math.max(.01, Math.hypot(dx, dy));
    const toward = () => { b.mv = { x: dx / d, y: dy / d }; };
    const f = (P.state === 'atk' || P.state === 'airatk' || P.state === 'plunge') ? frameIdx(P) : 0;
    const go = (s: string) => { b.st = s; b.timer = 0; };
    switch (b.st) {
      case 'wait': if (E.state === 'idle' && P.state === 'ground' && b.cool <= 0) go('approach'); break;
      case 'approach': if (d > 40) toward(); else { press('light'); go('l1'); } if (b.timer > 300) go('wait'); break;
      case 'l1': if (P.state === 'atk' && P.slot === 'attack1' && f >= 3) { press('light'); go('l2'); } else if (b.timer > 90) go('wait'); break;
      case 'l2': if (P.state === 'atk' && P.slot === 'attack2' && f >= 3) { press('special'); go('lau'); } else if (b.timer > 90) go('wait'); break;
      case 'lau': if (P.state === 'atk' && P.slot === 'launcher' && f >= 3) { press('jump'); go('jmp'); } else if (b.timer > 90) go('wait'); break;
      case 'jmp': if (P.state === 'air' || P.state === 'airatk') { if (d > 30) toward(); if (E.z - P.z < 34 || P.vz < 0) { press('light'); go('a1'); } } else if (b.timer > 90) go('wait'); break;
      case 'a1': if (d > 34 && (P.state === 'air' || f >= 4)) toward();
        if (P.state === 'airatk' && P.slot === 'air1' && f >= 3) { press('light'); go('a2'); } else if (b.timer > 120) go('wait'); break;
      case 'a2': if (d > 34 && (P.state === 'air' || f >= 4)) toward();
        if (P.state === 'airatk' && P.airCount >= 2 && f >= 3) { press('special'); go('pl'); } else if (b.timer > 120) go('wait'); break;
      case 'pl': if (P.state === 'plunge') go('fin'); else if (b.timer > 60) go('wait'); break;
      case 'fin': if (P.state === 'ground' && (E.state === 'getup' || E.state === 'idle')) { b.cool = 70; go('wait'); } else if (b.timer > 420) go('wait'); break;
    }
  }

  function updateCam() {
    if (dir.tw) { const w = dir.tw; w.t++; const u = Math.min(1, w.t / w.T), e = u * u * u * (u * (6 * u - 15) + 10);
      cam.ang = w.from + (w.to - w.from) * e; if (u >= 1) { cam.ang = w.to; dir.tw = null; } }
    else {
      cam.ang += (cam.target - cam.ang) * (1 - Math.exp(-9 * TICK));
      if (Math.abs(cam.target - cam.ang) < .05) cam.ang = cam.target;
    }
    cam.zv += (230 * (1 - cam.zoom) - 26 * cam.zv) * TICK; cam.zoom += cam.zv * TICK;
    const wp = .5 - .2 * cam.ch, we = .5 + .2 * cam.ch, tx = (P.x * wp + E.x * we) * .45, ty = (P.y * wp + E.y * we) * .45, k = 1 - Math.exp(-4 * TICK);
    const k2 = 1 - Math.exp(-5 * TICK); cam.py += (cam.pt + (RM ? 0 : Math.sin(tick * .012) * .012) - cam.py) * k2; cam.pk += (cam.pkt - cam.pk) * k2;
    cam.fx += (tx - cam.fx) * k; cam.fy += (ty - cam.fy) * k; cam.fz += ((E.state === 'air' ? Math.max(0, E.z) * .3 : 0) - cam.fz) * k;
    cam.shake = Math.max(0, cam.shake - TICK * 1.7); cam.fk = Math.max(0, cam.fk - TICK * 2.2);
    const m = cam.shake * cam.shake * 9;
    cam.shx = opt.shake && m > .05 ? Math.round(m * .6 * Math.sin(tick * 1.1) + m * .4 * Math.sin(tick * 2.7 + 1.3)) : 0;
    cam.shy = opt.shake && m > .05 ? Math.round(m * .6 * Math.sin(tick * 1.3 + 2.1) + m * .4 * Math.sin(tick * 3.1)) : 0;
  }
  function stepEmbers() {
    for (const e of embers) { e.z += e.s * TICK; e.x += Math.sin(tick * .02 + e.ph) * .15; if (e.z > 170) { e.z = 0; e.x = rnd(-ARENA_A * .9, ARENA_A * .9); e.y = rnd(-ARENA_A * .9, ARENA_A * .9); } }
  }
  function simTick() {
    tick++;
    updateCam();
    directorTick();
    stepEmbers();
    if (hitstop > 0) { hitstop--; if (hitstop === 0) E.shk = 0; return; }
    if (bot.on) botTick();
    updatePlayer();
    updateEnemy();
    if (E.hp <= 0 && !E.dead) { E.dead = true; E.deadT = 0; E.state = 'dead'; E.vx = E.vy = E.vz = 0; E.z = 0; combo.endT = tick; fsHits = combo.hits; fsDmg = combo.dmg; stripFx('fire', E.x, E.y, 8, { fps: 20, scale: 1.6 }); }
    if (E.dead) {
      E.deadT += TICK; E.anim = 'death'; E.frame = Math.min(5, Math.floor(E.deadT * animFps('death')));
      if (P.state === 'ground' && E.deadT > .7) { P.vx = P.vy = 0; P.anim = 'victory'; P.frame = Math.min(5, Math.floor((E.deadT - .7) * animFps('victory'))); }
      if (E.deadT > 3.6) { deps.onResult(); return; }
    }
    updateFx();
    if (!combo.active && combo.hits > 0) { if (tick - combo.endT > 110) combo.hits = 0; }
    E.hpShown += (E.hp - E.hpShown) * (1 - Math.exp(-14 * TICK));
    if (!E.dead && !combo.active && E.hp < HP_MAX && tick - combo.endT > 75) E.hp = Math.min(HP_MAX, E.hp + HP_MAX * TICK * .7);
    if (dbg.t > 0) dbg.t--; if (dbg.cone) { dbg.cone.t--; if (dbg.cone.t <= 0) dbg.cone = null; }
  }

  return {
    P, E, combo, cam, dir, bot, dbg,
    parts, rings, nums, flashes, embers, input,
    vfxTint,
    press, userTouched, resetAll, simTick, rotate, setBot, setAnim, frameIdx,
    get tick() { return tick; },
    get hitstop() { return hitstop; },
    get fsHits() { return fsHits; },
    get fsDmg() { return fsDmg; },
    get fightStart() { return fightStart; },
  };
}

export type DuelApi = ReturnType<typeof createDuel>;
