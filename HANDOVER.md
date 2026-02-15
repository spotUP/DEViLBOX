# Furnace Chip Synth Testing Handover

**Note:** For current project status across all features, see: [PROJECT_STATUS_2026-02-14.md](PROJECT_STATUS_2026-02-14.md)

**Date:** 2026-02-10 (Last furnace chip fixes)

## Current Status

### Just Completed: OPZ (TX81Z) - Fixed
OPZ key-on/key-off was using the wrong registers. Fixes applied:

1. **Key-on**: Was writing to register 0x08 with slot mask (OPN2 style)
   - **Fixed**: Now writes to register 0x20+chan with bit 6 set (L_R_FB_ALG register)
   - Value: `(alg & 7) | (fb << 3) | 0x40 | (chVolR << 7)`

2. **Key-off**: Was writing to register 0x08
   - **Fixed**: Now writes to register 0x20+chan without bit 6
   - Value: `(alg & 7) | (fb << 3) | (chVolR << 7)`

3. **Frequency**: Added proper OPZ note mapping using `noteMap[12] = {0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14}`
   - KC = `((octave & 7) << 4) | noteMap[noteInOctave]`
   - KF = fraction * 64 (6-bit)

Reference: Furnace tx81z.cpp lines 109-115 (hScale), 429-430 (freq write), 403 (key-off), 435 (key-on)

## Completed WASM Chips (50+ total)

### FM Chips (12)
- OPN2 (YM2612), OPM (YM2151), OPL3, OPLL (YM2413)
- OPNA (YM2608), OPNB (YM2610), OPN (YM2203), OPNB_B (YM2610B)
- OPZ (TX81Z/YM2414), Y8950 (MSX-Audio), OPL4 (YMF278B)
- ESFM (uses OPL3 emulation)

### PSG/Square Chips (6)
- PSG (SN76489), AY-3-8910, AY8930 (Enhanced AY), SAA1099, T6W28
- PC Speaker (simple square wave)

### Nintendo (8)
- NES, GB, SNES, FDS, MMC5, VRC6, N163, Virtual Boy

### Wavetable (7)
- PCE, SCC, WonderSwan, SM8521, Bubble System, X1-010, NAMCO WSG

### Atari (3)
- TIA, POKEY, Lynx

### Commodore (5)
- SID3 (modern), SID 6581 (classic), SID 8580 (classic), VIC-20, TED

### Sample Playback (10)
- Sega PCM, K007232, K053260, OKI MSM6295, ES5506
- YMZ280B, RF5C68, GA20, QSound, Amiga Paula

### Other (7)
- VERA, Supervision, UPD1771, MSM6258 (OKI ADPCM), MSM5232
- Pong (simple oscillator), PV1000 (Casio), Pokemon Mini

### Now Implemented (previously stubs)
- NDS (51) - 16-channel Nintendo DS sound
- GBA_DMA (52) - 2-channel GBA sample playback
- GBA_MINMOD (53) - GBA MinMod (stub, shares GBA_DMA)
- MultiPCM (60) - 28-channel Sega MultiPCM
- PET (56) - Commodore PET 6522 shift register

## Key Files
- `/src/engine/FurnaceSynth.ts` - Main synth with note trigger, key-on/off
- `/src/lib/import/formats/FurnaceRegisterMapper.ts` - Chip-specific register config
- `/src/lib/import/formats/FurnacePitchUtils.ts` - Frequency conversion functions
- `/src/engine/chips/FurnaceChipEngine.ts` - WASM interface
- Reference: `/Users/spot/Code/DEViLBOX/Reference Code/furnace-master/src/engine/platform/`

## Testing Pattern
1. Select chip type in DEViLBOX
2. Play notes on keyboard
3. Check browser console for register writes
4. Compare with expected behavior from Furnace reference code
5. Fix frequency calculation, key-on/off, and operator setup as needed

## Common Issues Encountered
1. **Silence**: Usually wrong key-on register or channel offset
2. **Wrong pitch**: Clock rate differences, sample rate compensation needed
3. **Weak/wrong sound**: Operator TL (total level) not set, wrong algorithm
4. **OPZ-specific**: Uses L_R_FB_ALG register (0x20+chan) for key-on, NOT register 0x08
