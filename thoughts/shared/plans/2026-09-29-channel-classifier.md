---
date: 2026-09-29
topic: Make the channel classifier right for common formats - measured, then fixed at the right level
tags: [classifier, channel-roles, auto-dub, plan]
status: draft
---

# Channel classifier plan

Research: `thoughts/shared/research/2026-09-29_channel-classifier.md`. On 28
channels whose role the evidence allows judging, the classifier got ~32 %
right (9 of 28). The four biggest causes:
- register taken from the stored sample instead of the sounding note;
- a first-hit priority chain that ignores informative names;
- percussion detected from noisiness alone;
- unconditional percussion promotion.

**Done means:** the labelled corpus scores >= 85 % role accuracy overall and
>= 95 % on "drums vs not drums". Every consumer reads one role resolver, and
the score runs in `test:ci` as a ratchet.

## Owner questions (block P0 only; later phases proceed on the defaults)

- Q1 **Corpus.** Which songs, and will you label them by ear?
  Recommended: about 30 songs:
  - 8 MOD (including your Up Rough MODs and micro15);
  - 4 XM, 4 S3M, 4 IT;
  - 4 AHX/HVL, 3 Furnace, 3 Amiga replayers (SoundMon, FC).
  I pre-fill every channel with the current verdict; you correct only the
  wrong ones.
- Q2 **Vocabulary scored.**
  - Recommended: drums (kick/snare/hat/kit), bass, lead, harmony (chord/pad/arp), fx/vocal.
  - `skank` and `arpeggio` stay as subroles and are not scored separately; the note statistics tell them apart well enough when the main role is right.
- Q3 **Per song or per section.** Recommended: per song first (scored), with per-section labels only on songs whose channels clearly change part (IT reuse). Section roles become phase P6.
- Q4 **ML as primary.** Should the CED/AudioSet model become the main timbre signal?
  - Recommended: NOT primary until P0 can score it. P5 measures CED run on the sounding notes against the heuristics; the winner becomes primary, decided by numbers.

## Phases (ordered by expected accuracy gain after P0)

### P0 - Labelled corpus and scored eval, wired into test:ci

- Labels file: `src/bridge/analysis/__tests__/fixtures/channel-labels.json`,
  one entry per song:

  ```json
  { "song": "public/data/songs/formats/andante.s3m",
    "channels": ["drums", "drums", "bass", "lead", "lead", "harmony", "harmony", "harmony"],
    "labelledBy": "owner", "date": "2026-10-.." }
  ```

  Songs must be committed files: `public/data/songs/**` or `src/__tests__/fixtures/`.
- Loader: `src/bridge/analysis/__tests__/loadLabelledSong.ts`. Maps an
  extension to the headless parser already used by tests (MODParser,
  XMParser, S3MParser, ITParser, HivelyParser, SoundMonParser; Furnace via
  `furnaceFileOpsWasmHarness`). Keep one dispatch table; reuse, don't fork.
- Eval: `src/bridge/analysis/__tests__/channelClassifierScore.test.ts`.
  - Runs `resolveChannelRoles` (P1b) or `classifySongRoles` over the corpus.
  - Maps role to the scored vocabulary.
  - Prints the accuracy, the drums-vs-not accuracy and a confusion matrix.
  - Writes `test-data/classifier-score.json` (gitignored).
  - Asserts both numbers >= `channel-labels.baseline.json`: a ratchet raised with every improvement, never lowered silently.
- Pre-fill tool: `tools/classifier-label-draft.ts` writes the current verdicts into a draft labels file for the owner to correct. Optional later: an MCP tool that plays a channel solo while labelling.
- Automated: the test runs in `test:ci`, and the baseline equals the measured score at P0.
- Manual: the owner labels the corpus.
- Success: corpus >= 25 songs and >= 150 channels labelled, with the baseline recorded.

### P1 - Register from the sounding note, not the stored sample

Level: data (what the classifier looks at). Today's single-cycle fix is one case of it.

- `src/bridge/analysis/SampleSpectrum.ts`: `classifyBySpectralFeatures`
  returns a timbre class plus its evidence, not a register:
  - percussive: kick / snare / hat / perc;
  - tonal: sustained / plucked;
  - noisy-tonal;
  - with its confidence.
  The `bass` / `lead` / `pad` verdicts leave the spectrum.
- `src/bridge/analysis/ChannelNaming.ts`: register comes from the sounding
  pitch, i.e. the note played plus the sample's base note and finetune
  (`soundingNotes`, `synthEvidence.ts:534`, already resolves instrument
  offsets). Remove the 0.85 spectral bass promotion (`:399`); bass becomes a
  song-relative register question (`ChannelSongContext`) plus a tonal timbre.
- `src/bridge/analysis/MusicAnalysis.ts:337`: octave thresholds become
  song-relative (rank of channel medians and spread), so AHX's note numbering
  stops meaning "bass" (hexplosion.hvl: 8 bass channels).
- Automated: the P0 score moves up. Unit tests: andante.s3m strings / leads
  are not bass; the hexplosion bass count is <= 3.
- Success: accuracy +15 points over the P0 baseline.

### P1b - One role resolver for every consumer

Level: architecture (single source of truth).

- New module: `src/bridge/analysis/resolveChannelRoles.ts`. The only function that merges:
  - offline roles;
  - runtime votes (`ChannelAudioClassifier`);
  - the CED timeline;
  - channel CED.

  It is cached per song and signal generation.
- Consumers switch to it:
  - `AutoDub.ts:1494`;
  - `riddimSection.ts:54`;
  - `AutoDubPanel.tsx`;
  - `readHandlers.ts:1357`;
  - `sidechainKey.ts` (`resolveDrumKeyChannel`, `channelRoleTargets`);
  - `autoNameChannels`.
- Find why runtime votes stay null (ledger item). Measure first with a probe
  on `ChannelAudioTap` frames per channel while a MOD plays; no fix is
  guessed ahead of that probe.
- Automated: a reachability test where the sidechain key, `nonDrums` and
  Auto Dub return the same drums channel for a fixture, with call counts
  on the resolver.
- Success: no consumer calls `classifySongRoles` directly (grep).

### P2 - Evidence fusion instead of a first-hit chain

Level: algorithm.

- New module: `src/bridge/analysis/roleEvidence.ts`. Each signal contributes a
  per-role log-likelihood with a weight:
  - hardware channel;
  - drum type / native synth;
  - name (see below);
  - spectrum timbre;
  - synth params;
  - envelope;
  - note statistics;
  - runtime.

  The channel role is the argmax of the sum. Weights are fitted on the P0
  corpus by a small offline search script, `tools/fit-role-weights.ts`,
  which writes `roleWeights.json`. Weights are not guessed.
- **Name informativeness per song**: the fraction of a song's instrument
  names that match an instrument vocabulary or filename pattern (`.WAV`,
  `bass`, `kick`, `strings`, `lead`, `LD`, `BD`, ...) versus sentence-like
  text. Informative songs weight names high; greeting songs weight them
  near zero. This replaces the global demotion
  (`reference_sample_names_are_messages`) with a per-song measurement.
- `classifyInstrument` keeps its signature (callers unchanged) but returns
  the fused result; the priority chain goes.
- Automated: score up; a test that dub-test-fixture.mod's named instruments
  classify by their names and `break the box.mod`'s greetings do not.
- Success: +10 points over P1.

### P3 - Harmonic vs noisy: stop calling distorted guitars snares

Level: feature extraction.

- `SampleSpectrum.ts`: add a pitch-salience / harmonicity feature
  (normalised autocorrelation peak within 50-2000 Hz on the sounding PCM)
  and use it in the timbre class. Noisy **and** harmonic is a distorted
  tonal instrument, not a snare.
- `ChannelNaming.ts:370-390`: percussion promotion weighs the drum-hit
  fraction against the melodic evidence of the non-drum cells. A channel
  with 544 bass notes and 218 snare hits is "bass + drums" (subrole
  `mixed`, main role by majority of sounding time), not percussion.
- Automated: flo boarding ELECG*.WAV is not percussion; the channels of a
  sleep so deep and JosSs-Cream match their labels.
- Success: drums-vs-not accuracy >= 95 %.

### P4 - Format specifics

- AHX/HVL: check `classifyBySynthParams` on aces_high.ahx (almost every
  instrument perc @0.7). Measure which rule fires, fix the rule, and score.
- Furnace: use every `channelMeta.furnaceType`, not only NOISE (FM / PULSE /
  WAVE / PCM per chip). Score the Furnace songs in the corpus.
- UADE non-editable: the runtime path is the only signal; it depends on P1b.

### P5 - CED on the sounding notes (answers Q4 by numbers)

- Feed CED the rendered sounding note per instrument: `soundingPcm` for
  samples, SynthBaker at a typical played note for synths. Then score:
  - CED alone;
  - heuristics alone;
  - fused.
- The winner by corpus score becomes primary; the others stay as weighted
  evidence in `roleEvidence.ts`.

### P6 - Per-section roles (only if Q3 says so)

- Extend `SongRoleTimeline` to the offline signals, so a channel can be a
  lead in the verse and a pad in the break. Score this on the sections the
  owner has labelled.

## Checklist

- [ ] P0.1 owner answers Q1-Q4
- [ ] P0.2 label draft tool + draft labels for the chosen corpus
- [ ] P0.3 owner corrects labels
- [ ] P0.4 loader + score test + baseline ratchet in `test:ci`
- [ ] P1.1 timbre-only spectrum classes
- [ ] P1.2 register from sounding pitch, song-relative octaves
- [ ] P1.3 score recorded, baseline raised
- [ ] P1b.1 `resolveChannelRoles` + all consumers switched
- [ ] P1b.2 runtime-votes-null probe + fix
- [ ] P1b.3 reachability test (one drums channel everywhere)
- [ ] P2.1 `roleEvidence.ts` fusion + fitted weights
- [ ] P2.2 per-song name informativeness
- [ ] P2.3 score recorded, baseline raised
- [ ] P3.1 harmonicity feature
- [ ] P3.2 weighted percussion promotion
- [ ] P3.3 drums-vs-not >= 95 %
- [ ] P4.1 AHX synth-param rule fix
- [ ] P4.2 Furnace channel types
- [ ] P5.1 CED on sounding notes, scored three ways
- [ ] P6.1 per-section roles (if Q3)

## Verification

Automated, in `test:ci`: the corpus score ratchet, the per-phase unit tests
above and the resolver reachability test.

Manual, by the owner: labelling (P0.3). Then a listening pass with Auto Dub
and Chip Metal on 3 songs of their choice after P1b, to check the targeted
channels are the right ones.

## Owner decisions (2026-09-29)

- Q1: owner labels by ear, conversationally: the agent loads each song in the owner's tab, lists its current verdict per channel, the owner solos channels and replies with corrections only. Answers recorded in the corpus file as they arrive (resumable).
- Q2: categories drums / bass / lead / harmony / fx-vocal, with skank and arpeggio as sub-labels - accepted.
- Q3: per song first - accepted.

## Draft corpus (owner may swap in favourites)

| # | Format | Song | Source |
|---|--------|------|--------|
| 1 | MOD | micro15.mod (goto80) | src/__tests__/fixtures/micro15-goto80.mod |
| 2 | MOD | world class dub.mod | public/data/songs/mod |
| 3 | MOD | break the box.mod | public/data/songs/mod |
| 4 | MOD | a sleep so deep.mod | public/data/songs/formats |
| 5 | MOD | chuck rock - chuckrock.mod | public/data/songs/chiptracker |
| 6 | MOD | the funny farm.mod | public/data/songs/his-masters-noise |
| 7 | MOD | Virgill-redrum redrum.mod | public/data/songs/amigaklang |
| 8 | MOD | space_debris.mod (Captain) | Modland pub/modules/Protracker/Captain |
| 9 | XM | flo boarding - level 1.xm | public/data/songs/xm |
| 10 | XM | space debris.xm (Candybag) | Modland |
| 11 | XM | cranked & torn.xm (Jester's Mind) | Modland |
| 12 | XM | human scheme.xm (Jester's Mind) | Modland |
| 13 | XM | the jester race.xm (Betrayer) | Modland |
| 14 | XM | crysalide.xm (Jester's Mind) | Modland |
| 15 | S3M | andante.s3m | public/data/songs/s3m |
| 16 | S3M | nightmare on acid.s3m | public/data/songs/formats |
| 17 | S3M | a touch of spring.s3m (Purple Motion) | Modland |
| 18 | S3M | alien incident - entity.s3m (Purple Motion) | Modland |
| 19 | IT | absm chain mod.it | public/data/songs/it |
| 20 | IT | dreaming in green.it (Necros) | Modland |
| 21 | IT | orchard street.it (Necros) | Modland |
| 22 | IT | dirty walk.it (Necros) | Modland |
| 23 | AHX | amanda.ahx | public/data/songs/ahx |
| 24 | AHX | aces_high.ahx | public/data/songs/formats |
| 25 | HVL | hexplosion.hvl | public/data/songs/formats |
| 26 | HVL | waiting for a message.hvl | public/data/songs/hivelytracker |
| 27 | Furnace | one Genesis song | public/data/songs/furnace/genesis |
| 28 | Furnace | one C64 song | public/data/songs/furnace/c64 |
| 29 | SoundMon | nicktune1.bp | public/data/songs/bp-soundmon-2 |
| 30 | MOD 8ch | follow me to hell.mod (Octalyser) | public/data/songs/octalyser |

Modland files are downloaded once into src/__tests__/fixtures/classifier-corpus/ so the scored eval runs headless in CI.
