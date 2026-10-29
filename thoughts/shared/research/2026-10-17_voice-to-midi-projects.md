---
date: 2026-10-17
topic: Best open-source voice-to-MIDI (humming) and beatbox-to-drum approaches vs Basic Pitch
status: draft
---

# Voice to MIDI: what to adopt

Method: web search + README fetches, 2026-10-17. Anything marked (unverified) was not confirmed from a primary source. Repo activity dates were NOT shown by the fetch tool for most repos; treat "last activity" as unknown unless stated.

## Ranked table (melody)

| Rank | Candidate | Pitch method | Note segmentation | Browser? | Licence | Evidence |
|---|---|---|---|---|---|---|
| 1 | SwiftF0 (lars76/swift-f0) | Small 2D CNN on STFT, 16 kHz, 16 ms hop, per-frame voicing 0.5. Params: 95,842 per arXiv summary vs 14,386 per repo page (conflict, unverified which) | Ships `segment_notes()` (contour to Note list; method not read) | Yes: author demo runs in WASM + ONNX (swift-f0.github.io); ONNX file size unverified | MIT | Paper: 91.8% harmonic mean at 10 dB SNR, >12 points over CREPE in noise; ~42x faster than CREPE on CPU. Repo has only ~10 commits; last push reported Sep 2025 by a third party |
| 2 | PESTO (SonyCSLParis/pesto) | Siamese, self-supervised, VQT frames, ~130k params, argmax-local weighted average, per-frame confidence | None (pitch only) | ONNX export exists (0.7 ms), stateless with cache input, fixed sample rate/step; browser use not documented | LGPL-3.0 (friction for a bundled web app) | TISMIR 2025: RPA 97.7% MIR-1K, 97.0% MDB-stem-synth (same-dataset training); 94.8% cross-dataset; CREPE 97.5/97.3 |
| 3 | pYIN + HMM note segmentation (Tony, QMUL; LibPyin C++) | pYIN: YIN candidates + HMM Viterbi over pitch/voicing | Two-stage HMM on smoothed pitch track gives notes; this is the reference "sung note" algorithm and is how vocadito's labels were made | Not as a ready JS lib. LibPyin is C/C++ (port to WASM = own build work); pitchfinder/pitchlite do YIN/MPM only, no pYIN | Tony GPL (unverified); LibPyin unverified | Known failure: adjacent vowels of similar pitch merge into one note (Li, Demirel, Proutskova, Dixon, NLP4MusA 2021). No numbers read |
| 4 | CREPE (marl/crepe) | CNN on raw 16 kHz audio, optional Viterbi smoothing (off by default) | None | No JS/ONNX port found in my search (unverified); 22M params full | MIT | 97.5% RPA MIR-1K, 97.3% MDB-stem-synth (from PESTO table). Heavy; noise-brittle per SwiftF0 paper |
| 5 | Spotify Basic Pitch (current) | Polyphonic multipitch + onset + note posteriorgrams, 22.05 kHz | Onset/frame thresholds in `outputToNotesPoly` | Yes (what we ship) | Apache-2.0 | Paper: instrument-agnostic, "works best on one instrument at a time", vocals only claimed to generalise |
| 6 | NeuralNote | v2 reportedly replaced Basic Pitch with MuScriptor transformer (103M-1.4B params, GGUF) | n/a | No (desktop plugin, GPU recommended) | Code Apache-2.0, weights CC BY-NC 4.0 (non-commercial) | Not reusable here |
| 7 | Voice-Maestro (RamakanthRGunishetty) | README: "librosa used for pitch extraction and transformation"; unnamed "deep learning models" | None documented | No: Flask + librosa backend, React front end | None shown | Only README + root file list read (`backend/` URL 404 on tree path). A voice-to-instrument-timbre demo, not a transcriber. Nothing to learn from |
| - | DDSP tone transfer | Uses CREPE f0 + loudness as controls; synthesis, not transcription | n/a | tfjs demo exists (unverified) | Apache-2.0 (unverified) | Wrong tool |
| - | vocadito | A dataset: 40 excerpts, f0 + note + lyric labels, two annotators. Use as the test set, not a model | - | - | unverified | Paper says quantising f0 does not give a reasonable note estimate; annotator note agreement is low |

## Ranked table (beatbox to drums)

| Candidate | What | Method | Browser? | Licence | Evidence |
|---|---|---|---|---|---|
| AVP dataset (Delgado et al., Audio Mostly 2019, zenodo 3250230) | 9,780 utterances, 28 people, 4 classes (kick, snare, closed hat, open hat), onset-annotated | Dataset + onset baselines only. No classification baseline in paper | n/a | Not stated on page (unverified; check zenodo) | Onset F1: Complex 0.95, HFC 0.94, CNN/RNN 0.89 |
| LVT (Ramires et al., arXiv 1811.02406) | Max for Live device | Onset detector, hand features, kNN, per-user Sequential Forward Selection of features | No (Max external) | Code location/licence not found (unverified) | Concept is directly portable |
| McGill / ACE 2005 | 5-class unvoiced beatbox | AdaBoost + C4.5 on spectral features | n/a | n/a | 95.55% accuracy, one performer |
| Beatbox DB (ICASSP 2015, UMONS) | 9,000+ events, 48 kHz | Dataset | n/a | unverified | - |

No pretrained open beatbox classifier ready for the browser was found.

## What Basic Pitch does wrong for humming

1. It is a polyphonic, instrument-agnostic multipitch model; its README says it "works best on one instrument at a time" and the paper only claims it generalises to vocals (arXiv 2203.09893 abstract; spotify/basic-pitch README). Nothing is tuned for a voice.
2. A voice has harmonics and formants that move with the vowel. In "ooo eee" the vowel change shifts the harmonic balance, so a multipitch model sees evidence for the 2nd/3rd partial and for pitch-class neighbours; each is a candidate note. This is my inference from the model class, not measured; it should be confirmed by dumping the onset/frame matrices for a take.
3. Onsets are learned from instrument attacks. Vowel transitions, vibrato and amplitude modulation also trigger them (onset-detection literature calls the singing voice the hardest monophonic case: vibrato causes energy-based false positives; ISMIR 2005 paper 113, from search snippet, unverified in detail).
4. Our fix is downstream: `toMonophonic` keeps the loudest of overlapping notes and drops the rest, `mergeSplitNotes` joins same-pitch notes within 2 frames, an octave fix from audio. These repair symptoms of a polyphonic decoder. The thresholds in `DEFAULT_PITCH_SETTINGS` (onset 0.5, frame 0.3) were loosened to keep sagging sung notes, which also admits ghost notes. Wrong notes arise in the decode step, not in post-processing.
5. Frame rate is 22050/256 = 86 fps over an architecture with limited time smoothness; a monophonic path tracker (Viterbi) gives one pitch per frame by construction, so extras cannot exist.
6. Note: the Basic Pitch paper evaluates note F1 on instruments; I found no published vocal note F1 for it (unverified).

## What the alternatives do differently

- Monophonic F0 tracker (SwiftF0/PESTO/CREPE/pYIN): one pitch + voicing per frame. Wrong extra simultaneous notes are impossible; remaining errors are octave jumps and segmentation.
- Segmentation happens on the pitch contour: pYIN/Tony run an HMM over smoothed pitch (state per note, transitions penalised); a change from one stable pitch to another splits the note, a vowel change at the same pitch does not (Tony's known weakness, only fixed with phoneme info, Li et al. 2021). For "ooo eee" at two alternating pitches the pitch step is the split signal, so pitch-contour segmentation is the right tool and a phoneme model is not required.
- Voicing from the tracker replaces our energy gate (`voiceGateLevel`).

## Recommended

**Melody: SwiftF0 for frame F0 + voicing (MIT, tiny, ONNX/WASM demo exists, noise-robust), with our own pYIN/Tony-style note segmenter on its contour** (median-smooth in cents; hysteresis/2-state HMM on pitch change > about 0.5-0.7 semitone sustained for N frames; voicing dips or energy dips as boundaries; round to semitone by median of the stable span; keep Basic Pitch only for the polyphonic sample-editor Audio to MIDI path).
Decisive trade-off: you give up Basic Pitch's built-in note events and must write and tune the segmenter (about 150 lines, testable on vocadito and on a synthetic alternating-pitch fixture), in exchange for removing the whole class of spurious simultaneous notes. PESTO is the fallback if SwiftF0 accuracy on voice disappoints, but LGPL-3.0 and a fixed-rate stateless ONNX are worse fits.

**Drums: keep our onset detector (`detectOnsets`, comparable to AVP's best baselines, HFC/Complex F1 about 0.94-0.95) and replace the hand-written rule classifier (`classifyByRules`) with a small trained classifier (kNN or tiny MLP on spectral/MFCC features, LVT-style) trained on AVP, with an optional per-user calibration pass (record 3 kicks/snares/hats, as LVT's per-user feature selection).**
Decisive trade-off: needs a training step and a licence check on AVP (unverified, check zenodo 3250230) and the model is biased to AVP's mics; per-user calibration costs the user 10 seconds but is the part that actually fixes "weak detection". We already have `featureVector()` for a trained model.

## Open items (unverified)

- SwiftF0 parameter count (95,842 vs 14,386), ONNX file size, `segment_notes` algorithm, repo activity.
- AVP licence; LVT code availability.
- Any published vocal note-F1 for Basic Pitch / SwiftF0 / PESTO on vocadito.
- Voice-Maestro backend source was not read (tree URL 404); only README.
- Validation plan: build a vocadito + "ooo eee" fixture and compare note F1 before adopting anything.

## Sources

arXiv 2508.01488 (PESTO); github.com/SonyCSLParis/pesto; arXiv 2508.18440 and github.com/lars76/swift-f0 (SwiftF0); github.com/marl/crepe; github.com/spotify/basic-pitch; arXiv 2203.09893; arXiv 2110.05580 (vocadito); NLP4MusA 2021 Li et al.; code.soundsoftware.ac.uk Tony/pYIN; github.com/DamRsn/NeuralNote; arXiv 2009.11737 (AVP); arXiv 1811.02406 (LVT); github.com/RamakanthRGunishetty/Voice-Maestro.

## Open items resolved (2026-10-17)

### 1. SwiftF0 (github.com/lars76/swift-f0, pip swift-f0)

Sources: README https://github.com/lars76/swift-f0 ; code read from https://raw.githubusercontent.com/lars76/swift-f0/main/swift_f0/core.py and .../music.py ; model downloaded and measured.

- Parameters: 14,386 (README states it).
- Model file: swift_f0/model.onnx, 135,090 bytes (about 132 KB, measured by download). Raw URL: https://raw.githubusercontent.com/lars76/swift-f0/main/swift_f0/model.onnx . Licence: MIT (LICENSE file, 1076 bytes, and README).
- Input spec (core.py): mono float32 audio at 16000 Hz; hop 256 samples = 16 ms = 62.5 frames per second. Session inputs by name: "audio" (shape [1, samples]), "fmin" (float32 scalar), "fmax" (float32 scalar). Outputs: "pitch" (Hz per frame) and "confidence" (0-1 per frame). The Python wrapper adds a third derived series, loudness_db, computed outside the graph from the raw hops.
- Range: FMIN 46.875 Hz, FMAX 2093.75 Hz (95 log-spaced pitch steps). Caller may narrow with fmin/fmax. Voiced when confidence >= 0.5.
- Preprocessing: no STFT outside the graph. The ONNX takes raw audio; the STFT (matrix-product STFT, resampled onto the 95 log steps) is inside the graph (ONNX contains an STFT doc string and 18 Conv nodes; the article describes 512/1024/2048 windows). The Python wrapper only resamples to 16 kHz (soxr), sets confidence to 0 where a hop peaks below 1e-3 (digital silence guard), and windows long files in 1875-frame chunks with 11 frames left context and 10 frames lookahead. Receptive field is 2815 samples each way, so a streamed frame is final after 10 later frames (about 176 ms lookahead).
- Browser demo: https://swift-f0.github.io/ (repo swift-f0/swift-f0.github.io, MIT), "runs entirely client-side with ONNX Runtime Web". Read from its minified bundle: microphone via getUserMedia (echoCancellation off, noiseSuppression off, autoGainControl on, mono), an AudioContext created at 16000 Hz, captured through an AudioWorkletNode named "capture" (ScriptProcessor 4096 fallback), chunks appended to a growing buffer; files via decodeAudioData / OfflineAudioContext. It runs on the whole recorded buffer and then draws pitch, confidence, loudness and notes (not a live streaming path). Unverified: exact onnxruntime-web execution provider.

### segment_notes algorithm (music.py, read verbatim)

Signature: segment_notes(result, *, pitch_hold_ms=80.0). Constants: FRAME_PERIOD 16 ms; pitch_hold_ms 80; beta = 80/16 = 5 frame-costs; clip of confidence to [0.01, 0.99]; offpitch cap 2 semitones; quiet margin 10*log10(2) = 3.01 dB; neighbourhood 64 ms (4 frames each side, symmetric padding).

1. Validate: timestamps finite, non-negative, spaced exactly 16 ms; confidence in [0,1]; loudness finite. No valid pitch (finite and > 0) anywhere: return no notes.
2. Per frame convert pitch to fractional MIDI m = 69 + 12*log2(f/440). Weight w = confidence for valid frames, 0 otherwise (a frame without pitch has w = 0).
3. Per-frame cost q = unvoiced + quiet. unvoiced = -ln(c/(1-c)) with c = clip(w, 0.01, 0.99); this is negative (a reward) for confident frames and positive for unconfident ones. quiet = max(0, min(L, R) - level - 3.01 dB), where L and R are the maximum loudness_db over the 5 frames ending at / starting at this frame (the 64 ms window on each side); a frame that is more than 3 dB below the loudest frames on both sides pays the shortfall in dB. This is what splits repeated same-pitch notes at a loudness dip.
4. Candidate note pitches mu = every distinct observed frame pitch in semitones, rounded to a cent (0.01 semitone).
5. Objective: J = sum over notes of [beta + sum over its frames of (offpitch + unvoiced + quiet)], frames outside any note (gaps) cost nothing. offpitch = w * min(|m - mu|, 2). Each note has exactly one mu.
6. Solve exactly with dynamic programming over frames t: keep for each candidate mu the best open-note cost vn[mu]; at each frame the option to open a new note costs best_so_far + beta (kept if cheaper than continuing, recording the start frame); add this frame's cost to every open candidate; if the best open candidate beats the best so far (best < 0 initially 0, i.e. the note has net negative cost), close the note there and record its start and candidate; otherwise extend the gap.
7. Backtrack from the last frame to recover (start frame, end frame, mu) per note. start = timestamp of first frame; end = timestamp of last frame + 16 ms; pitch_hz = 440 * 2^((mu - 69)/12).
8. MIDI export (export_to_midi): note number = floor(69 + 12*log2(f/440) + 0.5), clamped 0..127; default velocity 80 fixed (no per-note velocity), tempo 120, 480 ticks per beat, minimum one tick per note.

Behaviour notes from the docstring: at 0 ms every pitch change starts a note and frames at or below confidence 0.5 are dropped; a one-semitone change must last more than 80 ms; two semitones or more need half that; returning to the old pitch needs twice as long; 5 minutes of audio take about 0.2 s. Notes carry no velocity or loudness; only start, end, pitch_hz.

### 2. AVP dataset and LVT

- AVP (Amateur Vocal Percussion), https://zenodo.org/records/3250230 : licence CC BY 4.0; one archive AVP_Dataset.zip, 229.6 MB; 280 audio files; 9,780 utterances; four classes (kick, snare, closed hi-hat, open hi-hat); 28 participants with little or no beatboxing experience; recorded on a MacBook Pro built-in microphone, indoors (the recording description on the Zenodo page; paper: https://arxiv.org/abs/2009.11737 notes varied mics/conditions, so treat as partly unverified). Audio file format and sample rate not stated on the Zenodo page: unverified (inspect the zip).
- LVT (Live Vocalised Transcription) is by Ramires, Penha, Davies (INESC TEC), not Delgado; paper https://arxiv.org/abs/1811.02406 . It is a Max for Live device: onset detection, features, k-NN, user-trained. The only code repo found, https://github.com/aframires/Live-Vocalised-Drum-Transcription, is EMPTY (GitHub API: "This repository is empty", last push 2019-04-21) and has no licence. Treat LVT code as unavailable; use the paper only. Delgado et al. (QMUL/Roli) are the AVP authors; their 2022 work lists a code implementation, which I did not locate (unverified).

### 3. Published vocal note-level F1

- Not found. SwiftF0's paper (https://arxiv.org/abs/2508.18440) reports frame-level pitch metrics only (e.g. 91.80 % harmonic mean at 10 dB SNR; Basic Pitch is a baseline on vocadito, Bach10-mf0-synth, SpeechSynth), not note F1. PESTO and Basic Pitch note-level F1 on vocadito / MIR-ST500 did not appear in searches. The vocadito paper (https://arxiv.org/abs/2110.05580) has baseline note results for other algorithms, but I could not read its table (PDF unreadable via fetch): unverified which algorithms and values. SwiftF0's own note segmenter has no published note F1 that I found.
