// Vitest globalSetup: bundles both legacy entries (plus whatever engine
// modules they import) to plain browser JS with ../assets/art substituted by
// an injected stub DATA. Test files then run the bundle text in the vm
// sandbox via src/test/harness.ts (which stays synchronous).
//
// Bundle cache is fingerprinted by mtime+size of the entry and every local
// file it can reach, so source edits always rebuild. (An unfingerprinted
// cache caused stale-bundle false failures before.)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const stubMoveData = 'veilspire_iso/veilspire_iso.json';
const CACHE_DIR = 'node_modules/.cache/veilspire';

function reachableSources(entry: string): string[] {
  const seen = new Set<string>();
  const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);
  const norm = (p: string) => {
    const parts: string[] = [];
    for (const seg of p.split('/')) {
      if (seg === '.' || seg === '') continue;
      else if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return parts.join('/');
  };
  const out: string[] = [];
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    try {
      const st = statSync(f);
      if (!st.isFile()) continue;
      out.push(f);
      if (f.endsWith('.ts')) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
          let p = m[1];
          if (!p.endsWith('.ts')) p += '.ts';
          queue.push(norm(dirOf(f) + p));
        }
      }
    } catch { /* ignore missing */ }
  }
  return out;
}

export function cachePath(file: string): string {
  const h = createHash('sha1');
  for (const f of reachableSources(file)) {
    try {
      const st = statSync(f);
      h.update(f + st.mtimeMs + st.size);
    } catch { /* ignore */ }
  }
  const base = file.replace(/\//g, '_');
  return `${CACHE_DIR}/${base}.${h.digest('hex').slice(0, 12)}.bundle.js`;
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
  mkdirSync(CACHE_DIR, { recursive: true });
  // Sweep entries whose sources changed (fingerprint mismatch).
  for (const f of ['src/legacy/combat.ts', 'src/legacy/hollow.ts']) {
    const want = cachePath(f);
    try {
      for (const old of readdirSync(CACHE_DIR)) {
        const base = f.replace(/\//g, '_');
        if (old.startsWith(base + '.') && old !== want.slice(CACHE_DIR.length + 1)) {
          unlinkSync(`${CACHE_DIR}/${old}`);
        }
      }
    } catch { /* ignore */ }
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
    writeFileSync(want, res.outputFiles![0].text);
    console.log(`global-setup: bundled ${f}`);
  }
}
