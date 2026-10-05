// Shared DOM/canvas helpers (both legacy copies were identical).
// $ is intentionally `any`: every call site touches element-specific
// members (textContent, disabled, getContext, style...). Proper narrowing
// happens in Phase 3 when the React shell owns these elements.
export const $ = (id: string): any => document.getElementById(id);

export function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function poly(g: any, pts: number[][]): void {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
}
