// Practice boot flow: title only, Enter drops straight into the ring,
// compact fighter popup opens/closes, arena locked to day.
import { describe, expect, test } from 'vitest';
import { bootGame, opened, closed } from '../test/harness';

describe('practice boot flow', () => {
  test('boots to title, no intro', () => {
    const h = bootGame({ file: 'src/legacy/combat.ts', moveData: 'veilspire_iso/veilspire_iso.json' });
    h.pump(5);
    const o = opened(h);
    expect(o).toContain('title');
    expect(o).not.toContain('intro');
  });

  test('Enter on title goes straight into the ring', () => {
    const h = bootGame({ file: 'src/legacy/combat.ts', moveData: 'veilspire_iso/veilspire_iso.json' });
    h.pump(5);
    h.onLog.length = 0;
    h.key('keydown', 'enter');
    h.pump(5);
    const after = opened(h);
    expect(after).not.toContain('sel');
    expect(after).not.toContain('bout');
    expect(after).not.toContain('intro');
    expect(closed(h)).toContain('title');
  });

  test('Fighter button opens popup, Esc resumes run', () => {
    const h = bootGame({ file: 'src/legacy/combat.ts', moveData: 'veilspire_iso/veilspire_iso.json' });
    h.pump(5);
    h.key('keydown', 'enter');
    h.pump(5);
    h.onLog.length = 0;
    h.ids['openSel'].onclick({ currentTarget: { blur: () => {} } });
    h.pump(2);
    expect(opened(h)).toContain('sel');
    h.onLog.length = 0;
    h.key('keydown', 'escape');
    expect(closed(h)).toContain('sel');
  });

  test('fight advances the sim, arena locked to day', () => {
    const h = bootGame({ file: 'src/legacy/combat.ts', moveData: 'veilspire_iso/veilspire_iso.json' });
    h.pump(5);
    h.key('keydown', 'enter');
    h.pump(5);
    h.key('keydown', 'j');
    h.pump(30);
    h.key('keyup', 'j');
    expect(h.sb.__vs.tick).toBeGreaterThan(0);
    expect(h.sb.__vs.arena).toBe('day');
  });
});
