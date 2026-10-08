---
date: 2026-10-08
topic: How the DEViLBOX Auto DJ works (playlist order, key and tempo analysis, transitions), written for a music-theory reviewer
tags: [dj, auto-dj, harmonic-mixing, camelot, bpm, transitions, research, review]
status: final
---

# How the Auto DJ works

Audience: a music-theory reviewer who cannot see the code. This describes what the code does today, not what it should do. Every number is taken from the source; the file and line map is in the appendix. Where I read the code but did not observe it running, the text says "by static reading".

## 0. Vocabulary

- **Deck**: one of two virtual turntables (A and B). One plays (the outgoing deck), the other is loaded with the next track (the incoming deck).
- **Crossfader**: the mixer control that blends the two decks. Position 0 is all deck A, 1 is all deck B.
- **Beat grid**: a list of beat times for a track. A **downbeat** is beat 1 of a bar. A **bar** is 4 beats unless the analysis decided on 3.
- **Camelot wheel**: a notation for keys. 12 numbers on the circle of fifths, letter A for minor and B for major. 8A is A minor, 8B is C major. Moving one number clockwise (8 to 9) is up a perfect fifth. The same number with the other letter is the relative major or minor.
- **Pitch fader**: a deck control that speeds a track up or down. Here a value in semitones: +1 means playing 2^(1/12) = 5.95 percent faster. Without **key lock** the pitch rises with the speed, like vinyl. With key lock the tempo changes and the pitch stays.
- **EQ**: three-band tone control (low, mid, high). **HPF** is a high-pass filter (removes bass). **Bass swap**: cutting the outgoing track's bass while the incoming track's bass is let in.

## 1. The big picture

Auto DJ is a state machine that plays a playlist from top to bottom (or shuffled), forever, wrapping at the end. It polls every 500 ms. Its states are: playing, preloading, transition-pending, transitioning, preload-failed, idle.

Cycle for each track:

1. The current track plays on the active deck.
2. When 60 seconds or less remain, the next track is fetched and, if it is a tracker module or SID, rendered to a waveform ("pre-render"). Nothing is audible yet.
3. When the remaining time falls to the length of the configured transition, the transition starts.
4. The outgoing deck is stopped, decks swap roles, the next preload begins immediately.

Important framing for the reviewer: **every track Auto DJ plays is audio**. Tracker modules (MOD, XM, IT, many Amiga formats) and SIDs are rendered offline to a WAV and then played like an MP3 (see section 7). So the key and BPM of a module come from audio analysis of that render, not from the module's notes.

User settings (all exposed in the Auto DJ panel):

| Setting | Values | Default |
|---|---|---|
| Transition length | 2, 4, 8, 16, 32 bars | 8 |
| Shuffle | on or off | off |
| Filter on transitions | on or off | on |
| Smart Cuts (pattern-aware) | on or off | off |

Playlist-level extras: a playlist can carry master effects (applied when Auto DJ is enabled) and each track can carry a per-song master effect preset (applied at the start of that track's incoming transition). These are mixing-chain effects, not musical decisions.

## 2. Track order (what plays next)

### 2.1 Smart Sort (applied once, when Auto DJ is switched on)

When Auto DJ is enabled, the playlist is physically re-ordered by "Smart Sort", and the new order is saved over the playlist. (The enable path in the actions layer sorts unconditionally for 2 or more tracks; the Auto DJ class sorts again if at least one track has both a BPM and a key.) It is a greedy nearest-neighbour walk: pick a start track, then repeatedly append the unplayed track with the lowest "cost" relative to the last one. Lower cost is better.

**Start track.** The track with the lowest value of: |energy - 0.7 x median energy| + 0.3 x (BPM / 200). The aim is a mid-to-low-energy, slow-ish opener with room to build. Unknown energy counts as 0.5, unknown BPM as BPM factor 0.5.

**Cost of B following A** is the sum of three parts:

1. Tempo cost = 0.8 x d squared, where d is the smallest of |bpmA - bpmB|, |bpmA - 2 x bpmB|, |2 x bpmA - bpmB| (half and double time count as matches). Examples: 3 BPM = 7.2, 6 BPM = 28.8, 10 BPM = 80, 20 BPM = 320. If either BPM is unknown: 30.
2. Key cost, from the Camelot relation of A's key to B's key:

| Relation | Rule | Cost |
|---|---|---|
| perfect | same Camelot number and letter | -20 |
| energy-boost | same letter, number +1 (a fifth up) | -12 |
| energy-drop | same letter, number -1 (a fifth down) | -12 |
| mood-change | same number, other letter (relative major or minor) | -5 |
| clash | everything else | +50 |

   If either track has no key string at all: +5. A key of the literal text "Unknown" (what analysis writes when it fails) is a present-but-unparseable key and scores as "clash", +50.
3. Energy cost = 60 x (energy difference) squared (0.1 gives 0.6, 0.3 gives 5.4, 0.5 gives 15); minus 3 if the energy moves in the same direction as the previous step; minus 2 if the step size is between 0.05 and 0.2.

Nothing is ever excluded: a clashing key costs +50, which is the same as a 8 BPM gap, so a large enough tempo or energy gain can still choose a clashing key. There is no rule limiting how many tracks in a row may stay in one key, and no look-ahead beyond the next track.

### 2.2 Sequential versus shuffle

- Shuffle off: next = (current + 1) modulo track count, so the Smart Sort order is followed and wraps.
- Shuffle on: a random permutation (Fisher-Yates) of all tracks except the current one is played through, then regenerated. In shuffle mode Smart Sort order is irrelevant.
- Tracks flagged bad (failed to load) are skipped, up to 50 attempts per preload; they are retried only when nearly everything else has failed.

### 2.3 Where track metadata comes from

Smart Sort uses the playlist's stored BPM, key and energy. These are filled in by a separate "Analyze playlist" job, not by Auto DJ itself. The panel warns if tracks are unanalyzed. Two different analysers can have produced the values (section 4).

## 3. Transition timing

### 3.1 When it starts

- Transition length in seconds = bars x beats per bar x 60 / BPM, using the outgoing deck's analysed BPM (falling back to the pitch-adjusted BPM, then 125) and its detected time signature (3 or 4, default 4). Example: 8 bars at 125 BPM = 15.36 s. 32 bars at 125 BPM = 61 s.
- The transition is triggered when remaining time in the outgoing track is less than or equal to that length. The "remaining time" is read from the audio engine's playhead.
- The fade does not necessarily start at that instant. For the crossfade, bass-swap, filter-build and echo-out types, the actual start is delayed to the next downbeat of the outgoing deck (up to one bar, 1.92 s at 125 BPM). Because the trigger point was already "length before the end", a delay of up to one bar means the fade can still be running when the outgoing audio runs out, and the outgoing track's last bar may be shortened by the stop. If the preload finished late (a render can take up to 60 s) the trigger happens with less than a full fade remaining.
- After the start request, a small random delay of 0 to 30 ms ("humanize", late only) is added.
- If the outgoing deck has no beat grid, quantization falls back to firing immediately.
- Phrase awareness: **none.** The code counts bars of the transition, not 8 or 16 bar phrases of the music. It does not look for a phrase boundary, breakdown or intro/outro of either track. The incoming track always starts from its very beginning (position 0, no cue point, no skipping of an intro), and the outgoing track is faded over its final stretch. The only musical-structure rule is the pattern-aware chord deferral (section 3.4), which does not appear to be live.

### 3.2 Alignment of the two tracks

Before the downbeat wait, the code tries two things on the incoming deck:

1. **Tempo match** (section 5): sets a pitch offset so the incoming BPM equals the outgoing BPM.
2. **Phase alignment to the bar**: reads the outgoing deck's position inside its bar (0 to 1) and the incoming deck's, then seeks the incoming deck by up to plus or minus half a bar so the two bar positions are equal. If the seek target would be before the start of the track, it does nothing.

Two properties of this by static reading: (a) the phase is measured now but the incoming deck only starts at the next downbeat of the outgoing deck, so unless the outgoing deck is already almost at a downbeat, the incoming deck will start offset from the grid by the bar fraction it was seeked to; (b) both steps need a beat grid on the incoming deck, and section 4.4 explains why the incoming deck probably has none. The skip transition (section 3.5) does no phase alignment at all.

### 3.3 The transition types and how one is chosen

Five types exist. All take the configured number of bars (except where noted). Default selection (Smart Cuts off), evaluated in this order, using BPM, key and energy of outgoing and incoming:

1. If the BPM difference is under 4 and the outgoing energy is above 0.6 and the key relation is "perfect" or "energy-boost" (same key, or a fifth up on the same letter): 30 percent chance of **bass-swap**. ("energy-drop" and "mood-change" do not qualify.)
2. Otherwise, if the incoming energy is more than 0.15 below the outgoing: 50 percent chance of **echo-out**.
3. Otherwise, if the incoming energy is more than 0.10 above the outgoing: 40 percent chance of **filter-build**.
4. Otherwise: **crossfade**.

The checks fall through when a dice roll fails, so for example "same key, energy dropping" gives 30 percent bass-swap, 35 percent echo-out, 35 percent crossfade. A hard **cut** is never chosen automatically (an explicit rule from a 2026-04-18 live-gig incident). Key compatibility never blocks a transition: a clashing key still gets a crossfade.

The five types:

- **Crossfade** (default): the crossfader moves from the current position to the other deck over bars x beats per bar beats. With the Filter option on, the outgoing deck also gets a high-pass sweep (below).
- **Bass-swap**: first half of the fade moves the crossfader to the middle (0.5); at the midpoint the outgoing deck's low EQ band is set to -12 dB (a cut of 12 dB, not a full kill); second half completes the fade; the outgoing low band is restored to 0 dB afterwards. The incoming deck's bass is never touched: both decks' bass is audible together for the first half. Tone.js default EQ crossover frequencies apply (400 Hz and 2.5 kHz); I did not find an override.
- **Filter-build**: the incoming deck starts with a high-pass filter at position -0.8 (about 2.9 kHz cutoff), which opens to flat over the whole fade; the outgoing deck's high-pass sweeps to -0.8 over the first 75 percent of the fade; the crossfade runs normally.
- **Echo-out**: length is fixed at 4 bars (16 beats) regardless of setting. At the next downbeat, the incoming deck starts and the crossfader snaps instantly to the incoming side; the outgoing deck's volume then decays over 16 beats with an exponential curve (volume x (1 - progress) squared). By static reading, because the crossfader has already moved fully to the incoming side, the outgoing deck is already silent at the snap, so this is effectively a hard cut at the next downbeat. No delay or echo effect is applied despite the name.
- **Cut**: only via Smart Cuts. Snap the crossfader to the incoming deck at the next downbeat and stop the outgoing deck.

**High-pass filter option** (crossfade only, and skip): the outgoing deck's high-pass moves from flat to position -0.6 (cutoff about 830 Hz) over 75 percent of the fade length in beats, with a 15 percent immediate jump at the start; when that sweep ends (at 75 percent of the fade) the filter is snapped to -1 (cutoff 10 kHz), which removes essentially everything audible from the outgoing deck. At that moment the crossfader is about 87 percent across, so the outgoing deck is already about 14 dB down. The filter maps position -1 to 0 as cutoff 10 kHz to 20 Hz on an exponential scale; positive positions are a low-pass from 20 kHz down to 100 Hz.

### 3.4 Crossfade curve

Two curves are applied together:

- Time curve of the crossfader position: a quadratic ease-in-out. For progress p from 0 to 1: position fraction = 2p squared for p under 0.5, else 1 - (2 - 2p) squared / 2. So the fade starts and ends slowly and is steepest in the middle. This is evaluated about every 16 ms.
- Mixer law, the default "smooth" curve: equal-power. Gain of the outgoing deck = cos(position x 90 degrees), gain of the incoming deck = sin(position x 90 degrees). Both are at 0.707 (-3 dB) at the centre. (Other curves, linear and cut, exist as a user setting; Auto DJ does not change the curve.)

Before the fade, the incoming deck's level is set by its own auto-gain trim: the analysed RMS level is moved towards -6 dB RMS, clamped to -12 dB to +18 dB; an unanalyzed track gets +9 dB. This is separate from the transition.

### 3.5 Pattern-aware chord-change deferral and Smart Cuts (tracker songs)

Two features use the notes inside a tracker module:

- **Chord deferral** (always on, independent of Smart Cuts): if the transition is at least 2 s long and the outgoing module has a chord change in the next 8 rows (half a bar at 4 rows per beat), the start is postponed by one 500 ms poll, repeatedly, up to min(5, floor(length x 0.15 / 0.5)) times. For an 8-bar fade at 125 BPM that is up to 4 deferrals (2 s).
- **Smart Cuts** (off by default): if the last 8 rows of the outgoing pattern are drum-dominated (at least 4 percussion notes and at least 3 times as many as all other notes), cut instead of fading, unless a chord change is within 16 rows, in which case crossfade. Otherwise, when the BPM difference is under 4, outgoing energy over 0.6 and the key relation is "perfect" or "energy-boost", always bass-swap (no dice).

**Status: by static reading, both features are dead in practice.** They read the loaded song from the outgoing deck, but that accessor returns nothing whenever the deck is in audio mode, and Auto DJ always loads tracks as audio (section 7). I did not run it live to confirm.

### 3.6 Skip ("Mix Now")

Skip or "Mix Now" starts the transition immediately, with no bar quantization and no phase alignment: the incoming deck is started at once and the crossfader sweeps over max(4, floor(4 bars x 4 beats / 2)) = 8 beats (3.84 s at 125 BPM), with the high-pass sweep if enabled. If the next track is not yet preloaded, it is loaded directly first (load timeout 30 s). A skip during a transition fast-completes the running one first.

### 3.7 Completion, failure handling

- A transition counts as done when the crossfader is within 2 percent of the target, the outgoing deck has stopped and the incoming deck is playing. After completion the outgoing deck's filter is reset to flat and volume to full, the crossfader is snapped exactly to the new active side, and the playlist index advances.
- Watchdogs: transition longer than 45 s is force-completed; crossfader not approaching its target for 10 polls (5 s) is forced to the target; incoming deck still silent after 10 s is force-started.
- Preload failures back off 5 s, 10 s, 20 s, 40 s then 60 s; ten failures in a row switch Auto DJ off. A network outage is detected with a health check; three consecutive failures stop the attempt.
- If a track's length is unknown (infinite), the transition fires after about 3 s of a frozen playhead.

## 4. Analysis: BPM, key, beat grid, energy

### 4.1 Audio analysis (the main path)

Run in a web worker with essentia.js on the rendered or decoded audio, mono mix of left and right:

- **BPM and beats**: essentia RhythmExtractor2013, "multifeature" method, tempo range 40 to 208 BPM. Returns one BPM, a confidence (normalized 0 to 1 from essentia's 0 to 5.32 scale) and a list of beat times. No half/double correction is applied to the BPM that is stored. (A separate correction exists only inside the genre classifier: 55 to 75 BPM with a four-on-the-floor feel and bass not heavy is treated as double, 200 to 280 BPM with low energy and regular beats as half; its result goes to the genre label, not to the stored BPM.)
- **Downbeats**: the beat list is grouped into bars. Both bar lengths 3 and 4 are tried, always starting from the first detected beat; the grouping in which the first beat of each group has the highest energy relative to the others (50 ms windows) wins. Downbeats are then every 3rd or 4th beat from beat 1 of the list. There is no search for which of the 4 (or 3) possible phases is actually the bar start: the first detected beat is assumed to be a downbeat.
- **Key**: essentia KeyExtractor over the whole signal in one pass, one key per track. Settings: key profile "bgate" (chosen for electronic dance music), 36-bin HPCP, 4096-sample frames and hop, analysis band 25 to 5000 Hz, up to 60 spectral peaks, PCP threshold 0.2, tuning reference 440 Hz with average detuning correction on. Output is a root and a scale ("A minor"). The key confidence is stored but **never used** by Auto DJ.
- **Energy**: energy = (RMS level in dB + 60) / 60, clamped to 0 to 1. So -60 dB RMS is 0 and 0 dB RMS is 1; a track at -14 dB RMS has energy 0.77. It is purely loudness: no spectral or rhythmic content.
- A "danceability" and a genre label are also produced but Auto DJ does not use them.
- Rendering limits for the playlist analysis job: 90 s of rendered audio for tracker and SID files, so their key and BPM reflect the first 90 s only. Audio files (MP3 and so on) are analysed whole.

### 4.2 Server analysis (a second, cruder path)

For Modland tracker formats that the server's Amiga emulator (UADE) can render, the playlist analysis job posts the file to the server instead, which renders 60 s and runs simple home-made detectors:

- **BPM**: autocorrelation of an onset flux (energy rise per 512-sample hop), lag range 60 to 200 BPM, with halving or doubling into 60 to 200. Rounded to 0.1.
- **Key**: 12-bin chroma from 20 evenly spaced 8192-sample windows by direct Fourier sums at note frequencies of octaves 2 to 6, correlated against the Krumhansl-Schmuckler major and minor profiles (unnormalized dot product, not Pearson correlation). Sharps are spelled as sharps (C#, D#, and so on).
- **Energy**: RMS / 0.2, clamped to 0 to 1.
- No beat grid and no downbeats are produced here.

Files that go through the in-browser essentia path instead of the server: XM, IT, S3M, MPTM, UMX, DBM, MO3, Fred Editor, TFMX (mdat), all SIDs, and local files.

**Inconsistency worth the reviewer's attention:** energy has two different scales (loudness in dB over 60 versus RMS over 0.2) and key has two different algorithms, depending only on the file format, and the playlist ranking compares them directly. A server-analysed module at RMS 0.1 (-20 dB) has energy 0.5; the same level analysed in-browser gives 0.67.

### 4.3 Tracker modules versus audio files

- No key is read from module data (notes, samples, key-signature fields). The key is estimated from the rendered audio. For chip and sampler music rendered from original hardware modules the 440 Hz reference may be off (Amiga samples are often not tuned to A440), and the detector includes an automatic tuning-offset correction (essentia path only).
- BPM: the audio analysis result is used. A fallback exists that reads the module's tempo commands (value of the F command of 32 or more in MOD and XM, T in IT and S3M, most common value in the first 8 patterns, else the header value, else 125). This ignores ticks-per-row speed, so for a tracker song the nominal "BPM" is not a musical BPM unless speed is 6 and rows per beat is 4. It is used for display until analysis arrives, and when analysis returns 0.
- Pre-rendered playback uses the same analysis as any audio file; the pattern data is kept only for display (section 7).

### 4.4 What the deck knows at transition time (likely bug)

By static reading, tracks that are preloaded for Auto DJ are loaded onto the idle deck without applying their analysis to the deck. The analysis is applied to a deck only when the deck is passed to the analyser; the Auto DJ preload passes no deck. Consequences:

- When a new file is loaded on a deck, its beat grid is cleared. For preloaded tracks nothing sets it again, so the incoming deck has no beat grid. The first track of a session, if not cached, does get one.
- The deck's stored key and energy are not cleared on load and not refreshed, so they hold the values of the track that previously sat on that deck (two tracks ago).
- The "incoming" values used by the transition-type chooser are additionally read from a snapshot taken before the new track is loaded.

So the transition-type choice (bass-swap, echo-out, filter-build) and the phase alignment probably rely on stale or missing data for every track after the first. Effects: the key-aware bass-swap rule compares the outgoing deck's key from an older track; phase alignment returns without doing anything; downbeat quantization on the outgoing deck falls back to "fire immediately" when it has no grid. I have not observed this live; it is worth a check with the DJ state tool before judging transitions by ear. Track order (Smart Sort) is not affected because it uses playlist metadata.

## 5. Tempo matching and key lock

- Target and source BPM: the analysed BPM of each deck (beat grid BPM, else detected BPM, else pitch-adjusted BPM). Note it uses the other deck's **original** BPM, not the tempo it is currently playing at.
- Candidates: direct ratio, half-time ratio, double-time ratio. The ratio closest to 1 (smallest |log2|) is chosen. Pitch offset in semitones = 12 x log2(ratio).
- The offset is clamped to plus or minus 4 semitones (ratio 0.794 to 1.26, about plus or minus 26 percent tempo). Beyond that, the tempos are deliberately left mismatched.
- Examples: 120 to 128 BPM is +1.12 semitones; 128 to 140 is +1.51; 80 to 160 matches at 0 by doubling; 100 to 135 is +5.2, clamped to +4, so the tempos end up 100 versus 126.
- Key lock: **Auto DJ never turns it on or off.** Decks start with key lock off. With it off, any tempo change also moves pitch by the same number of semitones (varispeed). Key compatibility is judged on the **original** keys and is never recomputed for the shifted pitch. A +1.12 semitone shift turns an 8A into a key about 8A + 1 semitone, which is not on the wheel.
- Tracker modules and audio use different key-lock mechanisms (native replayer versus a SoundTouch pitch shifter), but see the next point: for Auto DJ everything is audio.
- **Probable defect.** The Auto DJ tempo sync writes the new pitch offset into the application's display state only. The code path that actually changes the audio rate is a different function (the pitch fader's), which Auto DJ never calls, and I found no subscriber that copies the display value to the audio engine. By static reading, the incoming track therefore plays at its own native tempo, and the BPM match changes the numbers on screen but not what is heard. This needs to be confirmed live (play two tracks of different BPM under Auto DJ and compare perceived tempo). If true, tempo difference is never actually bridged: the fade simply blends two tempos, and the beat-matched transition's name overstates it.
- After the swap, the sync offset is not reset on the new active deck.

## 6. EQ and filter use during transitions (summary)

| Type | EQ | Filter |
|---|---|---|
| Crossfade | none | outgoing HPF 0 to -0.6 over 75 percent (about 830 Hz), then -1 (10 kHz); only if Filter is on |
| Bass-swap | outgoing low band -12 dB from the midpoint | none |
| Filter-build | none | incoming HPF -0.8 (about 2.9 kHz) to flat over 100 percent; outgoing HPF to -0.8 over 75 percent |
| Echo-out | none | none |
| Cut | none | none |

Kill switches (full band kill) exist on the deck but Auto DJ only uses the -12 dB low cut. The EQ range is limited to plus or minus 12 dB. Resonance of the filters is the user setting (default 1).

## 7. How tracker modules are loaded for Auto DJ

All sources (Modland download, HVSC SID download, local files) go through a background render: UADE (Amiga formats) or libopenmpt or the SID emulator renders the whole song to a WAV, with a 60 s timeout; analysis runs on it; the WAV is cached. At transition time the WAV is loaded onto the idle deck as an audio file. The module is attached for pattern display only, and the deck is put in audio mode. Because it plays as audio, there is no per-channel muting, no live tempo change by the module's own tempo commands beyond what is baked into the render, and no tracker-native key lock.

Loop handling: the length of the rendered file defines the track length, so a module with a looping end is played as rendered once through; the time-remaining check is on the rendered duration. Modules with unknown duration use the frozen-playhead rule (section 3.7).

## 8. Disable, pause, skip behaviour

- **Disable**: stops the poll and cancels any running transition; the current track keeps playing; state goes to idle.
- **Pause**: stops the poll; if mid-transition, forces it to complete (crossfader snapped to the incoming side, outgoing deck stopped) so the decks are not left half-mixed.
- **Resume**: restarts the poll.
- **Skip**: section 3.6. Also available as a Mix Now button and as remote tools (dj_auto_dj_enable, dj_auto_dj_disable, dj_auto_dj_skip).
- **Jump to a track**: loads it on the idle deck and transitions with the skip settings (4-bar skip, 8 beats).
- If the active deck is paused by something else during playback, Auto DJ resumes it.

## 9. Open questions for the reviewer

Musical decisions the code makes that a theorist can judge:

1. **Which Camelot moves are allowed and how they rank.** Ranking for order (lower is better): same key -20, one step clockwise or counter-clockwise on the same ring -12 (both equal), relative major/minor -5, anything else +50. Is it right that the relative major/minor (a very safe mix, shares all notes) ranks below a fifth-up move? Is a symmetric score for fifth-up and fifth-down right, given that the code's own labels call +1 an "energy boost" and -1 an "energy drop"?
2. **Moves the code treats as clashes that DJs commonly use:** the diagonal moves (number +1 with the other letter, for example 8A to 9B), the +2 "energy jump", and the "semitone up" boost (+7 on the wheel). Also the two-step moves on the same letter (8A to 10A). All score +50. Should any be allowed or given a milder penalty?
3. **Key detection quality.** One key per whole track from essentia with the "bgate" profile (intended for electronic dance music) applied to rendered tracker, chip and SID music, and for the first 90 s only for modules. Is a single global key meaningful for music that modulates, or that is modal, or that is largely percussive or atonal? Chip music in particular often has arpeggios and no sustained chords; is a Krumhansl-type profile appropriate? The server fallback uses an unnormalized dot product with Krumhansl-Schmuckler profiles rather than correlation, which biases toward bright chroma peaks.
4. **Tuning.** Amiga and other module samples are often not at A440, and chip tuning tables differ. Only the essentia path applies a tuning-offset correction. Does a quarter-tone offset make the Camelot label unreliable?
5. **Tempo bridging.** Allowed range is plus or minus 4 semitones of varispeed (about plus or minus 26 percent), with half-time and double-time equivalence, and no key lock. If it worked as written, a 4-semitone shift would move a mix from 8A to a key a major third away. Should key and tempo be bridged jointly: choosing the shift also by the key relation of the shifted key, or enabling key lock when the shift is large? What is a reasonable limit (DJ convention is often plus or minus 6 to 8 percent)? Also, if the sync is indeed display-only (section 5), what is the right fallback for large tempo gaps: a cut, an echo, a breakdown-to-drop?
6. **Smart Sort tempo penalty.** Quadratic with 0.8 x d squared; 3 BPM costs 7.2, 6 BPM costs 28.8, 10 BPM costs 80. Compared with a -20 reward for a perfect key and +50 for a clash. Is the balance right, for example is a perfect key worth a 5 BPM jump (cost 20)? Is a quadratic penalty over absolute BPM right, versus a percentage (a 6 BPM gap at 70 BPM is far larger than at 170)?
7. **Energy is only loudness.** (RMS dB + 60) / 60. Dance music mastered at similar loudness all lands near 0.7 to 0.85. The ranking rewards small steps (0.05 to 0.2) and steady direction. Is loudness a meaningful proxy for energy in tracker and chip music, where loudness reflects rendering gain rather than intensity? The arc heuristic starts at low-median energy and prefers continuing in the same direction; is there a missing "come down" step so the set does not climb monotonically?
8. **When transitions start relative to phrases.** The code counts bars (2 to 32) back from the end of the audio and waits for the nearest bar downbeat of the outgoing track. It does not know phrases (8, 16, 32 bar units), intro and outro sections, breakdowns, or where the outgoing track's final phrase begins. The incoming track always starts from its first sample. Should the fade length snap to the number of bars to the outgoing track's last phrase boundary, and should the incoming start at its first downbeat after any silence or pickup? Is the default 8 bars long enough for key clashes to be tolerable, or should the length depend on key relation (longer for compatible, shorter for clashing)?
9. **Downbeat detection.** Bar grouping assumes the first detected beat is a downbeat and chooses 3 versus 4 only by an accent score. For music with an anacrusis, a long intro with no kick, or syncopation, the bar line may be on the wrong beat, and "phase align to the bar" would then align the wrong beats. Is there a better cheap heuristic?
10. **Transition style rules.** The dice: 30 percent bass-swap when keys match and energy is high and tempos are within 4 BPM, 50 percent echo-out when energy drops by more than 0.15, 40 percent filter-build when energy rises by more than 0.10. Are the thresholds musically defensible? Is bass-swap the right choice for harmonic matches (it blends bass of two keys for half the fade; with a 12 dB cut instead of a full kill the two basslines overlap at -12 dB)? Is bass-swap appropriate at all for melodic bass in tracker music?
11. **Crossfade EQ behaviour.** A plain crossfade blends full-range signals of two unrelated keys for the whole fade (default 8 bars) with only a high-pass on the outgoing track (to about 830 Hz, then 10 kHz at 75 percent). There is no low-band handover by default. Would a bass handover be better for every crossfade, or is a long full-range blend acceptable for harmonically unrelated pairs?
12. **High-pass snap at 75 percent.** The outgoing filter jumps from about 830 Hz to 10 kHz when the sweep ends (75 percent of the fade). Is a step at that point audible or a deliberate "vanish"?
13. **Chord-aware deferral.** If the tracker-pattern features were live, they hold the fade for up to 2 s when a chord change is within half a bar. Is "wait for the chord to resolve then fade" the right idea, versus fading so that the incoming chord arrives on the outgoing chord change?
14. **Unknown or low-confidence keys** are treated as present keys. A failed analysis ("Unknown") scores as a clash (+50) in ordering and "clash" in transition choice, while a missing value scores a mild +5. Should unknown be neutral in both places? The key-detection confidence is stored and ignored; should a threshold turn a low-confidence key into "unknown"?
15. **The relative major or minor as a transition.** It is named "mood-change" and excluded from the bass-swap rule, which allows only "perfect" and fifth-up. Is excluding the relative key and the fifth-down from the harmonic bass-swap deliberate-sounding or an oversight?

## 10. Things I could not confirm, and where I looked

- Whether the audible tempo actually changes during Auto DJ (section 5): I searched all of src for readers of the pitch offset value and for subscribers to the DJ store; only the pitch fader's own action drives the audio engine. Not run live.
- Whether analysis data reaches the incoming deck (section 4.4): I read the track loader, the pipeline and the deck-state writer. Not run live.
- Chord-change detection internals (the function that finds chord changes in a tracker pattern lives in src/bridge/analysis/MusicAnalysis.ts); I read how it is called, not how it decides.
- The Tone.js EQ crossover frequencies (400 Hz and 2.5 kHz) are library defaults; I saw no override in the deck engine.
- Stem pre-separation and automatic dub (settings stored with Auto DJ config) were not examined; they do not alter timing or key logic as far as I saw.
- I did not read the stored-analysis server cache (src/server analysis route and cache) beyond its role of returning the same fields; I did not check whether cached values pre-date the key-detector fix mentioned in the code (an earlier build returned "Unknown" for every key).

## Appendix: file and line map

All paths under /Users/spot/Code/DEViLBOX. Line numbers as of this commit.

Auto DJ state machine, src/engine/dj/DJAutoDJ.ts
- Constants: poll 500 ms line 35; preload lead 60 s line 36; defer constants lines 45-51; defer cap function lines 66-72; skip attempts 50 line 73; preload retries 10 line 75; skip bars 4 line 76; transition timeout 45 s line 140; stuck polls line 141.
- enable (Smart Sort, deck choice): 150-300. skip: 399. pollLoop: 471; transition-pending trigger and chord deferral: 534-580; transitioning watchdogs: 583-660; backoff: 665-685.
- preloadNextTrack: 710. shouldDeferForPatternData: 851. triggerTransition: 883. selectTransitionType: 1056. completeTransition: 1162. getTimeRemaining: ~1245. getTransitionDurationSec: 1284. computeNextIndex and shuffle: 1293-1320.

Quantized transitions and sweeps, src/engine/dj/DJQuantizedFX.ts
- Sweep timer and ease: 49-75. scheduleQuantized and jitter: 97-135. filterSweep: 298 (initial jump 327). crossfaderSweep: 379. beatMatchedTransition: 441. skipTransition: 523. cutTransition: 590. filterBuildTransition: 624. bassSwapTransition: 687. echoOutTransition: 768. echoOut: 814.

Tempo and phase, src/engine/dj/DJAutoSync.ts
- Max shift 4 semitones: 46. syncBPMToOther: 59. phaseAlign: 95. timeToNextDownbeat: 162. autoMatchOnLoad: ~300. getBestBPM: 346. getPhaseInfo: 367.
- Pitch fader action that does reach the audio: src/engine/dj/DJActions.ts setDeckPitch ~846. Store-only setter: src/stores/useDJStore.ts 565. Engine pitch and key lock: src/engine/dj/DeckEngine.ts 736 (setPitch), 802 (setKeyLock); pitch/key-lock math src/engine/dj/computeKeyLockShift.ts.

Keys, src/engine/dj/DJKeyUtils.ts
- Name to Camelot table: 29. keyCompatibility: 128. Wheel model: ~200.

Smart Sort, src/engine/dj/DJPlaylistSort.ts
- Parameters: 22-42. transitionScore: 45. smartSort: 105. Pre-sort in enable path: src/engine/dj/DJActions.ts 1012.

Analysis
- Worker: src/workers/dj-analysis.worker.ts: rhythm 139; downbeats 181; loudness 249; energy line 418; genre half/double correction 428-446; message handler 925.
- Key extraction settings: src/workers/analyzeKey.ts 33-60.
- Pipeline applying results to decks: src/engine/dj/DJPipeline.ts: auto-gain 35-47; cache-hit path 481-520; applyResultToDeck 688-720.
- Playlist analysis job (server versus browser route): src/engine/dj/DJPlaylistAnalyzer.ts 122, 360-370, 474-530.
- Server fallback analyser: server/src/routes/render.ts: render seconds 46; BPM 276-320; key 322-390; energy 393-402; route 405-460.
- Tracker tempo-command fallback: src/engine/dj/DJBeatDetector.ts 22-60.

Loading and mode
- Pre-render and load: src/engine/dj/DJTrackLoader.ts 73 (preRenderTrack, 60 s timeout), 128 (loadPreRenderedTrackToDeck, song deliberately not passed), 343 (loadPlaylistTrackToDeck, 30 s timeout).
- loadAudioToDeck (sets BPM, mode audio): src/engine/dj/DJEngine.ts 179. Beat grid cleared on file change: src/stores/useDJStore.ts 538-550. Loaded-song accessor returns null in audio mode: src/engine/dj/DeckEngine.ts 1926.

Mixer
- Crossfader gains: src/engine/dj/DJMixerEngine.ts 42-66 (default curve smooth, line 98). Filter mapping: DeckEngine.ts 1718. EQ clamp: DeckEngine.ts 1578.

Smart Cuts helpers: src/engine/dj/smartCuts.ts (drum-break tail, chord-change imminent).

Settings and UI: src/stores/useDJStore.ts 285-336, 460-467, 795-800 (defaults and config); src/components/dj/DJAutoDJPanel.tsx 37 (bar options); remote tools: src/bridge/handlers/djHandlers.ts 211-226.
