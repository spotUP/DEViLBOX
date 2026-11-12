# Format-private effect commands (formats with their own effect set)

Source: the *EffectGlyphs.ts tables in src/lib/import/formats, the same tables the grid renderer imports. These formats do not use the standard effect numbers: a cell stores the effTyp below and the one-byte eff operand verbatim. effTyp is one global id space, so write exactly these numbers with set_cells; the standard table (topic pc-tracker-composing) does not apply to them.

Cell example: {"note":60,"instrument":1,"effTyp":160,"eff":3} writes Actionamics effect 0xA0 with operand 3.

Where a row says "parameter meaning not documented", no editor table, parser comment or player source in the repo states it in machine-readable form; do not guess it, copy operands from a real song of that format.

### Actionamics

Formats: actionamics.

- effTyp 160 (0xA0), grid Axx: arpeggio. Parameter: parameter meaning not documented.
- effTyp 161 (0xA1), grid Uxx: slide up. Parameter: parameter meaning not documented.
- effTyp 162 (0xA2), grid Dxx: slide down. Parameter: parameter meaning not documented.
- effTyp 163 (0xA3), grid Exx: volume slide after envelope. Parameter: parameter meaning not documented.
- effTyp 164 (0xA4), grid Vxx: vibrato. Parameter: parameter meaning not documented.
- effTyp 165 (0xA5), grid Rxx: set rows. Parameter: parameter meaning not documented.
- effTyp 166 (0xA6), grid Oxx: sample offset. Parameter: parameter meaning not documented.
- effTyp 167 (0xA7), grid Txx: note delay. Parameter: parameter meaning not documented.
- effTyp 168 (0xA8), grid Mxx: mute. Parameter: parameter meaning not documented.
- effTyp 169 (0xA9), grid Sxx: sample restart. Parameter: parameter meaning not documented.
- effTyp 170 (0xAA), grid Kxx: tremolo. Parameter: parameter meaning not documented.
- effTyp 171 (0xAB), grid Bxx: break. Parameter: parameter meaning not documented.
- effTyp 172 (0xAC), grid Cxx: set volume. Parameter: parameter meaning not documented.
- effTyp 173 (0xAD), grid Lxx: volume slide. Parameter: parameter meaning not documented.
- effTyp 174 (0xAE), grid Wxx: volume slide and vibrato. Parameter: parameter meaning not documented.
- effTyp 175 (0xAF), grid Fxx: set speed. Parameter: parameter meaning not documented.

### Activision Pro

Formats: activisionPro.

- effTyp 176 (0xB0), grid Pxx: portamento. Parameter: parameter meaning not documented.
- effTyp 177 (0xB1), grid Hxx: hold sample. Parameter: parameter meaning not documented.
- effTyp 178 (0xB2), grid Exx: envelope restart. Parameter: parameter meaning not documented.
- effTyp 179 (0xB3), grid Vxx: track volume. Parameter: parameter meaning not documented.
- effTyp 180 (0xB4), grid Axx: add track volume. Parameter: parameter meaning not documented.
- effTyp 181 (0xB5), grid Mxx: mute. Parameter: parameter meaning not documented.
- effTyp 182 (0xB6), grid Sxx: max speed counter. Parameter: parameter meaning not documented.
- effTyp 183 (0xB7), grid Xxx: speed variation 2. Parameter: parameter meaning not documented.
- effTyp 184 (0xB8), grid Txx: global transpose. Parameter: parameter meaning not documented.
- effTyp 185 (0xB9), grid Uxx: unknown operation. Parameter: parameter meaning not documented.

### Beathoven

Formats: beathoven.

- effTyp 1280 (0x500), grid Sxx: slide. Parameter: parameter meaning not documented.
- effTyp 1281 (0x501), grid Lxx: legato. Parameter: parameter meaning not documented.
- effTyp 1282 (0x502), grid Bxx: note bias. Parameter: parameter meaning not documented.
- effTyp 1283 (0x503), grid Axx: arpeggio. Parameter: parameter meaning not documented.

### Ben Daglish

Formats: benDaglish.
Also written by: SAPParser, soundFactoryEffects, synthDream, timFollin, voodooSupreme (same ids).

- effTyp 215 (0xD7), grid Qxx: row offset. Parameter: parameter meaning not documented.
- effTyp 216 (0xD8), grid Bxx: sample map. Parameter: parameter meaning not documented.
- effTyp 217 (0xD9), grid Dxx: porta delay. Parameter: parameter meaning not documented.
- effTyp 218 (0xDA), grid Uxx: porta duration. Parameter: parameter meaning not documented.
- effTyp 219 (0xDB), grid Rxx: porta delta. Parameter: parameter meaning not documented.
- effTyp 220 (0xDC), grid Nxx: porta off. Parameter: parameter meaning not documented.
- effTyp 221 (0xDD), grid Fxx: fade speed. Parameter: parameter meaning not documented.
- effTyp 222 (0xDE), grid Txx: fade duration. Parameter: parameter meaning not documented.
- effTyp 223 (0xDF), grid Axx: fade add. Parameter: parameter meaning not documented.
- effTyp 224 (0xE0), grid Oxx: fade off. Parameter: parameter meaning not documented.
- effTyp 225 (0xE1), grid Kxx: porta2 duration. Parameter: parameter meaning not documented.
- effTyp 226 (0xE2), grid Jxx: porta2 off. Parameter: parameter meaning not documented.
- effTyp 227 (0xE3), grid Vxx: channel volume. Parameter: parameter meaning not documented.
- effTyp 228 (0xE4), grid Sxx: vol slide speed. Parameter: parameter meaning not documented.
- effTyp 229 (0xE5), grid Lxx: vol slide add. Parameter: parameter meaning not documented.
- effTyp 230 (0xE6), grid Zxx: vol slide off. Parameter: parameter meaning not documented.
- effTyp 231 (0xE7), grid Xxx: transpose. Parameter: parameter meaning not documented.
- effTyp 232 (0xE8), grid Yxx: track repeat. Parameter: parameter meaning not documented.
- effTyp 233 (0xE9), grid Mxx: master fade. Parameter: parameter meaning not documented.
- effTyp 234 (0xEA), grid Ixx: map set index. Parameter: parameter meaning not documented.
- effTyp 235 (0xEB), grid Gxx: map set sample. Parameter: parameter meaning not documented.
- effTyp 236 (0xEC), grid Exx: end. Parameter: parameter meaning not documented.

### Dave Lowe

Formats: daveLowe.

- effTyp 1024 (0x400), grid Exx: set volume envelope. Parameter: parameter meaning not documented.

### David Whittaker

Formats: davidWhittaker.

- effTyp 192 (0xC0), grid Exx: envelope. Parameter: parameter meaning not documented.
- effTyp 193 (0xC1), grid Axx: arpeggio. Parameter: parameter meaning not documented.
- effTyp 194 (0xC2), grid Sxx: slide speed. Parameter: parameter meaning not documented.
- effTyp 195 (0xC3), grid Dxx: slide delay. Parameter: parameter meaning not documented.
- effTyp 196 (0xC4), grid Vxx: vibrato speed. Parameter: parameter meaning not documented.
- effTyp 197 (0xC5), grid Wxx: vibrato depth. Parameter: parameter meaning not documented.
- effTyp 198 (0xC6), grid Oxx: vibrato off. Parameter: parameter meaning not documented.
- effTyp 199 (0xC7), grid Txx: global transpose. Parameter: parameter meaning not documented.
- effTyp 200 (0xC8), grid Cxx: channel transpose. Parameter: parameter meaning not documented.
- effTyp 201 (0xC9), grid Fxx: volume fade. Parameter: parameter meaning not documented.
- effTyp 202 (0xCA), grid Gxx: global volume fade. Parameter: parameter meaning not documented.
- effTyp 203 (0xCB), grid Mxx: global volume. Parameter: parameter meaning not documented.
- effTyp 204 (0xCC), grid Hxx: half volume on. Parameter: parameter meaning not documented.
- effTyp 205 (0xCD), grid Nxx: half volume off. Parameter: parameter meaning not documented.
- effTyp 206 (0xCE), grid Pxx: speed. Parameter: parameter meaning not documented.
- effTyp 207 (0xCF), grid Yxx: delay speed. Parameter: parameter meaning not documented.
- effTyp 208 (0xD0), grid Lxx: loop. Parameter: parameter meaning not documented.
- effTyp 209 (0xD1), grid Rxx: restart. Parameter: parameter meaning not documented.
- effTyp 210 (0xD2), grid Xxx: sound effect. Parameter: parameter meaning not documented.
- effTyp 211 (0xD3), grid Qxx: stop song. Parameter: parameter meaning not documented.
- effTyp 212 (0xD4), grid Uxx: wait row. Parameter: parameter meaning not documented.
- effTyp 213 (0xD5), grid Kxx: row offset. Parameter: parameter meaning not documented.

### Future Player

Formats: futurePlayer.

- effTyp 243 (0xF3), grid Pxx: portamento rate. Parameter: parameter meaning not documented.
- effTyp 244 (0xF4), grid Axx: arpeggio table. Parameter: parameter meaning not documented.
- effTyp 245 (0xF5), grid Rxx: arpeggio reset. Parameter: parameter meaning not documented.
- effTyp 246 (0xF6), grid Txx: transpose 1. Parameter: parameter meaning not documented.
- effTyp 247 (0xF7), grid Uxx: transpose 2. Parameter: parameter meaning not documented.
- effTyp 248 (0xF8), grid Exx: voice end. Parameter: parameter meaning not documented.
- effTyp 249 (0xF9), grid Lxx: no retrigger. Parameter: parameter meaning not documented.
- effTyp 250 (0xFA), grid Xxx: unknown command. Parameter: parameter meaning not documented.

### Fred Editor

Formats: fred.

- effTyp 112 (0x70), grid Pxx: porta lines. Parameter: parameter meaning not documented.
- effTyp 113 (0x71), grid Txx: porta target. Parameter: parameter meaning not documented.
- effTyp 114 (0x72), grid Rxx: porta delay. Parameter: parameter meaning not documented.
- effTyp 115 (0x73), grid Nxx: raw note. Parameter: parameter meaning not documented.

### Jesper Olsen

Formats: jesperOlsen.

- effTyp 128 (0x80), grid Lxx: tie. Parameter: parameter meaning not documented.
- effTyp 129 (0x81), grid Nxx: raw note. Parameter: parameter meaning not documented.
- effTyp 130 (0x82), grid Rxx: repeat. Parameter: parameter meaning not documented.
- effTyp 131 (0x83), grid Oxx: note offset. Parameter: parameter meaning not documented.
- effTyp 132 (0x84), grid Txx: transpose. Parameter: parameter meaning not documented.
- effTyp 133 (0x85), grid Sxx: slide. Parameter: parameter meaning not documented.
- effTyp 134 (0x86), grid Pxx: pitch. Parameter: parameter meaning not documented.
- effTyp 135 (0x87), grid Qxx: pitch2. Parameter: parameter meaning not documented.
- effTyp 136 (0x88), grid Vxx: volume2. Parameter: parameter meaning not documented.
- effTyp 137 (0x89), grid Uxx: volume1. Parameter: parameter meaning not documented.
- effTyp 138 (0x8A), grid Wxx: voice volume. Parameter: parameter meaning not documented.
- effTyp 139 (0x8B), grid Fxx: flags. Parameter: parameter meaning not documented.
- effTyp 140 (0x8C), grid Hxx: wave. Parameter: parameter meaning not documented.
- effTyp 141 (0x8D), grid Xxx: field. Parameter: parameter meaning not documented.
- effTyp 142 (0x8E), grid Yxx: value. Parameter: parameter meaning not documented.

### JayTrax (effTyp 330 is listed twice by the table: tempo and slot reset; treat it as ambiguous)

Formats: jxs.

- effTyp 257 (0x101), grid Bxx: pitch bend. Parameter: Bends the pitch from the current note to the note given as the value; the bend speed is the auxiliary value.
- effTyp 258 (0x102), grid Wxx: wave. Parameter: Selects the oscillator wave (0 to 15) of the instrument.
- effTyp 259 (0x103), grid Lxx: wave length. Parameter: Sets the wave length: values above 192 give 256 samples, above 96 give 128, above 48 give 64, otherwise 32.
- effTyp 260 (0x104), grid Vxx: volume. Parameter: Sets the instrument volume.
- effTyp 261 (0x105), grid Oxx: volume wave. Parameter: Selects the volume wave (0 to 15; 0 is off).
- effTyp 262 (0x106), grid Sxx: volume speed. Parameter: Sets how fast the volume wave advances.
- effTyp 263 (0x107), grid Pxx: volume loop. Parameter: Sets the loop point the volume wave returns to.
- effTyp 264 (0x108), grid Fxx: fine tune. Parameter: Sets the fine tune (0 to 15).
- effTyp 265 (0x109), grid Hxx: pitch wave. Parameter: Selects the pitch wave (0 to 15; 0 is off).
- effTyp 266 (0x10A), grid Ixx: pitch speed. Parameter: Sets how fast the pitch wave advances.
- effTyp 267 (0x10B), grid Jxx: pitch loop. Parameter: Sets the loop point the pitch wave returns to.
- effTyp 268 (0x10C), grid Dxx: pitch delay. Parameter: Sets the delay before the pitch wave starts.
- effTyp 269 (0x10D), grid Axx: arpeggio. Parameter: Selects the arpeggio (0 to 15).
- effTyp 330 (0x14A), grid Zxx: tempo. Parameter: Sets the song tempo in beats per minute (clamped to 10 to 220).
- effTyp 331 (0x14B), grid Gxx: groove. Parameter: Sets the groove (0 to 3).
- effTyp 320 (0x140), grid Cxx: slot destination. Parameter: Sets which parameter the slot modulates (0 to 15); the slot number (0 to 3) is the auxiliary value.
- effTyp 321 (0x141), grid Exx: slot source 1. Parameter: Sets the first modulation source (0 to 15); the slot number (0 to 3) is the auxiliary value.
- effTyp 322 (0x142), grid Kxx: slot source 2. Parameter: Sets the second modulation source (0 to 15); the slot number (0 to 3) is the auxiliary value.
- effTyp 323 (0x143), grid Mxx: slot oscillator. Parameter: Sets the slot oscillator (0 to 15); the slot number (0 to 3) is the auxiliary value.
- effTyp 324 (0x144), grid Nxx: slot variable 1. Parameter: Sets the first variable of the slot; the slot number (0 to 3) is the auxiliary value.
- effTyp 325 (0x145), grid Qxx: slot variable 2. Parameter: Sets the second variable of the slot; the slot number (0 to 3) is the auxiliary value.
- effTyp 326 (0x146), grid Rxx: slot speed. Parameter: Sets the slot speed; the slot number (0 to 3) is the auxiliary value.
- effTyp 327 (0x147), grid Uxx: slot oscillator speed. Parameter: Sets the oscillator speed of the slot; the slot number (0 to 3) is the auxiliary value.
- effTyp 328 (0x148), grid Xxx: slot oscillator flag. Parameter: Sets the oscillator flag of the slot (0 or 1); the slot number (0 to 3) is the auxiliary value.
- effTyp 329 (0x149), grid Yxx: slot type. Parameter: Sets the slot type (0 to 17); the slot number (0 to 3) is the auxiliary value.
- effTyp 330 (0x14A), grid Zxx: slot reset. Parameter: Sets the slot reset flag (0 or 1); the slot number (0 to 3) is the auxiliary value.
- effTyp 336 (0x150), grid wxx: wave reset. Parameter: sets whether the selected wave restarts on every note (0 or 1); the wave number is the auxiliary value.
- effTyp 352 (0x160), grid xxx: auxiliary value. Parameter: second parameter of the row script: the bend speed, slot number or wave number.

### Music Assembler

Formats: musicAssembler.

- effTyp 251 (0xFB), grid Pxx: portamento. Parameter: parameter meaning not documented.
- effTyp 252 (0xFC), grid Lxx: legato. Parameter: parameter meaning not documented.
- effTyp 253 (0xFD), grid Kxx: keep envelope. Parameter: parameter meaning not documented.
- effTyp 254 (0xFE), grid Txx: transpose. Parameter: parameter meaning not documented.

### Rob Hubbard

Formats: robHubbard.

- effTyp 237 (0xED), grid Pxx: portamento speed. Parameter: parameter meaning not documented.
- effTyp 238 (0xEE), grid Sxx: sustain. Parameter: parameter meaning not documented.
- effTyp 239 (0xEF), grid Vxx: volume. Parameter: parameter meaning not documented.
- effTyp 240 (0xF0), grid Exx: song end. Parameter: parameter meaning not documented.
- effTyp 241 (0xF1), grid Zxx: track list restart. Parameter: parameter meaning not documented.
- effTyp 242 (0xF2), grid Uxx: unknown command. Parameter: parameter meaning not documented.

### Sonix Music Driver

Formats: SonixMusicDriverParser.

- effTyp 96 (0x60), grid Vxx: chan vol. Parameter: parameter meaning not documented.
- effTyp 97 (0x61), grid Txx: tempo. Parameter: parameter meaning not documented.
- effTyp 98 (0x62), grid Dxx: detune. Parameter: parameter meaning not documented.

### Sound Factory

Formats: soundFactory.

- effTyp 768 (0x300), grid Axx: fine tune. Parameter: parameter meaning not documented.
- effTyp 769 (0x301), grid Bxx: fade out. Parameter: parameter meaning not documented.
- effTyp 770 (0x302), grid Cxx: fade in. Parameter: parameter meaning not documented.
- effTyp 771 (0x303), grid Dxx: led. Parameter: parameter meaning not documented.
- effTyp 772 (0x304), grid Exx: one shot. Parameter: parameter meaning not documented.
- effTyp 773 (0x305), grid Fxx: looping. Parameter: parameter meaning not documented.
- effTyp 774 (0x306), grid Gxx: attack time. Parameter: parameter meaning not documented.
- effTyp 775 (0x307), grid Hxx: decay time. Parameter: parameter meaning not documented.
- effTyp 776 (0x308), grid Ixx: sustain level. Parameter: parameter meaning not documented.
- effTyp 777 (0x309), grid Jxx: release. Parameter: parameter meaning not documented.
- effTyp 778 (0x30A), grid Kxx: release time. Parameter: parameter meaning not documented.
- effTyp 779 (0x30B), grid Lxx: vibrato. Parameter: parameter meaning not documented.
- effTyp 780 (0x30C), grid Mxx: vibrato delay. Parameter: parameter meaning not documented.
- effTyp 781 (0x30D), grid Nxx: vibrato speed. Parameter: parameter meaning not documented.
- effTyp 782 (0x30E), grid Oxx: vibrato step. Parameter: parameter meaning not documented.
- effTyp 783 (0x30F), grid Pxx: vibrato amount. Parameter: parameter meaning not documented.
- effTyp 784 (0x310), grid Qxx: arpeggio. Parameter: parameter meaning not documented.
- effTyp 785 (0x311), grid Rxx: arpeggio speed. Parameter: parameter meaning not documented.
- effTyp 786 (0x312), grid Sxx: phasing. Parameter: parameter meaning not documented.
- effTyp 787 (0x313), grid Txx: phasing start. Parameter: parameter meaning not documented.
- effTyp 788 (0x314), grid Uxx: phasing end. Parameter: parameter meaning not documented.
- effTyp 789 (0x315), grid Vxx: phasing speed. Parameter: parameter meaning not documented.
- effTyp 790 (0x316), grid Wxx: phasing step. Parameter: parameter meaning not documented.
- effTyp 791 (0x317), grid Xxx: portamento. Parameter: parameter meaning not documented.
- effTyp 792 (0x318), grid Yxx: portamento speed. Parameter: parameter meaning not documented.
- effTyp 793 (0x319), grid Zxx: portamento step high. Parameter: parameter meaning not documented.
- effTyp 794 (0x31A), grid axx: portamento step low. Parameter: parameter meaning not documented.
- effTyp 795 (0x31B), grid bxx: tremolo. Parameter: parameter meaning not documented.
- effTyp 796 (0x31C), grid cxx: tremolo speed. Parameter: parameter meaning not documented.
- effTyp 797 (0x31D), grid dxx: tremolo step. Parameter: parameter meaning not documented.
- effTyp 798 (0x31E), grid exx: tremolo range. Parameter: parameter meaning not documented.
- effTyp 799 (0x31F), grid fxx: filter. Parameter: parameter meaning not documented.
- effTyp 800 (0x320), grid gxx: filter frequency. Parameter: parameter meaning not documented.
- effTyp 801 (0x321), grid hxx: filter end. Parameter: parameter meaning not documented.
- effTyp 802 (0x322), grid ixx: filter speed. Parameter: parameter meaning not documented.

### Sound Master

Formats: soundMaster.

- effTyp 116 (0x74), grid Hxx: hold. Parameter: parameter meaning not documented.
- effTyp 117 (0x75), grid Lxx: legato. Parameter: parameter meaning not documented.
- effTyp 120 (0x78), grid Nxx: raw note. Parameter: parameter meaning not documented.

### Sound Player

Formats: soundPlayer.

- effTyp 99 (0x63), grid Wxx: wait. Parameter: parameter meaning not documented.
- effTyp 100 (0x64), grid Lxx: loop. Parameter: parameter meaning not documented.
- effTyp 101 (0x65), grid Hxx: hold. Parameter: parameter meaning not documented.
- effTyp 102 (0x66), grid Pxx: park. Parameter: parameter meaning not documented.
- effTyp 103 (0x67), grid Sxx: sync. Parameter: parameter meaning not documented.
- effTyp 104 (0x68), grid Mxx: adk. Parameter: parameter meaning not documented.
- effTyp 105 (0x69), grid Nxx: inert. Parameter: parameter meaning not documented.

### SunTronic

Formats: suntronic.

- effTyp 64 (0x40), grid Jxx: arp select. Parameter: parameter meaning not documented.
- effTyp 65 (0x41), grid Rxx: vol slide rate. Parameter: parameter meaning not documented.
- effTyp 66 (0x42), grid Vxx: restart vol env. Parameter: parameter meaning not documented.
- effTyp 67 (0x43), grid Qxx: restart freq env. Parameter: parameter meaning not documented.
- effTyp 68 (0x44), grid Gxx: master fade. Parameter: parameter meaning not documented.
- effTyp 69 (0x45), grid Mxx: master vol. Parameter: parameter meaning not documented.
- effTyp 70 (0x46), grid Uxx: paula attach. Parameter: parameter meaning not documented.
- effTyp 71 (0x47), grid Sxx: speed voice. Parameter: parameter meaning not documented.
- effTyp 72 (0x48), grid Txx: tempo slide. Parameter: parameter meaning not documented.
- effTyp 73 (0x49), grid Wxx: rows global. Parameter: parameter meaning not documented.
- effTyp 74 (0x4A), grid Nxx: rows voice. Parameter: parameter meaning not documented.
- effTyp 75 (0x4B), grid Pxx: prng seed. Parameter: parameter meaning not documented.
- effTyp 76 (0x4C), grid Oxx: cia tempo. Parameter: parameter meaning not documented.

### Tony Williams

Formats: tonyWilliams.

- effTyp 144 (0x90), grid Dxx: duration. Parameter: Sets the length of every following note and rest until the next duration command (sticky, stream bytes E0 to FF)..
- effTyp 145 (0x91), grid Txx: tie. Parameter: Next note continues without retriggering the sample (sets the no-retrigger flag, stream byte 81)..
- effTyp 146 (0x92), grid Vxx: volume. Parameter: Sets the voice volume (stream bytes B0 to BF)..
- effTyp 147 (0x93), grid Exx: envelope. Parameter: Selects the volume envelope and loads its three nibble parameters (stream bytes C0 to CF, three operand bytes)..
- effTyp 148 (0x94), grid Pxx: envelope params. Parameter: Sets the volume envelope parameters from a two byte operand (stream byte 84). The cell shows the first operand byte..
- effTyp 149 (0x95), grid Xxx: transpose. Parameter: Adds a note offset to every following note on this voice (stream byte 87)..
- effTyp 150 (0x96), grid Sxx: slide. Parameter: Sets the pitch slide (portamento) parameters from three operand bytes (stream byte 88). The cell shows the first operand byte..
- effTyp 151 (0x97), grid Bxx: vibrato. Parameter: Switches vibrato on and sets its five parameter bytes (stream byte 89). The cell shows the first operand byte..
- effTyp 152 (0x98), grid Oxx: vibrato off. Parameter: Switches vibrato off (stream byte 8A)..
- effTyp 153 (0x99), grid Fxx: flag. Parameter: Changes a voice flag. 8B sets flag bit 1 and loads three parameters; 8C sets flag bit 5 and loads three parameters; 8D clears bit 5; 8E sets bit 4; 8F clears bit 4; 90 clears bit 0..
- effTyp 154 (0x9A), grid Uxx: volume step. Parameter: Changes the volume by one step, clamped to 0..15. 91 steps down, 92 steps up..
- effTyp 155 (0x9B), grid Axx: arpeggio. Parameter: Selects an arpeggio pattern from the arpeggio table (stream bytes A0 to AF)..
- effTyp 156 (0x9C), grid Rxx: rest. Parameter: Rests for the current duration: clears the voice volume, then reloads the counter (stream bytes 85 and 86; 86 is the variant)..
- effTyp 157 (0x9D), grid Gxx: fade. Parameter: Starts the global fade out (sets the song fade word to 3838, stream byte 93)..
- effTyp 158 (0x9E), grid Qxx: stop. Parameter: Ends the stream. 82 jumps to the loop point stored in the voice list; 83 ends the song; 94 stops the song and switches the DMA off..
- effTyp 159 (0x9F), grid Lxx: loop. Parameter: Reserved letter for a loop command. The importer shows loop jumps as Stop (command 82), so this never appears in a grid..

## Not verified

- Names are the table's own identifiers; glyphs are what the grid shows. Playback was not checked per command.
- Own-set formats with no table in the repo are not listed: see thoughts/spot/2026-11-12_effect-mapping-gaps.md.
