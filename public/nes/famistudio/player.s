; NROM-256 player for the vendored FamiStudio sound engine (third-party/famistudio).
; The converter (src/lib/export/nes/famistudioSong.ts) patches the song data in at fs_music ($8000), the DPCM
; samples at $C000 and the screen text. NTSC, famistudio_update once per NMI after the screen.
; Screen: the drafted player screen of public/nes/player.s (same layout, font and logo from screen.chr), see its notes.
.define FAMISTUDIO_CA65_ZP_SEGMENT   ZEROPAGE
.define FAMISTUDIO_CA65_RAM_SEGMENT  BSS
.define FAMISTUDIO_CA65_CODE_SEGMENT CODE
FAMISTUDIO_CFG_EXTERNAL          = 1
FAMISTUDIO_CFG_NTSC_SUPPORT      = 1
FAMISTUDIO_CFG_DPCM_SUPPORT      = 1
FAMISTUDIO_USE_FAMITRACKER_TEMPO = 1
FAMISTUDIO_USE_VOLUME_TRACK      = 1
FAMISTUDIO_USE_RELEASE_NOTES     = 1
FAMISTUDIO_USE_DUTYCYCLE_EFFECT  = 1
FAMISTUDIO_USE_VIBRATO = 1
FAMISTUDIO_USE_ARPEGGIO = 1
FAMISTUDIO_USE_PITCH_TRACK = 1
FAMISTUDIO_USE_SLIDE_NOTES = 1
FAMISTUDIO_USE_VOLUME_SLIDES = 1
FAMISTUDIO_USE_FAMITRACKER_DELAYED_NOTES_OR_CUTS = 1
FAMISTUDIO_DPCM_OFF              = $c000
.ifdef VRC6
FAMISTUDIO_EXP_VRC6              = 1     ; -D VRC6=1: mapper-24 board, 2A03 + 3 VRC6 channels (player-vrc6.nes)
.endif

.include "famistudio_ca65.s"

.segment "HEADER"
.ifdef VRC6
    .byte "NES", $1a, 2, 1, $80, $10, 0, 0, 0, 0, 0, 0, 0, 0   ; mapper 24
.else
    .byte "NES", $1a, 2, 1, $00, $00, 0, 0, 0, 0, 0, 0, 0, 0
.endif

; Screen (drafted design, thoughts/shared/plans/2026-11-15-hardware-player-ui-design.md): 32x30 grid, margin 2.
; Tiles (public/nes/screen.chr, tools/hwplayer/assets.ts): 0-63 dim glyphs (ASCII-$20), 73 rule, 74 play, 75 pause, 76-79 logo,
; 80-143 white glyphs, 144-191 bar-colour glyphs ($30-$5F), 192-216 bar body tiles, 217-241 bar edge tiles.
; Palettes: BG0 text, BG1 bars (rows 6-23, columns 6-25), BG2 logo, BG3 zones (loaded, unused: zones are off by default).
T_RULE  = 73
T_PLAY  = 74
T_PAUSE = 75
T_LOGO  = 76
T_SOLID = 72                    ; solid colour 3 block (black through sprite palette 0)
T_WHITE = 80
T_CHIP  = 144
T_BODY  = 192
T_EDGE  = 217
NBARS         = 5               ; pulse 1, pulse 2, triangle, noise, DPCM
BARROWS       = 18              ; rows 6-23
QMAX          = 16              ; bar tile updates per NMI (keeps the PPU writes inside vblank)
RISE          = 12              ; bar attack, pixels per frame
FALL          = 4               ; bar release, pixels per frame
HOLD          = 32              ; frames the peak cap rests before it falls

.segment "ZEROPAGE"
fs_ptr:     .res 2
fs_fc:      .res 1              ; frames within the second
fs_tm:      .res 4              ; MM:SS digits: m10 m1 s10 s1
fs_paused:  .res 1
fs_dirty:   .res 1              ; status line needs a redraw
fs_pad:     .res 1
fs_pad2:    .res 1
fs_padold:  .res 1
fs_cur:     .res 1              ; current subsong
fs_scrpos:  .res 1              ; next fs_scroll character to put into the row
fs_sx:      .res 1              ; scroller row X scroll, 1 pixel per frame
fs_tmpa:    .res 1
fs_tmpb:    .res 1
fs_tbase:   .res 1              ; tile = ASCII + fs_tbase in fs_puttext
fs_dbase:   .res 1              ; digit tile base
fs_qn:      .res 1              ; bytes in the bar write list
fs_L:       .res NBARS          ; bar level in pixels 0-144
fs_C:       .res NBARS          ; peak cap pixel 0-142
fs_H:       .res NBARS          ; cap hold frames left
fs_pbar:    .res 1
fs_pcol:    .res 1
fs_sbase:   .res 1
fs_pb:      .res 1
fs_pb8:     .res 1
fs_ptb:     .res 1
fs_peh:     .res 1
fs_pf:      .res 1
fs_slot:    .res 1

.segment "BSS"
fs_shadow:  .res NBARS*BARROWS  ; bar tile slot last queued for each cell
fs_q:       .res QMAX*4         ; write list: PPU high, low, body slot tile (x3), edge slot tile

.segment "MUSIC"
fs_music:
.segment "DPCM"
fs_dpcm:

.segment "CODE"
fs_reset:
    sei
    cld
.ifdef VRC6
    lda #0
    sta $8000                   ; 16 KB bank 0 at $8000 = music
    lda #2
    sta $c000                   ; 8 KB bank 2 at $C000 = DPCM; $E000 is fixed to the last bank
    lda #$24
    sta $b003                   ; normal CHR banking, horizontal mirroring like the NROM header
    ldx #3
:   txa
    sta $d000,x                 ; CHR 1 KB banks 0-3 / 4-7 = the 8 KB CHR
    clc
    adc #4
    sta $e000,x
    dex
    bpl :-
.endif
    ldx #$40
    stx $4017
    ldx #$ff
    txs
    inx
    stx $2000
    stx $2001
    stx $4010
:   bit $2002
    bpl :-
    txa
:   sta $0000,x
    sta $0100,x
    sta $0200,x
    sta $0300,x
    sta $0400,x
    sta $0500,x
    sta $0600,x
    sta $0700,x
    inx
    bne :-
:   bit $2002
    bpl :-
    lda #$ff
    ldx #NBARS*BARROWS-1
:   sta fs_shadow,x             ; every cell is drawn once
    dex
    bpl :-
    jsr fs_screen_init
    lda #1                      ; NTSC
    ldx #<fs_music
    ldy #>fs_music
    jsr famistudio_init
    lda #0
    jsr famistudio_music_play
    lda #$ff                    ; OAM: every sprite off-screen but sprite 0 (the split marker), copied once by DMA;
    ldx #0                      ; rendering stays on from here, which keeps OAM refreshed
:   sta $0200,x
    inx
    bne :-
    ldx #15
:   lda fs_spr0,x
    sta $0200,x
    dex
    bpl :-
    lda #0
    sta $2003
    lda #2
    sta $4014
    lda #$1a
    sta $2001                   ; background + sprites on, left 8 background pixels shown
    lda #$80
    sta $2000                   ; NMI on
fs_idle:
    jmp fs_idle

fs_nmi:
    pha
    txa
    pha
    tya
    pha
    jsr fs_screen               ; PPU writes first, while the whole vblank is free
    jsr famistudio_update
    jsr fs_levels               ; motion and the next frame's bar write list, outside vblank
    jsr fs_plan
    jsr fs_split
fs_tick:
    pla
    tay
    pla
    tax
    pla
fs_irq:
    rti

fs_puttext:                     ; fs_ptr -> text, X = length; PPU address already set; tile = ASCII + fs_tbase
    ldy #0
:   lda (fs_ptr),y
    clc
    adc fs_tbase
    sta $2007
    iny
    dex
    bne :-
    rts
fs_setaddr:                     ; A = high, X = low
    sta $2006
    stx $2006
    rts
fs_pstr:                        ; A = low, X = high of an ASCII string whose length is in Y
    sta fs_ptr
    stx fs_ptr+1
    tya
    tax
    jmp fs_puttext
fs_pdig:                        ; A = 0-9
    clc
    adc fs_dbase
    sta $2007
    rts
fs_pnum:                        ; A = 0-99 as two digits
    ldx #0
:   cmp #10
    bcc :+
    sbc #10
    inx
    bne :-
:   pha
    txa
    jsr fs_pdig
    pla
    jmp fs_pdig
fs_rule:                        ; A = high, X = low: 28 rule tiles
    jsr fs_setaddr
    ldx #28
    lda #T_RULE
:   sta $2007
    dex
    bne :-
    rts

.macro PUTAT hi, lo, ptr, len
    lda #hi
    ldx #lo
    jsr fs_setaddr
    lda #<ptr
    ldx #>ptr
    ldy #len
    jsr fs_pstr
.endmacro

fs_screen_init:                 ; rendering is off here; CHR is ROM
    lda #$3F
    ldx #0
    jsr fs_setaddr
:   lda fs_palette,x
    sta $2007
    inx
    cpx #32
    bne :-
    lda #$24                    ; clear nametables 0 ($2400 mirrors $2000) and 2 (the scroller row) with their attributes
    ldx #0
    jsr fs_setaddr
    ldx #8
    ldy #0
    lda #0
:   sta $2007
    iny
    bne :-
    dex
    bne :-
    lda #$23
    ldx #$C0
    jsr fs_setaddr
    ldx #0
:   lda fs_attr,x
    sta $2007
    inx
    cpx #64
    bne :-
    lda #$2B                    ; nametable 2 attributes: palette 3 (white scroller)
    ldx #$C0
    jsr fs_setaddr
    lda #$FF
    ldx #64
:   sta $2007
    dex
    bne :-
    lda #T_CHIP-$30             ; logo: the word DEVILBOX in the logo colour, column 2 row 2 (design: same font, no mark)
    sta fs_tbase
    PUTAT $20, $42, fs_t_logo, 8
    lda #T_WHITE-$20            ; title, white, column 11 row 2, 19 wide
    sta fs_tbase
    PUTAT $20, $4B, fs_title, 19
    lda #$E0                    ; dim text
    sta fs_tbase
    PUTAT $20, $62, fs_t_by, 3
    PUTAT $20, $65, fs_author, 25
    PUTAT $20, $9B, fs_t_nes, 3
    lda #$20                    ; chip name, row 4 column 2, in the bar colour
    ldx #$82
    jsr fs_setaddr
    ldy #0
:   lda fs_chip,y
    cmp #$30
    bcc @blank
    clc
    adc #T_CHIP-$30
    bne @put
@blank:
    lda #0
@put:
    sta $2007
    iny
    cpy #16
    bne :-
    lda #$20
    ldx #$A2
    jsr fs_rule
    lda #$23
    ldx #$42
    jsr fs_rule
    ldx #0                      ; bar labels 1-5, row 24
:   lda #$23
    sta $2006
    txa
    asl a
    asl a
    clc
    adc #7
    sta $2006
    txa
    clc
    adc #$11
    sta $2007
    inx
    cpx #5
    bne :-
    jsr fs_status
    lda #$2B                    ; scroller: nametable 2 row 27, columns 2-31 = characters 0-29 (character 0 at x 16 - scroll,
    ldx #$62                    ; as in the design); the first NMI steps fs_sx to 0 and puts character 30 into column 0
    jsr fs_setaddr
    ldx #0
:   jsr fs_scrchr
    cpx #30
    bne :-
    stx fs_scrpos
    lda #$FF
    sta fs_sx
    jmp fs_scroll00             ; NMI stays off here: fs_reset turns it on with nametable 0

fs_scrollreset:                 ; leave the PPU scroll at 0,0 on nametable 0 (address writes and the split disturb it)
    lda #$80
    sta $2000
fs_scroll00:
    lda $2002
    lda #0
    sta $2005
    sta $2005
    rts

fs_status:                      ; row 25: play/pause glyph and MM:SS (time cyan), SONG n/m (white) ending at column 29
    lda #$23
    ldx #$22
    jsr fs_setaddr
    lda fs_paused
    beq :+
    lda #T_PAUSE
    bne :++
:   lda #T_PLAY
:   sta $2007
    lda #0
    sta $2007
    lda #T_CHIP                 ; colour 3 digits: palette 3 makes them the time cyan
    sta fs_dbase
    lda fs_tm
    jsr fs_pdig
    lda fs_tm+1
    jsr fs_pdig
    lda #T_CHIP+$0A             ; ':'
    sta $2007
    lda fs_tm+2
    jsr fs_pdig
    lda fs_tm+3
    jsr fs_pdig
    lda #$23                    ; columns 20-29: blanks, then SONG n/m without leading zeros
    ldx #$34
    jsr fs_setaddr
    ldy #2                      ; 10 - "SONG " - "/" - two one-digit numbers
    lda fs_cur
    cmp #9
    bcc :+
    dey
:   lda fs_nsub
    cmp #10
    bcc :+
    dey
:   tya
    beq :++
    lda #0
:   sta $2007
    dey
    bne :-
:   lda #T_WHITE-$20
    sta fs_tbase
    lda #<fs_t_song
    ldx #>fs_t_song
    ldy #5
    jsr fs_pstr
    lda #T_WHITE+$10
    sta fs_dbase
    lda fs_cur
    clc
    adc #1
    jsr fs_pnum1
    lda #T_WHITE+$0F            ; '/'
    sta $2007
    lda fs_nsub
fs_pnum1:                       ; A = 1-99 without a leading zero
    cmp #10
    bcs :+
    jmp fs_pdig
:   jmp fs_pnum

fs_scrchr:                      ; X = fs_scroll index -> one white character to $2007, X + 1
    lda fs_scroll,x
    clc
    adc #T_WHITE-$20
    sta $2007
    inx
    rts

fs_scrstep:                     ; vblank: scroller 1 pixel on; at each 8-pixel boundary the column that just left on the
    inc fs_sx                   ; left (hidden by the split's left-8 mask) gets the character entering on the right
    lda fs_sx
    and #7
    bne @done
    lda fs_sx
    lsr a
    lsr a
    lsr a
    ora #$60
    tax
    lda #$2B
    jsr fs_setaddr
    ldx fs_scrpos
    jsr fs_scrchr
    txa
    and #$7F
    sta fs_scrpos
@done:
    rts

fs_split:                       ; sprite 0 sits behind the row 26 rule (pixel row 3 = scanline 211). From scanline 213 the
    lda fs_sx                   ; picture comes from nametable 2 (white scroller attributes) scrolled by fs_sx: the $2006/
    lsr a                       ; $2005/$2005/$2006 sequence sets Y 212 (vertical increment at dot 256 makes 213) and X
    lsr a
    lsr a
    ora #$40                    ; second $2006 byte: coarse Y 26 (bits 5-9 = $340 -> low byte $40) | coarse X
    tay
:   bit $2002                   ; wait out the previous frame's hit (cleared on the pre-render line)
    bvs :-
:   bit $2002
    bvc :-
    ldx #25                     ; ~125 cycles: the writes land on blank scanline 212, not mid-rule
:   dex
    bne :-
    lda #$18                    ; hide the left 8 background pixels: the wrapping column changes there
    sta $2001
    lda #$08                    ; nametable 2
    sta $2006
    lda #212
    sta $2005
    lda fs_sx
    sta $2005
    sty $2006
    rts

fs_level:                       ; X = bar -> A = level 0..15 from the engine's per-channel state (X kept)
    lda fs_paused               ; pause mutes the 2A03 but the engine keeps its notes
    beq :+
    lda #0
    rts
:   cpx #4
    beq @dpcm
    lda famistudio_chn_note,x   ; a channel with a note shows the engine's output volume (envelope x volume track,
    beq @off                    ; as famistudio_update_channel_sound computes it), the triangle just on/off
    ldy fs_envidx,x
    lda famistudio_chn_volume_track,x
    and #$f0                    ; low nibble is the volume slide fraction
    ora famistudio_env_value,y
    tay
    lda famistudio_volume_table,y
    cpx #2
    bne @off
    tay                         ; triangle: any volume = full
    bne @full
    rts
@dpcm:
    lda $4015                   ; DMC active bit
    and #$10
    beq @off
@full:
    lda #15
@off:
    rts

fs_levels:                      ; level: RISE pixels per frame attack, FALL pixels per frame fall (smooth: at most ~2 tile rows per bar per frame, inside QMAX). Cap: follows the level, rests HOLD frames, falls 1 pixel
    ldx #NBARS-1
@bar:
    jsr fs_level
    tay
    lda fs_tgt,y
    sta fs_tmpa
    lda fs_L,x
    cmp fs_tmpa
    bcc @rise                   ; below target: rise RISE pixels (not past it)
    sec
    sbc #FALL
    bcs :+
    lda #0
:   cmp fs_tmpa
    bcs @set
    lda fs_tmpa
    jmp @set
@rise:
    adc #RISE                   ; carry is clear here
    cmp fs_tmpa
    bcc @set
    lda fs_tmpa
@set:
    sta fs_L,x
    cmp fs_C,x
    bcc @fall
    cmp #143
    bcc :+
    lda #142
:   sta fs_C,x
    lda #HOLD
    sta fs_H,x
    bne @next
@fall:
    lda fs_H,x
    beq :+
    dec fs_H,x
    jmp @next
:   lda fs_C,x
    beq @next
    dec fs_C,x
@next:
    dex
    bpl @bar
    rts

fs_plan:                        ; diff the wanted bar tiles against fs_shadow and queue at most QMAX writes for the next NMI
    lda #0
    sta fs_qn
    sta fs_pbar
    sta fs_sbase
    lda #6
    sta fs_pcol
@bar:
    ldx fs_pbar
    lda fs_C,x
    and #7
    sta fs_peh                  ; h: cap pixel within its tile
    lda fs_C,x
    and #$F8
    sta fs_tmpa                 ; 8 * cap tile (from the bottom)
    lsr a
    lsr a
    lsr a
    sta fs_ptb
    lda fs_L,x
    sec
    sbc fs_tmpa
    bcs :+
    lda #0
:   cmp #9
    bcc :+
    lda #8
:   sta fs_pf                   ; fill of the cap tile
    cmp #0                      ; sta keeps the flags of the cmp #9 above (Z never set): a zero fill used to snap the cap to the tile base
    beq @nosnap
    cmp fs_peh
    bcs @nosnap
    asl a                       ; gap between the fill and the cap inside the cap tile: no such CHR tile (42 would be needed).
    cmp fs_peh                  ; The cap stays exact; the fill is snapped to the nearer of 0 and the cap row (error <= 3 pixels).
    bcc @lower
    lda fs_peh
    sta fs_pf
    jmp @nosnap
@lower:
    lda #0
    sta fs_pf
@nosnap:
    lda #0
    sta fs_pb
    sta fs_pb8
@row:
    ldx fs_pbar
    lda fs_L,x
    sec
    sbc fs_pb8
    bcs :+
    lda #0
:   cmp #9
    bcc :+
    lda #8
:   sta fs_slot
    lda fs_pb
    cmp fs_ptb
    bne @notcap
    lda fs_pf
    beq @caponly
    lda fs_peh
    beq @caponly
    clc
    adc #16                     ; cap on a fill of h rows: slots 17-23
    sta fs_slot
    jmp @have
@caponly:
    lda fs_peh
    clc
    adc #9
    sta fs_slot
    jmp @have
@notcap:
    lda fs_peh                  ; a cap at h=7 spills one pixel row into the tile above
    cmp #7
    bne @have
    lda fs_ptb
    clc
    adc #1
    cmp fs_pb
    bne @have
    lda #24
    sta fs_slot
@have:
    lda fs_sbase
    clc
    adc fs_pb
    tay
    lda fs_slot
    cmp fs_shadow,y
    beq @next
    ldx fs_qn
    cpx #QMAX*4
    bcs @next                   ; list full: the cell stays different and is queued on a later frame
    sta fs_shadow,y
    ldy fs_pb
    lda fs_rowhi,y
    sta fs_q,x
    lda fs_rowlo,y
    ora fs_pcol
    sta fs_q+1,x
    lda fs_slot
    clc
    adc #T_BODY
    sta fs_q+2,x
    lda fs_slot
    clc
    adc #T_EDGE
    sta fs_q+3,x
    txa
    clc
    adc #4
    sta fs_qn
@next:
    lda fs_pb8
    clc
    adc #8
    sta fs_pb8
    inc fs_pb
    lda fs_pb
    cmp #BARROWS
    bcs @rowsdone
    jmp @row
@rowsdone:
    lda fs_sbase
    clc
    adc #BARROWS
    sta fs_sbase
    lda fs_pcol
    clc
    adc #4
    sta fs_pcol
    inc fs_pbar
    lda fs_pbar
    cmp #NBARS
    bcs :+
    jmp @bar
:   rts

fs_replay:                      ; PPU: the queued bar cells, body x3 then edge
    ldx #0
    cpx fs_qn
    beq @done
@e:
    lda fs_q,x
    sta $2006
    lda fs_q+1,x
    sta $2006
    lda fs_q+2,x
    sta $2007
    sta $2007
    sta $2007
    lda fs_q+3,x
    sta $2007
    inx
    inx
    inx
    inx
    cpx fs_qn
    bcc @e
@done:
    lda #0
    sta fs_qn
    rts

fs_screen:                      ; draw first, then read the pad: a pause or subsong restart takes effect next frame
    jsr fs_draw
    lda #$1a                    ; undo the split's left-8 mask for the top of the frame
    sta $2001
    jmp fs_joypad
fs_draw:
    jsr fs_replay
    jsr fs_scrstep
    lda fs_paused               ; MM:SS counts frames while playing
    bne @notime
    inc fs_fc
    lda fs_fc
    cmp #60
    bcc @notime
    lda #0
    sta fs_fc
    inc fs_dirty
    ldx #3
:   inc fs_tm,x
    lda fs_tm,x
    cmp fs_tlim,x
    bcc @notime
    lda #0
    sta fs_tm,x
    dex
    bpl :-
@notime:
    lda fs_dirty                ; a status frame draws the status line only (keeps the NMI inside vblank)
    beq @nostatus
    lda #0
    sta fs_dirty
    jsr fs_status
@nostatus:
    jmp fs_scrollreset

fs_readpad:                     ; A = buttons: bit7 A, 6 B, 5 Select, 4 Start, 3 Up, 2 Down, 1 Left, 0 Right
    lda #1
    sta $4016
    lda #0
    sta $4016
    ldx #8
:   lda $4016
    lsr a
    rol fs_pad
    dex
    bne :-
    lda fs_pad
    rts
fs_joypad:
    jsr fs_readpad              ; the DMC steals cycles and corrupts a read: accept a value only when two reads agree
    sta fs_pad2
    jsr fs_readpad
    cmp fs_pad2
    bne @none
    tax
    eor fs_padold               ; newly pressed
    and fs_pad2
    stx fs_padold
    sta fs_tmpb
    and #$90                    ; Start or A
    beq @nopause
    lda fs_paused
    eor #1
    sta fs_paused
    inc fs_dirty
    jsr famistudio_music_pause  ; A = 1 pause (mutes the 2A03), 0 resume
@nopause:
    lda fs_tmpb
    and #$03
    beq @none
    and #$01                    ; Right = next, Left = previous
    bne @next
    lda fs_cur
    bne :+
    lda fs_nsub
:   sec
    sbc #1
    jmp @go
@next:
    lda fs_cur
    clc
    adc #1
    cmp fs_nsub
    bcc @go
    lda #0
@go:
    sta fs_cur
    lda #0
    sta fs_paused
    sta fs_fc
    sta fs_tm
    sta fs_tm+1
    sta fs_tm+2
    sta fs_tm+3
    lda fs_cur
    jsr famistudio_music_play   ; restarts the clock with the subsong
    inc fs_dirty
@none:
    rts

fs_palette:                     ; design colours (player-screens.html): BG0 dim/rule/bar (rows 4-5, 26), BG1 bars,
    .byte $0F,$10,$2D,$27, $0F,$17,$27,$2C, $0F,$10,$30,$26, $0F,$10,$30,$2C ; BG2 dim/white/logo (rows 2-3), BG3 dim/white/cyan
    .byte $0F,$0F,$0F,$0F, $0F,$0F,$0F,$0F, $0F,$0F,$0F,$0F, $0F,$0F,$0F,$0F
fs_attr:                        ; rows 2-3 palette 2, bar cells (3-12, 3-11) palette 1, rows 24-25 palette 3, the rest palette 0
    .byte $A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
    .byte $00,$40,$50,$50,$50,$50,$10,$00
    .byte $00,$44,$55,$55,$55,$55,$11,$00
    .byte $00,$44,$55,$55,$55,$55,$11,$00
    .byte $00,$44,$55,$55,$55,$55,$11,$00
    .byte $00,$44,$55,$55,$55,$55,$11,$00
    .byte $0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F
    .byte $00,$00,$00,$00,$00,$00,$00,$00
fs_tgt:     .byte 0,10,19,29,38,48,58,67,77,86,96,106,115,125,134,144
fs_rowlo:
.repeat BARROWS, b
    .byte <((23-b)*32)
.endrepeat
fs_rowhi:
.repeat BARROWS, b
    .byte $20+((23-b)>>3)
.endrepeat
fs_t_song:  .byte "SONG "
fs_t_by:    .byte "BY "
fs_t_nes:   .byte "NES"
fs_t_logo:  .byte "DEVILBOX"
fs_tlim:    .byte 10,10,6,10
fs_spr0:    .byte 207, T_RULE, $20, 16 ; sprite 0: row 26 column 2, behind the background, black palette
            .byte 215, T_SOLID, $00, 8, 215, T_SOLID, $00, 240, 215, T_SOLID, $00, 248 ; black masks: scroller clipped to x 16-239
fs_envidx:  .byte FAMISTUDIO_CH0_ENVS+FAMISTUDIO_ENV_VOLUME_OFF, FAMISTUDIO_CH1_ENVS+FAMISTUDIO_ENV_VOLUME_OFF, FAMISTUDIO_CH2_ENVS+FAMISTUDIO_ENV_VOLUME_OFF, FAMISTUDIO_CH3_ENVS+FAMISTUDIO_ENV_VOLUME_OFF

; Text slots patched by the exporter (offsets in player.json): uppercase ASCII, space padded.
fs_title:  .byte "UNTITLED"
           .res 24, $20
fs_author: .byte "DEVILBOX"
           .res 24, $20
fs_chip:   .byte "2A03"
           .res 12, $20
fs_scroll: .byte "UNTITLED - DEVILBOX"
           .res 109, $20
fs_nsub:   .byte 1              ; subsong count (the exporter writes one subsong)

.segment "CHARS"
    .incbin "screen.chr"

.segment "VECTORS"
    .word fs_nmi, fs_reset, fs_irq
