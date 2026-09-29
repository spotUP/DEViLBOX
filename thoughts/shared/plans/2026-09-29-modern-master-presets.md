---
date: 2026-09-29
topic: Modern, precision master FX presets with sidechain keyed on the song's drums
tags: [master-fx, presets, sidechain, classifier]
status: draft
---

# Modern master presets

Owner ask (2026-09-29): "add some new master fx presets that combines all our
effects and makes the output sound super modern and polished with side
chaining and the whole thing, let's see how modern and precision/surgically
modern produced we can get devilbox make mods sounds!"

## Problem

1. A preset cannot say WHICH channel keys the sidechain: `sidechainSource` is
   a fixed channel index (types/instrument/effects.ts:116), and the kick sits
   on a different channel in every song.
2. The key tap needs an isolation slot (ChannelRoutedEffects
   `_allocateSidechainSlot`), which Hippel/TFMX, Sonix, Cinter4 and SunTronic
   do not have - they fall back to keying on the compressor's own input. Every
   engine now has per-channel COPY outputs (dub sends, outputs 5+ch), which
   is all a key needs.
3. No existing preset uses the precision tools (EQ8Band, ResonanceTamer,
   DynamicEQ, MultibandComp, MultibandEnhancer, Maximizer).

## Decisions

- D1 `sidechainSource = -2` means "the song's drums, automatically": resolved
  when the chain is wired from the classifier roles (classifySongRoles) - the
  channel classified percussion/kick, else the first percussion channel, else
  none (own input). Re-resolved when a new song loads. The Key picker offers
  it as "Drums (auto)".
- D2 When the playing engine has no isolation slots, the key taps the
  channel's dub-send copy output. The kick then stays in the ducked mix; the
  compressor's attack lets its transient through. Isolation engines keep the
  existing path.
- D3 No stereo widening on any preset ([[feedback-amiga-stereo-gigs]]); the
  only width move is narrowing the lows to mono (MultibandEnhancer lowWidth 0).
- D4 Gain compensation MEASURED with tools/fx-preset-audit.ts --only <name>,
  never guessed.
- D5 New tag 'Modern' so the four presets group together.

## Checklist

- [ ] P1 Drums (auto) key: resolver + wiring in MasterEffectsChain build and
      parameter-change paths + ChannelRoutedEffects sidechain wiring +
      re-resolve on song load + Key picker option. Test: resolver on
      nicktune1.bp picks channel index 1; reachability: master chain with
      -2 keys the compressor on that channel.
- [ ] P2 Key tap through the dub-send copy output for engines without
      isolation slots. Test: harness/mocked engine without slots -> tap
      connects output 5+ch.
- [ ] P3 Four presets: Modern Precision, Modern Club Pump, Modern Glue & Air,
      Modern Amiga Master. Test: every effect type exists in the registry and
      every parameter key is one its defaults know.
- [ ] P4 Measure gainCompensationDb for the four (audit tool, --only).
- [ ] P5 Owner listening pass (manual).
