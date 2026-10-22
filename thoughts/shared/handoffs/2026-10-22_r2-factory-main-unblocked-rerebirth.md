---
date: 2026-10-22
topic: R2 softsynth factory, main unblocked (ReRebirth takeover, test:ci ci-dir fix, preset worklet fix)
tags: [r2-factory, rerebirth, test-ci, vitest, handoff]
status: draft
---

# Handoff 2026-10-22: main unblocked, worktree merge still open

## Task(s)

1. Commit and push main (owner: "commit push do what you need to do"). Commits DONE; push PENDING (see Next Steps 1).
2. ReRebirth failing tests: owner chose "Take over, fix it". DONE, committed.
3. R2 factory worktree (`~/Code/devilbox-r2f`, branch `feat/r2-integration`): merge of main not committed yet, plus uncommitted fixes. OPEN.

## Critical References

- Ledger: `thoughts/spot/r2-handover-ledger.md` (read by section, grep headings).
- Running notes: `thoughts/spot/next-session.md` (sections "Update 2026-10-22 ...", newest last).
- Todos: `thoughts/spot/todos.md` (git-ignored, edit on disk only).
- Worktree `.git` is a file; use `$(git rev-parse --git-dir)`. MERGE_HEAD: `/Users/spot/Code/DEViLBOX/.git/worktrees/devilbox-r2f/MERGE_HEAD`.
- Merge message: previous session scratchpad `merge-msg.txt` (`/private/tmp/claude-501/-Users-spot-Code-DEViLBOX/8bbfe6e3-bd17-4bc7-a765-adda952c6209/scratchpad/merge-msg.txt`). Scratchpad may be gone after a reboot; if so, write a new merge message.

## Recent Changes (main, local, not yet on origin)

- `9502d215c` Install the native-context worklet patch in the master preset parity renders. `src/engine/tone/__tests__/masterPresetRender.ts` `freshContext` dynamic-imports `installNativeContextWorklets` before `Tone.setContext(ctx)`. 166/166 pass; revert gives 12 unhandled "This node only works in a secure context" errors.
- `906c7bba4` Run src/__tests__/ci in test:ci again. `vite.config.ts` excludes `src/__tests__/ci/**` only when the command does not name that directory (`ciDirRequested`). Guards: `src/test/ciDirectoryRunsInTestCi.test.ts`, `src/__tests__/ci/everyVitestConfigRunsAtLowCpuPriority.test.ts`. `regression.test.ts` counts `wasmEngineRegistry.ts` keys. dubBusDeadKnobs + dubBusKnobReachability added to test:ci (93/93 pass at VITEST_TIER=fast).
- `fcaeb9743` Add the ReRebirth 303, 808 and 909 synths and the ReBirth effects (51 files, includes the ReRebirth package.json test entries).
- Earlier unpushed on main: `610a394fa` .. `29cbd1983` (19 commits, incl. C5 offline-render fix 29cbd1983 and vitest cap a0b18c7d3).
- `npm run type-check` in main: 0 errors at fcaeb9743.
- origin/main still `7729b7b30` when this was written.

## Learnings

- Vitest applies `exclude` after CLI filters: an exclude on a directory silently makes a command naming it run zero files and pass.
- Revert-check the low-CPU-priority guard WITHOUT an outer `nice`; the outer nice masks a missing renice.
- In tests that set Tone to a native OfflineAudioContext, call `installNativeContextWorklets`, and import it dynamically after `installRealWebAudio` (a top-level import loads Tone first, then "param must be an AudioParam").
- Temp-index commits (`GIT_INDEX_FILE=...`) leave the main index stale: run `git reset -q` afterwards and re-stage.
- A PreToolUse hook blocks commands whose text contains "test"/"vitest" while 1-minute load > 8. Wait with a background until-loop on load < 7 and no running vitest (`pgrep -f 'v[i]tes[t]'`). Use the Write tool for files containing those words.
- Load swings 6..33 from other sessions; never kill their processes.

## Artifacts

- Commits above. Handoff notes in `thoughts/spot/next-session.md`.
- Background push task (previous session) may have landed or been killed with the session; verify, do not assume.

## Next Steps (ordered)

1. Verify main push: `git ls-remote origin main` vs `git rev-parse HEAD` (expect fcaeb9743 or later). If not landed: at load < 7 run
   `git -c core.sshCommand="ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=100 -o TCPKeepAlive=yes" push origin main`, output to scratchpad, then ls-remote. Pre-push gate runs the full suite; fix root causes on failure, never --no-verify.
2. Worktree merge commit: in `~/Code/devilbox-r2f`, `git commit -F <merge-msg>` at low load (index already holds the resolved merge). Then consider merging main again (now has ReRebirth + ci fix).
3. Worktree fixes as their own commits: UpRoughSoftsynth release fix + `softsynthReleaseNeverJumpsBack.test.ts`; perChannelNativeSynths UpRoughSoftsynth entry + `perChannelNativeSynthRouting.test.ts`; their package.json test:ci lines.
4. 4-slot isolation cap lift (own commit): ChannelRoutedEffects.ts planIsolationSlots, new `src/engine/tone/dubOutputBase.ts`, LibopenmptEngine MAX_ISOLATION_SLOTS=16, `public/chiptune3/chiptune3.worklet.js` MAX=16, `masterEffectOnManyChannelsOneSlot.test.ts`. First run personaShapesItsChannel, channelSendEchoIsAudible, dubBusKnobReachability with and without the change (copy files aside, never stash). Known limit: `1 << ch` breaks at channel 31+.
5. Push worktree branch with keepalive (unpushed: f5a4a35e9, 20f369c1d, f64d1485e, d772db5a5, 26f294dc2, cfc84667b, 7f7f34607, 3f76f312e plus new; remote at 8c62d1d82); verify ls-remote.
6. Cleanup: remove `devilbox-r2f/server/node_modules` symlink and copied `server/.env`; stop worktree Vite 5174 and Express 3011 / relay 4003; restart main dev servers (`npm run dev:fullstack`).
7. Ask owner to hard reload http://localhost:5174 (LOCAL) and retest: Ambient Delay on more than 4 channels, clicks, siren trail, SF2 Trn +3/-2, setBfree/Calf/TAL presets + knob edit surviving recreation, plate switch, tracker/VJ heard-row playhead, first-rows distortion, retargeting an effect mid-play.

## Other Notes

- Other sessions' WIP in main: never commit/stage/restore it (` D public/buzzmachines/*`, `public/blep/buzzmachines/*`, `src/generated/*`, `tal-noisemaker-wasm/build/*`, `public/chiptune3/chiptune3.worklet.js` in main, a research md).
- Never commit `src/generated/changelog.ts` or `src/generated/file-manifest.json`. No AI attribution in commits. Commit by path.
- Open items beyond this task: dub rig suspend race, flam gaps, warmLibopenmptPlayback on blank generating song, six tests with inline mocks, factory gaps G3, G4, G7, G25-27 (G12 waits on URDS), "Maximum update depth exceeded" after applySong import, tell URDS R2f-33a-e dropped, first play after Generate jumps to position 0 (usePatternPlayback ~:225), BPM 92 song plays ~120 ms per row, setTempo not in syncToMain_, postEchoSatDrive exempt, DubBusPanel.tsx:526 checkbox to `<Toggle>`.
- Mod Archive key at ~/.config/modarchive/key: never commit, never client-side.
