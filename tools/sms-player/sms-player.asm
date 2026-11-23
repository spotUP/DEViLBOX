; DEViLBOX Master System / Game Gear cartridge player.
; Banjo (Joe Kennedy, MIT, third-party/banjo) plays the song; this shell only
; sets up the VDP frame interrupt and calls banjo_update_song once per frame.
; The song (Banjo song data, written by src/lib/export/sms/banjoSong.ts) is
; placed in banks 2-3 by src/lib/export/sms/smsRom.ts; init maps them into
; slots 1-2 through the Sega mapper, so the song sees one 32 KB window at
; SONG_ADDR. Bank 1 holds only the cartridge header.
; Tick rate: smsRom.ts patches song_hz (the song's whole-number tick rate).
; Init measures the console's frame rate (50 or 60) by counting scanlines,
; and the frame loop spreads song_hz ticks over those frames, so a 50 Hz song
; plays at 50 Hz on an NTSC console and a 60 Hz song at 60 Hz on PAL.
; Game Gear mode is detected at run time by banjo_check_hardware, so one
; binary serves both .sms and .gg (the export patches the header region).

.include "../../third-party/banjo/music_driver/banjo_defines_wladx.inc"

.define VDP_CONTROL_PORT 0xbf
.define VDP_V_COUNTER 0x7e
.define VDP_WRITE_REGISTER 0x8000
.define CHAN_COUNT CHAN_COUNT_SN
.define SONG_ADDR 0x4000

.MEMORYMAP
	SLOTSIZE $4000
	DEFAULTSLOT 0
	SLOT 0 $0000
	SLOT 1 $4000
	SLOT 2 $8000
	SLOT 3 $C000
.ENDME

.ROMBANKMAP
	BANKSTOTAL 4
	BANKSIZE $4000
	BANKS 4
.ENDRO

.RAMSECTION "Main Vars" bank 0 slot 3
	song_channels: INSTANCEOF channel (CHAN_COUNT)
	console_hz: db
	tick_acc: db
.ENDS

.BANK 0 SLOT 0
.org 0x0000
	di
	im 1
	ld sp, 0xdff0
	jp init

.org 0x0038
vblank_interrupt:
	; frame interrupt: scroll 0 for the static screen, wake frame_loop;
	; line interrupt (just above the scroller row): scroll that row
	push af
	in a, (VDP_CONTROL_PORT)	; acknowledge; bit 7 = frame interrupt
	rla
	jr c, +
	ld a, (scr_hscroll)
	out (VDP_CONTROL_PORT), a
	ld a, 0x88
	out (VDP_CONTROL_PORT), a
	pop af
	ei
	reti
+:	xor a
	out (VDP_CONTROL_PORT), a
	ld a, 0x88
	out (VDP_CONTROL_PORT), a
	ld a, 1
	ld (scr_vblank), a
	pop af
	ei
	reti

.org 0x0066
	retn

.SECTION "Init" free
init:
	; Sega mapper: slot 0 = bank 0, slots 1-2 = song banks 2-3
	xor a
	ld (0xfffc), a
	ld (0xfffd), a
	ld a, 2
	ld (0xfffe), a
	inc a
	ld (0xffff), a

	call measure_frame_rate
	dec a				; first frame ticks at once
	ld (tick_acc), a

	call banjo_check_hardware

	ld a, CHAN_COUNT
	ld l, BANJO_HAS_SN
	call banjo_init

	ld hl, SONG_ADDR
	call banjo_play_song

	call screen_init

	; mode 4, left column blank, line interrupt on; display and frame interrupt on
	ld hl, VDP_WRITE_REGISTER | (0 << 8) | 0b00110110
	call vdp_reg
	ld hl, VDP_WRITE_REGISTER | (1 << 8) | 0b11100000
	call vdp_reg
	ei

frame_loop:
	; clear first: a flag left over from an earlier frame would start the
	; VRAM blast at the line interrupt (line 172), inside the active display
	xor a
	ld (scr_vblank), a
-:	halt
	ld a, (scr_vblank)		; the line interrupt also ends halt
	or a
	jr z, -
	call screen_vblank
	ld a, (song_hz)
	ld hl, tick_acc
	add a, (hl)			; acc < console_hz and song_hz <= 195, so no carry
	ld hl, console_hz
-:	cp (hl)
	jr c, +
	sub (hl)
	ld (tick_acc), a
	call banjo_update_song
	ld a, (tick_acc)
	ld hl, console_hz
	jr -
+:	ld (tick_acc), a
	call screen_update
	jr frame_loop

; Counts V counter changes between two frame flags: 262 lines on NTSC
; (and Game Gear), 313 on PAL. Interrupts are off. Returns a = console_hz.
measure_frame_rate:
	in a, (VDP_CONTROL_PORT)	; clear a pending frame flag
-:	in a, (VDP_CONTROL_PORT)
	rla
	jr nc, -
	ld hl, 0
	in a, (VDP_V_COUNTER)
	ld b, a
-:	in a, (VDP_V_COUNTER)
	cp b
	jr z, -
	ld b, a
	inc hl
	in a, (VDP_CONTROL_PORT)
	rla
	jr nc, -
	ld de, -288
	add hl, de			; carry when lines >= 288
	ld a, 60
	jr nc, +
	ld a, 50
+:	ld (console_hz), a
	ret

; The song's tick rate (Hz), patched by smsRom.ts.
song_hz:
	.db 60
.ENDS

.incdir "../../third-party/banjo/music_driver/banjo"
.include "banjo.asm"

.incdir "../../third-party/banjo/music_driver/sn"
.include "banjo_sn.asm"

.incdir "."
.include "screen.asm"

.SMSHEADER
	PRODUCTCODE 0, 0, 0
	VERSION 0
	REGIONCODE 4
	RESERVEDSPACE 0, 0
	ROMSIZE 0xe
	CHECKSUMSIZE 32*1024
.ENDSMS

.BANK 2 SLOT 1
.ORGA SONG_ADDR
.SECTION "Song" force
song_data:
	.db 0
.ENDS
