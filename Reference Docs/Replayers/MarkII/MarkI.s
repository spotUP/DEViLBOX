
test:	moveq	#2,d0		; #subsong
	lea	$70000,a0	; * mod    (load here)
	bsr	init
test_lp	move.l	$dff004,d0
	and.l	#$1ff00,d0
	cmp.l	#$8000,d0
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

;d0 #song (0-x)
;a0 * mod

init:
	lea	$dff000,a6
	lea	V(pc),a4
	lea	songs-V(a4),a1
	move.l	a0,d1
	cmp.l	#"MRK1",(a0)+
	bne.s	init_x
	cmp.w	(a0)+,d0
	bge.s	init_x
	moveq	#3,d2
ini_lp1	move.l	(a0)+,(a1)
	add.l	d1,(a1)+
	dbf	d2,ini_lp1
	move.l	songs-V(a4),a0
ini_lp3	subq.w	#1,d0
	bmi.s	ssngOk
ini_lp2	cmp.w	#$ffff,(a0)+
	bne.s	ini_lp2
	bra.s	ini_lp3
ssngOk	move.l	a0,(a1)+
	move.l	a0,d0
	lea	sngptr1-V(a4),A0
	move.l	D0,(A0)+
	move.l	D0,(A0)+
	clr.l	(A0)+
	MOVEM.L	A0-A3,-(A7)
	LEA	posadr-V(a4),A0
	MOVEM.L	(A0)+,A1-A2
	MOVE.W	#$F,$96(a6)
	CLR.l	L_134-V(A4)
	CLR.W	VolCon-V(A4)
	move.w	#8,L_1E8-V(a4)
	move.w	#3,L_1F2-V(a4)
	move.w	#-$7df1,DMACON-V(a4)
	BSR.B	clrd0d1d2d3d4
	BSR.W	L_230
	BRA.W	exitcont
init_x	rts

stop:	move.w	#$f,$dff096
	rts

play	lea	V(pc),a4
	lea	$dff000,a6
	MOVEM.L	A0-A3,-(A7)
	LEA	posadr-V(a4),A0
	MOVEM.L	(A0)+,A1-A2
	BSR.W	L_1CC
	MOVE.W	L_134-V(a4),D0
	CMPI.W	#$003F,D0
	BNE.B	exitcont
	LEA	VolCON-V(a4),A0
	CMPI.W	#$003E,(A0)
	BEQ.B	exitstop
	ADDQ.W	#2,(A0)
exitcont
	MOVEQ	#4,D0
	MOVEQ	#0,D4
	BRA.W	exit
exitstop
	MOVEQ	#0,D0
	MOVE.W	#$F,$96(a6)
exit	LEA	lb(PC),A0
	MOVEM.L	A1-A2,-(A0)
	MOVEM.L	(A7)+,A0-A3
	RTS
clrd0d1d2d3d4	MOVEQ	#0,D0
		MOVEQ	#0,D1
		MOVEQ	#0,D2
		MOVEQ	#0,D3
		MOVEQ	#0,D4
		RTS	
L_1CC		BSR.B	clrd0d1d2d3d4
		LEA	L_322(PC),A0
		tst.w	(A0)
		BNE.B	playchans
		MOVE.W	#1,(A0)
		MOVE.W	DMACON2(PC),D0
		MOVE.W	D0,$00DFF096.L
		RTS	
playchans	CLR.W	(A0)
		ADDQ.W	#4,A2
		SUBA.W	L_1E8(PC),A1
		CMPI.B	#-1,(A2)
		BNE.B	L_23A
		move.l	patts(PC),A2	; get patterns pointer
		ADDA.W	L_1E8(PC),A1
		CMPI.B	#-1,(A1)
		BNE.B	L_23A
		LEA	L_1F8(PC),A0
		MOVE.W	#1,(A0)
		LEA	L_1F6(PC),A0
		CMPI.W	#1,(A0)
		BNE.B	L_230
		RTS	
L_230		LEA	sngptr2(PC),A1
		MOVEA.L	(A1),A1
		move.l	patts(PC),A2	; nochmal
L_23A		MOVE.W	L_1F2(PC),D4
		LEA	DMACON2(PC),A0
		CLR.W	(A0)
		MOVE.W	#1,-(A0)
		LEA	$DFF0A0,A3
setregs_lp	MOVE.B	(A1)+,D0
		MOVE.B	(A1)+,D3
		MULU	#$62,D0
		MOVE.B	(A2,D0.L),D2
		MOVE.B	1(A2,D0.L),D1
		ASL.W	#3,D2
setlenadr	move.l	smptab(PC),A0
		MOVE.W	6(A0,D2.L),4(A3)
		MOVE.L	(A0,D2.L),D2
		move.l	smpdata(PC),A0
		ADDA.L	D2,A0
		MOVE.L	A0,(A3)
		MOVEQ	#0,D2
		MOVE.W	D1,D2
		ADD.W	D3,D1
		add.w	d1,d1
		LEA	peris(PC),A0
		MOVE.W	(A0,D1.L),D1
		move.l	d2,d3
		MOVEQ	#0,D2
		BCLR	#7,D3
		BEQ.B	setper
		LEA	L_324(PC),A0
		MOVE.W	D4,D2
		add.w	d2,D2
		MOVE.W	(A0,D2.L),D2
		BTST	#7,3(A2,D0.L)
		BEQ.B	L_2AC
		ADD.W	D2,D3
		BRA.B	L_2B0
L_2AC		SUB.W	D3,D2
		EXG	D3,D2
L_2B0		MOVE.W	D3,D1
setper		LEA	L_324(PC),A0
		MOVE.W	D4,D2
		add.w	d2,D2
		MOVE.W	D1,(A0,D2.L)
		MOVE.W	D1,6(A3)
		MOVEQ	#0,D3
		MOVEQ	#0,D2
		MOVEQ	#0,D1
		MOVE.B	2(A2,D0.L),D2
		MOVE.B	3(A2,D0.L),D1
		MOVE.W	VolCON(PC),D0
		CMP.W	D0,D2
		BGT.B	fadesub
		moveq	#1,D2
		BRA.B	setvol
fadesub		SUB.W	D0,D2
setvol		MOVE.W	d2,8(A3)
		lea	$10(a3),A3
		MOVE.W	lb(PC),D0
		LEA	DMACON2(PC),A0
		BTST	#0,D1
		BNE.B	L_2FA
		ADD.W	D0,(A0)
L_2FA		add.w	d0,D0
		MOVE.W	D0,-(A0)
		DBRA	D4,setregs_lp
		MOVE.W	DMACON(PC),$DFF096
		LEA	$DFF0A0,A3
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
songs	dc.l	0
patts	dc.l	0
smptab	dc.l	0
smpdata	dc.l	0
ssngptr	dc.l	0
V:
L_1E8	DC.W	0
sngptr1	DC.L	0
sngptr2	DC.L	0
L_1F6	DC.W	0
L_1F8	dc.w	0
L_1F2	DC.W	0
DMACON	DC.W	0
posadr	DC.L	0,0
lb	DC.W	0
DMACON2	DC.W	0
L_322	DC.W	0
L_324	DC.L	0,0
L_134	dc.w	0
VolCON	dc.w	0,0
	END
