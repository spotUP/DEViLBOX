	SECTION	example

	XREF	MUSIC_InitData	; from playmodule.o
	XREF	MUSIC_Player
	XREF	MUSIC_Play
	XREF	MUSIC_Stop
	XREF	SONG		; A file song.o (which may be linked using
				; BLink) can be made with MakeLinkable
				; or you can use the INCBIN directive
				; (if the song-file is small enough)

	lea	SONG,a0
	jsr	MUSIC_InitData
	bsr	VTB_setup
	moveq.l	#0,d0
	jsr	MUSIC_Play
wait	btst	#6,$bfe001
	bne	wait
	jsr	MUSIC_Stop
	bsr	VTB_remove
	moveq.l	#0,d0
	rts

VTB_setup
	move.w	#$4000,$dff09a
	move.l	$6c.w,oldintr+2
	move.l	#VTB,$6c.w
	move.w	#$c000,$dff09a
	moveq	#0,d0
	rts

VTB_remove
	move.w	#$4000,$dff09a
	move.l	oldintr+2,$6c.w
	move.w	#$c000,$dff09a
	rts

VTB	btst	#5,$dff01f
	beq.s	oldintr
	movem.l	d0-d7/a0-a6,-(sp)
	jsr	MUSIC_Player
	movem.l	(sp)+,d0-d7/a0-a6
oldintr	jmp	0
