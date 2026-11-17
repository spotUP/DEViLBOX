; screen.inc - DEViLBOX player screen for the ZX Spectrum, shared by player.asm, beeper.asm and quadtone.asm.
; Same layout as the NES player (public/nes/player.s Phase 8): logo + chip name rows 1-2, title row 4, author row 5,
; status row 7 (AY only), bars rows 10-17 (AY only), scroller row 22 (AY only). Upper case only: tile = ASCII - #20,
; tiles 64-71 logo, 72 solid block. The tiles come from screen_font.inc (tools/hwplayer/assets.ts, font8x8.json).
; The includer defines `chiptxt` (20 characters) and, for the AY player, DEFINE AYSCREEN plus its own status/scroller data.
; screen_static draws the whole static screen once; it needs a valid SP and clobbers every register.

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
sa9	ld d,1			; logo, 4 x 2 tiles
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
	IFDEF AYSCREEN
	db 7,0,26,#47, 18,2,7,#46, 22,0,32,#45
rw = 10
	dup 8
	db rw,2,7,0
rw = rw + 1
	edup
	ENDIF
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
	IFDEF AYSCREEN
	db 7,0,26
	dw statustxt
	db 18,2,7
	dw bartxt
	db 22,0,32
	dw scrtxt
	ENDIF
	db #ff

subtxt	db "DEVILBOX NATIVE PLAYER "
title_str	db "                                "	; the exporter writes the song title here (32 characters, space padded)
author_str	db "                                "	; and the author here

font
	include "screen_font.inc"
