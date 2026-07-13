---
date: 2026-07-13
topic: suntronic-full-engine
tags: [suntronic, uade, reverse-engineering, synth-extraction, first-class]
status: draft
---

# SunTronic V1.3 — full first-class engine (research)

User decision (2026-07-13): make SunTronic a REAL DEViLBOX instrument engine
(decode synth voices, drop UADE-for-audio), prove ONE format end-to-end
(author new song in DEViLBOX → plays via extracted voices, no UADE) before
committing to the other 20 compiled-player formats.

## Confirmed root-cause bugs (all measured, not guessed)

1. **Audition plays the whole song.** `src/lib/import/parsers/withFallback.ts:139`
   force-sets EVERY SunTronic instrument `synthType='UADEEditableSynth'` and
   injects whole-module UADE playback, because SunTronic is not in the
   `hasDedicatedEngine` allowlist (line 103). MCP-confirmed: triggering
   instrument 2 (Synth 1) advanced the song playhead to globalRow 128.
   → Fix requires SunTronic to have its own audio path (real voices) so
   withFallback stops routing it to UADE.

2. **Synth instruments not extracted.** `buildV13Instruments`
   (SunTronicParser.ts:445-451) emits the synth records as bare
   `{type:'synth', synthType:'Synth'}` placeholders — no waveform, no config.
   MCP-confirmed silent. The 0x24-byte synth records are only COUNTED
   (`synthInstrumentCount`), never decoded.

3. **Notes look sparse / truncated.** `walkV13Voice` (SunTronicParser.ts:494)
   hard-caps `rowsPerPos` rows per sequence entry (default 32). Blocks are
   16/32/64/35/96 rows (measured). Voices 2-3 have 64- and 96-row blocks that
   get truncated to 32. Grid emits 232 notes over 384 rows (6 patterns), but
   the per-position row model is an approximation (code comment admits
   "cross-voice timing is not simulated"). Needs the UADE read-trace oracle
   (`tools/uade-audit/traceModuleReads.ts`, oracle test
   `src/engine/uade/__tests__/traceModuleReads.oracle.test.ts`) to recover the
   true per-position lengths + 0x8C broadcast semantics.

## Synth/sampled record layout — firsthand measurement (mule.src)

synthTableOff=0x1552, sampledTableOff=0x1606, synthCount=5, sampledCount=1.
Record size: synth 0x24, sampled 0x1c. They SHARE a 16-byte prefix
(synth[1] == sampled[0] first 16 bytes exactly).

```
synth[0] @0x1552: 00 00 17 4a  00 06  00 05  00 00 17 1c  00 01  00 00  1f 40  00 00  18 01  00 3e  00 00  00 00 1c c5  00 00 1d 05  20 02
synth[1] @0x1576: 00 00 17 1d  00 01  00 00  00 00 17 1b  00 01  00 00  1f 40  00 00  18 87  00 10  00 00  00 00 1d 97  00 00 00 00  10 04
synth[2] @0x159a: 00 00 17 27  00 06  00 05  00 00 17 1c  00 01  00 00  0f a0  00 00  18 97  04 2a  00 00  00 00 1d 97  00 00 00 00  20 04
synth[3] @0x15be: 00 00 17 33  00 17  00 16  00 00 17 1c  00 01  00 00  1f 40  00 00  17 50  00 01  00 00  00 00 1d 45  00 00 00 00  08 05
synth[4] @0x15e2: 00 00 17 2d  00 06  00 05  00 00 17 1c  00 01  00 00  1f 40  00 00  1c c3  00 01  00 00  00 00 1d 45  00 00 00 00  40 01
sampled[0] @0x1606 slot=0 lenW=2890: 00 00 17 1d  00 01  00 00  00 00 17 1b  00 01  00 00  00 00 00 00  00 00 0b 4a  00 00 0b 4a
```

CODE-VERIFIED field map (from Andy Silva replayer source
`docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s`:
GNN2 synth-select @543-566, MEGAEFFECTS render @594-763, EFFECTS env @415-496;
cross-checked byte-for-byte against synth[0] raw). NO unknown fields remain:
- +0x00 long : volume-envelope table ptr        [EFFECTS 4(A1)/6(A1) wrap]
- +0x04 word : vol-env table length
- +0x06 word : vol-env table loop point
- +0x08 long : freq-envelope table ptr          [EFFECTS 0x10(A1)]
- +0x0c word : freq-env table length
- +0x0e word : freq-env table loop point
- +0x10 word : freq-env speed/param
- +0x12 long : interp/arp table ptr             [MEGAEFFECTS A1+0x12, idx=voice+0x12]
- +0x16 word : arp table length                 [ME2 CMP A1+0x16]
- +0x18 word : arp table loop point             [ME2 A1+0x18]
- +0x1a long : waveform pointer 1               [MEGAEFFECTS A3]
- +0x1e long : waveform pointer 2               [MEGAEFFECTS A4]
- +0x22 byte : wave word-length (D4 = n*2 - 1 bytes) [GNN2 record[0x22]→voice+0x1B/+0x1F]
- +0x23 byte : synthesis type (0..3, else)      [MEGAEFFECTS branch selector]

Synthesis (MEGAEFFECTS, per tick, 4 voices, output → voice+0x26 buffer,
D1 = arpTable[voice+0x12] = interp weight, D4 = wave byte-len-1):
- type 0 (CALC1)  : out = wave1 + ((wave2 - wave1) * D1 >> 7)   linear morph
- type 1 (CALC2-6): pulse-width / -1=random-noise EOR gen / -2=hold
- type 2 (CALC7)  : copy-splice wave2[0..D1] then wave1[D1..]    (splice mix)
- type 3 (CALC10) : resample-stretch via 0x8000/(D1+0x40) fixed-point step
- else  (CALC13)  : smoothed weighted interp (0xFFFE0/(D1+0x20) coeff)
ME2: voice+0x12 arp index increments, wraps record+0x16 → record+0x18.
EFFECTS: vol slide voice+0x0C+=voice+0x0D clamp[0,0x80]; freq env steps
voice+0x10 (wrap 4(A1)/6(A1)), period → voice+0x20 (Paula).

Sampled record (0x1c, GNN8 @568-582):
- +0x12 long : sample data ptr        → voice+0x16
- +0x16 word : length words           → voice+0x1a
- +0x18 word : loop start             → voice+0x1c
- +0x1a word : loop length            → voice+0x1e
voice+0x14 bit0=0 → MEGAEFFECTS BTST #0 skips (sampled = raw Paula, no synth).
Matches existing `SunSampledInstrument` decode. synth: voice+0x14=1 (bit0 set).

Command grammar (GETNEXTNOTE @498-592, negative opcodes 0x8B-0xFF):
- 0x00        : row terminator (GNN1, advance track ptr)
- 0x40-0x7F   : synth-instrument select (GNN2)
- 0x80-0xB7   : sampled-instrument select (GNN8, D0-1 index)  [0x80.. via GNN8]
- 0xB8-0xFF   : note (GNN3: pitch = ~D0 - transpose → voice+8)
- 0x9C(1) set arp/effect sel voice+0x0E | 0x9B(2) pitch word voice+0x0A
- 0x9A(1) volslide voice+0x0D | 0x99(1) set vol voice+0x0C (<<1)
- 0x98(1) speed all | 0x97(2) filter word | 0x96 restart vol-env
- 0x95 restart freq-env | 0x94(1) pitch no-retrig | 0x93(2) fade
- 0x92(1) master vol | 0x91(1) DMA/mute | 0x90(1) finetune voice+0x09

## Phases (to be turned into a plan)

0. Fix note-row model — oracle-validate per-position lengths via traceModuleReads. (DONE? measure first)
1. Decode 0x24 synth record → real DevilboxSynth voice (needs replayer synth-play routine from disasm).
2. Route SunTronic to real voices (sampler + decoded synth); add dedicated-engine flag so withFallback stops forcing UADEEditableSynth. Single-note audition works, no whole-song leak.
3. Play the transpiled grid via real voices — no UADE for audio. Compare against UADE render oracle for parity.
4. Authoring compiler (Phase 5): note-grid → command-stream + score-shift + RELOC32 rebuild. New song plays in DEViLBOX via extracted voices.

## Open (blocking) unknowns
- ~~Synth-play routine~~ RESOLVED 2026-07-13 — MEGAEFFECTS/EFFECTS decoded from
  Andy Silva source (see code-verified map above). Synthesis, envelopes,
  command grammar all recovered. Phase 1 fully specified.
- True per-position row count model (0x8C all-voices vs 0x8B this-voice) — still
  needs `traceModuleReads` oracle. Independent of synth engine; Phase 0.
- Paula period table: freq-env → voice+0x20 period value; need the exact
  period LUT the replayer indexes (EFFECTS @440-460 reads (A2,D1.W) freq table)
  to map decoded pitch → Hz for the native voice.

## Implementation phases (revised, post-disasm)
1. **Decode synth record** → new `SunTronicSynthVoice` descriptor
   (14 fields above + resolved envelope/arp/waveform table data, all
   h1-relative pointers → sliced byte arrays). Regression: decode mule.src
   synth[0..4], assert field values match the code-verified table.
2. **Port MEGAEFFECTS + EFFECTS** to a native per-tick renderer (5 synth types,
   vol/freq envelopes, arp). Oracle: render one synth note, diff vs UADE
   `traceModuleReads`/audio oracle sample buffer.
3. **Route** SunTronic to native voices: add `sunTronicFileData` dedicated-engine
   flag so withFallback.ts stops forcing UADEEditableSynth; sampler for sampled
   records, native synth for 0x24 records. Single-note audition, no song leak.
4. **Play grid** through native engine (no UADE audio); parity vs UADE render.
5. **Authoring compiler** (unchanged from prior plan).
