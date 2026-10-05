// Hollow I descent: title, reset state, cut/wheel/veil, kill->dying->sweep, boss.
import { describe, expect, test } from 'vitest';
import { bootGame } from '../test/harness';

function startRun() {
  const h = bootGame({ file: 'src/legacy/hollow.ts', moveData: 'veilspire_iso/veilspire_iso.json' });
  h.pump(5);
  expect(h.sb.__hollow.UI.open).toBe('title');
  h.sb.__hollow.UI.open = null;
  h.sb.__hollow.reset();
  return h;
}

describe('hollow descent', () => {
  test('boots to title, resets to 6 hosts', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    expect(H0.R.seal).toBe(4);
    expect(H0.R.ash).toBe(0);
    expect(H0.H.length).toBe(6);
  });

  test('cut cracks seal and builds chain + ash', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    const host = H0.H[0];
    H0.R.x = host.x - 20; H0.R.y = host.y;
    H0.R.tx = H0.R.x / 32 + 19; H0.R.ty = H0.R.y / 32 + 18;
    H0.R.fx = 1; H0.R.fy = 0;
    h.key('keydown', 'j'); h.pump(30); h.key('keyup', 'j');
    expect(host.seal).toBeLessThan(8);
    expect(H0.R.chain).toBe(1);
    expect(H0.R.ash).toBe(1);
  });

  test('wheel spends ash for heavy seal damage', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    const host = H0.H[0];
    H0.R.x = host.x - 20; H0.R.y = host.y;
    H0.R.tx = H0.R.x / 32 + 19; H0.R.ty = H0.R.y / 32 + 18;
    H0.R.fx = 1; H0.R.fy = 0;
    H0.R.ash = 5;
    h.key('keydown', 'k'); h.pump(60); h.key('keyup', 'k');
    expect(host.seal).toBeLessThan(6.5);
    expect(H0.R.ash).toBe(3);
  });

  test('kill plays dying then sweeps', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    const host = H0.H[0];
    const n0 = H0.H.length;
    for (let w = 0; w < 8 && H0.H.includes(host); w++) {
      H0.R.x = host.x - 20; H0.R.y = host.y;
      H0.R.fx = 1; H0.R.fy = 0; H0.R.ash = 5; H0.R.a = null; H0.R.lock = 0;
      h.key('keydown', 'k'); h.pump(45); h.key('keyup', 'k');
    }
    expect(host.st).toBe('dying');
    h.pump(150);
    expect(H0.H.length).toBe(n0 - 1);
  });

  test('boss spawns past Depth III threshold', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    H0.R.tx = 30.5; H0.R.ty = 30;
    H0.R.x = (30.5 - 19) * 32; H0.R.y = (30 - 18) * 32;
    h.pump(30);
    expect(H0.H.some((x: any) => x.boss)).toBe(true);
    expect(H0.H.length).toBe(7);
  });

  test('cut chains attack1 -> attack2 with distinct sheets', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    h.key('keydown', 'j'); h.pump(20);
    expect(H0.R.a.slot).toBe('attack1');
    h.key('keydown', 'j'); h.pump(5);
    expect(H0.R.a.slot).toBe('attack2');
  });

  test('wheel plays the launcher sheet and spends ash', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    H0.R.ash = 5;
    h.key('keydown', 'k'); h.pump(5);
    expect(H0.R.a.slot).toBe('launcher');
    expect(H0.R.a.move.hit_frames.length).toBeGreaterThan(0);
    expect(H0.R.ash).toBe(3);
  });

  test('guard blocks a light hit without cracking the seal', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    const host = H0.H[0];
    H0.R.x = host.x - 20; H0.R.y = host.y;
    H0.R.guard = true; H0.R.gt = 0; H0.R.inv = 0; H0.R.veil = 0;
    host.st = 'wind'; host.tm = 0; host.mt = 1; host.ty2 = 0;
    host.x = H0.R.x + 20; host.y = H0.R.y; host.tx = host.x / 32 + 19; host.ty = host.y / 32 + 18;
    h.pump(5);
    expect(H0.R.seal).toBe(4);
    expect(H0.R.guard).toBe(false);
  });

  test('guard breaks on an unblockable hit', () => {
    const h = startRun();
    const H0 = h.sb.__hollow;
    const host = H0.H[0];
    H0.R.x = host.x - 20; H0.R.y = host.y;
    H0.R.guard = true; H0.R.gt = 0; H0.R.inv = 0; H0.R.veil = 0;
    host.st = 'wind'; host.tm = 0; host.mt = 1; host.ty2 = 1;
    host.x = H0.R.x + 20; host.y = H0.R.y; host.tx = host.x / 32 + 19; host.ty = host.y / 32 + 18;
    h.pump(5);
    expect(H0.R.seal).toBe(3);
    expect(H0.R.guard).toBe(false);
  });
});
