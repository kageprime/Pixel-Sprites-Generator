// Hollow I: Cinder Hall — exploration sim: carrier, Host AI, seals/ash,
// boss gate, chests. Owned by createHollow() — isolated state per call.
// Page services arrive via deps and are read live:
//   IMG/opt/UI   mutable refs owned by the shell (sprites, settings, roster)
//   onWin/onLose unused — shell polls state flags instead (dead/won/endT)
import { TAU, TICK, rad, deg, wrap, snap8, angDiff, clamp, lerp, rnd, hash } from '../engine/math';
import { META, MOVE, STYLE, setP1, animFps, CHAIN_NEXT } from '../engine/moves';
import { createFx, EL } from '../engine/fx';
import { snd } from '../engine/audio';

export const TILE = 32, MW = 38, MH = 36;
const t2w = (tx: number, ty: number): [number, number] => [(tx - MW / 2) * TILE, (ty - MH / 2) * TILE];
const w2t = (x: number, y: number): [number, number] => [x / TILE + MW / 2, y / TILE + MH / 2];

const NAMES = ['Tam Orrel', 'Edda Voss', 'Wick', 'Marra Dunn', 'Corrin', 'Sul Hask'];
const ZONES: Array<[number, number, number, number, string]> = [
  [8, 10, 13, 13, 'The Bone Alcove'], [14, 14, 20, 18, 'The Quiet Seal'],
  [26, 11, 34, 20, 'Depth II · The Pressing Floor'], [24, 25, 36, 34, 'Depth III · The Last Carrier'],
  [1, 1, 21, 10, 'Depth I · The Ash Hall'],
];
const BRZ_T = [[2.7, 2.7], [13.7, 2.7], [19.3, 2.7], [8.7, 10.7], [14.7, 14.7], [19.3, 17.3], [26.7, 11.7], [33.3, 19.3], [24.7, 25.7], [35.3, 25.7], [24.7, 33.3], [35.3, 33.3]];
const HOST_T = [[15, 3], [18, 7], [10, 11], [28, 13], [32, 13], [30, 18]];
const REST_T: [number, number] = [16.5, 15.5];
const CHEST_A_T: [number, number] = [10.5, 11.5];
const CHEST_B_T: [number, number] = [30.5, 32];
const KEEP = [[4.5, 4.5], [16.5, 15.5], [10.5, 11.5], [30.5, 32], [30.5, 29.5], [29.5, 24.5], [15.5, 3.5], [18.5, 7.5], [28.5, 13.5], [32.5, 13.5], [30.5, 18.5]];

export interface HollowDeps {
  IMG: Record<string, any>;
  opt: { fx: boolean; [k: string]: any };
  UI: { open: string | null; p1: string; s1: string };
  project: (x: number, y: number, z: number) => [number, number];
}

export function createHollow(deps: HollowDeps) {
  const { IMG, opt, UI } = deps;
  const fx = createFx(opt, IMG);
  const { parts, rings, nums, flashes, spark, dust, ring, flash, num, updateFx, vfxTint, stripFx } = fx;
  let tick = 0, hitstop = 0, shake = 0;
  let t = 0;
  const input = { keys: new Set<string>(), buf: [] as Array<{ a: string; t: number }>, touchMove: { x: 0, y: 0 } };
  const { keys, buf } = input;
  const R: any = { x: 0, y: 0, tx: 4.5, ty: 4.5, face: 0, fx: 1, fy: 0, anim: 'idle', t: 0, seal: 4, rev: false, ash: 0, chain: 0, ct: 0, a: null, lock: 0, veil: 0, vcd: 0, dwin: 0, inv: 0, fl: 0, mv: 0, guard: false, gt: 0, ht: 0, vd: [0, 1] };
  let H: any[] = [], CHESTS: any[] = [], texts: any[] = [];
  let dead = false, won = false, zone = '', zt = 0, bossOn = false, bossDone = false, endT = 0;
  let pa = 'ren_calder';
  const cam: any = { ang: 0, target: 0, zoom: 1, fx: 0, fy: 0, shake: 0, shx: 0, shy: 0, c: 1, s: 0, Z: 1, py: .5 };
  const world = { M: [] as number[][], ZMAP: [] as number[][], DECOR: [] as any[], LAMPS: [] as any[] };
  const BRZ = BRZ_T.map(([a, b], i) => { const [x, y] = t2w(a, b); return { x, y, ph: i * 1.7, tx: a, ty: b }; });
  const REST = (() => { const [x, y] = t2w(REST_T[0], REST_T[1]); return { x, y, tx: REST_T[0], ty: REST_T[1] }; })();

  function buildMap() {
    const M: number[][] = [];
    for (let y = 0; y < MH; y++) M.push(new Array(MW).fill(1));
    const cv = (x: number, y: number, w: number, h: number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) M[j][i] = 0; };
    cv(2, 2, 5, 5); cv(7, 4, 6, 2); cv(13, 2, 7, 7); cv(16, 9, 2, 5); cv(14, 14, 6, 4); cv(20, 15, 6, 2); cv(26, 11, 8, 9); cv(29, 20, 2, 5); cv(24, 25, 12, 9); cv(13, 11, 3, 1); cv(8, 10, 5, 3);
    [[15, 5], [18, 5], [16, 7], [29, 15], [31, 15], [27, 28], [32, 28], [27, 31], [32, 31]].forEach(p => M[p[1]][p[0]] = 1); M[24][29] = 3; M[24][30] = 3;
    const ZMAP: number[][] = [];
    for (let y = 0; y < MH; y++) { ZMAP.push([]); for (let x = 0; x < MW; x++) { ZMAP[y].push(ZONES.findIndex(z => x >= z[0] && x < z[2] && y >= z[1] && y < z[3])); } }
    world.M = M; world.ZMAP = ZMAP;
  }
  const solidT = (x: number, y: number) => x < 0 || y < 0 || x >= MW || y >= MH || world.M[Math.floor(y)][Math.floor(x)] === 1;
  function freeT(x: number, y: number, r?: number) { r = r || .22; return !(solidT(x - r, y - r) || solidT(x + r, y - r) || solidT(x - r, y + r) || solidT(x + r, y + r)); }
  function mvT(o: any, dx: number, dy: number) { if (freeT(o.tx + dx, o.ty)) o.tx += dx; if (freeT(o.tx, o.ty + dy)) o.ty += dy; o.x = (o.tx - MW / 2) * TILE; o.y = (o.ty - MH / 2) * TILE; }

  function mkH(tx: number, ty: number, n: string, boss: boolean) {
    const [x, y] = t2w(tx, ty);
    return { x, y, tx, ty, seal: boss ? 16 : 8, smax: boss ? 16 : 8, n: boss ? 'Pell, the last carrier' : n, st: boss ? 'ap' : 'sl', tm: 0, broken: 0, fl: 0, reg: 0, cd: 1, sp: (boss ? 1.5 : 1.25) * TILE, ty2: 0, boss: !!boss, lives: boss ? 2 : 1, mt: 1, face: 180, anim: 'idle', t: 0 };
  }
  function reset() {
    buildMap();
    const [rx, ry] = t2w(4.5, 4.5);
    Object.assign(R, { x: rx, y: ry, tx: 4.5, ty: 4.5, face: 0, fx: 1, fy: 0, anim: 'idle', t: 0, seal: 4, rev: false, ash: 0, chain: 0, ct: 0, a: null, lock: 0, veil: 0, vcd: 0, dwin: 0, inv: 0, fl: 0, mv: 0, guard: false, gt: 0, ht: 0 });
    H = HOST_T.map((p, i) => mkH(p[0] + .5, p[1] + .5, NAMES[i], false));
    const [ax, ay] = t2w(CHEST_A_T[0], CHEST_A_T[1]), [bx, by] = t2w(CHEST_B_T[0], CHEST_B_T[1]);
    CHESTS = [
      { x: ax, y: ay, tx: CHEST_A_T[0], ty: CHEST_A_T[1], s: 'a bone fragment', ash: 3, o: 0 },
      { x: bx, y: by, tx: CHEST_B_T[0], ty: CHEST_B_T[1], s: 'the Ember Shard', ash: 5, o: 0, hid: 1, fin: 1 },
    ];
    texts = []; dead = false; won = false; zone = ''; zt = 0; bossOn = false; bossDone = false; endT = 0; t = 0; tick = 0; hitstop = 0; shake = 0;
    parts.length = rings.length = nums.length = flashes.length = 0; buf.length = 0;
    cam.fx = R.x; cam.fy = R.y; cam.ang = cam.target = 0;
    pa = UI.p1; setP1(pa);
    scatterDecor();
  }
  function scatterDecor() {
    const M = world.M;
    const DECOR: any[] = [], LAMPS: any[] = [];
    const clear = (i: number, j: number) => KEEP.every(([a, b]) => Math.hypot(i - a, j - b) > 2.2);
    const wallNear = (i: number, j: number) => { for (let a = -1; a < 2; a++) for (let b = -1; b < 2; b++) { const y = j + b, x = i + a; if (y >= 0 && x >= 0 && y < MH && x < MW && M[y][x] !== 0) return true; } return false; };
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
      if (M[j][i] !== 0 || !clear(i + .5, j + .5)) continue;
      const r = hash(i, j), v = (r * 3) | 0;
      if (r < .055) DECOR.push({ k: 'flat', p: 'u_grave' + (v + 1), i: i + .5, j: j + .5 });
      else if (r < .10) DECOR.push({ k: 'flat', p: 'u_bones' + (v + 1), i: i + .5, j: j + .5 });
      else if (r < .115) { const [x, y] = t2w(i + .5, j + .5); DECOR.push({ k: 'board', p: 'u_skulls' + (v + 1), x, y }); }
      else if (r < .14) DECOR.push({ k: 'flat', p: 'u_rock' + (v + 1), i: i + .5, j: j + .5 });
      else if (r < .155 && wallNear(i, j)) DECOR.push({ k: 'flat', p: 'u_thorn' + (v + 1), i: i + .5, j: j + .5 });
    }
    [[3, 3], [6, 6], [19, 3], [27, 12], [33, 18], [25, 26], [34, 32], [14, 15]].forEach(([a, b], n) => {
      if (a >= 0 && b >= 0 && a < MW && b < MH && M[b][a] === 0) { const [x, y] = t2w(a + .5, b + .5); DECOR.push({ k: 'board', p: 'u_deadtree' + (n % 3 + 1), x, y }); }
    });
    [[13, 3], [33, 12], [25, 26]].forEach(([a, b], n) => {
      if (a >= 0 && b >= 0 && a < MW && b < MH && M[b][a] === 0) { const [x, y] = t2w(a + .5, b + .5); DECOR.push({ k: 'board', p: 'u_ruin' + (n % 3 + 1), x, y }); }
    });
    [[28.5, 25.5], [31.5, 25.5]].forEach(([a, b]) => { const [x, y] = t2w(a, b); DECOR.push({ k: 'board', p: 'column1', x, y }); });
    [[16.5, 17.8], [29.5, 23.5], [30.5, 26.5]].forEach(([a, b]) => { const [x, y] = t2w(a, b); LAMPS.push({ x, y, tx: a, ty: b, ph: (a + b) * 1.3 }); });
    world.DECOR = DECOR; world.LAMPS = LAMPS;
  }
  function say(x: number, y: number, s: string, d?: number) { texts.push({ x, y, s, t: d || 1.6, m: d || 1.6 }); snd(110, .07); }
  function shakeCam(a: number) { cam.shake = Math.min(1, Math.max(cam.shake, a)); }
  function nearHost() {
    let b = null, bd = 3.5 * TILE;
    H.forEach(h => { if (h.st === 'dying') return; const d = Math.hypot(h.x - R.x, h.y - R.y); if (d < bd) { bd = d; b = h; } });
    return b;
  }

  function beginAttack(slot: string) {
    const meta = META[slot]; if (!meta || !meta.hit_frames) return false;
    const n = nearHost();
    if (n) { const dx = n.x - R.x, dy = n.y - R.y, d = Math.hypot(dx, dy) || 1; R.fx = dx / d; R.fy = dy / d; R.face = snap8(deg(Math.atan2(R.fy, R.fx))); }
    R.a = { slot, move: meta, cur: MOVE[slot] || STYLE.slash, hitDone: new Set(), t: 0, land: 0 };
    R.anim = slot; R.t = 0; R.dwin = .3; return true;
  }
  function cut() {
    if (R.a || R.guard || R.veil > 0 || R.lock > 0 || dead || won) return false;
    if (!beginAttack('attack1')) return false; snd(300, .05); return true;
  }
  function wheel() {
    if (R.a || R.guard || R.veil > 0 || R.lock > 0 || R.ash < 2 || dead || won) return false;
    R.ash -= 2;
    if (!beginAttack('launcher')) { R.ash += 2; return false; }
    snd(180, .2, 'sawtooth'); return true;
  }
  function veil() {
    if (R.vcd > 0 || R.a || R.guard || dead || won) return;
    R.veil = .28; R.vcd = .9; R.inv = .35; R.anim = 'dash'; R.t = 0;
    const keys = input.keys, tm = input.touchMove;
    let dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) + tm.x, dy = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0) + tm.y;
    const m = Math.hypot(dx, dy);
    if (m < .1) { dx = R.fx; dy = R.fy; } else { dx /= Math.max(1, m); dy /= Math.max(1, m); }
    const a = -rad(cam.ang), c = Math.cos(a), s = Math.sin(a);
    let vx = dx * c - dy * s, vy = dx * s + dy * c;
    const l = Math.hypot(vx, vy) || 1;
    R.vd = [vx / l, vy / l]; snd(520, .12, 'triangle');
  }
  function use() {
    if (dead || won) return;
    if (Math.hypot(R.x - REST.x, R.y - REST.y) < 1.6 * TILE) { R.seal = 4; R.rev = false; say(R.x, R.y, 'THE LEDGER IS QUIET', 2); return; }
    for (const ch of CHESTS) {
      if (!ch.o && !ch.hid && Math.hypot(R.x - ch.x, R.y - ch.y) < 1.4 * TILE) {
        ch.o = 1; R.ash = Math.min(5, R.ash + ch.ash); say(ch.x, ch.y, 'CLAIMED: ' + ch.s, 2.5);
        if (ch.fin) { won = true; endT = 0; try { localStorage.setItem('vs_hollow_cleared', '1'); } catch (e) {} }
      }
    }
  }
  function sealDmg(h: any, d: number) {
    if (h.st === 'dying') return; if (h.st === 'sl') h.st = 'ap'; if (h.broken > 0) { killH(h); return; }
    h.seal -= d; h.reg = 0; h.fl = .12;
    if (h.seal <= 0) {
      h.seal = 0; h.broken = 2.5; h.st = 'broken'; say(h.x, h.y, 'SEAL BROKEN', 1.4);
      stripFx('hitspark', h.x, h.y, 30, { fps: 30, scale: 1, tint: EL[pa] || '#fff' });
      flash(h.x, h.y, 30, 90, [255, 200, 140], .7, .2);
    }
  }
  function killH(h: any) {
    if (h.boss && --h.lives > 0) { h.seal = h.smax; h.broken = 0; h.st = 'stag'; h.tm = 1.3; say(h.x, h.y, 'THE PRESSING HOLDS', 2.2); shake = 10; return; }
    h.st = 'dying'; h.dt = 0; h.anim = 'death'; R.rev = false; R.ash = Math.min(5, R.ash + 1); say(h.x, h.y, 'FILED: ' + h.n, 2.4); shake = 8; snd(70, .25, 'sawtooth');
    stripFx('fire', h.x, h.y, 8, { fps: 20, scale: 1.2 }); flash(h.x, h.y, 20, 120, [255, 190, 120], .9, .25);
    if (h.boss) { bossDone = true; world.M[24][29] = 0; world.M[24][30] = 0; CHESTS[1].hid = 0; say(CHESTS[1].x, CHESTS[1].y - 16, 'The way opens.', 3); }
  }
  function hurt(unblockable: boolean) {
    if (R.inv > 0 || R.veil > 0 || dead || won) return;
    if (R.guard && !unblockable) {
      R.guard = false; R.inv = .35; say(R.x, R.y - 20, 'Blocked', .8);
      spark(R.x, R.y - 20, 26, 6, 150, '#bcd6ff', .4);
      stripFx('hitspark', R.x, R.y - 20, 30, { fps: 30, scale: .45, tint: '#bcd6ff' });
      snd(660, .05); return;
    }
    if (R.guard && unblockable) { R.guard = false; say(R.x, R.y - 20, 'Guard broken', 1); }
    R.seal--; R.chain = 0; R.inv = .7; R.fl = .15; R.ht = .25; shake = 7; say(R.x, R.y, 'CRACK', 1); snd(140, .12, 'sawtooth');
    if (R.seal <= 0) {
      if (!R.rev) { R.rev = true; R.seal = 1; say(R.x, R.y - 24, 'THE SEAL HOLDS', 2); }
      else { dead = true; endT = 0; R.anim = 'death'; R.t = 0; }
    }
  }

  function rawMove() {
    const keys = input.keys, tm = input.touchMove;
    let x = ((keys.has('d') || keys.has('arrowright')) ? 1 : 0) - ((keys.has('a') || keys.has('arrowleft')) ? 1 : 0);
    let y = ((keys.has('s') || keys.has('arrowdown')) ? 1 : 0) - ((keys.has('w') || keys.has('arrowup')) ? 1 : 0);
    x += tm.x; y += tm.y;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y, m: Math.min(1, m) };
  }
  function worldMove() {
    const r = rawMove(), a = -rad(cam.ang), c = Math.cos(a), s = Math.sin(a);
    return { x: r.x * c - r.y * s, y: r.x * s + r.y * c, m: r.m };
  }
  function press(a: string) { buf.push({ a, t: tick }); if (buf.length > 6) buf.shift(); }
  function tryDo(a: string) {
    if (dead || won) return false;
    if (a === 'light') {
      if (!R.a && !R.guard) { return cut(); }
      if (R.a) {
        const f = Math.min(5, Math.floor(R.a.t * animFps(R.a.slot)));
        if (f >= R.a.move.cancel_from) {
          const nx = CHAIN_NEXT[R.a.slot] || 'attack1';
          if (!beginAttack(nx)) return false;
          snd(nx === 'launcher' ? 180 : 300, .05); return true;
        }
      }
      return false;
    }
    if (a === 'special') { if (!R.a && !R.guard) { return wheel(); } return false; }
    if (a === 'jump') { veil(); return true; }
    if (a === 'dash') { use(); return true; }
    if (a === 'guard') { if (!R.a && !R.guard && !dead && !won) { R.guard = true; R.gt = 0; R.anim = 'guard'; R.t = 0; return true; } return false; }
    return false;
  }
  function consumeBuffer() {
    for (let i = 0; i < buf.length; i++) {
      if (tick - buf[i].t > 18) { buf.splice(i--, 1); continue; }
      if (tryDo(buf[i].a)) { buf.splice(i, 1); return true; }
    }
    return false;
  }
  function updatePlayer(dt: number) {
    R.t += dt;
    R.lock -= dt; R.vcd -= dt; R.dwin -= dt; R.inv -= dt; R.fl -= dt; R.ct -= dt; R.ht -= dt;
    if (R.ct <= 0 && R.chain > 0) { R.chain = 0; say(R.x, R.y - 20, 'CHAIN BROKEN', .9); }
    const w = worldMove(), want = w.m > .15;
    if (R.guard) { R.gt += dt; R.anim = 'guard'; if (!keys.has('l') && R.gt > .12) R.guard = false; }
    else if (R.veil > 0) { R.veil -= dt; mvT(R, R.vd[0] * 9 * dt, R.vd[1] * 9 * dt); }
    else if (!R.a && !dead && !won && (want)) {
      let vx = w.x + w.y, vy = w.y - w.x;
      const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
      mvT(R, vx * 3.2 * dt, vy * 3.2 * dt); R.fx = vx; R.fy = vy; R.face = snap8(deg(Math.atan2(vy, vx))); R.mv += dt; R.anim = 'walk';
    }
    else if (!R.a) { R.anim = 'idle'; }
    if (R.ht > 0 && !R.a && !R.guard) R.anim = 'hit';
    cam.fx += (R.x - cam.fx) * Math.min(1, dt * 5); cam.fy += (R.y - cam.fy) * Math.min(1, dt * 5);
    const [rtx, rty] = w2t(R.x, R.y);
    const z = ZONES.find(z => rtx >= z[0] && rtx < z[2] && rty >= z[1] && rty < z[3]);
    if (z && z[4] !== zone) { zone = z[4]; zt = 3.5; }
    if (!bossOn && rty > 25.6) { bossOn = true; world.M[24][29] = 1; world.M[24][30] = 1; const b = mkH(30.5, 29.5, '', true); H.push(b); say(b.x, b.y - 32, 'THE WAY CLOSES', 2.5); }
    const a = R.a;
    if (a) {
      a.t += dt; R.anim = a.slot;
      const f = Math.min(5, Math.floor(a.t * animFps(a.slot)));
      for (const hf of a.move.hit_frames) {
        if (hf !== f || a.hitDone.has(f)) continue;
        a.hitDone.add(f);
        if (a.slot === 'launcher') {
          a.land = 1; R.ct = 1.3;
          H.slice().forEach(h => {
            if (h.st === 'dying') return;
            const dx = h.x - R.x, dy = h.y - R.y, d = Math.hypot(dx, dy) || .01;
            if (d < 1.9 * TILE) {
              const push = .7 * TILE; h.x += dx / d * push; h.y += dy / d * push; h.tx = h.x / TILE + MW / 2; h.ty = h.y / TILE + MH / 2;
              sealDmg(h, 4 / a.move.hit_frames.length);
              spark(h.x, h.y, 26, 10, 200, '#fff3d8', .6);
            }
          });
          slashAt(R.x, R.y, { x: R.x + R.fx * 40, y: R.y + R.fy * 40 }, true);
          hitstop = Math.max(hitstop, 4); shakeCam(.25);
        } else {
          const reach = a.cur.reach || 1.5 * TILE;
          H.slice().forEach(h => {
            if (h.st === 'dying') return;
            const dx = h.x - R.x, dy = h.y - R.y, d = Math.hypot(dx, dy) || .01;
            if (d < reach + 8 && angDiff(deg(Math.atan2(dy, dx)), R.face) <= a.cur.arc) {
              a.land = 1; R.chain++; R.ct = 1.3; R.ash = Math.min(5, R.ash + 1);
              const push = .25 * TILE; h.x += dx / d * push; h.y += dy / d * push; h.tx = h.x / TILE + MW / 2; h.ty = h.y / TILE + MH / 2;
              if (h.st === 'wind' && h.ty2 === 0) { h.st = 'stag'; h.tm = .4; }
              sealDmg(h, 1 + R.chain * .5); say(h.x, h.y - 16, R.chain > 2 ? 'CHAIN x' + R.chain : a.move.name, .7);
              spark((R.x + h.x) / 2, (R.y + h.y) / 2, 26, 8, 190, '#ffe2b0', .6);
              slashAt(R.x, R.y, h, false); hitstop = Math.max(hitstop, 3); shakeCam(.15);
            }
          });
        }
      }
      if (a.t >= 6 / animFps(a.slot)) { if (!a.land) R.lock = .35; R.a = null; }
    }
    if (dead || won) endT += dt;
  }
  function updateHosts(dt: number) {
    H.forEach(h => {
      h.t += dt; h.fl -= dt; h.tm -= dt;
      if (h.st === 'dying') { h.anim = 'death'; h.dt = (h.dt || 0) + dt; return; }
      const dx = R.x - h.x, dy = R.y - h.y, d = Math.hypot(dx, dy) || .01, k = h.boss ? 1.3 : 1;
      if (h.st === 'sl') { h.anim = 'idle'; if (d < 4.5 * TILE) { h.st = 'ap'; h.cd = .8; } return; }
      h.reg += dt; if (h.st !== 'broken' && h.seal < h.smax && h.reg > .6) h.seal = Math.min(h.smax, h.seal + (R.chain ? .4 : 1.6) * dt);
      if (h.st === 'ap') {
        h.anim = 'walk'; h.cd -= dt; h.face = snap8(deg(Math.atan2(dy, dx)));
        if (d > 1.1 * TILE) { h.x += dx / d * h.sp * dt; h.y += dy / d * h.sp * dt; h.tx = h.x / TILE + MW / 2; h.ty = h.y / TILE + MH / 2; }
        if (h.cd <= 0 && d < 2.4 * k * TILE) {
          h.ty2 = (d > 1.2 * TILE || Math.random() < .35) ? 1 : 0; if (h.boss) h.ty2 = Math.random() < .5 ? 1 : 0;
          h.st = 'wind'; h.tm = h.ty2 ? (h.boss ? .85 : 1) : (h.boss ? .5 : .55); h.mt = h.tm;
          if (h.ty2) say(h.x, h.y - 40, 'UNBLOCKABLE', 1);
        }
      }
      else if (h.st === 'wind' && h.tm <= 0) {
        h.anim = 'attack1';
        if (h.ty2 === 1) { if (d < 1.8 * k * TILE) hurt(true); }
        else if (d < 1.5 * k * TILE) {
          if (R.dwin > 0 && R.a) { h.st = 'stag'; h.tm = .9; R.ct = 1.3; R.chain++; sealDmg(h, 3); say(R.x, R.y - 24, 'DEFLECT', 1); snd(800, .1); shake = 5; stripFx('hitspark', R.x, R.y - 10, 30, { fps: 30, scale: .7, tint: '#bcd6ff' }); }
          else hurt(false);
        }
        if (h.st === 'wind') { h.st = 'rec'; h.tm = .7; }
      }
      else if (h.st === 'wind') { h.anim = 'attack1'; }
      else if ((h.st === 'rec' || h.st === 'stag') && h.tm <= 0) { h.st = 'ap'; h.cd = (h.boss ? .6 : 1) + Math.random() * .8; h.anim = 'idle'; }
      else if (h.st === 'broken') { h.anim = 'hit'; h.broken -= dt; if (h.broken <= 0) { h.seal = h.smax; h.st = 'ap'; h.cd = 1.2; } }
      else if (h.st === 'stag') { h.anim = 'hit'; }
    });
    H = H.filter(h => h.st !== 'dying' || h.dt < 1.9);
  }
  function updateCam() {
    const want = cam.target;
    const d = ((want - cam.ang + 540) % 360) - 180;
    cam.ang += d * (1 - Math.exp(-9 * TICK));
    if (Math.abs(d) < .05) cam.ang = want;
  }
  function simTick() {
    tick++; t += TICK;
    texts.forEach(x => x.t -= TICK); texts = texts.filter(x => x.t > 0); zt -= TICK;
    updateCam();
    if (hitstop > 0) { hitstop--; return; }
    if (!UI.open) {
      consumeBuffer(); updatePlayer(TICK); updateHosts(TICK); updateFx(TICK);
      if (dead && endT > 1.2 && UI.open == null) { /* wait for key */ }
    }
    else { updateFx(TICK * 0.25); }
    cam.shake = Math.max(0, cam.shake - TICK * 1.7);
    const m = cam.shake * cam.shake * 9 + shake * shake * .02;
    cam.shx = opt.shake && m > .05 ? Math.round(m * .6 * Math.sin(tick * 1.1)) : 0;
    cam.shy = opt.shake && m > .05 ? Math.round(m * .6 * Math.sin(tick * 1.3 + 2.1)) : 0;
    shake *= .85;
  }
  function rotate(d: number) { cam.target += 45 * d; }
  function slashAt(ax: number, ay: number, h: any, big: boolean) {
    const sa = deps.project(ax, ay, 26), sb = deps.project(h.x, h.y, 26);
    const sang = Math.atan2(sb[1] - sa[1], sb[0] - sa[0]);
    stripFx('slash', (ax + h.x) / 2, (ay + h.y) / 2, 26, { fps: big ? 20 : 24, scale: big ? 1.2 : .75, ang: sang, tint: EL[pa] || '#fff' });
  }

  return {
    R, cam, input,
    parts, rings, nums, flashes,
    BRZ, REST,
    get H() { return H; },
    get CHESTS() { return CHESTS; },
    get texts() { return texts; },
    get pa() { return pa; },
    get tick() { return tick; },
    get hitstop() { return hitstop; },
    get dead() { return dead; },
    get won() { return won; },
    get zone() { return zone; },
    get zt() { return zt; },
    get endT() { return endT; },
    get t() { return t; },
    get bossOn() { return bossOn; },
    get bossDone() { return bossDone; },
    get world() { return world; },
    vfxTint,
    press, reset, rotate, simTick,
  };
}

export type HollowApi = ReturnType<typeof createHollow>;
