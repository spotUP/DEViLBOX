; *****************************************************************
; *****             DELTA MUSIC V2.2 REPLAY TEST              *****
; *****             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~              *****
; *****							      *****
; ***** This routine is only made to demonstrate, how to re-  *****
; ***** play the final song ......                            *****
; ***** As you know, the replay-routine is included in the    *****
; ***** song file, so no source-code is needed.               *****
; *****							      *****
; *****	This routine demonstrate how to :                     *****
; *****	  						      *****
; *****	INIT MUSIC					      *****
; *****	PLAY MUSIC					      *****
; *****	FADE MUSIC                                            *****
; *****							      *****
; *****	The player can also make complex SOUND FX, you can    *****
; ***** read about it, in the DELTA.DOC file.                 *****
; *****							      *****
; *****			Signed Shogun			      *****
; *****							      *****
; *****************************************************************
; ***** PS. REMEMBER TO LOAD THE FINAL SONG INTO THE LABEL    *****
; *****     CALLED "MUSIC_DATA" ........                      *****
; *****************************************************************


org  $40000
load $40000

>extern "Delta Music:final/shogunmix",music_data

j:
	moveq	#1,d0			; INIT MUSIC
	bsr	music_data		; CALL THE PLAYER

	move.l	$6c.w,oldirq+2		; SAVE OLD INTERRUPT
	move.l	#newirq,$6c.w		; SET NEW INTERRUPT

mouse_wait:				;
	btst	#6,$bfe001		; TEST FOR MOUSE BUTTOM
	bne.s	mouse_wait		; IF NOT, LOOP

	bsr.s	volume_fade		; FADE VOLUME TO ZERO

	move.l	oldirq+2,$6c.w		; SET OLD INTERRUPT
	move.w	#$f,$dff096		; STOP ALL DMA SOUND
	moveq	#0,d0			;
	rts				; EXIT !!!


VOLUME_FADE:				;
	move.b	#63,volume		; SET START VOLUME

WAIT_RASTER:				; WAIT FOR RASTER LINE 200
	cmp.b	#200,$dff006		;
	bne.s	wait_raster		;

WAIT_RASTER2:				; WAIT FOR RASTER LINE 201
	cmp.b	#201,$dff006		;
	bne.s	wait_raster		;

FADE_LOOP:				; FADE DELAY
	subq.b	#1,fade_delay		; 
	bpl.s	wait_raster		;
	move.b	#5,fade_delay		;

	moveq	#2,d0			; SET MUSIC VOLUME
	move.b	volume(pc),d1		;
	bsr.s	music_data		; CALL THE PLAYER

	subq.b	#1,volume		; DEC VOLUME
	bpl.s	wait_raster		; IF VOLUME NOT ZERO, THEN LOOP
	rts


VOLUME:
	dc.b	63
FADE_DELAY:
	dc.b	0
	even

NEWIRQ:
	movem.l	d0-d7/a0-a6,-(a7)	; REPLAY MUSIC
WAIT:
	cmp.b	#150,$dff006		; WAIT FOR RASTER LINE 100
	bne.s	wait

	move.w	#$006,$dff180
	moveq	#0,d0			; SET REPLAY MODE
	bsr.s	music_data		; CALL THE PLAYER

	move.w	#$000,$dff180

	movem.l	(a7)+,d0-d7/a0-a6	;
OLDIRQ:					;
	jmp	$ffffffff		; EXIT IRQ

MUSIC_DATA:
