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

	dl	TAG_DONE

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Name	db	"SUN T R O N I C",0
Comment	db	"Felix Schmidt & Holger Benl,",10
	db	"adapted by Andy Silva",0

	db	'$VER: a player for the famous DeliTracker',0
	even

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Checky:
	pushm	d1-d6
*	moveq	#-1,d0
	move.l	dtg_ChkData(a5),a0
	move.l	dtg_ChkSize(a5),d7
	lsr.l	#1,d7
	bsr	Reloc
*	moveq	#0,d0
	popm	d1-d6
	rts

****

InitPly
	lea	tab(pc),a0
	lea	tabA(pc),a1
	move.l	(a1)+,(a0)+
	move.l	(a1)+,(a0)+
	move.l	(a1)+,(a0)+
	move.l	(a1)+,(a0)+
	move.l	(a1)+,(a0)+
	bsr	_Init
	move.l	(dtg_AudioAlloc,a5),a0
	jsr	(a0)
	tst.l	d0
	rts

EndPly	move.l	(dtg_AudioFree,a5),a0	; free audio channels
	jsr	(a0)
	bsr	_CleanUp
	rts

****

allow	dc.w	0

Init:
	pushm	d1-a6
	clr.w	allow
	bsr	_Start
	move.w	#1,allow
	popm	d1-a6
	rts

Play:
	pushm	d1-a6
	tst.w	allow
	beq.b	p_rts
	bsr	_Play
p_rts	popm	d1-a6
	rts


_init		
		push	a6
		MOVEA.L	4.w,A6
		MOVE.L	#$000004C0,D0
		MOVEQ	#3,D1
		JSR	-$00C6(A6)
		MOVE.L	D0,VOICEDATA_ADR
		moveq	#0,d0
		pop	a6
		rts

_Start		push	a6
		MOVEA.L	VOICEDATA_ADR(pc),A0
		MOVE.W	#$012F,D0
s_lp		CLR.L	(A0)+
		DBRA	D0,s_lp
		MOVEA.L	VOICEDATA_ADR(pc),A0
		move.l	patt(pc),A1
		MOVE.W	#3,D0
s_lp1		MOVE.L	(A1)+,(A0)
		MOVE.B	#-1,$0014(A0)
		lea	$68(a0),a0
		tst.w	mode
		bne.b	s_3
		lea	$130-$68(a0),A0
s_3		DBRA	D0,s_lp1
		MOVEA.L	VOICEDATA_ADR(pc),A0
		MOVE.W	#3,D0
s_lp2		MOVE.B	(A1)+,d1
		tst.w	mode
		beq.b	s_1
		move.b	d1,$66(a0)
		bra.b	s_2
s_1		move.b	d1,$012E(A0)
s_2		lea	$68(a0),a0
		tst.w	mode
		bne.b	s_4
		lea	$130-$68(a0),A0
s_4		DBRA	D0,s_lp2
		lea	DATA(pc),a0
		MOVE.l	#$05ff0600,(a0)
		clr.w	pattnr(a0)
		pop	a6
		rts

_CleanUp	push	a6
		MOVEA.L	4.w,A6
		MOVEA.L	VOICEDATA_ADR(pc),A1
		MOVE.L	#$000004C0,D0
		JSR	-$00D2(A6)
		pop	a6
		rts

_Stop		MOVE.W	#$F,$00DFF096.L
		RTS

**

Reloc:
	lea	TabA(pc),a3
	clr.l	(a3)+
	clr.l	(a3)+
	clr.l	(a3)+
	clr.l	(a3)+
	clr.l	(a3)+
	sub.l	a3,a3
i_lp	cmp.l	#$00dff058,(a0)
	beq.b	i_1.1
	cmp.l	#$48e7fffe,(a0)	; Play, DATA
	bne.b	i_2
i_1.1	cmp.w	#$4dfa,4(a0)
	bne	i_lp_c
	cmp.l	#$4a2e0010,8(a0)
	beq.b	i_1.a
	cmp.l	#$4a2e0018,8(a0)
	beq.b	i_1.2
	cmp.w	#$6100,8(a0)
	beq.b	i_1.2
i_err	moveq	#-1,d0
	rts
i_1.a	move.w	#1,modeA
i_1.2	move.w	6(a0),d0
	btst	#0,d0
	bne.b	i_err
	lea	6(a0,d0.w),a3
	cmp.l	#"dos.",(a3)
	bne.b	i_err
	bra	i_lp_c	
i_2	cmp.w	#$526e,(a0)	; patt
	bne.b	i_3
	cmp.w	#$43ee,4(a0)
	bne.b	i_lp_c

*	bra	i_3

	move.w	6(a0),d0
	lea	(a3,d0.w),a1
	move.l	a1,pattA
	bra.b	i_lp_c
i_3	cmp.w	#$45ee,(a0)	; drin
	bne.b	i_4
	cmp.w	#$47ee,4(a0)
	bne.b	i_lp_c

*	bra	i_4

	move.w	6(a0),d0
	lea	(a3,d0.w),a1
	move.l	a1,drinA
	bra.b	i_lp_c
i_4	cmp.w	#$0400,(a0)	; tab
	bne.b	i_5
	cmp.w	#$45ee,-4(a0)
	bne.b	i_lp_c

*	bra	i_5

	move.w	-2(a0),d0
	lea	(a3,d0.w),a1
	move.l	a1,tabA
	move.w	10(a0),dxA
	bra.b	i_lp_c
i_5	cmp.l	#$530045ee,(a0)	; inst2
	bne.b	i_lp_c

*	bra	i_lp_c

	move.w	4(a0),d0
	lea	(a3,d0.w),a1
	move.l	a1,inst2A
i_lp_c	addq.l	#2,a0
	dbf	d7,i_lp

*	bra	i_err

	move.w	dxA(pc),d1
	beq	i_err
	move.l	pattA(pc),a1
i_10_lp	lea	20(a1),a1
	tst.l	(a1)
	bne.b	i_10_lp

	tst.l	taba
	beq	i_err
	tst.l	inst2a
	beq	i_err
	tst.l	drina
	beq	i_err
	tst.w	dxa
	beq	i_err
	tst.w	patta
	beq	i_err

*	moveq	#0,d0
*	rts

	addq.l	#4,a1
	move.l	tabA(pc),a0	; kleinstes suchen
	move.l	inst2A(pc),a2
	move.l	8(a0),d0
i_13_lp	lea	(a0,d1.w),a0
	cmp.l	a0,a2
	beq.b	i_14
	cmp.l	8(a0),d0
	ble.b	i_13
	move.l	8(a0),d0
i_13	bra.b	i_13_lp
i_14	sub.l	d0,a1
	move.l	a1,d0
	move.l	pattA(pc),a0
i_11_lp	add.l	d0,(a0)
	add.l	d0,4(a0)
	add.l	d0,8(a0)
	add.l	d0,$c(a0)
	lea	20(a0),a0
	tst.l	(a0)
	bne.b	i_11_lp
	move.l	tabA(pc),a0
	move.l	inst2A(pc),a1
i_12_lp	add.l	d0,(a0)
	add.l	d0,8(a0)
	add.l	d0,18(a0)
	add.l	d0,26(a0)
	tst.l	30(a0)
	beq.b	i_12.1
	add.l	d0,30(a0)
i_12.1	lea	(a0,d1.w),a0
	cmp.l	a0,a1
	bne.b	i_12_lp
	moveq	#0,d0
	rts

flg1	= 0
flg2	= 1
flg3	= 2
flg4	= 3
pattnr	= 4
voia	= 6
rndnum	= 10
*il	=
*ia	=

****************************************
* new version of the suntronic-routine *

_PLAY		tst.w	mode
		bne	_PLAYa		; on mode goto old replay
		MOVEM.L	D0-A6,-(A7)
		LEA	DATA(PC),A6
		BSR.W	PLAYOLD_1
		ADDQ.B	#1,(A6)
		MOVE.B	(A6),D0
		CMP.B	flg3(A6),D0
		BNE.W	ONLY_EFFECTS
		CLR.B	(A6)
		ADDQ.B	#1,flg2(A6)
		CMPI.B	#$0010,flg2(A6)
		BNE.B	NEXTNOTE
		CLR.B	flg2(A6)
		ADDQ.W	#1,pattnr(A6)
		move.l	patt(pc),A1	; patterns
RESTART2	CLR.L	D0
		MOVE.W	pattnr(A6),D0
		MULU	#$0014,D0
		TST.L	(A1,D0.W)
		BNE.B	NORESTART
		CLR.W	pattnr(A6)
		BRA.B	RESTART2

NORESTART	MOVE.L	VOICEDATA_ADR(pc),A0
		MOVE.L	(A1,D0.W),(A0)
		MOVE.L	4(A1,D0.W),$0130(A0)
		MOVE.L	8(A1,D0.W),$0260(A0)
		MOVE.L	$000C(A1,D0.W),$0390(A0)
		MOVE.B	$0010(A1,D0.W),$012E(A0)
		MOVE.B	$0011(A1,D0.W),$025E(A0)
		MOVE.B	$0012(A1,D0.W),$038E(A0)
		MOVE.B	$0013(A1,D0.W),$04BE(A0)
NEXTNOTE	MOVE.L	VOICEDATA_ADR(pc),A0
		MOVE.W	#3,D7
NN1		BSR.W	GETNEXTNOTE
		BSR.W	EFFECTS
		ADDA.L	#$00000130,A0
		DBRA	D7,NN1
		BRA.B	END_OF_PLAY

ONLY_EFFECTS	MOVE.L	VOICEDATA_ADR(pc),A0
		MOVE.W	#3,D7
OE1		BSR.W	EFFECTS
		ADDA.L	#$00000130,A0
		DBRA	D7,OE1
END_OF_PLAY	BSR.W	PLAYOLD_2
		BSR.W	MEGAEFFECTS
		MOVEM.L	(A7)+,D0-A6
		RTS	

PLAYOLD_1	MOVE.L	VOICEDATA_ADR(pc),A0
		CLR.W	D6
		TST.W	$001E(A0)
		BEQ.B	PO2
		BSET	#0,D6
PO2		TST.W	$014E(A0)
		BEQ.B	PO3
		BSET	#1,D6
PO3		TST.W	$027E(A0)
		BEQ.B	PO4
		BSET	#2,D6
PO4		TST.W	$03AE(A0)
		BEQ.B	PO5
		BSET	#3,D6
PO5		MOVE.W	D6,$00DFF096.L
		LEA	$00DFF0A0.L,A1
		MOVE.L	VOICEDATA_ADR(pc),A0
		MOVE.W	#3,D7
PO6		MOVE.B	$0015(A0),9(A1)
		MOVE.W	$0020(A0),6(A1)
		TST.W	$001E(A0)
		BEQ.B	SR1
		MOVE.L	$0016(A0),(A1)
		MOVE.W	$001A(A0),4(A1)
SR1		MOVE.L	$0016(A0),$0126(A0)
		MOVE.L	$001C(A0),$012A(A0)
		ADDA.L	#$00000130,A0
		ADDA.L	#$00000010,A1
		DBRA	D7,PO6
		MOVE.B	D6,flg4(A6)
		RTS	

PLAYOLD_2	MOVE.W	#$0010,D0
PO7		DBRA	D0,PO7
		CLR.W	D6
		MOVE.B	flg4(A6),D6
		ADDI.W	#-$8000,D6
		MOVE.W	D6,$00DFF096.L
		MOVEA.L	voia(A6),A0
		LEA	$00DFF0A0.L,A1
		MOVE.W	#3,D7
PO8		TST.W	$012C(A0)
		BEQ.B	SR4
		CLR.L	D1
		MOVE.W	$012A(A0),D1
		LSL.L	#1,D1
		MOVEA.L	$0126(A0),A2
		ADDA.L	D1,A2
		MOVE.L	A2,(A1)
		MOVE.W	$012C(A0),4(A1)
		CLR.W	$001E(A0)
SR4		ADDA.L	#$00000130,A0
		ADDA.L	#$00000010,A1
		DBRA	D7,PO8
		MOVE.W	#3,D7
		MOVEA.L	voia(A6),A0
POX		TST.B	$0014(A0)
		BEQ.W	POX2
		MOVEA.L	4(A0),A1
		CLR.W	D0
		MOVE.B	$0022(A1),D0
		LSR.B	#1,D0
		BEQ.W	POX4
		SUBQ.B	#1,D0
POX4		LEA	$0026(A0),A1
POX3		MOVE.L	$0080(A1),(A1)+
		DBRA	D0,POX3
POX2		ADDA.L	#$00000130,A0
		DBRA	D7,POX
		RTS	

EFFECTS		TST.B	$0014(A0)
		BMI.W	EFF5
		MOVEA.L	4(A0),A1
		MOVEA.L	(A1),A2
		MOVE.W	$0010(A0),D0
		CLR.W	D1
		MOVE.B	(A2,D0.W),D1
		CLR.L	D2
		MOVE.B	$000C(A0),D2
		MULU	D2,D1
		LSR.W	#7,D1
		MOVE.B	D1,$0015(A0)
		LEA	PERIODS(pc),A2	; periods
		move.l	drin(pc),A3	; drin
		CLR.L	D5
		MOVE.B	$000E(A0),D5
		LSL.W	#4,D5
		CLR.L	D6
		MOVE.B	$000F(A0),D6
		ADD.W	D6,D5
		MOVE.W	8(A0),D0
		MOVEA.L	8(A1),A4
		MOVE.W	$0024(A0),D1
		CLR.W	D2
		MOVE.B	(A4,D1.W),D2
		MOVE.W	$0022(A0),D3
		BPL.B	EFF0
		NEG.W	D3
EFF0		SUBI.W	#$4000,D3
		MULS	D2,D3
		LSR.L	#6,D3
		LSR.L	#6,D3
		ADD.W	D3,D0
		MOVE.W	D0,D1
		LSR.W	#8,D1
		SUB.B	(A3,D5.W),D1
		LSL.W	#1,D1
		MOVE.W	(A2,D1.W),D3
		ANDI.W	#$00FF,D0
		BEQ.B	FASTFREQ
		MOVE.W	2(A2,D1.W),D4
		SUB.W	D3,D4
		MULU	D0,D4
		LSR.L	#8,D4
		ADD.W	D4,D3
FASTFREQ	MOVE.W	D3,$0020(A0)
		MOVE.W	$000A(A0),D0
		ADD.W	D0,8(A0)
		BPL.W	FREQPOS
		ADDI.W	#$4800,8(A0)
FREQPOS		CMPI.W	#$4800,8(A0)
		BMI.W	FREQOK
		SUBI.W	#$4800,8(A0)
FREQOK		CLR.W	D0
		CLR.W	D1
		MOVE.B	$000D(A0),D0
		EXT.W	D0
		MOVE.B	$000C(A0),D1
		ADD.W	D0,D1
		BPL.B	EFF1
		CLR.B	D1
		BRA.B	EFF2

EFF1		CMPI.W	#$0081,D1
		BMI.B	EFF2
		MOVE.W	#$0080,D1
EFF2		MOVE.B	D1,$000C(A0)
		ADDQ.B	#1,$000F(A0)
		ANDI.B	#$000F,$000F(A0)
		ADDQ.W	#1,$0010(A0)
		MOVE.W	$0010(A0),D0
		CMP.W	4(A1),D0
		BNE.B	EFF4
		MOVE.W	6(A1),$0010(A0)
EFF4		MOVE.W	$0010(A1),D0
		ADD.W	D0,$0022(A0)
		ADDQ.W	#1,$0024(A0)
		MOVE.W	$0024(A0),D0
		CMP.W	$000C(A1),D0
		BNE.B	EFF5
		MOVE.W	$000E(A1),$0024(A0)
EFF5		RTS	

GETNEXTNOTE	MOVEA.L	(A0),A1
GNN0		MOVE.B	(A1)+,D0
		BEQ.W	GNN1
		BPL.B	GNN2
		CMPI.B	#-$0048,D0
		BPL.W	GNN3
		CMPI.B	#-$0064,D0
		BNE.B	GNN4
		MOVE.B	(A1)+,$000E(A0)
		CLR.B	$000F(A0)
		BRA.B	GNN0

GNN4		CMPI.B	#-$0065,D0
		BNE.B	GNN5
		CLR.W	D0
		MOVE.B	(A1)+,D0
		LSL.W	#8,D0
		MOVE.B	(A1)+,D0
		MOVE.W	D0,$000A(A0)
		BRA.B	GNN0

GNN5		CMPI.B	#-$0066,D0
		BNE.B	GNN6
		MOVE.B	(A1)+,$000D(A0)
		BRA.B	GNN0

GNN6		CMPI.B	#-$0067,D0
		BNE.B	GNN7
		MOVE.B	(A1)+,D1
		LSL.B	#1,D1
		MOVE.B	D1,$000C(A0)
		CLR.B	$000D(A0)
		BRA.B	GNN0

GNN7		CMPI.B	#-$0068,D0
		BNE.B	GNN9
		MOVE.B	(A1)+,flg3(A6)
GNN9		CMPI.B	#-$0069,D0
		BNE.B	GNN10
		MOVE.B	(A1)+,D1
		LSL.W	#8,D1
		MOVE.B	(A1)+,D1
		MOVE.W	D1,rndnum(A6)
GNN10		BRA.B	GNN0

GNN2		BTST	#6,D0
		BEQ.B	GNN8
		move.l	tab(pc),A2	; tab
		SUBI.B	#$0040,D0
		moveq	#0,D1
		move.w	dx(pc),d2
		MOVE.B	D0,D1
		MULU	d2,D1		; ! 34/36
		LEA	(A2,D1.W),A3
		MOVE.L	A3,4(A0)
		CLR.L	$000E(A0)
		CLR.W	$0012(A0)
		CLR.L	$0022(A0)
		MOVE.B	#1,$0014(A0)
		LEA	$0026(A0),A4
		MOVE.L	A4,$0016(A0)
		CLR.L	$001A(A0)
		CLR.W	$001E(a0)
		cmp.w	#$22,d2
		BEQ.W	GNN0
		move.b	$22(a3),d2
		MOVE.B	d2,$1B(A0)
		MOVE.B	d2,$1F(A0)
		BRA.W	GNN0

GNN8		SUBQ.B	#1,D0
		move.l	inst2(pc),A2
		CLR.L	D1
		MOVE.B	D0,D1
		MULU	#$001C,D1
		LEA	(A2,D1.W),A3
		MOVE.L	A3,4(A0)
		CLR.L	$000E(A0)
		CLR.B	$0014(A0)
		CLR.L	$0022(A0)
		MOVE.L	$0012(A3),$0016(A0)
		MOVE.W	$0016(A3),$001A(A0)
		MOVE.W	$0018(A3),$001C(A0)
		MOVE.W	$001A(A3),$001E(A0)
		BRA.W	GNN0

GNN3		NOT.B	D0
		SUB.B	$012E(A0),D0
		MOVE.B	D0,8(A0)
		CLR.B	9(A0)
		CLR.W	$000A(A0)
		BRA.W	GNN0

GNN1		MOVE.L	A1,(A0)
		RTS	

MEGAEFFECTS	MOVEA.L	voia(A6),A0
		MOVE.W	#3,D7
ME1		BTST	#0,$0014(A0)
		BEQ.W	ME2
		TST.B	$0014(A0)
		BMI.W	ME2
		MOVEA.L	4(A0),A1
		MOVE.W	$0012(A0),D0
		MOVEA.L	$0012(A1),A2
		CLR.L	D1
		MOVE.B	(A2,D0.W),D1
		moveq	#0,D4
		cmp.w	#$22,dx
		beq.w	ME2
		MOVE.B	$0022(A1),D4
		LSL.B	#1,D4
		SUBQ.B	#1,D4
		LEA	$00A6(A0),A2
		MOVEA.L	$001A(A1),A3
		MOVEA.L	$001E(A1),A4
		TST.B	$0023(A1)
		BNE.W	CALC2
CALC1		MOVE.B	(A4)+,D2
		EXT.W	D2
		MOVE.B	(A3),D3
		EXT.W	D3
		SUB.W	D3,D2
		MULS	D1,D2
		ASR.W	#7,D2
		ADD.B	(A3)+,D2
		MOVE.B	D2,(A2)+
		DBRA	D4,CALC1
		BRA.W	ME2

CALC2		CMPI.B	#1,$0023(A1)
		BNE.W	CALC7
		CMPI.B	#-2,D1
		BEQ.W	CALC4
		BTST	#1,$0014(A0)
		BEQ.W	CALC4
		MOVEA.L	A2,A3
CALC4		BSET	#1,$0014(A0)
		CMPI.B	#-1,D1
		BEQ.W	CALC5
		MOVE.B	(A3,D4.W),D3
		EXT.W	D3
		MOVE.W	#$0080,D0
		SUB.B	D1,D0
CALC3		MOVE.B	(A3)+,D2
		EXT.W	D2
		SUB.W	D3,D2
		MULS	D0,D2
		ASR.W	#7,D2
		ADD.W	D2,D3
		MOVE.B	D3,(A2)+
		DBRA	D4,CALC3
		BRA.W	ME2

CALC5		MOVE.W	RNDNUMBER(PC),D0
		LSR.W	#1,D4
CALC6		MULU	D0,D0
		LSR.L	#8,D0
		EORI.W	#-$536F,D0
		MOVE.W	D0,(A2)+
		DBRA	D4,CALC6
		EORI.W	#$7FA3,D0
		MOVE.W	D0,rndnum(A6)
		BRA.W	ME2

CALC7		CMPI.B	#2,$0023(A1)
		BNE.W	CALC10
		SUB.W	D1,D4
		ADDA.L	D1,A3
		SUBQ.W	#1,D1
		BMI.W	CALC9
CALC8		MOVE.B	(A4)+,(A2)+
		DBRA	D1,CALC8
		TST.W	D4
		BMI.W	ME2
CALC9		MOVE.B	(A3)+,(A2)+
		DBRA	D4,CALC9
		BRA.W	ME2

CALC10		CMPI.B	#3,$0023(A1)
		BNE.W	CALC13
		MOVE.L	#$00008000,D0
		EXT.W	D1
		ADDI.W	#$0040,D1
		DIVU	D1,D0
		SWAP	D0
		CLR.W	D0
		SWAP	D0
		LSL.L	#8,D0
		MOVE.W	D1,D2
		MULU	D4,D2
		LSR.W	#7,D2
		MOVE.W	D4,D3
		SUB.W	D2,D3
		CLR.L	D4
CALC11		SWAP	D4
		MOVE.B	(A3,D4.W),(A2)+
		SWAP	D4
		ADD.L	D0,D4
		DBRA	D2,CALC11
		SUBQ.W	#1,D3
		BMI.W	ME2
		MOVE.W	#$0080,D0
		SUB.W	D1,D0
		MOVE.L	#$00008000,D1
		DIVU	D0,D1
		SWAP	D1
		CLR.W	D1
		SWAP	D1
		LSL.L	#8,D1
CALC12		SWAP	D4
		MOVE.B	(A3,D4.W),(A2)+
		SWAP	D4
		ADD.L	D1,D4
		DBRA	D3,CALC12
		BRA.B	ME2

CALC13		MOVEA.L	A2,A4
		BTST	#1,$0014(A0)
		BNE.W	CALC15
		MOVEA.L	A3,A4
CALC15		BSET	#1,$0014(A0)
		CLR.L	D0
		MOVE.B	D1,D0
		ADDI.W	#$0020,D0
		MOVE.L	#$000FFFE0,D2
		DIVU	D0,D2
		MOVE.W	#$0026,D3
		EXT.W	D1
		MULU	D1,D3
		SUB.W	D3,D2
		MOVE.W	#$7FFF,D3
		SUB.W	D2,D3
		MULU	#-$4000,D3
		SWAP	D3
		MOVE.B	(A4,D4.W),D0
		MOVE.B	D0,D1
		EXT.W	D0
		LSL.W	#7,D0
		SUB.B	-1(A4,D4.W),D1
		EXT.W	D1
		LSL.W	#7,D1
CALC14		MULS	D3,D1
		SWAP	D1
		LSL.W	#1,D1
		MOVE.B	(A3)+,D5
		EXT.W	D5
		LSL.W	#7,D5
		SUB.W	D0,D5
		MULS	D2,D5
		SWAP	D5
		LSL.W	#1,D5
		ADD.W	D5,D1
		ADD.W	D1,D0
		MOVE.W	D0,D5
		LSR.W	#7,D5
		MOVE.B	D5,(A2)+
		DBRA	D4,CALC14
ME2		ADDQ.W	#1,$0012(A0)
		MOVE.W	$0012(A0),D0
		CMP.W	$0016(A1),D0
		BNE.B	ME3
		MOVE.W	$0018(A1),$0012(A0)
ME3		ADDA.L	#$00000130,A0
		DBRA	D7,ME1
		RTS	

********************
* old version here *



_PLAYa		MOVEM.L	D0-A6,-(A7)
		LEA	DATA(PC),A6
		TST.B	flg1(A6)
		BNE.B	CALLFPOa
		BSR.W	PLAYOLDa
		BRA.B	NOCALLFPOa

CALLFPOa	BSR.W	FAST_PLAYOLDa
NOCALLFPOa	ADDQ.B	#1,(A6)
		MOVE.B	(A6),D0
		CMP.B	flg3(A6),D0
		BNE.W	ONLY_EFFECTSa
		CLR.B	(A6)
		ADDQ.B	#1,flg2(A6)
		CMPI.B	#$10,flg2(A6)
		BNE.B	NEXTNOTEa
		CLR.B	flg2(A6)
		ADDQ.W	#1,pattnr(A6)
		move.l	patt(pc),A1	; PATTERNS
RESTART2a	CLR.L	D0
		MOVE.W	pattnr(A6),D0
		MULU	#$0014,D0
		TST.L	(A1,D0.W)
		BNE.B	NORESTARTa
		CLR.W	pattnr(A6)
		BRA.B	RESTART2a

NORESTARTa	move.l	VOICEDATA_ADR(pc),A0
		MOVE.L	(A1,D0.W),(A0)
		MOVE.L	4(A1,D0.W),$0068(A0)
		MOVE.L	8(A1,D0.W),$00D0(A0)
		MOVE.L	$000C(A1,D0.W),$0138(A0)
		MOVE.B	$0010(A1,D0.W),$0066(A0)
		MOVE.B	$0011(A1,D0.W),$00CE(A0)
		MOVE.B	$0012(A1,D0.W),$0136(A0)
		MOVE.B	$0013(A1,D0.W),$019E(A0)
NEXTNOTEa	move.l	VOICEDATA_ADR(pc),A0
		MOVE.W	#3,D7
NN1a		BSR.W	GETNEXTNOTEa
		BSR.W	EFFECTSa
		ADDA.L	#$00000068,A0
		DBRA	D7,NN1a
		BRA.B	END_OF_PLAYa

ONLY_EFFECTSa	move.l	VOICEDATA_ADR(pc),A0
		MOVE.W	#3,D7
OE1a		BSR.W	EFFECTSa
		ADDA.L	#$00000068,A0
		DBRA	D7,OE1a
END_OF_PLAYa	MOVEM.L	(A7)+,D0-A6
		RTS	

PLAYOLDa	MOVEA.L	voia(A6),A0
		CLR.W	D6
		TST.W	$001A(A0)
		BEQ.B	PO2a
		BSET	#0,D6
PO2a		TST.W	$0082(A0)
		BEQ.B	PO3a
		BSET	#1,D6
PO3a		TST.W	$00EA(A0)
		BEQ.B	PO4a
		BSET	#2,D6
PO4a		TST.W	$0152(A0)
		BEQ.B	PO5a
		BSET	#3,D6
PO5a		MOVE.W	D6,$00DFF096.L
		LEA	$00DFF0A0.L,A1
		move.l	VOICEDATA_ADR(pc),A0
		MOVE.W	#3,D7
PO6a		MOVE.B	$0015(A0),9(A1)
		MOVE.W	$0020(A0),6(A1)
		TST.W	$001A(A0)
		BEQ.B	SR1a
		MOVE.L	$0016(A0),(A1)
		MOVE.W	$001A(A0),4(A1)
SR1a		ADDA.L	#$00000068,A0
		ADDA.L	#$00000010,A1
		DBRA	D7,PO6a
		move.l	VOICEDATA_ADR(pc),A0
		ADDA.L	#$00000022,A0
		MOVE.W	#7,D0
POXa		MOVE.L	$0158(A0),$0138(A0)
		MOVE.L	$00F0(A0),$00D0(A0)
		MOVE.L	$0088(A0),$0068(A0)
		MOVE.L	$0020(A0),(A0)+
		DBRA	D0,POXa
		MOVE.W	#$0100,D0
PO7a		DBRA	D0,PO7a
		ADDI.W	#-$8000,D6
		MOVE.W	D6,$00DFF096.L
		move.l	VOICEDATA_ADR(pc),A0
		LEA	$00DFF0A0.L,A1
		MOVE.W	#3,D7
PO8a		TST.W	$001A(A0)
		BEQ.B	SR4a
		CLR.L	D1
		MOVE.W	$001C(A0),D1
		LSL.L	#1,D1
		MOVEA.L	$0016(A0),A2
		ADDA.L	D1,A2
		MOVE.L	A2,(A1)
		MOVE.W	$001E(A0),4(A1)
		CLR.W	$001A(A0)
SR4a		ADDA.L	#$00000068,A0
		ADDA.L	#$00000010,A1
		DBRA	D7,PO8a
		RTS	

FAST_PLAYOLDa	LEA	$00DFF0A0.L,A1
		move.l	VOICEDATA_ADR(pc),A0
		MOVE.W	#3,D7
F_PO6a		MOVE.B	$0015(A0),9(A1)
		MOVE.W	$0020(A0),6(A1)
		BTST	#0,$0014(A0)
		BEQ.W	F_SR2a
		LEA	$0022(A0),A2
		MOVE.W	#7,D0
F_SR3a		MOVE.L	$0020(A2),(A2)+
		DBRA	D0,F_SR3a
F_SR2a		ADDA.L	#$00000068,A0
		ADDA.L	#$00000010,A1
		DBRA	D7,F_PO6a
		RTS	

EFFECTSa	TST.B	$0014(A0)
		BMI.W	EFF6a
		MOVEA.L	4(A0),A1
		MOVEA.L	(A1),A2
		MOVE.W	$0010(A0),D0
		CLR.W	D1
		MOVE.B	(A2,D0.W),D1
		CLR.L	D2
		MOVE.B	$000C(A0),D2
		MULU	D2,D1
		LSR.W	#7,D1
		MOVE.B	D1,$0015(A0)
		LEA	PERIODS(pc),A2	; periods
		move.l	drin(pc),A3	; drin
		CLR.L	D5
		MOVE.B	$000E(A0),D5
		LSL.W	#3,D5
		CLR.L	D6
		MOVE.B	$000F(A0),D6
		ADD.W	D6,D5
		MOVE.W	8(A0),D0
		MOVEA.L	8(A1),A4
		MOVE.W	$0064(A0),D1
		CLR.W	D2
		MOVE.B	(A4,D1.W),D2
		MOVE.W	$0062(A0),D3
		BPL.B	EFF0a
		NEG.W	D3
EFF0a		SUBI.W	#$4000,D3
		MULS	D2,D3
		LSR.L	#6,D3
		LSR.L	#6,D3
		ADD.W	D3,D0
		MOVE.W	D0,D1
		LSR.W	#8,D1
		SUB.B	(A3,D5.W),D1
		LSL.W	#1,D1
		MOVE.W	(A2,D1.W),D3
		ANDI.W	#$00FF,D0
		BEQ.B	FASTFREQa
		MOVE.W	2(A2,D1.W),D4
		MOVE.W	#$0100,D2
		SUB.W	D0,D2
		MULU	D0,D4
		MULU	D2,D3
		ADD.L	D4,D3
		LSR.L	#8,D3
FASTFREQa	MOVE.W	D3,$0020(A0)
		BTST	#0,$0014(A0)
		BEQ.B	EFF7a
		MOVE.W	$0012(A0),D0
		MOVEA.L	$0012(A1),A2
		CLR.L	D1
		MOVE.B	(A2,D0.W),D1
		MOVE.W	#$0080,D0
		SUB.W	D1,D0
		MOVE.W	#$001F,D4
		LEA	$0042(A0),A2
		MOVEA.L	$001A(A1),A3
		TST.L	$001E(A1)
		BEQ.W	CALC2a
		MOVEA.L	$001E(A1),A4
CALC1a		MOVE.B	(A3)+,D2
		EXT.W	D2
		MOVE.B	(A4)+,D3
		EXT.W	D3
		MULS	D0,D2
		MULS	D1,D3
		ADD.W	D2,D3
		ASR.W	#7,D3
		MOVE.B	D3,(A2)+
		DBRA	D4,CALC1a
		BRA.B	EFF7a

CALC2a		BTST	#1,$0014(A0)
		BEQ.W	CALC4a
		MOVEA.L	A2,A3
CALC4a		BSET	#1,$0014(A0)
		MOVE.B	$001F(A3),D3
		EXT.W	D3
CALC3a		MOVE.B	(A3)+,D2
		EXT.W	D2
		MULS	D0,D2
		MULS	D1,D3
		ADD.W	D2,D3
		ASR.W	#7,D3
		MOVE.B	D3,(A2)+
		DBRA	D4,CALC3a
EFF7a		MOVE.W	$000A(A0),D0
		ADD.W	D0,8(A0)
		CLR.W	D0
		CLR.W	D1
		MOVE.B	$000D(A0),D0
		EXT.W	D0
		MOVE.B	$000C(A0),D1
		ADD.W	D0,D1
		BPL.B	EFF1a
		CLR.B	D1
		BRA.B	EFF2a

EFF1a		CMPI.W	#$0081,D1
		BMI.B	EFF2a
		MOVE.W	#$0080,D1
EFF2a		MOVE.B	D1,$000C(A0)
		ADDQ.B	#1,$000F(A0)
		ANDI.B	#7,$000F(A0)
		ADDQ.W	#1,$0010(A0)
		MOVE.W	$0010(A0),D0
		CMP.W	4(A1),D0
		BNE.B	EFF4a
		MOVE.W	6(A1),$0010(A0)
EFF4a		MOVE.W	$0010(A1),D0
		ADD.W	D0,$0062(A0)
		ADDQ.W	#1,$0064(A0)
		MOVE.W	$0064(A0),D0
		CMP.W	$000C(A1),D0
		BNE.B	EFF5a
		MOVE.W	$000E(A1),$0064(A0)
EFF5a		BTST	#0,$0014(A0)
		BEQ.B	EFF6a
		ADDQ.W	#1,$0012(A0)
		MOVE.W	$0012(A0),D0
		CMP.W	$0016(A1),D0
		BNE.B	EFF6a
		MOVE.W	$0018(A1),$0012(A0)
EFF6a		RTS	

GETNEXTNOTEa	MOVEA.L	(A0),A1
GNN0a		MOVE.B	(A1)+,D0
		BEQ.W	GNN1a
		BPL.B	GNN2a
		CMPI.B	#-$0048,D0
		BPL.W	GNN3a
		CMPI.B	#-$0064,D0
		BNE.B	GNN4a
		MOVE.B	(A1)+,$000E(A0)
		CLR.B	$000F(A0)
		BRA.B	GNN0a

GNN4a		CMPI.B	#-$0065,D0
		BNE.B	GNN5a
		CLR.W	D0
		MOVE.B	(A1)+,D0
		EXT.W	D0
		MOVE.W	D0,$000A(A0)
		BRA.B	GNN0a

GNN5a		CMPI.B	#-$0066,D0
		BNE.B	GNN6a
		MOVE.B	(A1)+,$000D(A0)
		BRA.B	GNN0a

GNN6a		CMPI.B	#-$0067,D0
		BNE.B	GNN7a
		MOVE.B	(A1)+,D1
		LSL.B	#1,D1
		MOVE.B	D1,$000C(A0)
		CLR.B	$000D(A0)
		BRA.B	GNN0a

GNN7a		CMPI.B	#-$0068,D0
		BNE.B	GNN9a
		MOVE.B	(A1)+,flg3(A6)
GNN9a		BRA.B	GNN0a

GNN2a		BTST	#6,D0
		BEQ.B	GNN8a
		move.l	tab(pc),A2	; table
		SUBI.B	#$0040,D0
		CLR.L	D1
		MOVE.B	D0,D1
		move.w	dx(pc),d2
		MULU	d2,D1
		LEA	(A2,D1.W),A3
		MOVE.L	A3,4(A0)
		CLR.L	$000E(A0)
		CLR.W	$0012(A0)
		CLR.L	$0062(A0)
		MOVE.B	#1,$0014(A0)
		LEA	$0022(A0),A4
		MOVE.L	A4,$0016(A0)
		MOVE.W	#$0010,$001A(A0)
		CLR.W	$001C(A0)
		MOVE.W	#$0010,$001E(A0)
		BRA.W	GNN0a

GNN8a		SUBQ.B	#1,D0
		move.l	inst2(pc),A2	; INSTRUMENTS2
		CLR.L	D1
		MOVE.B	D0,D1
		MULU	#$001C,D1
		LEA	(A2,D1.W),A3
		MOVE.L	A3,4(A0)
		CLR.L	$000E(A0)
		CLR.B	$0014(A0)
		CLR.L	$0062(A0)
		MOVE.L	$0012(A3),$0016(A0)
		MOVE.W	$0016(A3),$001A(A0)
		MOVE.W	$0018(A3),$001C(A0)
		MOVE.W	$001A(A3),$001E(A0)
		BRA.W	GNN0a

GNN3a		NOT.B	D0
		SUB.B	$0066(A0),D0
		MOVE.B	D0,8(A0)
		CLR.B	9(A0)
		CLR.W	$000A(A0)
		BRA.W	GNN0a
GNN1a		MOVE.L	A1,(A0)
		RTS

*********
* datas *

tabA	dc.l	0
inst2A	dc.l	0
pattA	dc.l	0
drinA	dc.l	0
dxA	dc.w	0
modeA	dc.w	0
tab	dc.l	0
inst2	dc.l	0
patt	dc.l	0
drin	dc.l	0
dx	dc.w	0
mode	dc.w	0
DATA
FLAGS		DC.b	0,0,0,0
PATTPOS		DC.W	0
VOICEDATA_ADR	DC.L	0
RNDNUMBER	DC.W	0

		DC.L	$3E003E,$3E003E,$3E003E,$3E003E,$3E003E,$3E003E
Periods:	DC.L	$3E0047,$4B0050,$55005A,$5F0065,$6B0071,$78007F
		DC.L	$87008F,$9700A0,$AA00B4,$BE00CA,$D600E2,$F000FE
		DC.L	$10D011D,$12E0140,$1530168,$17D0194,$1AC01C5
		DC.L	$1E001FC,$21A023A,$25C0280,$2A602D0,$2FA0328
		DC.L	$358038A,$3C003F8,$4340474,$4B80500,$54C05A0
		DC.L	$5F40650,$6B00714,$78007F0,$86808E8,$9700A00
		DC.L	$A980B40,$BE80CA0,$D600E28,$F000FE0,$FE00FE0
		DC.L	$FE00FE0,$FE00FE0,$FE00FE0,$FE00FE0,$FE00FE0


		END

