; DEViLBOX ZX Spectrum 128 register-stream player. Build: tools/build-zx-player.sh (sjasmplus) -> player.bin + player.json.
; Loaded at 0x8000, entered with USR 32768.
; Stream (banks paged at 0xC000 through port 0x7FFD) is a list of frames, one per 50 Hz tick:
;   byte m0   bit n set = AY register n (0..7) follows
;   byte m1   bit n set = AY register 8+n (8..13) follows; m1 >= 0xC0 is a control byte:
;             0xFF = continue in the next bank of banktab, 0xFE = loop to the start of the current song
;   then one value byte per set bit, register order.
; Control frames take no tick: the next frame is read at once.
; Screen (screen.inc, same layout as the NES player): after the AY writes of a tick the player updates the bars from the
; register shadow, the clock, and every 4th tick the scroller. SPACE pauses (AY volumes off, stream and clock stopped).
; The AY writes come first after the interrupt, so the screen work never moves them.
; Songs: songtab holds nsongs start points (bank index, address); each song starts from all registers 0 and ends with
; 0xFE. P and O step to the next and previous song. The exporter patches nsongs, songtab and the SONG nn/mm count.
NBARS		equ 4
MAXSONGS	equ 16
VARS		equ #BF00		; RAM outside the image
SHADOW		equ VARS		; 14 AY register values as last written
idx		equ VARS + 16		; bank table index
frames		equ VARS + 17		; ticks within the second, 0-49
secs		equ VARS + 18		; BCD
mins		equ VARS + 19		; BCD
paused		equ VARS + 20
keyprev		equ VARS + 21
scrpos		equ VARS + 22
scrtick		equ VARS + 23
lvl		equ VARS + 24		; bar levels 0-8: channel A, B, C, noise
sptr		equ VARS + 28		; stream pointer (2 bytes)
cursong		equ VARS + 30		; song index, 0-based
keyp2		equ VARS + 31		; O and P key bits as last read
BARBASE		equ #5A20		; attribute address of row 17, column 0 (bottom of the bars)

	org #8000
start	di
	ld sp,#7F00
	call screen_static
	call bar_static
	ld hl,VARS + 16		; clear idx .. keyp2
	ld de,VARS + 17
	ld bc,15
	ld (hl),0
	ldir
	ld a,1
	ld (keyprev),a
	ld a,3
	ld (keyp2),a
	xor a
	call songsel
	ei
frame	halt
	ld a,(paused)
	or a
	call z,stream_frame
	call keys
	call songkeys
	call tick
	call update_bars
	call scroll
	jr frame

stream_frame
	ld hl,(sptr)
read	ld d,(hl)		; m0
	inc hl
	ld a,(hl)		; m1
	inc hl
	cp #c0
	jr nc,ctrl
	push af
	ld e,0
	call dobyte
	pop af
	ld d,a
	ld e,8
	call dobyte
	ld (sptr),hl
	ret
ctrl	cp #fe
	ld a,(idx)
	jr nz,nxt
	ld a,(cursong)		; the song loops: back to its start, registers 0, clock 00:00
	call songsel
	ld hl,(sptr)
	jr read
nxt	inc a
	ld (idx),a
	call setbank
	jr read

songsel	ld (cursong),a		; start song A: page its bank, all registers 0, clock 00:00, draw SONG nn
	ld c,a
	add a,a
	add a,c
	ld e,a
	ld d,0
	ld hl,songtab
	add hl,de
	ld a,(hl)
	ld (idx),a
	inc hl
	ld e,(hl)
	inc hl
	ld d,(hl)
	push de
	call setbank
	ld hl,SHADOW
	ld e,0
ss1	xor a
	ld (hl),a
	inc hl
	call aywr
	inc e
	ld a,e
	cp 14
	jr nz,ss1
	xor a
	ld (frames),a
	ld (secs),a
	ld (mins),a
	pop hl
	ld (sptr),hl
	ld a,(cursong)		; song number to BCD
	inc a
	ld c,a
	xor a
ss2	add a,1
	daa
	dec c
	jr nz,ss2
	ld d,7
	ld e,5
	call put_bcd
	jp status_draw

songkeys			; P = next song, O = previous, on the key press (port #DFFE: P bit 0, O bit 1)
	ld bc,#dffe
	in a,(c)
	and 3
	ld hl,keyp2
	ld c,(hl)
	ld (hl),a
	cpl
	and c
	ret z
	ld b,a
	ld a,(nsongs)
	ld c,a
	ld a,(cursong)
	bit 0,b
	jr z,sk1
	inc a
	cp c
	jr c,songsel
	xor a
	jr songsel
sk1	or a
	jr nz,sk2
	ld a,c
sk2	dec a
	jr songsel

dobyte	ld a,d			; d = mask, e = first register, hl = stream
	or a
	ret z
dl	srl d
	jr nc,dnext
	ld a,(hl)
	inc hl
	call aywr
	push hl
	ld hl,SHADOW
	ld c,e
	ld b,0
	add hl,bc
	ld (hl),a
	pop hl
dnext	inc e
	ld a,d
	or a
	jr nz,dl
	ret

aywr	ld bc,#fffd		; AY register e = a; keeps A and E
	out (c),e
	ld b,#bf
	out (c),a
	ret

setbank	ld a,(idx)		; page banktab[idx] at 0xC000, hl = 0xC000
	ld e,a
	ld d,0
	ld hl,banktab
	add hl,de
	ld a,(hl)
	ld bc,#7ffd
	out (c),a
	ld hl,#c000
	ret

; ---- screen ----------------------------------------------------------------------------
keys	ld bc,#7ffe		; SPACE toggles pause on the key press
	in a,(c)
	and 1
	ld hl,keyprev
	cp (hl)
	ld (hl),a
	ret z
	or a
	ret nz
	ld a,(paused)
	xor 1
	ld (paused),a
	jr z,resume
	ld e,8			; volumes off
sil	xor a
	call aywr
	inc e
	ld a,e
	cp 11
	jr nz,sil
	jr status_draw
resume	ld hl,SHADOW		; registers 0-12 back (13 would restart the envelope)
	ld e,0
rs1	ld a,(hl)
	inc hl
	call aywr
	inc e
	ld a,e
	cp 13
	jr nz,rs1

status_draw
	ld d,7
	ld e,12
	ld a,(mins)
	call put_bcd
	ld e,15
	ld a,(secs)
	call put_bcd
	ld hl,txt_playing
	ld a,(paused)
	or a
	jr z,sd1
	ld hl,txt_paused
sd1	ld d,7
	ld e,19
	ld b,7
	jp puttext
put_bcd	push af
	rrca
	rrca
	rrca
	rrca
	and 15
	call putdig
	pop af
	and 15
	inc e
putdig	add a,16
	jp puttile

tick	ld a,(paused)
	or a
	ret nz
	ld a,(frames)
	inc a
	ld (frames),a
	cp 50
	ret nz
	xor a
	ld (frames),a
	ld a,(secs)
	add a,1
	daa
	cp #60
	jr nz,tk2
	ld a,(mins)
	add a,1
	daa
	ld (mins),a
	xor a
tk2	ld (secs),a
	jr status_draw

update_bars
	ld hl,SHADOW + 8
	ld de,lvl
	ld b,3
ub1	ld a,(hl)
	and 31
	cp 16
	jr c,ub2
	ld a,15			; envelope bit: full
ub2	inc a
	srl a
	ld (de),a
	inc hl
	inc de
	djnz ub1
	ld a,(paused)
	or a
	jr z,ub3
	xor a
	ld (lvl),a
	ld (lvl + 1),a
	ld (lvl + 2),a
ub3	ld a,(SHADOW + 7)	; noise level: loudest channel whose mixer noise bit (3-5) is on
	ld c,a
	srl c
	srl c
	srl c
	ld hl,lvl
	ld d,0
	ld b,3
ub4	ld a,(hl)
	inc hl
	srl c
	jr c,ub5
	cp d
	jr c,ub5
	ld d,a
ub5	djnz ub4
	ld a,d
	ld (lvl + 3),a
	ld a,(lvl)
	ld hl,BARBASE + 2
	call bar
	ld a,(lvl + 1)
	ld hl,BARBASE + 4
	call bar
	ld a,(lvl + 2)
	ld hl,BARBASE + 6
	call bar
	ld a,(lvl + 3)
	ld hl,BARBASE + 8
	jp bar

scroll				; two scroller pixel rows per frame: one character every 4 frames, no 32 character redraw
	call scroll_row
	jp scroll_row

chiptxt	db "ZX SPECTRUM AY 128K "
statustxt	db "SONG 01/01  00:00  PLAYING"
txt_playing	db "PLAYING"
txt_paused	db "PAUSED "
bartxt	db "A B C N"
scrmsg	db "DEVILBOX NATIVE PLAYER FOR THE ZX SPECTRUM 128K - SPACE TO PAUSE - O AND P TO CHANGE SONG ...                                "
scrend
SCRLEN	equ scrend - scrmsg
scrtxt	equ scrmsg
	db "DEVILBOX NATIVE PLAYER FOR THE ZX SPECTRUM 128K - SPACE TO PAUSE - O AND P TO CHANGE SONG ...                                "

	include "screen.inc"

nsongs	db 1			; patched by the exporter
songtab	db 0			; per song: bank table index, start address (lo, hi); patched by the exporter
	dw #c000
	defs (MAXSONGS - 1) * 3
banktab	defs 8			; 0x10 | bank number (ROM 1 selected), patched by the exporter
