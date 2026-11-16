; beeper.asm - 4 channel pulse-width beeper player for the ZX Spectrum 48K.
;
; Derived from "quattropic" by utz, 08'2015, from
; https://github.com/utz82/ZX-Spectrum-1-Bit-Routines
; Copyright (c) 2014-2019, utz/irrlicht project. All rights reserved.
; Redistribution and use in source and binary forms, with or without modification, are
; permitted provided that the following conditions are met:
;  * Redistributions of source code must retain the above copyright notice, this list of
;    conditions and the following disclaimer.
;  * Neither the name of utz/irrlicht project nor the names of its contributors may be used
;    to endorse or promote products derived from this software without specific prior
;    written permission.
; THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
; EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED (full disclaimer: see the LICENSE file at the URL above).
;
; Modifications for DEViLBOX:
;  * Only the regular tone core is kept (noise, slide and noise+slide cores removed).
;  * The row length is read from the pattern (eighth word of each row) instead of one
;    global tempo byte, so Furnace speeds and groove changes survive the export.
;  * The song data (sequence + rows) is appended after this code by the exporter at
;    musicdata (see beeper.json); the sequence loops to its start.
;
; Row (8 words): AF = 0xFF00 (note never cut) | duty1,duty2 | duty3,duty4 |
;                freq1 | freq2 | freq3 | freq4 | timer (row length in 16.384 ms units, 1-254, in the high byte)
; Frequency word f gives f * 15625 / 65536 Hz. End of pattern: AF with F = 0x40.
; Sequence: dw pattern address ... , 0
; Registers: HL add counter ch1, DE freq ch1, IX/BC ch2, IY/DE' ch3, HL'/SP ch4, BC' timer.
; Build: sjasmplus --raw=beeper.bin beeper.asm

origin	equ 32768
	org origin

	di
init
	ei			; detect kempston
	halt
	in a,(#1f)
	inc a
	jr nz,_skip
	ld (maskKempston),a
_skip
	di
	exx
	push hl			; preserve HL' for return to BASIC
	ld (oldSP),sp
	ld hl,musicdata
	ld (seqpntr),hl

rdseq
seqpntr equ $+1
	ld sp,0
	xor a
	pop de			; pattern pointer to DE
	or d
	ld (seqpntr),sp
	jr nz,rdptn0
	ld sp,musicdata		; loop to the start of the sequence
	jr rdseq+3

rdptn0
	ld (patpntr),de
rdptn
	in a,(#1f)		; read joystick
maskKempston equ $+1
	and #1f
	ld c,a
	in a,(#fe)		; read keyboard
	cpl
	or c
	and #1f
	jp nz,exit

	exx

patpntr equ $+1			; fetch pointer to pattern data
	ld sp,0

	pop af
	jr z,rdseq

	ld (ch1Length),a

	ld a,#10
	ld (stopch),a

	pop hl			; duty1,2
	ld a,h
	ld (duty1),a
	ld a,l
	ld (duty2),a

	pop hl			; duty3,4
	ld a,h
	ld (duty3),a
	ld a,l
	ld (duty4),a

	pop de			; freq1
	pop bc			; freq2

	ld hl,0
	ld ix,0
	ld iy,0

	exx

	pop de			; freq3
	pop hl			; freq4
	pop bc			; timer (row length in the high byte, low byte 0)

	ld (patpntr),sp		; preserve data pointer
	ld sp,hl
	ld hl,0

playRegular
	exx			;4
	add hl,de		;11
	ld a,h			;4
duty1 equ $+1
	cp #80			;7
	sbc a,a			;4
	and #10			;7
	out (#fe),a		;11

	add ix,bc		;15
	ld a,ixh		;8
duty2 equ $+1
	cp #80			;7
	sbc a,a			;4
	and #10			;7
	out (#fe),a		;11

	nop			;4
	nop			;4

	exx			;4

	add hl,sp		;11
	ld a,h			;4
duty4 equ $+1
	cp #80			;7
	sbc a,a			;4
stopch equ $+1
	and #10			;7
	out (#fe),a		;11

	add iy,de		;15
	ld a,iyh		;8
duty3 equ $+1
	cp #80			;7
	sbc a,a			;4
	and #10			;7
	out (#fe),a		;11

	dec c			;4
	jr nz,playRegular	;12
				;224
	ld a,b
ch1Length equ $+1
	sub #ff			; = timer - actual length
	jr z,_cut
	djnz playRegular
	jp rdptn

_cut
	ld (stopch),a
	djnz playRegular
	jp rdptn

exit
oldSP equ $+1
	ld sp,0
	pop hl
	exx
	ei
	ret

musicdata
