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

Name	db	"Legless Music Editor",0
Comment	db	"Silents/UK,",10
	db	"adapted by Andy Silva",0

	db	'$VER: a player for the famous DeliTracker',0
	even

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Checky:
	moveq	#-1,d0
	move.l	dtg_ChkData(a5),a0
	cmp.l	#$4c4d4500,(a0)
	bne.s	c_rts
	move.l	a0,data
	move.l	$28(a0),d1
	sub.w	#$10,d1
	lsr.w	#4,d1
	subq.w	#1,d1
	move.w	d1,songs
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
	move.l	data(pc),a1
	move.w	songnr(pc),d0
	bsr	_Init
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

*********************************************************
*							*
*	Legless Music Editor (LME) - The Replay		*
*	---------------------------------------		*
*	    from 1990 by Legless/Silents UK		*
*							*
*	...ripped, reassembled and well optimized	*
*           by The Vampire / PseudoDOS Group !!!!!!!	*
*							*
*********************************************************

_init		lea	switches(pc),a2
		lea	L_770(pc),a0
		moveq	#1,d1
		move.w	d1,(a0)+
		move.w	d1,(a0)+
		move.w	d1,(a0)+
		move.w	d1,(a0)+
		move.l	a2,(a0)+
		move.l	a2,(a0)+
		move.l	a2,(a0)+
		move.l	a2,(a0)+
		lea	L_BF0(pc),A2
		ADDA.W	#$28,A1
		MOVEA.L	A1,A3
		ASL.W	#4,D0			; d0 subsong
		MOVEQ	#3,D2			; a1 modadr
L_94		MOVE.L	(A1)+,D1
		ADD.L	A3,D1
		MOVE.L	D1,(A2)+
		MOVE.L	$C(A1,D0.W),D1
		ADD.L	A3,D1
		MOVE.L	D1,(A0)+
		MOVE.L	D1,$C(A0)
		DBRA	D2,L_94
		CLR.W	L_7CC
		CLR.W	L_7D4
		CLR.W	L_7DC
		CLR.W	L_7E4
		RTS	
_stop		MOVE.W	#$F,$DFF096
		RTS	
_play		BSET	#1,$BFE001
		lea	$DFF0A0,A1
		lea	L_7AC(pc),A0
		MOVEA.L	L_BFC(pc),A2
		MOVEQ	#3,D7
get_lp		TST.W	(A0)
		BEQ.B	get_lpc
		CLR.W	(A0)+
		MOVE.L	(A0)+,(A1)
		MOVE.W	(A0)+,4(A1)
		ADDA.W	#$10,A1
		BRA.B	get_lpc1
get_lpc		ADDQ.W	#8,A0
		ADDA.W	#$10,A1
get_lpc1	DBRA	D7,get_lp
		lea	L_76E(pc),A0
		MOVE.W	#-$8000,(A0)
		BSR.W	setper
		BSR.W	setper2
		BSR.W	setper3
		BSR.W	setvol
		BSR.W	setadrlen
		MOVEQ	#3,D7
		MOVEQ	#0,D0
		lea	L_770(pc),A0
chk_lp		SUBI.W	#1,(A0,D0.W)
		BEQ.B	effects
chk_back	ADDQ.W	#2,D0
		DBRA	D7,chk_lp
		BSR.W	newptr
		MOVE.W	#$B0,D0
wait_lp		DBRA	D0,wait_lp
		MOVE.W	L_76E(pc),$00DFF096
		RTS	
effects		MOVE.W	D0,D5
		MOVE.W	D0,D6
		LSR.W	#1,D6
		ASL.W	#1,D5
		lea	arp2(pc),A1
		MOVE.W	(A1,D0.W),D1
		lea	L_7FC(pc),A1
		CLR.W	2(A1,D1.W)
		MOVEA.L	L_BF8(pc),A6
		lea	L_778(pc),A1
		MOVEA.L	(A1,D5.W),A3
		MOVE.W	(A3)+,D1
		BPL.B	L_1EE
		lea	L_788(pc),A5
		MOVEA.L	(A5,D5.W),A4
		MOVE.W	(A4)+,D2
		CMP.W	#-1,D2
		BNE.B	L_1C2
		lea	L_798(pc),A4
		MOVEA.L	(A4,D5.W),A4
		MOVE.W	(A4)+,D2
L_1C2		lea	L_876(pc),A2
		CLR.W	(A2,D0.W)
		BTST	#$F,D2
		BEQ.B	L_1DA
		BCLR	#$F,D2
		MOVE.W	(A4)+,(A2,D0.W)
L_1DA		MOVE.L	A4,(A5,D5.W)
		MOVEA.L	L_BF4(pc),A2
		ASL.W	#2,D2
		MOVEA.L	(A2,D2.W),A3
		ADDA.L	A6,A3
		MOVE.W	(A3)+,D1
L_1EE		BTST	#0,D1
		BNE.W	L_342
		BTST	#1,D1
		BNE.W	L_368
L_1FE		BTST	#4,D1
		BNE.W	L_48A
L_206		BTST	#3,D1
		BEQ.B	L_218
		lea	L_86C(pc),A2
		BSET	#0,(A2)
		BRA.B	L_280
L_218		lea	arp1(pc),A4
		MOVE.W	(A4,D0.W),D3
		lea	L_86E(pc),A4
		MOVE.W	(A4,D0.W),D2
		MOVEA.L	L_BF0(pc),A4
		lea	L_888(pc),A2
		MOVE.W	6(A4,D2.W),6(A2,D3.W)
		MOVE.L	$000E(A4,D2.W),$000E(A2,D3.W)
		MOVE.L	$0012(A4,D2.W),$0012(A2,D3.W)
		MOVE.L	$0016(A4,D2.W),$0016(A2,D3.W)
		MOVE.L	$001A(A4,D2.W),$001A(A2,D3.W)
		MOVE.L	$001E(A4,D2.W),$001E(A2,D3.W)
		MOVE.L	$0022(A4,D2.W),$0022(A2,D3.W)
		MOVE.L	$0026(A4,D2.W),$0026(A2,D3.W)
		MOVE.L	$002A(A4,D2.W),$002A(A2,D3.W)
		MOVE.L	$002E(A4,D2.W),$002E(A2,D3.W)
		MOVE.L	$0032(A4,D2.W),$0032(A2,D3.W)
		MOVE.L	$0036(A4,D2.W),$0036(A2,D3.W)
L_280		MOVEQ	#0,D4
		BTST	#2,D1
		BNE.W	L_3E0
L_28A		MOVE.W	(A3)+,(A0,D0.W)
		lea	voff(pc),A2
		MOVE.W	(A2,D0.W),D2
		lea	hregs(pc),A2
		MOVEA.L	(A2,D5.W),A2
		MOVE.W	(A3)+,D3
		lea	L_876(pc),A4
		ADD.W	(A4,D0.W),D3
		ASL.W	#1,D3
		lea	peritab(pc),A4
		MOVE.W	(A4,D3.W),D3
		lea	L_7EC(pc),A4
		MOVE.W	D3,(A4,D0.W)
		TST.W	D4
		BNE.W	L_418
L_2CA		lea	L_86C(pc),A4
		TST.W	(A4)
		BEQ.B	L_2E2
		CLR.W	(A4)
		MOVE.W	D3,6(A2)
		MOVE.L	A3,(A1,D5.W)
		BRA.W	chk_back
L_2E2		lea	arp1(pc),A4
		MOVE.W	(A4,D0.W),D4
		lea	L_888(pc),A4
		MOVEA.L	L_BFC(pc),A5
		lea	L_7AC(pc),A6
		MOVE.W	D5,D1
		ASL.W	#1,D1
		MOVE.W	#1,(A6,D1.W)
		ADDA.L	(A4,D4.W),A5
		MOVE.W	D2,$00DFF096
		MOVE.L	(A4,D4.W),(A2)
		MOVE.W	4(A4,D4.W),4(A2)
		MOVE.W	D3,6(A2)
		MOVE.W	6(A4,D4.W),8(A2)
		MOVE.L	A3,(A1,D5.W)
		MOVE.L	8(A4,D4.W),2(A6,D1.W)
		MOVE.W	$000C(A4,D4.W),6(A6,D1.W)
		lea	L_76E(pc),A2
		OR.W	D2,(A2)
		BRA.W	chk_back
L_342		MOVE.W	(A3)+,(A0,D0.W)
		lea	voff(pc),A2
		MOVE.W	(A2,D0.W),$00DFF096
		lea	L_7A8(pc),A2
		MOVE.B	#1,(A2,D6.W)
		MOVE.L	A3,(A1,D5.W)
		BRA.W	chk_back
L_368		lea	L_86E(pc),A2
		MOVE.W	(A3)+,D2
		ASL.W	#1,D2
		MOVE.W	D2,D3
		ASL.W	#2,D2
		MOVE.W	D2,D4
		ASL.W	#1,D2
		MOVE.W	D2,D6
		ASL.W	#1,D2
		ADD.W	D3,D2
		ADD.W	D4,D2
		ADD.W	D6,D2
		MOVE.W	D2,(A2,D0.W)
		MOVEA.L	L_BF0(pc),A2
		lea	arp1(pc),A4
		MOVE.W	(A4,D0.W),D4
		lea	L_888(pc),A4
		ADDA.W	D4,A4
		ADDA.W	D2,A2
		MOVEA.L	A4,A5
		MOVE.W	#$002C,D3
L_3A8		MOVE.W	(A2)+,(A4)+
		DBRA	D3,L_3A8
		TST.W	$0026(A5)
		BNE.B	L_3C4
		MOVE.L	L_BFC(pc),D2
		ADD.L	D2,(A5)
		ADD.L	D2,8(A5)
		BRA.W	L_1FE
L_3C4		lea	L_9F0,A2	; ptr to 'synthmem'
		MOVE.W	D5,D2
		ASL.W	#5,D2
		ADDA.W	D2,A2
		MOVE.L	A2,(A5)
		MOVE.L	A2,8(A5)
		MOVE.W	4(A5),$000C(A5)
		BRA.W	L_1FE
L_3E0		lea	L_7CC(pc),A4
		MOVE.W	D5,D3
		ASL.W	#1,D3
		MOVE.W	(A3)+,D2
		lea	L_876(pc),A2
		ADD.W	(A2,D0.W),D2
		lea	peritab(pc),A2
		MOVE.W	(A3)+,2(A4,D3.W)
		ASL.W	#1,D2
		MOVE.W	(A2,D2.W),D2
		MOVE.W	D2,4(A4,D3.W)
		MOVE.W	D2,(A4,D3.W)
		MOVE.W	(A3)+,6(A4,D3.W)
		MOVEQ	#1,D4
		BRA.W	L_28A
L_418		ANDI.L	#$0000FFFF,D3
		MOVEQ	#0,D1
		lea	L_7CC(pc),A4
		MOVE.W	D5,D4
		ASL.W	#1,D4
		MOVE.W	(A4,D4.W),D1
		SUB.L	D3,D1
		DIVS	2(A4,D4.W),D1
		MOVE.W	D1,(A4,D4.W)
		BRA.W	L_2CA
setper		MOVEQ	#3,D7
		lea	L_7CC(pc),A0
		lea	L_7EC(pc),A1
		MOVEA.L	#$00DFF0A6,A2
L_450		TST.W	(A0)
		BEQ.B	L_47C
		TST.W	6(A0)
		BMI.B	L_462
		SUBI.W	#1,6(A0)
		BPL.B	L_47C
L_462		MOVE.W	(A1),D0
		ADD.W	(A0),D0
		MOVE.W	D0,(A2)
		MOVE.W	D0,(A1)
		SUBI.W	#1,2(A0)
		BNE.B	L_47C
		MOVE.W	4(A0),(A2)
		MOVE.W	4(A0),(A1)
		CLR.W	(A0)
L_47C		ADDQ.W	#8,A0
		ADDQ.W	#2,A1
		ADDA.W	#$0010,A2
		DBRA	D7,L_450
		RTS	
L_48A		lea	L_7FC(pc),A2
		lea	arp2(pc),A4
		lea	L_876(pc),A5
		MOVEA.W	(A5,D0.W),A5
		MOVE.W	(A4,D0.W),D2
		lea	peritab(pc),A4
		MOVE.W	(A3)+,D3
		CLR.W	(A2,D2.W)
		ASL.W	#1,D3
		MOVE.W	D3,2(A2,D2.W)
		LSR.W	#1,D3
		MOVE.W	#1,4(A2,D2.W)
		MOVE.W	(A3)+,6(A2,D2.W)
		SUBQ.W	#2,D3
L_4C4		MOVE.W	(A3)+,D4
		ADD.W	A5,D4
		ASL.W	#1,D4
		MOVE.W	(A4,D4.W),$000A(A2,D2.W)
		ADDQ.W	#2,D2
		DBRA	D3,L_4C4
		BRA.W	L_206
setper3		lea	L_7FC(pc),A0
		lea	L_7EC(pc),A1
		lea	L_888(pc),A3
		lea	$DFF0A6,A2
		MOVEQ	#3,D0
L_4F4		MOVE.W	(A1)+,8(A0)
		TST.W	2(A0)
		BEQ.B	L_524
		SUBI.W	#1,4(A0)
		BNE.B	L_524
		MOVE.W	6(A0),4(A0)
		MOVE.W	(A0),D1
		MOVE.W	8(A0,D1.W),D2
		ADD.W	$E(A3),D2
		MOVE.W	D2,(A2)
		ADDQ.W	#2,D1
		MOVE.W	D1,(A0)
		CMP.W	2(A0),D1
		BNE.B	L_524
		CLR.W	(A0)
L_524		ADDA.W	#$1C,A0
		ADDA.W	#$10,A2
		ADDA.W	#$5A,A3
		DBRA	D0,L_4F4
		RTS	
setper2		lea	L_896(pc),A0
		lea	L_7EC(pc),A1
		lea	$DFF0A6,A2
		lea	L_7FC(pc),A3
		MOVEQ	#3,D0
L_550		TST.W	2(A0)
		BEQ.B	L_59C
		TST.W	$A(A0)
		BMI.B	L_564
		SUBI.W	#1,$A(A0)
		BPL.B	L_59C
L_564		MOVE.W	(A0),D1
		TST.W	4(A0)
		BNE.B	L_580
		ADD.W	2(A0),D1
		MOVE.W	D1,(A0)
		CMP.W	6(A0),D1
		BNE.B	L_592
		BSET	#0,4(A0)
		BRA.B	L_592
L_580		SUB.W	2(A0),D1
		MOVE.W	D1,(A0)
		CMP.W	8(A0),D1
		BNE.B	L_592
		BCLR	#0,4(A0)
L_592		TST.W	2(A3)
		BNE.B	L_59C
		ADD.W	(A1),D1
		MOVE.W	D1,(A2)
L_59C		ADDA.W	#$5A,A0
		ADDQ.W	#2,A1
		ADDA.W	#$10,A2
		ADDA.W	#$1C,A3
		DBRA	D0,L_550
		RTS	
setvol		lea	L_888(pc),A0
		lea	$DFF0A8,A1
		MOVEQ	#3,D2
setvol_lp	MOVE.W	6(A0),D1
		MOVE.W	$1A(A0),D0
		BEQ.B	L_614
		CMP.W	#2,D0
		BEQ.B	L_5F0
		CMP.W	#3,D0
		BEQ.B	L_600
		CMP.W	#1,D0
		BNE.B	L_614
		ADD.W	$1C(A0),D1
		CMP.W	$1E(A0),D1
		BMI.B	L_614
		MOVE.W	$1E(A0),D1
		ADDI.W	#1,$1A(A0)
		BRA.B	L_614
L_5F0		SUBI.W	#1,$20(A0)
		BPL.B	L_614
		ADDI.W	#1,$1A(A0)
		BRA.B	L_614
L_600		SUB.W	$22(A0),D1
		CMP.W	$24(A0),D1
		BGT.B	L_614
		MOVE.W	$24(A0),D1
		ADDI.W	#1,$1A(A0)
L_614		MOVE.W	D1,(A1)
		MOVE.W	D1,6(A0)
		ADDA.W	#$5A,A0
		ADDA.W	#$10,A1
		DBRA	D2,setvol_lp
		RTS	
newptr		lea	L_888(pc),A0
		MOVEQ	#3,D0
newptr_lp	TST.W	$26(A0)
		BEQ.B	L_69C
		CMPI.W	#2,$26(A0)
		BEQ.B	L_65A
		MOVEA.L	(A0),A1
		MOVE.W	$28(A0),D1
		ADD.W	$2A(A0),D1
		CMP.W	$2C(A0),D1
		BMI.B	L_674
		MOVE.W	$2C(A0),D1
		ADDI.W	#1,$26(A0)
		BRA.B	L_674
L_65A		MOVEA.L	(A0),A1
		MOVE.W	$28(A0),D1
		SUB.W	$2E(A0),D1
		CMP.W	$30(A0),D1
		BGT.B	L_674
		MOVE.W	$30(A0),D1
		SUBI.W	#1,$26(A0)
L_674		MOVE.W	D1,$28(A0)
		MOVE.W	$32(A0),D2
		MOVE.W	$34(A0),D3
		MOVE.W	4(A0),D4
		ASL.W	#1,D4
		SUB.W	D1,D4
		SUBQ.W	#2,D1
		BMI.B	L_696
L_68C		MOVE.B	D2,(A1)+
		DBRA	D1,L_68C
		TST.W	D4
		BMI.B	L_69C
L_696		MOVE.B	D3,(A1)+
		DBRA	D4,L_696
L_69C		ADDA.W	#$5A,A0
		DBRA	D0,newptr_lp
		RTS	
setadrlen	lea	L_888(pc),A0
		lea	voff(pc),A1
		lea	L_76E(pc),A2
		lea	$DFF0A0,A4
		lea	L_7AC(pc),A5
		MOVEQ	#3,D0
adrlen_lp	MOVE.W	(A1)+,D1
		TST.W	$38(A0)
		BEQ.B	L_6FC
		SUBI.W	#1,$36(A0)
		BNE.B	L_6FC
		MOVE.W	$38(A0),$36(A0)
		OR.W	D1,(A2)
		MOVE.W	D1,$DFF096
		MOVE.L	(A0),(A4)
		MOVE.W	4(A0),4(A4)
		MOVE.W	#1,(A5)
		MOVE.L	8(A0),2(A5)
		MOVE.W	$C(A0),6(A5)
L_6FC		ADDA.W	#$5A,A0
		ADDA.W	#$10,A4
		ADDQ.W	#8,A5
		DBRA	D0,adrlen_lp
		RTS	
		dc.b	"                Ripped, reassembled "
		dc.b	"and lenght optimized by The Vampire / "
		dc.b	"PseudoDOS Group !!!!                "
peritab		DC.W	$358
		DC.W	$328
		DC.W	$2FA
		DC.W	$2D0
		DC.W	$2A6
		DC.W	$280
		DC.W	$25C
		DC.W	$23A
		DC.W	$21A
		DC.W	$1FC
		DC.W	$1E0
		DC.W	$1C5
		DC.W	$1AC
		DC.W	$194
		DC.W	$17D
		DC.W	$168
		DC.W	$153
		DC.W	$140
		DC.W	$12E
		DC.W	$11D
		DC.W	$10D
		DC.W	$FE
		DC.W	$F0
		DC.W	$E2
		DC.W	$D6
		DC.W	$CA
		DC.W	$BE
		DC.W	$B4
		DC.W	$AA
		DC.W	$A0
		DC.W	$97
		DC.W	$8F
		DC.W	$87
		DC.W	$7F
		DC.W	$78
		DC.W	$71
		DC.W	$6B
hregs		DC.L	$DFF0A0,$DFF0B0,$DFF0C0,$DFF0D0
voff		DC.W	1,2,4,8
switches	DC.W	-1
arp1		DC.L	$5a,$B4010E
arp2		DC.L	$1c,$380054
L_7FC		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
L_86C		DC.W	0
L_86E		DC.L	0
		DC.L	0
L_876		DC.L	0
		DC.L	0
L_7EC		DC.L	0,0
L_76E		DC.W	0	; DMACON
L_770		DC.W	0
		DC.W	0
		DC.W	0
		DC.W	0
L_778		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
L_788		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
L_798		DC.L	0
		DC.L	0
		DC.L	0
		DC.L	0
L_7A8		DC.L	0
L_7AC		DC.W	0
		DC.L	0
		DC.W	0
		DC.W	0
		DC.L	0
		DC.W	0
		DC.W	0
		DC.L	0
		DC.W	0
		DC.W	0
		DC.L	0
		DC.W	0
L_7cc		DC.L	0,0
L_7D4		DC.L	0,0
L_7DC		DC.L	0,0
L_7E4		DC.L	0,0
L_888		DC.L	0
		DC.L	0
		DC.L	0
		DC.W	0
L_896		blk.b	$15A,0
L_BF0		DC.L	0
L_BF4		DC.L	0
L_BF8		DC.L	0
L_BFC		DC.L	0

	section "synth",bss_c

L_9f0		blk.b	$300,0
		END

