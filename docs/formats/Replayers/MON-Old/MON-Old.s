mani	= $429ce
init	= $42fe4
play	= $42f80
play2	= $429de
stop	= $430e8
ena	= $4312c

	include	"include:lvo.i"

Start:				; Install
	lea	data(pc),a1
	lea	mani,a0
	move.l	genial(pc),d0
lp	move.l	(a1)+,(a0)+
	dbf	d0,lp
	move.b	#1,ena
	moveq	#0,d0
	jSR	init

	lea	prog(pc),a0
	bsr	playciaa

	jsr	stop
	move.b	#0,ena
	MOVEQ	#0,D0
	rts

prog:				; Nutzlast
	jsr	play
	jsr	play2
	rts

genial	dc.l	(dataE-data)/4

	include "sys:sekasources/CIAA-Interrupt.s"
data
	incbin	"dh0:music/mani.science"
dataE

