; quadtone.asm - ZX Spectrum 128K player for Furnace "ZX Spectrum Beeper (QuadTone engine)" songs.
; Written for DEViLBOX. No original QuadTone Z80 source was found to vendor, so this loop is written
; against Furnace's cycle model (third-party/furnace-master/src/engine/platform/zxbeeperquadtone.cpp acquire()).
; Build: tools/build-zx-quadtone.sh (sjasmplus) -> quadtone.bin + quadtone.json.
;
; Furnace model: the pin is updated once per 40 chip T-states; 8 slots make a 320 T round, two slots per voice.
; On a voice's first slot its 16-bit phase gets its frequency added; c = (phase high byte < duty reg).
; out = volume reg + c; slot 0 pin = bit 4 of out, slot 1 pin = bit 3. Volume regs used: 31, 7, 0.
;   vol 31: both slots high while c = 0, both low while c = 1
;   vol 7:  slot 0 low, slot 1 high while c = 1
;   vol 0:  silent
; This loop: 320 T per round, pin written every 40 T (+-1 T, 39/41 at a few slots; 40 T exactly is not
; reachable with this register budget). Per voice the encoder picks:
;   compare opcode: vol 31 "add a,256-duty" (carry = phase >= duty), vol 7 "sub duty" (carry = phase < duty),
;                   vol 0 "sub 0" (never carries); then sbc a,a turns carry into #FF / #00
;   slot 0 opcode:  out (c),a (#79, vol 31) or out (c),0 (#71, vol 7 / 0; NMOS Z80 outputs 0)
;   slot 1:         always out (c),b with B = the compare result
; Port #FE gets #FF or #00, so EAR and MIC move together and the border flickers white/black.
; Known differences from Furnace: vol 31 with duty reg 0 stays low (Furnace: high; both are silent DC);
; voice 1's new duty/volume takes effect one round (320 T) late; I/O contention on #FE adds jitter.
; Sample drums (channel 5) play their 1-bit data alone, tones frozen, like acquire(); the encoder pre-renders
; each (sample, rate) hit at one bit per 40 T and stores it after the code.
;
; Memory: code + drum bits at #8000 (bank 2), record stream at #C000 in banks 0,1,3,4,6,7 (port #7FFD).
; Interrupts off; SP is a scratch register (no stack).
;
; Record: M < #80: bits 0-3 = voice 1-4 changed, each 5 bytes: freq lo, freq hi, compare opcode,
;   compare operand, slot 0 opcode byte; bit 4 = drum piece: ptr lo, ptr hi, byte count 1-255;
;   then L = tone rounds 0-255 (0 = no tone run).
;   M = #80: continue at the start of the next bank. M = #81: loop to the start of the first bank.
; Records never cross a bank end.
; Record cost in T-states (src/lib/export/zx/zxQuadToneData.ts mirrors these hand counts):
;   31 + 80 + 125 * changed voices + (drum ? 106 + 320 * N : 46) + (L ? 51 + 320 * L : 25)
;   bank marker #80: 153, #81: 147.
;
; Tone loop registers: HL ph1, DE ph2, IX ph3, IY ph4, C = #FE, B = slot 1 value, A = compare result,
; C' = round counter. Record registers: alternate set (HL' = stream pointer), A' = voice 1 value across records.

ITER_T		equ 320		; T-states per tone round
DRUM_BYTE_T	equ 320		; T-states per drum byte (8 bits of 40 T)

	org #8000
entry
	di
	ld sp,#8000		; the screen routine calls; the tone loop uses SP as a scratch register afterwards
	call screen_static
	call bar_static
	ld c,#fe
	xor a
	ld h,a
	ld l,a
	ld d,a
	ld e,a
	ld ix,0
	ld iy,0
	ex af,af'
	exx
	xor a
	jp setbank

; ---- tone loop: pin writes at T 0,41,79,120,161,200,241,279 of 320 ------------------------------
loop
p1	equ $+1
	out (c),0		;   0 voice 1 slot 0 (A computed at the end of the previous round)
	ex de,hl		;  12
	ld b,a			;  16
f2	equ $+1
	ld sp,0			;  20
	add hl,sp		;  30 voice 2 phase
	out (c),b		;  41 voice 1 slot 1
	ld a,h			;  53
	ex de,hl		;  57
o2	sub 0			;  61
	sbc a,a			;  68
	cp 0			;  72 pad
p2	equ $+1
	out (c),0		;  79 voice 2 slot 0
	ld b,a			;  91
f3	equ $+1
	ld sp,0			;  95
	add ix,sp		; 105 voice 3 phase
	out (c),b		; 120 voice 2 slot 1
	ld a,ixh		; 132
o3	sub 0			; 140
	sbc a,a			; 147
f4	equ $+1
	ld sp,0			; 151
p3	equ $+1
	out (c),0		; 161 voice 3 slot 0
	add iy,sp		; 173 voice 4 phase
	ld b,a			; 188
	ld a,iyh		; 192
	out (c),b		; 200 voice 3 slot 1
o4	sub 0			; 212
	sbc a,a			; 219
	ld b,a			; 223
f1	equ $+1
	ld sp,0			; 227
	nop			; 237
p4	equ $+1
	out (c),0		; 241 voice 4 slot 0
	add hl,sp		; 253 voice 1 phase
	ld a,h			; 264
o1	sub 0			; 268
	sbc a,a			; 275
	out (c),b		; 279 voice 4 slot 1
	cp 0			; 291 pad
	exx			; 298
	dec c			; 302
	exx			; 306
	jp nz,loop		; 310 -> 320

; ---- round count done: keep the loop registers, read the next record in the alternate set ----------
	ex af,af'		; 4
	exx			; 4
rec
	ld a,(hl)		; 7
	inc hl			; 6
	or a			; 4
	jp m,special		; 10
	ld b,a			; 4 = 31
	ld c,a			; 4 voices changed by this record light their bar
	ld a,(mbits)		; 13
	or c			; 4
	ld (mbits),a		; 13 = 34
VOICE	macro fk, ok, pk
	rr b			; 8
	jr nc,.skip		; 12 / 7
	ld a,(hl)
	inc hl
	ld (fk),a
	ld a,(hl)
	inc hl
	ld (fk+1),a
	ld a,(hl)
	inc hl
	ld (ok),a
	ld a,(hl)
	inc hl
	ld (ok+1),a
	ld a,(hl)
	inc hl
	ld (pk),a		; changed 145, unchanged 20
.skip
	endm
	VOICE f1, o1, p1
	VOICE f2, o2, p2
	VOICE f3, o3, p3
	VOICE f4, o4, p4
	rr b			; 8
	jr nc,nodrum		; 12 / 7
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ld b,(hl)
	inc hl
	ld a,(hl)
	inc hl
	ld (lval),a
	ex de,hl
	ld c,(hl)
	inc hl			; 97 from rr b

; ---- drum: B bytes, MSB first, one bit per 40 T --------------------------------------------------
dbyte
	dup 6
	rl c			; 8
	sbc a,a			; 4
	out (#fe),a		; 11
	cp (hl)			; 7
	jp $+3			; 10 = 40
	edup
	rl c
	sbc a,a
	out (#fe),a
	nop			; 27
	rl c
	sbc a,a
	ld c,(hl)
	inc hl
	out (#fe),a
	nop
	djnz dbyte		; 53 (48 on the last byte)
	ex de,hl		; 4
	jp tone			; 10
nodrum
	ld a,(hl)
	inc hl
	ld (lval),a		; 26
tone
lval	equ $+1
	ld c,0			; 7
	ld a,c			; 4
	or a			; 4
	jp z,rec		; 10 (jr cannot reach rec)
	ld (qsp),hl		; one screen slice between two tone runs: the pin is frozen here, the tone loop timing is untouched
	ld sp,#8000
	call slice
qsp	equ $+1
	ld hl,0
	ld a,(lval)
	ld c,a
	ex af,af'		; 4
	exx			; 4
	jp loop			; 10

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
	jp rec
second	push hl
	call clock_inc
	pop hl
	jp rec

banktab	db #10, #11, #13, #14, #16, #17

chiptxt	db "ZX BEEPER QUADTONE  "
NBARS	equ 4
voxon	dw o1+1,o2+1,o3+1,o4+1	; duty operand per voice, 0 = silent
statustxt	db "SONG 01/01  00:00  PLAYING"
bartxt	db "1 2 3 4"
scrtxt	db "DEVILBOX NATIVE PLAYER FOR THE ZX SPECTRUM 128K - BEEPER MUSIC ...                                "
SCRLEN	equ $ - scrtxt

	define LIVE_SCREEN		; screen.inc adds the record gap slice (bars, clock, scroller)
	include "screen.inc"

drumdata			; the exporter appends the drum bits here
