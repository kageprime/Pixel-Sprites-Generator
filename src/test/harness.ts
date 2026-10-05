// Shared headless harness for the legacy game modules (ported from the
// pre-Vite vm harnesses). Runs a legacy .ts file's text in a vm sandbox with
// stub DOM/canvas/media APIs, a queued rAF model (pages run TWO rAF chains:
// main loop + select-preview loop), and a virtual clock.
//
// The DATA import line is swapped for an injected stub (real move data from
// veilspire_iso.json, minimal image set) so tests don't need built art.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cachePath } from './global-setup';

export interface HarnessOpts {
  /** repo-relative legacy module, e.g. 'src/legacy/combat.ts' */
  file: string;
  /** repo-relative move-data json, e.g. 'veilspire_iso/veilspire_iso.json' */
  moveData: string;
  /** extra DATA.img keys (default: shadow only, enough to make boot async) */
  img?: Record<string, string>;
  search?: string;
  innerWidth?: number;
  innerHeight?: number;
}

function mkCtx(): any {
  return new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === 'measureText') return () => ({ width: 10 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return (..._a: any[]) => {};
      },
      set: () => true,
    },
  );
}

function mkEl(id: string): any {
  return {
    id,
    dataset: {},
    style: { setProperty: () => {} },
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
    },
    textContent: '',
    innerHTML: '',
    width: 300,
    height: 150,
    disabled: false,
    onclick: null,
    onmouseenter: null,
    onmouseleave: null,
    onfocus: null,
    onblur: null,
    addEventListener: () => {},
    blur: () => {},
    focus: () => {},
    remove: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    getContext: () => mkCtx(),
    querySelector: () => mkEl(id + '>q'),
    querySelectorAll: () => [],
    setAttribute: () => {},
    getAttribute: () => null,
  };
}

export interface GameHarness {
  sb: any;
  ids: Record<string, any>;
  /** run async queue + n frames (16.7ms virtual clock) */
  pump: (n: number) => void;
  flush: () => void;
  key: (type: string, k: string, repeat?: boolean) => void;
  onLog: string[];
}

export function bootGame(o: HarnessOpts): GameHarness {
  // The entry is bundled by src/test/global-setup.ts (vitest globalSetup)
  // with stub DATA; here we just load the bundle text into the sandbox.
  let js: string;
  try {
    js = readFileSync(process.cwd() + '/' + cachePath(o.file), 'utf8');
  } catch {
    throw new Error(`test bundle missing for ${o.file} — globalSetup did not run`);
  }

  const asyncQ: Array<() => void> = [];
  let rafQ: Array<(t: number) => void> = [];
  let simNow = 1000;
  const handlers: Record<string, Array<(e: any) => void>> = {};
  const onLog: string[] = [];
  const ids: Record<string, any> = {};

  const el = (id: string) => {
    if (!ids[id]) {
      ids[id] = mkEl(id);
      const cls = ids[id].classList;
      ids[id].classList = {
        add: (c: string) => { onLog.push(id + '+' + c); cls.add(c); },
        remove: (c: string) => { onLog.push(id + '-' + c); cls.remove(c); },
        toggle: (c: string, f?: boolean) => cls.toggle(c, f),
      };
    }
    return ids[id];
  };

  const sb: any = {
    console,
    performance: { now: () => simNow },
    URLSearchParams,
    setInterval: () => 0,
    clearInterval: () => {},
    clearTimeout: () => {},
    setTimeout: (fn: () => void) => { asyncQ.push(fn); return asyncQ.length; },
    requestAnimationFrame: (cb: (t: number) => void) => { rafQ.push(cb); return rafQ.length; },
    addEventListener: (ev: string, fn: (e: any) => void) => {
      (handlers[ev] = handlers[ev] || []).push(fn);
    },
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    Image: function (this: any) {
      const img: any = {};
      asyncQ.push(() => img.onload && img.onload());
      return img;
    },
    document: {
      getElementById: (id: string) => el(id),
      querySelector: (s: string) => mkEl('q:' + s),
      querySelectorAll: () => [],
      createElement: (t: string) => mkEl(t),
      body: mkEl('body'),
      activeElement: null,
    },
    window: {},
    innerWidth: o.innerWidth ?? 1280,
    innerHeight: o.innerHeight ?? 800,
    location: { search: o.search ?? '' },
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(js, sb, { filename: o.file });

  const flush = () => { let n = 0; while (asyncQ.length && n++ < 2000) asyncQ.shift()!(); };
  const pump = (n: number) => {
    flush();
    for (let i = 0; i < n; i++) {
      simNow += 16.7;
      const cbs = rafQ;
      rafQ = [];
      cbs.forEach((cb) => cb(simNow));
      flush();
    }
  };
  const key = (type: string, k: string, repeat = false) =>
    (handlers[type] || []).forEach((f) =>
      f({ key: k, preventDefault: () => {}, repeat, metaKey: false, ctrlKey: false, altKey: false }),
    );
  return { sb, ids, pump, flush, key, onLog };
}

/** overlay ids that received an 'on' class since the log was cleared */
export function opened(h: GameHarness): string[] {
  return h.onLog.filter((e) => e.endsWith('+on')).map((e) => e.slice(0, -3));
}

export function closed(h: GameHarness): string[] {
  return h.onLog.filter((e) => e.endsWith('-on')).map((e) => e.slice(0, -3));
}
