* Jochen Hippel ST replayer: the song-playing routines of the Wanted Team
* EaglePlayer module "Jochen Hippel ST_v4.asm" (written by Jochen Hippel,
* updated by WT), cut out for the asm-to-C transpiler.  Cut: lines 59-68 (mode
* flags), 1266-1285 (Init_Emu), 1545-2492 (Init, InitPlay, Play and the voice
* routines, Table), 2531-2632 and 2633-2760 (YM shadow, state, period table),
* 857-875 (Bit8Table).  Eagleplayer glue, the Paula emulation (Play_Emu) and
* Compress are dropped.  See third-party/hippelst/README.md for origin.
	SECTION	Player,CODE

TypeAdr		dc.b	0
TypePlay	dc.b	0
Period		dc.w	0
TypeSID		dc.b	0
TypePeriod	dc.b	0

SamplesSize	=	44
InfoBuffer	ds.b	64

SongEnds	dc.l	0
SongEnd		addq.l	#1,SongEnds
		rts

Init_Emu
;lbC000392	LEA	lbL000616(PC),A0
;	MOVE.W	#0,10(A0)
;	LEA	lbL000622(PC),A0
;	MOVE.W	#0,10(A0)
;	LEA	lbL00062E(PC),A0
;	MOVE.W	#0,10(A0)
lbW000E1A	dc.w	$100
	dc.w	0
	dc.w	0
	dc.w	$E1
lbW000E22	dc.w	1
	dc.w	$200
	LEA	lbL000E26(PC),A0
	MOVE.B	#$3B,$1E(A0)
	MOVE.B	#$10,$2A(A0)
	MOVE.B	#0,$26(A0)
	MOVE.B	#0,$22(A0)
	MOVE.B	#4,$16(A0)
	MOVE.B	#0,$12(A0)

	lea	lbW0004C8(PC),A0
	clr.w	(A0)

	RTS

Bit8Table
	dc.b	$80
	dc.b	$93
	dc.b	$A7
	dc.b	$BF
	dc.b	$CF
	dc.b	$DF
	dc.b	$EF
	dc.b	$FF
	dc.b	15
	dc.b	$1F
	dc.b	$2F
	dc.b	$3F
	dc.b	$4F
	dc.b	$5F
	dc.b	$6F
	dc.b	$7F
	dc.b	$00
	dc.b	$FF
Init
lbC00063C	TST.W	D0
	BEQ.S	lbC00065A
	SUBQ.W	#1,D0
	MOVEA.L	lbL000F5A(PC),A1
	MULU.W	#6,D0
	ADDA.W	D0,A1
	MOVE.W	(A1)+,D0
	MOVE.W	(A1)+,D1
	LEA	lbW000E6E(PC),A5
	MOVE.W	(A1),(A5)
	BRA.L	lbC0008FE

lbC00065A	LEA	lbW000E70(PC),A0
	ST	(A0)
	BRA.L	lbC0006D6

InitPlay
lbC000664	LEA	lbB000F6F(PC),A1
	SF	(A1)
	CMPI.L	#'MMME',$20(A0)
	BNE.S	lbC000678
	MOVE.B	#1,(A1)
lbC000678	LEA	lbL000F66(PC),A5
	MOVE.L	A0,(A5)
	MOVEA.L	4(A0),A1
	ADDA.L	A0,A1
	LEA	lbL000F4A(PC),A5
	MOVE.L	A1,(A5)
	MOVEA.L	8(A0),A1
	ADDA.L	A0,A1
	LEA	lbL000F4E(PC),A5
	MOVE.L	A1,(A5)
	MOVEA.L	12(A0),A1
	ADDA.L	A0,A1
	LEA	lbL000F46(PC),A5
	MOVE.L	A1,(A5)
	MOVEA.L	$10(A0),A1
	ADDA.L	A0,A1
	LEA	lbL000F52(PC),A5
	MOVE.L	A1,(A5)
	MOVEA.L	$14(A0),A1
	ADDA.L	A0,A1
	LEA	lbL000F5A(PC),A5
	MOVE.L	A1,(A5)+
	MOVEA.L	$18(A0),A1
	ADDA.L	A0,A1
	MOVE.L	A1,(A5)+
	MOVEA.L	$1C(A0),A1
	ADDA.L	A0,A1
	LEA	lbL000F6A(PC),A5
	MOVE.L	A1,(A5)+
;	LEA	lbW000F58(PC),A5
;	ST	(A5)
	RTS

Play
lbC0006D6	LEA	lbL000E26(PC),A5
	LEA	lbW000E6C(PC),A4
	TST.B	4(A4)
	BEQ.S	lbC000706
	TST.B	5(A4)
	BNE.S	lbC000704
	ST	5(A4)
	MOVEQ	#0,D0
	MOVE.B	D0,$12(A5)
	MOVE.B	D0,$16(A5)
	MOVE.B	D0,$22(A5)
	MOVE.B	D0,$26(A5)
	MOVE.B	D0,$2A(A5)
lbC000704	RTS

lbC000706	LEA	lbL000E64(PC),A4
	LEA	lbL000E72(PC),A0
	BSR.L	lbC0009F6
	MOVE.W	D0,-(SP)
	MOVE.B	(SP)+,6(A5)
	MOVE.B	D0,2(A5)
	MOVE.B	D1,$22(A5)

	tst.b	TypeSID
	bne.w	SID_New
	move.b	$36(A0),D5
	bmi.w	SID00038A			; SID off check
	beq.w	SID000384
	cmp.b	#1,D5
	beq.b	SID000314
	cmp.b	#4,D5
	beq.b	SID00037C
	cmp.b	#2,D5
	bne.b	SID00030A
	move.w	SID2(PC),D0
	bra.b	SID000314

SID00030A
	cmp.b	#3,D5
	bne.b	SID000314
	move.w	SID3(PC),D0
SID000314
	cmp.w	#$10,D0
	ble.b	SID000384
	cmp.w	#$EEE,D0
	bhi.b	SID000384
	mulu.w	#7,D0
	addq.w	#1,D0
	move.w	D0,lbW0004C4
SID00037C
	lea	Bit8Table(PC),A0
	and.w	#15,D1
	move.b	(A0,D1.W),D1
	lea	SIDword+1,A0
	move.b	D1,(A0)
	move.l	A0,lbL0004BE
	move.l	A0,RepStart
	st.b	lbW0004C6
	moveq	#1,D0
	move.w	D0,lbW0004C2
	move.w	D0,RepLen
	move.w	D0,lbW0004C8			; channel start
	bra.b	SID00038A

SID000384
	st	$36(A0)				; SID off
	clr.w	lbW0004C8			; channel off
	bra.w	SID00038A
SID_New

; space for Warptyme SID code

SID00038A
	LEA	lbL000EA6(PC),A0
	BSR.L	lbC0009F6
	MOVE.W	D0,-(SP)
	MOVE.B	(SP)+,14(A5)
	MOVE.B	D0,10(A5)
	MOVE.B	D1,$26(A5)
	LEA	lbL000EDA(PC),A0
	BSR.L	lbC0009F6
	MOVE.W	D0,-(SP)
	MOVE.B	(SP)+,$16(A5)
	MOVE.B	D0,$12(A5)
	MOVE.B	D1,$2A(A5)
;	MOVEQ	#0,D6
;	MOVE.B	(A4)+,D7
;	OR.B	D6,D7
;	MOVE.B	D7,$1E(A5)

	move.b	(A4)+,$1E(A5)

	MOVE.B	(A4)+,$1A(A5)
	LEA	lbW000E6C(PC),A5
	SUBQ.W	#1,(A5)+
	BNE.S	lbC000782
	MOVE.W	(A5),-(A5)
	MOVEQ	#0,D5
	MOVEQ	#0,D4
	LEA	lbL000E72(PC),A0
	BSR.L	lbC000784
	ST	D4
	LEA	lbL000EA6(PC),A0
	BSR.L	lbC000784
	LEA	lbL000EDA(PC),A0
	BSR.L	lbC000784
lbC000782	RTS

lbC000784	SUBQ.B	#1,$1A(A0)
	BPL.L	lbC000782
	MOVE.B	$1B(A0),$1A(A0)
lbC000792	MOVEA.L	12(A0),A1
lbC000796	MOVE.B	(A1)+,D0
	CMP.B	#$FF,D0
	BNE.L	lbC00082E
	MOVEA.L	0(A0),A2
	ADDA.W	$14(A0),A2
	TST.B	D4
	BNE.S	lbC0007D6
	SUBQ.W	#1,$1C(A0)
	BPL.S	lbC0007D6
;	MOVE.L	A0,-(SP)
;	MOVEA.L	lbL000106(PC),A0
;	MOVEA.L	$5C(A0),A0
;	JSR	(A0)
;	MOVEA.L	(SP)+,A0

	bsr.w	SongEnd
	bsr.w	Init_Emu
	lea	lbL000E72(PC),A0
	st	$36(A0)				; SID off

	MOVE.W	lbW000F44(PC),$1C(A0)
	MOVE.W	D5,$14(A0)
	MOVE.W	D5,$48+4(A0)			; + SID size
	MOVE.W	D5,$7C+8(A0)			; + SID size
	MOVEA.L	0(A0),A2
lbC0007D6	MOVEQ	#0,D1
	MOVE.B	(A2),D1
	MOVE.B	1(A2),$21(A0)
	MOVE.B	2(A2),$20(A0)
	MOVE.B	3(A2),D0
	MOVE.B	D0,D2
	ANDI.W	#$F0,D2
	CMP.W	#$F0,D2
	BNE.S	lbC000802
	MOVE.B	D0,D2
	ANDI.B	#15,D2
	MOVE.B	D2,$30(A0)
	BRA.S	lbC000812

lbC000802	CMP.B	#$E0,D2
	BNE.S	lbC000812
	MOVE.B	D0,D2
	ANDI.W	#15,D2
	MOVE.W	D2,2(A5)
lbC000812	ADD.W	D1,D1
	MOVEA.L	lbL000F46(PC),A3

	tst.b	TypeAdr
	bne.b	Short1
	add.w	D1,D1
	move.l	0(A3,D1.W),A3
	bra.b	Skip1
Short1
	MOVEA.W	0(A3,D1.W),A3
Skip1
	ADDA.L	lbL000F66(PC),A3
	MOVE.L	A3,12(A0)
	ADDI.W	#12,$14(A0)
	BRA.L	lbC000792

lbC00082E	CMP.B	#$FE,D0
	BNE.S	lbC000840
	MOVE.B	(A1),$1B(A0)
	MOVE.B	(A1)+,$1A(A0)
	BRA.L	lbC000796

lbC000840	CMP.B	#$FD,D0
	BNE.S	lbC000854
	MOVE.B	(A1),$1B(A0)
	MOVE.B	(A1)+,$1A(A0)
	MOVE.L	A1,12(A0)
	RTS

lbC000854	MOVE.B	D0,$1E(A0)
	MOVE.B	(A1)+,D1
	MOVE.B	D1,$1F(A0)
	ANDI.W	#$E0,D1
	BEQ.S	lbC000868
	MOVE.B	(A1)+,$2C(A0)
lbC000868	MOVE.L	A1,12(A0)
	MOVE.L	D5,$10(A0)
	TST.B	D0
	BMI.L	lbC0008FC
	MOVE.B	$1F(A0),D1
	MOVE.B	D1,D0
	ANDI.W	#$1F,D1
	ADD.B	$20(A0),D1
	MOVEA.L	lbL000F66(PC),A3
	CMP.W	$26(A3),D1
	BLS.S	lbC000890
	MOVEQ	#0,D1
lbC000890	MOVEA.L	lbL000F4E(PC),A2
	ADD.W	D1,D1

	tst.b	TypeAdr
	bne.b	Short2
	add.w	D1,D1
	move.l	0(A2,D1.W),A2
	bra.b	Skip2
Short2
	MOVEA.W	0(A2,D1.W),A2
Skip2
	ADDA.L	lbL000F66(PC),A2
	MOVE.W	D5,$16(A0)
	MOVE.B	(A2),$23(A0)
	MOVE.B	(A2)+,$22(A0)
	MOVEQ	#0,D1
	MOVE.B	(A2)+,D1
	MOVE.B	(A2)+,$27(A0)
	MOVE.B	#$40,$2B(A0)
	MOVE.B	(A2),$28(A0)
	MOVE.B	(A2)+,$29(A0)
	MOVE.B	(A2)+,$2A(A0)
	MOVE.L	A2,4(A0)
	ANDI.B	#$40,D0
	BEQ.S	lbC0008D2
	MOVE.B	$2C(A0),D1
lbC0008D2	MOVEA.L	lbL000F66(PC),A3
	CMP.W	$24(A3),D1
	BLS.S	lbC0008DE
	MOVEQ	#0,D1
lbC0008DE	MOVEA.L	lbL000F4A(PC),A2
	ADD.W	D1,D1

	tst.b	TypeAdr
	bne.b	Short3
	add.w	D1,D1
	move.l	0(A2,D1.W),A2
	bra.b	Skip3
Short3
	MOVEA.W	0(A2,D1.W),A2
Skip3
	ADDA.L	lbL000F66(PC),A2
	MOVE.L	A2,8(A0)
	MOVE.W	D5,$18(A0)
	MOVE.B	D5,$25(A0)
	MOVE.B	D5,$24(A0)
lbC0008FC	RTS

lbC0008FE	MOVE.L	D0,D7
	MOVE.L	D1,D6
	SUB.L	D0,D1
	ADDQ.L	#1,D6
	MULU.W	#12,D7
	MULU.W	#12,D6
	LEA	lbW000F44(PC),A0
	MOVE.W	D1,(A0)
	MOVEQ	#2,D0
	LEA	lbL000E72(PC),A0
	LEA	lbW000E1A(PC),A1
	LEA	lbW000E22(PC),A2
lbC000922	MOVE.L	A1,8(A0)
	CLR.W	$18(A0)
	MOVE.L	A1,4(A0)
	CLR.W	$16(A0)
	SF	$1E(A0)
	SF	$1F(A0)
	SF	$26(A0)
	SF	$2F(A0)
	MOVE.B	#1,$23(A0)
	MOVE.B	#1,$22(A0)

	st	$36(A0)				; SID off
	sf	$37(A0)

	SF	$24(A0)
	SF	$25(A0)
	SF	$27(A0)
	SF	$28(A0)
	SF	$29(A0)
	SF	$2A(A0)
	SF	$2C(A0)
	SF	$2D(A0)
	MOVE.B	(A2),D3
	ANDI.W	#15,D3
	ADD.W	D3,D3
	ADD.W	D3,D3
	MOVE.B	(A2)+,$2E(A0)
	MOVEA.L	lbL000F52(PC),A3
	ADDA.L	D7,A3
	ADDA.W	D3,A3
	MOVE.L	A3,0(A0)
	MOVE.W	#12,$14(A0)
	MOVE.W	lbW000F44(PC),$1C(A0)
	MOVEQ	#0,D1
	MOVE.B	(A3)+,D1
	ADD.W	D1,D1
	MOVEA.L	lbL000F46(PC),A4

	tst.b	TypeAdr
	bne.b	Short4
	add.w	D1,D1
	move.l	0(A4,D1.W),A4
	bra.b	Skip4
Short4
	MOVEA.W	0(A4,D1.W),A4
Skip4
	ADDA.L	lbL000F66(PC),A4
	MOVE.L	A4,12(A0)
	CLR.W	$1A(A0)
	MOVE.B	#2,$32(A0)
	MOVE.B	(A3)+,$21(A0)
	SF	$33(A0)
	MOVE.B	(A3)+,$20(A0)
	SF	$31(A0)
	SF	$30(A0)
	MOVE.B	(A3)+,D1
	MOVE.B	D1,D2
	ANDI.W	#$F0,D1
	CMP.W	#$F0,D1
	BNE.S	lbC0009DC
	SUB.B	D1,D2
	MOVE.B	D2,$30(A0)
lbC0009DC	CLR.L	$10(A0)
	LEA	$34+4(A0),A0				; + SID size
	DBRA	D0,lbC000922
	LEA	lbW000E6C(PC),A0
	MOVE.W	#1,(A0)
	CLR.W	4(A0)
	RTS

lbC0009F6	MOVEQ	#0,D7
	MOVE.B	D7,$2D(A0)
lbC0009FC	TST.B	$25(A0)
	BEQ.S	lbC000A0A
	SUBQ.B	#1,$25(A0)
	BRA.L	lbC000B70

lbC000A0A	MOVEA.L	8(A0),A1
	ADDA.W	$18(A0),A1
lbC000A12	MOVE.B	(A1)+,D0
	MOVEQ	#0,D1
	MOVE.B	D0,D1

	tst.b	TypePlay
	bne.b	Jump
	cmp.w	#$EB,D1
	bge.w	lbC000B68
	tst.l	InfoBuffer+SamplesSize
	bne.b	Jump
	cmp.w	#$EA,D1
	beq.w	lbC000B68
Jump
	cmp.w	#$EF,D1				; for safety
	bgt.w	lbC000B68

	SUBI.W	#$E0,D1
	BMI.L	lbC000B68
	ADD.W	D1,D1
* (the table load is folded into the JMP: the transpiler turns the JMP into a switch on D1/2)
	JMP	lbW000A2A(PC,D1.W)

lbW000A2A	dc.w	lbC000AB6-lbW000A2A	;e0 a few diff now OK
	dc.w	lbC000AC8-lbW000A2A		;e1 diff now OK?
	dc.w	lbC000AD2-lbW000A2A		;e2 diff now OK?
	dc.w	lbC000AE4-lbW000A2A		;e3 OK
	dc.w	lbC000AF4-lbW000A2A		;e4 OK
	dc.w	lbC000B04-lbW000A2A		;e5 OK
	dc.w	lbC000B12-lbW000A2A		;e6 OK
	dc.w	lbC000B20-lbW000A2A		;e7 diff now OK?
	dc.w	lbC000B40-lbW000A2A		;e8 OK
	dc.w	lbC000B4C-lbW000A2A		;e9 OK
	dc.w	lbC000B56-lbW000A2A		;ea diff now OK?
	dc.w	lbC000AAA-lbW000A2A
	dc.w	lbC000A46-lbW000A2A
	dc.w	lbC000A9A-lbW000A2A
	dc.w	SIDCom-lbW000A2A
	dc.w	SIDCom2-lbW000A2A

lbC000A46	MOVEQ	#0,D0
	MOVE.B	(A1)+,D0
	MOVEA.L	lbL000F6A(PC),A2
	ADD.W	D0,D0
	ADD.W	D0,D0
	ADD.W	D0,D0
	MOVE.W	0(A2,D0.W),D1
	MOVEQ	#0,D2

	move.w	2(A2,D0.W),D2
	beq.b	Stand
	cmp.w	#$0010,D2
	bne.b	NoStand
	move.w	D2,D0
	lsr.w	#1,D0
	move.w	D0,RepLen
	move.l	A2,D0
	add.l	D1,D0
	move.l	D0,RepStart
	bra.b	OldStand
Stand
	ADDQ.W	#8,D0
	MOVE.W	0(A2,D0.W),D2

NoStand
	move.l	#lbL001470,RepStart
	move.w	#1,RepLen

	SUB.L	D1,D2
OldStand
	ADD.L	A2,D1
	LSR.W	#1,D2
;	SUBQ.W	#1,D2
	MOVE.W	D2,lbW0004C2
;	ADDQ.L	#1,D1
;	BCLR	#0,D1
	MOVE.L	D1,lbL0004BE
	MOVE.W	#$40,lbW0004C6
;	MOVE.W	#$240,lbW0004C4

	move.w	Period(PC),D1
	tst.b	TypePeriod
	beq.b	Out
	lea	Table(PC),A2
	move.b	(A1)+,D0
	bmi.b	NewPeriod
	add.b	$1E(A0),D0
	add.b	$21(A0),D0
NewPeriod
	and.w	#$7F,D0
	cmp.w	#96,D0				; out of table check
	bge.b	Out1
	lsl.w	#2,D0
	move.l	(A2,D0.W),D0
	lsr.l	#3,D0
	mulu.w	#$10000/8,D1
	divu.w	D0,D1
	addq.w	#1,D1
Out1
	addq.w	#1,$18(A0)
Out
	move.w	D1,lbW0004C4

	MOVE.W	#1,lbW0004C8
	ADDQ.W	#2,$18(A0)
	BRA.L	lbC000A12

Table
	dc.l	$400
	dc.l	$43C
	dc.l	$47D
	dc.l	$4C1
	dc.l	$50A
	dc.l	$556
	dc.l	$5A8
	dc.l	$5FE
	dc.l	$659
	dc.l	$6BA
	dc.l	$720
	dc.l	$78D
	dc.l	$800
	dc.l	$879
	dc.l	$8FA
	dc.l	$983
	dc.l	$A14
	dc.l	$AAD
	dc.l	$B50
	dc.l	$BFC
	dc.l	$CB2
	dc.l	$D74
	dc.l	$E41
	dc.l	$F1A
	dc.l	$1000
	dc.l	$10F3
	dc.l	$11F5
	dc.l	$1306
	dc.l	$1428
	dc.l	$155B
	dc.l	$16A0
	dc.l	$17F9
	dc.l	$1965
	dc.l	$1AE8
	dc.l	$1C82
	dc.l	$1E34
	dc.l	$2000
	dc.l	$21E7
	dc.l	$23EB
	dc.l	$260D
	dc.l	$2851
	dc.l	$2AB7
	dc.l	$2D41
	dc.l	$2FF2
	dc.l	$32CB
	dc.l	$35D1
	dc.l	$3904
	dc.l	$3C68
	dc.l	$4000
	dc.l	$43CE
	dc.l	$47D6
	dc.l	$4C1B
	dc.l	$50A2
	dc.l	$556E
	dc.l	$5A82
	dc.l	$5FE4
	dc.l	$6597
	dc.l	$6BA2
	dc.l	$7208
	dc.l	$78D0
	dc.l	$8000
	dc.l	$879C
	dc.l	$8FAC
	dc.l	$9837
	dc.l	$A145
	dc.l	$AADC
	dc.l	$B504
	dc.l	$BFC8
	dc.l	$CB2F
	dc.l	$D744
	dc.l	$E411
	dc.l	$F1A1
	dc.l	$10000
	dc.l	$10F38
	dc.l	$11F59
	dc.l	$1306F
	dc.l	$1428A
	dc.l	$155B8
	dc.l	$16A09
	dc.l	$17F91
	dc.l	$1965F
	dc.l	$1AE89
	dc.l	$1C823
	dc.l	$1E343
	dc.l	$20000
	dc.l	$21E71
	dc.l	$23EB3
	dc.l	$260DF
	dc.l	$28514
	dc.l	$2AB70
	dc.l	$2D413
	dc.l	$2FF22
	dc.l	$32CBF
	dc.l	$35D13
	dc.l	$39047
	dc.l	$3C686

lbC000A9A	ADDQ.W	#1,$18(A0)
	MOVE.W	#0,lbW0004C8
	BRA.L	lbC000A12

SIDCom2
	move.b	(A1)+,$37(A0)
	bra.b	ComSet

SIDCom
	move.b	(A1)+,$36(A0)
ComSet	addq.w	#2,$18(A0)
	bra.w	lbC000A12

lbC000AAA	MOVE.B	(A1)+,$33(A0)
	ADDQ.W	#2,$18(A0)
	BRA.L	lbC000A12

lbC000AB6	MOVEQ	#0,D0
	MOVE.B	(A1)+,D0

	tst.b	TypePlay
	bne.b	NoAnd
	and.w	#$3F,D0
NoAnd
	MOVE.W	D0,$18(A0)
	MOVEA.L	8(A0),A1
	ADDA.L	D0,A1
	BRA.L	lbC000A12

lbC000AC8
	tst.b	TypePlay
	beq.w	lbC000B70

	MOVE.B	-2(A1),$26(A0)
	BRA.L	lbC000B70

lbC000AD2
	tst.b	TypePlay
	bne.b	No
	clr.w	$16(A0)
	bra.b	Skippy
No
	MOVE.W	D7,$16(A0)
Skippy
	MOVE.B	#1,$22(A0)
	ADDQ.W	#1,$18(A0)
	BRA.L	lbC000A12

lbC000AE4	MOVE.B	(A1)+,$27(A0)
	MOVE.B	(A1)+,$28(A0)
	ADDQ.W	#3,$18(A0)
	BRA.L	lbC000A12

lbC000AF4	MOVE.B	D7,$32(A0)
	MOVE.B	(A1)+,$2D(A0)
	ADDQ.W	#2,$18(A0)
	BRA.L	lbC000A12

lbC000B04	MOVE.B	#1,$32(A0)
	ADDQ.W	#1,$18(A0)
	BRA.L	lbC000A12

lbC000B12	MOVE.B	#2,$32(A0)
	ADDQ.W	#1,$18(A0)
	BRA.L	lbC000A12

lbC000B20
	tst.b	TypePlay
	beq.w	lbC000A9A

	MOVE.B	#0,D1
	MOVE.B	(A1)+,D1
	MOVEA.L	lbL000F4E(PC),A1
	ADD.W	D1,D1
	MOVEA.W	0(A2,D1.W),A1
	ADDA.L	lbL000F66(PC),A1
	MOVE.L	A1,8(A0)
	MOVE.W	D7,$18(A0)
	BRA.L	lbC000A12

lbC000B40	MOVE.B	(A1)+,$25(A0)
	ADDQ.W	#2,$18(A0)
	BRA.L	lbC0009FC

lbC000B4C	ADDQ.L	#1,A1
	ADDQ.W	#2,$18(A0)
	BRA.L	lbC000A12

lbC000B56
	tst.b	TypePlay
	beq.w	lbC000A46

	MOVE.B	#$20,$1F(A0)
	MOVE.B	(A1)+,$2C(A0)
	ADDQ.W	#2,$18(A0)
	BRA.L	lbC000A12

lbC000B68	MOVE.B	D0,$26(A0)
	ADDQ.W	#1,$18(A0)
lbC000B70	TST.B	$24(A0)
	BEQ.S	lbC000B7E
	SUBQ.B	#1,$24(A0)
	BRA.L	lbC000BE8

lbC000B7E	SUBQ.B	#1,$22(A0)
	BNE.L	lbC000BE8
	MOVE.B	$23(A0),$22(A0)
	MOVEA.L	4(A0),A1
	ADDA.W	$16(A0),A1
lbC000B94	MOVEQ	#0,D1
	MOVE.B	(A1)+,D0
	MOVE.B	D0,D1
	SUBI.W	#$E0,D1
	BMI.S	lbC000BE0
* The original jumps through a table of word offsets (lbW000BAA): E0 -> lbC000BBC1,
* E1 -> lbC000BCE, E2-E7 -> lbC000BBC (RTS), E8 -> lbC000BD6.  The transpiler cannot
* follow a label-difference table, so the same dispatch is written out.
	TST.W	D1
	BEQ.w	lbC000BBC1
	CMP.W	#1,D1
	BEQ.w	lbC000BCE
	CMP.W	#8,D1
	BEQ.w	lbC000BD6
	RTS

lbC000BBC
	rts

lbC000BBC1	MOVEQ	#0,D1
	MOVE.B	(A1)+,D1

	tst.b	TypePlay
	bne.b	NoAndy
	and.w	#$3F,D1
NoAndy
	SUBQ.W	#5,D1
	MOVE.W	D1,$16(A0)
	MOVEA.L	4(A0),A1
	ADDA.W	D1,A1
	BRA.S	lbC000B94

lbC000BCE
	tst.b	TypePlay
	beq.b	lbC000BE8

	MOVE.B	-2(A1),$2F(A0)
	BRA.S	lbC000BE8

lbC000BD6	ADDQ.W	#2,$16(A0)
	MOVE.B	(A1),$24(A0)
	BRA.w	lbC000B70

lbC000BE0	MOVE.B	D0,$2F(A0)
	ADDQ.W	#1,$16(A0)
lbC000BE8	MOVE.B	$26(A0),D0
	BMI.S	lbC000BF6
	ADD.B	$1E(A0),D0
	ADD.B	$21(A0),D0
lbC000BF6	ANDI.W	#$7F,D0
	LEA	lbW000F70(PC),A1
	ADD.W	D0,D0
	MOVE.W	D0,D1
	MOVE.W	0(A1,D0.W),D0
	MOVE.B	$2E(A0),D3
	MOVE.B	$32(A0),D2
	BNE.S	lbC000C18
	BCLR	D3,(A4)
	ADDQ.W	#3,D3
	BCLR	D3,(A4)
	BRA.S	lbC000C46

lbC000C18	CMP.B	#1,D2
	BNE.S	lbC000C40
	BSET	D3,(A4)
	ADDQ.W	#3,D3
	BCLR	D3,(A4)
	MOVE.B	$1E(A0),$2D(A0)
	MOVE.B	$26(A0),D4
	BPL.S	lbC000C3A
	ANDI.B	#$7F,D4
	MOVE.B	D4,$2D(A0)
	BRA.S	lbC000C46

lbC000C3A	ADD.B	D4,$2D(A0)
	BRA.S	lbC000C46

lbC000C40	BCLR	D3,(A4)
	ADDQ.W	#3,D3
	BSET	D3,(A4)
lbC000C46	TST.B	$2D(A0)
	BEQ.S	lbC000C5A
	MOVE.B	$2D(A0),D3
	NOT.B	D3
	ANDI.B	#$1F,D3
	MOVE.B	D3,1(A4)
lbC000C5A	MOVE.B	lbB000F6F(PC),D2
	BEQ.L	lbC000D1C
	TST.B	$2A(A0)
	BEQ.S	lbC000C6E
	SUBQ.B	#1,$2A(A0)
	BRA.S	lbC000CBA

lbC000C6E	MOVEQ	#0,D1
	MOVEQ	#0,D2
	MOVEQ	#0,D3
	MOVE.B	$29(A0),D1
	MOVE.B	$28(A0),D2
	MOVE.W	D2,D5
	ADD.W	D5,D5
	MOVE.B	$27(A0),D3
	MOVE.B	$2B(A0),D4
	BTST	#5,D4
	BEQ.S	lbC000C9A
	SUB.W	D3,D1
	BPL.S	lbC000CA6
	MOVEQ	#0,D1
	BCHG	#5,D4
	BRA.S	lbC000CA6

lbC000C9A	ADD.W	D3,D1
	CMP.W	D5,D1
	BLE.S	lbC000CA6
	MOVE.W	D5,D1
	BCHG	#5,D4
lbC000CA6	MOVE.B	D1,$29(A0)
	MOVE.B	D4,$2B(A0)
	SUB.W	D2,D1
	EXT.L	D1
	MULS.W	D0,D1
	ASR.L	#8,D1
	ASR.L	#2,D1
	ADD.W	D1,D0
lbC000CBA	BTST	#5,$1F(A0)
	BEQ.S	lbC000CDE
	MOVEQ	#0,D1
	MOVE.B	$2C(A0),D1
	EXT.W	D1
	EXT.L	D1
	MOVE.L	$10(A0),D2
	ADD.L	D1,D2
	MOVE.L	D2,$10(A0)
	MULS.W	D0,D2
	ASR.L	#8,D2
	ASR.W	#2,D2
	SUB.W	D2,D0
lbC000CDE

	move.w	D0,$34(A0)

	MOVE.B	$2F(A0),D1
	SUB.B	$30(A0),D1
;	SUB.W	lbW000E62(PC),D1
	SUB.B	$31(A0),D1
	BPL.S	lbC000CF2
	MOVEQ	#0,D1
lbC000CF2	MOVE.B	$33(A0),D7
	BEQ.S	lbC000D1A
	MOVE.W	D0,D2
	BTST	#1,D7
	BEQ.S	lbC000D02
	SUB.W	D0,D0
lbC000D02	BTST	#3,D7
	BEQ.S	lbC000D0E
	MOVE.W	D2,D7
	LSR.W	#3,D7
	BRA.S	lbC000D1A

lbC000D0E	BTST	#2,D7
	BNE.S	lbC000D16
	LSR.W	#1,D7
lbC000D16	MOVE.W	D2,D7
	LSR.W	#4,D7
lbC000D1A	RTS

lbC000D1C	TST.B	$2A(A0)
	BEQ.S	lbC000D2A
	SUBQ.B	#1,$2A(A0)
	BRA.L	lbC000D92

lbC000D2A	MOVE.B	D1,D5
	MOVE.B	$2B(A0),D6
	MOVE.B	$28(A0),D4
	BMI.S	lbC000D3A
	ADD.B	D4,D4
	BRA.S	lbC000D3E

lbC000D3A	ANDI.B	#$7F,D4
lbC000D3E	MOVE.B	$29(A0),D1
	TST.B	D6
	BPL.S	lbC000D4A
	BTST	D7,D6
	BNE.S	lbC000D70
lbC000D4A	BTST	#5,D6
	BNE.S	lbC000D5E
	SUB.B	$27(A0),D1
	BCC.S	lbC000D6C
	BSET	#5,D6
	MOVEQ	#0,D1
	BRA.S	lbC000D6C

lbC000D5E	ADD.B	$27(A0),D1
	CMP.B	D4,D1
	BCS.S	lbC000D6C
	BCLR	#5,D6
	MOVE.B	D4,D1
lbC000D6C	MOVE.B	D1,$29(A0)
lbC000D70	LSR.B	#1,D4
	SUB.B	D4,D1
	BCC.S	lbC000D7A
	SUBI.W	#$100,D1
lbC000D7A	ADDI.B	#$A0,D5
	BCS.S	lbC000D8A
lbC000D80	ADD.W	D1,D1
	ADDI.B	#$18,D5
	BCC.L	lbC000D80
lbC000D8A	ADD.W	D1,D0
	BCHG	D7,D6
	MOVE.B	D6,$2B(A0)
lbC000D92	BTST	#5,$1F(A0)
	BEQ.S	lbC000DB4
	MOVEQ	#0,D1
	MOVE.B	$2C(A0),D1
	EXT.W	D1
	SWAP	D1
	ASR.L	#4,D1
	MOVE.L	$10(A0),D2
	ADD.L	D1,D2
	MOVE.L	D2,$10(A0)
	SWAP	D2
	SUB.W	D2,D0
lbC000DB4

	move.w	D0,$34(A0)

	MOVE.B	$2F(A0),D1
	SUB.B	$30(A0),D1
;	SUB.W	lbW000E62(PC),D1
	SUB.B	$31(A0),D1
	BPL.S	lbC000DC8
	MOVEQ	#0,D1
lbC000DC8	RTS

lbL000E26
	dc.l	0		; YM-2149 LSB period base (canal A)
	dc.l	$1000000	; YM-2149 MSB period base (canal A)
	dc.l	$2000000	; YM-2149 LSB period base (canal B)
	dc.l	$3000000	; YM-2149 MSB period base (canal B)
	dc.l	$4000000	; YM-2149 LSB period base (canal C)
	dc.l	$5000000	; YM-2149 MSB period base (canal C)
	dc.l	$6000000	; Noise period
	dc.l	$700FF00	; Mixer control
	dc.l	$8000000	; YM-2149 volume base register (canal A)
	dc.l	$9000000	; YM-2149 volume base register (canal B)
	dc.l	$A000000	; YM-2149 volume base register (canal C)
;	dc.l	0
;	dc.l	$2062200
;	dc.l	$A0E2600
;	dc.l	$12162A00
;lbW000E62	dc.w	0
lbL000E64	dc.w	0
;	dc.w	0
;	dc.l	0
lbW000E6C	dc.w	4
lbW000E6E	dc.w	4
lbW000E70	dc.w	$FF00
lbL000E72	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0

SID1
	ds.b	4

lbL000EA6	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0

SID2
	ds.b	4

lbL000EDA	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0

SID3
	ds.b	4

;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.l	0
;	dc.w	$40
lbW000F44	dc.w	0
lbL000F46	dc.l	0
lbL000F4A	dc.l	0
lbL000F4E	dc.l	0
lbL000F52	dc.l	0
;	dc.w	0
;lbW000F58	dc.w	0
lbL000F5A	dc.l	0
	dc.l	0
;	dc.l	0
lbL000F66	dc.l	0
lbL000F6A	dc.l	0
	dc.b	0
lbB000F6F	dc.b	0
lbW000F70	dc.w	$EEE
	dc.w	$E17
	dc.w	$D4D
	dc.w	$C8E
	dc.w	$BD9
	dc.w	$B2F
	dc.w	$A8E
	dc.w	$9F7
	dc.w	$967
	dc.w	$8E0
	dc.w	$861
	dc.w	$7E8
	dc.w	$777
	dc.w	$70B
	dc.w	$6A6
	dc.w	$647
	dc.w	$5EC
	dc.w	$597
	dc.w	$547
	dc.w	$4FB
	dc.w	$4B3
	dc.w	$470
	dc.w	$430
	dc.w	$3F4
	dc.w	$3BB
	dc.w	$385
	dc.w	$353
	dc.w	$323
	dc.w	$2F6
	dc.w	$2CB
	dc.w	$2A3
	dc.w	$27D
	dc.w	$259
	dc.w	$238
	dc.w	$218
	dc.w	$1FA
	dc.w	$1DD
	dc.w	$1C2
	dc.w	$1A9
	dc.w	$191
	dc.w	$17B
	dc.w	$165
	dc.w	$151
	dc.w	$13E
	dc.w	$12C
	dc.w	$11C
	dc.w	$10C
	dc.w	$FD
	dc.w	$EE
	dc.w	$E1
	dc.w	$D4
	dc.w	$C8
	dc.w	$BD
	dc.w	$B2
	dc.w	$A8
	dc.w	$9F
	dc.w	$96
	dc.w	$8E
	dc.w	$86
	dc.w	$7E
	dc.w	$77
	dc.w	$70
	dc.w	$6A
	dc.w	$64
	dc.w	$5E
	dc.w	$59
	dc.w	$54
	dc.w	$4F
	dc.w	$4B
	dc.w	$47
	dc.w	$43
	dc.w	$3F
	dc.w	$3B
	dc.w	$38
	dc.w	$35
	dc.w	$32
	dc.w	$2F
	dc.w	$2C
	dc.w	$2A
	dc.w	$27
	dc.w	$25
	dc.w	$23
	dc.w	$21
	dc.w	$1F
	dc.w	$1D
	dc.w	$1C
	dc.w	$1A
	dc.w	$19
	dc.w	$17
	dc.w	$16
	dc.w	$15
	dc.w	$13
	dc.w	$12
	dc.w	$11
	dc.w	$10
	dc.w	15
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0

RepStart	dc.l	0
RepLen		dc.w	0
lbL0004BE	dc.l	0
lbW0004C2	dc.w	0
lbW0004C4	dc.w	$240
lbW0004C6	dc.w	$40
lbW0004C8	dc.w	0
lbL001478	ds.b	4
SIDword		ds.b	2
lbL001470	ds.b	2
	even
lbL001070	ds.b	2
