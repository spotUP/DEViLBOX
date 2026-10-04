---
date: 2026-10-04
topic: F15 AY STRC/AMAD via aylet - agent paused mid-work, uncommitted
tags: [ay, aylet, z80, f15, handoff]
status: draft
---

# F15: AY STRC/AMAD playback through aylet - PAUSED

The F15 agent (session 5d2820e0, agent a5a0668d35c09fe4d) was stopped by the
owner on 2026-10-04 at 23:46 ("pause the agent"). Everything it made is
UNCOMMITTED in the working tree. Do not discard; resume from here.

## Task
Play ZXAY STRC/AMAD-structured .ay files through an existing player (aylet
0.5, GPL) compiled to WASM, instead of a hand-written Z80. Research doc:
`thoughts/shared/research/2026-10-04_ay-strc-amad.md`.

## Files it left (git status, 23:46)
Modified: `src/engine/TrackerReplayer.ts`, `src/engine/replayer/NativeEngineRouting.ts`,
`src/lib/formatCompatibility.ts`, `src/lib/import/FormatRegistry.ts`,
`src/lib/import/__tests__/AYParser.test.ts`, `src/lib/import/cpu/CpuZ80.ts`,
`src/lib/import/cpu/__tests__/CpuZ80.test.ts`, `src/lib/import/formats/AYParser.ts`,
`src/lib/import/parsers/ChipDumpParsers.ts`.
New: `aylet-wasm/{CMakeLists.txt,src/aylet_wasm.c,src/z80_frame.c,build/}`,
`public/aylet/{Aylet.js,Aylet.wasm,Aylet.worklet.js}`, `src/engine/aylet/AyletEngine.ts`,
`src/engine/__tests__/ayletPlaysEmul.test.ts`, `src/lib/import/__tests__/ayStructuredRefusal.test.ts`,
`src/lib/import/__tests__/helpers/ayletNodeFetch.ts`, `src/lib/import/formats/AyletWasmExtractor.ts`,
`third-party/aylet-0.5/` (GPL source, needs a THIRD_PARTY_NOTICES entry).

## Known state
- `npm run type-check` fails in `src/lib/import/cpu/__tests__/CpuZ80.test.ts`
  (`getF` does not exist on CpuZ80, lines 369 and 390). Last agent activity:
  checking the push2 macro in `third-party/aylet-0.5/z80ops.c`.
- Not verified: whether `ayletPlaysEmul.test.ts` passes; whether any STRC/AMAD
  file plays in the browser.

## Next
1. Read the research doc and the agent transcript
   (`/private/tmp/claude-501/-Users-spot-Code-DEViLBOX/5d2820e0-6466-47e5-9226-be85517f1c00/tasks/a5a0668d35c09fe4d.output`,
   dies with the session) for its reasoning.
2. Fix the CpuZ80 test, run `ayletPlaysEmul.test.ts`, type-check, then
   commit in two parts: aylet-wasm + third-party + notices; engine + parser wiring.
3. Browser check at `http://localhost:5174` with an STRC/AMAD file from the corpus.
