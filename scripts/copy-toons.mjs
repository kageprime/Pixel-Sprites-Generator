// Copies veilspire_toon/web/ -> public/toons/ so Vite dev/preview/build can
// serve toon skins at absolute /toons/ URLs. Output is gitignored and
// regenerable (runs on predev/prebuild); the 58MB source stays put.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'veilspire_toon', 'web');
const DST = join(ROOT, 'public', 'toons');

if (!existsSync(SRC)) {
  console.error('copy-toons: missing ' + SRC);
  process.exit(1);
}
mkdirSync(join(ROOT, 'public'), { recursive: true });
cpSync(SRC, DST, { recursive: true });
console.log('copy-toons: public/toons/ refreshed');
