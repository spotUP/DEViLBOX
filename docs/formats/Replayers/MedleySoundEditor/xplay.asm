********************************************************
* xplay.asm
* 'future player' audio routine
*
* (c) Paul van der Valk
*
* revision history:
* 03-nov-90	v1.00 - internal version used by Imploder 4.0
* 11-apr-98	v1.01 - fixed A4000 volume bug (untested)
*			first public release (http://www.casema.net/~falcon)
*
********************************************************

;-----------------------------------------------------
; local defs

DefTrsp = 48

LoOct	= 2
Oct0	= LoOct+12
Oct1	= Oct0+12
Oct2	= Oct1+12
Oct3	= Oct2+12
Oct4	= Oct3+12
Oct5	= Oct4+12
Oct6	= Oct5+12
Oct7	= Oct6+12

NT_INTERRUPT=2

;-----------------------------------------------------
; includes

	INCDIR	MAC:
	INCLUDE	"generalmacs.i"
	INCLUDE	"libmacs.i"
	INCLUDE	"funcmacs.i"
	INCLUDE	"strucs.i"
;;	INCEQUS

;-----------------------------------------------------
; exports / imports

	XDEF	InstallSound
	XDEF	RemoveSound
	XDEF	EnablePlay
	XDEF	DisablePlay
	XDEF	DisableSound
	XDEF	InstallScore
	XDEF	InstallScoreStruc
	XDEF	InstallJingle
	XDEF	InstallExtJingle
	XDEF	SetTempo
	XDEF	GetTempo
	XDEF	SetTranspose
	XDEF	SetFlangAlgo
	XDEF	SetFlangSpeed
	XDEF	SetSongRepeat
	XDEF	SetSoundUpdRate
	XDEF	SetSongVolume
	XDEF	BackupSong
	XDEF	RestoreSong
	XDEF	ChannelTable

	; typical xplay defs

	XDEF	InstallMedley
	XDEF	InstallExtMedley
	XDEF	GetMsScore
	XDEF	GetMsTrack
	XDEF	GetMsInstr
	XDEF	GetMsSample
	XDEF	SetGlobInstr
	XDEF	StealChannel
	XDEF	ReturnChannel

;-----------------------------------------------------
; xplay wave format

    STRUCTURE	Yekbokwelila,0
	STRUCT	ww_Name,16
	WORD	ww_CycleSize
	WORD	ww_Dummy
	BYTE	ww_Octave
	BYTE	ww_FragFactor
	BYTE	ww_IsDoubleBufd
	BYTE	ww_Pad
	LABEL	ww_Sizeof

;-----------------------------------------------------
; installation code


InstallExtMedley:
;^^^^^^^^^^^^^^^
	;
	; a0	Songs (if 0 then ignored)
	; a1	Instruments (if 0 then ignored)

	move.l	a1,d0
	beq.s	InstallMedley		install A if B == 0

	move.l	a0,-(SP)
	move.l	a1,a0
	bsr.s	InstallMedley
	move.l	(SP)+,a0
	move.l	a0,d0
	beq	_rts			if 0 then ignore A
	moveq	#1,d0			count = 2 for score & tracks
	bra.s	_InsCusMed

InstallMedley:
;^^^^^^^^^^^^
	;
	; a0	Medley address

	moveq	#3,d0
_InsCusMed:
	lea	MedVarStart(PC),a1
10$	move.l	a0,d1
	add.l	(a0)+,d1		RC.L
	move.l	d1,(a1)+
	dbra	d0,10$
	rts

InstallSound:
;^^^^^^^^^^^
	;
	; d0.b	CIA num: 0 = ciaa, 1 = ciab
	;

	move.l	GP,GpStore
	bsr	DisablePlay
	bsr	InitIrq
	beq.s	InstallEnd
	bsr	InitSCHs
	bsr	BackupSong		avoids trouble with uninited RestoreSong()
	moveq	#63,d0
	bsr	SetSongVolume
	moveq	#-1,d0
InstallEnd:
	rts

RemoveSound:
;^^^^^^^^^^
	bsr	DisableSound
	bsr	ExitIrq
	moveq	#0,d0
	rts

;------------------
; installation subs

InitIrq:
	; using ciaN.resource
	;
	tst.b	d0			cia number
	bne.s	InitIrqB

InitIrqA:
	lea	$bfe001,a0
	lea	ciaaname(PC),a1
	bra.s	_InitIrq

InitIrqB:
	lea	$bfd000,a0
	lea	ciabname(PC),a1
	;
_InitIrq:
	PUSH	a2/a6
	move.l	a0,CiaBaseAdr
	moveq	#0,d0
	CALLEXE	OpenResource
	move.l	d0,CiaResPtr
	beq.s	_ii2_Fail
	move.l	d0,a6
	lea	IntStruc(PC),a1
	moveq	#0,d0			intnum - 0 = timer
	jsr	-6(a6)			SetIntVector
	tst.l	d0
	bne.s	_ii2_Fail

	move.w	#$3000,d0
	bsr	SetTempo		returns ciabase adr in a0
	move.b	#$81,$d01(a0)		ICR
	move.b	#$01,$e01(a0)		CRA
	st.b	IrqInstalled
	PULL	a2/a6
	moveq	#-1,d0
	rts

_ii2_Fail:
	PULL	a2/a6
	moveq	#0,d0
	rts

ExitIrq:
	tst.b	IrqInstalled
	beq.s	100$
	bsr	DisableSound
	move.l	CiaResPtr,d0
	beq.s	100$
	move.l	d0,a6
	move	#0,d0				intnum
	jsr	-12(a6)
	clr.b	IrqInstalled
100$	rts

IntStruc:
	dc.l	0,0			* ln_Succ, ln_Pred
	dc.b	NT_INTERRUPT,0		* ln_Type, ln_Prioritiy
	dc.l	IntName			* ln_Name
	dc.l	0			* is_Data (GP comes here?)
	dc.l	IrqCode			* is_Code		*RELOC*

IntName		dc.b	'Medley Sound',0
ciaaname	dc.b	'ciaa.resource',0
ciabname	dc.b	'ciab.resource',0
		even

;-----------------------------------------------------
; initialiisation subs

InitSCHs:
	;
	; initialise channel strucs
	;
	lea	SCH0(PC),a0
	moveq	#0,d0
	bsr.s	InitSch
	lea	SCH1(PC),a0
	moveq	#1,d0
	bsr.s	InitSch
	lea	SCH2(PC),a0
	moveq	#2,d0
	bsr.s	InitSch
	lea	SCH3(PC),a0
	moveq	#3,d0
	;
InitSch:
	; a0	SoundChannel struc
	; d0	''	''   num
	;
	and.w	#3,d0
	clr.b	sch_IsActive(a0)

	; set dma-masks

	moveq	#1,d1
	asl.w	d0,d1
	move.w	d1,sch_DmaMask0(a0)
	or.w	#$8000,d1
	move.w	d1,sch_DmaMask1(a0)

	; set hardbase

	moveq	#0,d1
	move.b	d0,d1
	asl.w	#4,d1
	add.l	#$dff0a0,d1
	move.l	d1,sch_PaulaPtr(a0)

	; set chipbuffer

	moveq	#0,d1
	move.b	d0,d1
	asl.w	#5,d1			x 32
	lea	ChipSpace,a1
	add.w	d1,a1
	move.l	a1,sch_ChipBuf(a0)

	; set channel flags

	clr.b	sch_FlagLH(a0)
	move.b	d0,d1
	cmp.b	#2,d1
	blo.s	100$
	st.b	sch_FlagLH(a0)
	eor.b	#1,d1
100$	btst	#0,d1
	sne.b	sch_FlagLR(a0)
	rts

;-----------------------------------------------------
; interface subs

SetTempo:
;^^^^^^^
	cmp.w	#$1000,d0
	bhi.s	10$
	move.w	#$1000,d0
10$	move.w	d0,CurSpeed
	move.l	CiaBaseAdr(PC),a0
	move.b	d0,$401(a0)		TALO
	lsr.w	#8,d0
	move.b	d0,$501(a0)		TAHI
	rts

GetTempo:
;^^^^^^^
	move.w	CurSpeed(PC),d0
	rts

SetTranspose:
;^^^^^^^^^^^
	move.b	d0,GlobTrnsp
	rts

SetSongRepeat:
;^^^^^^^^^^^^
	move.b	d0,SongRepeat
	rts

SetSoundUpdRate:
;^^^^^^^^^^^^^^
	move.b	d0,UpdRate
	rts

SetFlangSpeed:
;^^^^^^^^^^^^
	move.b	d0,FlangSpeed
	move.b	#1,FlangClock
	rts

SetFlangAlgo:
;^^^^^^^^^^^
	lea	FlangAlgoNum(PC),a0
	move.b	d0,(a0)
	lea	FlangTable(PC),a0
	cmp.b	-1(a0),d0
	bls.s	10$
	moveq	#0,d0
10$	and.w	#$ff,d0
	asl.w	#1,d0
	add.w	d0,a0
	add.w	(a0),a0
	move.l	a0,FlangPtr
	move.l	a0,FlangInitPtr
	;
SetFlang:
	; a0	FlangPtr
	; <=	a0 updated ptr = a0 + 4
	;

	move.l	a2,-(SP)
	lea	ChannelTable(PC),a2
	moveq	#3,d1
10$	move.l	(a2)+,a1
	move.b	(a0)+,d0
	ext.w	d0
	move.w	d0,sch_Detune(a1)
	dbra	d1,10$
	move.l	(SP)+,a2
	rts

;----

SetSongVolume:
;^^^^^^^^^^^^
	lea	SongVolTable(PC),a0
	;
CalcVolTable:
	; a0	BufPtr (64 bytes)
	; d0.B	max level (0..63)
	;

	PUSH	d2-d4		
	and.b	#63,d0			jah
	moveq	#63,d1			wrap counter
	moveq	#63,d2			loopcount
	moveq	#63,d3			constant = 63
	moveq	#0,d4			running value
10$	move.b	d4,(a0)+
	add.b	d0,d1
	cmp.b	d3,d1
	blo.s	20$
	sub.b	d3,d1
	addq.b	#1,d4
20$	dbra	d2,10$
	PULL	d2-d4
	rts

EnablePlay:
;^^^^^^^^^
	st.b	IrqStatus
	rts

DisablePlay:
;^^^^^^^^^^
	clr.b	IrqStatus
	rts

InstallScore:
;^^^^^^^^^^^
	;
	; d0	ScoreNum

	move.l	ScoTable(PC),a0
	cmp.b	-1(a0),d0
	bhi	is_Fail			if > numentries
	and.w	#$ff,d0
	asl.w	#2,d0
	add.w	d0,a0
	move.l	(a0),d0			RC.L
	beq	is_Fail
	add.l	d0,a0			&ScoreStruc

InstallScoreStruc:
;^^^^^^^^^^^^^^^^
	; a0	ScoreStructure
	;
	bsr.s	DisablePlay
	clr.b	PlayingJingle
	clr.b	JingDoneReq
	PUSH	a2-a6/d2-d7
	move.l	a0,a2
	lea	ChannelTable(PC),a3
	moveq	#0,d2			channel num
is_Loop:
	move.l	(a3)+,a4		a4 = sch
	move.l	a4,a0
	bsr	ClrChannel
	moveq	#0,d0
	move.b	sco_Tracks(a2,d2.W),d0
	beq	is_Next

	; set track

	asl.w	#2,d0
	move.l	TrkTable(PC),a0
	add.w	d0,a0
	add.l	(a0),a0
	add.w	#16,a0			skip name
	move.l	a0,sch_TrackPtr(a4)
	move.l	a0,sch_InitialTrkPtr(a4)

	; set instrument

	moveq	#0,d0
	move.b	sco_Instrs(a2,d2.W),d0
	bne.s	77$
	move.b	sco_DefInstr(a2),d0
	bne.s	77$
	moveq	#1,d0

77$	move.b	d0,sch_InsNum(a4)
	asl.w	#2,d0
	move.l	InsTable(PC),a0
	add.w	d0,a0
	add.l	(a0),a0				RC.L
	move.l	a0,sch_Instrument(a4)

	; set effect pars

	move.b	sco_FxBases(a2,d2.W),sch_FxTimeBase(a4)
	bne.s	88$
	st.b	sch_IsActive(a4)		enable if no effect
88$	move.b	sco_FxRnds(a2,d2.W),sch_FxTimeRnd(a4)

	; set stuff

	move.b	sco_Volume(a2),d0
	bsr	SetSongVolume
	move.b	sco_UpdReduction(a2),d0
	bsr	SetSoundUpdRate
	move.b	sco_Repeat(a2),d0
	bsr	SetSongRepeat
	move.b	sco_Transpose(a2),d0
	bsr	SetTranspose
	move.b	sco_FlangAlgo(a2),d0
	bsr	SetFlangAlgo
	move.b	sco_FlangSpeed(a2),d0
	bsr	SetFlangSpeed

	; set tempo

	move.w	sco_Tempo(a2),d0
	bsr	SetTempo

	; set volume

	move.b	sco_Volumes(a2,d2.W),d0
	lea	sch_VolTable(a4),a0
	bsr	CalcVolTable

	; enable channels

	move.b	#1,sch_TrackMode(a4)	Enable track parsing

is_Next	addq.b	#1,d2
	cmp.b	#4,d2
	blo	is_Loop
	PULL	a2-a6/d2-d7
	moveq	#-1,d0
	bra.s	is_Exit

is_Fail:
	moveq	#0,d0
is_Exit:
	lea	InstallScoOk(PC),a0
	move.b	d0,(a0)
	rts

ClrChannels:
	lea	SCH0(PC),a0
	bsr.s	ClrChannel
	lea	SCH1(PC),a0
	bsr.s	ClrChannel
	lea	SCH2(PC),a0
	bsr.s	ClrChannel
	lea	SCH3(PC),a0
ClrChannel:
	clr.b	sch_IsActive(a0)
	clr.b	sch_TrackMode(a0)
	clr.b	sch_Gate(a0)
	clr.b	sch_Trig(a0)
	clr.b	sch_UpdRate(a0)
	clr.b	sch_FxOffTime(a0)
	move.b	#1,sch_Duration(a0)
	lea	sch_MgPars(a0),a1
	clr.w	sch_Detune(a0)
	clr.w	sch_EnvLevel(a0)
	clr.l	(a1)+
	clr.l	(a1)+
	clr.l	(a1)+
	clr.l	(a1)+
	tst.b	sch_IsStolen(a0)
	bne.s	100$
	move.w	sch_DmaMask0(a0),$dff096	turn off DMA
100$	moveq	#63,d0
	move.b	d0,sch_Volume(a0)
	lea	sch_VolTable(a0),a0
	bra	CalcVolTable

BackupSong:
;^^^^^^^^^
	bsr	DisablePlay
	lea	RelevantVars(PC),a0
	lea	BackupSpace(PC),a1
_backmem:
	move.w	#(RelSpaceSize/2)-1,d0
10$	move.w	(a0)+,(a1)+
	dbra	d0,10$
	rts

RestoreSong:
;^^^^^^^^^^
	bsr	DisableSound
	lea	BackupSpace(PC),a0
	lea	RelevantVars(PC),a1
	bsr.s	_backmem
	move.w	CurSpeed(PC),d0
	bra	SetTempo

InstallJingle:
;^^^^^^^^^^^^
	; d0	ScoreNum
	;
	move.w	d0,-(SP)
	bsr	DisableSound
	bsr	BackupSong
	move.w	(SP)+,d0
	bsr	InstallScore
	sne	PlayingJingle
	rts

InstallExtJingle:
;^^^^^^^^^^^^^^^
	; a0	Songs
	; a1	Instruments
	; d0	ScoreNum
	;
	move.w	d0,-(SP)
	PUSH	a0/a1
	bsr	DisableSound
	bsr	BackupSong
	PULL	a0/a1
	bsr	InstallExtMedley
	move.w	(SP)+,d0
	bsr	InstallScore
	sne	PlayingJingle
	rts

;--- typical xplay funcs

GetMsScore:
;^^^^^^^^^
	move.l	ScoTable(PC),a0
	bra.s	_GetTableItem
GetMsTrack:
;^^^^^^^^^
	move.l	TrkTable(PC),a0
	bra.s	_GetTableItem
GetMsInstr:
;^^^^^^^^^
	move.l	InsTable(PC),a0
	bra.s	_GetTableItem
GetMsSample:
;^^^^^^^^^^
	move.l	WavTable(PC),a0
_GetTableItem:
	; a0	Table
	; <=	a0/d0 structure or 0 (z = 1)
	;
	cmp.b	-1(a0),d0
	bls.s	10$
	moveq	#0,d0
	bra.s	90$
10$	and.w	#$ff,d0
	asl.w	#2,d0
	add.w	d0,a0
	move.l	(a0),d0
	beq.s	90$			Error - undefied item 
	add.l	a0,d0
90$	move.l	d0,a0
	rts

SetGlobInstr:
	; d0	InsNum
	; <=	d0 instrument or 0 (z=1)
	;

	bsr	GetMsInstr
	beq.s	5$
	lea	10$(PC),a0
	bsr.s	With4ChnDo
5$	tst.l	d0
	rts

10$	move.l	d0,sch_Instrument(a0)
	clr.w	sch_EnvLevel(a0)
	lea	sch_MgPars(a0),a1
	clr.l	(a1)+
	clr.l	(a1)+
	clr.l	(a1)+
	clr.l	(a1)+
	rts

With4ChnDo:
	move.l	a6,-(SP)
	move.l	a0,a6
	lea	SCH0(PC),a0
	jsr	(a6)
	lea	SCH1(PC),a0
	jsr	(a6)
	lea	SCH2(PC),a0
	jsr	(a6)
	lea	SCH3(PC),a0
	jsr	(a6)
	move.l	(SP)+,a6
	rts


DisableSound:
;^^^^^^^^^^^
	bsr	DisablePlay
	lea	10$(PC),a0
	bra.s	With4ChnDo
10$	tst.b	sch_IsStolen(a0)
	bne.s	20$
	move.w	sch_DmaMask0(a0),$dff096
20$	rts

StealChannel:
;^^^^^^^^^^^
	; d0.B	Channel Number (0..3)
	;
	bsr.s	_GetChnStruc
	st.b	sch_IsStolen(a0)
	move.l	sch_PaulaPtr(a0),a0
	rts

ReturnChannel:
;^^^^^^^^^^^^
	; d0.B	Channel Number (0..3)
	;
	bsr.s	_GetChnStruc
	clr.b	sch_IsStolen(a0)
	rts

_GetChnStruc:
	and.w	#3,d0
	asl.w	#2,d0
	lea	ChannelTable(PC),a0
	move.l	0(a0,d0.W),a0
	rts

;-----------------------------------------------------
; interrupt code

IrqCode:
	addq.w	#1,Jiffies
	tst.b	IrqStatus
	beq.s	_rts
	PUSH	d0-d7/a0-a6
	move.l	GpStore,GP

	; check for jingle done

	tst.b	JingDoneReq
	beq.s	NoJingReq
	clr.b	JingDoneReq
	clr.b	PlayingJingle
	bsr	RestoreSong
	bsr	EnablePlay		because RestoreSong() calls DisableSound()

NoJingReq:

	; Update flanger

	move.b	FlangSpeed(PC),d0
	beq.s	UpdFlangEnd
	lea	FlangClock(PC),a0
	subq.b	#1,(a0)
	bne.s	UpdFlangEnd
	move.b	d0,(a0)

	move.l	FlangPtr(PC),a0
	cmp.b	#$80,(a0)
	bne.s	UpdFlangNoInit
	move.l	FlangInitPtr(PC),a0
UpdFlangNoInit:

	bsr	SetFlang
	move.l	a0,FlangPtr

UpdFlangEnd:

	; update channels

	lea	SCH0(PC),a2
	bsr.s	UpdSCH
	lea	SCH1(PC),a2
	bsr.s	UpdSCH
	lea	SCH2(PC),a2
	bsr.s	UpdSCH
	lea	SCH3(PC),a2
	bsr.s	UpdSCH
	PULL	d0-d7/a0-a6

_rts	rts

;---------------------------
; the channel update routine

UpdSCH:
	; a2	SCH structure
	;
	;	a3 will be Instrument structure throughout
	;
	tst.b	sch_IsActive(a2)
	beq	ChkEffect
	move.l	sch_Instrument(a2),a3

	; Update Track

UpdTrk	tst.b	sch_TrackMode(a2)
	beq.s	UpdTrkEnd
	subq.b	#1,sch_Duration(a2)
	bne.s	UpdTrkEnd
	st.b	sch_MustFetchWave(a2)
	clr.b	sch_UpdRate(a2)
	move.l	sch_TrackPtr(a2),a0

ReUpdTrk:
5$	moveq	#0,d0			????
	move.b	(a0)+,d0		fetch note
	bmi.s	UpdTrkCode
	beq.s	10$			a rest
	move.b	d0,sch_LogNote(a2)
	st.b	sch_Gate(a2)
	st.b	sch_Trig(a2)
	bra.s	20$
10$	clr.b	sch_Gate(a2)
	clr.b	sch_Trig(a2)
20$	move.b	(a0)+,sch_Duration(a2)
	beq.s	5$			ignore chorded notes!
	bpl.s	30$
	clr.b	sch_Trig(a2)		a tied note
	bclr.b	#7,sch_Duration(a2)
30$	move.l	a0,sch_TrackPtr(a2)
	bra.s	UpdTrkEnd

UpdTrkCode:
	move.b	(a0)+,d1
	and.w	#3,d0
	asl.w	#1,d0
	lea	ScodeVecTable(PC,d0.W),a1
	add.w	(a1),a1
	jsr	(a1)
	bra.s	ReUpdTrk

ScodeVecTable:
	dc.w	scode_end-*		$80
	dc.w	_rts-*			$81 - timesig
	dc.w	scode_dynlevel-*	$82
	dc.w	scode_instr-*		$83

UpdTrkEnd:

	; updating sound starts here
	; check for lo-rate update

	subq.b	#1,sch_UpdRate(a2)
	bpl.s	_rts
	move.b	UpdRate(PC),sch_UpdRate(a2)

	; Get wave according to bank

GetOctedWave:
	tst.b	sch_MustFetchWave(a2)
	beq	GotOctedWave
	clr.b	sch_MustFetchWave(a2)		ja!
	move.b	sch_LogNote(a2),d2

	; add transpose & arp

	add.b	GlobTrnsp(PC),d2
	add.b	ins_Transpose(a3),d2

	; find octave & wave

	cmp.b	#2,ins_SoundMode(a3)		2 = dynamic
	bne.s	GetStdOctWave

	; fetch octave & period for dynamic mode

	moveq	#-1,d0		octave
	moveq	#12,d1		notes per octave
GetMode2Oct:
	addq.b	#1,d0
	sub.b	d1,d2
	bcc.s	GetMode2Oct
	move.b	d0,sch_OutOctave(a2)
	add.b	d1,d2
	ext.w	d2
	asl.w	#1,d2
	lea	LogToPerTable+24(PC),a0
	move.w	0(a0,d2.W),sch_PrePeriod(a2)

	; get DynWaveStruc

	moveq	#0,d0
	move.b	ins_WaveRefs(a3),d0
	asl.w	#2,d0

	move.l	WavTable(PC),a0
	add.w	d0,a0
	add.l	(a0),a0
	move.l	a0,sch_OutWaveStruc(a2)
	move.w	ww_CycleSize(a0),sch_OutCycleSize(a2)
	add.w	#ww_Sizeof,a0
	move.l	a0,sch_OutWaveBuf(a2)
	clr.b	sch_DynWaveValid(a2)
	bra	GotOctedWave

GetStdOctWave:
	move.b	d2,d0
	cmp.b	#Oct4,d0
	blo.s	gw_0_3
	cmp.b	#Oct6,d0
	blo.s	gw_4_5
	cmp.b	#Oct7,d0
	blo.s	gw_6
	lea	ins_WaveRefs+8(a3),a0
	move.b	#7,sch_OutOctave(a2)
	bra.s	fw7
gw_6	lea	ins_WaveRefs+7(a3),a0
	move.b	#6,sch_OutOctave(a2)
	bra.s	fw6
gw_4_5	cmp.b	#Oct5,d0
	blo.s	gw_4
	lea	ins_WaveRefs+6(a3),a0
	move.b	#5,sch_OutOctave(a2)
	bra.s	fw5
gw_4	lea	ins_WaveRefs+5(a3),a0
	move.b	#4,sch_OutOctave(a2)
	bra.s	fw4

gw_0_3	cmp.b	#Oct2,d0
	blo.s	gw_0_1
	cmp.b	#Oct3,d0
	blo.s	gw_2
	lea	ins_WaveRefs+4(a3),a0
	move.b	#3,sch_OutOctave(a2)
	bra.s	fw3
gw_2	lea	ins_WaveRefs+3(a3),a0
	move.b	#2,sch_OutOctave(a2)
	bra.s	fw2
gw_0_1	cmp.b	#Oct1,d0
	blo.s	gw_0
	lea	ins_WaveRefs+2(a3),a0
	move.b	#1,sch_OutOctave(a2)
	bra.s	fw1
gw_0	lea	ins_WaveRefs+1(a3),a0
	clr.b	sch_OutOctave(a2)
	bra.s	fw0

tab_Mul12b:
	dc.b	00,12,24,36
	dc.b	48,60,72,84
	even

fw7	move.b	-(a0),d0
	bne.s	gotwavenum
fw6	move.b	-(a0),d0
	bne.s	gotwavenum
fw5	move.b	-(a0),d0
	bne.s	gotwavenum
fw4	move.b	-(a0),d0
	bne.s	gotwavenum
fw3	move.b	-(a0),d0
	bne.s	gotwavenum
fw2	move.b	-(a0),d0
	bne.s	gotwavenum
fw1	move.b	-(a0),d0
	bne.s	gotwavenum
fw0	move.b	-(a0),d0
	;
gotwavenum:
	move.b	d0,sch_OutWaveNum(a2)
	moveq	#0,d1
	move.b	d0,d1
	asl.w	#2,d1
	move.l	WavTable(PC),a1
	add.w	d1,a1
	add.l	(a1),a1				a1 = wavestruc
	move.l	a1,sch_OutWaveStruc(a2)
	move.l	a1,a0
	add.w	#ww_Sizeof,a0
	move.l	a0,sch_OutWaveBuf(a2)

	; adjust logindex

	moveq	#0,d1
	move.b	ww_Octave(a1),d1
	sub.b	tab_Mul12b(PC,d1.W),d2
	move.w	ww_CycleSize(a1),d6		d6 = CycleSize

100$	cmp.b	#1,ins_SoundMode(a3)		base shifted?
	bne.s	200$
	subq.b	#6,d2				oct - 1
	subq.b	#6,d2

200$	add.b	#DefTrsp,d2
	moveq	#0,d1
	move.b	d2,d1
	move.b	d1,sch_OutLogNote(a2)
	asl.w	#1,d1
	lea	LogToPerTable(PC),a0
	move.w	0(a0,d1.W),sch_PrePeriod(a2)
	move.w	d6,sch_OutCycleSize(a2)
	;
GotOctedWave:
	;
	; it's a long skip eh?
	;
	; pars set here are:
	; PrePeriod
	; Wavestruc
	; WaveBufPtr
	; WaveCycleSize

	move.w	sch_PrePeriod(a2),sch_Period(a2)

UpdEnv	move.w	sch_EnvLevel(a2),d0
	tst.b	sch_Trig(a2)
	beq.s	10$
	moveq	#0,d0
	clr.b	sch_EnvStatus(a2)
10$	tst.b	sch_Gate(a2)
	beq.s	UpdEnvR
	tst.b	sch_EnvStatus(a2)
	beq.s	UpdEnvA
UpdEnvD	sub.w	ins_EnvDSlope(a3),d0
	bcs.s	10$
	cmp.w	ins_EnvSLevel(a3),d0
	bhi.s	UpdEnvEnd
10$	move.w	ins_EnvSLevel(a3),d0
	bra.s	UpdEnvEnd

UpdEnvA	add.w	ins_EnvASlope(a3),d0
	bcs.s	10$
	cmp.w	ins_EnvTLevel(a3),d0
	blo.s	UpdEnvEnd
10$	move.w	ins_EnvTLevel(a3),d0
	st.b	sch_EnvStatus(a2)
	bra.s	UpdEnvEnd

UpdEnvR	sub.w	ins_EnvRSlope(a3),d0
	bcc.s	UpdEnvEnd
	moveq	#0,d0
UpdEnvEnd:
	move.w	d0,sch_EnvLevel(a2)
	move.w	d0,sch_Amplitude(a2)

	; Init MG destinatio values

	clr.w	sch_BShift(a2)
	clr.w	sch_DShift(a2)
	clr.b	sch_DynFreq(a2)

	; Update MGs

UpdMgs	lea	ins_Mg1(a3),a4
	lea	sch_MgPars(a2),a6	WORD Level BYTE DelayTime, status (u/d)
	moveq	#3,d7			loopcount
	;
UpdMg	tst.b	(a4)			0(a4) = mg_Destination
	beq	UpdNextMg		if Dest. == 0 then this MG is off
	move.w	(a6),d0			d0 = Level
	tst.b	sch_Trig(a2)
	beq.s	UpdMgNoTrig

	; init mg on trigger

	move.b	mg_DelayTime(a4),2(a6)
	tst.b	mg_TrigMode(a4)
	bne.s	UpdMgNoTrig		no initial value

	clr.b	3(a6)			status = 0 = up
	moveq	#0,d0			initial value

	; check half shift

	moveq	#0,d1
	move.b	mg_HalfShift(a4),d1
	beq.s	200$
	tst.b	sch_ChnFlags(a2,d1.W)
	beq.s	200$
	st.b	3(a6)
	move.w	mg_Level(a4),d0

200$	; check quarter shift

	cmp.b	#1,(a4)			dest == 1 == FM-lo?
	bne.s	210$
	tst.b	mg_DelayTime(a4)
	bne.s	250$			force quarter init for delayed Fm
210$	move.b	mg_QuarterShift(a4),d1
	beq.s	300$
	tst.b	sch_ChnFlags(a2,d1.W)
	beq.s	300$
250$	move.w	mg_Level(a4),d0
	lsr.w	#1,d0

300$	; end of init

UpdMgNoTrig:
	tst.b	2(a6)			delaytime left
	bne.s	UpdMgDT
	tst.b	3(a6)
	bne.s	UpdMgDn
	;

UpdMgUp	add.w	mg_Slope1(a4),d0
	bcs.s	10$
	cmp.w	mg_Level(a4),d0
	blo.s	UpdMgDone
10$	move.w	mg_Level(a4),d0
	st.b	3(a6)
	bra.s	UpdMgDone

UpdMgDn	sub.w	mg_Slope2(a4),d0
	beq.s	20$
	bcc.s	UpdMgDone
10$	moveq	#0,d0
20$	tst.b	mg_SingleShot(a4)
	bne.s	UpdMgDone
	clr.b	3(a6)
	bra.s	UpdMgDone

UpdMgDT	subq.b	#1,2(a6)
	;
UpdMgDone:
	;
	; set destination
	;

	move.w	d0,(a6)
	tst.b	mg_Shape(a4)	<>0 = blockwave
	beq.s	10$
	moveq	#0,d0
	tst.b	3(a6)
	beq.s	10$
	move.w	mg_Level(a4),d0

10$	tst.b	mg_RvsOut(a4)
	beq.s	20$
	neg.w	d0
	add.w	mg_Level(a4),d0

20$	cmp.b	#2,(a4)		Dest
	blo.s	UseMgFm		#1
	beq.s	UseMgAm		#2
	cmp.b	#4,(a4)
	blo.s	UseMgBs		#3
	beq.s	UseMgDs		#4
	cmp.b	#6,(a4)
	blo.s	UseMgFmPos	#5
	beq.s	UseMgFmNeg	#6

	;			#7
UseMgDF:
	lsr.w	#8,d0
	add.b	d0,sch_DynFreq(a2)
	bra.s	UpdNextMg

UseMgAm	sub.w	d0,sch_Amplitude(a2)		* AM - 2
	bcc.s	UpdNextMg
	clr.w	sch_Amplitude(a2)
	bra.s	UpdNextMg

UseMgBs	lsr.w	#8,d0
	add.w	d0,sch_BShift(a2)		* BS - 3
	bra.s	UpdNextMg

UseMgDs	lsr.w	#8,d0
	add.w	d0,sch_DShift(a2)		* DS - 4
	bra.s	UpdNextMg

UseMgFmPos:
	lsr.w	#5,d0
	add.w	d0,sch_Period(a2)
	bra.s	UpdNextMg

UseMgFmNeg:
	lsr.w	#5,d0
	sub.w	d0,sch_Period(a2)
	bra.s	UpdNextMg

UseMgFm	move.w	mg_Level(a4),d1			* FM - 1
	lsr.w	#1,d1
	sub.w	d0,d1
	asr.w	#8,d1
	add.w	d1,sch_Period(a2)
	;
UpdNextMg:
	add.w	#mg_Sizeof,a4
	addq.w	#4,a6
	dbra	d7,UpdMg

	; Get Wave

GetWave:
	move.l	sch_OutWaveStruc(a2),a1
	move.w	sch_OutCycleSize(a2),d6
	move.l	sch_OutWaveBuf(a2),a0
	move.b	ins_SoundMode(a3),d0
	beq	GetWaveMode0
	subq.b	#1,d0
	beq	GetWaveMode1
	;

GetWaveMode2:
	; Dynamic !!!
	;

	moveq	#0,d2
	move.b	ins_DShift(a3),d2
	add.w	sch_DShift(a2),d2
	cmp.w	sch_LastDShift(a2),d2
	bne.s	DoCalcDynWave

	tst.b	sch_DynWaveValid(a2)
	bne.s	ExitMode2

DoCalcDynWave:
	move.w	d2,sch_LastDShift(a2)
	moveq	#32,d6			size
	moveq	#0,d4
	move.b	ins_DynFreq(a3),d4	advance 1
	add.b	sch_DynFreq(a2),d4
	move.w	d4,d5			advance 2
	lsr.w	#4,d4
	bne.s	10$
	moveq	#$10,d4
10$	and.w	#$0f,d5
	bne.s	20$
	moveq	#$10,d5
20$	move.b	sch_OutOctave(a2),d0
	move.b	d0,d1
	subq.b	#4,d1
	bcs.s	Mode2_GotOcts		oct <= 4

Mode2_HiOcts:
	cmp.b	#4,d1
	bls.s	10$
	moveq	#4,d1			max lsr to avoid zero len result

10$	lsr.w	d1,d6			target size / n
;!	lsr.w	d1,d2			offset / n
	asl.w	d1,d4			advance1 * n
	asl.w	d1,d5			advance2 * n
	moveq	#4,d0

Mode2_GotOcts:
	move.b	d0,sch_DynPerLsr(a2)

	; CalcDynWave()
	; a0	SourceWaveBuffer
	; d2	Offset 1
	; d4	Advance 1
	; d5	Advanve 2
	; d6	Size

	move.l	sch_OutWaveBuf(a2),a0
	move.l	sch_ChipBuf(a2),a1
	moveq	#0,d3			Initial offset 2
	move.w	d6,d7			d7 = loopcount
	lsr.w	#1,d6
	move.w	d6,sch_DynWaveSize(a2)	size in words
	move.w	sch_OutCycleSize(a2),d6
	subq.w	#1,d6			d6 = mask

10$	and.w	d6,d2			clip index 1
	and.w	d6,d3			clip index 2
	move.b	0(a0,d2.W),d0		src1
	add.b	0(a0,d3.W),d0		+ src2
	add.w	d4,d2			advance index 1
	add.w	d5,d3			advance index 2
	move.b	d0,(a1)+
	subq.b	#1,d7
	bne.s	10$
	st.b	sch_DynWaveValid(a2)

ExitMode2:
	move.w	sch_Period(a2),d0
	move.b	sch_DynPerLsr(a2),d1
	lsr.w	d1,d0
	move.w	d0,sch_Period(a2)
	move.w	sch_DynWaveSize(a2),d2
	move.l	sch_ChipBuf(a2),a0
	bra.s	GotWave

GetWaveMode0:
	; standard
	;

	move.w	d6,d2
	lsr.w	#1,d2
	bra.s	GotWave

GetWaveMode1:
	; base shifted	
	;

	move.w	d6,d2
	lsr.w	#2,d2
	moveq	#0,d0
	move.b	ins_BShift(a3),d0
	add.w	sch_BShift(a2),d0
	move.b	ww_Octave(a1),d1
	lsr.b	d1,d0
	bclr	#0,d0
	beq.s	100$
	tst.b	ww_IsDoubleBufd(a1)		odd cycle
	beq.s	100$
	add.w	d6,a0				add cyclesize
100$	lsr.w	#1,d6
	subq.w	#1,d6				mask = (cyclesize/2) - 1
	and.w	d6,d0
	add.w	d0,a0

GotWave:
	; a0	WaveBufPtr
	; d2	size in words

	move.l	a0,sch_OutWavePtr(a2)
	move.w	d2,sch_OutWaveLen(a2)

PokePaula:
	tst.b	sch_IsStolen(a2)
	bne.s	NePokePas

	move.l	sch_PaulaPtr(a2),a1
	move.w	d2,4(a1)		set wave len
	move.l	a0,(a1)			set wave ptr

	move.w	sch_Period(a2),d0
	add.w	sch_Detune(a2),d0
	move.w	d0,6(a1)		set period

	moveq	#0,d0
	move.b	sch_Amplitude(a2),d0
	lsr.b	#2,d0
	move.b	sch_VolTable(a2,d0.W),d0
	lea	SongVolTable(PC),a0

	; --- 
	; Here comes the infamous A4000 bug.
	; The audio is poked as a byte instead of a word
	; This is fixed on 11-apr-98
	; - Paul van der Valk

; bug!	move.b	0(a0,d0.W),8(a1)		set volume

	moveq	#0,d1
	move.b	0(a0,d0.W),d1
	move.w	d1,8(a1)			set volume

	move.w	sch_DmaMask1(a2),$dff096
NePokePas:

	; That's it folks

	clr.b	sch_Trig(a2)
	rts

;----------------------
; EFFECT checking
; if sch_FxTimeBase<>0 then effectmode = TRUE
; track should be auto-activated after time sch_FxOffTime has ellapsed
;

ChkEffect:
	tst.b	sch_FxTimeBase(a2)
	beq.s	NeFxPas
	move.w	Jiffies(PC),d0
	and.w	#3,d0
	bne.s	NeFxPas
	tst.b	sch_FxOffTime(a2)
	bne.s	100$			if 0 then initialise offtime
	bsr.s	GetRndByte
	move.b	sch_FxTimeRnd(a2),d1
	subq.b	#1,d1			make mask
	and.b	d1,d0
	add.b	sch_FxTimeBase(a2),d0
	move.b	d0,sch_FxOffTime(a2)

100$	subq.b	#1,sch_FxOffTime(a2)
	bne.s	NeFxPas

	; init random track

	bsr.s	GetRndByte
	move.l	sch_InitialTrkPtr(a2),a0
	moveq	#0,d1			uword
	move.b	1(a0),d1		d1.B = numentries
	subq.b	#1,d1			make mask
	and.w	d1,d0
	asl.w	#1,d0
	move.b	3(a0,d0.W),d1		track number
	asl.w	#2,d1			still uword

	move.l	TrkTable(PC),a0
	add.w	d1,a0
	move.l	(a0),d0			RC.L
	beq.s	NeFxPas
	add.l	d0,a0
	add.w	#16,a0			skip name!
	move.l	a0,sch_TrackPtr(a2)
	move.b	#1,sch_Duration(a2)
	st.b	sch_IsActive(a2)
NeFxPas	rts

GetRndByte:
	move.w	RandSeed(PC),d0
	add.w	Jiffies(PC),d0
	move.w	d0,RandSeed
	lsr.w	#4,d0
	rts

;----------------------
; SCODE handlers
;
; are called with:
;	a0	noteptr
;	a1	jumpadr
;	d1	operand byte
;
;	a1/d0/d1 are scratch
;	a0 should be preserved!!!

scode_end:
	tst.b	PlayingJingle
	beq.s	5$
	st.b	JingDoneReq
5$	tst.b	sch_FxTimeBase(a2)
	bne.s	10$				no song-repeat if effect-mode
	tst.b	SongRepeat
	beq.s	10$
	move.l	sch_InitialTrkPtr(a2),a0	return start track
	rts
	
10$	clr.b	sch_IsActive(a2)		inactivate channel
	tst.b	sch_IsStolen(a2)
	bne.s	100$
	move.l	sch_PaulaPtr(a2),a1
	move.w	sch_DmaMask0(a2),$dff096	turn off DMA
100$	tst.l	(SP)+				exit from UpdChannel() !!
	rts

scode_dynlevel:
	move.b	d1,d0
	lsr.b	#1,d0
	move.b	d0,sch_Volume(a2)
	move.l	a0,-(SP)
	lea	sch_VolTable(a2),a0
	bsr	CalcVolTable
	move.l	(SP)+,a0
	rts

scode_instr:
	moveq	#0,d0
	move.b	d1,d0
	asl.w	#2,d0

	move.l	InsTable(PC),a1
	add.w	d0,a1
	move.l	(a1),d0			RC.L
	beq.s	10$
	add.l	d0,a1
	move.l	a1,a3
	move.l	a1,sch_Instrument(a2)
	move.b	d1,sch_InsNum(a2)
10$	rts

;-----------------------------------------------------
; note data

LogToPerTable:
	dc.w 15360,14464
	dc.w 13696,12928,12192,11520,10848,10240,9664,9120,8608,8092,7680,7232
	dc.w 6848,6464,6096,5760,5424,5120,4832,4560,4304,4064,3840,3616
	dc.w 3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1808
	dc.w 1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,0960,0904
	dc.w 0856,0808,0762,0720,0678,0640,0604,0570,0538,0508,0480,0452
	dc.w 0428,0404,0381,0360,0339,0320,0302,0285,0269,0254,0240,0226
	dc.w 0214,0202,0190,0180,0170,0160,0151,0143,0135,0127,0120,0113
	dc.w 0107,0101,0095,0090,0085,0080,0076,0072,0068,0064,0060,0057
	dc.w 0053,0050,0047,0045,0042,0040,0038,0036,0034,0032,0030,0028


;-----------------------------------------------------
; flang data

	dc.w	5		numentries FlangTable
FlangTable:
	dc.w	fl0-*
	dc.w	fl1-*
	dc.w	fl2-*
	dc.w	fl3-*
	dc.w	fl4-*
	dc.w	fl5-*

fl0	dc.b	0,0,0,0
	dc.b	$80

fl1	dc.b	1,1,0,0
	dc.b	0,0,1,1
	dc.b	$80

fl2	dc.b	0,1,2,-1
	dc.b	1,0,-1,2
	dc.b	$80

fl3	dc.b	0,1,2,-1
	dc.b	1,2,-1,0
	dc.b	2,-1,0,1
	dc.b	-1,0,1,2
	dc.b	$80

fl4	dc.b	0,0,-2,2
	dc.b	1,-1,-1,1
	dc.b	2,-2,0,0
	dc.b	1,-1,-1,1
	dc.b	$80

fl5	dc.b	-2,-1,0,1
	dc.b	-1,0,1,2
	dc.b	0,1,2,-1
	dc.b	1,2,-1,-2
	dc.b	$80

;-----------------------------------------------------
; vars


;!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

RelevantVars:
	;
	; these need to be backuped for BackupSong()
	;

MedVarStart:
	; these are in relevant area because they might be overwritten by
	; 'external' jingle

ScoTable	dc.l	0		keep
TrkTable	dc.l	0		these
InsTable	dc.l	0		in right
WavTable	dc.l	0		order!

SCH0		ds.b	sch_Sizeof
SCH1		ds.b	sch_Sizeof
SCH2		ds.b	sch_Sizeof
SCH3		ds.b	sch_Sizeof

CurSpeed	dc.w	0
FlangPtr	dc.l	0
FlangInitPtr	dc.l	0

GlobTrnsp	dc.b	0
SongRepeat	dc.b	0
FlangSpeed	dc.b	0
FlangClock	dc.b	0
UpdRate		dc.b	0
FlangAlgoNum	dc.b	0
SongVolTable	ds.b	64
		even

RelevantVarsEnd:

;!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	;
	; space below is for BackupSong()
	;

RelSpaceSize	= RelevantVarsEnd-RelevantVars

BackupSpace	ds.b	RelSpaceSize
		even

;!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	;
	; vars not related to BackupSong()
	;

GpStore		dc.l	0
CiaBaseAdr	dc.l	0
CiaResPtr	dc.l	0

ChannelTable	dc.l	SCH0,SCH1,SCH2,SCH3
Jiffies		dc.w	0
RandSeed	dc.w	0

IrqStatus	dc.b	0			< $80 = inactive
IrqInstalled	dc.b	0
PlayingJingle	dc.b	0
JingDoneReq	dc.b	0
InstallScoOk	dc.b	0
		even

;!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
; CHIP section

	SECTION	CHIP,CODE

ChipSpace:
	ds.b	4*32

; that's it folks
;-----------------------------------------------------

