// Shared math: angles, interpolation, deterministic hashes.
// Extracted verbatim from the legacy pages (both copies were identical).
export const TAU = Math.PI * 2;
export const TICK = 1 / 60;

export const rad = (d: number): number => (d * Math.PI) / 180;
export const deg = (r: number): number => (r * 180) / Math.PI;
export const wrap = (a: number): number => ((a % 360) + 360) % 360;
export const snap8 = (a: number): number => wrap(Math.round(a / 45) * 45);
export const angDiff = (a: number, b: number): number =>
  Math.abs(((a - b + 540) % 360) - 180);
export const clamp = (v: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const rnd = (a = 1, b?: number): number =>
  b === undefined ? Math.random() * a : a + Math.random() * (b - a);
// Deterministic 2D hash in [0,1) — tile picks, scatter, palette pools.
export const hash = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
