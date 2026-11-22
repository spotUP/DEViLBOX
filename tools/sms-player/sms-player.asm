; DEViLBOX Master System / Game Gear cartridge player.
; Banjo (Joe Kennedy, MIT, third-party/banjo) plays the song; this shell only
; sets up the VDP frame interrupt and calls banjo_update_song once per frame.
; The song (Banjo song data, written by src/lib/export/sms/banjoSong.ts) is
; placed at SONG_ADDR (bank 1, slot 1) by src/lib/export/sms/smsRom.ts.
; Game Gear mode is detected at run time by banjo_check_hardware, so one
; binary serves both .sms and .gg (the export patches the header region).

.include "../../third-party/banjo/music_driver/banjo_defines_wladx.inc"

.define VDP_CONTROL_PORT 0xbf
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
	BANKSTOTAL 2
	BANKSIZE $4000
	BANKS 2
.ENDRO

.RAMSECTION "Main Vars" bank 0 slot 3
	song_channels: INSTANCEOF channel (CHAN_COUNT)
.ENDS

.BANK 0 SLOT 0
.org 0x0000
	di
	im 1
	ld sp, 0xdff0
	jp init

.org 0x0038
vblank_interrupt:
	push af
	in a, (VDP_CONTROL_PORT)	; acknowledge the frame interrupt
	pop af
	ei
	reti

.org 0x0066
	retn

.SECTION "Init" free
init:
	call banjo_check_hardware

	ld a, CHAN_COUNT
	ld l, BANJO_HAS_SN
	call banjo_init

	ld hl, SONG_ADDR
	call banjo_play_song

	; display on, frame interrupt on
	ld hl, VDP_WRITE_REGISTER | (1 << 8) | 0b11100000
	ld c, VDP_CONTROL_PORT
	out (c), l
	out (c), h
	ei

frame_loop:
	halt
	call banjo_update_song
	jr frame_loop
.ENDS

.incdir "../../third-party/banjo/music_driver/banjo"
.include "banjo.asm"

.incdir "../../third-party/banjo/music_driver/sn"
.include "banjo_sn.asm"

.SMSHEADER
	PRODUCTCODE 0, 0, 0
	VERSION 0
	REGIONCODE 4
	RESERVEDSPACE 0, 0
	ROMSIZE 0xc
	CHECKSUMSIZE 32*1024
.ENDSMS

.BANK 1 SLOT 1
.ORGA SONG_ADDR
.SECTION "Song" force
song_data:
	.db 0
.ENDS
