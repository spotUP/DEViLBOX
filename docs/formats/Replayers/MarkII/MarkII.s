; !!!!
	XDEF	_mkii_init,_mkii_music,_mkii_end
	XREF	_adr_data,_st_end
; !!!!

_mkii_init:
	move.l	_adr_data,a0
	moveq	#-1,d0
	jsr	(a0)
	rts
_mkii_music:
	moveq	#0,d0
	move.l	_adr_data,a0
	jsr	(a0)
	rts

_mkii_end:
	jsr	_st_end
	rts

