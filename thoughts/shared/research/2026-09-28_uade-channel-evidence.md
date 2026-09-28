---
date: 2026-09-28
topic: What evidence DEViLBOX has for UADE / Amiga-replayer channels
tags: [channel-intelligence, uade, classification]
status: final
---

# UADE channel evidence — measured 2026-09-28

Question: do Amiga formats whose replayers build instruments in code
(Hippel, David Whittaker, TFMX, FC...) need register-level evidence (Paula
writes) to classify their channels, as the Channel Intelligence plan
section 6 suggests?

## Sources that exist
- Pattern notes, reconstructed per format (get_channel_evidence).
- Live per-channel audio via the oscilloscope store -> ChannelAudioClassifier
  (`updateChannelClassifierFromTap`), fed ONLY from AutoDub's tick loop
  (`AutoDub.ts updateRuntimeClassifierFromOscilloscope`).
- Register level, already captured and unused for classification:
  `UADEEngine.getPaulaLog()` (PaulaLogEntry: channel, reg LCH/LCL/LEN/PER/VOL/DAT,
  value, tick) and tick snapshots (`UADEChannelTickState`: period, volume, lc,
  len, dmaEn, triggered).

## Measured (live tab, audio running, AutoDub on intensity 0)
| Song | Plays | Scope | Note onsets per channel | Roles (final / offline / runtime) |
|---|---|---|---|---|
| apb.dw (David Whittaker) | yes, rms 0.36 | Paula 0-3 active | 8 / 64 / 0 / 0 | pad, percussion, bass, bass / pad, pad, empty, empty / lead .4, perc .8, bass .85, bass .85 |
| prehistoric_tale.hipc (Hippel-CoSo) | SILENT (rows advance, rms 0) | inactive | 174 / 174 / 232 / 51 | pad, bass, bass, bass / same / null x4 |

## Conclusions
1. Where the format plays through UADE with the Paula scope, runtime audio
   evidence already classifies channels the notes cannot (DW ch3/4: 0 notes,
   bass 0.85 from audio). Register-level evidence is not the next need there.
2. Hippel-CoSo plays SILENT in the current build - a playback bug, and the
   reason both audio evidence and the scope are absent. Fix that first.
3. Note-only evidence collapses to all-bass on low note numbering (Hippel:
   bass x3), the same class as the AHX finding (MusicAnalysis bass rule on
   absolute octave). `8b17394bd` made bass relative for some paths; the Hippel
   result says not for this one - check where.
4. Register-level evidence would still help when AutoDub is off (runtime
   classifier idle) and for formats with no scope; revisit after 2 and 3.

## Unverified
- Whether Hippel-CoSo is silent for every .hipc or only this file (1 file
  measured). Where looked: one file in public/data/songs/formats.
