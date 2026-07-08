---
date: 2026-07-08
topic: maxtrax-transpile-native-player
tags: [maxtrax, uade, transpiler, asm68k-to-c, audio.device, wasm]
status: in-progress
---

# MaxTrax full native player via asm68k→C transpile

## Task
User wants MaxTrax (.mxtx) to play ACCURATELY. The current native path (grid
quantization + ToneEngine samplers, commit 0a00f4b4b) makes sound but plays
"very far from how it should" — grid quantization is the wrong abstraction for
an event format (tick-precise start/stop, tempo events, pitch bend, overlapping
notes, per-note durations, synth macros/envelopes are all lost).

User decisions (2026-07-08):
- Approach = **transpile max.asm → C → WASM native player** (not TS port, not grid tuning).
- Confirmed "Go — full transpile + audio.device shim" AFTER being told it needs
  an audio.device + exec emulation layer (multi-day).

## Ground-truth constraint (important)
Classic DEViLBOX lockstep (UADE Paula dump vs C replayer) is IMPOSSIBLE for
MaxTrax: UADE cannot render it (no eagleplayer.conf entry; UADE's own
amigasrc/players/max_trax + score/todo.txt flag MaxTrax as needing a fake
audio.device + dtg_FileArrayPTR fixes never done). `player.c` is a 101-line
loader stub; the real replayer is `max.asm` (2900+ lines 68k) + `shared.asm`.
So the transpiled max.asm IS the reference — verify by ear + user knowledge.

## Key discoveries
1. **max.asm outputs ALL sound via AmigaOS audio.device**, not direct Paula.
   Every voice = a CMD_WRITE IOAudio request via BEGINIO with
   ioa_Data(sample ptr), ioa_Length, ioa_Period, ioa_Volume, ioa_Cycles.
   Two-segment attack/sustain model (max.asm ~line 768 attack cycles=1, ~808
   sustain cycles=0 loop). Only $dff000 writes are filter/DMACON toggles.
   → Need an audio.device emulation: intercept BEGINIO, map each IOAudio
     request to a paula_soft channel (ptr/len/period/vol → sample+loop; cycles
     0=loop, N=one-shot; attack→sustain chaining = sample body + loop region).
2. **Transpiler ignores `include`** (preprocess.ts:205 skips it). shared.asm
   (EnvOneVoice envelope + divs/divu/mulu math) must be supplied via `-P`.
3. **Transpiler stubs ALL library/device calls to no-ops**: JSRLIB/JSRDEV
   macros (`jsr _LVO<name>(a6)`) emit generic `_LVO()` / `DEV_()` no-op calls
   — the function NAME (AllocMem/OpenDevice/BEGINIO/CopyMem/AddIntServer/…) is
   DROPPED, so calls are indistinguishable and do nothing. This is the #1
   blocker: no memory allocated, no sound submitted.

## Transpile command (regenerates the C — output is NOT committed, it's generated)
```
node tools/asm68k-to-c/dist/cli.js --no-wrapper -o maxtrax-wasm/src/generated -n maxtrax \
  -P third-party/uade-3.05/amigasrc/players/max_trax/shared.asm \
     third-party/uade-3.05/amigasrc/players/max_trax/max.asm
```
Produces maxtrax-wasm/src/generated/maxtrax/maxtrax.{c,h} (~14231 lines).
Parses clean: 158 labels, full API exported: _InitMusic, _NewInitMusic,
_OpenMusic/_CloseMusic, _PlaySong/_StopSong/_ContinueSong, _AdvanceSong,
_SelectScore, _PlayNote/_PlaySound/_StopSound, _SetTempo, _LoadPerf, etc.
paula_soft.{c,h} + amiga_includes shims live in tools/asm68k-to-c/runtime/.
Emitter's hw_write8/16/32 (emitter.ts:98-132) already route $DFF0A0-DF Paula
regs to paula_soft AT RUNTIME — but max.asm doesn't use them (audio.device).

## Exec/device shim surface (from max.asm JSRLIB/JSRDEV)
AllocMem, FreeMem, AddIntServer, RemIntServer, OpenDevice, CloseDevice,
CopyMem, BEGINIO (the audio one), OpenLibrary/CloseLibrary, plus likely
GetMsg/WaitPort/PutMsg for audio reply ports. IOAudio struct offsets
(ioa_Data/Length/Period/Volume/Cycles/AllocKey, IO_COMMAND, IO_UNIT,
ioa_SIZEOF) are in the max_trax dir includes (driver.i / maxtrax.i / audio.i).

## PROGRESS 2026-07-08 (session 2) — transpiler now handles the OS surface
Committed transpiler improvements (all 80 transpiler tests pass):
- fc8312373: macro-arg substitution (\1,\@), NAMED AmigaOS lib/device calls
  (JSR _LVOname(a6)/DEV_name(a6) -> _LVOname()/DEV_name() + weak override stubs),
  local-label scoping (.loop -> Routine_L_loop per enclosing global label).
- 23c25ec2a: Amiga STRUCTURE offset macros (expandStructures: STRUCTURE/WORD/
  BYTE/APTR/LONG/STRUCT/LABEL/ALIGN -> computed EQU offsets), evalConst widened
  for << >> & | ^ ~. New maxtrax-wasm/src/maxtrax_defs.i (canonical Node/Message/
  MsgPort/Interrupt/IORequest/IOStdReq/IOAudio layouts + CMD_*/MEMF_*/INTB_VERTB/
  aud=$a0 constants) supplied as a preamble.

### Current transpile command (7 compile errors left, down from 11)
```
M=third-party/uade-3.05/amigasrc/players/max_trax
node tools/asm68k-to-c/dist/cli.js --no-wrapper -o maxtrax-wasm/src/generated -n maxtrax \
  -P maxtrax-wasm/src/maxtrax_defs.i -P $M/driver.i -P $M/maxtrax.i -P $M/shared.asm $M/max.asm
cc -c -I tools/asm68k-to-c/runtime -o /tmp/mxtx.o maxtrax-wasm/src/generated/maxtrax/maxtrax.c
```
(generated C is gitignored; maxtrax_defs.i IS committed.)

### REMAINING 7 compile errors = distinct transpiler parser bugs (source lines)
1. LEA with `*` in displacement expr: max.asm:292 `lea 3*NUM_VOICES*ioa_SIZEOF(a1),a1`
   -> parser splits the multiplied displacement into bogus operands.
2. AND.B with complement/or immediate: max.asm:1253 `and.b #~MUSIC_VELOCITY,glob_Flags(a4)`
   and 1619 `and.b #~(MUSIC_PLAYING|MUSIC_SILENT|MUSIC_LOOP),mxtx_Flags(a5)` ->
   `#~expr` / `#(a|b|c)` immediate dropped -> emits `& )` (empty). Needs ~ and | in
   immediate-expression eval (evalConst now supports them; the IMMEDIATE parse path
   must use it).
3. LEA label+offset absolute: max.asm:2191 `lea _globaldata+glob_NoteOff,a0` ->
   emits `glob_NoteOff = _globaldata` (treats it as 2 operands / wrong target).
4. MULU.W memory-source form -> wrong assignment target (dst should be Dn, got the
   struct-offset symbol). Generated comment `MULU.W _globaldata,glob_Frequency,D1`.
5. Duplicate dot-local label in ONE scope: max.asm:2409 `.l40` AND 2526 `.l40` both
   under the same global (no intervening non-local label) -> `redefinition of label`.
   Assembler uses nearest-preceding/following-def semantics; transpiler needs
   per-definition uniquification for repeated locals (like numeric 1:/1b locals).
Roots: (1)(3) = arithmetic in address/displacement expressions; (2) = immediate
expr with ~ and |; (4) = MULU mem-operand emission; (5) = repeated local labels.
After these compile-clean, proceed to Phase 2 (audio.device shim + harness + WASM).

## NEXT STEPS (ordered)
0. Fix the 5 transpiler parser-bug classes above so max.asm compiles clean.
1. **Transpiler: emit NAMED library/device calls.** [DONE fc8312373] Make JSRLIB/JSRDEV expand
   `_LVO<name>(a6)` → a call like `amiga_AllocMem(...)` (or a dispatch on the
   LVO offset). Look at parser/preprocess macro handling + the `jsr d(a6)`
   emitter path. Without names, no shim can hook. This is the gating fix.
2. **Write the exec/device shim** (new C, hand-written, #included by harness):
   AllocMem→calloc, FreeMem→free, CopyMem→memcpy, OpenLibrary/OpenDevice→
   dummy non-null base, AddIntServer→store the vblank server node,
   BEGINIO→audio.device emulation (below), GetMsg/reply→immediate completion.
3. **audio.device emulation**: on CMD_WRITE BEGINIO, read IOAudio fields, pick
   the Paula channel from IO_UNIT/AllocKey, call paula_set_sample_ptr/length/
   period/volume + start; model attack(one-shot)→sustain(loop) chaining;
   complete the request (so the driver's msg loop advances).
4. **VBlank driver**: call the registered vblank server (AddIntServer node's
   IS_CODE) at 50Hz (PAL) from the render loop to tick AdvanceSong.
5. **Harness** (maxtrax-wasm/src/maxtrax_harness.c): load(mxtx bytes)→
   InitMusic/OpenMusic/SelectScore/PlaySong; render(buf,frames)→run vblank
   ticks + paula_render; mirror sonix-wasm/src/sonix_harness.c + CMakeLists.txt.
6. **Build WASM** → public/maxtrax/Maxtrax.{js,wasm} + worklet.
7. **Integrate**: add a WASM_ENGINES descriptor in NativeEngineRouting
   (fileDataKey maxTraxFileData, suppressNotes true, synthType MaxTraxSynth),
   TS engine class + worklet, retire the grid nativeSamplePlayback path FOR
   PLAYBACK (keep grid patterns for the editable display only). Verify by ear.

## Files
- Player source: third-party/uade-3.05/amigasrc/players/max_trax/{max.asm,shared.asm,driver.i,maxtrax.i,maxtrax.h}
- Transpiler: tools/asm68k-to-c/ (dist/cli.js; src/{preprocess,parser,emitter}.ts; runtime/{paula_soft.c,amiga_includes/})
- Model to mirror: sonix-wasm/{src/sonix_harness.c,CMakeLists.txt} (transpiled-68k → curated C lib → WASM)
- Generated (regenerate, not committed): maxtrax-wasm/src/generated/maxtrax/maxtrax.{c,h}
- Grid player already shipped (0a00f4b4b): src/lib/import/formats/MaxTraxParser.ts
  (nativeSamplePlayback flag), maxTraxFileData field, TrackerReplayer sampler path.

## Status of shipped grid player
Plays (user confirmed audio) but timing/pitch far off. Keep as the fallback +
editable-display source until the WASM player lands; then route playback to WASM.
