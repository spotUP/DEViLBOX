# Jingle word timings (public/devilbox1.mp3)

Method: ffmpeg decode to mono 44.1 kHz float; 10 ms RMS; 20 ms band spectra (<200, 200-800, 0.8-2.5k, 2.5-6k, >6k Hz); also a 300-3400 Hz band-limited copy. Scripts and intermediates: /Users/spot/.claude-private/jobs/90c1915b/tmp/.

## Measured

- Decoded duration: 11.163 s.
- Audible end: last 10 ms window above -50 dBFS at 6.49 s; above -40 dBFS at 6.09 s. Everything after about 5.65 s is a quiet decaying tail (-25 dBFS dropping to -50 dBFS); the full-level content ends at 5.64 s.
- RMS above -30 dBFS (full band): one single segment 0.000 to 5.670 s, peak -2.8 dBFS, mean centroid 3007 Hz. There are no gaps in it.
- Band-limited 300-3400 Hz, above -30 dBFS: 0.000-0.830, 0.870-2.460, 2.490-5.260, 5.320-5.580 s (peaks -13 to -17 dBFS, centroids 1000-3500 Hz). The short gaps at 0.84-0.86, 2.47-2.48 and 5.26-5.31 are the only places the mid band falls under -30.

## Voice versus music: not separable by envelope

A constant low drone (below 200 Hz, about 53 dB) runs from 0 to 5.6 s and dominates the broadband RMS, so the -30 dBFS threshold cannot isolate speech. Band-limiting to 300-3400 Hz leaves a flat envelope of about -17 dBFS with no word-like on/off structure, so a voice (if any) is mixed into dense synth material at similar level. The clip reads as a produced jingle, not a clean spoken line. I could not hear it; the syllable layout below is inferred from spectral events only.

## Spectral events (measured), usable as syllable boundary candidates

| Time (s) | Event | Notes |
|---|---|---|
| 0.00 | onset | broad burst, centroid ~4 kHz |
| 0.76-0.90 | high-band (above 2.5k) drops to about 13 dB, mid falls under -28 dBFS | quiet gap, centroid ~800-1100 Hz |
| 0.92-0.98 | high-band returns, flux peak | new onset |
| 1.88-1.98 | mid and high dip, flux 215-356 | gap/onset |
| 2.04-2.34 | strong 2.5k+ and 6k+ energy (about 40 dB), centroid 4-5.5 kHz | sibilant-like or hi-hat noise, ~0.3 s |
| 2.36-2.50 | high bands collapse to ~17 dB, flux 276-328 | gap, centroid ~1.1 kHz |
| 2.52-2.70 | onset, flux up to 300 | new phrase |
| 2.7-5.10 | steady dense texture, centroid ~3.1 kHz, small flux spikes at 2.80, 4.72-4.78, 4.90-5.02 | no word gaps |
| 5.14-5.36 | high bands collapse (6k+ about 6 dB), centroid 400-900 Hz | gap |
| 5.40-5.50 | one short onset | last event before tail |
| 5.64 | end of full-level audio | tail follows |

## Syllable grouping (GUESSED, low confidence)

| Start | End | Label | Confidence |
|---|---|---|---|
| 0.00 | 0.90 | DE | low (guess; bounded by measured gap at 0.76-0.90) |
| 0.92 | 1.90 | VIL | low |
| 1.98 | 2.35 | BOX (X as the 2.04-2.34 noisy burst) | low-medium (the noise burst fits an X/S sound) |
| 2.35 | 2.52 | pause between words | low-medium (measured collapse of high bands) |
| 2.52 | 5.14 | RE-A-DY | very low (no internal boundaries visible; could be music only) |
| 5.14 | 5.64 | outro | measured gap/onset, label unknown |

Recommendation: do not write final lip-sync keyframes from this. Have a person listen, or play the file in the app and tap the word times, then use the measured events above as snap points.
