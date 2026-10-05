// Every fighter must chain from a J-mash without crashing (Floor Voice
// regression: missing attack3 used to throw on hit_frames of undefined).
import { describe, expect, test } from 'vitest';
import { bootGame } from '../test/harness';

const FIGHTERS = [
  'ren_calder', 'sera_quill', 'kade_morr', 'bram_holt', 'nyx_lumen', 'orin_vale',
  'mairen_solas', 'irix_venn', 'juno_rake', 'cinder', 'the_carapace', 'floor_voice',
];

describe('roster chains', () => {
  for (const pid of FIGHTERS) {
    test(pid + ' chains past 1 hit', { timeout: 120000 }, () => {
      const h = bootGame({
        file: 'src/legacy/combat.ts',
        moveData: 'veilspire_iso/veilspire_iso.json',
        search: '?p1=' + pid,
      });
      h.pump(3);
      h.key('keydown', 'enter');
      h.pump(5);
      h.key('keydown', 'd');
      h.pump(70);
      h.key('keyup', 'd');
      for (let i = 0; i < 480; i++) {
        if (i % 8 === 0) h.key('keydown', 'j');
        if (i % 8 === 4) h.key('keyup', 'j');
        h.pump(1);
      }
      expect(h.sb.__vs.combo.max).toBeGreaterThan(1);
    });
  }
});
