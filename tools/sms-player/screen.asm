; DEViLBOX Master System / Game Gear player screen, laid out as
; thoughts/shared/design/player-ui/player-screens.html (SMS 32x24 with a
; 1-tile margin; Game Gear 20x18 at map column 6, row 3, its 160x144 window).
; Tiles and palettes come from screen_font.inc (tools/hwplayer/assets.ts).
; The exporter patches scr_title, scr_author and scr_scroll (offsets in
; public/sms/player.json). Bars follow the Banjo driver volume of each
; channel (music_calculate_volume_0x0f, as the SN driver computes it).

.define VDP_DATA 0xbe
.define NAME_TABLE 0x3800
.define TILE_RULE 50
.define TILE_TEXT 51
.define TILE_DIM 116
.define TILE_BARC 181
.define TILE_LOGO 246
.define TILE_TIME 311
.define BAR_EDGE 25
.define BAR_CAP_HOLD 32
.define MAX_BAR_ROWS 14

.RAMSECTION "Screen Vars" bank 0 slot 3
	scr_vblank: db
	scr_hscroll: db
	scr_scroll_px: db
	scr_msg_pos: db
	scr_frames: db
	scr_secs: db		; BCD
	scr_mins: db		; BCD
	scr_lv: dsb 4
	scr_cap: dsb 4
	scr_hold: dsb 4
	scr_base: dw		; put_text colour base tile
	; per-console layout, copied from scr_layout_sms / scr_layout_gg
	scr_bar_vram: dw
	scr_bar_rows: db
	scr_fall: db
	scr_table: dw		; volume -> bar height (pixels)
	scr_time_vram: dw
	scr_scroll_vram: dw
	scr_col_off: db
	scr_line: db
	scr_texts: dw
	scr_buf: dsb MAX_BAR_ROWS * 32
	scr_bar: db		; bar loop temporaries
	scr_tile: db
.ENDS

.SECTION "Screen" free
; Display off, interrupts off. Loads tiles, palette, the static text and the
; first scroller columns; returns a = VDP register 0 value to keep.
screen_init:
	ld hl, VDP_WRITE_REGISTER | (1 << 8) | 0b10000000	; display off
	call vdp_reg
	ld hl, VDP_WRITE_REGISTER | (2 << 8) | 0xff		; name table 0x3800
	call vdp_reg
	ld hl, VDP_WRITE_REGISTER | (5 << 8) | 0xff		; sprite table 0x3f00
	call vdp_reg
	ld hl, VDP_WRITE_REGISTER | (6 << 8) | 0xfb
	call vdp_reg
	ld hl, VDP_WRITE_REGISTER | (7 << 8) | 0x00		; border = sprite colour 0
	call vdp_reg
	ld hl, VDP_WRITE_REGISTER | (8 << 8) | 0x00
	call vdp_reg
	ld hl, VDP_WRITE_REGISTER | (9 << 8) | 0x00
	call vdp_reg

	; clear all 16 KB of VRAM
	ld hl, 0x4000
	call vdp_addr
	ld bc, 0x4000
-:	xor a
	out (VDP_DATA), a
	dec bc
	ld a, b
	or c
	jr nz, -
	ld hl, 0x3f00 | 0x4000		; no sprites
	call vdp_addr
	ld a, 0xd0
	out (VDP_DATA), a

	; 4bpp tiles 0-50, then the 1 bpp glyphs in five colours
	ld hl, 0x4000
	call vdp_addr
	ld hl, screen_tiles
	ld bc, screen_tiles_end - screen_tiles
-:	ld a, (hl)
	out (VDP_DATA), a
	inc hl
	dec bc
	ld a, b
	or c
	jr nz, -
	ld e, 1				; text, dim, bar, cap (time), logo colours in tile order
	call glyph_set
	ld e, 2
	call glyph_set
	ld e, 3
	call glyph_set
	ld e, 6
	call glyph_set
	ld e, 5
	call glyph_set

	; layout and palette for this console
	ld a, (banjo_system_flags)
	and SYS_FLAG_GG
	jr nz, +
	ld hl, 0xc000			; CRAM 0
	call vdp_addr
	ld hl, screen_pal_sms
	ld b, 8
	call out_b
	ld b, 24			; rest of both palettes = background
-:	ld a, (screen_pal_sms)
	out (VDP_DATA), a
	djnz -
	ld hl, scr_layout_sms
	jr ++
+:	ld hl, 0xc000
	call vdp_addr
	ld hl, screen_pal_gg
	ld b, 16
	call out_b
	ld b, 24
-:	ld a, (screen_pal_gg)
	out (VDP_DATA), a
	ld a, (screen_pal_gg + 1)
	out (VDP_DATA), a
	djnz -
	ld hl, scr_layout_gg
++:	ld de, scr_bar_vram
	ld bc, scr_buf - scr_bar_vram
	ldir

	; static text: row, column, colour base tile, string, length; row 0xff ends
	ld ix, (scr_texts)
-:	ld b, (ix + 0)
	ld a, b
	inc a
	jr z, +
	ld c, (ix + 1)
	ld l, (ix + 2)
	ld h, (ix + 3)
	ld (scr_base), hl
	ld e, (ix + 4)
	ld d, (ix + 5)
	ld a, (ix + 6)
	call put_text
	ld de, 7
	add ix, de
	jr -
+:
	; scroller: map column j shows message character (j - col_off) mod 32
	ld hl, TILE_TEXT
	ld (scr_base), hl
	ld hl, (scr_scroll_vram)
	call vdp_addr
	ld b, 0
-:	ld a, (scr_col_off)
	neg
	add a, b
	and 31
	ld e, a
	ld d, 0
	ld hl, scr_scroll
	add hl, de
	ld a, (hl)
	call put_char
	inc b
	ld a, b
	cp 32
	jr nz, -
	ld a, (scr_col_off)
	neg
	add a, 32
	ld (scr_msg_pos), a
	ld a, (scr_line)
	ld l, a
	ld h, 0x80 | 10
	call vdp_reg
	ret

; e = colour index: writes the 65 glyphs as 4bpp tiles in that colour.
glyph_set:
	ld hl, screen_glyphs
	ld bc, screen_glyphs_end - screen_glyphs
--:	ld d, (hl)
	push bc
	ld b, 4
	ld c, e
-:	xor a
	rr c
	jr nc, +
	ld a, d
+:	out (VDP_DATA), a
	djnz -
	pop bc
	inc hl
	dec bc
	ld a, b
	or c
	jr nz, --
	ret

; b = row, c = column, de = string, a = length; colour base in scr_base.
put_text:
	push af
	ld l, b
	ld h, 0
	add hl, hl
	add hl, hl
	add hl, hl
	add hl, hl
	add hl, hl
	ld b, 0
	add hl, bc
	add hl, hl			; (row * 32 + column) * 2
	ld bc, NAME_TABLE | 0x4000
	add hl, bc
	call vdp_addr
	pop bc
-:	ld a, (de)
	call put_char
	inc de
	djnz -
	ret

; a = ASCII 0x20-0x60 (0x60 = play glyph): writes one name table entry.
put_char:
	sub 32
	cp 65
	jr c, +
	ld a, 31			; '?'
+:	push hl
	ld hl, (scr_base)
	add a, l
	ld l, a
	jr nc, +
	inc h
+:	ld a, l
	out (VDP_DATA), a
	ld a, h
	out (VDP_DATA), a
	pop hl
	ret

vdp_addr:
	ld a, l
	out (VDP_CONTROL_PORT), a
	ld a, h
	out (VDP_CONTROL_PORT), a
	ret

vdp_reg:
	ld c, VDP_CONTROL_PORT
	out (c), l
	out (c), h
	ret

out_b:
	ld c, VDP_DATA
	otir
	ret

; First thing after the frame interrupt: bars, time and scroller to VRAM.
screen_vblank:
	ld hl, (scr_bar_vram)
	ld de, scr_buf
	ld a, (scr_bar_rows)
	ld b, a
-:	push bc
	call vdp_addr
	push de
	ld de, 64
	add hl, de
	ex (sp), hl
	ld b, 32
	ld c, VDP_DATA
	otir
	pop de
	ex de, hl
	pop bc
	djnz -

	; time MM:SS
	ld hl, TILE_TIME
	ld (scr_base), hl
	ld hl, (scr_time_vram)
	call vdp_addr
	ld a, (scr_mins)
	call put_bcd
	ld a, ':'
	call put_char
	ld a, (scr_secs)
	call put_bcd

	; scroller: one pixel a frame; every 8 the column that just left on the
	; left (it wraps to the right edge) gets the next message character
	ld hl, scr_scroll_px
	inc (hl)
	ld a, (hl)
	neg
	ld (scr_hscroll), a
	ld a, (hl)
	and 7
	ret nz
	ld a, (hl)
	rrca
	rrca
	rrca
	dec a
	and 31
	add a, a
	ld e, a
	ld d, 0
	ld hl, (scr_scroll_vram)
	add hl, de
	call vdp_addr
	ld hl, TILE_TEXT
	ld (scr_base), hl
	ld hl, scr_msg_pos
	ld e, (hl)
	inc (hl)
	ld hl, scr_scroll
	add hl, de
	ld a, (hl)
	jp put_char

put_bcd:
	push af
	rrca
	rrca
	rrca
	rrca
	and 15
	add a, '0'
	call put_char
	pop af
	and 15
	add a, '0'
	jp put_char

; After the song tick: clock, bar levels and the bar tile buffer.
screen_update:
	ld a, (console_hz)
	ld b, a
	ld hl, scr_frames
	inc (hl)
	ld a, (hl)
	cp b
	jr c, ++
	ld (hl), 0
	ld a, (scr_secs)
	add a, 1
	daa
	cp 0x60
	jr c, +
	ld a, (scr_mins)
	add a, 1
	daa				; 99:59 wraps to 00:00, as the design
	ld (scr_mins), a
	xor a
+:	ld (scr_secs), a
++:
	xor a
	ld (scr_bar), a
	ld ix, song_channels
bar_loop:
	; driver volume 0-15, 0 when the note is off or the channel muted
	ld a, (ix + channel.flags)
	and CHAN_FLAG_NOTE_ON | CHAN_FLAG_MUTED
	cp CHAN_FLAG_NOTE_ON
	ld a, 0
	jr nz, +
	ld a, (song_state.master_volume)
	ld c, 0x0f
	call music_calculate_volume_0x0f
+:	and 15
	ld c, a
	ld b, 0
	ld hl, (scr_table)
	add hl, bc
	ld b, (hl)			; b = target height t
	ld a, (scr_bar)
	ld e, a
	ld d, 0
	ld hl, scr_lv
	add hl, de
	ex de, hl			; de = &lv
	ld a, (de)			; a = lv
	cp b
	jr c, +				; t > lv: instant attack
	ld hl, scr_fall
	sub (hl)
	jr c, +				; lv - fall < 0
	cp b
	jr nc, ++
+:	ld a, b				; max(t, lv - fall)
++:	ld (de), a
	ld b, a				; b = lv
	ld hl, 4
	add hl, de			; hl = &cap
	ld a, (hl)
	cp b
	jr z, +
	jr nc, ++
+:	ld (hl), b			; lv >= cap: cap = lv, hold
	ld de, 4
	add hl, de
	ld (hl), BAR_CAP_HOLD
	jr bar_tiles
++:	ld de, 4
	add hl, de
	ld a, (hl)
	or a
	jr z, +
	dec (hl)
	jr bar_tiles
+:	ld de, -4
	add hl, de
	ld a, (hl)
	dec a
	cp b
	jr nc, +
	ld a, b
+:	ld (hl), a

; Tile slots of bar scr_bar, bottom row up (see screen_font.inc).
bar_tiles:
	ld a, (scr_bar)
	ld e, a
	ld d, 0
	ld hl, scr_lv
	add hl, de
	ld b, (hl)			; b = fill pixels
	ld hl, scr_cap
	add hl, de
	ld c, (hl)			; c = cap pixel, 0 = none
	ld a, (scr_bar_rows)
	add a, a
	add a, a
	add a, a
	sub 2				; caps at the top sit on the top two rows
	cp c
	jr nc, +
	ld c, a
+:	; hl = buffer entry of the bottom row: scr_buf + (rows - 1) * 32 + bar * 8
	ld a, (scr_bar_rows)
	dec a
	ld l, a
	ld h, 0
	add hl, hl
	add hl, hl
	add hl, hl
	add hl, hl
	add hl, hl
	ld a, e
	add a, a
	add a, a
	add a, a
	ld e, a
	add hl, de
	ld de, scr_buf
	add hl, de
	ld a, (scr_bar_rows)
	ld d, a				; d = rows left
	ld e, 0				; e = tile base pixel 8 * row
tile_loop:
	; fr = clamp(fill - base, 0, 8)
	ld a, b
	sub e
	jr nc, +
	xor a
+:	cp 9
	jr c, +
	ld a, 8
+:	ld (scr_tile), a
	ld a, c
	or a
	jr z, tile_put			; no cap
	sub e				; cl = cap - base
	cp 0xff
	jr nz, +
	ld a, 24			; cap top row spills into this tile
	ld (scr_tile), a
	jr tile_put
+:	cp 8
	jr nc, tile_put			; cap not in this tile
	push bc
	ld c, a				; c = cl
	ld a, (scr_tile)		; f
	cp c
	jr z, +++
	jr c, +
	ld a, c				; f > cl: fill under the cap
	jr +++
+:	add a, a			; f < cl: no tile for a gap; snap f to 0 or cl
	cp c
	ld a, 0
	jr c, +++
	ld a, c
+++:	or a
	jr nz, +
	ld a, c
	add a, 9			; cap only
	jr ++
+:	add a, 16			; cap on a fill of f rows
++:	ld (scr_tile), a
	pop bc
tile_put:
	ld a, (scr_tile)
	ld (hl), a
	inc hl
	ld (hl), 0
	inc hl
	ld (hl), a
	inc hl
	ld (hl), 0
	inc hl
	ld (hl), a
	inc hl
	ld (hl), 0
	inc hl
	add a, BAR_EDGE
	ld (hl), a
	inc hl
	ld (hl), 0
	push de
	ld de, -39			; up one row: 32 + the 7 bytes just written
	add hl, de
	pop de
	ld a, e
	add a, 8
	ld e, a
	dec d
	jr nz, tile_loop

	ld de, _sizeof_channel
	add ix, de
	ld hl, scr_bar
	inc (hl)
	ld a, (hl)
	cp 4
	jp nz, bar_loop
	ret

.include "screen_font.inc"

; Layouts: bar VRAM, bar rows, fall, height table, time VRAM, scroller row VRAM,
; scroller column offset, line interrupt count, text table (same order as RAM).
scr_layout_sms:
	.dw 0x4000 + NAME_TABLE + 5 * 64 + 8 * 2
	.db 14, 3
	.dw scr_heights_sms
	.dw 0x4000 + NAME_TABLE + 20 * 64 + 3 * 2
	.dw 0x4000 + NAME_TABLE + 22 * 64
	.db 1, 173
	.dw scr_texts_sms
scr_layout_gg:
	.dw 0x4000 + NAME_TABLE + 7 * 64 + 8 * 2
	.db 10, 2
	.dw scr_heights_gg
	.dw 0x4000 + NAME_TABLE + 18 * 64 + 8 * 2
	.dw 0x4000 + NAME_TABLE + 20 * 64
	.db 6, 157
	.dw scr_texts_gg

; round(v * barRows * 8 / 15), v = 0-15
scr_heights_sms:
	.db 0, 7, 15, 22, 30, 37, 45, 52, 60, 67, 75, 82, 90, 97, 105, 112
scr_heights_gg:
	.db 0, 5, 11, 16, 21, 27, 32, 37, 43, 48, 53, 59, 64, 69, 75, 80

.macro SCR_TEXT ARGS row, col, base, str, len
	.db row, col
	.dw base, str
	.db len
.endm

scr_texts_sms:
	SCR_TEXT 1, 1, TILE_LOGO, str_logo, 8
	SCR_TEXT 1, 10, TILE_TEXT, scr_title, 21
	SCR_TEXT 2, 1, TILE_DIM, str_by, 3
	SCR_TEXT 2, 4, TILE_DIM, scr_author, 27
	SCR_TEXT 3, 1, TILE_BARC, str_chip, 7
	SCR_TEXT 3, 18, TILE_DIM, str_sms, 13
	SCR_TEXT 4, 1, TILE_RULE, str_blank, 30
	SCR_TEXT 19, 9, TILE_DIM, str_labels, 1
	SCR_TEXT 19, 13, TILE_DIM, str_labels + 1, 1
	SCR_TEXT 19, 17, TILE_DIM, str_labels + 2, 1
	SCR_TEXT 19, 21, TILE_DIM, str_labels + 3, 1
	SCR_TEXT 20, 1, TILE_TIME, str_time, 7
	SCR_TEXT 20, 23, TILE_TEXT, str_song, 8
	SCR_TEXT 21, 1, TILE_RULE, str_blank, 30
	.db 0xff
scr_texts_gg:
	SCR_TEXT 3, 6, TILE_LOGO, str_logo, 8
	SCR_TEXT 3, 15, TILE_TEXT, scr_title, 11
	SCR_TEXT 4, 6, TILE_DIM, str_by, 3
	SCR_TEXT 4, 9, TILE_DIM, scr_author, 17
	SCR_TEXT 5, 6, TILE_BARC, str_chip, 7
	SCR_TEXT 5, 17, TILE_DIM, str_gg, 9
	SCR_TEXT 6, 6, TILE_RULE, str_blank, 20
	SCR_TEXT 17, 9, TILE_DIM, str_labels, 1
	SCR_TEXT 17, 13, TILE_DIM, str_labels + 1, 1
	SCR_TEXT 17, 17, TILE_DIM, str_labels + 2, 1
	SCR_TEXT 17, 21, TILE_DIM, str_labels + 3, 1
	SCR_TEXT 18, 6, TILE_TIME, str_time, 7
	SCR_TEXT 18, 18, TILE_TEXT, str_song, 8
	SCR_TEXT 19, 6, TILE_RULE, str_blank, 20
	.db 0xff

str_logo:	.db "DEVILBOX"
str_by:		.db "BY "
str_chip:	.db "SN76489"
str_sms:	.db "MASTER SYSTEM"
str_gg:		.db "GAME GEAR"
str_labels:	.db "1234"
str_time:	.db "` 00:00"
str_song:	.db "SONG 1/1"
str_blank:	.dsb 30, $20

; Patched by smsRom.ts: uppercase ASCII 0x20-0x5F, space padded.
scr_title:	.dsb 21, $20
scr_author:	.dsb 27, $20
scr_scroll:	.dsb 256, $20
.ENDS
