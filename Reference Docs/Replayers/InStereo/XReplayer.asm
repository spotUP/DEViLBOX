**********************************************************************
	SECTION xx000000,CODE
j1	BRA	_InitReplayer
 
j2	BRA	_TermReplayer
 
j3	BRA	_StartSong
 
j4	BRA	_StopSong
 
j5	BRA	_SynthEffect
 
HardCalc	MOVEM.L	D0-D7/A0-A6,-(SP)
	LEA	Module,A0
	LEA	8(A0),A0
	MOVE.L	4(A0),D0
	MULU	#10,D0
	LEA	8(A0),A0
	LEA	_SongStructs(PC),A1
	MOVE.L	A0,(A1)
	ADD.L	D0,A0
	MOVE.L	4(A0),D0
	MULU	#$10,D0
	LEA	8(A0),A0
	LEA	_OverTable(PC),A1
	MOVE.L	A0,(A1)
	ADD.L	D0,A0
	MOVE.L	4(A0),D0
	MULU	#4,D0
	LEA	8(A0),A0
	LEA	_NoteTable(PC),A1
	MOVE.L	A0,(A1)
	ADD.L	D0,A0
	MOVE.L	4(A0),D0
	MOVE.L	D0,D1
	MULU	#$10,D1
	MOVE.L	D0,D2
	MULU	#$14,D2
	MOVE.L	D0,D3
	MULU	#4,D3
	MOVE.L	D0,D4
	LEA	8(A0),A0
	LEA	_SampleInstr(PC),A1
	MOVE.L	A0,(A1)
	ADD.L	D1,A0
	ADD.L	D2,A0
	ADD.L	D3,A0
	ADD.L	D3,A0
	MOVE.L	D4,D3
	SUBQ.W	#1,D3
	LEA	_SaList(PC),A1
lbC000090	MOVE.L	(A0)+,(A1)+
	DBRA	D3,lbC000090
	MOVE.L	D4,D3
	ASL.L	#2,D3
	LEA	_SaAddrList(PC),A1
	LEA	4(A1,D3.W),A1
	LEA	_SaList(PC),A2
	LEA	4(A2,D3.W),A2
	SUBQ.W	#1,D4
lbC0000AC	MOVE.L	A0,-(A1)
	ADD.L	-(A2),A0
	DBRA	D4,lbC0000AC
	BRA.S	xxx
 
search	ADDQ.L	#2,A0
xxx	MOVEQ.L	#0,D0
	MOVE.W	(A0),D0
	SWAP	D0
	MOVE.W	2(A0),D0
	CMP.L	#'SYNT',D0
	BNE.S	search
	LEA	8(A0),A0
	LEA	_SynthInstr(PC),A1
	MOVE.L	A0,(A1)
	MOVEM.L	(SP)+,D0-D7/A0-A6
	RTS	
 
Init_Song	MOVEM.L	D1/A0/A1,-(SP)
	LEA	$00DFF000,A0
	MOVE.W	#15,$0096(A0)
	MOVE.W	#$00FF,$009E(A0)
	MOVE.W	#$0780,$009A(A0)
	MOVE.W	#$0780,$009C(A0)
	CLR.W	$00A8(A0)
	CLR.W	$00B8(A0)
	CLR.W	$00C8(A0)
	CLR.W	$00D8(A0)
	LEA	WasteTab0(PC),A0
	MOVEQ.L	#$6F,D1
lbC000112	CLR.B	(A0)+
	DBRA	D1,lbC000112
	MOVE.L	_SongStructs,A0
	MULU	#10,D0
	ADD.L	D0,A0
	LEA	SongSpeed(PC),A1
	MOVEQ.L	#9,D1
lbC000128	MOVE.B	(A0)+,(A1)+
	DBRA	D1,lbC000128
	LEA	WasteTab0(PC),A0
	CLR.B	3(A0)
	LEA	WasteTab1(PC),A0
	CLR.B	3(A0)
	LEA	WasteTab2(PC),A0
	CLR.B	3(A0)
	LEA	WasteTab3(PC),A0
	CLR.B	3(A0)
	LEA	_WhichStep(PC),A0
	MOVE.W	StartStep,D0
	SUBQ.W	#1,D0
	MOVE.W	D0,(A0)
	LEA	SongSpeedCnt(PC),A0
	MOVE.B	SongSpeed,(A0)
	LEA	_WhereInStep(PC),A0
	MOVE.B	TrackLength,(A0)
	BSR	_ReloadTimer
	MOVEM.L	(SP)+,D1/A0/A1
	RTS	
 
_InitReplayer	MOVE.L	A0,-(SP)
	MOVEQ.L	#0,D0
	BSR	Init_Song
	LEA	_WhichStep(PC),A0
	ADDQ.W	#1,(A0)
	MOVE.W	#$00FF,$00DFF09E
	MOVE.W	#$4000,$00DFF09A
	LEA	lbB0002D0(PC),A0
	MOVE.L	$00000078,(A0)
	LEA	Irq6Rout(PC),A0
	MOVE.L	A0,$00000078
	BSR	_ReloadTimer
	MOVE.W	#$0780,$00DFF09C
	MOVE.W	#$0780,$00DFF09A
	MOVE.W	#$C000,$00DFF09A
	MOVE.L	(SP)+,A0
	RTS	
 
_ReloadTimer	MOVE.L	D1,-(SP)
	MOVE.L	#$000AECE0,D0
	MOVE.W	TimerFreq,D1
	BEQ.S	lbC0001CE
	DIVU	D1,D0
lbC0001CE	MOVE.B	#0,$00BFDE00
	MOVE.B	D0,$00BFD400
	LSR.W	#8,D0
	MOVE.B	D0,$00BFD500
	MOVE.B	#$81,$00BFDD00
	MOVE.B	#$11,$00BFDE00
	MOVE.L	(SP)+,D1
	RTS	
 
ClearAudRegs	MOVEM.L	D0/A0,-(SP)
	LEA	$00DFF000,A0
	MOVE.W	#15,$0096(A0)
	MOVEQ.L	#0,D0
	MOVE.W	D0,$00A8(A0)
	MOVE.W	D0,$00B8(A0)
	MOVE.W	D0,$00C8(A0)
	MOVE.W	D0,$00D8(A0)
	MOVEM.L	(SP)+,D0/A0
	RTS	
 
_TermReplayer	MOVE.W	#$4000,$00DFF09A
	MOVE.B	#1,$00BFDD00
	MOVE.L	lbB0002D0,$00000078
	MOVE.W	#$C000,$00DFF09A
	BSR	ClearAudRegs
	RTS	
 
_StartSong	MOVE.L	A0,-(SP)
	BSR	Init_Song
	LEA	_PlayOn(PC),A0
	MOVE.W	#$FFFF,(A0)
	MOVE.L	(SP)+,A0
	RTS	
 
_StartPatternPlay	MOVE.L	A0,-(SP)
	LEA	_WhereInStep(PC),A0
	CLR.B	(A0)
	LEA	_WhichStep(PC),A0
	SUBQ.W	#1,D0
	MOVE.W	D0,(A0)
	BSR	ReadNewOTLine
	LEA	_PlayOn(PC),A0
	MOVE.W	#1,(A0)
	LEA	_WhichStep(PC),A0
lbC000274	TST.W	(A0)
	BMI.S	lbC000274
	MOVE.L	(SP)+,A0
	RTS	
 
_StopSong	MOVE.L	A0,-(SP)
	LEA	_PlayOn(PC),A0
	CLR.W	(A0)
	BSR	ClearAudRegs
	MOVE.L	(SP)+,A0
	RTS	
 
_PlayOn	dcb.b	2,0
Irq6Rout	MOVEM.L	D0-D7/A0-A6,-(SP)
	BSR	SetSampleRepeats
	LEA	SongSpeedCnt(PC),A0
	ADDQ.B	#1,(A0)
	MOVE.B	(A0),D0
	CMP.B	SongSpeed,D0
	BLT.S	lbC0002B6
	CLR.B	(A0)
	MOVE.W	_PlayOn,D0
	BNE.S	lbC0002B2
	BSR	PlaySynthEffect
	BRA.S	lbC0002B6
 
lbC0002B2	BSR	SongReplayer
lbC0002B6	BSR	Update_Effects
	MOVE.B	$00BFDD00,D0
	MOVE.W	#$2000,$00DFF09C
	MOVEM.L	(SP)+,D0-D7/A0-A6
	RTE	
 
Level6Vec	dc.w	$4EF9
lbB0002D0	dc.b	$12
	dc.b	'4Vx'
ReadNewOTLine	MOVEM.L	D0-D4/A0,-(SP)
	LEA	_WhichStep(PC),A0
	ADDQ.W	#1,(A0)
	MOVE.W	_WhichStep,D0
	CMP.W	StopStep,D0
	BLE.S	NotEndOfSong
	MOVE.W	RepeatStep,D0
	LEA	_WhichStep(PC),A0
	MOVE.W	D0,(A0)
NotEndOfSong	MOVE.L	_OverTable,A0
	MOVE.W	_WhichStep,D0
	LSL.W	#4,D0
	ADD.W	D0,A0
	MOVEM.L	(A0),D1-D4
	LEA	CurrOtTrk0(PC),A0
	MOVEM.L	D1-D4,(A0)
	MOVEM.L	(SP)+,D0-D4/A0
	RTS	
 
ReadNewNotes	MOVEM.L	D0/A0-A3,-(SP)
	MOVE.L	_NoteTable,A0
	MOVE.B	_WhereInStep,D0
	EXT.W	D0
	LSL.W	#2,D0
	ADD.W	D0,A0
	LEA	CurrNote0(PC),A1
	LEA	CurrOtTrk0(PC),A2
	LEA	_Voices(PC),A3
	TST.B	(A3)+
	BEQ.S	lbC00033C
	MOVE.W	(A2),D0
	EXT.L	D0
	ASL.L	#2,D0
	MOVE.L	0(A0,D0.L),(A1)
lbC00033C	TST.B	(A3)+
	BEQ.S	lbC00034E
	MOVE.W	4(A2),D0
	EXT.L	D0
	ASL.L	#2,D0
	MOVE.L	0(A0,D0.L),4(A1)
lbC00034E	TST.B	(A3)+
	BEQ.S	lbC000360
	MOVE.W	8(A2),D0
	EXT.L	D0
	ASL.L	#2,D0
	MOVE.L	0(A0,D0.L),8(A1)
lbC000360	TST.B	(A3)
	BEQ.S	lbC000372
	MOVE.W	12(A2),D0
	EXT.L	D0
	ASL.L	#2,D0
	MOVE.L	0(A0,D0.L),12(A1)
lbC000372	MOVEM.L	(SP)+,D0/A0-A3
	RTS	
 
CheckForNewInstr	MOVEM.L	A0-A4,-(SP)
	LEA	$00DFF000,A0
	LEA	_Voices(PC),A1
	LEA	CurrNote0(PC),A2
	LEA	WasteTab0(PC),A3
	LEA	XVoice(PC),A4
	CMP.L	#0,(A4)
	BEQ.S	lbC0003A8
	TST.B	(A1)+
	BEQ.S	lbC0003A8
	TST.B	(A2)
	BEQ.S	lbC0003B2
	TST.B	1(A2)
	BEQ.S	lbC0003B2
lbC0003A8	MOVE.W	#1,$0096(A0)
	CLR.B	3(A3)
lbC0003B2	CMP.L	#1,(A4)
	BEQ.S	lbC0003CA
	TST.B	(A1)+
	BEQ.S	lbC0003CA
	TST.B	4(A2)
	BEQ.S	lbC0003D4
	TST.B	5(A2)
	BEQ.S	lbC0003D4
lbC0003CA	MOVE.W	#2,$0096(A0)
	CLR.B	$001F(A3)
lbC0003D4	CMP.L	#2,(A4)
	BEQ.S	lbC0003EC
	TST.B	(A1)+
	BEQ.S	lbC0003EC
	TST.B	8(A2)
	BEQ.S	lbC0003F6
	TST.B	9(A2)
	BEQ.S	lbC0003F6
lbC0003EC	MOVE.W	#4,$0096(A0)
	CLR.B	$003B(A3)
lbC0003F6	CMP.L	#3,(A4)
	BEQ.S	lbC00040E
	TST.B	(A1)+
	BEQ.S	lbC00040E
	TST.B	12(A2)
	BEQ.S	lbC000418
	TST.B	13(A2)
	BEQ.S	lbC000418
lbC00040E	MOVE.W	#8,$0096(A0)
	CLR.B	$0057(A3)
lbC000418	MOVEM.L	(SP)+,A0-A4
	RTS	
 
UpdateVoices	MOVEM.L	D0-D2/D7/A0-A3/A6,-(SP)
	MOVEQ.L	#0,D7
	LEA	_Voices(PC),A0
	LEA	XVoice(PC),A6
	TST.L	(A6)
	BEQ.S	lbC000434
	TST.B	(A0)+
	BEQ.S	lbC000450
lbC000434	MOVE.L	CurrNote0,D0
	MOVE.L	CurrOtTrk0,D1
	MOVEQ.L	#1,D2
	LEA	RepeatVoice0(PC),A1
	LEA	WasteTab0(PC),A2
	LEA	$00DFF0A0,A3
	BSR	PlayVoice
lbC000450	CMP.L	#1,(A6)
	BEQ.S	lbC00045C
	TST.B	(A0)+
	BEQ.S	lbC000478
lbC00045C	MOVE.L	CurrNote1,D0
	MOVE.L	CurrOtTrk1,D1
	MOVEQ.L	#2,D2
	LEA	RepeatVoice1(PC),A1
	LEA	WasteTab1(PC),A2
	LEA	$00DFF0B0,A3
	BSR	PlayVoice
lbC000478	CMP.L	#2,(A6)
	BEQ.S	lbC000484
	TST.B	(A0)+
	BEQ.S	lbC0004A0
lbC000484	MOVE.L	CurrNote2,D0
	MOVE.L	CurrOtTrk2,D1
	MOVEQ.L	#4,D2
	LEA	RepeatVoice2(PC),A1
	LEA	WasteTab2(PC),A2
	LEA	$00DFF0C0,A3
	BSR	PlayVoice
lbC0004A0	CMP.L	#3,(A6)
	BEQ.S	lbC0004AC
	TST.B	(A0)+
	BEQ.S	lbC0004C8
lbC0004AC	MOVE.L	CurrNote3,D0
	MOVE.L	CurrOtTrk3,D1
	MOVEQ.L	#8,D2
	LEA	RepeatVoice3(PC),A1
	LEA	WasteTab3(PC),A2
	LEA	$00DFF0D0,A3
	BSR	PlayVoice
lbC0004C8	OR.W	#$8000,D7
	MOVE.W	D7,$00DFF096
	MOVEM.L	(SP)+,D0-D2/D7/A0-A3/A6
	RTS	
 
SetSampleRepeats	MOVEM.L	A0-A2,-(SP)
	LEA	RepeatVoice0(PC),A0
	TST.B	(A0)
	BEQ.S	lbC0004F0
	LEA	$00DFF0A0,A1
	LEA	WasteTab0(PC),A2
	BSR	lbC00052E
lbC0004F0	TST.B	1(A0)
	BEQ.S	lbC000502
	LEA	$00DFF0B0,A1
	LEA	WasteTab1(PC),A2
	BSR	lbC00052E
lbC000502	TST.B	2(A0)
	BEQ.S	lbC000514
	LEA	$00DFF0C0,A1
	LEA	WasteTab2(PC),A2
	BSR	lbC00052E
lbC000514	TST.B	3(A0)
	BEQ.S	lbC000526
	LEA	$00DFF0D0,A1
	LEA	WasteTab3(PC),A2
	BSR	lbC00052E
lbC000526	CLR.L	(A0)
	MOVEM.L	(SP)+,A0-A2
	RTS	
 
lbC00052E	MOVEM.L	D0/D1/A3/A4,-(SP)
	TST.B	4(A2)
	BNE.S	lbC00058A
	MOVE.L	_SampleInstr,A3
	MOVE.B	3(A2),D0
	EXT.W	D0
	SUBQ.W	#1,D0
	MULU	#$10,D0
	ADD.L	D0,A3
	TST.W	2(A3)
	BEQ.S	lbC00058A
	CMP.W	#1,2(A3)
	BNE.S	lbC000568
	LEA	ZeroWaveForm,A4
	MOVE.L	A4,(A1)
	MOVE.W	#1,4(A1)
	BRA.S	lbC00058A
 
lbC000568	LEA	_SaAddrList(PC),A4
	MOVE.B	4(A3),D0
	EXT.W	D0
	LSL.W	#2,D0
	MOVE.L	0(A4,D0.W),A4
	MOVEM.W	0(A3),D0/D1
	EXT.L	D0
	LSL.L	#1,D0
	ADD.L	D0,A4
	MOVE.L	A4,(A1)
	MOVE.W	D1,4(A1)
lbC00058A	MOVEM.L	(SP)+,D0/D1/A3/A4
	RTS	
 
SongReplayer	LEA	_WhereInStep(PC),A0
	ADDQ.B	#1,(A0)
	MOVE.B	(A0),D0
	CMP.B	TrackLength,D0
	BLT.S	PatternInActionYet
	LEA	_WhereInStep(PC),A0
	CLR.B	(A0)
	LEA	_PlayOn(PC),A0
	TST.W	(A0)
	BGT.S	PatternInActionYet
	BSR	ReadNewOTLine
PatternInActionYet	BSR	ReadNewNotes
TrackRest	BSR	InsertSynthEff
	BSR	CheckForNewInstr
	BSR	UpdateVoices
	BSR	RestoreOt
	RTS	
 
PlaySynthEffect	LEA	CurrOtTrk0(PC),A0
	CLR.L	(A0)+
	CLR.L	(A0)+
	CLR.L	(A0)+
	CLR.L	(A0)+
	LEA	CurrNote0(PC),A0
	CLR.L	(A0)+
	CLR.L	(A0)+
	CLR.L	(A0)+
	CLR.L	(A0)+
	BRA.S	TrackRest
 
OldOt	dc.l	0
OldOff	dcb.b	2,0
InsertSynthEff	MOVEM.L	D0/A0/A1,-(SP)
	LEA	XVoice(PC),A0
	TST.W	(A0)
	BLT.S	lbC000612
	MOVE.L	(A0),D0
	ASL.W	#2,D0
	LEA	OldOff(PC),A0
	MOVE.W	D0,(A0)
	LEA	CurrNote0(PC),A0
	MOVE.L	XNote,$0000(A0,D0.W)
	LEA	CurrOtTrk0(PC),A0
	LEA	OldOt(PC),A1
	MOVE.L	0(A0,D0.W),(A1)
	CLR.L	0(A0,D0.W)
lbC000612	MOVEM.L	(SP)+,D0/A0/A1
	RTS	
 
RestoreOt	MOVEM.L	D0/A0,-(SP)
	LEA	XVoice(PC),A0
	TST.W	(A0)
	BLT.S	lbC000642
	MOVE.W	OldOff,D0
	LEA	CurrOtTrk0(PC),A0
	MOVE.L	OldOt,$0000(A0,D0.W)
	LEA	XVoice(PC),A0
	MOVE.L	#$FFFFFFFF,(A0)
	LEA	XNote(PC),A0
	CLR.L	(A0)
lbC000642	MOVEM.L	(SP)+,D0/A0
	RTS	
 
LastEffect	dcb.b	2,0
SetEffects	MOVEM.L	D3/A4,-(SP)
	MOVE.W	D0,D3
	LSR.W	#8,D3
	AND.W	#$00FF,D3
	LEA	LastEffect(PC),A4
	MOVE.W	D3,(A4)
	AND.W	#15,D3
	TST.B	D3
	BEQ	lbC0007AA
	CMP.B	#1,D3
	BNE.S	lbC000674
	MOVE.B	D0,2(A2)
	BRA	lbC0007AA
 
lbC000674	CMP.B	#2,D3
	BNE.S	lbC000686
	CLR.B	6(A2)
	MOVE.B	D0,7(A2)
	BRA	lbC0007AA
 
lbC000686	CMP.B	#7,D3
	BNE.S	lbC0006A0
	CLR.W	12(A2)
	CLR.W	14(A2)
	MOVE.B	D0,13(A2)
	MOVE.B	D0,15(A2)
	BRA	lbC0007AA
 
lbC0006A0	CMP.B	#10,D3
	BNE.S	lbC0006DE
	MOVE.B	D0,D3
	EXT.W	D3
	MOVEQ.L	#0,D4
	MOVE.B	5(A2),D4
	ADD.W	D3,D4
	TST.W	D4
	BGE.S	lbC0006BA
	MOVEQ.L	#0,D4
	BRA.S	lbC0006D6
 
lbC0006BA	TST.B	4(A2)
	BNE.S	lbC0006CC
	CMP.W	#$0040,D4
	BLS.S	lbC0006D6
	MOVE.W	#$0040,D4
	BRA.S	lbC0006D6
 
lbC0006CC	CMP.W	#$00FF,D4
	BLS.S	lbC0006D6
	MOVE.W	#$00FF,D4
lbC0006D6	MOVE.B	D4,5(A2)
	BRA	lbC0007AA
 
lbC0006DE	CMP.B	#11,D3
	BNE	lbC0006FC
	MOVEQ.L	#0,D3
	MOVE.B	D0,D3
	LEA	_WhichStep(PC),A4
	MOVE.W	D3,(A4)
	LEA	_WhereInStep(PC),A4
	MOVE.B	TrackLength,(A4)
	BRA	lbC0007AA
 
lbC0006FC	CMP.B	#13,D3
	BNE.S	lbC00070E
	LEA	_WhereInStep(PC),A4
	MOVE.B	TrackLength,(A4)
	BRA	lbC0007AA
 
lbC00070E	CMP.B	#12,D3
	BNE.S	lbC000732
	MOVE.B	D0,D3
	TST.B	4(A2)
	BNE.S	lbC00072C
	CMP.B	#$40,D3
	BLS.S	lbC000726
	MOVE.B	#$40,D3
lbC000726	MOVE.B	D3,5(A2)
	BRA.S	lbC0007AA
 
lbC00072C	MOVE.B	D3,5(A2)
	BRA.S	lbC0007AA
 
lbC000732	CMP.B	#9,D3
	BNE.S	lbC00074A
	TST.B	D0
	BLE.S	lbC0007AA
	CMP.B	#$40,D0
	BHI.S	lbC0007AA
	LEA	TrackLength(PC),A4
	MOVE.B	D0,(A4)
	BRA.S	lbC0007AA
 
lbC00074A	CMP.B	#14,D3
	BNE.S	lbC000768
	TST.B	D0
	BNE.S	lbC00075E
	BCLR	#1,$00BFE001
	BRA.S	lbC0007AA
 
lbC00075E	BSET	#1,$00BFE001
	BRA.S	lbC0007AA
 
lbC000768	CMP.B	#15,D3
	BNE.S	lbC000780
	TST.B	D0
	BLE.S	lbC0007AA
	CMP.B	#$10,D0
	BGT.S	lbC0007AA
	LEA	SongSpeed(PC),A4
	MOVE.B	D0,(A4)
	BRA.S	lbC0007AA
 
lbC000780	CMP.B	#4,D3
	BNE.S	lbC0007AA
	CLR.B	$0012(A2)
	MOVE.B	D0,D3
	ASR.B	#4,D3
	AND.W	#15,D3
	ASL.B	#1,D3
	MOVE.B	D3,$0013(A2)
	MOVE.B	D0,D3
	AND.W	#15,D3
	ASL.W	#4,D3
	NEG.W	D3
	ADD.W	#$00A0,D3
	MOVE.B	D3,$0014(A2)
lbC0007AA	MOVEM.L	(SP)+,D3/A4
	RTS	
 
PlayVoice	MOVEM.L	D3/D4,-(SP)
	BSR	SetEffects
	MOVE.L	D0,D3
	ROL.L	#8,D3
	AND.L	#$000000FF,D3
	MOVE.L	D0,D4
	SWAP	D4
	AND.W	#$00FF,D4
	TST.B	D3
	BNE.S	lbC0007D8
	TST.B	D4
	BEQ.S	lbC000818
	BSR	RestoreWasteTab
	BRA.S	lbC000818
 
lbC0007D8	CMP.B	#$80,D3
	BEQ.S	lbC000818
	CMP.B	#$7F,D3
	BNE.S	lbC0007EA
	BSR	ForceQuiet
	BRA.S	lbC000818
 
lbC0007EA	BSR	SetNT_ST
	MOVE.B	0(A2),1(A2)
	MOVE.B	D3,0(A2)
	EXT.W	D4
	TST.W	D4
	BLE.S	lbC000818
	CMP.W	#$007F,D4
	BGT.S	lbC000818
	BSR	ResetWasteTab
	BTST	#6,D4
	BEQ.S	lbC000814
	BSR	SetSampleInstr
	BRA.S	lbC000818
 
lbC000814	BSR	SetSynthInstr
lbC000818	MOVEM.L	(SP)+,D3/D4
	RTS	
 
RestoreWasteTab	MOVEM.L	D4/D5/A4-A6,-(SP)
	LEA	LastEffect(PC),A4
	MOVE.W	(A4),D5
	AND.L	#15,D5
	TST.B	4(A2)
	BNE	lbC000896
	MOVE.L	_SampleInstr,A5
	AND.L	#$0000003F,D4
	MOVE.B	D4,3(A2)
	SUBQ.L	#1,D4
	MULU	#$10,D4
	ADD.L	D4,A5
	CMP.B	#4,D5
	BEQ.S	lbC000864
	MOVE.B	6(A5),$0012(A2)
	MOVE.B	7(A5),$0013(A2)
	MOVE.B	8(A5),$0014(A2)
lbC000864	CMP.B	#8,D5
	BEQ.S	lbC00087C
	CMP.B	#7,D5
	BEQ.S	lbC00087C
	MOVE.B	9(A5),13(A2)
	MOVE.B	9(A5),15(A2)
lbC00087C	CMP.B	#12,D5
	BEQ	lbC000892
	CMP.B	#10,D5
	BEQ	lbC000892
	MOVE.B	5(A5),5(A2)
lbC000892	BRA	lbC0008F2
 
lbC000896	MOVE.L	_SynthInstr,A5
	AND.L	#$0000003F,D4
	MOVE.B	D4,3(A2)
	SUBQ.L	#1,D4
	MULU	#$F2,D4
	ADD.L	D4,A5
	CMP.B	#4,D5
	BEQ.S	lbC0008C4
	MOVE.B	$001B(A5),$0012(A2)
	MOVE.B	$001C(A5),$0013(A2)
	MOVE.B	$001D(A5),$0014(A2)
lbC0008C4	CMP.B	#8,D5
	BEQ.S	lbC0008DC
	CMP.B	#7,D5
	BEQ.S	lbC00087C
	MOVE.B	$001E(A5),13(A2)
	MOVE.B	9(A5),15(A2)
lbC0008DC	CMP.B	#12,D5
	BEQ	lbC0008F2
	CMP.B	#10,D5
	BEQ	lbC0008F2
	MOVE.B	$001A(A5),5(A2)
lbC0008F2	MOVEM.L	(SP)+,D4/D5/A4-A6
	RTS	
 
SetNT_ST	MOVEM.L	D5/D6/A4,-(SP)
	LEA	LastEffect(PC),A4
	MOVE.W	(A4),D6
	AND.L	#$000000C0,D6
	LSR.L	#4,D6
	CMP.W	#4,D6
	BEQ.S	lbC000912
	ADD.B	D1,D3
lbC000912	CMP.W	#8,D6
	BEQ.S	lbC000926
	MOVE.W	D1,D5
	ROR.W	#8,D5
	AND.W	#$00FF,D5
	ADD.B	D5,D4
	AND.W	#$00FF,D4
lbC000926	MOVEM.L	(SP)+,D5/D6/A4
	RTS	
 
ForceQuiet	CLR.W	8(A3)
	CLR.B	5(A2)
	CLR.B	3(A2)
	CLR.B	(A1)
	RTS	
 
ResetWasteTab	MOVE.L	D7,-(SP)
	CLR.B	2(A2)
	CLR.B	3(A2)
	CLR.W	6(A2)
	CLR.W	8(A2)
	CLR.W	10(A2)
	MOVE.W	LastEffect,D7
	CMP.W	#7,D7
	BEQ.S	lbC000964
	CLR.W	12(A2)
	CLR.W	14(A2)
lbC000964	CLR.W	$0010(A2)
	MOVE.W	LastEffect,D7
	CMP.W	#4,D7
	BEQ.S	lbC00097E
	CLR.B	$0012(A2)
	CLR.B	$0013(A2)
	CLR.B	$0014(A2)
lbC00097E	CLR.B	$0015(A2)
	CLR.W	$0016(A2)
	CLR.W	$0018(A2)
	CLR.W	$001A(A2)
	MOVE.L	(SP)+,D7
	RTS	
 
SetSampleInstr	MOVEM.L	D4/D5/A4-A6,-(SP)
	SF	4(A2)
	LEA	LastEffect(PC),A4
	MOVE.W	(A4),D5
	AND.L	#15,D5
	MOVE.L	_SampleInstr,A5
	AND.L	#$0000003F,D4
	MOVE.B	D4,3(A2)
	SUBQ.L	#1,D4
	MULU	#$10,D4
	ADD.L	D4,A5
	CMP.B	#4,D5
	BEQ.S	lbC0009D4
	MOVE.B	6(A5),$0012(A2)
	MOVE.B	7(A5),$0013(A2)
	MOVE.B	8(A5),$0014(A2)
lbC0009D4	CMP.B	#8,D5
	BEQ.S	lbC0009EC
	CMP.B	#7,D5
	BEQ.S	lbC0009EC
	MOVE.B	9(A5),13(A2)
	MOVE.B	9(A5),15(A2)
lbC0009EC	LEA	_SaAddrList(PC),A6
	MOVE.B	4(A5),D4
	EXT.W	D4
	BMI.S	lbC000A00
	LSL.W	#2,D4
	MOVE.L	0(A6,D4.W),D4
	BNE.S	lbC000A06
lbC000A00	BSR	ForceQuiet
	BRA.S	lbC000A30
 
lbC000A06	MOVE.L	D4,(A3)
	MOVE.W	0(A5),D4
	ADD.W	2(A5),D4
	MOVE.W	D4,4(A3)
	CMP.B	#12,D5
	BEQ.S	lbC000A2C
	CMP.B	#10,D5
	BEQ.S	lbC000A2C
	MOVE.B	5(A5),9(A3)
	MOVE.B	5(A5),5(A2)
lbC000A2C	OR.W	D2,D7
	ST 	(A1)
lbC000A30	MOVEM.L	(SP)+,D4/D5/A4-A6
	RTS	
 
SetSynthInstr	MOVEM.L	D4/D5/A4-A6,-(SP)
	ST 	4(A2)
	LEA	LastEffect(PC),A4
	MOVE.W	(A4),D5
	AND.L	#15,D5
	MOVE.L	_SynthInstr,A5
	AND.L	#$0000003F,D4
	MOVE.B	D4,3(A2)
	SUBQ.L	#1,D4
	MULU	#$F2,D4
	ADD.L	D4,A5
	CMP.B	#4,D5
	BEQ.S	lbC000A78
	MOVE.B	$001B(A5),$0012(A2)
	MOVE.B	$001C(A5),$0013(A2)
	MOVE.B	$001D(A5),$0014(A2)
lbC000A78	CMP.B	#8,D5
	BEQ.S	lbC000A90
	CMP.B	#7,D5
	BEQ.S	lbC000A90
	MOVE.B	$001E(A5),13(A2)
	MOVE.B	9(A5),15(A2)
lbC000A90	TST.B	$002A(A5)
	BNE.S	lbC000A9E
lbC000A96	CLR.B	$0015(A2)
	MOVEQ.L	#0,D4
	BRA.S	lbC000AD4
 
lbC000A9E	TST.B	$0029(A5)
	BEQ.S	lbC000ABE
	CLR.W	$0016(A2)
	MOVEQ.L	#0,D4
	MOVE.B	$002B(A5),D4
	ADD.B	$002C(A5),D4
	TST.W	D4
	BEQ.S	lbC000A96
	MOVEQ.L	#0,D4
	MOVE.B	$0172(A5),D4
	BRA.S	lbC000AD4
 
lbC000ABE	CLR.W	$0016(A2)
	MOVE.B	$002B(A5),$0016(A2)
	MOVE.B	#1,$0015(A2)
	MOVEQ.L	#0,D4
	MOVE.B	$0016(A2),D4
lbC000AD4	MOVE.L	A5,A6
	BTST	#0,D4
	BEQ.S	lbC000AEE
	ADD.L	#$000002F2,A6
	AND.L	#$FFFFFFFE,D4
	ADD.L	D4,A6
	MOVE.L	A6,(A3)
	BRA.S	lbC000AF8
 
lbC000AEE	ADD.L	#$000001F2,A6
	ADD.L	D4,A6
	MOVE.L	A6,(A3)
lbC000AF8	MOVE.W	$0018(A5),D4
	LSR.W	#1,D4
	MOVE.W	D4,4(A3)
	CMP.B	#12,D5
	BEQ.S	lbC000B14
	CMP.B	#10,D5
	BEQ.S	lbC000B14
	MOVE.B	$001A(A5),5(A2)
lbC000B14	OR.W	D2,D7
	SF	(A1)
	MOVEM.L	(SP)+,D4/D5/A4-A6
	RTS	
 
Update_Effects	MOVEM.L	D0/D1/A0-A3,-(SP)
	LEA	CurrNote0(PC),A0
	LEA	CurrOtTrk0(PC),A1
	MOVE.L	(A0)+,D0
	MOVE.L	(A1)+,D1
	LEA	WasteTab0(PC),A2
	LEA	$00DFF0A0,A3
	BSR	UpdateVoiceEffects
	MOVE.L	(A0)+,D0
	MOVE.L	(A1)+,D1
	LEA	WasteTab1(PC),A2
	LEA	$00DFF0B0,A3
	BSR	UpdateVoiceEffects
	MOVE.L	(A0)+,D0
	MOVE.L	(A1)+,D1
	LEA	WasteTab2(PC),A2
	LEA	$00DFF0C0,A3
	BSR	UpdateVoiceEffects
	MOVE.L	(A0)+,D0
	MOVE.L	(A1)+,D1
	LEA	WasteTab3(PC),A2
	LEA	$00DFF0D0,A3
	BSR	UpdateVoiceEffects
	MOVEM.L	(SP)+,D0/D1/A0-A3
	RTS	
 
UpdateVoiceEffects	TST.B	3(A2)
	BNE.S	lbC000B7E
	MOVE.B	#0,9(A3)
	RTS	
 
lbC000B7E	MOVEM.L	D2/D3/A4,-(SP)
	TST.B	4(A2)
	BNE.S	lbC000BB0
	MOVE.L	_SampleInstr,A4
	MOVE.B	3(A2),D2
	EXT.W	D2
	SUBQ.W	#1,D2
	MULU	#$10,D2
	ADD.L	D2,A4
	BSR	Arpeggio
	BSR	SynthPortamento
	BSR	Vibrato
	MOVE.W	D2,6(A3)
	MOVE.B	5(A2),9(A3)
	BRA.S	lbC000BDC
 
lbC000BB0	MOVE.L	_SynthInstr,A4
	MOVE.B	3(A2),D2
	EXT.W	D2
	SUBQ.W	#1,D2
	MULU	#$F2,D2
	ADD.L	D2,A4
	BSR	synthArpeggio
	BSR	SynthPortamento
	BSR	Vibrato
	BSR	lfo
	MOVE.W	D2,6(A3)
	BSR	adsr
	BSR	seteg
lbC000BDC	MOVE.B	2(A2),D2
	EXT.W	D2
	SUB.W	D2,$0010(A2)
	MOVEM.L	(SP)+,D2/D3/A4
	RTS	
 
Arpeggio	MOVEM.L	A5,-(SP)
	MOVEQ.L	#0,D2
	MOVE.B	0(A2),D2
	MOVEQ.L	#0,D3
	MOVE.B	1(A2),D3
	LEA	FrekTab(PC),A5
	LSL.W	#1,D2
	MOVE.W	0(A5,D2.W),D2
	LSL.W	#1,D3
	MOVE.W	0(A5,D3.W),D3
	MOVEM.L	(SP)+,A5
	RTS	
 
synthArpeggio	MOVEM.L	D4/A5,-(SP)
	MOVEQ.L	#0,D2
	MOVE.B	0(A2),D2
	MOVEQ.L	#0,D3
	MOVE.B	1(A2),D3
	MOVE.W	D0,D4
	LSR.W	#8,D4
	AND.W	#$0030,D4
	ASR.W	#4,D4
	TST.W	D4
	BEQ.S	lbC000C60
	MOVE.L	A4,A5
	SUBQ.W	#1,D4
	MULU	#$10,D4
	ADD.W	D4,A5
	ADD.W	#$0142,A5
	MOVE.W	$0018(A2),D4
	MOVE.B	2(A5,D4.W),D4
	ADD.B	D4,D2
	ADD.B	D4,D3
	MOVE.B	(A5),D4
	ADD.B	1(A5),D4
	CMP.B	$0019(A2),D4
	BEQ.S	lbC000C5C
	ADDQ.B	#1,$0019(A2)
	BRA.S	lbC000C60
 
lbC000C5C	MOVE.B	(A5),$0019(A2)
lbC000C60	LEA	FrekTab(PC),A5
	LSL.L	#1,D2
	MOVE.W	0(A5,D2.W),D2
	LSL.L	#1,D3
	MOVE.W	0(A5,D3.W),D3
	MOVEM.L	(SP)+,D4/A5
	RTS	
 
Vibrato	MOVEM.L	D4-D6/A5,-(SP)
	CMP.B	#$FF,$0012(A2)
	BEQ.S	lbC000CC6
	TST.B	$0012(A2)
	BEQ.S	lbC000C8E
	SUBQ.B	#1,$0012(A2)
	BRA.S	lbC000CC6
 
lbC000C8E	LEA	VibratoTab(PC),A5
	MOVE.W	8(A2),D4
	MOVEQ.L	#0,D5
	MOVE.B	0(A5,D4.W),D5
	MOVEQ.L	#0,D4
	MOVE.B	$0014(A2),D4
	TST.B	D5
	BLT.S	lbC000CB2
	TST.W	D4
	BEQ.S	lbC000CBE
	LSL.L	#2,D5
	DIVU	D4,D5
	ADD.W	D5,D2
	BRA.S	lbC000CBE
 
lbC000CB2	NEG.B	D5
	TST.W	D4
	BEQ.S	lbC000CBE
	LSL.L	#2,D5
	DIVU	D4,D5
	SUB.W	D5,D2
lbC000CBE	MOVE.B	$0013(A2),D5
	ADD.B	D5,9(A2)
lbC000CC6	ADD.W	$0010(A2),D2
	MOVEM.L	(SP)+,D4-D6/A5
	RTS	
 
SynthPortamento	MOVE.L	D4,-(SP)
	TST.W	14(A2)
	BEQ.S	lbC000CFA
	TST.W	12(A2)
	BEQ.S	lbC000CFA
	CMP.W	D3,D2
	BEQ.S	lbC000CFA
	SUBQ.W	#1,12(A2)
	EXG	D3,D2
	SUB.W	D3,D2
	MULS	12(A2),D2
	MOVE.W	14(A2),D4
	TST.W	D4
	BEQ.S	lbC000CF8
	DIVS	D4,D2
lbC000CF8	ADD.W	D3,D2
lbC000CFA	AND.W	#$FFFF,D2
	MOVE.L	(SP)+,D4
	RTS	
 
adsr	MOVEM.L	D4/D5,-(SP)
	MOVEQ.L	#0,D4
	MOVE.B	$001F(A4),D4
	ADD.B	$0020(A4),D4
	TST.W	D4
	BNE.S	lbC000D24
	MOVEQ.L	#0,D4
	MOVE.B	5(A2),D4
	LSR.B	#2,D4
	MOVE.B	D4,9(A3)
	BRA	lbC000DA6
 
lbC000D24	MOVE.W	6(A2),D4
	MOVEQ.L	#0,D5
	MOVE.B	$0042(A4,D4.W),D5
	MOVEQ.L	#0,D4
	MOVE.B	5(A2),D4
	MULU	D5,D4
	LSR.L	#8,D4
	LSR.L	#2,D4
	MOVE.B	D4,9(A3)
	MOVEQ.L	#0,D4
	MOVEQ.L	#0,D5
	MOVE.B	$001F(A4),D4
	ADD.B	$0020(A4),D4
	MOVE.W	6(A2),D5
	CMP.W	D5,D4
	BGT.S	lbC000D5E
	CLR.W	6(A2)
	MOVE.B	$001F(A4),7(A2)
	BRA.S	lbC000DA6
 
lbC000D5E	MOVE.L	D0,D4
	ROL.L	#8,D4
	AND.L	#$000000FF,D4
	CMP.L	#$00000080,D4
	BEQ.S	lbC000D76
lbC000D70	ADDQ.W	#1,6(A2)
	BRA.S	lbC000DA6
 
lbC000D76	CMP.B	#1,$0026(A4)
	BEQ.S	lbC000D70
	MOVE.B	7(A2),D4
	CMP.B	$0025(A4),D4
	BLT.S	lbC000D70
	TST.B	$0026(A4)
	BEQ.S	lbC000DA6
	TST.W	$001A(A2)
	BEQ.S	lbC000D9A
	SUBQ.W	#1,$001A(A2)
	BRA.S	lbC000DA6
 
lbC000D9A	MOVE.B	$0026(A4),D4
	EXT.W	D4
	MOVE.W	D4,$001A(A2)
	BRA.S	lbC000D70
 
lbC000DA6	MOVEM.L	(SP)+,D4/D5
	RTS	
 
seteg	MOVEM.L	D4/D5/A5,-(SP)
	TST.B	$002A(A4)
	BEQ	lbC000E8C
	TST.B	$0029(A4)
	BEQ.S	lbC000DFA
	MOVEQ.L	#0,D4
	MOVE.B	$002B(A4),D4
	ADD.B	$002C(A4),D4
	TST.W	D4
	BEQ	lbC000E8C
	CMP.W	$0016(A2),D4
	BGE.S	lbC000DE0
	CLR.W	$0016(A2)
	MOVE.B	$002B(A4),$0017(A2)
	BRA.S	lbC000DE4
 
lbC000DE0	ADDQ.W	#1,$0016(A2)
lbC000DE4	MOVEQ.L	#0,D4
	MOVE.W	$0016(A2),D4
	ADD.W	#$0172,D4
	MOVE.B	0(A4,D4.W),D4
	AND.L	#$000000FF,D4
	BRA.S	lbC000E6A
 
lbC000DFA	TST.B	$0015(A2)
	BEQ	lbC000E8C
	MOVEQ.L	#0,D5
	MOVE.W	$0016(A2),D5
	TST.B	$0015(A2)
	BGT.S	lbC000E3A
	MOVEQ.L	#0,D4
	MOVE.B	$002E(A4),D4
	LSL.W	#5,D4
	SUB.W	D4,D5
	MOVE.W	D5,D4
	LSR.W	#8,D4
	CMP.B	$002B(A4),D4
	BLE.S	lbC000E28
	MOVE.W	D5,$0016(A2)
	BRA.S	lbC000E64
 
lbC000E28	CLR.W	$0016(A2)
	MOVE.B	$002B(A4),$0016(A2)
	MOVE.B	#1,$0015(A2)
	BRA.S	lbC000E64
 
lbC000E3A	MOVEQ.L	#0,D4
	MOVE.B	$002D(A4),D4
	LSL.W	#5,D4
	ADD.W	D4,D5
	MOVE.W	D5,D4
	LSR.W	#8,D4
	CMP.B	$002C(A4),D4
	BGE.S	lbC000E54
	MOVE.W	D5,$0016(A2)
	BRA.S	lbC000E64
 
lbC000E54	CLR.W	$0016(A2)
	MOVE.B	$002C(A4),$0016(A2)
	MOVE.B	#$FF,$0015(A2)
lbC000E64	MOVEQ.L	#0,D4
	MOVE.B	$0016(A2),D4
lbC000E6A	MOVE.L	A4,A5
	BTST	#0,D4
	BEQ.S	lbC000E82
	ADD.L	#$000002F2,A5
	AND.L	#$FFFFFFFE,D4
	ADD.L	D4,A5
	BRA.S	lbC000E8A
 
lbC000E82	ADD.L	#$000001F2,A5
	ADD.L	D4,A5
lbC000E8A	MOVE.L	A5,(A3)
lbC000E8C	MOVEM.L	(SP)+,D4/D5/A5
	RTS	
 
lfo	MOVEM.L	D4/D5,-(SP)
	MOVEQ.L	#0,D4
	MOVE.B	$0027(A4),D4
	ADD.B	$0028(A4),D4
	TST.W	D4
	BEQ.S	lbC000ECE
	MOVE.W	10(A2),D5
	ADD.W	#$00C2,D5
	MOVE.B	0(A4,D5.W),D4
	EXT.W	D4
	SUB.W	D4,D2
	MOVE.B	$0027(A4),D4
	ADD.B	$0028(A4),D4
	CMP.B	11(A2),D4
	BEQ.S	lbC000EC8
	ADDQ.B	#1,11(A2)
	BRA.S	lbC000ECE
 
lbC000EC8	MOVE.B	$0027(A4),11(A2)
lbC000ECE	MOVEM.L	(SP)+,D4/D5
	RTS	
 
_SynthEffect	CMP.L	#$80000000,D0
	BEQ	lbC000EF4
	TST.L	D0
	BEQ	lbC000EF4
	MOVE.L	A0,-(SP)
	LEA	XNote(PC),A0
	MOVE.L	D0,(A0)
	LEA	XVoice(PC),A0
	MOVE.L	D1,(A0)
	MOVE.L	(SP)+,A0
lbC000EF4	RTS	
 
WasteTab0	dcb.l	8,0
WasteTab1	dcb.l	8,0
WasteTab2	dcb.l	8,0
WasteTab3	dcb.l	8,0
XNote	dc.l	0
XVoice	dcb.b	2,$FF
	dcb.b	2,$FF
CurrOtTrk0	dc.l	0
CurrOtTrk1	dc.l	0
CurrOtTrk2	dc.l	0
CurrOtTrk3	dc.l	0
CurrNote0	dc.l	0
CurrNote1	dc.l	0
CurrNote2	dc.l	0
CurrNote3	dc.l	0
RepeatVoice0	dc.b	0
RepeatVoice1	dc.b	0
RepeatVoice2	dc.b	0
RepeatVoice3	dc.b	0
VibratoTab	dc.b	0
	dc.b	3
	dc.b	6
	dc.b	9
	dc.b	12
	dc.b	$10
	dc.b	$13
	dc.b	$16
	dc.b	$19
	dc.b	$1C
	dc.b	$1F
	dc.b	$22
	dc.b	'%(+.1469<?BDGILNQSVXZ\^`bdfhjlmoprstvwxyz{{|}}~~~'
	dcb.b	2,$7F
	dcb.b	2,$7F
	dcb.b	2,$7F
	dc.b	$7F
	dc.b	'~~}}||{zyxwvutrqpnlkigeca_][YWTRPMKHEC@=;852/,)'
	dc.b	$27
	dc.b	'$ '
	dc.b	$1D
	dc.b	$1A
	dc.b	$17
	dc.b	$14
	dc.b	$11
	dc.b	14
	dc.b	11
	dc.b	8
	dc.b	5
	dc.b	2
	dc.b	$FF
	dc.b	$FC
	dc.b	$F9
	dc.b	$F6
	dc.b	$F2
	dc.b	$EF
	dc.b	$EC
	dc.b	$E9
	dc.b	$E6
	dc.b	$E3
	dc.b	$E0
	dc.b	$DD
	dc.b	$DA
	dc.b	$D7
	dc.b	$D4
	dc.b	$D1
	dc.b	$CE
	dc.b	$CB
	dc.b	$C9
	dc.b	$C6
	dc.b	$C3
	dc.b	$C0
	dc.b	$BE
	dc.b	$BB
	dc.b	$B8
	dc.b	$B6
	dc.b	$B3
	dc.b	$B1
	dc.b	$AE
	dc.b	$AC
	dc.b	$AA
	dc.b	$A8
	dc.b	$A5
	dc.b	$A3
	dc.b	$A1
	dc.b	$9F
	dc.b	$9D
	dc.b	$9B
	dc.b	$99
	dc.b	$98
	dc.b	$96
	dc.b	$94
	dc.b	$93
	dc.b	$91
	dc.b	$90
	dc.b	$8E
	dc.b	$8D
	dc.b	$8C
	dc.b	$8A
	dc.b	$89
	dc.b	$88
	dc.b	$87
	dcb.b	2,$86
	dc.b	$85
	dcb.b	2,$84
	dcb.b	2,$83
	dcb.b	2,$82
	dcb.b	2,$82
	dcb.b	2,$82
	dcb.b	2,$82
	dcb.b	2,$82
	dcb.b	2,$83
	dcb.b	2,$84
	dc.b	$85
	dc.b	$86
	dc.b	$87
	dc.b	$88
	dc.b	$89
	dc.b	$8A
	dc.b	$8B
	dc.b	$8C
	dc.b	$8D
	dc.b	$8F
	dc.b	$90
	dc.b	$92
	dc.b	$93
	dc.b	$95
	dc.b	$97
	dc.b	$98
	dc.b	$9A
	dc.b	$9C
	dc.b	$9E
	dc.b	$A0
	dc.b	$A2
	dc.b	$A4
	dc.b	$A6
	dc.b	$A9
	dc.b	$AB
	dc.b	$AD
	dc.b	$B0
	dc.b	$B2
	dc.b	$B5
	dc.b	$B7
	dc.b	$BA
	dc.b	$BC
	dc.b	$BF
	dc.b	$C2
	dc.b	$C4
	dc.b	$C7
	dc.b	$CA
	dc.b	$CD
	dc.b	$D0
	dc.b	$D3
	dc.b	$D6
	dc.b	$D9
	dc.b	$DB
	dc.b	$DE
	dc.b	$E2
	dc.b	$E5
	dc.b	$E8
	dc.b	$EB
	dc.b	$EE
	dc.b	$F1
	dc.b	$F4
	dc.b	$F7
	dc.b	$FA
	dc.b	$FD
	dc.b	0
FrekTab	dcb.b	2,0
	dc.b	'5'
	dc.b	$80
	dc.b	'2'
	dc.b	$80
	dc.b	'/'
	dc.b	$A0
	dc.b	'-',0
	dc.b	'*`(',0
	dc.b	'%'
	dc.b	$C0
	dc.b	'#'
	dc.b	$A0
	dc.b	'!'
	dc.b	$A0
	dc.b	$1F
	dc.b	$C0
	dc.b	$1E
	dc.b	0
	dc.b	$1C
	dc.b	'P'
	dc.b	$1A
	dc.b	$C0
	dc.b	$19
	dc.b	'@'
	dc.b	$17
	dc.b	$D0
	dc.b	$16
	dc.b	$80
	dc.b	$15
	dc.b	'0'
	dc.b	$14
	dc.b	0
	dc.b	$12
	dc.b	$E0
	dc.b	$11
	dc.b	$D0
	dc.b	$10
	dc.b	$D0
	dc.b	15
	dc.b	$E0
	dc.b	15
	dc.b	0
	dc.b	14
	dc.b	'(',$D
	dc.b	'`',$C
	dc.b	$A0
	dc.b	11
	dc.b	$E8
	dc.b	11
	dc.b	'@',$A
	dc.b	$98
	dc.b	10
	dc.b	0
	dc.b	9
	dc.b	'p'
	dc.b	8
	dc.b	$E8
	dc.b	8
	dc.b	'h'
	dc.b	7
	dc.b	$F0
	dc.b	7
	dc.b	$80
	dc.b	7
	dc.b	$14
	dc.b	6
	dc.b	$B0
	dc.b	6
	dc.b	'P'
	dc.b	5
	dc.b	$F4
	dc.b	5
	dc.b	$A0
	dc.b	5
	dc.b	'L'
	dc.b	5
	dc.b	0
	dc.b	4
	dc.b	$B8
	dc.b	4
	dc.b	't'
	dc.b	4
	dc.b	'4'
	dc.b	3
	dc.b	$F8
	dc.b	3
	dc.b	$C0
	dc.b	3
	dc.b	$8A
	dc.b	3
	dc.b	'X'
	dc.b	3
	dc.b	'('
	dc.b	2
	dc.b	$FA
	dc.b	2
	dc.b	$D0
	dc.b	2
	dc.b	$A6
	dc.b	2
	dc.b	$80
	dc.b	2
	dc.b	'\'
	dc.b	2
	dc.b	':'
	dc.b	2
	dc.b	$1A
	dc.b	1
	dc.b	$FC
	dc.b	1
	dc.b	$E0
	dc.b	1
	dc.b	$C5
	dc.b	1
	dc.b	$AC
	dc.b	1
	dc.b	$94
	dc.b	1
	dc.b	'}'
	dc.b	1
	dc.b	'h'
	dc.b	1
	dc.b	'S'
	dc.b	1
	dc.b	'@'
	dc.b	1
	dc.b	'.'
	dc.b	1
	dc.b	$1D
	dc.b	1
	dc.b	13
	dc.b	0
	dc.b	$FE
	dc.b	0
	dc.b	$F0
	dc.b	0
	dc.b	$E2
	dc.b	0
	dc.b	$D6
	dc.b	0
	dc.b	$CA
	dc.b	0
	dc.b	$BE
	dc.b	0
	dc.b	$B4
	dc.b	0
	dc.b	$AA
	dc.b	0
	dc.b	$A0
	dc.b	0
	dc.b	$97
	dc.b	0
	dc.b	$8F
	dc.b	0
	dc.b	$87
	dc.b	0
	dc.b	$7F
	dc.b	0
	dc.b	'x',0
	dc.b	'q',0
	dc.b	'k',0
	dc.b	'e',0
	dc.b	'_',0
	dc.b	'Z',0
	dc.b	'U',0
	dc.b	'P',0
	dc.b	'K',0
	dc.b	'G',0
	dc.b	'C',0
	dc.b	'?',0
	dc.b	'<',0
	dc.b	'8',0
	dc.b	'5',0
	dc.b	'2',0
	dc.b	'/',0
	dc.b	'-',0
	dc.b	'*',0
	dc.b	'(',0
	dc.b	'%',0
	dc.b	'#',0
	dc.b	'!',0
	dc.b	$1F
	dc.b	0
	dc.b	$1E
	dc.b	0
	dc.b	$1C
	dcb.b	2,$FF
_Voices	dc.b	1
Voice1On	dc.b	1
Voice2On	dc.b	1
Voice3On	dc.b	1
SongSpeedCnt	dc.b	0
_WhereInStep	dc.b	0
_WhichStep	dcb.b	2,0
SongSpeed	dc.b	0
TrackLength	dc.b	0
StartStep	dcb.b	2,0
StopStep	dcb.b	2,0
RepeatStep	dcb.b	2,0
TimerFreq	dcb.b	2,0
_OverTable	dc.l	0
_NoteTable	dc.l	0
_SynthInstr	dc.l	0
_SampleInstr	dc.l	0
_SongStructs	dc.l	0
_SaAddrList	dcb.l	$3F,0
_SaList	dcb.l	$3F,0
_SaLen	dcb.l	$3F,0
_SaRep	dcb.l	$3F,0
_SampleNames	dcb.l	$40,0
	dcb.l	$40,0
	dcb.l	$40,0
	dcb.l	$40,0
	dcb.l	$3B,0

	SECTION xx001A80,DATA,CHIP
ZeroWaveForm	dcb.l	2,0
Module	dc.l	0
	END
