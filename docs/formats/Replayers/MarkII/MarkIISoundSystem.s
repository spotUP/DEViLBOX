* How to play 'Mark II'

>extern"dh0:music/mark.supreme",music

music=$40000			;Modul ab z.B. $40000 einlesen!

j:
rast:	cmp.b	#$80,$dff006
	bne	rast
	moveq	#-1,d0		;Initialisieren
	jsr	music

rast2:	cmp.b	#$80,$dff006
	bne	rast2
	move.w	#0,d0		;Weiterspielen
	jsr	music
	btst	#6,$bfe001
	bne.s	rast2

rast3:	cmp.b	#$80,$dff006
	bne	rast3
	moveq	#1,d0		;Ausblenden
	moveq	#2,d1		;Geschwindigkeit zum Ausblenden
	jsr	music
	cmp.w	#4,d0		;ausgeblendet?
	beq.s	rast3
	tst.w	d0
	bmi	rast3

	move.w	#$f,$dff096	;DMA aus
	moveq	#0,d0
	rts
