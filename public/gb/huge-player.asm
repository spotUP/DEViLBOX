; DEViLBOX Game Boy player, hUGEDriver route (plan 2026-11-17-gameboy-native-player, Phase 2h-5h).
; Assembled once at dev time by tools/build-gb-player.sh; the exporter (src/lib/export/gb/hugeSong.ts)
; writes the song blob (hUGEDriver song descriptor + data, absolute pointers) into $2000 and the screen text and
; tick rate into the ScreenText block, then recomputes the global checksum. Dual-mode DMG + GBC (rgbfix -c): the APU is the same.
; Screen: thoughts/shared/design/player-ui/player-screens.html, Game Boy layout (20x18 tiles), tiles from tools/hwplayer/assets.ts.
include "include/hardware.inc"

DEF BAR_BOTTOM EQU _SCRN0 + 13 * 32 + 2   ; bars: rows 4-13, 4 tiles per channel from column 2
DEF TIME_AT EQU _SCRN0 + 15 * 32 + 2
DEF SCROLL_ROW EQU _SCRN0 + 17 * 32
DEF T_DIM EQU 64                          ; tile set offsets (assets.ts): text 0, dim 64, logo 128
DEF T_LOGO EQU 128
DEF T_BODY EQU 192
DEF T_EDGE EQU 201
DEF T_PLAY EQU 210

SECTION "VBlank", ROM0[$0040]
    jp vblank_isr
SECTION "Stat", ROM0[$0048]
    jp stat_isr
SECTION "Timer", ROM0[$0050]
    jp timer_isr

SECTION "Header", ROM0[$0100]
    nop
    jp start
    ds $150 - @, 0          ; rgbfix fills the logo, title, CGB flag and checksums

SECTION "Main", ROM0[$0150]
start:
    di
    ld sp, $DFFF
    ld a, $80
    ldh [rAUDENA], a        ; NR52: APU on (the Furnace dispatch never writes it)
    ld a, $FF
    ldh [rAUDTERM], a       ; NR51: all channels to both sides (hUGE pans with effect 8)
    ld a, $77
    ldh [rAUDVOL], a        ; NR50: full master volume
    xor a
    ldh [rAUD3ENA], a       ; NR30: DAC off so wave RAM is writable
    ld hl, _AUD3WAVERAM
    ld c, 16
.clear_wave:                ; wave RAM = zeros, as the Furnace reference assumes (DMG power-on is 00ff)
    ld [hli], a
    dec c
    jr nz, .clear_wave
    call screen_init
    ld hl, song
    call hUGE_init
    ld a, STATF_LYC
    ldh [rSTAT], a
    ld a, 17 * 8            ; scroller row: its own SCX from this line on
    ldh [rLYC], a
    ld a, [scr_rate]        ; 0 = one tick per VBlank (59.7275 Hz), else timer TMA at 4096 Hz (song tick rate)
    ld [use_timer], a
    and a
    ld b, IEF_VBLANK | IEF_STAT
    jr z, .no_timer
    ldh [rTMA], a
    ldh [rTIMA], a
    ld a, TACF_START | TACF_4KHZ
    ldh [rTAC], a
    ld b, IEF_VBLANK | IEF_STAT | IEF_TIMER
.no_timer:
    ld a, b
    ldh [rIE], a
    xor a
    ldh [rIF], a
    ld [tick_cnt], a
    ei
idle:
    halt
    nop
    ld a, [tick_cnt]
    and a
    jr z, idle
    ld hl, tick_cnt
    dec [hl]                ; one read-modify-write: an interrupt cannot land inside it
player_tick::                    ; one hUGEDriver tick; the harness counts executions here
    call hUGE_dosound
    jr idle

timer_isr:
    push af
    push hl
    ld hl, tick_cnt
    inc [hl]
    pop hl
    pop af
    reti

stat_isr:
    push af
    ld a, [scroll_x]
    ldh [rSCX], a
    pop af
    reti

vblank_isr:
    push af
    push bc
    push de
    push hl
    xor a
    ldh [rSCX], a
    ld a, [use_timer]
    and a
    jr nz, .no_tick
    ld hl, tick_cnt
    inc [hl]
.no_tick:
    ; time MM:SS (frames counted at 60 per second)
    ld hl, frame_cnt
    inc [hl]
    ld a, [hl]
    cp 60
    jr c, .draw_time
    ld [hl], 0
    ld a, [secs]
    inc a
    daa
    cp $60
    jr c, .set_secs
    ld a, [mins]
    inc a
    daa
    ld [mins], a
    xor a
.set_secs:
    ld [secs], a
.draw_time:
    ld hl, TIME_AT
    ld a, [mins]
    call put_bcd
    inc l
    ld a, [secs]
    call put_bcd
    ; scroller: one pixel per frame, the next character enters at the column just off screen
    ld hl, scroll_x
    inc [hl]
    ld a, [hl]
    and 7
    jr nz, .bars
    ld a, [hl]
    rrca
    rrca
    rrca
    add 20
    and 31
    ld e, a
    ld d, 0
    ld hl, SCROLL_ROW
    add hl, de
    ld a, [scroll_pos]
    ld e, a
    inc a
    ld [scroll_pos], a
    push hl
    ld hl, scr_scroll
    add hl, de
    ld a, [hl]
    pop hl
    sub $20
    ld [hl], a
.bars:
    ld a, [bar_ch]
    inc a
    and 3
    ld [bar_ch], a
    call draw_bar
    pop hl
    pop de
    pop bc
    pop af
    reti

; a = BCD byte -> two dim digit tiles at hl (hl advances by 2)
put_bcd:
    ld b, a
    swap a
    and $0F
    add T_DIM + $10
    ld [hli], a
    ld a, b
    and $0F
    add T_DIM + $10
    ld [hli], a
    ret

; a = channel 0-3: bar height = channel volume * 5 px (NRx2 envelope start or NR32 level, 0 when NR52 says off),
; falling 4 px per redraw.
draw_bar:
    ld c, a
    ld b, 1
    and a
    jr z, .mask_done
.mask:
    sla b
    dec a
    jr nz, .mask
.mask_done:
    ldh a, [rAUDENA]
    and b
    jr z, .have_vol
    ld a, c
    cp 2
    jr z, .wave
    ld hl, nrx2_regs
    ld e, c
    ld d, 0
    add hl, de
    ld l, [hl]
    ld h, $FF
    ld a, [hl]
    swap a
    and $0F
    jr .have_vol
.wave:
    ldh a, [rAUD3LEVEL]
    swap a
    rrca
    and 3
    ld hl, wave_vol
    ld e, a
    ld d, 0
    add hl, de
    ld a, [hl]
.have_vol:
    ld b, a
    add a, a
    add a, a
    add a, b                ; vol * 5 (0-75 of 80 px)
    ld b, a
    ld hl, bar_level
    ld e, c
    ld d, 0
    add hl, de
    ld a, [hl]
    sub 4
    jr nc, .fall
    xor a
.fall:
    cp b
    jr nc, .keep
    ld a, b
.keep:
    ld [hl], a
    ld b, a                 ; b = px left to draw
    ld a, c
    add a, a
    add a, a
    ld e, a
    ld hl, BAR_BOTTOM
    add hl, de
    ld d, 10
.row:
    ld a, b
    cp 8
    jr c, .part
    ld a, 8
.part:
    ld e, a
    ld a, b
    sub e
    ld b, a
    ld a, T_BODY
    add e
    ld [hli], a
    ld [hli], a
    ld [hli], a
    add T_EDGE - T_BODY
    ld [hl], a
    ld a, l
    sub 32 + 3
    ld l, a
    jr nc, .nc
    dec h
.nc:
    dec d
    jr nz, .row
    ret

nrx2_regs: db LOW(rAUD1ENV), LOW(rAUD2ENV), 0, LOW(rAUD4ENV)
wave_vol: db 0, 15, 7, 3

; hl = map address, de = text, b = length, c = tile set offset
put_text:
    ld a, [de]
    sub $20
    add c
    ld [hli], a
    inc de
    dec b
    jr nz, put_text
    ret

MACRO TEXT ; row, column, label, length, set
    ld hl, _SCRN0 + (\1) * 32 + (\2)
    ld de, \3
    ld bc, ((\4) << 8) | (\5)
    call put_text
ENDM

screen_init:
.wait_vblank:               ; the LCD may only be switched off in VBlank
    ldh a, [rLY]
    cp 144
    jr c, .wait_vblank
    xor a
    ldh [rLCDC], a
    ld hl, _VRAM
    ld de, screen_tiles
    ld bc, screen_tiles_end - screen_tiles
.tiles:
    ld a, [de]
    ld [hli], a
    inc de
    dec bc
    ld a, b
    or c
    jr nz, .tiles
    ld a, 1
    call clear_map          ; CGB attributes: palette 0, bank 0 (ignored on DMG)
    xor a
    call clear_map
    ld a, %00011011         ; DMG: colour i = design shade i (0 darkest)
    ldh [rBGP], a
    ld a, $80
    ldh [rBCPS], a
    ld hl, screen_cgb_pal
    ld c, 8
.pal:
    ld a, [hli]
    ldh [rBCPD], a
    dec c
    jr nz, .pal
    TEXT 0, 0, s_logo, 8, T_LOGO
    TEXT 0, 9, scr_title, 11, 0
    TEXT 1, 0, s_by, 3, T_DIM
    TEXT 1, 3, scr_author, 17, T_DIM
    TEXT 2, 0, s_chip, 7, T_DIM
    TEXT 2, 12, s_plat, 8, T_DIM
    TEXT 14, 3, s_labels, 13, T_DIM
    TEXT 15, 2, s_time, 5, T_DIM
    TEXT 15, 12, s_song, 8, 0
    TEXT 17, 0, scr_scroll, 21, 0
    ld a, T_PLAY
    ld [_SCRN0 + 15 * 32], a
    ld a, 21
    ld [scroll_pos], a
    xor a
    ld [scroll_x], a
    ld [frame_cnt], a
    ld [secs], a
    ld [mins], a
    ld [bar_ch], a
    ld hl, bar_level
    ld [hli], a
    ld [hli], a
    ld [hli], a
    ld [hl], a
    ld a, LCDCF_ON | LCDCF_BG8000 | LCDCF_BGON
    ldh [rLCDC], a
    ret

; a = VRAM bank: zero the 32x32 map
clear_map:
    ldh [rVBK], a
    ld hl, _SCRN0
    ld bc, $400
.c:
    xor a
    ld [hli], a
    dec bc
    ld a, b
    or c
    jr nz, .c
    ldh [rVBK], a
    ret

s_logo: db "DEVILBOX"
s_by: db "BY "
s_chip: db "DMG APU"
s_plat: db "GAME BOY"
s_labels: db "1   2   3   4"
s_time: db "00:00"
s_song: db "SONG 1/1"

include "screen_font.inc"

SECTION "PlayerVars", WRAM0
tick_cnt: db
use_timer: db
frame_cnt: db
secs: db
mins: db
scroll_x: db
scroll_pos: db
bar_ch: db
bar_level: ds 4

; Patched by the exporter (offsets in huge-player.json): tick rate, title, author, scroller text (256 chars, wraps).
SECTION "ScreenText", ROM0[$1D00]
scr_rate:: db 0             ; timer TMA at 4096 Hz; 0 = VBlank
scr_title:: ds 11, $20
scr_author:: ds 17, $20
scr_scroll:: ds 256, $20

; 32 KiB ROM-only cart linked tiny (rgblink -t): $0000-$7FFF is one flat space, so the song gets 24 KiB
; without MBC banking (hUGEDriver reads song data through plain pointers).
SECTION "Song", ROM0[$2000]
song::
    ds $6000, $FF
