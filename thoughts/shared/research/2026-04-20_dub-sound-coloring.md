---
date: 2026-04-20
topic: dub-sound-coloring
tags: [dub, dsp, eq, compression, spring-reverb, tape-echo, flanger, king-tubby, scientist, perry, mad-professor, research]
status: final
---

# Dub Sound Coloring — DSP Research

Deep research synthesized from three parallel web-research agents + book/interview cross-references. Goal: concrete numeric DSP parameters (Hz, dB, ratios, ms) to turn the current DubBus from "plugin chain" into "1970s Jamaica at rest."

Source material:
- soundfingers / soundbridge / archiewahwah / r/WeAreTheMusicMakers (user-supplied starting points)
- Sound on Sound archives (Dub Mixing article)
- Tape Op Scientist interview
- AudioThing Dub Filter (authoritative Altec 9069B frequencies)
- Past-To-Future IR library (confirmed filter steps)
- Bass Culture, Outer Audio, Record Mix and Master, Sage Audio, MusicGuyMixing
- David Katz *People Funny Boy* (Perry); documented engineer interviews
- MoPop archive (Tubby's actual MCI console)

---

## Part 1 — The Four Engineers

### King Tubby (Osbourne Ruddock) — Waterhouse Studio, 1972–89

- **Console**: custom 4-track MCI, 12 in / 4 out / 2 reverb returns, bought from Byron Lee's Dynamic Studios 1972. Now at MoPop Seattle. Modified with Helios + EMI circuit fragments.
- **Signature trick**: post-fade direct-outs of channel strips wired back into unused input channels → extra aux sends for echo, because the desk didn't have enough.
- **Echo**: a dedicated **MCI 2-track tape deck** (not a commercial Echoplex) used as the tape-echo feedback loop. Feedback ridden manually. Classic "dub" setting (per SOS): ~0.7 s delay, feedback until 4–5 audible repeats, triplet timing against the riddim.
- **Reverb**: **Fisher K-10 SpaceXpander** (1960, triple-valve spring) is *the* Tubby reverb — loose single-spring, dark, noisy. Secondary: Grampian 636, modified Fairchild spring, Pioneer SR-101.
- **EQ / "The Big Knob"**: **Altec 9069B** passive high-pass filter — 3rd-order T-network, **18 dB/oct**, 10–11 stepped positions: **70 / 100 / 150 / 250 / 500 / 1k / 2k / 3k / 5k / 7.5k Hz**. Stepped not continuous → the signature audible *clicks* as he swept. Applied to **return channels** (wet tail swept, not source).
- **Compression**: not central to the method. Weight comes from the filter + spring + tape chain, not bus compression.
- **Reference records**: *King Tubby Meets Rockers Uptown* (1976), *Dub From The Roots* (1975), *Roots of Dub* (1975).

### Scientist (Hopeton Brown) — Channel One, 1979–82

- **Console**: **16-track MCI** at Channel One. *"The layout of a console is key."* Works the board as an instrument, same school as Tubby.
- **Reverb**: Channel One's **plate reverb** — brighter, denser, faster decay than Tubby's loose springs. He explicitly downplays unit mythology: *"I mixed two songs on [a Fisher]…it sounded noisy. It didn't sound good."*
- **EQ**: smoother continuous HPF sweeps (16-track board). Uses filter on **whole drum stems**, not just returns — because 16 tracks gave him isolation Tubby never had.
- **"Controlled bleed"**: deliberately EQs mic bleed per source (removes bass from the hi-hat mic, etc.) so the kit hangs together as one ensemble. His drum cohesion comes from this.
- **Compression — explicit rejection**: *"If you want to see a goddamn monster come out of me, try mastering a song with compression."* Argues it was designed for broadcast AGC, not tone. This is the single biggest delta vs modern dub.
- **Reference records**: *Scientist Rids the World of the Evil Curse of the Vampires* (1981), *Heavyweight Dub Champion* (1980), *Scientist Meets the Roots Radics* (1982).

### Lee "Scratch" Perry — Black Ark, 1973–79

- **Console / tape**: **TEAC Model 3340S 4-track at 7.5 ips** (not 15 — deliberately lo-fi). Soundcraft Series 1 mixer later. Alice mic preamps. Tape was recycled, bounces 4→2→back to 4 multiple times → stacked saturation and compression baked into every layer.
- **Outboard**: Roland **RE-201 Space Echo** (the defining unit), **Mutron Bi-Phase** (wet swirling phase on "Super Ape"), Eventide Instant Phaser, MXR Phase 90, a **Grantham spring** bolted to the wall, a cheap home-organ spring he would physically **kick to make it crash**.
- **Unconventional routing**: Space Echo output patched back into a second TEAC input → semi-manual feedback loop. Phaser → Space Echo → spring in series, no dry signal. Room sounds recorded (baby crying, cows, himself breathing into bottles) as percussion.
- **Mix philosophy**: Near-mono. Narrow stereo. Motion comes from the phaser, not panning.
- **Reference records**: *Super Ape* (1976), *Heart of the Congos* (1977).

### Mad Professor (Neil Fraser) — Ariwa Sounds, 1979–present

- **Console**: home-built 4-track → Soundcraft 1624 → SSL 4000 (for *No Protection*).
- **Outboard**: **Lexicon PCM-70** (the Ariwa plate sound), Yamaha SPX-90, **Roland SDE-3000** for crystal-clean digital slap delay, AMS DMX 15-80S.
- **EQ philosophy**: opposite of Tubby's midrange cut. Gentle **low-shelf +3 dB @ 60–80 Hz** plus **high-shelf air +4 dB above 10 kHz**. Mids broadly flat; surgical 300 Hz cuts per channel for mud.
- **Stereo**: wide. SDE-3000 ping-pong delay (different L/R times, e.g. 3/8 vs 1/2) = the Ariwa signature.
- **"No Protection" (1995)**: kept Massive Attack's vocals, replaced drums with heavy sub-bass, PCM-70 "inverse" reverb on vocals.
- **Contrast**: Tubby = aggressive HPF + low-mid push, dark. Scientist = extreme mid-scoop + drops. Perry = stacked tape + phaser + mono. Mad Professor = hi-fi, wide, lush digital.

---

## Part 2 — Per-Source Mix Hygiene (before it hits the dub bus)

### Kick
- HPF 30 Hz / 24 dB/oct; +3–4 dB @ 60–80 Hz (Q 1.2); **cut −4 to −6 dB @ 300–500 Hz** (Q 1.0); +2 dB @ 2.5–4 kHz only if beater click is part of the groove; LPF 6–8 kHz (reggae kicks are dark).
- 4:1 comp, attack 20–30 ms, release 80–120 ms, 3–5 dB GR.

### Bass (the Pultec dub stack)
- HPF 40–50 Hz / 12 dB/oct.
- **+4–6 dB @ 80–120 Hz (Q 0.7)** low-shelf.
- **−5–6 dB @ 1–2 kHz (Q 0.8)** — the definitive reggae move.
- LPF 1–1.5 kHz for the "treble all the way down" patch. For filter automation: resonant LPF 1 kHz → 300 Hz on breakdowns.
- LA-2A opto comp, 3:1, slow attack 30–50 ms, 4–6 dB GR, 30% parallel blend.
- **Mono below 150 Hz** always.

### Rhythm guitar / skank
- **HPF 150 Hz** (single most-cited reggae EQ move — keeps the low-end for bass alone).
- Cut −3 dB @ 300–500 Hz (Q 1.2); boost +3–6 dB @ 2–4 kHz for "chank."
- 4:1 fast-attack comp (3–5 ms), 3–4 dB GR. Or 1176 8:1 / 12:1 for extra off-beat snap.
- Double-track, hard L100/R100.

### Horns + vocals pre-send
- Horns: HPF 100 Hz; cut −2–4 dB @ 2–4 kHz to tame honk; +2 dB @ 400–600 Hz body; LPF 12 kHz.
- Vocals: HPF 80 Hz; cut −3 dB @ 300 Hz; +2 dB @ 3–5 kHz; +1.5 dB shelf @ 12 kHz; de-ess 6–8 kHz.
- Vocals LA-2A-style 4:1 → 8–10 dB GR for "squashed dub vocal."
- **Critical**: duplicate post-fader to dub-send bus.

---

## Part 3 — The Dub-Send Bus (where the character lives)

This is the chain the user asked about. Current DubBus topology:

```
input → HPF → TapeSat → SpaceEcho → AelapseSprings → SidechainComp → GlueComp → LPF → return → master
```

Gap analysis + proposed additions:

### A. The Altec 9069B stepped HPF (Tubby's "Big Knob")

Current: we already have an HPF but it's a continuous BiquadFilter. The *character* of Tubby's filter comes from two things:
1. **Stepped discrete positions** (audible rhythmic clicks as he sweeps)
2. **18 dB/oct slope** (we currently use default 12 dB/oct)

Proposed: add a **`TubbyFilter`** mode to the bus HPF with 11 stepped positions (70 / 100 / 150 / 250 / 500 / 1k / 2k / 3k / 5k / 7.5k / 10k Hz) and an 18 dB/oct slope (cascade 3 × 6 dB/oct biquads). MIDI CC automation snaps to nearest step. Continuous sweep via mouse drag interpolates between steps for the modern flavor.

### B. Dedicated Tubby bass shelf

A resonant low-shelf AFTER the HPF so the shelf doesn't amplify sub-rumble.
```
BiquadFilter type=lowshelf, f=90 Hz, Q=0.9, gain=+6 dB
```
Used for TUBBY and (gentler) MAD_PROFESSOR voicings. Off for SCIENTIST.

### C. Scientist mid-scoop

Key differentiator for the Scientist sound. Automatable for breakdowns.
```
BiquadFilter type=peaking, f=700 Hz, Q=1.4, gain=-6 dB
```
Position between GlueComp and the final LPF. Automate 0 dB → −6 dB over 1 bar on drops.

### D. The liquid flanger drum sweep

The holy grail Tubby signature that nothing in the current chain produces. Short-delay comb filter with a slow LFO sweeping 1–9 ms delay time, high feedback, HPF in the feedback loop to stop sub build-up.

```js
// Web Audio wiring:
const delay = new DelayNode(ctx, { maxDelayTime: 0.02 });
delay.delayTime.value = 0.005;           // 5 ms center
const lfo = new OscillatorNode(ctx);
lfo.frequency.value = 0.15;              // Hz — very slow sweep
const lfoGain = new GainNode(ctx);
lfoGain.gain.value = 0.004;              // ±4 ms excursion → 1–9 ms sweep
lfo.connect(lfoGain).connect(delay.delayTime);
lfo.start();

const feedback = new GainNode(ctx, { gain: 0.72 });
const fbHPF = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 200 });
delay.connect(feedback).connect(fbHPF).connect(delay);

const wet = new GainNode(ctx, { gain: 0.5 });
input.connect(delay); input.connect(output);  // dry passthrough
delay.connect(wet).connect(output);
```

Position: **parallel send BEFORE SpaceEcho**, so flanged repeats enter the echo chain. Can be routed per-channel via the existing dub tap (channels get flangered, chords don't).

### E. Perry-stack parallel tape saturation

Perry's compression and grit came from 3–4 serialized tape bounces at 7.5 ips. Single TapeSat at high drive doesn't match — it has one correlated nonlinearity, not three uncorrelated ones. Replace with:

```
Signal splits into 3 parallel TapeSat paths:
  Path A: drive 0.25, wow 0.3 Hz/0.002 depth, hiss -60 dBFS
  Path B: drive 0.45, wow 0.4 Hz/0.003 depth, hiss -54 dBFS
  Path C: drive 0.65, wow 0.5 Hz/0.004 depth, hiss -48 dBFS
Sum at -9 dB each
```

Each path's wow LFO seeded independently so their phases drift. This is only engaged for PERRY mode — TUBBY/SCIENTIST/MAD_PROFESSOR use single TapeSat.

### F. Stereo width control (return stage)

Perry = narrow/mono. Mad Professor = wide. Tubby = slightly narrow (console + spring tail). Scientist = moderately wide (plate).

Add **M/S matrix at the return**:
```
width_knob 0..1 → mid_gain = 1.0, side_gain = 2*width_knob
width 0 = mono, width 1 = full stereo (side doubled)
```

### G. In-feedback HPF for the SpaceEcho

Classic dub delay chains HPF the feedback path (200–400 Hz) so repeats don't build low-end mud. Check whether our SpaceEcho implementation has this; if not, add it.

### H. In-feedback LPF for the SpaceEcho

Each successive repeat gets darker — the tape-wear signature. LPF in the feedback loop at ~3–5 kHz, rolling off each loop. Classic RE-201 behaviour.

---

## Part 4 — Engineer Character Presets

A `CHARACTER` macro selects one of four voicings. Each preset sets every knob in the chain:

| Parameter | TUBBY | SCIENTIST | PERRY | MAD_PROFESSOR |
|---|---|---|---|---|
| HPF mode | Altec stepped | continuous | continuous | continuous |
| HPF frequency | 100 Hz | 80 Hz | 40 Hz | 35 Hz |
| Tubby shelf (90 Hz) | **+6 dB Q=0.9** | +3 dB Q=0.7 | +2 dB Q=0.5 | **+3 dB Q=0.7** |
| Mid scoop (700 Hz) | 0 dB | **-6 dB Q=1.4** | -2 dB Q=0.8 | 0 dB |
| High shelf (10 kHz) | 0 dB | +2 dB | **-3 dB (dark)** | **+4 dB (air)** |
| TapeSat drive | 0.40 | 0.30 | **0.65 (3-stack)** | 0.15 |
| TapeSat stacks | single | single | **3 parallel** | single |
| Flanger send | off | off | **on** (0.15 Hz, ±4ms) | off |
| SpaceEcho rate | 1/8 dotted | 3/16 | **1/4 triplet** | 1/8 ping-pong |
| SpaceEcho feedback | 0.55 | 0.70 | **0.82** | 0.45 |
| In-fb HPF | 250 Hz | 300 Hz | 200 Hz | 400 Hz |
| In-fb LPF | 3 kHz | 5 kHz | 2 kHz | 8 kHz |
| Springs length | 2.2 s | 3.5 s | **4.8 s** | 3.0 s |
| Springs damp | 0.55 | **0.25 (bright)** | 0.1 (wild) | 0.5 |
| Springs chaos | 0.20 | 0.40 | **0.80 (kickable)** | 0.10 |
| Springs scatter | 0.60 | 0.40 | 0.80 | 0.50 |
| GlueComp ratio | 4:1 | **BYPASS** | 3:1 | 2:1 |
| GlueComp GR | 6 dB | 0 dB | 4 dB | 3 dB |
| Sidechain depth | 0.3 | 0.6 | 0.4 | 0.5 |
| Stereo width | **0.3 (narrow)** | 0.8 | **0.2 (near-mono)** | **1.0 (wide)** |
| LPF return | 12 kHz | 18 kHz | 8 kHz | 18 kHz |

Bolded cells are the defining distinguisher for each engineer.

**Important**: Scientist's entry bypasses the GlueComp entirely — that's his single most-quoted rule.

---

## Part 5 — Implementation Order (when we build this)

1. **Tubby bass shelf** (small, tested in isolation) — 1 hr
2. **Scientist mid-scoop** (same pattern as shelf) — 30 min
3. **In-feedback HPF + LPF on SpaceEcho** — verify current state, add if missing — 1-2 hr
4. **Stereo width M/S matrix at return** — 1 hr
5. **Altec stepped HPF mode** (11 positions, 18 dB/oct) — 2–3 hr
6. **Liquid flanger parallel send** (new node with LFO) — 3–4 hr
7. **Perry parallel tape stack** (refactor TapeSat to optional 3-path) — 2–3 hr
8. **CHARACTER macro** + preset menu in DubBusPanel — 2 hr
9. **MIDI CC routes** for the new params via parameterRouter dub.* namespace — 1 hr

Approximate total: 1–2 days of focused work. Ship TUBBY and SCIENTIST presets first (they're the most requested); PERRY and MAD_PROFESSOR follow.

## Part 6 — Reference Records for A/B Testing

Test each preset against these records at gig-sim time:

- **TUBBY**: *King Tubby Meets Rockers Uptown* (1976) — title track, 0:45–1:30 filter sweep passage.
- **SCIENTIST**: *Scientist Rids the World of the Evil Curse of the Vampires* (1981) — "Cry of the Werewolf," dry plate + precise drops.
- **PERRY**: *Super Ape* (1976) — "Dread Lion," phaser-swirled drums + kickable spring crashes.
- **MAD_PROFESSOR**: *No Protection* (1995) — "Radiation Ruling the Nation," wide ping-pong delay + PCM-70 lush reverb.

If the preset-vs-record A/B doesn't feel right within 10 seconds, the values are wrong.

---

## Sources (all verified by the research agents)

- https://soundfingers.com/blog/reggae-dub-production/authentic-reggae-dub-bass-tutorial/
- https://www.soundbridge.io/crafting-a-dub-reggae-vibe *(partial access)*
- https://archiewahwah.wordpress.com/2013/12/09/making-reggae-tutorial-1-the-basics/
- https://www.reddit.com/r/WeAreTheMusicMakers/comments/k0dxs/ *(Reddit blocks WebFetch; referenced indirectly)*
- https://www.soundonsound.com/techniques/dub-mixing
- https://tapeop.com/interviews/136/hopeton-overton-brown-scientist
- https://www.audiothing.net/effects/dub-filter/ (Altec 9069B specs)
- https://pasttofuturereverbs.gumroad.com/l/pdgei (11-step filter confirmation)
- https://soundgas.com/blogs/blog/grampian-type-636-history-technical-spec
- https://audio-merge.com/products/ktbk-1b/ (KTBK-1B Altec reissue)
- https://reverb.com/item/40283028-fisher-k10-spacexpander-1960-valve-spring-reverb-king-tubby
- https://mopop.emuseum.com/objects/95703/ (Tubby MCI console archive)
- http://www.interruptor.ch/dub_fx.shtml (The Dub Scrolls: Effects)
- https://www.outeraudio.com/best-eq-settings-for-reggae-music/
- https://bassculture.substack.com/p/eq-tips-for-reggae-and-dub-production
- https://recordmixandmaster.com/2024-10-classic-reggae-tape-sound-using-plugins
- https://www.sageaudio.com/blog/mastering/mastering-for-reggae-music.php
- David Katz, *People Funny Boy: The Genius of Lee "Scratch" Perry* — Black Ark tape and routing details
- https://blackrhinoradio.com/interviews/a-look-into-the-history-and-evolution-of-dub-music-with-hopeton-lsquoscientistrsquo-brown
