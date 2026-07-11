---
date: 2026-07-11
topic: maxtrax-inplace-sample-live-edit
tags: [maxtrax, wasm, live-edit, instrument-editor, transpile]
status: draft
---

# MaxTrax Full In-Place Sample Live-Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every MaxTrax sample-patch field (Volume, Tune, Number, Octaves, Attack/Sustain PCM lengths, and attack/release envelope points) edits with live audio and **no reload** — the running WASM replayer reflects the edit immediately (scalars) or on the next note trigger (structural), flipping `canLiveEdit` true and removing the "Store only" note in `MaxTraxControls`.

**Architecture:** Two coherent tiers, not per-field band-aids.
- **Tier 1 — scalar fast-path.** Tune and Volume write directly into the in-memory `_patch` struct (`WRITE16`). Tune is re-read every tick in `CalcNote` (audibly live on sustaining notes); Volume applies on the next sustain segment. One tiny setter.
- **Tier 2 — full-patch rebuild.** Every structural edit (Number relocation, Octaves, Attack/Sustain lengths, envelope add/remove/edit) is applied by tearing down and re-allocating one patch's in-memory buffers from the canonical `tailRaw` byte slice — the same slice `encodeMaxTrax` exports. Reuses the proven `LoadPerf` allocation contract (env arrays + per-octave sample chain), sourcing PCM from the passed byte buffer instead of the DOS read stream. Takes effect on the next note-on for that patch; in-flight voices on that patch are drained first so freeing is safe.

The TS store (`mutateMaxTraxSample`) already edits every field into `tailRaw` and export already works — this plan adds **only** the live-audio path.

**Tech Stack:** Transpiled 68k → C (`maxtrax.c`, unity-#included by `maxtrax_harness.c`), Emscripten WASM, AudioWorklet, Zustand store, React + Vitest.

## Global Constraints

- **Fix root cause, no band-aids.** Tier 2 rebuilds from the canonical `tailRaw` slice — the single source of truth — never a parallel shadow model.
- **Single source of truth.** `tailRaw` is export authority. The WASM live-edit path consumes the same bytes; no second serialization.
- **Every bug/feature ships a revert-checked regression test wired into `test:ci`.** `test:ci` is an explicit file list in `package.json`, NOT a glob — new test files must be added to line 30. `vite.config.ts` excludes `src/__tests__/ci/**`.
- **MaxTrax lockstep = state assertion / command-histogram, NEVER WAV.** UADE never exercises the edit path; regression tests assert in-memory struct state + nonzero render, not waveform match.
- **`maxtrax.c` `#define`s `for` → 0.** In `maxtrax_harness.c` use `while` loops only. Forbidden identifiers in that TU: `for`, `volume`, `value`, `flags`, `to`, `number`.
- **No emojis. Full English UI labels. Design-system components + Tailwind token allowlist** (`MaxTraxControls` already compliant).
- **`useRef` configRef pattern** for control callbacks (`MaxTraxControls` uses `sampleRef`; keep it).
- **Build:** `cd maxtrax-wasm/build && emmake make` → outputs `Maxtrax.js`/`.wasm`; then **cp to `public/maxtrax/` from repo root as a SEPARATE command** (the `cd` persists and breaks a relative cp). Commit both `.js` and `.wasm`.
- **Type-check mandatory:** `npm run type-check` (`tsc -b --force`) must pass before any task is complete.
- **Pre-commit/pre-push hooks run full `test:ci` (~2-3min) → run commit/push in background** (foreground Bash 2min timeout kills them).
- **Work direct to main, no worktrees. `git add` by name only, never `-A`/`.`, never `--no-verify`.** Commit/push only the WASM+source for each task.

## Key Data Model (verified from source)

**In-memory `_patch` struct** (`_patch = _ds + 516`, `patch_sizeof = 22`, indexed by patch **Number** not array order — `maxtrax.c:9830-9832`):

| off | size | field |
|-----|------|-------|
| 0 | u32 | patch_Sample (→ first-octave Sample struct) |
| 4 | u32 | patch_Attack (→ env array) |
| 8 | u32 | patch_Release (→ env array) |
| 12 | u16 | patch_AttackCount |
| 14 | u16 | patch_ReleaseCount |
| 16 | u16 | patch_Volume |
| 18 | i16 | patch_Tune |
| 20 | u8  | patch_Number |

**Sample struct** (`samp_sizeof = 16`): `samp_NextSample`(0,u32) `samp_Waveform`(4,u32→PCM) `samp_AttackSize`(8,u32) `samp_SustainSize`(12,u32).
**Env element** (`env_sizeof = 4`): `env_Duration`(0,u16) `env_Volume`(2,u16).

**`tailRaw` sample slice** (big-endian, `locateMaxTraxSampleInTailRaw` in `useFormatStore.ts:363`):
20-byte header [number u16 @0, tune i16 @2, volume u16 @4, octaves u16 @6, attackLen u32 @8, sustainLen u32 @12, attackCount u16 @16, releaseCount u16 @18], then `(attackCount+releaseCount)*4` env bytes (attack points then release points), then PCM = `firstLen*(2^octaves − 1)` bytes where `firstLen = attackLen+sustainLen`. Per-octave PCM lengths double: octave k = `firstLen*2^k`.

**Shims** (`maxtrax_harness.c:280-303`): `_LVOAllocMem`=`calloc(1,d0)`→ptr in d0; `_LVOFreeMem`=`free(a1)`; `_LVOCopyMem`=`memcpy(a1,a0,d0)`. All native host pointers — no chip arena. PCM/env bytes stored big-endian; the replayer's `READ16`/`READ32` byte-swap on read, so raw `memcpy` of tailRaw bytes is correct.

**Voice struct** (`_voice = _ds + 1924`, `NUM_VOICES = 4`, 52 bytes): `voice_Patch`(4,u32→patch base) `voice_Number`(46,u8→Paula channel) `voice_Status`(49,u8).

**Existing exports** (`CMakeLists.txt:28`): `_maxtrax_load _maxtrax_render _maxtrax_stop _maxtrax_get_sample_rate _maxtrax_get_cmd_count _maxtrax_get_seed_pool_depth _maxtrax_get_tick_unit _maxtrax_get_event_count _maxtrax_set_event _maxtrax_recook _malloc _free`.

---

## File Structure

- `maxtrax-wasm/src/maxtrax_harness.c` — add 4 EXPORT functions (`maxtrax_set_patch_scalar`, `maxtrax_get_patch_scalar`, `maxtrax_reload_patch`, `maxtrax_get_patch_env`). Responsibility: WASM live-edit seam.
- `maxtrax-wasm/CMakeLists.txt` — add the 4 symbols to `EXPORTED_FUNCTIONS`.
- `public/maxtrax/Maxtrax.js` + `.wasm` — rebuilt artifacts (committed).
- `public/maxtrax/Maxtrax.worklet.js` — add `setPatchScalar` + `reloadPatch` message handlers.
- `src/engine/maxtrax/MaxTraxEngine.ts` — add `setSampleParam` + `reloadSample` methods that post worklet messages.
- `src/lib/import/formats/maxtrax/maxtraxFormat.ts` — add `extractSampleDsampleSlice(data, sampleIndex): Uint8Array | null` helper (single source for the byte slice, reused by controls + tests).
- `src/components/instruments/controls/MaxTraxControls.tsx` — wire `setField`/`setEnvField`/`addEnvPoint`/`removeEnvPoint` to the engine; remove the stale "future" comment.
- `src/engine/maxtrax/__tests__/maxtraxSetPatchScalar.test.ts` + `.cjs` runner — Tier 1 regression.
- `src/engine/maxtrax/__tests__/maxtraxReloadPatch.test.ts` + `.cjs` runner — Tier 2 regression.
- `package.json:30` — add the two new test files to `test:ci`.

---

## Task 1: Tier-1 WASM scalar setter + getter

**Files:**
- Modify: `maxtrax-wasm/src/maxtrax_harness.c` (after `maxtrax_get_tick_unit`, ~line 848)
- Modify: `maxtrax-wasm/CMakeLists.txt:28`
- Rebuild: `public/maxtrax/Maxtrax.js` + `.wasm`

**Interfaces:**
- Produces: `int maxtrax_set_patch_scalar(int patchNumber, int field, int value)` — field 0=tune(i16@18), 1=volume(u16@16). Returns 0 ok, -1 if patchNumber out of [0,63] or field invalid. `int maxtrax_get_patch_scalar(int patchNumber, int field)` — returns the current value (sign-extended for tune), -1 on bad args.

- [ ] **Step 1: Write the failing test** — `src/engine/maxtrax/__tests__/maxtraxSetPatchScalarRunner.cjs` (model on `maxtraxRecookTempoRunner.cjs`): load `Maxtrax.js`/`.wasm` via `new Function` eval, load `antmusic.mxtx`. Find a valid patch number by scanning: `for (let n=0;n<64;n++){ const v=mod._maxtrax_get_patch_scalar(n,1); if (v>0){ pn=n; break; } }`. Read `V0=get(pn,1)` (volume), `T0=get(pn,0)` (tune). `set(pn,1, V0===40?41:40)` then `set(pn,0, (T0+7)|0)`. Read back `V1`,`T1`. Print JSON `{pn, V0, V1, T0, T1, setVol, setTune}` (capture the two set return codes). `.test.ts` asserts: `pn>=0`, `setVol===0`, `setTune===0`, `V1!==V0`, `V1===(V0===40?41:40)`, `T1===((T0+7)|0)` (accounting for i16 wrap via `(x<<16>>16)`).
- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/engine/maxtrax/__tests__/maxtraxSetPatchScalar.test.ts` → FAIL (`_maxtrax_set_patch_scalar` / `_maxtrax_get_patch_scalar` not exported).
- [ ] **Step 3: Implement in `maxtrax_harness.c`** (insert after line 848):

```c
/*
 * maxtrax_set_patch_scalar(patchNumber, field, value)
 *
 * Tier-1 live scalar edit. Writes directly into the in-memory _patch struct
 * (_patch = _ds + 516, patch_sizeof = 22, indexed by patch Number). field:
 *   0 = Tune   (i16 @ patch_Tune = 18) — re-read every tick in CalcNote → live
 *   1 = Volume (u16 @ patch_Volume = 16) — applies on next sustain segment
 * Returns 0 on success, -1 on out-of-range patchNumber or unknown field.
 */
EXPORT int maxtrax_set_patch_scalar(int patchNumber, int field, int value) {
    if (patchNumber < 0 || patchNumber >= NUM_PATCHES) return -1;
    uint32_t base = (uint32_t)(uintptr_t)_patch + (uint32_t)patchNumber * (uint32_t)patch_sizeof;
    if (field == 0)      WRITE16(base + (uint32_t)patch_Tune,   (uint16_t)value);
    else if (field == 1) WRITE16(base + (uint32_t)patch_Volume, (uint16_t)value);
    else return -1;
    return 0;
}

/* Read-back companion for the regression test (and future UI reconciliation). */
EXPORT int maxtrax_get_patch_scalar(int patchNumber, int field) {
    if (patchNumber < 0 || patchNumber >= NUM_PATCHES) return -1;
    uint32_t base = (uint32_t)(uintptr_t)_patch + (uint32_t)patchNumber * (uint32_t)patch_sizeof;
    if (field == 0) return (int)(int16_t)READ16(base + (uint32_t)patch_Tune);
    if (field == 1) return (int)(uint16_t)READ16(base + (uint32_t)patch_Volume);
    return -1;
}
```

- [ ] **Step 4: Export** — in `CMakeLists.txt:28` add `,'_maxtrax_set_patch_scalar','_maxtrax_get_patch_scalar'` after `'_maxtrax_get_tick_unit'`.
- [ ] **Step 5: Build + copy** (two separate commands):
  - `cd maxtrax-wasm/build && emmake make`
  - (from repo root) `cp maxtrax-wasm/build/Maxtrax.js maxtrax-wasm/build/Maxtrax.wasm public/maxtrax/`
- [ ] **Step 6: Run test to verify it passes** — `npx vitest run src/engine/maxtrax/__tests__/maxtraxSetPatchScalar.test.ts` → PASS.
- [ ] **Step 7: Revert-check** — temporarily change the setter body to `return 0;` (no write), rebuild, run test → MUST FAIL (`V1===V0`). Restore, rebuild, confirm PASS.
- [ ] **Step 8: Wire into `test:ci`** — `package.json:30`, add `src/engine/maxtrax/__tests__/maxtraxSetPatchScalar.test.ts` after `maxtraxRecookTempo.test.ts`.
- [ ] **Step 9: Commit** (background):

```bash
git add maxtrax-wasm/src/maxtrax_harness.c maxtrax-wasm/CMakeLists.txt \
        public/maxtrax/Maxtrax.js public/maxtrax/Maxtrax.wasm \
        src/engine/maxtrax/__tests__/maxtraxSetPatchScalar.test.ts \
        src/engine/maxtrax/__tests__/maxtraxSetPatchScalarRunner.cjs package.json
git commit -m "feat(maxtrax): Tier-1 live scalar setter (Tune/Volume) into _patch"
```

---

## Task 2: Tier-2 WASM full-patch rebuild

**Files:**
- Modify: `maxtrax-wasm/src/maxtrax_harness.c` (after Task 1 functions)
- Modify: `maxtrax-wasm/CMakeLists.txt:28`
- Rebuild: `public/maxtrax/Maxtrax.js` + `.wasm`

**Interfaces:**
- Consumes: `maxtrax_get_patch_scalar` (Task 1) in the test.
- Produces:
  - `int maxtrax_reload_patch(int patchNumber, uintptr_t dsamplePtr, int len)` — `dsamplePtr` → a `_malloc`'d copy of the exact `tailRaw` sample slice (header+env+PCM, big-endian). Drains in-flight voices on this patch, frees old patch buffers, re-allocates env arrays + per-octave sample chain from the bytes, rewrites the `_patch` entry. Returns 0 ok, -1 on bad args / short buffer / alloc failure.
  - `int maxtrax_get_patch_env(int patchNumber, int isRelease, int pointIndex, int wantVolume)` — returns the env point field (duration or volume) currently in the patch's env array, or -1 on bad args. Used by the Tier-2 test to prove the rebuild took.

- [ ] **Step 1: Write the failing test** — `maxtraxReloadPatchRunner.cjs`: load song, find a patch `pn` with `get_patch_scalar(pn,1)>0`. Build an edited dsample slice in JS mirroring `tailRaw` layout for a **known-simple synthetic patch** so the test is self-contained and does not depend on the song's exact sample bytes: header with octaves=1, attackLen=8, sustainLen=8 (firstLen=16, PCM=16 bytes ramp), attackCount=2, releaseCount=1, env points [{dur:100,vol:64},{dur:50,vol:32}] attack + [{dur:80,vol:0}] release, number=pn, tune=0, volume=48 — all big-endian. Total = 20 + (2+1)*4 + 16 = 48 bytes. `_malloc(48)`, `HEAPU8.set(bytes,ptr)`, `r=_maxtrax_reload_patch(pn, ptr, 48)`, `_free(ptr)`. Read back: `vol=get_patch_scalar(pn,1)`, `ac`(add a getter? no — use `maxtrax_get_patch_env`) — read `a0d=get_patch_env(pn,0,0,0)` (attack pt0 duration), `a0v=get_patch_env(pn,0,0,1)`, `r0v=get_patch_env(pn,1,0,1)`. Then render 0.1s and count nonzero samples `nz` (via `_maxtrax_render` into a malloc'd buffer, read HEAPF32). Print `{pn, r, vol, a0d, a0v, r0v, nz}`.
  - `.test.ts` asserts: `r===0`, `vol===48`, `a0d===100`, `a0v===64`, `r0v===0`, `nz>0` (patch chain valid → renders). Revert makes `r!==0` or the env read-backs stale.
- [ ] **Step 2: Run to verify it fails** — FAIL (`_maxtrax_reload_patch` not exported).
- [ ] **Step 3: Implement in `maxtrax_harness.c`.** Helpers read big-endian from the malloc'd byte buffer directly (`bp[i]` is a `uint8_t*`), and use the shim registers to call AllocMem/FreeMem exactly as the transpiled code does (`d0`=size, `d1`=flags, then `_LVOAllocMem()`, read `d0`; `a1`=ptr, `_LVOFreeMem()`):

```c
/* big-endian readers over the raw dsample byte buffer */
static uint16_t ds_r16(const uint8_t *b, int o) { return (uint16_t)((b[o] << 8) | b[o+1]); }
static uint32_t ds_r32(const uint8_t *b, int o) {
    return ((uint32_t)b[o] << 24) | ((uint32_t)b[o+1] << 16)
         | ((uint32_t)b[o+2] << 8) | (uint32_t)b[o+3];
}
static uint32_t hshim_alloc(uint32_t size, uint32_t memflags) {
    d0 = size; d1 = memflags; _LVOAllocMem(); return d0;
}
static void hshim_free(uint32_t ptr, uint32_t size) {
    if (!ptr) return; a1 = ptr; d0 = size; _LVOFreeMem();
}

/*
 * maxtrax_reload_patch(patchNumber, dsamplePtr, len)
 * Tear down + rebuild one patch's in-memory buffers from a tailRaw sample slice.
 */
EXPORT int maxtrax_reload_patch(int patchNumber, uintptr_t dsamplePtr, int len) {
    if (patchNumber < 0 || patchNumber >= NUM_PATCHES) return -1;
    if (!dsamplePtr || len < 20) return -1;
    const uint8_t *b = (const uint8_t *)dsamplePtr;

    uint16_t oct        = ds_r16(b, 6);
    uint32_t attackLen0 = ds_r32(b, 8);
    uint32_t sustLen0   = ds_r32(b, 12);
    uint16_t ac         = ds_r16(b, 16);
    uint16_t rc         = ds_r16(b, 18);
    uint32_t envBytes   = (uint32_t)(ac + rc) * (uint32_t)env_sizeof;
    uint32_t firstLen   = attackLen0 + sustLen0;
    /* PCM total = firstLen*(2^oct - 1); guard the buffer covers header+env+PCM. */
    uint32_t pcmTotal = 0, tmp = firstLen; uint16_t k = 0;
    while (k < oct) { pcmTotal += tmp; tmp += tmp; k++; }
    if ((uint32_t)len < 20u + envBytes + pcmTotal) return -1;

    uint32_t base = (uint32_t)(uintptr_t)_patch + (uint32_t)patchNumber * (uint32_t)patch_sizeof;

    /* 1. Drain in-flight voices referencing this patch so freeing is safe. */
    {
        int vi = 0;
        while (vi < NUM_VOICES) {
            uint32_t vbase = (uint32_t)(uintptr_t)_voice + (uint32_t)vi * (uint32_t)voice_sizeof;
            if (READ32(vbase + (uint32_t)voice_Patch) == base) {
                uint8_t ch = (uint8_t)READ8(vbase + (uint32_t)voice_Number);
                if (ch < PAULA_CHANNELS) paula_channel_dma_off(ch);
                WRITE8(vbase + (uint32_t)voice_Status, 0 /* ENV_HALT idle */);
                WRITE32(vbase + (uint32_t)voice_Patch, 0);
            }
            vi++;
        }
    }

    /* 2. Free old buffers (sizes are advisory; free() ignores them). */
    {
        uint16_t oac = (uint16_t)READ16(base + (uint32_t)patch_AttackCount);
        uint16_t orc = (uint16_t)READ16(base + (uint32_t)patch_ReleaseCount);
        hshim_free(READ32(base + (uint32_t)patch_Attack),  (uint32_t)oac * (uint32_t)env_sizeof);
        hshim_free(READ32(base + (uint32_t)patch_Release), (uint32_t)orc * (uint32_t)env_sizeof);
        uint32_t s = READ32(base + (uint32_t)patch_Sample);
        while (s) {
            uint32_t next = READ32(s + (uint32_t)samp_NextSample);
            uint32_t wf   = READ32(s + (uint32_t)samp_Waveform);
            uint32_t wsz  = READ32(s + (uint32_t)samp_AttackSize) + READ32(s + (uint32_t)samp_SustainSize);
            hshim_free(wf, wsz);
            hshim_free(s, (uint32_t)samp_sizeof);
            s = next;
        }
    }

    /* 3. Scalars. */
    WRITE8 (base + (uint32_t)patch_Number, (uint8_t)ds_r16(b, 0));
    WRITE16(base + (uint32_t)patch_Tune,   ds_r16(b, 2));
    WRITE16(base + (uint32_t)patch_Volume, ds_r16(b, 4));

    /* 4. Env arrays (raw big-endian copy; READ16 swaps on read). */
    uint32_t envSrc = 20;
    {
        uint32_t aBytes = (uint32_t)ac * (uint32_t)env_sizeof;
        uint32_t rBytes = (uint32_t)rc * (uint32_t)env_sizeof;
        uint32_t ap = aBytes ? hshim_alloc(aBytes, 0) : 0;
        uint32_t rp = rBytes ? hshim_alloc(rBytes, 0) : 0;
        if (aBytes && !ap) return -1;
        if (rBytes && !rp) { hshim_free(ap, aBytes); return -1; }
        if (ap) memcpy((void *)(uintptr_t)ap, b + envSrc, aBytes);
        if (rp) memcpy((void *)(uintptr_t)rp, b + envSrc + aBytes, rBytes);
        WRITE32(base + (uint32_t)patch_Attack,       ap);
        WRITE32(base + (uint32_t)patch_Release,      rp);
        WRITE16(base + (uint32_t)patch_AttackCount,  ac);
        WRITE16(base + (uint32_t)patch_ReleaseCount, rc);
    }

    /* 5. Per-octave sample chain (lengths double each octave), PCM from buffer. */
    {
        uint32_t pcmSrc = 20 + envBytes;
        uint32_t prev = 0, first = 0;
        uint32_t aLen = attackLen0, sLen = sustLen0;
        uint16_t o = 0;
        while (o < oct) {
            uint32_t wsz = aLen + sLen;
            uint32_t sstruct = hshim_alloc((uint32_t)samp_sizeof, 0);
            uint32_t wf = wsz ? hshim_alloc(wsz, MEMF_CHIP) : 0;
            if (!sstruct || (wsz && !wf)) { hshim_free(sstruct, (uint32_t)samp_sizeof); return -1; }
            if (wf) memcpy((void *)(uintptr_t)wf, b + pcmSrc, wsz);
            WRITE32(sstruct + (uint32_t)samp_Waveform,   wf);
            WRITE32(sstruct + (uint32_t)samp_AttackSize, aLen);
            WRITE32(sstruct + (uint32_t)samp_SustainSize, sLen);
            WRITE32(sstruct + (uint32_t)samp_NextSample, 0);
            if (prev) WRITE32(prev + (uint32_t)samp_NextSample, sstruct);
            else      first = sstruct;
            prev = sstruct;
            pcmSrc += wsz;
            aLen += aLen; sLen += sLen;  /* double for next octave */
            o++;
        }
        WRITE32(base + (uint32_t)patch_Sample, first);
    }
    return 0;
}

/* Read-back of a rebuilt env point for the Tier-2 regression test. */
EXPORT int maxtrax_get_patch_env(int patchNumber, int isRelease, int pointIndex, int wantVolume) {
    if (patchNumber < 0 || patchNumber >= NUM_PATCHES || pointIndex < 0) return -1;
    uint32_t base = (uint32_t)(uintptr_t)_patch + (uint32_t)patchNumber * (uint32_t)patch_sizeof;
    uint16_t cnt = (uint16_t)READ16(base + (uint32_t)(isRelease ? patch_ReleaseCount : patch_AttackCount));
    if ((uint32_t)pointIndex >= cnt) return -1;
    uint32_t arr = READ32(base + (uint32_t)(isRelease ? patch_Release : patch_Attack));
    if (!arr) return -1;
    uint32_t e = arr + (uint32_t)pointIndex * (uint32_t)env_sizeof;
    return (int)(uint16_t)READ16(e + (uint32_t)(wantVolume ? env_Volume : env_Duration));
}
```

  Note: confirm `voice_sizeof`, `voice_Patch`, `voice_Number`, `voice_Status`, `MEMF_CHIP`, `NUM_PATCHES`, `NUM_VOICES`, `patch_*`, `samp_*`, `env_*` symbols are all `#define`d/visible in `maxtrax.c` (they are — see Key Data Model). If `voice_sizeof` is absent, it is 52. Add `#include <string.h>` at top of the harness if `memcpy` is not already pulled in (it is used by the CopyMem shim, so already included).

- [ ] **Step 4: Export** — `CMakeLists.txt:28` add `,'_maxtrax_reload_patch','_maxtrax_get_patch_env'`.
- [ ] **Step 5: Build + copy** (two separate commands, as Task 1 Step 5).
- [ ] **Step 6: Run test to verify it passes** — `npx vitest run src/engine/maxtrax/__tests__/maxtraxReloadPatch.test.ts` → PASS.
- [ ] **Step 7: Revert-check** — temporarily make `maxtrax_reload_patch` `return -1;` immediately, rebuild, run test → MUST FAIL (`r===0` assertion). Restore, rebuild, PASS.
- [ ] **Step 8: Wire into `test:ci`** — `package.json:30`, add `src/engine/maxtrax/__tests__/maxtraxReloadPatch.test.ts`.
- [ ] **Step 9: Commit** (background):

```bash
git add maxtrax-wasm/src/maxtrax_harness.c maxtrax-wasm/CMakeLists.txt \
        public/maxtrax/Maxtrax.js public/maxtrax/Maxtrax.wasm \
        src/engine/maxtrax/__tests__/maxtraxReloadPatch.test.ts \
        src/engine/maxtrax/__tests__/maxtraxReloadPatchRunner.cjs package.json
git commit -m "feat(maxtrax): Tier-2 full-patch rebuild from tailRaw slice"
```

---

## Task 3: TS byte-slice helper + engine + worklet wiring

**Files:**
- Modify: `src/lib/import/formats/maxtrax/maxtraxFormat.ts` (add `extractSampleDsampleSlice`)
- Modify: `src/engine/maxtrax/MaxTraxEngine.ts` (add `setSampleParam`, `reloadSample`)
- Modify: `public/maxtrax/Maxtrax.worklet.js` (add `setPatchScalar`, `reloadPatch` handlers)
- Test: `src/lib/import/formats/maxtrax/__tests__/extractSampleDsampleSlice.test.ts`

**Interfaces:**
- Consumes: `MaxTraxData` (with `tailRaw`), the WASM exports from Tasks 1-2.
- Produces:
  - `extractSampleDsampleSlice(data: MaxTraxData, sampleIndex: number): Uint8Array | null` — returns a **copy** of the tailRaw bytes `[headerBase, sampleEnd)` for that sample (same range `locateMaxTraxSampleInTailRaw` computes). Pure; no WASM.
  - `MaxTraxEngine.setSampleParam(patchNumber: number, field: 'tune' | 'volume', value: number): void`
  - `MaxTraxEngine.reloadSample(patchNumber: number, dsampleBytes: Uint8Array): void`

- [ ] **Step 1: Write the failing test** for `extractSampleDsampleSlice` — load `public/data/songs/maxtrax/antmusic.mxtx`, `decodeMaxTrax` → data, `const s = extractSampleDsampleSlice(data, 0)`. Assert `s !== null`, `s.length >= 20`, and the header round-trips: `new DataView(s.buffer, s.byteOffset).getUint16(6)` (octaves) equals `decodeMaxTraxSamples(data)[0].octaves`, and `s.length === 20 + (ac+rc)*4 + firstLen*(2^oct-1)` computed from that sample. (This locks the slice length to the WASM `len` contract.)
- [ ] **Step 2: Run to verify it fails** — FAIL (`extractSampleDsampleSlice` not exported).
- [ ] **Step 3: Implement `extractSampleDsampleSlice`** in `maxtraxFormat.ts`. Reuse the exact walk from `locateMaxTraxSampleInTailRaw` (duplicate is not allowed — export a shared locator or import it). Preferred: move the byte-walk into `maxtraxFormat.ts` as `locateSampleInTail(tail, index)` returning `{start, end}`, have `useFormatStore.ts` import it (single source), and implement `extractSampleDsampleSlice` as `tail.slice(loc.start, loc.end)`. If refactoring the store locator is out of scope for this task, implement `extractSampleDsampleSlice` with the identical walk and add a `// SINGLE SOURCE: mirrors locateMaxTraxSampleInTailRaw` comment plus a test asserting both agree — but prefer the shared-locator refactor.
- [ ] **Step 4: Run test to verify it passes** — PASS.
- [ ] **Step 5: Add engine methods** in `MaxTraxEngine.ts` (mirror existing `setEvent`/`recook` message posting; field→int map tune=0, volume=1):

```typescript
setSampleParam(patchNumber: number, field: 'tune' | 'volume', value: number): void {
    this.worklet?.port.postMessage({
        type: 'setPatchScalar',
        patchNumber, field: field === 'tune' ? 0 : 1, value: value | 0,
    });
}

reloadSample(patchNumber: number, dsampleBytes: Uint8Array): void {
    // Copy into a fresh transferable buffer (worklet owns it after transfer).
    const buf = dsampleBytes.slice();
    this.worklet?.port.postMessage(
        { type: 'reloadPatch', patchNumber, bytes: buf.buffer, len: buf.length },
        [buf.buffer],
    );
}
```

- [ ] **Step 6: Add worklet handlers** in `Maxtrax.worklet.js` `handleMessage` switch (mirror `setEvent`/`recook`; use `_malloc`/`HEAPU8.set`/`_free` for reloadPatch):

```js
case 'setPatchScalar':
    this.wasm._maxtrax_set_patch_scalar(msg.patchNumber, msg.field, msg.value);
    break;
case 'reloadPatch': {
    const bytes = new Uint8Array(msg.bytes);
    const ptr = this.wasm._malloc(msg.len);
    this.wasm.HEAPU8.set(bytes, ptr);
    this.wasm._maxtrax_reload_patch(msg.patchNumber, ptr, msg.len);
    this.wasm._free(ptr);
    break;
}
```

  (Match the actual field names the worklet uses for the module handle — `this.wasm` vs `this.mod` — read the file first and follow its convention.)
- [ ] **Step 7: Type-check** — `npm run type-check` → no errors.
- [ ] **Step 8: Wire test into `test:ci`** — `package.json:30`, add `src/lib/import/formats/maxtrax/__tests__/extractSampleDsampleSlice.test.ts`.
- [ ] **Step 9: Commit** (background):

```bash
git add src/lib/import/formats/maxtrax/maxtraxFormat.ts src/engine/maxtrax/MaxTraxEngine.ts \
        public/maxtrax/Maxtrax.worklet.js src/stores/useFormatStore.ts \
        src/lib/import/formats/maxtrax/__tests__/extractSampleDsampleSlice.test.ts package.json
git commit -m "feat(maxtrax): TS byte-slice helper + engine/worklet live-edit plumbing"
```

---

## Task 4: Wire MaxTraxControls to live edit

**Files:**
- Modify: `src/components/instruments/controls/MaxTraxControls.tsx`

**Interfaces:**
- Consumes: `MaxTraxEngine.setSampleParam`/`reloadSample` (Task 3), `extractSampleDsampleSlice` (Task 3), `mutateMaxTraxSample` (store).

- [ ] **Step 1:** Update `canLiveEdit` — now `typeof getInstance().setSampleParam === 'function'` is true after Task 3, so the gate reflects real capability. Remove the "future"/"does not yet exist" comment lines (105-116) and the stale block comment lines 16-18.
- [ ] **Step 2:** `setField` — for `tune`/`volume` call `MaxTraxEngine.getInstance().setSampleParam(sampleRef.current.number, field, value)` after `mutateMaxTraxSample` (scalar fast-path). For `number`/`octaves`/`attackLen`/`sustainLen` the edit is structural → after the store mutation, extract the fresh slice and reload:

```tsx
const applyStructural = () => {
    const data = useFormatStore.getState().maxTraxData;
    if (!data || !canLiveEdit) return;
    const slice = extractSampleDsampleSlice(data, sampleIndex);
    if (slice) MaxTraxEngine.getInstance().reloadSample(sampleRef.current.number, slice);
};
```

  Call `applyStructural()` after `mutateMaxTraxSample` in `setField` (for the structural fields), `setEnvField`, `addEnvPoint`, `removeEnvPoint`. Read `maxTraxData` fresh from the store (post-mutation) via `useFormatStore.getState()` so the slice reflects the just-applied edit — do NOT use the render-time `maxTraxData` (stale within the same handler tick).
  - Note on `number` edits: reloadSample keys the WASM rebuild by the NEW `sample.number` (post-mutation), relocating the patch to the new slot. The old slot retains stale data but is no longer referenced by the score once the patch number changes. Acceptable — matches the store/export semantics.
- [ ] **Step 3:** Ensure `sampleRef` mirrors the current decoded `sample` (configRef pattern) so callbacks read `sampleRef.current.number` not a stale closure. Add `useEffect(() => { sampleRef.current = sample; }, [sample]);` if not already present.
- [ ] **Step 4: Type-check** — `npm run type-check` → no errors.
- [ ] **Step 5: Manual verification (human)** — with `npm run dev` + real Chrome + MCP: load `antmusic.mxtx`, play, open the MaxTrax instrument editor, drag Tune while a note sustains → pitch bends live; change Volume → next notes quieter; edit an envelope point / add-remove → next note reflects it; the "Store only" note is gone. (MCP `load_file`, `play`, `get_audio_level`.) Do NOT self-check this box.
- [ ] **Step 6: Commit** (background):

```bash
git add src/components/instruments/controls/MaxTraxControls.tsx
git commit -m "feat(maxtrax): wire instrument editor to live in-place sample edit"
```

---

## Self-Review

- **Spec coverage:** Volume/Tune → Tier 1 (Task 1) + UI (Task 4). Number/Octaves/AttackLen/SustainLen/env add/remove/edit → Tier 2 (Task 2) + slice helper (Task 3) + UI (Task 4). "No reload" → scalars live via direct WRITE, structural via patch rebuild without touching playback cursor. `canLiveEdit` flips true → "Store only" note removed. All fields covered.
- **Placeholder scan:** none — all C and TS bodies are concrete. The one conditional ("if refactoring the store locator is out of scope") gives a concrete fallback with a cross-check test, not a TODO.
- **Type consistency:** `setSampleParam(patchNumber, 'tune'|'volume', value)` and `reloadSample(patchNumber, Uint8Array)` used identically in Tasks 3 and 4. Field int map (tune=0, volume=1) consistent across WASM setter, engine, worklet. `extractSampleDsampleSlice(data, index)` signature consistent. Slice length contract (`20+(ac+rc)*4+firstLen*(2^oct-1)`) identical in Task 2 guard, Task 3 test, and `locateMaxTraxSampleInTailRaw`.
- **Risk note (leak):** Tier 2 frees old buffers before re-allocating, so repeated edits do not leak the 16MB WASM heap. The drain-before-free step prevents freeing PCM a Paula channel is mid-DMA on.

## Execution Handoff

Plan saved to `thoughts/shared/plans/2026-07-11-maxtrax-inplace-sample-live-edit.md`. Execute via superpowers:subagent-driven-development (fresh implementer per task, task review between, broad review at end). Tasks 1→2→3→4 are ordered (2 depends on 1's getter; 3 depends on 1-2 exports; 4 depends on 3).
