---
date: 2026-10-05
topic: MusicMaker V8 (Thomas Winischhofer) native replayer - format and player semantics
tags: [musicmaker, mmv8, amiga, native-replayer, uade, research]
status: final
---

# MusicMaker V8 native replayer - research

Goal: play `public/data/songs/formats/MusicMaker V8 Old/- unknown/moveback.sdata`
and `best of guitars.sdata` natively (UADE's MusicMaker-4V plays moveback wrong,
MusicMaker-8V rejects it; both reject best of guitars).

## Sources

- Player source (BSD, Thomas Winischhofer): `third-party/uade-3.05/amigasrc/players/music_maker/MusicMaker4.asm`
  (STD, 4-voice "sysplayer") and `MusicMaker8.asm` (EXT, 8-voice "mplayer", software-mixed
  pairs). CRLF + ISO-8859; read with `LC_ALL=C tr -d '\r'`.
- No NostalgicPlayer / libxmp / OpenMPT implementation exists (searched third-party/ and
  the web-known lists). Existing repo code: `src/lib/import/formats/MusicMakerParser.ts`
  (IFF metadata + sampler instruments + empty grid, UADE plays), companion alias
  `<tune>.i` <- `<tune>.ip` in `src/lib/import/companionResolver.ts:307`.
- The asm is the spec. Line refs below are to the CRLF-stripped files.

## Files

- `<tune>.sdata`: the song. `<tune>.i` = instruments unpacked, `<tune>.ip` = packed
  (the player tries `.i`, then `.ip`; `Loadexternal`, mm8 408-470).
- `.ip.n` / `.i.n`: 36 x 16-byte instrument names (editor side file). `.ip.l`: library list.
- MMV8 3.0 single file: `FORM....MMV8` with chunks `SDAT` (4-byte internal length + sdata),
  `INST` (= `.i` bytes) or `PINS` (= `.ip` bytes). `findchunk` mm8:111.

## Song type: STD (4V) vs EXT (8V)

`_isstdsong` (mm4:1066, mm8:1362): `'SE'` id and byte 22 == $FF -> STD, else EXT.
**This test is wrong for both corpus songs:**

- moveback: byte 22 = $00 (older STD save), parses as STD exactly: 4 melody lists from
  offset 30, macros end with $FE at the last byte. Under the EXT layout it would have
  channel mask $40 (one voice) - nonsense. So MM8 rejects it (`fileformaterror`?
  no: EXT parse reads garbage) and MM4's Chk rejects it as EXT; UADE plays it wrong.
- best of guitars: byte 22 = $FF but the EXT layout fits exactly: mask $EF (7 voices),
  226-byte table, pattlen 64 / speed 800 at 256, 7 melody lists of 37 from 264, macros
  end with $FE at the last byte. MM4's Chk rejects byte 23 ($EF) as macro length > 64.

Native discriminator: parse both layouts structurally; the one whose melody lists +
macro area walk ends on the $FE terminator inside the file wins (STD tried first).

## sdata layout

STD (`_newsndresetoneshot` mm4:1232, `ptrsinit` mm4:1378):
```
0  'SE'  2 name[20]
22 byte format ($FF new, $FE = ext data follows, $00 old)   23 byte pattlen (rows)
24 word speed
26 word start position   28 word loop position
30 [if format==$FE: extdatasize bytes]  4 x melody list: words, 999-terminated
   macro area
```
EXT (`internsndreset` mm8:1572):
```
22 byte (unused)  23 byte channelsenable (bit n = voice n)
24 byte mixertype  25 byte hi   26 [if $FE: skip word at 28]  26..29 skipped
30 226-byte hightable (mixer period substitution - ignored natively)
256 word pattlen  258 word speed  260 word start  262 word loop
264 one melody list per enabled voice (bit 7..0 order when searching, voice order 0..7
    when building; disabled voices play [0,999])
   macro area
```
Melody list entry: macro index; 0 = pause for pattlen*2 ticks; 999 = loop to the loop
position (and marks the voice "finished" once, which resets its per-voice state).

Macro area: macros back to back, each a run of 3-byte triples terminated by $FF; a
bare $FF is an empty macro (vector = first macro); $FE ends the area.

## Triple (handle_channel mm4:2075, mm8:2471)

```
b0: hi nibble instrument (+ bank from $F8), lo nibble volume index (0 = note off)
b1: bit7 loop flag, bit6 LED filter value, bits0-5 note (0..63 into notetable)
b2: bit7 legato (+ $F2/$FB slide triple follows), bit6 set LED filter, bits0-5 duration
duration: ((b2 & $3F) + 1) * 2 ticks (from the next triple when it is $F2/$FB or b0 = $F8)
```
Controls (b0 >= $F2): $F4 loudness on/off, $F5 callback, $F6 fade in/out speed,
$F7 fade state (256 normal / 8192 silent), $F8 bank (b1) + real triple follows,
$F9 slides: b2 bit7 clear = period slide b1; bit7+bit6 clear = volume slide;
bit7+bit6: b1 < 0 tremolo (-b1), else vibrato (b1); $FA HULL: b1 hi nibble instrument,
lo nibble LFO table 1..15; $FC speed b1 = f1<<4|f2: speed*f1/f2 (STD clamp 300..2800,
EXT clamp 600..origspeed, applied next tick); $FD nop; $F0/$F1 = note off.
After a triple: a following $F3 triple pair is skipped (6 bytes). At a macro's $FF the
next melody entry is fetched; if its macro starts with $F0 (and the song did not just
loop) that duration is added to the current note (tie).

## Tick and voice update

Tick = speed x 23 CIA-B ticks at 709379 Hz (STD `settimer`; EXT mix buffer =
speed*5*23 colour clocks / period, same duration). Per voice per tick
(setallchanneldata mm4:1728 / mm8:2211): volume slide (clamp 0..128 half-steps),
tremolo/vibrato flip every 2 ticks, HULL envelope: table[pos/40] = (vol mod, per mod)
signed bytes, vol += vol*v>>5, per += per*p>>8, pos += speed*115/period, wraps by the
loop length; loudness table divide; fade divide (vol<<8)/fade; period clamp 113..856.

Instruments (`ptrsinit`): `SEI1XX` + count (else 26), 8-byte entries
(w0 length, w1 first-play length, w2 loop start, w3 loop length words), 4 bytes defsnd,
sample data, even pad, 15 words LFO lengths, LFO tables (first word = instrument).
STD: loop if b1 bit7 and w1: play w1 bytes then loop (w2, w3 words); else w0 one-shot.
EXT: loop if b1 bit7 and w3: same; EXT halves every sample (`calculateinstruments`)
for 2-voice mixing; instrument 36 = continue the voice from where it was cut ("(").
Packed `.ip` (`_decrunchinstrs` mm4:1560): after entries a word fibbits and a
1<<fibbits delta table; each sample is fibbits-bit codes, delta-accumulated, starting
from 0; one byte slack when a sample ends on a byte boundary; then LFO block verbatim.

## Output

STD voice n -> Paula n (L R R L). EXT voices 2k,2k+1 mixed onto Paula k. Periods in PAL
colour clocks (3546895 Hz). The native renderer resamples every voice at its exact
period (the EXT mixer's hightable/period approximation is not reproduced).

## Open

- LED filter bit: neither corpus song sets b2 bit 6; not modelled.
- `.ip.n` names are 16-byte fields; used for instrument names.
