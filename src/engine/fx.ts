// Shared particle/FX layer: procedural sparks + sprite-strip VFX.
// Both legacy pages carried identical copies (hollow's ES5-style defaults
// normalized to the default-parameter form — same behavior).
// Stores are created per call so each page (and each test) owns its own.
import { TICK, rnd, rad, TAU } from './math';
import { mk } from './dom';

export interface Particle {
  type: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  life: number;
  max: number;
  [prop: string]: any;
}

export interface FxRing { x: number; y: number; maxR: number; dur: number; t: number; col: string; w: number }
export interface FxNum { x: number; y: number; z: number; text: string; col: string; t: number }
export interface FxFlash { x: number; y: number; z: number; r: number; col: number[]; I: number; t: number; dur: number }

export const VFX: Record<string, { fw: number; fh: number; cols: number; frames: number }> = {
  slash: { fw: 64, fh: 47, cols: 3, frames: 9 },
  hitspark: { fw: 100, fh: 100, cols: 6, frames: 30 },
  fire: { fw: 100, fh: 100, cols: 8, frames: 16 },
};

// Attacker element tint per fighter (tbbk/CodeManu sheets are white).
export const EL: Record<string, string> = {
  bram_holt: '#ff7a3c', cinder: '#ffc46a', ren_calder: '#b07ae0', sera_quill: '#ffe9a8',
  kade_morr: '#9fe06a', nyx_lumen: '#8fc4ff', orin_vale: '#bfe8d8', mairen_solas: '#ffe9a8',
  irix_venn: '#a8dcff', juno_rake: '#ff9a4c', the_carapace: '#c07ae8', floor_voice: '#d8b8ff',
};

export interface FxOptions {
  fx: boolean;
}

export interface Fx {
  parts: Particle[];
  rings: FxRing[];
  nums: FxNum[];
  flashes: FxFlash[];
  spark: (x: number, y: number, z: number, n: number, spd: number, col: string, up?: number, dirA?: number | null) => void;
  dust: (x: number, y: number, n: number, spd: number, z?: number) => void;
  flare: (x: number, y: number, z: number, size: number) => void;
  ring: (x: number, y: number, maxR: number, dur: number, col: string, w?: number) => void;
  flash: (x: number, y: number, z: number, r: number, col: number[], I: number, dur?: number) => void;
  num: (x: number, y: number, z: number, text: string, col: string) => void;
  updateFx: (dt?: number) => void;
  vfxTint: (p: { key: string; tint?: string | null }) => any;
  stripFx: (key: string, x: number, y: number, z: number, o?: any) => void;
}

export function createFx(opt: FxOptions, IMG: Record<string, any>): Fx {
  const parts: Particle[] = [];
  const rings: FxRing[] = [];
  const nums: FxNum[] = [];
  const flashes: FxFlash[] = [];
  const tintCache: Record<string, any> = {};

  function spark(x: number, y: number, z: number, n: number, spd: number, col: string, up = 0.5, dirA: number | null = null) {
    for (let i = 0; i < n; i++) {
      const a = dirA === null ? rnd(TAU) : rad(dirA + rnd(-70, 70));
      const s = spd * rnd(0.35, 1.1);
      parts.push({
        type: 'spark', x, y, z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        vz: spd * rnd(0.1, 0.9) * up + rnd(20, 60),
        life: 0, max: rnd(0.18, 0.4), col, size: Math.random() < 0.3 ? 2 : 1, g: 620,
      });
    }
  }

  function dust(x: number, y: number, n: number, spd: number, z = 2) {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU), s = spd * rnd(0.3, 1);
      parts.push({
        type: 'dust', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rnd(14, 40),
        life: 0, max: rnd(0.35, 0.7), size: rnd(2, 5), g: -25,
      });
    }
  }

  const flare = (x: number, y: number, z: number, size: number) =>
    parts.push({ type: 'flare', x, y, z, vx: 0, vy: 0, vz: 0, life: 0, max: 0.13, size, g: 0 });
  const ring = (x: number, y: number, maxR: number, dur: number, col: string, w = 2) =>
    rings.push({ x, y, maxR, dur, t: 0, col, w });
  const flash = (x: number, y: number, z: number, r: number, col: number[], I: number, dur = 0.18) =>
    flashes.push({ x, y, z, r, col, I, t: 0, dur });
  const num = (x: number, y: number, z: number, text: string, col: string) =>
    nums.push({ x, y, z, text, col, t: 0 });

  function updateFx(dt: number = TICK) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt;
      if (p.type === 'dust') { p.vx *= 0.94; p.vy *= 0.94; }
      if (p.life >= p.max || (p.type === 'spark' && p.z < 0)) parts.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t >= rings[i].dur) rings.splice(i, 1); }
    for (let i = nums.length - 1; i >= 0; i--) { const n = nums[i]; n.t += dt; if (n.t > 0.9) nums.splice(i, 1); }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t >= flashes[i].dur) flashes.splice(i, 1); }
  }

  function vfxTint(p: { key: string; tint?: string | null }): any {
    const img = IMG['vfx/' + p.key];
    if (!img || !img.complete || !img.naturalWidth) return null;
    if (!p.tint) return img;
    const ck = p.key + p.tint;
    let c = tintCache[ck];
    if (!c) {
      c = mk(img.width, img.height);
      const g2 = c.getContext('2d');
      g2.drawImage(img, 0, 0);
      g2.globalCompositeOperation = 'source-in';
      g2.fillStyle = p.tint;
      g2.fillRect(0, 0, c.width, c.height);
      tintCache[ck] = c;
    }
    return c;
  }

  function stripFx(key: string, x: number, y: number, z: number, o?: any) {
    if (!opt.fx) return;
    o = Object.assign({ fps: 24, scale: 1, ang: 0, squash: 1, tint: null }, o || {});
    const V = VFX[key];
    if (!V) return;
    parts.push({
      type: 'strip', key, x, y, z, vx: 0, vy: 0, vz: 0, g: 0,
      life: 0, max: V.frames / o.fps, fps: o.fps, scale: o.scale,
      ang: o.ang, squash: o.squash, tint: o.tint,
    });
  }

  return { parts, rings, nums, flashes, spark, dust, flare, ring, flash, num, updateFx, vfxTint, stripFx };
}
