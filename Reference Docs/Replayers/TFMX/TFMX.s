; !!!!
	XDEF	_tfmx_init,_tfmx_music,_tfmx_end
	XREF	_adr_data,_adr_data2,_num_musique
; !!!!

_tfmx_init
	LEA	tfmx_data,A0
	MOVE.L	_adr_data,D0
	MOVE.L	_adr_data2,D1
	JSR	$34(A0)
	jsr	_tfmx_init2
	RTS

_tfmx_init2:
	LEA	tfmx_data,A0
	MOVE.l	_num_musique,D0
	JSR	$2C(A0)
	RTS

_tfmx_music
	LEA	tfmx_data,A0
	JSR	$24(A0)
	RTS

_tfmx_end:
	LEA	tfmx_data,A0
	JSR	$28(A0)
	RTS

tfmx_data	dc.l	$3F3
	dc.l	0
	dc.l	1
	dc.l	0
	dc.l	0
	dc.l	$4A2
	dc.l	$3E9
	dc.l	$4A2

tfmx23	BRA	tfmx1

	BRA	tfmx3

	BRA	tfmx88

	BRA	tfmx89

	BRA	tfmx21

	BRA	tfmx90

	BRA	tfmx91

	BRA	tfmx92

	BRA	tfmx17

	BRA	tfmx93

	BRA	tfmx94

	BRA	tfmx95

	BRA	tfmx96

	BRA	tfmx97

	BRA	tfmx98

	BRA	tfmx99

	BRA	tfmx100

	BRA	tfmx101

	BRA	tfmx101

	BRA	tfmx102

tfmx3	MOVEM.L	D0-D7/A0-A6,-(SP)
	LEA	tfmxd1(PC),A6
	TST.W	$3C(A6)
	BMI.S	tfmx4
	BSR	tfmx5
	BRA.S	tfmx6

tfmx4	TST.W	8(A6)
	BEQ.S	tfmx7
	TST.W	$2E(A6)
	BNE.S	tfmx8
tfmx7	LEA	tfmxd2(PC),A0
	CLR.W	0(A0)
	BRA	tfmx6

tfmx8	BSR.S	tfmx9
	BSR	tfmx10
tfmx6	MOVEM.L	(SP)+,D0-D7/A0-A6
tfmx107	RTS

tfmx9	LEA	tfmxd3(PC),A5
	MOVE.L	0(A6),A4
	TST.W	$2C(A6)
	BEQ.S	tfmx11
	SUB.W	#1,$2C(A6)
	RTS

tfmx11	MOVE.W	6(A5),$2C(A6)
tfmx14	TST.W	$3E(A6)
	BEQ	tfmx12
	TST.W	10(A6)
	BEQ	tfmx12
	CLR.W	$2C(A6)
	CLR.W	10(A6)
	MOVE.W	#1,$44(A6)
	RTS

tfmx12	MOVE.L	A5,A0
	CLR.B	10(A6)
	BSR.S	tfmx13
	TST.B	10(A6)
	BNE.S	tfmx14
	ADDQ.L	#4,A0
	BSR.S	tfmx13
	TST.B	10(A6)
	BNE.S	tfmx14
	ADDQ.L	#4,A0
	BSR.S	tfmx13
	TST.B	10(A6)
	BNE.S	tfmx14
	ADDQ.L	#4,A0
	BSR.S	tfmx13
	TST.B	10(A6)
	BNE.S	tfmx14
	ADDQ.L	#4,A0
	BSR.S	tfmx13
	TST.B	10(A6)
	BNE.S	tfmx14
	ADDQ.L	#4,A0
	BSR.S	tfmx13
	TST.B	10(A6)
	BNE.S	tfmx14
	ADDQ.L	#4,A0
	BSR.S	tfmx13
	TST.B	10(A6)
	BNE.S	tfmx14
	ADDQ.L	#4,A0
	BSR.S	tfmx13
	TST.B	10(A6)
	BNE.S	tfmx14
	RTS

tfmx13	CMP.B	#$90,$48(A0)
	BCS.S	tfmx15
	CMP.B	#$FE,$48(A0)
	BNE.S	tfmx16
	MOVE.B	#$FF,$48(A0)
	MOVE.B	$49(A0),D0
	TST.W	8(A0)
	BEQ	tfmx17
	RTS

tfmx15	TST.W	$6A(A0)
	BEQ.S	tfmx18
	SUB.W	#1,$6A(A0)
tfmx16	RTS

tfmx18	MOVE.W	$68(A0),D0
	ASL.W	#2,D0
	MOVE.L	$28(A0),A1
	MOVE.L	0(A1,D0.W),$28(A6)
	CMP.B	#$F0,$28(A6)
	BCC.S	tfmx19
	MOVE.B	$49(A0),D0
	ADD.B	D0,$28(A6)
	MOVE.L	$28(A6),D0
	TST.W	8(A0)
	BNE.S	tfmx20
	BSR	tfmx21
tfmx20	BRA.S	tfmx22

tfmx19	MOVE.B	$28(A6),D0
	AND.W	#15,D0
	ASL.W	#2,D0
	LEA	tfmxd4(PC),A1
	MOVE.L	0(A1,D0.W),D1
	LEA	tfmx23(PC),A1
	ADD.L	D1,A1
	JMP	(A1)

tfmx22	ADD.W	#1,$68(A0)
	BRA.S	tfmx18

tfmx31	ADD.W	#1,$68(A0)
	RTS

	CMP.B	#$81,$48(A0)
	BEQ	tfmx24
	MOVE.W	4(A5),D0
	CMP.W	2(A5),D0
	BNE.S	tfmx25
	MOVE.W	0(A5),4(A5)
	BRA.S	tfmx26

tfmx25	ADD.W	#1,4(A5)
tfmx26	BSR	tfmx27
	MOVE.W	#$FFFF,10(A6)
	RTS

	TST.B	$4A(A0)
	BEQ.S	tfmx28
	CMP.B	#$FF,$4A(A0)
	BEQ.S	tfmx29
	SUB.B	#1,$4A(A0)
	BRA.S	tfmx30

tfmx28	MOVE.B	#$FF,$4A(A0)
	BRA.S	tfmx22

tfmx29	MOVE.B	$29(A6),D0
	SUB.B	#1,D0
	MOVE.B	D0,$4A(A0)
tfmx30	MOVE.W	$2A(A6),$68(A0)
	BRA	tfmx18

	MOVE.B	$29(A6),D0
	AND.W	#$7F,D0
	MOVE.B	D0,$48(A0)
	ASL.W	#2,D0
	MOVE.L	A4,A1
	ADD.L	#$400,A1
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$28(A0)
	MOVE.W	$2A(A6),$68(A0)
	BRA	tfmx18

	MOVE.B	$29(A6),$6B(A0)
	BRA	tfmx31

	CLR.W	$40(A6)
tfmx24	MOVE.B	#$FF,$48(A0)
	RTS

	MOVE.L	$28(A6),D0
	TST.W	8(A0)
	BNE.S	tfmx32
	BSR	tfmx21
tfmx32	BRA	tfmx22

	MOVE.L	$28(A0),$88(A0)
	MOVE.W	$68(A0),$A8(A0)
	MOVE.B	$29(A6),D0
	AND.W	#$7F,D0
	MOVE.B	D0,$48(A0)
	ASL.W	#2,D0
	MOVE.L	A4,A1
	ADD.L	#$400,A1
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$28(A0)
	MOVE.W	$2A(A6),$68(A0)
	BRA	tfmx18

	MOVE.L	$88(A5),$28(A5)
	MOVE.W	$A8(A5),$68(A5)
	BRA	tfmx22

	LEA	tfmxd2(PC),A1
	TST.W	0(A1)
	BNE	tfmx22
	MOVE.W	#1,0(A1)
	MOVE.B	$2B(A6),$19(A6)
	MOVE.B	$29(A6),$1A(A6)
	MOVE.B	$29(A6),$1B(A6)
	BEQ.S	tfmx34
	MOVE.B	#1,$1C(A6)
	MOVE.B	$18(A6),D0
	CMP.B	$19(A6),D0
	BEQ.S	tfmx35
	BCS	tfmx22
	NEG.B	$1C(A6)
	BRA	tfmx22

tfmx34	MOVE.B	$19(A6),$18(A6)
tfmx35	MOVE.B	#0,$1C(A6)
	CLR.W	0(A1)
	BRA	tfmx22

tfmxd4	dc.l	$1A6
	dc.l	$1D4
	dc.l	$208
	dc.l	$232
	dc.l	$240
	dc.l	$248
	dc.l	$248
	dc.l	$248
	dc.l	$25A
	dc.l	$290
	dc.l	$2A0
	dc.l	$19E
	dc.l	$19E
	dc.l	$19E
	dc.l	$23C
	dc.l	$196

tfmx27	MOVEM.L	D0/A0/A1,-(SP)
tfmx47	MOVEQ	#0,D0
	MOVE.W	4(A5),D0
	ASL.W	#4,D0
	ADD.L	A4,D0
	ADD.L	#$800,D0
	MOVE.L	D0,A0
	MOVE.L	A4,A1
	ADD.L	#$400,A1
	MOVE.W	(A0)+,D0
	CMP.W	#$EFFE,D0
	BNE.S	tfmx36
	MOVE.W	(A0)+,D0
	CMP.W	#5,D0
	BCS.S	tfmx38
	MOVEQ	#0,D0
tfmx38	ASL.W	#2,D0
	LEA	tfmx4d(PC),A1
	MOVE.L	0(A1,D0.W),D0
	LEA	tfmx23(PC),A1
	ADD.L	D0,A1
	JMP	(A1)

tfmx36	MOVE.W	D0,$48(A5)
	BMI.S	tfmx37
	AND.W	#$7F00,D0
	ROR.W	#6,D0
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$28(A5)
	CLR.L	$68(A5)
	MOVE.W	#$FFFF,$4A(A5)
tfmx37	MOVE.W	(A0)+,D0
	MOVE.W	D0,$4C(A5)
	BMI.S	tfmx39
	AND.W	#$7F00,D0
	ROR.W	#6,D0
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$2C(A5)
	CLR.L	$6C(A5)
	MOVE.W	#$FFFF,$4E(A5)
tfmx39	MOVE.W	(A0)+,D0
	MOVE.W	D0,$50(A5)
	BMI.S	tfmx40
	AND.W	#$7F00,D0
	ROR.W	#6,D0
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$30(A5)
	CLR.L	$70(A5)
	MOVE.W	#$FFFF,$52(A5)
tfmx40	MOVE.W	(A0)+,D0
	MOVE.W	D0,$54(A5)
	BMI.S	tfmx41
	AND.W	#$7F00,D0
	ROR.W	#6,D0
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$34(A5)
	CLR.L	$74(A5)
	MOVE.W	#$FFFF,$56(A5)
tfmx41	MOVE.W	(A0)+,D0
	MOVE.W	D0,$58(A5)
	BMI.S	tfmx42
	AND.W	#$7F00,D0
	ROR.W	#6,D0
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$38(A5)
	CLR.L	$78(A5)
	MOVE.W	#$FFFF,$5A(A5)
tfmx42	MOVE.W	(A0)+,D0
	MOVE.W	D0,$5C(A5)
	BMI.S	tfmx43
	AND.W	#$7F00,D0
	ROR.W	#6,D0
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$3C(A5)
	CLR.L	$7C(A5)
	MOVE.W	#$FFFF,$5E(A5)
tfmx43	MOVE.W	(A0)+,D0
	MOVE.W	D0,$60(A5)
	BMI.S	tfmx44
	AND.W	#$7F00,D0
	ROR.W	#6,D0
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$40(A5)
	CLR.L	$80(A5)
	MOVE.W	#$FFFF,$62(A5)
tfmx44	TST.W	$40(A6)
	BNE.S	tfmx45
	MOVE.W	(A0)+,D0
	MOVE.W	D0,$64(A5)
	BMI.S	tfmx45
	AND.W	#$7F00,D0
	ROR.W	#6,D0
	MOVE.L	0(A1,D0.W),D0
	ADD.L	A4,D0
	MOVE.L	D0,$44(A5)
	CLR.L	$84(A5)
	MOVE.W	#$FFFF,$66(A5)
tfmx45	MOVEM.L	(SP)+,D0/A0/A1
	RTS

	BSR	tfmx46
	CLR.W	$2E(A6)
	LEA	tfmxd2(PC),A1
	MOVE.W	#2,2(A1)
	MOVEM.L	(SP)+,D0/A0/A1
	RTS

	MOVE.W	(A0),4(A5)
	BRA	tfmx47

	MOVE.W	(A0),6(A5)
	MOVE.W	(A0),$2C(A6)
	ADD.W	#1,4(A5)
	BRA	tfmx47

	MOVE.W	(A0),$3E(A6)
	ADD.W	#1,4(A5)
	BRA	tfmx47

	ADD.W	#1,4(A5)
	LEA	tfmxd2(PC),A1
	TST.W	0(A1)
	BNE	tfmx47
	MOVE.W	#1,0(A1)
	MOVE.B	3(A0),$19(A6)
	MOVE.B	1(A0),$1A(A6)
	MOVE.B	1(A0),$1B(A6)
	BEQ.S	tfmx48
	MOVE.B	#1,$1C(A6)
	MOVE.B	$18(A6),D0
	CMP.B	$19(A6),D0
	BEQ.S	tfmx49
	BCS	tfmx47
	NEG.B	$1C(A6)
	BRA	tfmx47

tfmx48	MOVE.B	$19(A6),$18(A6)
tfmx49	MOVE.B	#0,$1C(A6)
	CLR.W	0(A1)
	BRA	tfmx47

tfmx4d	dc.l	$496
	dc.l	$4AA
	dc.l	$4B2
	dc.l	$4C4
	dc.l	$4D2

tfmx10	LEA	tfmxd1(PC),A6
	LEA	tfmxd5(PC),A5
	LEA	$DFF0A0,A4
	BSR.S	tfmx50
	ADD.L	#4,A5
	ADD.L	#$10,A4
	BSR.S	tfmx50
	ADD.L	#4,A5
	ADD.L	#$10,A4
	BSR.S	tfmx50
	ADD.L	#4,A5
	ADD.L	#$10,A4
tfmx50	TST.W	2(A5)
	BEQ.S	tfmx51
	BPL.S	tfmx52
tfmx51	TST.W	$100(A5)
	BMI.S	tfmx53
	SUB.W	#1,$100(A5)
	BRA.S	tfmx54

tfmx53	CLR.B	$103(A5)
tfmx54	BSR	tfmx55
	BSR	tfmx56
	BSR	tfmx57
	TST.B	$1C(A6)
	BEQ.S	tfmx58
	SUB.B	#1,$1A(A6)
	BNE.S	tfmx58
	MOVE.B	$1B(A6),$1A(A6)
	MOVE.B	$1C(A6),D0
	ADD.B	D0,$18(A6)
	MOVE.B	$19(A6),D0
	CMP.B	$18(A6),D0
	BNE.S	tfmx58
	CLR.B	$1C(A6)
	LEA	tfmxd2(PC),A0
	CLR.W	0(A0)
tfmx58	MOVEQ	#0,D1
	MOVE.B	$18(A6),D1
	MOVEQ	#0,D0
	MOVE.B	$60(A5),D0
	CMP.W	#$40,D1
	BEQ.S	tfmx59
	ASL.W	#2,D0
	MULU	D1,D0
	LSR.W	#8,D0
	AND.W	#$7F,0
tfmx59	MOVE.W	D0,8(A4)
tfmx52	TST.W	2(A5)
	BEQ.S	tfmx104
	BMI.S	tfmx105
	CLR.W	$40(A5)
	MOVE.W	$44(A6),$42(A5)
	MOVE.W	#$FFFF,2(A5)
	MOVE.W	#$FFFF,$62(A5)
tfmx105	TST.W	$42(A5)
	BEQ.S	tfmx60
	SUB.W	#1,$42(A5)
tfmx104	RTS

tfmx60	MOVE.L	$30(A5),A0
	MOVE.W	$40(A5),D0
	ASL.W	#2,D0
	MOVE.L	0(A0,D0.W),$28(A6)
	MOVE.B	$28(A6),D0
	AND.W	#$FF,D0
	CMP.W	#$1A,D0
	BCC.S	tfmx62
	ASL.W	#2,D0
	LEA	tfmxd10(PC),A0
	MOVE.L	0(A0,D0.W),D1
	LEA	tfmx23(PC),A0
	ADD.L	D1,A0
	JMP	(A0)

tfmx62	ADD.W	#1,$40(A5)
	RTS

tfmx61	ADD.W	#1,$40(A5)
	BRA.S	tfmx60

	CLR.B	$70(A5)
	CLR.B	$92(A5)
	CLR.W	$C0(A5)
	MOVE.W	$52(A5),$DFF096
	BRA.S	tfmx61

	MOVE.W	$50(A5),$DFF096
	BRA.S	tfmx61

	MOVE.L	$28(A6),D0
	AND.L	#$FFFFFF,D0
	ADD.L	4(A6),D0
	MOVE.L	D0,$B0(A5)
	MOVE.L	D0,(A4)
	BRA.S	tfmx61

	MOVE.W	$2A(A6),$D0(A5)
	MOVE.W	$2A(A6),4(A4)
	BRA.S	tfmx61

	MOVE.W	$2A(A6),$42(A5)
	BRA.S	tfmx62

tfmx112	TST.B	$62(A5)
	BEQ.S	tfmx63
	CMP.B	#$FF,$62(A5)
	BEQ.S	tfmx64
	SUB.B	#1,$62(A5)
	BRA.S	tfmx65

tfmx63	MOVE.B	#$FF,$62(A5)
	BRA.S	tfmx61

tfmx64	MOVE.B	$29(A6),D0
	SUB.B	#1,D0
	MOVE.B	D0,$62(A5)
tfmx65	MOVE.W	$2A(A6),$40(A5)
	BRA	tfmx60

	MOVE.B	$29(A6),D0
	AND.L	#$7F,D0
	MOVE.L	0(A6),A0
	ASL.W	#2,D0
	ADD.L	D0,A0
	MOVE.L	$600(A0),D0
	ADD.L	0(A6),D0
	MOVE.L	D0,$30(A5)
	MOVE.W	$2A(A6),$40(A5)
	BRA	tfmx52

	CLR.W	2(A5)
	RTS

	MOVE.B	$29(A6),D0
	ADD.B	$11(A5),D0
	AND.W	#$FF,D0
	ASL.W	#1,D0
	LEA	tfmxd6(PC),A0
	MOVE.W	$22(A5),D1
	EXT.W	D1
	MOVE.W	0(A0,D0.W),D0
	ADD.W	D1,D0
	ADD.W	$2A(A6),D0
	MOVE.W	D0,$A0(A5)
	TST.W	$C0(A5)
	BNE	tfmx62
	MOVE.W	D0,6(A4)
	BRA	tfmx62

	MOVE.B	$29(A6),D0
	AND.W	#$FF,D0
	ASL.W	#1,D0
	LEA	tfmxd6(PC),A0
	MOVE.W	0(A0,D0.W),D0
	ADD.W	$2A(A6),D0
	MOVE.W	D0,$A0(A5)
	TST.W	$C0(A5)
	BNE	tfmx62
	MOVE.W	D0,6(A4)
	BRA	tfmx62

	MOVE.W	$2A(A6),$A0(A5)
	TST.W	$C0(A5)
	BNE	tfmx61
	MOVE.W	$2A(A6),6(A4)
	BRA	tfmx61

	MOVE.B	$29(A6),$82(A5)
	MOVE.B	#1,$83(A5)
	MOVE.W	$2A(A6),$C0(A5)
	MOVE.W	$A0(A5),$C2(A5)
	BRA	tfmx61

	MOVE.B	$29(A6),D0
	AND.B	#$FE,D0
	MOVE.B	D0,$92(A5)
	LSR.B	#1,D0
	MOVE.B	D0,$93(A5)
	MOVE.B	$2B(A6),$80(A5)
	MOVE.B	#1,$81(A5)
	TST.W	$C0(A5)
	BNE	tfmx61
	MOVE.W	$A0(A5),6(A4)
	CLR.W	$90(A5)
	BRA	tfmx61

	MOVE.W	$20(A5),D0
	ASL.W	#1,D0
	ADD.W	$20(A5),D0
	ADD.W	$2A(A6),D0
	MOVE.B	D0,$60(A5)
	BRA	tfmx61

	MOVE.B	$2B(A6),$60(A5)
	BRA	tfmx61

	MOVE.B	$2A(A6),$70(A5)
	MOVE.B	$29(A6),$73(A5)
	MOVE.B	$2A(A6),$71(A5)
	MOVE.B	$2B(A6),$72(A5)
	BRA	tfmx61

	TST.B	$D2(A5)
	BNE	tfmx112
	BRA	tfmx61

	MOVE.W	$2A(A6),D0
	EXT.L	D0
	MOVE.L	$B0(A5),D1
	ADD.L	D0,D1
	MOVE.L	D1,$B0(A5)
	MOVE.L	D1,(A4)
	BRA	tfmx61

	MOVE.W	$2A(A6),D0
	MOVE.W	$D0(A5),D1
	ADD.W	D0,D1
	MOVE.W	D1,$D0(A5)
	MOVE.W	D1,4(A4)
	BRA	tfmx61

	CLR.B	$70(A5)
	CLR.B	$92(A5)
	CLR.W	$C0(A5)
	BRA	tfmx61

	MOVE.W	$52(A5),$DFF096
	BRA	tfmx61

	TST.B	$D2(A5)
	BEQ	tfmx61
	TST.B	$62(A5)
	BEQ.S	tfmx66
	CMP.B	#$FF,$62(A5)
	BEQ.S	tfmx67
	SUB.B	#1,$62(A5)
	BRA.S	tfmx68

tfmx66	MOVE.B	#$FF,$62(A5)
	BRA	tfmx61

tfmx67	MOVE.B	$2B(A6),D0
	SUB.B	#1,D0
	MOVE.B	D0,$62(A5)
tfmx68	RTS

	MOVE.L	$30(A5),$E0(A5)
	MOVE.W	$40(A5),$F0(A5)
	MOVE.B	$29(A6),D0
	AND.L	#$7F,D0
	MOVE.L	0(A6),A0
	ASL.W	#2,D0
	ADD.L	D0,A0
	MOVE.L	$600(A0),D0
	ADD.L	0(A6),D0
	MOVE.L	D0,$30(A5)
	MOVE.W	$2A(A6),$40(A5)
	BRA	tfmx52

	MOVE.L	$E0(A5),$30(A5)
	MOVE.W	$F0(A5),$40(A5)
	BRA	tfmx61

	MOVE.L	$28(A6),D0
	AND.L	#$FFFF,D0
	ADD.L	D0,$B0(A5)
	MOVE.L	$B0(A5),(A4)
	LSR.W	#1,D0
	SUB.W	D0,$D0(A5)
	MOVE.W	$D0(A5),4(A4)
	BRA	tfmx61

	MOVE.L	4(A6),$B0(A5)
	MOVE.L	4(A6),(A4)
	MOVE.W	#1,$D0(A5)
	MOVE.W	#1,4(A4)
	BRA	tfmx61

tfmxd10	dc.l	$662
	dc.l	$678
	dc.l	$682
	dc.l	$698
	dc.l	$6A6
	dc.l	$6AE
	dc.l	$6E2
	dc.l	$70A
	dc.l	$710
	dc.l	$746
	dc.l	$84C
	dc.l	$788
	dc.l	$7A4
	dc.l	$7D8
	dc.l	$7EE
	dc.l	$7F8
	dc.l	$814
	dc.l	$820
	dc.l	$836
	dc.l	$85C
	dc.l	$868
	dc.l	$89E
	dc.l	$8D2
	dc.l	$770
	dc.l	$8E2
	dc.l	$904

tfmx55	TST.B	$92(A5)
	BEQ.S	tfmx69
	MOVE.B	$80(A5),D0
	EXT.W	D0
	ADD.W	D0,$90(A5)
	MOVE.W	$90(A5),D0
	ADD.W	$A0(A5),D0
	TST.W	$C0(A5)
	BNE.S	tfmx70
	MOVE.W	D0,6(A4)
tfmx70	SUB.B	#1,$93(A5)
	BNE.S	tfmx69
	MOVE.B	$92(A5),$93(A5)
	EOR.B	#$FF,$80(A5)
	ADD.B	#1,$80(A5)
tfmx69	RTS

tfmx56	TST.W	$C0(A5)
	BEQ.S	tfmx69
	SUB.B	#1,$83(A5)
	BNE.S	tfmx69
	MOVE.B	$82(A5),$83(A5)
	MOVE.W	$A0(A5),D1
	MOVE.W	$C2(A5),D0
	CMP.W	D1,D0
	BEQ.S	tfmx69
	BCS.S	tfmx71
	SUB.W	$C0(A5),D0
	CMP.W	D1,D0
	BEQ.S	tfmx72
	BCC.S	tfmx73
tfmx72	CLR.W	$C0(A5)
	MOVE.W	$A0(A5),D0
tfmx73	AND.W	#$7FF,D0
	MOVE.W	D0,$C2(A5)
	MOVE.W	D0,6(A4)
	RTS

tfmx71	ADD.W	$C0(A5),D0
	CMP.W	D1,D0
	BEQ.S	tfmx72
	BCC.S	tfmx72
	BRA.S	tfmx73

tfmx57	TST.B	$70(A5)
	BEQ.S	tfmx74
	TST.B	$71(A5)
	BEQ.S	tfmx75
	SUB.B	#1,$71(A5)
tfmx74	RTS

tfmx75	MOVE.B	$70(A5),$71(A5)
	MOVE.B	$72(A5),D0
	CMP.B	$60(A5),D0
	BGT.S	tfmx76
	MOVE.B	$73(A5),D1
	SUB.B	D1,$60(A5)
	BMI	tfmx77
	CMP.B	$60(A5),D0
	BGE.S	tfmx77
	RTS

tfmx77	MOVE.B	$72(A5),$60(A5)
	CLR.B	$70(A5)
	RTS

tfmx76	MOVE.B	$73(A5),D1
	ADD.B	D1,$60(A5)
	CMP.B	$60(A5),D0
	BLE.S	tfmx77
	RTS

tfmx21	MOVEM.L	D0/A4-A6,-(SP)
	LEA	tfmxd1(PC),A6
	MOVE.L	$28(A6),-(SP)
	LEA	tfmxd5(PC),A5
	MOVE.L	D0,$28(A6)
	MOVE.B	$2A(A6),D0
	AND.L	#3,D0
	ASL.W	#2,D0
	ADD.L	D0,A5
	TST.B	$103(A5)
	BNE	tfmx78
	CMP.B	#$F7,$28(A6)
	BNE.S	tfmx79
	MOVE.B	#1,$70(A5)
	MOVE.B	$29(A6),$73(A5)
	MOVE.B	#1,$71(A5)
	MOVE.B	$2B(A6),$72(A5)
	BRA	tfmx78

tfmx79	CMP.B	#$F6,$28(A6)
	BNE.S	tfmx111
	MOVE.B	$29(A6),D0
	AND.B	#$FE,D0
	MOVE.B	D0,$92(A5)
	LSR.B	#1,D0
	MOVE.B	D0,$93(A5)
	MOVE.B	$2B(A6),$80(A5)
	MOVE.B	#1,$81(A5)
	CLR.W	$90(A5)
	BRA.S	tfmx78

tfmx111	CMP.B	#$F5,$28(A6)
	BNE.S	tfmx109
	CLR.B	$D2(A5)
	BRA.S	tfmx78

tfmx109	CMP.B	#$BF,$28(A6)
	BCC.S	tfmx110
	CMP.B	#$40,$28(A6)
	BCC.S	tfmx78
	MOVE.B	$2B(A6),$23(A5)
	MOVE.B	$2A(A6),D0
	ROR.B	#4,D0
	AND.B	#15,D0
	MOVE.B	D0,$21(A5)
	MOVE.B	$29(A6),D0
	MOVE.B	D0,$13(A5)
	MOVE.B	$28(A6),$11(A5)
	MOVE.L	0(A6),A4
	ASL.W	#2,D0
	ADD.L	D0,A4
	MOVE.L	$600(A4),A4
	ADD.L	0(A6),A4
	MOVE.L	A4,$30(A5)
	MOVE.W	#1,0(A5)
	MOVE.W	#1,2(A5)
	MOVE.B	#1,$D2(A5)
tfmx78	MOVE.L	(SP)+,$28(A6)
	MOVEM.L	(SP)+,D0/A4-A6
	RTS

tfmx110	MOVE.L	D1,-(SP)
	MOVE.B	$29(A6),$82(A5)
	MOVE.B	#1,$83(A5)
	CLR.B	$C0(A5)
	MOVE.B	$2B(A6),$C1(A5)
	MOVE.W	$A0(A5),$C2(A5)
	MOVE.B	$28(A6),D0
	AND.W	#$3F,D0
	MOVE.B	D0,$11(A5)
	ASL.W	#1,D0
	LEA	tfmxd6(PC),A4
	MOVE.W	0(A4,D0.W),$A0(A5)
	MOVE.L	(SP)+,D1
	BRA.S	tfmx78

tfmx17	MOVEM.L	A5,-(SP)
	LEA	tfmxd5(PC),A5
	AND.W	#3,D0
	ASL.W	#2,D0
	ADD.W	D0,A5
	MOVE.W	$52(A5),$DFF096
	CLR.W	2(A5)
	MOVEM.L	(SP)+,A5
	RTS

tfmx5	BTST	#5,$3D(A6)
	BNE.S	tfmx108
	BSR	tfmx88
tfmx108	CLR.W	$2E(A6)
	CLR.W	$40(A6)
	MOVE.W	#1,$44(A6)
	MOVE.L	4(A6),A4
	CLR.L	(A4)
	MOVE.L	0(A6),A4
	MOVE.W	$3C(A6),D0
	AND.L	#$1F,D0
	ASL.L	#1,D0
	ADD.L	D0,A4
	LEA	tfmxd3(PC),A5
	LEA	tfmxd7(PC),A0
	BTST	#6,$3D(A6)
	BEQ.S	tfmx80
	MOVE.W	12(A6),D1
	AND.W	#$1F,D1
	ASL.W	#1,D1
	MOVE.W	4(A5),0(A0,D1.W)
	MOVE.B	$3F(A6),$40(A0,D1.W)
	MOVE.B	7(A5),$41(A0,D1.W)
tfmx80	CLR.W	$3E(A6)
	MOVE.W	$100(A4),4(A5)
	MOVE.W	$100(A4),0(A5)
	MOVE.W	$140(A4),2(A5)
	MOVE.W	$180(A4),6(A5)
	CMP.W	#15,6(A5)
	BLS.S	tfmx81
	MOVE.W	#1,$3E(A6)
	SUB.W	#$10,6(A5)
	MOVE.W	#2,$44(A6)
tfmx81	MOVE.W	#$1C,D1
	BTST	#6,$3D(A6)
	BEQ.S	tfmx82
	MOVE.W	0(A0,D0.W),4(A5)
	MOVE.B	$40(A0,D0.W),$3F(A6)
	MOVE.B	$41(A0,D0.W),7(A5)
tfmx82	MOVE.L	tfmxd8(PC),$28(A5,D1.W)
	MOVE.W	#$FF00,$48(A5,D1.W)
	CLR.L	$68(A5,D1.W)
	SUB.W	#4,D1
	BPL.S	tfmx82
	CMP.W	#$1FF,0(A5)
	BEQ.S	tfmx83
	MOVE.L	0(A6),A4
	BSR	tfmx27
tfmx83	CLR.W	10(A6)
	CLR.W	$2C(A6)
	BSET	#1,$BFE001
	MOVE.W	#$FF,$DFF09E
	MOVE.W	$3C(A6),12(A6)
	MOVE.W	#$FFFF,$3C(A6)
	MOVE.B	#$40,$18(A6)
	MOVE.B	#$40,$19(A6)
	CLR.B	$1C(A6)
	LEA	tfmxd2(PC),A4
	CLR.W	0(A4)
	CLR.W	2(A4)
	LEA	tfmxd5(PC),A5
	CLR.B	$103(A5)
	CLR.B	$107(A5)
	CLR.B	$10B(A5)
	CLR.B	$10F(A5)
	CLR.W	$100(A5)
	CLR.W	$104(A5)
	CLR.W	$108(A5)
	CLR.W	$10C(A5)
	MOVE.W	#1,$2E(A6)
	RTS

tfmx94	MOVEM.L	A5/A6,-(SP)
	LEA	tfmxd1(PC),A6
	TST.W	$2E(A6)
	BEQ.S	tfmx84
	LEA	tfmxd2(PC),A5
	MOVE.W	#1,0(A5)
	MOVE.B	D0,$19(A6)
	SWAP	D0
	MOVE.B	D0,$1A(A6)
	MOVE.B	D0,$1B(A6)
	MOVE.B	$18(A6),D0
	MOVE.B	#1,$1C(A6)
	CMP.B	$19(A6),D0
	BEQ.S	tfmx84
	BCS.S	tfmx85
	NEG.B	$1C(A6)
	BRA.S	tfmx85

tfmx84	MOVE.B	#0,$1C(A6)
	CLR.W	0(A5)
tfmx85	MOVEM.L	(SP)+,A5/A6
	RTS

tfmx95	MOVE.L	A1,-(SP)
	LEA	tfmxd2(PC),A0
	LEA	tfmxd1(PC),A1
	MOVE.L	A1,4(A0)
	LEA	tfmxd5(PC),A1
	MOVE.L	A1,8(A0)
	LEA	tfmxd3(PC),A1
	MOVE.L	A1,12(A0)
	LEA	tfmx86(PC),A1
	MOVE.L	A1,$10(A0)
	MOVE.L	(SP)+,A1
	RTS

tfmx46	MOVE.L	A0,-(SP)
	LEA	tfmxd2(PC),A0
	MOVE.W	#1,2(A0)
	CLR.W	0(A0)
	CLR.W	$2E(A6)
	MOVE.L	(SP)+,A0
	RTS

tfmx102	RTS

tfmx97	MOVEM.L	A3-A6,-(SP)
	LEA	tfmxd1(PC),A6
	LEA	tfmxd3(PC),A5
	MOVE.W	#1,$40(A6)
	MOVE.L	0(A6),A4
	MOVE.L	A4,A3
	ADD.L	#$400,A3
	MOVE.W	D0,$64(A5)
	ASL.W	#2,D0
	MOVE.L	0(A3,D0.W),$44(A5)
	CLR.L	$84(A5)
	MOVE.W	#$FFFF,$66(A5)
	MOVEM.L	(SP)+,A3-A6
	RTS

tfmx98	MOVEM.L	A5/A6,-(SP)
	LEA	tfmxd1(PC),A6
	LEA	tfmxd3(PC),A5
	MOVE.W	#1,$40(A6)
	MOVE.W	D0,$64(A5)
	MOVE.L	A1,$44(A5)
	CLR.L	$84(A5)
	MOVE.W	#$FFFF,$66(A5)
	MOVEM.L	(SP)+,A5/A6
	RTS

tfmx99	RTS

tfmx93	BSET	#5,D0
tfmx89	MOVE.L	A6,-(SP)
	LEA	tfmxd1(PC),A6
	MOVE.W	D0,$3C(A6)
	MOVE.L	(SP)+,A6
	RTS

tfmx100	MOVE.L	A6,-(SP)
	LEA	tfmxd1(PC),A6
	BSET	#6,D0
	MOVE.W	D0,$3C(A6)
	MOVE.L	(SP)+,A6
	RTS

tfmx88	MOVEM.L	D0/A5/A6,-(SP)
	LEA	tfmxd1(PC),A6
	CLR.W	$2E(A6)
	CLR.W	$DFF0A8
	CLR.W	$DFF0B8
	CLR.W	$DFF0C8
	CLR.W	$DFF0D8
	MOVE.W	#15,$DFF096
	MOVE.W	12(A6),D0
	LEA	tfmxd7(PC),A6
	LEA	tfmxd3(PC),A5
	AND.W	#$1F,D0
	ASL.W	#1,D0
	MOVE.W	4(A5),0(A6,D0.W)
	LEA	tfmxd5(PC),A5
	CLR.W	2(A5)
	CLR.W	6(A5)
	CLR.W	10(A5)
	CLR.W	14(A5)
	MOVEM.L	(SP)+,D0/A5/A6
	RTS

tfmx90	MOVEM.L	A4-A6,-(SP)
	LEA	tfmxd1(PC),A6
	MOVE.L	D0,0(A6)
	MOVE.L	D1,4(A6)
	MOVE.W	#1,8(A6)
	LEA	tfmxd2(PC),A5
	CLR.W	2(A5)
	MOVE.L	D0,A5
	MOVE.L	D0,A4
	ADD.L	#$100,A5
	ADD.L	#$180,A4
	LEA	tfmxd7(PC),A6
	MOVE.W	#$1F,D0
tfmx87	MOVE.W	(A4)+,$40(A6)
	MOVE.W	(A5)+,(A6)+
	DBMI	D0,tfmx87

	MOVEM.L	(SP)+,A4-A6
	RTS

tfmx91	MOVEM.L	A0/A6,-(SP)
	LEA	tfmxd1(PC),A6
	MOVE.L	$6C,$10(A6)
	LEA	tfmx106(PC),A0
	MOVE.L	A0,$6C
	LEA	tfmx107(PC),A0
	LEA	tfmx86(PC),A6
	MOVE.L	A0,2(A6)
	MOVEM.L	(SP)+,A0/A6
	RTS

tfmx92	MOVE.L	A6,-(SP)
	LEA	tfmxd1(PC),A6
	MOVE.L	$10(A6),$6C
	MOVE.L	(SP)+,A6
	RTS

tfmx106	MOVEM.L	D0-D7/A0-A6,-(SP)
	MOVE.W	$DFF01E,D0
	AND.W	#$20,D0
	BEQ.S	tfmx103
	BSR	tfmx3
tfmx86	JSR	0
tfmx103	MOVEM.L	(SP)+,D0-D7/A0-A6
	MOVE.L	tfmxd9(PC),-(SP)
	RTS

tfmx101	RTS

tfmx1	MOVE.L	D0,-(SP)
	MOVE.W	#$FFF,D0
tfmx2	MOVE.W	D0,$DFF180
	DBRA	D0,tfmx2

	MOVE.L	(SP)+,D0
	RTS

tfmxd1	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
tfmxd9	dc.w	0
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
	dc.w	$78
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	$FFFF
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	1
tfmxd5	dc.w	0
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
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	$8201
	dc.w	1
	dc.w	$8202
	dc.w	2
	dc.w	$8204
	dc.w	4
	dc.w	$8208
	dc.w	8
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
tfmxd3	dc.w	0
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
	dc.w	0
	dc.w	0
	dc.w	0
tfmxd7	dc.w	0
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
tfmxd2	dc.w	0
	dc.w	2
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	0
	dc.w	$45A
	dc.w	0
	dc.w	$200
	dc.w	0
	dc.w	$8812
	dc.w	0
	dc.w	$80
	dc.w	0
	dc.w	0
tfmxd8	dc.w	$F400
	dc.w	0
	dc.w	$F000
	dc.w	0
tfmxd6	dc.w	$6AE
	dc.w	$64E
	dc.w	$5F4
	dc.w	$59E
	dc.w	$54D
	dc.w	$501
	dc.w	$4B9
	dc.w	$475
	dc.w	$435
	dc.w	$3F9
	dc.w	$3C0
	dc.w	$38C
	dc.w	$358
	dc.w	$32A
	dc.w	$2FC
	dc.w	$2D0
	dc.w	$2A8
	dc.w	$282
	dc.w	$25E
	dc.w	$23B
	dc.w	$21B
	dc.w	$1FD
	dc.w	$1E0
	dc.w	$1C6
	dc.w	$1AC
	dc.w	$194
	dc.w	$17D
	dc.w	$168
	dc.w	$154
	dc.w	$140
	dc.w	$12F
	dc.w	$11E
	dc.w	$10E
	dc.w	$FE
	dc.w	$F0
	dc.w	$E3
	dc.w	$D6
	dc.w	$CA
	dc.w	$BF
	dc.w	$B4
	dc.w	$AA
	dc.w	$A0
	dc.w	$97
	dc.w	$8F
	dc.w	$87
	dc.w	$7F
	dc.w	$78
	dc.w	$71
	dc.w	$D6
	dc.w	$CA
	dc.w	$BF
	dc.w	$B4
	dc.w	$AA
	dc.w	$A0
	dc.w	$97
	dc.w	$8F
	dc.w	$87
	dc.w	$7F
	dc.w	$78
	dc.w	$71
	dc.w	$D6
	dc.w	$CA
	dc.w	$BF
	dc.w	$B4

tfmx96	RTS

