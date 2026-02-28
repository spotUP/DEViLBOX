>extern"dh0:music/mark.rtype-ingame",music

music=$40000			;Modul ab z.B. $40000 einlesen!

j:
rast:	cmp.b	#$80,$dff006
	bne	rast
	move.w	#$02ff,d4
	jsr	music

rast2:	cmp.b	#$80,$dff006
	bne	rast2
	moveq	#0,d4
	move.w	#2,d3
*	move.w	#1,d1
	move.w	#$f00,$dff180
	jsr	music
	move.w	#$0,$dff180
	btst	#6,$bfe001	;linke Maustaste
	beq.s	rast3
	cmp.w	#0,d4		;Musik schon einmal gespielt?
	beq.s	rast2
*	bra.s	rast

end:
rast3:	cmp.b	#$80,$dff006
	bne	rast3
	moveq	#1,d0		;Ausblenden
	moveq	#1,d1		;Geschwindigkeit zum Ausblenden
	jsr	music
	tst.b	d4		;ausgeblendet?
	bmi	rast3

	move.w	#$f,$dff096	;DMA aus
	moveq	#0,d0
	rts
