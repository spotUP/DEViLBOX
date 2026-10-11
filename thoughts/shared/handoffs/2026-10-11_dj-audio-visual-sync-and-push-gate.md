---
date: 2026-10-11
topic: DJ view fixes (Auto DJ, processed sound, audio/visual sync, one programme at a time) and the pre-push gate
tags: [dj, autodj, audio, visual-sync, pre-push, testing, handoff]
status: draft
---

# Session handoff - 2026-10-09 to 2026-10-11

## Update (later 2026-10-11) - read this first

Owner asked to stop starting agents and restart the session. The local
ledger thoughts/lars/todos.md has every item with its commit; trust it.

Landed since the first version of this handoff (all on main, NOT pushed):
1c2a90aab deck trim 0 dB (tracker applies no normalisation), 55660b941
safety-only limiters (unity within 0.15 dB), 7fe5e15d2 key lock returns to
the deck after a transition, 7bb312e9a meters/scopes delayed by output
latency, 9d41d6072 turntable views on the heard clock, cfd4b808c + 9b376a315
store import cycle cut (117 -> 75 modules), df64943a2 THE ECHO / double hits:
the cue output <audio autoplay> played the cue mix (master at -6 dB) on the
speakers when no cue device was chosen, 23c50852a + 41522e8e2 filters
returned after Auto DJ / juggle moves, 59157a056 juggle gate (shared key
compatibility, sync only when both decks play, intensity honours config),
ce3de53e4 playlist seed resolver, b503df399 menus topmost (MENU_Z_INDEX) and
Auto DJ panel wraps, 17545d71e jukebox test waits for its server.

Push: pinned push of 17545d71e running at handoff time (scratchpad
push4.log). Previous run (9b376a315): 7 failures in 4 files, 3 load timeouts
that pass alone, 1 real test defect fixed in 17545d71e. If the push failed,
re-run each failure alone first. Verify version.json buildHash on
devilbox.uprough.net after it lands.

Agents running at handoff (their commits land on main; check git log):
- calm colour pass on src/components/dj + src/components/dub (owner palette
  CALM: tokens; one identity colour per deck; one active accent;
  error/warning/success only for real states; meters keep gradient; dub move
  buttons neutral when idle) with a ratchet test.
- playlist seed rebuild from ~/Downloads/Playlists/*.prg (74 HippoPlayer
  files, full URLs) keeping every URL; hippoplayer.se /data/Modules now 404,
  site is TAWS (WB.html, Work:Modules) - find mapping + server proxy.

Queued (owner-ordered, in order):
1. Juggling: plan then build - stand-alone artistic juggles anywhere in the
   set (owner: "a juggle is not only a transition, it could happen anywhere
   in an artistic way to make the music better and excite the crowd"; needs
   the idle deck loaded with a double or the next track), juggle-transition as
   a planner-chosen style replacing the broken prelude, module beat grid from
   the song's own timing (owner: yes).
2. Key lock adds ~91 ms latency (a key-locked deck plays behind in a mix).
3. Turntables sometimes jump in Auto DJ (candidates: cue of the stopped deck,
   juggle prelude phaseAlign seeking a playing deck, clock re-anchor).
4. Per-channel visualizers in the DJ view are dead (decks play pre-rendered
   stereo audio - per-channel source missing?).
5. Dead seed entries policy (owner asked why; answer: hippoplayer-only files).
6. FX9 (ShimmerReverb OOM on channel flicks), carried from 2026-10-08.


### Final additions before restart

- Calm palette landed: 2040678e4 (deck identity tokens --color-deck-a/b/c in
  src/index.css, src/lib/deckIdentity.ts), 66aa4c6f6 (dub), 128a24f16 (DJ +
  siren), 03d40e117 (ratchet calmPalette.test.ts). Raw hue classes 351 -> 0.
  Open: default theme --color-warning == --color-accent (#f59e0b), so a
  warning looks like a live state; mute and fx channel modes share a colour.
- Playlist sources landed: bc140123d (seed keeps every source: 3591 Modland,
  627 HVSC, 463 URL, 0 bare; hippoplayer.se moved to
  https://hippoplayer.se/webdata/Modules/...; new server proxy
  /api/remote/<host>/<path>), 42af5f08d (isBad: one store action sets it on a
  failed load, clears it on a successful load/render). Agent handoff:
  thoughts/shared/handoffs/2026-10-11_playlist-sources-hippoplayer.md.
- DEPLOY RISK to check before pushing bc140123d: server/src/routes/remote.ts
  imports ../../../src/lib/dj/remoteSources.ts. `cd server && npx tsc -p .`
  already fails (TS6059 rootDir / TS5097) on pre-existing mcpServer.ts and
  modlandIndexer.ts imports of the same kind, so production must run the
  server through tsx - confirm how the Hetzner server starts (server
  package.json start = `node dist/index.js`, which would need tsc).
- New queue items (after the 6 listed above): DJ-J per-channel visualizers
  dead in the DJ view; DJ-K tempo mixes (planner says "beyond the creative
  range: short transition only" yet picks longBlend; an extreme tempo gap must
  trigger cut/echo-out; one tempo source per track - module tempo from the
  song).
- Push: pinned 17545d71e was in the gate at restart (scratchpad push4.log).
  Everything after it (colour, playlist, isBad commits) needs a further push.

Owner verified this session: tracker play stops the DJ set; visuals synced;
a clean Auto DJ mix; FX7 Amiga Multiband.

## Task(s)

1. **Push the 319+ local commits** left by the 2026-10-08 session (handoff
   `2026-10-08_fx-dj-goattracker-furnace-session.md`). NOT DONE: 335 commits
   are local, nothing pushed. Two gate runs failed (see Learnings).
2. **Auto DJ failed mixes** (owner: fader pulls over, back, over again; fades
   to a silent deck; stuck mixing the same song on both decks). DONE,
   14278ada9. Owner check pending.
3. **DJ view sounds processed, tracker view pure** (owner: same song, very
   different output; tight "brr" kick roll). DONE in part (92fd66b20,
   8dab43713, 1c2a90aab); limiters, key lock and meters IN PROGRESS (agent).
4. **DJ visuals not synced to the audio** (owner: "audit and fix"). Audit
   done; beat lights, waveform/grid/pattern rows, all turntable views DONE;
   meters/scopes IN PROGRESS (same agent as 3).
5. **Tracker and DJ played at the same time** (owner decision: one programme
   at a time; starting either stops the other; a view switch alone changes
   nothing). DONE, 314297cc2 + 6f122a0d3. Owner confirmed tracker play stops
   the DJ set.
6. **Circular import blocking the gate** (`savedProjectAfterAhx`). DONE,
   cfd4b808c: explicit-save flag in a leaf module (`src/lib/persistence/explicitSave.ts`),
   ratchet `songPersistenceImportCycle`. No await hangs: the cold import of
   ~830 modules takes 18-40 s and a timed-out load races the next test inside
   the cycle. A 117-module cycle remains (DJActions -> DJAutoDJ ->
   DJTrackLoader -> openSong ...) with the same race for MaEngine/UADEEngine
   ('prototype' / __vite_ssr_import_0__ errors): cut DJActions -> DJAutoDJ
   after the DJ agent finishes.

## Critical references

- Ledger for this session: `thoughts/lars/todos.md` (gitignored, local) -
  trust it over this summary if they differ.
- Plan ledger: `thoughts/shared/plans/2026-10-06-fix-all-open.md` (FX7 ticked
  at line 253, uncommitted).
- Auto DJ ledger: `thoughts/shared/plans/2026-10-08-auto-dj-world-class-progress.md`
  (owner checks at about line 1006).
- Pre-push gate: `scripts/git-hooks/pre-push`; its test
  `src/__tests__/prePushGateTestsTheCommit.test.ts`.
- Auto DJ: `src/engine/dj/DJAutoDJ.ts`, `DJTrackLoader.ts`,
  `autodj/transitionExecutor.ts`.
- Deck audio path: `src/engine/dj/DeckEngine.ts`, `DeckIsolatorEQ.ts` (new),
  `DJPipeline.ts` (trim), `DJAudioCache.ts`.
- Visual clock: `src/engine/audioLatency.ts` (`positionAtFrame`,
  `heardAnchorMs`, `deckPositionAt`), `useDJStore.positionAnchor`,
  `src/hooks/dj/heardDeckRow.ts`, `DeckCssTurntable.tsx`
  (`platterPositionSec`).
- Playback coordinator: `src/lib/playback/oneProgrammeAtATime.ts`
  (`installOneProgrammeAtATime`, `handOverToDJ`), installed in `src/main.tsx`.

## Recent changes (all on main, NOT pushed)

- c51103e65 the play-head ratchet guards `setSchedulerPosition` (renamed by
  60c07e19c when engine/scheduler position ownership split).
- b70dee333 preset claim rig: Math.random seeded per render, Tone noise cache
  warmed, THD power-averaged over five fundamentals (Shoegaze saturation read
  -30 to -45 dB with only the reverb impulse changing).
- f9b420941 / 27b4b903e a 30 s test timeout in vite.config.ts (timeouts catch
  hangs, they do not assert speed); test `testTimeoutIsAHangDetector`.
- 448b68e83 gate snapshot is a `git clone --shared --no-checkout` checked out
  at the pushed sha (git ls-files works); openSongBranches fixtures copied to
  `src/__tests__/fixtures/open-song/`; the UADE scan test's 14-song sample is
  frozen in the test instead of read from the gitignored sweep record.
- 14278ada9 Auto DJ: the crossfader-stuck guard acts only on a started legacy
  crossfade with the incoming deck playing; force-complete cancels the
  executor; the start deadline is computed once (fired 2.4 s early before);
  the scratch-buffer prefill no longer seeks the incoming deck back to 0;
  a track that renders nothing is marked bad and the next pick never returns
  the playing track.
- 92fd66b20 beat flash / 1-2-3-4 lights follow the floor beat (was nearest
  beat: half a beat early / late). ALSO contains BUG-2 part 1 (unanalysed
  tracks 0 dB trim instead of +9 dB, cache stores rmsDb/peakDb) because the
  visual agent's commit swept in staged files; left unsplit on purpose,
  8dab43713 says so.
- 314297cc2 / 6f122a0d3 one programme at a time; DJ view mount no longer
  stops the tracker (was unconditional since bad3f3d3b).
- ecceb546c per-frame heard-position clock anchor for waveform, overview,
  beat grid, pattern rows.
- 520a988e3 / 9d41d6072 all turntable views (CSS, vinyl, canvas, 3D) read the
  heard clock per frame.
- 8dab43713 deck at neutral is flat: Tone.EQ3 dipped -15.4 dB at 400 Hz and
  2.5 kHz, replaced by DeckIsolatorEQ; idle filters parked with resonance
  (+3.4 dB at 31.5 Hz) now fully open. Test `djDeckAtNeutralIsFlat`.
- 1c2a90aab deck plays a song at its tracker-view level; limiter only catches
  overs (owner decision "match tracker level"). Landed while this handoff was
  written; the agent's report on it has not arrived yet - read it before
  relying on details.

## Learnings

- **The gate cannot run on a busy machine.** Run 1 (b70dee333): 41 min,
  failed on a missing .git and gitignored fixtures. Run 2 (27b4b903e):
  60286 s = 16.7 h overnight with agents and other rigs running (load avg
  ~70): 41 timeouts, 39 "Failed to start forks worker", 2 hook timeouts. Only
  `savedProjectAfterAhx` failed when re-run alone. Push only when no agents
  and no other rigs (vtcon FS-UAE) are running.
- **A gate test may read only tracked files**, and may ask git (the snapshot
  is a clone now). GIT_DIR in the environment was rejected: two tests build
  their own temporary repos and would run git against the real one.
- **Tone.Reverb's impulse comes from Math.random** (Tone.Noise caches its
  buffers on FIRST START, not construction, and starts each instance at a
  random offset). Any offline measurement through a reverb must seed
  Math.random and warm the cache first.
- **Auto DJ symptoms the owner hears map to separate causes**: the owner
  insisted "two things: failed mixes and feedback/double kicks" - keep them
  apart. The same-song idea did not hold (copies 98 s apart); the transition
  double kick was the 0.25-beat early start.
- **"DJ sounds processed"** was four stages, none of them master FX or the dub
  bus (both measured silent): +9 dB unanalysed trim into a 10 ms-release
  brickwall limiter, EQ3 band cancellation, resonant parked filters, and the
  -6 dB RMS trim target. Measure the deck chain offline at neutral against dry.
- **Visual sync**: DJ3 subtracted output latency but left the 20 Hz hold and
  the display delay, so the screen trailed the ear; the nearest-beat index
  flips mid-beat. Per-frame extrapolation from a clock anchor is the format.
- Commit hygiene with several agents: commit with `git commit -- <paths>`;
  `git add` + plain commit takes whatever another agent staged.
- The dev server was stopped once by something unidentified (neither agent
  admitted it). Restart with `npm run dev:fullstack`.

## Artifacts

- This handoff; `thoughts/lars/todos.md` (local ledger).
- New tests: autoDJCrossfaderNeverFadesToAStoppedDeck,
  autoDJNeverMixesThePlayingTrackIntoItself,
  incomingDeckKeepsItsPlannedEntryPoint, djDeckIsNotGainedIntoTheLimiter,
  djDeckAtNeutralIsFlat, djBeatFlashFiresOnTheBeatNotHalfABeatEarly,
  djWaveformPlayheadMovesEveryFrameNotIn20HzSteps,
  djCssTurntableTurnsWithTheHeardPositionNotAhead,
  djTurntableViewsTurnWithTheHeardPosition, oneProgrammeAtATime,
  testTimeoutIsAHangDetector, prePushGateTestsTheCommit (new case).

## Next steps (ordered)

1. Collect the two running agents' reports: (a) DJ agent - limiters safety
   only (no auto make-up gain, -1 dBFS, release >= 50 ms), key lock left on
   after Auto DJ transitions (verify, restore prior state), meters/scopes read
   at currentTime - outputLatency; (b) then cut the remaining DJ import
   cycle (DJActions -> DJAutoDJ), extend the songPersistenceImportCycle
   ratchet.
2. Run `npm run type-check` and the new tests once, then push on a QUIET
   machine (stop agents and the vtcon rigs): `git push origin main`. Time it.
   If anything fails, re-run each failure alone before treating it as real.
3. Verify the deploy: `version.json` buildHash on devilbox.uprough.net equals
   the pushed sha.
4. FX9 (from 2026-10-08, still open, priority): flicking Master FX channel
   buttons kills all audio - ShimmerReverb WASM Aborted(OOM), old instances
   never freed.
5. Commit the plan ledger edit (FX7 ticked, line 253 of
   2026-10-06-fix-all-open.md).
6. Auto DJ remaining: 11 JUG items + FOUND-1 (see the Auto DJ ledger).
7. Not done from the visual audit: VJPatternOverlay.tsx:353 reads about 10 ms
   ahead (outside the DJ view); unconfirmed graph latency (two
   DynamicsCompressor look-aheads, key lock about 5 ms) not folded into the
   latency source.

## Owner tests pending (LOCAL http://localhost:5174, reload first)

- Auto DJ: plays through the playlist, never the same song twice in a row; the
  crossfader never jumps back; kicks line up in mixes. (Analyse the playlist
  first; the session's tracks were unanalysed.)
- Same song in the tracker view and on a DJ deck sounds the same (after the
  limiter change lands).
- Beat flash and 1-2-3-4 lights on the kick; waveform scrolls smoothly;
  turntables move in time.
- One programme at a time: with the tracker playing, switching to the DJ view
  keeps it playing; pressing play on a deck stops it at the right speed.
- Still open from 2026-10-08: GoatTracker VU (E18b), scratch samples licence,
  Auto DJ owner checks 1-8.
- PASSED this session: FX7 Amiga Multiband; tracker play stops the DJ set.

## Other notes

- Free disk was 6.8 GiB during the gate run; the snapshot clone needs about
  2 GB per push.
- The vtcon project's FS-UAE rig showed an AmigaOS "please insert volume
  up-term:" requester (another session's test removing the UP-Term: assign);
  not touched.
- Owner global rule: no Co-Authored-By / Claude-Session lines in commits.
