---
date: 2026-09-29
topic: How DEViLBOX decides what a channel is (drums / bass / lead / ...), and how well it does
tags: [classifier, channel-roles, auto-dub, sample-spectrum, research]
status: final
---

# Channel / instrument classifier - research

Owner ask (2026-09-29): "we started improving our instrument/channel classifier
but it still sucks pretty much even for the common formats how can we improve
it? research and write a plan". Plan: `thoughts/shared/plans/2026-09-29-channel-classifier.md`.

Line numbers are at commit `60ba954c3`.

## 1. Architecture

### 1.1 Offline song classifier (the main path)

`classifySongChannels(patterns, instruments)` - `src/bridge/analysis/ChannelNaming.ts:478`

1. Samples up to 50 patterns (`:491`).
2. Computes each channel's median sounding note and the song's lowest median
   (`ChannelSongContext`, `:500-515`) so "bass" is relative to the song.
3. Per pattern, runs `classifyChannelWithInstruments` (`:275`); empty
   verdicts are skipped; the **majority role across patterns wins** (`:523-570`).
   Cached per `patterns` array (`_songRolesCache`).
4. `classifySongRoles` (`:574`) projects the roles only.

`classifyChannelWithInstruments` (`ChannelNaming.ts:275`):

1. Note statistics first - `classifyChannel` (`src/bridge/analysis/MusicAnalysis.ts:296`):
   avgOctave, uniqueNotes (pitch classes), avgInterval, density,
   pitchRange -> bass / arpeggio / lead / pad / chord by hand-set
   thresholds (`:337-357`).
2. Hardware channel class (`hardwareChannelClass`, `:259`) - only Furnace
   NOISE channels -> percussion/mixed; overrides everything.
3. Dominant instrument override (`:308`): the channel's most-used
   instrument replaces the note-stats role if its classification has
   confidence >= 0.8 **and** it plays >= 70 % of the cells.
4. Mixed-kit rule (`:322-335`): top two instruments both percussion ->
   percussion.
5. Percussion promotion (`:370-390`): if all instruments classified
   percussion @ >= 0.8 together play >= max(4, 10 %) of the cells, the
   channel is percussion. **Unconditional** over any note-stats role.
6. Bass promotion (`:399`): any instrument bass @ >= 0.8 with >= minUses
   lifts empty/pad/lead/chord/arpeggio to bass.

### 1.2 Per-instrument classifier - a first-hit priority chain

`classifyInstrument(inst)` (`ChannelNaming.ts:119`). The first signal that
fires wins; later signals are never consulted:

| # | Signal | Confidence | Where |
|---|---|---|---|
| 1 | `drumMachine.drumType` | 1.0 | `:123-132` |
| 2 | DRUM_SYNTHS synth type | 0.9 | `:135` |
| 2b | native synth identity (303, chip noise) | varies | `synthEvidence.ts:451` |
| 3 | sample **filename** categoriser (skipped for `data:` URLs - i.e. every tracker sample) | 0.8 | `:159-170` |
| 4 | **sample spectrum** (`SampleSpectrum.ts`) | 0.4-0.85 | `:172-183` |
| 4b | synth params (AHX/HVL/envelope/Amiga replayers) | 0.5-0.85 | `synthEvidence.ts:370,389` |
| 5 | instrument **name** regex (kick/snare/bass/lead/pad...) | 0.6-0.65 | `:207-222` |
| 6 | envelope shape | 0.35-0.4 | `:226-238` |

Names sit at step 5, below the spectrum, on purpose: MOD instrument slots
often carry greetings (memory `reference_sample_names_are_messages`).

### 1.3 Sample spectrum

`SampleSpectrum.ts`: decode the `data:audio/wav` PCM (`:77`), since
2026-09-29 expand a looped sample to what it sounds like (`soundingPcm`,
`:507`), FFT features (`extractSampleFeatures`, `:356`: centroid,
flatness, peak, crest, decayMs, tailRatio, duration), then fixed rules
(`classifyBySpectralFeatures`, `:407`):

- kick / hat / snare / perc from centroid + flatness + decay + crest;
- **bass = centroid < 400 Hz and tonal, confidence 0.85** (`:455`);
- pad = tonal + decay >= 500 ms (0.7); lead = tonal mid-high (0.65 / 0.4).

The spectrum is taken at the **stored** sample rate. A sample's sounding
pitch depends on the note it is played at, which this path never sees.

### 1.4 Runtime / ML signals

- **Runtime spectral votes** (`src/bridge/analysis/ChannelAudioClassifier.ts`):
  the same `classifyBySpectralFeatures` over 2048-sample windows of each
  channel's live audio (ChannelAudioTap), 3-of-4 majority
  (`:91,119`). Merged by `mergeOfflineAndRuntimeRoles` (`:200`): runtime
  bass/percussion/lead may replace offline empty/pad/chord/lead/arpeggio at
  confidence >= 0.6. Ledger: runtime votes stayed **null** for
  nicktune1.bp after 20 s of playback (cause unverified).
- **CED (AudioSet ONNX) per instrument** (`src/stores/useInstrumentTypeStore.ts`),
  started by AutoDub (`AutoDub.ts:1492`); feeds `SongRoleTimeline` and
  `TrackerAnalysisPipeline.ts:225-270` (hints). Instrument PCM is sent as
  stored. Not verified whether it receives the looped/sounding signal.
- **Channel CED** (`useChannelTypeStore`, `CedChannelAccumulator`, SID voice
  classifier) - per-channel live results.

### 1.5 Consumers - they do NOT all see the same roles

| Consumer | Roles it uses | Where |
|---|---|---|
| Auto Dub (rules, targeting) | offline + runtime + CED timeline + channel CED | `AutoDub.ts:1494-1520` |
| riddimSection move | offline only | `engine/dub/moves/riddimSection.ts:54` |
| Auto Dub panel | offline only | `components/dub/AutoDubPanel.tsx` |
| MCP `get_channel_roles` | offline + runtime | `bridge/handlers/readHandlers.ts:1357` |
| sidechain "Drums (auto)" key | offline only | `engine/tone/sidechainKey.ts` `resolveDrumKeyChannel` |
| master FX `channelRole: 'nonDrums'` | offline only | `sidechainKey.ts` `channelRoleTargets` |
| Auto-name channels | offline | `ChannelNaming.ts:591` |
| channel segments | own register logic | `bridge/analysis/channelSegments.ts:258` |

There is no single role resolver: the same song can be "drums on ch 3" for
the sidechain and something else for Auto Dub.

## 2. Signals each format family has

| Family | Pattern notes | Instrument audio | Instrument names | Synth params | Hardware channel type |
|---|---|---|---|---|---|
| MOD / XM / S3M / IT / MTM ... | yes | 8/16-bit PCM (`data:` URL), loop points, base note / finetune | 22-char slots - greetings as often as names | no | no |
| AHX / HVL | yes (own note numbering) | none stored (synthesised) | 1 name slot, usually greetings | waveform, filter, envelope, performance list (`synthEvidence.ts:123`) | no |
| Furnace / DefleMask | yes | chip output (not stored) / sample PCM | names | macros, chip type | yes - `channelMeta.furnaceType` (only NOISE used) |
| SoundMon / FC / Amiga replayers | yes | synth waveforms + samples | names | envelopes, ADSR (`synthEvidence.ts:262`) | no |
| UADE (non-editable) | often none | none until played | none | none | no - runtime audio is the only signal |
| SID | via SidVoiceClassifier | runtime | no | register data | yes (3 voices) |

## 3. Measurement (headless, 2026-09-29)

Throwaway vitest over 16 songs (15 real + the fixture); per channel: verdict,
sounding note range / median, top instruments with their instrument class.
Raw dump kept only in this doc's summary below. **There is no labelled ground
truth yet** - verdicts are judged from evidence: owner statements, and
instrument names where the names are clearly instrument names.

| Song | Ch | Judged correct | Judged wrong | Unverified | Notable |
|---|---|---|---|---|---|
| micro15-goto80.mod | 4 | 2 (kit, lead) | 1 (lead guitar -> chord) | 1 | fixed today; still not "lead" |
| dub-test-fixture.mod (names = truth) | 4 | 0 | 4 | 0 | inst "bass" -> kick, "kick drum" -> pad, "snare drum" -> skank, "lead synth" -> kick |
| a sleep so deep.mod ("jst*" names) | 4 | 2 | 2 | 0 | ch2 = jstbass5 x544 + jstsnare1 x218 -> percussion (promotion); jstsnare1 itself -> **kick** |
| flo boarding - level 1.xm (.WAV names) | 4 | 1 | 1 | 2 | ELECG1-9.WAV (electric guitar) -> percussion snare/kick |
| andante.s3m (clear names) | 8 | 3 | 5 | 0 | "NiceStrings", "WonderPad", "A3-LD" (lead) -> **bass/synth @0.85** on 5 channels |
| nightmare on acid.s3m | 16 | - | - | 16 | inst 1 bass/sub on 10 channels; roles scatter |
| absm chain mod.it | 25 | - | - | 25 | IT channel reuse: one instrument on many channels |
| JosSs-Cream.mod | 4 | - | 1 | 3 | ch1: 7 pitch classes, range 37..72 -> percussion/snare (promotion) |
| break the box / world class dub / Virgill-mothership / mortimer-twang | 16 | - | - | 16 | greeting names; world class dub ch1 978-frame loop -> kick |
| aces_high.ahx / amanda.ahx | 8 | - | - | 8 | almost every AHX instrument -> percussion/perc @0.7 |
| hexplosion.hvl | 16 | - | - | 16 | 8 of 16 channels "bass" (AHX notes 1..60 sit low in octave terms) |
| nicktune1.bp | 4 | 1 (ch2 drums) | - | 3 | |

Of the 28 channels where the evidence allows a judgement: **9 correct, 19
wrong (~32 %)**. Rough and biased toward cases with names, but it matches
the owner's "sucks even for common formats". Furnace was not measured (its
parser needs the WASM file-ops harness, `furnaceFileOpsWasmHarness`).

## 4. Failure taxonomy

1. **Register read from the stored sample, not the sounding note.** The
   spectrum's `bass` verdict (centroid < 400 Hz at the stored rate,
   confidence 0.85) outranks note statistics through the 0.8 overrides.
   A strings/pad/lead sample recorded low but played high becomes "bass"
   (andante.s3m x5). Today's single-cycle fix is one instance of this.
2. **First-hit priority chain instead of evidence fusion.** The spectrum
   answers before instrument names are consulted, so informative names
   ("bass", "kick drum", "ELECG1.WAV", "NiceStrings", "jstbass5") are
   ignored whenever the spectrum says anything at 0.5+. Names were demoted
   wholesale because some songs carry greetings; nothing decides per song
   whether its names are informative.
3. **Percussion from noisiness alone.** Snare = mid centroid + noisy +
   short; distorted guitars and noisy leads match (flo boarding ELECG*,
   micro15 before today). There is no harmonicity / pitch-salience feature,
   and a snare sample was classified as a kick (a sleep so deep).
4. **Unconditional percussion promotion.** >= 10 % drum hits turns a
   channel percussion even when the rest is a melodic bass or lead
   (a sleep so deep ch2, JosSs-Cream ch1). Shared drum+bass channels are
   common in 4-channel MODs.
5. **Note statistics use absolute octave thresholds** (`MusicAnalysis.ts:337`)
   while formats number notes differently (AHX 1..60): hexplosion.hvl -> 8
   "bass" channels. The song-relative median helps only for `bass`.
6. **AHX / HVL synth-parameter rules** return percussion/perc @0.7 for most
   instruments of aces_high.ahx (unverified which rule).
7. **No single role resolver** (section 1.5): consumers disagree; runtime
   and CED signals reach Auto Dub only.
8. **Runtime votes null** in practice (ledger, unverified cause); the
   runtime path would be the only signal for UADE formats.
9. **Possible feedback loop (UNVERIFIED):** auto-named channels ("Snare 1")
   feed `isPercussionChannel`'s channel-name regex (`MusicAnalysis.ts:443`)
   in `classifyPattern`. Not on the `classifySongChannels` path; check who
   calls `classifyPattern`.
10. **Whole-song role per channel.** Majority vote over patterns; IT/S3M
    songs reuse channels for different parts (absm chain: one sample on
    10+ channels). A per-section role (SongRoleTimeline exists for CED) is
    not available to the offline path.

## 5. Open questions

- Which songs form the labelled corpus, and who labels them (owner's ear is
  the reference)?
- Role vocabulary: is `skank`, `arpeggio`, `chord`, `pad` distinction worth
  labelling, or should the scored target be drums / bass / lead / harmony /
  fx (+ subroles for drums)?
- Per-song roles or per-section roles?
- Should CED/AudioSet (on rendered, sounding notes) become the primary
  timbre signal, with heuristics as fallback?
