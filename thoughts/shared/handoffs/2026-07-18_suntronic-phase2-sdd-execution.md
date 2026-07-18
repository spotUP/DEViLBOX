---
date: 2026-07-18
topic: suntronic-phase2-editable-writeback-sdd
tags: [suntronic, phase2, sdd, editable, transpose, handoff]
status: draft
---

# SunTronic V1.3 Phase 2 — editable pool writeback + transpose editor (SDD in flight)

## Task
Execute SunTronic Phase 2 end-to-end via Subagent-Driven Development (SDD),
continuously, per `/loop` dynamic mode. Make grid edits persist byte-safely
back into the shared command-stream block pool + add per-position transpose
editing. Phase 1 (ghost notes visible/editable + byte-exact UNEDITED export)
already SHIPPED on main.

User's standing instruction: `/loop it looks ok loop through all phases dont
stop until its finished` — execute all Phase-2 tasks without pausing to check
in; stop only when finished (then PushNotification one-line outcome), BLOCKED,
or genuine ambiguity.

## Critical references
- **PLAN (13 tasks):** `docs/superpowers/plans/2026-07-18-suntronic-phase2-editable-writeback.md`
- **SPEC:** `docs/superpowers/specs/2026-07-18-suntronic-1to1-editable-patterns-design.md`
- **SDD LEDGER (durable, source of truth):** `.superpowers/sdd/progress.md` —
  see the `## PHASE 2` section. Base checkpoint recorded there = `fad0bc485`.
  Trust ledger + `git log` over memory after compaction.
- SDD scripts: `/Users/spot/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.0/skills/subagent-driven-development/scripts/` (`task-brief PLAN N`, `review-package BASE HEAD`).
- Templates: same dir's parent — `implementer-prompt.md`, `task-reviewer-prompt.md`.

## Recent changes (this session)
- Fixed effect-columns bug earlier (commit fad0bc485, pushed) — parser now sets
  `channelMeta.effectCols` per voice; ready shows 2 FX cols (correct).
- Authored the Phase-2 plan (13 tasks).
- **Task 1 (0x94 double pitch-carrier): IMPLEMENTED, commit `04dc56755`**
  `fix(suntronic): 0x94 single pitch-carrier…`. 3/3 new + 32/32 SunTronic suite
  green, type-check clean. NOT pushed.
- **Task-1 REVIEWER: APPROVED (review CLEAN).** No Critical/Important. Reviewer
  confirmed the brief's prose formula `(~h1[pos+1])&0xff` was self-contradictory
  (its own test asserted raw `0x24`); implementer correctly carried raw arg byte.
  Verified: byte-exact round-trip, display note unchanged, no other opcodes
  touched. Task 1 marked complete in ledger. **START NEXT SESSION AT TASK 2.**

## Next steps (ordered)
1. **Start at Task 2** (0x98/0x8e width split → effTyp 51). `task-brief PLAN 2`.
   BASE for its review-package = `04dc56755` (Task-1 head), not fad0bc485.
2. **Continue SDD for Tasks 2-13** (see plan). Per task: `task-brief PLAN N` →
   dispatch implementer (background, model sonnet for codec/logic, cheaper for
   mechanical, opus for the final whole-branch review) with brief path + context
   + report-file path + constraints → on DONE run `review-package fad0bc485 HEAD`
   (BASE = the commit before THAT implementer started, i.e. the previous task's
   head, NOT always fad0bc485) → dispatch reviewer → fix loop → mark ledger.
3. After Task 13: dispatch final whole-branch code review (opus) with
   `review-package $(git merge-base main HEAD) HEAD` — but note work is ON main,
   so use the Phase-2 base `fad0bc485..HEAD` range.
4. **PUSH** at the very end (`git push origin main`) after full test:ci +
   type-check green — NOT per task (avoids 13 CI deploys). Then PushNotification.

## Task summary (plan Tasks 1-13)
1. 0x94 double pitch-carrier — DONE + review CLEAN (04dc56755).
2. 0x98/0x8e width split → give 0x8e ciaTempo its own effTyp **51**; opcode-identity `owns`.
3. decodeSunGroup block `limit` param (over-read guard).
4. cellFieldsEqual → compare FX slots 3-5.
5. `SunTronicNativeData`/`SunPosition` model + `buildSunTronicNativeData` + shared `decodeSunBlockPool`.
6. grid-cell provenance (`sunBlockIndex`/`sunRowInBlock`) + attach `song.sunTronicNative`.
7. `applySunNoteEdit`/`reprojectSunGrid` (raw = editedNote − transpose, invalidate sunRaw, re-project). Adds `sunPosition?` to TrackerCell (amends Task 6 stamp).
8. `makeSunTronicV13Encoder(widths,numSampled)` factory — re-encode edited groups, verbatim path intact.
9. Variable-length h1 recompile in SunTronicExporter (replace hard throw; relay blocks contiguous, rebuild trackPtrs/RELOC32, re-parse validate; overflow guard).
10. useFormatStore: `sunTronicNative` state + `setSunTronicPositionCell` + hydration.
11. `SunTronicPositionEditor.tsx` mirroring HivelyPositionEditor (blockIndex + signed transpose matrix).
12. End-to-end wiring (TrackerView mount) + integration test (edit→export→re-parse).
13. Wire all new tests into package.json `test:ci`; verify fails-on-revert.

## Learnings / gotchas
- **sunTestUtil.ts** created by Task 1 at `src/lib/import/formats/__tests__/sunTestUtil.ts`
  (exports `readFixture`, `parseSunTronicFile`). Corpus = `public/data/songs/formats/SUNTronicTunes`
  (the `formats/` dir — NOT the untracked `public/data/songs/SUNTronicTunes/`). Plan's fixture
  paths/names are approximate; verify names in `formats/` (`snake.src` not `Snake0.src`).
- **`.superpowers/sdd/task-1-report.md` has STALE old-Phase-1 content prepended** — the
  real Task-1 (0x94) content is the newest section. Report files may carry cruft; judge by diff.
- Plan LINE NUMBERS are hints — a prior "0x94 pushFx clobber fix" already touched decode.
  Implementers must read current code.
- **Constraints for every task:** widths via `sunCommandLen`; single source of truth
  (sunEffectMap + sunCommandLen); byte-exact UNEDITED export stays byte-identical
  (`sunTronicExport.test.ts`, `sunTronicEditableRoundtrip.test.ts` green); do NOT touch
  `SunTronicPlayer.ts`/`SunTronicNativeRender.ts` (native fidelity tests: sunTronicAttach,
  sunTronicVolClamp, sunTronicArpLockstep, sunTronicScopeNormalize); type-check
  (`npm run type-check`); regression test fails-on-revert in test:ci; no emojis; full
  English UI labels; commit footer; add files by name (no `git add -A`); do NOT push per task.
- Pre-commit hook runs full test:ci (~50s, can flake under parallel load — retry).

## /loop mechanics to resume
- Dynamic mode. Each turn that ends with work still running: `ScheduleWakeup`
  (delaySeconds 1800 fallback; primary wake = subagent completion notifications)
  with prompt verbatim `/loop it looks ok loop through all phases dont stop until its finished`.
- When ALL Phase-2 done + pushed: omit ScheduleWakeup, send one-line PushNotification.

## Other notes
- CAVEMAN MODE full (terse chat; code/commits normal).
- Deferred (do NOT start): cycle-accurate Paula-DMA scheduler.
