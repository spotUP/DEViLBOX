# Composing PC-tracker songs (MOD, XM, S3M, IT and formats that use the standard effect set)

Source: the editor's own effect table (src/utils/ft2EffectDescriptions.ts). A cell holds effTyp and eff (numbers), plus effTyp2 and eff2 for a second effect column, and a volume column value. Write them with set_cells or fill_range.

## How a cell stores an effect

- effTyp is the effect number in XM numbering: the digit for 0 to 9, 10 for A, 11 for B, and so on up to 35 for Z. eff is the one-byte parameter (0 to 255).
- E-commands are effTyp 14 and eff = sub-command in the high nibble + value in the low nibble. E9x with x=3 is {"effTyp":14,"eff":147} (0x93).
- Example: {"note":60,"instrument":1,"effTyp":12,"eff":32} plays at half volume (C20 hex = 32 of 64).
- S3M and IT songs are converted to this same numbering on import, so the same effTyp numbers apply to them. Their own letters differ, see "Per-format differences".

## Effect table

Columns: code as shown in the grid, effTyp, parameter, meaning.

- 0xy (effTyp 0): Arpeggio. Rapidly cycle between note, note+x semitones, note+y semitones. Parameter: x=1st offset (0-F hex), y=2nd offset (0-F hex).
- 1xx (effTyp 1): Pitch Slide Up. Slide pitch upward continuously. Parameter: xx=speed (01-FF hex, 00=use last).
- 2xx (effTyp 2): Pitch Slide Down. Slide pitch downward continuously. Parameter: xx=speed (01-FF hex, 00=use last).
- 3xx (effTyp 3): Tone Portamento. Slide pitch toward target note. Parameter: xx=speed (01-FF hex, 00=use last).
- 4xy (effTyp 4): Vibrato. Oscillate pitch up/down. Parameter: x=speed (0-F hex), y=depth (0-F hex).
- 5xy (effTyp 5): Tone Porta + Vol Slide. Continue tone portamento while sliding volume. Parameter: x=vol slide up speed, y=vol slide down speed.
- 6xy (effTyp 6): Vibrato + Vol Slide. Continue vibrato while sliding volume. Parameter: x=vol slide up speed, y=vol slide down speed.
- 7xy (effTyp 7): Tremolo. Oscillate volume up/down. Parameter: x=speed (0-F hex), y=depth (0-F hex).
- 8xx (effTyp 8): Set Panning. Set channel panning position. Parameter: xx=position (00=left, 80=center, FF=right).
- 9xx (effTyp 9): Sample Offset. Start sample playback at offset. Parameter: xx=offset (multiply by 256 samples).
- Axy (effTyp 10): Volume Slide. Slide volume up or down. Parameter: x=slide up speed, y=slide down speed.
- Bxx (effTyp 11): Position Jump. Jump to pattern in order list. Parameter: xx=position (00-FF hex).
- Cxx (effTyp 12): Set Volume. Set channel volume directly. Parameter: xx=volume (00-40 hex, 64 decimal).
- Dxx (effTyp 13): Pattern Break. Break pattern and jump to row in next pattern. Parameter: xx=row (00-3F hex, 0-63 decimal).
- Fxx (effTyp 15): Set Speed/BPM. Set speed (01-1F) or BPM (20-FF). Parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM).
- Gxx (effTyp 16): Set Global Volume. Set global volume for all channels. Parameter: xx=volume (00-40 hex, 64 decimal).
- Hxy (effTyp 17): Global Volume Slide. Slide global volume up or down. Parameter: x=slide up speed, y=slide down speed.
- Wxx (effTyp 32): Global Pitch Shift. DJ-style pitch shift affecting entire song playback (like a turntable). Parameter: xx=pitch (00=-12 semitones, 80=0/neutral, FF=+12 semitones).
- Zxx (effTyp 35): MIDI Macro. IT-style filter control (cutoff/resonance/mode). Parameter: xx: 00-7F=cutoff, 80-8F=resonance, 90-9F=filter mode.
- E0x (effTyp 14, eff high nibble 0, i.e. eff = 0 + x): Set Filter (Amiga). Enable/disable Amiga LED filter. Parameter: x=0 (filter on) or 1 (filter off).
- E1x (effTyp 14, eff high nibble 1, i.e. eff = 16 + x): Fine Pitch Slide Up. Slide pitch up once at tick 0. Parameter: x=fine slide value (1-F hex).
- E2x (effTyp 14, eff high nibble 2, i.e. eff = 32 + x): Fine Pitch Slide Down. Slide pitch down once at tick 0. Parameter: x=fine slide value (1-F hex).
- E3x (effTyp 14, eff high nibble 3, i.e. eff = 48 + x): Glissando Control. Enable/disable glissando (semitone portamento). Parameter: x=0 (off) or 1 (on).
- E4x (effTyp 14, eff high nibble 4, i.e. eff = 64 + x): Set Vibrato Waveform. Set vibrato waveform type. Parameter: x=waveform (0=sine, 1=ramp down, 2=square, 3=random).
- E5x (effTyp 14, eff high nibble 5, i.e. eff = 80 + x): Set Finetune. Set sample finetune. Parameter: x=finetune (-8 to +7, stored as 0-F).
- E6x (effTyp 14, eff high nibble 6, i.e. eff = 96 + x): Pattern Loop. Loop pattern section. Parameter: x=0 (set loop start) or 1-F (loop count).
- E7x (effTyp 14, eff high nibble 7, i.e. eff = 112 + x): Set Tremolo Waveform. Set tremolo waveform type. Parameter: x=waveform (0=sine, 1=ramp down, 2=square, 3=random).
- E8x (effTyp 14, eff high nibble 8, i.e. eff = 128 + x): Set Panning (Fine). Set panning with fine control. Parameter: x=panning (0=left, 8=center, F=right).
- E9x (effTyp 14, eff high nibble 9, i.e. eff = 144 + x): Retrigger Note. Retrigger note every x ticks. Parameter: x=retrigger rate (1-F ticks).
- EAx (effTyp 14, eff high nibble 10, i.e. eff = 160 + x): Fine Volume Slide Up. Slide volume up once at tick 0. Parameter: x=fine volume value (1-F hex).
- EBx (effTyp 14, eff high nibble 11, i.e. eff = 176 + x): Fine Volume Slide Down. Slide volume down once at tick 0. Parameter: x=fine volume value (1-F hex).
- ECx (effTyp 14, eff high nibble 12, i.e. eff = 192 + x): Note Cut. Cut note (set volume to 0) at tick x. Parameter: x=tick to cut (0=immediate, 1-F=delayed).
- EDx (effTyp 14, eff high nibble 13, i.e. eff = 208 + x): Note Delay. Delay note trigger by x ticks. Parameter: x=delay in ticks (0-F).
- EEx (effTyp 14, eff high nibble 14, i.e. eff = 224 + x): Pattern Delay. Delay pattern by x rows. Parameter: x=rows to delay (0-F).
- EFx (effTyp 14, eff high nibble 15, i.e. eff = 240 + x): Funk Repeat (Invert Loop). Invert sample loop at speed x (Amiga). Parameter: x=invert speed (0-F).

## Volume column

- 0x00: empty. 0x10 to 0x50: set volume 0 to 64 (value = 0x10 + volume).
- 0x60 to 0x6F: volume slide down by the low nibble. 0x70 to 0x7F: volume slide up.
- 0x80 to 0x8F: fine volume slide down. 0x90 to 0x9F: fine volume slide up.
- 0xA0 to 0xAF: set vibrato speed. 0xB0 to 0xBF: vibrato depth.
- 0xC0 to 0xCF: set panning (0 left, F right). 0xD0 to 0xDF: panning slide left. 0xE0 to 0xEF: panning slide right.
- 0xF0 to 0xFF: tone portamento with speed in the low nibble.

## Per-format differences

- MOD: four channels (more on variants), no volume column, no second effect column, effTyp 0 to 15 only (the 16 MOD effects 0 to F; the E sub-commands are effTyp 14). G, H and later letters do not exist. Fxx: 01 to 1F is speed in ticks per row, 20 to FF is BPM.
- XM: effTyp 0 to 35, the volume column, K (key off), L (envelope position), P (panning slide), R (multi retrigger), T (tremor), X (extra fine portamento). Fxx splits speed (01 to 1F) from BPM (20 to FF) the same way.
- S3M: letters A to Z, not the XM numbers. On import: A is set speed (effTyp 15), T is set tempo (effTyp 15, parameter 32 or more), B jump (11), C break (13), D volume slide (10), E and F portamento down and up (2, 1; EFx/FFx fine become E2x/E1x, EEx/FEx become extra fine effTyp 33), G tone portamento (3), H vibrato (4), I tremor (29), J arpeggio (0), K and L combined slides (6, 5), O sample offset (9), Q retrigger (E9x), R tremolo (7), S sub-commands (S3x, S4x, S5x, S6x, S8x, SCx, SDx, SEx become the same E-command), U fine vibrato (4), V global volume (16), W global volume slide (17), X set panning (8, doubled), Y panbrello (25). M, N, P, Z and unlisted S sub-commands are dropped on import.
- IT: same letter mapping as S3M, plus a wider volume column (set volume 0 to 64, fine and normal slides, panning 0 to 64, vibrato speed and depth; portamento volume-column values are dropped on import). Speed is Axx and tempo is Txx (20 hex and up).
- Speed versus tempo: in MOD and XM one command (Fxx) carries both, split at 20 hex. In S3M and IT they are two commands (A speed, T tempo) that both land in effTyp 15 after import.
- Not applicable here: Amiga-specific and chip-specific formats (Furnace chips, private command blocks above 35) have their own topics.

## Not verified

- Parameter ranges are the editor's own description strings; they were not re-measured by ear.
- effTyp 32 (W, global pitch shift) and 35 (Z, MIDI macro / filter) are editor additions, not part of FT2 or MOD; their playback was not checked.
- The per-format list reflects the importers (S3MParser, ITParser), not the original players; S3M-only quirks (for example volume-slide "fine" cases of D) are not listed. Unverified.
- Whether the MOD exporter rejects or drops effTyp above 15 was not checked.
