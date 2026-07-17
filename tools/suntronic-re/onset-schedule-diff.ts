/**
 * onset-schedule-diff.ts — quantify note-ONSET timing error of the shipped native
 * clock vs the true UADE vblank grid, with NO UADE relocation needed. Pure
 * arithmetic from the two clocks:
 *   - true (UADE):  the S-th sequencer step (stepAll) fires at sample S*VBLANK
 *                   (one stepAll per PAL vblank = 882.759 samples).
 *   - native ship:  player.tick() runs at 1024-sample bucket boundaries and
 *                   bundles the double-position schedule, so the S-th stepAll is
 *                   APPLIED at the bucket where tick() executed it -> sample
 *                   bucket*1024.
 * Onset error = native_apply_sample - true_fire_sample. A large, note-correlated
 * error is audible rhythmic jitter ("some notes off") even though the period
 * VALUES are byte-exact (golden 0/316).
 *
 * Usage: SECS=44 npx tsx tools/suntronic-re/onset-schedule-diff.ts
 */
const BUCKET = 1024;
const VBLANK = (1024 * 25) / 29; // 882.7586… samples per PAL vblank
const audioTick = 1024;
// ciaTick such that di = ciaTick/(audioTick-ciaTick) = 6.25 (the shipped constant,
// from the two-clock beat: 29 vblanks per 25 buckets).
const di = 6.25;

const secs = parseInt(process.env.SECS ?? '44', 10);
const nBuckets = Math.floor((secs * 44100) / BUCKET);

// Replay the shipped double-position clock to get, per stepAll index S, the bucket
// (tickIndex) at which tick() executed it.
let doubleK = 1;
const stepBucket: number[] = []; // stepBucket[S] = bucket index where step S ran
for (let tickIndex = 0; tickIndex < nBuckets; tickIndex++) {
  stepBucket.push(tickIndex);                 // base stepAll
  if (tickIndex === Math.round(doubleK * di)) {
    stepBucket.push(tickIndex);               // extra ("double") stepAll, SAME bucket
    doubleK += 1;
  }
}

// Compare native-applied onset (bucket*1024) vs true vblank onset (S*VBLANK).
let maxErr = 0, sumAbs = 0, over5ms = 0, over10ms = 0;
const S = stepBucket.length;
const samplesPerMs = 44.1;
for (let s = 0; s < S; s++) {
  const nativeSample = stepBucket[s] * BUCKET;
  const trueSample = s * VBLANK;
  const err = nativeSample - trueSample; // +late / -early, in samples
  const errMs = Math.abs(err) / samplesPerMs;
  maxErr = Math.max(maxErr, Math.abs(err));
  sumAbs += Math.abs(err);
  if (errMs > 5) over5ms++;
  if (errMs > 10) over10ms++;
}
console.log(`steps=${S} buckets=${nBuckets} (~${secs}s)`);
console.log(`onset error: mean=${(sumAbs / S / samplesPerMs).toFixed(2)}ms  max=${(maxErr / samplesPerMs).toFixed(2)}ms`);
console.log(`steps with onset error >5ms: ${over5ms}/${S} (${(100 * over5ms / S).toFixed(1)}%)  >10ms: ${over10ms}/${S} (${(100 * over10ms / S).toFixed(1)}%)`);
// Show the first 25 steps' timing for intuition.
console.log('\nstep | true(smp) native(smp) err(ms)');
for (let s = 0; s < 25; s++) {
  const err = (stepBucket[s] * BUCKET - s * VBLANK) / samplesPerMs;
  console.log(`${String(s).padStart(4)} | ${(s * VBLANK).toFixed(0).padStart(8)} ${(stepBucket[s] * BUCKET).toString().padStart(8)}   ${err >= 0 ? '+' : ''}${err.toFixed(2)}`);
}
