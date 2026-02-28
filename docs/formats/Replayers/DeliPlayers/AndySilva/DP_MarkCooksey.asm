**
** DeliTracker Player for (see below)
**
	incdir	"Include:"
	include	"silva/easy.i"
	include	"misc/DeliPlayer.i"

	PLAYERHEADER PlayerTagArray

PlayerTagArray
	dl	DTP_PlayerVersion,1
	dl	DTP_PlayerName,Name
	dl	DTP_Creator,Comment

	dl	DTP_Check2,Checky
	dl	DTP_InitPlayer,InitPly
	dl	DTP_InitSound,Init
	dl	DTP_Interrupt,Play
	dl	DTP_EndSound,_Stop
	dl	DTP_EndPlayer,EndPly

	dl	DTP_NextSong,NextSong
	dl	DTP_PrevSong,PrevSong

	dl	TAG_DONE

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Name	db	"MarkCooksey",0
Comment	db	"Mark Cooksey,",10
	db	"adapted by Andy Silva",0

	db	'$VER: a player for the famous DeliTracker',0
	even

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Checky:
	moveq	#-1,d0
	move.l	dtg_ChkData(a5),a0
	cmp.b	#$60,(a0)
	bne.b	c_rts
	move.l	dtg_ChkSize(a5),d1
	move.l	2(a0),d2
	clr.b	d1
	clr.b	d2
	cmp.l	d1,d2
	bne.b	c_rts
	tst.b	$20(a0)
	bne.b	c_rts
	lea	$1c(a0),a0
	move.l	a0,data
	moveq	#0,d0
c_rts	rts

****

InitPly
	clr.w	songnr
	move.l	(dtg_AudioAlloc,a5),a0
	jsr	(a0)
	tst.l	d0
	rts

EndPly	move.l	(dtg_AudioFree,a5),a0	; free audio channels
	jsr	(a0)
	rts

****

data	dc.l	0
songnr	dc.w	0
songs	dc.w	0
allow	dc.w	0

Init:
	pushm	d1-a6
	clr.w	allow
	move.l	data(pc),a0
	move.l	8(a0),d0
	subq.l	#8,d0
	lsr.w	#4,d0
	subq.w	#1,d0
	move.w	d0,songs
	move.w	songnr(pc),d0
	bsr	_init
	move.w	#1,allow
	popm	d1-a6
	rts

Play:
	pushm	d1-a6
	tst.w	allow
	beq.b	p_rts
	bsr	_play
p_rts	popm	d1-a6
	rts

NextSong:
	addq.w	#1,songnr
	move.w	songnr(pc),d0
	cmp.w	songs(pc),d0
	ble.b	Init
	clr.w	songnr
	bra.b	Init
PrevSong:
	subq.w	#1,songnr
	bge.b	Init
	move.w	songs(pc),songnr
	bra.b	Init

* Mark Cooksey's first crunched-tracker-replay
* ripped from the game 'Live And Let Die (Bond)' by ANDY SILVA

_init	MOVEM.L	D0/A0-A3,-(A7)
	ASL.W	#4,D0
	LEA	L_154(PC),A1
	MOVEA.L	A0,A2
	ADDA.L	(A0),A2
	MOVE.L	A2,(A1)+
	MOVEA.L	A0,A2
	ADDA.L	4(A0),A2
	MOVE.L	A2,(A1)
	LEA	8(A0,D0.W),A3
	LEA	L_4C(PC),A1
	MOVE.W	#1,0(A1)
	MOVEA.L	A0,A2
	ADDA.L	(A3)+,A2
	MOVE.L	A2,2(A1)
	LEA	$0042(A1),A2
	MOVE.L	A2,$0016(A1)
	LEA	L_500(PC),A2
	MOVE.L	A2,$000E(A1)
	MOVE.W	#1,6(A1)
	MOVE.W	#$0080,8(A1)
	LEA	$0042(A1),A1
	MOVE.W	#1,0(A1)
	MOVEA.L	A0,A2
	ADDA.L	(A3)+,A2
	MOVE.L	A2,2(A1)
	LEA	$0042(A1),A2
	MOVE.L	A2,$0016(A1)
	LEA	L_500(PC),A2
	MOVE.L	A2,$000E(A1)
	MOVE.W	#2,6(A1)
	MOVE.W	#$0100,8(A1)
	LEA	$0042(A1),A1
	MOVE.W	#1,0(A1)
	MOVEA.L	A0,A2
	ADDA.L	(A3)+,A2
	MOVE.L	A2,2(A1)
	LEA	$0042(A1),A2
	MOVE.L	A2,$0016(A1)
	LEA	L_500(PC),A2
	MOVE.L	A2,$000E(A1)
	MOVE.W	#4,6(A1)
	MOVE.W	#$0200,8(A1)
	LEA	$0042(A1),A1
	MOVE.W	#1,0(A1)
	MOVEA.L	A0,A2
	ADDA.L	(A3)+,A2
	MOVE.L	A2,2(A1)
	LEA	$0042(A1),A2
	MOVE.L	A2,$0016(A1)
	LEA	L_500(PC),A2
	MOVE.L	A2,$000E(A1)
	MOVE.W	#8,6(A1)
	MOVE.W	#$0400,8(A1)
	LEA	L_15C(PC),A0
	MOVE.W	#$000F,(A0)
*	MOVE.W	#$00FF,$00DFF09E.L
	MOVEM.L	(A7)+,D0/A0-A3
	RTS	

_stop	MOVEM.L	D0/A0-A1,-(A7)
	MOVEQ	#3,D0
	LEA	L_4C(PC),A0
	LEA	$00DFF000.L,A1
L_258	MOVE.W	6(A0),$0096(A1)
	MOVE.W	#-1,0(A0)
	LEA	$0042(A0),A0
	DBRA	D0,L_258
	LEA	L_15C(PC),A0
	CLR.W	(A0)
	MOVEM.L	(A7)+,D0/A0-A1
	RTS

_play	MOVEM.L	D4/A0/A2-A5,-(A7)
	LEA	$00DFF000.L,A0
	LEA	L_4C(PC),A2
	LEA	$00A0(A0),A5
	BSR.W	L_2BE
	LEA	$0042(A2),A2
	LEA	$0010(A5),A5
	BSR.W	L_2BE
	LEA	$0042(A2),A2
	LEA	$0010(A5),A5
	BSR.W	L_2BE
	LEA	$0042(A2),A2
	LEA	$0010(A5),A5
	BSR.W	L_2BE
	MOVEM.L	(A7)+,D4/A0/A2-A5
	RTS	

L_2BE	TST.W	0(A2)
	BMI.W	L_4D6
	SUBQ.W	#1,0(A2)
	BNE.W	L_4D6
	MOVEA.L	2(A2),A3
L_2D2	CLR.W	D4
	MOVE.B	(A3)+,D4
	JMP	L_2DA(PC,D4.W)

L_2DA	BRA.W	L_312
	BRA.W	L_3E6
	BRA.W	L_3D2
	BRA.W	L_400
	BRA.W	L_3B4
	BRA.W	L_3C0
	BRA.W	L_4B8
	BRA.W	L_414
	BRA.W	L_4A2
	BRA.W	L_45A
	BRA.W	L_46E
	BRA.W	L_42E
	BRA.W	L_48A
	BRA.W	L_498

L_312	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	MOVEA.L	$000E(A2),A4
	MOVE.W	(A4,D4.W),-(A7)
	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	MOVE.W	D4,0(A2)
	MOVE.W	2(A0),D4
	AND.W	6(A2),D4
	BEQ.B	L_368
	MOVE.W	8(A2),$009C(A0)
	MOVE.W	6(A2),$0096(A0)
	MOVE.W	#2,6(A5)
	MOVE.W	#0,8(A5)
L_348	MOVE.W	$001E(A0),D4
	AND.W	8(A2),D4
	BEQ.B	L_348
	MOVE.W	8(A2),$009C(A0)
	MOVE.W	#0,$000A(A5)
L_35E	MOVE.W	$001E(A0),D4
	AND.W	8(A2),D4
	BEQ.B	L_35E
L_368	MOVEA.L	$000A(A2),A4
	MOVE.W	(A4)+,D4
	MOVE.L	A4,0(A5)
	MOVE.W	D4,4(A5)
	MOVE.W	$0012(A2),8(A5)
	MOVE.W	(A7)+,6(A5)
	MOVE.W	6(A2),D4
	ORI.W	#-$8000,D4
	MOVE.W	D4,$0096(A0)
	MOVE.W	8(A2),$009C(A0)
L_392	MOVE.W	$001E(A0),D4
	AND.W	8(A2),D4
	BEQ.B	L_392
	MOVE.W	8(A2),$009C(A0)
	LEA	L_4D8,A4
	MOVE.L	A4,0(A5)
	MOVE.W	#2,4(A5)
	BRA.W	L_4D2

L_3B4	MOVE.B	(A3)+,D4
	EXT.W	D4
	MOVE.W	D4,0(A2)
	BRA.W	L_4D2

L_3C0	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	MOVE.W	D4,0(A2)
	MOVE.W	6(A2),$0096(A0)
	BRA.W	L_4D2

L_3D2	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	MOVEA.L	L_158(PC),A4
	ADDA.L	(A4,D4.W),A4
	MOVE.L	A4,$000A(A2)
	BRA.W	L_2D2

L_3E6	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	MOVEA.L	$000E(A2),A4
	ADDA.W	D4,A4
	MOVE.L	(A4),6(A5)
	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	MOVE.W	D4,0(A2)
	BRA.W	L_4D2

L_400	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	ADD.W	D4,D4
	ADD.W	D4,D4
	MOVE.W	D4,8(A5)
	MOVE.W	D4,$0012(A2)
	BRA.W	L_2D2

L_414	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	MOVEA.L	$0016(A2),A4
	MOVE.L	A3,-(A4)
	MOVE.L	A4,$0016(A2)
	MOVEA.L	L_154(PC),A3
	ADDA.W	(A3,D4.W),A3
	BRA.W	L_2D2

L_42E	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	SWAP	D4
	MOVE.B	(A3)+,D4
	MOVEA.L	$0016(A2),A4
	MOVE.L	A3,-(A4)
	MOVE.L	A4,$0016(A2)
	MOVEA.L	L_154(PC),A3
	ADDA.W	(A3,D4.W),A3
	LEA	L_500(PC),A4
	SWAP	D4
	EXT.W	D4
	ADDA.W	D4,A4
	MOVE.L	A4,$000E(A2)
	BRA.W	L_2D2

L_45A	MOVEQ	#0,D4
	MOVE.B	(A3)+,D4
	MOVEA.L	$0016(A2),A4
	MOVE.L	A3,-(A4)
	MOVE.W	D4,-(A4)
	MOVE.L	A4,$0016(A2)
	BRA.W	L_2D2

L_46E	MOVEA.L	$0016(A2),A4
	SUBQ.W	#1,(A4)
	BEQ.B	L_47E
	MOVEA.L	2(A4),A3
	BRA.W	L_2D2

L_47E	LEA	6(A4),A4
	MOVE.L	A4,$0016(A2)
	BRA.W	L_2D2

L_48A	MOVEA.L	$0016(A2),A4
	MOVE.L	A3,-(A4)
	MOVE.L	A4,$0016(A2)
	BRA.W	L_2D2

L_498	MOVEA.L	$0016(A2),A4
	MOVEA.L	(A4),A3
	BRA.W	L_2D2

L_4A2	MOVEA.L	$0016(A2),A4
	MOVEA.L	(A4)+,A3
	MOVE.L	A4,$0016(A2)
	LEA	L_500(PC),A4
	MOVE.L	A4,$000E(A2)
	BRA.W	L_2D2

L_4B8	MOVEQ	#-1,D4
	MOVE.W	D4,0(A2)
	MOVE.W	6(A2),D4
	MOVE.W	D4,$0096(A0)
	MOVE.L	A0,-(A7)
	LEA	L_15C(PC),A0
	NOT.W	D4
	AND.W	D4,(A0)
	MOVEA.L	(A7)+,A0
L_4D2	MOVE.L	A3,2(A2)
L_4D6	RTS	

	DC.L	$3580328
L_500	DC.L	$2FA02D0,$2A60280,$25C023A,$21A01FC,$1E001C5,$1AC0194
	DC.L	$17D0168,$1530140,$12E011D,$10D00FE,$F000E2,$D600CA
	DC.L	$BE00B4,$A900A0,$97008E,$86007F,$780071,$6B0065,$5F005A

L_4C	DC.L	$260000
	DC.L	-$3ADBFFFF
	DC.L	$800000
	DC.L	-$2CAC0000
	DC.L	$15000014
	DC.L	0
	DC.L	$10860000
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	-$3E1B0000
	DC.L	-$3E22FFDA
	DC.L	$C683
	DC.L	$20100
	DC.L	$D354
	DC.L	$1500
	DC.L	$140000
	DC.L	$10C8
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	$C251
	DC.L	$C249
	DC.L	$80000
	DC.L	-$3867FFFC
	DC.L	$2000001
	DC.L	$4E680000
	DC.L	$1500001C
	DC.L	0
	DC.L	$11040000
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	$10000
	DC.L	-$386B0000
	DC.L	-$3D430000
	DC.L	-$3D4AFFFE
	DC.L	$C9B7
	DC.L	$80400
	DC.L	$19C2A
	DC.L	$1500
	DC.L	$300000
	DC.L	$114C
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	0
	DC.L	$C97F
	DC.L	$C327
	DC.L	$C31F
L_154	DC.L	$C49A
L_158	DC.L	$D330
L_15C	DC.W	$F

	section	"Nothing",data_C

L_4D8	blk.l	6,0

	END

