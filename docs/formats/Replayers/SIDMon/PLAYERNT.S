* ************************************************************ *  
** ***            SID-MONITOR - PLAY ROUTINE              *** **  
*** ****------------------------------------------------**** *** 
*** ******************************************************** *** 
*** ****------------------------------------------------**** ***  
** ****            CREATED BY REINIER V VLIET             *** **  
* ************************************************************ *  
                                                                 
**************** THE PLAYER FOR EXTRA SMALL TUNES **************
*--------------------------------------------------------------*
********************* INCLUDING  SAMPLES ***********************


main:
	bsr	init
	bsr	playon

mouzer:
	btst	#6,$bfe001
	bne	mouzer

	bsr	playoff
	rts



playon:
	bsr	init
	lea	intflag(pc),a3
	cmp.l	#1,(a3)
	beq	interisaan
	bsr	interon
interisaan:
	rts

playoff:
	bsr	interoff
	rts

init:
	lea	offsetter(pc),a0
	add.l	-44(a0),a0
	lea	audiochannel1(pc),a1
	move.l	a0,(a1)
	lea	offsetter(pc),a0
	add.l	-40(a0),a0
	lea	audiochannel2(pc),a1
	move.l	a0,(a1)
	lea	offsetter(pc),a0
	add.l	-36(a0),a0
	lea	audiochannel3(pc),a1
	move.l	a0,(a1)
	lea	offsetter(pc),a0	
	add.l	-32(a0),a0
	lea	audiochannel4(pc),a1
	move.l	a0,(a1)


	move.w	#$000f,$dff096
	lea	datas(pc),a0
	move.l	#19,d0
clear:
	clr.l	(a0)+
	dbf	d0,clear
	
	move.l	#3,d0
	lea	offsetter(pc),a0
	add.l	-12(a0),a0	;patroom
	move.l	a0,d7
	lea	datas(pc),a0
	lea	audiochannel1(pc),a1
	move.l	#$dff0a0,a3
loop1:
	move.l	(a1)+,a2

	move.l	#1,d5	;waar beginnen in de song

	move.l	a2,(a0)+
	move.l	(a2),d5
	lea	offsetter(pc),a4
	add.l	-8(a4),a4	;patpointers
	asl.l	#2,d5		;mischien 1 subben!!
	add.l	d5,a4
	move.l	(a4),a4
	add.l	d7,a4
	move.l	a4,a2

	move.l	a4,(a0)+
;	move.l	2(a1),a2
;	move.l	a2,(a0)+
	clr.l	d6
	move.b	1(a2),d6
	sub.b	#1,d6
	lea	offsetter(pc),a4	;inst1
	add.l	-28(a4),a4
	mulu	#32,d6
	add.l	d6,a4

	move.l	a4,(a0)+
	move.l	#$99990000,(a0)+
	move.l	#$00000800,(a0)+
	move.l	#$00000000,(a0)+
	move.l	#$00000000,(a0)+
	move.l	#0,(a0)+
	move.w	#$10,4(a3)
	move.w	#$00,8(a3)
	lea	16(a3),a3
	dbf	d0,loop1
	lea	intercount(pc),a0
	move.l	#-1,(a0)
	lea	intersongcount(pc),a0
	move.l	#1,(a0)
	move.w	#$800f,$dff096
	rts


interon:
	lea	intflag(pc),a0
	cmp.l	#1,(a0)
	beq	noton

	move.w	#$2000,$dff09a
	lea	oldirqvec(pc),a1
	move.l	$78,2(a1)
	lea	muzakplay(pc),a1
	move.l	a1,$78

	move.b	#$88,$bfed01
	move.b	#%00000000,$bfde00	; cra stop
	lea	tahi(pc),a1
	move.b	(a1),$bfd500		; nieuwe countwaarde
	lea	talo(pc),a1
	move.b	(a1),$bfd400
	move.b	#%00010000,$bfde00	; cra forceload	
	move.b	#$7f,$bfdd00		; clr icr
	move.b	#%10000001,$bfdd00	; interrupt bij timer A
	move.b	#$10,$bfde00
	move.b	#$01,$bfde00
	move.w	#$a000,$dff09a

	move.l	#1,(a0)
noton:
	lea	endofpatflag(pc),a0
	clr.l	(a0)
	lea	endofsongflag(pc),a0
	clr.l	(a0)
	lea	offsetter(pc),a0	;speed
	add.l	-20(a0),a0
	add.l	#32,a0
	lea	flipflap(pc),a1
	move.l	(a0),(a1)
	rts
interoff:
	lea	intflag(pc),a0
	cmp.l	#0,(a0)
	beq	notoff
	move.w	#$2000,$dff09a
	lea	oldirqvec(pc),a1
	move.l	2(a1),$78
	move.w	#$a000,$dff09a
	move.w	#$000f,$dff096


	clr.l	(a0)

notoff:
	rts

muzakplay:
	movem.l	d0-d7/a0-a6,-(a7)

	lea	icrbyte(pc),a0
	move.b	$bfdd00,(a0)
	btst	#0,(a0)
	beq	interstoppie
	move.w	#$2000,$dff09c

	lea	dma(pc),a0
	move.w	#$0001,(a0)
	lea	datas(pc),a0
	move.l	#$dff0a0,a1	
	lea	audiochannel1(pc),a5
	bsr	play
	lea	dma(pc),a0
	move.w	#$0002,(a0)
	lea	datas(pc),a0
	add.l	#32,a0
	move.l	#$dff0b0,a1	
	lea	audiochannel2(pc),a5
	bsr	play
	lea	dma(pc),a0
	move.w	#$0008,(a0)	
	lea	datas(pc),a0
	add.l	#96,a0
	move.l	#$dff0d0,a1
	lea	audiochannel4(pc),a5
	bsr	play	
	lea	dma(pc),a0
	move.w	#$0004,(a0)
	lea	datas(pc),a0
	add.l	#64,a0
	move.l	#$dff0c0,a1
	lea	audiochannel3(pc),a5
	bsr	play
ditwazit:
	lea	flipflap(pc),a0
	add.l	#1,(a0)

	lea	offsetter(pc),a1	;speed
	add.l	-20(a1),a1
	add.l	#32,a1

	lea	bugflag(pc),a2
	move.l	(a2),d0
	add.l	d0,(a1)

	move.l	(a1),d0
	cmp.l	(a0),d0
	bhs	neinz
	move.l	#0,(a0)

neinz:

	lea	endofpatflag(pc),a1
	clr.l	(a1)
	lea	endofsongflag(pc),a1
	clr.l	(a1)

	cmp.l	#0,(a0)
	bne	wegwezer
	lea	intercount(pc),a0

	lea	offsetter(pc),a1	;patlength
	add.l	-20(a1),a1
	add.l	#24,a1
	add.l	#1,(a0)
	move.l	(a0),d0
	cmp.l	(a1),d0
	bne	rnoendofpat
	move.l	#0,(a0)
	lea	endofpatflag(pc),a0
	move.l	#1,(a0)


rsongtellers:
	lea	intersongcount(pc),a0
	lea	offsetter(pc),a1	;songl
	add.l	-20(a1),a1
	add.l	#28,a1
	lea	endofsongflag(pc),a2

	add.l	#1,(a0)
	move.l	(a1),d0
	cmp.l	(a0),d0	
	bhi	rnoendofsong
	move.l	#1,(a0)
	move.l	#1,(a2)
rnoendofsong:
	
ralle:

rnoendofpat:
nottim:
wegwezer:
	bsr	mixforms
	bsr	filters

	bsr	loopenen
interstoppie:
	movem.l	(a7)+,d0-d7/a0-a6
oldirqvec:
	jmp	$00000000


play:
	lea	audpoint(pc),a6
	clr.l	(a6)
	lea	audper(pc),a6
	clr.l	(a6)
	lea	audvol(pc),a6
	clr.l	(a6)
	lea	notchangeflag(pc),a6
	clr.l	(a6)
	lea	audlen(pc),a6
	clr.w	(a6)

	lea	flipflap(pc),a6
	cmp.l	#0,(a6)
	bne	nosub2

	lea	endofpatflag(pc),a6
	cmp.l	#1,(a6)
	bne	noendofpat
	clr.b	19(a0)

songtellers:
	lea	endofsongflag(pc),a6
	add.l	#6,(a0)
	cmp.l	#1,(a6)
	bne	noendofsong
	move.l	(a5),a2
	move.l	a2,(a0)
noendofsong:
	
	move.l	(a0),a2
	move.l	(a2),d0

	lea	offsetter(pc),a2	;patp
	add.l	-8(a2),a2
	asl.l	#2,d0		;mischien 1 subben!!
	add.l	d0,a2
	move.l	(a2),a2
	lea	offsetter(pc),a6	;patr
	add.l	-12(a6),a6
	add.l	a6,a2


alle:
	move.l	a2,4(a0)

noendofpat:
	cmp.b	#0,19(a0)
	bne	nosub

	move.l	4(a0),a2
	clr.l	d0
	move.b	1(a2),d0
	cmp.b	#0,d0
	beq	noinstrument
	sub.l	#1,d0

	asl	#5,d0		
	lea	offsetter(pc),a3	;inst1
	add.l	-28(a3),a3
	add.l	d0,a3

*
	lea	audlen(pc),a6
	move.w	#16,(a6)
	cmp.b	#0,31(a0)
	beq	overhene
	lea	dma(PC),a6
	move.w	(a6),$dff096
overhene:
	clr.b	31(a0)
	move.l	(a3),d0		
	cmp.b	#16,d0
	bhs	itsasample
nosmpl:

	move.b	#0,28(a0)	;wavestep
	move.b	d0,29(a0)	;cur wavelist
	sub.b	#1,d0
	asl.l	#4,d0
	lea	offsetter(pc),a4;wavelists
	add.l	-16(a4),a4


	add.l	d0,a4
	clr.l	d1
	move.b	(a4),d1		;cur waveform

	move.b	1(a4),30(a0)	;timer

	sub.l	#1,d1
	asl.l	#5,d1

	lea	offsetter(pc),a6	;wavef1
	add.l	-24(a6),a6
	add.l	a6,d1

	lea	notchangeflag(pc),a6
	cmp.l	#1,(a6)
	beq	noiceforce
	lea	audpoint(pc),a6
	move.l	d1,(a6)
noiceforce:
	move.l	a3,8(a0)
	clr.b	18(a0)
	clr.w	26(a0)
	clr.w	22(a0)
	move.b	4(a2),19(a0)
	bra	hoepadoepahoe
*
noinstrument:
	cmp.b	#0,(a2)	;note
	beq	hoepadoepahoe
	clr.l	d0
	move.b	4(a2),19(a0)
	move.b	29(a0),d0
	move.l	#1,d1
	cmp.b	#0,31(a0)
	beq	hoepadoepahoe
	bra	itsasample
hoepadoepahoe:
	clr.l	d1
	move.b	(a2),d1			;note
	cmp.b	#0,d1
	beq	envelopehandler
	cmp.b	#$ff,d1
	bne	neinswein
	move.b	4(a2),19(a0)
	bra	envelopehandler
neinswein:	
	move.b	4(a2),19(a0)

	lea	frequencies(pc),a3
	move.l	(a0),a4
	add.b	5(a4),d1	;pattern transpose!
	asl.l	#1,d1
	move.w	0(a3,d1),d2

;***				FINE TUNING!(kut metina + ramona)
	move.l	a4,a6
	move.l	8(a0),a4	;cur inst
	clr.l	d3
	move.b	30(a4),d3
	mulu	#134,d3
	add.l	d3,a3
	move.w	2(a3,d1),d2
	move.l	a6,a4



;***


	move.w	d2,12(a0)	;cur freq
	move.b	d1,16(a0)	;last note
	lea	audper(pc),a6
	move.w	d2,(a6)		;audioper

	clr.b	18(a0)		;envelopetimer
	clr.w	20(a0)		;envelopes
	clr.w	22(a0)		;pitchcount
	clr.w	26(a0)

	move.b	#0,15(a0)
	move.b	2(a2),d2
	cmp.b	#0,d2
	bne	neins
	cmp.b	#0,3(a2)
	beq	druppel

	move.l	8(a0),a3	;cur inst
	lea	20(a3),a3	;envelopes
	move.b	3(a2),1(a3)
	move.b	3(a2),(a3)
	move.b	4(a2),19(a0)
	move.b	#0,15(a0)	
	move.l	8(a0),a3
	move.b	29(a3),25(a0)
	clr.b	30(a0)
	bra	envelopehandler
neins:
	cmp.b	#2,d2		;c#1
	bne	nospeedchng
	lea	offsetter(pc),a6
	add.l	-20(a6),a6
	add.l	#32,a6		;speed
	move.b	3(a2),3(a6)

	move.b	4(a2),19(a0)
	move.b	#0,15(a0)	
	move.l	8(a0),a3
	move.b	29(a3),25(a0)
	clr.b	30(a0)
	bra	envelopehandler
nospeedchng:

	cmp.b	#3,d2		;d-1
	bne	nopatlengthchng

	lea	offsetter(pc),a6
	add.l	-20(a6),a6
	add.l	#24,a6		;patlength
	move.b	3(a2),3(a6)
	move.b	#0,15(a0)	
	move.b	4(a2),19(a0)
	move.l	8(a0),a3
	move.b	29(a3),25(a0)
	clr.b	30(a0)
	bra	envelopehandler
nopatlengthchng:


	add.b	5(a4),d2
	move.b	d2,14(a0)
	move.b	3(a2),15(a0)
	move.b	4(a2),19(a0)
druppel:
	move.l	8(a0),a3
	move.b	29(a3),25(a0)


envelopehandler:
	add.l	#5,a2
	move.l	a2,4(a0)
	bra	nosub2
nosub:
	sub.b	#1,19(a0)
nosub2:
	move.l	8(a0),a3	;cur inst
	lea	20(a3),a3	;envelopes
	clr.w	d3
	clr.w	d2
	clr.w	d1
	lea	audvol(pc),a6
	move.b	18(a0),d1
	cmp.b	#0,d1
	beq	attack
	add.l	#2,a3
	cmp.b	#2,d1
	beq	decay
	add.l	#2,a3
	cmp.b	#4,d1
	beq	sustain
	add.l	#2,a3
	cmp.b	#6,d1
	beq	release
	bra	envelopegone
attack:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	add.w	d1,d3
	move.w	d3,(a6)
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	envelopegone
	add.b	#2,18(a0)
	move.w	d2,(a6)		;audio vol
	move.b	d2,20(a0)	;cur vol
	bra	envelopegone

decay:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	sub.w	d1,d3
	move.w	d3,(a6)
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	pasaan
	cmp.w	#$ff00,d3
	bhs	pasaan
	bra	envelopegone
pasaan:
	add.b	#2,18(a0)
	move.w	d2,(a6)		;audio vol
	move.b	d2,20(a0)	;cur vol
	move.b	2(a3),21(a0)	;sustain time
	bra	envelopegone

sustain:
	move.b	20(a0),d3
	move.w	d3,(a6)
	sub.b	#1,21(a0)
	cmp.b	#0,21(a0)
	bne	envelopegone
	add.b	#2,18(a0)
	bra	envelopegone

release:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	sub.w	d1,d3
	move.w	d3,(a6)
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	pasaan2
	cmp.w	#$ff00,d3
	bhi	pasaan2
	bra	envelopegone
pasaan2:
	add.b	#2,18(a0)
	move.w	d2,(a6)		;audio vol
	move.b	d2,20(a0)	;cur vol

envelopegone:		;end of envelopehandler

	move.l	8(a0),a2
	add.b	#1,17(a0)
	and.b	#15,17(a0)
	clr.l	d1
	move.b	17(a0),d1
	lea	4(a2),a2
	add.l	d1,a2		;pointer to arpeggio
	move.b	(a2),d1
	clr.l	d2
	move.b	16(a0),d2
	asl.w	#1,d1
	add.b	d1,d2
	lea	frequencies(pc),a2
	add.l	d2,a2
	move.w	(a2),d2

;***				FINE TUNING!

	move.l	8(a0),a6	;cur inst
	clr.l	d3
	move.b	30(a6),d3
	mulu	#134,d3
	add.l	d3,a2
	move.w	(a2),d2


;***

	move.w	d2,12(a0)
	lea	audper(pc),a6
	move.w	d2,(a6)		;arpeggio ready

	clr.w	d3
	move.b	15(a0),d3	;pitchbend speed
	cmp.b	#0,d3		;no pitchbendings
	beq	audioinit
	neg.b	d3
	ext.w	d3
	clr.l	d4
	move.b	14(a0),d4
	asl.w	#1,d4
	lea	frequencies(pc),a4
	add.l	d4,a4

;***				FINE TUNING!

	move.l	8(a0),a6	;cur inst
	clr.l	d5
	move.b	30(a6),d5
	mulu	#134,d5
	add.l	d5,a4

;***

	move.w	(a4),d4		;end-frequencie
	btst	#15,d3
	beq	up		;pitchdown or up?
	move.w	22(a0),d2
	add.w	d3,d2
	add.w	d2,12(a0)	;cur freq
	move.w	d2,22(a0)
	move.w	12(a0),d2
	cmp.w	d2,d4
	blo	audioinit
	move.b	14(a0),d3
	asl.b	#1,d3
	move.b	d3,16(a0)
	move.w	d4,12(a0)
	clr.w	22(a0)
	move.b	#0,15(a0)
	bra	audioinit
up:
	move.w	22(a0),d2
	add.w	d3,d2
	add.w	d2,12(a0)	;cur freq
	move.w	d2,22(a0)
	move.w	12(a0),d2
	cmp.w	d2,d4
	bhi	audioinit
	move.b	14(a0),d3
	asl.b	#1,d3
	move.b	d3,16(a0)
	move.w	d4,12(a0)
	clr.w	22(a0)
	move.b	#0,15(a0)
audioinit:	

	move.l	8(a0),a4
	cmp.b	#0,28(a4)
	beq	audio3
	cmp.b	#0,25(a0)
	bne	audio2
	clr.l	d0
	move.b	28(a4),d0
	sub.b	#1,d0
	asl.l	#5,d0
	lea	offsetter(pc),a6	;wavef
	add.l	-24(a6),a6
	add.l	a6,d0
	move.l	d0,a4
	add.b	#1,24(a0)
	and.b	#$1f,24(a0)
	clr.l	d0
	move.b	24(a0),d0
	add.l	d0,a4
	clr.w	d1
	move.b	(a4),d1
	ext.w	d1
	ext.l	d1
	asr.w	#2,d1
	add.w	d1,12(a0)
	bra	audio3
audio2:
	sub.b	#1,25(a0)
audio3:


	move.l	8(a0),a4
	move.b	31(a4),d4
	ext.w	d4
	neg.w	d4		;pitchcut
	add.w	d4,26(a0)
	move.w	26(a0),d4
	add.w	d4,12(a0)


waverlist:
	cmp.b	#0,31(a0)
	bne	nowaverlist
	cmp.b	#0,30(a0)
	bne	nowavechange
	cmp.b	#16,28(a0)
	beq	theend

	lea	offsetter(pc),a2	;wavelist
	add.l	-16(a2),a2

	clr.l	d0
	move.b	29(a0),d0
	sub.b	#1,d0
	asl.l	#4,d0
	add.l	d0,a2		;which list?
	
	clr.l	d0
	move.b	28(a0),d0
	add.l	d0,a2		;add wave step

	cmp.b	#$ff,(a2)	;goto?
	bne	nogoto
	move.b	1(a2),28(a0)
	and.b	#$fe,28(a0)
	bra	theend
nogoto:
	lea	offsetter(pc),a3	;waveform1
	add.l	-24(a3),a3
	move.b	(a2),d0		;new wave

	sub.b	#1,d0
	asl.w	#5,d0
	add.l	d0,a3
	lea	audpoint(pc),a6
	move.l	a3,(a6)
noiceforcea:
	move.b	1(a2),30(a0)	;wavetimer
	add.b	#2,28(a0)
theend:
	bra	theend2
nowavechange:
	sub.b	#1,30(a0)
theend2:
nowaverlist:


	lea	audpoint(pc),a6
	cmp.l	#0,(a6)
	beq	skip1
	lea	audpoint(pc),a6
	move.l	(a6),(a1)
skip1:

	lea	audper(pc),a6
	cmp.l	#0,(a6)
	beq	skip2
	move.w	12(a0),6(a1)
skip2:
	lea	audvol(pc),a6
	cmp.l	#0,(a6)
	beq	skip3
	move.w	(a6),d0
	asr.w	#2,d0
	move.w	d0,8(a1)
skip3:
	lea	audlen(pc),a6
	cmp.w	#0,(a6)
	beq	skip4
	move.w	(a6),4(a1)
skip4:
	lea	cmpcnt(pc),a5
	move.l	#512,d0
	mulu	d0,d0
	move.l	d0,d1
	asl.l	#1,d0
	add.l	d0,d1
	asl.l	#4,d1
	sub.l	#$13ff,d1
	sub.l	a0,a0
	lea	(a0,d1),a0
	lea	8(a5),a1
	add.l	(a5),a1
	move.b	(a0),d0
	asr.b	#1,d0
	cmp.b	(a1),d0
	beq	okl
	cmp.b	-1(a1),d0
	beq	okl2
	clr.l	(a5)
okl2:
	bra	ruts2
okl:
	add.l	#1,(a5)
	cmp.l	#6,(a5)
	bne	ruts2
ruts:
	move.l	#1,4(a5)
ruts2:
	move.w	#$800f,$dff096
	rts


snelweg:	dc.l	0

itsasample:
	movem.l	d0-d7/a0-a6,-(a7)
	lea	effeweg(pc),a6
	move.l	a5,(a6)
	lea	effeweg2(pc),a6
	move.l	a3,(a6)

	lea	dma(pc),a6
	cmp.w	#$0001,(a6)
	bne	not1
	lea	audch1(pc),a5
	bra	not4
not1:
	cmp.w	#$0002,(a6)
	bne	not2
	lea	audch2(pc),a5
	bra	not4
not2:
	cmp.w	#$0004,(a6)
	bne	not3
	lea	audch3(pc),a5
	bra	not4
not3:
	lea	audch4(pc),a5
not4:
	cmp.b	#0,31(a0)
	beq	geendmauit

	move.w	(a6),$dff096
geendmauit:

	move.l	d0,d1
	sub.l	#16,d0
	asl.l	#5,d0
	
	lea	offsetter(pc),a3	;samplestruct
	add.l	-4(a3),a3
	add.l	#4,a3

	add.l	d0,a3
	move.l	d1,d0

	lea	offsetter(pc),a4	;samples
	add.l	-4(a4),a4
	add.l	(a4),a4
	add.l	#4,a4

	add.l	(a3),a4
	lea	audpoint(pc),a6
	move.l	a4,(a6)
	lea	notchangeflag(pc),a6
	move.l	#1,(a6)	

	lea	offsetter(pc),a4	;samples
	add.l	-4(a4),a4
	add.l	(a4),a4
	add.l	#4,a4

	cmp.l	#99999,4(a3)
	bne	oky
	move.l	#$ffffffff,a4
	bra	oko
oky:
	add.l	4(a3),a4
oko:
	move.l	a4,(a5)
	move.l	a4,d1

	lea	offsetter(pc),a4	;samples
	add.l	-4(a4),a4
	add.l	(a4),a4
	add.l	#4,a4

	add.l	8(a3),a4
	sub.l	d1,a4
	move.l	a4,d1		; new length 
	asr.l	#1,d1

	move.l	d1,4(a5)

;cur length 
	move.l	audpoint(pc),a4

	lea	offsetter(pc),a5	;samples
	add.l	-4(a5),a5
	add.l	(a5),a5
	add.l	#4,a5

	sub.l	a5,a4
	move.l	8(a3),d2
	sub.l	a4,d2
	asr.l	#1,d2
	lea	audlen(pc),a6
	move.w	d2,(a6)

	move.b	#1,31(a0)

	cmp.l	#'RVV ',$0
	beq	hoyo
	movem.l	(a7)+,d0-d7/a0-a6
hoyo:
	cmp.l	#1,d1
	beq	hoepadoepahoe
	bra	nosmpl

loopenen:
	lea	datas(pc),a0
	lea	audch1(pc),a1

	cmp.b	#1,31(a0)
	bne	gel2
	move.b	#2,31(a0)
	bra	chan2try
gel2:
	cmp.b	#2,31(a0)
	bne	chan2try
	move.b	#3,31(a0)
	cmp.l	#$ffffffff,(a1)
	beq	noloopie2
	move.l	(a1),$dff0a0
	move.l	4(a1),d0
	move.w	d0,$dff0a4	
	bra	chan2try
noloopie2:
	lea	empty(pc),a0
	move.l	a0,$dff0a0
	move.w	#2,$dff0a4

chan2try:
	lea	datas(pc),a0
	add.l	#32,a0
	lea	audch2(pc),a1
	cmp.b	#1,31(a0)
	bne	gel3
	move.b	#2,31(a0)
	bra	chan3try
gel3:
	cmp.b	#2,31(a0)
	bne	chan3try
	move.b	#3,31(a0)
	cmp.l	#$ffffffff,(a1)
	beq	noloopie3
	move.l	(a1),$dff0b0
	move.l	4(a1),d0
	move.w	d0,$dff0b4	
	bra	chan3try
noloopie3:
	lea	empty(pc),a0
	move.l	a0,$dff0b0
	move.w	#2,$dff0b4

chan3try:
	lea	datas(pc),a0
	add.l	#64,a0
	lea	audch3(pc),a1
	cmp.b	#1,31(a0)
	bne	gel4
	move.b	#2,31(a0)
	bra	chan4try
gel4:
	cmp.b	#2,31(a0)
	bne	chan4try
	move.b	#3,31(a0)
	cmp.l	#$ffffffff,(a1)
	beq	noloopie4
	move.l	(a1),$dff0c0
	move.l	4(a1),d0
	move.w	d0,$dff0c4	
	bra	chan4try
noloopie4:
	lea	empty(pc),a0
	move.l	a0,$dff0c0
	move.w	#2,$dff0c4

chan4try:
	lea	datas(pc),a0
	add.l	#96,a0
	lea	audch4(pc),a1
	cmp.b	#1,31(a0)
	bne	gel5
	move.b	#2,31(a0)
	bra	chan5try
gel5:
	cmp.b	#2,31(a0)
	bne	chan5try
	move.b	#3,31(a0)
	cmp.l	#$ffffffff,(a1)
	beq	noloopie5
	move.l	(a1),$dff0d0
	move.l	4(a1),d0
	move.w	d0,$dff0d4	
	bra	chan5try
noloopie5:
	lea	empty(pc),a0
	move.l	a0,$dff0d0
	move.w	#2,$dff0d4

chan5try:
	rts

notchangeflag:
	dc.l	0
audch1:
	dc.l	0,0
audch2:
	dc.l	0,0
audch3:
	dc.l	0,0
audch4:
	dc.l	0,0


effeweg:	dc.l	0
effeweg2:	dc.l	0

empty:
	dc.l	0,0
filters:
	lea	offsetter(pc),a0	;wvform
	add.l	-24(a0),a0
	lea	verloopje1(pc),a6
	add.l	(a6),a0
	neg.b	(a0)
	rts

mixforms:
	lea	offsetter(pc),a0	;mix1spd
	add.l	-20(a0),a0
	add.l	#36,a0
	move.l	(a0),d0
	cmp.l	#0,d0
	beq	nomix1

	lea	playmix1speed(pc),a6
	cmp.l	#0,(a6)
	bne	nomix2

	move.l	(a0),(a6)

	lea	offsetter(pc),a6	;mix1src1
	add.l	-20(a6),a6
	move.l	(a6),d0
	sub.l	#1,d0
	asl.l	#5,d0
	lea	offsetter(pc),a0	;wvform
	add.l	-24(a0),a0
	add.l	d0,a0

	lea	offsetter(pc),a6	;mix1source2
	add.l	-20(a6),a6
	add.l	#8,a6
	move.l	(a6),d0
	sub.l	#1,d0
	asl.l	#5,d0
	lea	offsetter(pc),a1	;wavef
	add.l	-24(a1),a1
	add.l	d0,a1

	lea	verloopje1(pc),a6
	add.l	#1,(a6)
	and.l	#31,(a6)

	lea	offsetter(pc),a6	;mix1d1
	add.l	-20(a6),a6
	add.l	#16,a6
	move.l	(a6),d0
	sub.l	#1,d0
	asl.l	#5,d0
	lea	offsetter(pc),a2	;wfor
	add.l	-24(a2),a2
	add.l	d0,a2

	lea	verloopje1(pc),a6
	move.l	(a6),d1
	move.l	#31,d0
mixendiehap1:
	clr.l	d2
	clr.l	d3
	move.b	0(a0,d0),d2
	add.b	#128,d2
	move.b	0(a1,d1),d3
	add.b	#128,d3
	add.w	d3,d2
	asr.w	#1,d2
	sub.b	#128,d2
	move.b	d2,0(a2,d0)
	sub.l	#1,d1
	and.l	#31,d1
	dbf	d0,mixendiehap1

nomix2:
	lea	playmix1speed(pc),a6	;mix1spd
	sub.l	#1,(a6)
nomix1:

	lea	offsetter(pc),a1	;mix2spd
	add.l	-20(a1),a1
	add.l	#40,a1
	move.l	(a1),d0
	cmp.l	#0,d0
	beq	nomix12

	lea	playmix2speed(pc),a2
	cmp.l	#0,(a2)
	bne	nomix22

	move.l	(a1),(a2)

	lea	offsetter(pc),a0	;mix2src1
	add.l	-20(a0),a0
	add.l	#4,a0
	move.l	(a0),d0
	sub.l	#1,d0
	asl.l	#5,d0
	lea	offsetter(pc),a0	;wavef
	add.l	-24(a0),a0
	add.l	d0,a0

	lea	offsetter(pc),a1	;mix2src2
	add.l	-20(a1),a1
	add.l	#12,a1
	move.l	(a1),d0
	sub.l	#1,d0
	asl.l	#5,d0
	lea	offsetter(pc),a1	;wavef
	add.l	-24(a1),a1
	add.l	d0,a1

	lea	verloopje2(pc),a6
	add.l	#1,(a6)
	and.l	#31,(a6)

	lea	offsetter(pc),a6	;mix2d
	add.l	-20(a6),a6
	add.l	#20,a6
	move.l	(a6),d0
	sub.l	#1,d0
	asl.l	#5,d0
	lea	offsetter(pc),a2	;wave
	add.l	-24(a2),a2
	add.l	d0,a2

	lea	verloopje2(pc),a6
	move.l	(a6),d1
	move.l	#31,d0
mixendiehap2:
	clr.l	d2
	clr.l	d3
	move.b	0(a0,d0),d2
	add.b	#128,d2
	move.b	0(a1,d1),d3
	add.b	#128,d3
	add.w	d3,d2
	asr.w	#1,d2
	sub.b	#128,d2
	move.b	d2,0(a2,d0)
	sub.l	#1,d1
	and.l	#31,d1
	dbf	d0,mixendiehap2

nomix22:
	lea	playmix2speed(pc),a6
	sub.l	#1,(a6)
nomix12:
	rts

playmix1speed:
	dc.l	0
playmix2speed:
	dc.l	0
verloopje1:
	dc.l	0
verloopje2:
	dc.l	0



tahi:		dc.b	$37	;39
talo:		dc.b	$81	;c0
icrbyte:	dc.l	0
int6vec:	dc.l	0
intena:		dc.w	0
dc.l	0

cmpcnt:		dc.l	0
bugflag:	dc.l	0
cmptext:
	dc.b	$ec,$ed,$d8,$cc,$e9,$de


audpoint:	dc.l	0
audper:		dc.l	0
audvol:		dc.l	0
audlen:		dc.l	0
intercount:	dc.l	0
intersongcount:	dc.l	0


datas:
	dc.l	0	;currentsong
	dc.l	0	;currentpattern
	dc.l	0	;currentinstrument
	dc.w	0	;curfreq
	dc.b	0	;end note
	dc.b	0	;bend speed
	dc.b	0	;last note
	dc.b	0	;arpeggiocount
	dc.b	0	;envelopecount
	dc.b	0	;notetimer
	dc.b	0	;last volumie
	dc.b	0	;sustaincount
	dc.w	0	;pitch-count
	dc.b	0	;phasetimer
	dc.b	0	;phase flipflop
	dc.w	0	;pitchfallcount
	dc.l	0
	blk.b	32*3,0


audiochannel1:
	dc.l	0		
audiochannel2:
	dc.l	0
audiochannel3:
	dc.l	0
audiochannel4:
	dc.l	0

frequencies:
dc.w 0000
dc.w 5760,5424,5120,4832,4560,4304,4064,3840,3616;oct1
dc.w 3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1808;oct2
dc.w 1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,0960,0904;oct3
dc.w 0856,0808,0762,0720,0678,0640,0604,0570,0538,0508,0480,0452;oct4
dc.w 0428,0404,0381,0360,0339,0320,0302,0285,0269,0254,0240,0226;oct5
dc.w 0214,0202,0190,0180,0170,0160,0151,0143,0135,0127		;oct6


***
dc.w 0,0,0,0,0,0,0
dc.w 4028,3806,3584,3394,3204,3013
dc.w 2855,2696,2538,2395,2268,2141,2014,1903,1792,1697,1602,1507
dc.w 1428,1348,1269,1198,1134,1071,1007,952,896,849,801,754,714
dc.w 674,635,599,567,536,504,476,448,425,401,377,357,337,310,300
dc.w 284,268,252,238,224,213,201,189,179,169,159,150,142,134


***

dc.w 0,0,0,0,0,0,0
dc.w 3993,3773,3552,3364,3175,2987,2830,2672,2515,2374,2248,2122
dc.w 1997,1887,1776,1682,1588,1494,1415,1336,1258,1187,1124,1061
dc.w 999,944,888,841,794,747,708,668,629,594,562,531,500,472,444
dc.w 421,397,374,354,334,315,297,281,266,250,236,222,211,199,187
dc.w 177,167,158,149,141,133


***

dc.w 0,0,0,0,0,0,0
dc.w 3957,3739,3521,3334,3147,2960,2804,2648,2493,2353,2228,2103
dc.w 1979,1870,1761,1667,1574,1480,1402,1324,1247,1177,1114,1052
dc.w 990,935,881,834,787,740,701,662,624,589,557,526,495,468,441
dc.w 417,394,370,351,331,312,295,279,263,248,234,221,209,197,185
dc.w 176,166,156,148,140,132


**

dc.w 0,0,0,0,0,0,0
dc.w 3921,3705,3489,3304,3119,2933,2779,2625,2470,2331,2208,2084
dc.w 1961,1853,1745,1652,1560,1467,1390,1313,1235,1166,1104,1042
dc.w 981,927,873,826,780,734,695,657,618,583,552,521,491,464,437
dc.w 413,390,367,348,329,309,292,276,261,246,232,219,207,195,184
dc.w 174,165,155,146,138,131


***

dc.w 0,0,0,0,0,0,0
dc.w 3886,3671,3457,3274,3090,2907,2754,2601,2448,2310,2188,2065
dc.w 1943,1836,1729,1637,1545,1454,1377,1301,1224,1155,1094,1033
dc.w 972,918,865,819,773,727,689,651,612,578,547,517,486,459,433
dc.w 410,387,364,345,326,306,289,274,259,243,230,217,205,194,182
dc.w 173,163,153,145,137,130


***

dc.w 0,0,0,0,0,0,0
dc.w 3851,3638,3426,3244,3062,2880,2729,2577,2426,2289,2168,2047
dc.w 1926,1819,1713,1622,1531,1440,1365,1289,1213,1145,1084,1024
dc.w 963,910,857,811,766,720,683,645,607,573,542,512,482,455,429
dc.w 406,383,360,342,323,304,287,271,256,241,228,215,203,192,180
dc.w 171,162,152,144,136,128





endofpatflag:
	dc.l	0
endofsongflag:
	dc.l	0
flipflap:
	dc.l	0
intflag:
	dc.l	0



dma:			;hehehe
	dc.l	0

haya:	dc.l	0

EVEN


************
begin:
	song1offset:		dc.l	0
	song2offset:		dc.l	0
	song3offset:		dc.l	0
	song4offset:		dc.l	0
	inst1offset:		dc.l	0
	waveform1offset:	dc.l	0
	variablesoffset:	dc.l	0
	wavelistoffset:		dc.l	0
	patroomoffset:		dc.l	0
	patpointersoffset:	dc.l	0
	samplestructoff:	dc.l	0
*
	offsetter:
*

