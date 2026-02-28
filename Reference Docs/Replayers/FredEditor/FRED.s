; !!!!
	XDEF	_fred_init,_fred_music,_fred_end
	XREF	_adr_data,_num_musique
; !!!!

_fred_init:
	move.l	_adr_data,a0
	move.l	_num_musique,d0
	jsr	(a0)
	rts
_fred_music:
	move.l	_adr_data,a0
	jsr	4(a0)
	rts

_fred_end:
	moveq	#0,d1
	move.l	_adr_data,a0
	jsr	8(a0)
	rts

