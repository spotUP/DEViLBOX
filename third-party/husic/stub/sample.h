; Title: Song Name
; Composer: Artist
; Maker: Maker

	.include "define.inc"
song_addr_table:
	dw	song_000_track_table
	.if (ALLOW_BANK_SWITCH)
song_bank_table:
	dw	song_000_bank_table
	.endif ; ALLOW_BANK_SWITCH
song_000_track_table:
	dw	song_000_00
	dw	song_000_01
	dw	song_000_02
	dw	song_000_03
	dw	song_000_04
	dw	song_000_05
	.if (ALLOW_BANK_SWITCH)
song_000_bank_table:
	db	bank(song_000_00)
	db	bank(song_000_01)
	db	bank(song_000_02)
	db	bank(song_000_03)
	db	bank(song_000_04)
	db	bank(song_000_05)
song_000_loop_table:
	dw	song_000_00_lp
	dw	song_000_01_lp
	dw	song_000_02_lp
	dw	song_000_03_lp
	dw	song_000_04_lp
	dw	song_000_05_lp
song_000_loop_bank:
	db	bank(song_000_00_lp)
	db	bank(song_000_01_lp)
	db	bank(song_000_02_lp)
	db	bank(song_000_03_lp)
	db	bank(song_000_04_lp)
	db	bank(song_000_05_lp)

	.endif

song_000_00:	;Trk A

song_000_00_lp:
	db	$fc,$ff,$ee
	db	bank(song_000_00_lp)
	dw	song_000_00_lp

song_000_01:	;Trk B

song_000_01_lp:
	db	$fc,$ff,$ee
	db	bank(song_000_01_lp)
	dw	song_000_01_lp


song_000_02:	;Trk C

song_000_02_lp:
	db	$fc,$ff,$ee
	db	bank(song_000_02_lp)
	dw	song_000_02_lp


song_000_03:	;Trk D

song_000_03_lp:
	db	$fc,$ff,$ee
	db	bank(song_000_03_lp)
	dw	song_000_03_lp


song_000_04:	;Trk E

song_000_04_lp:
	db	$fc,$ff,$ee
	db	bank(song_000_04_lp)
	dw	song_000_04_lp


song_000_05:	;Trk F

song_000_05_lp:
	db	$fc,$ff,$ee
	db	bank(song_000_05_lp)
	dw	song_000_05_lp

