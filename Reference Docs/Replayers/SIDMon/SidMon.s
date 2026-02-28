*****************************************************************
* Level 6 Sidmon module player by John 'BOIL' van Dijk		*
* Written in DevPac 2.14 (With a few changes also for SEKA)	*
* This means no variation in speed on NTSC/PAL machines and	*
* no variation accessing disks etc.				*
* runs 50 times a second (erm .. well .. almost .. -0,9% off!)	*
* 37 or 38 is normal speed.					*
*****************************************************************
; !!!!
	XDEF	_sid_init,_sid_music,_sid_end
	XREF	_adr_data,_st_end
; !!!!
_sid_init:
	move.l	_adr_data,a0
	jsr	(a0)
	rts
_sid_end:
	jsr	_st_end
	rts
_sid_music:
	move.l	_adr_data,a0
	jsr	$13e(a0)
	rts

