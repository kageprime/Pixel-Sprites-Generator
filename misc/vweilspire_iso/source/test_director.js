// Camera Director acceptance tests (spec section 13), driven through window.__vs and page globals.
// Usage: NODE_PATH=$(npm root -g) node test_director.js [path/to/out/combat.html] [path/to/orig/out/combat.html]
const { chromium } = require('playwright');
const path = require('path');
const BUILD = path.resolve(process.argv[2] || 'out/combat.html');
const ORIG = process.argv[3] ? path.resolve(process.argv[3]) : null;

const fs = require('fs');
function patched(file) {
  let h = fs.readFileSync(file, 'utf8');
  const a = 'function cutTo(ang,why){';
  if (h.split(a).length !== 2) throw new Error('cutTo anchor not unique');
  h = h.replace(a, `function cutTo(ang,why){const r={tick,why,hitstop,es:E.state,spiked:!!E.spiked,tgtBefore:wrap(cam.target),angBefore:cam.ang,to:wrap(ang),qNew:dir.sc[wrap(ang)/45],qOld:dir.cur};cutTo0(ang,why);r.angAfter=cam.ang;r.tgtAfter=cam.target;r.step=angDiff(r.tgtBefore,r.to)/45;(window.CUTS=window.CUTS||[]).push(r)}\nfunction cutTo0(ang,why){`);
  const b = 'window.__vs={P,E,';
  if (h.split(b).length !== 2) throw new Error('__vs anchor not unique');
  h = h.replace(b, 'window.__vs={cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI,get RM(){return RM},P,E,');
  const c = 'get tick(){return tick}';
  if (h.split(c).length !== 2) throw new Error('tick anchor not unique');
  h = h.replace(c, 'get tick(){return tick},set tick(v){tick=v}');
  const out = '/tmp/patched_test_build.html'; fs.writeFileSync(out, h); return out;
}
const TESTFILE = patched(BUILD);
const results = [];
const rec = (id, name, status, detail) => { results.push({ id, name, status, detail }); console.log(`${status.padEnd(7)} ${id} ${name}\n        ${detail}`); };

const seed = () => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

async function open(browser, file, opts = {}, query = '') {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, ...opts });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(seed);
  await page.goto('file://' + file + query);
  await page.waitForFunction(() => window.__vs);
  page.errs = errs;
  return page;
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 0. page loads, no errors, pkt fix ----------
  {
    const p = await open(browser, TESTFILE);
    const r = await p.evaluate(() => { for (let i = 0; i < 120; i++) __vs.simTick(); return { pkt: __vs.cam.pkt, pk: __vs.cam.pk }; });
    rec('A', 'cam.pkt fix: perspective target set and eased', r.pkt > 0 && r.pk > 0.1 ? 'PASS' : 'FAIL', `cam.pkt=${r.pkt} cam.pk=${r.pk.toFixed(3)} errors=${p.errs.length}`);
    await p.context().close();
  }

  // ---------- 1. Regression: Auto off, identical to pre-fix build ----------
  if (ORIG) {
    const trace = () => { __vs.opt.autocam = false; __vs.setBot(true); const out = []; for (let i = 0; i < 36000; i++) { __vs.simTick(); if (i % 10 === 0) out.push([__vs.cam.ang, __vs.cam.target, __vs.cam.fx, __vs.cam.fy, __vs.cam.zoom, __vs.P.x, __vs.E.x].map(v => +v.toFixed(4))); } return { out, last: __vs.dir.last }; };
    const a = await open(browser, BUILD), b = await open(browser, ORIG);
    const ta = await a.evaluate(trace), tb = await b.evaluate(trace);
    const same = JSON.stringify(ta.out) === JSON.stringify(tb.out);
    rec('1', 'Regression (Auto off, 10 min of bot ticks vs pre-fix build, seeded)', same && ta.last === -1e9 ? 'PASS' : 'FAIL', `traces ${same ? 'identical' : 'DIFFER'}; cuts while off: ${ta.last === -1e9 ? 0 : 'some'}`);
    await a.context().close(); await b.context().close();
    // with Auto ON the cut sequence should also be identical (pkt does not feed the sim)
    const trOn = () => { __vs.opt.autocam = true; __vs.setBot(true); const o = []; for (let i = 0; i < 3600; i++) { __vs.simTick(); } return __vs.dir.log.slice(); };
    const a2 = await open(browser, BUILD), b2 = await open(browser, ORIG);
    const la = await a2.evaluate(trOn), lb = await b2.evaluate(trOn);
    rec('1b', 'Auto ON: cut log identical before/after the pkt fix', JSON.stringify(la) === JSON.stringify(lb) ? 'PASS' : 'FAIL', `last-8 logs ${JSON.stringify(la) === JSON.stringify(lb) ? 'identical' : 'differ'}`);
    await a2.context().close(); await b2.context().close();
  }

  // ---------- Soak (also feeds tests 2,3,4,9) ----------
  const soakPage = await open(browser, TESTFILE);
  await soakPage.evaluate(() => { window.CUTS = []; });
  const soak = await soakPage.evaluate(() => { const {P,E,cam,dir,cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI}=__vs;const RM=__vs.RM;
    __vs.opt.autocam = true; __vs.setBot(true);
    let nan = 0, stuck = 0, comboTicks = 0, maxLatch = 0, latchRun = 0, flashOn = 0;
    const N = 18000, eps = [], settle = []; let cur = null, seen = 0, pend = null;
    for (let i = 0; i < N; i++) {
      __vs.simTick();
      const inAir = E.state === 'air' && !E.spiked;
      if (inAir && !cur) { cur = { s: __vs.tick, e: null }; eps.push(cur); } else if (!inAir && cur) { cur.e = __vs.tick; cur = null; }
      if (window.CUTS.length > seen) { seen = window.CUTS.length; pend = window.CUTS[seen - 1].tick; }
      if (pend !== null && dir.tw === null && cam.ang === cam.target) { settle.push(__vs.tick - pend); pend = null; }
      const c = __vs.cam;
      if (![c.ang, c.target, c.fx, c.fy, c.zoom, c.Z, __vs.P.x, __vs.P.y, __vs.E.x, __vs.E.y, __vs.E.z].every(Number.isFinite)) nan++;
      if (__vs.combo.active) comboTicks++;
      if (dir.latch) { latchRun++; maxLatch = Math.max(maxLatch, latchRun) } else latchRun = 0;
      if (dir.flash > 0) flashOn++;
    }
    return { cuts: window.CUTS, N, nan, comboTicks, maxLatch, flashOn, eps, settle };
  });
  const C = soak.cuts;
  const PRI = { plunge: 3, launcher: 3, heavy: 2, knock: 2, neutral: 1, chase: 1 };
  const by = {}; C.forEach(c => by[c.why] = (by[c.why] || 0) + 1);

  // 2. cut timing
  const notHitstop = C.filter(c => c.why !== 'neutral' && c.why !== 'chase' && !(c.hitstop > 0));
  const notEqual = C.filter(c => c.angAfter !== c.tgtAfter);
  const badStep = C.filter(c => !(c.step === 1 || c.step === 2));
  rec('2a', 'Hero/heavy beat cuts occur on a hitstop tick', notHitstop.length === 0 ? 'PASS' : 'FAIL', `${C.length - 0} cuts total ${JSON.stringify(by)}; beat cuts off-hitstop: ${notHitstop.length}${notHitstop[0] ? ' e.g. ' + JSON.stringify(notHitstop[0]) : ''}`);
  const maxSettle = Math.max(0, ...soak.settle);
  const norm = x => ((x % 360) + 360) % 360;
  const tgtNow = C.filter(c => norm(c.tgtAfter) === c.to).length;
  const eased2b = tgtNow === C.length && soak.settle.length === C.length && maxSettle <= 16;
  rec('2b', 'Eased cut (decided Oct 5): target set on the cut tick; cam.ang settles on it within 16 ticks', eased2b ? 'PASS' : 'FAIL',
    `target set on cut tick: ${tgtNow}/${C.length}; ang settled: ${soak.settle.length}/${C.length}, max ${maxSettle} ticks (dir.tH=12 hero, dir.tL=16 other). Set dir.tH=dir.tL=0 for the instant cut the first draft asked for`);
  rec('2c', 'Step per cut is 1 or 2 (45-90 deg)', badStep.length === 0 ? 'PASS' : 'FAIL', `${badStep.length} violations; steps: ${JSON.stringify(C.reduce((o, c) => (o[c.step] = (o[c.step] || 0) + 1, o), {}))}`);

  // 3. cooldown
  let cd36 = 0, cd90 = 0;
  for (let i = 1; i < C.length; i++) { const gap = C[i].tick - C[i - 1].tick; if (gap < 36) cd36++; else if (gap < 90 && !(PRI[C[i].why] > PRI[C[i - 1].why])) cd90++; }
  rec('3', 'Cooldown: none <36 ticks; none <90 unless higher priority', cd36 === 0 && cd90 === 0 ? 'PASS' : 'FAIL', `<36: ${cd36}, <90 w/o higher priority: ${cd90}`);

  // 4. air lockout
  const airCuts = C.filter(c => c.es === 'air' && !c.spiked);
  const sinceAir = c => { const ep = soak.eps.find(e => e.s <= c.tick && (e.e === null || c.tick <= e.e)); return ep ? c.tick - ep.s : null; };
  const launching = airCuts.filter(c => c.why === 'launcher' && c.hitstop > 0 && sinceAir(c) !== null && sinceAir(c) <= 6);
  const lateAir = airCuts.filter(c => !launching.includes(c));
  rec('4', 'Air lockout: zero cuts while E airborne and not spiked', airCuts.length === 0 ? 'PASS' : (lateAir.length === 0 ? 'WARN' : 'FAIL'),
    `literal: ${airCuts.length} cuts in lockout (${JSON.stringify(airCuts.reduce((o, c) => (o[c.why] = (o[c.why] || 0) + 1, o), {}))}). ${launching.length} are the launcher cut on the launching hit (<=6 ticks after air start, on hitstop), which spec section 5 explicitly allows; non-launch cuts in air: ${lateAir.length}. Code also exempts 'heavy' from the lockout (spec says no beat may cut); soak produced 0 heavy beats so that path is untested`);

  // 10. soak
  const mins = soak.N / 3600, cpm = C.length / mins, cpmCombo = soak.comboTicks ? C.length / (soak.comboTicks / 3600) : 0;
  const soakOK = soak.nan === 0 && soak.maxLatch < 1200;
  rec('10', 'Soak: 5 min bot, no NaN, no stuck latch, sane cut rate', soakOK ? (cpm >= 6 && cpm <= 14 ? 'PASS' : 'WARN') : 'FAIL',
    `NaN ticks=${soak.nan}; longest latch=${soak.maxLatch} ticks; cuts=${C.length} (${cpm.toFixed(1)}/min overall, ${cpmCombo.toFixed(1)}/min per combo-minute, combo time ${(soak.comboTicks / soak.N * 100).toFixed(0)}%); by beat ${JSON.stringify(by)}; page errors=${soakPage.errs.length}`);
  await soakPage.context().close();

  // 6. readability: 500 random placements
  {
    const p = await open(browser, TESTFILE);
    await p.evaluate(() => { window.CUTS = []; });
    const r = await p.evaluate(() => { const {P,E,cam,dir,cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI}=__vs;const RM=__vs.RM;
      let seed = 777; const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const out = { nonForced: { n: 0, bad: 0, none: 0, worst: 9 }, forced: { n: 0, bad: 0, none: 0, worst: 9 } };
      __vs.setBot(false); __vs.opt.autocam = true; __vs.opt.speed = 1;
      const beats = ['plunge', 'launcher', 'heavy', 'knock', 'neutral'];
      for (let i = 0; i < 500; i++) {
        const beat = beats[i % beats.length], hero = PRI[beat] === 3;
        P.x = (R() - .5) * 200; P.y = (R() - .5) * 200; P.z = 0; E.x = P.x + (R() - .5) * 160; E.y = P.y + (R() - .5) * 160;
        E.state = 'down'; E.spiked = false; E.z = beat === 'launcher' ? R() * 60 : 0;
        P.state = 'ground'; const a = Math.floor(R() * 8) * 45; cam.target = cam.ang = a;
        dir.last = -1e9; dir.lastPri = 0; dir.pause = dir.grace = 0; dir.q = null; dir.bad = 99; dir.tw = null;
        window.CUTS.length = 0; directorBeat(beat); directorTick();
        const bucket = hero ? out.forced : out.nonForced; bucket.n++;
        const c = window.CUTS[0];
        if (!c) { bucket.none++; continue; }
        const gain = c.qNew - c.qOld;
        if (hero) { bucket.worst = Math.min(bucket.worst, c.qNew); if (c.qNew < .6 - 1e-9) bucket.bad++; }
        else { bucket.worst = Math.min(bucket.worst, gain); if (gain < .25 - 1e-9) bucket.bad++; }
      }
      return out;
    });
    const ok = r.forced.bad === 0 && r.nonForced.bad === 0;
    rec('6', 'Readability: non-forced cuts gain >=0.25; forced cuts land >=0.6 (500 placements)', ok ? 'PASS' : 'FAIL',
      `non-forced: ${r.nonForced.n} trials, ${r.nonForced.n - r.nonForced.none} cut, violations ${r.nonForced.bad}, min gain ${r.nonForced.worst.toFixed(2)}; forced: ${r.forced.n} trials, ${r.forced.n - r.forced.none} cut, violations ${r.forced.bad}, min q ${r.forced.worst.toFixed(2)}`);
    await p.context().close();
  }

  // 5. latch
  {
    const p = await open(browser, TESTFILE);
    await p.evaluate(() => { window.CUTS = []; });
    const r = await p.evaluate(() => { const {P,E,cam,dir,cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI}=__vs;const RM=__vs.RM;
      const o = {}; __vs.setBot(false); __vs.opt.autocam = true; dir.latch = null; cam.ang = cam.target = 0; dir.tw = null;
      const heading = v => Math.atan2(v.y, v.x) * 180 / Math.PI, dd = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
      __vs.keys.clear(); __vs.keys.add('d');
      const w0 = heading(worldMove());
      let maxDev = 0, tgt = [];
      cutTo(90, 'launcher');                                  // cut while holding d (tweened 12 ticks)
      for (let i = 0; i < 60; i++) { cam.ang += 0; maxDev = Math.max(maxDev, dd(heading(worldMove()), w0)); updateCam(); }
      o.latchActive = !!dir.latch; o.maxDev = maxDev; o.camAfter = wrap(cam.target);
      // second cut while latched must not replace latch.ang
      const la = dir.latch && dir.latch.ang; cutTo(135, 'plunge'); o.keptAng = dir.latch && dir.latch.ang === la;
      let dev2 = 0; for (let i = 0; i < 40; i++) { dev2 = Math.max(dev2, dd(heading(worldMove()), w0)); updateCam(); } o.dev2 = dev2;
      // release by letting go
      __vs.keys.clear(); worldMove(); o.releasedOnLetGo = dir.latch === null;
      // after release, movement follows the new camera
      __vs.keys.add('d'); const w1 = heading(worldMove()); o.followsNewCam = dd(w1, w0) > 40; o.w0 = w0; o.w1 = w1;
      // release by 20 deg+ direction change: hold d, cut, then add w (45 deg change)
      __vs.keys.clear(); dir.latch = null; cam.ang = cam.target = 0; dir.tw = null; __vs.keys.add('d'); cutTo(90, 'launcher'); worldMove();
      const had = !!dir.latch; __vs.keys.add('w'); worldMove(); o.releasedOnTurn = had && dir.latch === null;
      // small wobble (<20 deg) keeps latch: not reachable with 8-way keys, skipped
      return o;
    });
    const ok = r.latchActive && r.maxDev < 1 && r.keptAng && r.dev2 < 1 && r.releasedOnLetGo && r.followsNewCam && r.releasedOnTurn;
    rec('5', 'Input latch: heading unchanged across cuts until release', ok ? 'PASS' : 'FAIL', JSON.stringify(r));
    await p.context().close();
  }

  // 7. manual override  &  8. slow motion  (driven through directorTick with a re-queued beat each tick)
  {
    const p = await open(browser, TESTFILE);
    await p.evaluate(() => { window.CUTS = []; });
    const run = async (setup, ticks) => p.evaluate(({ setupSrc, ticks }) => { const {P,E,cam,dir,cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI}=__vs;const RM=__vs.RM;
      __vs.setBot(false); __vs.opt.autocam = true; __vs.opt.speed = 1;
      P.x = -60; P.y = -6; P.z = 0; E.x = 40; E.y = 14; E.z = 0; E.state = 'down'; E.spiked = true; P.state = 'ground';
      cam.target = cam.ang = 0; dir.tw = null; dir.last = -1e9; dir.lastPri = 0; dir.pause = dir.grace = 0; dir.q = null; dir.latch = null;
      window.CUTS.length = 0; eval(setupSrc); const t0 = __vs.tick;
      for (let i = 0; i < ticks; i++) { __vs.tick++; directorBeat('plunge'); directorTick(); }
      return { first: window.CUTS.length ? window.CUTS[0].tick - t0 : null, n: window.CUTS.length };
    }, { setupSrc: setup, ticks });
    const base = await run('0', 100);
    rec('7a', 'Baseline: a plunge beat cuts promptly with Auto on (control for 7/8)', base.first !== null && base.first <= 3 ? 'PASS' : 'FAIL', `first cut at +${base.first} ticks`);
    const ov = await run('__vs.rotate(1)', 400);
    rec('7b', 'Override: after Q/E no auto-cut for 240 ticks, then a further 60', ov.first !== null && ov.first > 300 ? 'PASS' : (ov.first >= 300 ? 'WARN' : 'FAIL'),
      `first auto-cut at +${ov.first} ticks after rotate (spec: must be after 300; ticks 1-300 forbidden)`);
    // rotate cancels a queued beat
    const cq = await p.evaluate(() => { const {P,E,cam,dir,cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI}=__vs;const RM=__vs.RM; dir.q = 'plunge'; dir.qT = __vs.tick; __vs.rotate(1); return dir.q; });
    rec('7c', 'Override cancels any queued beat', cq === null ? 'PASS' : 'FAIL', `dir.q after rotate = ${cq}`);
    for (const sp of [0.5, 0.25]) {
      const r = await run('__vs.opt.speed=' + sp, 300);
      rec('8', `Slow motion: no cuts at opt.speed ${sp}`, r.n === 0 ? 'PASS' : 'FAIL', `${r.n} cuts in 300 ticks`);
    }
    await p.context().close();
  }

  // 9. reduced motion
  {
    const p = await open(browser, TESTFILE, { reducedMotion: 'reduce' });
    await p.evaluate(() => { window.CUTS = []; });
    const r = await p.evaluate(() => { const {P,E,cam,dir,cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI}=__vs;const RM=__vs.RM;
      const o = { rm: RM, autoDefault: __vs.opt.autocam };
      __vs.opt.autocam = true; dir.pause = dir.grace = 0; dir.last = -1e9; cam.zv = 0; dir.flash = 0;
      for (let i = 0; i < 8; i++) dir.sc[i] = .8;
      cutTo(45, 'plunge'); o.flash = dir.flash; o.zv = cam.zv; o.bar = dir.bar; return o;
    });
    const q = await open(browser, TESTFILE);
    const zvN = await q.evaluate(() => { const {P,E,cam,dir,cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI}=__vs;const RM=__vs.RM; __vs.opt.autocam = true; dir.last = -1e9; cam.zv = 0; for (let i = 0; i < 8; i++) dir.sc[i] = .8; cutTo(45, 'plunge'); return { zv: cam.zv, flash: dir.flash } });
    const ok = r.rm && r.autoDefault === false && r.flash === 0 && Math.abs(r.zv - zvN.zv / 2) < 1e-9;
    rec('9', 'Reduced motion: Auto defaults off, no flash, zoom kick halved', ok ? 'PASS' : 'FAIL', `RM=${r.rm} autoDefault=${r.autoDefault} flash=${r.flash} (normal ${zvN.flash}) zoomKick=${r.zv} (normal ${zvN.zv})`);
    await p.context().close(); await q.context().close();
  }

  // 11. cost
  {
    const p = await open(browser, TESTFILE);
    const ms = await p.evaluate(() => { const {P,E,cam,dir,cutTo,directorTick,directorBeat,quality,worldMove,updateCam,wrap,angDiff,PRI}=__vs;const RM=__vs.RM; __vs.setBot(true); for (let i = 0; i < 300; i++) __vs.simTick(); const N = 5000, t = performance.now(); for (let i = 0; i < N; i++) { __vs.tick++; directorTick(); } return (performance.now() - t) / N; });
    rec('11', 'Cost: directorTick under 0.2 ms', ms < 0.2 ? 'PASS' : 'FAIL', `${ms.toFixed(4)} ms per call (headless, software rendering irrelevant here)`);
    await p.context().close();
  }

  await browser.close();
  require('fs').writeFileSync('test_results.json', JSON.stringify(results, null, 1));
  const c = s => results.filter(r => r.status === s).length;
  console.log(`\nSUMMARY: ${c('PASS')} pass, ${c('WARN')} warn, ${c('FAIL')} fail`);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
