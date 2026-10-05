// Shared WebAudio blips + mute store (both legacy copies were identical).
// Module-level state is safe: each page gets its own JS context, and both
// pages persist the same 'vs_mute' key.
import { $ } from './dom';

let AC: any = null;
let muted = false;
try {
  muted = localStorage.getItem('vs_mute') === '1';
} catch (e) {}

export function ac(): any {
  try {
    if (!AC) AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {}
  return AC;
}

export function snd(f: number, d: number, ty?: string): void {
  if (muted) return;
  try {
    const a = ac();
    if (!a) return;
    const o = a.createOscillator(), v = a.createGain();
    o.type = ty || 'square';
    o.frequency.value = f;
    v.gain.value = 0.05;
    o.connect(v);
    v.connect(a.destination);
    o.start();
    v.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d);
    o.stop(a.currentTime + d);
  } catch (e) {}
}

export function toggleMute(): void {
  muted = !muted;
  try {
    localStorage.setItem('vs_mute', muted ? '1' : '0');
  } catch (e) {}
  paintMute();
}

export function paintMute(): void {
  const t = 'Sound: ' + (muted ? 'off' : 'on');
  ['mMute', 'pMute'].forEach((id) => {
    const b = $(id);
    if (b) b.textContent = t;
  });
}

export function resumeAudio(): void {
  try {
    if (AC && AC.state === 'suspended') AC.resume();
  } catch (e) {}
}

export function isMuted(): boolean {
  return muted;
}
