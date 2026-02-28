; *****************************************************************
; *****             DELTA MUSIC V2.2 REPLAY TEST              *****
; *****             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~              *****
; *****	The player can also make complex SOUND FX, you can    *****
; ***** read about it, in the DELTA.DOC file.                 *****
; *****							      *****
; *****			Signed Shogun			      *****
; *****							      *****
; *****************************************************************
; ***** PS. REMEMBER TO LOAD THE FINAL SONG INTO THE LABEL    *****
; *****     CALLED "MUSIC_DATA" ........                      *****
; *****************************************************************
; !!!!
	XDEF	_dlt_init,_dlt_music,_dlt_end
	XREF	_adr_data
; !!!!

_dlt_end:

	moveq	#2,d0			; SET MUSIC VOLUME
	move.b	#0,d1			; Valeur du volume
	move.l	_adr_data,a0	
	jsr	(a0)			; CALL THE PLAYER
	move.l	_adr_data,a0	
	jsr	(a0)			; CALL THE PLAYER

_dlt_init:
	moveq	#1,d0			; INIT MUSIC
	move.l	_adr_data,a0	
	jsr	(a0)			; CALL THE PLAYER
	rts
_dlt_music
	clr.w	d0
	move.l	_adr_data,a0	
	jsr	(a0)			; CALL THE PLAYER
	rts
