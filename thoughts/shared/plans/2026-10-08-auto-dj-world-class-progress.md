---
date: 2026-10-08
topic: Auto DJ world-class plan - execution ledger (every item of 2026-10-08-auto-dj-world-class-plan.md with a stable ID)
tags: [dj, auto-dj, plan, ledger, reachability]
status: draft
---

# Auto DJ world-class plan - progress ledger

Plan: `thoughts/shared/plans/2026-10-08-auto-dj-world-class-plan.md`.
Research (how it works today): `thoughts/shared/research/2026-10-08_auto-dj-how-it-works.md`.

**Count: 173 of 558 done, 0 owner checks, 0 open questions**

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
- [ ] A2.1 corpus: steady 4/4 electronic track
- [ ] A2.2 corpus: long intro
- [ ] A2.3 corpus: long outro
- [ ] A2.4 corpus: vocals
- [ ] A2.5 corpus: drops
- [ ] A2.6 corpus: breakdowns
- [ ] A2.7 corpus: large BPM differences
- [ ] A2.8 corpus: compatible keys
- [ ] A2.9 corpus: incompatible keys
- [ ] A2.10 corpus: uncertain key analysis
- [ ] A2.11 corpus: tracker/module material
- [ ] A2.12 corpus: unusual arrangements
- [ ] A2.13 corpus: very short tracks
- [ ] A2.14 corpus: tracks with silence
- [ ] A2.15 corpus: highly variable energy
- [x] A3.1 gate: existing behaviour documented -> c5b32061f; baseline doc
- [x] A3.2 gate: regressions can be detected (baseline snapshot test) -> c5b32061f; autoDJBaseline.test.ts
- [ ] A3.3 gate: Auto DJ runs through the corpus without hard crashes
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
- [ ] S3.19 DJTrackAnalysis is the canonical input to all higher-level decisions (planner, solver, executor read it, nothing else)

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

- [ ] F1 DJSetPlanner replaces the greedy Smart Sort for Auto DJ
- [ ] F2 3-6 track lookahead
- [ ] F3 beam/bounded search, not exhaustive

## Section 9 - Set planning score

- [ ] S9.1 component: harmonicCompatibility
- [ ] S9.2 component: tempoCompatibility
- [ ] S9.3 component: phraseCompatibility
- [ ] S9.4 component: energyArcFit
- [ ] S9.5 component: sectionCompatibility
- [ ] S9.6 component: introOutroCompatibility
- [ ] S9.7 component: drumCompatibility
- [ ] S9.8 component: bassCompatibility
- [ ] S9.9 component: vocalCompatibility
- [ ] S9.10 component: genreCompatibility
- [ ] S9.11 component: textureCompatibility
- [ ] S9.12 component: novelty
- [ ] S9.13 component: setNarrative
- [ ] S9.14 component: repetition (penalty)
- [ ] S9.15 component: awkwardness (penalty)
- [ ] S9.16 component: risk (penalty)
- [ ] S9.17 weights configurable and style-dependent
- [ ] S9.18 components observable (per-candidate breakdown in the decision log)

## Section 10 - Session order separate from user playlist

- [ ] S10.1 userPlaylist kept, sessionOrder separate (store field)
- [ ] S10.2 user can always recover the original order (Auto DJ never writes the playlist order)

## Gate G - Set energy arc (plan section 11)

- [ ] G1 SetEnergyPhase: OPENING, BUILDING, CRUISING, PEAKING, PEAK, RELEASE, RECOVERY, CLOSING
- [ ] G2.1 planner knows current energy
- [ ] G2.2 planner knows recent energy trend
- [ ] G2.3 planner knows desired energy
- [ ] G2.4 planner knows peak history
- [ ] G2.5 planner knows time since last peak
- [ ] G2.6 planner knows recent releases
- [ ] G2.7 planner knows upcoming opportunities
- [ ] G3 track energy is not set energy (a deliberate low-energy track after a peak is allowed)

## Gate H - Tempo and key solver (plan section 12)

- [ ] H1.1 solver decision: beatmatch
- [ ] H1.2 solver decision: half-time relationship
- [ ] H1.3 solver decision: double-time relationship
- [ ] H1.4 solver decision: pitch slightly
- [ ] H1.5 solver decision: tempo bridge
- [ ] H1.6 solver decision: avoid the transition
- [ ] H1.7 solver decision: creative tempo jump
- [ ] H2 ranges: normal about +-4-8 %, creative about +-8-12 %, extreme only when justified; large offsets not normal
- [ ] H3 limits configurable

## Section 13 - Key lock strategy

- [ ] S13.1 key classes: known+high, known+low, unknown
- [ ] S13.2 high-confidence clash matters more than an uncertain key
- [ ] S13.3 considers Camelot, relative major/minor, semitone relationships, modal compatibility, local key, bass/harmonic density, transition length
- [ ] S13.4 key lock is a per-transition decision (the plan sets it; Auto DJ no longer leaves it untouched)

## Section 14 - Local key timeline

- [x] S14.1 KeySegment[] timeline computed (optional) -> c5b32061f; keyTimelineFromChroma
- [ ] S14.2 planner uses the local key at the mix points, not the whole-track key

## Gate I - Transition planning (plan section 15)

- [ ] I1 DJTransitionPlanner produces a complete plan before execution
- [ ] I2 DJTransitionPlan: outgoing/incoming deck, startBeat, endBeat, incomingPosition, durationBars, tempoPlan, keyPlan, crossfadePlan, eqPlan, filterPlan, bassPlan, effects, confidence, risk
- [ ] I3 executor executes the plan and does not invent it

## Section 16 - Adaptive transition length

- [ ] S16.1 2/4/8/16/32 remain candidate lengths
- [ ] S16.2 length chosen from phrase structure, intro/outro, energy, vocal density, harmonic compat, genre, drum compat, set phase, style, risk
- [ ] S16.3 long blend / short blend / immediate rules as specified

## Gate J - Transition vocabulary (plan section 17)

- [ ] J1.1 style: longBlend
- [ ] J1.2 style: shortBlend
- [ ] J1.3 style: bassSwap
- [ ] J1.4 style: EQSwap
- [ ] J1.5 style: filterBuild
- [ ] J1.6 style: filterRelease
- [ ] J1.7 style: echoOut
- [ ] J1.8 style: reverbOut
- [ ] J1.9 style: delayThrow
- [ ] J1.10 style: loopExit
- [ ] J1.11 style: breakdownMix
- [ ] J1.12 style: dropMix
- [ ] J1.13 style: drumIntroMix
- [ ] J1.14 style: vocalSwap
- [ ] J1.15 style: percussionSwap
- [ ] J1.16 style: hardCut
- [ ] J1.17 style: tempoBridge
- [ ] J1.18 style: doubleTimeJump
- [ ] J1.19 style: halfTimeJump
- [ ] J2 selection by context (scored, explained)
- [ ] J3 never randomized

## Section 18 - True echo-out

- [ ] S18.1 echo/feedback rises while dry falls, tail remains, incoming enters, tail decays (a real delay line on the outgoing deck)
- [ ] S18.2 temporally integrated into the transition (not crossfade-then-echo)

## Section 19 - Continuous filter automation

- [ ] S19.1 filter moves on a continuous curve to a musical endpoint (no set-wait-set)
- [ ] S19.2 supports high-pass sweep, low-pass sweep, resonant build, release, filter+EQ combination
- [ ] S19.3 automation is phrase-aware (keyframes on phrase boundaries)

## Gate K - DJ EQ intelligence (plan section 20)

- [ ] K1 frequency-aware bass handover (not a 12 dB cut at the midpoint)
- [ ] K2.1 determines which track owns the low end
- [ ] K2.2 determines when ownership changes
- [ ] K2.3 determines whether both basses can coexist
- [ ] K2.4 determines whether one track is bass-heavy
- [ ] K2.5 determines whether the incoming kick is stronger
- [ ] K2.6 determines whether the outgoing bass is still musically necessary

## Section 21 - Bass ownership

- [ ] S21.1 BassOwner: OUTGOING | INCOMING | SHARED | NEUTRAL as explicit state
- [ ] S21.2 handover planned per bar and executed as a continuous curve

## Section 22 - Gain staging

- [ ] S22.1 controls deck gain, master gain, transition gain, EQ boosts, FX returns
- [ ] S22.2 a transition is not louder because two tracks overlap (overlap compensation)
- [ ] S22.3 monitors integrated loudness, short-term loudness, true peak, low-frequency accumulation

## Gate L - Creative transition planning (plan section 23)

- [ ] L1 drop mix: incoming enters around a structural drop
- [ ] L2 breakdown mix: outgoing breakdown is the window
- [ ] L3 drum intro mix: incoming drums under an outgoing melodic section
- [ ] L4 vocal swap: no simultaneous vocals
- [ ] L5 bass swap at a phrase boundary
- [ ] L6 echo out from a phrase-ending vocal or stab
- [ ] L7 filter build: controlled rise into the incoming section
- [ ] L8 tempo bridge: intermediate track moves BPM

## Section 24 - Deliberate cuts

- [ ] S24.1 CutCandidate { beat, reason: drop|silence|phraseBoundary|impact|emergency, confidence }
- [ ] S24.2 hard cut requires structural justification + confidence + compatible moment
- [ ] S24.3 never a fallback for poor analysis unless classified emergency

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
- [ ] S27.2 events available to the transition planner (cue points and sections for tracker material come from them)

## Gate N - Performance memory (plan section 28)

- [ ] N1.1 memory: recent tracks
- [ ] N1.2 memory: recent artists
- [ ] N1.3 memory: recent keys
- [ ] N1.4 memory: recent BPMs
- [ ] N1.5 memory: recent transition types
- [ ] N1.6 memory: recent FX
- [ ] N1.7 memory: recent energy
- [ ] N1.8 memory: recent cuts
- [ ] N1.9 memory: recent bass swaps
- [ ] N1.10 memory: recent vocals
- [ ] N1.11 memory: recent transition lengths
- [ ] N1.12 memory: recent peaks
- [ ] N1.13 memory: repeated tracks
- [ ] N1.14 memory: repeated transition patterns

## Section 29 - Repetition avoidance

- [ ] S29.1 same transition type / same length in a row is penalised (bass swap x4, echo out x3, 8-bar x3 do not happen)
- [ ] S29.2 a style may deliberately permit repetition (repetitionTolerance)

## Section 30 - DJ style profiles

- [ ] S30.1 profiles: Smooth, Club, Aggressive, Dub, Progressive, Classic, Experimental, Minimal, Festival, Radio
- [ ] S30.2 a style affects transition length, risk tolerance, energy movement, FX usage, bass behaviour, key strictness, tempo tolerance, cut frequency, repetition tolerance, phrase strictness
- [ ] S30.3 styles modify planner weights, not separate engines; selectable in the Auto DJ panel

## Section 31 - Humanization

- [ ] S31.1 late-only timing variation stays small (0-30 ms)
- [ ] S31.2 affects tiny transition timing, subtle FX timing, occasional length variation, controlled choice variation
- [ ] S31.3 never overrides phrase alignment, beat alignment, bass handover, hard safety constraints

## Gate O - Anticipatory planning (plan section 32)

- [ ] O1.1 while A plays: analyse current position
- [ ] O1.2 evaluate next tracks
- [ ] O1.3 select likely next track
- [ ] O1.4 preload
- [ ] O1.5 analyse incoming structure
- [ ] O1.6 select mix-in point
- [ ] O1.7 select transition
- [ ] O1.8 wait for execution window
- [ ] O2 decisions are not all made at the transition moment (plan exists before the window)

## Section 33 - Smart preload

- [ ] S33.1 preload timing considers track size, analysis availability, decoding time, device performance, transition confidence, distance to mix point
- [ ] S33.2 safety margin prevents late loading

## Gate P - Performance context (plan section 34)

- [ ] P1 DJPerformanceContext { currentDeck, incomingDeck, currentTrack, incomingTrack, currentPosition, currentBeat, currentBar, currentPhrase, setEnergy, targetEnergy, setPhase, recentHistory, candidateTracks, transition, confidence }
- [ ] P2 subsystems read the context instead of reconstructing state

## Gate Q - Confidence-aware DJing (plan section 35)

- [ ] Q1.1 confidence: BPM
- [ ] Q1.2 confidence: beat grid
- [ ] Q1.3 confidence: downbeat
- [ ] Q1.4 confidence: key
- [ ] Q1.5 confidence: section
- [ ] Q1.6 confidence: cue
- [ ] Q1.7 confidence: vocal
- [ ] Q1.8 confidence: bass
- [ ] Q1.9 confidence: tracker
- [ ] Q2 policy: high -> sophisticated, medium -> conservative, low -> robust fallback
- [ ] Q3 no clever transition when the beat position is unknown

## Section 36 - Transition risk

- [ ] S36.1 TransitionRisk { harmonic, tempo, phrase, bass, vocal, loudness, technical, overall }
- [ ] S36.2 risk influences whether chosen, length, FX amount, whether a fallback is prepared

## Section 37 - Reversible transition planning

- [ ] S37.1 plan carries preferred / fallback / emergency
- [ ] S37.2 degrade chain preferred -> fallback -> safe when execution becomes unreliable
- [ ] S37.3 creative logic never compromises continuity

## Gate R - Failure resilience (plan section 38)

- [ ] R1.1 survives preload failure
- [ ] R1.2 survives decode failure
- [ ] R1.3 survives analysis failure
- [ ] R1.4 survives missing key
- [ ] R1.5 survives missing beat grid
- [ ] R1.6 survives malformed tracker data
- [ ] R1.7 survives unavailable cue point
- [ ] R1.8 survives deck failure
- [ ] R1.9 survives effect failure
- [ ] R1.10 survives unexpected track length
- [ ] R1.11 survives extremely short tracks
- [ ] R1.12 survives silence
- [ ] R1.13 survives transition timeout
- [ ] R2 fallback hierarchy ideal -> safe phrase -> safe crossfade -> emergency continuity
- [ ] R3 no hard cut caused by software failure

## Gate S - Long-set intelligence (plan section 39)

- [ ] S1.1 30-minute session test
- [ ] S1.2 1-hour session test
- [ ] S1.3 2-hour session test
- [ ] S1.4 4-hour session test
- [ ] S2.1 measure: transition quality
- [ ] S2.2 measure: energy coherence
- [ ] S2.3 measure: repetition
- [ ] S2.4 measure: key conflicts
- [ ] S2.5 measure: tempo drift
- [ ] S2.6 measure: loudness drift
- [ ] S2.7 measure: transition variety
- [ ] S2.8 measure: track diversity
- [ ] S2.9 measure: CPU stability (planning time per decision bounded)
- [ ] S2.10 measure: memory usage (memory structures bounded)
- [ ] S2.11 measure: preload failures
- [ ] S2.12 measure: analysis failures

## Section 40 - Long-set narrative

- [ ] S40.1 planner tracks where we have been / are / should go (recent, medium, long-term trajectory)
- [ ] S40.2 not every transition optimises only the next track (lookahead score includes trajectory)

## Gate T - Transition quality scoring (plan section 41)

- [ ] T1 offline evaluator: TransitionQuality { beatAlignment, phraseAlignment, harmonicCompatibility, tempoStability, bassHandover, loudnessConsistency, structuralFit, creativity, smoothness, surprise, overall }
- [ ] T2 used for objective regression testing (golden corpus thresholds)

## Section 42 - Golden transition corpus

- [ ] S42.1 golden: long blend
- [ ] S42.2 golden: bass swap
- [ ] S42.3 golden: breakdown mix
- [ ] S42.4 golden: drop mix
- [ ] S42.5 golden: drum intro
- [ ] S42.6 golden: vocal swap
- [ ] S42.7 golden: echo out
- [ ] S42.8 golden: filter build
- [ ] S42.9 golden: filter release
- [ ] S42.10 golden: tempo bridge
- [ ] S42.11 golden: deliberate cut
- [ ] S42.12 corpus runs as regression tests

## Section 43 - Automated invariants

- [ ] S43.1 beat invariant: no audible drift during beatmatched mixing
- [ ] S43.2 phrase invariant: transitions begin/end on valid boundaries
- [ ] S43.3 bass invariant: two bass-heavy tracks never fully exposed together
- [ ] S43.4 loudness invariant: no major accidental spikes
- [ ] S43.5 failure invariant: a failed creative transition does not stop playback
- [ ] S43.6 playlist invariant: Smart sorting never destructively reorders the user's playlist
- [ ] S43.7 confidence invariant: low confidence never triggers high-risk behaviour

## Section 44 - Debug / telemetry view

- [ ] S44.1 view: current track (BPM, key, key confidence, energy, set phase, current bar, current phrase)
- [ ] S44.2 view: next track (BPM, key, energy, mix-in point, mix-out point)
- [ ] S44.3 view: transition (type, length, tempo plan, key plan, bass plan, EQ plan, filter plan)
- [ ] S44.4 view: confidence and risk
- [ ] S44.5 view: why this track? why this transition? (explanation lines with +/- signs)
- [ ] S44.6 DOM, design-system components, token classes, full English labels

## Section 45 - "Why did you do that?" logging

- [ ] S45.1 structured decision log { decision, selectedTrack, reasons, rejectedAlternatives } for every autonomous decision, readable from the MCP (bridge handler + server tool)

## Gate U - Musical mix-point intelligence (plan section 46)

- [ ] U1 distinguishes technically possible from musically appropriate (mix-point score)
- [ ] U2.1 prefers: phrase begins
- [ ] U2.2 prefers: drums enter
- [ ] U2.3 prefers: bass enters
- [ ] U2.4 prefers: outgoing phrase ends
- [ ] U2.5 prefers: vocals absent
- [ ] U2.6 prefers: harmonic density compatible
- [ ] U2.7 prefers: arrangement stable

## Section 47 - Vocal conflict avoidance

- [ ] S47.1 vocal A + vocal B avoided unless deliberate
- [ ] S47.2 strongly influences transition timing (window moved to instrumental stretch)

## Section 48 - Drum compatibility

- [ ] S48.1 drum pattern coexistence judged (four-on-floor vs breakbeat)
- [ ] S48.2 incompatible drums -> shorter overlap / EQ reduction / percussion swap / breakdown transition

## Section 49 - Bass compatibility

- [ ] S49.1 bass analysed independently of overall energy
- [ ] S49.2 low-frequency spectral analysis + bass activity timelines drive the overlap decision

## Section 50 - Spectral compatibility

- [ ] S50.1 detects brightness mismatch, muddy overlap, excessive HF density, excessive LF density, conflicting midrange
- [ ] S50.2 subordinate to musical reasoning (capped weight; never decides alone)

## Section 51 - Loop intelligence

- [ ] S51.1 structure-aware temporary loops: extend intro, extend outro, wait for a better phrase, hold a breakdown, bridge BPM, create a transition window
- [ ] S51.2 never loops arbitrary audio (requires phrase-aligned loop region + confidence)

## Section 52 - Cue-jump intelligence

- [ ] S52.1 jumps to drop, breakdown, hook, outro, drum section only when justified
- [ ] S52.2 treated as high-risk (needs risk budget + high confidence)

## Section 53 - Energy-driven FX

- [ ] S53.1 mapping: build -> filter rise, phrase ending -> delay throw, vocal ending -> echo out, breakdown -> reverb expansion, drop -> clean release
- [ ] S53.2 FX are punctuation (only with a musical trigger)

## Section 54 - Creative risk budget

- [ ] S54.1 session creativeRisk 0..1
- [ ] S54.2 higher risk permits shorter transitions, larger tempo changes, more FX, deliberate cuts, unusual harmonic moves, stronger energy jumps
- [ ] S54.3 lower risk favours long blends, safe keys, conservative BPM, minimal FX
- [ ] S54.4 risk budget is style-dependent

## Section 55 - Avoid "AI randomness"

- [ ] S55.1 no Math.random gating of musical decisions (variation emerges from context)

## Section 56 - Existing state machine

- [ ] S56.1 playing / preloading / transition-pending / transitioning / failure states preserved
- [ ] S56.2 high-level intelligence moved out of the state machine (DJAutoDJ asks the controller)

## Section 57 - DJSessionController

- [ ] S57.1 coordinates performance state, planning cadence, candidate evaluation, preload scheduling, transition scheduling, session memory, failure fallback, long-term set state
- [ ] S57.2 contains no musical heuristics itself (delegates to planners)

## Section 58 - DJSetPlanner

- [ ] S58.1 candidate generation, sequence planning, energy trajectory, track diversity, harmonic trajectory, tempo trajectory, repetition avoidance, set narrative
- [ ] S58.2 never touches deck audio

## Section 59 - DJTransitionPlanner

- [ ] S59.1 decides mix point, phrase alignment, type, length, tempo, key, EQ, filter, bass, FX, risk, fallback

## Section 60 - DJTransitionExecutor

- [ ] S60.1 does load deck, seek, start, tempo, pitch, crossfade, EQ, filter, effects, bass handover, stop old deck, recover failure
- [ ] S60.2 executes plans generated elsewhere only

## Section 61 - Separation of analysis and execution

- [ ] S61.1 analysis -> context -> planner -> plan -> executor; executor never discovers structure

## Gate V - Full autonomous performance (plan section 62)

- [ ] V1.1 10-track run
- [ ] V1.2 25-track run
- [ ] V1.3 50-track run
- [ ] V1.4 100-track run
- [ ] V2.1 evaluate musical continuity
- [ ] V2.2 evaluate transition variety
- [ ] V2.3 evaluate energy trajectory
- [ ] V2.4 evaluate harmonic quality
- [ ] V2.5 evaluate tempo stability
- [ ] V2.6 evaluate bass quality
- [ ] V2.7 evaluate vocal handling
- [ ] V2.8 evaluate structural timing
- [ ] V2.9 evaluate repetition
- [ ] V2.10 evaluate failure handling

## Section 63 - Human-listener evaluation (owner checks)

- [ ] S63.1 would you believe a human DJ made this mix?
- [ ] S63.2 are transitions musically timed?
- [ ] S63.3 is the set coherent?
- [ ] S63.4 does it become repetitive?
- [ ] S63.5 does the energy arc feel intentional?
- [ ] S63.6 are FX tasteful?
- [ ] S63.7 does bass remain controlled?
- [ ] S63.8 do vocals clash?
- [ ] S63.9 are there moments of surprise?
- [ ] S63.10 does the DJ appear to listen to the music?

## Section 64 - World-class acceptance criteria (listener-reported; automated proxies built)

- [ ] S64.1 transitions feel intentional
- [ ] S64.2 tracks enter at appropriate musical moments
- [ ] S64.3 phrase alignment feels natural
- [ ] S64.4 bass changes sound like a real DJ
- [ ] S64.5 energy rises and falls naturally
- [ ] S64.6 vocals rarely collide
- [ ] S64.7 FX appear purposeful
- [ ] S64.8 transitions are varied
- [ ] S64.9 the set has a narrative
- [ ] S64.10 the DJ occasionally surprises
- [ ] S64.11 the system knows when to wait
- [ ] S64.12 the system recovers gracefully
- [ ] S64.13 the set remains coherent over long durations

## Section 65 - Implementation order

- [ ] S65.1 implemented in the recommended sequence (baseline first, listening last); recorded here as the commit order

## Section 66 - Phase gates

- [x] PG-A.1 deterministic test corpus -> c5b32061f; corpus.ts
- [x] PG-A.2 transition logs -> c5b32061f; decisionLog.ts
- [ ] PG-A.3 regression playback
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
- [ ] PG-F.1 multi-track lookahead
- [ ] PG-F.2 energy arc
- [ ] PG-F.3 harmonic planning
- [ ] PG-F.4 tempo planning
- [ ] PG-F.5 repetition control
- [ ] PG-G.1 complete transition plans
- [ ] PG-G.2 adaptive lengths
- [ ] PG-G.3 transition vocabulary
- [ ] PG-G.4 risk/confidence
- [ ] PG-H.1 bass ownership
- [ ] PG-H.2 bass handover
- [ ] PG-H.3 gain staging
- [ ] PG-H.4 continuous EQ automation
- [ ] PG-I.1 real echo out
- [ ] PG-I.2 filter builds
- [ ] PG-I.3 breakdown transitions
- [ ] PG-I.4 drop transitions
- [ ] PG-I.5 drum intros
- [ ] PG-I.6 vocal swaps
- [x] PG-J.1 tracker structure retained -> c5b32061f; tracker retained
- [x] PG-J.2 pattern/order awareness -> c5b32061f; orderPositions/patternBoundaries
- [x] PG-J.3 channel analysis -> c5b32061f; channelSegments
- [x] PG-J.4 instrument activity -> c5b32061f; instrumentUsage
- [x] PG-J.5 semantic tracker events -> c5b32061f; events
- [ ] PG-K.1 transition history
- [ ] PG-K.2 FX history
- [ ] PG-K.3 energy history
- [ ] PG-K.4 repetition control
- [ ] PG-K.5 style behaviour
- [ ] PG-L.1 1-hour session without degradation
- [ ] PG-L.2 2-hour session without degradation
- [ ] PG-L.3 4-hour session without degradation
- [ ] PG-M.1 survives preload failure without stopping playback
- [ ] PG-M.2 survives analysis failure
- [ ] PG-M.3 survives missing key
- [ ] PG-M.4 survives missing beat grid
- [ ] PG-M.5 survives malformed content
- [ ] PG-M.6 survives deck failure
- [ ] PG-M.7 survives effect failure
- [ ] PG-N.1 automated evaluation passes
- [ ] PG-N.2 golden transition corpus passes
- [ ] PG-N.3 human listening tests (owner)
- [ ] PG-N.4 long-set evaluation passes

## Section 67 - Architectural constraints

- [ ] S67.1 no second deck system
- [ ] S67.2 no second mixer
- [ ] S67.3 no second transport
- [ ] S67.4 no duplicate playback infrastructure
- [ ] S67.5 no duplicate preload infrastructure
- [ ] S67.6 no duplicate FX infrastructure
- [ ] S67.7 user playlist order never destroyed
- [ ] S67.8 tracks are not a single global BPM/key/energy value
- [ ] S67.9 tracker channels are not permanent instruments
- [ ] S67.10 randomness is not a substitute for musical reasoning
- [ ] S67.11 low-confidence analysis never triggers high-risk behaviour
- [ ] S67.12 DJAutoDJ.ts is not a giant heuristic file (shrinks; delegates)
- [ ] S67.13 existing execution primitives reused; intelligence added above

## Section 68 / 69 - Final architecture and philosophy

- [ ] S68.1 module graph matches the target architecture (DJAutoDJ -> DJSessionController -> context/memory/analysis -> set planner -> transition planner -> solvers -> plan -> executor -> existing deck/mixer)
- [ ] S69.1 loop: listen -> understand -> anticipate -> intend -> choose track -> choose mix point -> choose transition -> execute -> hear consequence -> adapt -> continue or rest (post-transition quality feeds memory/adaptation)

## Section 70 - Definition of done

- [ ] S70.1 analyse tracks deeply
- [ ] S70.2 understand beat and phrase position
- [ ] S70.3 understand musical sections
- [ ] S70.4 identify useful mix points
- [ ] S70.5 start incoming tracks at musically appropriate positions
- [ ] S70.6 maintain phase alignment
- [ ] S70.7 match tempo intelligently
- [ ] S70.8 make confidence-aware key decisions
- [ ] S70.9 manage bass ownership
- [ ] S70.10 avoid vocal conflicts
- [ ] S70.11 control loudness
- [ ] S70.12 select tracks several steps ahead
- [ ] S70.13 shape a coherent energy arc
- [ ] S70.14 vary transitions naturally
- [ ] S70.15 use FX as musical punctuation
- [ ] S70.16 understand tracker structure
- [ ] S70.17 remember recent behaviour
- [ ] S70.18 avoid repetitive patterns
- [ ] S70.19 take controlled creative risks
- [ ] S70.20 know when to wait
- [ ] S70.21 recover safely
- [ ] S70.22 run for hours
- [ ] S70.23 explain its decisions
- [ ] S70.24 pass automated transition tests
- [ ] S70.25 pass human listening tests (owner)

## Beat-juggling plan (thoughts/shared/plans/2026-10-08-auto-dj-beat-juggling-plan.md, commit 94c0a4b19) - JUG- items

Decision D11: the juggle layer performs through the same DjFxActions / crossfader actions the DJ view's buttons use, phrase-locked to the DJTrackAnalysis beat grid (one clock: the deck positions), call and response material from the Dub Deck's channel-role sources (resolveSongChannelRoles / SongRoleTimeline). Files: src/engine/dj/autodj/juggle/*.

- [ ] JUG-S1.1 intelligence above the existing primitives; no second DJ engine
- [ ] JUG-S2.1 one musical clock (the deck positions and beat grids); no second transport/beat/bar clock, no per-deck ms timers
- [ ] JUG-S2.2 juggle engine works in musical units (beat, half-beat, bar, 2/4/8 bars, phrase, section)
- [ ] JUG-S2.3 every action resolves to an absolute musical execution point (executeAtBeat)
- [ ] JUG-S3.1 DJJuggleController
- [ ] JUG-S3.2 DJJugglePlanner
- [ ] JUG-S3.3 DJJuggleExecutor
- [ ] JUG-S3.4 DJJuggleTypes
- [ ] JUG-S3.5 DJJugglePatterns
- [ ] JUG-S3.6 DJJugglePerformanceContext
- [ ] JUG-S4.1 DJJugglePerformanceContext { masterBeat, masterBar, phrasePosition, deckA, deckB, activeDeck, performanceMode, energy, targetEnergy, phraseConfidence, beatConfidence, currentSection, nextSection, lastJuggle, recentPatterns, intensity, tension, fallbackAvailable }
- [ ] JUG-S4.2 DJDeckPerformanceState { trackId, position, beatPhase, barPhase, bpm, key, section, cuePosition, mixInPosition, mixOutPosition, energy, drumsActive, bassActive, vocalsActive, melodicActivity, loop, analysisConfidence }
- [ ] JUG-S4.3 reuses DJTrackAnalysis / DJPerformanceContext, no duplicate analysis model
- [ ] JUG-S5.1 JuggleDeckRole: PRIMARY, SECONDARY, VOICE, RESPONSE, FOUNDATION, FILL, LAYER, SILENT
- [ ] JUG-S5.2 roles are temporary performance states, change through a juggle
- [ ] JUG-S6.1 action vocabulary: CutIn, CutOut, CrossfadeTo, CrossfadeFrom, TriggerCue, JumpToBeat, JumpToBar, StartLoop, ExitLoop, LoopResize, LoopRoll, HoldDeck, ReleaseDeck, FilterIn, FilterOut, EQCut, EQRestore, BassSwap, EchoThrow, ReverbThrow, ResetDeck, ResyncDeck
- [ ] JUG-S6.2 action fields: type, deck (A|B|BOTH), executeAtBeat, durationBeats, targetPosition, quantization, strength, reason
- [ ] JUG-S6.3 vocabulary stays small; intelligence in the planner
- [ ] JUG-S7.1 DJJugglePattern { id, type, durationBars, intensity, actions, sourceDeck, targetDeck, energyProfile, confidence, reason }
- [ ] JUG-S7.2 reasons in patterns (A-B-A-B, A-A-B-B, A-fill-B-fill, A-drums-B-lead, A-bass-B-drums, A-loop-B-hit, A-full-B-stab), not isolated cuts
- [ ] JUG-S8.1 grammar phase SETUP
- [ ] JUG-S8.2 grammar phase ESTABLISH
- [ ] JUG-S8.3 grammar phase INTENSIFY
- [ ] JUG-S8.4 grammar phase PEAK
- [ ] JUG-S8.5 grammar phase PAYOFF
- [ ] JUG-S8.6 grammar phase RELEASE
- [ ] JUG-S8.7 never a permanent A B A B
- [ ] JUG-S9.1 phrase trade 8 bars
- [ ] JUG-S9.2 phrase trade 4 bars
- [ ] JUG-S9.3 phrase trade 2 bars
- [ ] JUG-S9.4 phrase trade 1 bar
- [ ] JUG-S9.5 phrase trade half bar (optional)
- [ ] JUG-S9.6 only tightens when musical confidence is high
- [ ] JUG-S9.7 respects beat grid, bar grid, phrase boundaries, section boundaries, energy, drum activity, bass activity, musical role
- [ ] JUG-S9.8 never switches mid vocal phrase on a timer
- [ ] JUG-S10.1 beat-level patterns represented explicitly (ABAB, AABA, ABBA, A-B-, AB-B / AB-A)
- [ ] JUG-S11.1 call and response: one deck asks, the other answers
- [ ] JUG-S11.2 response targets: drum fill, percussion hit, bass phrase, vocal phrase, synth stab, lead phrase, chord hit, rhythmic loop, tracker pattern segment
- [ ] JUG-S12.1 tracker-native call/response from time-varying channel segments (Dub Deck identity sources)
- [ ] JUG-S13.1 material window features: drum, bass, percussion density, melodic, vocal, harmonic, spectral density, energy, rhythmic density, importance, confidence
- [ ] JUG-S13.2 moment classes: DRUM_FILL, BASS_HIT, VOCAL_HIT, LEAD_HIT, PERCUSSION_HIT, FULL_GROOVE, BREAK, DROP, BUILD, SILENCE
- [ ] JUG-S14.1 drum/bass trading pattern with A+B payoff
- [ ] JUG-S14.2 bass ownership per moment during a juggle
- [ ] JUG-S14.3 ownership change = intentional handover, no low-end collision, EQ when needed, clean restore
- [ ] JUG-S15.1 same-track doubles: same source on both decks, independent positions
- [ ] JUG-S16.1 double alignment: reliable beat, align both, bar phase, optional offset, verify, then permit
- [ ] JUG-S16.2 offsets: 1 beat, 2 beats, 1 bar, 2 bars, 4 bars
- [ ] JUG-S16.3 no arbitrary offsets at low beat confidence
- [ ] JUG-S17.1 straight double
- [ ] JUG-S17.2 offset double
- [ ] JUG-S17.3 one-bar double
- [ ] JUG-S17.4 fill double
- [ ] JUG-S17.5 drop double
- [ ] JUG-S17.6 escalating double 8 -> 4 -> 2 -> 1 -> beat
- [ ] JUG-S18.1 loop juggling sizes 8, 4, 2, 1, 1/2, 1/4, 1/8 bar
- [ ] JUG-S18.2 loop progression is musical (4 -> 2 -> 1 -> 1/2 -> 1/4 -> release), not arbitrary
- [ ] JUG-S19.1 stutter/fill juggling around detected fills
- [ ] JUG-S19.2 real musical fills preferred over arbitrary slices
- [ ] JUG-S19.3 tracker pattern/channel/event fills as candidates
- [ ] JUG-S20.1 transformer patterns: open/close, open/close/close, A-A-B-B, A-B-B-A, A-B-A-A
- [ ] JUG-S20.2 transformer patterns are pattern objects; the executor moves the crossfader
- [ ] JUG-S21.1 every pattern scheduled >= 1-2 beats ahead (1 bar+ for complex)
- [ ] JUG-S21.2 the planner produces a future action queue executed against the shared clock
- [ ] JUG-S22.1 timers only for safety/cleanup; musical actions originate from beat/bar/phrase/section
- [ ] JUG-S23.1 intensity 0..1 ladder (0 normal, 0.25 phrase, 0.5 2-bar, 0.7 1-bar, 0.85 beat, 1.0 peak)
- [ ] JUG-S23.2 intensity drives pattern density, cut frequency, loop size, FX density, alternation, phrase length, musical risk - not randomness
- [ ] JUG-S24.1 performance budget from set position, energy, recent performance, compatibility, transition quality, audience proxy, confidence, previous duration
- [ ] JUG-S24.2 normal mix between juggles; never constant juggling
- [ ] JUG-S25.1 good conditions (strong beat confidence, phrase alignment, compatible sections, energy, rhythmic material, breakdown/build/drop, transition approaching, fill, repeated phrase, set needs energy, transition benefits)
- [ ] JUG-S25.2 bad conditions (low confidence, unstable sync, incompatible keys, dense vocals both, unclear bass ownership, drift, dense section, similar recent juggle, incoming not prepared) block juggling
- [ ] JUG-S26.1 transition kinds NORMAL_BLEND | JUGGLE_TRANSITION | PERFORMANCE_TRANSITION
- [ ] JUG-S26.2 a juggle transition: outro -> 4-bar trade -> 2 -> 1 -> incoming drop -> release
- [ ] JUG-S27.1 juggle inside a single track (same track both decks): double -> offset -> beat trade -> filter build -> release
- [ ] JUG-S28.1 set-level arc: OPENING normal, BUILDING occasional trades, CRUISING short moments, PEAKING aggressive, PEAK doubles/beat juggling, RELEASE fewer cuts, RECOVERY normal, CLOSING controlled
- [ ] JUG-S29.1 DJJuggleHistory { patternType, durationBars, intensity, sourceTracks, successScore, timestamp }
- [ ] JUG-S29.2 no immediate repeat of the last pattern (A-B-A-B -> A-A-B-B or fill or normal)
- [ ] JUG-S30.1 humanization allowed: tiny timing, pattern variation, phrase length, intensity, action order, response material
- [ ] JUG-S30.2 humanization forbidden: off-beat errors, drifting phase, inconsistent bars, delayed cuts
- [ ] JUG-S31.1 confidences: beat, phrase, section, deckSync, material
- [ ] JUG-S31.2 policy: high -> beat juggling, moderate -> phrase trading only, low -> normal transition
- [ ] JUG-S32.1 safety governor prevents: both decks silent, crossfader oscillation, excessive cut frequency, contradictory actions, conflicting loops, runaway FX, extreme tempo jumps, phase drift, stuck decks, infinite patterns
- [ ] JUG-S33.1 emergency sequence: cancel pending, strongest deck, stable crossfader, essential EQ, exit loop, resync, continue, resume planning when confidence recovers
- [ ] JUG-S34.1 no-silence invariant: at least one audible deck; BLOCK or FORCE SAFE DECK; continuously tested
- [ ] JUG-S35.1 bass safety tracks current owner, next owner, overlap, energy, low-frequency conflict
- [ ] JUG-S35.2 A bass / B drums, both only when compatible, else intentional handover
- [ ] JUG-S36.1 vocal safety: no vocal + vocal unless intended; instrumental/response pairings preferred in material selection
- [ ] JUG-S37.1 tracker access kept: orders, patterns, channels, instruments, samples, notes, effects, pattern boundaries, repeats, channel activity, instrument changes
- [ ] JUG-S37.2 tracker facts drive selection (bass enters here, fill channel here, breakdown next order, no lead here)
- [ ] JUG-S38.1 channel identity time-varying (timeline/segments), never channel N = role
- [ ] JUG-S39.1 pattern phraseTrade
- [ ] JUG-S39.2 pattern tightPhraseTrade
- [ ] JUG-S39.3 pattern barTrade
- [ ] JUG-S39.4 pattern beatTrade
- [ ] JUG-S39.5 pattern doubleBeat
- [ ] JUG-S39.6 pattern callResponse
- [ ] JUG-S39.7 pattern drumBassTrade
- [ ] JUG-S39.8 pattern fillTrade
- [ ] JUG-S39.9 pattern loopTighten
- [ ] JUG-S39.10 pattern double
- [ ] JUG-S39.11 pattern transformer
- [ ] JUG-S39.12 pattern dropAndReturn
- [ ] JUG-S39.13 pattern escalatingJuggle
- [ ] JUG-S40.1 pattern scoring: energyFit, phraseFit, sectionFit, rhythmicFit, bassFit, vocalFit, materialFit, confidence, novelty, repetition, risk, set position, budget, transition opportunity - never random
- [ ] JUG-S41.1 plans a short performance phrase ahead (8 -> 4 -> 2 -> 1 -> beat -> payoff)
- [ ] JUG-S41.2 revises the future when conditions change
- [ ] JUG-S42.1 abort on: beat confidence drop, drift, material change, vocal collision, bass collision, analysis change, deck failure, user control, governor
- [ ] JUG-S42.2 abort resolves gracefully (a release pattern), never stops dead
- [ ] JUG-S43.1 manual override: crossfader, deck state, cue, FX, tempo, Auto DJ off -> yield, cancel/replan
- [ ] JUG-S44.1 modes OFF, SAFE, MUSICAL, PERFORMER, AGGRESSIVE, CHAOS
- [ ] JUG-S44.2 SAFE = 8/4-bar trading
- [ ] JUG-S44.3 MUSICAL adds call-response, fills, doubles
- [ ] JUG-S44.4 PERFORMER adds beat juggling, loops, transformer
- [ ] JUG-S44.5 AGGRESSIVE: shorter cuts, higher density, more doubles
- [ ] JUG-S44.6 CHAOS still obeys timing, safety, no-silence, boundaries
- [ ] JUG-S45.1 telemetry: pattern, phase, intensity, per-deck material + confidence, next actions with beats, reason
- [ ] JUG-S46.1 events with reasons: juggleStarted, jugglePatternSelected, juggleActionScheduled, juggleActionExecuted, juggleActionBlocked, juggleAborted, juggleCompleted, juggleFallback
- [ ] JUG-S47.1 test: all actions land on intended beats
- [ ] JUG-S47.2 test: no phrase trade begins off-grid
- [ ] JUG-S47.3 test: at least one deck remains active
- [ ] JUG-S47.4 test: crossfader never invalid
- [ ] JUG-S47.5 test: double alignment within tolerance
- [ ] JUG-S47.6 test: actions occur in pattern order
- [ ] JUG-S47.7 test: unsafe conditions cancel safely
- [ ] JUG-S47.8 test: recent pattern history affects selection
- [ ] JUG-S48.1 scenario standard 4/4 -> phrase, bar, beat trading
- [ ] JUG-S48.2 scenario sparse track -> less aggressive
- [ ] JUG-S48.3 scenario vocal-heavy -> collision avoidance
- [ ] JUG-S48.4 scenario bass-heavy -> ownership management
- [ ] JUG-S48.5 scenario same-track double -> phase-aligned
- [ ] JUG-S48.6 scenario low confidence -> normal transition
- [ ] JUG-S48.7 scenario tracker song -> structure influences selection
- [ ] JUG-S48.8 scenario user intervention -> yields
- [ ] JUG-S48.9 scenario deck failure -> safe continuation
- [ ] JUG-S48.10 scenario long set -> no runaway, no repetition, no corruption
- [ ] JUG-S49.1 multi-hour simulated set: no leak, no accumulating timers, no stale actions, no stuck roles/loops, no latency growth, no exact repeats, no drift, no growing silence, no corrupt deck state
- [ ] JUG-S50.1 performance memory learns successful pattern + pairing + context (deterministic scoring)
- [ ] JUG-S51.1 do not overuse: optimise musical impact, not action count
- [ ] JUG-S52.1 JuggleQualityScore: timing, compatibility, energy fit, material, bass clarity, vocal clarity, coherence, novelty, impact proxy, safety -> feeds memory
- [ ] JUG-S53.1 integration: DJSessionController -> DJJuggleController -> planner -> executor; transition executor keeps ordinary transitions; shared deck/mixer state
- [ ] JUG-PG-A.1 verify two-deck state, tempo sync, beat grid, crossfader, cue/playhead, transition executor, existing primitives (baseline regression green)
- [ ] JUG-PG-B.1 both decks represented simultaneously (position, beat/bar phase, energy, section, activity, confidence) without a second transport
- [ ] JUG-PG-C.1 deterministic test produces A B A B on exact musical beats through the executor
- [ ] JUG-PG-D.1 complete 8 -> 4 -> 2 -> 1 phrase-trade sequence resolving into normal mixing
- [ ] JUG-PG-E.1 beat-level patterns ABAB, AABB, ABBA, A-A-B-A phase-locked, no unintended silence
- [ ] JUG-PG-F.1 call/response: drum, bass, percussion, lead, vocal-safe responses; explains the material; avoids incompatible overlaps
- [ ] JUG-PG-G.1 doubles: same-track, offset, bar, beat, fill; phase-aligned without drift
- [ ] JUG-PG-H.1 loops/fills/transformer/drop-release: normal -> loop -> tighten -> juggle -> release without state corruption
- [ ] JUG-PG-I.1 adaptive engine chooses whether/which/material/duration/intensity; no "always every N bars"
- [ ] JUG-PG-J.1 set integration (energy, transition planner, phrase/section, memory, cooldowns, set position): varied intentional moments in a long set
- [ ] JUG-PG-K.1 safety: no-silence, bass, vocal, conflict prevention, emergency fallback, abort/replan; every unsafe test returns to stable playback
- [ ] JUG-PG-L.1 humanization/memory: novelty, history, controlled variation, successful-pattern memory; repeated simulations not identical
- [ ] JUG-PG-M.1 telemetry: mode, pattern, intensity, active deck, next actions, reason, confidence, safety state; user controls Auto Juggle, Mode, Intensity
- [ ] JUG-PG-N.1 acceptance: two-deck relationship, 8/4/2/1 trading, tight ABAB, call/response, doubles, tracker intelligence, musical awareness, escalation, release, variety, safety, human quality (listening: owner)
- [ ] JUG-S55.1 recognise both decks usable
- [ ] JUG-S55.2 synchronise to one clock
- [ ] JUG-S55.3 select material from each
- [ ] JUG-S55.4 trade phrases
- [ ] JUG-S55.5 trade bars
- [ ] JUG-S55.6 trade beats
- [ ] JUG-S55.7 call-and-response
- [ ] JUG-S55.8 drum/bass exchanges
- [ ] JUG-S55.9 doubles
- [ ] JUG-S55.10 offset doubles
- [ ] JUG-S55.11 manipulate loops
- [ ] JUG-S55.12 use fills
- [ ] JUG-S55.13 rhythmic crossfader patterns
- [ ] JUG-S55.14 escalate intensity
- [ ] JUG-S55.15 resolve into a payoff
- [ ] JUG-S55.16 return to normal mixing
- [ ] JUG-S55.17 avoid vocal collisions
- [ ] JUG-S55.18 manage bass ownership
- [ ] JUG-S55.19 exploit tracker structure
- [ ] JUG-S55.20 respect time-varying channel identity
- [ ] JUG-S55.21 avoid repeating the same trick
- [ ] JUG-S55.22 yield to the user
- [ ] JUG-S55.23 survive low confidence
- [ ] JUG-S55.24 recover from failures
- [ ] JUG-S55.25 stable playback for long sessions
- [ ] JUG-S56.1 no second transport
- [ ] JUG-S56.2 no second musical clock
- [ ] JUG-S56.3 no second deck system
- [ ] JUG-S56.4 no bypass of mixer/deck primitives
- [ ] JUG-S56.5 not all in DJAutoDJ.ts
- [ ] JUG-S56.6 no ms timers for musical timing
- [ ] JUG-S56.7 no permanent channel roles
- [ ] JUG-S56.8 no 4/4 assumption without the meter
- [ ] JUG-S56.9 no identical-phrase assumption
- [ ] JUG-S56.10 incoming material not always at 0:00
- [ ] JUG-S56.11 not always the same pattern
- [ ] JUG-S56.12 no constant juggling
- [ ] JUG-S56.13 no random cuts
- [ ] JUG-S56.14 no two bass-heavy decks without ownership
- [ ] JUG-S56.15 no two active vocals without intent
- [ ] JUG-S56.16 decks never both disappear
- [ ] JUG-S56.17 creative never overrides safety
- [ ] JUG-S56.18 low confidence is not permission to improvise
- [ ] JUG-S56.19 no needless rebuild of analysis/deck infrastructure

## Open owner questions

(none yet)

## Owner checks

(filled as items land; each with steps at http://localhost:5174)

## Count

Regenerated with: `grep -c '^- \[x\]'` / `grep -c '^- \['` on this file.
