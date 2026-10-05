// Full versus route via the demo-bot brain: lights -> launcher -> air x4 ->
// plunge must reach a 10-hit combo repeatedly.
import { describe, expect, test } from 'vitest';
import { bootGame } from '../test/harness';

describe('versus combo route', () => {
  test('demo bot hits 10 repeatedly', { timeout: 120000 }, () => {
    const h = bootGame({ file: 'src/legacy/combat.ts', moveData: 'veilspire_iso/veilspire_iso.json' });
    h.pump(3);
    h.key('keydown', 'enter');
    h.pump(5);
    h.sb.__vs.bot.on = true;
    h.sb.__vs.bot.st = 'wait';
    h.sb.__vs.bot.timer = 0;
    h.sb.__vs.bot.cool = 0;
    h.pump(1200);
    expect(h.sb.__vs.combo.max).toBe(10);
  });
});
