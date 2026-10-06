// Shared overlay + control wiring. Both legacy roots carried identical copies
// of the overlay stack, virtual stick, action buttons, camera/mute buttons and
// canvas mouse bindings; they now come from here.
import { $ } from '../engine/dom';
import { snd, toggleMute } from '../engine/audio';

export interface OverlayState {
  open: string | null;
}

export interface OverlayOpts {
  /** element ids that steal focus when their overlay opens */
  focus?: Record<string, string>;
  /** run after an overlay closes so the frame clock does not jump */
  onResume?: () => void;
}

/** Overlay stack: only one panel is 'on' at a time and gameplay input is muted. */
export function createOverlay(UI: OverlayState, keys: Set<string>, opts: OverlayOpts = {}) {
  const show = (id: string) => {
    if (UI.open) $(UI.open).classList.remove('on');
    UI.open = id;
    keys.clear();
    $(id).classList.add('on');
    document.body.style.overflow = 'hidden';
    const f = opts.focus && opts.focus[id] && $(opts.focus[id]);
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* stub DOM */ } }
  };
  const hide = () => {
    if (!UI.open) return;
    $(UI.open).classList.remove('on');
    UI.open = null;
    document.body.style.overflow = '';
    if (opts.onResume) opts.onResume();
  };
  return { show, hide, go: (id: string) => { hide(); show(id); }, get open() { return UI.open; } };
}

export interface StickOpts {
  touchMove: { x: number; y: number };
  /** called on first stick engage so the sim can drop its bot idle */
  onDown?: () => void;
  onShow?: () => void;
}

/** Virtual stick plus coarse-pointer detection; reveals the touch bar. */
export function bindStick(o: StickOpts) {
  const bar = $('touch');
  const show = () => { bar.classList.add('show'); document.body.classList.add('gb'); if (o.onShow) o.onShow(); };
  if (matchMedia('(pointer:coarse)').matches) show();
  addEventListener('touchstart', show, { once: true, passive: true });

  const stick = $('stick'), knob = $('knob');
  let stickId: number | null = null;
  const move = (e: any) => {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    o.touchMove.x = Math.abs(dx) < .15 ? 0 : dx;
    o.touchMove.y = Math.abs(dy) < .15 ? 0 : dy;
    knob.style.transform = `translate(${dx * 36}px,${dy * 36}px)`;
  };
  stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); if (o.onDown) o.onDown(); move(e); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) move(e); });
  const end = (e: any) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    o.touchMove.x = 0; o.touchMove.y = 0;
    knob.style.transform = '';
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
}

/**
 * Touch action buttons. Guard is hold-to-guard: it presses once like every
 * other action and keeps 'l' in the keys set until release.
 */
export function bindActionButtons(o: {
  UI: OverlayState;
  keys: Set<string>;
  press: (a: string) => void;
  onPause: () => void;
  /** runs before every press, so the sim can drop its idle behaviour */
  onPress?: () => void;
}) {
  document.querySelectorAll('#btns button[data-a]').forEach((b: any) => {
    const a = b.dataset.a;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (o.UI.open) return;
      if (a === 'guard') o.keys.add('l');
      if (o.onPress) o.onPress();
      o.press(a);
      b.classList.add('dn');
    });
    const up = () => {
      b.classList.remove('dn');
      if (a === 'guard') o.keys.delete('l');
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  });
  const bPause = $('bPause');
  if (bPause) bPause.addEventListener('pointerdown', e => { e.preventDefault(); if (!o.UI.open) o.onPause(); });
}

/** Camera rotate buttons shared by both modes (Q/C or Q/E on keyboard). */
export function bindCamButtons(rotate: (d: number) => void) {
  $('camL').onclick = (e: any) => { rotate(-1); e.currentTarget.blur(); };
  $('camR').onclick = (e: any) => { rotate(1); e.currentTarget.blur(); };
}

/** Left-click light / right-click special, matching the J/K bindings. */
export function bindCanvasButtons(o: { UI: OverlayState; press: (a: string) => void; blurFocus?: boolean }) {
  $('c').addEventListener('mousedown', e => {
    if (o.UI.open) return;
    if (e.button === 0) { e.preventDefault(); o.press('light'); }
    else if (e.button === 2) { e.preventDefault(); o.press('special'); }
    const active = document.activeElement as any;
    if (o.blurFocus && active && active.blur) active.blur();
  });
  $('stage').addEventListener('contextmenu', e => e.preventDefault());
}

/** Mute toggles in the title and pause overlays, with the shared click sound. */
export function bindMuteButtons() {
  const m = () => { toggleMute(); snd(660, .05); };
  $('mMute').onclick = m;
  $('pMute').onclick = m;
}

/** Holds released on window blur so the fighter does not walk off alone. */
export function bindKeyRelease(keys: Set<string>) {
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    if (k === 'h') keys.delete('l');
    if (k === ' ') e.preventDefault();
  });
  addEventListener('blur', () => keys.clear());
}