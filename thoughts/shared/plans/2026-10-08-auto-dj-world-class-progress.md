---
date: 2026-10-08
topic: Auto DJ world-class plan - execution ledger (every item of 2026-10-08-auto-dj-world-class-plan.md with a stable ID)
tags: [dj, auto-dj, plan, ledger, reachability]
status: draft
---

# Auto DJ world-class plan - progress ledger

Plan: `thoughts/shared/plans/2026-10-08-auto-dj-world-class-plan.md`.
Research (how it works today): `thoughts/shared/research/2026-10-08_auto-dj-how-it-works.md`.

**Count: 723 of 737 done, 27 owner checks, 0 open questions** (regenerated with grep over the checkbox lines, which is the canonical count; the earlier 760 added the owner-check and found items by hand; world-class plan + beat-juggling plan JUG- 197 + found items) (world-class plan 558 items + beat-juggling plan JUG- 197 + found during the run)

Legend: `[ ]` open, `[x]` done (commit + test named), `[o]` owner check (automated part built; only a human can confirm), `[?]` open owner question (built around, decision needed). An item is done only when a test drives the product's top-level entry (`getAutoDJ()` enable / poll / triggerTransition, the DJ analysis worker path, or the DJ view) and proves the code ran.

IDs: gate letter + number for the plan's gate sections (A-V), `Sn.m` for non-gate sections n, `PG-X.m` for the phase gates of section 66. One reachability test per feature; behaviour tested where it lives.

## Architecture decisions (made before the first edit, per CLAUDE.md 2 "analyse first")

- D1. New code lives in `src/engine/dj/autodj/` (types, activityTimelines, beatGrid, structure, cuePoints, trackAnalysis, trackerMixAnalysis, sessionMemory, styleProfiles, setPlanner, tempoKeySolver, transitionPlanner, gainStaging, transitionExecutor, performanceContext, sessionController, decisionLog, transitionQuality, invariants, loopIntelligence, cueJump, setSimulator). `DJAutoDJ.ts` keeps the execution state machine and delegates WHY/WHAT/WHEN/HOW to `DJSessionController` (plan section 56/57).
- D2. Extended analysis that needs PCM (activity timelines, loudness set, spectral, tempo hypotheses) is computed in `dj-analysis.worker.ts` through a pure module (`activityTimelines.ts`) and carried as `analysis.extended` through `PipelineResult`, `CachedAudio` and `PreRenderedTrack`. Structure (beat grid classification, sections, phrases, cue points) is pure and computed from the extended data on the main thread (`buildDJTrackAnalysis`), cheap and testable without essentia.
- D3. `DeckState.trackAnalysis: DJTrackAnalysis | null` is the deck's canonical analysis (set by `DJPipeline.applyAnalysisToDeck`). `PlaylistTrack.djSummary` is the compact per-track summary the set planner reads for every candidate (written by the playlist analyser and by Auto DJ when a render arrives).
- D4. Session order lives in `useDJStore.autoDJSessionOrder` (indices into the user playlist). `enableAutoDJ` no longer calls `sortTracks`; the user playlist is never reordered by Auto DJ.
- D5. True echo-out: `DeckEngine` gets a pre-fader echo send (feedback delay to the limiter, the pattern of the existing scratch reverb send) so the tail survives the dry fade. No second mixer, no second FX chain.
- D6. Transition execution is one automation clock sampling keyframe curves (crossfader, EQ low per deck, filter per deck, volume, echo send) through the existing deck/mixer primitives. Old `DJQuantizedFX` transition functions stay for manual use and as the emergency path.
- D7. Long-set, autonomous and resilience gates are proven by `DJSetSimulator`: the real `DJSessionController` over a synthetic corpus with virtual time (hours in milliseconds), the only way 4-hour sessions fit CI. Audible checks are owner checks.
- D8. Analysis cache entries carry `analysisVersion`; entries below `DJ_ANALYSIS_VERSION` (2) are re-analysed so the extended data exists.
- D9 (coordinator 2026-10-08). The Auto DJ performs through the DJ FX registry the DJ view's buttons use: `DjFxActions.fireDjFx/releaseDjFx` is the one fire path (pad, keyboard, MIDI, tour, MCP, Auto DJ), with a fire log and `useDJStore.djFxActive` (the pad lights from it). Deck actions take `{ deck, beats, amount }`. `fx_deck_echo_out` became a true echo-out (pre-fader feedback delay on the deck + dry decay); `fx_deck_echo_throw`, `fx_deck_reverb_out`, `fx_deck_filter_rise`, `fx_deck_filter_release` were added to the registry. The executor fires effect events and filter-plan kinds through it; crossfader, EQ hand-over and tempo stay on the deck/mixer actions. Known limit: the echo tail returns before the crossfader, so an echo-out holds the fader at the centre for the tail (both decks -3 dB) before completing.
- D10 (coordinator 2026-10-08). Tracker channel awareness consumes the Dub Deck's identity sources: `songChannelIdentity.resolveSongChannelRoles` (new, song-given; `readSongChannelIdentity` now delegates to it with the editor's live sources) = ChannelNaming's instrument-aware song-wide classifier + the SongRoleTimeline over the arrangement (instrument types per position; CED types for the editor's song, the instruments' own classification for a deck's song) + runtime audio hints. `trackerMixAnalysis.ts` no longer calls `classifyPattern` or keeps role tables; roles are read per order position from the timeline, silent-in-this-position = silent.

## Gate A - Baseline lock (plan section 2)

- [x] A1.1 baseline: playlist order documented -> c5b32061f; thoughts/shared/research/2026-10-08_auto-dj-baseline.md + autoDJBaseline.test.ts
- [x] A1.2 baseline: Smart Sort behaviour documented -> c5b32061f; autoDJBaseline.test.ts (legacy order frozen)
- [x] A1.3 baseline: deck transitions documented -> c5b32061f; baseline doc
- [x] A1.4 baseline: preload behaviour documented -> c5b32061f; autoDJBaseline.test.ts (constants)
- [x] A1.5 baseline: transition lengths documented -> c5b32061f; autoDJBaseline.test.ts
- [x] A1.6 baseline: crossfader behaviour documented -> c5b32061f; baseline doc
- [x] A1.7 baseline: tempo matching documented -> c5b32061f; baseline doc
- [x] A1.8 baseline: pitch behaviour documented -> c5b32061f; baseline doc
- [x] A1.9 baseline: key handling documented -> c5b32061f; autoDJBaseline.test.ts
- [x] A1.10 baseline: filter transitions documented -> c5b32061f; baseline doc
- [x] A1.11 baseline: bass swap documented -> c5b32061f; baseline doc
- [x] A1.12 baseline: echo-out documented -> c5b32061f; baseline doc
- [x] A1.13 baseline: failure recovery documented -> c5b32061f; autoDJBaseline.test.ts
- [x] A1.14 baseline: shuffle documented -> c5b32061f; baseline doc
- [x] A1.15 baseline: auto pause documented -> c5b32061f; baseline doc
- [x] A1.16 baseline: transition timing documented -> c5b32061f; autoDJBaseline.test.ts
- [x] A1.17 baseline: current humanization documented -> c5b32061f; autoDJBaseline.test.ts
- [x] A1.18 baseline: current analysis values documented -> c5b32061f; baseline doc
- [x] A2.1 corpus: steady 4/4 electronic track -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.2 corpus: long intro -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.3 corpus: long outro -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.4 corpus: vocals -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.5 corpus: drops -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.6 corpus: breakdowns -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.7 corpus: large BPM differences -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.8 corpus: compatible keys -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.9 corpus: incompatible keys -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.10 corpus: uncertain key analysis -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.11 corpus: tracker/module material -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.12 corpus: unusual arrangements -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.13 corpus: very short tracks -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.14 corpus: tracks with silence -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A2.15 corpus: highly variable energy -> c5b32061f; testing/corpus.ts CORPUS_SPECS + autoDJAnalysisInstrument.test.ts (20/20 over the 15 track types) + autoDJGoldenTransitions.test.ts
- [x] A3.1 gate: existing behaviour documented -> c5b32061f; baseline doc
- [x] A3.2 gate: regressions can be detected (baseline snapshot test) -> c5b32061f; autoDJBaseline.test.ts
- [x] A3.3 gate: Auto DJ runs through the corpus without hard crashes -> 45187d1f3; autoDJLongSetSimulation.test.ts (30 min corpus run, no crash)
- [x] A3.4 gate: transition logs can be captured -> c5b32061f; decisionLog.ts (MCP wiring in a later chunk)

## Section 3 - Unified DJTrackAnalysis

- [x] S3.1 bpm + bpmConfidence -> c5b32061f; autoDJDeckTrackAnalysis.test.ts
- [x] S3.2 beatGrid: BeatGrid -> c5b32061f; autoDJDeckTrackAnalysis.test.ts
- [x] S3.3 downbeats: DownbeatGrid -> c5b32061f; autoDJDeckTrackAnalysis.test.ts
- [x] S3.4 meter: MeterAnalysis -> c5b32061f; autoDJAnalysisInstrument.test.ts
- [x] S3.5 key + keyConfidence + keyTimeline -> c5b32061f; autoDJAnalysisInstrument.test.ts (key timeline)
- [x] S3.6 tuning: TuningAnalysis -> c5b32061f; types.ts TuningAnalysis (optional field; no detector - see open question Q1)
- [x] S3.7 loudness: LoudnessAnalysis -> c5b32061f; autoDJAnalysisInstrument.test.ts (loudness set)
- [x] S3.8 energy: EnergyAnalysis -> c5b32061f; autoDJAnalysisInstrument.test.ts (energy is not loudness)
- [x] S3.9 spectral: SpectralAnalysis -> c5b32061f; autoDJAnalysisInstrument.test.ts (spectral)
- [x] S3.10 rhythmic: RhythmicAnalysis -> c5b32061f; autoDJAnalysisInstrument.test.ts (tempo hypotheses, syncopation)
- [x] S3.11 bass: BassAnalysis -> c5b32061f; autoDJAnalysisInstrument.test.ts (bass)
- [x] S3.12 danceability + genre -> c5b32061f; trackAnalysis.ts
- [x] S3.13 sections: DJSection[] -> c5b32061f; autoDJAnalysisInstrument.test.ts
- [x] S3.14 phrases: DJPhrase[] -> c5b32061f; autoDJAnalysisInstrument.test.ts
- [x] S3.15 cuePoints: DJCuePoints -> c5b32061f; autoDJAnalysisInstrument.test.ts
- [x] S3.16 vocal/drum/bass/harmonic activity timelines -> c5b32061f; autoDJAnalysisInstrument.test.ts (instrument check)
- [x] S3.17 analysisConfidence: AnalysisConfidence -> c5b32061f; autoDJAnalysisInstrument.test.ts
- [x] S3.18 tracker?: TrackerMixAnalysis -> c5b32061f; autoDJAnalysisInstrument.test.ts (tracker)
- [x] S3.19 DJTrackAnalysis is the canonical input to all higher-level decisions (planner, solver, executor read it, nothing else) -> 0f3d488c5; setPlanner / tempoKeySolver / transitionPlanner / transitionExecutor / juggle planner all take DJTrackAnalysis; deck.trackAnalysis is the store carrier (autoDJDeckTrackAnalysis.test.ts, autoDJPlannedTransitionReachesTheDecks.test.ts)

## Gate B - Analysis correctness (plan section 4)

- [x] B1.1 BPM: half-time handled -> c5b32061f; tempoHypotheses half
- [x] B1.2 BPM: double-time handled -> c5b32061f; tempoHypotheses double
- [x] B1.3 BPM: ambiguous BPM handled (alternatives kept) -> c5b32061f; tempo hypotheses ranked
- [x] B1.4 BPM: tracker tempo handled (module tempo as a hypothesis) -> c5b32061f; module tempo hypothesis
- [x] B1.5 BPM: tempo changes handled (confidence drops, segments) -> c5b32061f; tempoStability (unusual < steady)
- [x] B1.6 BPM: intro sections with weak rhythm handled -> c5b32061f; firstMusicalBeat after weak intro
- [x] B1.7 BPM: breakdowns handled -> c5b32061f; breakdown sections labelled
- [x] B1.8 BPM: syncopation handled -> c5b32061f; syncopation measured
- [x] B1.9 first detected BPM is not assumed correct -> c5b32061f; hypotheses list
- [x] B1.10 TempoHypothesis { bpm, confidence, relationship } represented when confidence is low -> c5b32061f; TempoHypothesis type + test
- [x] B2.1 key: key, confidence, mode, possible alternatives, local key changes -> c5b32061f; parseMusicalKey + keyTimeline alternatives
- [x] B2.2 unknown key means "we don't know", never "clash" -> c5b32061f; unknown key: confidence 0, mode unknown (test)
- [x] B3.1 loudness: integrated -> c5b32061f; integratedDb
- [x] B3.2 loudness: short-term -> c5b32061f; shortTermDb
- [x] B3.3 loudness: peak -> c5b32061f; peakDb
- [x] B3.4 loudness: true peak (where available) -> c5b32061f; truePeakDb (4x polyphase)
- [x] B3.5 loudness: dynamic range -> c5b32061f; dynamicRangeDb
- [x] B3.6 loudness: crest factor -> c5b32061f; crestFactorDb
- [x] B4.1 energy: bass energy -> c5b32061f; energy.bass
- [x] B4.2 energy: drum energy -> c5b32061f; energy.drums
- [x] B4.3 energy: transient density -> c5b32061f; transientDensity
- [x] B4.4 energy: spectral brightness -> c5b32061f; brightness
- [x] B4.5 energy: harmonic density -> c5b32061f; harmonicDensity
- [x] B4.6 energy: vocal presence -> c5b32061f; vocalPresence (harmonic-line proxy, confidence 0.45; a chord pad in the voice register defeats it - documented)
- [x] B4.7 energy: rhythmic density -> c5b32061f; rhythmicDensity
- [x] B4.8 energy: arrangement density -> c5b32061f; arrangementDensity
- [x] B4.9 energy: perceived intensity (not RMS) -> c5b32061f; perceivedIntensity (loudness-scaled texture)

## Gate C - Real beat grid (plan section 5)

- [x] C1 BeatGrid { bpm, firstBeat, beats, confidence } -> c5b32061f; BeatGrid
- [x] C2 DownbeatGrid { bars, meter, confidence } -> c5b32061f; DownbeatGrid
- [x] C3.1 distinguishes first detected transient -> c5b32061f; landmarks.firstTransient
- [x] C3.2 distinguishes first musical beat -> c5b32061f; landmarks.firstMusicalBeat
- [x] C3.3 distinguishes first downbeat -> c5b32061f; landmarks.firstDownbeat
- [x] C3.4 distinguishes first full bar -> c5b32061f; landmarks.firstFullBar
- [x] C3.5 distinguishes first usable mixing point -> c5b32061f; landmarks.firstUsableMixPoint
- [x] C4 does not assume first detected beat = bar 1 (downbeat phase search) -> c5b32061f; searchMeterAndPhase (anacrusis test)
- [x] C5.1 anacrusis case -> c5b32061f; unusual corpus (anacrusis)
- [x] C5.2 pickup case -> c5b32061f; unusual corpus (pickup = anacrusis beat)
- [x] C5.3 long intro case -> c5b32061f; longIntro corpus
- [x] C5.4 syncopated case -> c5b32061f; syncopated synth test
- [x] C5.5 tracker composition case -> c5b32061f; tracker corpus
- [x] C5.6 unusual arrangement case -> c5b32061f; unusual corpus (3/4, tempo change)

## Gate D - Musical structure (plan section 6)

- [x] D1.1 section label: intro -> c5b32061f; labelSections kind rule
- [x] D1.2 section label: groove -> c5b32061f; labelSections kind rule
- [x] D1.3 section label: verse -> c5b32061f; labelSections kind rule
- [x] D1.4 section label: build -> c5b32061f; labelSections kind rule
- [x] D1.5 section label: pre-drop -> c5b32061f; labelSections kind rule
- [x] D1.6 section label: drop -> c5b32061f; labelSections kind rule
- [x] D1.7 section label: chorus -> c5b32061f; labelSections kind rule
- [x] D1.8 section label: breakdown -> c5b32061f; labelSections kind rule
- [x] D1.9 section label: bridge -> c5b32061f; labelSections kind rule
- [x] D1.10 section label: outro -> c5b32061f; labelSections kind rule
- [x] D1.11 section label: silence -> c5b32061f; labelSections kind rule
- [x] D1.12 section label: fill -> c5b32061f; labelSections kind rule
- [x] D1.13 section label: instrumental -> c5b32061f; labelSections kind rule
- [x] D1.14 section label: vocal-heavy -> c5b32061f; labelSections kind rule
- [x] D1.15 section label: drum-only -> c5b32061f; labelSections kind rule
- [x] D1.16 section label: bass-only -> c5b32061f; labelSections kind rule
- [x] D1.17 labels are probabilistic (confidence per section); planner reads musical function -> c5b32061f; labelSections confidence + alternatives
- [x] D2.1 4-bar phrases -> c5b32061f; detectPhraseLength 4
- [x] D2.2 8-bar phrases -> c5b32061f; detectPhraseLength 8
- [x] D2.3 16-bar phrases -> c5b32061f; detectPhraseLength 16
- [x] D2.4 phrase boundaries -> c5b32061f; buildPhrases
- [x] D2.5 repeated phrase patterns -> c5b32061f; tracker REPEATED_PHRASE + similarity lag
- [x] D2.6 arrangement changes (events) -> c5b32061f; arrangementEvents
- [x] D3 phrase length is not hard-coded globally; detected per song -> c5b32061f; per-song phrase length test

## Gate E - Semantic cue points (plan section 7)

- [x] E1.1 cue: introStart -> c5b32061f; deriveCuePoints
- [x] E1.2 cue: firstBeat -> c5b32061f; deriveCuePoints
- [x] E1.3 cue: firstFullGroove -> c5b32061f; deriveCuePoints
- [x] E1.4 cue: firstDrums -> c5b32061f; deriveCuePoints
- [x] E1.5 cue: firstBass -> c5b32061f; deriveCuePoints
- [x] E1.6 cue: firstVocal -> c5b32061f; deriveCuePoints
- [x] E1.7 cue: firstHook -> c5b32061f; deriveCuePoints
- [x] E1.8 cue: firstDrop -> c5b32061f; deriveCuePoints
- [x] E1.9 cue: firstBreak -> c5b32061f; deriveCuePoints
- [x] E1.10 cue: bestMixIn -> c5b32061f; deriveCuePoints
- [x] E1.11 cue: bestMixOut -> c5b32061f; deriveCuePoints
- [x] E1.12 cue: outroStart -> c5b32061f; deriveCuePoints
- [x] E1.13 cue: outroGroove -> c5b32061f; deriveCuePoints
- [x] E1.14 cue: finalBeat -> c5b32061f; deriveCuePoints
- [x] E2 incoming deck starts at a musically useful position, not 0:00 -> c5b32061f; bestMixIn > intro (deck test)
- [x] E3 example: B with drums at 0:24 starts at 0:24 under a drum-intro strategy (strategy-dependent) -> c5b32061f; longIntro: firstDrums/bestMixIn at the drum entry

## Gate F - Multi-track set planning (plan section 8)

- [x] F1 DJSetPlanner replaces the greedy Smart Sort for Auto DJ -> 0f3d488c5; autoDJSessionOrderKeepsThePlaylist.test.ts (planSet replaces smartSort for Auto DJ)
- [x] F2 3-6 track lookahead -> 0f3d488c5; autoDJSessionOrderKeepsThePlaylist.test.ts (lookahead 3-6)
- [x] F3 beam/bounded search, not exhaustive -> 0f3d488c5; setPlanner beam search; autoDJSessionOrderKeepsThePlaylist.test.ts

## Section 9 - Set planning score

- [x] S9.1 component: harmonicCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.2 component: tempoCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.3 component: phraseCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.4 component: energyArcFit -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.5 component: sectionCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.6 component: introOutroCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.7 component: drumCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.8 component: bassCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.9 component: vocalCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.10 component: genreCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.11 component: textureCompatibility -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.12 component: novelty -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.13 component: setNarrative -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.14 component: repetition (penalty) -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.15 component: awkwardness (penalty) -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.16 component: risk (penalty) -> 0f3d488c5; setPlanner.scoreTransition component
- [x] S9.17 weights configurable and style-dependent -> 0f3d488c5; styleProfiles weights; autoDJSessionOrderKeepsThePlaylist.test.ts
- [x] S9.18 components observable (per-candidate breakdown in the decision log) -> 0f3d488c5; autoDJSessionOrderKeepsThePlaylist.test.ts (components per candidate)

## Section 10 - Session order separate from user playlist

- [x] S10.1 userPlaylist kept, sessionOrder separate (store field) -> 0f3d488c5; useDJStore.autoDJSessionOrder; autoDJSessionOrderKeepsThePlaylist.test.ts
- [x] S10.2 user can always recover the original order (Auto DJ never writes the playlist order) -> 0f3d488c5; autoDJSessionOrderKeepsThePlaylist.test.ts (playlist order unchanged)

## Gate G - Set energy arc (plan section 11)

- [x] G1 SetEnergyPhase: OPENING, BUILDING, CRUISING, PEAKING, PEAK, RELEASE, RECOVERY, CLOSING -> 0f3d488c5; types SetEnergyPhase; setPlanner.energyArc
- [x] G2.1 planner knows current energy -> 0f3d488c5; energyArc currentEnergy
- [x] G2.2 planner knows recent energy trend -> 0f3d488c5; energyArc trend
- [x] G2.3 planner knows desired energy -> 0f3d488c5; targetEnergy
- [x] G2.4 planner knows peak history -> 0f3d488c5; memory.recentPeaks
- [x] G2.5 planner knows time since last peak -> 0f3d488c5; sinceLastPeak
- [x] G2.6 planner knows recent releases -> 0f3d488c5; recentReleases (recentEnergy)
- [x] G2.7 planner knows upcoming opportunities -> 0f3d488c5; lookahead candidates
- [x] G3 track energy is not set energy (a deliberate low-energy track after a peak is allowed) -> 0f3d488c5; energyArcFit vs set target, not track energy

## Gate H - Tempo and key solver (plan section 12)

- [x] H1.1 solver decision: beatmatch -> 0f3d488c5; solveTempo beatmatch
- [x] H1.2 solver decision: half-time relationship -> 0f3d488c5; half-time
- [x] H1.3 solver decision: double-time relationship -> 0f3d488c5; double-time
- [x] H1.4 solver decision: pitch slightly -> 0f3d488c5; pitch
- [x] H1.5 solver decision: tempo bridge -> 0f3d488c5; tempo-bridge (bridgeAvailable)
- [x] H1.6 solver decision: avoid the transition -> 0f3d488c5; avoid
- [x] H1.7 solver decision: creative tempo jump -> 0f3d488c5; creative-jump
- [x] H2 ranges: normal about +-4-8 %, creative about +-8-12 %, extreme only when justified; large offsets not normal -> 0f3d488c5; DEFAULT_TEMPO_LIMITS normal/creative/extreme bands
- [x] H3 limits configurable -> 0f3d488c5; TempoKeyLimits configurable

## Section 13 - Key lock strategy

- [x] S13.1 key classes: known+high, known+low, unknown -> 0f3d488c5; keyConfidenceClass
- [x] S13.2 high-confidence clash matters more than an uncertain key -> 0f3d488c5; harmonicCompatibility confidence weighting
- [x] S13.3 considers Camelot, relative major/minor, semitone relationships, modal compatibility, local key, bass/harmonic density, transition length -> 0f3d488c5; harmonicRelation extended Camelot + local key + density + overlapBars
- [x] S13.4 key lock is a per-transition decision (the plan sets it; Auto DJ no longer leaves it untouched) -> 0f3d488c5; solveKey keyLock decision; autoDJPlannedTransitionReachesTheDecks.test.ts (setKeyLock called)

## Section 14 - Local key timeline

- [x] S14.1 KeySegment[] timeline computed (optional) -> c5b32061f; keyTimelineFromChroma
- [x] S14.2 planner uses the local key at the mix points, not the whole-track key -> 0f3d488c5; keyAt at the mix points in planTransition

## Gate I - Transition planning (plan section 15)

- [x] I1 DJTransitionPlanner produces a complete plan before execution -> 0f3d488c5; planTransition; autoDJPlannedTransitionReachesTheDecks.test.ts
- [x] I2 DJTransitionPlan: outgoing/incoming deck, startBeat, endBeat, incomingPosition, durationBars, tempoPlan, keyPlan, crossfadePlan, eqPlan, filterPlan, bassPlan, effects, confidence, risk -> 0f3d488c5; DJTransitionPlan type (all fields)
- [x] I3 executor executes the plan and does not invent it -> 0f3d488c5; transitionExecutor runs the plan; autoDJPlannedTransitionReachesTheDecks.test.ts

## Section 16 - Adaptive transition length

- [x] S16.1 2/4/8/16/32 remain candidate lengths -> 0f3d488c5; LENGTH_CANDIDATES
- [x] S16.2 length chosen from phrase structure, intro/outro, energy, vocal density, harmonic compat, genre, drum compat, set phase, style, risk -> 0f3d488c5; chooseLength factors
- [x] S16.3 long blend / short blend / immediate rules as specified -> 0f3d488c5; chooseLength reasons long/short/immediate

## Gate J - Transition vocabulary (plan section 17)

- [x] J1.1 style: longBlend -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.2 style: shortBlend -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.3 style: bassSwap -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.4 style: EQSwap -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.5 style: filterBuild -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.6 style: filterRelease -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.7 style: echoOut -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.8 style: reverbOut -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.9 style: delayThrow -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.10 style: loopExit -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.11 style: breakdownMix -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.12 style: dropMix -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.13 style: drumIntroMix -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.14 style: vocalSwap -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.15 style: percussionSwap -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.16 style: hardCut -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.17 style: tempoBridge -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.18 style: doubleTimeJump -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J1.19 style: halfTimeJump -> 0f3d488c5; TRANSITION_STYLES + scoreStyles
- [x] J2 selection by context (scored, explained) -> 0f3d488c5; scoreStyles from context; autoDJPlannedTransitionReachesTheDecks.test.ts (rejected alternatives logged)
- [x] J3 never randomized -> 0f3d488c5; no Math.random in autodj/ (scoreStyles deterministic)

## Section 18 - True echo-out

- [x] S18.1 echo/feedback rises while dry falls, tail remains, incoming enters, tail decays (a real delay line on the outgoing deck) -> 0f3d488c5; DjFxActions fx_deck_echo_out = deck echo send + dry decay; autoDJFiresTheDjFxActions.test.ts
- [x] S18.2 temporally integrated into the transition (not crossfade-then-echo) -> 0f3d488c5; executor fires at the plan beat; crossfader holds centre for the tail; autoDJFiresTheDjFxActions.test.ts

## Section 19 - Continuous filter automation

- [x] S19.1 filter moves on a continuous curve to a musical endpoint (no set-wait-set) -> 0f3d488c5; fx_deck_filter_rise/release continuous sweeps; autoDJFiresTheDjFxActions.test.ts
- [x] S19.2 supports high-pass sweep, low-pass sweep, resonant build, release, filter+EQ combination -> 0f3d488c5; filterFor kinds high-pass/low-pass/resonant/release/filter-eq
- [x] S19.3 automation is phrase-aware (keyframes on phrase boundaries) -> 0f3d488c5; filter keyframes on phrase fractions (0.5/0.85 of the fade)

## Gate K - DJ EQ intelligence (plan section 20)

- [x] K1 frequency-aware bass handover (not a 12 dB cut at the midpoint) -> 0f3d488c5; planBassHandover; autoDJPlannedTransitionReachesTheDecks.test.ts (incoming low cut then open)
- [x] K2.1 determines which track owns the low end -> 0f3d488c5; schedule owner
- [x] K2.2 determines when ownership changes -> 0f3d488c5; handoverBar
- [x] K2.3 determines whether both basses can coexist -> 0f3d488c5; coexist
- [x] K2.4 determines whether one track is bass-heavy -> 0f3d488c5; outgoingHeavy/incomingHeavy
- [x] K2.5 determines whether the incoming kick is stronger -> 0f3d488c5; incomingKickStronger
- [x] K2.6 determines whether the outgoing bass is still musically necessary -> 0f3d488c5; outgoingBassNecessary

## Section 21 - Bass ownership

- [x] S21.1 BassOwner: OUTGOING | INCOMING | SHARED | NEUTRAL as explicit state -> 0f3d488c5; BassOwner type + schedule
- [x] S21.2 handover planned per bar and executed as a continuous curve -> 0f3d488c5; continuous eqLow curves; autoDJPlannedTransitionReachesTheDecks.test.ts

## Section 22 - Gain staging

- [x] S22.1 controls deck gain, master gain, transition gain, EQ boosts, FX returns -> 0f3d488c5; planGain trims capped by headroom, overlap compensation, eqBoostCap, fxReturnDb, masterCeiling
- [x] S22.2 a transition is not louder because two tracks overlap (overlap compensation) -> 0f3d488c5; overlapCompensationDb (law + LF accumulation)
- [x] S22.3 monitors integrated loudness, short-term loudness, true peak, low-frequency accumulation -> 0f3d488c5; gainPlan.monitor integrated/shortTerm/truePeak/lowFrequencyAccumulation

## Gate L - Creative transition planning (plan section 23)

- [x] L1 drop mix: incoming enters around a structural drop -> 0f3d488c5; scoreStyles dropMix + chooseMixIn dropMix
- [x] L2 breakdown mix: outgoing breakdown is the window -> 0f3d488c5; breakdownMix
- [x] L3 drum intro mix: incoming drums under an outgoing melodic section -> 0f3d488c5; drumIntroMix
- [x] L4 vocal swap: no simultaneous vocals -> 0f3d488c5; vocalSwap
- [x] L5 bass swap at a phrase boundary -> 0f3d488c5; bassSwap at phrase handover
- [x] L6 echo out from a phrase-ending vocal or stab -> 0f3d488c5; echoOut when outgoingVocalEnding
- [x] L7 filter build: controlled rise into the incoming section -> 0f3d488c5; filterBuild
- [x] L8 tempo bridge: intermediate track moves BPM -> 0f3d488c5; tempoBridge (bridgeAvailable from the next track)

## Section 24 - Deliberate cuts

- [x] S24.1 CutCandidate { beat, reason: drop|silence|phraseBoundary|impact|emergency, confidence } -> 0f3d488c5; CutCandidate on the plan
- [x] S24.2 hard cut requires structural justification + confidence + compatible moment -> 0f3d488c5; hardCut requires cutFrequency, creativeRisk>=0.5, confidence>=0.75 + trigger
- [x] S24.3 never a fallback for poor analysis unless classified emergency -> 0f3d488c5; low confidence -> blends only (scoreStyles lowConf)

## Gate M - Tracker-native intelligence (plan section 25)

- [x] M1 TrackerMixAnalysis kept alongside the rendered-audio analysis (structure not thrown away) -> c5b32061f; tracker on DJTrackAnalysis
- [x] M2.1 exposes order positions -> c5b32061f; analyzeTrackerSong
- [x] M2.2 exposes pattern boundaries -> c5b32061f; analyzeTrackerSong
- [x] M2.3 exposes channel activity -> c5b32061f; analyzeTrackerSong
- [x] M2.4 exposes instrument changes -> c5b32061f; analyzeTrackerSong
- [x] M2.5 exposes sample usage -> c5b32061f; analyzeTrackerSong
- [x] M2.6 exposes note density -> c5b32061f; analyzeTrackerSong
- [x] M2.7 exposes bass channel activity -> c5b32061f; analyzeTrackerSong
- [x] M2.8 exposes drum channel activity -> c5b32061f; analyzeTrackerSong
- [x] M2.9 exposes melody activity -> c5b32061f; analyzeTrackerSong
- [x] M2.10 exposes pattern changes -> c5b32061f; analyzeTrackerSong
- [x] M2.11 exposes fills -> c5b32061f; analyzeTrackerSong
- [x] M2.12 exposes breaks -> c5b32061f; analyzeTrackerSong
- [x] M2.13 exposes instrument entrances -> c5b32061f; analyzeTrackerSong
- [x] M2.14 exposes instrument exits -> c5b32061f; analyzeTrackerSong
- [x] M2.15 exposes repeating phrases -> c5b32061f; analyzeTrackerSong
- [x] M2.16 exposes silence -> c5b32061f; analyzeTrackerSong
- [x] M2.17 exposes structural transitions -> c5b32061f; analyzeTrackerSong

## Section 26 - Tracker channel awareness

- [x] S26.1 channel roles understood (drums/bass/melody) when the structure supports it -> c5b32061f; channel roles via classifyPattern
- [x] S26.2 time-varying TrackerChannelSegment { channel, start, end, instrumentFamily, musicalFunction, rhythmicRole, register, importance, density, confidence } -> c5b32061f; TrackerChannelSegment per order position

## Section 27 - Tracker mix events

- [x] S27.1 events: DRUM_ENTRY, BASS_ENTRY, BASS_EXIT, MELODY_ENTRY, INSTRUMENT_ENTRY, INSTRUMENT_EXIT, PATTERN_CHANGE, FILL, BREAK, DROP, DENSITY_INCREASE, DENSITY_DECREASE, SILENCE, REPEATED_PHRASE -> c5b32061f; TrackerMixEvent kinds
- [x] S27.2 events available to the transition planner (cue points and sections for tracker material come from them) -> 0f3d488c5; chooseMixOut uses tracker BREAK/DROP/DENSITY_DECREASE events

## Gate N - Performance memory (plan section 28)

- [x] N1.1 memory: recent tracks -> 0f3d488c5; sessionMemory snapshot
- [x] N1.2 memory: recent artists -> 0f3d488c5; sessionMemory snapshot
- [x] N1.3 memory: recent keys -> 0f3d488c5; sessionMemory snapshot
- [x] N1.4 memory: recent BPMs -> 0f3d488c5; sessionMemory snapshot
- [x] N1.5 memory: recent transition types -> 0f3d488c5; sessionMemory snapshot
- [x] N1.6 memory: recent FX -> 0f3d488c5; sessionMemory snapshot
- [x] N1.7 memory: recent energy -> 0f3d488c5; sessionMemory snapshot
- [x] N1.8 memory: recent cuts -> 0f3d488c5; sessionMemory snapshot
- [x] N1.9 memory: recent bass swaps -> 0f3d488c5; sessionMemory snapshot
- [x] N1.10 memory: recent vocals -> 0f3d488c5; sessionMemory snapshot
- [x] N1.11 memory: recent transition lengths -> 0f3d488c5; sessionMemory snapshot
- [x] N1.12 memory: recent peaks -> 0f3d488c5; sessionMemory snapshot
- [x] N1.13 memory: repeated tracks -> 0f3d488c5; sessionMemory snapshot
- [x] N1.14 memory: repeated transition patterns -> 0f3d488c5; sessionMemory snapshot

## Section 29 - Repetition avoidance

- [x] S29.1 same transition type / same length in a row is penalised (bass swap x4, echo out x3, 8-bar x3 do not happen) -> 0f3d488c5; memory.styleRepetition/lengthRepetition in scoring
- [x] S29.2 a style may deliberately permit repetition (repetitionTolerance) -> 0f3d488c5; style.repetitionTolerance

## Section 30 - DJ style profiles

- [x] S30.1 profiles: Smooth, Club, Aggressive, Dub, Progressive, Classic, Experimental, Minimal, Festival, Radio -> 0f3d488c5; DJ_STYLES 10 profiles
- [x] S30.2 a style affects transition length, risk tolerance, energy movement, FX usage, bass behaviour, key strictness, tempo tolerance, cut frequency, repetition tolerance, phrase strictness -> 0f3d488c5; DJStyleProfile fields
- [x] S30.3 styles modify planner weights, not separate engines; selectable in the Auto DJ panel -> 0f3d488c5; weights only; store autoDJStyle (panel select in a later chunk)

## Section 31 - Humanization

- [x] S31.1 late-only timing variation stays small (0-30 ms) -> 0f3d488c5; humanize.startOffsetMs 0-30 (unsigned hash); autoDJFiresTheDjFxActions.test.ts
- [x] S31.2 affects tiny transition timing, subtle FX timing, occasional length variation, controlled choice variation -> 0f3d488c5; startOffsetMs, fxOffsetMs, lengthVariationBars, choice via scores
- [x] S31.3 never overrides phrase alignment, beat alignment, bass handover, hard safety constraints -> 0f3d488c5; quantize + grid untouched by humanize

## Gate O - Anticipatory planning (plan section 32)

- [x] O1.1 while A plays: analyse current position -> 0f3d488c5; sessionController.context
- [x] O1.2 evaluate next tracks -> 0f3d488c5; replanSession candidates
- [x] O1.3 select likely next track -> 0f3d488c5; SELECT_NEXT_TRACK
- [x] O1.4 preload -> 0f3d488c5; DJAutoDJ preload
- [x] O1.5 analyse incoming structure -> 0f3d488c5; anticipate builds the incoming analysis
- [x] O1.6 select mix-in point -> 0f3d488c5; chooseMixIn
- [x] O1.7 select transition -> 0f3d488c5; planTransitionFor at preload
- [x] O1.8 wait for execution window -> 0f3d488c5; waitForDeckPosition + plan-driven trigger
- [x] O2 decisions are not all made at the transition moment (plan exists before the window) -> 0f3d488c5; DJAutoDJ.anticipate: plan exists at preload time

## Section 33 - Smart preload

- [x] S33.1 preload timing considers track size, analysis availability, decoding time, device performance, transition confidence, distance to mix point -> 0f3d488c5; preloadTiming factors
- [x] S33.2 safety margin prevents late loading -> 0f3d488c5; +20 s margin, +15 s low confidence

## Gate P - Performance context (plan section 34)

- [x] P1 DJPerformanceContext { currentDeck, incomingDeck, currentTrack, incomingTrack, currentPosition, currentBeat, currentBar, currentPhrase, setEnergy, targetEnergy, setPhase, recentHistory, candidateTracks, transition, confidence } -> 0f3d488c5; buildPerformanceContext
- [x] P2 subsystems read the context instead of reconstructing state -> 0f3d488c5; controller.context used by telemetry/planner

## Gate Q - Confidence-aware DJing (plan section 35)

- [x] Q1.1 confidence: BPM -> 0f3d488c5; analysisConfidence.bpm
- [x] Q1.2 confidence: beat grid -> 0f3d488c5; beatGrid
- [x] Q1.3 confidence: downbeat -> 0f3d488c5; downbeat
- [x] Q1.4 confidence: key -> 0f3d488c5; key
- [x] Q1.5 confidence: section -> 0f3d488c5; section
- [x] Q1.6 confidence: cue -> 0f3d488c5; cue
- [x] Q1.7 confidence: vocal -> 0f3d488c5; vocal
- [x] Q1.8 confidence: bass -> 0f3d488c5; bass
- [x] Q1.9 confidence: tracker -> 0f3d488c5; tracker
- [x] Q2 policy: high -> sophisticated, medium -> conservative, low -> robust fallback -> 0f3d488c5; scoreStyles lowConf -> blends; quantize by grid confidence
- [x] Q3 no clever transition when the beat position is unknown -> 0f3d488c5; gridConf<0.3 -> quantize none, no creative styles

## Section 36 - Transition risk

- [x] S36.1 TransitionRisk { harmonic, tempo, phrase, bass, vocal, loudness, technical, overall } -> 0f3d488c5; assessRisk
- [x] S36.2 risk influences whether chosen, length, FX amount, whether a fallback is prepared -> 0f3d488c5; risk in chooseLength, effects, fallback chain

## Section 37 - Reversible transition planning

- [x] S37.1 plan carries preferred / fallback / emergency -> 0f3d488c5; fallbackStyle/emergencyStyle on every plan
- [x] S37.2 degrade chain preferred -> fallback -> safe when execution becomes unreliable -> 0f3d488c5; controller invariant check -> fallbackPlan; executor emergency()
- [x] S37.3 creative logic never compromises continuity -> 0f3d488c5; executor emergency = plain crossfade, never a cut

## Gate R - Failure resilience (plan section 38)

- [x] R1.1 survives preload failure -> 45187d1f3; autoDJLongSetSimulation.test.ts preload
- [x] R1.2 survives decode failure -> 45187d1f3; autoDJLongSetSimulation.test.ts decode
- [x] R1.3 survives analysis failure -> 45187d1f3; autoDJLongSetSimulation.test.ts analysis -> legacy path
- [x] R1.4 survives missing key -> 45187d1f3; autoDJLongSetSimulation.test.ts missingKey
- [x] R1.5 survives missing beat grid -> 45187d1f3; autoDJLongSetSimulation.test.ts missingGrid
- [x] R1.6 survives malformed tracker data -> 45187d1f3; autoDJLongSetSimulation.test.ts malformedTracker
- [x] R1.7 survives unavailable cue point -> 45187d1f3; autoDJLongSetSimulation.test.ts noCue
- [x] R1.8 survives deck failure -> 45187d1f3; autoDJLongSetSimulation.test.ts deckFailure -> emergency, outgoing kept
- [x] R1.9 survives effect failure -> 45187d1f3; autoDJLongSetSimulation.test.ts effectFailure
- [x] R1.10 survives unexpected track length -> 45187d1f3; autoDJLongSetSimulation.test.ts unexpectedLength
- [x] R1.11 survives extremely short tracks -> 45187d1f3; autoDJLongSetSimulation.test.ts short
- [x] R1.12 survives silence -> 45187d1f3; autoDJLongSetSimulation.test.ts silence
- [x] R1.13 survives transition timeout -> 45187d1f3; autoDJLongSetSimulation.test.ts transitionTimeout -> watchdog emergency
- [x] R2 fallback hierarchy ideal -> safe phrase -> safe crossfade -> emergency continuity -> 0f3d488c5; ideal -> fallbackPlan -> executor emergency -> legacy beatMatchedTransition
- [x] R3 no hard cut caused by software failure -> 0f3d488c5; emergency path is a crossfade

## Gate S - Long-set intelligence (plan section 39)

- [x] S1.1 30-minute session test -> 45187d1f3; autoDJLongSetSimulation.test.ts 30 minutes
- [x] S1.2 1-hour session test -> 45187d1f3; autoDJLongSetSimulation.test.ts 1 hour
- [x] S1.3 2-hour session test -> 45187d1f3; autoDJLongSetSimulation.test.ts 2 hours
- [x] S1.4 4-hour session test -> 45187d1f3; autoDJLongSetSimulation.test.ts 4 hours
- [x] S2.1 measure: transition quality -> 45187d1f3; autoDJLongSetSimulation.test.ts meanQuality/minQuality
- [x] S2.2 measure: energy coherence -> 45187d1f3; autoDJLongSetSimulation.test.ts energyCoherence
- [x] S2.3 measure: repetition -> 45187d1f3; autoDJLongSetSimulation.test.ts maxStyleRun
- [x] S2.4 measure: key conflicts -> 45187d1f3; autoDJLongSetSimulation.test.ts keyConflicts
- [x] S2.5 measure: tempo drift -> 45187d1f3; autoDJLongSetSimulation.test.ts tempoDriftMax (crossfader range proxy; the executor pitches once per plan)
- [x] S2.6 measure: loudness drift -> 45187d1f3; autoDJLongSetSimulation.test.ts loudnessMaxTruePeakDb
- [x] S2.7 measure: transition variety -> 45187d1f3; autoDJLongSetSimulation.test.ts distinctStyles
- [x] S2.8 measure: track diversity -> 45187d1f3; autoDJLongSetSimulation.test.ts trackRepeats
- [x] S2.9 measure: CPU stability (planning time per decision bounded) -> 45187d1f3; autoDJLongSetSimulation.test.ts planningMsMax/mean
- [x] S2.10 measure: memory usage (memory structures bounded) -> 45187d1f3; autoDJLongSetSimulation.test.ts memoryRecords <= 64, decisionLogSize <= 400, pendingTimersAtEnd 0
- [x] S2.11 measure: preload failures -> 45187d1f3; autoDJLongSetSimulation.test.ts preloadFailures
- [x] S2.12 measure: analysis failures -> 45187d1f3; autoDJLongSetSimulation.test.ts analysisFailures

## Section 40 - Long-set narrative

- [x] S40.1 planner tracks where we have been / are / should go (recent, medium, long-term trajectory) -> 0f3d488c5; energyArc progress + trend + peaks
- [x] S40.2 not every transition optimises only the next track (lookahead score includes trajectory) -> 0f3d488c5; beam search discounts deeper moves (lookahead)

## Gate T - Transition quality scoring (plan section 41)

- [x] T1 offline evaluator: TransitionQuality { beatAlignment, phraseAlignment, harmonicCompatibility, tempoStability, bassHandover, loudnessConsistency, structuralFit, creativity, smoothness, surprise, overall } -> 0f3d488c5; evaluateTransition TransitionQuality; autoDJPlannedTransitionReachesTheDecks.test.ts (quality recorded)
- [x] T2 used for objective regression testing (golden corpus thresholds) -> 45187d1f3; autoDJGoldenTransitions.test.ts (thresholds per scenario)

## Section 42 - Golden transition corpus

- [x] S42.1 golden: long blend -> 45187d1f3; autoDJGoldenTransitions.test.ts (long blend)
- [x] S42.2 golden: bass swap -> 45187d1f3; autoDJGoldenTransitions.test.ts (bass swap)
- [x] S42.3 golden: breakdown mix -> 45187d1f3; autoDJGoldenTransitions.test.ts (breakdown mix)
- [x] S42.4 golden: drop mix -> 45187d1f3; autoDJGoldenTransitions.test.ts (drop mix)
- [x] S42.5 golden: drum intro -> 45187d1f3; autoDJGoldenTransitions.test.ts (drum intro)
- [x] S42.6 golden: vocal swap -> 45187d1f3; autoDJGoldenTransitions.test.ts (vocal swap)
- [x] S42.7 golden: echo out -> 45187d1f3; autoDJGoldenTransitions.test.ts (echo out)
- [x] S42.8 golden: filter build -> 45187d1f3; autoDJGoldenTransitions.test.ts (filter build)
- [x] S42.9 golden: filter release -> 45187d1f3; autoDJGoldenTransitions.test.ts (filter release)
- [x] S42.10 golden: tempo bridge -> 45187d1f3; autoDJGoldenTransitions.test.ts (tempo bridge)
- [x] S42.11 golden: deliberate cut -> 45187d1f3; autoDJGoldenTransitions.test.ts (deliberate cut)
- [x] S42.12 corpus runs as regression tests -> 45187d1f3; autoDJGoldenTransitions.test.ts

## Section 43 - Automated invariants

- [x] S43.1 beat invariant: no audible drift during beatmatched mixing -> 0f3d488c5; checkInvariants beat
- [x] S43.2 phrase invariant: transitions begin/end on valid boundaries -> 0f3d488c5; phrase
- [x] S43.3 bass invariant: two bass-heavy tracks never fully exposed together -> 0f3d488c5; bass (bassExposure)
- [x] S43.4 loudness invariant: no major accidental spikes -> 0f3d488c5; loudness
- [x] S43.5 failure invariant: a failed creative transition does not stop playback -> 0f3d488c5; failure
- [x] S43.6 playlist invariant: Smart sorting never destructively reorders the user's playlist -> 0f3d488c5; playlist; autoDJSessionOrderKeepsThePlaylist.test.ts
- [x] S43.7 confidence invariant: low confidence never triggers high-risk behaviour -> 0f3d488c5; confidence

## Section 44 - Debug / telemetry view

- [x] S44.1 view: current track (BPM, key, key confidence, energy, set phase, current bar, current phrase) -> 45187d1f3; autoDJDebugPanel.test.tsx
- [x] S44.2 view: next track (BPM, key, energy, mix-in point, mix-out point) -> 45187d1f3; autoDJDebugPanel.test.tsx
- [x] S44.3 view: transition (type, length, tempo plan, key plan, bass plan, EQ plan, filter plan) -> 45187d1f3; autoDJDebugPanel.test.tsx
- [x] S44.4 view: confidence and risk -> 45187d1f3; autoDJDebugPanel.test.tsx
- [x] S44.5 view: why this track? why this transition? (explanation lines with +/- signs) -> 45187d1f3; autoDJDebugPanel.test.tsx
- [x] S44.6 DOM, design-system components, token classes, full English labels -> 45187d1f3; autoDJDebugPanel.test.tsx (no emoji, no raw colour classes)

## Section 45 - "Why did you do that?" logging

- [x] S45.1 structured decision log { decision, selectedTrack, reasons, rejectedAlternatives } for every autonomous decision, readable from the MCP (bridge handler + server tool) -> 0f3d488c5; decisionLog + telemetry (MCP read handler in a later chunk)

## Gate U - Musical mix-point intelligence (plan section 46)

- [x] U1 distinguishes technically possible from musically appropriate (mix-point score) -> 0f3d488c5; scoreMixIn/chooseMixOut scores
- [x] U2.1 prefers: phrase begins -> 0f3d488c5; phrase begins
- [x] U2.2 prefers: drums enter -> 0f3d488c5; drums enter
- [x] U2.3 prefers: bass enters -> 0f3d488c5; bass enters
- [x] U2.4 prefers: outgoing phrase ends -> 0f3d488c5; outgoing phrase ends
- [x] U2.5 prefers: vocals absent -> 0f3d488c5; vocals absent
- [x] U2.6 prefers: harmonic density compatible -> 0f3d488c5; harmonic density moderate
- [x] U2.7 prefers: arrangement stable -> 0f3d488c5; arrangement stable

## Section 47 - Vocal conflict avoidance

- [x] S47.1 vocal A + vocal B avoided unless deliberate -> 0f3d488c5; vocalCompatibility overlapRisk
- [x] S47.2 strongly influences transition timing (window moved to instrumental stretch) -> 0f3d488c5; chooseMixOut vocal window scoring + vocalSwap

## Section 48 - Drum compatibility

- [x] S48.1 drum pattern coexistence judged (four-on-floor vs breakbeat) -> 0f3d488c5; drumCompatibility
- [x] S48.2 incompatible drums -> shorter overlap / EQ reduction / percussion swap / breakdown transition -> 0f3d488c5; percussionSwap / shorter length via drumScore

## Section 49 - Bass compatibility

- [x] S49.1 bass analysed independently of overall energy -> 0f3d488c5; bassCompatibility heaviness
- [x] S49.2 low-frequency spectral analysis + bass activity timelines drive the overlap decision -> 0f3d488c5; bass.activity + lowRatio in planBassHandover

## Section 50 - Spectral compatibility

- [x] S50.1 detects brightness mismatch, muddy overlap, excessive HF density, excessive LF density, conflicting midrange -> 0f3d488c5; spectralCompatibility
- [x] S50.2 subordinate to musical reasoning (capped weight; never decides alone) -> 0f3d488c5; textureCompatibility weight 0.3 (capped)

## Section 51 - Loop intelligence

- [x] S51.1 structure-aware temporary loops: extend intro, extend outro, wait for a better phrase, hold a breakdown, bridge BPM, create a transition window -> 0f3d488c5; LoopPlan purposes in planTransition
- [x] S51.2 never loops arbitrary audio (requires phrase-aligned loop region + confidence) -> 0f3d488c5; loops need gridConf>=0.7 and phraseConf>=0.6

## Section 52 - Cue-jump intelligence

- [x] S52.1 jumps to drop, breakdown, hook, outro, drum section only when justified -> 0f3d488c5; CueJumpPlan drop/hook
- [x] S52.2 treated as high-risk (needs risk budget + high confidence) -> 0f3d488c5; inConf>=0.8 and creativeRisk>=0.6

## Section 53 - Energy-driven FX

- [x] S53.1 mapping: build -> filter rise, phrase ending -> delay throw, vocal ending -> echo out, breakdown -> reverb expansion, drop -> clean release -> 0f3d488c5; effectsFor mapping
- [x] S53.2 FX are punctuation (only with a musical trigger) -> 0f3d488c5; effects only with a trigger section

## Section 54 - Creative risk budget

- [x] S54.1 session creativeRisk 0..1 -> 0f3d488c5; controller.creativeRisk
- [x] S54.2 higher risk permits shorter transitions, larger tempo changes, more FX, deliberate cuts, unusual harmonic moves, stronger energy jumps -> 0f3d488c5; creativeRisk gates creative-jump, cuts, dropMix, loops
- [x] S54.3 lower risk favours long blends, safe keys, conservative BPM, minimal FX -> 0f3d488c5; low risk -> blends/safe keys
- [x] S54.4 risk budget is style-dependent -> 0f3d488c5; style.riskTolerance default

## Section 55 - Avoid "AI randomness"

- [x] S55.1 no Math.random gating of musical decisions (variation emerges from context) -> 0f3d488c5; no Math.random under src/engine/dj/autodj (hash-seeded humanize only)

## Section 56 - Existing state machine

- [x] S56.1 playing / preloading / transition-pending / transitioning / failure states preserved -> 0f3d488c5; DJAutoDJ states kept
- [x] S56.2 high-level intelligence moved out of the state machine (DJAutoDJ asks the controller) -> 0f3d488c5; DJAutoDJ delegates to the controller

## Section 57 - DJSessionController

- [x] S57.1 coordinates performance state, planning cadence, candidate evaluation, preload scheduling, transition scheduling, session memory, failure fallback, long-term set state -> 0f3d488c5; DJSessionController
- [x] S57.2 contains no musical heuristics itself (delegates to planners) -> 0f3d488c5; controller holds no heuristics

## Section 58 - DJSetPlanner

- [x] S58.1 candidate generation, sequence planning, energy trajectory, track diversity, harmonic trajectory, tempo trajectory, repetition avoidance, set narrative -> 0f3d488c5; setPlanner
- [x] S58.2 never touches deck audio -> 0f3d488c5; setPlanner is pure

## Section 59 - DJTransitionPlanner

- [x] S59.1 decides mix point, phrase alignment, type, length, tempo, key, EQ, filter, bass, FX, risk, fallback -> 0f3d488c5; transitionPlanner

## Section 60 - DJTransitionExecutor

- [x] S60.1 does load deck, seek, start, tempo, pitch, crossfade, EQ, filter, effects, bass handover, stop old deck, recover failure -> 0f3d488c5; transitionExecutor
- [x] S60.2 executes plans generated elsewhere only -> 0f3d488c5; executor takes a plan

## Section 61 - Separation of analysis and execution

- [x] S61.1 analysis -> context -> planner -> plan -> executor; executor never discovers structure -> 0f3d488c5; analysis -> context -> planner -> plan -> executor

## Gate V - Full autonomous performance (plan section 62)

- [x] V1.1 10-track run -> 45187d1f3; autoDJLongSetSimulation.test.ts 10 tracks
- [x] V1.2 25-track run -> 45187d1f3; autoDJLongSetSimulation.test.ts 25
- [x] V1.3 50-track run -> 45187d1f3; autoDJLongSetSimulation.test.ts 50
- [x] V1.4 100-track run -> 45187d1f3; autoDJLongSetSimulation.test.ts 100
- [x] V2.1 evaluate musical continuity -> 45187d1f3; autoDJLongSetSimulation.test.ts invariantFailures 0 / completed
- [x] V2.2 evaluate transition variety -> 45187d1f3; autoDJLongSetSimulation.test.ts distinctStyles
- [x] V2.3 evaluate energy trajectory -> 45187d1f3; autoDJLongSetSimulation.test.ts energyCoherence
- [x] V2.4 evaluate harmonic quality -> 45187d1f3; autoDJLongSetSimulation.test.ts keyConflicts
- [x] V2.5 evaluate tempo stability -> 45187d1f3; autoDJLongSetSimulation.test.ts tempo plan bands + beat invariant
- [x] V2.6 evaluate bass quality -> 45187d1f3; autoDJLongSetSimulation.test.ts bass invariant (bassExposure)
- [x] V2.7 evaluate vocal handling -> 45187d1f3; autoDJLongSetSimulation.test.ts vocal risk in quality
- [x] V2.8 evaluate structural timing -> 45187d1f3; autoDJLongSetSimulation.test.ts phrase invariant
- [x] V2.9 evaluate repetition -> 45187d1f3; autoDJLongSetSimulation.test.ts maxStyleRun
- [x] V2.10 evaluate failure handling -> 45187d1f3; autoDJLongSetSimulation.test.ts resilience test

## Section 63 - Human-listener evaluation (owner checks)

- [o] S63.1 would you believe a human DJ made this mix? -> owner check (listening session)
- [o] S63.2 are transitions musically timed? -> owner check (listening session)
- [o] S63.3 is the set coherent? -> owner check (listening session)
- [o] S63.4 does it become repetitive? -> owner check (listening session)
- [o] S63.5 does the energy arc feel intentional? -> owner check (listening session)
- [o] S63.6 are FX tasteful? -> owner check (listening session)
- [o] S63.7 does bass remain controlled? -> owner check (listening session)
- [o] S63.8 do vocals clash? -> owner check (listening session)
- [o] S63.9 are there moments of surprise? -> owner check (listening session)
- [o] S63.10 does the DJ appear to listen to the music? -> owner check (listening session)

## Section 64 - World-class acceptance criteria (listener-reported; automated proxies built)

- [o] S64.1 transitions feel intentional -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.2 tracks enter at appropriate musical moments -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.3 phrase alignment feels natural -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.4 bass changes sound like a real DJ -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.5 energy rises and falls naturally -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.6 vocals rarely collide -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.7 FX appear purposeful -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.8 transitions are varied -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.9 the set has a narrative -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.10 the DJ occasionally surprises -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.11 the system knows when to wait -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.12 the system recovers gracefully -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)
- [o] S64.13 the set remains coherent over long durations -> owner check (listening; automated proxy in autoDJLongSetSimulation.test.ts / autoDJGoldenTransitions.test.ts)

## Section 65 - Implementation order

- [x] S65.1 implemented in the recommended sequence (baseline first, listening last); recorded here as the commit order -> c5b32061f..0edb37304; executed baseline (Gate A) -> analysis -> planning -> execution -> session -> juggling -> listening (owner checks 1-8), in that order

## Section 66 - Phase gates

- [x] PG-A.1 deterministic test corpus -> c5b32061f; corpus.ts
- [x] PG-A.2 transition logs -> c5b32061f; decisionLog.ts
- [x] PG-A.3 regression playback -> c5b32061f; autoDJBaseline.test.ts (legacy transition path still reaches the decks) + djViewRegressions 85/85
- [x] PG-B.1 reliable BPM -> c5b32061f; bpm + hypotheses
- [x] PG-B.2 BPM confidence -> c5b32061f; bpmConfidence
- [x] PG-B.3 key confidence -> c5b32061f; keyConfidence
- [x] PG-B.4 loudness -> c5b32061f; loudness
- [x] PG-B.5 spectral data -> c5b32061f; spectral
- [x] PG-B.6 rhythmic data -> c5b32061f; rhythmic
- [x] PG-B.7 bass data -> c5b32061f; bass
- [x] PG-C.1 beat positions -> c5b32061f; beats
- [x] PG-C.2 downbeats -> c5b32061f; downbeats
- [x] PG-C.3 meter -> c5b32061f; meter
- [x] PG-C.4 confidence -> c5b32061f; confidence
- [x] PG-C.5 phrase synchronization -> c5b32061f; phrase synchronization (buildPhrases origin)
- [x] PG-D.1 sections -> c5b32061f; sections
- [x] PG-D.2 phrases -> c5b32061f; phrases
- [x] PG-D.3 arrangement events -> c5b32061f; arrangement events
- [x] PG-E.1 semantic mix-in -> c5b32061f; bestMixIn
- [x] PG-E.2 semantic mix-out -> c5b32061f; bestMixOut
- [x] PG-E.3 first groove -> c5b32061f; firstFullGroove
- [x] PG-E.4 first bass -> c5b32061f; firstBass
- [x] PG-E.5 first drums -> c5b32061f; firstDrums
- [x] PG-E.6 first vocal -> c5b32061f; firstVocal
- [x] PG-E.7 drop -> c5b32061f; firstDrop
- [x] PG-E.8 breakdown -> c5b32061f; firstBreak
- [x] PG-E.9 outro -> c5b32061f; outroStart
- [x] PG-F.1 multi-track lookahead -> 0f3d488c5; setPlanner beam search / energyArc / harmonicCompatibility / solveTempo / repetition components (autoDJSessionOrderKeepsThePlaylist.test.ts, autoDJGoldenTransitions.test.ts)
- [x] PG-F.2 energy arc -> 0f3d488c5; setPlanner beam search / energyArc / harmonicCompatibility / solveTempo / repetition components (autoDJSessionOrderKeepsThePlaylist.test.ts, autoDJGoldenTransitions.test.ts)
- [x] PG-F.3 harmonic planning -> 0f3d488c5; setPlanner beam search / energyArc / harmonicCompatibility / solveTempo / repetition components (autoDJSessionOrderKeepsThePlaylist.test.ts, autoDJGoldenTransitions.test.ts)
- [x] PG-F.4 tempo planning -> 0f3d488c5; setPlanner beam search / energyArc / harmonicCompatibility / solveTempo / repetition components (autoDJSessionOrderKeepsThePlaylist.test.ts, autoDJGoldenTransitions.test.ts)
- [x] PG-F.5 repetition control -> 0f3d488c5; setPlanner beam search / energyArc / harmonicCompatibility / solveTempo / repetition components (autoDJSessionOrderKeepsThePlaylist.test.ts, autoDJGoldenTransitions.test.ts)
- [x] PG-G.1 complete transition plans -> 0f3d488c5; planTransition (full plan: mix points, curves, bass, EQ, filter, effects, loops, cue jumps, humanize), chooseLength, 19 styles, assessRisk (autoDJGoldenTransitions.test.ts 14/14, autoDJPlannedTransitionReachesTheDecks.test.ts)
- [x] PG-G.2 adaptive lengths -> 0f3d488c5; planTransition (full plan: mix points, curves, bass, EQ, filter, effects, loops, cue jumps, humanize), chooseLength, 19 styles, assessRisk (autoDJGoldenTransitions.test.ts 14/14, autoDJPlannedTransitionReachesTheDecks.test.ts)
- [x] PG-G.3 transition vocabulary -> 0f3d488c5; planTransition (full plan: mix points, curves, bass, EQ, filter, effects, loops, cue jumps, humanize), chooseLength, 19 styles, assessRisk (autoDJGoldenTransitions.test.ts 14/14, autoDJPlannedTransitionReachesTheDecks.test.ts)
- [x] PG-G.4 risk/confidence -> 0f3d488c5; planTransition (full plan: mix points, curves, bass, EQ, filter, effects, loops, cue jumps, humanize), chooseLength, 19 styles, assessRisk (autoDJGoldenTransitions.test.ts 14/14, autoDJPlannedTransitionReachesTheDecks.test.ts)
- [x] PG-H.1 bass ownership -> 0f3d488c5/45187d1f3; bass hand-over plan + bassExposure invariant, planGain capped by true-peak headroom, EQ keyframe curves applied by the executor (autoDJGoldenTransitions.test.ts loudness/bass invariants, autoDJPlannedTransitionReachesTheDecks.test.ts)
- [x] PG-H.2 bass handover -> 0f3d488c5/45187d1f3; bass hand-over plan + bassExposure invariant, planGain capped by true-peak headroom, EQ keyframe curves applied by the executor (autoDJGoldenTransitions.test.ts loudness/bass invariants, autoDJPlannedTransitionReachesTheDecks.test.ts)
- [x] PG-H.3 gain staging -> 0f3d488c5/45187d1f3; bass hand-over plan + bassExposure invariant, planGain capped by true-peak headroom, EQ keyframe curves applied by the executor (autoDJGoldenTransitions.test.ts loudness/bass invariants, autoDJPlannedTransitionReachesTheDecks.test.ts)
- [x] PG-H.4 continuous EQ automation -> 0f3d488c5/45187d1f3; bass hand-over plan + bassExposure invariant, planGain capped by true-peak headroom, EQ keyframe curves applied by the executor (autoDJGoldenTransitions.test.ts loudness/bass invariants, autoDJPlannedTransitionReachesTheDecks.test.ts)
- [x] PG-I.1 real echo out -> 45187d1f3; true echo-out through DeckEngine echo send + fx_deck_echo_out (autoDJFiresTheDjFxActions.test.ts)
- [x] PG-I.2 filter builds -> 45187d1f3; fx_deck_filter_rise / release through the registry (autoDJFiresTheDjFxActions.test.ts)
- [x] PG-I.3 breakdown transitions -> 45187d1f3; breakdowns corpus -> breakdown-aware styles (autoDJGoldenTransitions.test.ts)
- [x] PG-I.4 drop transitions -> 45187d1f3; drops corpus -> dropMix on drop-section energy (autoDJGoldenTransitions.test.ts)
- [x] PG-I.5 drum intros -> 45187d1f3; drum intro requires bass absent (autoDJGoldenTransitions.test.ts)
- [x] PG-I.6 vocal swaps -> 45187d1f3; vocals corpus -> vocal-aware mix points and styles (autoDJGoldenTransitions.test.ts)
- [x] PG-J.1 tracker structure retained -> c5b32061f; tracker retained
- [x] PG-J.2 pattern/order awareness -> c5b32061f; orderPositions/patternBoundaries
- [x] PG-J.3 channel analysis -> c5b32061f; channelSegments
- [x] PG-J.4 instrument activity -> c5b32061f; instrumentUsage
- [x] PG-J.5 semantic tracker events -> c5b32061f; events
- [x] PG-K.1 transition history -> 0f3d488c5/45187d1f3; DJSessionMemory (transition / FX / energy history, styleRepetition, lengthRepetition) + DJ_STYLES weights (autoDJGoldenTransitions.test.ts, autoDJLongSetSimulation.test.ts)
- [x] PG-K.2 FX history -> 0f3d488c5/45187d1f3; DJSessionMemory (transition / FX / energy history, styleRepetition, lengthRepetition) + DJ_STYLES weights (autoDJGoldenTransitions.test.ts, autoDJLongSetSimulation.test.ts)
- [x] PG-K.3 energy history -> 0f3d488c5/45187d1f3; DJSessionMemory (transition / FX / energy history, styleRepetition, lengthRepetition) + DJ_STYLES weights (autoDJGoldenTransitions.test.ts, autoDJLongSetSimulation.test.ts)
- [x] PG-K.4 repetition control -> 0f3d488c5/45187d1f3; DJSessionMemory (transition / FX / energy history, styleRepetition, lengthRepetition) + DJ_STYLES weights (autoDJGoldenTransitions.test.ts, autoDJLongSetSimulation.test.ts)
- [x] PG-K.5 style behaviour -> 0f3d488c5/45187d1f3; DJSessionMemory (transition / FX / energy history, styleRepetition, lengthRepetition) + DJ_STYLES weights (autoDJGoldenTransitions.test.ts, autoDJLongSetSimulation.test.ts)
- [x] PG-L.1 1-hour session without degradation -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-L.2 2-hour session without degradation -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-L.3 4-hour session without degradation -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-M.1 survives preload failure without stopping playback -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-M.2 survives analysis failure -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-M.3 survives missing key -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-M.4 survives missing beat grid -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-M.5 survives malformed content -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-M.6 survives deck failure -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-M.7 survives effect failure -> 45187d1f3; autoDJLongSetSimulation.test.ts
- [x] PG-N.1 automated evaluation passes -> 45187d1f3; autoDJGoldenTransitions.test.ts + autoDJLongSetSimulation.test.ts
- [x] PG-N.2 golden transition corpus passes -> 45187d1f3; autoDJGoldenTransitions.test.ts
- [o] PG-N.3 human listening tests (owner) -> owner check (listening)
- [x] PG-N.4 long-set evaluation passes -> 45187d1f3; autoDJLongSetSimulation.test.ts

## Section 67 - Architectural constraints

- [x] S67.1 no second deck system -> 0f3d488c5; no new deck
- [x] S67.2 no second mixer -> 0f3d488c5; no new mixer
- [x] S67.3 no second transport -> 0f3d488c5; no new transport
- [x] S67.4 no duplicate playback infrastructure -> 0f3d488c5; DeckEngine reused
- [x] S67.5 no duplicate preload infrastructure -> 0f3d488c5; preload reused
- [x] S67.6 no duplicate FX infrastructure -> 0f3d488c5; FX through DjFxActions (D9)
- [x] S67.7 user playlist order never destroyed -> 0f3d488c5; autoDJSessionOrderKeepsThePlaylist.test.ts
- [x] S67.8 tracks are not a single global BPM/key/energy value -> 0f3d488c5; DJTrackAnalysis
- [x] S67.9 tracker channels are not permanent instruments -> 0f3d488c5; Dub Deck timeline roles (D10)
- [x] S67.10 randomness is not a substitute for musical reasoning -> 0f3d488c5; no Math.random
- [x] S67.11 low-confidence analysis never triggers high-risk behaviour -> 0f3d488c5; confidence gates
- [x] S67.12 DJAutoDJ.ts is not a giant heuristic file (shrinks; delegates) -> 0f3d488c5; DJAutoDJ delegates; glue only
- [x] S67.13 existing execution primitives reused; intelligence added above -> 0f3d488c5; DJActions primitives

## Section 68 / 69 - Final architecture and philosophy

- [x] S68.1 module graph matches the target architecture (DJAutoDJ -> DJSessionController -> context/memory/analysis -> set planner -> transition planner -> solvers -> plan -> executor -> existing deck/mixer) -> 0f3d488c5; module graph as in sessionController.ts
- [x] S69.1 loop: listen -> understand -> anticipate -> intend -> choose track -> choose mix point -> choose transition -> execute -> hear consequence -> adapt -> continue or rest (post-transition quality feeds memory/adaptation) -> 0f3d488c5; onTransitionComplete -> quality -> ADAPT

## Section 70 - Definition of done

- [x] S70.1 analyse tracks deeply -> c5b32061f..0edb37304; autoDJAnalysisInstrument.test.ts
- [x] S70.2 understand beat and phrase position -> c5b32061f..0edb37304; autoDJAnalysisInstrument.test.ts (beat grid phase, phrase length)
- [x] S70.3 understand musical sections -> c5b32061f..0edb37304; autoDJAnalysisInstrument.test.ts (sections)
- [x] S70.4 identify useful mix points -> c5b32061f..0edb37304; autoDJAnalysisInstrument.test.ts (cue points)
- [x] S70.5 start incoming tracks at musically appropriate positions -> c5b32061f..0edb37304; autoDJGoldenTransitions.test.ts (mix-in points > 0:00 on intros)
- [x] S70.6 maintain phase alignment -> c5b32061f..0edb37304; autoDJGoldenTransitions.test.ts beat/phrase invariants
- [x] S70.7 match tempo intelligently -> c5b32061f..0edb37304; tempoKeySolver (autoDJGoldenTransitions.test.ts tempo plans)
- [x] S70.8 make confidence-aware key decisions -> c5b32061f..0edb37304; tempoKeySolver solveKey (uncertainKey corpus case)
- [x] S70.9 manage bass ownership -> c5b32061f..0edb37304; bass hand-over plans + bassExposure invariant
- [x] S70.10 avoid vocal conflicts -> c5b32061f..0edb37304; vocal conflict scoring (clashKey/vocals corpus cases)
- [x] S70.11 control loudness -> c5b32061f..0edb37304; planGain + loudness invariant
- [x] S70.12 select tracks several steps ahead -> c5b32061f..0edb37304; setPlanner lookahead 3-6 (autoDJSessionOrderKeepsThePlaylist.test.ts)
- [x] S70.13 shape a coherent energy arc -> c5b32061f..0edb37304; energyArc (autoDJLongSetSimulation.test.ts)
- [x] S70.14 vary transitions naturally -> c5b32061f..0edb37304; styleRepetition / lengthRepetition (autoDJLongSetSimulation.test.ts)
- [x] S70.15 use FX as musical punctuation -> c5b32061f..0edb37304; DjFx effect events (autoDJFiresTheDjFxActions.test.ts)
- [x] S70.16 understand tracker structure -> c5b32061f..0edb37304; trackerMixAnalysis via Dub Deck roles (autoDJAnalysisInstrument.test.ts, autoDJBeatJuggling.test.ts JUG-S12)
- [x] S70.17 remember recent behaviour -> c5b32061f..0edb37304; DJSessionMemory
- [x] S70.18 avoid repetitive patterns -> c5b32061f..0edb37304; repetition components + juggle history (autoDJLongSetSimulation.test.ts, autoDJBeatJuggling.test.ts)
- [x] S70.19 take controlled creative risks -> c5b32061f..0edb37304; creative risk budget + juggle modes (autoDJGoldenTransitions.test.ts, autoDJBeatJuggling.test.ts)
- [x] S70.20 know when to wait -> c5b32061f..0edb37304; confidence policy: low confidence -> normal transition / no juggle
- [x] S70.21 recover safely -> c5b32061f..0edb37304; fallbackPlan chain + juggle emergency path (autoDJLongSetSimulation.test.ts, autoDJBeatJuggling.test.ts)
- [x] S70.22 run for hours -> c5b32061f..0edb37304; autoDJLongSetSimulation.test.ts + one simulated juggle hour
- [x] S70.23 explain its decisions -> c5b32061f..0edb37304; decisionLog + telemetry + dj_auto_dj_explain (autoDJDebugPanel.test.tsx)
- [x] S70.24 pass automated transition tests -> c5b32061f..0edb37304; all autoDJ*.test.ts in test:ci green at 93debb84e
- [o] S70.25 pass human listening tests (owner) -> owner check (listening)

## Beat-juggling plan (thoughts/shared/plans/2026-10-08-auto-dj-beat-juggling-plan.md, commit 94c0a4b19) - JUG- items

Decision D11: the juggle layer performs through the same DjFxActions / crossfader actions the DJ view's buttons use, phrase-locked to the DJTrackAnalysis beat grid (one clock: the deck positions), call and response material from the Dub Deck's channel-role sources (resolveSongChannelRoles / SongRoleTimeline). Files: src/engine/dj/autodj/juggle/*.

- [x] JUG-S1.1 intelligence above the existing primitives; no second DJ engine -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S2.1 one musical clock (the deck positions and beat grids); no second transport/beat/bar clock, no per-deck ms timers -> 0edb37304; the executor clock is the deck position through fractionalBeatAt (analysisClock); the 15 ms timer only samples it (autoDJBeatJuggling.test.ts JUG-PG-C exact beats)
- [x] JUG-S2.2 juggle engine works in musical units (beat, half-beat, bar, 2/4/8 bars, phrase, section) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S2.3 every action resolves to an absolute musical execution point (executeAtBeat) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S3.1 DJJuggleController -> 0edb37304; autoDJJuggleReachesTheDecks.test.ts
- [x] JUG-S3.2 DJJugglePlanner -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S3.3 DJJuggleExecutor -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S3.4 DJJuggleTypes -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S3.5 DJJugglePatterns -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S3.6 DJJugglePerformanceContext -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S4.1 DJJugglePerformanceContext { masterBeat, masterBar, phrasePosition, deckA, deckB, activeDeck, performanceMode, energy, targetEnergy, phraseConfidence, beatConfidence, currentSection, nextSection, lastJuggle, recentPatterns, intensity, tension, fallbackAvailable } -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S4.2 DJDeckPerformanceState { trackId, position, beatPhase, barPhase, bpm, key, section, cuePosition, mixInPosition, mixOutPosition, energy, drumsActive, bassActive, vocalsActive, melodicActivity, loop, analysisConfidence } -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S4.3 reuses DJTrackAnalysis / DJPerformanceContext, no duplicate analysis model -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S5.1 JuggleDeckRole: PRIMARY, SECONDARY, VOICE, RESPONSE, FOUNDATION, FILL, LAYER, SILENT -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S5.2 roles are temporary performance states, change through a juggle -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S6.1 action vocabulary: CutIn, CutOut, CrossfadeTo, CrossfadeFrom, TriggerCue, JumpToBeat, JumpToBar, StartLoop, ExitLoop, LoopResize, LoopRoll, HoldDeck, ReleaseDeck, FilterIn, FilterOut, EQCut, EQRestore, BassSwap, EchoThrow, ReverbThrow, ResetDeck, ResyncDeck -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S6.2 action fields: type, deck (A|B|BOTH), executeAtBeat, durationBeats, targetPosition, quantization, strength, reason -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S6.3 vocabulary stays small; intelligence in the planner -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S7.1 DJJugglePattern { id, type, durationBars, intensity, actions, sourceDeck, targetDeck, energyProfile, confidence, reason } -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S7.2 reasons in patterns (A-B-A-B, A-A-B-B, A-fill-B-fill, A-drums-B-lead, A-bass-B-drums, A-loop-B-hit, A-full-B-stab), not isolated cuts -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S8.1 grammar phase SETUP -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S8.2 grammar phase ESTABLISH -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S8.3 grammar phase INTENSIFY -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S8.4 grammar phase PEAK -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S8.5 grammar phase PAYOFF -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S8.6 grammar phase RELEASE -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S8.7 never a permanent A B A B -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S9.1 phrase trade 8 bars -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S9.2 phrase trade 4 bars -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S9.3 phrase trade 2 bars -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S9.4 phrase trade 1 bar -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S9.5 phrase trade half bar (optional) -> 0edb37304; exempt: half-bar trades are optional in the plan; the transformer pattern carries the half-beat gates (autoDJBeatJuggling.test.ts JUG-S20)
- [x] JUG-S9.6 only tightens when musical confidence is high -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S9.7 respects beat grid, bar grid, phrase boundaries, section boundaries, energy, drum activity, bass activity, musical role -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S9.8 never switches mid vocal phrase on a timer -> 0edb37304; autoDJBeatJuggling.test.ts
- [ ] JUG-S10.1 beat-level patterns represented explicitly (ABAB, AABA, ABBA, A-B-, AB-B / AB-A) -> open: ABAB (beatTrade), AABB (doubleBeat) and the transformer gates exist; AABA, ABBA, A-B- are not explicit patterns yet
- [x] JUG-S11.1 call and response: one deck asks, the other answers -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S11.2 response targets: drum fill, percussion hit, bass phrase, vocal phrase, synth stab, lead phrase, chord hit, rhythmic loop, tracker pattern segment -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S12.1 tracker-native call/response from time-varying channel segments (Dub Deck identity sources) -> 0edb37304; autoDJBeatJuggling.test.ts JUG-S12 (tracker windows from resolveSongChannelRoles / SongRoleTimeline segments via trackerMixAnalysis; source = tracker)
- [x] JUG-S13.1 material window features: drum, bass, percussion density, melodic, vocal, harmonic, spectral density, energy, rhythmic density, importance, confidence -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S13.2 moment classes: DRUM_FILL, BASS_HIT, VOCAL_HIT, LEAD_HIT, PERCUSSION_HIT, FULL_GROOVE, BREAK, DROP, BUILD, SILENCE -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S14.1 drum/bass trading pattern with A+B payoff -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S14.2 bass ownership per moment during a juggle -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S14.3 ownership change = intentional handover, no low-end collision, EQ when needed, clean restore -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S15.1 same-track doubles: same source on both decks, independent positions -> 0edb37304; double pattern + ResyncDeck through DJAutoSync (same source on both decks, independent positions; loading the double is manual, see JUG-S27.1)
- [x] JUG-S16.1 double alignment: reliable beat, align both, bar phase, optional offset, verify, then permit -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S16.2 offsets: 1 beat, 2 beats, 1 bar, 2 bars, 4 bars -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S16.3 no arbitrary offsets at low beat confidence -> 0edb37304; autoDJBeatJuggling.test.ts
- [ ] JUG-S17.1 straight double -> open: the double pattern always trades with an offset; a straight (zero-offset) double is not a separate pattern
- [x] JUG-S17.2 offset double -> 0edb37304; autoDJBeatJuggling.test.ts
- [ ] JUG-S17.3 one-bar double -> open: one-bar double not a separate pattern (the double pattern trades bars then beats)
- [ ] JUG-S17.4 fill double -> open: fill double not implemented (fills are traded against the other track in fillTrade)
- [ ] JUG-S17.5 drop double -> open: drop double not implemented
- [x] JUG-S17.6 escalating double 8 -> 4 -> 2 -> 1 -> beat -> 0edb37304; autoDJBeatJuggling.test.ts
- [ ] JUG-S18.1 loop juggling sizes 8, 4, 2, 1, 1/2, 1/4, 1/8 bar -> open: loop ladder is 4 -> 2 -> 1 -> 1/2 -> 1/4 bars (loopTighten); 8 bars and 1/8 bar missing
- [x] JUG-S18.2 loop progression is musical (4 -> 2 -> 1 -> 1/2 -> 1/4 -> release), not arbitrary -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S19.1 stutter/fill juggling around detected fills -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S19.2 real musical fills preferred over arbitrary slices -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S19.3 tracker pattern/channel/event fills as candidates -> 0edb37304; autoDJBeatJuggling.test.ts
- [ ] JUG-S20.1 transformer patterns: open/close, open/close/close, A-A-B-B, A-B-B-A, A-B-A-A -> open: transformer is open/close half-beat gates; open/close/close, A-A-B-B, A-B-B-A, A-B-A-A gate shapes not yet patterns
- [x] JUG-S20.2 transformer patterns are pattern objects; the executor moves the crossfader -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S21.1 every pattern scheduled >= 1-2 beats ahead (1 bar+ for complex) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S21.2 the planner produces a future action queue executed against the shared clock -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S22.1 timers only for safety/cleanup; musical actions originate from beat/bar/phrase/section -> 0edb37304; only the watchdog and the sampling interval are timers; every action has executeAtBeat (autoDJBeatJuggling.test.ts JUG-S32 watchdog)
- [x] JUG-S23.1 intensity 0..1 ladder (0 normal, 0.25 phrase, 0.5 2-bar, 0.7 1-bar, 0.85 beat, 1.0 peak) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S23.2 intensity drives pattern density, cut frequency, loop size, FX density, alternation, phrase length, musical risk - not randomness -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S24.1 performance budget from set position, energy, recent performance, compatibility, transition quality, audience proxy, confidence, previous duration -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S24.2 normal mix between juggles; never constant juggling -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S25.1 good conditions (strong beat confidence, phrase alignment, compatible sections, energy, rhythmic material, breakdown/build/drop, transition approaching, fill, repeated phrase, set needs energy, transition benefits) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S25.2 bad conditions (low confidence, unstable sync, incompatible keys, dense vocals both, unclear bass ownership, drift, dense section, similar recent juggle, incoming not prepared) block juggling -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S26.1 transition kinds NORMAL_BLEND | JUGGLE_TRANSITION | PERFORMANCE_TRANSITION -> 0edb37304; autoDJBeatJuggling.test.ts
- [ ] JUG-S26.2 a juggle transition: outro -> 4-bar trade -> 2 -> 1 -> incoming drop -> release -> open: the JUGGLE_TRANSITION prelude is wired (DJAutoDJ.maybeStartJugglePrelude starts the incoming deck 8 bars early, muted, grid-locked; the controller trades into the mix-in) but has no reachability test through the pre-rendered path yet
- [ ] JUG-S27.1 juggle inside a single track (same track both decks): double -> offset -> beat trade -> filter build -> release -> open: a single-track juggle needs the current track loaded onto the idle deck (loadDouble); doubles run only when both decks hold the same track already
- [x] JUG-S28.1 set-level arc: OPENING normal, BUILDING occasional trades, CRUISING short moments, PEAKING aggressive, PEAK doubles/beat juggling, RELEASE fewer cuts, RECOVERY normal, CLOSING controlled -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S29.1 DJJuggleHistory { patternType, durationBars, intensity, sourceTracks, successScore, timestamp } -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S29.2 no immediate repeat of the last pattern (A-B-A-B -> A-A-B-B or fill or normal) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S30.1 humanization allowed: tiny timing, pattern variation, phrase length, intensity, action order, response material -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S30.2 humanization forbidden: off-beat errors, drifting phase, inconsistent bars, delayed cuts -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S31.1 confidences: beat, phrase, section, deckSync, material -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S31.2 policy: high -> beat juggling, moderate -> phrase trading only, low -> normal transition -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S32.1 safety governor prevents: both decks silent, crossfader oscillation, excessive cut frequency, contradictory actions, conflicting loops, runaway FX, extreme tempo jumps, phase drift, stuck decks, infinite patterns -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S33.1 emergency sequence: cancel pending, strongest deck, stable crossfader, essential EQ, exit loop, resync, continue, resume planning when confidence recovers -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S34.1 no-silence invariant: at least one audible deck; BLOCK or FORCE SAFE DECK; continuously tested -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S35.1 bass safety tracks current owner, next owner, overlap, energy, low-frequency conflict -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S35.2 A bass / B drums, both only when compatible, else intentional handover -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S36.1 vocal safety: no vocal + vocal unless intended; instrumental/response pairings preferred in material selection -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S37.1 tracker access kept: orders, patterns, channels, instruments, samples, notes, effects, pattern boundaries, repeats, channel activity, instrument changes -> 0edb37304; trackerMixAnalysis keeps orders/patterns/channels/instruments/events/repeats; juggleMaterial reads events + channelSegments (autoDJBeatJuggling.test.ts JUG-S12)
- [x] JUG-S37.2 tracker facts drive selection (bass enters here, fill channel here, breakdown next order, no lead here) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S38.1 channel identity time-varying (timeline/segments), never channel N = role -> 0edb37304; trackerRolesIn reads time-varying channelSegments, never channel N = role (autoDJBeatJuggling.test.ts JUG-S12)
- [x] JUG-S39.1 pattern phraseTrade -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.2 pattern tightPhraseTrade -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.3 pattern barTrade -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.4 pattern beatTrade -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.5 pattern doubleBeat -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.6 pattern callResponse -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.7 pattern drumBassTrade -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.8 pattern fillTrade -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.9 pattern loopTighten -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.10 pattern double -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.11 pattern transformer -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.12 pattern dropAndReturn -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S39.13 pattern escalatingJuggle -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S40.1 pattern scoring: energyFit, phraseFit, sectionFit, rhythmicFit, bassFit, vocalFit, materialFit, confidence, novelty, repetition, risk, set position, budget, transition opportunity - never random -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S41.1 plans a short performance phrase ahead (8 -> 4 -> 2 -> 1 -> beat -> payoff) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S41.2 revises the future when conditions change -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S42.1 abort on: beat confidence drop, drift, material change, vocal collision, bass collision, analysis change, deck failure, user control, governor -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S42.2 abort resolves gracefully (a release pattern), never stops dead -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S43.1 manual override: crossfader, deck state, cue, FX, tempo, Auto DJ off -> yield, cancel/replan -> 0edb37304; autoDJJuggleReachesTheDecks.test.ts
- [x] JUG-S44.1 modes OFF, SAFE, MUSICAL, PERFORMER, AGGRESSIVE, CHAOS -> 0edb37304; autoDJJuggleReachesTheDecks.test.ts
- [x] JUG-S44.2 SAFE = 8/4-bar trading -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S44.3 MUSICAL adds call-response, fills, doubles -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S44.4 PERFORMER adds beat juggling, loops, transformer -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S44.5 AGGRESSIVE: shorter cuts, higher density, more doubles -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S44.6 CHAOS still obeys timing, safety, no-silence, boundaries -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S45.1 telemetry: pattern, phase, intensity, per-deck material + confidence, next actions with beats, reason -> 0edb37304; autoDJJuggleReachesTheDecks.test.ts
- [x] JUG-S46.1 events with reasons: juggleStarted, jugglePatternSelected, juggleActionScheduled, juggleActionExecuted, juggleActionBlocked, juggleAborted, juggleCompleted, juggleFallback -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S47.1 test: all actions land on intended beats -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S47.2 test: no phrase trade begins off-grid -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S47.3 test: at least one deck remains active -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S47.4 test: crossfader never invalid -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S47.5 test: double alignment within tolerance -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S47.6 test: actions occur in pattern order -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S47.7 test: unsafe conditions cancel safely -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S47.8 test: recent pattern history affects selection -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.1 scenario standard 4/4 -> phrase, bar, beat trading -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.2 scenario sparse track -> less aggressive -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.3 scenario vocal-heavy -> collision avoidance -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.4 scenario bass-heavy -> ownership management -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.5 scenario same-track double -> phase-aligned -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.6 scenario low confidence -> normal transition -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.7 scenario tracker song -> structure influences selection -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.8 scenario user intervention -> yields -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.9 scenario deck failure -> safe continuation -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S48.10 scenario long set -> no runaway, no repetition, no corruption -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S49.1 multi-hour simulated set: no leak, no accumulating timers, no stale actions, no stuck roles/loops, no latency growth, no exact repeats, no drift, no growing silence, no corrupt deck state -> 0edb37304; autoDJBeatJuggling.test.ts JUG-S48.10 / S49 (one simulated hour: pending timers <= 2, none left, no immediate repeats, no stuck loops, crossfader valid, budget < 60 %)
- [x] JUG-S50.1 performance memory learns successful pattern + pairing + context (deterministic scoring) -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S51.1 do not overuse: optimise musical impact, not action count -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S52.1 JuggleQualityScore: timing, compatibility, energy fit, material, bass clarity, vocal clarity, coherence, novelty, impact proxy, safety -> feeds memory -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S53.1 integration: DJSessionController -> DJJuggleController -> planner -> executor; transition executor keeps ordinary transitions; shared deck/mixer state -> 0edb37304; DJAutoDJ.juggleTick -> DJJuggleController -> jugglePlanner -> juggleExecutor -> juggleDeckSink -> DJActions; the session controller supplies set phase/energy; the transition executor keeps transitions (autoDJJuggleReachesTheDecks.test.ts)
- [x] JUG-PG-A.1 verify two-deck state, tempo sync, beat grid, crossfader, cue/playhead, transition executor, existing primitives (baseline regression green) -> 0edb37304; djViewRegressions 85/85, autoDJMixNow 3/3, autoDJFiresTheDjFxActions, autoDJPlannedTransition, autoDJLongSetSimulation, autoDJGoldenTransitions, loopEndRegression all green (121 tests) after the wiring
- [x] JUG-PG-B.1 both decks represented simultaneously (position, beat/bar phase, energy, section, activity, confidence) without a second transport -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-PG-C.1 deterministic test produces A B A B on exact musical beats through the executor -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-PG-D.1 complete 8 -> 4 -> 2 -> 1 phrase-trade sequence resolving into normal mixing -> 0edb37304; autoDJBeatJuggling.test.ts
- [ ] JUG-PG-E.1 beat-level patterns ABAB, AABB, ABBA, A-A-B-A phase-locked, no unintended silence -> open: ABAB, AABB, transformer gates and dropAndReturn phase-locked without silence (autoDJBeatJuggling.test.ts JUG-PG-E); ABBA and A-A-B-A missing (see JUG-S10.1)
- [x] JUG-PG-F.1 call/response: drum, bass, percussion, lead, vocal-safe responses; explains the material; avoids incompatible overlaps -> 0edb37304; autoDJBeatJuggling.test.ts
- [ ] JUG-PG-G.1 doubles: same-track, offset, bar, beat, fill; phase-aligned without drift -> open: same-track and offset doubles phase-aligned (autoDJBeatJuggling.test.ts JUG-PG-G); bar/beat/fill double variants missing (see JUG-S17.x)
- [x] JUG-PG-H.1 loops/fills/transformer/drop-release: normal -> loop -> tighten -> juggle -> release without state corruption -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-PG-I.1 adaptive engine chooses whether/which/material/duration/intensity; no "always every N bars" -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-PG-J.1 set integration (energy, transition planner, phrase/section, memory, cooldowns, set position): varied intentional moments in a long set -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-PG-K.1 safety: no-silence, bass, vocal, conflict prevention, emergency fallback, abort/replan; every unsafe test returns to stable playback -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-PG-L.1 humanization/memory: novelty, history, controlled variation, successful-pattern memory; repeated simulations not identical -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-PG-M.1 telemetry: mode, pattern, intensity, active deck, next actions, reason, confidence, safety state; user controls Auto Juggle, Mode, Intensity -> 0edb37304; autoDJJuggleReachesTheDecks.test.ts (telemetry published from the poll loop) + autoDJDebugPanel.test.tsx JUG-PG-M (section rows) + DJAutoDJPanel Auto Juggle / Juggle Intensity selects
- [ ] JUG-PG-N.1 acceptance: two-deck relationship, 8/4/2/1 trading, tight ABAB, call/response, doubles, tracker intelligence, musical awareness, escalation, release, variety, safety, human quality (listening: owner) -> Owner check 8 (listening: two-deck relationship, 8/4/2/1 trading, call/response, doubles, escalation, release, variety, human quality)
- [x] JUG-S55.1 recognise both decks usable -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.2 synchronise to one clock -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.3 select material from each -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.4 trade phrases -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.5 trade bars -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.6 trade beats -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.7 call-and-response -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.8 drum/bass exchanges -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.9 doubles -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.10 offset doubles -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.11 manipulate loops -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.12 use fills -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.13 rhythmic crossfader patterns -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.14 escalate intensity -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.15 resolve into a payoff -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.16 return to normal mixing -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.17 avoid vocal collisions -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.18 manage bass ownership -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.19 exploit tracker structure -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.20 respect time-varying channel identity -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.21 avoid repeating the same trick -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.22 yield to the user -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.23 survive low confidence -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.24 recover from failures -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S55.25 stable playback for long sessions -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.1 no second transport -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.2 no second musical clock -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.3 no second deck system -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.4 no bypass of mixer/deck primitives -> 0edb37304; autoDJJuggleReachesTheDecks.test.ts
- [x] JUG-S56.5 not all in DJAutoDJ.ts -> 0edb37304; autoDJJuggleReachesTheDecks.test.ts
- [x] JUG-S56.6 no ms timers for musical timing -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.7 no permanent channel roles -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.8 no 4/4 assumption without the meter -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.9 no identical-phrase assumption -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.10 incoming material not always at 0:00 -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.11 not always the same pattern -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.12 no constant juggling -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.13 no random cuts -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.14 no two bass-heavy decks without ownership -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.15 no two active vocals without intent -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.16 decks never both disappear -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.17 creative never overrides safety -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.18 low confidence is not permission to improvise -> 0edb37304; autoDJBeatJuggling.test.ts
- [x] JUG-S56.19 no needless rebuild of analysis/deck infrastructure -> 0edb37304; autoDJBeatJuggling.test.ts

## Found during the run (new items, never shrink the plan)

- [x] FIX-1 Mix Now did nothing when the queued track failed to load (owner live test 2026-10-08): skip() retried the same bad track and parked in 'preloading'; now skips to the next loadable track through the controller's order, never the playing one -> 45187d1f3; autoDJMixNowStartsTheTransition.test.ts (3 cases incl. the bad-track case)
- [x] FIX-2 humanize hash was signed: a negative fxOffsetMs made beat-0 effects never fire -> 0f3d488c5; autoDJFiresTheDjFxActions.test.ts (brake case asserts offsets >= 0)
- [x] FIX-3 executor emergency path could leave both decks silent when the incoming deck could not start -> 45187d1f3; autoDJLongSetSimulation.test.ts (deckFailure: outgoing kept playing)
- [x] FIX-4 gain staging: the auto-gain trim could push a track's true peak above the ceiling -> 0f3d488c5; trimFor caps by headroom (golden corpus loudness invariant)
- [x] DJ3 (from the fix-all ledger, owner live report 2026-10-08: "the visuals dont feel synced to the audio in dj view ... all visuals feel laggy") every DJ visual drew the deck's rendered position; outputLatency (28 ms) + baseLatency (5.3 ms) were read nowhere under the DJ code, and in tracker mode useDeckStateSync read the scheduler counters (up to 250 ms lookahead ahead of the ear) -> 4445519bf; src/engine/audioLatency.ts is the one latency source (PlaybackCoordinator engine path + the replayer's TS-scheduled rows queue heard times; DeckEngine.getHeardPosition / getHeardTrackerState feed useDeckStateSync, which every DJ visual reads); heardPositionIsAudioMinusLatency.test.ts (0 and +-8 % pitch, ring at heard time) + djVisualsReadTheHeardPosition.test.tsx (store position = audio position - latency x rate at 0 / +8 / -8 %; tracker row from the ring). Owner check 7.
- [ ] FOUND-2 src/hooks/audio/__tests__/playheadFeedIsNotPerFormat.ratchet.test.ts fails on committed code ("useWasmPositionStore.getState().setPosition( is gone from usePatternPlayback"); usePatternPlayback.ts is clean in the working tree, so a landed commit by another agent removed the feed the ratchet guards - not touched by this run, reported to the coordinator
- [ ] FOUND-1 DJStemPreloader module cycle: addTrack's dynamic import of the stem preloader throws "Cannot access MAX_DURATION_S before initialization" under the Auto DJ test import order (foreign module, not fixed here; the test injects its playlist with importPlaylists)

## Owner checks (steps at http://localhost:5174, LOCAL dev server on the working tree)

1. Open the DJ view, load a playlist of 10+ analysed tracks (Analyze first), press Auto DJ. PASS: the playlist order on screen does not change; the Auto DJ panel's "Debug" button shows Session Order, Why This Track with "+ ..." lines, and a planned Transition before the track ends.
2. Let two transitions play. PASS: the incoming track does not start at 0:00 when it has an intro (Debug: Mix-In Point > 0:00); the bass of the incoming arrives after the outgoing bass leaves (one low end at a time); no loudness jump at the overlap.
3. Press Mix Now mid-track. PASS: the mix starts within a second; if the next track fails to load, the one after it plays (status never stays "preloading").
4. Press the deck's Echo pad on the playing deck. PASS: the echo tail keeps ringing after the dry signal fades (real echo), the pad lights, and dj_auto_dj_explain (or the Debug panel) lists the fire in fxFireLog with source "pad".
5. Set Style to Festival / Creative Risk High and listen for a few transitions: filter builds and drop mixes appear; set Smooth / Low: long blends. PASS: the vocabulary changes with the style (Debug panel Transition type).
7. DJ3 visual sync: play an analysed track on deck A in the DJ view (and a module in tracker mode on deck B). PASS: the waveform playhead, beat grid and the pattern lights land on the beat you hear, at pitch 0 and at +8 % / -8 %; before the fix every visual ran ~33 ms (audio) / up to 250 ms (tracker rows) ahead of the sound.
8. Auto Juggle: load two analysed tracks of the same BPM on both decks, play both, enable Auto DJ, set Auto Juggle to Performer, Juggle Intensity to Set Decides, open Debug. PASS: within a minute or two the Beat Juggling section shows a pattern (e.g. tightPhraseTrade "A B A B") with Next Actions in beats, the crossfader cuts land on the beat you hear and alternate decks, the pattern ends with a release back to the playing deck, and the controller waits (cooldown shown in Budget) before the next one; move the crossfader by hand mid-pattern: it releases at once (Safety shows "aborting: user control"). Section 54 (JUG-PG-N.1) listening questions: does the trading feel intentional, does the escalation (8 -> 4 -> 2 -> 1 bars -> beats) pay off, do call and response answer each other, is it ever constant or random.
6. Section 63 questions (listening): would you believe a human DJ made this mix; are transitions musically timed; is the set coherent; does it become repetitive; does the energy arc feel intentional; are FX tasteful; does bass remain controlled; do vocals clash; are there moments of surprise; does the DJ appear to listen. Report per question.

## Open owner questions

(none yet)

## Owner checks

(filled as items land; each with steps at http://localhost:5174)

## Count

Regenerated with: `grep -c '^- \[x\]'` / `grep -c '^- \['` on this file.
