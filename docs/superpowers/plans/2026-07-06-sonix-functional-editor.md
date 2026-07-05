# Sonix Functional Instrument Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `SonixControls` to replicate the Aegis SONIX V2.0 editor's functionality on the DEViLBOX synth-editor template, backing every control with a real `.instr` field (expanding the WASM parser for the two fields we don't yet read).

**Architecture:** Extend the Sonix WASM (parse the LFO waveform table @0x144; expose the already-parsed 4-Level/4-Rate envelope generator via new getters/setters), plumb the three new fields through the worklet and `SonixSynthParams`, then rebuild `SonixControls` into Aegis-order design-token panels. Live edits reuse the store routing fixed in 710d0fe4e.

**Tech Stack:** C (Emscripten WASM), AudioWorklet JS, TypeScript, React, Zustand, Vitest, Tailwind design tokens.

## Global Constraints

- DOM-only rendering; DEViLBOX design tokens only (see CLAUDE.md allowlist) — no retro chrome, no raw hex colors except intentional decorative canvas strokes.
- Knobs use `@components/controls/Knob` with the **configRef pattern** (read `paramsRef.current`, deps = `[updateInstrument]`) — never capture config in the callback.
- No emojis anywhere. Full English UI labels.
- Every bug/feature ships a regression test wired into a run config; type-check (`npm run type-check`) must pass before any task is complete.
- WASM output copies to `public/sonix/` (`cd sonix-wasm/build && emmake make` then `cp Sonix.js Sonix.wasm ../../public/sonix/`).
- No speculative DSP: `lfoWave` is exposed as editable/round-trippable data only; do NOT wire it into playback (the C port does not consume the third table today).
- Authoritative disk offsets are in `sonix_io.c`, not the asm. All offsets relative to `instr_data`.

---

### Task 1: WASM — LFO waveform table storage, setter, and parse @0x144

**Files:**
- Modify: `sonix-wasm/src/sonix/sonix.c` (struct ~line 82-93; new setter near `sonix_song_set_synth_env_table` ~line 3417)
- Modify: `sonix-wasm/src/sonix/sonix_io.h` (declare setter)
- Modify: `sonix-wasm/src/sonix/sonix_io.c` (parse in synth block ~line 1223)
- Test: `tools/sonix-audit/synthFields.test.ts` (new) + `tools/sonix-audit/probe-synth-fields.c` (new native harness)

**Interfaces:**
- Produces: `void sonix_song_set_synth_lfo_wave(SonixSong* song, uint8_t idx, const int8_t* wave128)`; struct fields `i8 synth_lfo_wave[64][128]`, `bool synth_lfo_wave_set[64]`.

- [ ] **Step 1: Write the failing native probe + test**

Create `tools/sonix-audit/probe-synth-fields.c`:
```c
// Prints synth fields for one instrument index so the vitest can assert parse correctness.
// Build: cc -O1 -w -I <repo>/sonix-wasm/src probe-synth-fields.c -o probe -lm
// Run:   probe "<song>.smus" <instIndex>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include "sonix/sonix.h"
#include "sonix/sonix.c"
#include "sonix/sonix_io.c"
static bool rd(const char*p,uint8_t**o,uint32_t*os,void*u){(void)u;FILE*f=fopen(p,"rb");if(!f)return false;fseek(f,0,2);long n=ftell(f);fseek(f,0,0);uint8_t*b=malloc(n);fread(b,1,n,f);fclose(f);*o=b;*os=n;return true;}
static int ls(const char*d,void(*v)(const char*,void*),void*c,void*u){(void)u;DIR*dir=opendir(d);if(!dir)return -1;struct dirent*e;int n=0;while((e=readdir(dir))){if(e->d_name[0]=='.')continue;if(v)v(e->d_name,c);n++;}closedir(dir);return n;}
int main(int c,char**v){
  int idx = c>=3?atoi(v[2]):0;
  FILE*fi=fopen(v[1],"rb");fseek(fi,0,2);long n=ftell(fi);fseek(fi,0,0);uint8_t*bf=malloc(n);fread(bf,1,n,fi);fclose(fi);
  SonixIoCallbacks io;memset(&io,0,sizeof(io));io.read_file=rd;io.list_dir=ls;
  SonixSong*s=sonix_song_create(bf,n,&io);sonix_song_load_instruments(s,v[1]);
  int lfoNonZero=0; for(int k=0;k<128;k++) if(s->synth_lfo_wave[idx][k]!=0) lfoNonZero++;
  printf("IS_SYNTH %d LFO_SET %d LFO_NONZERO %d EG_L %u %u %u %u EG_R %u %u %u %u\n",
    s->instrument_is_synth[idx], s->synth_lfo_wave_set[idx], lfoNonZero,
    s->ss_port_target[idx][0],s->ss_port_target[idx][1],s->ss_port_target[idx][2],s->ss_port_target[idx][3],
    s->ss_port_speed[idx][0],s->ss_port_speed[idx][1],s->ss_port_speed[idx][2],s->ss_port_speed[idx][3]);
  return 0;}
```

Create `tools/sonix-audit/synthFields.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const REPO = path.resolve(__dirname, '../..');
const INCLUDE = path.join(REPO, 'sonix-wasm/src');
const PROBE = path.join(__dirname, 'probe-synth-fields.c');
const FIXTURE = path.join(REPO, 'public/data/songs/sonix-smus/ACE II/ACE II.smus');

function cc(): string | null {
  for (const c of ['cc', 'clang', 'gcc']) { try { execSync(`${c} --version`, { stdio: 'pipe' }); return c; } catch { /* next */ } }
  return null;
}
const compiler = cc();
const haveFixture = fs.existsSync(FIXTURE);

describe.skipIf(!compiler || !haveFixture)('Sonix synth field parse', () => {
  let out = '';
  beforeAll(() => {
    const bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sonix-fields-')), 'probe');
    execSync(`${compiler} -O1 -w -I "${INCLUDE}" "${PROBE}" -o "${bin}" -lm`, { stdio: 'pipe' });
    // Instrument index of a synth in ACE II — pick the first is_synth. Ace2leed is synth; find one by scanning.
    for (let i = 0; i < 12; i++) {
      const line = execFileSync(bin, [FIXTURE, String(i)], { encoding: 'utf-8' });
      if (line.startsWith('IS_SYNTH 1')) { out = line.trim(); break; }
    }
  });

  it('parses the LFO waveform table @0x144 (128 bytes loaded)', () => {
    expect(out).toMatch(/LFO_SET 1/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Add script to `package.json` scripts: `"test:sonix": "vitest run --config tools/sonix-audit/vitest.config.ts"` already exists — it globs `tools/sonix-audit/*.test.ts`, so the new test is auto-included.
Run: `npm run test:sonix`
Expected: FAIL — `LFO_SET 1` not found (field is 0; not parsed yet).

- [ ] **Step 3: Add struct storage in `sonix.c`**

After line 93 (`i8 synth_env_table[64][128];` block), add:
```c
    i8 synth_lfo_wave[64][128];    // file 0x144: third full-cycle table (Aegis "LFO" waveform tab); data-faithful, not consumed by DSP
    bool synth_lfo_wave_set[64];
```

- [ ] **Step 4: Add setter in `sonix.c`**

After `sonix_song_set_synth_env_table` (~line 3417 block), add:
```c
void sonix_song_set_synth_lfo_wave(SonixSong* song, u8 instrument_index, const int8_t* wave128) {
    if (song == nullptr || instrument_index >= 64 || wave128 == nullptr) return;
    memcpy(song->synth_lfo_wave[instrument_index], wave128, 128);
    song->synth_lfo_wave_set[instrument_index] = true;
}
```

- [ ] **Step 5: Declare setter in `sonix_io.h`**

Next to `void sonix_song_set_synth_env_table(...)`, add:
```c
void sonix_song_set_synth_lfo_wave(SonixSong* song, uint8_t instrument_index, const int8_t* wave128);
```

- [ ] **Step 6: Parse @0x144 in `sonix_io.c`**

Immediately after the env_table read (line 1223, `sonix_song_set_synth_env_table(song, (uint8_t)i, (const int8_t*)(instr_data + 0xC4));`), add:
```c
                    if (instr_size >= 0x1C4)
                        sonix_song_set_synth_lfo_wave(song, (uint8_t)i, (const int8_t*)(instr_data + 0x144));
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:sonix`
Expected: PASS — `LFO_SET 1` present.

- [ ] **Step 8: Commit**

```bash
git add sonix-wasm/src/sonix/sonix.c sonix-wasm/src/sonix/sonix_io.h sonix-wasm/src/sonix/sonix_io.c tools/sonix-audit/probe-synth-fields.c tools/sonix-audit/synthFields.test.ts
git commit -m "feat(sonix): parse LFO waveform table @0x144 into synth params"
```

---

### Task 2: WASM — harness getters/setters for lfoWave + EG levels/rates; rebuild

**Files:**
- Modify: `sonix-wasm/src/sonix_harness.c` (near existing synth getters ~line 278-289)
- Modify: `sonix-wasm/CMakeLists.txt` (EXPORTED_FUNCTIONS list)
- Test: extend `tools/sonix-audit/synthFields.test.ts`

**Interfaces:**
- Produces (exported WASM symbols): `_sonix_synth_get_lfo_wave(int i, int8_t* out)`, `_sonix_synth_set_lfo_wave(int i, const int8_t* w)`, `_sonix_synth_get_eg_level(int i, int j)`, `_sonix_synth_set_eg_level(int i, int j, int v)`, `_sonix_synth_get_eg_rate(int i, int j)`, `_sonix_synth_set_eg_rate(int i, int j, int v)`.

- [ ] **Step 1: Extend the test (assert EG values are non-trivial and round-trip via struct)**

Append to `synthFields.test.ts` describe block:
```ts
  it('exposes the 4-stage envelope generator levels and rates', () => {
    const m = out.match(/EG_L (\d+) (\d+) (\d+) (\d+) EG_R (\d+) (\d+) (\d+) (\d+)/);
    expect(m).toBeTruthy();
    const nums = m!.slice(1).map(Number);
    // At least one level or rate is non-zero for a real synth instrument.
    expect(nums.some((n) => n > 0)).toBe(true);
  });
```
Run: `npm run test:sonix` — Expected: PASS already (probe reads struct directly). This locks the EG fields exist before we expose them.

- [ ] **Step 2: Add harness exports in `sonix_harness.c`**

After line 289 (`sonix_synth_set_env_table`), add:
```c
EXPORT void sonix_synth_get_lfo_wave(int i, int8_t* out)   { if (SNX_OK(i) && out) memcpy(out, g_song->synth_lfo_wave[i], 128); }
EXPORT void sonix_synth_set_lfo_wave(int i, const int8_t* w){ if (SNX_OK(i) && w)   sonix_song_set_synth_lfo_wave(g_song, (uint8_t)i, w); }
EXPORT int  sonix_synth_get_eg_level(int i, int j) { return (SNX_OK(i) && j >= 0 && j < 4) ? (int)g_song->ss_port_target[i][j] : 0; }
EXPORT void sonix_synth_set_eg_level(int i, int j, int v) { if (SNX_OK(i) && j >= 0 && j < 4) g_song->ss_port_target[i][j] = (uint16_t)v; }
EXPORT int  sonix_synth_get_eg_rate(int i, int j)  { return (SNX_OK(i) && j >= 0 && j < 4) ? (int)g_song->ss_port_speed[i][j] : 0; }
EXPORT void sonix_synth_set_eg_rate(int i, int j, int v)  { if (SNX_OK(i) && j >= 0 && j < 4) g_song->ss_port_speed[i][j] = (uint16_t)v; }
```

- [ ] **Step 3: Add to EXPORTED_FUNCTIONS in `CMakeLists.txt`**

In the `-s EXPORTED_FUNCTIONS=[...]` list, append these entries (comma-separated, before `_malloc`):
```
'_sonix_synth_get_lfo_wave','_sonix_synth_set_lfo_wave','_sonix_synth_get_eg_level','_sonix_synth_set_eg_level','_sonix_synth_get_eg_rate','_sonix_synth_set_eg_rate',
```

- [ ] **Step 4: Rebuild WASM and copy to public/**

Run:
```bash
cd sonix-wasm/build && emmake make 2>&1 | tail -3 && cp Sonix.js Sonix.wasm ../../public/sonix/
```
Expected: `Built target Sonix`; both files copied.

- [ ] **Step 5: Verify exports present**

Run: `grep -c "_sonix_synth_get_eg_level" public/sonix/Sonix.js`
Expected: `>= 1`.

- [ ] **Step 6: Commit**

```bash
git add sonix-wasm/src/sonix_harness.c sonix-wasm/CMakeLists.txt public/sonix/Sonix.js public/sonix/Sonix.wasm tools/sonix-audit/synthFields.test.ts
git commit -m "feat(sonix): expose lfoWave + EG level/rate getters/setters in WASM"
```

---

### Task 3: WASM — per-field size guards for 486-byte synth variant

**Files:**
- Modify: `sonix-wasm/src/sonix/sonix_io.c` (synth block gate ~line 1192)

**Interfaces:** none new — behavioural fix only.

- [ ] **Step 1: Read the current gate**

Confirm line ~1192 reads `if (instr_size >= 0x1F6) {` wrapping the base_vol/filter/env/EG block.

- [ ] **Step 2: Replace the single gate with per-field guards**

Change the block so each field group is guarded by its own minimum size. Wrap:
- base_vol/port_flag (0x1CC..0x1CF): `instr_size >= 0x1D0`
- env_vscale/slide/pscale/filter/env/blend (0x1D0..0x1E5): `instr_size >= 0x1E6`
- EG targets/speeds (0x1E6..0x1F5): `instr_size >= 0x1F6`

Concretely, split the existing `if (instr_size >= 0x1F6) { ... }` into three sequential `if` blocks with those thresholds, moving each field's read + setter call under the matching guard. Keep the field reads and setter calls byte-for-byte identical; only the guards change.

- [ ] **Step 3: Verify 502-byte fixture still parses identically**

Run: `npm run test:sonix`
Expected: PASS (ACE II is 502 B — all three guards satisfied; no behaviour change).

- [ ] **Step 4: Rebuild WASM + copy**

Run: `cd sonix-wasm/build && emmake make 2>&1 | tail -2 && cp Sonix.js Sonix.wasm ../../public/sonix/`

- [ ] **Step 5: Commit**

```bash
git add sonix-wasm/src/sonix/sonix_io.c public/sonix/Sonix.js public/sonix/Sonix.wasm
git commit -m "fix(sonix): per-field size guards so 486-byte synth instruments parse"
```

---

### Task 4: Worklet — expose lfoWave/egLevels/egRates in postSynthParams + applySynthParams

**Files:**
- Modify: `public/sonix/Sonix.worklet.js` (`postSynthParams` ~line 190-215; `applySynthParams` ~line 221-229)

**Interfaces:**
- Consumes: WASM exports from Task 2.
- Produces: worklet `synthParams` message now carries `lfoWave: number[]`, `egLevels: number[]`, `egRates: number[]` per instrument; `applySynthParams` writes them back.

- [ ] **Step 1: Add reads in `postSynthParams` instrument object**

Inside the `instruments.push({ ... })` object (after `envTable: ...`), add:
```js
        lfoWave: this.readInt8Array(m._sonix_synth_get_lfo_wave.bind(m), i),
        egLevels: [0,1,2,3].map((j) => m._sonix_synth_get_eg_level(i, j)),
        egRates: [0,1,2,3].map((j) => m._sonix_synth_get_eg_rate(i, j)),
```

- [ ] **Step 2: Add writes in `applySynthParams`**

After the `env_table` write (line 229), add:
```js
    if (Array.isArray(p.lfoWave)) this.writeInt8Array(m._sonix_synth_set_lfo_wave.bind(m), i, p.lfoWave);
    if (Array.isArray(p.egLevels)) p.egLevels.forEach((v, j) => m._sonix_synth_set_eg_level(i, j, v | 0));
    if (Array.isArray(p.egRates)) p.egRates.forEach((v, j) => m._sonix_synth_set_eg_rate(i, j, v | 0));
```

- [ ] **Step 3: Bump the worklet cache-bust token**

Find the worklet cache-bust constant (search `workletCacheBust` / a version query in `SonixEngine.ts`) and increment it so the browser reloads the new worklet.
Run: `grep -rn "workletCacheBust\|Sonix.worklet.js?" src/engine/sonix/SonixEngine.ts`
Bump the numeric token by 1.

- [ ] **Step 4: Type-check (no TS touched yet, sanity)**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/sonix/Sonix.worklet.js src/engine/sonix/SonixEngine.ts
git commit -m "feat(sonix): plumb lfoWave + EG level/rate through the worklet param bridge"
```

---

### Task 5: TS — SonixSynthParams fields, editor meta, and harmonic-bake pure function

**Files:**
- Modify: `src/engine/sonix/SonixEngine.ts` (`SonixSynthParams` interface ~line 24)
- Modify: `src/engine/sonix/sonixInstrument.ts` (meta + new `addHarmonic`)
- Test: `src/engine/sonix/__tests__/sonixWaveform.test.ts` (new)

**Interfaces:**
- Produces: `SonixSynthParams` gains `lfoWave: number[]; egLevels: number[]; egRates: number[]`. `addHarmonic(wave: number[], harmonic: 2 | 3, amt: number): number[]`.

- [ ] **Step 1: Write the failing harmonic-bake test**

Create `src/engine/sonix/__tests__/sonixWaveform.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { addHarmonic } from '../sonixInstrument';

describe('addHarmonic', () => {
  it('adds a 2nd-harmonic partial and stays within i8 range', () => {
    const flat = new Array(128).fill(0);
    const out = addHarmonic(flat, 2, 1);
    expect(out).toHaveLength(128);
    expect(Math.max(...out)).toBeLessThanOrEqual(127);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(-128);
    // A 2nd harmonic over 128 samples completes 2 cycles → 4 zero-crossings.
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if ((out[i - 1] <= 0) !== (out[i] <= 0)) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(3);
  });

  it('amt=0 is a no-op', () => {
    const wave = Array.from({ length: 128 }, (_, i) => (i < 64 ? 40 : -40));
    expect(addHarmonic(wave, 3, 0)).toEqual(wave);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/sonix/__tests__/sonixWaveform.test.ts`
Expected: FAIL — `addHarmonic` not exported.

- [ ] **Step 3: Add `addHarmonic` to `sonixInstrument.ts`**

```ts
/**
 * Bake an additive harmonic partial into a 128-sample signed waveform (Aegis "2nd"/"3rd"
 * Harm + Amt). `amt` is 0..1 of full i8 scale. Returns a new clamped copy.
 */
export function addHarmonic(wave: number[], harmonic: 2 | 3, amt: number): number[] {
  if (amt === 0) return wave.slice();
  const n = wave.length;
  return wave.map((v, i) => {
    const partial = Math.round(Math.sin((2 * Math.PI * harmonic * i) / n) * 127 * amt);
    return Math.max(-128, Math.min(127, v + partial));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/sonix/__tests__/sonixWaveform.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `SonixSynthParams` in `SonixEngine.ts`**

In the interface (after `envTable: number[]`), add:
```ts
  lfoWave: number[];   // third 128-sample table @0x144 (Aegis "LFO" waveform tab)
  egLevels: number[];  // 4-stage envelope generator targets
  egRates: number[];   // 4-stage envelope generator speeds (raw u16, bit-packed base/shift)
```

- [ ] **Step 6: Make `readSonixSynthParams` tolerant of legacy configs**

In `sonixInstrument.ts` `readSonixSynthParams`, after the null guard, normalize missing arrays so older persisted configs don't crash the editor:
```ts
  return {
    ...sonix,
    lfoWave: Array.isArray(sonix.lfoWave) ? sonix.lfoWave : new Array(128).fill(0),
    egLevels: Array.isArray(sonix.egLevels) ? sonix.egLevels : [0, 0, 0, 0],
    egRates: Array.isArray(sonix.egRates) ? sonix.egRates : [0, 0, 0, 0],
  };
```
(Keep the existing `index`/`wave` guard above this.)

- [ ] **Step 7: Type-check + run test**

Run: `npm run type-check && npx vitest run src/engine/sonix/__tests__/sonixWaveform.test.ts`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/engine/sonix/SonixEngine.ts src/engine/sonix/sonixInstrument.ts src/engine/sonix/__tests__/sonixWaveform.test.ts
git commit -m "feat(sonix): add lfoWave/egLevels/egRates params + addHarmonic bake"
```

---

### Task 6: UI — rebuild SonixControls into Aegis-order functional panels

**Files:**
- Modify: `src/components/instruments/controls/SonixControls.tsx` (full rebuild)

**Interfaces:**
- Consumes: `SonixSynthParams` (Task 5), `SONIX_PARAM_META`, `addHarmonic`, `Knob`, `Toggle`, `CustomSelect`.

**Panel → control map (all wired through the existing `handleChange`/canvas handlers):**

| Panel | Controls | param key(s) |
|---|---|---|
| Waveform (3 tabs + Ok/Undo) | Oscillator / LFO / Filter Env canvases; +2nd, +3rd buttons; Amt knob | `wave`, `lfoWave`, `envTable` |
| Amplitude | Vol, Env→Volume | `baseVol`, `envVolScale` |
| Freq | Port, LFO | `slideRate`, `envPitchScale` |
| Filter | Freq, EG, LFO | `filterBase`, `filterEnvSens`, `filterRange` |
| LFO | Speed, Sync (Off/Once/On), Delay | `envScanRate`, `envLoopMode`, `envDelayInit` |
| Phase | Speed, Depth | `c2`, `c4` |
| Envelope Generator | Levels 1–4, Rates 1–4 | `egLevels[0..3]`, `egRates[0..3]` |

- [ ] **Step 1: Add array-param + Sync change handlers (configRef pattern)**

Keep the existing `paramsRef`/`handleChange` for scalars. Add, inside the component:
```tsx
  const handleArrayChange = useCallback((key: 'wave' | 'lfoWave' | 'envTable' | 'egLevels' | 'egRates', arr: number[]) => {
    const cur = paramsRef.current;
    if (!cur) return;
    const next = { ...cur, [key]: arr } as SonixSynthParams;
    paramsRef.current = next;
    updateInstrument(idRef.current, { parameters: { sonixIndex: next.index, sonix: next } } as Parameters<typeof updateInstrument>[1]);
    bump();
  }, [updateInstrument]);

  const handleEgChange = useCallback((bank: 'egLevels' | 'egRates', slot: number, value: number) => {
    const cur = paramsRef.current;
    if (!cur) return;
    const arr = (cur[bank] as number[]).slice();
    arr[slot] = Math.round(value);
    handleArrayChange(bank, arr);
  }, [handleArrayChange]);
```

- [ ] **Step 2: Make the waveform canvas drawable with 3 tabs + Ok/Undo**

Replace the two read-only `ByteCanvas` panels with one tabbed, editable canvas. Use a local editing snapshot for Undo:
```tsx
  const [waveTab, setWaveTab] = useState<'wave' | 'lfoWave' | 'envTable'>('wave');
  const snapshotRef = useRef<number[] | null>(null);
  const drawAt = (tab: typeof waveTab, x: number, y: number, w: number, h: number) => {
    const cur = paramsRef.current; if (!cur) return;
    const arr = (cur[tab] as number[]).slice();
    const idx = Math.max(0, Math.min(127, Math.floor((x / w) * 128)));
    const val = Math.max(-128, Math.min(127, Math.round((0.5 - y / h) * 255)));
    arr[idx] = val;
    handleArrayChange(tab, arr);
  };
```
Render tab buttons using `Button variant="ghost"` (active = `variant="primary"`), an editable `<canvas>` bound to pointer events (`onPointerDown` snapshots `snapshotRef.current = [...cur[tab]]`, `onPointerMove` while down calls `drawAt`), and **Ok** (clears snapshot) / **Undo** (`handleArrayChange(waveTab, snapshotRef.current!)`) using `Button`. Reuse the existing `ByteCanvas` drawing math for the read path; add the write path above.

- [ ] **Step 3: Add the +2nd / +3rd / Amt harmonic-bake controls under the Oscillator tab**

```tsx
  const [harmAmt, setHarmAmt] = useState(40); // 0..127 → amt/127
  const bake = (h: 2 | 3) => {
    const cur = paramsRef.current; if (!cur) return;
    handleArrayChange('wave', addHarmonic(cur.wave, h, harmAmt / 127));
  };
```
Render only when `waveTab === 'wave'`: two `Button`s (`+2nd`, `+3rd`) calling `bake(2)`/`bake(3)`, and a `Knob` for `harmAmt` (min 0 max 127, label "Amt").

- [ ] **Step 4: Build the seven labelled panels**

Use a small local `KnobRow` helper (design tokens: `bg-dark-bgSecondary rounded-lg border border-dark-borderLight p-3`, `SectionLabel`). Scalars use `Knob` with `value={params[key]}`, `min`/`max` from `SONIX_PARAM_META`, `onChange={(v)=>handleChange(key,v)}`. Sync uses `CustomSelect` mapping `{Off:-1, Once:0, On:1}` → `handleChange('envLoopMode', n)`. EG uses eight `Knob`s wired to `handleEgChange`. Rates show the decoded step in `formatValue`:
```tsx
  const decodeRateStep = (raw: number) => {
    const base = (raw & 0x1f) + 0x21; const shift = (raw >> 5) & 0x7;
    return (base * 8) >> (shift ^ 7); // ticks_per_beat factored out; relative readout
  };
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 6: Lint the touched file**

Run: `npm run lint 2>&1 | grep -i sonixcontrols || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/components/instruments/controls/SonixControls.tsx
git commit -m "feat(sonix): rebuild editor into Aegis-order functional panels (draw tabs, harmonic bake, EG)"
```

---

### Task 7: Store routing regression for array params + live validation

**Files:**
- Modify: `src/stores/__tests__/sonixSynthLiveEdit.test.ts` (extend)

**Interfaces:**
- Consumes: the SonixSynth store branch (commit 710d0fe4e), `SonixSynthParams` (Task 5).

- [ ] **Step 1: Add an egLevels-edit routing assertion**

Append to the existing describe block:
```ts
  it('routes an egLevels edit through applyConfig (not invalidation)', () => {
    const id = seedSonixSynth();
    useInstrumentStore.getState().updateInstrument(id, {
      parameters: { sonixIndex: 2, sonix: { index: 2, baseVol: 200, wave: new Array(128).fill(0), envTable: new Array(128).fill(0), lfoWave: new Array(128).fill(0), egLevels: [10, 20, 30, 40], egRates: [1, 2, 3, 4] } },
    } as any);
    expect(applyConfig).toHaveBeenCalledTimes(1);
    expect(invalidateInstrument).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the store test**

Run: `npx vitest run src/stores/__tests__/sonixSynthLiveEdit.test.ts`
Expected: PASS (routing already exists; this locks array-param edits use it).

- [ ] **Step 3: Full validation sweep**

Run: `npm run type-check && npm run test:sonix && npx vitest run src/stores/__tests__/sonixSynthLiveEdit.test.ts src/engine/sonix/__tests__/sonixWaveform.test.ts`
Expected: all PASS.

- [ ] **Step 4: Manual in-browser check (human)**

`npm run dev`, open localhost:5174, click once, load `public/data/songs/sonix-smus/ACE II/ACE II.smus`, **play** (bridge tags synths on play), open a synth instrument's editor. Verify: 3 waveform tabs draw; +2nd/+3rd change the oscillator; every knob moves and audibly morphs the running song; EG knobs present. (Human-only — do not auto-check.)

- [ ] **Step 5: Commit**

```bash
git add src/stores/__tests__/sonixSynthLiveEdit.test.ts
git commit -m "test(sonix): assert array-param (EG) edits route to live synth"
```

---

## Self-Review

**Spec coverage:**
- LFO table @0x144 → Task 1 (parse) + Task 2 (getter/setter) + Task 4 (worklet) + Task 5 (param) + Task 6 (LFO draw tab). ✓
- EG Levels/Rates → Task 2 (getters/setters) + Task 4 (worklet) + Task 5 (params) + Task 6 (8 knobs) + Task 7 (routing). ✓
- Amplitude/Freq/Filter/LFO/Phase controls (existing scalars) → Task 6 panels. ✓
- Harmonic bake canvas action → Task 5 (`addHarmonic`) + Task 6 (buttons). ✓
- 3 drawable tabs → Task 6 Step 2. ✓
- 486-byte variant → Task 3. ✓
- Amplitude-LFO omitted; no new LFO DSP — honored (Task 1 data-faithful note; no DSP task). ✓
- Live routing reused (710d0fe4e) — no new store branch; Task 7 verifies. ✓

**Placeholder scan:** All code steps carry concrete code; no TBD/TODO. ✓

**Type consistency:** `SonixSynthParams` fields `lfoWave`/`egLevels`/`egRates` are defined in Task 5 and consumed identically in Tasks 4 (worklet keys), 6 (handlers), 7 (test). `addHarmonic(wave, harmonic, amt)` signature consistent across Task 5 def and Task 6 use. Getter/setter names consistent between Task 2 (C) and Task 4 (worklet `_sonix_synth_get_eg_level` etc.). ✓
