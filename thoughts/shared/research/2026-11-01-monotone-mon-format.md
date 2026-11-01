# MONOTONE (.MON) format findings

Primary source: https://github.com/MobyGamer/MONOTONE (Jim Leonard / Trixter), Turbo Pascal 7. Licence: Unlicense (public domain), file LICENSE. Port freely.
Local source copies: scratchpad/mon-src/ (MTSRC/MT_SONG.PAS, MT_PLAY.PAS, MT_OUTP.PAS, MT_GLOB.PAS, MT_DEFS.INC, MONOTONE.TXT).

## 1. File layout (MT_SONG.PAS:142-157 TMTSongFileHeader, packed, little-endian)
- off 0, 9 B: FileID = Pascal string[8]: length byte 0x08 + "MONOTONE"
- off 9, 41 B: Title, string[40] (length byte + 40)
- off 50, 41 B: Comment, string[40]
- off 91: Version (=1)
- off 92: totalPatterns
- off 93: totalTracks (samples: 3 or 4; maxChannels=12 in code)
- off 94: CellSize (=2)
- off 95, 256 B: PatternOrder, 0xFF = end of song
- off 351: pattern data, totalPatterns * 64 rows * totalTracks * 2 B. Order: pattern, row, track (GetNotePtr MT_SONG.PAS:672-675). maxRows=64 (MT_GLOB.PAS).
- No instrument data in V1. Size check: file = 351 + pats*64*tracks*2 exact for all 3 samples.

Cell = 16-bit LE word, bits `nnnnnnne eedddddd` (MT_SONG.PAS:160-168):
- note = w>>9. 0 none, 1 = A0 (27.5 Hz) up to maxNote 100, 127 = note off.
- effect idx = (w>>6)&7 ; data = w&63.
- idx map (effDataToVisual): 0:0xy 1:1xx 2:2xx 3:3xx 4:4xy 5:Bxx 6:Dxx 7:Fxx.
- 0 and 4: data = x(3 bits)<<3 | y(3 bits). Others: data = 6-bit xx (0..63).
- Fxx with 0 stored as 1 (MT_SONG.PAS:793).
- Verified on PRELUDE.MON first cells: bytes c8 51 -> note 40, eff 7 (F), data 8; c7 59 -> note 44, eff 7, data 7 (speed set on row 0, plausible).

## 2. Effects (MT_PLAY.PAS: UpdateNotesPerRow 394-568 = tick 0; UpdateEffectsPerTick 570-649 = ticks 1..speed-1)
Total: 8 commands (0 1 2 3 4 B D F).
- Note: 127 -> channel inactive. Note with effect != 3 -> freq = notesHz[note*8], vibIndex=0, active. Note 0 keeps old note sounding.
- 0xy arpeggio (if x or y nonzero): tick mod 3: 0 base, 1 +x semitones, 2 +y semitones.
- 1xx: Frequency += xx Hz per tick (clamp 65535-63). 2xx: -= xx Hz (min 20). Hz domain, linear.
- 3xx: note sets portaStopHz only (no retrigger); xx != 0 sets portaDelta (Hz/tick); move toward target without overshoot.
- 4xy: x = speed, y = depth (nonzero latch). Table 32 entries round(64*sin(i*2pi/32)). Per tick: Frequency = notesHz[noteInterval + tab[idx]*depth div 64]; idx = (idx+speed)&31. Tick 0 advances idx only.
- Bxx: tick 0, order = xx, row restarts at 0.
- Dxx: next row = xx (plain number, not BCD) in next order; >=64 -> 0. order++ unless jump already on this row.
- Fxx: ticks per row = xx (MONOTONE.TXT ~328). No BPM mode; header comment "00-1F / 20-FF" (MT_SONG.PAS ~182) is not implemented.
- Row engine (MT_PLAY.PAS ~660-720): tickCount++ ; when >= Tempo -> tick 0 of next row. Start: tickCount = Tempo so row 0 fires at once. End of pattern (row 64) -> next order; order byte 0xFF -> stop.

## 3. Playback model
- Tick = 60 Hz (playerTimeSliceFreq=60, MT_PLAY.PAS:63). Initial speed = max(numTracks, 4) ticks/row (MT_PLAY.PAS:238-239).
- Note table (MT_PLAY.PAS:214-235): 8 sub-steps per semitone (IBN=8). notesHz[8] = round(27.5); upward x 2^(1/96) per step, each rounded to integer Hz (compounded round); downward divide, min 19. Note n -> notesHz[n*8]. Replicate the rounding for 1:1.
- PC speaker device TPCSpeakerSimple (MT_OUTP.PAS:87-133, 326-381): 1 voice, max 4 tracks. Per 60 Hz tick one "dominant" channel is output; dominant index increments each tick, wraps at numVChannels, and resets to 0 when tickCount==0 (new row). equalShare=false (author default/recommended): inactive dominant channel leaves last frequency sounding; silence only if all inactive. equalShare=true: inactive slot is silent. Output applied one tick late. A track is audible only if speed >= numTracks (MONOTONE.TXT ~404-410).
- Square wave only, no volume, no instruments.

## 4. Other outputs (MT_OUTP.PAS)
- Implemented classes: PC speaker, YM3812 Adlib (9 voices, instrument from PCSPEAKR.SBI), SN76489 (3 voices, period = 3579540 div (32*freq), clamp 0..1023). True multichannel: all tracks play at once, same effect/frequency logic.
- audiochoices enum also lists SAA1099, AY-3-8910, PIT2-4, Tandy combo: no classes seen.

## 5. Samples (raw.githubusercontent.com/MobyGamer/MONOTONE/HEAD/<NAME>)
- scratchpad/mon-samples/prelude/PRELUDE.MON 12127 B (23 pats, 4 trk)
- scratchpad/mon-samples/no_roads/NO_ROADS.MON 17759 B (34 pats, 4 trk)
- scratchpad/mon-samples/swingin1/SWINGIN1.MON 12255 B (31 pats, 3 trk)
- Others in repo: RICKROLL.MON, UNDERSTA.MON, YESSO.MON, Jakim-AboriginalDerivatives.mon.
- Headers match layout (08 "MONOTONE", version 01, cellsize 02); titles/comments empty.

## 6. Licence
Unlicense, public domain.

## UNVERIFIED
- PITfreq constant (grep found only the use at MT_OUTP.PAS:394; definition in an unfetched unit). Standard PC value is 1193182.
- Where equalShare default is set (MT.PAS / MT_SETUP.PAS not fetched).
- Dxx/Bxx edge cases only read, not run.
- Title/Comment padding bytes (all samples empty).
