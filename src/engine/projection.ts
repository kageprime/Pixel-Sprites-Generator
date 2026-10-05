// Isometric camera math shared by both renderers (both legacy copies used
// the same formula; duel additionally eases py/zoom per-frame, hollow adds
// DPRS into Z — all inputs are explicit parameters here).
import { wrap } from './math';

export interface Camera {
  ang: number;
  target: number;
  c: number;
  s: number;
  fx: number;
  fy: number;
  py: number;
  Z: number;
  frx: number;
  fry: number;
  shx: number;
  shy: number;
  zoom: number;
  /** focus-height lift (duel chase cam); hollow leaves it unset */
  fz?: number;
}

/** Basis vectors + focus point from angle/focus. Z (zoom scale) is owned by the caller. */
export function setCamMatrix(cam: Camera): void {
  const a = (cam.ang * Math.PI) / 180;
  cam.c = Math.cos(a);
  cam.s = Math.sin(a);
  cam.frx = cam.fx * cam.c - cam.fy * cam.s;
  cam.fry = (cam.fx * cam.s + cam.fy * cam.c) * cam.py - (cam.fz || 0);
}

export function proj(
  cam: Camera, vw: number, vh: number,
  x: number, y: number, z: number,
): [number, number] {
  const rx = x * cam.c - y * cam.s;
  const ry = x * cam.s + y * cam.c;
  return [
    vw / 2 + cam.Z * (rx - cam.frx) + cam.shx,
    vh / 2 + vh * 0.035 + cam.Z * (ry * cam.py - z - cam.fry) + cam.shy,
  ];
}

export const depthOf = (cam: Camera, x: number, y: number): number =>
  x * cam.s + y * cam.c;

export const rowOf = (cam: Camera, face: number): number =>
  Math.round(wrap(face + cam.ang) / 45) % 8;
