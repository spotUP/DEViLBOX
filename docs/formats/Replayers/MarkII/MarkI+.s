
test:	moveq	#0,d0		; #subsong
	lea	$70000,a0	; * mod    (load here)
	bsr	init
test_lp	move.l	$dff004,d0
	and.l	#$1ff00,d0
	cmp.l	#$e000,d0
	bne.s	test_lp
	move.w	#$f00,$dff180
	bsr	play
	move.w	#$000,$dff180
	btst	#6,$bfe001
	bne.s	test_lp
	bsr	stop
	rts

*********************************************************
*							*
*	Mark I - The Replay Routine			*
*	---------------------------			*
*							*
*	For tunes converted with 'Universal Ripper'!	*
*							*
*	Made by Vampire / PseudoDOS Group		*
*	(hard work!)					*
*							*
*********************************************************

; file-format description:
;
; header:	dc.b	"MRK1"
;		dc.w	0	; nr of subsongs
;		dc.l	0	; offset to first song
;		dc.l	0	; offset to patterns
;		dc.l	0	; offset to sampletable
;		dc.l	0	; offset to sampledata

patts	=	4
smptab	=	8
smpdata	=	12
sngptr1	=	16
sngptr2	=	20
posadr	=	30
L_134	=	38
VolCON	=	40
L_1e8	=	42
L_1f2	=	44
DMACON	=	46
lb	=	48
DMACON2	=	50
L_324	=	52

;d0 #song (0-x)
;a0 * mod

init:
	lea	$dff000,a6
	lea	V(pc),a4
	move.l	a4,a1
	move.l	a0,d1
	cmp.l	#"MRK1",(a0)+
	bne.s	init_x
	cmp.w	(a0)+,d0
	blt.s	ini
	moveq	#0,d0
ini	moveq	#3,d2
ini_lp1	move.l	(a0)+,(a1)
	add.l	d1,(a1)+
	dbf	d2,ini_lp1
	move.l	(a4),a0
ini_lp3	subq.w	#1,d0
	bmi.s	ssngOk
ini_lp2	cmp.w	#$ffff,(a0)+
	bne.s	ini_lp2
	bra.s	ini_lp3
ssngOk	move.l	a0,d0
	lea	sngptr1(a4),A0
	move.l	D0,(A0)+
	move.l	D0,(A0)+
	clr.l	(A0)+
	LEA	posadr(a4),A0
	MOVEM.L	(A0)+,A1-A2
	MOVE.W	#$F,$96(a6)
	clr.l	(a0)+
	move.w	#8,(a0)+
	move.w	#3,(a0)+
	move.w	#-$7df1,(a0)
	BSR.B	clrg
	BSR.W	L_230
	BRA.W	exitcont
init_x	rts

stop:	move.w	#$f,$dff096
	rts

play	lea	V(pc),a4
	lea	$dff000,a6
	LEA	posadr(a4),A0
	MOVEM.L	(A0),A1-A2
	BSR.B	tstplay
	CMPI.W	#$3F,L_134(a4)
	BNE.B	exitcont
	CMPI.W	#$3E,VolCON(A4)
	BEQ.B	exitstop
	ADDQ.W	#2,VolCON(A4)
exitcont
	MOVEQ	#4,D0
	MOVEQ	#0,D4
	BRA.B	exit
exitstop
	MOVEQ	#0,D0
	MOVE.W	#$F,$96(a6)
exit	LEA	L_134(a4),A0
	MOVEM.L	A1-A2,-(A0)
	RTS
clrg	MOVEQ	#0,D0
	MOVEQ	#0,D1
	MOVEQ	#0,D2
	MOVEQ	#0,D3
	MOVEQ	#0,D4
	RTS
tstplay	BSR.B	clrg
	tst.w	-(A0)
	BNE.B	playchans
	MOVE.W	#1,(A0)
	MOVE.W	DMACON2(a4),$96(a6)
	RTS
playchans
	CLR.W	(A0)
	ADDQ.L	#4,A2
	SUBA.W	L_1E8(a4),A1
	CMPI.B	#-1,(A2)
	BNE.B	L_23A
	move.l	patts(a4),A2	; get patterns pointer
	ADDA.W	L_1E8(a4),A1
	CMPI.B	#-1,(A1)
	BNE.B	L_23A
	MOVE.W	#1,-(A0)
	CMPI.W	#1,-(A0)
	BNE.B	L_230
	RTS
L_230	move.l	sngptr2(A4),A1
	move.l	patts(a4),A2	; nochmal
L_23A	MOVE.W	L_1F2(a4),D4
	LEA	DMACON2(a4),A0
	CLR.W	(A0)
	MOVE.W	#1,-(A0)
	LEA	$A0(a6),A3
setregs_lp
	MOVE.B	(A1)+,D0
	MOVE.B	(A1)+,D3
	MULU	#$62,D0
	MOVE.B	(A2,D0.L),D2
	MOVE.B	1(A2,D0.L),D1
	ASL.W	#3,D2
setlenadr
	move.l	smptab(a4),A0
	MOVE.W	6(A0,D2.L),d5
	MOVE.L	(A0,D2.L),D2
	move.l	smpdata(a4),A0
	ADDA.L	D2,A0
	MOVE.L	A0,(A3)+
	move.w	d5,(a3)+
	MOVEQ	#0,D2
	MOVE.W	D1,D2
	ADD.W	D3,D1
	add.w	d1,d1
	LEA	peris(pc),A0
	MOVE.W	(A0,D1.L),D1
	move.l	d2,d3
	MOVEQ	#0,D2
	BCLR	#7,D3
	BEQ.B	setper
	LEA	L_324(a4),A0
	MOVE.W	D4,D2
	add.w	d2,D2
	MOVE.W	(A0,D2.L),D2
	BTST	#7,3(A2,D0.L)
	BEQ.B	L_2AC
	ADD.W	D2,D3
	BRA.B	L_2B0
L_2AC	SUB.W	D3,D2
	EXG	D3,D2
L_2B0	MOVE.W	D3,D1
setper	LEA	L_324(a4),A0
	MOVE.W	D4,D2
	add.w	d2,D2
	MOVE.W	D1,(A0,D2.L)
	MOVE.W	D1,(A3)+
	MOVEQ	#0,D3
	MOVEQ	#0,D2
	MOVEQ	#0,D1
	MOVE.B	2(A2,D0.L),D2
	MOVE.B	3(A2,D0.L),D1
	MOVE.W	VolCON(a4),D0
	CMP.W	D0,D2
	BGT.B	fadesub
	moveq	#1,D2
	BRA.B	setvol
fadesub	SUB.W	D0,D2
setvol	MOVE.W	d2,(A3)+
	addq.l	#6,a3
	LEA	lb(a4),A0
	move.w	(a0)+,d0
	BTST	#0,D1
	BNE.B	L_2FA
	ADD.W	D0,(A0)
L_2FA	add.w	d0,D0
	MOVE.W	D0,-(A0)
	DBRA	D4,setregs_lp
	MOVE.W	DMACON(a4),$96(a6)
	RTS	
	dc.b	"MarkI Player - Coded by Vampire!"
peris	dc.w	$05A0,$054C,$0500,$04B8,$0474,$0434
	dc.w	$03F8,$03C0,$038A,$0358,$0328,$02FA
	dc.w	$02D0,$02A6,$0280,$025C,$023A,$021A
	dc.w	$01FC,$01E0,$01C5,$01AC,$0194,$017D
	dc.w	$0168,$0153,$0140,$012E,$011D,$010D
	dc.w	$00FE,$00F0,$00E2,$00D6,$00CA,$00BE
	dc.w	$00B4,$00AA,$00A0,$0097,$008F,$0087
	dc.w	$007F,$0000,$5073,$6575,$646f,$444f
	dc.w	$5320,$4772,$6f75,$7020,$544d,$0000
V:	blk.b	60,0
	END

