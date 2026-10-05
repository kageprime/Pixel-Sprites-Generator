// Shared move data + tuning: fighter roster, per-slot metadata, style stats.
// Single source of truth for both the versus ring and Hollow (previously the
// duel page owned the only copy; Hollow hardcoded attack1/attack3).
// META/MOVE are live objects rebuilt by setP1 whenever the fighter changes.
import { M } from '../assets/art';

export interface AttackMeta {
  slot: string;
  style: string;
  name: string;
  hit_frames: number[];
  startup: number;
  cancel_from: number;
  tags: string[];
  air: boolean;
  [prop: string]: any;
}

export interface MoveTuning {
  lunge: number;
  reach: number;
  arc: number;
  kb: number;
  stun: number;
  hs: number | number[];
  shake: number | number[];
  push: number | number[];
  kind: string;
  dmg: number[];
  vz?: number | number[];
  pop?: number;
  radius?: number;
  fwd?: number;
  [prop: string]: any;
}

export const CHR: Record<string, any> = {};
M.characters.forEach((c: any) => { CHR[c.id] = c; });

export const META: Record<string, AttackMeta> = {};
export const MOVE: Record<string, MoveTuning> = {
  launcher: { lunge: 45, reach: 56, arc: 60, kb: 18, stun: 0.5, vz: [330, 345], hs: [6, 4], shake: [0.3, 0.15], push: [0.08, 0], kind: 'launch', dmg: [55, 55] },
  air1: { lunge: 50, reach: 64, arc: 72, kb: 30, stun: 0.5, pop: 150, hs: 4, shake: 0.14, push: 0, kind: 'air', dmg: [45, 45] },
  plunge: { lunge: 0, reach: 0, arc: 360, kb: 30, stun: 0.5, radius: 52, fwd: 16, hs: 11, shake: 0.7, push: 0.13, kind: 'spike', dmg: [130] },
} as Record<string, MoveTuning>;

const L = (o: Partial<MoveTuning>): MoveTuning =>
  Object.assign({ kb: 80, stun: 0.5, hs: 5, shake: 0.16, push: 0, kind: 'light', dmg: [70] }, o) as MoveTuning;

export const STYLE: Record<string, MoveTuning> = {
  slam: L({ lunge: 95, reach: 58, arc: 62 }),
  sweep: L({ lunge: 70, reach: 68, arc: 85, kb: 100, shake: 0.2 }),
  bash: L({ lunge: 140, reach: 56, arc: 50, kb: 150, vz: 150, hs: 9, shake: 0.5, push: 0.1, kind: 'heavy', dmg: [110] }),
  slash: L({ lunge: 90, reach: 62, arc: 70 }),
  thrust: L({ lunge: 110, reach: 78, arc: 34, kb: 90 }),
  whirl: L({ lunge: 50, reach: 62, arc: 140, kb: 120, shake: 0.2 }),
  flurry: L({ lunge: 80, reach: 56, arc: 60, kb: 60, hs: 3, shake: 0.1, dmg: [28, 28, 28] }),
  cast: L({ lunge: 0, reach: 92, arc: 80, kb: 100, shake: 0.2, dmg: [65] }),
  pulse: L({ lunge: 0, reach: 84, arc: 120, kb: 130, shake: 0.25, dmg: [65] }),
};

const FALLBACK_CUT: AttackMeta = {
  slot: 'attack1', style: 'slash', name: 'Fallback cut',
  hit_frames: [2], startup: 2, cancel_from: 4, tags: [], air: false,
};

/** Rebuild META/MOVE for a fighter (e.g. fighters missing attack3 get a safe fallback). */
export function setP1(id: string): void {
  for (const k in META) delete META[k];
  CHR[id].attacks.forEach((a: AttackMeta) => { META[a.slot] = a; });
  (['attack1', 'attack2', 'attack3'] as const).forEach((s) => {
    if (!META[s]) META[s] = { ...FALLBACK_CUT, slot: s };
    MOVE[s] = STYLE[META[s].style] || STYLE.slash;
  });
}

export const animFps = (a: string): number =>
  a.startsWith('attack')
    ? (M.animations as any).attack.fps
    : ((M.animations as any)[a] ? (M.animations as any)[a].fps : 12);

/** Ground light-chain order (cancel a move into the next). */
export const CHAIN_NEXT: Record<string, string> = {
  attack1: 'attack2', attack2: 'attack3', attack3: 'attack1', launcher: 'attack1',
};
