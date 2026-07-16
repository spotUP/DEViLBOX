---
date: 2026-07-16
topic: suntronic-gateD-sampled-instrument-dma
tags: [suntronic, phase4, native-playback, sampled, paula-dma]
status: implemented
---

> IMPLEMENTED 2026-07-16 (uncommitted). Phases 1-6 done:
> - Parser: `SunSampledInstrument` env/vib front (`volEnv`/`vibDepth`/`volEnvLen`/
>   `volEnvLoop`/`freqEnv*`), regression in `sunTronicV13Parse.test.ts`.
> - Player: `SunSampledDescriptor`/`SunEffectsSource`, `v.sampled` field,
>   `sampledTable` ctor build from `opts.sampleData`, `selectInstrument` returns
>   `{synth,sampled}`, `stepEffects` uses `v.instr ?? v.sampled` (SHARED EFFECTS),
>   tick emits `sampleSlot`/`sampleLenWords`/`loop*Words`.
> - native-mix: `loadSlotPcm` + `sampleData`, per-voice sampled resampler (whole
>   PCM, loop [loopStart,+loopLen] words, one-shot when loopLen<=1 word). Active
>   gate fixed to `(flags & 0x80) === 0` (sampled=$14=0x00, synth=0x01).
> - Regression: `sunTronicSampled.test.ts` (2 tests, fails-on-revert, in test:ci).
> - Evidence: `tools/suntronic-re/verify-sampled.ts` (diagnostic).
>
> RESULT: analgestic2 voice 2 was SILENT, now renders perc1.x/perc2.x at EFFECTS
> period 302 + loop. WHOLE-SONG BYTE-EXACT sampled fidelity NOT achieved — the
> mixed per-voice oracle is too muddled (windowed corr 0.05-0.18, same residual
> class as swept synth voices). Byte-exact lock = Gate E, gated on the deferred
> cycle-accurate Paula-DMA capture (chip-RAM buffer + $dffXX period register).

# Gate D plan — SunTronic native sampled-instrument DMA

Research: `thoughts/shared/research/2026-07-16_suntronic-gateD-sampled-dma.md`.
Goal: a type-B (sampled) voice renders its companion PCM at the EFFECTS-computed
period/volume with loop, instead of native silence. Witness: analgestic2 voice 2
(perc/bio slots), currently native-silent (oPeak 0.246 in oracle).

Root cause (two gaps): `selectInstrument` (SunTronicPlayer.ts:227) returns null
for bit6-clear → (1) no sample buffer; (2) `stepEffects` bails at line 368 so
period/volume never compute. Fix both by resolving a real sampled descriptor.

EFFECTS is SHARED (DP_Suntronic.s: GNN8 sets `$14=0` active; EFFECTS reads the
record front identically). The sampled record front $00-$11 is byte-identical to
a synth env/vib block. So the sampled voice = a synth-shaped descriptor + a PCM
buffer + loop metadata, rendered by a NEW sampled path (NOT the wavetable
dispatch — MEGAEFFECTS is synth-only).

Ship JS-only. No baked schedules. UADE stays offline oracle. Every change ships
a fails-on-revert test in `test:ci`. `npm run type-check` after each phase.

---

## Phase 1 — Parser: full sampled descriptor + companion binding

`src/lib/import/formats/SunTronicV13.ts`

### 1a. Extend `SunSampledInstrument` (line 486) with the env/vib front

The current interface has recordOff/envelopeOff/slotIndex/lengthWords/
loopStartWords/loopLenWords. Add the EFFECTS-required env/vib fields (same
semantics as `SunSynthInstrument`), so a sampled voice can drive `stepEffects`:

Field names MIRROR `SunSynthInstrument` exactly (volEnv*/freqEnv* for the vib
block) so ONE structural type `SunEffectsSource` (Phase 3) matches both records
with no adapter:

```ts
export interface SunSampledInstrument {
  recordOff: number;
  volEnvOff: number;        // $00 vol-env data ptr (RELOC32)  (== envelopeOff)
  volEnvLen: number;        // $04
  volEnvLoop: number;       // $06
  freqEnvOff: number;       // $08 vibrato-depth table ptr (RELOC32)
  freqEnvLen: number;       // $0c
  freqEnvLoop: number;      // $0e
  freqEnvSpeed: number;     // $10
  slotIndex: number;        // $12 (on-disk = external sample slot index)
  lengthWords: number;      // $16
  loopStartWords: number;   // $18
  loopLenWords: number;     // $1a
  /** vol-env table bytes (volEnvLen+1, read unsigned) */
  volEnv: Int8Array;
  /** vibrato-depth table bytes (freqEnvLen+1, signed) */
  vibDepth: Int8Array;
}
```

NOTE: this RENAMES the existing `envelopeOff` field to `volEnvOff`. Grep
consumers of `SunSampledInstrument.envelopeOff` before renaming; if any exist,
keep `envelopeOff` as an alias or update them in the same phase.

### 1b. Decode the new fields in the sampled-table loop (line 793)

Reuse the same `sliceI8` clamp pattern as `decodeSunSynthInstrument`. Replace
the current push:

```ts
const sliceI8 = (off: number, len: number): Int8Array => {
  if (off <= 0 || len <= 0 || off >= h1.length) return new Int8Array(0);
  const end = Math.min(off + len, h1.length);
  return new Int8Array(h1.buffer.slice(h1.byteOffset + off, h1.byteOffset + end));
};
// ... inside the for (rec ...) loop:
const envOff = u32BE(h1, rec + 0x00);
const volEnvLen = u16BE(h1, rec + 0x04);
const vibOff = u32BE(h1, rec + 0x08);
const vibLen = u16BE(h1, rec + 0x0c);
sampledInstruments.push({
  recordOff: rec,
  volEnvOff: envOff,
  volEnvLen,
  volEnvLoop: u16BE(h1, rec + 0x06),
  freqEnvOff: vibOff,
  freqEnvLen: vibLen,
  freqEnvLoop: u16BE(h1, rec + 0x0e),
  freqEnvSpeed: u16BE(h1, rec + 0x10),
  slotIndex: u32BE(h1, rec + 0x12),
  lengthWords: u16BE(h1, rec + 0x16),
  loopStartWords: u16BE(h1, rec + 0x18),
  loopLenWords: u16BE(h1, rec + 0x1a),
  volEnv: sliceI8(envOff, volEnvLen + 1),
  vibDepth: sliceI8(vibOff, vibLen + 1),
});
```

NOTE: preserve the existing `if (u32BE(h1, rec) === 0) break;` terminator and
the `>= 0x3f` cap. `envelopeOff` is still `u32BE(rec)` (unchanged value → no
existing consumer breaks).

### Phase 1 verification
- Automated: extend `SunTronicV13` parser test — assert analgestic2's 3 sampled
  records decode `slotIndex` 0/1/2, `lengthWords` 2362/2810/2938, `loopLenWords`
  1/1/2938, and `volEnv.length > 0` (env front decoded).
- `npm run type-check`.

---

## Phase 2 — Companion PCM into the player

The module buffer does NOT contain sample PCM; it lives in external companion
files (`instrumentNames[slot]`). Deliver raw s8 PCM to the player via a new
constructor option (loaded async in the app, `readFileSync` in the harness).

`src/engine/suntronic/SunTronicPlayer.ts`

### 2a. `SunPlayerOptions` — add sample source

```ts
export interface SunPlayerOptions {
  // ...existing...
  /** Raw signed-8-bit companion PCM per external sample slot (index = the
   *  sampled record's slotIndex = instrumentNames order). Absent/short entries
   *  render silent (missing companion). */
  sampleData?: (Int8Array | null)[];
}
```

### 2b. Constructor: build a sampled-descriptor table

Decode the sampled records once (from `score.sampledInstruments`) into
render-ready descriptors keyed by select index (`sel-1`), binding each to its
companion PCM sliced to `lengthWords*2`:

```ts
this.sampledTable = score.sampledInstruments.map((s) => {
  const pcm = opts.sampleData?.[s.slotIndex] ?? null;
  const byteLen = s.lengthWords * 2;
  return {
    ...s,
    sample: pcm ? pcm.subarray(0, Math.min(byteLen, pcm.length)) : new Int8Array(0),
  };
});
```

Store `score.sampledInstruments` reference on the instance (constructor already
has `score`). `sampledTable` typed as a private field.

### Phase 2 verification
- Automated: unit — construct a player with `sampleData` for analgestic2,
  assert `sampledTable[0].sample.length === 2362*2` and matches the companion
  bytes (read the fixture PCM, compare a few samples).
- `npm run type-check`.

---

## Phase 3 — selectInstrument: resolve sampled → non-null descriptor

`src/engine/suntronic/SunTronicPlayer.ts:227`

The voice's `instr` field is typed `SunSynthInstrument | null`. Two options:
- **(A)** widen `v.instr` to `SunSynthInstrument | SunSampledDescriptor | null`
  and add an `isSampled` discriminator.
- **(B)** keep `v.instr` synth-shaped; add a parallel `v.sampled:
  SunSampledDescriptor | null` set by the type-B branch; `stepEffects` reads
  whichever is non-null for env/vib.

**Recommended: (B)** — smallest blast radius. `stepEffects` (line 373/379) only
needs `volEnv`, `vibDepth`, `volEnvLen`, `volEnvLoop`, `vibLen`, `vibLoop`,
`vibSpeed` — expose those under a shared shape both descriptors satisfy. Because
the sampled descriptor already carries identically-named env/vib fields
(Phase 1), a single `SunEffectsSource` structural type covers both:

```ts
interface SunEffectsSource {
  volEnv: Int8Array; volEnvLen: number; volEnvLoop: number;
  vibDepth: Int8Array; freqEnvLen: number; freqEnvLoop: number; freqEnvSpeed: number;
}
```

Because Phase 1a already mirrors the synth field names (volEnv*/freqEnv* +
`vibDepth` array), `SunEffectsSource` matches both `SunSynthInstrument` and
`SunSampledInstrument` structurally with no adapter. Then:

```ts
private selectInstrument(sel: number): { synth: SunSynthInstrument | null; sampled: SunSampledDescriptor | null } {
  if ((sel & 0x40) !== 0) {
    const idx = sel & 0xbf;
    const rec = this.synthTableOff + idx * this.synthRecordSize;
    return { synth: decodeSynthAt(this.h1, rec), sampled: null };
  }
  const idx = (sel - 1) & 0xff;
  const s = this.sampledTable[idx] ?? null;
  return { synth: null, sampled: s };
}
```

`noteOn` (line 277): set both `v.instr = r.synth; v.sampled = r.sampled;`. The
`(sel & 0x40)` flags branch (line 286) stays: type-A → flags 0x01, type-B →
flags 0x00 (both ACTIVE; 0x00 is not `& 0x80` so `stepEffects` line 364 does NOT
skip). Add `sampled` to the voice init (line 209, `sampled: null`) and reset on
each `noteOn`.

### stepEffects (line 363) — run for sampled

Change the guard so a sampled source counts as an instrument:

```ts
const src: SunEffectsSource | null = v.instr ?? v.sampled;
if (v.synthFlag === 1 || !src) { if (!src) return; }
// use `src` for env/vib reads (lines 373, 379, 493-495):
const env = u8(src.volEnv[v.volEnvIndex] ?? 0);
const vibDepth = s8(src.vibDepth[v.vibIndex] ?? 0);
// env len/loop advance (lines ~484-495) use src.volEnvLen/Loop, src.freqEnv*
```

`advanceVib` (line 370) takes `inst` — pass `src`. Confirm `advanceVib` only
touches env/vib fields present on both (it does — vibIndex against
freqEnvLen/Loop).

Period path (lines 377-391) needs NO change: sampled arp select `v.arpSel/
arpPhase` stay 0 (noteOn resets, never advanced — renderSynthTick is
synth-only), so `d5=0`, `drin[0]=0`, period = plain note→period. This matches
GNN8 clearing the voice arp select.

### Phase 3 verification
- Automated: player unit — load analgestic2 with companions, render N ticks,
  assert voice 2 emits `period > 0` and `outVolume > 0` on its note rows (was
  frozen/silent before). Fails on revert (null-instr path returns early).
- `npm run type-check`.

---

## Phase 4 — tick(): emit sampled reference

`SunTronicPlayer.ts:495` — the tick voice currently emits `instrOff`. native-mix
keys the timbre on `instrOff` and skips `-1`. Add sampled fields so native-mix
can pick the sampled render path and locate the PCM + loop:

```ts
voices: this.voices.map((v) => ({
  period: v.period, acc: v.pitch & 0xffff, volume: v.volume & 0xff, flags: v.flags & 0xff,
  outVolume: v.outVolume & 0xff,
  instrOff: v.instr ? v.instr.recordOff : -1,
  // sampled voice (type-B): -1 when none
  sampleSlot: v.sampled ? v.sampled.slotIndex : -1,
  sampleLenWords: v.sampled ? v.sampled.lengthWords : 0,
  loopStartWords: v.sampled ? v.sampled.loopStartWords : 0,
  loopLenWords: v.sampled ? v.sampled.loopLenWords : 0,
})),
```

Update the `SunPlayerTick` voice type accordingly.

### Phase 4 verification
- Automated: assert a tick for analgestic2 voice 2 carries `sampleSlot >= 0`
  with the expected `sampleLenWords`.
- `npm run type-check`.

---

## Phase 5 — native-mix: sampled render path

`tools/suntronic-re/native-mix.ts` (offline harness / oracle-compare).

The render loop (line 121-181) resamples a per-vblank-regenerated synth buffer.
Add a sampled branch: the voice buffer is the WHOLE PCM sample (looked up by
`sampleSlot` from a `sampleData: Int8Array[]` the harness loads via
`loadInstrCompanions()` mapped to slot order), resampled at the Paula period with
loop wrap — NO per-vblank regen.

### 5a. Load companions into slot order

The harness maps `score.instrumentNames[slot]` → companion bytes:

```ts
const companions = loadInstrCompanions(); // instr/<file> entries
const nameToData = new Map(companions.map((c) => [c.name.replace(/^instr\//, ''), c.data]));
const sampleData: (Int8Array | null)[] = score.instrumentNames.map((n) => {
  const d = nameToData.get(n);
  return d ? new Int8Array(d.buffer, d.byteOffset, d.byteLength) : null;
});
const player = new SunTronicPlayer(score, { sampleData });
```

### 5b. Sequencer-state extraction (line 132-156): add sampled

```ts
const vSampled = [null, null, null, null] as (Int8Array | null)[];
const vLoopStart = [0, 0, 0, 0], vLoopLen = [0, 0, 0, 0];
// per voice:
if (vd.sampleSlot >= 0) {
  const pcm = sampleData[vd.sampleSlot] ?? null;
  vSampled[v] = pcm ? pcm.subarray(0, vd.sampleLenWords * 2) : null;
  vLoopStart[v] = vd.loopStartWords * 2;
  vLoopLen[v] = vd.loopLenWords * 2;
  vActive[v] = !!vSampled[v] && vd.period > 0;
} else {
  // existing synth path
}
```

On `sampleSlot` change (like `instrOff` change), reset `r.phase = 0`.

### 5c. Sample-loop resampler (line 165-181)

For a sampled voice, skip `renderSynthTick`; read the PCM with loop wrap:

```ts
if (vSampled[v]) {
  const buf = vSampled[v]!;
  const len = buf.length;
  let phase = r.phase;
  const i = Math.floor(phase);
  const s = i < len ? buf[i] : 0;
  ch[v][gs] = (s / 128) * vGain[v];
  phase += vInc[v];
  const loopLen = vLoopLen[v];
  if (loopLen > 2 /* not one-shot */) {
    const loopEnd = vLoopStart[v] + loopLen;
    if (phase >= loopEnd) phase -= loopLen * Math.floor((phase - vLoopStart[v]) / loopLen);
  }
  // one-shot (loopLen<=2): let phase run past len → silence (s=0)
  r.phase = phase;
  continue;
}
// else existing synth resample
```

Loop semantics: `loopLenWords==1` (2 bytes) = one-shot → sample plays once then
silence. `loopLenWords >= lengthWords` = loop whole sample from loopStart.

### 5d. Header comment (line 19-21)

Replace the "Type-B are instrOff=-1 → not rendered" caveat with the sampled
render description.

### Phase 5 verification
- Automated: run native-mix on analgestic2, assert voice 2 output is non-silent
  (peak > 0) and the played buffer at a chosen tick equals the perc/bio PCM
  slice at the resampled phase (byte or windowed-fidelity vs p5 oracle).
- Manual: MCP real-Chrome audition once Gate B.2 worklet exists — NOT this phase.

---

## Phase 6 — Regression test (fails-on-revert, test:ci)

New: `src/engine/suntronic/__tests__/sunTronicSampled.test.ts` (in the `test:ci`
glob). Pure, no engine — construct `SunTronicPlayer` from the analgestic2
fixture + companion PCM, render the timeline, assert:

1. Voice 2 select resolves a sampled descriptor (not null) → `sampleSlot >= 0`,
   `sampleLenWords === 2938` (bio) on its note rows.
2. `outVolume > 0` and `period > 0` on those rows (proves stepEffects ran — the
   revert leaves them 0/frozen).
3. The companion PCM binding: `sampledTable`/tick sample slice first bytes ==
   the `bio` file first bytes (proves slot→file→PCM mapping).

Oracle-level byte-exactness (native sampled buffer == UADE chip-RAM play buffer)
goes in a separate `tools/suntronic-re/verify-sampled.ts` evidence script (like
verify-t5-all.ts) — capture analgestic2 voice-2 play buffers, attribute to the
perc/bio slot, assert the resampled native slice matches. Cite its numbers in
the test comment. Mutation-check: temporarily revert `selectInstrument` to
`return null` → test MUST fail.

### Verification
- `npm run type-check` (mandatory).
- `npm run test:ci` green (new test in glob).
- Revert-check each fix, confirm the new test fails, restore.

---

## Success criteria
- [ ] analgestic2 voice 2 renders non-silent native output (peak > 0).
- [ ] Native sampled buffer matches companion PCM slice at EFFECTS period
      (byte-exact or windowed-fidelity vs p5 oracle, 0 contradictions).
- [ ] `stepEffects` runs full EFFECTS for sampled voices (period/vol/vib).
- [ ] Loop: one-shot vs looped sample correct (bio loops, perc one-shot).
- [ ] Parser decodes the full sampled record front (env/vib).
- [ ] Regression in `test:ci`, fails-on-revert.
- [ ] `npm run type-check` clean; no baked schedules; UADE untouched.

## Deferred / out of scope
- Gate B.2 worklet plumbing (companion fetch in the browser engine) — separate.
- The sampled-voice arp/`drin` non-zero path (same deferred Gate-2 drin gen as
  synth) — analgestic2 uses arp=0, so not blocking.
- Editable sampled-instrument UI — Gate E+ / editability, not native playback.
