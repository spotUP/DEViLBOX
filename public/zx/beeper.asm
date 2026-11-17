; beeper.asm - 6 voice pulse beeper player with 1-bit sample drums for the ZX Spectrum 128K.
; Written for DEViLBOX (own design; replaces the earlier quattropic-derived 4 voice 48K player).
; Build: tools/build-zx-beeper.sh (sjasmplus) -> beeper.bin + beeper.json.
;
; Model of Furnace's zxbeeper chip (zxbeeper.cpp): each voice adds its frequency word to a 16-bit phase;
; on a phase wrap the shared pulse timer gets the voice's duty added, and the pin is high while the timer
; is above zero. The pin is written 3 times per loop iteration, each write takes 1 from the timer.
; Phases never reset, so a voice keeps its phase across ticks and note changes.
; A sample drum (Furnace 17xx) plays its 1-bit data alone, the tone voices frozen, like zxbeeper.cpp.
;
; Memory: code + tables + drum bits at #8000 (bank 2), stream at #C000 in banks 0,1,3,4,6,7 (port #7FFD).
; Interrupts are off; SP is a scratch register in the tone loop (no stack is used).
;
; Stream record: M < #80: bits 0-5 = voice 1-6 change (each: freq lo, freq hi, duty), bit 6 = drum
;   (ptr lo, ptr hi, byte count 1-255), then the tone length in loop iterations (lo, hi; 1-65535).
;   M = #80: continue at the start of the next bank. M = #81: loop to the start of the first bank.
; Records never cross a bank end.
;
; Loop registers: HL ph1, DE ph2, IX ph3, IY ph4, HL' ph5, DE' ph6, BC' iteration counter,
; B = page of pintab, A = pulse timer.

ITER_T		equ 363		; T-states per tone loop iteration (counted below, wrap path +2 per voice)
DRUM_BYTE_T	equ 504		; T-states per drum byte (8 bits of 63 T)

	org #8000
entry
	di
	ld sp,#8000		; the screen routine calls; the tone loop uses SP as a scratch register afterwards
	call screen_static
	call bar_static
	xor a
	jp setbank

; ---- tone loop -------------------------------------------------------------------------
OUTPIN	macro
	ld c,a			; 4
	ld a,(bc)		; 7  pin value: timer > 0
	out (#fe),a		; 11
	inc b			; 4
	ld a,(bc)		; 7  timer - 1, floor 0
	dec b			; 4  = 37
	endm

loop
f1	equ $+1
	ld sp,0			; 10
	add hl,sp		; 11
	jr nc,$+4		; 12 / 7
d1	equ $+1
	add a,0			;    7     voice 1: 33
	ex de,hl		; 4
f2	equ $+1
	ld sp,0			; 10
	add hl,sp		; 11
	ex de,hl		; 4
	jr nc,$+4		; 12
d2	equ $+1
	add a,0			;          voice 2: 41
	OUTPIN			; 37
f3	equ $+1
	ld sp,0			; 10
	add ix,sp		; 15
	jr nc,$+4		; 12
d3	equ $+1
	add a,0			;          voice 3: 37
f4	equ $+1
	ld sp,0
	add iy,sp
	jr nc,$+4
d4	equ $+1
	add a,0			;          voice 4: 37
	OUTPIN			; 37
	exx			; 4
f5	equ $+1
	ld sp,0
	add hl,sp
	jr nc,$+4
d5	equ $+1
	add a,0			;          voice 5: 33
	ex de,hl
f6	equ $+1
	ld sp,0
	add hl,sp
	ex de,hl
	jr nc,$+4
d6	equ $+1
	add a,0			;          voice 6: 41
	exx			; 4
	OUTPIN			; 37
	exx			; 4
	dec c			; 4
	exx			; 4
	jp nz,loop		; 10      total 363
	exx
	dec b
	exx
	jp nz,loop

; ---- tick end: save the loop state, read the next record --------------------------------
	ld (sv_a),a
	ld (sv_hl),hl
	ld (sv_de),de
	ld (sv_ix),ix
	ld (sv_iy),iy
	exx
	ld (sv_hl2),hl
	ld (sv_de2),de
	exx
sptr	equ $+1
	ld hl,#c000
record
	ld a,(hl)
	inc hl
	or a
	jp m,special
	ld c,a
	ld a,(mbits)		; voices changed by this record light their bar
	or c
	ld (mbits),a
VOICE	macro fk, dk
	rr c
	jr nc,.skip
	ld a,(hl)
	inc hl
	ld (fk),a
	ld a,(hl)
	inc hl
	ld (fk+1),a
	ld a,(hl)
	inc hl
	ld (dk),a
.skip
	endm
	VOICE f1, d1
	VOICE f2, d2
	VOICE f3, d3
	VOICE f4, d4
	VOICE f5, d5
	VOICE f6, d6
	ld b,0
	rr c
	jr nc,.nodrum
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ld (dptr),de
	ld b,(hl)
	inc hl
.nodrum
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ld (sptr),hl
	ld (dur),de
	ld a,b
	or a
	jr z,restore

; ---- drum: B bytes of 1-bit data, MSB first, 63 T per bit (Furnace: 16 samples at 894886 Hz) -----
dptr	equ $+1
	ld hl,0
	ld c,(hl)
	inc hl
dbyte
	dup 7
	rl c			; 8
	sbc a,a			; 4
	and #10			; 7
	out (#fe),a		; 11
	jr $+2			; 12
	cp (hl)			; 7
	cp (hl)			; 7
	cp (hl)			; 7  = 63
	edup
	rl c
	sbc a,a
	and #10
	out (#fe),a		; 30
	ld c,(hl)		; 7
	inc hl			; 6
	cp (hl)			; 7
	djnz dbyte		; 13 = 63

; ---- restore the loop state and run the tone loop for the record's length ----------------
restore
	ld sp,#8000		; one screen slice between two tone runs: the pin is frozen here, the tone loop timing is untouched
	call slice
	exx
dur	equ $+1
	ld bc,0
	ld a,c
	or a
	jr z,.even
	inc b
.even
sv_hl2	equ $+1
	ld hl,0
sv_de2	equ $+1
	ld de,0
	exx
sv_hl	equ $+1
	ld hl,0
sv_de	equ $+1
	ld de,0
sv_ix	equ $+2
	ld ix,0
sv_iy	equ $+2
	ld iy,0
	ld b,high pintab
sv_a	equ $+1
	ld a,0
	jp loop

; ---- stream markers: #80 = next bank, #81 = first bank (song restarts: clock to 00:00), #82 = one more second of song
special
	ld sp,#8000		; the tone loop leaves SP as a scratch value
	cp #82
	jr z,second
	cp #81
	jr nz,nextbank
	call clock_reset
	xor a
	jr setbank
nextbank
bankix	equ $+1
	ld a,0
	inc a
setbank
	ld (bankix),a
	ld e,a
	ld d,0
	ld hl,banktab
	add hl,de
	ld a,(hl)
	ld bc,#7ffd
	out (c),a
	ld hl,#c000
	jp record
second	push hl
	call clock_inc
	pop hl
	jp record

banktab	db #10, #11, #13, #14, #16, #17

; ---- pin tables (one page each): pintab[t] = t > 0 ? #10 : 0, dectab[t] = max(t - 1, 0) ----
	align 256
pintab	db 0
	dup 255
	db #10
	edup
dectab	db 0
v = 0
	dup 255
	db v
v = v + 1
	edup

chiptxt	db "ZX SPECTRUM BEEPER  "
NBARS	equ 6
voxon	dw d1,d2,d3,d4,d5,d6	; duty operand per voice, 0 = silent
statustxt	db "SONG 01/01  00:00  PLAYING"
bartxt	db "1 2 3 4 5 6"
scrtxt	db "DEVILBOX NATIVE PLAYER FOR THE ZX SPECTRUM 128K - BEEPER MUSIC ...                                "
SCRLEN	equ $ - scrtxt

	define LIVE_SCREEN		; screen.inc adds the record gap slice (bars, clock, scroller)
	include "screen.inc"

drumdata			; the exporter appends the drum bits here
