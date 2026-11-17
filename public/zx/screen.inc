; screen.inc - DEViLBOX player screen for the ZX Spectrum, shared by player.asm, beeper.asm and quadtone.asm.
; Same layout as the NES player (public/nes/player.s Phase 8): logo + chip name rows 1-2, title row 4, author row 5,
; status row 7, bars rows 10-17 (NBARS bars at columns 2, 4, ..), bar labels row 18, scroller row 22. Upper case only:
; tile = ASCII - #20, tiles 64-71 logo, 72 solid block. The tiles come from screen_font.inc (tools/hwplayer/assets.ts).
; The includer defines `chiptxt` (20 characters), NBARS, `statustxt` (26), `bartxt` (2 * NBARS - 1) and `scrtxt` (SCRLEN >= 33).
; screen_static draws the whole static screen once; it needs a valid SP and clobbers every register.
BARW	equ 2 * NBARS - 1

screen_static
	ld hl,#4000
	ld de,#4001
	ld bc,#17ff
	ld (hl),0
	ldir
	ld hl,#5800
	ld de,#5801
	ld bc,#02ff
	ld (hl),#47		; bright white on black
	ldir
	ld hl,attrtab
sa1	ld d,(hl)
	ld a,d
	cp #ff
	jr z,sa9
	inc hl
	ld e,(hl)
	inc hl
	ld b,(hl)
	inc hl
	ld c,(hl)
	inc hl
	push hl
	call attrptr
sa2	ld (hl),c
	inc hl
	djnz sa2
	pop hl
	jr sa1
sa9	ld a,(scrtxt + 32)
	sub #20
	ld (sl_ch),a
	ld d,1			; logo, 4 x 2 tiles
	ld e,1
	ld a,64
	ld b,4
	call putrun
	ld d,2
	ld e,1
	ld a,68
	ld b,4
	call putrun
	ld hl,txttab
st1	ld d,(hl)
	ld a,d
	cp #ff
	ret z
	inc hl
	ld e,(hl)
	inc hl
	ld b,(hl)
	inc hl
	ld a,(hl)
	inc hl
	ld c,(hl)
	inc hl
	push hl
	ld l,a
	ld h,c
	call puttext
	pop hl
	jr st1

attrptr				; D row, E col -> HL attribute address; clobbers A
	ld a,d
	rrca
	rrca
	rrca
	ld l,a
	and 3
	or #58
	ld h,a
	ld a,l
	and #e0
	or e
	ld l,a
	ret

cellptr				; D row, E col -> HL address of the cell's top pixel line; clobbers A
	ld a,d
	and #18
	or #40
	ld h,a
	ld a,d
	and 7
	rrca
	rrca
	rrca
	or e
	ld l,a
	ret

drawtile			; A tile, HL cell address; keeps DE and HL; clobbers A, BC
	push hl
	push de
	ld e,a
	ld d,0
	ex de,hl
	add hl,hl
	add hl,hl
	add hl,hl
	ld bc,font
	add hl,bc
	ex de,hl
	ld b,8
dt1	ld a,(de)
	ld (hl),a
	inc de
	inc h
	djnz dt1
	pop de
	pop hl
	ret

puttile				; A tile, D row, E col; keeps DE
	push af
	call cellptr
	pop af
	jp drawtile

putrun				; B tiles A, A+1.. from D row, E col
pr1	push af
	push bc
	call puttile
	pop bc
	pop af
	inc a
	inc e
	djnz pr1
	ret

puttext				; HL string, B length, D row, E col; clobbers A, BC, DE, HL
pt1	push hl
	push bc
	ld a,(hl)
	sub #20
	call puttile
	pop bc
	pop hl
	inc hl
	inc e
	djnz pt1
	ret

; row, col, length, attribute
attrtab	db 1,1,4,#43, 2,1,4,#43, 1,6,20,#46, 2,6,20,#45, 4,0,32,#47, 5,0,32,#44
	db 7,0,26,#47, 18,2,BARW,#46, 22,0,32,#45
rw = 10
	dup 8
	db rw,2,BARW,0
rw = rw + 1
	edup
	db #ff

; row, col, length, string
txttab	db 1,6,20
	dw chiptxt
	db 2,6,20
	dw subtxt
	db 4,0,32
	dw title_str
	db 5,0,32
	dw author_str
	db 7,0,26
	dw statustxt
	db 18,2,BARW
	dw bartxt
	db 22,0,32
	dw scrtxt
	db #ff

subtxt	db "DEVILBOX NATIVE PLAYER "

bar_static			; solid blocks for the NBARS bars (the attributes make them visible), rows 10-17
	ld d,10
bs1	ld e,2
	ld b,NBARS
bs2	push bc
	ld a,72
	call puttile
	pop bc
	inc e
	inc e
	djnz bs2
	inc d
	ld a,d
	cp 18
	jr nz,bs1
	ret

bar	ld c,a			; HL = attribute of the bottom cell, A = level 0-8
	ld de,barcol
	ld b,8
bar1	ld a,c
	or a
	jr z,bar2
	dec c
	ld a,(de)
	jr bar3
bar2	xor a
bar3	ld (hl),a
	inc de
	ld a,l
	sub 32
	ld l,a
	jr nc,bar4
	dec h
bar4	djnz bar1
	ret

barcol	db #44,#44,#44,#46,#46,#46,#42,#42	; green, yellow, red from the bottom

	ifdef LIVE_SCREEN
; ---- live screen for the beeper players (interrupts off): `slice` runs once per record, between two tone runs.
; One scroller pixel row, then one task in turn: bar 1 .. NBARS, clock digit 1-4. The includer defines `voxon`
; (per voice the address of a byte that is 0 while the voice is silent), ORs each record's voice change bits into
; `mbits` and handles the one second record (clock_inc). Needs SP; clobbers A, BC, DE, HL (not IX, IY, alternates).
slice
	call scroll_row
	ld a,(task)
	inc a
	cp NBARS + 4
	jr c,sl1
	xor a
sl1	ld (task),a
	sub NBARS
	jr c,slbar
	ld e,a			; clock digit 0-3 at columns 12, 13, 15, 16 of row 7
	ld d,0
	ld hl,clockd
	add hl,de
	cp 2
	ccf
	adc a,12
	ld e,a
	ld a,(hl)
	ld d,7
	jp puttile
slbar	add a,NBARS		; bar v: a sounding voice that changed since the last visit jumps to 8, else falls by 2
	ld e,a
	ld d,0
	ld hl,masktab
	add hl,de
	ld b,(hl)
	ld hl,barlev
	add hl,de
	ld a,(hl)
	sub 2
	jr nc,sb1
	xor a
sb1	ld c,a
	ld a,(mbits)
	and b
	jr z,sb2
	ld a,b
	cpl
	ld b,a
	ld a,(mbits)
	and b
	ld (mbits),a
	push hl
	ld hl,voxon
	add hl,de
	add hl,de
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a
	ld a,(hl)
	pop hl
	or a
	jr z,sb2
	ld c,8
sb2	ld (hl),c
	ld a,e			; bottom cell: row 17, column 2 + 2v
	add a,a
	add a,#22
	ld l,a
	ld h,#5a
	ld a,c
	jp bar

task	db NBARS - 1
mbits	db 0
barlev	ds 8
masktab	db 1,2,4,8,16,32,64,128
	endif

; ---- scroller: one pixel row of the row 22 text moves left by one character per call; 8 calls = one character.
; About 700 T, the same every call (the character step adds a few T every 8th call). Clobbers A, BC, DE, HL.
scroll_row
	ld a,(sl_row)
	add a,#50		; row 22 = third 2, character row 6: #50C0 + pixel row * 256
	ld d,a
	ld h,a
	ld e,#c0
	ld l,#c1
	dup 31
	ldi
	edup
	ld a,(sl_ch)		; the incoming character's pixel row into column 31
	ld l,a
	ld h,0
	add hl,hl
	add hl,hl
	add hl,hl
	ld bc,font
	add hl,bc
	ld a,(sl_row)
	ld c,a
	ld b,0
	add hl,bc
	ld a,(hl)
	ld (de),a
	ld a,c
	inc a
	and 7
	ld (sl_row),a
	ret nz
	ld hl,(sl_pos)		; next character of the message
	inc hl
	ld de,scrtxt + SCRLEN
	or a
	sbc hl,de
	add hl,de
	jr c,sr1
	ld hl,scrtxt
sr1	ld (sl_pos),hl
	ld a,(hl)
	sub #20
	ld (sl_ch),a
	ret

sl_row	db 0
sl_pos	dw scrtxt + 32		; the character coming in next (the static screen shows the first 32)
sl_ch	db 0			; its tile; screen_static sets it

; ---- clock: four digit tiles M M : S S on row 7, columns 12, 13, 15, 16 -----------------------
clock_inc			; one second on; clobbers A, HL
	ld hl,clockd + 3
	ld a,(hl)
	inc a
	cp 26			; tile of "9" + 1
	jr c,ci9
	ld (hl),16
	dec hl
	ld a,(hl)
	inc a
	cp 22			; "6"
	jr c,ci9
	ld (hl),16
	dec hl
	ld a,(hl)
	inc a
	cp 26
	jr c,ci9
	ld (hl),16
	dec hl
	ld a,(hl)
	inc a
	cp 26
	jr c,ci9
	ld a,16
ci9	ld (hl),a
	ret
clock_reset			; 00:00; clobbers A, HL
	ld hl,clockd
	ld a,16
	ld (hl),a
	inc hl
	ld (hl),a
	inc hl
	ld (hl),a
	inc hl
	ld (hl),a
	ret
clockd	db 16,16,16,16
title_str	db "                                "	; the exporter writes the song title here (32 characters, space padded)
author_str	db "                                "	; and the author here

font
	include "screen_font.inc"
