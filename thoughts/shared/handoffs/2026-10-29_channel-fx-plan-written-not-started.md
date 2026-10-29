---
date: 2026-10-29
author: spot
status: plan written and committed, implementation not started
topic: Channel FX song table plan, plus status of other saved plans
---

# Handoff: channel FX song table plan (not started)

## What exists

The plan is written and committed (`778024b0a`). No code has been written. The owner chose not to implement it today.

- Plan: `thoughts/shared/plans/2026-10-29-channel-fx-song-table.md`. It has 7 phases and 112 items: P1 18, P2 16,
  P3 33, P4 11, P5 15, P6 10, P7 9. Owner decisions D1-D15 are final. Do not re-ask them.
- Research behind it:
  - `thoughts/shared/research/2026-10-29_per-channel-fx-pattern-command.md`: main research and the command range
  - `thoughts/shared/research/2026-10-29_master-fx-current-map.md`: P1 file map
  - `thoughts/shared/research/2026-10-29_lanes-render-persistence-map.md`: P4/P5 file map
  - `thoughts/shared/research/2026-10-29_engine-per-channel-outputs.md`: the P3 engine classes A/B/C/D

## Summary of the plan

- Each song gets an effect table with presets 00-FF, stored in .dbx. The schema goes from 26 to 27, with a migration.
  Master FX become the `master` chain in the same model. `useAudioStore.masterEffects`, `masterFx.slotN` router
  keys and the 4-slot channel insert cap are removed.
- Pattern commands 0x80-0x8C (enable, bypass, wet, macro 1-8, send, scene morph). Range 0x79-0x9F was verified free.
  P2 adds a reserved-range registry with a non-overlap test.
- Lanes and commands drive one router target, `chfx.<channel>.<preset>.<param>`.
- P3: every song engine gets a per-channel insert mode. That includes C/WASM work for 38 engines that only output
  a stereo mix today.
- P4-P7: lane display and editing, sends/macros/scenes, browser/cards/meters/A-B/tempo sync.

## Where to start

1. Load skill `phased-workflow` (implement).
2. Show the P1 checklist (P1-01 to P1-18) with a running count.
3. Work P1 in order. Tick items in the plan file; the plan file is the ledger.
4. Run `npm run type-check` after every change. Run only the affected tests:
   `nice -n 19 npx vitest run <files> --maxWorkers=2`.

Start prompt (local, git-ignored): `thoughts/spot/next-session-channel-fx.md` (use `go channel-fx`).

## Open points the owner may still veto (defaults written into the plan)

- Scene morph target is the armed scene (scene panel or lane param `scene.target`). The source is the last scene
  fully reached.
- PiyoPiyo, MusicMaker and C64SID have no WASM source or worklet in the repo. Their P3 items start with
  "locate first".
- SunVox per-channel outputs come from SunVox output modules, not a C change, because the shipped library is the
  official warmplace build.

## Other plans saved today (`fae33d2c1`)

| Plan | Status |
|------|--------|
| `thoughts/shared/plans/2026-10-18-one-startup-dialog.md` | Implementation commit exists (`dc0293615`). Not re-verified against the plan this session. |
| `thoughts/shared/plans/2026-10-16-fa17-18-vendor-adapters-design.md` | Server adapters commit exists (`52e02d643`). Client side was meant to follow FA-16. Not verified. |
| `thoughts/shared/research/2026-10-17_voice-multi-pattern-map.md`, `2026-10-24_dub-deck-editor-crop.md` | Research only. Status unknown. |

## Loose ends

- `public/data/data` is an untracked symlink to `/Users/spot/Code/DEViLBOX/public/data`, so it points at its own
  parent folder through an absolute path. It was left uncommitted on purpose: it loops back on itself and breaks
  on the server. Probably created by accident; it is safe to delete once the owner confirms.
- Commits `778024b0a`, `fae33d2c1`, `8e4545483` are on local main and not pushed. Pushes are batched.
