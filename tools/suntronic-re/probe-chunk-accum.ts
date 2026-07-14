/** probe-chunk-accum.ts — fit a 128-CHUNK-quantized CIA accumulator to the observed
 * sub-tick double schedule. UADE processes CIA interrupts at 128-sample chunk
 * boundaries, NOT 1024-fire boundaries — so the per-fire double count depends on
 * where each interrupt lands among the 8 chunks of a fire. Model: per 128-chunk
 * advance eclock by dE=128*ECLOCK/SR; CIA timer reloads every P eclocks; the
 * interrupt is OBSERVED at the end of its chunk. Count interrupts per 1024-fire.
 * Sweep (P, phase) for a match to the observed double-fire list. NOT committed. */
const ECLOCK = 709379, SR = 44100, CH = 128, FIRES = 82;
const dE = CH * ECLOCK / SR; // eclocks advanced per 128-chunk (~2059.34)
// observed 128-chunk double schedule (gliders, from probe-schedule-inject extraction)
const OBSERVED = [6, 13, 19, 25, 31, 38, 44, 50, 56, 63, 69, 75];

function doubleFires(P: number, phase: number): number[] {
  // simulate 8*FIRES chunks; count CIA interrupts observed per chunk, bucket per fire
  const perFire = new Array(FIRES).fill(0);
  let acc = phase; // eclocks accumulated toward next reload
  const chunks = FIRES * (1024 / CH);
  for (let c = 0; c < chunks; c++) {
    acc += dE;
    let fired = 0;
    while (acc >= P) { acc -= P; fired++; }
    const fire = Math.floor((c * CH) / 1024); // chunk c belongs to this fire
    if (fire < FIRES) perFire[fire] += fired;
  }
  return perFire.map((n, f) => (n >= 2 ? f : -1)).filter((f) => f >= 0);
}

function score(P: number, phase: number): number {
  const d = doubleFires(P, phase);
  // exact match on the observed prefix (first 6 doubles)
  let s = 0;
  for (let i = 0; i < OBSERVED.length; i++) if (d[i] !== OBSERVED[i]) s++;
  return s + Math.abs(d.length - OBSERVED.length);
}

console.log(`dE(per 128-chunk)=${dE.toFixed(4)} eclocks`);
console.log(`OBSERVED doubles = [${OBSERVED.join(',')}]  (rate ${(44 / 39).toFixed(4)} subtick/fire)`);

// --- 128-chunk model, corrected P range (~14600 eclocks), fine phase ---
let best = { s: Infinity, P: 0, phase: 0, list: [] as number[] };
for (let P = 14400; P <= 14900; P += 1) {
  for (let ph = 0; ph < P; ph += 8) {
    const s = score(P, ph);
    if (s < best.s) best = { s, P, phase: ph, list: doubleFires(P, ph) };
  }
}
console.log(`\n128-chunk BEST P=${best.P} phase=${best.phase} score=${best.s} ciaTick=${(best.P * SR / ECLOCK).toFixed(4)}`);
console.log(`  fit doubles = [${best.list.join(',')}]`);

// --- simple per-1024-fire model, sweep ciaTick in samples directly ---
function fireGranular(ciaSamp: number, ph: number): number[] {
  const perFire = new Array(FIRES).fill(0); let acc = ph;
  for (let f = 0; f < FIRES; f++) { acc += 1024; while (acc >= ciaSamp) { acc -= ciaSamp; perFire[f]++; } }
  return perFire.map((n, f) => (n >= 2 ? f : -1)).filter((f) => f >= 0);
}
function fireScore(ciaSamp: number, ph: number): number {
  const d = fireGranular(ciaSamp, ph); let s = 0;
  for (let i = 0; i < OBSERVED.length; i++) if (d[i] !== OBSERVED[i]) s++;
  return s + Math.abs(d.length - OBSERVED.length);
}
let bf = { s: Infinity, cia: 0, phase: 0, list: [] as number[] };
for (let cia = 878; cia <= 888; cia += 0.005) {
  for (let ph = 0; ph < cia; ph += 2) {
    const s = fireScore(cia, ph);
    if (s < bf.s) bf = { s, cia, phase: ph, list: fireGranular(cia, ph) };
  }
}
console.log(`\nper-1024-fire BEST ciaTick=${bf.cia.toFixed(3)} phase=${bf.phase} score=${bf.s}`);
console.log(`  fit doubles = [${bf.list.join(',')}]`);
console.log(`\ncontrast: ciaTick=881.5 → [${fireGranular(881.5, 0).join(',')}]  ;  ciaTick=907.7 → [${fireGranular(907.7, 0).join(',')}]`);
