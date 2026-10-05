// Shared sprite loading: embedded DATA.img sheets + lazy toon files.
// The two pages carried near-identical copies; the unified version also fixes
// a latent hang (practice's img onerror never counted down, so one 404 would
// stall boot forever — failures now recover and report via onImgError).
export interface SpriteLoaderOpts {
  toonBase: string;
  busyOn: () => void;
  busyOff: () => void;
  onImgError?: (k: string) => void;
}

export function createSpriteLoader(
  IMG: Record<string, any>,
  DATA: { img: Record<string, string> },
  o: SpriteLoaderOpts,
) {
  function loadImgs(keys: string[], done: () => void) {
    keys = keys.filter((k) => DATA.img[k] && !IMG[k]);
    let n = keys.length;
    if (!n) return done();
    keys.forEach((k) => {
      const i = new Image();
      i.onload = () => { if (--n === 0) done(); };
      i.onerror = () => { if (o.onImgError) o.onImgError(k); if (--n === 0) done(); };
      i.src = DATA.img[k];
      IMG[k] = i;
    });
  }
  function loadToons(keys: string[], done: () => void, quiet?: boolean) {
    keys = keys.filter((k) => !IMG[k]);
    let n = keys.length;
    if (!n) return done();
    if (!quiet) o.busyOn();
    const fin = () => { if (--n === 0) { if (!quiet) o.busyOff(); done(); } };
    keys.forEach((k) => {
      const i = new Image();
      const url = k === 'toon/shadow' ? o.toonBase + '/shadow_standard.png' : o.toonBase + '/' + k.slice(5) + '.png';
      i.onload = () => { IMG[k] = i; fin(); };
      i.onerror = fin;
      i.src = url;
    });
  }
  return { loadImgs, loadToons };
}

export type SpriteLoader = ReturnType<typeof createSpriteLoader>;
