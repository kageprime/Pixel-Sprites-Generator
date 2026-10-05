// Vitest globalSetup: bundles both legacy entries (plus whatever engine
// modules they import) to plain browser JS with ../assets/art substituted by
// an injected stub DATA. Test files then run the bundle text in the vm
// sandbox via src/test/harness.ts (which stays synchronous).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export const stubMoveData = 'veilspire_iso/veilspire_iso.json';

export function cachePath(file: string): string {
  return `node_modules/.cache/veilspire/${file.replace(/\//g, '_')}.bundle.js`;
}

export default async function () {
  const moves = JSON.parse(readFileSync(stubMoveData, 'utf8'));
  const stubData = {
    M: {
      animations: moves.animations,
      characters: moves.characters.map((c: any) => ({
        id: c.id, name: c.name, weapon: c.weapon, role: c.role,
        title: c.title, attacks: c.attacks,
      })),
    },
    img: { shadow: 'data:,' },
  };
  mkdirSync('node_modules/.cache/veilspire', { recursive: true });
  for (const f of ['src/legacy/combat.ts', 'src/legacy/hollow.ts']) {
    const res = await build({
      entryPoints: [f],
      bundle: true,
      format: 'iife',
      write: false,
      logLevel: 'silent',
      plugins: [{
        name: 'art-stub',
        setup(b) {
          b.onResolve({ filter: /assets\/art$/ }, (args) => ({ path: args.path, namespace: 'art-stub' }));
        b.onLoad({ filter: /.*/, namespace: 'art-stub' }, () => ({
          contents: `export const DATA = ${JSON.stringify(stubData)};\n` +
            `export const M = DATA.M;\nexport const img = DATA.img;\n`,
          loader: 'js',
        }));
        },
      }],
    });
    writeFileSync(cachePath(f), res.outputFiles![0].text);
    console.log(`global-setup: bundled ${f}`);
  }
}
