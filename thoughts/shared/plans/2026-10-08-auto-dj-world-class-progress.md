---
date: 2026-10-08
topic: Auto DJ world-class plan - execution ledger (every item of 2026-10-08-auto-dj-world-class-plan.md with a stable ID)
tags: [dj, auto-dj, plan, ledger, reachability]
status: draft
---

# Auto DJ world-class plan - progress ledger

Plan: `thoughts/shared/plans/2026-10-08-auto-dj-world-class-plan.md`.
Research (how it works today): `thoughts/shared/research/2026-10-08_auto-dj-how-it-works.md`.

**Count: 0 of 558 done, 0 owner checks, 0 open questions**

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

## Gate A - Baseline lock (plan section 2)

- [ ] A1.1 baseline: playlist order documented
- [ ] A1.2 baseline: Smart Sort behaviour documented
- [ ] A1.3 baseline: deck transitions documented
- [ ] A1.4 baseline: preload behaviour documented
- [ ] A1.5 baseline: transition lengths documented
- [ ] A1.6 baseline: crossfader behaviour documented
- [ ] A1.7 baseline: tempo matching documented
- [ ] A1.8 baseline: pitch behaviour documented
- [ ] A1.9 baseline: key handling documented
- [ ] A1.10 baseline: filter transitions documented
- [ ] A1.11 baseline: bass swap documented
- [ ] A1.12 baseline: echo-out documented
- [ ] A1.13 baseline: failure recovery documented
- [ ] A1.14 baseline: shuffle documented
- [ ] A1.15 baseline: auto pause documented
- [ ] A1.16 baseline: transition timing documented
- [ ] A1.17 baseline: current humanization documented
- [ ] A1.18 baseline: current analysis values documented
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
- [ ] A3.1 gate: existing behaviour documented
- [ ] A3.2 gate: regressions can be detected (baseline snapshot test)
- [ ] A3.3 gate: Auto DJ runs through the corpus without hard crashes
- [ ] A3.4 gate: transition logs can be captured

## Section 3 - Unified DJTrackAnalysis

- [ ] S3.1 bpm + bpmConfidence
- [ ] S3.2 beatGrid: BeatGrid
- [ ] S3.3 downbeats: DownbeatGrid
- [ ] S3.4 meter: MeterAnalysis
- [ ] S3.5 key + keyConfidence + keyTimeline
- [ ] S3.6 tuning: TuningAnalysis
- [ ] S3.7 loudness: LoudnessAnalysis
- [ ] S3.8 energy: EnergyAnalysis
- [ ] S3.9 spectral: SpectralAnalysis
- [ ] S3.10 rhythmic: RhythmicAnalysis
- [ ] S3.11 bass: BassAnalysis
- [ ] S3.12 danceability + genre
- [ ] S3.13 sections: DJSection[]
- [ ] S3.14 phrases: DJPhrase[]
- [ ] S3.15 cuePoints: DJCuePoints
- [ ] S3.16 vocal/drum/bass/harmonic activity timelines
- [ ] S3.17 analysisConfidence: AnalysisConfidence
- [ ] S3.18 tracker?: TrackerMixAnalysis
- [ ] S3.19 DJTrackAnalysis is the canonical input to all higher-level decisions (planner, solver, executor read it, nothing else)

## Gate B - Analysis correctness (plan section 4)

- [ ] B1.1 BPM: half-time handled
- [ ] B1.2 BPM: double-time handled
- [ ] B1.3 BPM: ambiguous BPM handled (alternatives kept)
- [ ] B1.4 BPM: tracker tempo handled (module tempo as a hypothesis)
- [ ] B1.5 BPM: tempo changes handled (confidence drops, segments)
- [ ] B1.6 BPM: intro sections with weak rhythm handled
- [ ] B1.7 BPM: breakdowns handled
- [ ] B1.8 BPM: syncopation handled
- [ ] B1.9 first detected BPM is not assumed correct
- [ ] B1.10 TempoHypothesis { bpm, confidence, relationship } represented when confidence is low
- [ ] B2.1 key: key, confidence, mode, possible alternatives, local key changes
- [ ] B2.2 unknown key means "we don't know", never "clash"
- [ ] B3.1 loudness: integrated
- [ ] B3.2 loudness: short-term
- [ ] B3.3 loudness: peak
- [ ] B3.4 loudness: true peak (where available)
- [ ] B3.5 loudness: dynamic range
- [ ] B3.6 loudness: crest factor
- [ ] B4.1 energy: bass energy
- [ ] B4.2 energy: drum energy
- [ ] B4.3 energy: transient density
- [ ] B4.4 energy: spectral brightness
- [ ] B4.5 energy: harmonic density
- [ ] B4.6 energy: vocal presence
- [ ] B4.7 energy: rhythmic density
- [ ] B4.8 energy: arrangement density
- [ ] B4.9 energy: perceived intensity (not RMS)

## Gate C - Real beat grid (plan section 5)

- [ ] C1 BeatGrid { bpm, firstBeat, beats, confidence }
- [ ] C2 DownbeatGrid { bars, meter, confidence }
- [ ] C3.1 distinguishes first detected transient
- [ ] C3.2 distinguishes first musical beat
- [ ] C3.3 distinguishes first downbeat
- [ ] C3.4 distinguishes first full bar
- [ ] C3.5 distinguishes first usable mixing point
- [ ] C4 does not assume first detected beat = bar 1 (downbeat phase search)
- [ ] C5.1 anacrusis case
- [ ] C5.2 pickup case
- [ ] C5.3 long intro case
- [ ] C5.4 syncopated case
- [ ] C5.5 tracker composition case
- [ ] C5.6 unusual arrangement case

## Gate D - Musical structure (plan section 6)

- [ ] D1.1 section label: intro
- [ ] D1.2 section label: groove
- [ ] D1.3 section label: verse
- [ ] D1.4 section label: build
- [ ] D1.5 section label: pre-drop
- [ ] D1.6 section label: drop
- [ ] D1.7 section label: chorus
- [ ] D1.8 section label: breakdown
- [ ] D1.9 section label: bridge
- [ ] D1.10 section label: outro
- [ ] D1.11 section label: silence
- [ ] D1.12 section label: fill
- [ ] D1.13 section label: instrumental
- [ ] D1.14 section label: vocal-heavy
- [ ] D1.15 section label: drum-only
- [ ] D1.16 section label: bass-only
- [ ] D1.17 labels are probabilistic (confidence per section); planner reads musical function
- [ ] D2.1 4-bar phrases
- [ ] D2.2 8-bar phrases
- [ ] D2.3 16-bar phrases
- [ ] D2.4 phrase boundaries
- [ ] D2.5 repeated phrase patterns
- [ ] D2.6 arrangement changes (events)
- [ ] D3 phrase length is not hard-coded globally; detected per song

## Gate E - Semantic cue points (plan section 7)

- [ ] E1.1 cue: introStart
- [ ] E1.2 cue: firstBeat
- [ ] E1.3 cue: firstFullGroove
- [ ] E1.4 cue: firstDrums
- [ ] E1.5 cue: firstBass
- [ ] E1.6 cue: firstVocal
- [ ] E1.7 cue: firstHook
- [ ] E1.8 cue: firstDrop
- [ ] E1.9 cue: firstBreak
- [ ] E1.10 cue: bestMixIn
- [ ] E1.11 cue: bestMixOut
- [ ] E1.12 cue: outroStart
- [ ] E1.13 cue: outroGroove
- [ ] E1.14 cue: finalBeat
- [ ] E2 incoming deck starts at a musically useful position, not 0:00
- [ ] E3 example: B with drums at 0:24 starts at 0:24 under a drum-intro strategy (strategy-dependent)

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

- [ ] S14.1 KeySegment[] timeline computed (optional)
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

- [ ] M1 TrackerMixAnalysis kept alongside the rendered-audio analysis (structure not thrown away)
- [ ] M2.1 exposes order positions
- [ ] M2.2 exposes pattern boundaries
- [ ] M2.3 exposes channel activity
- [ ] M2.4 exposes instrument changes
- [ ] M2.5 exposes sample usage
- [ ] M2.6 exposes note density
- [ ] M2.7 exposes bass channel activity
- [ ] M2.8 exposes drum channel activity
- [ ] M2.9 exposes melody activity
- [ ] M2.10 exposes pattern changes
- [ ] M2.11 exposes fills
- [ ] M2.12 exposes breaks
- [ ] M2.13 exposes instrument entrances
- [ ] M2.14 exposes instrument exits
- [ ] M2.15 exposes repeating phrases
- [ ] M2.16 exposes silence
- [ ] M2.17 exposes structural transitions

## Section 26 - Tracker channel awareness

- [ ] S26.1 channel roles understood (drums/bass/melody) when the structure supports it
- [ ] S26.2 time-varying TrackerChannelSegment { channel, start, end, instrumentFamily, musicalFunction, rhythmicRole, register, importance, density, confidence }

## Section 27 - Tracker mix events

- [ ] S27.1 events: DRUM_ENTRY, BASS_ENTRY, BASS_EXIT, MELODY_ENTRY, INSTRUMENT_ENTRY, INSTRUMENT_EXIT, PATTERN_CHANGE, FILL, BREAK, DROP, DENSITY_INCREASE, DENSITY_DECREASE, SILENCE, REPEATED_PHRASE
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

- [ ] PG-A.1 deterministic test corpus
- [ ] PG-A.2 transition logs
- [ ] PG-A.3 regression playback
- [ ] PG-B.1 reliable BPM
- [ ] PG-B.2 BPM confidence
- [ ] PG-B.3 key confidence
- [ ] PG-B.4 loudness
- [ ] PG-B.5 spectral data
- [ ] PG-B.6 rhythmic data
- [ ] PG-B.7 bass data
- [ ] PG-C.1 beat positions
- [ ] PG-C.2 downbeats
- [ ] PG-C.3 meter
- [ ] PG-C.4 confidence
- [ ] PG-C.5 phrase synchronization
- [ ] PG-D.1 sections
- [ ] PG-D.2 phrases
- [ ] PG-D.3 arrangement events
- [ ] PG-E.1 semantic mix-in
- [ ] PG-E.2 semantic mix-out
- [ ] PG-E.3 first groove
- [ ] PG-E.4 first bass
- [ ] PG-E.5 first drums
- [ ] PG-E.6 first vocal
- [ ] PG-E.7 drop
- [ ] PG-E.8 breakdown
- [ ] PG-E.9 outro
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
- [ ] PG-J.1 tracker structure retained
- [ ] PG-J.2 pattern/order awareness
- [ ] PG-J.3 channel analysis
- [ ] PG-J.4 instrument activity
- [ ] PG-J.5 semantic tracker events
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

## Open owner questions

(none yet)

## Owner checks

(filled as items land; each with steps at http://localhost:5174)

## Count

Regenerated with: `grep -c '^- \[x\]'` / `grep -c '^- \['` on this file.
