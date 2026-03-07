**1.16***********************************************************************
*									    *
*			       Musicline Editor				    *
*			     ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯			    *
*	Programming by:		Conny Cyréus				    *
*				Christian Cyréus			    *
*									    *
*	Ideas and Design by:	Christian Cyréus			    *
*				Conny Cyréus				    *
*				John Carehag				    *
*				Jimmy Fredriksson			    *
*									    *
*						    a Musicline Production  *
*									    *
*****************************************************************************
* ID_Name of User and MISC                   * Christian Cyréus - Musicline *
*****************************************************************************

CON_DemoVersion		=	0	0 = Registered Version, 1 = DemoVersion
CON_RelocateCode	=	0	0 = No Relocation, 1 = Relocation
CON_IDOffsets		=	0	0 = IDCheck Off, 1 = IDCheck On
	     IFEQ CON_RelocateCode
ID_Shareware
	     ELSE
		include	Ram:MlineWork/ID_Name.s
	     ENDC
*****************************************************************************
* Includes for ID handling                   * Christian Cyréus - Musicline *
*****************************************************************************

		;;include		Mline:Register/mlreg.Register
		include		    Include/ProTrackerMod.i

        include         devices/audio.i
        include         devices/conunit.i
        include         devices/input.i
        include         dos/dos.i
        include         dos/dosextens.i
        include         exec/io.i
        include         exec/lists.i
        include         exec/memory.i
        include         graphics/text.i
        include         hardware/cia.i
        include         intuition/intuition.i
        include         intuition/sghooks.i
        include         libraries/asl.i
        include         libraries/gadtools.i
        include         misc/DevpacMacros.i
        include         workbench/startup.i

Version		macro

		dc.b	"1.16"
		endm
VerNum		macro
		dc.w	$0116
		endm


NAME        macro
            dc.b    "name"
            endm
        
ID          macro
            dc.b    "id"
            endm


* Enable debug messages into serial console
DEBUG=0

* Output a debug message
DPRINT macro
	ifne DEBUG
	jsr 	desmsgDebugAndPrint
    dc.b 	\1,10,0
    even
	endc
	endm



*****************************************************************************
* Musicline Editor Structures                    * Conny Cyréus - Musicline *
*****************************************************************************

***** ChannelData *****
			RSRESET
ch_CustomAddress	rs.l	1
ch_DmaChannel		rs.w	1
ch_VoiceOff		rs.b	1
ch_ChannelOff		rs.b	1
ch_Spd			rs.b	1
ch_Grv			rs.b	1
ch_SpdPart		rs.b	1
ch_GrvPart		rs.b	1
ch_TuneSpd		rs.b	1
ch_TuneGrv		rs.b	1
ch_SpdCnt		rs.b	1
ch_ArpSpdCnt		rs.b	1
ch_PartGrv		rs.b	1
ch_ArpgGrv		rs.b	1
ch_WsNumber		rs.b	1
ch_WsNumberOld		rs.b	1
ch_InstPtr		rs.l	1
ch_WsPtr		rs.l	1
ch_PartNote		rs.b	1
ch_PartInst		rs.b	1
ch_PartEffectNum	rs.b	1
ch_PartEffectPar	rs.b	1
ch_PartEffects		rs.w	4
ch_Arp			rs.b	1
ch_ArpPos		rs.b	1
ch_ArpTab		rs.b	1
ch_ArpWait		rs.b	1
ch_ArpgNote		rs.b	1
ch_ArpVolSld		rs.b	1
ch_ArpPchSld		rs.b	1
ch_ArpPchSldType	rs.b	1
ch_ArpNote		rs.w	1

ch_TunePos		rs.b	1
ch_PartPos		rs.b	1
ch_PartPosWork		rs.b	1
			rs.b	1
ch_TuneJumpCount	rs.b	1
ch_PartJmpCnt		rs.b	1

ch_WsRepPtrOrg		rs.l	1
ch_WsPointer		rs.l	1
ch_WsLength		rs.w	1
ch_WsRepPointer		rs.l	1
ch_WsRepLength		rs.w	1

ch_Volume1		rs.w	1
ch_Volume2		rs.w	1
ch_Volume3		rs.w	1

ch_Note			rs.w	1
ch_Period1		rs.w	1
ch_Period2		rs.w	1

ch_VUAmp		rs.w	1
ch_VUOldAmp		rs.w	1
ch_VUPeriod		rs.w	1
ch_VUVolume		rs.w	1
ch_VUWsPointer		rs.l	1
ch_VUWsLength		rs.l	1
ch_VUWsRepPointer	rs.l	1
ch_VUWsRepLength	rs.l	1

ch_Transpose		rs.w	1
ch_SemiTone		rs.w	1
ch_FineTune		rs.w	1

ch_SmpOfs		rs.b	1
ch_SmplOfs		rs.b	1
ch_OldInst		rs.b	1
ch_Restart		rs.b	1

ch_VolAdd		rs.b	1
ch_VolSld		rs.b	1
ch_CVolSld		rs.b	1
ch_MVolSld		rs.b	1
ch_VolSet		rs.w	1
ch_CVolume		rs.w	1
ch_VolAddNum		rs.w	1
ch_CVolAddNum		rs.w	1
ch_MVolAddNum		rs.w	1
ch_VolSldSpd		rs.w	1
ch_CVolSldSpd		rs.w	1
ch_MVolSldSpd		rs.w	1

ch_VolSldVol		rs.w	1
ch_CVolSldVol		rs.w	1
ch_MVolSldVol		rs.w	1
ch_VolSldToVol		rs.w	1
ch_CVolSldToVol		rs.w	1
ch_MVolSldToVol		rs.w	1
ch_VolSldType		rs.b	1
ch_CVolSldType		rs.b	1
ch_MVolSldType		rs.b	1
ch_VolSldToVolOff	rs.b	1
ch_CVolSldToVolOff	rs.b	1
ch_MVolSldToVolOff	rs.b	1

ch_Vol			rs.b	1

ch_InstPchSld		rs.b	1
ch_MixResFilBoost	rs.b	1

ch_TransposeNum		rs.b	1
ch_PartNum		rs.w	1
ch_PchSld		rs.b	1
ch_PchSldType		rs.b	1
ch_PchSldSpd		rs.w	1
ch_PchSldNote		rs.w	1
ch_PchSldToNote		rs.w	1
ch_PchAdd		rs.w	1
ch_ArpVolSldSpd		rs.w	1
ch_ArpPchSldSpd		rs.w	1
ch_ArpPchSldToNote	rs.w	1
ch_ArpPchSldNote	rs.w	1

ch_PTPchSld		rs.b	1
ch_PTPchSldType		rs.b	1
ch_PTPchSldSpd		rs.w	1
ch_PTPchSldSpd2		rs.w	1
ch_PTPchSldNote		rs.w	1
ch_PTPchSldToNote	rs.w	1
ch_PTPchAdd		rs.w	1

ch_Effects1		rs.b	1
ch_Effects2		rs.b	1
ch_EffectsPar1		rs.b	1
ch_EffectsPar2		rs.b	1
ch_ADSRVolume		rs.w	1
ch_ADSRData		rs.w	12
ch_Play			rs.b	1
ch_WaveOrSample		rs.b	1
ch_PhaInit		rs.b	1
ch_FilInit		rs.b	1
ch_TraInit		rs.b	1
ch_TuneWait		rs.b	1

ch_Vib			rs.b	1
ch_VibDir		rs.b	1
ch_VibWaveNum		rs.b	1
ch_PartVibWaveNum	rs.b	1
ch_VibCount		rs.w	1
ch_VibCmdSpeed		rs.w	1
ch_VibCmdDepth		rs.w	1
ch_VibCmdDelay		rs.w	1
ch_VibAtkSpeed		rs.w	1
ch_VibAtkLength		rs.w	1
ch_VibDepth		rs.w	1
ch_VibNote		rs.w	1

ch_PTTrePos		rs.b	1
ch_PTTreCmd		rs.b	1
ch_PTTreWave		rs.b	1
ch_PTVibPos		rs.b	1
ch_PTVibCmd		rs.b	1
ch_PTVibWave		rs.b	1
ch_PTVibNote		rs.w	1

ch_Tre			rs.b	1
ch_TreDir		rs.b	1
ch_TreWaveNum		rs.b	1
ch_PartTreWaveNum	rs.b	1
ch_TreCount		rs.w	1
ch_TreCmdSpeed		rs.w	1
ch_TreCmdDepth		rs.w	1
ch_TreCmdDelay		rs.w	1
ch_TreAtkSpeed		rs.w	1
ch_TreAtkLength		rs.w	1
ch_TreDepth		rs.w	1

ch_FilLastSample	rs.b	1
ch_ResLastSample	rs.b	1
ch_FilLastInit		rs.b	1
ch_ResLastInit		rs.b	1
ch_ResAmp		rs.b	1
ch_ResInit		rs.b	1
ch_PhaType		rs.b	1
ch_FilType		rs.b	1
ch_TraData		rs.w	8
ch_TraSpd		rs.w	1
ch_PhaData		rs.w	8
ch_PhaSpd		rs.w	1
ch_MixData		rs.w	8
ch_MixSpd		rs.w	1
ch_ResData		rs.w	8
ch_ResSpd		rs.w	1
ch_FilData		rs.w	8
ch_FilSpd		rs.w	1
ch_MixWaveNum		rs.b	1
ch_MixInit		rs.b	1
ch_TraWsPtrs		rs.b	6
ch_PlayError		rs.b	1
ch_LooInit		rs.b	1
ch_LooRepeat		rs.w	1
ch_LooRepEnd		rs.w	1
ch_LooLength		rs.w	1
ch_LooStep		rs.l	1
ch_LooWait		rs.w	1
ch_LooWaitCounter	rs.w	1
ch_LooDelay		rs.w	1
ch_LooTurns		rs.w	1
ch_LooCounter		rs.w	1
ch_LooCounterSave	rs.w	1
ch_LooWsCounterMax	rs.w	1
ch_LooSpd		rs.w	1
ch_LooWsPointer		rs.l	1
ch_TraWaveBuffer	rs.b	256
ch_PhaWaveBuffer	rs.b	256
ch_MixWaveBuffer	rs.b	256
ch_ResWaveBuffer	rs.b	256
ch_FilWaveBuffer	rs.b	256
ch_WaveBuffer		rs.l	1
ch_MixVolTable		rs.l	1
ch_MixWsPointer		rs.l	1
ch_MixWsCounter		rs.l	1
ch_MixWsLength		rs.l	1
ch_MixSaveDec1		rs.l	1
ch_MixSaveDec2		rs.w	1
ch_MixSmplEnd		rs.b	1
ch_MixLoop		rs.b	1
ch_MixWsLen		rs.w	1
ch_MixAdd2		rs.w	1
ch_MixAdd1		rs.w	1
ch_SIZEOF		rs.b	0

***** TUNE *****
			RSRESET
tune_Succ		rs.l	1
tune_Pred		rs.l	1
tune_Priv		rs.w	1
tune_Name		rs.l	1
tune_PADBYTE		rs.b	1	<----- PAD BYTE
tune_NameStr		rs.b	3
tune_Title		rs.b	32
tune_Tempo		rs.w	1
tune_Speed		rs.b	1
tune_Groove		rs.b	1
tune_Volume		rs.w	1
tune_PlayMode		rs.b	1
tune_Channels		rs.b	1
tune_Ch1Ptr		rs.l	1
tune_Ch2Ptr		rs.l	1
tune_Ch3Ptr		rs.l	1
tune_Ch4Ptr		rs.l	1
tune_Ch5Ptr		rs.l	1
tune_Ch6Ptr		rs.l	1
tune_Ch7Ptr		rs.l	1
tune_Ch8Ptr		rs.l	1
tune_SIZEOF		rs.b	0

tune_START		=	tune_Title
tune_SIZE		=	tune_SIZEOF-tune_Title
tune_LOADSIZE		=	tune_Ch1Ptr-tune_Title
tune_ChPtrs		=	tune_Ch1Ptr-tune_Title

***** VOICE *****
			RSRESET
chnl_Data		rs.b	2*256
chnl_SIZE		rs.b	0

***** PART *****
			RSRESET
part_Data		rs.b	12*128
part_SIZEOF		rs.b	0

part_START		=	part_Data
part_SIZE		=	part_SIZEOF

***** ARPEGGIO *****
			RSRESET
arpg_Data		rs.b	6*128
arpg_SIZEOF		rs.b	0

arpg_START		=	arpg_Data
arpg_SIZE		=	arpg_SIZEOF

***** INSTRUMENT *****
			RSRESET
inst_Succ		rs.l	1
inst_Pred		rs.l	1
inst_Priv		rs.w	1
inst_Name		rs.l	1
inst_Padbyte		rs.b	1
inst_NameStr		rs.b	3
inst_Title		rs.b	32
inst_SmplNumber		rs.b	1
inst_SmplType		rs.b	1
inst_SmplPointer	rs.l	1
inst_SmplLength		rs.w	1
inst_SmplRepPointer	rs.l	1
inst_SmplRepLength	rs.w	1
inst_FineTune		rs.w	1
inst_SemiTone		rs.w	1
inst_SmplStart		rs.w	1
inst_SmplEnd		rs.w	1
inst_SmplRepStart	rs.w	1
inst_SmplRepLen		rs.w	1
inst_Volume		rs.w	1
inst_Transpose		rs.b	1
inst_SlideSpeed		rs.b	1
inst_Effects1		rs.b	1
inst_Effects2		rs.b	1

WSLOOP			=	7	;Effects1

** EnvelopeGenerator **
ADSR			=	0	;Effects1
ADSRHOLDSUSTAIN		=	0	;inst_EnvTraPhaFilBits

inst_EnvAttLen		rs.w	1
inst_EnvDecLen		rs.w	1
inst_EnvSusLen		rs.w	1
inst_EnvRelLen		rs.w	1
inst_EnvAttSpd		rs.w	1
inst_EnvDecSpd		rs.w	1
inst_EnvSusSpd		rs.w	1
inst_EnvRelSpd		rs.w	1
inst_EnvAttVol		rs.w	1
inst_EnvDecVol		rs.w	1
inst_EnvSusVol		rs.w	1
inst_EnvRelVol		rs.w	1

** Vibrato **
VIBRATO			=	1	;Effects1

inst_VibDir		rs.b	1
inst_VibWaveNum		rs.b	1
inst_VibSpeed		rs.w	1
inst_VibDelay		rs.w	1
inst_VibAtkSpd		rs.w	1
inst_VibAttack		rs.w	1
inst_VibDepth		rs.w	1

** Tremolo **
TREMOLO			=	2	;Effects1

inst_TreDir		rs.b	1
inst_TreWaveNum		rs.b	1
inst_TreSpeed		rs.w	1
inst_TreDelay		rs.w	1
inst_TreAtkSpd		rs.w	1
inst_TreAttack		rs.w	1
inst_TreDepth		rs.w	1

** Arpeggio **
ARPEGGIO		=	3	;Effects1

inst_ArpTable		rs.w	1
inst_ArpSpeed		rs.b	1
inst_ArpGroove		rs.b	1

** Transform **
TRANSFORM		=	0	;Effects2
TRANSFORMINIT		=	1	;inst_EnvTraPhaFilBits
TRANSFORMSTEP		=	2	;inst_EnvTraPhaFilBits

inst_EnvTraPhaFilBits	rs.b	1
inst_TraWaveNums	rs.b	5
inst_TraStart		rs.w	1
inst_TraRepeat		rs.w	1
inst_TraRepEnd		rs.w	1
inst_TraSpeed		rs.w	1
inst_TraTurns		rs.w	1
inst_TraDelay		rs.w	1

** Phase **
PHASE			=	1	;Effects2
PHASEINIT		=	3	;inst_EnvTraPhaFilBits
PHASESTEP		=	4	;inst_EnvTraPhaFilBits
PHASEFILL		=	5	;inst_EnvTraPhaFilBits

inst_PhaStart		rs.w	1
inst_PhaRepeat		rs.w	1
inst_PhaRepEnd		rs.w	1
inst_PhaSpeed		rs.w	1
inst_PhaTurns		rs.w	1
inst_PhaDelay		rs.w	1
inst_PhaType		rs.w	1

** Mix **
MIX			=	2	;Effects2
MIXINIT			=	0	;inst_MixResLooBits
MIXSTEP			=	1       ;inst_MixResLooBits
MIXBUFF			=	2       ;inst_MixResLooBits
MIXCOUNTER		=	3       ;inst_MixResLooBits

inst_MixResLooBits	rs.b	1
inst_MixWaveNum		rs.b	1
inst_MixStart		rs.w	1
inst_MixRepeat		rs.w	1
inst_MixRepEnd		rs.w	1
inst_MixSpeed		rs.w	1
inst_MixTurns		rs.w	1
inst_MixDelay		rs.w	1

** Resonance **
RESONANCE		=	3	;Effects2
RESONANCEINIT		=	4       ;inst_MixResLooBits
RESONANCESTEP		=	5       ;inst_MixResLooBits

inst_ResStart		rs.w	1
inst_ResRepeat		rs.w	1
inst_ResRepEnd		rs.w	1
inst_ResSpeed		rs.w	1
inst_ResTurns		rs.w	1
inst_ResDelay		rs.w	1
inst_MixResFilBoost	rs.b	1
inst_ResAmp		rs.b	1

** Filter **
FILTER			=	4	;Effects2
FILTERINIT		=	6       ;inst_EnvTraPhaFilBits
FILTERSTEP		=	7       ;inst_EnvTraPhaFilBits

inst_FilStart		rs.w	1
inst_FilRepeat		rs.w	1
inst_FilRepEnd		rs.w	1
inst_FilSpeed		rs.w	1
inst_FilTurns		rs.w	1
inst_FilDelay		rs.w	1
inst_FilPadByte		rs.b	1
inst_FilType		rs.b	1

** Loop **
LOOP			=	4	;Effects1
LOOPSTOP		=	5	;Effects1
LOOPINIT		=	6       ;inst_MixResLooBits
LOOPSTEP		=	7       ;inst_MixResLooBits

inst_LooStart		rs.w	1
inst_LooRepeat		rs.w	1
inst_LooRepEnd		rs.w	1
inst_LooLength		rs.w	1
inst_LooLpStep		rs.w	1
inst_LooWait		rs.w	1
inst_LooDelay		rs.w	1
inst_LooTurns		rs.w	1

inst_SIZEOF		rs.b	0

inst_START		=	inst_Title
inst_SIZE		=	inst_SIZEOF-inst_Title

***** SAMPLE *****
			RSRESET
smpl_Succ		rs.l	1
smpl_Pred		rs.l	1
smpl_Priv		rs.w	1
smpl_Name		rs.l	1
smpl_Padbyte		rs.b	1
smpl_NameStr		rs.b	3
smpl_Title		rs.b	32
smpl_PadByte2		rs.b	1
smpl_Type		rs.b	1
smpl_Pointer		rs.l	1
smpl_Length		rs.w	1
smpl_RepPointer		rs.l	1
smpl_RepLength		rs.w	1
smpl_FineTune		rs.w	1
smpl_SemiTone		rs.w	1
smpl_SampleData		rs.b	0

smpl_START		=	smpl_Title
smpl_SIZE		=	smpl_SampleData-smpl_Title

temp_Num		=	smpl_Padbyte
temp_SIZE		=	temp_Num+2

Voice	=	1
Part	=	2
Arpg	=	3
Inst	=	4

*****************************************************************************
* Macros                                     * Christian Cyréus - Musicline *
*****************************************************************************

SSP		MACRO
		movem.l	\1,-(sp)
		ENDM

LSP		MACRO
		movem.l	(sp)+,\1
		ENDM

SPbsr		MACRO
		movem.l	\2,-(sp)
		bsr	\1
		movem.l	(sp)+,\2
		ENDM

SPjsr		MACRO
		movem.l	\2,-(sp)
		jsr	\1
		movem.l	(sp)+,\2
		ENDM

*****************************************************************************
* Macros for library calls                       * Conny Cyréus - Musicline *
*****************************************************************************

		RSRESET

CallAsl		macro
		move.l	_AslBase(a5),a6
		jsr	_LVO\1(a6)
		endm
_AslBase	rs.l	1

CallDiskfont	macro
		move.l	_DiskfontBase(a5),a6
		jsr	_LVO\1(a6)
		endm
_DiskfontBase	rs.l	1

CallDOS		macro
		move.l	_DOSBase(a5),a6
		jsr	_LVO\1(a6)
		endm
_DOSBase	rs.l	1

CallGadTools	macro
		move.l	_GadToolsBase(a5),a6
		jsr	_LVO\1(a6)
		endm
_GadToolsBase	rs.l	1

CallGfx		macro
		move.l	_GfxBase(a5),a6
		jsr	_LVO\1(a6)
		endm
_GfxBase	rs.l	1

CallIntuition	macro
		move.l	_IntuitionBase(a5),a6
		jsr	_LVO\1(a6)
		endm
_IntuitionBase	rs.l	1

CallSys		macro
		move.l	_SysBase(a5),a6
		jsr	_LVO\1(a6)
		endm
_SysBase	rs.l	1

CallLib		macro
		jsr	_LVO\1(a6)
		endm
_InitialSP	rs.l	1

CallDos		macro
		move.l	DosBase(pc),a6
		jsr	_LVO\1(a6)
		endm

*****************************************************************************
* Musicline Editor Startup code                  * Conny Cyréus - Musicline *
*****************************************************************************

_TaskName	rs.b	18

		;;Section	MLStartup,Code

Startup		
        DPRINT  "Start"
 
        lea	Bss,a5
		move.l	4.w,_SysBase(a5)
		suba.l	a1,a1
		CallSys FindTask
		move.l	d0,a4
		tst.l	pr_CLI(a4)
		bne.b	FromCLI

FromWorkbench	lea	pr_MsgPort(a4),a0
		CallSys WaitPort
		lea	pr_MsgPort(a4),a0
		CallLib GetMsg
		move.l  d0,WBenchMsg

FromCLI		moveq	#0,d0
		lea	DosName,a1
 		CallSys OpenLibrary
		move.l	d0,DosBase
		beq	StartupExit

FindMline	lea	TaskName,a1
		CallSys FindTask
		tst.l	d0
		beq	RelocateCode

		tst.l	pr_CLI(a4)
		bne.b	CLIError
		move.l	#AppWindow,d1
		move.l	#MODE_OLDFILE,d2
		CallDos Open
		move.l	d0,WBOutPut
		move.l	d0,StdOut
		beq	CloseDosLib
		bra.b	WBError

CLIError	CallDos Output
		move.l	d0,StdOut
		beq	CloseDosLib
WBError		move.l	StdOut,d1
		move.l	#ErrorMsg,d2
		move.l	#ErrorLng,d3
		CallDos Write
		tst.l	pr_CLI(a4)
	     IFNE CON_RelocateCode
		bne	CloseDosLib
	     ELSE
		bne.b	CloseDosLib
	     ENDC
		move.l	StdOut,d1
		move.l	#ReturnMsg,d2
		move.l	#ReturnLng,d3
		CallLib Write
		move.l	StdOut,d1
		move.l	#$500000,d2
		CallLib	WaitForChar
	     IFNE CON_RelocateCode
		bra	CloseWbOut
	     ELSE
		bra.b	CloseWbOut
	     ENDC
RelocateCode
	     IFNE	CON_RelocateCode
        error   "Decrypting"
.decrypt	lea	Startup-4(pc),a0
		move.l	(a0),d0
		lsl.l	#2,d0
		move.l	d0,a0
		addq	#4,a0
		move.l	-8(a0),d0
		subq.l	#8,d0
		move.b	#$79,d2
		lea	Password,a2
		tst.b	(a2)
		beq.b	.check
.changeloop	tst.b	(a2)
		beq.b	.passwordloop
		add.b	(a2)+,d2
		ror.b	#1,d2
		bra.b	.changeloop
.passwordloop	lea	Password,a2
		tst.b	(a2)
		beq.b	.check
.decryptloop	tst.b	(a2)
		beq.b	.passwordloop
		move.b	(a0),d4
		add.b	(a2)+,d2
		ror.b	#1,d2
		move.b	d2,d5
		move.b	d2,d3
		and.b	#$7,d3
		eor.b	d2,d4
		rol.b	d3,d4
		sub.b	d5,d4
		move.b	d4,(a0)+
		subq.l	#1,d0
		bne.b	.decryptloop

.check		lea	Startup-4(pc),a0
		move.l	(a0),d0
		lsl.l	#2,d0
		move.l	d0,a1
		addq	#4,a1
		moveq	#0,d0
		move.l	-8(a1),d1
		subq.l	#8,d1
		lsr.l	#2,d1
		move.l	a1,a3
.checksum	add.l	(a3)+,d0
		subq.l	#1,d1
		bne.b	.checksum
		cmp.l	CodeChecksum(pc),d0
		bne.b	CloseWbOut
		lea	HunkReloc32+4,a2
.checkreloc	move.l	(a2)+,d7
		beq.b	CreateProcess
		move.l	(a2)+,d0
		lea	Startup-4(pc),a0
		move.l	a0,d1
		addq	#4,d1
		bra.b	.checkhunk
.nexthunk	move.l	(a0),d1
		lsl.l	#2,d1
		move.l	d1,a0
		addq.l	#4,d1
.checkhunk	dbf	d0,.nexthunk
.relocate	move.l	(a2)+,d0
		lea	(a1,d0.l),a3
		add.l	d1,(a3)
		subq.l	#1,d7
		bhi.b	.relocate
		bra.b	.checkreloc
	      ENDC

CreateProcess	

        move.l	#UnLoadSegment,_UnLoadSegment(a5)
		lea	TaskName(pc),a0
		lea	_TaskName(a5),a1
		move.l	a1,d1
		moveq	#16-1,d0
.loop		move.b	(a0)+,(a1)+
		dbf	d0,.loop
; Shell detaching disabled for crashing on exit
;		moveq	#0,d2
;		move.b	LN_PRI(a4),d2
;		lea	Startup-4(pc),a3
;		move.l	(a3),d3
;		clr.l	(a3)
;		move.l	#4096,d4
;       CallDos CreateProc     
        jsr     Main

CloseWbOut	move.l	WBOutPut(pc),d1
		beq.b	CloseDosLib
		CallDos Close

CloseDosLib	move.l	DosBase(pc),d0
		beq.b	StartupExit
		move.l	d0,a1
		CallSys CloseLibrary

StartupExit	move.l	WBenchMsg(pc),d1
		beq.b	.exit
		CallSys Forbid
		move.l	d1,a1
		CallLib ReplyMsg
.exit		moveq	#0,d0
		rts

		dc.b	"$VER: Musicline Editor "
		Version
		dc.b	" ()"
		even
StdOut		dc.l	0
WBOutPut	dc.l	0
WBenchMsg	dc.l	0
DosBase		dc.l	0
IntBase		dc.l	0
ConDevice	dc.l	0
ConIOStdReq	dcb.b	IOSTD_SIZE,0

;;Decrypt_ID1_EQU	equ	(ID1_hex>>(6*4)&$f)!(ID1_hex>>(1*4)&$f0)!(ID1_hex<<(2*4)&$f00)!(ID1_hex>>(1*4)&$f000)!(ID1_hex>>(3*4)&$f0000)!(ID1_hex<<(2*4)&$f00000)!(ID1_hex<<(1*4)&$f000000)!(ID1_hex<<(6*4)&$f0000000)
;;Decrypt_ID2_EQU	equ	(ID2_hex>>(7*4)&$f)!(ID2_hex<<(1*4)&$f0)!(ID2_hex>>(3*4)&$f00)!(ID2_hex>>(1*4)&$f000)!(ID2_hex<<(2*4)&$f0000)!(ID2_hex<<(4*4)&$f00000)!(ID2_hex<<(3*4)&$f000000)!(ID2_hex<<(1*4)&$f0000000)
;;Decrypt_ID3_EQU	equ	(ID3_hex>>(4*4)&$f)!(ID3_hex>>(6*4)&$f0)!(ID3_hex>>(4*4)&$f00)!(ID3_hex<<(2*4)&$f000)!(ID3_hex<<(4*4)&$f0000)!(ID3_hex<<(2*4)&$f00000)!(ID3_hex<<(1*4)&$f000000)!(ID3_hex<<(5*4)&$f0000000)
;;
;;Decrypt_ID3	dc.l	(Decrypt_ID3_EQU&$00000007)<<(7*4+1)!(Decrypt_ID3_EQU&$fffffff8)>>3
;;ID3_Offset	equ	Decrypt_ID3-Startup

Password	dc.b	"line",0
DosName		dc.b	"dos.library",0
IntName		dc.b	"intuition.library",0
ConsoleName	dc.b	"console.device",0
AppWindow	dc.b	"Con:0/11/305/64/Musicline Editor Window",0
ErrorMsg	dc.b	10,"Musicline Editor is already running",10,10,13
ErrorLng	=	*-ErrorMsg
ReturnMsg	dc.b	"Press Return "
ReturnLng	=	*-ReturnMsg
TaskName	dc.b	"Musicline Editor",0
		cnop	0,4
CodeChecksum	dc.l	0

*****************************************************************************
* Musicline Editor Main startup code             * Conny Cyréus - Musicline *
*****************************************************************************

		Section	MLCode,Code

Main		lea	Bss,a5			; a5 = memorybuffer (always)
		move.l	sp,_InitialSP(a5)	; save stackpointer
		bset	#1,$bfe001		; turn off filter
		bsr	FindTask
		bsr	AllocSignal
		bsr	OpenDOSLibrary
		bsr	OpenAslLibrary
		bsr	OpenDiskfontLibrary
		bsr	OpenGadToolsLibrary
		bsr	OpenGfxLibrary
		bsr	OpenIntuitionLibrary
		bsr	OpenConsoleDevice
		jsr	MakeAscIITab
		jsr	SetDefaultData
		bsr	LoadConfig
		bsr	OpenFonts
		bsr	OpenScreen
		bsr	GetVisualInfo
		bsr	CreateMenus
		jsr	CreateGadgets
		bsr	AllocAslFileReq
		bsr	AllocAslSMReq
		jsr	InitPartPtrs
		jsr	InitArpgPtrs
		bsr	OpenWindow2
		bsr	OpenWindow1
		bsr	SetMenuStrip
		jsr	DrawBoxes
		jsr	DrawLines
		jsr	DrawImages
		jsr	AddGadgetLists
		jsr	SetPens
		jsr	InitSomeData
		jsr	InitTuneData
		jsr	InitInstData
		lea	TuneEditorDefs,a4
		jsr	PrintTune
		jsr	GetArpgPtr
		jsr	GetPartPtr
		jsr	SetChannel
		lea	PartEditorDefs,a4
		jsr	PrintPart
		jsr	PrintPartNum
		jsr	PrintTempoNum
		jsr	PrintSpdNum
		jsr	PrintGrvNum
		jsr	PrintIText1
		jsr	ClearArrowTunePos
		move.b	#1,_PlayMode(a5)		8 channels
		jsr	StepShow
		clr.b	_PlayMode(a5)			4 channels
		jsr	StepArrow
		jsr	PartArrow
		clr.b	_PlayMode(a5)
		jsr	PrintIText2
		jsr	PrintADSRNum
		jsr	PrintIText6
		jsr	SetWsParameters
		jsr	OpenAudioDevice
		jsr	OpenInputDevice
		jsr	OpenCIAResource
		jsr	AddVbInt
		bsr	AllocDosObject
		bsr	CreateGad6
		bsr	AllocAslReg
		bsr	CreateGad8
		tst.b	_OpenWin7(a5)
		beq.b	.win6
		jsr	OpenWindow7
.win6		tst.b	_OpenWin6(a5)
		beq.b	.win5
		bsr	OpenWindow6
.win5		tst.b	_OpenWin5(a5)
		beq.b	.active
		jsr	OpenWindow5
.active		move.l	_Window1(a5),a0
		CallIntuition ActivateWindow
		jsr	Stoppa
		jmp	Wait

* Includes for Part Effects                  * Christian Cyréus - Musicline *

		include	    Include/EffectsMac.i

*****************************************************************************
* Musicline Editor Exit code                     * Conny Cyréus - Musicline *
*****************************************************************************

_ExitList		rs.l	1
_UnLoadSegment		rs.l	1
_FreeSignal		rs.l	1
_CloseDOSLibrary	rs.l	1
_CloseAslLibrary	rs.l	1
_CloseDiskfontLibrary	rs.l	1
_CloseGadToolsLibrary	rs.l	1
_CloseGfxLibrary	rs.l	1
_CloseIntuitionLibrary	rs.l	1
_CloseFont7		rs.l	1
_CloseFont8		rs.l	1
_FreeMenus1		rs.l	1
_FreeMenus2		rs.l	1
_FreeGadgets		rs.l	1
_FreeVisualInfo		rs.l	1
_CloseScreen		rs.l	1
_CloseWindow1		rs.l	1
_CloseWindow2		rs.l	1
_CloseWindow5		rs.l	1
_CloseWindow6		rs.l	1
_CloseWindow7		rs.l	1
_FreeFxHelp2Req		rs.l	1
_ClearMenuStrip1	rs.l	1
_ClearMenuStrip2	rs.l	1
_CloseConsoleDevice	rs.l	1
_FreeAslSMReq		rs.l	1
_FreeAslFileReqLP	rs.l	1
_FreeAslFileReqLI	rs.l	1
_FreeAslFileReqLS	rs.l	1
_FreeAslFileReqLW	rs.l	1
_FreeAslFileReqSP	rs.l	1
_FreeAslFileReqSI	rs.l	1
_FreeAslFileReqSS	rs.l	1
_FreeAslFileReqSW	rs.l	1
_CloseWindow8		rs.l	1
_FreeAslReg		rs.l	1
_FreeVisualRast		rs.l	1
_DelInpIORequest	rs.l	1
_DelInpMsgPort		rs.l	1
_CloseInputDevice	rs.l	1
_RemInputHandler	rs.l	1
_DelAudIORequest	rs.l	1
_DelAudMsgPort		rs.l	1
_FreeSndFBuf		rs.l	1
_FreeSndCBuf		rs.l	1
_FreeChannels		rs.l	1
_RemTimers		rs.l	1
_RemVbInt		rs.l	1
_ClrAudInt		rs.l	1
_FreeDosObject		rs.l	1
_ExitListEnd		rs.b	0

Exit		move.l	_InitialSP(a5),sp
Exit2		tst.l	_Message(a5)
		beq.b	.quiet
		move.l	_Message(a5),a1
		tst.l	_GadToolsBase(a5)
		beq.b	.sysreplymsg
		CallGadTools GT_ReplyIMsg
		bra.b	.quiet
.sysreplymsg	CallSys ReplyMsg
.quiet		move	#$f,$dff096		; turn off audio dma

FreePartMem	move.l	_SysBase(a5),a6
		moveq	#0,d6
		move	#1024-1,d7
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a3
.loop		move.l	(a4)+,a1
		cmp.l	d6,a1
		beq.b	.zero
		cmp.l	a3,a1
		beq.b	.zero
		move.l	#part_SIZEOF,d0
		CallLib FreeMem
.zero		dbf	d7,.loop

FreeArpgMem	move	#256-1,d7
		lea	_ArpgPtrs(a5),a4
		lea	_ZeroBuffer(a5),a3
.loop		move.l	(a4)+,a1
		cmp.l	d6,a1
		beq.b	.zero
		cmp.l	a3,a1
		beq.b	.zero
		move.l	#arpg_SIZEOF,d0
		CallLib FreeMem
.zero		dbf	d7,.loop

		jsr	FreeTuneMem

FreeInstMem	lea	_InstListView(a5),a4
		move.l	(a4),a4
		bra.b	.test
.loop		move.l	a4,a1
		move.l	(a4),a4
		move.l	#inst_SIZEOF,d0
		CallLib FreeMem
.test		tst.l	(a4)
		bne.b	.loop

FreeWsMem	lea	_SmplListView(a5),a4
		move.l	(a4),a4
		bra.b	.test
.loop		move.l	a4,a1
		move.l	(a4),a4
		moveq	#0,d0
		move	smpl_Length(a1),d0
		cmp.l	#128,d0
		bne.b	.ok
		add	#120,d0
.ok		add.l	d0,d0
		add.l	#smpl_SampleData,d0
		CallLib FreeMem
.test		tst.l	(a4)
		bne.b	.loop

ExitRoutine	move.l	#-1,_ExitList(a5)
		lea	_ExitListEnd(a5),a4
.loop		move.l	-(a4),d0
		beq	.loop
		bmi.b	.exit
		move.l	d0,a6
		jsr	(a6)
		bra	.loop
.exit		moveq	#0,d0
		rts

*****************************************************************************
* Findtask                                       * Conny Cyréus - Musicline *
*****************************************************************************

_Process	rs.l	1

FindTask	sub.l	a1,a1
		CallSys FindTask
		move.l	d0,_Process(a5)
		beq	Exit
		rts

*****************************************************************************
* Alloc/Free Signal                              * Conny Cyréus - Musicline *
*****************************************************************************

_Signal		rs.l	1
_SigMsg		rs.l	1

AllocSignal	moveq	#-1,d0
		CallSys AllocSignal
		move.l	d0,_Signal(a5)
		beq	Exit
		move.l	#FreeSignal,_FreeSignal(a5)
		rts

FreeSignal	move.l	_Signal(a5),d0
		CallSys FreeSignal
		rts

*****************************************************************************
* Unloadsegment                                  * Conny Cyréus - Musicline *
*****************************************************************************

UnLoadSegment	
        ; Shell detaching disabled for crashing on exit
        rts

        lea	Main-4(pc),a0
		move.l	a0,d1
		lsr.l	#2,d1
		move.l	_DOSBase(a5),a6
		jmp	_LVOUnLoadSeg(a6)

*****************************************************************************
* Alloc/Free dosobject                           * Conny Cyréus - Musicline *
*****************************************************************************

AllocDosObject	move.l	#DOS_FIB,d1
		moveq	#0,d2
		CallDOS AllocDosObject
		move.l	d0,_FIBPtr(a5)
		beq	Exit
		move.l	#FreeDosObject,_FreeDosObject(a5)
		rts

FreeDosObject	move.l	#DOS_FIB,d1
		move.l	_FIBPtr(a5),d2
		CallDOS FreeDosObject
		rts

*****************************************************************************
* SetDefault Configuration                   * Christian Cyréus - Musicline *
*****************************************************************************

SetDefaultCfg	move.l	_InitialSP(a5),sp
		tst.l	_Message(a5)
		beq.b	.quiet
		move.l	_Message(a5),a1
		tst.l	_GadToolsBase(a5)
		beq.b	.sysreplymsg
		CallGadTools GT_ReplyIMsg
		bra.b	.quiet
.sysreplymsg	CallSys ReplyMsg
.quiet		bsr	CloseMline
		lea	DefaultConfig,a0
		bsr	SetDefConfig
		bra	OpenMline
		rts

*****************************************************************************
* SetLastSaved Configuration                 * Christian Cyréus - Musicline *
*****************************************************************************

SetSavedConfig	move.l	_InitialSP(a5),sp
		tst.l	_Message(a5)
		beq.b	.quiet
		move.l	_Message(a5),a1
		tst.l	_GadToolsBase(a5)
		beq.b	.sysreplymsg
		CallGadTools GT_ReplyIMsg
		bra.b	.quiet
.sysreplymsg	CallSys ReplyMsg
.quiet		bsr	CloseMline
		lea	DefaultConfig,a0
		bsr	SetDefConfig
		bsr	LoadConfig
		bra	OpenMline
		rts

*****************************************************************************
* SaveConfig DataFile                        * Christian Cyréus - Musicline *
*****************************************************************************

SaveConfig	move.l	#256*10,d0		Max Config DataFile Size
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		move.l	d0,_ConfigBuffer(a5)
		beq	.exit
		move.l	d0,a2

		move.l	#"MLED",(a2)+
		move.l	#"CNFG",(a2)+
		
		move	VersNum,(a2)+
		move.l	#"$VER",(a2)+
		move	#": ",(a2)+
		move.l	#"Musi",(a2)+
		move.l	#"clin",(a2)+
		move.l	#"e Ed",(a2)+
		move.l	#"itor",(a2)+
		move.l	#" Con",(a2)+
		move.l	#"fig ",(a2)+
		move.l	VersStr,(a2)+
		move	#" (",(a2)+
		move.b	#")",(a2)+
		clr.b	(a2)+

		move.l	Scr_DisplayID,(a2)+
		move.l	Scr_DisplayWidth,(a2)+
		move.l	Scr_DisplayHeight,(a2)+
		move	Scr_OverscanType+2,(a2)+
		move	Scr_AutoScroll+2,(a2)+

		move.l	_Window1(a5),d0
		lea	Window1Defs,a0
		bsr.b	.windowcoords
		move.l	_Window2(a5),d0
		lea	Window2Defs,a0
		bsr.b	.windowcoords
		move.l	_Window3(a5),d0
		lea	Window3Defs,a0
		bsr.b	.windowcoords
		move.l	_Window4(a5),d0
		lea	Window4Defs,a0
		bsr.b	.windowcoords
		move.l	_Window5(a5),d0
		lea	Window5Defs,a0
		bsr.b	.windowcoords
		move.l	_Window6(a5),d0
		lea	Window6Defs,a0
		bsr.b	.windowcoords
		move.l	_Window7(a5),d0
		lea	Window7Defs,a0
		pea	.wcdone
.windowcoords	tst.l	d0
		bne.b	.wcok
		move.l	(a0),(a2)+			X,Y Coords to Top Left Corner of the Window
		rts
.wcok		move.l	d0,a0
		move.l	wd_LeftEdge(a0),(a2)+		X,Y Coords to Top Left Corner of the Window
		rts

.wcdone		move	_VUOnOff(a5),(a2)+
		move.b	_PackSamples(a5),(a2)+		0=No, 1=Yes

		moveq	#1,d0
		cmp.l	#RawKeyNotesUsa,_KeybListPtr(a5)
		beq.b	.usa
.europe		moveq	#0,d0
.usa		move.b	d0,(a2)+			0=Europe, 1=USA

		move.b	_PlayPosMode(a5),(a2)+		0=True, 1=Fast

		move.b	_ScrollPart(a5),(a2)+
		move.b	_FollowChannel(a5),(a2)+
		move.b	_EditMode(a5),(a2)+
		move.b	_ArpEdMode(a5),(a2)+
		tst.l	_Window7(a5)
		sne.b	(a2)+
		tst.l	_Window6(a5)
		sne.b	(a2)+
		tst.l	_Window5(a5)
		sne.b	(a2)+

		move.l	_AslFileReqLP(a5),a0
		lea	_LoadProjectPath(a5),a1
		bsr.b	.fixstring
		move.l	_AslFileReqLI(a5),a0
		lea	_LoadInstrumentPath(a5),a1
		bsr.b	.fixstring
		move.l	_AslFileReqLS(a5),a0
		lea	_LoadSamplePath(a5),a1
		bsr.b	.fixstring
		move.l	_AslFileReqLW(a5),a0
		lea	_LoadWavePath(a5),a1
		bsr.b	.fixstring
		move.l	_AslFileReqSP(a5),a0
		lea	_SaveProjectPath(a5),a1
		bsr.b	.fixstring
		move.l	_AslFileReqSI(a5),a0
		lea	_SaveInstrumentPath(a5),a1
		bsr.b	.fixstring
		move.l	_AslFileReqSS(a5),a0
		lea	_SaveSamplePath(a5),a1
		bsr.b	.fixstring
		move.l	_AslFileReqSW(a5),a0
		lea	_SaveWavePath(a5),a1
		pea	.fsdone
.fixstring	move	#255-1,d7
		move.l	fr_Drawer(a0),a0
		tst.b	(a0)
		beq.b	.getstring2
.getstring1	move.b	(a0)+,(a2)+
		dbeq	d7,.getstring1
		beq.b	.ok1
		clr.b	(a2)+
.ok1		rts
.getstring2	move.b	(a1)+,(a2)+
		dbeq	d7,.getstring2
		beq.b	.ok2
		clr.b	(a2)+
.ok2		rts

.fsdone		move.l	a2,d7
		sub.l	_ConfigBuffer(a5),d7

.openfile	move.l	#ConfigName,d1
		move.l	#MODE_NEWFILE,d2
		CallDOS Open
		move.l	d0,_FileHandle(a5)
		beq.b	.freemem

.write		move.l	d7,d3
		move.l	_ConfigBuffer(a5),d2
		move.l	_FileHandle(a5),d1
		CallDOS Write

.closefile	move.l	_FileHandle(a5),d1
		CallDOS	Close

.freemem	move.l	_ConfigBuffer(a5),a1
		move.l	#256*10,d0
		CallSys	FreeMem

.exit		rts

*****************************************************************************
* LoadConfig                                 * Christian Cyréus - Musicline *
*****************************************************************************

LoadConfig	move.l	#256*10,d0		Max Config DataFile Size
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		move.l	d0,_ConfigBuffer(a5)
		beq.b	.exit

		move.l	#ConfigName,d1
		move.l	#MODE_OLDFILE,d2
		CallDOS Open
		move.l	d0,_FileHandle(a5)
		beq.b	.freemem

		move.l	_FileHandle(a5),d1
		move.l	_ConfigBuffer(a5),d2
		move.l	#256*10,d3
		CallDOS Read
		tst.l	d0
		ble.b	.closefile

		move.l	_ConfigBuffer(a5),a0
		bsr.b	SetConfig

.closefile	move.l	_FileHandle(a5),d1
		CallDOS Close
.freemem	move.l	_ConfigBuffer(a5),a1
		move.l	#256*10,d0
		CallSys	FreeMem
.exit		rts

SetConfig	cmp.l	#"MLED",(a0)+
		bne	SetCfgExit
		cmp.l	#"CNFG",(a0)+
		bne	SetCfgExit
		cmp	#$0112,(a0)+
		blo	SetCfgExit
		add	#38,a0			;skip version string

SetDefConfig	move.l	(a0)+,Scr_DisplayID
		move.l	(a0)+,Scr_DisplayWidth
		move.l	(a0)+,Scr_DisplayHeight
		move	(a0)+,Scr_OverscanType+2
		move	(a0)+,Scr_AutoScroll+2

		move.l	(a0)+,Window1Defs
		move.l	(a0)+,Window2Defs
		move.l	(a0)+,Window3Defs
		move.l	(a0)+,Window4Defs
		move.l	(a0)+,Window5Defs
		move.l	(a0)+,Window6Defs
		move.l	(a0)+,Window7Defs

		move	(a0)+,d0
		move	d0,_VUOnOff(a5)
		move	d0,GTCB_VuCheck+2

.packsamples	move	#CHECKED,d0
		or	d0,PackSamplesData
		move.b	(a0)+,_PackSamples(a5)		0=No, 1=Yes
		bne.b	.keyboard
		not	d0
		and	d0,PackSamplesData

.keyboard	move.l	#RawKeyNotesUsa,_KeybListPtr(a5)
		move	#40,_KeybListSize1(a5)
		move	#31,_KeybListSize2(a5)
		move	#CHECKED,d0
		or	d0,USAData
		not	d0
		and	d0,EuroData
		tst.b	(a0)+				0=Europe, 1=USA
		bne.b	.playposmode
		move.l	#RawKeyNotesEuro,_KeybListPtr(a5)
		move	#42,_KeybListSize1(a5)
		move	#33,_KeybListSize2(a5)
		and	d0,USAData
		not	d0
		or	d0,EuroData

.playposmode	move	#CHECKED,d0
		or	d0,FastMode
		not	d0
		and	d0,TrueMode
		move.b	(a0)+,_PlayPosMode(a5)		0=True, 1=Fast
		bne.b	.scrollpart
		and	d0,FastMode
		not	d0
		or	d0,TrueMode

.scrollpart	move.b	(a0)+,d0
		move.b	d0,_ScrollPart(a5)
		move.b	d0,GTCY_ScrPart+3

.followchannel	move.b	(a0)+,d0
		move.b	d0,_FollowChannel(a5)
		move.b	d0,GTCY_FollowChn+3

.editmode	move.b	(a0)+,d0
		move.b	d0,_EditMode(a5)
		move.b	d0,GTCY_EditMode+3

.arpedmode	move.b	(a0)+,d0
		move.b	d0,_ArpEdMode(a5)
		move.b	d0,GTCY_ArpEdMode+3

		move.b	(a0)+,_OpenWin7(a5)
		move.b	(a0)+,_OpenWin6(a5)
		move.b	(a0)+,_OpenWin5(a5)
.load_projectpath
		lea	_LoadProjectPath(a5),a1
		move	#256-1,d0
.lprp		move.b	(a0)+,(a1)+
		dbeq	d0,.lprp
.load_instrumentpath
		lea	_LoadInstrumentPath(a5),a1
		move	#256-1,d0
.linp		move.b	(a0)+,(a1)+
		dbeq	d0,.linp
.load_samplepath
		lea	_LoadSamplePath(a5),a1
		move	#256-1,d0
.lsloop		move.b	(a0)+,(a1)+
		dbeq	d0,.lsloop
.load_wavepath
		lea	_LoadWavePath(a5),a1
		move	#256-1,d0
.lwloop		move.b	(a0)+,(a1)+
		dbeq	d0,.lwloop
.save_projectpath
		lea	_SaveProjectPath(a5),a1
		move	#256-1,d0
.sprp		move.b	(a0)+,(a1)+
		dbeq	d0,.sprp
.save_instrumentpath
		lea	_SaveInstrumentPath(a5),a1
		move	#256-1,d0
.sinp		move.b	(a0)+,(a1)+
		dbeq	d0,.sinp
.save_samplepath
		lea	_SaveSamplePath(a5),a1
		move	#256-1,d0
.ssloop		move.b	(a0)+,(a1)+
		dbeq	d0,.ssloop
.save_wavepath
		lea	_SaveWavePath(a5),a1
		move	#256-1,d0
.swloop		move.b	(a0)+,(a1)+
		dbeq	d0,.swloop

SetCfgExit	rts

ConfigName		dc.b	"Mline:Mline.config",0

_ConfigBuffer		rs.l	1
_OpenWin7		rs.b	1
_OpenWin6		rs.b	1
_OpenWin5		rs.b	1
			rs.b	1
_LoadProjectPath	rs.b	256
_LoadInstrumentPath	rs.b	256
_LoadSamplePath		rs.b	256
_LoadWavePath		rs.b	256
_SaveProjectPath	rs.b	256
_SaveInstrumentPath	rs.b	256
_SaveSamplePath		rs.b	256
_SaveWavePath		rs.b	256

*****************************************************************************
* Open and close libraries                       * Conny Cyréus - Musicline *
*****************************************************************************

OpenAslLibrary	moveq	#37,d0
		lea	AslName,a1
		CallSys OpenLibrary
		move.l	d0,_AslBase(a5)
		beq	Exit
		move.l	#CloseAslLibrary,_CloseAslLibrary(a5)
		rts

CloseAslLibrary	move.l	_AslBase(a5),a1
		CallSys CloseLibrary
		rts

AslName		dc.b	"asl.library",0
		even

OpenDiskfontLibrary
		moveq	#36,d0
		lea	DiskfontName,a1
		CallSys OpenLibrary
		move.l	d0,_DiskfontBase(a5)
		beq	Exit
		move.l	#CloseDiskfontLibrary,_CloseDiskfontLibrary(a5)
		rts

CloseDiskfontLibrary
		move.l	_DiskfontBase(a5),a1
		CallSys CloseLibrary
		rts

DiskfontName	dc.b	"diskfont.library",0
		even

OpenDOSLibrary	moveq	#37,d0
		lea	DOSName,a1
		CallSys OpenLibrary
		move.l	d0,_DOSBase(a5)
		beq	Exit
		move.l	#CloseDOSLibrary,_CloseDOSLibrary(a5)
		rts

CloseDOSLibrary	move.l	_DOSBase(a5),a1
		CallSys CloseLibrary
		rts

DOSName		dc.b	"dos.library",0
		even

OpenGadToolsLibrary
		moveq	#37,d0
		lea	GadToolsName,a1
		CallSys OpenLibrary
		move.l	d0,_GadToolsBase(a5)
		beq	Exit
		move.l	#CloseGadToolsLibrary,_CloseGadToolsLibrary(a5)
		rts

CloseGadToolsLibrary
		move.l	_GadToolsBase(a5),a1
		CallSys CloseLibrary
		rts

GadToolsName	dc.b	"gadtools.library",0
		even

OpenGfxLibrary	moveq	#37,d0
		lea	GfxName,a1
		CallSys OpenLibrary
		move.l	d0,_GfxBase(a5)
		beq	Exit
		move.l	#CloseGfxLibrary,_CloseGfxLibrary(a5)
		move.l	d0,a0
		move	206(a0),d0
		btst	#2,d0
		beq.b	.ntsc
		move.l	#1773448,_TimerValue1(a5)
		move.l	#3546895,_TimerValue2(a5)
		move.l	#709378,_TimerValue3(a5)
		rts
.ntsc		move.l	#1789773,_TimerValue1(a5)
		move.l	#3579545,_TimerValue2(a5)
		move.l	#715909,_TimerValue3(a5)
		rts

CloseGfxLibrary	move.l	_GfxBase(a5),a1
		CallSys CloseLibrary
		rts

GfxName	dc.b	"graphics.library",0
		even

OpenIntuitionLibrary
		moveq	#37,d0
		lea	IntuitionName,a1
		CallSys OpenLibrary
		move.l	d0,_IntuitionBase(a5)
		beq	Exit
		move.l	#CloseIntuitionLibrary,_CloseIntuitionLibrary(a5)
		rts

CloseIntuitionLibrary
		move.l	_IntuitionBase(a5),a1
		CallSys CloseLibrary
		rts

IntuitionName	dc.b	"intuition.library",0
		even

*****************************************************************************
* Open and close font                            * Conny Cyréus - Musicline *
*****************************************************************************

_TextFont7	rs.l	1
_TextFont8	rs.l	1
_ErrorOutPut	rs.l	1

OpenFonts	lea	Font7,a0
		CallDiskfont OpenDiskFont
		move.l	d0,_TextFont7(a5)
		beq.b	.font7error
		move.l	#CloseFont7,_CloseFont7(a5)
		lea	Font8,a0
		CallDiskfont OpenDiskFont
		move.l	d0,_TextFont8(a5)
		beq.b	.font8error
		move.l	#CloseFont8,_CloseFont8(a5)
		rts

.font7error	move.l	#ErrorWindow,d1
		move.l	#MODE_OLDFILE,d2
		CallDOS Open
		move.l	d0,_ErrorOutPut(a5)
		move.l	d0,d1
		move.b	#"7",FontSize
		move.l	#FontMsg,d2
		move.l	#FontLng,d3
		CallLib Write
		move.l	_ErrorOutPut(a5),d1
		move.l	#$500000,d2
		CallLib	WaitForChar
		move.l	_ErrorOutPut(a5),d1
		CallLib Close
		bra	Exit

.font8error	move.l	#ErrorWindow,d1
		move.l	#MODE_OLDFILE,d2
		CallDOS Open
		move.l	d0,_ErrorOutPut(a5)
		move.l	d0,d1
		move.b	#"8",FontSize
		move.l	#FontMsg,d2
		move.l	#FontLng,d3
		CallLib Write
		move.l	_ErrorOutPut(a5),d1
		move.l	#$500000,d2
		CallLib	WaitForChar
		move.l	_ErrorOutPut(a5),d1
		CallLib Close
		bra	Exit

Font7		dc.l	FontName
		dc.w	7
		dc.b	0
		dc.b	FPF_DISKFONT!FPF_TALLDOT

Font8		dc.l	FontName
		dc.w	8
		dc.b	0
		dc.b	FPF_DISKFONT!FPF_TALLDOT
FontName	dc.b	"musicline.font",0

ErrorWindow	dc.b	"Con:0/11/305/64/Musicline Editor Window",0
FontMsg		dc.b	10,"Can´t open Musicline.font "
FontSize	dc.b	0,"!",10,10,13,"Press Return "
FontLng		=	*-FontMsg
		even

CloseFont7	move.l	_TextFont7(a5),a1
		CallGfx CloseFont
		rts

CloseFont8	move.l	_TextFont8(a5),a1
		CallGfx CloseFont
		rts

*****************************************************************************
* Open and close screen                          * Conny Cyréus - Musicline *
*****************************************************************************

_Screen		rs.l	1

OpenScreen	lea	ScreenDefs,a0
		lea	ScreenTagList,a1
		CallIntuition OpenScreenTagList
		move.l	d0,_Screen(a5)
		beq	Exit
		move.l	#CloseScreen,_CloseScreen(a5)
		rts

CloseScreen	move.l	_Screen(a5),a0
		CallIntuition CloseScreen
		rts

ScreenName	dc.b	"Musicline Editor "
		Version
		dc.b	" © 1995  "
		ID 1
		dc.b	" "
		NAME
		dc.b	0
		even

ScreenDefs	dc.w	0,0
		dc.w	0
		dc.w	0
		dc.w	2
		dc.b	0,1
		dc.w	0
		dc.w	CUSTOMSCREEN
		dc.l	Font8
		dc.l	ScreenName
		dc.l	0
		dc.l	0

ScreenTagList		dc.l	SA_Pens
			dc.l	Drawinfo
			dc.l	SA_DisplayID
Scr_DisplayID		dc.l	HIRES_KEY
			dc.l	SA_Width
Scr_DisplayWidth	dc.l	640
			dc.l	SA_Height
Scr_DisplayHeight	dc.l	256
			dc.l	SA_Overscan
Scr_OverscanType	dc.l	OSCAN_TEXT
			dc.l	SA_AutoScroll
Scr_AutoScroll		dc.l	TRUE
			dc.l	TAG_DONE

Drawinfo		dc.w	-1

;;IDNum		dc.l	ID1_hex
VersStr		Version
VersNum		VerNum

*****************************************************************************
* Open and close windows                         * Conny Cyréus - Musicline *
*****************************************************************************

_RastPort1	rs.l	1
_RastPort2	rs.l	1
_RastPort3	rs.l	1
_RastPort4	rs.l	1
_UserPort1	rs.l	1
_UserPort2	rs.l	1
_UserPort3	rs.l	1
_UserPort4	rs.l	1
_Window1	rs.l	1
_Window2	rs.l	1
_Window3	rs.l	1
_Window4	rs.l	1
_prWindowOld	rs.l	1
_NewWindow	rs.b	nw_SIZEOF

OpenWindow1	lea	_NewWindow(a5),a0
		lea	Window1Defs,a1
		move.l	(a1)+,nw_LeftEdge(a0)
		move.l	(a1)+,nw_Width(a0)
		move.l	(a1)+,nw_IDCMPFlags(a0)
		move.l	(a1)+,nw_Flags(a0)
		move.l	(a1)+,nw_FirstGadget(a0)
		move.l	(a1)+,nw_Title(a0)
		CallIntuition OpenWindow
		move.l	d0,_Window1(a5)
		beq	Exit
		move.l	_Process(a5),a0
		move.l	pr_WindowPtr(a0),_prWindowOld(a5)
		move.l	d0,pr_WindowPtr(a0)
		move.l	#CloseWindow1,_CloseWindow1(a5)
		move.l	d0,a0
		move.l	wd_RPort(a0),_RastPort1(a5)
		move.l	wd_UserPort(a0),_UserPort1(a5)
		rts

OpenWindow2	lea	_NewWindow(a5),a0
		move.b	#1,nw_BlockPen(a0)
		move.l	_Screen(a5),nw_Screen(a0)
		move	#CUSTOMSCREEN,nw_Type(a0)
		lea	Window2Defs,a1
		move.l	(a1)+,nw_LeftEdge(a0)
		move.l	(a1)+,nw_Width(a0)
		move.l	(a1)+,nw_IDCMPFlags(a0)
		move.l	(a1)+,nw_Flags(a0)
		move.l	(a1)+,nw_FirstGadget(a0)
		move.l	(a1)+,nw_Title(a0)
		CallIntuition OpenWindow
		move.l	d0,_Window2(a5)
		beq	Exit
		move.l	#CloseWindow2,_CloseWindow2(a5)
		move.l	d0,a0
		move.l	wd_RPort(a0),_RastPort2(a5)
		move.l	wd_UserPort(a0),_UserPort2(a5)
		rts

OpenWindow3	lea	_NewWindow(a5),a0
		lea	Window3Defs,a1
		move.l	_Window2(a5),a2
		move	wd_LeftEdge(a2),d0
		add	(a1)+,d0
		move	d0,nw_LeftEdge(a0)
		move	wd_TopEdge(a2),d0
		add	(a1)+,d0
		move	d0,nw_TopEdge(a0)
		move.l	(a1)+,nw_Width(a0)
		move.l	(a1)+,nw_IDCMPFlags(a0)
		move.l	(a1)+,nw_Flags(a0)
		move.l	(a1)+,nw_FirstGadget(a0)
		move.l	(a1)+,nw_Title(a0)
		CallIntuition OpenWindow
		move.l	d0,_Window3(a5)
		move.l	d0,d3
		beq.b	.exit
		move.l	d0,a0
		move.l	wd_RPort(a0),_RastPort3(a5)
		move.l	wd_UserPort(a0),_UserPort3(a5)
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
.exit		rts

OpenWindow4	lea	_NewWindow(a5),a0
		lea	Window4Defs,a1
		move.l	_Window2(a5),a2
		move	wd_LeftEdge(a2),d0
		add	(a1)+,d0
		move	d0,nw_LeftEdge(a0)
		move	wd_TopEdge(a2),d0
		add	(a1)+,d0
		move	d0,nw_TopEdge(a0)
		move.l	(a1)+,nw_Width(a0)
		move.l	(a1)+,nw_IDCMPFlags(a0)
		move.l	(a1)+,nw_Flags(a0)
		move.l	(a1)+,nw_FirstGadget(a0)
		move.l	(a1)+,nw_Title(a0)
		CallIntuition OpenWindow
		move.l	d0,_Window4(a5)
		move.l	d0,d7
		beq.b	.exit
		move.l	d0,a0
		move.l	wd_RPort(a0),_RastPort4(a5)
		move.l	wd_UserPort(a0),_UserPort4(a5)
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
.exit		rts

CloseWindow1	move.l	_Process(a5),a0
		move.l	_prWindowOld(a5),pr_WindowPtr(a0)
		move.l	_Window1(a5),a0
		CallIntuition CloseWindow
		rts

CloseWindow2	move.l	_Window2(a5),a0
		CallIntuition CloseWindow
		rts

CloseWindow3	move.l	_Window3(a5),a0
		CallIntuition CloseWindow
		rts

CloseWindow4	move.l	_Window4(a5),a0
		CallIntuition CloseWindow
		clr.l	_RastPort4(a5)
		rts

WindowTitle	dc.b	" Untitled"
		dcb.b	23,0
ClearTitle	dc.b	"Untitled",0
Window4Title	dc.b	" MakeAnim",0

Window1Defs	dc.w	0,11
		dc.w	640,245
		dc.l	IDCMP_GADGETDOWN!IDCMP_GADGETUP!IDCMP_MENUPICK!IDCMP_RAWKEY!IDCMP_MOUSEBUTTONS!IDCMP_INTUITICKS!IDCMP_MOUSEMOVE!IDCMP_ACTIVEWINDOW!IDCMP_INACTIVEWINDOW
		dc.l	WFLG_ACTIVATE!WFLG_DEPTHGADGET!WFLG_NEWLOOKMENUS!WFLG_DRAGBAR
		dc.l	GadgetList1
		dc.l	WindowTitle

Window2Defs	dc.w	0,11
		dc.w	640,245
		dc.l	IDCMP_GADGETDOWN!IDCMP_GADGETUP!IDCMP_MENUPICK!IDCMP_RAWKEY!IDCMP_MOUSEBUTTONS!IDCMP_INTUITICKS!IDCMP_MOUSEMOVE!IDCMP_ACTIVEWINDOW!IDCMP_INACTIVEWINDOW
		dc.l	WFLG_DEPTHGADGET!WFLG_NEWLOOKMENUS!WFLG_DRAGBAR
		dc.l	0
		dc.l	WindowTitle

Window3Defs	dc.w	265,59
		dc.w	186,105
		dc.l	IDCMP_CLOSEWINDOW!IDCMP_GADGETDOWN!IDCMP_GADGETUP!IDCMP_INTUITICKS!IDCMP_MOUSEMOVE
		dc.l	WFLG_ACTIVATE!WFLG_CLOSEGADGET!WFLG_DEPTHGADGET!WFLG_DRAGBAR!WFLG_RMBTRAP
Window3Gadgets	dc.l	0
Window3Title	dc.l	0

Window4Defs	dc.w	150,70
		dc.w	300,50
		dc.l	IDCMP_CLOSEWINDOW!IDCMP_GADGETDOWN!IDCMP_GADGETUP!IDCMP_INTUITICKS!IDCMP_MOUSEMOVE!IDCMP_ACTIVEWINDOW!IDCMP_INACTIVEWINDOW!IDCMP_RAWKEY
		dc.l	WFLG_ACTIVATE!WFLG_CLOSEGADGET!WFLG_DEPTHGADGET!WFLG_DRAGBAR!WFLG_RMBTRAP
Window4Gadgets	dc.l	0
		dc.l	Window4Title

GadgetList1	dc.l	partminus
		dc.w	212,96,39,13
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	PartNumEd

partminus	dc.l	partplus
		dc.w	252,96,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image1,Image2,0,0,0
		dc.w	0
		dc.l	PartMinus

partplus	dc.l	part
		dc.w	270,96,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image3,Image4,0,0,0
		dc.w	0
		dc.l	PartPlus

part		dc.l	tune
		dc.w	8,110,280,131
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	PartGad

tune		dc.l	tempo
		dc.w	8,43,476,51
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	TuneGad

tempo		dc.l	tempominus
		dc.w	564,187,31,13
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	TempoNumEd

tempominus	dc.l	tempoplus
		dc.w	596,187,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image1,Image2,0,0,0
		dc.w	0
		dc.l	TempoMinus

tempoplus	dc.l	spd
		dc.w	614,187,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image3,Image4,0,0,0
		dc.w	0
		dc.l	TempoPlus

spd		dc.l	spdminus
		dc.w	564,200,31,13
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	SpdNumEd

spdminus	dc.l	spdplus
		dc.w	596,200,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image1,Image2,0,0,0
		dc.w	0
		dc.l	SpdMinus

spdplus		dc.l	grv
		dc.w	614,200,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image3,Image4,0,0,0
		dc.w	0
		dc.l	SpdPlus

grv		dc.l	grvminus
		dc.w	564,213,31,13
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	GrvNumEd

grvminus	dc.l	grvplus
		dc.w	596,213,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image1,Image2,0,0,0
		dc.w	0
		dc.l	GrvMinus

grvplus		dc.l	0
		dc.w	614,213,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image3,Image4,0,0,0
		dc.w	0
		dc.l	GrvPlus

GadgetList3	dc.l	arpgminus
		dc.w	426,26,31,13
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	ArpgNumEd

arpgminus	dc.l	arpgplus
		dc.w	458,26,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image1,Image2,0,0,0
		dc.w	0
		dc.l	ArpgMinus

arpgplus	dc.l	speeded
		dc.w	476,26,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image3,Image4,0,0,0
		dc.w	0
		dc.l	ArpgPlus

speeded		dc.l	speedminus
		dc.w	426,39,31,13
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	SpeedNumEd

speedminus	dc.l	speedplus
		dc.w	458,39,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image1,Image2,0,0,0
		dc.w	0
		dc.l	SpeedMinus

speedplus	dc.l	grooveed
		dc.w	476,39,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image3,Image4,0,0,0
		dc.w	0
		dc.l	SpeedPlus

grooveed	dc.l	grooveminus
		dc.w	426,52,31,13
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	GrooveNumEd

grooveminus	dc.l	grooveplus
		dc.w	458,52,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image1,Image2,0,0,0
		dc.w	0
		dc.l	GrooveMinus

grooveplus	dc.l	arptable
		dc.w	476,52,18,13
		dc.w	GFLG_GADGIMAGE!GFLG_GADGHIMAGE,GACT_RELVERIFY!GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	Image3,Image4,0,0,0
		dc.w	0
		dc.l	GroovePlus

arptable	dc.l	0
		dc.w	496,26,131,99
		dc.w	GFLG_GADGHNONE,GACT_IMMEDIATE,GTYP_BOOLGADGET
		dc.l	0,0,0,0,0
		dc.w	0
		dc.l	ArpgGadget

Image1		dc.w	0,0,18,13,2
		dc.l	Button1
		dc.b	3,0
		dc.l	0

Image2		dc.w	0,0,18,13,2
		dc.l	Button2
		dc.b	3,0
		dc.l	0

Image3		dc.w	0,0,18,13,2
		dc.l	Button3
		dc.b	3,0
		dc.l	0

Image4		dc.w	0,0,18,13,2
		dc.l	Button4
		dc.b	3,0
		dc.l	0

*****************************************************************************
* Info Window                                    * Conny Cyréus - Musicline *
*****************************************************************************

_Window6	rs.l	1
_UserPort6	rs.l	1
_RastPort6	rs.l	1
_UPort6SigNum	rs.w	1

OpenWindow6	tst.l	_Window6(a5)
		beq.b	.open
		move.l	_Window6(a5),a0
		CallIntuition WindowToFront
		bra.b	.exit
.open		lea	_NewWindow(a5),a0
		lea	Window6Defs,a1
		move.l	(a1)+,nw_LeftEdge(a0)
		move.l	(a1)+,nw_Width(a0)
		move.l	(a1)+,nw_IDCMPFlags(a0)
		move.l	(a1)+,nw_Flags(a0)
		move.l	(a1)+,nw_FirstGadget(a0)
		move.l	(a1)+,nw_Title(a0)
		CallIntuition OpenWindow
		move.l	d0,_Window6(a5)
		beq.b	.exit
		bsr.b	UpdateW6Gads
		move.l	_Window6(a5),a0
		move.l	wd_RPort(a0),_RastPort6(a5)
		move.l	wd_UserPort(a0),_UserPort6(a5)
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		move.l	#CloseWindow6,_CloseWindow6(a5)
		moveq	#0,d1
		move.l	_UserPort6(a5),a0
		move.b	MP_SIGBIT(a0),d1
		move	d1,_UPort6SigNum(a5)
		move.l	_WaitSigMask(a5),d0
		bset	d1,d0
		move.l	d0,_WaitSigMask(a5)
.exit		rts

UpdateW6Gads	lea	_Title6Str(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_Str6TitleGad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst1,a3
		CallGadTools GT_SetGadgetAttrsA
		lea	_Author6Str(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_Str6AuthorGad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst1,a3
		CallLib GT_SetGadgetAttrsA
		lea	_Info16Str(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_Str6Info1Gad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst1,a3
		CallLib GT_SetGadgetAttrsA
		lea	_Info26Str(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_Str6Info2Gad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst1,a3
		CallLib GT_SetGadgetAttrsA
		lea	_Info36Str(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_Str6Info3Gad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst1,a3
		CallLib GT_SetGadgetAttrsA
		lea	_Info46Str(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_Str6Info4Gad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst1,a3
		CallLib GT_SetGadgetAttrsA
		lea	_Info56Str(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_Str6Info5Gad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst1,a3
		CallLib GT_SetGadgetAttrsA
		lea	_Date6Str(a5),a1
		move.l	a1,Str6Ptr2
		move.l	_Str6DateGad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst2,a3
		CallLib GT_SetGadgetAttrsA
		lea	_Duration6Str(a5),a1
		move.l	a1,Str6Ptr2
		move.l	_Str6DurationGad(a5),a0
		move.l	_Window6(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst2,a3
		CallLib GT_SetGadgetAttrsA
		rts

CloseWindow6	move	_UPort6SigNum(a5),d1
		move.l	_WaitSigMask(a5),d0
		bclr	d1,d0
		move.l	d0,_WaitSigMask(a5)
		move.l	_Window6(a5),a0
		move.l	wd_LeftEdge(a0),Window6Defs
		CallIntuition CloseWindow
		clr.l	_CloseWindow6(a5)
		clr.l	_Window6(a5)

		move.l	_Str6TitleGad(a5),a0
		lea	_Title6Str(a5),a2
		bsr.b	.getstring
		move.l	_Str6AuthorGad(a5),a0
		lea	_Author6Str(a5),a2
		bsr.b	.getstring
		move.l	_Str6DateGad(a5),a0
		lea	_Date6Str(a5),a2
		bsr.b	.getstring
		move.l	_Str6DurationGad(a5),a0
		lea	_Duration6Str(a5),a2
		bsr.b	.getstring
		move.l	_Str6Info1Gad(a5),a0
		lea	_Info16Str(a5),a2
		bsr.b	.getstring
		move.l	_Str6Info2Gad(a5),a0
		lea	_Info26Str(a5),a2
		bsr.b	.getstring
		move.l	_Str6Info3Gad(a5),a0
		lea	_Info36Str(a5),a2
		bsr.b	.getstring
		move.l	_Str6Info4Gad(a5),a0
		lea	_Info46Str(a5),a2
		bsr.b	.getstring
		move.l	_Str6Info5Gad(a5),a0
		lea	_Info56Str(a5),a2

.getstring	move.l	gg_SpecialInfo(a0),a0
		move.l	si_Buffer(a0),a1
		move	si_NumChars(a0),d1
		move	d1,d0
		beq.b	.getstringdone
		subq	#1,d0
.getstringloop	move.b	(a1)+,(a2)+
		dbf	d0,.getstringloop
.getstringdone	clr.b	(a2)+
		rts

UserPort6	move.l	_UserPort6(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,_Message(a5)
		bne.b	.ok
		rts
.ok		pea	.reply
		move.l	_Message(a5),a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_CLOSEWINDOW,d0
		beq.b	.closewindow
		rts
.reply		move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		bra.b	UserPort6

.closewindow	move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		move.l	#CloseWindow6,(sp)
		rts

_G6Lst1		rs.l	1
_Gad6Num1	rs.w	1
_Gad6Lst1	rs.l	1

CreateGad6	move.l	#Font7,_GadgetDefs+gng_TextAttr(a5)
		lea	_Gad6Lst1(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq.b	.exit
		move.l	_Gad6Lst1(a5),_G6Lst1(a5)
		lea	_Gad6Ptr1(a5),a3
		lea	New6Gad1,a4
		moveq	#0,d7
		jsr	CreateGadget
		move	d7,_Gad6Num1(a5)
		move.l	_Gad6Lst1(a5),Window6Gadgets
.exit		rts

ClrW6StrGads	moveq	#64-1,d0
		lea	_Title6Str(a5),a0
		bsr.b	.clrstring
		moveq	#64-1,d0
		lea	_Author6Str(a5),a0
		bsr.b	.clrstring
		moveq	#16-1,d0
		lea	_Date6Str(a5),a0
		bsr.b	.clrstring
		moveq	#16-1,d0
		lea	_Duration6Str(a5),a0
		bsr.b	.clrstring
		moveq	#64-1,d0
		lea	_Info16Str(a5),a0
		bsr.b	.clrstring
		moveq	#64-1,d0
		lea	_Info26Str(a5),a0
		bsr.b	.clrstring
		moveq	#64-1,d0
		lea	_Info36Str(a5),a0
		bsr.b	.clrstring
		moveq	#64-1,d0
		lea	_Info46Str(a5),a0
		bsr.b	.clrstring
		moveq	#64-1,d0
		lea	_Info56Str(a5),a0
.clrstring	clr.b	(a0)+
		dbf	d0,.clrstring
		rts

_Gad6Ptr1		rs.b	0
_Str6TitleGad		rs.l	1
_Str6AuthorGad		rs.l	1
_Str6DateGad		rs.l	1
_Str6DurationGad	rs.l	1
_Str6Info1Gad		rs.l	1
_Str6Info2Gad		rs.l	1
_Str6Info3Gad		rs.l	1
_Str6Info4Gad		rs.l	1
_Str6Info5Gad		rs.l	1

Window6Defs	dc.w	78,80
		dc.w	486,119
		dc.l	IDCMP_CLOSEWINDOW
		dc.l	WFLG_CLOSEGADGET!WFLG_DEPTHGADGET!WFLG_DRAGBAR!WFLG_RMBTRAP
Window6Gadgets	dc.l	0
		dc.l	Window6Title

New6Gad1	dc.w	60,12,420,13
		dc.l	Title6_txt
		dc.l	NG_HIGHLABEL
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	60,25,420,13
		dc.l	Author6_txt
		dc.l	NG_HIGHLABEL
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	60,38,100,13
		dc.l	Date6_txt
		dc.l	NG_HIGHLABEL
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst2
		dc.w	1

		dc.w	380,38,100,13
		dc.l	Duration6_txt
		dc.l	NG_HIGHLABEL
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst2
		dc.w	1

		dc.w	60,51,420,13
		dc.l	Info6_txt
		dc.l	NG_HIGHLABEL
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	60,64,420,13
		dc.l	0
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	60,77,420,13
		dc.l	0
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	60,90,420,13
		dc.l	0
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	60,103,420,13
		dc.l	0
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

End6Gad1	dc.l	-1

Tag6Lst1	dc.l	GTST_MaxChars
		dc.l	63
		dc.l	GTST_String
Str6Ptr1	dc.l	0
		dc.l	TAG_DONE

Tag6Lst2	dc.l	GTST_MaxChars
		dc.l	15
		dc.l	GTST_String
Str6Ptr2	dc.l	0
		dc.l	TAG_DONE

Window6Title	dc.b	" Info Window",0
Title6_txt	dc.b	"Title",0
Author6_txt	dc.b	"Author",0
Date6_txt	dc.b	"Date",0
Duration6_txt	dc.b	"Duration",0
Info6_txt	dc.b	"Info",0
		even

*****************************************************************************
* Register Window                                * Conny Cyréus - Musicline *
*****************************************************************************

LoadReg		bsr	InputOff
		move.l	_Window8(a5),RegWindowPtr
		move.l	#LoadReg_txt,RegTitleText
		clr.l	RegFlags1
		move.l	_AslReg(a5),a0
		lea	RegTags,a1
		CallAsl AslRequest
		tst.l	d0
		beq	.exit
		bsr	GetRegPathName

		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#MODE_OLDFILE,d2
		CallDOS Open
		move.l	d0,_FileHandle(a5)
		beq	.exit

		move.l	_FileHandle(a5),d1
		lea	_CopyBuffer(a5),a0
		move.l	a0,d2
		move	#2685,d3
		CallDOS Read
		tst.l	d0
		ble	.closefile

		lea	_CopyBuffer(a5),a0
		cmp.l	#"Belo",(a0)
		bne	.check
		move	d0,d2
		move.l	#Regf_txt,a2

.chk		move.b	(a2)+,d0
		beq.b	.checknext
.chknxt		cmp.b	(a0)+,d0
		beq.b	.chk
		dbf	d2,.chknxt
		addq.l	#4,sp
		bra	.end
.checknext	lea	_FirstNameStr(a5),a1
		bsr	.getpcstring
		lea	_LastNameStr(a5),a1
		bsr	.getpcstring
		lea	_AddressStr(a5),a1
		bsr	.getpcstring
		lea	_PostalAddressStr(a5),a1
		bsr	.getpcstring
		lea	_CountryStr(a5),a1
		bsr	.getpcstring
		lea	_BirthDateStr(a5),a1
		bsr	.getpcstring
		lea	_PhoneNrStr(a5),a1
		bsr	.getpcstring
		lea	_FaxNrStr(a5),a1
		bsr	.getpcstring
		lea	_ModemNrStr(a5),a1
		bsr	.getpcstring
		lea	_EMailStr(a5),a1
		bsr	.getpcstring
		lea	_OccupationStr(a5),a1
		bsr	.getpcstring
		lea	_HandleStr(a5),a1
		bsr	.getpcstring
		lea	_GroupStr(a5),a1
		bsr	.getpcstring
		lea	_GroupOccupationStr(a5),a1
		bsr	.getpcstring
		lea	_ComputerStr(a5),a1
		bsr	.getpcstring
		lea	_CPUStr(a5),a1
		bsr	.getpcstring
		lea	_OSStr(a5),a1
		bsr	.getpcstring
		lea	_MemoryStr(a5),a1
		bsr	.getpcstring
		lea	_ModemStr(a5),a1
		bsr	.getpcstring
		lea	UpdatePasswordStr,a1
		bsr	.getpcstring
		bra	.end

.check		cmp.l	#"MLED",(a0)+
		bne	.closefile
		cmp.l	#".REG",(a0)+
		bne	.closefile
		cmp.b	#10,(a0)
		bne.b	.noadd
		addq	#1,a0
.noadd
		lea	_FirstNameStr(a5),a1
		bsr	.getstring
		lea	_LastNameStr(a5),a1
		bsr	.getstring
		lea	_AddressStr(a5),a1
		bsr.b	.getstring
		lea	_PostalAddressStr(a5),a1
		bsr.b	.getstring
		lea	_CountryStr(a5),a1
		bsr.b	.getstring
		lea	_BirthDateStr(a5),a1
		bsr.b	.getstring
		lea	_PhoneNrStr(a5),a1
		bsr.b	.getstring
		lea	_FaxNrStr(a5),a1
		bsr.b	.getstring
		lea	_ModemNrStr(a5),a1
		bsr.b	.getstring
		lea	_EMailStr(a5),a1
		bsr.b	.getstring
		lea	_OccupationStr(a5),a1
		bsr.b	.getstring
		lea	_HandleStr(a5),a1
		bsr.b	.getstring
		lea	_GroupStr(a5),a1
		bsr.b	.getstring
		lea	_GroupOccupationStr(a5),a1
		bsr.b	.getstring
		lea	_ComputerStr(a5),a1
		bsr.b	.getstring
		lea	_CPUStr(a5),a1
		bsr.b	.getstring
		lea	_OSStr(a5),a1
		bsr.b	.getstring
		lea	_MemoryStr(a5),a1
		bsr.b	.getstring
		lea	_ModemStr(a5),a1
		bsr.b	.getstring
		lea	UpdatePasswordStr,a1
		bsr.b	.getstring
.end		bsr	UpdateW8Gads

.closefile	move.l	_FileHandle(a5),d1
		CallDOS Close
.exit		bra	InputOn

.getstring	moveq	#64-1,d0
.getstringloop	move.b	(a0)+,d1
		beq.b	.setzero
		cmp.b	#10,d1
		beq.b	.setzero
		move.b	d1,(a1)+
		dbf	d0,.getstringloop
.setzero	clr.b	(a1)+
		rts

.getpcstring	move.b	(a2)+,d0
		beq.b	.getpcstr
.getpccheck	cmp.b	(a0)+,d0
		beq.b	.getpcstring
		dbf	d2,.getpccheck
		addq.l	#4,sp
		bra	.end
.getpcstr	addq	#2,a0
		moveq	#64-1,d0
.getpcstrloop	move.b	(a0)+,d1
		subq	#1,d2
		cmp.b	#13,d1
		beq.b	.setpczero
		move.b	d1,(a1)+
		dbf	d0,.getpcstrloop
.setpczero	clr.b	(a1)+
		rts

GetRegPathName	move.l	_AslReg(a5),a4
		lea	_CopyBuffer(a5),a3
		clr.b	_CopyOf_(a5)
		move.l	fr_Drawer(a4),a0
		move	#511,d5
		tst.b	(a0)
		beq.b	.nodrawer
.movedrawer	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movedrawer
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer
		move.b	#"/",(a3)+
.nodrawer	move.l	a3,_FileNamePtr(a5)
		move.l	fr_File(a4),a0
.movefile	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movefile
		rts

SaveReg		bsr	InputOff
		move.l	_Window8(a5),RegWindowPtr
		move.l	#SaveReg_txt,RegTitleText
		move.l	#FRF_DOSAVEMODE,RegFlags1
		move.l	_AslReg(a5),a0
		lea	RegTags,a1
		CallAsl AslRequest
		tst.l	d0
		beq	.exit
		bsr	GetRegPathName

		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#MODE_NEWFILE,d2
		CallDOS Open
		move.l	d0,_FileHandle(a5)
		beq	.exit

		lea	_CopyBuffer(a5),a3
		move.l	#"MLED",(a3)+
		move.l	#".REG",(a3)+
		move.b	#10,(a3)+

		move.l	_FirstNameGad(a5),a0
		lea	_FirstNameStr(a5),a2
		bsr	.getstring
		move.l	_LastNameGad(a5),a0
		lea	_LastNameStr(a5),a2
		bsr	.getstring
		move.l	_AddressGad(a5),a0
		lea	_AddressStr(a5),a2
		bsr	.getstring
		move.l	_PostalAddressGad(a5),a0
		lea	_PostalAddressStr(a5),a2
		bsr	.getstring
		move.l	_CountryGad(a5),a0
		lea	_CountryStr(a5),a2
		bsr	.getstring
		move.l	_BirthDateGad(a5),a0
		lea	_BirthDateStr(a5),a2
		bsr	.getstring
		move.l	_PhoneNrGad(a5),a0
		lea	_PhoneNrStr(a5),a2
		bsr	.getstring
		move.l	_FaxNrGad(a5),a0
		lea	_FaxNrStr(a5),a2
		bsr	.getstring
		move.l	_ModemNrGad(a5),a0
		lea	_ModemNrStr(a5),a2
		bsr	.getstring
		move.l	_EMailGad(a5),a0
		lea	_EMailStr(a5),a2
		bsr	.getstring
		move.l	_OccupationGad(a5),a0
		lea	_OccupationStr(a5),a2
		bsr	.getstring
		move.l	_HandleGad(a5),a0
		lea	_HandleStr(a5),a2
		bsr.b	.getstring
		move.l	_GroupGad(a5),a0
		lea	_GroupStr(a5),a2
		bsr.b	.getstring
		move.l	_GroupOccupationGad(a5),a0
		lea	_GroupOccupationStr(a5),a2
		bsr.b	.getstring
		move.l	_ComputerGad(a5),a0
		lea	_ComputerStr(a5),a2
		bsr.b	.getstring
		move.l	_CPUGad(a5),a0
		lea	_CPUStr(a5),a2
		bsr.b	.getstring
		move.l	_OSGad(a5),a0
		lea	_OSStr(a5),a2
		bsr.b	.getstring
		move.l	_MemoryGad(a5),a0
		lea	_MemoryStr(a5),a2
		bsr.b	.getstring
		move.l	_ModemGad(a5),a0
		lea	_ModemStr(a5),a2
		bsr.b	.getstring
		move.l	_UpdatePasswordGad(a5),a0
		lea	UpdatePasswordStr,a2
		bsr.b	.getstring

		move.l	_FileHandle(a5),d1
		lea	_CopyBuffer(a5),a1
		sub.l	a1,a3
		move.l	a1,d2
		move.l	a3,d3
		CallDOS Write
.closefile	move.l	_FileHandle(a5),d1
		CallDOS Close

.exit		bra	InputOn

.getstring	move.l	gg_SpecialInfo(a0),a0
		move.l	si_Buffer(a0),a1
		move	si_NumChars(a0),d0
		beq.b	.getstringdone
		subq	#1,d0
.getstringloop	move.b	(a1)+,d1
		move.b	d1,(a2)+
		move.b	d1,(a3)+
		dbf	d0,.getstringloop
.getstringdone	clr.b	(a2)+
		move.b	#10,(a3)+
		rts

RegTags		dc.l	ASLFR_Window
RegWindowPtr	dc.l	0
		dc.l	ASLFR_TitleText
RegTitleText	dc.l	0
		dc.l	ASLFR_Flags1
RegFlags1	dc.l	0
		dc.l	TAG_DONE

_AslReg		rs.l	1

AllocAslReg	move.l	#ASL_FileRequest,d0
		move.l	#AslTagListReg,a0
		CallAsl AllocAslRequest
		move.l	d0,_AslReg(a5)
		beq	Exit
		move.l	#FreeAslReg,_FreeAslReg(a5)
		rts

FreeAslReg	move.l	_AslReg(a5),a0
		CallAsl FreeFileRequest
		rts

AslTagListReg	dc.l	ASLFR_InitialDrawer
		dc.l	RegDrawer
		dc.l	ASLFR_InitialFile
		dc.l	RegFile
		dc.l	TAG_END

RegDrawer	dc.b	"Mline:",0
RegFile		dc.b	"Mline.Reg",0
Regf_txt	dc.b	"recipient:",0
		dc.b	"FirstName:",0
		dc.b	"LastName:",0
		dc.b	"Address:",0
		dc.b	"PostalAddress:",0
		dc.b	"Country:",0
		dc.b	"BirthDate:",0
		dc.b	"PhoneNr:",0
		dc.b	"FaxNr:",0
		dc.b	"ModemNr:",0
		dc.b	"Email:",0
		dc.b	"Occupation:",0
		dc.b	"Handle:",0
		dc.b	"Group:",0
		dc.b	"GroupOcc:",0
		dc.b	"Computer:",0
		dc.b	"CPU:",0
		dc.b	"OS:",0
		dc.b	"Memory:",0
		dc.b	"Modem:",0
		dc.b	"MLuPW:",0
		even

_Window8	rs.l	1
_UserPort8	rs.l	1
_RastPort8	rs.l	1
_UPort8SigNum	rs.w	1

OpenWindow8	tst.l	_Window8(a5)
		beq.b	.open
		move.l	_Window8(a5),a0
		CallIntuition WindowToFront
		bra.b	.exit
.open		lea	_NewWindow(a5),a0
		lea	Window8Defs,a1
		move.l	(a1)+,nw_LeftEdge(a0)
		move.l	(a1)+,nw_Width(a0)
		move.l	(a1)+,nw_IDCMPFlags(a0)
		move.l	(a1)+,nw_Flags(a0)
		move.l	(a1)+,nw_FirstGadget(a0)
		move.l	(a1)+,nw_Title(a0)
		CallIntuition OpenWindow
		move.l	d0,_Window8(a5)
		beq.b	.exit
		bsr.b	UpdateW8Gads
		move.l	_Window8(a5),a0
		move.l	wd_RPort(a0),_RastPort8(a5)
		move.l	wd_UserPort(a0),_UserPort8(a5)
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		move.l	#CloseWindow8,_CloseWindow8(a5)
		moveq	#0,d1
		move.l	_UserPort8(a5),a0
		move.b	MP_SIGBIT(a0),d1
		move	d1,_UPort8SigNum(a5)
		move.l	_WaitSigMask(a5),d0
		bset	d1,d0
		move.l	d0,_WaitSigMask(a5)
.exit		rts

UpdateW8Gads	lea	_FirstNameStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_FirstNameGad(a5),a0
		move.l	_Window8(a5),a1
		sub.l	a2,a2
		lea	Tag6Lst1,a3
		CallGadTools GT_SetGadgetAttrsA
		lea	_LastNameStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_LastNameGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_AddressStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_AddressGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_PostalAddressStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_PostalAddressGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_CountryStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_CountryGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_BirthDateStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_BirthDateGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_PhoneNrStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_PhoneNrGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_FaxNrStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_FaxNrGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_ModemNrStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_ModemNrGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_EMailStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_EMailGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_OccupationStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_OccupationGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_HandleStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_HandleGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_GroupStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_GroupGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_GroupOccupationStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_GroupOccupationGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_ComputerStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_ComputerGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_CPUStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_CPUGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_OSStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_OSGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_MemoryStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_MemoryGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	_ModemStr(a5),a1
		move.l	a1,Str6Ptr1
		move.l	_ModemGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		lea	UpdatePasswordStr,a1
		move.l	a1,Str6Ptr1
		move.l	_UpdatePasswordGad(a5),a0
		move.l	_Window8(a5),a1
		CallLib GT_SetGadgetAttrsA
		rts

CloseWindow8	move	_UPort8SigNum(a5),d1
		move.l	_WaitSigMask(a5),d0
		bclr	d1,d0
		move.l	d0,_WaitSigMask(a5)
		move.l	_Window8(a5),a0
		move.l	wd_LeftEdge(a0),Window8Defs
		CallIntuition CloseWindow
		clr.l	_CloseWindow8(a5)
		clr.l	_Window8(a5)

		move.l	_FirstNameGad(a5),a0
		lea	_FirstNameStr(a5),a2
		bsr	.getstring
		move.l	_LastNameGad(a5),a0
		lea	_LastNameStr(a5),a2
		bsr	.getstring
		move.l	_AddressGad(a5),a0
		lea	_AddressStr(a5),a2
		bsr	.getstring
		move.l	_PostalAddressGad(a5),a0
		lea	_PostalAddressStr(a5),a2
		bsr	.getstring
		move.l	_CountryGad(a5),a0
		lea	_CountryStr(a5),a2
		bsr	.getstring
		move.l	_BirthDateGad(a5),a0
		lea	_BirthDateStr(a5),a2
		bsr	.getstring
		move.l	_PhoneNrGad(a5),a0
		lea	_PhoneNrStr(a5),a2
		bsr	.getstring
		move.l	_FaxNrGad(a5),a0
		lea	_FaxNrStr(a5),a2
		bsr.b	.getstring
		move.l	_ModemNrGad(a5),a0
		lea	_ModemNrStr(a5),a2
		bsr.b	.getstring
		move.l	_EMailGad(a5),a0
		lea	_EMailStr(a5),a2
		bsr.b	.getstring
		move.l	_OccupationGad(a5),a0
		lea	_OccupationStr(a5),a2
		bsr.b	.getstring
		move.l	_HandleGad(a5),a0
		lea	_HandleStr(a5),a2
		bsr.b	.getstring
		move.l	_GroupGad(a5),a0
		lea	_GroupStr(a5),a2
		bsr.b	.getstring
		move.l	_GroupOccupationGad(a5),a0
		lea	_GroupOccupationStr(a5),a2
		bsr.b	.getstring
		move.l	_ComputerGad(a5),a0
		lea	_ComputerStr(a5),a2
		bsr.b	.getstring
		move.l	_CPUGad(a5),a0
		lea	_CPUStr(a5),a2
		bsr.b	.getstring
		move.l	_OSGad(a5),a0
		lea	_OSStr(a5),a2
		bsr.b	.getstring
		move.l	_MemoryGad(a5),a0
		lea	_MemoryStr(a5),a2
		bsr.b	.getstring
		move.l	_ModemGad(a5),a0
		lea	_ModemStr(a5),a2
		bsr.b	.getstring
		move.l	_UpdatePasswordGad(a5),a0
		lea	UpdatePasswordStr,a2

.getstring	move.l	gg_SpecialInfo(a0),a0
		move.l	si_Buffer(a0),a1
		move	si_NumChars(a0),d0
		beq.b	.getstringdone
		subq	#1,d0
.getstringloop	move.b	(a1)+,(a2)+
		dbf	d0,.getstringloop
.getstringdone	clr.b	(a2)+
		rts

UserPort8	move.l	_UserPort8(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,_Message(a5)
		bne.b	.ok
		rts
.ok		pea	.reply
		move.l	_Message(a5),a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_CLOSEWINDOW,d0
		beq.b	.closewindow
		cmp.l	#IDCMP_GADGETUP,d0
		beq.b	.gadget
		rts
.reply		move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		bra.b	UserPort8

.closewindow	move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		move.l	#CloseWindow8,(sp)
		rts

.gadget		move.l	im_IAddress(a4),a0
		move.l	gg_UserData(a0),d1
		bne.b	.gadok
		rts
.gadok		move.l	d1,a1
		jmp	(a1)

_G8Lst1		rs.l	1
_Gad8Num1	rs.w	1
_Gad8Lst1	rs.l	1

CreateGad8	move.l	#Font7,_GadgetDefs+gng_TextAttr(a5)
		lea	_Gad8Lst1(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq.b	.exit
		move.l	_Gad8Lst1(a5),_G8Lst1(a5)
		lea	_Gad8Ptr1(a5),a3
		lea	New8Gad1,a4
		moveq	#0,d7
		jsr	CreateGadget
		move	d7,_Gad8Num1(a5)
		move.l	_Gad8Lst1(a5),Window8Gadgets
.exit		rts

_Gad8Ptr1		rs.b	0
_FirstNameGad		rs.l	1
_LastNameGad		rs.l	1
_AddressGad		rs.l	1
_PostalAddressGad	rs.l	1
_CountryGad		rs.l	1
_BirthDateGad		rs.l	1
_PhoneNrGad		rs.l	1
_FaxNrGad		rs.l	1
_ModemNrGad		rs.l	1
_EMailGad		rs.l	1
_OccupationGad		rs.l	1
_HandleGad		rs.l	1
_GroupGad		rs.l	1
_GroupOccupationGad	rs.l	1
_ComputerGad		rs.l	1
_CPUGad			rs.l	1
_OSGad			rs.l	1
_MemoryGad		rs.l	1
_ModemGad		rs.l	1
_UpdatePasswordGad	rs.l	1
_LoadGadget		rs.l	1
_SaveGadget		rs.l	1

_FirstNameStr		rs.b	64
_LastNameStr		rs.b	64
_AddressStr		rs.b	64
_PostalAddressStr	rs.b	64
_CountryStr		rs.b	64
_BirthDateStr		rs.b	64
_PhoneNrStr		rs.b	64
_FaxNrStr		rs.b	64
_ModemNrStr		rs.b	64
_EMailStr		rs.b	64
_OccupationStr		rs.b	64
_HandleStr		rs.b	64
_GroupStr		rs.b	64
_GroupOccupationStr	rs.b	64
_ComputerStr		rs.b	64
_CPUStr			rs.b	64
_OSStr			rs.b	64
_MemoryStr		rs.b	64
_ModemStr		rs.b	64

Window8Defs	dc.w	0,0
		dc.w	484,256
		dc.l	IDCMP_CLOSEWINDOW!IDCMP_GADGETUP
		dc.l	WFLG_ACTIVATE!WFLG_CLOSEGADGET!WFLG_DEPTHGADGET!WFLG_DRAGBAR!WFLG_RMBTRAP
Window8Gadgets	dc.l	0
		dc.l	Window8Title

New8Gad1	dc.w	170,12,308,12
		dc.l	FirstName_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1+1

		dc.w	170,24,308,12
		dc.l	LastName_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,36,308,12
		dc.l	Address_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1+1

		dc.w	170,48,308,12
		dc.l	PostalAddress_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,60,308,12
		dc.l	Country_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,72,308,12
		dc.l	BirthDate_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,84,308,12
		dc.l	PhoneNr_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,96,308,12
		dc.l	FaxNr_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,108,308,12
		dc.l	ModemNr_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,120,308,12
		dc.l	EMail_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,132,308,12
		dc.l	Occupation_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,144,308,12
		dc.l	Handle_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,156,308,12
		dc.l	Group_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,168,308,12
		dc.l	GroupOccupation_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,180,308,12
		dc.l	Computer_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,192,308,12
		dc.l	CPU_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,204,308,12
		dc.l	OS_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,216,308,12
		dc.l	Memory_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,228,308,12
		dc.l	Modem_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	170,240,308,12
		dc.l	UpdatePassword_txt
		dc.l	0
		dc.l	0
		dc.l	STRING_KIND
		dc.l	Tag6Lst1
		dc.w	1

		dc.w	6,24,50,11
		dc.l	Load_txt
		dc.l	0
		dc.l	LoadReg
		dc.l	BUTTON_KIND
		dc.l	0
		dc.w	1

		dc.w	6,12,50,11
		dc.l	Save_txt
		dc.l	0
		dc.l	SaveReg
		dc.l	BUTTON_KIND
		dc.l	0
		dc.w	1

End8Gad1	dc.l	-1

Window8Title		dc.b	" Register Window",0
FirstName_txt		dc.b	"First Name:",0
LastName_txt		dc.b	"Last Name:",0
Address_txt		dc.b	"Address:",0
PostalAddress_txt	dc.b	"Postal Address:",0
Country_txt		dc.b	"Country:",0
BirthDate_txt		dc.b	"Birth Date:",0
PhoneNr_txt		dc.b	"Phone Nr:",0
FaxNr_txt		dc.b	"Fax Nr:",0
ModemNr_txt		dc.b	"Modem Nr:",0
EMail_txt		dc.b	"E-Mail address:",0
Occupation_txt		dc.b	"Occupation:",0
Handle_txt		dc.b	"Handle:",0
Group_txt		dc.b	"Group:",0
GroupOccupation_txt	dc.b	"Group Occupation:",0
Computer_txt		dc.b	"Computer:",0
CPU_txt			dc.b	"CPU:",0
OS_txt			dc.b	"OS:",0
Memory_txt		dc.b	"Memory (chip/fast):",0
Modem_txt		dc.b	"Modem:",0
UpdatePassword_txt	dc.b	"Mline Update Password:",0
Load_txt		dc.b	"Load",0
Save_txt		dc.b	"Save",0
LoadReg_txt		dc.b	"Load Registration File.",0
SaveReg_txt		dc.b	"Save Registration File.",0
UpdatePasswordStr	dc.b	"In order to get new versions from the BBS."	;42 chars
			dcb.b	64-42,0
			even

*****************************************************************************
* Open and close console device                  * Conny Cyréus - Musicline *
*****************************************************************************

_ConDevice	rs.l	1
_ConIOStdReq	rs.b	IOSTD_SIZE

OpenConsoleDevice
		moveq	#CONU_LIBRARY,d0
		moveq	#CONU_STANDARD,d1
		lea	ConName,a0
		lea	_ConIOStdReq(a5),a1
		CallSys OpenDevice
		tst.l	d0
		bne	Exit
		move.l	#CloseConsoleDevice,_CloseConsoleDevice(a5)
		lea	_ConIOStdReq(a5),a0
		move.l	IO_DEVICE(a0),_ConDevice(a5)
		rts

CloseConsoleDevice
		lea	_ConIOStdReq(a5),a1
		CallSys CloseDevice
		rts

ConName		dc.b	"console.device",0
		even

*****************************************************************************
* Requesters                                     * Conny Cyréus - Musicline *
*****************************************************************************

CheckLowChipMem	move.l	#16384,d0
		move.l	#MEMF_CHIP,d1
		CallSys AllocMem
		move.l	d0,d6
		beq.b	.exit
		move.l	d0,a1
		move.l	#16384,d0
		CallLib FreeMem
.exit		rts

Quit		bsr	InputOff
		bsr	CheckLowChipMem
		tst.l	d6
		beq.b	.quit
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#Quit_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		bne.b	.quit
		bsr	InputOn
		rts
.quit		bsr	InputOn
		move	#$0101,_BlockPlay(a5)
		jsr	Stoppa
		bra	Exit

_FxHelp2Req	rs.l	1
_FxHelp2SigNum	rs.w	1

FxHelp2Req	move.l	_Window2(a5),a0
		lea	EasyReqDefs,a1
		move.l	#ArpgFxCmd_Txt,8(a1)
		move.l	#FxHelp2_Txt,12(a1)
		move.l	#Ok_Txt,16(a1)
		move.l	#IDCMP_RAWKEY,d0
		sub.l	a3,a3
		CallIntuition BuildEasyRequestArgs
		move.l	d0,_FxHelp2Req(a5)
		beq.b	.exit
		move.l	#FreeFxHelp2Req,_FreeFxHelp2Req(a5)
		move.l	d0,a0
		move.l	wd_UserPort(a0),a0
		moveq	#0,d1
		move.b	MP_SIGBIT(a0),d1
		move	d1,_FxHelp2SigNum(a5)
		move.l	_WaitSigMask(a5),d0
		bset	d1,d0
		move.l	d0,_WaitSigMask(a5)
.exit		rts

CheckFxHelp2Req	move.l	_FxHelp2Req(a5),d0
		beq.b	.exit
		move.l	d0,a0
		sub.l	a1,a1
		moveq	#0,d0
		CallIntuition SysReqHandler
		cmp.l	#-2,d0
		bne.b	FreeFxHelp2Req
.exit		rts

FreeFxHelp2Req	move.l	_FxHelp2Req(a5),a0
		CallIntuition FreeSysRequest
		clr.l	_FxHelp2Req(a5)
		clr.l	_FreeFxHelp2Req(a5)
		move	_FxHelp2SigNum(a5),d1
		move.l	_WaitSigMask(a5),d0
		bclr	d1,d0
		move.l	d0,_WaitSigMask(a5)
		lea	EasyReqDefs,a1
		move.l	#MlRequester_Txt,8(a1)
		rts

AboutReq	bsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#AboutMsg_Txt,12(a1)
		move.l	#Ok_Txt,16(a1)
		lea	ReqIDCMP,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		bsr	InputOn
		rts

ReqIDCMP	dc.l	IDCMP_RAWKEY

HowToContactReq	bsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#HowToContactMsg_Txt,12(a1)
		move.l	#Ok_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		bsr	InputOn
		rts

HowToRegMeReq	bsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#HowToRegMeMsg_Txt,12(a1)
		move.l	#Fees_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs

		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#PricesMsg_Txt,12(a1)
		move.l	#Ok_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs

		bsr	InputOn
		rts

_ReqRefWindow	rs.l	1

EasyReqDefs	dc.l	EasyStruct_SIZEOF
		dc.l	0
		dc.l	MlRequester_Txt
		dc.l	0
		dc.l	0

MlRequester_Txt	dc.b	" Musicline Editor Requester",0
ArpgFxCmd_Txt	dc.b	" Arpeggio Effect Commands",0
RetryCares_Txt	dc.b	"Retry|Override",0
RetryCancel_Txt	dc.b	"Retry|Cancel",0
OkCancel_Txt	dc.b	"Ok|Cancel",0
Ok_Txt		dc.b	"Ok",0
Exit_Txt	dc.b	"Exit",0
Fees_Txt	dc.b	"Registration Fees",0
Resource_Txt	dc.b	"Can´t open ciab.resource",0
TimerA_Txt	dc.b	"Can´t allocate CIAB Timer A",0
TimerB_Txt	dc.b	"Can´t allocate CIAB Timer B",0
Audio_Txt	dc.b	"Can´t allocate AudioChannels",0
Quit_Txt	dc.b	"Quit Musicline Editor? ",0
Window_Txt	dc.b	"Window",0
InstEditor_Txt	dc.b	"Instrument Editor   ~",0
Sequencer_Txt	dc.b	"Sequencer   ~",0
EraseAll_Txt	dc.b	"Erase all data? ",0
SaveMod_Txt	dc.b	"  Save Module?  ",0
ClrTune_Txt	dc.b	"  Clear Tune?   ",0
ClrAllParts_Txt	dc.b	"Clear all Parts?",0
RemTune_Txt	dc.b	"  Remove Tune?  ",0
RemAllTunes_Txt	dc.b	"Remove all Tunes?",0
RemInst_Txt	dc.b	" Remove Instrument?",0
RemInsts_Txt	dc.b	" Remove Unused Instruments? ",0
RemParts_Txt	dc.b	" Remove Unused Parts?",0
RemInstNot_Txt	dc.b	"Selected Instrument is in use!",0
RemEqWs_Txt	dc.b	"Remove Equal Wavesamples?",0
RemWs_Txt	dc.b	"Remove Wavesample?",0
RemUnWs_Txt	dc.b	"Remove Unused Wavesamples?",0
RemWsNot_Txt	dc.b	"Selected Wavesample is in use!",0
AddWave_Txt	dc.b	"Add Wave",0
CpuSlow_Txt	dc.b	"You need more CPU POWER!",0
PPModules_Txt	dc.b	"Can't load powerpacked modules!",0

FxHelp2_Txt	dc.b	"1xx SlideUp         : 00-FF speed ",10
		dc.b	"2xx SlideDown       : 00-FF speed ",10
		dc.b	"3xx SetVolume       : 00-40 volume",10
		dc.b	"4xx VolumeSlideUp   : 00-FF speed ",10
		dc.b	"5xx VolumeSlideDown : 00-FF speed ",10
		dc.b	"6xx Restart         : 00    none  "
		dc.b	0
		even

HowToContactMsg_Txt
		dc.b	"How to contact Musicline!!!!          ",10,10
		dc.b	"You can contact us by:                ",10,10
		dc.b	" E-Mail : Mline@kuai.se               ",10
		dc.b	"    WWW : http://www.kuai.se/~mline   ",10,10
		dc.b	"Calling our BBS:                      ",10,10
		dc.b	" Groove Central at +46-8-6369089.     ",10,10
		dc.b	"Writing to:                           ",10,10
		dc.b	" Christian Cyréus                     ",10
		dc.b	" Fregattvägen 9                       ",10
		dc.b	" 181 37 Lidingö                       ",10
		dc.b	" Sweden                               ",10,10
		dc.b	"Phone : 070-5233146 (John Carehag)    ",10,10
		dc.b	"You can contact us for questions,     ",10
		dc.b	"ideas, bug reports, registrations etc.",10
		dc.b	0

	      IFEQ	CON_DemoVersion
AboutMsg_Txt	dc.b	"Musicline Editor V"
		Version
		dc.b	"    A quality product from",10
		dc.b	"                          -=)>  Musicline  <(=-",10,10
		dc.b	"Programming by:      Conny Cyréus",10
		dc.b	"                     Christian Cyréus",10,10
		dc.b	"Ideas & Design by:   Christian Cyréus",10	
		dc.b	"                     Conny Cyréus",10
		dc.b	"                     John Carehag",10
		dc.b	"                     Jimmy Fredriksson",10,10
		dc.b	"This version is licensed to: "
		NAME
		dc.b	10
		dc.b	"         With the ID number: "
		ID 1
		dc.b	10,10
		NAME
		dc.b	" is the only person which is allowed to",10
		dc.b	"use this version of Musicline Editor.",10,10
		dc.b	"Anyone caught using a version which not",10
		dc.b	"is registered to him/her will be prosecuted.",10,10
		dc.b	"                            © 1995 by Musicline",10
		dc.b	0
	      ELSE
AboutMsg_Txt	dc.b	"Musicline Editor V"
		Version
		dc.b	"    A quality product from",10
		dc.b	"                          -=)>  Musicline  <(=-",10,10
		dc.b	"Programming by:      Conny Cyréus",10
		dc.b	"                     Christian Cyréus",10,10
		dc.b	"Ideas & Design by:   Christian Cyréus",10	
		dc.b	"                     Conny Cyréus",10
		dc.b	"                     John Carehag",10
		dc.b	"                     Jimmy Fredriksson",10,10
		dc.b	"This is the Shareware version of",10
		dc.b	"Musicline Editor which is allowed to be",10
		dc.b	"copied for free by anyone.",10
		dc.b	"You are allowed to use this version for a",10
		dc.b	"period of 30 days then you´ll have to register",10
		dc.b	"or remove the program from your system.",10
		dc.b	"This program may not be sold by anyone",10
		dc.b	"else than the people in Musicline.",10
		dc.b	"                            © 1995 by Musicline",10
		dc.b	0
	      ENDC

HowToRegMeMsg_Txt
		dc.b	"How to become a registered Musicline Editor user !!!!    ",10,10

		dc.b	"Select 'Register...' in the Project menu to fill in      ",10
		dc.b	"the registration form, then save the form to a DISK.     ",10
		dc.b	"Send the disk with the file ´Mline.Reg´ along with bills,",10
		dc.b	"NO CHEQUES. You can also send the registration file      ",10
		dc.b	"as E-Mail or upload it as a private message to the SysOp ",10
		dc.b	"on Musicline BBS. If you don't send the registration file",10
		dc.b	"together with the money, don´t forget to send your name  ",10
		dc.b	"and birth date with the money.                           ",10,10

		dc.b	"Select 'How To Contact Us...' in the Project menu        ",10
		dc.b	"to get the address and BBS number.                       ",10,10

		dc.b	"(Om du är svensk så är PostGiro att föredra. Skriv namn, ",10
		dc.b	"födelsedatum och Musicline på blanketten och glöm ej att ",10
		dc.b	"skicka disken!)                                          ",10
		dc.b	"The PG number are only for Swedes!                       ",10
		dc.b	"Christian:                                               ",10
		dc.b	"PGnr: 600 40 82-1                                        ",10,10
		dc.b	0

PricesMsg_Txt	dc.b	"Registration fees:    Sweden: 160 SKR",10
		dc.b	"                      Norway: 160 NOK",10
		dc.b	"                     Denmark: 140 DKK",10
		dc.b	"                     Finland: 110 FMK",10
		dc.b	"                        U.K.:  16 UK£",10
		dc.b	"                      U.S.A.:  25 US$",10
		dc.b	"                     Germany:  35 DEM",10
		dc.b	"                      France: 130 FFR",10,10
		dc.b	"If you don´t live in one of the above",10
		dc.b	"mentioned countries, please send the ",10
		dc.b	"money in either one of the currencies",10
		dc.b	"(preferably in SKR).                 ",0

*****************************************************************************
* Get and free visualinfo                        * Conny Cyréus - Musicline *
*****************************************************************************

_VisualInfo	rs.l	1

GetVisualInfo	move.l	_Screen(a5),a0
		lea	TagEnd,a1
		CallGadTools GetVisualInfoA
		move.l	d0,_VisualInfo(a5)
		move.l	#FreeVisualInfo,_FreeVisualInfo(a5)
		rts

FreeVisualInfo	move.l	_VisualInfo(a5),a0
		CallGadTools FreeVisualInfo
		rts

*****************************************************************************
* Change PackSamples State - On/Off          * Christian Cyréus - Musicline *
*****************************************************************************

PackSamples	not.b	_PackSamples(a5)
		rts

*****************************************************************************
* Check Keyboard - Europe/USA                * Christian Cyréus - Musicline *
*****************************************************************************

USAKeyboard	move.l	#RawKeyNotesUsa,_KeybListPtr(a5)
		move	#40,_KeybListSize1(a5)
		move	#31,_KeybListSize2(a5)
		rts

EuropeKeyboard	move.l	#RawKeyNotesEuro,_KeybListPtr(a5)
		move	#42,_KeybListSize1(a5)
		move	#33,_KeybListSize2(a5)
		rts

*****************************************************************************
* PlayPosition - True/Fast                       * Conny Cyréus - Musicline *
*****************************************************************************

PlayPosTrue	clr.b	_PlayPosMode(a5)
		rts

PlayPosFast	move.b	#1,_PlayPosMode(a5)
		rts

*****************************************************************************
* Change Window		                     * Christian Cyréus - Musicline *
*****************************************************************************

Sequencer	move.l	_Window1(a5),d7
		move.l	d7,a0
		CallIntuition WindowToFront
		move.l	d7,a0
		CallLib ActivateWindow
		rts

InstEditor	move.l	_Window2(a5),d7
		move.l	d7,a0
		CallIntuition WindowToFront
		move.l	d7,a0
		CallLib ActivateWindow
		rts

*****************************************************************************
* Create layout and free menus                   * Conny Cyréus - Musicline *
*****************************************************************************

_Menus1		rs.l	1
_Menus2		rs.l	1

CreateMenus	lea	MenuDefs1,a0
		lea	TagEnd,a1
		CallGadTools CreateMenusA
		move.l	d0,_Menus1(a5)
		beq	Exit
		move.l	#FreeMenus1,_FreeMenus1(a5)
		lea	MenuDefs2,a0
		lea	TagEnd,a1
		CallGadTools CreateMenusA
		move.l	d0,_Menus2(a5)
		beq	Exit
		move.l	#FreeMenus2,_FreeMenus2(a5)

LayoutMenus	move.l	_Menus1(a5),a0
		move.l	_VisualInfo(a5),a1
		lea	MenuTagList,a2
		CallGadTools LayoutMenusA
		tst.l	d0
		beq	Exit
		move.l	_Menus2(a5),a0
		move.l	_VisualInfo(a5),a1
		lea	MenuTagList,a2
		CallGadTools LayoutMenusA
		tst.l	d0
		beq	Exit
		rts

FreeMenus1	move.l	_Menus1(a5),a0
		CallGadTools FreeMenus
		rts

FreeMenus2	move.l	_Menus2(a5),a0
		CallGadTools FreeMenus
		rts

MenuTagList	dc.l	GTMN_NewLookMenus
		dc.l	TRUE
		dc.l	TAG_END

MenuDefs1	dc.b	NM_TITLE,0	; type
		dc.l	Project_Txt	; label
		dc.l	0		; commkey
		dc.w	0		; flags
		dc.l	0		; mutalexclude
		dc.l	0		; userdata

		dc.b	NM_ITEM,0
		dc.l	EraseR_Txt
		dc.l	EraseR_Txt
		dc.w	0
		dc.l	0
		dc.l	EraseProject

		dc.b	NM_ITEM,0
		dc.l	LoadR_Txt
		dc.l	LoadR_Txt
		dc.w	0
		dc.l	0
		dc.l	LoadModule

		dc.b	NM_ITEM,0
		dc.l	SaveR_Txt
		dc.l	SaveR_Txt
		dc.w	0
		dc.l	0
		dc.l	SaveMod

		dc.b	NM_ITEM,0
		dc.l	SaveAsR_Txt
		dc.l	SaveAsR_Txt+5
		dc.w	0
		dc.l	0
		dc.l	SaveModule

		dc.b	NM_ITEM,0
		dc.l	DeleteR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	DeleteFile

		dc.b	NM_ITEM,0
		dc.l	Help_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	PartCommand_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	OpenWindow7

		dc.b	NM_SUB,0
		dc.l	HotStruct_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	OpenWindow5

		dc.b	NM_ITEM,0
		dc.l	HowToContact_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	HowToContactReq

		dc.b	NM_ITEM,0
		dc.l	HowToRegMe_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	HowToRegMeReq

		dc.b	NM_ITEM,0
		dc.l	Register_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	OpenWindow8

		dc.b	NM_ITEM,0
		dc.l	About_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	AboutReq

		dc.b	NM_ITEM,0
		dc.l	QuitR_Txt
		dc.l	QuitR_Txt
		dc.w	0
		dc.l	0
		dc.l	Quit

		dc.b	NM_TITLE,0	; type
		dc.l	Window_Txt	; label
		dc.l	0		; commkey
		dc.w	0		; flags
		dc.l	0		; mutalexclude
		dc.l	0		; userdata

		dc.b	NM_ITEM,0
		dc.l	InstEditor_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	InstEditor

		dc.b	NM_TITLE,0
		dc.l	Edit_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_ITEM,0
		dc.l	Swap_Txt
		dc.l	EdCom_Txt
		dc.w	0
		dc.l	0
		dc.l	Menu1Swap

		dc.b	NM_ITEM,0
		dc.l	Cut_Txt
		dc.l	EdCom_Txt+1
		dc.w	0
		dc.l	0
		dc.l	Menu1Cut

		dc.b	NM_ITEM,0
		dc.l	Copy_Txt
		dc.l	EdCom_Txt+2
		dc.w	0
		dc.l	0
		dc.l	Menu1Copy

		dc.b	NM_ITEM,0
		dc.l	Paste_Txt
		dc.l	EdCom_Txt+3
		dc.w	0
		dc.l	0
		dc.l	Menu1Paste

		dc.b	NM_ITEM,0
		dc.l	Mark_Txt
		dc.l	EdCom_Txt+4
		dc.w	0
		dc.l	0
		dc.l	Menu1Mark

		dc.b	NM_ITEM,0
		dc.l	Add_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	Tune_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	AddTune

		dc.b	NM_ITEM,0
		dc.l	Clear_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	TuneR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	ClrTune

		dc.b	NM_SUB,0
		dc.l	AllPartsR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	ClrParts

		dc.b	NM_ITEM,0
		dc.l	Remove_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	TuneR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemoveTune

		dc.b	NM_SUB,0
		dc.l	AllTunesR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemoveTunes

		dc.b	NM_SUB,0
		dc.l	RemUnusedParts_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemUnusedParts

		dc.b	NM_TITLE,0
		dc.l	Transpose_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_ITEM,0
		dc.l	Inst_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	NoteUp_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	TransPartNoteUp

		dc.b	NM_SUB,0
		dc.l	NoteDown_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	TransPartNoteDown

		dc.b	NM_SUB,0
		dc.l	OctaveUp_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	TransPartOctaUp

		dc.b	NM_SUB,0
		dc.l	OctaveDown_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	TransPartOctaDown

		dc.b	NM_ITEM,0
		dc.l	AllInsts_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	NoteUp_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	TransAllPartNoteUp

		dc.b	NM_SUB,0
		dc.l	NoteDown_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	TransAllPartNoteDown

		dc.b	NM_SUB,0
		dc.l	OctaveUp_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	TransAllPartOctaUp

		dc.b	NM_SUB,0
		dc.l	OctaveDown_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	TransAllPartOctaDown

		dc.b	NM_TITLE,0
		dc.l	Options_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_ITEM,0
		dc.l	ToggleFilter_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	ToggleFilter

		dc.b	NM_ITEM,0
		dc.l	PackSamples_Txt
		dc.l	0
PackSamplesData	dc.w	CHECKIT!MENUTOGGLE
		dc.l	0
		dc.l	PackSamples

		dc.b	NM_ITEM,0
		dc.l	Keyboard_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	Europe_Txt
		dc.l	0
EuroData	dc.w	CHECKIT
		dc.l	2
		dc.l	EuropeKeyboard

		dc.b	NM_SUB,0
		dc.l	USA_Txt
		dc.l	0
USAData		dc.w	CHECKIT
		dc.l	1
		dc.l	USAKeyboard

		dc.b	NM_ITEM,0
		dc.l	PlayPos_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	True_Txt
		dc.l	0
TrueMode	dc.w	CHECKIT
		dc.l	2
		dc.l	PlayPosTrue

		dc.b	NM_SUB,0
		dc.l	Fast_Txt
		dc.l	0
FastMode	dc.w	CHECKIT
		dc.l	1
		dc.l	PlayPosFast

		dc.b	NM_ITEM,0
		dc.l	Config_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	Save_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	SaveConfig

		dc.b	NM_SUB,0
		dc.l	Default_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	SetDefaultCfg

		dc.b	NM_SUB,0
		dc.l	LastSaved_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	SetSavedConfig

		dc.b	NM_ITEM,0
		dc.l	ScreenMode_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	ScreenModeReq

		dc.b	NM_END,0
		dc.l	0
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

MenuDefs2	dc.b	NM_TITLE,0
		dc.l	Project_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_ITEM,0
		dc.l	Load_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	InstrsR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	LoadExternInst

		dc.b	NM_SUB,0
		dc.l	SampleR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	LoadSample

		dc.b	NM_SUB,0
		dc.l	WaveR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	LoadWave

		dc.b	NM_ITEM,0
		dc.l	Save_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	InstR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	SaveExternInst

		dc.b	NM_SUB,0
		dc.l	WaveRIFF_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	SaveWsIff

		dc.b	NM_SUB,0
		dc.l	WaveRRAW_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	SaveWsRaw

		dc.b	NM_ITEM,0
		dc.l	Help_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	ArpCommand_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	FxHelp2Req

		dc.b	NM_SUB,0
		dc.l	HotStruct_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	OpenWindow5

		dc.b	NM_ITEM,0
		dc.l	QuitR_Txt
		dc.l	QuitR_Txt
		dc.w	0
		dc.l	0
		dc.l	Quit

		dc.b	NM_TITLE,0	; type
		dc.l	Window_Txt	; label
		dc.l	0		; commkey
		dc.w	0		; flags
		dc.l	0		; mutalexclude
		dc.l	0		; userdata

		dc.b	NM_ITEM,0
		dc.l	Sequencer_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	Sequencer

		dc.b	NM_TITLE,0
		dc.l	Edit_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_ITEM,0
		dc.l	Swap_Txt
		dc.l	EdCom_Txt
		dc.w	0
		dc.l	0
		dc.l	Menu2Swap

		dc.b	NM_ITEM,0
		dc.l	Cut_Txt
		dc.l	EdCom_Txt+1
		dc.w	0
		dc.l	0
		dc.l	Menu2Cut

		dc.b	NM_ITEM,0
		dc.l	Copy_Txt
		dc.l	EdCom_Txt+2
		dc.w	0
		dc.l	0
		dc.l	Menu2Copy

		dc.b	NM_ITEM,0
		dc.l	Paste_Txt
		dc.l	EdCom_Txt+3
		dc.w	0
		dc.l	0
		dc.l	Menu2Paste

		dc.b	NM_ITEM,0
		dc.l	Mark_Txt
		dc.l	EdCom_Txt+4
		dc.w	0
		dc.l	0
		dc.l	Menu2Mark

		dc.b	NM_ITEM,0
		dc.l	Add_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	Inst_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	AddInst

		dc.b	NM_ITEM,0
		dc.l	Remove_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

		dc.b	NM_SUB,0
		dc.l	InstR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemoveInst

		dc.b	NM_SUB,0
		dc.l	WaveSampR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemoveWs

		dc.b	NM_SUB,0
		dc.l	InstsR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemUnusedInsts

		dc.b	NM_SUB,0
		dc.l	WavesR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemoveUnWs

		dc.b	NM_SUB,0
		dc.l	InstsWavesR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemoveUnInstsWs

		dc.b	NM_SUB,0
		dc.l	EqWsR_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	RemoveEqWs

		dc.b	NM_ITEM,0
		dc.l	MakeAnim_Txt
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	MakeAnim

		dc.b	NM_END,0
		dc.l	0
		dc.l	0
		dc.w	0
		dc.l	0
		dc.l	0

USA_Txt			dc.b	"USA",0
Europe_Txt		dc.b	"Europe",0
Project_Txt		dc.b	"Project",0
Options_Txt		dc.b	"Options",0
EraseR_Txt		dc.b	"Erase...",0
LoadR_Txt		dc.b	"Load...",0
Load_Txt		dc.b	"Load",0
SaveR_Txt		dc.b	"Save...",0
Save_Txt		dc.b	"Save",0
SaveAsR_Txt		dc.b	"Save As...",0
DeleteR_Txt		dc.b	"Delete...",0
Default_Txt		dc.b	"Default",0
LastSaved_Txt		dc.b	"Last Saved",0
HowToContact_Txt	dc.b	"How to contact us...",0
HowToRegMe_Txt		dc.b	"How to register me...",0
Register_Txt		dc.b	"Register...",0
Help_Txt		dc.b	"Help",0
PartCommand_Txt		dc.b	"Part Commands... HELP",0
ArpCommand_Txt		dc.b	"Arpeggio Commands... HELP",0
HotStruct_Txt		dc.b	"Hotkeys & Structures...",0
About_Txt		dc.b	"About...",0
QuitR_Txt		dc.b	"Quit...",0
InstR_Txt		dc.b	"Instrument...",0
WaveSampR_Txt		dc.b	"Wavesample...",0
InstrsR_Txt		dc.b	"Instrument(s)...",0
SampleR_Txt		dc.b	"Sample(s)...",0
WaveR_Txt		dc.b	"Wave(s)...",0
InstsR_Txt		dc.b	"Unused Instruments...",0
WavesR_Txt		dc.b	"Unused Wavesamples...",0
InstsWavesR_Txt		dc.b	"Unused Instruments & Wavesamples...",0
EqWsR_Txt		dc.b	"Equal Wavesamples...",0
WaveRRAW_Txt		dc.b	"RAW Wavesample...",0
WaveRIFF_Txt		dc.b	"IFF Wavesample...",0
MakeAnim_Txt		dc.b	"MakeAnim...",0
MakeInstAnim_Txt	dc.b	"MakeInstAnim",0
MakeTuneSmpl_Txt	dc.b	"MakeTuneSmpl",0
VU_Txt			dc.b	"VU",0
Edit_Txt		dc.b	"Edit",0
Mode_Txt		dc.b	"Mode",0
Swap_Txt		dc.b	"Swap",0
Cut_Txt			dc.b	"Cut",0
Copy_Txt		dc.b	"Copy",0
Paste_Txt		dc.b	"Paste",0
Mark_Txt		dc.b	"Mark",0
Clear_Txt		dc.b	"Clear",0
TuneR_Txt		dc.b	"Tune...",0
AllTunesR_Txt		dc.b	"All Tunes...",0
AllPartsR_Txt		dc.b	"All Parts...",0
AllInsts_Txt		dc.b	"All Instruments",0
RemUnusedParts_Txt	dc.b	"Unused Parts...",0
NoteUp_Txt		dc.b	"Note Up",0
NoteDown_Txt		dc.b	"Note Down",0
OctaveUp_Txt		dc.b	"Octave Up",0
OctaveDown_Txt		dc.b	"Octave Down",0
ToggleFilter_Txt	dc.b	"Toggle Filter",0
ScreenMode_Txt		dc.b	"ScreenMode...",0
Config_Txt		dc.b	"Configuration",0
EdCom_Txt		dc.b	"ZXCVB",0
			even

*****************************************************************************
* Set and clear menustrip                        * Conny Cyréus - Musicline *
*****************************************************************************

SetMenuStrip	move.l	_Window1(a5),a0
		move.l	_Menus1(a5),a1
		CallIntuition SetMenuStrip
		tst.l	d0
		beq	Exit
		move.l	#ClearMenuStrip1,_ClearMenuStrip1(a5)
		move.l	_Window2(a5),a0
		move.l	_Menus2(a5),a1
		CallIntuition SetMenuStrip
		tst.l	d0
		beq	Exit
		move.l	#ClearMenuStrip2,_ClearMenuStrip2(a5)
		rts

ClearMenuStrip1	move.l	_Window1(a5),a0
		CallIntuition ClearMenuStrip
		rts

ClearMenuStrip2	move.l	_Window2(a5),a0
		CallIntuition ClearMenuStrip
		rts

*****************************************************************************
* Allocate and free screenmode requester         * Conny Cyréus - Musicline *
*****************************************************************************

_AslSMReq	rs.l	1

AllocAslSMReq	move.l	#ASL_ScreenModeRequest,d0
		move.l	#AslTagListSM,a0
		CallAsl AllocAslRequest
		move.l	d0,_AslSMReq(a5)
		beq	Exit
		move.l	#FreeAslSMReq,_FreeAslSMReq(a5)
		rts

ScreenModeReq	bsr	InputOff
		move.l	Scr_DisplayID,Asl_DisplayID
		move.l	Scr_DisplayWidth,Asl_DisplayWidth
		move.l	Scr_DisplayHeight,Asl_DisplayHeight
		move.l	Scr_OverscanType,Asl_OverscanType
		move.l	Scr_AutoScroll,Asl_AutoScroll
		move.l	_AslSMReq(a5),a0
		lea	AslTagListSM,a1
		move.l	_Screen(a5),4(a1)
		CallAsl AslRequest
		tst.l	d0
		bne.b	.ok
		bsr	InputOn
		rts
.ok		bsr	InputOn

		move.l	_AslSMReq(a5),a0
		move.l	sm_DisplayID(a0),Scr_DisplayID
		move.l	sm_DisplayWidth(a0),Scr_DisplayWidth
		move.l	sm_DisplayHeight(a0),Scr_DisplayHeight
		move	sm_OverscanType(a0),Scr_OverscanType+2
		move	sm_AutoScroll(a0),Scr_AutoScroll+2
		tst.l	_Window7(a5)
		sne.b	_OpenWin7(a5)
		tst.l	_Window6(a5)
		sne.b	_OpenWin6(a5)
		tst.l	_Window5(a5)
		sne.b	_OpenWin5(a5)

		move.l	_InitialSP(a5),sp
		tst.l	_Message(a5)
		beq.b	.quiet
		move.l	_Message(a5),a1
		tst.l	_GadToolsBase(a5)
		beq.b	.sysreplymsg
		CallGadTools GT_ReplyIMsg
		bra.b	.quiet
.sysreplymsg	CallSys ReplyMsg
.quiet		bsr.b	CloseMline
		bsr	InitMline
		bra	OpenMline

CloseMline	jsr	Stoppa
		jsr	DoHexReturn
		jsr	XTunePartArpg
		jsr	ClrTuneScrPos
		jsr	ClrInstScrPos
		jsr	ClrSmplScrPos
		bsr	FreeAslFileReqLP
		bsr	FreeAslFileReqLI
		bsr	FreeAslFileReqLS
		bsr	FreeAslFileReqLW
		bsr	FreeAslFileReqSP
		bsr	FreeAslFileReqSI
		bsr	FreeAslFileReqSS
		bsr	FreeAslFileReqSW
		bsr	FreeAslReg
		lea	_ClearMenuStrip2(a5),a0
		bsr	DoIt
		lea	_ClearMenuStrip1(a5),a0
		bsr	DoIt
		lea	_FreeFxHelp2Req(a5),a0
		bsr	DoIt
		lea	_CloseWindow7(a5),a0
		bsr	DoIt
		lea	_CloseWindow6(a5),a0
		bsr	DoIt
		lea	_CloseWindow5(a5),a0
		bsr	DoIt
		lea	_CloseWindow2(a5),a0
		bsr	DoIt
		lea	_CloseWindow1(a5),a0
		bsr	DoIt
		lea	_CloseScreen(a5),a0
		bsr	DoIt
		lea	_FreeGadgets(a5),a0
		bsr	DoIt
		lea	_FreeMenus2(a5),a0
		bsr	DoIt
		lea	_FreeMenus1(a5),a0
		bsr	DoIt
		lea	_FreeVisualInfo(a5),a0
		bsr.b	DoIt
		lea	_FreeVisualRast(a5),a0
		bsr.b	DoIt
		lea	_FreeSndCBuf(a5),a0
		bsr.b	DoIt
		lea	_FreeSndFBuf(a5),a0
		bsr.b	DoIt
		clr.l	grvplus
		clr.l	arptable
		clr	_WsButtons(a5)
		clr	_WsVsButtons(a5)
		clr	_TuneNum(a5)
		clr	_PartNum(a5)
		clr	_InstNum(a5)
		clr	_WsNum(a5)
		clr	_Voice(a5)
		clr.b	_TunePart(a5)
		clr.b	_Arpg(a5)
		lea	TuneEditorDefs,a4
		clr	MinYPos(a4)
		clr.l	CursorXPos(a4)
		lea	ArpgEditorDefs,a4
		clr	MinYPos(a4)
		clr.l	CursorXPos(a4)
		lea	PartEditorDefs,a4
		clr	MinYPos(a4)
		clr.l	CursorXPos(a4)
		clr	GTSC_ScrPos+2
		move	#1,GTCB_Check+2
		rts

DoIt		move.l	(a0),d0
		beq.b	.x
		clr.l	(a0)
		move.l	d0,a0
		jmp	(a0)
.x		rts

InitMline	lea	DefaultConfig+16,a0
		move.l	(a0)+,Window1Defs
		move.l	(a0)+,Window2Defs
		move.l	(a0)+,Window3Defs
		move.l	(a0)+,Window4Defs
		move.l	(a0)+,Window5Defs
		move.l	(a0)+,Window6Defs
		move.l	(a0)+,Window7Defs
		move	_VUOnOff(a5),GTCB_VuCheck+2
.packsamples	move	#CHECKED,d0
		or	d0,PackSamplesData
		tst.b	_PackSamples(a5)		0=No, 1=Yes
		bne.b	.keyboard
		not	d0
		and	d0,PackSamplesData
.keyboard	move	#CHECKED,d0
		or	d0,USAData
		not	d0
		and	d0,EuroData
		cmp.l	#RawKeyNotesUsa,_KeybListPtr(a5)
		beq.b	.playposmode
		and	d0,USAData
		not	d0
		or	d0,EuroData
.playposmode	move	#CHECKED,d0
		or	d0,FastMode
		not	d0
		and	d0,TrueMode
		tst.b	_PlayPosMode(a5)		0=True, 1=Fast
		bne.b	.scrollpart
		and	d0,FastMode
		not	d0
		or	d0,TrueMode
.scrollpart	move.b	_ScrollPart(a5),GTCY_ScrPart+3
		move.b	_FollowChannel(a5),GTCY_FollowChn+3
		move.b	_EditMode(a5),GTCY_EditMode+3
		move.b	_ArpEdMode(a5),GTCY_ArpEdMode+3
		clr.b	_OpenWin7(a5)
		clr.b	_OpenWin6(a5)
		clr.b	_OpenWin5(a5)
		rts

OpenMline	bset	#1,$bfe001		; turn off filter
		bsr	OpenScreen
		bsr	GetVisualInfo
		bsr	CreateMenus
		jsr	CreateGadgets
		bsr	AllocAslFileReq
		bsr	OpenWindow2
		bsr	OpenWindow1
		bsr	SetMenuStrip
		jsr	DrawBoxes
		jsr	DrawLines
		jsr	DrawImages
		jsr	AddGadgetLists
		jsr	SetPens
		jsr	PrintIText1
		jsr	PrintIText2
		jsr	PrintIText6
		jsr	InitSomeData
		jsr	TuneSelec
		jsr	InstSelec
		jsr	GetArpgPtr
		jsr	GetPartPtr
		jsr	SetChannel
		lea	PartEditorDefs,a4
		move.l	_RastPort1(a5),d6
		move.l	_GfxBase(a5),a6
		jsr	PrintPart
		jsr	PrintPartNum
		bsr	CreateGad6
		bsr	AllocAslReg
		bsr	CreateGad8
		tst.b	_OpenWin7(a5)
		beq.b	.win6
		jsr	OpenWindow7
.win6		tst.b	_OpenWin6(a5)
		beq.b	.win5
		bsr	OpenWindow6
.win5		tst.b	_OpenWin5(a5)
		beq.b	.active
		jsr	OpenWindow5
.active		move.l	_Window1(a5),a0
		CallIntuition ActivateWindow
		jmp	Wait

FreeAslSMReq	move.l	_AslSMReq(a5),a0
		CallAsl FreeFileRequest
		rts

AslTagListSM		dc.l	ASLSM_Screen
			dc.l	0
			dc.l	ASLSM_InitialDisplayID
Asl_DisplayID		dc.l	HIRES_KEY
			dc.l	ASLSM_InitialDisplayWidth
Asl_DisplayWidth	dc.l	640
			dc.l	ASLSM_InitialDisplayHeight
Asl_DisplayHeight	dc.l	256
			dc.l	ASLSM_InitialOverscanType
Asl_OverscanType	dc.l	OSCAN_TEXT
			dc.l	ASLSM_InitialAutoScroll
Asl_AutoScroll		dc.l	TRUE
			dc.l	ASLSM_MinWidth
			dc.l	640
			dc.l	ASLSM_MinHeight
			dc.l	256
			dc.l	ASLSM_DoWidth
			dc.l	TRUE
			dc.l	ASLSM_DoHeight
			dc.l	TRUE
			dc.l	ASLSM_DoOverscanType
			dc.l	TRUE
			dc.l	ASLSM_DoAutoScroll
			dc.l	TRUE
			dc.l	TAG_END

*****************************************************************************
* Allocate and free file requesters              * Conny Cyréus - Musicline *
*****************************************************************************

_AslFileReqLP		rs.l	1
_AslFileReqLI		rs.l	1
_AslFileReqLS		rs.l	1
_AslFileReqLW		rs.l	1
_AslFileReqSaveMod	rs.l	1
_AslFileReqSP		rs.l	1
_AslFileReqSI		rs.l	1
_AslFileReqSS		rs.l	1
_AslFileReqSW		rs.l	1

AllocAslFileReq	move.l	#ASL_FileRequest,d0		Load Project
		move.l	#AslTagListLP,a0
		lea	_LoadProjectPath(a5),a2
		move.l	a2,4(a0)
		CallAsl AllocAslRequest
		move.l	d0,_AslFileReqLP(a5)
		move.l	d0,_AslFileReqSaveMod(a5)
		beq	Exit
		move.l	#FreeAslFileReqLP,_FreeAslFileReqLP(a5)

		move.l	#ASL_FileRequest,d0		Load Instrument
		move.l	#AslTagListLI,a0
		lea	_LoadInstrumentPath(a5),a2
		move.l	a2,4(a0)
		CallLib AllocAslRequest
		move.l	d0,_AslFileReqLI(a5)
		beq	Exit
		move.l	#FreeAslFileReqLI,_FreeAslFileReqLI(a5)

		move.l	#ASL_FileRequest,d0		Load Sample
		move.l	#AslTagListLS,a0
		lea	_LoadSamplePath(a5),a2
		move.l	a2,4(a0)
		CallLib AllocAslRequest
		move.l	d0,_AslFileReqLS(a5)
		beq	Exit
		move.l	#FreeAslFileReqLS,_FreeAslFileReqLS(a5)

		move.l	#ASL_FileRequest,d0		Load Wave
		move.l	#AslTagListLW,a0
		lea	_LoadWavePath(a5),a2
		move.l	a2,4(a0)
		CallLib AllocAslRequest
		move.l	d0,_AslFileReqLW(a5)
		beq	Exit
		move.l	#FreeAslFileReqLW,_FreeAslFileReqLW(a5)

		move.l	#ASL_FileRequest,d0		Save Project
		move.l	#AslTagListSP,a0
		lea	_SaveProjectPath(a5),a2
		move.l	a2,4(a0)
		CallLib AllocAslRequest
		move.l	d0,_AslFileReqSP(a5)
		beq	Exit
		move.l	#FreeAslFileReqSP,_FreeAslFileReqSP(a5)

		move.l	#ASL_FileRequest,d0		Save Instrument
		move.l	#AslTagListSI,a0
		lea	_SaveInstrumentPath(a5),a2
		move.l	a2,4(a0)
		CallLib AllocAslRequest
		move.l	d0,_AslFileReqSI(a5)
		beq	Exit
		move.l	#FreeAslFileReqSI,_FreeAslFileReqSI(a5)

		move.l	#ASL_FileRequest,d0		Save Sample
		move.l	#AslTagListSS,a0
		lea	_SaveSamplePath(a5),a2
		move.l	a2,4(a0)
		CallLib AllocAslRequest
		move.l	d0,_AslFileReqSS(a5)
		beq	Exit
		move.l	#FreeAslFileReqSS,_FreeAslFileReqSS(a5)

		move.l	#ASL_FileRequest,d0		Save Wave
		move.l	#AslTagListSW,a0
		lea	_SaveWavePath(a5),a2
		move.l	a2,4(a0)
		CallLib AllocAslRequest
		move.l	d0,_AslFileReqSW(a5)
		beq	Exit
		move.l	#FreeAslFileReqSW,_FreeAslFileReqSW(a5)
		rts

FreeAslFileReqLP
		move.l	_AslFileReqLP(a5),a0
		CallAsl FreeFileRequest
		rts
FreeAslFileReqLI
		move.l	_AslFileReqLI(a5),a0
		CallAsl FreeFileRequest
		rts
FreeAslFileReqLS
		move.l	_AslFileReqLS(a5),a0
		CallAsl FreeFileRequest
		rts

FreeAslFileReqLW
		move.l	_AslFileReqLW(a5),a0
		CallAsl FreeFileRequest
		rts

AslTagListLP	dc.l	ASLFR_InitialDrawer
		dc.l	0
		dc.l	TAG_END

AslTagListLI	dc.l	ASLFR_InitialDrawer
		dc.l	0
		dc.l	TAG_END

AslTagListLS	dc.l	ASLFR_InitialDrawer
		dc.l	0
		dc.l	TAG_END

AslTagListLW	dc.l	ASLFR_InitialDrawer
		dc.l	0
		dc.l	TAG_END

FreeAslFileReqSP
		move.l	_AslFileReqSP(a5),a0
		CallAsl FreeFileRequest
		rts
FreeAslFileReqSI
		move.l	_AslFileReqSI(a5),a0
		CallAsl FreeFileRequest
		rts
FreeAslFileReqSS
		move.l	_AslFileReqSS(a5),a0
		CallAsl FreeFileRequest
		rts

FreeAslFileReqSW
		move.l	_AslFileReqSW(a5),a0
		CallAsl FreeFileRequest
		rts

AslTagListSP	dc.l	ASLFR_InitialDrawer
		dc.l	0
		dc.l	TAG_END

AslTagListSI	dc.l	ASLFR_InitialDrawer
		dc.l	0
		dc.l	TAG_END

AslTagListSS	dc.l	ASLFR_InitialDrawer
		dc.l	0
		dc.l	TAG_END

AslTagListSW	dc.l	ASLFR_InitialDrawer
		dc.l	0
		dc.l	TAG_END

*****************************************************************************
* Filerequesters                                 * Conny Cyréus - Musicline *
*****************************************************************************

_Lock		rs.l	1
_FileHandle	rs.l	1
_FileNamePtr	rs.l	1
_FIBPtr		rs.l	1
_TuneNumPtr	rs.l	1
_InstNumPtr	rs.l	1
_SmplNumPtr	rs.l	1
_VERSION	rs.l	1
_LoadError	rs.b	1
_InstInit	rs.b	1
_ChannelSizes	rs.l	8
TuneBit		=	0
PartBit		=	1
ArpgBit		=	2
InstBit		=	3
SmplBit		=	4

LoadModule	move	#$0100,_BlockPlay(a5)
		clr.b	_LoadError(a5)
		bsr	InputOff
		move.l	_Window1(a5),LFRWindowPtr
		move.l	#LoadModule_Txt,LFRTitleText
		move.l	#FRF_DOPATTERNS,LFRFlags1
		move.l	#ASLFR_InitialPattern,LFRIniPat
		move.l	_AslFileReqLP(a5),a0
		lea	LFileReqTags,a1
		CallAsl AslRequest
		tst.l	d0
		beq	LoadError1

		move.l	_AslFileReqLP(a5),a4
		lea	_CopyBuffer(a5),a3
		clr.b	_CopyOf_(a5)
		move.l	fr_Drawer(a4),a0
		move	#512,d5
		tst.b	(a0)
		beq.b	.nodrawer
.movedrawer	move.b	(a0)+,(a3)+
		dbeq	d5,.movedrawer
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer
		move.b	#"/",(a3)+
.nodrawer	move.l	a3,_FileNamePtr(a5)
		move.l	fr_File(a4),a0
.movefile	move.b	(a0)+,(a3)+
		dbeq	d5,.movefile

		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#ACCESS_READ,d2
		CallDOS Lock
		move.l	d0,_Lock(a5)
		beq	LoadError1
		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#MODE_OLDFILE,d2
		CallLib Open
		move.l	d0,_FileHandle(a5)
		beq	LoadError3

		lea	_String(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		moveq	#4,d3
		CallDOS Read
		tst.l	d0
		ble	LoadError2
		move.l	_String(a5),_VERSION(a5)

		cmp.l	#"PP20",_VERSION(a5)
		bne.b	.checkmline
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#PPModules_Txt,12(a1)
		move.l	#Ok_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		bra	LoadError2

.checkmline	cmp.l	#"MLED",_VERSION(a5)
		bne	CheckProTracker

		lea	_String(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		moveq	#4,d3
		CallDOS Read
		tst.l	d0
		ble	LoadError2

		cmp.l	#"MODL",_String(a5)
		bne	LoadError2

		lea	_String(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		moveq	#4,d3
		CallDOS Read
		tst.l	d0
		ble	LoadError2

		cmp.l	#"VERS",_String(a5)
		beq.b	.version

		lea	LastSaved,a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		move.l	_String(a5),d3
		move	d3,d4
		lsr	#2,d4
		move	d4,LastSavedNum
		CallDOS Read
		tst.l	d0
		ble	LoadError2

		lea	_String(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		moveq	#4,d3
		CallDOS Read
		tst.l	d0
		ble	LoadError2

		cmp.l	#"VERS",_String(a5)
		bne	LoadError2

.version	lea	_String(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		moveq	#4,d3
		CallDOS Read
		tst.l	d0
		ble	LoadError2

		lea	_String+8(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		move.l	_String(a5),d3
		CallDOS Read
		tst.l	d0
		ble	LoadError2

.load		move	#$0101,_BlockPlay(a5)
		jsr	Stoppa

		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		jsr	DoHexReturn
		jsr	ExitTunePart
		jsr	RemTuneList
		jsr	RemInstList
		jsr	RemSmplList
		bsr	FreeAllParts
		bsr	FreeAllArpgs
		bsr	FreeAllTunes
		bsr	FreeAllInsts
		bsr	FreeAllWs
		bsr	ClrW6StrGads

		lea	_AscIIHexTab(a5),a0
		move.l	a0,_TuneNumPtr(a5)
		lea	_AscIIHexTab+2(a5),a0
		move.l	a0,_InstNumPtr(a5)
		move.l	a0,_SmplNumPtr(a5)

		move.l	_AslFileReqLP(a5),_AslFileReqSaveMod(a5)		

LoadHeader	move.l	_FileHandle(a5),d1
		lea	_String(a5),a0
		move.l	a0,d2
		moveq	#8,d3
		CallDOS Read
		tst.l	d0
		ble.b	CloseFile

		cmp.l	#"TUNE",_String(a5)
		beq	LoadTune
		cmp.l	#"PART",_String(a5)
		beq	LoadPart
		cmp.l	#"ARPG",_String(a5)
		beq	LoadArpg
		cmp.l	#"INST",_String(a5)
		beq	LoadInst
		cmp.l	#"SMPL",_String(a5)
		beq	LoadSmpl
		cmp.l	#"INFO",_String(a5)
		beq	LoadInfo

CloseFile	move.l	_FileHandle(a5),d1
		CallDOS Close
		move.l	_Lock(a5),d1
		CallLib UnLock
LMExit		tst.l	_Window6(a5)
		beq.b	.skip
		bsr	UpdateW6Gads
.skip		jsr	ClrTuneScrGad
		jsr	ClrInstScrGads
		jsr	ClrSmplScrGad
		jsr	AddInstList
		jsr	AddSmplList
		jsr	InstSelec
		clr.b	_TunePart(a5)
		btst	#TuneBit,_LoadError(a5)
		bne.b	.ok
		bsr	AllocTune
.ok		jsr	AddTuneList
		move.b	#1,_StepArrowClear(a5)
		jsr	StepArrow
		move.b	#1,_PartArrowClear(a5)
		jsr	PartArrow
		jsr	ClearArrowTunePos
		move.b	#1,_PlayMode(a5)		8 channels
		jsr	StepShow
		jsr	GetTune
		move.b	tune_PlayMode(a0),_PlayMode(a5)
		move.l	a0,TunePtr
		jsr	AllocVoices
		jsr	DispSelTune
		lea	TuneEditorDefs,a4
		clr	MinYPos(a4)
		clr.l	CursorXPos(a4)
		jsr	PrintTune
		clr	_PartNum(a5)
		jsr	PrintPartNum
		lea	ArpgEditorDefs,a4
		clr	MinYPos(a4)
		clr.l	CursorXPos(a4)
		lea	PartEditorDefs,a4
		clr	MinYPos(a4)
		clr.l	CursorXPos(a4)
		jsr	GetPartPtr
		jsr	PrintPart
		jsr	SetMasterVolSpd
		jsr	SetChannel
		jsr	StepArrow
		jsr	PartArrow

		btst	#TuneBit,_LoadError(a5)
		beq.b	.ok1
		move.l	_AslFileReqLP(a5),a4
		moveq	#29,d5
		move.l	fr_File(a4),a0
		lea	WindowTitle+1,a2
.copyname	move.b	(a0)+,(a2)
		tst.b	(a2)+
		dbeq	d5,.copyname
.ok1		move.l	_Window1(a5),a0
		lea	WindowTitle,a1
		move.l	#-1,a2
		CallIntuition SetWindowTitles
		move.l	_Window2(a5),a0
		lea	WindowTitle,a1
		CallLib SetWindowTitles

		move.b	_PlayMode(a5),CycleNum+3
		move.l	_PlayModeGad(a5),a0
		move.l	_Window1(a5),a1
		jsr	SetCycleGad
		jsr	UpdateChannels
		moveq	#0,d7
		move	_WsButtons(a5),d0
		cmp	d0,d7
		beq.b	.envok
		move	d7,_WsButtons(a5)
		lea	WsParRemJump,a0
		add	d0,d0
		add	d0,d0
		move.l	(a0,d0.w),a0
		jsr	(a0)
		lea	WsParAddJump,a0
		add	d7,d7
		add	d7,d7
		move.l	(a0,d7.w),a0
		jsr	(a0)
.envok		move.l	_WsMxGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList10,a3
		CallGadTools GT_SetGadgetAttrsA
		clr	_EditOnOff(a5)
		move.l	_EditGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList1,a3
		move	_EditOnOff(a5),GTCB_Check+2
		CallLib GT_SetGadgetAttrsA
		clr	_PolyOnOff(a5)
		move.l	_PolyGad1(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList25,a3
		CallLib GT_SetGadgetAttrsA
		move.l	_PolyGad2(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList25,a3
		CallLib GT_SetGadgetAttrsA

LoadError1	bsr	InputOn
		clr	_BlockPlay(a5)
		rts

LoadError2	move.l	_FileHandle(a5),d1
		CallDOS Close
LoadError3	move.l	_Lock(a5),d1
		CallLib UnLock
		bsr	InputOn
		clr	_BlockPlay(a5)
		rts

EraseProject	bsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#EraseAll_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	LoadError1
		move	#$0101,_BlockPlay(a5)
		clr.b	_LoadError(a5)
		jsr	Stoppa
		move.b	#1,_StepArrowClear(a5)
		jsr	StepArrow
		move.b	#1,_PartArrowClear(a5)
		jsr	PartArrow
		jsr	ClearArrowTunePos
		move.b	#1,_PlayMode(a5)		8 channels
		jsr	StepShow
		clr.b	_PlayMode(a5)			4 channels
		jsr	StepArrow
		jsr	PartArrow
		jsr	DoHexReturn
		jsr	XTunePartArpg
		jsr	RemTuneList
		jsr	RemInstList
		jsr	RemSmplList
		bsr	FreeAllParts
		clr	_PartNum(a5)
		bsr	FreeAllArpgs
		bsr	FreeAllTunes
		bsr	FreeAllInsts
		bsr	FreeAllWs
		bsr	ClrW6StrGads
		moveq	#29,d5
		lea	ClearTitle,a0
		lea	WindowTitle+1,a2
.copyname	move.b	(a0)+,(a2)
		tst.b	(a2)+
		dbeq	d5,.copyname
		bra	LMExit

LoadInfo	move.l	_FileHandle(a5),d1
		lea	_CopyBuffer(a5),a2
		move.l	a2,d2
		move.l	_String+4(a5),d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile

		lea	_Title6Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		lea	_Author6Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		lea	_Date6Str(a5),a1
		moveq	#16-1,d0
		bsr.b	.getstring
		lea	_Duration6Str(a5),a1
		moveq	#16-1,d0
		bsr.b	.getstring
		lea	_Info16Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		lea	_Info26Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		lea	_Info36Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		lea	_Info46Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		lea	_Info56Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
.exit		bra	LoadHeader

.getstring	move.b	(a2)+,(a1)+
		dbeq	d0,.getstring
		rts

LoadTune	lea	_TuneListView(a5),a0
		TSTLIST
		beq.b	.empty
		addq	#1,_TuneMaxNum(a5)
.empty		move.l	#tune_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,d5
		beq	CloseFile
		lea	_TuneListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		lea	tune_NameStr(a1),a0
		move.l	a0,tune_Name(a1)
		move.l	_TuneNumPtr(a5),a2
		move.b	(a2)+,(a0)+
		move.b	(a2)+,(a0)+
		move.b	#" ",(a0)
		move.l	a2,_TuneNumPtr(a5)
		move.l	_FileHandle(a5),d1
		add.l	#tune_START,a1
		move.l	a1,d2
		move.l	#tune_LOADSIZE,d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		add.l	#tune_ChPtrs,d2
		move.l	d2,a2
		move.l	d5,a0
		moveq	#0,d6
		moveq	#8,d7
		tst.b	tune_Channels(a0)
		beq.b	.done
		move.b	tune_Channels(a0),d7

		move.l	_FileHandle(a5),d1
		move.l	a2,d2
		move.l	d7,d3
		lsl.l	#2,d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile

.loop		move.l	(a2)+,d3
		beq.b	.zero
		move.l	#chnl_SIZE,d0
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		move.l	d0,a1
		move	#127,d1
		move.l	#$00100010,d2
.tloop		move.l	d2,(a1)+
		dbf	d1,.tloop
		move.l	d0,-4(a2)
		move.l	_FileHandle(a5),d1
		move.l	d0,d2
		CallDOS Read
		tst.l	d0
		ble	CloseFile
.loopa		addq	#1,d6
		cmp	d6,d7
		bhi.b	.loop
		cmp	#8,d6
		beq.b	.skip
.done		lea	_ZeroBuffer(a5),a0
		moveq	#8,d7
.null		move.l	a0,(a2)+
		addq	#1,d6
		cmp	d6,d7
		bhi.b	.null
.skip		lea	_TunePtrs(a5),a0
		move	_TuneMaxNum(a5),d0
		lsl	#2,d0
		move.l	d5,(a0,d0.w)
		bset	#TuneBit,_LoadError(a5)
		bra	LoadHeader
.zero		lea	_ZeroBuffer(a5),a0
		move.l	a0,-4(a2)
		bra.b	.loopa

LoadPart	move.l	#part_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		move.l	d0,a2
		lea	_CopyBuffer(a5),a3
		move.l	_FileHandle(a5),d1
		move.l	a3,d2
		move.l	_String+4(a5),d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		lea	_PartPtrs(a5),a0
		move	(a3)+,d1
		lsl	#2,d1
		move.l	a2,(a0,d1.w)
		clr.b	_CopyOf_(a5)
		move.l	a3,a0
		move.l	a2,a1
.ploop		move.b	(a0)+,d6
		bmi.b	.pok
		moveq	#6-1,d7
.pnextloop	lsr.b	#1,d6
		bcc.b	.pnext
		move.b	(a0)+,(a1)
		move.b	(a0)+,1(a1)
.pnext		addq	#2,a1
		dbf	d7,.pnextloop
		bra.b	.ploop
.pok		bset	#PartBit,_LoadError(a5)
		bra	LoadHeader

LoadArpg	move.l	#arpg_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		move.l	d0,a2
		move.l	_FileHandle(a5),d1
		move.l	d0,d2
		moveq	#2,d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		lea	_ArpgPtrs(a5),a0
		move	(a2),d1
		lsl	#2,d1
		move.l	a2,(a0,d1.w)
		move.l	_FileHandle(a5),d1
		move.l	a2,d2
		move.l	_String+4(a5),d3
		subq.l	#2,d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		bset	#ArpgBit,_LoadError(a5)
		bra	LoadHeader

LoadInst	move.l	#inst_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		lea	_InstListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		lea	inst_NameStr(a1),a0
		move.l	a0,inst_Name(a1)
		move.l	_InstNumPtr(a5),a2
		move.b	(a2)+,(a0)+
		move.b	(a2)+,(a0)+
		move.b	#" ",(a0)
		move.l	a2,_InstNumPtr(a5)
		move.l	_FileHandle(a5),d1
		move.l	a1,a2
		add.l	#inst_START,a1
		move.l	a1,d2
		move.l	_String+4(a5),d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		bset	#InstBit,_LoadError(a5)
		addq	#1,_InstMaxNum(a5)
		lea	_InstPtrs(a5),a0
		move	_InstMaxNum(a5),d0
		add	d0,d0
		add	d0,d0
		move.l	a2,(a0,d0.w)
		bra	LoadHeader

LoadSmpl	lea	_String+8(a5),a0
		move.l	a0,d2
		moveq	#6,d3
		move.l	_FileHandle(a5),d1
		CallDOS Read
		tst.l	d0
		ble	CloseFile

		move.l	_String+8(a5),d0
		cmp.l	#256,d0
		bne.b	.not
		add.l	#240,d0
.not		add.l	#smpl_SampleData,d0
		move.l	#MEMF_CHIP!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		lea	_SmplListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		lea	smpl_NameStr(a1),a0
		move.l	a0,smpl_Name(a1)
		move.l	_SmplNumPtr(a5),a2
		move.b	(a2)+,(a0)+
		move.b	(a2)+,(a0)+
		move.b	#" ",(a0)
		move.l	a2,_SmplNumPtr(a5)
		move.l	a1,a2
		move.l	a2,d2
		add.l	#smpl_START,d2
		move.l	#smpl_SIZE,d3
		move.l	_FileHandle(a5),d1
		CallDOS Read
		tst.l	d0
		ble	CloseFile

		move.l	_String+4(a5),d3
		sub.l	#smpl_SIZE,d3
		move.l	_String+8(a5),d0
		cmp.l	d0,d3
		bne.b	.depack

		lea	smpl_SampleData(a2),a1		Read UnPacked Sample
		move.l	a1,d2
		move.l	_FileHandle(a5),d1
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		bra.b	.continue

.depack		move.l	d3,d7				Packed Sample Length / DeltaDePacker
.alloc		move.l	d3,d0
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		tst.l	d0
		beq.b	.again
		move.l	d0,_DeltaPackBuffer(a5)
		move.l	d3,_DeltaPackBufferLen(a5)
		lea	smpl_SampleData(a2),a1		Dest Beg Pointer / DeltaDePacker
		move.b	_String+12(a5),_DeltaCommand(a5)	DeltaCommand Byte
		bsr	DeltaDePacker			Uses	d0,d1,d2,d3,d5,d6,d7,a0,a1
		tst.l	d4
		bne	CloseFile
		move.l	_DeltaPackBuffer(a5),a1
		move.l	_DeltaPackBufferLen(a5),d0
		CallSys	FreeMem
		bra.b	.continue

.again		lsr.l	#1,d3
		cmp.l	#256*2*8,d3
		bhi.b	.alloc
		clr.b	_CopyOf_(a5)
		lea	_CopyBuffer(a5),a0
		move.l	a0,_DeltaPackBuffer(a5)
		move.l	#256*2*8,_DeltaPackBufferLen(a5)
		lea	smpl_SampleData(a2),a1		Dest Beg Pointer / DeltaDePacker
		move.b	_String+12(a5),_DeltaCommand(a5)	DeltaCommand Byte
		bsr	DeltaDePacker			Uses	d0,d1,d2,d3,d5,d6,d7,a0,a1
		tst.l	d4
		bne	CloseFile

.continue	move.l	_String+8(a5),d0
		cmp.l	#256,d0
		bne.b	.notwave
		lea	smpl_SampleData(a2),a0
		move	#256-1,d0
.convertwave	cmp.b	#$80,(a0)+
		bne.b	.conok
		move.b	#$81,-1(a0)
.conok		dbf	d0,.convertwave
		lea	smpl_SampleData(a2),a0
		lea	256(a0),a1
		move	#240-1,d0
.makewaves	move.b	(a0)+,(a1)+
		addq	#1,a0
		dbf	d0,.makewaves
.notwave	bset	#SmplBit,_LoadError(a5)
		addq	#1,_WsMaxNum(a5)
		lea	_WsPtrs(a5),a0
		move	_WsMaxNum(a5),d1
		add	d1,d1
		add	d1,d1
		move.l	a2,(a0,d1.w)

		move	_WsMaxNum(a5),d7
		lea	_InstListView(a5),a0
		lea	smpl_SampleData(a2),a3
		tst.l	(a0)
		beq.b	.setwsptrs
.loop		move.l	(a0),a0
		tst.l	(a0)
		beq.b	.setwsptrs
		cmp.b	inst_SmplNumber(a0),d7
		bne.b	.zero
.setsndptrs	move.l	a3,d1
		moveq	#0,d0
		move	inst_SmplStart(a0),d0
		add.l	d0,d0
		add.l	d0,d1
		move.l	d1,inst_SmplPointer(a0)
		move.l	a3,d1
		moveq	#0,d0
		move	inst_SmplRepStart(a0),d0
		add.l	d0,d0
		add.l	d0,d1
		move.l	d1,inst_SmplRepPointer(a0)
.zero		bra.b	.loop
.setwsptrs	move.l	smpl_RepPointer(a2),d0
		sub.l	smpl_Pointer(a2),d0
		bpl.b	.noadd1
		moveq	#0,d0
.noadd1		move.l	a3,smpl_Pointer(a2)
		move.l	a3,d1
		add.l	d0,d1
		move.l	d1,smpl_RepPointer(a2)
.exit		bra	LoadHeader

*******	Check Delta Packer ****************************************************
*	by Christian Cyreus of Musicline				      *
*******************************************************************************

_DeltaPackBuffer	rs.l	1
_DeltaPackBufferLen	rs.l	1
_DeltaCommand		rs.b	1
_PackSamples		rs.b	1

*******	File Format ***********************************************************
*									      *
*	Backwards							      *
*	BYTE - Crunch Command						      *
*	BYTE - Data Begin Byte						      *
*	BYTE - Data Field Length in Bytes ( 8  most significant bits )	      *
*	BYTE - Data Field Length in Bytes ( 8 least significant bits )	      *
*									      *
*******************************************************************************
*									      *
*	Uses 	d0,d1,d2,d6,d7,a0,a1,a2,a3				      *
*									      *
*	a0.l <- Source Beg Pointer					      *
*	a3.l <- Source End Pointer					      *
*									      *
*	d7.l = Size of Packed Sample					      *
*									      *
*******************************************************************************

CheckDeltaPacker
.smplpacker	clr.b	_CopyOf_(a5)
		lea	_CopyBuffer(a5),a2
		lea	(a2),a1
		move	#256-1,d7
.clrloop	clr.l	(a1)+
		dbf	d7,.clrloop
		moveq	#0,d7

.loop		moveq	#0,d6
		lea	(a0),a1
		move.l	a3,d1
		sub.l	a1,d1
		subq.l	#1,d1
		beq.b	.moveuncrunched
		bmi.b	.done

.again		move.b	1(a1),d0
		sub.b	(a1),d0
		bmi.b	.minus
		cmp.b	#7,d0
		bhi.b	.crunch
		bra.b	.ok
.minus		cmp.b	#-8,d0
		blt.b	.crunch
.ok		addq	#1,a1
		addq.l	#1,d6
		cmp	#$ffff,d6
		beq.b	.crunch
		subq.l	#1,d1
		bne.b	.again
		bra.b	.crunch

.done		moveq	#0,d1
		moveq	#0,d0
		move.l	(a2),d2
		beq.b	.foundunused
		move	#255-1,d6

.mostunused	addq	#4,d1
		cmp.l	(a2,d1.w),d2
		bls.b	.more
		move.l	(a2,d1.w),d2
		move	d1,d0
		beq.b	.foundunused
.more		dbf	d6,.mostunused

		move.l	d2,d1
		add.l	d1,d1		;=Mulu	#3,d1
		add.l	d2,d1
		add.l	d1,d7

.foundunused	lsr	#2,d0			Least used byte = Command byte
		move.b	d0,_DeltaCommand(a5)
		rts

.crunch		cmp	#9,d6
		bhi.b	.cruncher

.moveuncrunched	moveq	#0,d0
		move.b	(a0)+,d0
		lsl	#2,d0
		addq.l	#1,(a2,d0.w)
		addq.l	#1,d7
		dbf	d6,.moveuncrunched
		bra.b	.loop

.cruncher	add.l	d6,a0
		addq	#1,a0
		addq.l	#1,d6
		lsr.l	#1,d6
		add.l	d6,d7
		addq.l	#4,d7
		bra	.loop

*******	Delta Packer **********************************************************
*	by Christian Cyreus of Musicline				      *
*******************************************************************************
*******	File Format ***********************************************************
*									      *
*	Backwards							      *
*	BYTE - Crunch Command						      *
*	BYTE - Data Begin Byte						      *
*	BYTE - Data Field Length in Bytes ( 8  most significant bits )	      *
*	BYTE - Data Field Length in Bytes ( 8 least significant bits )	      *
*									      *
*******************************************************************************
*									      *
*	Uses 	d0,d1,d2,d3,d6,d7,a0,a1,a2,a3				      *
*									      *
*	a0.l <- Source Beg Pointer					      *
*	a3.l <- Source End Pointer					      *
*									      *
*******************************************************************************

DeltaSaveCheck	MACRO
		subq.l	#\1,d3
		cmp.l	d3,d2
		blo.b	.not\@
		bsr.\0	DeltaSaveBuffer
.not\@		addq.l	#\1,d3
		addq.l	#\1,d2
		ENDM

DeltaPacker
.smplpacker	move.l	_DeltaPackBuffer(a5),a1
		move.l	_DeltaPackBufferLen(a5),d3
		moveq	#0,d2
.loop		moveq	#0,d6
		lea	(a0),a2
		move.l	a3,d1
		sub.l	a2,d1
		subq.l	#1,d1
		beq.b	.moveuncrunched
		bmi.b	.done

.again		move.b	1(a2),d0
		sub.b	(a2),d0
		bmi.b	.minus
		cmp.b	#7,d0
		bhi.b	.crunch
		bra.b	.ok
.minus		cmp.b	#-8,d0
		blt.b	.crunch
.ok		addq	#1,a2
		addq.l	#1,d6
		cmp	#$ffff,d6
		beq.b	.crunch
		subq.l	#1,d1
		bne.b	.again
		bra.b	.crunch

.done		move.l	d2,d3
		beq.b	.exit
		movem.l	d0-d2/a0-a1,-(sp)
		move.l	_DeltaPackBuffer(a5),d2
		move.l	_FileHandle(a5),d1
		CallDOS Write
		movem.l	(sp)+,d0-d2/a0-a1
.exit		rts

.crunch		cmp	#9,d6
		bhi.b	.cruncher

.moveuncrunched	move.b	_DeltaCommand(a5),d0
		cmp.b	(a0),d0
		bne.b	.moveit
		DeltaSaveCheck 4
		move.b	d0,(a1)+
		move.b	d0,(a1)+
		clr.b	(a1)+
		clr.b	(a1)+
		addq	#1,a0
		bra.b	.moveuncrunched
.moveit		DeltaSaveCheck.b 1
		move.b	(a0)+,(a1)+
		dbf	d6,.moveuncrunched
		bra	.loop

.cruncher	DeltaSaveCheck.b 4
		move.b	_DeltaCommand(a5),(a1)+
		move.b	(a0),(a1)+
		move	d6,d0
		lsr	#8,d0
		move.b	d0,(a1)+
		move.b	d6,(a1)+
		subq	#1,d6

.crunchloop1	move.b	1(a0),d0
		sub.b	(a0)+,d0
		and.b	#$f,d0
		lsl.b	#4,d0
		DeltaSaveCheck.b 1
		move.b	d0,(a1)+
		dbf	d6,.crunchloop2
		addq	#1,a0
		bra	.loop

.crunchloop2	move.b	1(a0),d0
		sub.b	(a0)+,d0
		and.b	#$f,d0
		or.b	d0,-1(a1)
		dbf	d6,.crunchloop1
		addq	#1,a0
		bra	.loop

DeltaSaveBuffer	movem.l	d0/d1/d3/a0,-(sp)
		move.l	d2,d3
		move.l	_DeltaPackBuffer(a5),d2
		move.l	_FileHandle(a5),d1
		CallDOS Write
		movem.l	(sp)+,d0/d1/d3/a0
		move.l	_DeltaPackBuffer(a5),a1
		moveq	#0,d2
		rts

*******	Delta DePacker ********************************************************
*	by Christian Cyreus of Musicline				      *
*******************************************************************************
*******	File Format ***********************************************************
*									      *
*	Backwards							      *
*	BYTE - Crunch Command						      *
*	BYTE - Data Begin Byte						      *
*	BYTE - Data Field Length in Bytes ( 8  most significant bits )	      *
*	BYTE - Data Field Length in Bytes ( 8 least significant bits )	      *
*									      *
*******************************************************************************
*									      *
*	Uses	d0,d1,d2,d3,d6,d7,a0,a1					      *
*									      *
*	a1.l <- Destination Beg Pointer					      *
*	d7.l <- Packed Sample Length					      *
*									      *
*******************************************************************************

ext_b		MACRO
		btst	#3,\1
		beq.b	.skip\@
		or.b	#$f0,\1
.skip\@
		ENDM

DeltaReadCheck	MACRO
		subq.l	#1,d6
		bgt.b	.not\@
		tst	d7
		beq.\0	.done
		bsr.\0	DeltaReadBuffer
.not\@	
		ENDM

DeltaDePacker	moveq	#0,d6
.loop		DeltaReadCheck
		move.b	(a0)+,d0
		cmp.b	_DeltaCommand(a5),d0
		beq.b	.command
		move.b	d0,(a1)+
		bra.b	.loop

.command	DeltaReadCheck.b
		move.b	(a0)+,d0
		DeltaReadCheck.b
		move.b	(a0)+,d1
		lsl	#8,d1
		DeltaReadCheck.b
		move.b	(a0)+,d1
		move.b	d0,(a1)+
		tst	d1
		beq.b	.loop

.decrunch1	DeltaReadCheck
		move.b	(a0)+,d2
		lsr.b	#4,d2
		ext_b	d2
		add.b	d2,d0
		move.b	d0,(a1)+
		subq	#1,d1
		beq	.loop

.decrunch2	move.b	-1(a0),d2
		and	#$f,d2
		ext_b	d2
		add.b	d2,d0
		move.b	d0,(a1)+
		subq	#1,d1
		bne.b	.decrunch1
		bra	.loop
		
.done		moveq	#0,d4
		rts

DeltaReadBuffer
.readagain	movem.l	d0-d3/a0-a1,-(sp)
		move.l	_DeltaPackBufferLen(a5),d3
		cmp.l	d3,d7
		bhi.b	.ok
		move.l	d7,d3
		moveq	#0,d7
		bra.b	.read
.ok		sub.l	d3,d7
.read		move.l	d3,d6
		move.l	_DeltaPackBuffer(a5),d2
		move.l	_FileHandle(a5),d1
		CallDOS Read
		tst.l	d0
		ble.b	.error
		movem.l	(sp)+,d0-d3/a0-a1
		move.l	_DeltaPackBuffer(a5),a0
		rts

.error		movem.l	(sp)+,d0-d3/a0-a1
		move.l	_DeltaPackBuffer(a5),a0
		move.l	#-1,d4
		addq	#4,sp
		rts

*****************************************************************************
* ProTracker Converter                       * Christian Cyréus - Musicline *
*****************************************************************************

CheckProTracker	move.l	_FileHandle(a5),d1
		move.l	#pt_check,d2
		moveq	#OFFSET_BEGINNING,d3
		CallDOS Seek

		lea	_String(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		moveq	#4,d3
		CallDOS Read
		tst.l	d0
		ble	LoadError2
		cmp.l	#"M.K.",_String(a5)	 64 patterns
		beq.b	.load
		cmp.l	#"M!K!",_String(a5)	100 patterns
		bne	LoadError2

.load		move	#$0101,_BlockPlay(a5)
		jsr	Stoppa

		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		jsr	DoHexReturn
		jsr	ExitTunePart
		jsr	RemTuneList
		jsr	RemInstList
		jsr	RemSmplList
		bsr	FreeAllParts
		bsr	FreeAllArpgs
		bsr	FreeAllTunes
		bsr	FreeAllInsts
		bsr	FreeAllWs
		bsr	ClrW6StrGads

		lea	_AscIIHexTab(a5),a0
		move.l	a0,_TuneNumPtr(a5)
		lea	_AscIIHexTab+2(a5),a0
		move.l	a0,_InstNumPtr(a5)
		move.l	a0,_SmplNumPtr(a5)

.tune		lea	_TuneListView(a5),a0
		TSTLIST
		beq.b	.empty
		addq	#1,_TuneMaxNum(a5)
.empty		move.l	#tune_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,d5
		beq	CloseFile
		lea	_TuneListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		move.l	a1,_TunePtrs(a5)
		lea	tune_NameStr(a1),a0
		move.l	a0,tune_Name(a1)
		move.l	_TuneNumPtr(a5),a2
		move.b	(a2)+,(a0)+
		move.b	(a2)+,(a0)+
		move.b	#" ",(a0)+
		move.l	a2,_TuneNumPtr(a5)
		move.l	a0,a2

		move.l	_FileHandle(a5),d1
		moveq	#pt_songname,d2
		moveq	#OFFSET_BEGINNING,d3
		CallDOS Seek

		move.l	_FileHandle(a5),d1
		move.l	a2,d2
		moveq	#pt_load1,d3		Number of Ascii letters
		CallDOS Read
		tst.l	d0
		ble	CloseFile

		add	#20-2,a2
		moveq	#20-2,d7
.clearspaces	cmp.b	#$20,(a2)		;$20=Space
		bne.b	.textend
		clr.b	(a2)
		subq	#1,a2
		dbf	d7,.clearspaces

.textend	move.l	d5,a3

		move	#$7d,tune_Tempo(a3)
		move.b	#$06,tune_Speed(a3)
		clr.b	tune_Groove(a3)
		move	#64,tune_Volume(a3)
		move.b	#%00001111,_ChannelsOn(a5)

		lea	tune_Ch1Ptr(a3),a2
		moveq	#4-1,d7
.chloop1	move.l	#chnl_SIZE,d0
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		move.l	d0,(a2)+
		dbf	d7,.chloop1

		lea	tune_Ch5Ptr(a3),a2
		lea	_ZeroBuffer(a5),a0
		moveq	#4-1,d7
.chloop2	move.l	a0,(a2)+
		dbf	d7,.chloop2

		bset	#TuneBit,_LoadError(a5)

		move.l	_FileHandle(a5),d1
		moveq	#pt_smp,d2
		moveq	#OFFSET_BEGINNING,d3
		CallDOS Seek


		moveq	#31-1,d7

.nextinst	move.l	_FileHandle(a5),d1
		lea	_String(a5),a0
		move.l	a0,d2
		move.l	d2,a3
		moveq	#pt_load2,d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile

		move.l	#inst_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile

		lea	_InstPtrs(a5),a2
		addq	#1,_InstMaxNum(a5)
		move	_InstMaxNum(a5),d6
		lsl	#2,d6
		move.l	d0,(a2,d6.w)

		lea	_InstListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		lea	inst_NameStr(a1),a0
		move.l	a0,inst_Name(a1)
		move.l	_InstNumPtr(a5),a2
		move.b	(a2)+,(a0)+
		move.b	(a2)+,(a0)+
		move.b	#" ",(a0)+
		move.l	a2,_InstNumPtr(a5)

		move	#64,inst_Volume(a1)
		move	#256*2,inst_PhaStart(a1)
		move	#256*2,inst_PhaRepeat(a1)
		move	#256*2,inst_PhaRepEnd(a1)
		move	#1,inst_EnvAttLen(a1)
		move	#1,inst_EnvDecLen(a1)
		move	#1,inst_EnvSusLen(a1)
		move	#1,inst_EnvRelLen(a1)
		move.b	#1,inst_ArpSpeed(a1)
		move.b	#-1,inst_Transpose(a1)

		bset	#InstBit,_LoadError(a5)

		move.l	a0,a2
		moveq	#22-1,d6	ProTracker sample name length

		move.l	a3,a4
		moveq	#0,d1
		move	pt_smplength(a4),d1
		bne.b	.checkuntitled
		lea	Unused_Txt,a2
.unusedloop	move.b	(a2)+,(a0)+
		beq	.instdbf
		dbf	d6,.unusedloop
.UNUSED		bra	.instdbf

.checkuntitled	tst.b	(a4)
		bne.b	.textsmploop
		lea	Untitled_Txt,a2
.untitledloop	move.b	(a2)+,(a0)+
		beq.b	.textsmpend
		dbf	d6,.untitledloop
		bra.b	.textsmpend

.textsmploop	tst.b	(a4)+
		beq.b	.textsmpclear
		move.b	-1(a4),(a0)+
		beq.b	.clearspaces2
		dbf	d6,.textsmploop		
		bra.b	.clearspaces2
.textsmpclear	clr.b	(a0)+
		dbf	d6,.textsmpclear		

.clearspaces2	add	#22-2,a2
		moveq	#22-2,d6
.clearspaces2lp	cmp.b	#$20,(a2)		;$20=Space
		bne.b	.textsmpend
		clr.b	(a2)
		subq	#1,a2
		dbf	d6,.clearspaces2lp

.textsmpend	move.l	a1,a4
		move.l	#smpl_SampleData,d0
		cmp	#128,d1
		bne.b	.nowave
		add.l	#120,d1
.nowave		add.l	d1,d0
		add.l	d1,d0
		move.l	#MEMF_CHIP!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		bset	#SmplBit,_LoadError(a5)
		lea	_SmplListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		lea	smpl_NameStr(a1),a0
		move.l	a0,smpl_Name(a1)
		move.l	_SmplNumPtr(a5),a2
		move.b	(a2)+,(a0)+
		move.b	(a2)+,(a0)+
		move.b	#" ",(a0)+
		move.l	a2,_SmplNumPtr(a5)

		lea	inst_Title(a4),a2
		moveq	#22-1,d6	ProTracker sample name length
.smpltitleloop	move.b	(a2)+,(a0)+
		dbf	d6,.smpltitleloop

		addq	#1,_WsMaxNum(a5)
		move	_WsMaxNum(a5),d0
		move.b	d0,inst_SmplNumber(a4)
		lea	_WsPtrs(a5),a2
		lsl	#2,d0
		move.l	a1,(a2,d0.w)

		lea	smpl_SampleData(a1),a2
		move.l	a2,inst_SmplPointer(a4)
		move.l	a2,smpl_Pointer(a1)

		move	pt_smprepeat(a3),d0
		move	d0,inst_SmplRepStart(a4)
		add	d0,a2
		add	d0,a2
		move.l	a2,inst_SmplRepPointer(a4)
		move.l	a2,smpl_RepPointer(a1)

		move	pt_smplength(a3),d1
		move	d1,smpl_Length(a1)
		move	d1,inst_SmplLength(a4)

		move	pt_smpreplen(a3),d1
		cmp	#1,d1		Loop Length 2 bytes
		bhi.b	.sampleloop
		moveq	#1,d1
		move	pt_smplength(a3),inst_SmplEnd(a4)
		bra.b	.skipsampleloop
.sampleloop	move	d1,inst_SmplRepLength(a4)
		move	d1,inst_SmplRepLen(a4)
		move	d1,smpl_RepLength(a1)
		add	d0,d1
		move	d1,inst_SmplEnd(a4)
		move	d1,inst_SmplLength(a4)
		bset	#WSLOOP,inst_Effects1(a4)
.skipsampleloop	moveq	#0,d0
		move.b	pt_smpvolume(a3),d0
		move	d0,inst_Volume(a4)

		move.b	pt_smpfinetune(a3),d0
		and	#%1111,d0
		btst	#3,d0
		beq.b	.plus
		cmp	#8,d0
		bne.b	.not8
		move	#-1,inst_SemiTone(a4)
		move	#-6,inst_FineTune(a4)
		move	#-6,smpl_FineTune(a1)
		bra.b	.instdbf
.not8		or	#%1111111111110000,d0
.plus		lsl	#2,d0
.skip		subq	#6,d0
		cmp	#-31,d0
		bge.b	.inrange
		add	#31-1,d0
		move	#-1,inst_SemiTone(a4)
.inrange	move	d0,inst_FineTune(a4)
		move	d0,smpl_FineTune(a1)

.instdbf	dbf	d7,.nextinst

		move.l	_FileHandle(a5),d1
		lea	_CopyBuffer(a5),a0
		move.l	a0,d2
		move.l	d2,a3
		move	#pt_load3,d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		clr.b	_CopyOf_(a5)

.tunedata	jsr	GetTune
		move.l	a0,a4
		moveq	#0,d7
		move.b	pt_songlen(a3),d7
		move	#256-1,d4	-1 = Jumpen som flyttas in
		sub	d7,d4
		subq	#1,d4
		subq	#1,d7
		move	d7,PT_SongLength
		lea	pt_songpos(a3),a0
		pea	(a0)
		move.l	tune_Ch1Ptr(a4),a1
		move.l	tune_Ch2Ptr(a4),a2
		move.l	tune_Ch3Ptr(a4),a3
		move.l	tune_Ch4Ptr(a4),a4

.tuneloop	moveq	#0,d0
		move.b	(a0)+,d0
		lsl	#2,d0
		addq	#1,d0
		move.b	d0,(a1)+
		move.b	d0,d1
		and	#$100,d1
		lsr	#2,d1
		or	#$10,d1
		move.b	d1,(a1)+

		addq	#1,d0
		move.b	d0,(a2)+
		move.b	d0,d1
		and	#$100,d1
		lsr	#2,d1
		or	#$10,d1
		move.b	d1,(a2)+

		addq	#1,d0
		move.b	d0,(a3)+
		move.b	d0,d1
		and	#$100,d1
		lsr	#2,d1
		or	#$10,d1
		move.b	d1,(a3)+

		addq	#1,d0
		move.b	d0,(a4)+
		move.b	d0,d1
		and	#$100,d1
		lsr	#2,d1
		or	#$10,d1
		move.b	d1,(a4)+
		dbf	d7,.tuneloop

.pt_init	move	#$00a0,(a1)+
		move	#$00a0,(a2)+
		move	#$00a0,(a3)+
		move	#$00a0,(a4)+

		tst	d4
		bmi.b	.skiptunefix
.tunefixloop	move	#$0010,(a1)+
		move	#$0010,(a2)+
		move	#$0010,(a3)+
		move	#$0010,(a4)+
		dbf	d4,.tunefixloop
		
.skiptunefix	move.l	(sp)+,a2

		moveq	#128-1,d7
		moveq	#0,d4
		moveq	#0,d1
.pt_songposloop	move.b	(a2)+,d1
		cmp.b	d1,d4
		bhi.b	.pt_songposdbf
		move.l	d1,d4
.pt_songposdbf	dbf	d7,.pt_songposloop

.zeropart	move.l	#part_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		lea	_PartPtrs(a5),a4
		move.l	d0,(a4)+

		move	#1*2,PT_PartNumber

		lea	PT_PosJumpList,a3
		move.l	a3,PT_PosJumpListPointer
		moveq	#100-1,d7
.clearposloop	move.b	#-1,(a3)+
		dbf	d7,.clearposloop

		lea	PT_EqualPartList,a3
		moveq	#0,d6
		move	#100*4+1-1,d7
.clear_ep_loop	move	d6,(a3)+
		addq	#1,d6
		dbf	d7,.clear_ep_loop

.partloop3	lea	_CopyBuffer(a5),a3
		move.l	_FileHandle(a5),d1
		move.l	a3,d2
		move.l	#pt_load4,d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		clr.b	_CopyOf_(a5)
		bset	#PartBit,_LoadError(a5)

		move.l	a3,a1

		moveq	#4-1,d5
.partloop2	move.l	#part_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		pea	(a1)
		CallSys AllocMem
		move.l	(sp)+,a1
		tst.l	d0
		beq	CloseFile
		move.l	d0,(a4)+
		move.l	d0,a2

		move.l	a1,a3
		moveq	#64-1,d7
		lea	_CopyBuffer(a5),a6
		move.l	a6,PT_PatternPos
		clr	PT_LoopPoint
		clr	PT_LoopPointAdd
.partloop1	move	(a3),d1
		and	#$0fff,d1
		beq.b	.samplenumber

		lea	PT_PeriodTable(pc),a0
		moveq	#12*3-1,d6
.periodloop	cmp	(a0)+,d1
		beq.b	.found
		dbf	d6,.periodloop
		moveq	#0,d1
		bra.b	.samplenumber
.found		move	ML_PeriodTableOffset-2(a0),d1

.samplenumber	move.b	d1,(a2)+

		move.b	(a3),d0
		and.b	#$f0,d0
		move.b	2(a3),d1
		lsr.b	#4,d1
		or.b	d1,d0
		move.b	d0,(a2)+
		bne.b	.effectcommand
		move	(a3),d1
		and	#$0fff,d1
		beq.b	.effectcommand
		move.b	#fx_RestartNoVolume,4(a2)
		clr.b	5(a2)
.effectcommand	moveq	#0,d0
		moveq	#0,d1
		move.b	2(a3),d0
		move.b	3(a3),d1
		and	#$0f,d0
		bne.b	.effect
		tst.b	d1
		beq.b	.skipeffect
.effect
.pt_convert	cmp.b	#$e,d0
		bne.b	.normal
.e		lea	PT_EFXPointer,a6
		move	d1,d2
		lsr	#4,d2
		lsl	#2,d2
		move.l	(a6,d2.w),a6
		jsr	(a6)		d0-effect number, d1-effect data
		bra.b	.skipeffect
.normal		lea	PT_FXPointer,a6
		move	d0,d2
		lsl	#2,d2
		move.l	(a6,d2.w),a6
		jsr	(a6)		d0-effect number, d1-effect data

.skipeffect	move.b	d0,(a2)+
		move.b	d1,(a2)+

.checkbreak	move.l	PT_PatternPos,a6
		move.b	2+4*3(a6),d0
		move.b	3+4*3(a6),d1
		and	#$0f,d0
		cmp	#$0d,d0
		beq.b	.break
		cmp	#$0b,d0
		beq.b	.posjump
		move.b	2+4*2(a6),d0
		move.b	3+4*2(a6),d1
		and	#$0f,d0
		cmp	#$0d,d0
		beq.b	.break
		cmp	#$0b,d0
		beq.b	.posjump
		move.b	2+4*1(a6),d0
		move.b	3+4*1(a6),d1
		and	#$0f,d0
		cmp	#$0d,d0
		beq.b	.break
		cmp	#$0b,d0
		beq.b	.posjump
		move.b	2(a6),d0
		move.b	3(a6),d1
		and	#$0f,d0
		cmp	#$0d,d0
		beq.b	.break
		cmp	#$0b,d0
		bne.b	.checkjump
.posjump	move.l	PT_PosJumpListPointer,a6
		move.b	d1,(a6)
.break		addq	#8,a2
		bra	.endpart

.checkjump	move	2+4*3(a6),d0
		move.b	3+4*3(a6),d1
		lsr	#4,d0
		cmp.b	#$e6,d0
		beq.b	.jumploop
		move	2+4*2(a6),d0
		move.b	3+4*2(a6),d1
		lsr	#4,d0
		cmp.b	#$e6,d0
		beq.b	.jumploop
		move	2+4*1(a6),d0
		move.b	3+4*1(a6),d1
		lsr	#4,d0
		cmp.b	#$e6,d0
		beq.b	.jumploop
		move	2(a6),d0
		move.b	3(a6),d1
		lsr	#4,d0
		cmp.b	#$e6,d0
		bne.b	.checkdone
.jumploop	and	#$f,d1
		beq.b	.setloop
		addq	#8,a2
		move	PT_LoopPoint,d0
		add	PT_LoopPointAdd,d0
		addq	#1,PT_LoopPointAdd
		move.b	d0,(a2)
		bset	#7,(a2)
		move.b	d1,1(a2)
		addq	#4,a2
		bra.b	.checkdone

.setloop	lea	_CopyBuffer(a5),a0
		move.l	a6,d0
		sub.l	a0,d0
		lsr.l	#4,d0
		move	d0,PT_LoopPoint

.checkdone	add	#4*4,a3
		add.l	#4*4,PT_PatternPos
		addq	#8,a2
		dbf	d7,.partloop1

.endpart	move.b	#61,(a2)	END OF PART
		addq	#4,a1


.duplicatecheck	movem.l	d0-a3,-(sp)

		lea	_ZeroBuffer(a5),a0
		move.l	a0,d4
		move.l	-4(a4),d2
		lea	_PartPtrs(a5),a0
		move	#100*4-1,d7

.dupcheckloop	lea	-4(a4),a3
		move.l	a3,d6
		cmp.l	a0,d6
		beq.b	.dupcheckdone
		move.l	(a0)+,a3
		cmp.l	a3,d4
		beq.b	.dupcheckdbf

		move.l	a3,a2
		move.l	d2,a1
		move	#$80*3-1,d6
.dupcmploop	cmp.l	(a2)+,(a1)+
		bne.b	.dupcheckdbf
		dbf	d6,.dupcmploop
.duplicatefound	move.l	-(a4),a1
		move.l	a0,d3
		move.l	#part_SIZEOF,d0
		CallSys FreeMem
		move.l	d4,(a4)

		lea	_PartPtrs(a5),a0
		subq.l	#4,d3
		sub.l	a0,d3		Part that matches
		lsr.l	#2,d3
		lea	PT_EqualPartList,a0
		move	PT_PartNumber,d2
		move	d3,(a0,d2.w)

		move	#100*4-1,d3
		move	d2,d0
		lsr	#1,d0
		sub	d0,d3
		blt.b	.dupcheckdone
		lea	2(a0,d2.w),a0
.dupsubloop	subq	#1,(a0)+
		dbf	d3,.dupsubloop
		bra.b	.dupcheckdone

.dupcheckdbf	dbf	d7,.dupcheckloop
.dupcheckdone	movem.l	(sp)+,d0-a3
		addq	#1*2,PT_PartNumber
		dbf	d5,.partloop2

		addq.l	#1,PT_PosJumpListPointer
		dbf	d4,.partloop3

		lea	_SmplListView(a5),a4
.readsamples	TSTNODE a4,a4
		beq.b	.done

		lea	smpl_SampleData(a4),a0
		moveq	#0,d3
		move	smpl_Length(a4),d3	
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		add.l	d3,d3
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		bra.b	.readsamples

.done		jsr	GetTune
		move.l	tune_Ch1Ptr(a0),a1
		move	PT_SongLength,d7
		bsr.b	.posjumploop
		jsr	GetTune
		move.l	tune_Ch2Ptr(a0),a1
		move	PT_SongLength,d7
		bsr.b	.posjumploop
		jsr	GetTune
		move.l	tune_Ch3Ptr(a0),a1
		move	PT_SongLength,d7
		bsr.b	.posjumploop
		jsr	GetTune
		move.l	tune_Ch4Ptr(a0),a1
		move	PT_SongLength,d7
		bsr.b	.posjumploop
		bra.b	.relabelseq

.posjumploop	move.l	a1,a0
		move	d7,d0
		add	d0,d0
		add	d0,a0

		lea	PT_PosJumpList,a4
		moveq	#0,d0
		move.b	(a0),d0
		subq	#1,d0
		lsr	#2,d0
		moveq	#0,d1
		move.b	(a4,d0.w),d1
		bmi.b	.next
		cmp	d7,d1
		bhs.b	.next
		
		move.l	a1,a2
		add	#255*2,a2
		lea	2(a2),a3

.insertcolumn	move	#256-1,d6
		move	d7,d3
		addq	#1,d3
.loop		move	-(a2),-(a3)
		subq	#1,d6
		cmp	d3,d6
		bne.b	.loop
		move	#$00a0,(a2)
		move.b	d1,(a2)

		move.l	a1,a0
		move	#256-1,d6
		move.b	#$a0,d2
.search		move.b	1(a0),d3
		and.b	#$e0,d3
		cmp.b	d3,d2
		bne.b	.ok
		cmp.b	(a0),d7
		bhi.b	.ok
		addq.b	#1,(a0)
.ok		addq	#2,a0
		dbf	d6,.search

.next		dbf	d7,.posjumploop
		rts

.relabelseq	jsr	GetTune
		lea	PT_EqualPartList,a2
		move.l	tune_Ch1Ptr(a0),a1
		bsr.b	.relabelseqpart
		move.l	tune_Ch2Ptr(a0),a1
		bsr.b	.relabelseqpart
		move.l	tune_Ch3Ptr(a0),a1
		bsr.b	.relabelseqpart
		move.l	tune_Ch4Ptr(a0),a1
		bsr.b	.relabelseqpart
		bra	CloseFile

.relabelseqpart	move	#$100-1,d7
.relablesploop	btst	#5,1(a1)
		bne.b	.relabeldbf
		moveq	#0,d0
		move.b	(a1),d0
		move.b	1(a1),d1
		and	#$c0,d1
		lsl	#2,d1
		or	d1,d0
		add	d0,d0
		move	(a2,d0.w),d1
		beq.b	.relabeldbf
		move.b	d1,(a1)
		lsr	#2,d1
		and	#$c0,d1
		move.b	d1,1(a1)
		or.b	#$10,1(a1)
.relabeldbf	addq	#2,a1
		dbf	d7,.relablesploop

		move	#1,PT_RemUnIn
		SPjsr	RemUnusedInsts,d0-a6
		rts

PT_PatternPos		dc.l	0
PT_RemUnIn		dc.w	0
PT_LoopPoint		dc.w	0
PT_LoopPointAdd		dc.w	0
PT_SongLength		dc.w	0
PT_PartNumber		dc.w	0
PT_EqualPartList	dcb.w	100*4+1,0	Max PT patterns*4
PT_PosJumpList		dcb.b	100,-1	Max PT patterns
PT_PosJumpListPointer	dc.l	0


PT_FXPointer	dc.l	PT_Arpeggio,PT_SlideUp
		dc.l	PT_SlideDown,PT_Portamento
		dc.l	PT_Vibrato,PT_Portamento_VolumeSlide
		dc.l	PT_Vibrato_VolumeSlide,PT_Tremolo
		dc.l	PT_NOTUSED1,PT_SampleOffset
		dc.l	PT_VolumeSlide,PT_PositionJump
		dc.l	PT_Volume,PT_PatternBreak
		dc.l	PT_NOTUSED2,PT_Speed

PT_EFXPointer	dc.l	PT_Filter,PT_PitchUp
		dc.l	PT_PitchDown,PT_Glissanto
		dc.l	PT_VibratoWave,PT_SetFinetune
		dc.l	PT_PatternLoop,PT_TremoloWave
		dc.l	PT_NOTUSED3,PT_RetrigNote
		dc.l	PT_VolumeAdd,PT_VolumeSub
		dc.l	PT_CutNote,PT_DelayNote
		dc.l	PT_DelayPattern,PT_InvertLoop

PT_NOTUSED1	move.b	#fx_UserCommand,d0
		rts
PT_NOTUSED2	move.b	#fx_UserCommand+1,d0
		rts
PT_NOTUSED3	move.b	#fx_UserCommand+2,d0
		and.b	#$0f,d0
		rts

PT_MakeArpeggioRegs	reg	d2-a6
PT_MakeArpeggio	lea	_ArpgPtrs(a5),a0
		lea	_ZeroBuffer(a5),a2
		subq	#1,d2
		moveq	#-4,d4
.nextarp	addq	#4,d4
		cmp	#256*4,d4
		bhs.b	.error
		move.l	(a0,d4.w),a1
		move.l	a3,a4
		move	d2,d3
		cmp.l	a1,a2
		beq.b	.doarp
.equalloop	cmp.b	(a4)+,(a1)+
		bne.b	.nextarp
		dbf	d3,.equalloop
		lsr	#2,d4
		move	d4,d1
		move.b	#fx_ArpeggioListOneStep,d0
		movem.l	(sp)+,PT_MakeArpeggioRegs
		rts
.doarp		move.l	#arpg_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		move.l	d0,a1
		lea	_ArpgPtrs(a5),a0
		move.l	a1,(a0,d4.w)
.movearploop	move.b	(a4)+,(a1)+
		dbf	d3,.movearploop	
		lsr	#2,d4
		move	d4,d1
		move.b	#fx_ArpeggioListOneStep,d0
		movem.l	(sp)+,PT_MakeArpeggioRegs
		rts
.error		clr.b	d1
		move.b	#fx_ArpeggioListOneStep,d0
		movem.l	(sp)+,PT_MakeArpeggioRegs
		rts

PT_Arpeggio	tst.b	d1
		beq.b	.nothing
		movem.l	PT_MakeArpeggioRegs,-(sp)
		move.b	d1,d0
		lsr.b	#4,d1
		and.b	#$0f,d0
		moveq	#0,d2
		lea	_CopyBuffer+1024(a5),a3
		move.l	a3,a4
		move.b	#-61,(a4)+
		bsr.b	.clear
		tst.b	d1
		beq.b	.next
		move.b	d1,(a4)
		sub.b	#61,(a4)+
		bsr.b	.clear
.next		tst.b	d0
		beq.b	.next2
		move.b	d0,(a4)
		sub.b	#61,(a4)+
		bsr.b	.clear
.next2		move.b	#62,(a4)+
		bsr.b	.clear
		bra	PT_MakeArpeggio
.clear		clr.b	(a4)+
		clr.l	(a4)+
		addq	#6,d2
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_SlideUp	tst.b	d1
		beq.b	.nothing
		move.b	#fx_PTSlideUp,d0
		;add	d1,d1
		;cmp	#$ff,d1
		;bls.b	.ok
		;move	#$ff,d1
.ok		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_SlideDown	tst.b	d1
		beq.b	.nothing
		move.b	#fx_PTSlideDown,d0
		;add	d1,d1
		;cmp	#$ff,d1
		;bls.b	.ok
		;move	#$ff,d1
.ok		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_Portamento	;add	d1,d1
		;cmp	#$ff,d1
		;bls.b	.ok
		;move	#$ff,d1
.ok		move.b	#fx_PTPortamento,d0
		rts

PT_Vibrato	move.b	#fx_PTVibrato,d0
		;move.b	d1,d0
		;and.b	#$f,d1
		;lsr.b	#4,d0
		;lsl.b	#2,d0		Speed*4
		;add.b	d1,d1		Depth*2
		;move.b	#fx_VibratoSpeed,2(a2)
		;move.b	d0,3(a2)
		;move.b	#fx_VibratoDown,d0
		rts

PT_VolumeSlide	move.b	d1,d2
		and.b	#$0f,d2
		lsr.b	#4,d1
		neg.b	d2
		add.b	d2,d1
		beq.b	.nothing
		bpl.b	.plus
		neg.b	d1
		lsl	#4,d1
		move.b	#fx_PTVolSlideDown,d0
		rts
.plus		lsl	#4,d1
		move.b	#fx_PTVolSlideUp,d0
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_Portamento_VolumeSlide
		bsr	PT_VolumeSlide
		move.b	#fx_PTPortamento,2(a2)
		rts

PT_Vibrato_VolumeSlide
		bsr	PT_VolumeSlide
		move.b	#fx_PTVibrato,2(a2)
		rts

PT_Tremolo	move.b	#fx_PTTremolo,d0
		rts

PT_SampleOffset	move.b	#fx_SampleOffset,d0
		rts

PT_PositionJump	clr.b	d0	Is done in the main routine
		clr.b	d1
		rts

PT_Volume	move.b	#fx_Volume,d0
		cmp.b	#$40,d1
		bls.b	.x
		move.b	#$40,d1
.x		rts

PT_PatternBreak	clr.b	d0	Is done in the main routine
		clr.b	d1
		rts

PT_Speed	move.b	#fx_SpeedAll,d0
		rts

PT_Filter	tst.b	d1
		beq.b	.zero
		clr.b	d1
		bra.b	.skipzero
.zero		move.b	#1,d1
.skipzero	move.b	#fx_Filter,d0
		rts

PT_PitchUp	and.b	#$0f,d1
		beq.b	.nothing
		move.b	#fx_PTFineSlideUp,d0
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_PitchDown	and.b	#$0f,d1
		beq.b	.nothing
		move.b	#fx_PTFineSlideDown,d0
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_Glissanto	clr.b	d0	Is removed = lack of use
		clr.b	d1
		rts

PT_VibratoWave	and.b	#$0f,d1
		cmp.b	#2,d1
		bne.b	.skip
		move.b	#3,d1
.skip		move.b	#fx_PTVibratoWave,d0
		rts

PT_SetFinetune	move.b	#fx_SetFinetune,d0
		and	#$f,d1
		lsl	#2,d1
		subq	#6,d1
		rts

PT_PatternLoop	clr.b	d0	Is done in the main routine
		clr.b	d1
		rts

PT_TremoloWave	and.b	#$0f,d1
		cmp.b	#2,d1
		bne.b	.skip
		move.b	#3,d1
.skip		move.b	#fx_TremoloWave,d0
		rts

PT_RetrigNote	and	#$000f,d1
		beq.b	.nothing
		movem.l	PT_MakeArpeggioRegs,-(sp)
		subq	#1,d1
		move	d1,d0
		moveq	#0,d2
		lea	_CopyBuffer+1024(a5),a3
		move.l	a3,a4
		move.b	#-61,(a4)+
		clr.b	(a4)+
		move.l	#$06000000,(a4)+
		addq	#6,d2
		dbf	d1,.waitloop
		bra.b	.dojump
.waitloop	clr.b	(a4)+
		bsr.b	.clear
		dbf	d1,.waitloop
.dojump		move.b	#62,(a4)+
		bsr.b	.clear
		bra	PT_MakeArpeggio
.clear		clr.b	(a4)+
		clr.l	(a4)+
		addq	#6,d2
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_VolumeAdd	and.b	#$0f,d1
		beq.b	.nothing
		move.b	#fx_VolumeAdd,d0
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_VolumeSub	and.b	#$0f,d1
		beq.b	.nothing
		move.b	#fx_VolumeSub,d0
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_CutNote	and	#$000f,d1
		beq.b	.nothing
		movem.l	PT_MakeArpeggioRegs,-(sp)
		subq	#1,d1
		move	d1,d0
		moveq	#0,d2
		lea	_CopyBuffer+1024(a5),a3
		move.l	a3,a4
		move.b	#-61,(a4)+
		bsr.b	.clear
		dbf	d1,.waitloop
		bra.b	.dojump
.waitloop	clr.b	(a4)+
		bsr.b	.clear
		dbf	d1,.waitloop
.dojump		clr	(a4)+
		move.b	#3,(a4)+
		clr.b	(a4)+
		clr	(a4)+
		addq	#6,d2
		move.b	#61,(a4)+
		bsr.b	.clear
		bra	PT_MakeArpeggio
.clear		clr.b	(a4)+
		clr.l	(a4)+
		addq	#6,d2
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

PT_DelayNote	and	#$000f,d1
		beq.b	.nothing
		movem.l	PT_MakeArpeggioRegs,-(sp)
		subq	#1,d1
		moveq	#0,d2
		lea	_CopyBuffer+1024(a5),a3
		move.l	a3,a4
.waitloop	clr.b	(a4)+
		bsr.b	.clear
		dbf	d1,.waitloop
		move.b	#-61,(a4)+
		clr.b	(a4)+
		move.l	#$06000000,(a4)+
		addq	#6,d2
.endarp		move.b	#61,(a4)+
		bsr.b	.clear
		bra	PT_MakeArpeggio
.clear		clr.b	(a4)+
		clr.l	(a4)+
		addq	#6,d2
		rts
.nothing	clr.b	d0
		clr.b	d1
		rts

* Wait i alla 4 Parts
PT_DelayPattern	or.b	#$e0,d0
		rts

PT_InvertLoop	clr.b	d0	Is removed = lack of use
		clr.b	d1
		rts

PT_PeriodTable	dc.w	856,808,762,720,678,640,604,570,538,508,480,453
		dc.w	428,404,381,360,339,320,302,285,269,254,240,226
		dc.w	214,202,190,180,170,160,151,143,135,127,120,113
ML_PeriodTable	dc.w	25,26,27,28,29,30,31,32,33,34,35,36
		dc.w	37,38,39,40,41,42,43,44,45,46,47,48
		dc.w	49,50,51,52,53,54,55,56,57,58,59,60
ML_PeriodTableOffset	equ	ML_PeriodTable-PT_PeriodTable

Untitled_Txt	dc.b	"Untitled",0
Unused_Txt	dc.b	"Unused",0
		even

LastSavedNum	dc.w	0
LastSaved	dcb.l	1024,0

SaveMod		move.b	#1,_LoadError(a5)
		bra.b	SaveMod1

SaveModule	clr.b	_LoadError(a5)
SaveMod1	move	#$0100,_BlockPlay(a5)
		jsr	FreeVoices
		jsr	FreePart
		jsr	FreeArpg		Lägger in ID2 i d4.l , ANVÄNDS NEDAN
		bsr	InputOff
		tst.b	_LoadError(a5)
		bne	.savemod2

		lea	WindowTitle+1,a0
		lea	_CopyBuffer(a5),a1
		clr.b	_CopyOf_(a5)
		moveq	#29,d0

.ModCheck	move.b	(a0),d1
		cmp.b	#"m",d1
		beq.b	.M1_ok
		cmp.b	#"M",d1
		beq.b	.M1_ok
		bra.b	.MlCheck
.M1_ok		move.b	1(a0),d1
		cmp.b	#"o",d1
		beq.b	.O1_ok
		cmp.b	#"O",d1
		beq.b	.O1_ok
		bra.b	.MlCheck
.O1_ok		move.b	2(a0),d1
		cmp.b	#"d",d1
		beq.b	.D1_ok
		cmp.b	#"D",d1
		beq.b	.D1_ok
		bra.b	.MlCheck
.D1_ok		cmp.b	#".",3(a0)
		bne.b	.MlCheck
.Ml1		addq	#4,a0
		bra.b	.Ml

.MlCheck	move.b	(a0),d1
		cmp.b	#"m",d1
		beq.b	.M_ok
		cmp.b	#"M",d1
		beq.b	.M_ok
		bra.b	.Ml
.M_ok		move.b	1(a0),d1
		cmp.b	#"l",d1
		beq.b	.L_ok
		cmp.b	#"L",d1
		beq.b	.L_ok
		bra.b	.Ml
.L_ok		cmp.b	#".",2(a0)
		beq.b	.move
.Ml		subq	#3,d0
		move.b	#"M",(a1)+
		move.b	#"l",(a1)+
		move.b	#".",(a1)+

.move		move.b	(a0)+,(a1)
		tst.b	(a1)+
		dbeq	d0,.move
		cmp	#29-4,d0
		bge.b	.ok
		subq	#1,a0
		move.b	-(a0),d0
		cmp.b	#"d",d0
		beq.b	.d_ok
		cmp.b	#"D",d0
		beq.b	.d_ok
		bra.b	.ok
.d_ok		move.b	-(a0),d0
		cmp.b	#"o",d0
		beq.b	.o_ok
		cmp.b	#"O",d0
		beq.b	.o_ok
		bra.b	.ok
.o_ok		move.b	-(a0),d0
		cmp.b	#"m",d0
		beq.b	.m_ok
		cmp.b	#"M",d0
		beq.b	.m_ok
		bra.b	.ok
.m_ok		cmp.b	#".",-(a0)
		bne.b	.ok
		subq	#1,a1
		clr.b	-(a1)
		clr.b	-(a1)
		clr.b	-(a1)
		clr.b	-(a1)
.ok		move.l	_Window1(a5),SFRWindowPtr
		move.l	#SaveModule_Txt,SFRTitleText
		lea	_CopyBuffer(a5),a0
		move.l	a0,SFRFileName
		move.l	_AslFileReqSP(a5),a0
		lea	SFileReqTags,a1
		CallAsl AslRequest
		tst.l	d0
		beq	.exit
		move.l	_AslFileReqSP(a5),a4
		lea	_CopyBuffer(a5),a3
		move.l	fr_Drawer(a4),a0
		move	#512,d5
		tst.b	(a0)
		beq.b	.nodrawer
.movedrawer	move.b	(a0)+,(a3)+
		dbeq	d5,.movedrawer
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer
		move.b	#"/",(a3)+
.nodrawer	move.l	a3,_FileNamePtr(a5)
		move.l	fr_File(a4),a0
.movefile	move.b	(a0)+,(a3)+
		dbeq	d5,.movefile
		bra.b	.saveas

.savemod2	bsr	CheckLowChipMem
		tst.l	d6
		beq.b	.skip
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#SaveMod_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	.exit
.skip		move.l	_AslFileReqSaveMod(a5),a4
		lea	_CopyBuffer(a5),a3
		move.l	fr_Drawer(a4),a0
		move	#512,d5
		tst.b	(a0)
		beq.b	.nodrawer2
.movedrawer2	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movedrawer2
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer2
		move.b	#"/",(a3)+
.nodrawer2	move.l	a3,_FileNamePtr(a5)
		lea	WindowTitle+1,a0
.movefile2	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movefile2

.saveas		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#MODE_NEWFILE,d2
		CallDOS Open
		move.l	d0,_FileHandle(a5)
		beq	.exit

		lea	LastSaved,a3
		lea	_String(a5),a2
		move.l	#"MLED",(a2)
		move.l	#"MODL",4(a2)
		moveq	#0,d3
		move	LastSavedNum,d3
		cmp	#1024,d3
		bne.b	.normal
		lsl	#2,d3
		move.l	d4,-4(a3,d3.w)
		bra.b	.same
.normal		lsl	#2,d3
		beq.b	.new
		cmp.l	-4(a3,d3.w),d4
		beq.b	.same
.new		move.l	d4,(a3,d3.w)
		addq	#4,d3
.same		move.l	d3,d4
		move.l	d3,8(a2)

		moveq	#12,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		move.l	d4,d3
		move.l	a3,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		move.l	#"VERS",(a2)
		move.l	#6,4(a2)
		move	VersNum,8(a2)
		move.l	VersStr,10(a2)
		moveq	#14,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		move.l	#"TUNE",(a2)
		lea	_TuneListView(a5),a4
.tuneloop	TSTNODE	a4,a4
		beq	.parts
		move.l	#tune_LOADSIZE,4(a2)
		lea	tune_Ch1Ptr(a4),a0
		lea	_ZeroBuffer(a5),a3
		move	#$0010,d2
		move.l	a3,d3
		lea	_ChannelSizes(a5),a3
		moveq	#7,d0
		moveq	#8,d6
.tuneloop1	move.l	(a0)+,a1
		cmp.l	d3,a1
		beq	.zero
		move.l	#chnl_SIZE,d5
		add.l	d5,a1
		move	#255,d1
.tunetest	cmp	-(a1),d2
		bne.b	.savetune
		subq.l	#2,d5
		dbf	d1,.tunetest
.savetune	add.l	d5,4(a2)
		move.l	d5,(a3)+
		beq.b	.loopa
		move	d0,d6
.loopa		dbf	d0,.tuneloop1
		moveq	#8,d0
		sub	d6,d0
		move.b	d0,tune_Channels(a4)
		move.l	d0,d7
		lsl	#2,d7
		add.l	d7,4(a2)
		moveq	#8,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		move.l	#tune_ChPtrs,d3
		move.l	a4,d2
		add.l	#tune_START,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		move.l	d7,d3
		lea	_ChannelSizes(a5),a0
		move.l	a0,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		moveq	#7,d4
		move.l	a2,-(sp)
		lea	tune_Ch1Ptr(a4),a2
		lea	_ChannelSizes(a5),a3
.tuneloop2	move.l	(a2)+,d2
		move.l	(a3)+,d3
		beq.b	.savenot
		move.l	_FileHandle(a5),d1
		CallLib Write
.savenot	dbf	d4,.tuneloop2
		move.l	(sp)+,a2
		bra	.tuneloop
.zero		clr.l	(a3)+
		bra.b	.loopa

.parts		move.l	#"PART",(a2)
		moveq	#0,d4
		move	#1023,d7
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a3
.partloop	cmp.l	(a4)+,a3
		beq	.partzero
		move	#127,d0
		move.l	#part_SIZE,d5
		move.l	-4(a4),a0
		add	#part_SIZE,a0
.parttest	tst.l	-4(a0)
		bne.b	.savepart
		tst.l	-8(a0)
		bne.b	.savepart
		tst.l	-12(a0)
		bne.b	.savepart
		sub	#12,a0
		sub.l	#12,d5
		dbf	d0,.parttest
		bra	.partzero
.savepart	clr.b	_CopyOf_(a5)
		move.l	-4(a4),a0
		lea	_CopyBuffer(a5),a1
.ploop		move.l	a1,a3
		clr.b	(a1)+
		tst	(a0)
		beq.b	.pnext1
		or.b	#%000001,(a3)
		move.b	(a0),(a1)+
		move.b	1(a0),(a1)+
.pnext1		tst	2(a0)
		beq.b	.pnext2
		or.b	#%000010,(a3)
		move.b	2(a0),(a1)+
		move.b	3(a0),(a1)+
.pnext2		tst	4(a0)
		beq.b	.pnext3
		or.b	#%000100,(a3)
		move.b	4(a0),(a1)+
		move.b	5(a0),(a1)+
.pnext3		tst	6(a0)
		beq.b	.pnext4
		or.b	#%001000,(a3)
		move.b	6(a0),(a1)+
		move.b	7(a0),(a1)+
.pnext4		tst	8(a0)
		beq.b	.pnext5
		or.b	#%010000,(a3)
		move.b	8(a0),(a1)+
		move.b	9(a0),(a1)+
.pnext5		tst	10(a0)
		beq.b	.pnext6
		or.b	#%100000,(a3)
		move.b	10(a0),(a1)+
		move.b	11(a0),(a1)+
.pnext6		add	#12,a0
		sub.l	#12,d5
		bhi.b	.ploop
		move.b	#$ff,(a1)+
		move.l	a1,d0
		btst	#0,d0
		beq.b	.pskip
		move.b	#$ff,(a1)+
.pskip		lea	_CopyBuffer(a5),a3
		sub.l	a3,a1
		move.l	a1,d5
		move.l	d5,4(a2)
		addq.l	#2,4(a2)
		move	d4,8(a2)
		moveq	#10,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		move.l	d5,d3
		move.l	a3,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
.partzero	addq	#1,d4
		dbf	d7,.partloop

.arpgs		move.l	#"ARPG",(a2)
		moveq	#0,d4
		move	#255,d7
		lea	_ArpgPtrs(a5),a4
		lea	_ZeroBuffer(a5),a3
.arpgloop	cmp.l	(a4)+,a3
		beq.b	.arpgzero
		move	#127,d0
		move.l	#arpg_SIZE,d5
		move.l	-4(a4),a0
		add	#arpg_SIZE,a0
.arpgtest	tst.l	-(a0)
		bne.b	.savearpg
		tst	-(a0)
		bne.b	.savearpg
		subq.l	#6,d5
		dbf	d0,.arpgtest
.savearpg	move.l	d5,4(a2)
		addq.l	#2,4(a2)
		move	d4,8(a2)
		moveq	#10,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		move.l	d5,d3
		move.l	-4(a4),d2
		move.l	_FileHandle(a5),d1
		CallLib Write
.arpgzero	addq	#1,d4
		dbf	d7,.arpgloop

		move.l	#"INST",(a2)
		move.l	#inst_SIZE,4(a2)
		lea	_InstListView(a5),a4
		move.l	(a4),a4
.instloop	TSTNODE	a4,a4
		beq.b	.wavesamples
		moveq	#8,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		move.l	#inst_SIZE,d3
		move.l	a4,d2
		add.l	#inst_START,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		bra	.instloop

.wavesamples	move.l	#"SMPL",(a2)
		lea	_SmplListView(a5),a4
.wsloop		TSTNODE	a4,a4
		beq	.infopage

		moveq	#0,d4
		move	smpl_Length(a4),d4
		add.l	d4,d4
		lea	smpl_SampleData(a4),a0	Source Beg Pointer / CheckDeltaPacker
		lea	(a0,d4.l),a3		Source End Pointer / CheckDeltaPacker
		move.l	a0,d5
		tst.b	_PackSamples(a5)
		beq.b	.nopack
		move.l	a2,-(sp)
		bsr	CheckDeltaPacker
		move.l	(sp)+,a2

		cmp.l	d7,d4
		bhs.b	.pack
.nopack		move.l	d4,d7

.pack		add.l	#smpl_SIZE,d7
		move.l	d7,4(a2)
		move.l	d4,8(a2)
		move.b	_DeltaCommand(a5),12(a2)
		clr.b	13(a2)			PADBYTE
		moveq	#14,d3			Write Chunk
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallDOS Write
		move.l	#smpl_SIZE,d3		Write Sample Struct
		move.l	a4,d2
		add.l	#smpl_START,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		tst.b	_PackSamples(a5)
		beq.b	.skippack
		sub.l	#smpl_SIZE,d7
		cmp.l	d7,d4
		bhi.b	.allocpackbuff

.skippack	move.l	d4,d3			Write UnPacked Sample Data
		move.l	d5,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		bra	.wsloop

.allocpackbuff	move.l	d7,d6
.alloc		move.l	d6,d0
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		tst.l	d0
		beq.b	.again
		move.l	d0,_DeltaPackBuffer(a5)
		move.l	d6,_DeltaPackBufferLen(a5)
		move.l	d5,a0
		move.l	a2,-(sp)
		bsr	DeltaPacker		Uses	d0,d1,d2,d3,d6,d7,a0,a1,a2,a3
		move.l	(sp)+,a2
		move.l	_DeltaPackBuffer(a5),a1
		move.l	_DeltaPackBufferLen(a5),d0
		CallSys	FreeMem
		bra	.wsloop

.again		lsr.l	#1,d6
		cmp.l	#256*2*8,d6
		bhi.b	.alloc
		clr.b	_CopyOf_(a5)
		lea	_CopyBuffer(a5),a0
		move.l	a0,_DeltaPackBuffer(a5)
		move.l	#256*2*8,_DeltaPackBufferLen(a5)
		move.l	d5,a0
		move.l	a2,-(sp)
		bsr	DeltaPacker		Uses	d0,d1,d2,d3,d6,d7,a0,a1,a2,a3
		move.l	(sp)+,a2
		bra	.wsloop

.infopage	lea	_CopyBuffer(a5),a2
		move.l	#"INFO",(a2)+
		addq	#4,a2		Reserved for Hunk length.l

		move.l	_Str6TitleGad(a5),a0
		lea	_Title6Str(a5),a1
		moveq	#64-1,d0
		bsr	.getstring
		move.l	_Str6AuthorGad(a5),a0
		lea	_Author6Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		move.l	_Str6DateGad(a5),a0
		lea	_Date6Str(a5),a1
		moveq	#16-1,d0
		bsr.b	.getstring
		move.l	_Str6DurationGad(a5),a0
		lea	_Duration6Str(a5),a1
		moveq	#16-1,d0
		bsr.b	.getstring
		move.l	_Str6Info1Gad(a5),a0
		lea	_Info16Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		move.l	_Str6Info2Gad(a5),a0
		lea	_Info26Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		move.l	_Str6Info3Gad(a5),a0
		lea	_Info36Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		move.l	_Str6Info4Gad(a5),a0
		lea	_Info46Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring
		move.l	_Str6Info5Gad(a5),a0
		lea	_Info56Str(a5),a1
		moveq	#64-1,d0
		bsr.b	.getstring

.saveinfo	lea	_CopyBuffer(a5),a1
		sub.l	a1,a2
		move.l	a2,d3
		move.l	a2,d4
		subq.l	#8,d4
		move.l	d4,4(a1)	Hunk Length
		move.l	a1,d2
		move.l	_FileHandle(a5),d1
		CallDOS Write
		bra.b	.done

.getstring	tst.l	_Window6(a5)
		beq.b	.stringget
		move.l	gg_SpecialInfo(a0),a0
		move.l	si_Buffer(a0),a1
		move	si_NumChars(a0),d1
		move	d1,d0
		beq.b	.getstringdone
		subq	#1,d0
.getstringloop	move.b	(a1)+,(a2)+
		dbf	d0,.getstringloop
.getstringdone	clr.b	(a2)+
		rts

.stringget	move.b	(a1)+,(a2)+
		dbeq	d0,.stringget
		rts

.done		move.l	_FileHandle(a5),d1
		CallDOS Close
		tst.b	_LoadError(a5)
		bne.b	.exit
		move.l	_AslFileReqSP(a5),a4
		move.l	a4,_AslFileReqSaveMod(a5)		
		moveq	#29,d5
		move.l	fr_File(a4),a0
		lea	WindowTitle+1,a2
.copyname	move.b	(a0)+,(a2)+
		dbeq	d5,.copyname
		move.l	_Window1(a5),a0
		lea	WindowTitle,a1
		move.l	#-1,a2
		CallIntuition SetWindowTitles
		move.l	_Window2(a5),a0
		lea	WindowTitle,a1
		CallLib SetWindowTitles

.exit		jsr	AllocVoices
		bsr	InputOn
		clr	_BlockPlay(a5)
		rts

_AslFileReqLWS	rs.l	1
_Title6Str	rs.b	64
_Author6Str	rs.b	64
_Date6Str	rs.b	16
_Duration6Str	rs.b	16
_Info16Str	rs.b	64
_Info26Str	rs.b	64
_Info36Str	rs.b	64
_Info46Str	rs.b	64
_Info56Str	rs.b	64


LoadSample	move	#$0100,_BlockPlay(a5)
		bsr	InputOff
		move.l	#LoadS_Txt,LFRTitleText
		move.l	_AslFileReqLS(a5),_AslFileReqLWS(a5)
		bra.b	LoadWaveSample

LoadWave	move	#$0100,_BlockPlay(a5)
		bsr	InputOff
		move.l	#LoadW_Txt,LFRTitleText
		move.l	_AslFileReqLW(a5),_AslFileReqLWS(a5)

LoadWaveSample	move.l	_Window2(a5),LFRWindowPtr
		move.l	#FRF_DOPATTERNS!FRF_DOMULTISELECT,LFRFlags1
		move.l	#TAG_DONE,LFRIniPat
		move.l	_AslFileReqLWS(a5),a0
		lea	LFileReqTags,a1
		CallAsl AslRequest
		move.l	d0,d7
		bsr	InputOn
		move.l	d7,-(sp)
		jsr	ClrSmplScrPos
		jsr	ClrSmplScrGad
		move.l	(sp)+,d7
		jsr	RemSmplList
		bsr	InputOff
		tst.l	d7
		beq	.exit
		move.l	_AslFileReqLWS(a5),a4
		lea	_CopyBuffer(a5),a3
		clr.b	_CopyOf_(a5)
		move.l	fr_Drawer(a4),a0
		move	#512,d5
		tst.b	(a0)
		beq.b	.nodrawer
.movedrawer	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movedrawer
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer
		move.b	#"/",(a3)+
.nodrawer	move.l	a3,_FileNamePtr(a5)

		move.l	fr_NumArgs(a4),d7
		move.l	fr_ArgList(a4),a2
.loop		move.l	_FileNamePtr(a5),a0
		move.l	wa_Name(a2),a1
		move	d5,d0
.movefile	move.b	(a1)+,(a0)
		tst.b	(a0)+
		dbeq	d0,.movefile

		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#ACCESS_READ,d2
		CallDOS Lock
		move.l	d0,_Lock(a5)
		beq	.exit
		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#MODE_OLDFILE,d2
		CallLib Open
		move.l	d0,_FileHandle(a5)
		beq	.unlock
		move.l	_Lock(a5),d1
		move.l	_FIBPtr(a5),d2
		CallLib Examine
		tst.l	d0
		beq	.closefile
		move.l	_FileHandle(a5),d1
		lea	_IFFData(a5),a0
		move.l	a0,d2
		moveq	#48,d3
		CallDOS Read
		tst.l	d0
		bmi	.closefile
		lea	_IFFData(a5),a0
		move.l	a0,a1
		cmp.l	#"FORM",(a0)+
		bne.b	.raw
		addq	#4,a0
		cmp.l	#"8SVX",(a0)+
		bne	.closefile
		cmp.l	#"VHDR",(a0)+
		bne	.closefile
		add.l	(a0)+,a0
		move.l	a0,d6
.checkbody	move.l	d6,a0
		cmp.l	#"BODY",(a0)
		beq.b	.find
		move.l	_FileHandle(a5),d1
		move.l	4(a0),d2
		move.l	#OFFSET_CURRENT,d3
		CallDOS Seek
		tst.l	d0
		bmi	.closefile
		move.l	_FileHandle(a5),d1
		move.l	d6,d2
		moveq	#8,d3
		CallDOS Read
		tst.l	d0
		bmi	.closefile
		bra	.checkbody
.find		move.l	4(a0),d0
		bra.b	.iff
.raw		move.l	_FIBPtr(a5),a0
		move.l	fib_Size(a0),d0
.iff		cmp.l	#$1fff8,d0
		bls.b	.lenok
		move.l	#$1fff8,d0
		lea	_IFFData(a5),a0
		cmp.l	#"FORM",(a0)
		bne.b	.lenok
		move.l	d0,44(a0)
		clr.l	20(a0)
		clr.l	24(a0)
.lenok		move.l	d0,d6
		cmp.l	#256,d0
		bne.b	.smpl
		move	#496,d0
.smpl		add.l	#smpl_SampleData,d0
		move.l	d0,d4
		move.l	#MEMF_CHIP!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	.closefile
		lea	_SmplListView(a5),a0
		move.l	d0,a1
		move.l	d0,a3
		ADDTAIL
		addq.b	#1,_WsMaxNum+1(a5)
		bcc.b	.okey
		move	#255,_WsMaxNum(a5)
		bra	.freemem
.okey		lea	smpl_NameStr(a3),a0
		move.l	a0,smpl_Name(a3)
		lea	_WsPtrs(a5),a1
		move	_WsMaxNum(a5),d1
		add	d1,d1
		add	d1,d1
		move.l	a3,(a1,d1.w)
		move	_WsMaxNum(a5),d0
		add	d0,d0
		lea	_AscIIHexTab(a5),a1
		add	d0,a1
		move.b	(a1)+,(a0)+
		move.b	(a1)+,(a0)+
		move.b	#$20,(a0)+
		move.l	wa_Name(a2),a1
		moveq	#30-1,d0
.copy		move.b	(a1)+,(a0)+
		dbeq	d0,.copy
		lea	_IFFData(a5),a0
		cmp.l	#"FORM",(a0)
		beq.b	.load
		move.l	_FileHandle(a5),d1
		moveq	#0,d2
		move.l	#OFFSET_BEGINNING,d3
		CallDOS Seek
		tst.l	d0
		bmi.b	.freemem
.load		move.l	_FileHandle(a5),d1
		lea	smpl_SampleData(a3),a0
		move.l	a0,d2
		move.l	d6,d3
		CallDOS Read
		tst.l	d0
		bmi.b	.freemem
		move.l	_FileHandle(a5),d1
		CallLib Close
		move.l	_Lock(a5),d1
		CallLib UnLock
		bsr.b	FixWsPointers
		add.l	#wa_SIZEOF,a2
		subq	#1,d7
		bne	.loop
		bra.b	.exit
.freemem	move.l	a3,a1
		REMOVE
		move.l	a3,a1
		move.l	d4,d0
		CallSys FreeMem
.closefile	move.l	_FileHandle(a5),d1
		CallDOS Close
.unlock		move.l	_Lock(a5),d1
		CallLib UnLock
.exit		jsr	AddSmplList
		jsr	InstSelec
		bsr	InputOn
		clr	_BlockPlay(a5)
		rts

FixWsPointers	lea	smpl_SampleData(a3),a1
		lea	_IFFData(a5),a4
		cmp.l	#"FORM",(a4)
		bne.b	.raw
.found		move.l	44(a4),d0
		lsr.l	#1,d0
		move	d0,smpl_Length(a3)
		move.l	a1,smpl_Pointer(a3)
		add.l	20(a4),a1
		move.l	a1,smpl_RepPointer(a3)
		move.l	24(a4),d0
		lsr.l	#1,d0
		move	d0,smpl_RepLength(a3)
		bne.b	.checkwavelen
		move.l	smpl_Pointer(a3),smpl_RepPointer(a3)
		bra.b	.checkwavelen
.raw		move.l	a1,smpl_Pointer(a3)
		move.l	d6,d0
		lsr.l	#1,d0
		move	d0,smpl_Length(a3)
		move.l	a1,smpl_RepPointer(a3)
		clr	smpl_RepLength(a3)
.checkwavelen	move	smpl_Length(a3),d0
		cmp	#128,d0
		beq.b	.setwave
		clr.b	smpl_Type(a3)
		rts
.setwave	move.b	#3,smpl_Type(a3)
		move	d0,smpl_RepLength(a3)
		move	#255,d0
		lea	smpl_SampleData(a3),a0
.convertwave	cmp.b	#$80,(a0)+
		bne.b	.conok
		move.b	#$81,-1(a0)
.conok		dbf	d0,.convertwave
		lea	smpl_SampleData(a3),a0
		lea	256(a0),a1
		move	#239,d0
.makewaves	move.b	(a0)+,(a1)+
		addq	#1,a0
		dbf	d0,.makewaves
		rts

_AslFileReqSWS	rs.l	1
_IffRaw		rs.w	1

SaveWsRaw	clr	_IffRaw(a5)
		move.l	#SaveWsRAW_Txt,SFRTitleText
		bra.b	SaveWaveSample

SaveWsIff	move	#1,_IffRaw(a5)
		move.l	#SaveWsIFF_Txt,SFRTitleText

SaveWaveSample	tst	_WsMaxNum(a5)
		beq	.reply
		move	#$0100,_BlockPlay(a5)
		bsr	InputOff
		jsr	GetSmpl
		move.l	a0,a2
		move.l	_AslFileReqSS(a5),_AslFileReqSWS(a5)
		tst.b	smpl_Type(a2)
		beq.b	.ls
		move.l	_AslFileReqSW(a5),_AslFileReqSWS(a5)
.ls		lea	smpl_NameStr+3(a2),a0
		lea	_CopyBuffer(a5),a1
		clr.b	_CopyOf_(a5)
		moveq	#14,d0
.move		move.b	(a0)+,(a1)+
		dbf	d0,.move
		moveq	#14,d0
.test		cmp.b	#$20,-(a1)
		dbne	d0,.test
		clr.b	1(a1)
		move.l	_Window2(a5),SFRWindowPtr
		lea	_CopyBuffer(a5),a0
		move.l	a0,SFRFileName
		move.l	_AslFileReqSWS(a5),a0
		lea	SFileReqTags,a1
		CallAsl AslRequest
		tst.l	d0
		beq	.exit
		move.l	_AslFileReqSWS(a5),a4
		lea	_CopyBuffer(a5),a3
		move.l	fr_Drawer(a4),a0
		move	#512,d5
		tst.b	(a0)
		beq.b	.nodrawer
.movedrawer	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movedrawer
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer
		move.b	#"/",(a3)+
.nodrawer	move.l	a3,_FileNamePtr(a5)
		move.l	fr_File(a4),a0
.movefile	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movefile

		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#MODE_NEWFILE,d2
		CallDOS Open
		move.l	d0,_FileHandle(a5)
		beq	.exit
		tst	_IffRaw(a5)
		beq	.save
		lea	_IFFData(a5),a0
		move.l	#"FORM",(a0)+
		moveq	#0,d0
		move	smpl_Length(a2),d0
		add.l	d0,d0
		move.l	d0,d1
		add.l	#68,d0
		move.l	d0,(a0)+
		move.l	#"8SVX",(a0)+
		move.l	#"VHDR",(a0)+
		move.l	#20,(a0)+
		tst	smpl_RepLength(a2)
		bne.b	.repeat
		move.l	d1,(a0)+
		clr.l	(a0)+
		bra.b	.continue
.repeat		move.l	smpl_RepPointer(a2),d0
		sub.l	smpl_Pointer(a2),d0
		move.l	d0,(a0)+
		moveq	#0,d0
		move	smpl_RepLength(a2),d0
		add.l	d0,d0
		move.l	d0,(a0)+
.continue	move.l	#32,(a0)+
		move	#16884,(a0)+
		move	#$0100,(a0)+
		move.l	#$00010000,(a0)+
		move.l	#"ANNO",(a0)+
		move.l	#20,(a0)+
		move.l	#"Musi",(a0)+
		move.l	#"clin",(a0)+
		move.l	#"eEdi",(a0)+
		move.l	#"tor.",(a0)+
		clr.l	(a0)+
		move.l	#"BODY",(a0)+
		moveq	#0,d0
		move	smpl_Length(a2),d0
		add.l	d0,d0
		move.l	d0,(a0)+
		move.l	_FileHandle(a5),d1
		lea	_IFFData(a5),a0
		move.l	a0,d2
		moveq	#76,d3
		CallDOS Write
.save		move.l	_FileHandle(a5),d1
		lea	smpl_SampleData(a2),a0
		move.l	a0,d2
		moveq	#0,d3
		move	smpl_Length(a2),d3
		add.l	d3,d3
		CallDOS Write
		move.l	_FileHandle(a5),d1
		CallLib Close
.exit		bsr	InputOn
		clr	_BlockPlay(a5)
.reply		rts

_LIFileNameLen	rs.w	1

LoadExternInst	move	#$0100,_BlockPlay(a5)
		clr.b	_LoadError(a5)
		bsr	InputOff
		move.l	_Window1(a5),LFRWindowPtr
		move.l	#LoadInst_Txt,LFRTitleText
		move.l	#FRF_DOPATTERNS!FRF_DOMULTISELECT,LFRFlags1
		move.l	#TAG_DONE,LFRIniPat
		move.l	_AslFileReqLI(a5),a0
		lea	LFileReqTags,a1
		CallAsl AslRequest
		tst.l	d0
		beq	LoadError1

		move.l	_AslFileReqLI(a5),a4
		lea	_CopyBuffer(a5),a3
		clr.b	_CopyOf_(a5)
		move.l	fr_Drawer(a4),a0
		move	#512,d5
		tst.b	(a0)
		beq.b	.nodrawer
.movedrawer	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movedrawer
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer
		move.b	#"/",(a3)+
.nodrawer	move.l	a3,_FileNamePtr(a5)
		move	d5,_LIFileNameLen(a5)
		movem.l	d4/a4,-(sp)
		move	#$0101,_BlockPlay(a5)
		jsr	Stoppa
		jsr	ClrInstScrPos
		jsr	ClrInstScrGads
		jsr	RemInstList
		jsr	RemSmplList
		movem.l	(sp)+,d4/a4
		move.l	fr_NumArgs(a4),d4
		move.l	fr_ArgList(a4),a4
.loopa		move.l	_FileNamePtr(a5),a0
		move.l	wa_Name(a4),a1
		move	_LIFileNameLen(a5),d0
.movefile	move.b	(a1)+,(a0)
		tst.b	(a0)+
		dbeq	d0,.movefile

		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#ACCESS_READ,d2
		CallDOS Lock
		move.l	d0,_Lock(a5)
		beq	.error
		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#MODE_OLDFILE,d2
		CallLib Open
		move.l	d0,_FileHandle(a5)
		beq	.error

		lea	_String(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		moveq	#4,d3
		CallDOS Read
		tst.l	d0
		ble	.error
		move.l	_String(a5),_VERSION(a5)
		cmp.l	#"MLED",_VERSION(a5)
		bne	.error
		lea	_String+4(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		moveq	#12,d3
		CallDOS Read
		tst.l	d0
		ble.b	.error
		cmp.l	#"INST",_String+4(a5)
		bne.b	.error
		cmp.l	#"VERS",_String+8(a5)
		bne.b	.error
		lea	_String+16(a5),a0
		move.l	_FileHandle(a5),d1
		move.l	a0,d2
		move.l	_String+12(a5),d3
		CallDOS Read
		tst.l	d0
		ble.b	.error

.loadheader	move.l	_FileHandle(a5),d1
		lea	_String(a5),a0
		move.l	a0,d2
		moveq	#8,d3
		CallDOS Read
		tst.l	d0
		ble.b	.error

		cmp.l	#"INST",_String(a5)
		beq	.loadInst
		cmp.l	#"ARPG",_String(a5)
		beq	.loadArpg
		cmp.l	#"SMPL",_String(a5)
		beq	.loadSmpl

.error		move.l	_FileHandle(a5),d1
		CallDOS Close
		move.l	_Lock(a5),d1
		CallLib UnLock
		add.l	#wa_SIZEOF,a4
		subq	#1,d4
		bne	.loopa
		jsr	AddInstList
		jsr	AddSmplList
		move	_InstMaxNum(a5),_InstNum(a5)
		jsr	InstSelec
		jmp	LoadError1

.closefile2	jsr	AddInstList
		jsr	AddSmplList
		move	_InstMaxNum(a5),_InstNum(a5)
		jsr	InstSelec
		move.l	_FileHandle(a5),d1
		CallDOS Close
		move.l	_Lock(a5),d1
		CallLib UnLock
		jmp	LoadError1

.closefile	move.l	_FileHandle(a5),d1
		CallDOS Close
		move.l	_Lock(a5),d1
		CallLib UnLock
		jsr	AddInstList
		jsr	AddSmplList
		jmp	LoadError1

.loadInst	cmp	#255,_InstMaxNum(a5)
		bhi.b	.closefile
		move.l	#inst_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq.b	.closefile
		lea	_InstListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		lea	inst_NameStr(a1),a0
		move.l	a0,inst_Name(a1)
		addq	#1,_InstMaxNum(a5)
		move	_InstMaxNum(a5),d0
		add	d0,d0
		lea	_AscIIHexTab(a5),a2
		add	d0,a2
		move.b	(a2)+,(a0)+
		move.b	(a2)+,(a0)+
		move.b	#" ",(a0)
		move.l	a2,_InstNumPtr(a5)
		move.l	_FileHandle(a5),d1
		move.l	a1,a2
		add.l	#inst_START,a1
		move.l	a1,d2
		move.l	_String+4(a5),d3
		CallDOS Read
		tst.l	d0
		ble	.closefile
		bset	#InstBit,_LoadError(a5)
		lea	_InstPtrs(a5),a0
		move	_InstMaxNum(a5),d0
		add	d0,d0
		add	d0,d0
		move.l	a2,(a0,d0.w)

		move	_WsMaxNum(a5),d0
		add.b	d0,inst_SmplNumber(a2)
		bcs	.closefile

		btst	#MIX,inst_Effects2(a2)
		beq.b	.mixwavedone
		tst.b	inst_MixWaveNum(a2)
		beq.b	.mixwavedone
		add.b	d0,inst_MixWaveNum(a2)
		bcs	.closefile

.mixwavedone	btst	#TRANSFORM,inst_Effects2(a2)
		beq	.loadheader
		tst.b	inst_TraWaveNums(a2)
		beq.b	.nextTraWave1
		add.b	d0,inst_TraWaveNums(a2)
		bcs	.closefile
		bra.b	.endInst
.nextTraWave1	tst.b	inst_TraWaveNums+1(a2)
		beq.b	.nextTraWave2
		add.b	d0,inst_TraWaveNums+1(a2)
		bcs	.closefile
		bra.b	.endInst
.nextTraWave2	tst.b	inst_TraWaveNums+2(a2)
		beq.b	.nextTraWave3
		add.b	d0,inst_TraWaveNums+2(a2)
		bcs	.closefile
		bra.b	.endInst
.nextTraWave3	tst.b	inst_TraWaveNums+3(a2)
		beq.b	.nextTraWave4
		add.b	d0,inst_TraWaveNums+3(a2)
		bcs	.closefile
		bra.b	.endInst
.nextTraWave4	tst.b	inst_TraWaveNums+4(a2)
		beq.b	.endInst
		add.b	d0,inst_TraWaveNums+4(a2)
		bcs	.closefile
.endInst	bra	.loadheader

.loadArpg	jsr	GetEmptyArpg
		move.l	a0,d1
		tst.l	d1
		beq	.closefile
		move.l	a0,a2
		lea	_InstPtrs(a5),a0
		move	_InstMaxNum(a5),d1
		add	d1,d1
		add	d1,d1
		move.l	(a0,d1.w),a0
		move	d0,inst_ArpTable(a0)

		move.l	#arpg_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	.closefile
		move.l	d0,(a2)
		move.l	d0,a2
		move.l	_FileHandle(a5),d1
		moveq	#2,d2			Skip Arp Number
		move.l	#OFFSET_CURRENT,d3
		CallDOS Seek
		tst.l	d0
		ble	.closefile

		move.l	_FileHandle(a5),d1
		move.l	a2,d2
		move.l	_String+4(a5),d3
		subq.l	#2,d3
		CallDOS Read
		tst.l	d0
		ble	.closefile
		bset	#ArpgBit,_LoadError(a5)

		move	_WsMaxNum(a5),d0
		addq	#1,d0
		move	#256-1,d7

.nextArpg	cmp.b	#61,(a2)	End
		beq.b	.endArpg
		cmp	#62<<8,(a2)	Eternity Loop
		beq.b	.endArpg
		tst.b	1(a2)
		beq.b	.dbfArpg
		add.b	d0,1(a2)
		bcs	.closefile
.dbfArpg	addq	#6,a2
		dbf	d7,.nextArpg
.endArpg	bra	.loadheader

.loadSmpl	lea	_String+8(a5),a0
		move.l	a0,d2
		moveq	#6,d3
		move.l	_FileHandle(a5),d1
		CallDOS Read
		tst.l	d0
		ble	CloseFile

		move.l	_String+8(a5),d0
		cmp.l	#256,d0
		bne.b	.not
		add.l	#240,d0
.not		add.l	#smpl_SampleData,d0
		move.l	#MEMF_CHIP!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	CloseFile
		lea	_SmplListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		lea	smpl_NameStr(a1),a0
		move.l	a0,smpl_Name(a1)
		addq	#1,_WsMaxNum(a5)
		move	_WsMaxNum(a5),d0
		add	d0,d0
		lea	_AscIIHexTab(a5),a2
		add	d0,a2
		move.b	(a2)+,(a0)+
		move.b	(a2)+,(a0)+
		move.b	#" ",(a0)
		move.l	a2,_SmplNumPtr(a5)
		move.l	a1,a2
		move.l	a2,d2
		add.l	#smpl_START,d2
		move.l	#smpl_SIZE,d3
		move.l	_FileHandle(a5),d1
		CallDOS Read
		tst.l	d0
		ble	CloseFile

		move.l	_String+4(a5),d3
		sub.l	#smpl_SIZE,d3
		move.l	_String+8(a5),d0
		cmp.l	d0,d3
		bne.b	.depack

		lea	smpl_SampleData(a2),a1		Read UnPacked Sample
		move.l	a1,d2
		move.l	_FileHandle(a5),d1
		CallDOS Read
		tst.l	d0
		ble	CloseFile
		bra.b	.continue

.depack		move.l	d3,d7				Packed Sample Length / DeltaDePacker
.alloc		move.l	d3,d0
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		tst.l	d0
		beq.b	.again
		move.l	d0,_DeltaPackBuffer(a5)
		move.l	d3,_DeltaPackBufferLen(a5)
		lea	smpl_SampleData(a2),a1		Dest Beg Pointer / DeltaDePacker
		move.b	_String+12(a5),_DeltaCommand(a5)	DeltaCommand Byte
		bsr	DeltaDePacker			Uses	d0,d1,d2,d3,d5,d6,d7,a0,a1
		move.l	_DeltaPackBuffer(a5),a1
		move.l	_DeltaPackBufferLen(a5),d0
		CallSys	FreeMem
		bra.b	.continue

.again		lsr.l	#1,d3
		cmp.l	#256*2*8,d3
		bhi.b	.alloc
		clr.b	_CopyOf_(a5)
		lea	_CopyBuffer(a5),a0
		move.l	a0,_DeltaPackBuffer(a5)
		move.l	#256*2*8,_DeltaPackBufferLen(a5)
		lea	smpl_SampleData(a2),a1		Dest Beg Pointer / DeltaDePacker
		move.b	_String+12(a5),_DeltaCommand(a5)	DeltaCommand Byte
		bsr	DeltaDePacker			Uses	d0,d1,d2,d3,d5,d6,d7,a0,a1

.continue	move.l	_String+8(a5),d0
		cmp.l	#256,d0
		bne.b	.notwave
		lea	smpl_SampleData(a2),a0
		move	#255,d0
.convertwave	cmp.b	#$80,(a0)+
		bne.b	.conok
		move.b	#$81,-1(a0)
.conok		dbf	d0,.convertwave
		lea	smpl_SampleData(a2),a0
		lea	256(a0),a1
		move	#239,d0
.makewaves	move.b	(a0)+,(a1)+
		addq	#1,a0
		dbf	d0,.makewaves
.notwave	bset	#SmplBit,_LoadError(a5)
		lea	_WsPtrs(a5),a0
		move	_WsMaxNum(a5),d1
		add	d1,d1
		add	d1,d1
		move.l	a2,(a0,d1.w)

		move	_WsMaxNum(a5),d7
		lea	_InstListView(a5),a0
		lea	smpl_SampleData(a2),a3
		tst.l	(a0)
		beq.b	.setwsptrs
.loop		move.l	(a0),a0
		tst.l	(a0)
		beq.b	.setwsptrs
		cmp.b	inst_SmplNumber(a0),d7
		bne.b	.zero
.setsndptrs	move.l	a3,d1
		moveq	#0,d0
		move	inst_SmplStart(a0),d0
		add.l	d0,d0
		add.l	d0,d1
		move.l	d1,inst_SmplPointer(a0)
		move.l	a3,d1
		moveq	#0,d0
		move	inst_SmplRepStart(a0),d0
		add.l	d0,d0
		add.l	d0,d1
		move.l	d1,inst_SmplRepPointer(a0)
.zero		bra.b	.loop
.setwsptrs	move.l	smpl_RepPointer(a2),d0
		sub.l	smpl_Pointer(a2),d0
		bpl.b	.noadd1
		moveq	#0,d0
.noadd1		move.l	a3,smpl_Pointer(a2)
		move.l	a3,d1
		add.l	d0,d1
		move.l	d1,smpl_RepPointer(a2)
.exit		bra	.loadheader


SEI_ArpLen	dc.l	0

SaveExternInst	move	#$0100,_BlockPlay(a5)
		jsr	FreeVoices
		jsr	FreePart
		jsr	FreeArpg		Lägger in ID2 i d4.l
		bsr	InputOff

		jsr	GetInst
		lea	inst_Title(a0),a0
		lea	_CopyBuffer(a5),a1
		clr.b	_CopyOf_(a5)
		moveq	#29,d0
.move		move.b	(a0)+,(a1)
		tst.b	(a1)+
		dbeq	d0,.move
		move.l	_Window1(a5),SFRWindowPtr
		move.l	#SaveInst_Txt,SFRTitleText
		lea	_CopyBuffer(a5),a0
		move.l	a0,SFRFileName
		move.l	_AslFileReqSI(a5),a0
		lea	SFileReqTags,a1
		CallAsl AslRequest
		tst.l	d0
		beq	.exit
		move.l	_AslFileReqSI(a5),a4
		lea	_CopyBuffer(a5),a3
		move.l	fr_Drawer(a4),a0
		move	#512,d5
		tst.b	(a0)
		beq.b	.nodrawer
.movedrawer	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movedrawer
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer
		move.b	#"/",(a3)+
.nodrawer	move.l	a3,_FileNamePtr(a5)
		move.l	fr_File(a4),a0
.movefile	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movefile

.saveas		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		move.l	#MODE_NEWFILE,d2
		CallDOS Open
		move.l	d0,_FileHandle(a5)
		beq	.exit

		lea	_String(a5),a2
		move.l	#"MLED",(a2)
		move.l	#"INST",4(a2)
		moveq	#8,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		move.l	#"VERS",(a2)
		move.l	#6,4(a2)
		move	VersNum,8(a2)
		move.l	VersStr,10(a2)
		moveq	#14,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		move.l	#"INST",(a2)
		move.l	#inst_SIZE,4(a2)
		moveq	#8,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		clr.b	_CopyOf_(a5)
		lea	_CopyBuffer(a5),a4
		jsr	GetInst
		move	#inst_SIZEOF/2-1,d7
.copyinstloop	move	(a0)+,(a4)+
		dbf	d7,.copyinstloop
		lea	(a4),a3
		lea	_CopyBuffer(a5),a4

		btst	#ARPEGGIO,inst_Effects1(a4)
		beq.b	.skipcleararp
		lea	_ArpgPtrs(a5),a1
		move	inst_ArpTable(a4),d0
		lsl	#2,d0
		move.l	(a1,d0.w),d0
		beq.b	.cleararp
		move.l	d0,a6
		lea	(a3),a1
		moveq	#0,d7
.copyarploop	move.l	(a6)+,(a1)+
		move	(a6)+,(a1)+
		addq	#6,d7
		cmp.b	#61,-6(a1)		End
		beq.b	.endarploop
		cmp	#62<<8,-6(a1)
		beq.b	.endarploop		Eternity Loop
		cmp	#128*6/2,d7
		bls.b	.copyarploop
.endarploop	move.l	d7,SEI_ArpLen
		bra.b	.skipcleararp
.cleararp	bclr	#ARPEGGIO,inst_Effects1(a4)

.skipcleararp	btst	#MIX,inst_Effects2(a4)
		beq.b	.mixoff
		bra.b	.skipmix
.mixoff		clr.b	inst_MixWaveNum(a4)

.skipmix	btst	#TRANSFORM,inst_Effects2(a4)
		beq.b	.transformoff
		bra.b	.skiptransform
.transformoff	clr.b	inst_TraWaveNums(a4)
		clr.b	inst_TraWaveNums+1(a4)
		clr.b	inst_TraWaveNums+2(a4)
		clr.b	inst_TraWaveNums+3(a4)
		clr.b	inst_TraWaveNums+4(a4)

.skiptransform	moveq	#1,d6		Wavesample Search number
		moveq	#1,d5		Wavesample Destination number
		lea	_WaveSampleSaveList(a5),a1

.wavesearchloop	moveq	#0,d4		Found Wavesample
		cmp.b	inst_SmplNumber(a4),d6
		bne.b	.next0
		move.b	inst_SmplNumber(a4),d4
		move.b	d5,inst_SmplNumber(a4)

.next0		btst	#MIX,inst_Effects2(a4)
		beq.b	.next1
		cmp.b	inst_MixWaveNum(a4),d6
		bne.b	.next1
		move.b	inst_MixWaveNum(a4),d4
		move.b	d5,inst_MixWaveNum(a4)

.next1		btst	#TRANSFORM,inst_Effects2(a4)
		beq.b	.skiptransformcheck
		cmp.b	inst_TraWaveNums(a4),d6
		bne.b	.next2
		move.b	inst_TraWaveNums(a4),d4
		move.b	d5,inst_TraWaveNums(a4)
.next2		cmp.b	inst_TraWaveNums+1(a4),d6
		bne.b	.next3
		move.b	inst_TraWaveNums+1(a4),d4
		move.b	d5,inst_TraWaveNums+1(a4)
.next3		cmp.b	inst_TraWaveNums+2(a4),d6
		bne.b	.next4
		move.b	inst_TraWaveNums+2(a4),d4
		move.b	d5,inst_TraWaveNums+2(a4)
.next4		cmp.b	inst_TraWaveNums+3(a4),d6
		bne.b	.next5
		move.b	inst_TraWaveNums+3(a4),d4
		move.b	d5,inst_TraWaveNums+3(a4)
.next5		cmp.b	inst_TraWaveNums+4(a4),d6
		bne.b	.skiptransformcheck
		move.b	inst_TraWaveNums+4(a4),d4
		move.b	d5,inst_TraWaveNums+4(a4)

.skiptransformcheck
		btst	#ARPEGGIO,inst_Effects1(a4)
		beq.b	.skiparpeggiocheck
		move.l	a3,a2
		moveq	#128-1,d7
.arpcheckloop	cmp.b	#61,(a2)	End
		beq.b	.skiparpeggiocheck
		moveq	#0,d3
		move.b	1(a2),d3
		cmp.b	#62,(a2)	Loop
		bne.b	.checkarpwave
		tst.b	d3		Eternity Loop Test
		beq.b	.skiparpeggiocheck
		bra.b	.next6
.checkarpwave	cmp.b	d3,d6		WaveSample number Compare
		bne.b	.next6
		cmp	_WsMaxNum(a5),d3
		bls.b	.arpwavenumok
		clr.b	1(a2)
		bra.b	.next6
.arpwavenumok	move.b	d3,d4
		move.b	d5,1(a2)
.next6		addq	#6,a2
		dbf	d7,.arpcheckloop
.skiparpeggiocheck
		tst.b	d4
		beq.b	.next7
		move.b	d4,(a1)+
		addq.b	#1,d5

.next7		addq.b	#1,d6
		bcc	.wavesearchloop
		clr.b	(a1)

		lea	_String(a5),a2
		move.l	#inst_SIZE,d3
		move.l	a4,d2
		add.l	#inst_START,d2
		move.l	_FileHandle(a5),d1
		CallDOS Write

.arpgs		btst	#ARPEGGIO,inst_Effects1(a4)
		beq.b	.wavesamples
		move.l	#"ARPG",(a2)
		move.l	SEI_ArpLen,4(a2)
		addq.l	#2,4(a2)		Add On Chunk Size
		move	#$00,8(a2)		Arp Table Number $00
		moveq	#10,d3
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		move.l	SEI_ArpLen,d3
		move.l	a3,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

.wavesamples	lea	_WaveSampleSaveList(a5),a3
		move.l	a3,_WSSaveListPointer(a5)
		move.l	#"SMPL",(a2)
.wsloop		move.l	_WSSaveListPointer(a5),a3
		moveq	#0,d0
		move.b	(a3)+,d0
		move.l	a3,_WSSaveListPointer(a5)
		tst.b	d0
		beq	.done
		lea	_WsPtrs(a5),a0
		add	d0,d0
		add	d0,d0
		move.l	(a0,d0.w),a4

		moveq	#0,d4
		move	smpl_Length(a4),d4
		add.l	d4,d4
		lea	smpl_SampleData(a4),a0	Source Beg Pointer / CheckDeltaPacker
		lea	(a0,d4.l),a3		Source End Pointer / CheckDeltaPacker
		move.l	a0,d5
		tst.b	_PackSamples(a5)
		beq.b	.nopack
		move.l	a2,-(sp)
		bsr	CheckDeltaPacker
		move.l	(sp)+,a2

		cmp.l	d7,d4
		bhs.b	.pack
.nopack		move.l	d4,d7

.pack		add.l	#smpl_SIZE,d7
		move.l	d7,4(a2)
		move.l	d4,8(a2)
		move.b	_DeltaCommand(a5),12(a2)
		clr.b	13(a2)			PADBYTE
		moveq	#14,d3			Write Chunk
		move.l	a2,d2
		move.l	_FileHandle(a5),d1
		CallDOS Write
		move.l	#smpl_SIZE,d3		Write Sample Struct
		move.l	a4,d2
		add.l	#smpl_START,d2
		move.l	_FileHandle(a5),d1
		CallLib Write

		tst.b	_PackSamples(a5)
		beq.b	.skippack
		sub.l	#smpl_SIZE,d7
		cmp.l	d7,d4
		bhi.b	.allocpackbuff

.skippack	move.l	d4,d3			Write UnPacked Sample Data
		move.l	d5,d2
		move.l	_FileHandle(a5),d1
		CallLib Write
		bra	.wsloop

.allocpackbuff	move.l	d7,d6
.alloc		move.l	d6,d0
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		tst.l	d0
		beq.b	.again
		move.l	d0,_DeltaPackBuffer(a5)
		move.l	d6,_DeltaPackBufferLen(a5)
		move.l	d5,a0
		move.l	a2,-(sp)
		bsr	DeltaPacker		Uses	d0,d1,d2,d3,d6,d7,a0,a1,a2,a3
		move.l	(sp)+,a2
		move.l	_DeltaPackBuffer(a5),a1
		move.l	_DeltaPackBufferLen(a5),d0
		CallSys	FreeMem
		bra	.wsloop

.again		lsr.l	#1,d6
		cmp.l	#256*2*8,d6
		bhi.b	.alloc
		clr.b	_CopyOf_(a5)
		lea	_CopyBuffer(a5),a0
		move.l	a0,_DeltaPackBuffer(a5)
		move.l	#256*2*8,_DeltaPackBufferLen(a5)
		move.l	d5,a0
		move.l	a2,-(sp)
		bsr	DeltaPacker		Uses	d0,d1,d2,d3,d6,d7,a0,a1,a2,a3
		move.l	(sp)+,a2
		bra	.wsloop

.done		move.l	_FileHandle(a5),d1
		CallDOS Close

.exit		jsr	AllocVoices
		bsr	InputOn
		clr	_BlockPlay(a5)
		rts

_WaveSampleSaveList	rs.b	256
_WSSaveListPointer	rs.l	1

DeleteFile	move	#$0100,_BlockPlay(a5)
		bsr	InputOff
.delete		move.l	_Window1(a5),SFRWindowPtr
		move.l	#DeleteFile_Txt,SFRTitleText
		move.l	#Zero_Txt,SFRFileName
		move.l	_AslFileReqSP(a5),a0
		lea	SFileReqTags,a1
		CallAsl AslRequest
		tst.l	d0
		beq.b	.exit
		move.l	_AslFileReqSP(a5),a4
		lea	_CopyBuffer(a5),a3
		clr.b	_CopyOf_(a5)
		move.l	fr_Drawer(a4),a0
		move	#512,d5
		tst.b	(a0)
		beq.b	.nodrawer
.movedrawer	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movedrawer
		subq	#1,a3
		cmp.b	#":",-1(a3)
		beq.b	.nodrawer
		move.b	#"/",(a3)+
.nodrawer	move.l	a3,_FileNamePtr(a5)
		move.l	fr_File(a4),a0
.movefile	move.b	(a0)+,(a3)
		tst.b	(a3)+
		dbeq	d5,.movefile
		lea	_CopyBuffer(a5),a0
		move.l	a0,d1
		CallDOS DeleteFile
		bra	.delete
.exit		bsr	InputOn
		clr	_BlockPlay(a5)
		rts

LFileReqTags	dc.l	ASLFR_Window
LFRWindowPtr	dc.l	0
		dc.l	ASLFR_TitleText
LFRTitleText	dc.l	0
		dc.l	ASLFR_Flags1
LFRFlags1	dc.l	0
		dc.l	ASLFR_Flags2
		dc.l	FRF_REJECTICONS
		dc.l	ASLFR_InitialFile
LFRFileName	dc.l	WindowTitle+1
LFRIniPat	dc.l	0
		dc.l	InitialPattern
TagEnd		dc.l	TAG_DONE

SFileReqTags	dc.l	ASLFR_Window
SFRWindowPtr	dc.l	0
		dc.l	ASLFR_TitleText
SFRTitleText	dc.l	0
		dc.l	ASLFR_Flags1
		dc.l	FRF_DOSAVEMODE
		dc.l	ASLFR_InitialFile
SFRFileName	dc.l	0
		dc.l	TAG_DONE

InitialPattern	dc.b	"(Ml.#?|Mod.#?|#?.Mod)",0
LoadModule_Txt	dc.b	"Load Module",0
LoadInst_Txt	dc.b	"Load Instrument",0
LoadS_Txt	dc.b	"Load Sample(s)",0
LoadW_Txt	dc.b	"Load Wave(s)",0
DeleteFile_Txt	dc.b	"Select File to Delete",0
SaveModule_Txt	dc.b	"Save Module As",0
SaveInst_Txt	dc.b	"Save Instrument As",0
SaveWsRAW_Txt	dc.b	"Save RAW Wavesample",0
SaveWsIFF_Txt	dc.b	"Save IFF Wavesample"
Zero_Txt	dc.b	0
		even

FreeAllParts	move.l	_SysBase(a5),a6
		move	#1024-1,d6
		lea	_PartPtrs(a5),a4
		move.l	a4,_PartPtr(a5)
		lea	_ZeroBuffer(a5),a3
.loop		move.l	(a4)+,a1
		cmp.l	a3,a1
		beq.b	.zero
		move.l	a3,-4(a4)
		move.l	#part_SIZEOF,d0
		CallLib FreeMem
.zero		dbf	d6,.loop
		rts

FreeAllArpgs	move.l	_SysBase(a5),a6
		move	#256-1,d6
		lea	_ArpgPtrs(a5),a4
		move.l	a4,_ArpgPtr(a5)
		lea	_ZeroBuffer(a5),a3
.loop		move.l	(a4)+,a1
		cmp.l	a3,a1
		beq.b	.zero
		move.l	a3,-4(a4)
		move.l	#arpg_SIZEOF,d0
		CallLib FreeMem
.zero		dbf	d6,.loop
		rts

FreeAllTunes	bsr.b	FreeTuneMem
		lea	_TuneListView(a5),a4
		NEWLIST	a4
		clr	_TuneNum(a5)
		clr	_TuneMaxNum(a5)
		move	#255,d0
		lea	_ZeroBuffer(a5),a1
.loop		lea	_TunePtrs(a5),a0
		move.l	a1,(a0)+
		dbf	d0,.loop
		rts

FreeTuneMem	move.l	_SysBase(a5),a6
		lea	_ZeroBuffer(a5),a3
		lea	_TuneListView(a5),a4
		move.l	(a4),a4
		bra.b	.test
.loop		moveq	#7,d7
		lea	tune_Ch1Ptr(a4),a2
.free		cmp.l	(a2),a3
		beq.b	.zero
		move.l	(a2),a1
		move.l	#chnl_SIZE,d0
		CallLib FreeMem
.zero		addq	#4,a2
		dbf	d7,.free
		move.l	a4,a1
		move.l	(a4),a4
		move.l	#tune_SIZEOF,d0
		CallLib FreeMem
.test		tst.l	(a4)
		bne.b	.loop
		rts

AllocTune	move.l	#tune_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,d7
		beq.b	.exit
		lea	_TuneListView(a5),a0
		move.l	d0,a1
		ADDTAIL
		lea	tune_NameStr(a1),a0
		move.l	a0,tune_Name(a1)
		lea	TuneList_Txt,a2
		moveq	#33-1,d0
.copy		move.b	(a2)+,(a0)+
		dbeq	d0,.copy
		clr.b	(a0)
		move	#125,tune_Tempo(a1)
		clr.b	tune_Groove(a1)
		move.b	#6,tune_Speed(a1)
		move	#64,tune_Volume(a1)
		move.b	#%00001111,_ChannelsOn(a5)
		lea	_ZeroBuffer(a5),a0
		lea	tune_Ch1Ptr(a1),a2
		moveq	#7,d0
.loop		move.l	a0,(a2)+
		dbf	d0,.loop
		lea	_TunePtrs(a5),a0
		move	_TuneMaxNum(a5),d0
		lsl	#2,d0
		move.l	a1,(a0,d0.w)
		move.l	a1,TunePtr
.exit		rts

FreeAllInsts	move.l	_SysBase(a5),a6
		lea	_InstListView(a5),a4
		move.l	(a4),a4
		clr.b	inst_SmplType(a4)
		clr.b	inst_SmplNumber(a4)
		move.l	(a4),a4
		bra.b	.test
.loop		move.l	a4,a1
		move.l	(a4),a4
		move.l	#inst_SIZEOF,d0
		CallLib FreeMem
.test		tst.l	(a4)
		bne	.loop
		lea	_InstListView(a5),a4
		move.l	(a4),a3
		move.l	a4,LN_PRED(a3)
		addq	#4,a4
		move.l	a3,LN_PRED(a4)
		move.l	a4,(a3)
		lea	inst_NameStr(a3),a0
		move.l	a0,inst_Name(a3)
		clr	_InstNum(a5)
		clr	_InstMaxNum(a5)
ClearInstPtrs	move	#254,d0
.loop		lea	_InstPtrs+4(a5),a0
		clr.l	(a0)+
		dbf	d0,.loop
		rts

FreeAllWs	move.l	_SysBase(a5),a6
		lea	_SmplListView(a5),a4
		move.l	(a4),a4
		bra.b	.test
.loop		move.l	a4,a1
		move.l	(a4),a4
		moveq	#0,d0
		move	smpl_Length(a1),d0
		cmp.l	#128,d0
		bne.b	.ok
		add	#120,d0
.ok		add.l	d0,d0
		add.l	#smpl_SampleData,d0
		CallLib FreeMem
.test		tst.l	(a4)
		bne.b	.loop
		lea	_SmplListView(a5),a0
		NEWLIST	a0
		clr	_WsNum(a5)
		clr	_WsMaxNum(a5)
		rts

WipeTune	jsr	GetTune
		move	#125,tune_Tempo(a0)
		clr.b	tune_Groove(a0)
		move.b	#6,tune_Speed(a0)
		move	#64,tune_Volume(a0)
		move.b	#%00001111,_ChannelsOn(a5)
		lea	tune_Ch1Ptr(a0),a3
		move	#$0010,d1
		moveq	#7,d2
.loop		move.l	(a3)+,a0
		move	#(chnl_SIZE/2)-1,d3
.clear		move	d1,(a0)+
		dbf	d3,.clear
		dbf	d2,.loop
		rts

* Twins/PHA *****************************************************************
* Block input                                         Last Change: 92-10-24 *
*****************************************************************************

_WaitRequester1	rs.b	rq_SIZEOF
_WaitRequester2	rs.b	rq_SIZEOF

InputOn		move.l	_Window1(a5),a0
		CallIntuition ClearPointer
		move.l	_Window2(a5),a0
		CallLib ClearPointer
		lea	_WaitRequester1(a5),a0
		move.l	_Window1(a5),a1
		CallLib EndRequest
		lea	_WaitRequester2(a5),a0
		move.l	_Window2(a5),a1
		CallLib EndRequest
		rts

InputOff	lea	_WaitRequester1(a5),a0
		CallIntuition InitRequester
		lea	_WaitRequester1(a5),a0
		move.l	_Window1(a5),a1
		CallLib Request
		lea	_WaitRequester2(a5),a0
		CallLib InitRequester
		lea	_WaitRequester2(a5),a0
		move.l	_Window2(a5),a1
		CallLib Request
PointerOff	move.l	_Window1(a5),a0
		lea	WaitPointer,a1
		moveq	#16,d0
		moveq	#16,d1
		moveq	#-6,d2
		moveq	#0,d3
		CallIntuition SetPointer
		move.l	_Window2(a5),a0
		lea	WaitPointer,a1
		moveq	#16,d0
		moveq	#16,d1
		CallLib SetPointer
		rts

* Twins/PHA *****************************************************************
* Interuptserver routines                             Last Change: 92-10-24 *
*****************************************************************************

AddVbInt	moveq	#5,d0
		lea	VbIntServer,a1
		CallSys AddIntServer
		move.l	#RemVbInt,_RemVbInt(a5)
		rts

RemVbInt	moveq	#5,d0
		lea	VbIntServer,a1
		CallSys RemIntServer
		clr.l	_RemVbInt(a5)
		rts

VbIntServer	dc.l 0,0
		dc.b 2,0
		dc.l VbIntName,0,DrawVisualizer
VbIntName	dc.b "MlVbInt",0
		even

_OldAudInt	rs.l	1

SetAudInt	moveq	#7,d0
		lea	AudIntHandler,a1
		CallSys SetIntVector
		move.l	d0,_OldAudInt(a5)
		move.l	#ClrAudInt,_ClrAudInt(a5)
		rts

ClrAudInt	moveq	#7,d0
		move.l	_OldAudInt(a5),a1
		CallSys SetIntVector
		clr.l	_ClrAudInt(a5)
		rts

AudIntHandler	dc.l 0,0
		dc.b 2,0
		dc.l AudIntName,0,PlayMusic
AudIntName	dc.b "MlAudInt",0
		even

_VisualClear	rs.b	1
		rs.b	1
_VisBytesPerRow	rs.w	1
_VisualRast	rs.l	1
_VisualSize	rs.l	1
_VisualBitMap	rs.b	bm_SIZEOF
_VisualRastPort	rs.b	rp_SIZEOF

DrawVisualizer	movem.l	d2-d7/a2/a3/a4,-(sp)
		lea	Bss,a5

		lea	ChannelPointers,a0
		moveq	#8-1,d7
.vunext		move.l	(a0)+,a1
		subq	#1,ch_VUAmp(a1)
		bpl.b	.vudbf
		clr	ch_VUAmp(a1)
.vudbf		dbf	d7,.vunext

		tst.b	_PlayTune(a5)
		beq.b	.noplaytune
		bset	#Msg_StepShower,_SigMsg+3(a5)

.noplaytune	bset	#Msg_DrawVisual,_SigMsg+2(a5)
		bset	#Msg_VUMeters,_SigMsg+2(a5)
		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
.end		movem.l	(sp)+,d2-d7/a2/a3/a4
		moveq	#0,d0
		rts

DrawVisual1	bsr.b	DrawVisual
		jmp	Wait11

DrawVisual	bclr	#Msg_DrawVisual,_SigMsg+2(a5)
		tst	_WsVsButtons(a5)
		beq	.end
		move.b	_PlayBits(a5),d0
		and.b	#$6,d0
		bne	.end
		move.l	_ChannelPtr(a5),a4
		move.l	_VisualRast(a5),a1
		moveq	#0,d0
		move	_VisBytesPerRow(a5),d0
		move	d0,d1
		mulu	#31,d0
		add.l	d0,a1
		moveq	#0,d7
.test16		cmp	#16/2,ch_WsRepLength(a4)
		bne.b	.test32
		moveq	#1,d7
		bra.b	.foundwave
.test32		cmp	#32/2,ch_WsRepLength(a4)
		bne.b	.test64
		moveq	#2,d7
		bra.b	.foundwave
.test64		cmp	#64/2,ch_WsRepLength(a4)
		bne.b	.test128
		moveq	#3,d7
		bra.b	.foundwave
.test128	cmp	#128/2,ch_WsRepLength(a4)
		bne.b	.test256
		moveq	#4,d7
		bra.b	.foundwave
.test256	cmp	#256/2,ch_WsRepLength(a4)
		bne.b	.foundwave
		moveq	#5,d7
.foundwave
.clear		lea	OldData(pc),a3
		move	#256-1,d6
.clearloop	move	(a3)+,d3
		clr.b	(a1,d3.w)
		dbf	d6,.clearloop

		tst	_IntMode(a5)
		beq.b	.visualblit
		tst	d7
		beq.b	.visualblit
		move.l	ch_WsRepPointer(a4),d0
		beq.b	.visualblit
		move.l	d0,a3
		lea	OldData(pc),a4
		subq	#5,d7
		neg	d7
		moveq	#1,d6
		lsl	d7,d6
		subq	#1,d6
		moveq	#0,d2		x coord
.loopagain	move	d6,d7
		move.b	(a3)+,d5
		ext	d5
		asr	#2,d5
		neg	d5
		muls	d1,d5

.loop		move	d2,d3
		move	d2,d4
		lsr	#3,d3
		not.b	d4
		add	d5,d3
		bset	d4,(a1,d3.w)
		move	d3,(a4)+

		addq	#1,d2
		cmp	#256,d2
		dbeq	d7,.loop
		bne.b	.loopagain

.visualblit	move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		jsr	NormalDrawMode0
		lea	_VisualRastPort(a5),a0
		moveq	#0,d0
		moveq	#0,d1
		move.l	d6,a1
		move	#368,d2
		move	#176,d3
		move	#256,d4
		move	#64,d5
		move	#$c0,d6
		CallLib ClipBlit
.end		rts

OldData		dcb.w	256,0

PlayMusic	movem.l	d2-d7/a2/a3/a4,-(sp)
		move	#$0080,$dff09c
*		move	#$888,$dff180
		lea	Bss,a5
		tst	_IntMode(a5)
		beq	.exit
		tst.b	_BlockPlay+1(a5)
		bne	.exit
		tst.b	_PlayMode(a5)
		beq.b	.normal
		eor	#2560,_DoubleBuf(a5)
		bsr	Dma4
.normal		move.b	$dff006,_RastTime(a5)
		cmp.b	#2,_PlayTune(a5)
		bne.b	.playpart
		move.b	#1,_PlayTune(a5)
		move	_Ch1Volume(a5),$dff0a8
		move	_Ch2Volume(a5),$dff0b8
		move	_Ch3Volume(a5),$dff0c8
		move	_Ch4Volume(a5),$dff0d8
		bra.b	.playfx
.playpart	tst.b	_PlayPart(a5)
		beq.b	.playtune
		bsr	PlayPart
.playtune	tst.b	_PlayTune(a5)
		beq.b	.playnote
		bsr	PlayTune
.playnote	bsr	PlayNote
.playfx		bsr	PlayEffects
		btst	#3,_ActiveWindows(a5)
		beq.b	.playpervol
		tst	_Frames(a5)
		beq.b	.playpervol
		subq	#1,_Frames(a5)
		bne.b	.playpervol
		jsr	Stopp
		bra	.exit
.playpervol	bsr	PerCalc
		bsr	PerVolPlay
		bsr	DmaPlay
		moveq	#0,d0
		move.b	$dff006,d0
		moveq	#0,d1
		move.b	_RastTime(a5),d1
		sub	d0,d1
		move.b	d1,_RastTime(a5)
*		move	#$999,$dff180
		tst.b	_PlayMode(a5)
		beq	.4ch

		moveq	#0,d2
		move	_DoubleBuf(a5),d2
		move.l	_SndFBuf(a5),d3
		move.l	_SndCBuf(a5),d4
		cmp.l	d3,d4
		beq	.nomove
		add.l	d2,d3
		add.l	d2,d4
		move.l	d3,a0
		move.l	d4,a1
		move	_MixLength(a5),d1
		lsr	#4,d1
		subq	#1,d1
		bpl.b	.moveok
		moveq	#0,d1
.moveok		move	d1,d0
.moveloop1	move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		dbf	d0,.moveloop1

		add.l	#(2*SndBufSize),d3
		add.l	#(2*SndBufSize),d4
		move.l	d3,a0
		move.l	d4,a1
		move	d1,d0
.moveloop2	move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		dbf	d0,.moveloop2

		add.l	#(2*SndBufSize),d3
		add.l	#(2*SndBufSize),d4
		move.l	d3,a0
		move.l	d4,a1
		move	d1,d0
.moveloop3	move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		dbf	d0,.moveloop3

		add.l	#(2*SndBufSize),d3
		add.l	#(2*SndBufSize),d4
		move.l	d3,a0
		move.l	d4,a1
		move	d1,d0
.moveloop4	move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		dbf	d0,.moveloop4

.nomove		move	$dff01c,d0
		and	#$0080,d0
		beq.b	.exit
		move	$dff01e,d0
		and	#$0080,d0
		beq.b	.exit
		move	#$0080,$dff09c
		bset	#Msg_CpuToSlow,_SigMsg+3(a5)
		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
		move	#$0101,_BlockPlay(a5)
		clr	$dff0a8
		clr	$dff0b8
		clr	$dff0c8
		clr	$dff0d8
.exit		movem.l	(sp)+,d2-d7/a2/a3/a4
		moveq	#0,d0
		rts

.4ch		lea	$bfd000,a1
		move.b	ciaicr(a4),d0
		btst	#CIAICRB_TA,d0
		beq.b	.oki
		bset	#Msg_CpuToSlow,_SigMsg+3(a5)
		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
		move	#$0101,_BlockPlay(a5)
		clr	$dff0a8
		clr	$dff0b8
		clr	$dff0c8
		clr	$dff0d8
.oki		movem.l	(sp)+,d2-d7/a2/a3/a4
		moveq	#0,d0
		rts

_RastTime	rs.w	1

OpenCIAResource	moveq	#0,d0
		lea	CIABName,a1
		CallSys OpenResource
		move.l	d0,_CIABBase(a5)
		beq	ResourceError

AddTimers	bsr.b	AddTimerA
		bra.b	AddTimerB

AddTimerA	btst	#CIAICRB_TA,_TimerFlag(a5)
		bne.b	.exit
		move.l	_CIABBase(a5),a6
		lea	$bfd000,a4
		lea	TempoServer,a1
		moveq	#CIAICRB_TA,d0
		CallLib AddICRVector
		tst.l	d0
		bne	TimerAError
		bset	#CIAICRB_TA,_TimerFlag(a5)
		move.l	#RemTimers,_RemTimers(a5)
		moveq	#0,d0
		bset	#CIAICRB_TA,d0
		CallLib AbleICR
		moveq	#0,d0
		bset	#CIAICRB_TA,d0
		CallLib SetICR
		bclr	#CIACRAB_START,ciacra(a4)
		bclr	#CIACRAB_RUNMODE,ciacra(a4)
		bclr	#CIACRAB_INMODE,ciacra(a4)
		moveq	#0,d0
		bset	#CIAICRB_SETCLR,d0
		bset	#CIAICRB_TA,d0
		CallLib AbleICR
.exit		rts

AddTimerB	btst	#CIAICRB_TB,_TimerFlag(a5)
		bne.b	.exit
		move.l	_CIABBase(a5),a6
		lea	$bfd000,a4
		lea	DmaWaitServer,a1
		moveq	#CIAICRB_TB,d0
		CallLib AddICRVector
		tst.l	d0
		bne	TimerBError
		bset	#CIAICRB_TB,_TimerFlag(a5)
		move.l	#RemTimers,_RemTimers(a5)
		moveq	#0,d0
		bset	#CIAICRB_TB,d0
		CallLib AbleICR
		bclr	#CIACRBB_START,ciacrb(a4)
		bset	#CIACRBB_RUNMODE,ciacrb(a4)
		bclr	#CIACRBB_INMODE0,ciacrb(a4)
		bclr	#CIACRBB_INMODE1,ciacrb(a4)
		moveq	#0,d0
		bset	#CIAICRB_TB,d0
		CallLib SetICR
		moveq	#0,d0
		bset	#CIAICRB_SETCLR,d0
		bset	#CIAICRB_TB,d0
		CallLib AbleICR
.exit		rts

ResourceError	move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#Resource_Txt,12(a1)
		move.l	#Exit_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		jmp	Exit

TimerAError	move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#TimerA_Txt,12(a1)
		move.l	#RetryCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		bne	AddTimerA
		rts

TimerBError	move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#TimerB_Txt,12(a1)
		move.l	#RetryCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		bne	AddTimerB
		rts

RemTimers	move.l	_CIABBase(a5),d0
		beq.b	.exit
		move.l	d0,a6
.remtimera	btst	#CIAICRB_TA,_TimerFlag(a5)
		beq.b	.remtimerb
		moveq	#CIAICRB_TA,d0
		lea	TempoServer,a1
		CallLib RemICRVector
		bclr	#CIAICRB_TA,_TimerFlag(a5)
		clr.l	_RemTimers(a5)
.remtimerb	btst	#CIAICRB_TB,_TimerFlag(a5)
		beq.b	.exit
		moveq	#CIAICRB_TB,d0
		lea	DmaWaitServer,a1
		CallLib RemICRVector
		lea	$bfd000,a0
		bclr	#CIACRBB_RUNMODE,ciacrb(a0)
		bclr	#CIAICRB_TB,_TimerFlag(a5)
		clr.l	_RemTimers(a5)
.exit		rts

CIABName	dc.b "ciab.resource",0

DmaWaitServer	dc.l 0,0
		dc.b 2,0
		dc.l dmawaitname
		dc.l 0,PlayDma

dmawaitname	dc.b "ml_DMAWait",0

TempoServer	dc.l 0,0
		dc.b 2,0
		dc.l temponame
		dc.l 0,PlayMusic

temponame	dc.b "ml_Tempo",0
		even

_CIABBase	rs.l	1
_DmaWait	rs.b	1
_TimerFlag	rs.b	1
_IntMode	rs.w	1
_TimerValue1	rs.l	1
_TimerValue2	rs.l	1
_TimerValue3	rs.l	1
_TimerValue4	rs.l	1

CalcBPM		jsr	GetTune
		move.l	_TimerValue1(a5),d0
		divu	tune_Tempo(a0),d0
		move.l	_TimerValue3(a5),d1
		lsl.l	#8,d1
		divu	d0,d1
		mulu	#60,d1
		lsr.l	#8,d1
		moveq	#0,d0
		move.b	tune_Speed(a0),d0
		add.b	tune_Groove(a0),d0
		mulu	#4,d0
		tst.b	tune_Groove(a0)
		beq.b	.nogrv
		lsr	#1,d0
.nogrv		move	d0,d2
		lsr	#1,d2
		divu	d0,d1
		swap	d1
		cmp	d2,d1
		blo.b	.swap
		swap	d1
		addq	#1,d1
		bra.b	.ok
.swap		swap	d1
.ok		move	d1,GTNM_Num+2
		move.l	_BPMGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList40,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

* Twins/PHA *****************************************************************
* PlayPart                                            Last Change: 93-01-15 *
*****************************************************************************

PlayPart	move.l	_ChannelPtr(a5),a4
		cmp.l	_PartChPtr(a5),a4
		beq.b	.ok
		move.l	_PartChPtr(a5),a4

.ok		subq.b	#1,ch_SpdCnt(a4)
		bne	.exit
		move.b	ch_PartPos(a4),ch_PartPosWork(a4)
		move	#256,_LoopError(a5)
		move.b	ch_Spd(a4),d0
		not.b	ch_PartGrv(a4)
		beq.b	.nogrv
		move.b	ch_Grv(a4),d1
		beq.b	.nogrv
		exg	d0,d1
.nogrv		move.b	d0,ch_SpdCnt(a4)
.restart	subq	#1,_LoopError(a5)
		bcs	.exit
		lea	_PartPtrs(a5),a0
		move	_PartNum(a5),d0
		add	d0,d0
		add	d0,d0
		move.l	(a0,d0.w),a0
		moveq	#0,d0
		move.b	ch_PartPos(a4),d0
		move.b	d0,d2
		addq.b	#1,ch_PartPos(a4)
		and.b	#$7f,ch_PartPos(a4)
		bne.b	.noadd
		move.b	_TuneSpd(a5),ch_Spd(a4)
		move.b	_TuneGrv(a5),ch_Grv(a4)
.noadd		mulu	#12,d0
		add	d0,a0
		move.l	(a0)+,ch_PartNote(a4)
		move.l	(a0)+,ch_PartEffects(a4)
		move.l	(a0)+,ch_PartEffects+4(a4)
		move.b	ch_PartNote(a4),d1
.end		cmp.b	#61,d1
		bne.b	.jump
		tst.b	d2
		bne.b	.skip
		jmp	Stopp
.skip		clr.b	ch_PartPos(a4)
		clr.b	ch_PartPosWork(a4)
		move.b	_TuneSpd(a5),ch_Spd(a4)
		move.b	_TuneGrv(a5),ch_Grv(a4)
		move.b	ch_Spd(a4),ch_SpdCnt(a4)
		bra	.restart
.jump		bclr	#7,d1
		beq.b	.playinst
		tst.b	d2
		bne.b	.skip2
		jmp	Stopp
.skip2		tst.b	ch_PartJmpCnt(a4)
		beq.b	.jumpinitcount
		subq.b	#1,ch_PartJmpCnt(a4)
		beq	.restart
		move.b	d1,ch_PartPos(a4)
		move.b	d1,ch_PartPosWork(a4)
		bra	.restart
.jumpinitcount	cmp.b	d1,d2
		bls	.restart
		move.b	d1,ch_PartPos(a4)
		move.b	d1,ch_PartPosWork(a4)
		move.b	ch_PartInst(a4),ch_PartJmpCnt(a4)
		bra	.restart
.playinst	bsr	CheckInst
.exit
.checkpos	lea	_ArrowPartPos(a5),a2
		move.b	ch_PartPosWork(a4),d6
		cmp.b	(a2),d6
		beq.b	.nopartarrow
		move.b	d6,(a2)
		bset	#Msg_PartArrow,_SigMsg+3(a5)
		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
.nopartarrow	rts

* Twins/PHA *****************************************************************
* PlayTune                                            Last Change: 93-01-15 *
*****************************************************************************

_TuneSpd	rs.b	1
_TuneGrv	rs.b	1
_TuneTmp	rs.w	1
_LoopError	rs.w	1

PlayTune	move.l	TunePtr,a0
.voice1		move.l	tune_Ch1Ptr(a0),a3
		lea	Channel1Buf,a4
		move	ch_PartNum(a4),_PartShow+0*2(a5)
		move.b	ch_TransposeNum(a4),_TransposeShow+0(a5)
		bsr	PlayVoice
		move.b	ch_PartPosWork(a4),_StepPartPos+0(a5)
		bsr	FixPartLineMsg
		lea	_ArrowTunePos+0(a5),a2
		bsr	FixTuneLineMsg
		move.l	TunePtr,a0
		move.l	tune_Ch1Ptr(a0),a3
		bsr	CheckFollow

.voice2		move.l	TunePtr,a0
		move.l	tune_Ch2Ptr(a0),a3
		lea	Channel2Buf,a4
		move.b	ch_PartPos(a4),_StepPartPos+1(a5)
		move	ch_PartNum(a4),_PartShow+1*2(a5)
		move.b	ch_TransposeNum(a4),_TransposeShow+1(a5)
		bsr	PlayVoice
		move.b	ch_PartPosWork(a4),_StepPartPos+1(a5)
		bsr	FixPartLineMsg
		lea	_ArrowTunePos+1(a5),a2
		bsr	FixTuneLineMsg
		move.l	TunePtr,a0
		move.l	tune_Ch2Ptr(a0),a3
		bsr	CheckFollow

.voice3		move.l	TunePtr,a0
		move.l	tune_Ch3Ptr(a0),a3
		lea	Channel3Buf,a4
		move.b	ch_PartPos(a4),_StepPartPos+2(a5)
		move	ch_PartNum(a4),_PartShow+2*2(a5)
		move.b	ch_TransposeNum(a4),_TransposeShow+2(a5)
		bsr	PlayVoice
		move.b	ch_PartPosWork(a4),_StepPartPos+2(a5)
		bsr	FixPartLineMsg
		lea	_ArrowTunePos+2(a5),a2
		bsr	FixTuneLineMsg
		move.l	TunePtr,a0
		move.l	tune_Ch3Ptr(a0),a3
		bsr	CheckFollow

.voice4		move.l	TunePtr,a0
		move.l	tune_Ch4Ptr(a0),a3
		lea	Channel4Buf,a4
		move.b	ch_PartPos(a4),_StepPartPos+3(a5)
		move	ch_PartNum(a4),_PartShow+3*2(a5)
		move.b	ch_TransposeNum(a4),_TransposeShow+3(a5)
		bsr	PlayVoice
		move.b	ch_PartPosWork(a4),_StepPartPos+3(a5)
		bsr	FixPartLineMsg
		lea	_ArrowTunePos+3(a5),a2
		bsr	FixTuneLineMsg
		move.l	TunePtr,a0
		move.l	tune_Ch4Ptr(a0),a3
		bsr	CheckFollow

.voice5		tst.b	_PlayMode(a5)
		beq	.exit
		move.l	TunePtr,a0
		move.l	tune_Ch5Ptr(a0),a3
		lea	Channel5Buf,a4
		move.b	ch_PartPos(a4),_StepPartPos+4(a5)
		move	ch_PartNum(a4),_PartShow+4*2(a5)
		move.b	ch_TransposeNum(a4),_TransposeShow+4(a5)
		bsr	PlayVoice
		move.b	ch_PartPosWork(a4),_StepPartPos+4(a5)
		bsr	FixPartLineMsg
		lea	_ArrowTunePos+4(a5),a2
		bsr	FixTuneLineMsg
		move.l	TunePtr,a0
		move.l	tune_Ch5Ptr(a0),a3
		bsr	CheckFollow

.voice6		move.l	TunePtr,a0
		move.l	tune_Ch6Ptr(a0),a3
		lea	Channel6Buf,a4
		move.b	ch_PartPos(a4),_StepPartPos+5(a5)
		move	ch_PartNum(a4),_PartShow+5*2(a5)
		move.b	ch_TransposeNum(a4),_TransposeShow+5(a5)
		bsr	PlayVoice
		move.b	ch_PartPosWork(a4),_StepPartPos+5(a5)
		bsr	FixPartLineMsg
		lea	_ArrowTunePos+5(a5),a2
		bsr	FixTuneLineMsg
		move.l	TunePtr,a0
		move.l	tune_Ch6Ptr(a0),a3
		bsr	CheckFollow

.voice7		move.l	TunePtr,a0
		move.l	tune_Ch7Ptr(a0),a3
		lea	Channel7Buf,a4
		move.b	ch_PartPos(a4),_StepPartPos+6(a5)
		move	ch_PartNum(a4),_PartShow+6*2(a5)
		move.b	ch_TransposeNum(a4),_TransposeShow+6(a5)
		bsr	PlayVoice
		move.b	ch_PartPosWork(a4),_StepPartPos+6(a5)
		bsr.b	FixPartLineMsg
		lea	_ArrowTunePos+6(a5),a2
		bsr	FixTuneLineMsg
		move.l	TunePtr,a0
		move.l	tune_Ch7Ptr(a0),a3
		bsr	CheckFollow

.voice8		move.l	TunePtr,a0
		move.l	tune_Ch8Ptr(a0),a3
		lea	Channel8Buf,a4
		move.b	ch_PartPos(a4),_StepPartPos+7(a5)
		move	ch_PartNum(a4),_PartShow+7*2(a5)
		move.b	ch_TransposeNum(a4),_TransposeShow+7(a5)
		bsr	PlayVoice
		move.b	ch_PartPosWork(a4),_StepPartPos+7(a5)
		bsr.b	FixPartLineMsg
		lea	_ArrowTunePos+7(a5),a2
		bsr.b	FixTuneLineMsg
		move.l	TunePtr,a0
		move.l	tune_Ch8Ptr(a0),a3
		bsr.b	CheckFollow
.exit		rts

FixPartLineMsg	cmp.l	_ChannelPtr(a5),a4
		bne.b	.exit
		lea	_ArrowPartPos(a5),a2
		move.b	ch_PartPosWork(a4),d6
		cmp.b	(a2),d6
		beq.b	.exit
		move.b	d6,(a2)
		bset	#Msg_PartArrow,_SigMsg+3(a5)
		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
.exit		rts

FixTuneLineMsg	move.b	ch_TunePos(a4),d6
		cmp.b	(a2),d6
		beq.b	.notunearrow
		bset	#Msg_StepArrow,_SigMsg+3(a5)
		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
.notunearrow	move.b	d6,(a2)
		rts

CheckFollow	cmp.l	_ChannelPtr(a5),a4
		bne.b	.skippartupdate
		tst.b	_FollowChannel(a5)
		beq.b	.skippartupdate
		moveq	#0,d1
		move.b	ch_TunePos(a4),d1
		add	d1,d1
		moveq	#0,d0
		move.b	(a3,d1.w),d0
		move.b	1(a3,d1.w),d1
		btst	#5,d1
		bne.b	.skippartupdate
		and	#$c0,d1
		lsl	#2,d1
		or	d1,d0
		cmp	_PartNum(a5),d0
		beq.b	.skippartupdate
		move	d0,_PartNum(a5)
		jsr	GetPartPtr
		bset	#Msg_PrintPart,_SigMsg+3(a5)
		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
.skippartupdate	rts

PlayVoice	tst.b	ch_VoiceOff(a4)
		bne	.exit
		subq.b	#1,ch_SpdCnt(a4)
		bne	.exit
		move.b	ch_PartPos(a4),ch_PartPosWork(a4)
		move	#256,_LoopError(a5)
		move.b	ch_Spd(a4),d0
		not.b	ch_PartGrv(a4)
		beq.b	.nogrv
		move.b	ch_Grv(a4),d1
		beq.b	.nogrv
		exg	d0,d1
.nogrv		move.b	d0,ch_SpdCnt(a4)
		clr.b	ch_SpdPart(a4)
		clr.b	ch_GrvPart(a4)
.restart	subq	#1,_LoopError(a5)
		bcs	.exit
		move.l	a3,a0
		moveq	#0,d0
		move.b	ch_TunePos(a4),d0
		cmp.b	_TunePos(a5),d0
		bne.b	.skipp
		bset	#1,ch_PlayError(a4)
.skipp		move.b	d0,d2
		add	d0,d0
		add	d0,a0
		move	(a0),d3
		move	d3,d5
		and	#$001f,d5
		btst	#5,d3
		beq	.part
		move	d3,d4
		and	#$00c0,d4
		lsr	#6,d4
.end		cmp	#1,d4
		bne.b	.jump
		move.b	#1,ch_VoiceOff(a4)
		bset	#0,ch_PlayError(a4)
		bra	.exit
.jump		cmp	#2,d4
		bne.b	.wait
		tst.b	ch_TuneJumpCount(a4)
		beq.b	.jumpinitcount
		subq.b	#1,ch_TuneJumpCount(a4)
		beq.b	.jumpcountend
		move.b	(a0),ch_TunePos(a4)
		bra	.restart
.jumpcountend	addq.b	#1,ch_TunePos(a4)
		bra	.restart
.jumpinitcount	cmp.b	(a0),d2
		bls.b	.done
		move.b	d5,ch_TuneJumpCount(a4)
		bne.b	.ok
		bset	#0,ch_PlayError(a4)
.ok		move.b	(a0),ch_TunePos(a4)
		bra	.restart
.done		addq.b	#1,ch_TunePos(a4)
		bra	.restart
.wait		cmp	#3,d4
		bne.b	.part
		tst.b	ch_TuneWait(a4)
		beq.b	.waitinit
		subq.b	#1,ch_TuneWait(a4)
		beq.b	.done
		bra	.exit
.waitinit	move.b	(a0),ch_TuneWait(a4)
		beq.b	.done
		clr.b	ch_PTPchSld(a4)
		clr.b	ch_PchSld(a4)
		clr.b	ch_VolSld(a4)
		clr	ch_PartNote(a4)
		tst.b	ch_Vib(a4)
		bne.b	.skipvib
		clr.b	ch_Vib(a4)
.skipvib	tst.b	ch_Tre(a4)
		bne.b	.skiptre
		clr.b	ch_Tre(a4)
.skiptre	move	d5,d0
		beq	.exit
		move.b	d0,ch_Spd(a4)
		move.b	d0,ch_SpdCnt(a4)
		bra	.exit
.part		move	d3,d4
		lsl	#2,d4
		and	#$300,d4
		lsr	#8,d3
		or	d4,d3
		move	d3,ch_PartNum(a4)
		sub.b	#$10,d5
		move.b	d5,ch_TransposeNum(a4)
		moveq	#0,d0
		move	d3,d0
		ext	d5
		lsl	#5,d5
		add	d0,d0
		add	d0,d0
		lea	_PartPtrs(a5),a1
		move.l	(a1,d0.w),a1
.partrestart	moveq	#0,d0
		move.b	ch_PartPos(a4),d0
		move.b	d0,d2
		addq.b	#1,ch_PartPos(a4)
		and.b	#$7f,ch_PartPos(a4)
		bne.b	.noadd
		addq.b	#1,ch_TunePos(a4)
		move.b	_TuneSpd(a5),ch_Spd(a4)
		move.b	_TuneGrv(a5),ch_Grv(a4)
.noadd		mulu	#12,d0
		lea	(a1,d0.w),a2
		move.l	(a2)+,ch_PartNote(a4)
		move.l	(a2)+,ch_PartEffects(a4)
		move.l	(a2)+,ch_PartEffects+4(a4)
		move.b	ch_PartNote(a4),d1
.partend	cmp.b	#61,d1
		bne.b	.partjump
		tst.b	d2
		bne.b	.skip
		jmp	Stopp
.skip		clr.b	ch_PartPos(a4)
		clr.b	ch_PartPosWork(a4)
		move.b	_TuneSpd(a5),ch_Spd(a4)
		move.b	_TuneGrv(a5),ch_Grv(a4)
		move.b	ch_Spd(a4),ch_SpdCnt(a4)
		addq.b	#1,ch_TunePos(a4)
		bra	.restart
.partjump	bclr	#7,d1
		beq.b	.playinst
		tst.b	ch_PartJmpCnt(a4)
		beq.b	.partjumpinit
		subq.b	#1,ch_PartJmpCnt(a4)
		beq	.partrestart
		move.b	d1,ch_PartPos(a4)
		move.b	d1,ch_PartPosWork(a4)
		bra	.partrestart
.partjumpinit	cmp.b	d1,d2
		bls	.partrestart
		move.b	ch_PartInst(a4),ch_PartJmpCnt(a4)
		bne.b	.okey
		bset	#0,ch_PlayError(a4)
.okey		move.b	d1,ch_PartPos(a4)
		move.b	d1,ch_PartPosWork(a4)
		bra	.partrestart
.playinst	tst.b	d1
		beq	CheckInst
		move	d5,ch_Transpose(a4)
		bra	CheckInst
.exit		rts

* Twins/PHA *****************************************************************
* Play Note                                           Last Change: 93-01-15 *
*****************************************************************************

_PlayKey	rs.l	2
_PlayNum	rs.w	1
_PolyOnOff	rs.w	1
_BlockPlay	rs.w	1
_ChannelPtr	rs.l	1
_Frames		rs.w	1

PlayNote	tst.b	_BlockPlay(a5)
		bne	PlayExit
		move	_OldKeyBufPos(a5),d0
		cmp	_NewKeyBufPos(a5),d0
		beq	PlayExit
PlayNote1	move.l	_ChannelPtr(a5),a4
		lea	_KeyBuffer(a5),a0
		move.b	(a0,d0.w),d2
		addq	#1,d0
		and	#31,d0
		move	d0,_OldKeyBufPos(a5)
		tst.b	d2
		bpl	.keydown
		bclr	#7,d2
		tst	_PlayTune(a5)
		bne	.stop5
		tst	_PolyOnOff(a5)
		beq	.stop5
.stop1		cmp.b	_PlayKey(a5),d2
		bne.b	.stop2
		lea	Channel1Buf,a4
		clr.b	_PlayKey(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.stop2		cmp.b	_PlayKey+1(a5),d2
		bne.b	.stop3
		lea	Channel2Buf,a4
		clr.b	_PlayKey+1(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.stop3		cmp.b	_PlayKey+2(a5),d2
		bne.b	.stop4
		lea	Channel3Buf,a4
		clr.b	_PlayKey+2(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.stop4		cmp.b	_PlayKey+3(a5),d2
		bne.b	.stop_5
		lea	Channel4Buf,a4
		clr.b	_PlayKey+3(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.stop_5		cmp.b	_PlayKey+4(a5),d2
		bne.b	.stop_6
		lea	Channel5Buf,a4
		clr.b	_PlayKey+4(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.stop_6		cmp.b	_PlayKey+5(a5),d2
		bne.b	.stop_7
		lea	Channel6Buf,a4
		clr.b	_PlayKey+5(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.stop_7		cmp.b	_PlayKey+6(a5),d2
		bne.b	.stop_8
		lea	Channel7Buf,a4
		clr.b	_PlayKey+6(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.stop_8		cmp.b	_PlayKey+7(a5),d2
		bne	PlayNote
		lea	Channel8Buf,a4
		clr.b	_PlayKey+7(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.stop5		cmp.b	_PlayKey(a5),d2
		bne	PlayNote
		clr.l	_PlayKey(a5)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		bra	PlayNote
.keydown	tst	_InstNum(a5)
		beq	PlayNote
		move	_KeybListSize(a5),d1
		subq	#3,d1
		move.l	_KeybListPtr(a5),a2
		addq	#3,a2
.search		cmp.b	(a2)+,d2
		beq.b	.found
		dbf	d1,.search
		bra	PlayNote
.found		move	#7,d7
		tst	_PlayTune(a5)
		bne	.play6
		tst	_PolyOnOff(a5)
		beq	.play5
.play1		tst.b	_PlayMode(a5)
		bne.b	.skip
		move	#3,d7
.skip		tst	_PlayNum(a5)
		bne.b	.play2
		addq	#1,_PlayNum(a5)
		tst.b	_TunOnOff(a5)
		bne.b	.play2
		move.b	d2,_PlayKey(a5)
		lea	Channel1Buf,a4
		bra	.play7
.play2		cmp	#1,_PlayNum(a5)
		bne.b	.play3
		addq	#1,_PlayNum(a5)
		move.b	d2,_PlayKey+1(a5)
		lea	Channel2Buf,a4
		bra	.play7
.play3		cmp	#2,_PlayNum(a5)
		bne.b	.play4
		addq	#1,_PlayNum(a5)
		move.b	d2,_PlayKey+2(a5)
		lea	Channel3Buf,a4
		bra	.play7
.play4		cmp	#3,_PlayNum(a5)
		bne.b	.play_5
		addq	#1,_PlayNum(a5)
		move.b	d2,_PlayKey+3(a5)
		lea	Channel4Buf,a4
		bra.b	.play7
.play_5		tst.b	_PlayMode(a5)
		beq.b	.play7
		cmp	#4,_PlayNum(a5)
		bne.b	.play_6
		addq	#1,_PlayNum(a5)
		move.b	d2,_PlayKey+4(a5)
		lea	Channel5Buf,a4
		bra.b	.play7
.play_6		cmp	#5,_PlayNum(a5)
		bne.b	.play_7
		addq	#1,_PlayNum(a5)
		move.b	d2,_PlayKey+5(a5)
		lea	Channel6Buf,a4
		bra.b	.play7
.play_7		cmp	#6,_PlayNum(a5)
		bne.b	.play_8
		addq	#1,_PlayNum(a5)
		move.b	d2,_PlayKey+6(a5)
		lea	Channel7Buf,a4
		bra.b	.play7
.play_8		addq	#1,_PlayNum(a5)
		move.b	d2,_PlayKey+7(a5)
		lea	Channel8Buf,a4
		bra.b	.play7
.play5		tst.b	_TunOnOff(a5)
		beq.b	.play6
		lea	Channel1Buf,a3
		cmp.l	a3,a4
		bne.b	.play6
		lea	Channel2Buf,a4
.play6		move.b	d2,_PlayKey(a5)
.play7		and	d7,_PlayNum(a5)
		add	_KeybListSize1(a5),a2
		move.b	(a2),d0
		add.b	_OctaveAdder+1(a5),d0
		move.b	d0,ch_PartNote(a4)
		move.b	_InstNum+1(a5),ch_PartInst(a4)
		clr	ch_PartEffectNum(a4)
		clr	ch_PartEffects(a4)
		clr	ch_PartEffects+2(a4)
		clr	ch_PartEffects+4(a4)
		clr	ch_PartEffects+6(a4)
		clr	ch_Transpose(a4)
		btst	#3,_ActiveWindows(a5)
		beq.b	.ok
		move	_AnimFrames(a5),_Frames(a5)
		addq	#1,_Frames(a5)
		bne.b	.ok
		jmp	Stopp
.ok		bsr.b	CheckInst
		tst	_PlayTune(a5)
		bne.b	PlayExit
		tst	_PolyOnOff(a5)
		bne	PlayNote
PlayExit	rts

*****************************************************************************
* Play Arpeggio                                  * Conny Cyréus - Musicline *
*****************************************************************************

CheckInst	cmp.l	#Channel1Buf,a4
		bne.b	.notuning
		tst.b	_TunOnOff(a5)
		beq.b	.notuning
		lea	_TuningTone(a5),a0
		move.l	a0,ch_InstPtr(a4)
		clr.b	ch_OldInst(a4)
		bra.b	.oldinst
.notuning	moveq	#0,d0
		move.b	ch_PartInst(a4),d0
		move	d0,d1
		beq.b	.oldinst
		lsl	#2,d1
		lea	_InstPtrs(a5),a0
		move.l	(a0,d1.w),d1
		beq.b	.oldinst
		move.l	d1,ch_InstPtr(a4)
		cmp.b	ch_OldInst(a4),d0
		beq.b	.oldinst
		clr.b	ch_Arp(a4)
		clr.b	ch_InstPchSld(a4)
		move.b	d0,ch_OldInst(a4)
.oldinst	bsr.b	PlayPartFx
		bsr	PlayArpg
		bra	PlayInst

PlayPartFx	bset	#1,ch_Play(a4)
		bclr	#6,ch_Effects1(a4)
		clr.b	ch_Vib(a4)
		clr	ch_VibNote(a4)
		clr	ch_PTVibNote(a4)
		clr.b	ch_Tre(a4)
		clr.b	ch_Vol(a4)
		clr.b	ch_VolAdd(a4)
		clr.b	ch_VolSld(a4)
		clr.b	ch_CVolSld(a4)
		clr.b	ch_MVolSld(a4)
		clr.b	ch_PchSld(a4)
		clr.b	ch_PTPchSld(a4)
		clr.b	ch_SmpOfs(a4)
		clr.b	ch_Restart(a4)
		and.b	#$f5,ch_Arp(a4)
		bclr	#4,ch_Arp(a4)
		beq.b	.skip
		clr.b	ch_Arp(a4)
		clr.b	ch_ArpVolSld(a4)
		clr.b	ch_ArpPchSld(a4)
		clr	ch_ArpPchSldNote(a4)
.skip		tst.b	ch_PartNote(a4)
		beq.b	.skipp
		move	#-1,ch_PchSldToNote(a4)
		move	#-1,ch_PTPchSldToNote(a4)
.skipp		lea	ch_PartEffectNum(a4),a3
		moveq	#4,d7
.loop		moveq	#0,d0
		move.b	(a3)+,d0
		move	d0,d1
		add	d1,d1
		add	d1,d1
		lea	FX_JumpTable,a2
		move.l	(a2,d1.w),a2
		jsr	(a2)
		addq	#1,a3
		dbf	d7,.loop
		rts

PlayArpg	tst.b	ch_PartNote(a4)
		beq.b	.exit
		move.l	ch_InstPtr(a4),d0
		beq.b	.exit
		clr.b	ch_ArpWait(a4)
		move.l	d0,a0
		btst	#2,ch_Arp(a4)
		bne.b	.arpon
		btst	#0,ch_Arp(a4)
		bne.b	.arpon
		btst	#ARPEGGIO,inst_Effects1(a0)
		beq.b	.exit
		bset	#0,ch_Arp(a4)
.arpon		move	_InstNum(a5),d0
		cmp.b	ch_PartInst(a4),d0
		bne.b	.ok
		tst	_ArpEdOnOff(a5)
		beq.b	.ok
		tst.b	_Arpg(a5)
		beq.b	.ok
		clr.b	ch_Arp(a4)
.exit		rts
.ok		tst.b	ch_Restart(a4)
		bne.b	.oki
		tst.b	ch_PartInst(a4)
		beq	.exit
.oki		bset	#1,ch_Arp(a4)
		lea	_ArpgPtrs(a5),a1
		move	inst_ArpTable(a0),d0
		btst	#2,ch_Arp(a4)
		beq.b	.okej
		move.b	ch_ArpTab(a4),d0
.okej		lsl	#2,d0
		move.l	(a1,d0.w),d0
		beq	.exit
		move.l	d0,a1
		clr.b	ch_ArpPos(a4)
		clr.b	ch_ArpWait(a4)
		clr.b	ch_ArpVolSld(a4)
		clr.b	ch_ArpPchSld(a4)
		clr	ch_ArpPchSldNote(a4)
		move.b	inst_ArpSpeed(a0),ch_ArpSpdCnt(a4)
.restart	move.l	a1,a2
		moveq	#0,d0
		move.b	ch_ArpPos(a4),d0
		move.b	d0,d1
		addq.b	#1,d1
		and.b	#$7f,d1
		move.b	d1,ch_ArpPos(a4)
		mulu	#6,d0
		add	d0,a2
		move.b	ch_PartNote(a4),ch_ArpgNote(a4)
.note		moveq	#0,d0
		move.b	(a2)+,d0
		beq	WaitArpg
.end		cmp.b	#61,d0
		bne.b	.jump
		bclr	#ARPEGGIO,ch_Effects1(a4)
		bra	.exit
.jump		cmp.b	#62,d0
		bne.b	.ws
		bra	.restart
.ws		moveq	#0,d1
		move.b	(a2)+,d1
		move	d1,d2
		bne.b	.fx
		move.b	inst_SmplNumber(a0),d2
.fx		move.b	d2,ch_WsNumber(a4)
		moveq	#1,d7
.loop		moveq	#0,d2
		move.b	(a2)+,d2
		move	d2,d3
 		cmp	#5,d3
		bhi.b	.skip
		lsl	#2,d3
		lea	ArpFx_JmpTab,a1
		move.l	(a1,d3.w),a1
		jsr	(a1)
.skip		addq	#1,a2
		dbf	d7,.loop
		tst.b	d0
		bmi.b	.transnote
		bset	#5,ch_Arp(a4)
		bra.b	.fixnote
.transnote	add.b	#61,d0
		add.b	ch_ArpgNote(a4),d0
.fixnote	ext	d0
		lsl	#5,d0
		move	d0,ch_Note(a4)
		move	d0,ch_ArpNote(a4)
ArpWaitStart	lsl	#2,d1
		bne.b	.wsptr
		rts
.wsptr		lea	_WsPtrs(a5),a1
		move.l	(a1,d1.w),d0
		beq.b	.exit
		move.l	d0,ch_WsPtr(a4)
		bset	#3,ch_Arp(a4)
.exit		rts
WaitArpg	bset	#0,ch_ArpWait(a4)
		rts

ArpFx_JmpTab	dc.l	ArpRts
		dc.l	ArpSldUp
		dc.l	ArpSldDwn
		dc.l	ArpSetVol
		dc.l	ArpSldVol
		dc.l	ArpSldVol
		dc.l	ArpRestart

ArpRts		rts

ArpSldUp	move.b	d2,ch_ArpPchSld(a4)
		clr.b	ch_ArpPchSldType(a4)
		moveq	#0,d3
		move.b	(a2),d3
		beq.b	.x
		move	d3,ch_ArpPchSldSpd(a4)
		move	#59*32+32,ch_ArpPchSldToNote(a4)
.x		rts

ArpSldDwn	move.b	d2,ch_ArpPchSld(a4)
		move.b	#$ff,ch_ArpPchSldType(a4)
		moveq	#0,d3
		move.b	(a2),d3
		beq.b	.x
		move	d3,ch_ArpPchSldSpd(a4)
		clr	ch_ArpPchSldToNote(a4)
.x		rts

ArpSetVol	moveq	#0,d3
		move.b	(a2),d3
		lsl	#4,d3
		bset	#2,ch_Restart(a4)
		move	d3,ch_Volume1(a4)
		move	d3,ch_Volume2(a4)
		move	d3,ch_Volume3(a4)
		rts

ArpSldVol	move.b	d2,ch_ArpVolSld(a4)
		moveq	#0,d3
		move.b	(a2),d3
		beq.b	.x
		move	d3,ch_ArpVolSldSpd(a4)
.x		rts

ArpRestart	bset	#1,ch_Restart(a4)
		move.b	ch_EffectsPar1(a4),d3
		btst	#PHASEINIT,d3
		beq.b	.next1
		clr.b	ch_PhaInit(a4)
.next1		btst	#RESONANCEINIT,d3
		beq.b	.next2
		clr.b	ch_ResInit(a4)
.next2		btst	#FILTERINIT,d3
		beq.b	.next3
		clr.b	ch_FilInit(a4)
.next3		btst	#TRANSFORMINIT,d3
		beq.b	.next4
		clr.b	ch_TraInit(a4)
.next4		btst	#MIXINIT,d3
		beq.b	.next5
		clr.b	ch_MixInit(a4)
.next5		btst	#LOOPINIT,ch_EffectsPar2(a4)
		beq.b	.next6
		clr.b	ch_LooInit(a4)
.next6		rts

PlayInst	btst	#0,ch_ArpWait(a4)
		bne	.exit
		move.l	ch_InstPtr(a4),d0
		beq	.exit
		move.l	d0,a0
		move.l	d0,a1
		move.b	ch_Restart(a4),d1
		and.b	#3,d1
		bne.b	.inst
		tst.b	ch_PartInst(a4)
		beq	.playnote
		cmp.b	#fx_Portamento,ch_PchSld(a4)
		beq	.getvol
		tst.b	ch_PartNote(a4)
		beq	.getvol
		btst	#3,ch_Arp(a4)
		beq.b	.inst
		move.l	ch_WsPtr(a4),d0
		beq	.exit
		move.l	d0,a1
		move.b	smpl_Type(a1),d1
		bne.b	.wave
		bra.b	.ws
.inst		move.b	inst_SmplNumber(a0),ch_WsNumber(a4)
.wave		move.b	smpl_Type(a0),d1
.ws		move.l	smpl_Pointer(a1),d0
		beq	.exit
		tst.b	inst_Transpose(a0)
		bne.b	.skip
		clr	ch_Transpose(a4)
.skip		move.b	inst_EnvTraPhaFilBits(a0),d3
		btst	#6,ch_Effects1(a4)
		beq.b	.noholdsus
		and.b	#$fe,d3
		and.b	#1,ch_EffectsPar1(a4)
		or.b	ch_EffectsPar1(a4),d3
.noholdsus	move.b	d3,ch_EffectsPar1(a4)
		move.b	inst_MixResLooBits(a0),ch_EffectsPar2(a4)
		move	inst_Effects1(a0),ch_Effects1(a4)

		move.b	d1,ch_WaveOrSample(a4)
		beq.b	.sample
		bsr	FixWaveLength
		bra.b	.getvolume
.sample		move	smpl_Length(a1),d1
		tst.b	ch_SmpOfs(a4)
		beq.b	.nosmpofs
		moveq	#0,d3
		move.b	ch_SmplOfs(a4),d3
		lsl	#7,d3
		cmp	d1,d3
		blo.b	.ok
		moveq	#1,d1
		bra.b	.nosmpofs
.ok		sub	d3,d1
		lsl	#1,d3
		add.l	d3,d0
.nosmpofs	move.l	d0,ch_WsPointer(a4)
		move	d1,ch_WsLength(a4)
		move.l	smpl_RepPointer(a1),d0
		btst	#3,ch_Arp(a4)
		beq.b	.instlen
		move	smpl_RepLength(a1),d1
		bra.b	.oki
.instlen	move	smpl_RepLength(a1),d1
		btst	#WSLOOP,inst_Effects1(a0)
.oki		bne.b	.wsloop
		move.l	#ZeroSample,d0
		moveq	#1,d1
.wsloop		move.l	d0,ch_WsRepPointer(a4)
		move.l	d0,ch_WsRepPtrOrg(a4)
		move	d1,ch_WsRepLength(a4)

.getvolume	and.b	#7,ch_Restart(a4)
		bne.b	.playnote
.getvol		move	inst_Volume(a0),d0
		lsl	#4,d0
		move	d0,ch_Volume1(a4)

.playnote	move	ch_Volume1(a4),d1
		tst.b	ch_Vol(a4)
		beq.b	.skip1
		move	ch_VolSet(a4),d1
.skip1		tst.b	ch_VolAdd(a4)
		beq.b	.skip2
		add	ch_VolAddNum(a4),d1
		bpl.b	.tstmaxvol
		clr	d1
.tstmaxvol	cmp	#64*16,d1
		bls.b	.skip2
		move	#64*16,d1
.skip2		move	d1,ch_Volume1(a4)
		move	d1,ch_Volume2(a4)
		move	d1,ch_Volume3(a4)

		cmp.b	#fx_Portamento,ch_PchSld(a4)
		beq	.exit

		move.b	inst_SlideSpeed(a0),d0
		beq.b	.noteplay
		moveq	#0,d2
		move.b	ch_PartNote(a4),d2
		beq.b	.noteplay
		move.b	d0,ch_PchSldSpd+1(a4)

		move	ch_Note(a4),d1
		add	ch_PchSldNote(a4),d1
		lsl	#5,d2
		move	d2,ch_PchSldToNote(a4)
		cmp	d1,d2
		smi.b	ch_PchSldType(a4)
		tst.b	ch_InstPchSld(a4)
		bne	InstPlay
		move.b	#fx_Portamento,ch_InstPchSld(a4)

.noteplay	bclr	#1,ch_Arp(a4)
		bne.b	.skip3
		moveq	#0,d1
		move.b	ch_PartNote(a4),d1
		beq.b	.exit
		lsl	#5,d1
		move	d1,ch_Note(a4)
		clr.b	ch_ArpVolSld(a4)
		clr.b	ch_ArpPchSld(a4)
		clr	ch_ArpPchSldNote(a4)
.skip3		move	smpl_SemiTone(a1),d0
		lsl	#5,d0
		move	d0,ch_SemiTone(a4)
		btst	#2,ch_Play(a4)
		bne.b	.skipp
		move	smpl_FineTune(a1),ch_FineTune(a4)
.skipp		clr	ch_PTPchSldNote(a4)
		clr	ch_PchSldNote(a4)
		clr	ch_PTVibNote(a4)
		clr.b	ch_PTTrePos(a4)
		clr.b	ch_PTVibPos(a4)
		clr	ch_VibNote(a4)
		clr	ch_PTPchAdd(a4)
		clr	ch_PchAdd(a4)
		tst.b	ch_PartInst(a4)
		bne	InstPlay
		move.b	ch_Restart(a4),d1
		and.b	#3,d1
		bne	InstPlay
.exit		rts

* Part Effects
*·····            Pitch                             ·····*
pfx_UNUSED	rts

pfx_SlideUp	move.b	d0,ch_PchSld(a4)
		clr.b	ch_PchSldType(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.x
		move	d3,ch_PchSldSpd(a4)
.x		move	#59*32+32,ch_PchSldToNote(a4)
		rts

pfx_SlideDown	move.b	d0,ch_PchSld(a4)
		move.b	#$ff,ch_PchSldType(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.x
		move	d3,ch_PchSldSpd(a4)
.x		clr	ch_PchSldToNote(a4)
		rts

pfx_Portamento	move.b	d0,ch_PchSld(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.skip
		move	d3,ch_PchSldSpd(a4)
.skip		move	ch_Note(a4),d1
		add	ch_PchSldNote(a4),d1
		moveq	#0,d2
		move.b	ch_PartNote(a4),d2
		beq.b	.x
		lsl	#5,d2
		clr.b	ch_PartNote(a4)
		move	d2,ch_PchSldToNote(a4)
		cmp	d1,d2
		beq.b	.zero
		smi.b	ch_PchSldType(a4)
		rts
.zero		move	#-1,ch_PchSldToNote(a4)
.x		cmp	#-1,ch_PchSldToNote(a4)
		bne.b	.exit
		clr.b	ch_PchSld(a4)
.exit		rts

pfx_InitInstrumentPortamento
		clr.b	ch_InstPchSld(a4)
		rts

pfx_PitchUp	moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		add	d1,ch_PchAdd(a4)
.x		rts

pfx_PitchDown	moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		sub	d1,ch_PchAdd(a4)
.x		rts

pfx_VibratoSpeed
		moveq	#0,d0
		move.b	(a3),d0
		beq.b	.x
		move	d0,ch_VibCmdSpeed(a4)
.x		rts

pfx_VibratoUp	moveq	#1,d1
		bra.b	Vibrato_pfx
pfx_VibratoDown	moveq	#0,d1
Vibrato_pfx	move.b	d0,ch_Vib(a4)
		tst.b	ch_PartNote(a4)
		beq.b	.vib
		move.b	d1,ch_VibDir(a4)
		clr	ch_VibCount(a4)
		clr	ch_VibCmdDepth(a4)
		clr	ch_VibCmdDelay(a4)
		clr	ch_VibAtkSpeed(a4)
		clr	ch_VibAtkLength(a4)
.vib		moveq	#0,d0
		move.b	(a3),d0
		beq.b	.skip
		lsl	#8,d0
		move	d0,ch_VibDepth(a4)
.skip		move.b	ch_PartVibWaveNum(a4),ch_VibWaveNum(a4)
		rts

pfx_VibratoWave	move.b	(a3),d0
		cmp.b	#3,d0
		bhi.b	.x
		move.b	d0,ch_VibWaveNum(a4)
		move.b	d0,ch_PartVibWaveNum(a4)
.x		rts

pfx_SetFinetune	moveq	#0,d1
		move.b	(a3),d1
		bmi.b	.minus
		cmp.b	#31,d1
		bls.b	.done
		moveq	#31,d1
		bra.b	.done
.minus		cmp.b	#-31,d1
		bge.b	.done
		moveq	#-31,d1
.done		ext	d1
		move	d1,ch_FineTune(a4)
		bset	#2,ch_Play(a4)
		rts

*·····            Instrument Volume                 ·····*
pfx_Volume	move.b	d0,ch_Vol(a4)
		moveq	#0,d1
		move.b	(a3),d1
		lsl	#4,d1
		move	d1,ch_VolSet(a4)
		rts

pfx_VolumeSlideUp
		move.b	d0,ch_VolSld(a4)
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		move	d1,ch_VolSldSpd(a4)
.x		rts
pfx_VolumeSlideDown
		move.b	d0,ch_VolSld(a4)
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		move	d1,ch_VolSldSpd(a4)
.x		rts

pfx_VolumeSlideToVolSet
		moveq	#0,d0
		move.b	(a3),d0
		lsl	#4,d0
		move	d0,ch_VolSldToVol(a4)
		rts
pfx_VolumeSlideToVol
		move.b	d0,ch_VolSld(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.skip
		move	d3,ch_VolSldSpd(a4)
.skip		move	ch_Volume1(a4),d1
		move	d1,ch_VolSldVol(a4)
		move	ch_VolSldToVol(a4),d2
		cmp	d1,d2
		beq.b	.zero
		smi.b	ch_VolSldType(a4)
		clr.b	ch_VolSldToVolOff(a4)
		rts
.zero		move.b	#1,ch_VolSldToVolOff(a4)
		rts

pfx_VolumeAdd	move.b	d0,ch_VolAdd(a4)
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		lsl	#4,d1
		move	d1,ch_VolAddNum(a4)
.x		rts
pfx_VolumeSub	move.b	d0,ch_VolAdd(a4)
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		lsl	#4,d1
		neg	d1
		move	d1,ch_VolAddNum(a4)
.x		rts

pfx_TremoloSpeed
		moveq	#0,d0
		move.b	(a3),d0
		beq.b	.x
		move	d0,ch_TreCmdSpeed(a4)
.x		rts
pfx_TremoloUp	moveq	#1,d1
		bra.b	Tremolo_pfx
pfx_TremoloDown	moveq	#0,d1
Tremolo_pfx	move.b	d0,ch_Tre(a4)
		tst.b	ch_PartNote(a4)
		beq.b	.tre
		move.b	d1,ch_TreDir(a4)
		clr	ch_TreCount(a4)
		clr	ch_TreCmdDepth(a4)
		clr	ch_TreCmdDelay(a4)
		clr	ch_TreAtkSpeed(a4)
		clr	ch_TreAtkLength(a4)
.tre		moveq	#0,d0
		move.b	(a3),d0
		beq.b	.skip
		lsl	#8,d0
		move	d0,ch_TreDepth(a4)
.skip		move.b	ch_PartTreWaveNum(a4),ch_TreWaveNum(a4)
		rts

pfx_TremoloWave	move.b	(a3),d0
		cmp.b	#3,d0
		bhi.b	.x
		move.b	d0,ch_TreWaveNum(a4)
		move.b	d0,ch_PartTreWaveNum(a4)
.x		rts

*·····            Channel Volume                    ·····*
pfx_ChannelVol	moveq	#0,d1
		move.b	(a3),d1
		lsl	#4,d1
		move	d1,ch_CVolume(a4)
		rts

pfx_ChannelVolSlideUp
		move.b	d0,ch_CVolSld(a4)
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		move	d1,ch_CVolSldSpd(a4)
.x		rts
pfx_ChannelVolSlideDown
		move.b	d0,ch_CVolSld(a4)
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		move	d1,ch_CVolSldSpd(a4)
.x		rts

pfx_ChannelVolSlideToVolSet
		moveq	#0,d0
		move.b	(a3),d0
		lsl	#4,d0
		move	d0,ch_CVolSldToVol(a4)
		rts
pfx_ChannelVolSlideToVol
		move.b	d0,ch_CVolSld(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.skip
		move	d3,ch_CVolSldSpd(a4)
.skip		move	ch_CVolume(a4),d1
		move	d1,ch_CVolSldVol(a4)
		move	ch_CVolSldToVol(a4),d2
		cmp	d1,d2
		beq.b	.zero
		smi.b	ch_CVolSldType(a4)
		clr.b	ch_CVolSldToVolOff(a4)
		rts
.zero		move.b	#1,ch_CVolSldToVolOff(a4)
		rts

pfx_ChannelVolAdd
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		lsl	#4,d1
		move	d1,ch_CVolAddNum(a4)
.x		move	ch_CVolAddNum(a4),d1
		add	d1,ch_CVolume(a4)
		cmp	#64*16,ch_CVolume(a4)
		bls.b	.next
		move	#64*16,ch_CVolume(a4)
.next		rts
pfx_ChannelVolSub
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		lsl	#4,d1
		move	d1,ch_CVolAddNum(a4)
.x		move	ch_CVolAddNum(a4),d1
		sub	d1,ch_CVolume(a4)
		bpl.b	.next
		clr	ch_CVolume(a4)
.next		rts

pfx_AllChannelVol
		moveq	#0,d1
		move.b	(a3),d1
		lsl	#4,d1
		lea	Channel1Buf,a2
		move	d1,ch_CVolume(a2)
		lea	Channel2Buf,a2
		move	d1,ch_CVolume(a2)
		lea	Channel3Buf,a2
		move	d1,ch_CVolume(a2)
		lea	Channel4Buf,a2
		move	d1,ch_CVolume(a2)
		tst.b	_PlayMode(a5)
		beq.b	.x
		lea	Channel5Buf,a2
		move	d1,ch_CVolume(a2)
		lea	Channel6Buf,a2
		move	d1,ch_CVolume(a2)
		lea	Channel7Buf,a2
		move	d1,ch_CVolume(a2)
		lea	Channel8Buf,a2
		move	d1,ch_CVolume(a2)
.x		rts

*·····            Master Volume                     ·····*

pfx_MasterVol	moveq	#0,d1
		move.b	(a3),d1
		lsl	#4,d1
		move	d1,_MasterVol(a5)
		rts
pfx_MasterVolSlideUp
		move.b	d0,ch_MVolSld(a4)
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		move	d1,ch_MVolSldSpd(a4)
.x		rts
pfx_MasterVolSlideDown
		move.b	d0,ch_MVolSld(a4)
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		move	d1,ch_MVolSldSpd(a4)
.x		rts

pfx_MasterVolSlideToVolSet
		moveq	#0,d0
		move.b	(a3),d0
		lsl	#4,d0
		move	d0,ch_MVolSldToVol(a4)
		rts
pfx_MasterVolSlideToVol
		move.b	d0,ch_MVolSld(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.skip
		move	d3,ch_MVolSldSpd(a4)
.skip		move	d1,ch_MVolSldVol(a4)
		move	ch_MVolSldToVol(a4),d2
		cmp	d1,d2
		beq.b	.zero
		smi.b	ch_MVolSldType(a4)
		clr.b	ch_MVolSldToVolOff(a4)
		rts
.zero		move.b	#1,ch_MVolSldToVolOff(a4)
		rts

pfx_MasterVolAdd
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		lsl	#4,d1
		move	d1,ch_MVolAddNum(a4)
.x		move	ch_MVolAddNum(a4),d1
		add	d1,_MasterVol(a5)
		cmp	#64*16,_MasterVol(a5)
		bls.b	.next
		move	#64*16,_MasterVol(a5)
.next		rts
pfx_MasterVolSub
		moveq	#0,d1
		move.b	(a3),d1
		beq.b	.x
		lsl	#4,d1
		move	d1,ch_MVolAddNum(a4)
.x		move	ch_MVolAddNum(a4),d1
		sub	d1,_MasterVol(a5)
		bpl.b	.next
		clr	_MasterVol(a5)
.next		rts

*·····            Other                  ·····*
pfx_SpeedPart	move.b	(a3),d0
		beq.b	.x
		cmp.b	#$1f,d0
		bls.b	.ok
		move	#$1f,d0
.ok		move.b	#1,ch_SpdPart(a4)
		move.b	d0,ch_Spd(a4)
		tst.b	ch_Grv(a4)
		beq.b	.spd
		tst.b	ch_PartGrv(a4)
		bne.b	.x
.spd		move.b	d0,ch_SpdCnt(a4)
.x		rts

pfx_GroovePart	move.b	(a3),d0
		beq.b	.x
		cmp.b	#$1f,d0
		bls.b	.ok
		move	#$1f,d0
.ok		move.b	#1,ch_GrvPart(a4)
		move.b	d0,ch_Grv(a4)
		beq.b	.spd
		tst.b	ch_PartGrv(a4)
		beq.b	.x
.spd		move.b	d0,ch_SpdCnt(a4)
.x		rts

SpeedAllMacro	MACRO
		lea	\1,a2
		cmp.l	a2,a4
		blo.b	.speed\@
		tst.b	ch_SpdPart(a2)
		bne.b	.x\@
		move.b	d0,ch_Spd(a2)
		tst.b	ch_Grv(a2)
		beq.b	.spd\@
		tst.b	ch_PartGrv(a2)
		bne.b	.x\@
.spd\@		move.b	d0,ch_SpdCnt(a2)
		bra.b	.x\@
.speed\@	move.b	d0,ch_Spd(a2)
.x\@
		ENDM

GrooveAllMacro	MACRO
		lea	\1,a2
		cmp.l	a2,a4
		blo.b	.speed\@
		tst.b	ch_GrvPart(a2)
		bne.b	.x\@
		move.b	d0,ch_Grv(a2)
		beq.b	.x\@
		tst.b	ch_PartGrv(a2)
		bne.b	.x\@
		move.b	d0,ch_SpdCnt(a2)
		bra.b	.x\@
.speed\@	move.b	d0,ch_Grv(a2)
.x\@
		ENDM

pfx_SpeedAll	moveq	#0,d0
		move.b	(a3),d0
		beq	.x
		cmp.b	#$20,d0
		blo.b	.notempo
		move	d0,_TuneTmp(a5)
		move.l	_TimerValue1(a5),d1
		divu	d0,d1
		lea	$bfd000,a1
		move.b	d1,ciatalo(a1)
		lsr	#8,d1
		move.b	d1,ciatahi(a1)
		jsr	CalcVUTimer
		rts
.notempo	move.b	d0,_TuneSpd(a5)
		SpeedAllMacro	Channel1Buf
		SpeedAllMacro	Channel2Buf
		SpeedAllMacro	Channel3Buf
		SpeedAllMacro	Channel4Buf
		tst.b	_PlayMode(a5)
		beq	.x
		SpeedAllMacro	Channel5Buf
		SpeedAllMacro	Channel6Buf
		SpeedAllMacro	Channel7Buf
		SpeedAllMacro	Channel8Buf
.x		rts

pfx_GrooveAll	move.b	(a3),d0
		beq	.x
		and.b	#$1f,d0
		move.b	d0,_TuneGrv(a5)
		GrooveAllMacro	Channel1Buf
		GrooveAllMacro	Channel2Buf
		GrooveAllMacro	Channel3Buf
		GrooveAllMacro	Channel4Buf
		tst.b	_PlayMode(a5)
		beq	.x
		GrooveAllMacro	Channel5Buf
		GrooveAllMacro	Channel6Buf
		GrooveAllMacro	Channel7Buf
		GrooveAllMacro	Channel8Buf
.x		rts

pfx_ArpeggioList
		bset	#2,ch_Arp(a4)
		move.b	(a3),ch_ArpTab(a4)
		rts

pfx_ArpeggioListOneStep
		or.b	#$14,ch_Arp(a4)
		move.b	(a3),ch_ArpTab(a4)
		rts

pfx_HoldSustain	bset	#6,ch_Effects1(a4)
		bclr	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		tst.b	(a3)
		beq.b	.x
		bset	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
.x		rts

pfx_Filter	tst.b	(a3)
		beq.b	.off
		bclr	#1,$bfe001
		rts
.off		bset	#1,$bfe001
		rts

pfx_SampleOffset
		move.b	d0,ch_SmpOfs(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.nonewofs
		move.b	d3,ch_SmplOfs(a4)
.nonewofs	rts

pfx_RestartNoVolume
		tst.b	ch_PartInst(a4)
		bne.b	.exit
		move.b	#1,ch_Restart(a4)
.exit		rts

pfx_WaveSample	moveq	#0,d3
		move.b	(a3),d3
		beq.b	.exit
		lea	_WsPtrs(a5),a1
		lsl.l	#2,d3
		move.l	(a1,d3.w),d3
		beq.b	.exit
		move.l	d3,ch_WsPtr(a4)
		bset	#3,ch_Arp(a4)
.exit		rts

pfx_InitInstrument
		clr.b	ch_PhaInit(a4)
		clr.b	ch_ResInit(a4)
		clr.b	ch_FilInit(a4)
		clr.b	ch_TraInit(a4)
		clr.b	ch_MixInit(a4)
		clr.b	ch_LooInit(a4)
		rts

*·····            ProTracker Pitch           ·····*

pfx_PTSlideUp	move.b	d0,ch_PTPchSld(a4)
		clr.b	ch_PTPchSldType(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.x
		move	d3,ch_PTPchSldSpd(a4)
.x		move	#106,ch_PTPchSldToNote(a4)
		rts

pfx_PTSlideDown	move.b	d0,ch_PTPchSld(a4)
		move.b	#$ff,ch_PTPchSldType(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.x
		move	d3,ch_PTPchSldSpd(a4)
.x		move	#3591,ch_PTPchSldToNote(a4)
		rts
pfx_PTPortamento
		move.b	#fx_Portamento,ch_PchSld(a4)
		move.b	d0,ch_PTPchSld(a4)
		moveq	#0,d3
		move.b	(a3),d3
		beq.b	.skip
		move	d3,ch_PTPchSldSpd2(a4)
.skip		bsr	GetPeriod
		add	ch_PTPchSldNote(a4),d0
		move	d0,d2
		moveq	#0,d0
		move.b	ch_PartNote(a4),d0
		beq.b	.x
		lsl	#5,d0
		bsr	GetPeriod2
		clr.b	ch_PartNote(a4)
		move	d0,ch_PTPchSldToNote(a4)
		cmp	d0,d2
		beq.b	.zero
		smi.b	ch_PTPchSldType(a4)
		rts
.zero		move	#-1,ch_PTPchSldToNote(a4)
.x		cmp	#-1,ch_PTPchSldToNote(a4)
		bne.b	.exit
		clr.b	ch_PTPchSld(a4)
		clr.b	ch_PchSld(a4)
.exit		rts

pfx_PTFineSlideUp
		move.b	(a3),d1
		beq.b	.x
		and	#$f,d1
		sub	d1,ch_PTPchAdd(a4)
.x		rts

pfx_PTFineSlideDown
		move.b	(a3),d1
		beq.b	.x
		and	#$f,d1
		add	d1,ch_PTPchAdd(a4)
.x		rts

pfx_PTTremolo	move.b	d0,ch_Tre(a4)
		move.b	(a3),d0
		beq.b	.x
		move.b	ch_PTTreCmd(a4),d2
		and.b	#$0f,d0
		beq.b	.treskip
		and.b	#$f0,d2
		or.b	d0,d2
.treskip	move.b	(a3),d0
		and.b	#$f0,d0
		beq.b	.treskip2
		and.b	#$0f,d2
		or.b	d0,d2
.treskip2	move.b	d2,ch_PTTreCmd(a4)
.x		rts

pfx_PTTremoloWave
		move.b	(a3),d0
		and.b	#$0f,d0
		move.b	d0,ch_PTTreWave(a4)
		rts

pfx_PTVibrato	move.b	d0,ch_Vib(a4)
		move.b	(a3),d0
		beq.b	.x
		move.b	ch_PTVibCmd(a4),d2
		and.b	#$0f,d0
		beq.b	.vibskip
		and.b	#$f0,d2
		or.b	d0,d2
.vibskip	move.b	(a3),d0
		and.b	#$f0,d0
		beq.b	.vibskip2
		and.b	#$0f,d2
		or.b	d0,d2
.vibskip2	move.b	d2,ch_PTVibCmd(a4)
.x		rts

pfx_PTVibratoWave
		move.b	(a3),d0
		and.b	#$0f,d0
		move.b	d0,ch_PTVibWave(a4)
		rts

pfx_PTVolSlideUp
		bra	pfx_VolumeSlideUp
pfx_PTVolSlideDown
		bra	pfx_VolumeSlideDown

*·····            UserCommand            ·····*
pfx_UserCommand			rts

FixWaveLength	cmp.b	#1,d1
		bhi.b	.fix1
		add.l	#256+128+64+32,d0
		move.l	d0,ch_WsPointer(a4)
		move.l	d0,ch_WsRepPointer(a4)
		move.l	d0,ch_WsRepPtrOrg(a4)
		move	inst_SmplLength(a0),d0
		lsr	#4,d0
		move	d0,ch_WsLength(a4)
		move	d0,ch_WsRepLength(a4)
		bra	.skip
.fix1		cmp.b	#2,d1
		bhi.b	.fix2
		add.l	#256+128+64,d0
		move.l	d0,ch_WsPointer(a4)
		move.l	d0,ch_WsRepPointer(a4)
		move.l	d0,ch_WsRepPtrOrg(a4)
		move	inst_SmplLength(a0),d0
		lsr	#3,d0
		move	d0,ch_WsLength(a4)
		move	d0,ch_WsRepLength(a4)
		bra.b	.skip
.fix2		cmp.b	#3,d1
		bhi.b	.fix3
		add.l	#256+128,d0
		move.l	d0,ch_WsPointer(a4)
		move.l	d0,ch_WsRepPointer(a4)
		move.l	d0,ch_WsRepPtrOrg(a4)
		move	inst_SmplLength(a0),d0
		lsr	#2,d0
		move	d0,ch_WsLength(a4)
		move	d0,ch_WsRepLength(a4)
		bra.b	.skip
.fix3		cmp.b	#4,d1
		bhi.b	.fix4
		add.l	#256,d0
		move.l	d0,ch_WsPointer(a4)
		move.l	d0,ch_WsRepPointer(a4)
		move.l	d0,ch_WsRepPtrOrg(a4)
		move	inst_SmplLength(a0),d0
		lsr	#1,d0
		move	d0,ch_WsLength(a4)
		move	d0,ch_WsRepLength(a4)
		bra.b	.skip
.fix4		move.l	d0,ch_WsPointer(a4)
		move.l	d0,ch_WsRepPointer(a4)
		move.l	d0,ch_WsRepPtrOrg(a4)
		move	inst_SmplLength(a0),d0
		move	d0,ch_WsLength(a4)
		move	d0,ch_WsRepLength(a4)
.skip		rts

* Twins/PHA *****************************************************************
* Play Arpeggio                                       Last Change: 93-01-15 *
*****************************************************************************

InstPlay	cmp.b	#fx_Portamento,ch_PchSld(a4)
		beq	Sexit
		btst	#0,ch_ArpWait(a4)
		bne	Sexit
		bset	#0,ch_Play(a4)
.vibrato	tst.b	ch_Vib(a4)
		bne.b	.tremolo
		btst	#VIBRATO,ch_Effects1(a4)
		beq.b	.tremolo
		clr	ch_VibCount(a4)
		clr	ch_VibCmdDepth(a4)
		move	inst_VibSpeed(a0),ch_VibCmdSpeed(a4)
		move	inst_VibDelay(a0),ch_VibCmdDelay(a4)
		move	inst_VibAtkSpd(a0),ch_VibAtkSpeed(a4)
		move	inst_VibAttack(a0),ch_VibAtkLength(a4)
		move	inst_VibDepth(a0),ch_VibDepth(a4)
		move.b	inst_VibWaveNum(a0),ch_VibWaveNum(a4)
		move.b	inst_VibDir(a0),ch_VibDir(a4)
.tremolo	tst.b	ch_Tre(a4)
		bne.b	.adsr
		btst	#TREMOLO,ch_Effects1(a4)
		beq.b	.adsr
		clr	ch_TreCount(a4)
		clr	ch_TreCmdDepth(a4)
		move	inst_TreSpeed(a0),ch_TreCmdSpeed(a4)
		move	inst_TreDelay(a0),ch_TreCmdDelay(a4)
		move	inst_TreAtkSpd(a0),ch_TreAtkSpeed(a4)
		move	inst_TreAttack(a0),ch_TreAtkLength(a4)
		move	inst_TreDepth(a0),ch_TreDepth(a4)
		move.b	inst_TreWaveNum(a0),ch_TreWaveNum(a4)
		move.b	inst_TreDir(a0),ch_TreDir(a4)
.adsr		btst	#ADSR,ch_Effects1(a4)
		beq.b	.phaseing
		clr	ch_ADSRVolume(a4)
		lea	inst_EnvAttLen(a0),a1
		lea	ch_ADSRData(a4),a2
		move.l	(a1)+,(a2)+
		move.l	(a1)+,(a2)+
		move.l	(a1)+,(a2)+
		move.l	(a1)+,(a2)+
		move.l	(a1)+,(a2)+
		move.l	(a1)+,(a2)+
.phaseing	btst	#PHASE,ch_Effects2(a4)
		beq.b	.resonancing
		move.b	inst_PhaType+1(a0),ch_PhaType(a4)
		lea	ch_PhaData(a4),a2
		btst	#PHASESTEP,ch_EffectsPar1(a4)
		sne	cnt_step(a2)
		beq.b	.pskipstep
		move	inst_PhaTurns(a0),ch_PhaSpd(a4)
		clr	cnt_turns(a2)
		bra.b	.phainit
.pskipstep	move	inst_PhaTurns(a0),cnt_turns(a2)
		btst	#PHASEINIT,ch_EffectsPar1(a4)
		bne.b	.phainit
		clr.b	ch_PhaInit(a4)
.phase		move	inst_PhaStart(a0),d0
		move	d0,cnt_counter(a2)
		move	inst_PhaSpeed(a0),cnt_speed(a2)
		move	inst_PhaRepeat(a0),d1
		move	d1,cnt_repeat(a2)
		move	inst_PhaRepEnd(a0),cnt_repeatend(a2)
		cmp	d1,d0
		ble.b	.phago
		neg	cnt_speed(a2)
.phago		move	inst_PhaDelay(a0),cnt_delay(a2)
		bra.b	.resonancing
.phainit	move.b	ch_PhaInit(a4),d0
		move.b	ch_PartInst(a4),ch_PhaInit(a4)
		cmp.b	_InstInit(a5),d0
		beq	.phase
.phaskip	cmp.b	ch_PartInst(a4),d0
		bne	.phase
		bra	.phago

.resonancing	move.b	inst_MixResFilBoost(a0),ch_MixResFilBoost(a4)
		btst	#RESONANCE,ch_Effects2(a4)
		beq 	.filtering
		move.b	inst_ResAmp(a0),ch_ResAmp(a4)
		lea	ch_ResData(a4),a2
		btst	#RESONANCESTEP,ch_EffectsPar2(a4)
		sne	cnt_step(a2)
		beq.b	.rskipstep
		move	inst_ResTurns(a0),ch_ResSpd(a4)
		clr	cnt_turns(a2)
		bra.b	.resinit
.rskipstep	move	inst_ResTurns(a0),cnt_turns(a2)
		btst	#RESONANCEINIT,ch_EffectsPar2(a4)
		bne.b	.resinit
		clr.b	ch_ResInit(a4)
.resonace	move.b	#1,ch_ResLastInit(a4)
		move	inst_ResStart(a0),d0
		move	d0,cnt_counter(a2)
		move	inst_ResSpeed(a0),cnt_speed(a2)
		move	inst_ResRepeat(a0),d1
		move	d1,cnt_repeat(a2)
		move	inst_ResRepEnd(a0),cnt_repeatend(a2)
		cmp	d1,d0
		ble.b	.resgo
		neg	cnt_speed(a2)
.resgo		move	inst_ResDelay(a0),cnt_delay(a2)
		bra.b	.filtering
.resinit	move.b	ch_ResInit(a4),d0
		move.b	ch_PartInst(a4),ch_ResInit(a4)
		cmp.b	_InstInit(a5),d0
		beq	.resonace
.resskip	cmp.b	ch_PartInst(a4),d0
		bne	.resonace
		bra	.resgo

.filtering	btst	#FILTER,ch_Effects2(a4)
		beq 	.mix
		move.b	inst_FilType(a0),ch_FilType(a4)
		lea	ch_FilData(a4),a2
		btst	#FILTERSTEP,ch_EffectsPar1(a4)
		sne	cnt_step(a2)
		beq.b	.fskipstep
		move	inst_FilTurns(a0),ch_FilSpd(a4)
		clr	cnt_turns(a2)
		bra.b	.filinit
.fskipstep	move	inst_FilTurns(a0),cnt_turns(a2)
		btst	#FILTERINIT,ch_EffectsPar1(a4)
		bne.b	.filinit
		clr.b	ch_FilInit(a4)
.filter		move.b	#1,ch_FilLastInit(a4)
		move	inst_FilStart(a0),d0
		move	d0,cnt_counter(a2)
		move	inst_FilSpeed(a0),cnt_speed(a2)
		move	inst_FilRepeat(a0),d1
		move	d1,cnt_repeat(a2)
		move	inst_FilRepEnd(a0),cnt_repeatend(a2)
		cmp	d1,d0
		ble.b	.filgo
		neg	cnt_speed(a2)
.filgo		move	inst_FilDelay(a0),cnt_delay(a2)
		bra.b	.mix
.filinit	move.b	ch_FilInit(a4),d0
		move.b	ch_PartInst(a4),ch_FilInit(a4)
		cmp.b	_InstInit(a5),d0
		beq	.filter
.filskip	cmp.b	ch_PartInst(a4),d0
		bne	.filter
		bra	.filgo

.mix		btst	#MIX,ch_Effects2(a4)
		beq.b	.transform
		move.b	inst_MixWaveNum(a0),ch_MixWaveNum(a4)
		lea	ch_MixData(a4),a2
		btst	#MIXSTEP,ch_EffectsPar2(a4)
		sne	cnt_step(a2)
		beq.b	.mskipstep
		move	inst_MixTurns(a0),ch_MixSpd(a4)
		clr	cnt_turns(a2)
		bra.b	.mixinit
.mskipstep	move	inst_MixTurns(a0),cnt_turns(a2)
		btst	#MIXINIT,ch_EffectsPar2(a4)
		bne.b	.mixinit
		clr.b	ch_MixInit(a4)
.mixse		move	inst_MixStart(a0),d0
		move	d0,cnt_counter(a2)
		move	inst_MixSpeed(a0),cnt_speed(a2)
		move	inst_MixRepeat(a0),d1
		move	d1,cnt_repeat(a2)
		move	inst_MixRepEnd(a0),cnt_repeatend(a2)
		cmp	d1,d0
		ble.b	.mixgo
		neg	cnt_speed(a2)
.mixgo		move	inst_MixDelay(a0),cnt_delay(a2)
		bra.b	.transform
.mixinit	move.b	ch_MixInit(a4),d0
		move.b	ch_PartInst(a4),ch_MixInit(a4)
		cmp.b	_InstInit(a5),d0
		beq	.mixse
.mixskip	cmp.b	ch_PartInst(a4),d0
		bne	.mixse
		bra	.mixgo

.transform	btst	#TRANSFORM,ch_Effects2(a4)
		beq	.playloop
		lea	inst_TraWaveNums(a0),a1
		lea	ch_TraWsPtrs(a4),a2
		move.b	inst_SmplNumber(a0),(a2)+
		move.b	(a1)+,(a2)+
		move.b	(a1)+,(a2)+
		move.b	(a1)+,(a2)+
		move.b	(a1)+,(a2)+
		move.b	(a1)+,(a2)+
		lea	ch_TraData(a4),a2
		btst	#TRANSFORMSTEP,ch_EffectsPar1(a4)
		sne	cnt_step(a2)
		beq.b	.tskipstep
		move	inst_TraTurns(a0),ch_TraSpd(a4)
		clr	cnt_turns(a2)
		bra.b	.trainit
.tskipstep	move	inst_TraTurns(a0),cnt_turns(a2)
		btst	#TRANSFORMINIT,ch_EffectsPar1(a4)
		bne.b	.trainit
		clr.b	ch_TraInit(a4)
.trans		move	inst_TraStart(a0),d0
		move	d0,(a2)
		move	inst_TraSpeed(a0),2(a2)
		move	inst_TraRepeat(a0),d1
		move	d1,4(a2)
		move	inst_TraRepEnd(a0),6(a2)
		cmp	d1,d0
		ble.b	.trago
		neg	2(a2)
.trago		move	inst_TraDelay(a0),10(a2)
		bra.b	.playloop
.trainit	move.b	ch_TraInit(a4),d0
		move.b	ch_PartInst(a4),ch_TraInit(a4)
		cmp.b	_InstInit(a5),d0
		beq	.trans
.traskip	cmp.b	ch_PartInst(a4),d0
		bne	.trans
		bra	.trago

.playloop	btst	#LOOP,ch_Effects1(a4)
		beq	Sexit
		tst.b	inst_SmplType(a0)
		bne.b	.pexit
		tst	inst_LooLength(a0)
		bne.b	.oki
.pexit		bclr	#LOOP,ch_Effects1(a4)
		bra	Sexit
.oki		btst	#LOOPSTEP,ch_EffectsPar2(a4)
		beq.b	.lskipstep
		move	inst_LooTurns(a0),ch_LooSpd(a4)
		clr	ch_LooTurns(a4)
		bra	.plinit
.lskipstep	move	inst_LooTurns(a0),ch_LooTurns(a4)
		btst	#LOOPINIT,ch_EffectsPar2(a4)
		bne	.plinit
		clr.b	ch_LooInit(a4)
.loop		lea	_WsPtrs(a5),a1
		moveq	#0,d0
		move.b	inst_SmplNumber(a0),d0
		add	d0,d0
		add	d0,d0
		add	d0,a1
		move.l	(a1),a1
		moveq	#0,d2
		move	smpl_Length(a1),d2
		move.l	smpl_Pointer(a1),a1
		move.l	a1,ch_LooWsPointer(a4)
		move	inst_LooStart(a0),d0
		move	d0,ch_LooCounter(a4)
		move	d0,ch_LooCounterSave(a4)
		moveq	#0,d1
		move	inst_LooLength(a0),d1
		sub.l	d1,d2
		move	d2,ch_LooWsCounterMax(a4)
		move	d1,ch_LooLength(a4)
		move	inst_LooRepEnd(a0),ch_LooRepEnd(a4)
		move	inst_LooWait(a0),ch_LooWait(a4)
		moveq	#0,d1
		move	inst_LooLpStep(a0),d1
		move.l	d1,ch_LooStep(a4)
		move	inst_LooRepeat(a0),d1
		move	d1,ch_LooRepeat(a4)
		cmp	d1,d0
		ble.b	.plgo
		neg.l	ch_LooStep(a4)
.plgo		move	inst_LooDelay(a0),ch_LooDelay(a4)
		clr	ch_LooWaitCounter(a4)
		moveq	#0,d0
		move	ch_LooCounterSave(a4),d0
		move.l	ch_LooWsPointer(a4),d1
		add.l	d0,d0
		add.l	d0,d1
		move.l	d1,ch_WsPointer(a4)
		move.l	d1,ch_WsRepPointer(a4)
		move.l	d1,ch_WsRepPtrOrg(a4)
		move	ch_LooLength(a4),d1
		move	d1,ch_WsLength(a4)
		move	d1,ch_WsRepLength(a4)
		bra.b	Sexit
.plinit		move.b	ch_LooInit(a4),d0
		move.b	ch_PartInst(a4),ch_LooInit(a4)
		cmp.b	_InstInit(a5),d0
		beq	.loop
.plskip		cmp.b	ch_PartInst(a4),d0
		bne	.loop
		bclr	#0,ch_Play(a4)
		bra	.plgo

Sexit		clr.b	_InstInit(a5)
		move	ch_WsRepLength(a4),d0
		subq	#8,d0
		beq.b	.okidoki
		subq	#8,d0
		beq.b	.okidoki
		sub	#16,d0
		beq.b	.okidoki
		sub	#32,d0
		beq.b	.okidoki
		sub	#64,d0
		beq.b	.okidoki
		clr.b	ch_Effects2(a4)
.okidoki	rts

PerCalc		lea	Channel1Buf,a4
		bsr.b	Per
		lea	Channel2Buf,a4
		bsr.b	Per
		lea	Channel3Buf,a4
		bsr.b	Per
		lea	Channel4Buf,a4
		bsr.b	Per
		tst.b	_PlayMode(a5)
		beq.b	.exit
		lea	Channel5Buf,a4
		bsr.b	Per
		lea	Channel6Buf,a4
		bsr.b	Per
		lea	Channel7Buf,a4
		bsr.b	Per
		lea	Channel8Buf,a4
		bsr.b	Per
.exit		rts

Per		move	ch_Note(a4),d0
		add	ch_VibNote(a4),d0
		add	ch_PchSldNote(a4),d0
		add	ch_ArpPchSldNote(a4),d0
		add	ch_SemiTone(a4),d0
		add	ch_FineTune(a4),d0
		add	ch_PchAdd(a4),d0
		btst	#5,ch_Arp(a4)
		bne.b	.notranspose
		move	ch_Transpose(a4),d1
		beq.b	.notranspose
		add	d1,d0
.notranspose	cmp	#-32,d0
		bge.b	.ok
		moveq	#-32,d0
.ok		cmp	#5*12*32,d0
		ble.b	.oki
		move	#5*12*32,d0
.oki		add	d0,d0
		lea	PalPitchTable,a0
		move	(a0,d0.w),d0
		add	ch_PTPchSldNote(a4),d0
		add	ch_PTVibNote(a4),d0
		add	ch_PTPchAdd(a4),d0
		cmp	#106,d0
		bge.b	.ok1
		moveq	#106,d0
.ok1		cmp	#3591,d0
		ble.b	.ok2
		move	#3591,d0
.ok2		move	d0,ch_Period1(a4)
		move	d0,ch_Period2(a4)
.noper		rts

PerVolPlay	tst.b	_PlayMode(a5)
		bne.b	Play8PerVol
		lea	Channel1Buf,a4
		bsr.b	.pervolplay
		lea	Channel2Buf,a4
		bsr.b	.pervolplay
		lea	Channel3Buf,a4
		bsr.b	.pervolplay
		lea	Channel4Buf,a4

.pervolplay	btst	#0,ch_Play(a4)
		bne.b	.nopervol
		move.l	ch_CustomAddress(a4),a6
		move	ch_Period2(a4),6(a6)
		move	ch_Period2(a4),ch_VUPeriod(a4)
.noper		tst.b	ch_ChannelOff(a4)
		bne.b	.nopervol
		move	ch_Volume3(a4),d1
.channelvol	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol	mulu	_MasterVol(a5),d1
.voldone	lsl.l	#2,d1
		swap	d1
		move	d1,8(a6)
		move	d1,ch_VUVolume(a4)
.nopervol	rts

Play8PerVol	lea	VolumeTables,a6
		tst.b	_PlayPart(a5)
		beq.b	.tune
.part		move.l	_SndFBuf(a5),a2
		clr	SndBufSize-2(a2)
		move.l	_PartChPtr(a5),a4
		lea	_VUMixBuf15(a5),a3
		bra	Play8PV
.tune		move.l	_SndFBuf(a5),a2
		clr	SndBufSize-2(a2)
		lea	Channel1Buf,a4
		lea	_VUMixBuf15(a5),a3
		bsr	Play8PV
		move.l	_SndFBuf(a5),a2
		add	#(2*SndBufSize),a2
		clr	SndBufSize-2(a2)
		lea	Channel2Buf,a4
		lea	_VUMixBuf26(a5),a3
		bsr.b	Play8PV
		move.l	_SndFBuf(a5),a2
		add	#(2*(2*SndBufSize)),a2
		clr	SndBufSize-2(a2)
		lea	Channel3Buf,a4
		lea	_VUMixBuf37(a5),a3
		bsr.b	Play8PV
		move.l	_SndFBuf(a5),a2
		add	#(3*(2*SndBufSize)),a2
		clr	SndBufSize-2(a2)
		lea	Channel4Buf,a4
		lea	_VUMixBuf48(a5),a3
		bsr.b	Play8PV
		move.l	_SndFBuf(a5),a2
		lea	Channel5Buf,a4
		lea	_VUMixBuf15(a5),a3
		bsr.b	Play8PV
		move.l	_SndFBuf(a5),a2
		add	#(2*SndBufSize),a2
		lea	Channel6Buf,a4
		lea	_VUMixBuf26(a5),a3
		bsr.b	Play8PV
		move.l	_SndFBuf(a5),a2
		add	#(2*(2*SndBufSize)),a2
		lea	Channel7Buf,a4
		lea	_VUMixBuf37(a5),a3
		bsr.b	Play8PV
		move.l	_SndFBuf(a5),a2
		add	#(3*(2*SndBufSize)),a2
		lea	Channel8Buf,a4
		lea	_VUMixBuf48(a5),a3

Play8PV		btst	#0,ch_Play(a4)
		beq.b	.ok
.exit		rts
.ok		tst.b	ch_MixSmplEnd(a4)
		beq.b	.oki
		tst	SndBufSize-2(a2)
		bne.b	.end
		moveq	#16-1,d7
.clearvubuf	clr.b	(a3)+
		dbf	d7,.clearvubuf
		move	_MixLength(a5),d7
		subq	#1,d7
		add	_DoubleBuf(a5),a2
.clear		clr.b	(a2)+
		dbf	d7,.clear
.end		rts
.oki		moveq	#0,d1
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol1
		move	ch_Volume3(a4),d1
.channelvol	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol	mulu	_MasterVol(a5),d1
.voldone	lsr.l	#6,d1
		and	#$ff00,d1
.novol1		add.l	a6,d1
		move.l	d1,ch_MixVolTable(a4)
		move.l	_PeriodValue(a5),d0
		move	ch_Period2(a4),d1
		move	d1,ch_VUPeriod(a4)
		beq.b	.exit
		divu	d1,d0
		moveq	#0,d1
		move	d0,d1
		add.l	d1,d1
		move.l	d1,ch_MixAdd2(a4)
		moveq	#0,d0
		move	ch_MixWsLen(a4),d0
		add.l	d0,d0
		move.l	d0,d6
		sub.l	ch_MixWsCounter(a4),d0
		move.l	d0,d2
		moveq	#0,d1
		move	ch_Period2(a4),d1
		lsl.l	#8,d1
		divu	_MixPeriod(a5),d1
		mulu	d1,d0
		add.l	ch_MixSaveDec1(a4),d0
		move.b	d0,ch_MixSaveDec1+3(a4)
		lsr.l	#8,d0
		swap	d2
		tst	d2
		beq.b	.no
		moveq	#0,d2
		move	d1,d2
		lsl.l	#8,d2
		add.l	d2,d0
.no		move.l	d0,ch_MixWsLength(a4)
		tst	SndBufSize-2(a2)
		bne	MixAdd
		bra	MixMove

;;Decrypt_ID3.2	dc.l	(Decrypt_ID3_EQU&$00000007)<<(7*4+1)!(Decrypt_ID3_EQU&$fffffff8)>>3
;;ID3.2_Offset	equ	Decrypt_ID3.2-Main

DmaPlay		tst.b	_PlayMode(a5)
		bne	Play8channels
		moveq	#0,d0
		or	_DmaSave(a5),d0
		moveq	#100,d7
		lea	$dff000,a6
		lea	Channel1Buf,a4
		btst	#0,ch_Play(a4)
		beq.b	.nplay1
		move.b	ch_WsNumber(a4),d1
		move.b	ch_WsNumberOld(a4),d2
		move.b	d1,ch_WsNumberOld(a4)
		tst.b	ch_WaveOrSample(a4)
		beq.b	.play1
		cmp.b	d1,d2
		beq.b	.nplay1
.play1		or	#1,d0
		cmp	_DmaWait1(a5),d7
		bge.b	.nplay1
		move	_DmaWait1(a5),d7
.nplay1		lea	Channel2Buf,a4
		btst	#0,ch_Play(a4)
		beq.b	.nplay2
		move.b	ch_WsNumber(a4),d1
		move.b	ch_WsNumberOld(a4),d2
		move.b	d1,ch_WsNumberOld(a4)
		tst.b	ch_WaveOrSample(a4)
		beq.b	.play2
		cmp.b	d1,d2
		beq.b	.nplay2
.play2		or	#2,d0
		cmp	_DmaWait2(a5),d7
		bge.b	.nplay2
		move	_DmaWait2(a5),d7
.nplay2		lea	Channel3Buf,a4
		btst	#0,ch_Play(a4)
		beq.b	.nplay3
		move.b	ch_WsNumber(a4),d1
		move.b	ch_WsNumberOld(a4),d2
		move.b	d1,ch_WsNumberOld(a4)
		tst.b	ch_WaveOrSample(a4)
		beq.b	.play3
		cmp.b	d1,d2
		beq.b	.nplay3
.play3		or	#4,d0
		cmp	_DmaWait3(a5),d7
		bge.b	.nplay3
		move	_DmaWait3(a5),d7
.nplay3		lea	Channel4Buf,a4
		btst	#0,ch_Play(a4)
		beq.b	.nplay4
		move.b	ch_WsNumber(a4),d1
		move.b	ch_WsNumberOld(a4),d2
		move.b	d1,ch_WsNumberOld(a4)
		tst.b	ch_WaveOrSample(a4)
		beq.b	.play4
		cmp.b	d1,d2
		beq.b	.nplay4
.play4		or	#8,d0
		cmp	_DmaWait4(a5),d7
		bge.b	.nplay4
		move	_DmaWait4(a5),d7
.nplay4		move	d0,$96(a6)
		move	d0,_DmaSave(a5)
		move.b	#1,_DmaWait(a5)
		lea	Channel1Buf,a4
		move	ch_Period2(a4),_DmaWait1(a5)
		lea	Channel2Buf,a4
		move	ch_Period2(a4),_DmaWait2(a5)
		lea	Channel3Buf,a4
		move	ch_Period2(a4),_DmaWait3(a5)
		lea	Channel4Buf,a4
		move	ch_Period2(a4),_DmaWait4(a5)
		lea	$bfd000,a4
		move.b	d7,ciatblo(a4)
		lsr.w	#8,d7
		move.b	d7,ciatbhi(a4)
.exit		rts

PlayDma		movem.l	d0-d7/a0-a6,-(sp)
		lea	Bss,a5
		lea	$dff000,a6
		moveq	#0,d0
		move.b	_DmaWait(a5),d0
		subq	#1,d0
		bmi.b	.exit
		lsl	#2,d0
		lea	DmaJmpTab,a0
		move.l	(a0,d0.w),a0
		jsr	(a0)
.exit		movem.l	(sp)+,d0-d7/a0-a6
		rts

DmaJmpTab	dc.l	Dma1
		dc.l	Dma2
		dc.l	0
		dc.l	0
		dc.l	Dma5
		dc.l	0
		dc.l	Dma7

Dma1		lea	Channel1Buf,a4
		bclr	#0,ch_Play(a4)
		beq.b	.noplay1
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol1
		move	ch_Volume3(a4),d1
.channelvol	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol	mulu	_MasterVol(a5),d1
.voldone	lsl.l	#2,d1
		swap	d1
		move	d1,$a8(a6)
		move	d1,ch_VUVolume(a4)
.novol1		move	ch_Period2(a4),ch_VUPeriod(a4)
		move.l	ch_WsPointer(a4),ch_VUWsPointer(a4)
		moveq	#0,d1
		move	ch_WsLength(a4),d1
		add.l	d1,d1
		move.l	d1,ch_VUWsLength(a4)
		move.l	ch_WsPointer(a4),$a0(a6)
		move	ch_WsLength(a4),$a4(a6)
		move	ch_Period2(a4),$a6(a6)

.noplay1	lea	Channel2Buf,a4
		bclr	#0,ch_Play(a4)
		beq.b	.noplay2
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol2
		move	ch_Volume3(a4),d1
.channelvol2	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol2	mulu	_MasterVol(a5),d1
.voldone2	lsl.l	#2,d1
		swap	d1
		move	d1,$b8(a6)
		move	d1,ch_VUVolume(a4)
.novol2		move	ch_Period2(a4),ch_VUPeriod(a4)
		move.l	ch_WsPointer(a4),ch_VUWsPointer(a4)
		moveq	#0,d1
		move	ch_WsLength(a4),d1
		add.l	d1,d1
		move.l	d1,ch_VUWsLength(a4)
		move.l	ch_WsPointer(a4),$b0(a6)
		move	ch_WsLength(a4),$b4(a6)
		move	ch_Period2(a4),$b6(a6)

.noplay2	lea	Channel3Buf,a4
		bclr	#0,ch_Play(a4)
		beq.b	.noplay3
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol3
		move	ch_Volume3(a4),d1
.channelvol3	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol3	mulu	_MasterVol(a5),d1
.voldone3	lsl.l	#2,d1
		swap	d1
		move	d1,$c8(a6)
		move	d1,ch_VUVolume(a4)
.novol3		move	ch_Period2(a4),ch_VUPeriod(a4)
		move.l	ch_WsPointer(a4),ch_VUWsPointer(a4)
		moveq	#0,d1
		move	ch_WsLength(a4),d1
		add.l	d1,d1
		move.l	d1,ch_VUWsLength(a4)
		move.l	ch_WsPointer(a4),$c0(a6)
		move	ch_WsLength(a4),$c4(a6)
		move	ch_Period2(a4),$c6(a6)

.noplay3	lea	Channel4Buf,a4
		bclr	#0,ch_Play(a4)
		beq.b	.noplay4
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol4
		move	ch_Volume3(a4),d1
.channelvol4	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol4	mulu	_MasterVol(a5),d1
.voldone4	lsl.l	#2,d1
		swap	d1
		move	d1,$d8(a6)
		move	d1,ch_VUVolume(a4)
.novol4		move	ch_Period2(a4),ch_VUPeriod(a4)
		move.l	ch_WsPointer(a4),ch_VUWsPointer(a4)
		moveq	#0,d1
		move	ch_WsLength(a4),d1
		add.l	d1,d1
		move.l	d1,ch_VUWsLength(a4)
		move.l	ch_WsPointer(a4),$d0(a6)
		move	ch_WsLength(a4),$d4(a6)
		move	ch_Period2(a4),$d6(a6)

.noplay4	move	_DmaSave(a5),d0
		bset	#15,d0
		move	d0,$96(a6)
		move.b	#2,_DmaWait(a5)
		move	#150,d7
		lea	$bfd000,a4
		move.b	d7,ciatblo(a4)
		lsr.w	#8,d7
		move.b	d7,ciatbhi(a4)
		rts

Dma2		move	_DmaSave(a5),d0
		btst	#0,d0
		beq.b	.noplay1
		lea	Channel1Buf,a4
		move.l	ch_WsRepPointer(a4),ch_VUWsRepPointer(a4)
		moveq	#0,d1
		move	ch_WsRepLength(a4),d1
		add.l	d1,d1
		move.l	d1,ch_VUWsRepLength(a4)
		move.l	ch_WsRepPointer(a4),$a0(a6)
		move	ch_WsRepLength(a4),$a4(a6)

.noplay1	btst	#1,d0
		beq.b	.noplay2
		lea	Channel2Buf,a4
		move.l	ch_WsRepPointer(a4),ch_VUWsRepPointer(a4)
		moveq	#0,d1
		move	ch_WsRepLength(a4),d1
		add.l	d1,d1
		move.l	d1,ch_VUWsRepLength(a4)
		move.l	ch_WsRepPointer(a4),$b0(a6)
		move	ch_WsRepLength(a4),$b4(a6)

.noplay2	btst	#2,d0
		beq.b	.noplay3
		lea	Channel3Buf,a4
		move.l	ch_WsRepPointer(a4),ch_VUWsRepPointer(a4)
		moveq	#0,d1
		move	ch_WsRepLength(a4),d1
		add.l	d1,d1
		move.l	d1,ch_VUWsRepLength(a4)
		move.l	ch_WsRepPointer(a4),$c0(a6)
		move	ch_WsRepLength(a4),$c4(a6)

.noplay3	btst	#3,d0
		beq.b	.noplay4
		lea	Channel4Buf,a4
		move.l	ch_WsRepPointer(a4),ch_VUWsRepPointer(a4)
		moveq	#0,d1
		move	ch_WsRepLength(a4),d1
		add.l	d1,d1
		move.l	d1,ch_VUWsRepLength(a4)
		move.l	ch_WsRepPointer(a4),$d0(a6)
		move	ch_WsRepLength(a4),$d4(a6)

.noplay4	jsr	VUCounter
		clr	_DmaSave(a5)
		clr.b	_DmaWait(a5)
		rts

Dma4		lea	$dff000,a6
		move.l	_SndCBuf(a5),a0
		add	_DoubleBuf(a5),a0
		move.l	a0,$a0(a6)
		add	#(2*SndBufSize),a0
		move.l	a0,$b0(a6)
		add	#(2*SndBufSize),a0
		move.l	a0,$c0(a6)
		add	#(2*SndBufSize),a0
		move.l	a0,$d0(a6)
		rts

Dma5		move.l	_SndCBuf(a5),a0
		add	_DoubleBuf(a5),a0
		move.l	_PartChPtr(a5),a1
		move.l	ch_CustomAddress(a1),a1
		move.l	a0,(a1)
		rts

Dma6		lea	$dff000,a6
		move	#$0080,$9c(a6)
		move	#$8080,$9a(a6)
		move	#$800f,$96(a6)
		move	#64,$a8(a6)
		move	#64,$b8(a6)
		move	#64,$c8(a6)
		move	#64,$d8(a6)
		rts

Dma7		move	#$0080,$9c(a6)
		move	#$8080,$9a(a6)
		move	#$8001,d0
		move.b	#5,_DmaWait(a5)
		move.l	_PartChPtr(a5),a0
		move.l	ch_CustomAddress(a0),a1
		or	ch_DmaChannel(a0),d0
		move	d0,$96(a6)
		move	#64,$a8(a6)		;move	#64,8(a1)
		rts

_MixLength	rs.w	1
_MixPeriod	rs.w	1
_DoubleBuf	rs.w	1
_PeriodValue	rs.l	1

Play8channels	lea	VolumeTables,a6
		tst.b	_PlayPart(a5)
		beq.b	.tune
.part		move.l	_SndFBuf(a5),a2
		clr	SndBufSize-2(a2)
		move.l	_PartChPtr(a5),a4
		lea	_VUMixBuf15(a5),a3
		bra	Play8ch
.tune		move.l	_SndFBuf(a5),a2
		lea	Channel1Buf,a4
		lea	_VUMixBuf15(a5),a3
		bsr	Play8ch
		move.l	_SndFBuf(a5),a2
		add	#(2*SndBufSize),a2
		lea	Channel2Buf,a4
		lea	_VUMixBuf26(a5),a3
		bsr.b	Play8ch
		move.l	_SndFBuf(a5),a2
		add	#(2*(2*SndBufSize)),a2
		lea	Channel3Buf,a4
		lea	_VUMixBuf37(a5),a3
		bsr.b	Play8ch
		move.l	_SndFBuf(a5),a2
		add	#(3*(2*SndBufSize)),a2
		lea	Channel4Buf,a4
		lea	_VUMixBuf48(a5),a3
		bsr.b	Play8ch
		move.l	_SndFBuf(a5),a2
		lea	Channel5Buf,a4
		lea	_VUMixBuf15(a5),a3
		bsr.b	Play8ch
		move.l	_SndFBuf(a5),a2
		add	#(2*SndBufSize),a2
		lea	Channel6Buf,a4
		lea	_VUMixBuf26(a5),a3
		bsr.b	Play8ch
		move.l	_SndFBuf(a5),a2
		add	#(2*(2*SndBufSize)),a2
		lea	Channel7Buf,a4
		lea	_VUMixBuf37(a5),a3
		bsr.b	Play8ch
		move.l	_SndFBuf(a5),a2
		add	#(3*(2*SndBufSize)),a2
		lea	Channel8Buf,a4
		lea	_VUMixBuf48(a5),a3

Play8ch		bclr	#0,ch_Play(a4)
		bne.b	.ok
.exit		rts
.ok		moveq	#0,d1
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol1
		move	ch_Volume3(a4),d1
.channelvol	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol	mulu	_MasterVol(a5),d1
.voldone	lsr.l	#6,d1
		and	#$ff00,d1
.novol1		add.l	a6,d1
		move.l	d1,ch_MixVolTable(a4)
		move.l	ch_WsPointer(a4),ch_MixWsPointer(a4)
		clr.l	ch_MixWsCounter(a4)
		clr.l	ch_MixSaveDec1(a4)
		clr	ch_MixSaveDec2(a4)
		clr.b	ch_MixSmplEnd(a4)
		move.l	_PeriodValue(a5),d0
		move	ch_Period2(a4),d1
		beq.b	.exit
		divu	d1,d0
		moveq	#0,d1
		move	d0,d1
		add.l	d1,d1
		move.l	d1,ch_MixAdd2(a4)
		moveq	#0,d0
		move	ch_WsLength(a4),d0
		move	d0,ch_MixWsLen(a4)
		add.l	d0,d0
		move.l	d0,d6
		move.l	d0,d2
		moveq	#0,d1
		move	ch_Period2(a4),d1
		lsl.l	#8,d1
		divu	_MixPeriod(a5),d1
		mulu	d1,d0
		move.b	d0,ch_MixSaveDec1+3(a4)
		lsr.l	#8,d0
		swap	d2
		tst	d2
		beq.b	.no
		moveq	#0,d2
		move	d1,d2
		lsl.l	#8,d2
		add.l	d2,d0
.no		move.l	d0,ch_MixWsLength(a4)
		moveq	#0,d0
		bset	#LOOP,d0
		bset	#WSLOOP,d0
		move.b	ch_Effects1(a4),d1
		and.b	d0,d1
		move.b	d1,ch_MixLoop(a4)
		tst	SndBufSize-2(a2)
		bne	MixAdd

MixMove		move	#1,SndBufSize-2(a2)
		moveq	#0,d4
		move	ch_MixAdd2(a4),d4
		add	_DoubleBuf(a5),a2
		move.l	a2,-(sp)
		move.l	ch_MixWsPointer(a4),a0
		move.l	ch_MixVolTable(a4),a1

		moveq	#0,d7
		move	_MixLength(a5),d7
		subq	#1,d7
.loop		move.l	ch_MixWsCounter(a4),d0
		moveq	#0,d1
		move	ch_MixAdd1(a4),d2
		move	ch_MixSaveDec2(a4),d3
		move.l	ch_MixWsLength(a4),d5
		subq.l	#1,d5
		bmi.b	.skip
		cmp.l	d7,d5
		blt.b	.mix2
.mix1		cmp.l	d6,d0
		bge.b	.skip
		add	d2,d3
		move.b	(a0,d0.l),d1
		addx.l	d4,d0
		move.b	(a1,d1.w),(a2)+
		dbf	d7,.mix1
		move.l	d0,ch_MixWsCounter(a4)
		move	d3,ch_MixSaveDec2(a4)

.done		move.l	(sp)+,a2
		tst	_VUOnOff(a5)
		beq.b	.vuexit
		moveq	#0,d0
		moveq	#0,d1
		moveq	#16-1,d7
.vuloop		move.b	(a2)+,d0
		addq	#1,a2
		move.b	d0,(a3)+
		bpl.b	.vuplus
		neg.b	d0
.vuplus		cmp	d0,d1
		bhi.b	.vuhigh
		move	d0,d1
.vuhigh		dbf	d7,.vuloop
		addq	#3,d1
		lsr	#2,d1
		cmp	#$f,d1
		bls.b	.vudone
		move	#$f,d1
.vudone		tst	_VUOnOff(a5)
		beq.b	.vuexit
		cmp	ch_VUAmp(a4),d1
		blo.b	.vuexit
		move	d1,ch_VUAmp(a4)
.vuexit		rts

.mix2		cmp.l	d6,d0
		bge.b	.skip
		subq	#1,d7
		add	d2,d3
		move.b	(a0,d0.l),d1
		addx.l	d4,d0
		move.b	(a1,d1.w),(a2)+
		dbf	d5,.mix2

.skip		tst.b	ch_MixLoop(a4)
		bne.b	.wsloop
.clear		clr.b	(a2)+
		dbf	d7,.clear
		move.b	#1,ch_MixSmplEnd(a4)
		bra.b	.done
.wsloop		move.l	ch_WsRepPointer(a4),a0
		move.l	a0,ch_MixWsPointer(a4)
		clr.l	ch_MixWsCounter(a4)
		clr	ch_MixSaveDec2(a4)
		move.l	_PeriodValue(a5),d0
		divu	ch_Period2(a4),d0
		moveq	#0,d1
		move	d0,d1
		add.l	d1,d1
		move.l	d1,ch_MixAdd2(a4)
		moveq	#0,d0
		move	ch_WsRepLength(a4),d0
		move	d0,ch_MixWsLen(a4)
		add.l	d0,d0
		move.l	d0,d6
		move.l	d0,d2
		moveq	#0,d1
		move	ch_Period2(a4),d1
		lsl.l	#8,d1
		divu	_MixPeriod(a5),d1
		mulu	d1,d0
		add.l	ch_MixSaveDec1(a4),d0
		move.b	d0,ch_MixSaveDec1+3(a4)
		lsr.l	#8,d0
		swap	d2
		tst	d2
		beq.b	.no
		moveq	#0,d2
		move	d1,d2
		lsl.l	#8,d2
		add.l	d2,d0
.no		move.l	d0,ch_MixWsLength(a4)
		bra	.loop

MixAdd		moveq	#0,d4
		move	ch_MixAdd2(a4),d4
		add	_DoubleBuf(a5),a2
		move.l	a2,-(sp)
		move.l	ch_MixWsPointer(a4),a0
		move.l	ch_MixVolTable(a4),a1

		moveq	#0,d7
		move	_MixLength(a5),d7
		subq	#1,d7
.loop		move.l	ch_MixWsCounter(a4),d0
		moveq	#0,d1
		move	ch_MixAdd1(a4),d2
		move	ch_MixSaveDec2(a4),d3
		move.l	ch_MixWsLength(a4),d5
		subq.l	#1,d5
		bmi.b	.skip
		cmp.l	d7,d5
		blt.b	.mix2
.mix1		cmp.l	d6,d0
		bge.b	.skip
		move.b	(a0,d0.l),d1
		add	d2,d3
		move.b	(a1,d1.w),d1
		addx.l	d4,d0
		add.b	d1,(a2)+
		dbf	d7,.mix1
		move.l	d0,ch_MixWsCounter(a4)
		move	d3,ch_MixSaveDec2(a4)

.done		move.l	(sp)+,a2
		tst	_VUOnOff(a5)
		beq.b	.vuexit
		moveq	#0,d0
		moveq	#0,d1
		moveq	#16-1,d7
.vuloop		move.b	(a2)+,d0
		addq	#1,a2
		sub.b	(a3)+,d0
		bpl.b	.vuplus
		neg.b	d0
.vuplus		cmp	d0,d1
		bhi.b	.vuhigh
		move	d0,d1
.vuhigh		dbf	d7,.vuloop
		addq	#3,d1
		lsr	#2,d1
		cmp	#$f,d1
		bls.b	.vudone
		move	#$f,d1
.vudone		tst	_VUOnOff(a5)
		beq.b	.vuexit
		cmp	ch_VUAmp(a4),d1
		blo.b	.vuexit
		move	d1,ch_VUAmp(a4)
.vuexit		rts

.mix2		cmp.l	d6,d0
		bge.b	.skip
		subq	#1,d7
		move.b	(a0,d0.l),d1
		add	d2,d3
		move.b	(a1,d1.w),d1
		addx.l	d4,d0
		add.b	d1,(a2)+
		dbf	d5,.mix2

.skip		tst.b	ch_MixLoop(a4)
		bne.b	.wsloop
		move.b	#1,ch_MixSmplEnd(a4)
		bra.b	.done
.wsloop		move.l	ch_WsRepPointer(a4),a0
		move.l	a0,ch_MixWsPointer(a4)
		clr.l	ch_MixWsCounter(a4)
		clr	ch_MixSaveDec2(a4)
		move.l	_PeriodValue(a5),d0
		divu	ch_Period2(a4),d0
		moveq	#0,d1
		move	d0,d1
		add.l	d1,d1
		move.l	d1,ch_MixAdd2(a4)
		moveq	#0,d0
		move	ch_WsRepLength(a4),d0
		move	d0,ch_MixWsLen(a4)
		add.l	d0,d0
		move.l	d0,d6
		move.l	d0,d2
		moveq	#0,d1
		move	ch_Period2(a4),d1
		lsl.l	#8,d1
		divu	_MixPeriod(a5),d1
		mulu	d1,d0
		add.l	ch_MixSaveDec1(a4),d0
		move.b	d0,ch_MixSaveDec1+3(a4)
		lsr.l	#8,d0
		swap	d2
		tst	d2
		beq.b	.no
		moveq	#0,d2
		move	d1,d2
		lsl.l	#8,d2
		add.l	d2,d0
.no		move.l	d0,ch_MixWsLength(a4)
		bra	.loop

PlayEffects	lea	Channel1Buf,a4
		lea	$dff0a0,a6
		bsr.b	.playfx
		lea	Channel2Buf,a4
		lea	$dff0b0,a6
		bsr.b	.playfx
		lea	Channel3Buf,a4
		lea	$dff0c0,a6
		bsr.b	.playfx
		lea	Channel4Buf,a4
		lea	$dff0d0,a6
		tst.b	_PlayMode(a5)
		beq.b	.playfx
		bsr.b	.playfx
		lea	Channel5Buf,a4
		lea	$dff0a0,a6
		bsr.b	.playfx
		lea	Channel6Buf,a4
		lea	$dff0b0,a6
		bsr.b	.playfx
		lea	Channel7Buf,a4
		lea	$dff0c0,a6
		bsr.b	.playfx
		lea	Channel8Buf,a4
		lea	$dff0d0,a6

.playfx		move.l	ch_WsRepPtrOrg(a4),ch_WsRepPointer(a4)
		btst	#0,ch_Play(a4)
		bne.b	.every1
		bsr	SlideVol
		bsr	SlideChannelVol
		bsr	SlideMasterVol
		bsr	SlideArpVol
		bsr	SlideNote
		bsr	SlideArpNote
		bsr	ArpeggioPlay
		bsr	VibratoPlay
		bsr	TremoloPlay
.every1		bsr	ADSRPlay
		bsr	MoveLoop
		bsr	TransformPlay
		bsr	PhasePlay
		bsr	MixPlay
		bsr	ResonancePlay
		bsr	FilterPlay

		tst.b	_PlayMode(a5)
		bne.b	.loopplay
		tst.l	_FreeSndFBuf(a5)
		beq.b	.loopplay
		lea	ch_TraWaveBuffer(a4),a0
		lea	ch_FilWaveBuffer(a4),a1
		move.l	ch_WsRepPointer(a4),a2
		cmp.l	a0,a2
		blo.b	.loopplay
		cmp.l	a1,a2
		bhi.b	.loopplay
		move.l	ch_WaveBuffer(a4),a3
		move.l	a3,ch_WsRepPointer(a4)
		tst.b	ch_WaveOrSample(a4)
		beq.b	.test
		bra.b	.fixptr
.test		btst	#LOOP,ch_Effects1(a4)
		beq.b	.skipptr
.fixptr		move.l	a3,ch_WsPointer(a4)
.skipptr	move	ch_WsRepLength(a4),d0
		lsr	#3,d0
		subq	#1,d0
.moveloop1	move.l	(a2)+,(a3)+
		move.l	(a2)+,(a3)+
		move.l	(a2)+,(a3)+
		move.l	(a2)+,(a3)+
		dbf	d0,.moveloop1

.loopplay	btst	#0,ch_Play(a4)
		bne.b	.next1
		btst	#LOOP,ch_Effects1(a4)
		beq.b	.next1
		tst.b	_PlayMode(a5)
		bne.b	.n1
		move.l	ch_WsRepPointer(a4),d0
		move.l	d0,ch_VUWsRepPointer(a4)
		move.l	d0,(a6)
		moveq	#0,d0
		move	ch_LooLength(a4),d0
		move	d0,4(a6)
		add.l	d0,d0
		move.l	d0,ch_VUWsRepLength(a4)
.n1		move	ch_LooLength(a4),ch_WsRepLength(a4)
.next1		tst.b	ch_ArpWait(a4)
		bne.b	.x
		clr.b	ch_PartNote(a4)
.x		and.b	#1,ch_Play(a4)
		rts

***************************************************************************

MoveLoop	moveq	#0,d0
		moveq	#0,d2
		btst	#LOOP,ch_Effects1(a4)
		beq	.exit
		btst	#LOOPSTEP,ch_EffectsPar2(a4)
		bne.b	.step
		subq	#1,ch_LooDelay(a4)
		bpl	.exit2
		clr	ch_LooDelay(a4)
		tst	ch_LooWait(a4)
		beq.b	.count
		subq	#1,ch_LooWaitCounter(a4)
		bpl	.exit
		move	ch_LooWait(a4),ch_LooWaitCounter(a4)
		bra.b	.count
.step		btst	#LOOPINIT,ch_EffectsPar2(a4)
		bne.b	.initstep
		tst.b	ch_PartNote(a4)
		beq.b	.nocount
		bra.b	.count
.initstep	tst.b	ch_PartNote(a4)
		beq.b	.counter
.count		move	ch_LooCounter(a4),ch_LooCounterSave(a4)
.counter	bsr	LoopCounter
.nocount	move	ch_LooCounterSave(a4),d0

		btst	#LOOPSTEP,ch_EffectsPar2(a4)
		beq.b	.nostep
		subq	#1,ch_LooDelay(a4)
		bpl.b	.nostep
		clr	ch_LooDelay(a4)
		tst	ch_LooWait(a4)
		beq.b	.ok
		subq	#1,ch_LooWaitCounter(a4)
		bpl.b	.nostep
		move	ch_LooWait(a4),ch_LooWaitCounter(a4)
.ok		move	ch_LooStep+2(a4),d3
		bpl.b	.loopok
		neg	d3
.loopok		moveq	#0,d2
		move	ch_LooCounterSave(a4),d2
		move.b	ch_LooSpd+1(a4),d1
		ext	d1
		bpl.b	.right
.left		muls	d3,d1
		add.l	d1,d2
		bpl.b	.endstep
		clr	ch_LooCounterSave(a4)
		bra.b	.nostep
.right		muls	d3,d1
		add.l	d1,d2
		moveq	#0,d1
		move	ch_LooWsCounterMax(a4),d1
		cmp.l	d2,d1
		bhi.b	.endstep
		move	d1,d2
.endstep	move	d2,ch_LooCounterSave(a4)

.nostep		move.l	ch_LooWsPointer(a4),d1
		add.l	d0,d0
		add.l	d0,d1
		move.l	d1,ch_WsRepPointer(a4)
		move.l	d1,ch_WsRepPtrOrg(a4)
		tst	ch_LooTurns(a4)
		bpl.b	.exit
		btst	#LOOPSTOP,ch_Effects1(a4)
		beq.b	.exit
		clr.b	ch_MixLoop(a4)
		bclr	#LOOP,ch_Effects1(a4)
		tst.b	_PlayMode(a5)
		bne.b	.exit
		lea	ZeroSample,a0
		move.l	a0,(a6)
		move.l	a0,ch_VUWsPointer(a4)
		move	#1,4(a6)
.exit		rts

.exit2		move	ch_LooCounterSave(a4),d0
		move.l	ch_LooWsPointer(a4),d1
		add.l	d0,d0
		add.l	d0,d1
		move.l	d1,ch_WsRepPointer(a4)
		move.l	d1,ch_WsRepPtrOrg(a4)
		rts

LoopCounter	move	ch_LooCounter(a4),d0
.lc_go		tst	ch_LooTurns(a4)
		bmi.b	.lc_exit
		move	ch_LooRepeat(a4),d1
		cmp	ch_LooRepEnd(a4),d1
		blo.b	.lc_normal
		bra.b	.lc_inverted
.lc_notok	tst	ch_LooTurns(a4)
		beq.b	.lc_turn
		subq	#1,ch_LooTurns(a4)
		bne.b	.lc_turn
		move	#-1,ch_LooTurns(a4)
.lc_turn	sub.l	ch_LooStep(a4),d0
		neg.l	ch_LooStep(a4)
.lc_ok		move	d0,ch_LooCounter(a4)
.lc_exit	rts

.lc_normal	tst.l	ch_LooStep(a4)
		bpl.b	.lc_nadd
.lc_nsub	add.l	ch_LooStep(a4),d0
		move	ch_LooRepeat(a4),d2
		cmp.l	d2,d0
		bge.b	.lc_ok
		bra.b	.lc_notok
.lc_nadd	add.l	ch_LooStep(a4),d0
		move	ch_LooRepEnd(a4),d2
		cmp.l	d2,d0
		ble.b	.lc_ok
		bra.b	.lc_notok

.lc_inverted	tst.l	ch_LooStep(a4)
		bpl.b	.lc_iadd
.lc_isub	add.l	ch_LooStep(a4),d0
		move	ch_LooRepEnd(a4),d2
		cmp.l	d2,d0
		bge.b	.lc_ok
		bra.b	.lc_notok
.lc_iadd	add.l	ch_LooStep(a4),d0
		move	ch_LooRepeat(a4),d2
		cmp.l	d2,d0
		ble.b	.lc_ok
		bra.b	.lc_notok

***************************************************************************

SlideNote	move.b	ch_PTPchSld(a4),d1
		bne.b	PTSlideNote
		tst.b	ch_PchSld(a4)
		bne.b	.tonote
		tst.b	ch_InstPchSld(a4)
		beq.b	.x1
.tonote		tst	ch_PchSldToNote(a4)
		bmi.b	.x1
		move	ch_PchSldSpd(a4),d0
		tst.b	ch_PchSldType(a4)
		bne.b	.slidedown

.slideup	add	d0,ch_PchSldNote(a4)
		move	ch_Note(a4),d0
		add	ch_PchSldNote(a4),d0
		sub	ch_PchSldToNote(a4),d0
		blt.b	.x1
		sub	d0,ch_PchSldNote(a4)
		move	#-1,ch_PchSldToNote(a4)
.x1		rts

.slidedown	sub	d0,ch_PchSldNote(a4)
		move	ch_Note(a4),d0
		add	ch_PchSldNote(a4),d0
		sub	ch_PchSldToNote(a4),d0
		bgt.b	.x2
		sub	d0,ch_PchSldNote(a4)
		move	#-1,ch_PchSldToNote(a4)
.x2		rts

PTSlideNote	btst	#1,ch_Play(a4)
		bne.b	.x1
		tst	ch_PTPchSldToNote(a4)
		bmi.b	.x1
		move	ch_PTPchSldSpd(a4),d0
		cmp.b	#fx_PTPortamento,d1
		bne.b	.skip
		move	ch_PTPchSldSpd2(a4),d0
.skip		tst.b	ch_PTPchSldType(a4)
		bne.b	.slidedown

.slideup	sub	d0,ch_PTPchSldNote(a4)
		bsr.b	GetPeriod
		add	ch_PTPchSldNote(a4),d0
		sub	ch_PTPchSldToNote(a4),d0
		bgt.b	.x1
		sub	d0,ch_PTPchSldNote(a4)
		move	#-1,ch_PTPchSldToNote(a4)
.x1		rts

.slidedown	add	d0,ch_PTPchSldNote(a4)
		bsr.b	GetPeriod
		add	ch_PTPchSldNote(a4),d0
		sub	ch_PTPchSldToNote(a4),d0
		blt.b	.x2
		sub	d0,ch_PTPchSldNote(a4)
		move	#-1,ch_PTPchSldToNote(a4)
.x2		rts

GetPeriod	move	ch_Note(a4),d0
GetPeriod2	add	ch_VibNote(a4),d0
		add	ch_PchSldNote(a4),d0
		add	ch_ArpPchSldNote(a4),d0
		add	ch_SemiTone(a4),d0
		add	ch_FineTune(a4),d0
		add	ch_PchAdd(a4),d0
		move	ch_Transpose(a4),d1
		beq.b	.notranspose
		add	d1,d0
.notranspose	cmp	#-32,d0
		bge.b	.ok
		moveq	#-32,d0
.ok		cmp	#5*12*32,d0
		ble.b	.oki
		move	#5*12*32,d0
.oki		add	d0,d0
		lea	PalPitchTable,a0
		move	(a0,d0.w),d0
		rts

SlideArpNote	tst.b	ch_ArpPchSld(a4)
		beq.b	.x1
		tst	ch_ArpPchSldToNote(a4)
		bmi.b	.x1
		tst.b	ch_ArpPchSldType(a4)
		bne.b	.slidedown

.slideup	move	ch_ArpPchSldSpd(a4),d0
		add	d0,ch_ArpPchSldNote(a4)
		move	ch_ArpNote(a4),d0
		add	ch_ArpPchSldNote(a4),d0
		sub	ch_ArpPchSldToNote(a4),d0
		blt.b	.x1
		sub	d0,ch_ArpPchSldNote(a4)
		move	#-1,ch_ArpPchSldToNote(a4)
.x1		rts

.slidedown	move	ch_ArpPchSldSpd(a4),d0
		sub	d0,ch_ArpPchSldNote(a4)
		move	ch_ArpNote(a4),d0
		add	ch_ArpPchSldNote(a4),d0
		sub	ch_ArpPchSldToNote(a4),d0
		bgt.b	.x2
		sub	d0,ch_ArpPchSldNote(a4)
		move	#-1,ch_ArpPchSldToNote(a4)
.x2		rts

SlideVol	cmp.b	#fx_VolumeSlideToVol,ch_VolSld(a4)
		bne.b	.checknext
		tst.b	ch_VolSldToVolOff(a4)
		bne.b	.exit
		tst.b	ch_VolSldType(a4)
		bne.b	.slidedown
.slideup	move	ch_Volume1(a4),d2
		add	ch_VolSldSpd(a4),d2
		cmp	ch_VolSldToVol(a4),d2
		ble.b	.ok1
		move	ch_VolSldToVol(a4),d2
		move.b	#1,ch_VolSldToVolOff(a4)
.ok1		move	d2,ch_Volume1(a4)
		move	d2,ch_Volume2(a4)
		move	d2,ch_Volume3(a4)
		rts
.slidedown	move	ch_Volume1(a4),d2
		sub	ch_VolSldSpd(a4),d2
		cmp	ch_VolSldToVol(a4),d2
		bge.b	.ok2
		move	ch_VolSldToVol(a4),d2
		move.b	#1,ch_VolSldToVolOff(a4)
.ok2		move	d2,ch_Volume1(a4)
		move	d2,ch_Volume2(a4)
		move	d2,ch_Volume3(a4)
.exit		rts
.checknext	cmp.b	#fx_VolumeSlideUp,ch_VolSld(a4)
		beq.b	.okej1
		cmp.b	#fx_PTVolSlideUp,ch_VolSld(a4)
		bne.b	.down
		btst	#1,ch_Play(a4)
		bne.b	.exit
.okej1		move	ch_Volume1(a4),d2
		add	ch_VolSldSpd(a4),d2
		cmp	#64*16,d2
		ble.b	.ok3
		move	#64*16,d2
.ok3		move	d2,ch_Volume1(a4)
		move	d2,ch_Volume2(a4)
		move	d2,ch_Volume3(a4)
		rts
.down		cmp.b	#fx_VolumeSlideDown,ch_VolSld(a4)
		beq.b	.okej2
		cmp.b	#fx_PTVolSlideDown,ch_VolSld(a4)
		bne.b	.exit
		btst	#1,ch_Play(a4)
		bne.b	.exit
.okej2		move	ch_Volume1(a4),d2
		sub	ch_VolSldSpd(a4),d2
		bpl.b	.ok4
		moveq	#0,d2
.ok4		move	d2,ch_Volume1(a4)
		move	d2,ch_Volume2(a4)
		move	d2,ch_Volume3(a4)
		rts

SlideChannelVol	cmp.b	#fx_ChannelVolSlideToVol,ch_CVolSld(a4)
		bne.b	.checknext
		tst.b	ch_CVolSldToVolOff(a4)
		bne.b	.exit
		tst.b	ch_CVolSldType(a4)
		bne.b	.slidedown
.slideup	move	ch_CVolume(a4),d2
		add	ch_CVolSldSpd(a4),d2
		cmp	ch_CVolSldToVol(a4),d2
		ble.b	.ok1
		move	ch_CVolSldToVol(a4),d2
		move.b	#1,ch_CVolSldToVolOff(a4)
.ok1		move	d2,ch_CVolume(a4)
		rts
.slidedown	move	ch_CVolume(a4),d2
		sub	ch_CVolSldSpd(a4),d2
		cmp	ch_CVolSldToVol(a4),d2
		bge.b	.ok2
		move	ch_CVolSldToVol(a4),d2
		move.b	#1,ch_CVolSldToVolOff(a4)
.ok2		move	d2,ch_CVolume(a4)
.exit		rts
.checknext	cmp.b	#fx_ChannelVolSlideUp,ch_CVolSld(a4)
		bne.b	.down
		move	ch_CVolume(a4),d2
		add	ch_CVolSldSpd(a4),d2
		cmp	#64*16,d2
		ble.b	.ok3
		move	#64*16,d2
.ok3		move	d2,ch_CVolume(a4)
		rts
.down		cmp.b	#fx_ChannelVolSlideDown,ch_CVolSld(a4)
		bne.b	.exit
		move	ch_CVolume(a4),d2
		sub	ch_CVolSldSpd(a4),d2
		bpl.b	.ok4
		moveq	#0,d2
.ok4		move	d2,ch_CVolume(a4)
		rts

SlideMasterVol	cmp.b	#fx_MasterVolSlideToVol,ch_MVolSld(a4)
		bne.b	.checknext
		tst.b	ch_MVolSldToVolOff(a4)
		bne.b	.exit
		tst.b	ch_MVolSldType(a4)
		bne.b	.slidedown
.slideup	move	_MasterVol(a5),d2
		add	ch_MVolSldSpd(a4),d2
		cmp	ch_MVolSldToVol(a4),d2
		ble.b	.ok1
		move	ch_MVolSldToVol(a4),d2
		move.b	#1,ch_MVolSldToVolOff(a4)
.ok1		move	d2,_MasterVol(a5)
		rts
.slidedown	move	_MasterVol(a5),d2
		sub	ch_MVolSldSpd(a4),d2
		cmp	ch_MVolSldToVol(a4),d2
		bge.b	.ok2
		move	ch_MVolSldToVol(a4),d2
		move.b	#1,ch_MVolSldToVolOff(a4)
.ok2		move	d2,_MasterVol(a5)
.exit		rts
.checknext	cmp.b	#fx_MasterVolSlideUp,ch_MVolSld(a4)
		bne.b	.down
		move	_MasterVol(a5),d2
		add	ch_MVolSldSpd(a4),d2
		cmp	#64*16,d2
		ble.b	.ok3
		move	#64*16,d2
.ok3		move	d2,_MasterVol(a5)
		rts
.down		cmp.b	#fx_MasterVolSlideDown,ch_MVolSld(a4)
		bne	.exit
		move	_MasterVol(a5),d2
		sub	ch_MVolSldSpd(a4),d2
		bpl.b	.ok4
		moveq	#0,d2
.ok4		move	d2,_MasterVol(a5)
		rts

SlideArpVol	cmp.b	#4,ch_ArpVolSld(a4)
		bne.b	.down
		move	ch_Volume1(a4),d2
		add	ch_ArpVolSldSpd(a4),d2
		cmp	#64*16,d2
		ble.b	.ok1
		move	#64*16,d2
.ok1		move	d2,ch_Volume1(a4)
		move	d2,ch_Volume2(a4)
		move	d2,ch_Volume3(a4)
		rts
.down		cmp.b	#5,ch_ArpVolSld(a4)
		bne.b	.exit
		move	ch_Volume1(a4),d2
		sub	ch_ArpVolSldSpd(a4),d2
		bpl.b	.ok1
		moveq	#0,d2
		bra 	.ok2
.ok2		move	d2,ch_Volume1(a4)
		move	d2,ch_Volume2(a4)
		move	d2,ch_Volume3(a4)
.exit		rts

ArpeggioPlay	btst	#2,ch_Arp(a4)
		bne.b	.play
		btst	#0,ch_Arp(a4)
		beq	.exit
.play		subq.b	#1,ch_ArpSpdCnt(a4)
		bne	.exit
		move.l	ch_InstPtr(a4),a0
		move.b	inst_ArpSpeed(a0),d0
		not.b	ch_ArpgGrv(a4)
		beq.b	.nogrv
		move.b	inst_ArpGroove(a0),d1
		beq.b	.nogrv
		exg	d0,d1
.nogrv		move.b	d0,ch_ArpSpdCnt(a4)
.arpeggio	lea	_ArpgPtrs(a5),a1
		move	inst_ArpTable(a0),d0
		btst	#2,ch_Arp(a4)
		beq.b	.okej
		move.b	ch_ArpTab(a4),d0
.okej		lsl	#2,d0
		move.l	(a1,d0.w),d0
		beq	.exit
		move.l	d0,a1
.restart	move.l	a1,a2
		moveq	#0,d0
		move.b	ch_ArpPos(a4),d0
		move.b	d0,d2
		addq.b	#1,ch_ArpPos(a4)
		and.b	#$7f,ch_ArpPos(a4)
		mulu	#6,d0
		add	d0,a2
		tst.b	ch_ArpWait(a4)
		beq.b	.oki
		tst.b	(a2)
		beq	.exit
.oki		moveq	#0,d0
		move.b	(a2)+,d0
.end		cmp.b	#61,d0
		bne.b	.jump
		clr.b	ch_Arp(a4)
		move	ch_ArpNote(a4),ch_Note(a4)
		bra	.exit
.jump		cmp.b	#62,d0
		bne.b	.nojump
		move.b	(a2)+,d1
		cmp.b	d1,d2
		beq	.restart
		move.b	d1,ch_ArpPos(a4)
		bra	.restart
.nojump		moveq	#0,d1
		move.b	(a2)+,d1
		move	d1,d2
		bne.b	.fx
		move.b	inst_SmplNumber(a0),d2
.fx		move.b	d2,ch_WsNumber(a4)
		clr.b	ch_Restart(a4)
		clr.b	ch_ArpPchSld(a4)
		clr.b	ch_ArpVolSld(a4)
		moveq	#1,d7
.loop		moveq	#0,d2
		move.b	(a2)+,d2
		move	d2,d3
		cmp	#6,d3
		bhi.b	.skip
		add	d3,d3
		add	d3,d3
		lea	ArpFx_JmpTab,a1
		move.l	(a1,d3.w),a1
		jsr	(a1)
.skip		addq	#1,a2
		dbf	d7,.loop

		bclr	#5,ch_Arp(a4)
		tst.b	d0
		beq	.exit
		bmi.b	.transnote
		bset	#5,ch_Arp(a4)
		bra.b	.fixnote
.transnote	add.b	#61,d0
		add.b	ch_ArpgNote(a4),d0
.fixnote	ext	d0
		lsl	#5,d0
		move	d0,ch_ArpNote(a4)
		move	d0,ch_Note(a4)
		clr	ch_ArpPchSldNote(a4)
		bclr	#0,ch_ArpWait(a4)
		beq.b	.nowait
		bsr	ArpWaitStart
		bra	PlayInst
.nowait		btst	#1,ch_Restart(a4)
		beq.b	.norestart
		bset	#1,ch_Arp(a4)
		lsl	#2,d1
		bne.b	.wsptr
		bra	PlayInst
.wsptr		lea	_WsPtrs(a5),a1
		move.l	(a1,d1.w),d0
		beq	.exit
		move.l	d0,ch_WsPtr(a4)
		bset	#3,ch_Arp(a4)
		bra	PlayInst
.norestart	lsl	#2,d1
		bne.b	.ok
		move	inst_SemiTone(a0),d0
		lsl	#5,d0
		move	d0,ch_SemiTone(a4)
		btst	#2,ch_Play(a4)
		bne	.exit
		move	inst_FineTune(a0),ch_FineTune(a4)
		bra	.exit
.ok		bset	#0,ch_Play(a4)
		lea	_WsPtrs(a5),a1
		move.l	(a1,d1.w),d0
		beq	.exit
		move.l	d0,a1
		move	smpl_SemiTone(a1),d0
		lsl	#5,d0
		move	d0,ch_SemiTone(a4)
		btst	#2,ch_Play(a4)
		bne.b	.skippa
		move	smpl_FineTune(a1),ch_FineTune(a4)
.skippa		move.l	smpl_Pointer(a1),d0
		move.b	smpl_Type(a1),ch_WaveOrSample(a4)
		beq.b	.sample
		move.b	inst_SmplType(a0),d1
		bne.b	.wave
		moveq	#3,d1
.wave		move.b	d1,ch_WaveOrSample(a4)
		bsr	FixWaveLength
		bra.b	.checklen
.sample		move.l	d0,ch_WsPointer(a4)
		move	smpl_Length(a1),ch_WsLength(a4)
		move.l	smpl_RepPointer(a1),d0
		move	smpl_RepLength(a1),d1
		bne.b	.wsloop
		move.l	#ZeroSample,d0
		moveq	#1,d1
.wsloop		move.l	d0,ch_WsRepPointer(a4)
		move.l	d0,ch_WsRepPtrOrg(a4)
		move	d1,ch_WsRepLength(a4)
		move	ch_WsRepLength(a4),d0
.checklen	subq	#8,d0
		beq.b	.okidoki
		subq	#8,d0
		beq.b	.okidoki
		sub	#16,d0
		beq.b	.okidoki
		sub	#32,d0
		beq.b	.okidoki
		sub	#64,d0
		beq.b	.okidoki
		clr.b	ch_Effects2(a4)
.exit		rts
.okidoki	move.b	inst_Effects2(a0),ch_Effects2(a4)
		rts

ADSRPlay	btst	#ADSR,ch_Effects1(a4)
		beq.b	.exit
		lea	ch_ADSRData(a4),a0
		move	(a0)+,d0
		bne.b	.found
		move	(a0)+,d0
		bne.b	.found
		move	(a0)+,d0
		bne.b	.found

		btst	#ADSRHOLDSUSTAIN,ch_EffectsPar1(a4)
		beq.b	.nothold
		move	14(a0),d1
		bra.b	.notzero

.nothold	move	(a0)+,d0
		bne.b	.found
		move	14(a0),d1
		bra.b	.notzero

.found		move	ch_ADSRVolume(a4),d1
		add	6(a0),d1
		move	d1,ch_ADSRVolume(a4)
		lsr	#8,d1

		subq	#1,d0
		move	d0,-(a0)
		bne.b	.notzero
		move	16(a0),d1
.notzero	mulu	ch_Volume2(a4),d1
		lsr.l	#6,d1
		move	d1,ch_Volume3(a4)
.exit		rts

TremoloPlay	cmp.b	#fx_PTTremolo,ch_Tre(a4)
		beq	PTTremoloPlay
		tst.b	ch_Tre(a4)
		bne.b	.go
		btst	#TREMOLO,ch_Effects1(a4)
		beq	.exit
		tst	ch_TreCmdDelay(a4)
		beq.b	.go
		subq	#1,ch_TreCmdDelay(a4)
		rts

.go		tst	ch_TreAtkLength(a4)
		bne.b	.attack
		move	ch_TreDepth(a4),ch_TreCmdDepth(a4)
		bra.b	.vibba

.attack		move	ch_TreAtkSpeed(a4),d0
		add	d0,ch_TreCmdDepth(a4)
		subq	#1,ch_TreAtkLength(a4)
		bne.b	.vibba
		move	ch_TreDepth(a4),ch_TreCmdDepth(a4)

.vibba		move	ch_TreCount(a4),d0
		move	ch_TreCmdSpeed(a4),d1
		move	ch_TreCmdDepth(a4),d2
		lsr	#8,d2
		moveq	#0,d3
		move.b	ch_TreWaveNum(a4),d3
		lsl	#7,d3
		lea	Sine,a0
		add	d3,a0
		lsr	#2,d0
		move.b	(a0,d0.w),d3
		ext	d3
		tst.b	ch_TreDir(a4)
		bne.b	.oki
		neg	d3
.oki		muls	d2,d3
		asr.l	#1,d3
		bpl.b	.plus1
		add	#16,d3

.plus1		move	ch_Volume1(a4),d4
		beq.b	.notre
		add	d3,d4
		bpl.b	.ok1
		moveq	#0,d4
.ok1		cmp	#64*16,d4
		ble.b	.notre
		move	#64*16,d4
.notre		move	d4,ch_Volume2(a4)
		move	d4,ch_Volume3(a4)
		move	ch_TreCount(a4),d0
		add	d1,d0
		and	#$1ff,d0
		move	d0,ch_TreCount(a4)
.exit		rts

PTTremoloPlay	btst	#1,ch_Play(a4)
		bne	.exit
		move.b	ch_PTTrePos(a4),d0
		lea	PTVibratoTable(pc),a0
		lsr	#2,d0
		and	#$001f,d0
		moveq	#0,d2
		move.b	ch_PTTreWave(a4),d2
		and.b	#$03,d2
		beq.b	.tre_sine
		lsl.b	#3,d0
		cmp.b	#1,d2
		beq.b	.tre_rampdown
		move.b	#255,d2
		bra.b	.tre_set
.tre_rampdown	tst.b	ch_PTTrePos(a4)
		bpl.b	.tre_rampdown2
		move.b	#255,d2
		sub.b	d0,d2
		bra.b	.tre_set
.tre_rampdown2	move.b	d0,d2
		bra.b	.tre_set
.tre_sine	move.b	(a0,d0.w),d2
.tre_set	move.b	ch_PTTreCmd(a4),d0
		and	#15,d0
		mulu	d0,d2
		lsr	#2,d2
		tst.b	ch_PTTrePos(a4)
		bpl.b	.positive
		bra.b	.negative
.positive	tst	d2
		bpl.b	.ok
		neg	d2
		bra.b	.ok
.negative	tst	d2
		bmi.b	.ok
		neg	d2
.ok		move	ch_Volume1(a4),d4
		beq.b	.notre
		add	d2,d4
		bpl.b	.ok1
		moveq	#0,d4
.ok1		cmp	#64*16,d4
		ble.b	.notre
		move	#64*16,d4
.notre		move	d4,ch_Volume2(a4)
		move	d4,ch_Volume3(a4)
		move.b	ch_PTTreCmd(a4),d0
		lsr	#2,d0
		and	#$003c,d0
		add.b	d0,ch_PTTrePos(a4)
.exit		rts

VibratoPlay	cmp.b	#fx_PTVibrato,ch_Vib(a4)
		beq	PTVibratoPlay
		tst.b	ch_Vib(a4)
		bne.b	.go
		btst	#VIBRATO,ch_Effects1(a4)
		beq.b	.exit
		tst	ch_VibCmdDelay(a4)
		beq.b	.go
		subq	#1,ch_VibCmdDelay(a4)
		rts

.go		tst	ch_VibAtkLength(a4)
		bne.b	.attack
		move	ch_VibDepth(a4),ch_VibCmdDepth(a4)
		bra.b	.vibba

.attack		move	ch_VibAtkSpeed(a4),d0
		add	d0,ch_VibCmdDepth(a4)
		subq	#1,ch_VibAtkLength(a4)
		bne.b	.vibba
		move	ch_VibDepth(a4),ch_VibCmdDepth(a4)

.vibba		move	ch_VibCount(a4),d0
		move	ch_VibCmdSpeed(a4),d1
		move	ch_VibCmdDepth(a4),d2
		lsr	#8,d2
		moveq	#0,d3
		move.b	ch_VibWaveNum(a4),d3
		lsl	#7,d3
		lea	Sine,a0
		add	d3,a0
		lsr	#2,d0
		move.b	(a0,d0.w),d3
		ext	d3
		tst.b	ch_VibDir(a4)
		bne.b	.oki
		neg	d3
.oki		muls	d2,d3
		asr.l	#4,d3
		bpl.b	.plus1
		addq	#1,d3
.plus1		move	d3,ch_VibNote(a4)
		move	ch_VibCount(a4),d0
		add	d1,d0
		and	#$1ff,d0
		move	d0,ch_VibCount(a4)
.exit		rts

PTVibratoPlay	btst	#1,ch_Play(a4)
		bne.b	.exit
		move.b	ch_PTVibPos(a4),d0
		lea	PTVibratoTable(pc),a0
		lsr	#2,d0
		and	#$001f,d0
		moveq	#0,d2
		move.b	ch_PTVibWave(a4),d2
		and.b	#$03,d2
		beq.b	.vib_sine
		lsl.b	#3,d0
		cmp.b	#1,d2
		beq.b	.vib_rampdown
		move.b	#255,d2
		bra.b	.vib_set
.vib_rampdown	tst.b	ch_PTVibPos(a4)
		bpl.b	.vib_rampdown2
		move.b	#255,d2
		sub.b	d0,d2
		bra.b	.vib_set
.vib_rampdown2	move.b	d0,d2
		bra.b	.vib_set
.vib_sine	move.b	(a0,d0.w),d2
.vib_set	move.b	ch_PTVibCmd(a4),d0
		and	#15,d0
		mulu	d0,d2
		lsr	#7,d2
		tst.b	ch_PTVibPos(a4)
		bpl.b	.positive
		bra.b	.negative
.positive	tst	d2
		bpl.b	.ok
		neg	d2
		bra.b	.ok
.negative	tst	d2
		bmi.b	.ok
		neg	d2
.ok		move	d2,ch_PTVibNote(a4)
		move.b	ch_PTVibCmd(a4),d0
		lsr	#2,d0
		and	#$003c,d0
		add.b	d0,ch_PTVibPos(a4)
.exit		rts

PTVibratoTable	dc.b	000,024,049,074,097,120,141,161
		dc.b	180,197,212,224,235,244,250,253
		dc.b	255,253,250,244,235,224,212,197
		dc.b	180,161,141,120,097,074,049,024

PhasePlay	btst	#PHASE,ch_Effects2(a4)
		beq	PhaseExit
		lea	ch_PhaData(a4),a0
		move	ch_WsRepLength(a4),d6
		add	d6,d6
		btst	#PHASESTEP,ch_EffectsPar1(a4)
		beq.b	.count
		btst	#PHASEINIT,ch_EffectsPar1(a4)
		bne.b	.initstep
		tst.b	ch_PartNote(a4)
		beq.b	.nocount
		bra.b	.count
.initstep	tst.b	ch_PartNote(a4)
		beq.b	.counter
.count		move	cnt_counter(a0),cnt_savecounter(a0)
.counter	bsr	Counter
.nocount	move	cnt_savecounter(a0),d0
		btst	#PHASESTEP,ch_EffectsPar1(a4)
		beq.b	.nostep
		tst	cnt_delay(a0)
		beq.b	.okstep
		subq	#1,cnt_delay(a0)
		bra.b	.nostep
.okstep		move.b	ch_PhaSpd+1(a4),d1
		ext	d1
		bmi.b	.right
.left		sub	d1,cnt_savecounter(a0)
		cmp	#2,cnt_savecounter(a0)
		bge.b	.nostep
		move	#2,cnt_savecounter(a0)
		bra.b	.nostep
.right		sub	d1,cnt_savecounter(a0)
		cmp	#512,cnt_savecounter(a0)
		ble.b	.nostep
		move	#512,cnt_savecounter(a0)

.nostep		cmp	#128,d6
		ble.b	.next1
		addq	#1,d0
		lsr	#1,d0
		lea	SizerTable256,a3
		lea	SizerOffset256,a0
		bra.b	.ok
.next1		cmp	#64,d6
		ble.b	.next2
		addq	#3,d0
		lsr	#2,d0
		lea	SizerTable128,a3
		lea	SizerOffset128,a0
		bra.b	.ok
.next2		cmp	#32,d6
		ble.b	.next3
		addq	#7,d0
		lsr	#3,d0
		lea	SizerTable64,a3
		lea	SizerOffset64,a0
		bra.b	.ok
.next3		cmp	#16,d6
		ble.b	.next4
		add	#15,d0
		lsr	#4,d0
		lea	SizerTable32,a3
		lea	SizerOffset32,a0
		bra.b	.ok
.next4		add	#31,d0
		lsr	#5,d0
		lea	SizerTable16,a3
		lea	SizerOffset16,a0

.ok		move.l	ch_WsRepPointer(a4),a1
		lea	ch_PhaWaveBuffer(a4),a2
		move.l	a2,ch_WsRepPointer(a4)
		btst	#LOOP,ch_Effects1(a4)
		bne.b	.yes
		tst.b	ch_WaveOrSample(a4)
		beq.b	.nest
.yes		move.l	a2,ch_WsPointer(a4)

.nest		btst	#1,_PlayBits(a5)
		bne	PhaseExit
		move	d6,d7
		cmp	d6,d0
		bge	Phase_Mova
		move	d0,d7
		beq	Phase_Mova
		subq	#1,d7
		move	d7,d5
		move	d6,d1
		sub	d0,d1

		moveq	#0,d2
		subq	#1,d0
		add	d0,d0
		move	(a0,d0.w),d2
		add.l	d2,a3
		cmp.b	#3,ch_PhaType(a4)
		beq	Phase_Low
		cmp.b	#1,ch_PhaType(a4)
		beq.b	Phase_High
		cmp.b	#2,ch_PhaType(a4)
		beq	Phase_Med

Phase_Quick	move.l	a2,d4
		moveq	#0,d0
.loop1		move.b	(a3)+,d0
		move.b	(a1,d0.w),(a2)+
		dbf	d7,.loop1

		btst	#PHASEFILL,ch_EffectsPar1(a4)
		bne.b	.fill

		subq	#1,d1
		bmi.b	.end
		move.b	(a1,d0.w),d0
.loop2		move.b	d0,(a2)+
		dbf	d1,.loop2
.end		rts

.fill		subq	#1,d1
		bmi.b	.fillend
		move.l	d4,a1
.fillloop	move.b	(a1)+,(a2)+
		dbf	d1,.fillloop
.fillend	rts

Phase_High	move.l	a3,d6
		move.l	a1,a0
		moveq	#0,d0
.loop1		move.b	(a3)+,d0
		move.b	(a1,d0.w),d2
		ext	d2
		move.b	(a0)+,d3
		ext	d3
		add	d2,d3
		add	d2,d2
		add	d2,d3
		asr	#2,d3
		move.b	d3,(a2)+
		dbf	d7,.loop1

		btst	#PHASEFILL,ch_EffectsPar1(a4)
		bne.b	.fill

		subq	#1,d1
		bmi.b	.end
		move.b	(a1,d0.w),d0
		ext	d0
		move	d0,d2
		add	d2,d2
		add	d2,d0
.loop2		move.b	(a0)+,d2
		ext	d2
		add	d0,d2
		asr	#2,d2
		move.b	d2,(a2)+
		dbf	d1,.loop2
.end		rts

.fill		tst	d1
		beq.b	.fillend
		move.l	d6,a3
.fillagain	move	d5,d7
		moveq	#0,d3
.fillloop	move.b	(a3)+,d3
		move.b	(a1,d3.w),d0
		ext	d0
		move.b	(a0)+,d2
		ext	d2
		add	d0,d2
		add	d0,d0
		add	d0,d2
		asr	#2,d2
		move.b	d2,(a2)+
		subq	#1,d1
		dbeq	d7,.fillloop
		bne.b	.fillagain
.fillend	rts

Phase_Med	move.l	a3,d6
		move.l	a1,a0
		moveq	#0,d0
.loop1		move.b	(a3)+,d0
		move.b	(a1,d0.w),d2
		ext	d2
		move.b	(a0)+,d3
		ext	d3
		add	d2,d3
		asr	#1,d3
		move.b	d3,(a2)+
		dbf	d7,.loop1

		btst	#PHASEFILL,ch_EffectsPar1(a4)
		bne.b	.fill

		subq	#1,d1
		bmi.b	.end
		move.b	(a1,d0.w),d0
		ext	d0
.loop2		move.b	(a0)+,d2
		ext	d2
		add	d0,d2
		asr	#1,d2
		move.b	d2,(a2)+
		dbf	d1,.loop2
.end		rts

.fill		tst	d1
		beq.b	.fillend
		moveq	#0,d3
.fillagain	move.l	d6,a3
		move	d5,d7
.fillloop	move.b	(a3)+,d3
		move.b	(a1,d3.w),d0
		ext	d0
		move.b	(a0)+,d2
		ext	d2
		add	d0,d2
		asr	#1,d2
		move.b	d2,(a2)+
		subq	#1,d1
		dbeq	d7,.fillloop
		bne.b	.fillagain
.fillend	rts

Phase_Low	move.l	a3,d6
		move.l	a1,a0
		moveq	#0,d0
.loop1		move.b	(a3)+,d0
		move.b	(a1,d0.w),d2
		ext	d2
		move.b	(a0)+,d3
		ext	d3
		add	d3,d2
		add	d3,d3
		add	d3,d2
		asr	#2,d2
		move.b	d2,(a2)+
		dbf	d7,.loop1

		btst	#PHASEFILL,ch_EffectsPar1(a4)
		bne.b	.fill

		subq	#1,d1
		bmi.b	.end
		move.b	(a1,d0.w),d0
		ext	d0
.loop2		move.b	(a0)+,d2
		ext	d2
		move	d2,d3
		add	d3,d3
		add	d3,d2
		add	d0,d2
		asr	#2,d2
		move.b	d2,(a2)+
		dbf	d1,.loop2
.end		rts

.fill		tst	d1
		beq.b	.fillend
		move.l	d6,a3
.fillagain	move	d5,d7
		moveq	#0,d3
.fillloop	move.b	(a3)+,d3
		move.b	(a1,d3.w),d0
		ext	d0
		move.b	(a0)+,d2
		ext	d2
		add	d2,d0
		add	d2,d2
		add	d0,d2
		asr	#2,d2
		move.b	d2,(a2)+
		subq	#1,d1
		dbeq	d7,.fillloop
		bne.b	.fillagain
.fillend	rts

Phase_Mova	subq	#1,d6
.mloop		move.b	(a1)+,(a2)+
		dbf	d6,.mloop
PhaseExit	rts

MixPlay		btst	#MIX,ch_Effects2(a4)
		beq	.exit
		lea	ch_MixData(a4),a0
		move	ch_WsRepLength(a4),d7
		add	d7,d7
		btst	#MIXSTEP,ch_EffectsPar2(a4)
		beq.b	.count
		btst	#MIXINIT,ch_EffectsPar2(a4)
		bne.b	.initstep
		tst.b	ch_PartNote(a4)
		beq.b	.nocount
		bra.b	.count
.initstep	tst.b	ch_PartNote(a4)
		beq.b	.counter
.count		move	cnt_counter(a0),cnt_savecounter(a0)
.counter	btst	#MIXCOUNTER,ch_EffectsPar2(a4)
		beq.b	.twoway
.oneway		pea	.nocount
		bra	OneWayCounter
.twoway		bsr	Counter
.nocount	move	cnt_savecounter(a0),d0
		btst	#MIXSTEP,ch_EffectsPar2(a4)
		beq.b	.nostep
		tst	cnt_delay(a0)
		beq.b	.okstep
		subq	#1,cnt_delay(a0)
		bra.b	.nostep
.okstep		move.b	ch_MixSpd+1(a4),d1
		ext	d1
		bpl.b	.right
.left		add	d1,cnt_savecounter(a0)
		bge.b	.nostep
		clr	cnt_savecounter(a0)
		bra.b	.nostep
.right		add	d1,cnt_savecounter(a0)
		cmp	#510,cnt_savecounter(a0)
		ble.b	.nostep
		move	#510,cnt_savecounter(a0)
.nostep		cmp	#128,d7
		ble.b	.next1
		lsr	#1,d0
		moveq	#0,d4
		bra.b	.ok
.next1		cmp	#64,d7
		ble.b	.next2
		lsr	#2,d0
		move.l	#256,d4
		bra.b	.ok
.next2		cmp	#32,d7
		ble.b	.next3
		lsr	#3,d0
		move.l	#256+128,d4
		bra.b	.ok
.next3		cmp	#16,d7
		ble.b	.next4
		lsr	#4,d0
		move.l	#256+128+64,d4
		bra.b	.ok
.next4		lsr	#5,d0
		move.l	#256+128+64+32,d4

.ok		move.l	ch_WsRepPointer(a4),a0
		lea	ch_MixWaveBuffer(a4),a1
		btst	#MIXBUFF,ch_EffectsPar2(a4)
		bne.b	.skipnormal
		move.l	a0,a1
		moveq	#0,d1
		move.b	ch_MixWaveNum(a4),d1
		beq.b	.skipnormal
		add	d1,d1
		add	d1,d1
		lea	_WsPtrs(a5),a1
		move.l	(a1,d1.w),a1
		move.l	smpl_RepPointer(a1),a1
		add.l	d4,a1
.skipnormal	move.l	a1,a3
		lea	ch_MixWaveBuffer(a4),a2
		move.l	a2,ch_WsRepPointer(a4)
		tst.b	ch_WaveOrSample(a4)
		beq.b	.nest
		move.l	a2,ch_WsPointer(a4)

.nest		btst	#1,_PlayBits(a5)
		bne.b	.exit
		add	d0,a1
		sub	d0,d7
		subq	#1,d7
		moveq	#1,d4
		btst	#2,ch_MixResFilBoost(a4)
		beq.b	.skip
		moveq	#0,d4
.skip		bsr.b	.loop

		move	d0,d7
		beq.b	.exit
		subq	#1,d7
		move.l	a3,a1

.loop		move.b	(a0)+,d2
		ext	d2
		move.b	(a1)+,d1
		ext	d1
		add	d1,d2
		asr	d4,d2
		move.b	d2,(a2)+
		dbf	d7,.loop
.exit		rts

ResonancePlay	btst	#RESONANCE,ch_Effects2(a4)
		beq	.exit
		lea	ch_ResData(a4),a0
		btst	#RESONANCESTEP,ch_EffectsPar2(a4)
		beq.b	.count
		btst	#RESONANCEINIT,ch_EffectsPar2(a4)
		bne.b	.initstep
		tst.b	ch_PartNote(a4)
		beq.b	.nocount
		bra.b	.count
.initstep	tst.b	ch_PartNote(a4)
		beq.b	.counter
.count		move	cnt_counter(a0),cnt_savecounter(a0)
.counter	bsr	Counter
.nocount	move	cnt_savecounter(a0),d0
		btst	#RESONANCESTEP,ch_EffectsPar2(a4)
		beq.b	.nostep
		tst	cnt_delay(a0)
		beq.b	.okstep
		subq	#1,cnt_delay(a0)
		bra.b	.nostep
.okstep		move.b	ch_ResSpd+1(a4),d1
		ext	d1
		bpl.b	.right
.left		add	d1,cnt_savecounter(a0)
		bge.b	.nostep
		clr	cnt_savecounter(a0)
		bra.b	.nostep
.right		add	d1,cnt_savecounter(a0)
		cmp	#510,cnt_savecounter(a0)
		ble.b	.nostep
		move	#510,cnt_savecounter(a0)

.nostep		move.l	ch_WsRepPointer(a4),a0
		lea	ch_ResWaveBuffer(a4),a1
		move.l	a1,ch_WsRepPointer(a4)
		btst	#LOOP,ch_Effects1(a4)
		bne.b	.yes
		tst.b	ch_WaveOrSample(a4)
		beq.b	.nest
.yes		move.l	a1,ch_WsPointer(a4)

.nest		btst	#1,_PlayBits(a5)
		bne.b	.exit
		move	ch_WsRepLength(a4),d7
		add	d7,d7
		subq	#1,d7

		move.b	ch_ResLastSample(a4),d4
		tst.b	ch_ResLastInit(a4)
		beq.b	.skip
		clr.b	ch_ResLastInit(a4)
		move.b	(a0,d7.w),d4
		asr.b	#2,d4
.skip		ext	d4
		asl	#7,d4

		and	#$fffe,d0		clear bit 0
		move	#$8000,d2
		moveq	#0,d3

		lea	.resonancelist(pc),a2
		move	(a2,d0.w),d5

		lea	.resamplist(pc),a2
		moveq	#0,d0
		move.b	ch_ResAmp(a4),d0
		add	d0,d0
		move	(a2,d0.w),d1
		sub	d1,d2
		mulu	#$e666,d2
		swap	d2
		moveq	#7,d0
		btst	#1,ch_MixResFilBoost(a4)
		beq.b	.loop
		moveq	#6,d0
.loop		move.b	(a0)+,d6
		ext	d6
		asl	#5,d6
		sub	d4,d6
		ext.l	d6
		asl.l	#7,d6
		divs	d5,d6
		add	d6,d3
		add	d3,d4
		move	d4,d6
		asr	d0,d6
		move.b	d6,(a1)+
		muls	d2,d3
		add.l	d3,d3
		swap	d3
		dbf	d7,.loop
		move.b	d6,ch_ResLastSample(a4)
.exit		rts

		incdir	Mline:raw/
.resonancelist	incbin	resonancelist.raw
.resamplist	incbin	resonanceamplist.raw

FilterPlay	btst	#FILTER,ch_Effects2(a4)
		beq	.exit
		lea	ch_FilData(a4),a0
		btst	#FILTERSTEP,ch_EffectsPar1(a4)
		beq.b	.count
		btst	#FILTERINIT,ch_EffectsPar1(a4)
		bne.b	.initstep
		tst.b	ch_PartNote(a4)
		beq.b	.nocount
		bra.b	.count
.initstep	tst.b	ch_PartNote(a4)
		beq.b	.counter
.count		move	cnt_counter(a0),cnt_savecounter(a0)
.counter	bsr	Counter
.nocount	move	cnt_savecounter(a0),d0
		btst	#FILTERSTEP,ch_EffectsPar1(a4)
		beq.b	.nostep
		tst	cnt_delay(a0)
		beq.b	.okstep
		subq	#1,cnt_delay(a0)
		bra.b	.nostep
.okstep		move.b	ch_FilSpd+1(a4),d1
		ext	d1
		bpl.b	.right
.left		add	d1,cnt_savecounter(a0)
		bge.b	.nostep
		clr	cnt_savecounter(a0)
		bra.b	.nostep
.right		add	d1,cnt_savecounter(a0)
		cmp	#510,cnt_savecounter(a0)
		ble.b	.nostep
		move	#510,cnt_savecounter(a0)

.nostep		move.l	ch_WsRepPointer(a4),a0
		lea	ch_FilWaveBuffer(a4),a1
		move.l	a1,ch_WsRepPointer(a4)
		btst	#LOOP,ch_Effects1(a4)
		bne.b	.yes
		tst.b	ch_WaveOrSample(a4)
		beq.b	.nest
.yes		move.l	a1,ch_WsPointer(a4)

.nest		btst	#1,_PlayBits(a5)
		bne.b	.exit
		move	ch_WsRepLength(a4),d7
		add	d7,d7
		subq	#1,d7

		move.b	ch_FilLastSample(a4),d4

		tst.b	ch_FilType(a4)
		beq.b	.filter
.resfilter	tst.b	ch_FilLastInit(a4)
		beq.b	.resskip
		clr.b	ch_FilLastInit(a4)
		move.b	(a0,d7.w),d4
		asr.b	#1,d4
.resskip	ext	d4
		asl	#7,d4
		and	#$fffe,d0		clear bit 0
		lea	.resfilterlist(pc),a2
		move	(a2,d0.w),d1
		move	#$8000,d2
		sub	d1,d2
		lsr	#1,d1
		mulu	#$e666,d2
		swap	d2
		moveq	#0,d3
		moveq	#7,d0
		btst	#0,ch_MixResFilBoost(a4)
		beq.b	.resfilloop
		moveq	#6,d0
.resfilloop	move.b	(a0)+,d6
		ext	d6
		asl	#6,d6
		sub	d4,d6
		muls	d1,d6
		add.l	d6,d6
		add.l	d6,d6
		swap	d6
		add	d6,d3
		add	d3,d4
		move	d4,d6
		asr	d0,d6
		move.b	d6,(a1)+
		muls	d2,d3
		add.l	d3,d3
		swap	d3
		dbf	d7,.resfilloop
		move.b	d6,ch_FilLastSample(a4)
.exit		rts

.filter		tst.b	ch_FilLastInit(a4)
		beq.b	.filskip
		clr.b	ch_FilLastInit(a4)
		move.b	(a0,d7.w),d4
.filskip	ext	d4
		asl	#7,d4
		and	#$fffe,d0		clear bit 0
		lea	.filterlist(pc),a2
		move	(a2,d0.w),d1
		move	#$8000,d2
		sub	d1,d2
		lsr	#1,d1
		muls	#$f000,d2
		swap	d2
		moveq	#0,d3
		moveq	#7,d0
		btst	#0,ch_MixResFilBoost(a4)
		beq.b	.filloop
		moveq	#6,d0
.filloop	move.b	(a0)+,d6
		ext	d6
		asl	#7,d6
		sub	d4,d6
		muls	d1,d6
		add.l	d6,d6
		add.l	d6,d6
		swap	d6
		add	d6,d3
		add	d3,d4
		move	d4,d6
		asr	d0,d6
		move.b	d6,(a1)+
		muls	d2,d3
		add.l	d3,d3
		swap	d3
		dbf	d7,.filloop
		move.b	d6,ch_FilLastSample(a4)
		rts

		incdir	Mline:raw/
.filterlist	incbin	filterlist.raw
.resfilterlist	incbin	resfilterlist.raw

TransformPlay	btst	#TRANSFORM,ch_Effects2(a4)
		beq	TraExit
		lea	ch_TraData(a4),a0
		move	ch_WsRepLength(a4),d6
		moveq	#0,d4
		add	d6,d6
		cmp	#256,d6
		beq.b	.ok
		move	#256,d4
		cmp	#128,d6
		beq.b	.ok
		move	#256+128,d4
		cmp	#64,d6
		beq.b	.ok
		move	#256+128+64,d4
		cmp	#32,d6
		beq.b	.ok
		move	#256+128+64+32,d4

.ok		btst	#TRANSFORMSTEP,ch_EffectsPar1(a4)
		beq.b	.count
		btst	#TRANSFORMINIT,ch_EffectsPar1(a4)
		bne.b	.initstep
		tst.b	ch_PartNote(a4)
		beq.b	.nocount
		bra.b	.count
.initstep	tst.b	ch_PartNote(a4)
		beq.b	.counter
.count		move	cnt_counter(a0),cnt_savecounter(a0)
.counter	bsr	Counter
.nocount	move	cnt_savecounter(a0),d0
		btst	#TRANSFORMSTEP,ch_EffectsPar1(a4)
		beq.b	.nostep
		tst	cnt_delay(a0)
		beq.b	.okstep
		subq	#1,cnt_delay(a0)
		bra.b	.nostep
.okstep		move.b	ch_TraSpd+1(a4),d1
		ext	d1
		bpl.b	.right
.left		add	d1,cnt_savecounter(a0)
		bge.b	.nostep
		clr	cnt_savecounter(a0)
		bra.b	.nostep
.right		add	d1,cnt_savecounter(a0)
		cmp	#510,cnt_savecounter(a0)
		ble.b	.nostep
		move	#510,cnt_savecounter(a0)

.nostep		lsr	#1,d0
		move	#256,d1
		bsr.b	SelectTraWave
		moveq	#0,d1
		lea	ch_TraWsPtrs(a4),a3
		add	d3,a3
		move.b	(a3)+,d1
		beq.b	TraExit
		add	d1,d1
		add	d1,d1
		lea	_WsPtrs(a5),a2
		move.l	(a2,d1.w),a1
		move.l	smpl_RepPointer(a1),a1
		add	d4,a1
		tst	d3
		bne.b	.skip
		move.l	ch_WsRepPointer(a4),a1
.skip		moveq	#0,d1
		move.b	(a3)+,d1
		beq.b	TraExit
		add	d1,d1
		add	d1,d1
		move.l	(a2,d1.w),a0
		move.l	smpl_RepPointer(a0),a0
		add	d4,a0
		lea	ch_TraWaveBuffer(a4),a2
		move.l	a2,ch_WsRepPointer(a4)
		btst	#LOOP,ch_Effects1(a4)
		bne.b	.yes
		tst.b	ch_WaveOrSample(a4)
		beq.b	.next
.yes		move.l	a2,ch_WsPointer(a4)
.next		btst	#1,_PlayBits(a5)
		bne.b	TraExit
		subq	#1,d6
Trans_Loop	move.b	(a1)+,d1
		ext	d1
		move.b	(a0)+,d2
		ext	d2
		sub	d1,d2
		muls	d0,d2
		asr	#8,d2
		add	d2,d1
		move.b	d1,(a2)+
		dbf	d6,Trans_Loop
TraExit		rts

SelectTraWave	move	d0,d2
		moveq	#0,d3
		sub	d1,d2
		ble.b	.ok
		addq	#1,d3
		move	d2,d0
		sub	d1,d2
		ble.b	.ok
		addq	#1,d3
		move	d2,d0
		sub	d1,d2
		ble.b	.ok
		addq	#1,d3
		move	d2,d0
		sub	d1,d2
		ble.b	.ok
		addq	#1,d3
		move	d2,d0
		sub	d1,d2
		ble.b	.ok
		addq	#1,d3
		move	d2,d0
.ok		rts

;Counter Structure
cht_begin	rs.b	0
		rsreset
cnt_counter	rs.w	1
cnt_speed	rs.w	1
cnt_repeat	rs.w	1
cnt_repeatend	rs.w	1
cnt_turns	rs.w	1
cnt_delay	rs.w	1
cnt_step	rs.w	1
cnt_savecounter	rs.w	1
		rsset	cht_begin

OneWayCounter	move	cnt_counter(a0),d0
		tst	cnt_step(a0)
		bne.b	.cnt_go
		tst	cnt_delay(a0)
		beq.b	.cnt_go
		subq	#1,cnt_delay(a0)
		rts
.cnt_go		add	cnt_speed(a0),d0
		and	#$1ff,d0
		move	d0,cnt_counter(a0)
		rts

Counter		move	cnt_counter(a0),d0
		tst	cnt_step(a0)
		bne.b	.cnt_go
		tst	cnt_delay(a0)
		beq.b	.cnt_go
		subq	#1,cnt_delay(a0)
		rts
.cnt_go		tst	cnt_turns(a0)
		bmi.b	.cnt_exit
		move	cnt_repeat(a0),d1
		cmp	cnt_repeatend(a0),d1
		blo.b	.cnt_normal
		bra.b	.cnt_inverted
.cnt_notok	tst	cnt_turns(a0)
		beq.b	.cnt_turn
		subq	#1,cnt_turns(a0)
		bne.b	.cnt_turn
		move	#-1,cnt_turns(a0)
.cnt_turn	sub	cnt_speed(a0),d0
		neg	cnt_speed(a0)
.cnt_ok		move	d0,cnt_counter(a0)
.cnt_exit	rts

.cnt_normal	tst	cnt_speed(a0)
		bpl.b	.cnt_nadd
.cnt_nsub	add	cnt_speed(a0),d0
		cmp	cnt_repeat(a0),d0
		bge.b	.cnt_ok
		bra.b	.cnt_notok
.cnt_nadd	add	cnt_speed(a0),d0
		cmp	cnt_repeatend(a0),d0
		ble.b	.cnt_ok
		bra.b	.cnt_notok

.cnt_inverted	tst	cnt_speed(a0)
		bpl.b	.cnt_iadd
.cnt_isub	add	cnt_speed(a0),d0
		cmp	cnt_repeatend(a0),d0
		bge.b	.cnt_ok
		bra.b	.cnt_notok
.cnt_iadd	add	cnt_speed(a0),d0
		cmp	cnt_repeat(a0),d0
		ble.b	.cnt_ok
		bra.b	.cnt_notok

* Twins/PHA *****************************************************************
* Open and close input.device/inputhandler            Last Change: 92-10-24 *
*****************************************************************************

_OldKeyBufPos	rs.w	1
_NewKeyBufPos	rs.w	1
_KeyBuffer	rs.b	32
_InpMsgPort	rs.l	1
_InpIORequest	rs.l	1

OpenInputDevice	CallSys CreateMsgPort
		move.l	d0,_InpMsgPort(a5)
		beq	.exit
		move.l	#DelInpMsgPort,_DelInpMsgPort(a5)
		move.l	d0,a0
		move.l	#IOSTD_SIZE,d0
		CallLib CreateIORequest
		move.l	d0,_InpIORequest(a5)
		beq.b	.exit
		move.l	#DelInpIORequest,_DelInpIORequest(a5)
		moveq	#0,d0
		moveq	#0,d1
		lea	InpName,a0
		move.l	_InpIORequest(a5),a1
		CallLib OpenDevice
		tst.l	d0
		bne.b	.exit
		move.l	#CloseInputDevice,_CloseInputDevice(a5)

		move.l	_InpIORequest(a5),a1
		move	#IND_SETMPORT,IO_COMMAND(a1)
		move.b	#IOF_QUICK,IO_FLAGS(a1)
		move.l	#1,IO_LENGTH(a1)
		move.l	#MousePort0,IO_DATA(a1)
		CallLib DoIO
		tst.l	d0
		bne.b	.exit

		move.l	_InpIORequest(a5),a1
		move	#IND_ADDHANDLER,IO_COMMAND(a1)
		move.l	#InpIntHandler,IO_DATA(a1)
		CallLib DoIO
		tst.l	d0
		bne.b	.exit
		move.l	#RemInputHandler,_RemInputHandler(a5)

		rts
.exit		jmp	Exit

RemInputHandler	move.l	_InpIORequest(a5),a1
		move	#IND_REMHANDLER,IO_COMMAND(a1)
		move.l	#InpIntHandler,IO_DATA(a1)
		CallSys DoIO
		rts
CloseInputDevice
		move.l	_InpIORequest(a5),a1
		CallSys CloseDevice
		rts

DelInpMsgPort	move.l	_InpMsgPort(a5),a0
		CallSys DeleteMsgPort
		rts

DelInpIORequest	move.l	_InpIORequest(a5),a0
		CallSys DeleteIORequest
		rts

InpIntHandler	dc.l	0,0
		dc.b	2,100
		dc.l	InpIntName
		dc.l	Bss,InputHandler
InpIntName	dc.b	"MlInpInt",0
InpName		dc.b	"input.device",0
MousePort0	dc.b	0
		even

_RMButton	rs.w	1
_StringEd	rs.w	1

InputHandler	movem.l	d1-d7/a2-a6,-(sp)
		move.l	a0,-(sp)
		move.l	a0,a4
		move.l	a1,a5
		move.b	_ActiveWindows(a5),d2
		beq	.exit
		move	ie_Qualifier(a4),d4
		and	#IEQUALIFIER_RBUTTON,d4
		move	d4,_RMButton(a5)

		cmp.b	#IECLASS_RAWMOUSE,ie_Class(a4)
		bne.b	.tstaudio
		cmp	#IECODE_LBUTTON,ie_Code(a4)
		beq	.signalbutton
		cmp	#IECODE_RBUTTON,ie_Code(a4)
		beq	.signalbutton

.tstaudio	tst.b	_AudioChannels(a5)
		beq	.exit
		cmp.b	#1,_BlockPlay(a5)
		beq	.exit
		tst	_StringEd(a5)
		bne	.exit

		btst	#2,d2
		bne.b	.ok
		btst	#0,d2
		beq.b	.window2
.window1	tst	_HexNumEd1(a5)
		bne	.exit
		cmp.b	#1,_TunePart(a5)
		beq.b	.edit
		tst.b	_TunePart(a5)
		beq.b	.ok
		tst	PartEditorDefs+CursorXPos
		bne.b	.edit
		bra.b	.ok
.edit		tst	_EditOnOff(a5)
		bne	.exit
		bra.b	.ok
.window2	btst	#1,d2
		beq	.exit
		tst	_HexNumEd2(a5)
		bne	.exit
		tst	_ArpEdOnOff(a5)
		beq.b	.ok
		tst.b	_Arpg(a5)
		beq.b	.ok
		tst	ArpgEditorDefs+CursorXPos
		bne	.exit
.ok		move	#IECLASS_RAWKEY,d2
		move	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT!IEQUALIFIER_CONTROL!IEQUALIFIER_LALT!IEQUALIFIER_RALT!IEQUALIFIER_LCOMMAND!IEQUALIFIER_RCOMMAND!IEQUALIFIER_REPEAT,d3
		lea	_KeyBuffer(a5),a2
.loop		cmp.b	ie_Class(a4),d2
		bne	.nextevent
		move	ie_Qualifier(a4),d4
		and	d3,d4
		bne	.nextevent
		move	_NewKeyBufPos(a5),d4
		move	ie_Code(a4),d5
		move	d5,d6
		bclr	#7,d6
		tst	d6
		beq.b	.nextevent
		cmp	#$0d,d6
		bls.b	.rawkey
		cmp	#$10,d6
		blo.b	.nextevent
		cmp	#$1b,d6
		bls.b	.rawkey
		cmp	#$20,d6
		blo.b	.nextevent
		cmp	#$2a,d6
		bls.b	.rawkey
		cmp	#$30,d6
		blo.b	.nextevent
		cmp	#$3a,d6
		bls.b	.rawkey
		bra.b	.nextevent
.rawkey		move.b	d5,(a2,d4.w)
		addq	#1,d4
		and	#31,d4
		move	d4,_NewKeyBufPos(a5)
		tst	_IntMode(a5)
		bne.b	.nextevent
		bclr	#Msg_StartAudio,_SigMsg+3(a5)
		bset	#Msg_StartTimer,_SigMsg+3(a5)
		tst.b	_PlayMode(a5)
		beq.b	.skip
		bclr	#Msg_StartTimer,_SigMsg+3(a5)
		bset	#Msg_StartAudio,_SigMsg+3(a5)
.skip		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
.nextevent	move.l	(a4),d0
		move.l	d0,a4
		bne	.loop
.exit		move.l	(sp)+,d0
		movem.l	(sp)+,d1-d7/a2-a6
		rts

.signalbutton	bset	#Msg_MouseButton,_SigMsg+3(a5)
		move.l	_Process(a5),a1
		move.l	_Signal(a5),d1
		moveq	#0,d0
		bset	d1,d0
		CallSys Signal
		bra	.tstaudio

_AudMsgPort	rs.l	1
_AudIORequest	rs.l	1

OpenAudioDevice	CallSys CreateMsgPort
		move.l	d0,_AudMsgPort(a5)
		bne.b	.skip
		jmp	Exit
.skip		move.l	#DelAudMsgPort,_DelAudMsgPort(a5)
		move.l	d0,a0
		move.l	#ioa_SIZEOF,d0
		CallLib CreateIORequest
		move.l	d0,_AudIORequest(a5)
		bne.b	.skip2
		jmp	Exit
.skip2		move.l	#DelAudIORequest,_DelAudIORequest(a5)
AllocChannels	moveq	#0,d0
		moveq	#0,d1
		lea	AudName,a0
		move.l	_AudIORequest(a5),a1
		move.b	#ADALLOC_MAXPREC,LN_PRI(a1)
		move	#ADCMD_ALLOCATE,IO_COMMAND(a1)
		clr.b	IO_FLAGS(a1)
		clr	ioa_AllocKey(a1)
		move.l	#Channels,ioa_Data(a1)
		move.l	#1,ioa_Length(a1)
		CallSys OpenDevice
		tst.l	d0
		bne.b	AudioError
		move.l	#FreeChannels,_FreeChannels(a5)
		move.b	#$f,_AudioChannels(a5)
		rts

AudioError	move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#Audio_Txt,12(a1)
		move.l	#RetryCares_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		bne.b	AllocChannels
		move.b	#$f,_AudioChannels(a5)
		rts

FreeChannels	move.l	_AudIORequest(a5),a1
		tst.l	IO_DEVICE(a1)
		beq.b	.exit
		CallSys CloseDevice
.exit		clr.l	_FreeChannels(a5)
		clr.b	_AudioChannels(a5)
		rts

DelAudMsgPort	move.l	_AudMsgPort(a5),a0
		CallSys DeleteMsgPort
		rts

DelAudIORequest	move.l	_AudIORequest(a5),a0
		CallSys DeleteIORequest
		rts

AudName		dc.b	"audio.device",0
Channels	dc.b	$f

* Twins/PHA *****************************************************************
* Make AscII Table                                    Last Change: 92-10-24 *
*****************************************************************************

_AscIICmdTab	rs.b	4
_AscIIHexTab	rs.b	256*2

MakeAscIITab	lea	_AscIICmdTab(a5),a0
		move.b	#" ",(a0)+
		move.b	#$82,(a0)+
		move.b	#$81,(a0)+
		move.b	#$80,(a0)+
		moveq	#0,d0
.loop		bsr.b	ConvertHexToAscII
		addq.b	#1,d0
		bcc	.loop
		rts
ConvertHexToAscII
		move	d0,d1
		lsr	#4,d1
		and	#$f,d1
		add	#$30,d1
		cmp	#$3a,d1
		bcs.b	.ok1
		add	#7,d1
.ok1		move.b	d1,(a0)+
		move	d0,d1
		and	#$f,d1
		add	#$30,d1
		cmp	#$3a,d1
		bcs.b	.ok2
		add	#7,d1
.ok2		move.b	d1,(a0)+
		rts

* Twins/PHA *****************************************************************
* Create and free gadtools gadgets                    Last Change: 92-10-24 *
*****************************************************************************

TRUE		=	1
_GList1		rs.l	1
_GadNum1	rs.w	1
_GadList1	rs.l	1
_GList2		rs.l	1
_GadNum2	rs.w	1
_GadList2	rs.l	1
_GList3		rs.l	1
_GadNum3	rs.w	1
_GadList3	rs.l	1
_GList4		rs.l	1
_GadNum4	rs.w	1
_GadList4	rs.l	1
_GList5		rs.l	1
_GadNum5	rs.w	1
_GadList5	rs.l	1
_GList6		rs.l	1
_GadNum6	rs.w	1
_GadList6	rs.l	1
_GList7		rs.l	1
_GadNum7	rs.w	1
_GadList7	rs.l	1
_GList8		rs.l	1
_GadNum8	rs.w	1
_GadList8	rs.l	1
_GList9		rs.l	1
_GadNum9	rs.w	1
_GadList9	rs.l	1
_GList10	rs.l	1
_GadNum10	rs.w	1
_GadList10	rs.l	1
_GList11	rs.l	1
_GadNum11	rs.w	1
_GadList11	rs.l	1
_GList12	rs.l	1
_GadNum12	rs.w	1
_GadList12	rs.l	1
_GList13	rs.l	1
_GadNum13	rs.w	1
_GadList13	rs.l	1
_GList14	rs.l	1
_GadNum14	rs.w	1
_GadList14	rs.l	1
_GList15	rs.l	1
_GadNum15	rs.w	1
_GadList15	rs.l	1
_GList16	rs.l	1
_GadNum16	rs.w	1
_GadList16	rs.l	1
_GList17	rs.l	1
_GadNum17	rs.w	1
_GadList17	rs.l	1
_GList18	rs.l	1
_GadNum18	rs.w	1
_GadList18	rs.l	1
_GadContext	rs.l	1
_GadgetDefs	rs.b	gng_SIZEOF

_GadPtrs1		rs.b	0
_Ch1Gad			rs.l	1
_Ch2Gad			rs.l	1
_Ch3Gad			rs.l	1
_Ch4Gad			rs.l	1
_Ch5Gad			rs.l	1
_Ch6Gad			rs.l	1
_Ch7Gad			rs.l	1
_Ch8Gad			rs.l	1
_PlayTuneGad		rs.l	1
_PlayPartGad		rs.l	1
_StopGadget		rs.l	1
_MasterVolGad		rs.l	1
_BPMGad			rs.l	1
_TunesGad		rs.l	1
_TunesScrGad		rs.l	1
_TunesStrGad		rs.l	1
_Inst1Gad		rs.l	1
_Inst1ScrGad		rs.l	1
_Inst1StrGad		rs.l	1
_InfoGad		rs.l	1

_VUGad			rs.l	1
_PlayModeGad		rs.l	1
_OctaveGad1		rs.l	1
_PolyGad1		rs.l	1
_EditGad		rs.l	1
_EditModeGad		rs.l	1
_ScrollPartGad		rs.l	1
_FollowChannelGad	rs.l	1

_GadPtrs2		rs.b	0
_Inst2Gad		rs.l	1
_Inst2ScrGad		rs.l	1
_Inst2StrGad		rs.l	1
_SmplsGad		rs.l	1
_SmplsScrGad		rs.l	1
_SmplsStrGad		rs.l	1
_OctaveGad2		rs.l	1
_PolyGad2		rs.l	1
_TuningGad		rs.l	1
_VolumeGad		rs.l	1
_FineTuneGad		rs.l	1
_SemiToneGad		rs.l	1
_WaveLengthGad		rs.l	1
_TransposeGad		rs.l	1
_SlideSpeedGad		rs.l	1
_WsParaVisualGad	rs.l	1

_GadPtrs3		rs.b	0
_WsMxGad		rs.l	1
_WsEnvChkGad		rs.l	1
_WsVibChkGad		rs.l	1
_WsTreChkGad		rs.l	1
_WsArpChkGad		rs.l	1
_WsTraChkGad		rs.l	1
_WsPhaChkGad		rs.l	1
_WsMixChkGad		rs.l	1
_WsResChkGad		rs.l	1
_WsFilChkGad		rs.l	1
_WsLooChkGad		rs.l	1

_GadPtrs4		rs.b	0
_SustainToggleGad	rs.l	1
_AttackGad		rs.l	1
_DecayGad		rs.l	1
_SustainGad		rs.l	1
_ReleaseGad		rs.l	1
_AttackLenGad		rs.l	1
_DecayLenGad		rs.l	1
_SustainLenGad		rs.l	1
_ReleaseLenGad		rs.l	1

_GadPtrs5		rs.b	0
_VibSpeedGad		rs.l	1
_VibDepthGad		rs.l	1
_VibAttackGad		rs.l	1
_VibDelayGad		rs.l	1
_VibWaveGad		rs.l	1
_VibDirGad		rs.l	1

_GadPtrs6		rs.b	0
_TreSpeedGad		rs.l	1
_TreDepthGad		rs.l	1
_TreAttackGad		rs.l	1
_TreDelayGad		rs.l	1
_TreWaveGad		rs.l	1
_TreDirGad		rs.l	1

_GadPtrs7		rs.b	0
_ResAmpGad		rs.l	1
_ResStartGad		rs.l	1
_ResRepeatGad		rs.l	1
_ResRepEndGad		rs.l	1
_ResSpeedGad		rs.l	1
_ResDelayGad		rs.l	1
_ResTurnsGad		rs.l	1
_ResInitGad		rs.l	1
_ResStepGad		rs.l	1
_ResBoostGad		rs.l	1

_GadPtrs8		rs.b	0
_PhaStartGad		rs.l	1
_PhaRepeatGad		rs.l	1
_PhaRepEndGad		rs.l	1
_PhaSpeedGad		rs.l	1
_PhaDelayGad		rs.l	1
_PhaTurnsGad		rs.l	1
_PhaTypeGad		rs.l	1
_PhaInitGad		rs.l	1
_PhaStepGad		rs.l	1
_PhaFillGad		rs.l	1

_GadPtrs9		rs.b	0
_FilStartGad		rs.l	1
_FilRepeatGad		rs.l	1
_FilRepEndGad		rs.l	1
_FilSpeedGad		rs.l	1
_FilDelayGad		rs.l	1
_FilTurnsGad		rs.l	1
_FilTypeGad		rs.l	1
_FilInitGad		rs.l	1
_FilStepGad		rs.l	1
_FilBoostGad		rs.l	1

_GadPtrs10		rs.b	0
_MixStartGad		rs.l	1
_MixRepeatGad		rs.l	1
_MixRepEndGad		rs.l	1
_MixSpeedGad		rs.l	1
_MixDelayGad		rs.l	1
_MixTurnsGad		rs.l	1
_MixInitGad		rs.l	1
_MixStepGad		rs.l	1
_MixBuffGad		rs.l	1
_MixCntDirGad		rs.l	1
_MixSetWaveGad		rs.l	1
_MixClrWaveGad		rs.l	1
_MixWaveNumGad		rs.l	1
_MixBoostGad		rs.l	1

_GadPtrs11		rs.b	0
_TraSelListGad		rs.l	1

_GadPtrs12		rs.b	0
_TraStartGad		rs.l	1
_TraRepeatGad		rs.l	1
_TraRepEndGad		rs.l	1
_TraSpeedGad		rs.l	1
_TraDelayGad		rs.l	1
_TraTurnsGad		rs.l	1
_TraInitGad		rs.l	1
_TraStepGad		rs.l	1
_TraAddWaveGad		rs.l	1
_TraSetWaveGad		rs.l	1
_TraClrWaveGad		rs.l	1

_GadPtrs13		rs.b	0
_ArpEditGad		rs.l	1
_ArpEdModeGad		rs.l	1
_ArpModeGad		rs.l	1
_ArpZeroGad		rs.l	1
_ArpNoteGad		rs.l	1

_GadPtrs14		rs.b	0
_LooStartGad		rs.l	1
_LooRepeatGad		rs.l	1
_LooRepEndGad		rs.l	1
_LooLengthGad		rs.l	1
_LooLpStepGad		rs.l	1
_LooWaitGad		rs.l	1
_LooDelayGad		rs.l	1
_LooTurnsGad		rs.l	1
_LooInitGad		rs.l	1
_LooStepGad		rs.l	1
_LooStopGad		rs.l	1

_GadPtrs15		rs.b	0
_WsStartGad		rs.l	1
_WsLoopGad		rs.l	1
_WsEndGad		rs.l	1
_LoopGad		rs.l	1

_GadPtrs16		rs.b	0
_AnimFramesGad		rs.l	1
_MakeAnimGad		rs.l	1

_GadPtrs17		rs.b	0
_HelpPrevGad		rs.l	1
_HelpNextGad		rs.l	1

_GadPtrs18		rs.b	0
_HotHelpPrevGad		rs.l	1
_HotHelpNextGad		rs.l	1

CreateGadgets	lea	_StringEditHook(a5),a0
		move.l	a0,StringEditHook
		move.l	#StrEdHook,h_Entry(a0)

		move.l	_VisualInfo(a5),_GadgetDefs+gng_VisualInfo(a5)
		move.l	#Font8,_GadgetDefs+gng_TextAttr(a5)

		lea	_GadList1(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList1(a5),_GList1(a5)
		lea	_GadPtrs1(a5),a3
		lea	NewGadgetList1a,a4
		moveq	#0,d7
		bsr	CreateGadget
		lea	NewGadgetList1b,a4
		move.l	#Font7,_GadgetDefs+gng_TextAttr(a5)
		bsr	CreateGadget
		move	d7,_GadNum1(a5)
		move.l	#Font8,_GadgetDefs+gng_TextAttr(a5)

		move.l	#FreeGadgets,_FreeGadgets(a5)
		move.l	_PlayTuneGad(a5),a0
		or	#GACT_TOGGLESELECT,gg_Activation(a0)
		move.l	_PlayPartGad(a5),a0
		or	#GACT_TOGGLESELECT,gg_Activation(a0)

		lea	_GadList2(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList2(a5),_GList2(a5)
		lea	_GadPtrs2(a5),a3
		lea	NewGadgetList2,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum2(a5)
		lea	_GadList3(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList3(a5),_GList3(a5)
		lea	_GadPtrs3(a5),a3
		lea	NewGadgetList3,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum3(a5)
		lea	_GadList4(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList4(a5),_GList4(a5)
		lea	_GadPtrs4(a5),a3
		lea	NewGadgetList4,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum4(a5)
		lea	_GadList5(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList5(a5),_GList5(a5)
		lea	_GadPtrs5(a5),a3
		lea	NewGadgetList5,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum5(a5)
		lea	_GadList6(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList6(a5),_GList6(a5)
		lea	_GadPtrs6(a5),a3
		lea	NewGadgetList6,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum6(a5)
		lea	_GadList7(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList7(a5),_GList7(a5)
		lea	_GadPtrs7(a5),a3
		lea	NewGadgetList7,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum7(a5)
		lea	_GadList8(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList8(a5),_GList8(a5)
		lea	_GadPtrs8(a5),a3
		lea	NewGadgetList8,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum8(a5)
		lea	_GadList9(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList9(a5),_GList9(a5)
		lea	_GadPtrs9(a5),a3
		lea	NewGadgetList9,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum9(a5)
		lea	_GadList10(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList10(a5),_GList10(a5)
		lea	_GadPtrs10(a5),a3
		lea	NewGadgetList10,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum10(a5)
		lea	_GadList11(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList11(a5),_GList11(a5)
		lea	_GadPtrs11(a5),a3
		lea	NewGadgetList11,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum11(a5)
		move.l	_GadList11(a5),Window3Gadgets
		lea	_GadList12(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList12(a5),_GList12(a5)
		lea	_GadPtrs12(a5),a3
		lea	NewGadgetList12,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum12(a5)
		lea	_GadList13(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList13(a5),_GList13(a5)
		lea	_GadPtrs13(a5),a3
		lea	NewGadgetList13,a4
		moveq	#0,d7
		bsr	CreateGadget
		move.l	d0,a0
		move.l	#GadgetList3,gg_NextGadget(a0)
		add	#10,d7
		move	d7,_GadNum13(a5)
		lea	_GadList14(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList14(a5),_GList14(a5)
		lea	_GadPtrs14(a5),a3
		lea	NewGadgetList14,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum14(a5)
		lea	_GadList15(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList15(a5),_GList15(a5)
		lea	_GadPtrs15(a5),a3
		lea	NewGadgetList15,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum15(a5)
		lea	_GadList16(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList16(a5),_GList16(a5)
		lea	_GadPtrs16(a5),a3
		lea	NewGadgetList16,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum16(a5)
		move.l	_GadList16(a5),Window4Gadgets

		lea	_GadList17(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq	.exit
		move.l	_GadList17(a5),_GList17(a5)
		lea	_GadPtrs17(a5),a3
		lea	NewGadgetList17,a4
		moveq	#0,d7
		move.l	#Font7,_GadgetDefs+gng_TextAttr(a5)
		bsr	CreateGadget
		move	d7,_GadNum17(a5)
		move.l	_GadList17(a5),Window7Gadgets

		lea	_GadList18(a5),a0
		CallGadTools CreateContext
		move.l	d0,_GadContext(a5)
		beq.b	.exit
		move.l	_GadList18(a5),_GList18(a5)
		lea	_GadPtrs18(a5),a3
		lea	NewGadgetList18,a4
		moveq	#0,d7
		bsr	CreateGadget
		move	d7,_GadNum18(a5)
		move.l	_GadList18(a5),Window5Gadgets
		move.l	#Font8,_GadgetDefs+gng_TextAttr(a5)

		move.l	_GadToolsBase(a5),a0
		cmp	#39,LIB_VERSION(a0)
		bhs.b	.ok
		move.l	_TunesStrGad(a5),a0
		move	#GACT_IMMEDIATE,gg_Activation(a0)
		move.l	_Inst1StrGad(a5),a0
		move	#GACT_IMMEDIATE,gg_Activation(a0)
		move.l	_Inst2StrGad(a5),a0
		move	#GACT_IMMEDIATE,gg_Activation(a0)
		move.l	_SmplsStrGad(a5),a0
		move	#GACT_IMMEDIATE,gg_Activation(a0)
.ok		rts

.exit		jmp	Exit

AddGadgetLists	moveq	#-1,d0
		moveq	#-1,d1
		move.l	_Window1(a5),a0
		move.l	_GadList1(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		moveq	#-1,d0
		move.l	_GadList1(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		CallIntuition RefreshGList
		move.l	_Window1(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow

		moveq	#-1,d0
		moveq	#-1,d1
		move.l	_Window2(a5),a0
		move.l	_GadList2(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		moveq	#-1,d0
		moveq	#-1,d1
		move.l	_Window2(a5),a0
		move.l	_GadList3(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList3(a5)
		moveq	#-1,d0
		moveq	#-1,d1
		move.l	_Window2(a5),a0
		move.l	_GadList4(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList4(a5)
		moveq	#-1,d0
		moveq	#-1,d1
		move.l	_Window2(a5),a0
		move.l	_GadList15(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList15(a5)
		moveq	#-1,d0
		move.l	_GadList2(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		CallIntuition RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		rts

CreateGadget	move.l	(a4)+,_GadgetDefs+gng_LeftEdge(a5)
		bmi.b	.done
		move.l	(a4)+,_GadgetDefs+gng_Width(a5)
		move.l	(a4)+,_GadgetDefs+gng_GadgetText(a5)
		move.l	(a4)+,_GadgetDefs+gng_Flags(a5)
		move.l	(a4)+,_GadgetDefs+gng_UserData(a5)
		move.l	(a4)+,d0
		move.l	_GadContext(a5),a0
		lea	_GadgetDefs(a5),a1
		move.l	(a4)+,a2
		CallGadTools CreateGadgetA
		move.l	d0,_GadContext(a5)
		move.l	d0,(a3)+
		add	(a4)+,d7
		bra	CreateGadget
.done		tst.l	d0
		beq.b	.exit
		rts
.exit		jmp	Exit

FreeGadgets	move.l	_GList1(a5),a0
		CallGadTools FreeGadgets
		move.l	_GList2(a5),a0
		CallLib FreeGadgets
		move.l	_GList3(a5),a0
		CallLib FreeGadgets
		move.l	_GList4(a5),a0
		CallLib FreeGadgets
		move.l	_GList5(a5),a0
		CallLib FreeGadgets
		move.l	_GList6(a5),a0
		CallLib FreeGadgets
		move.l	_GList7(a5),a0
		CallLib FreeGadgets
		move.l	_GList8(a5),a0
		CallLib FreeGadgets
		move.l	_GList9(a5),a0
		CallLib FreeGadgets
		move.l	_GList10(a5),a0
		CallLib FreeGadgets
		move.l	_GList11(a5),a0
		CallLib FreeGadgets
		move.l	_GList12(a5),a0
		CallLib FreeGadgets
		move.l	_GList13(a5),a0
		CallLib FreeGadgets
		move.l	_GList14(a5),a0
		CallLib FreeGadgets
		move.l	_GList15(a5),a0
		CallLib FreeGadgets
		move.l	_GList16(a5),a0
		CallLib FreeGadgets
		move.l	_GList17(a5),a0
		CallLib FreeGadgets
		move.l	_GList18(a5),a0
		CallLib FreeGadgets
		move.l	_G6Lst1(a5),a0
		CallLib FreeGadgets
		move.l	_G8Lst1(a5),a0
		CallLib FreeGadgets
		rts

NewGadgetList1a	dc.w	61,14,26,11
		dc.l	0
		dc.l	0
		dc.l	Channel1
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1+1

		dc.w	117,14,26,11
		dc.l	0
		dc.l	0
		dc.l	Channel2
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	173,14,26,11
		dc.l	0
		dc.l	0
		dc.l	Channel3
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	229,14,26,11
		dc.l	0
		dc.l	0
		dc.l	Channel4
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	285,14,26,11
		dc.l	0
		dc.l	0
		dc.l	Channel5
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	341,14,26,11
		dc.l	0
		dc.l	0
		dc.l	Channel6
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	397,14,26,11
		dc.l	0
		dc.l	0
		dc.l	Channel7
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	453,14,26,11
		dc.l	0
		dc.l	0
		dc.l	Channel8
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	26,96,46,13
		dc.l	Tune_Txt
		dc.l	0
		dc.l	PlayTuneGad
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

		dc.w	72,96,46,13
		dc.l	Part_Txt
		dc.l	0
		dc.l	PlayPartGad
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

		dc.w	118,96,46,13
		dc.l	Stop_Txt
		dc.l	0
		dc.l	Stop
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

		dc.w	560,228,72,13
		dc.l	Vol_Txt
		dc.l	NG_HIGHLABEL
		dc.l	MasterVol
		dc.l	SLIDER_KIND
		dc.l	TagList7
		dc.w	2

		dc.w	466,188,40,11		BPM Box
		dc.l	0
		dc.l	0
		dc.l	0
		dc.l	NUMBER_KIND
		dc.l	TagList40
		dc.w	2

		dc.w	462,110,170,52
		dc.l	Tunes_Txt
		dc.l	NG_HIGHLABEL!PLACETEXT_ABOVE
		dc.l	TuneSelected
		dc.l	LISTVIEW_KIND
		dc.l	TagList5
		dc.w	1

		dc.w	462,162,170,9
		dc.l	0
		dc.l	0
		dc.l	TunesScrGad
		dc.l	SCROLLER_KIND
		dc.l	TagList38
		dc.w	4

		dc.w	462,171,170,14
		dc.l	0
		dc.l	0
		dc.l	TunesStrGad
		dc.l	STRING_KIND
		dc.l	TagList37
		dc.w	1

		dc.w	292,110,170,108
		dc.l	Instruments_Txt
		dc.l	NG_HIGHLABEL!PLACETEXT_ABOVE
		dc.l	InstSelected
		dc.l	LISTVIEW_KIND
		dc.l	TagList13
		dc.w	1

		dc.w	292,218,170,9
		dc.l	0
		dc.l	0
		dc.l	Inst1ScrGad
		dc.l	SCROLLER_KIND
		dc.l	TagList38
		dc.w	4

		dc.w	292,227,170,14
		dc.l	0
		dc.l	0
		dc.l	Inst1StrGad
		dc.l	STRING_KIND
		dc.l	TagList37
		dc.w	1

		dc.w	8,96,18,13
		dc.l	Info_Txt
		dc.l	0
		dc.l	OpenWindow6
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

EndOfList1a	dc.l	-1

NewGadgetList1b	dc.w	517,14,26,11
		dc.l	VU_Txt
		dc.l	NG_HIGHLABEL
		dc.l	VUButton
		dc.l	CHECKBOX_KIND
		dc.l	TagList2
		dc.w	1

		dc.w	554,28,78,11
		dc.l	PlayMode_Txt
		dc.l	NG_HIGHLABEL
		dc.l	PlayMode
		dc.l	CYCLE_KIND
		dc.l	TagList28
		dc.w	1

		dc.w	554,39,78,11
		dc.l	Octave_Txt
		dc.l	NG_HIGHLABEL
		dc.l	Octave1
		dc.l	CYCLE_KIND
		dc.l	TagList3
		dc.w	1

		dc.w	554,50,78,11
		dc.l	Keyboard_Txt
		dc.l	NG_HIGHLABEL
		dc.l	Poly1
		dc.l	CYCLE_KIND
		dc.l	TagList25
		dc.w	1

		dc.w	606,14,26,11
		dc.l	Edit_Txt
		dc.l	NG_HIGHLABEL
		dc.l	EditOnOff
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	554,61,78,11
		dc.l	EditMode_Txt
		dc.l	NG_HIGHLABEL
		dc.l	EditMode
		dc.l	CYCLE_KIND
		dc.l	TagList6a
		dc.w	1

		dc.w	554,72,78,11
		dc.l	Scroll_Txt
		dc.l	NG_HIGHLABEL
		dc.l	ScrollPartOnOff
		dc.l	CYCLE_KIND
		dc.l	TagList41
		dc.w	1

		dc.w	554,83,78,11
		dc.l	Follow_Txt
		dc.l	NG_HIGHLABEL
		dc.l	FollowChannelOnOff
		dc.l	CYCLE_KIND
		dc.l	TagList42
		dc.w	1

EndOfList1b	dc.l	-1

NewGadgetList2	dc.w	12,151,170,68
		dc.l	Instruments_Txt
		dc.l	NG_HIGHLABEL!PLACETEXT_ABOVE
		dc.l	InstSelected
		dc.l	LISTVIEW_KIND
		dc.l	TagList13
		dc.w	1

		dc.w	12,219,170,9
		dc.l	0
		dc.l	0
		dc.l	Inst2ScrGad
		dc.l	SCROLLER_KIND
		dc.l	TagList38
		dc.w	4

		dc.w	12,228,170,14
		dc.l	0
		dc.l	0
		dc.l	Inst2StrGad
		dc.l	STRING_KIND
		dc.l	TagList37
		dc.w	1

		dc.w	188,151,170,68
		dc.l	WaveSamples_Txt
		dc.l	NG_HIGHLABEL!PLACETEXT_ABOVE
		dc.l	WsSelected
		dc.l	LISTVIEW_KIND
		dc.l	TagList14
		dc.w	1+1

		dc.w	188,219,170,9
		dc.l	0
		dc.l	0
		dc.l	SmplsScrGad
		dc.l	SCROLLER_KIND
		dc.l	TagList38
		dc.w	4

		dc.w	188,228,170,14
		dc.l	0
		dc.l	0
		dc.l	SmplsStrGad
		dc.l	STRING_KIND
		dc.l	TagList37
		dc.w	1

		dc.w	122,26,85,12
		dc.l	Octave_Txt
		dc.l	NG_HIGHLABEL
		dc.l	Octave2
		dc.l	CYCLE_KIND
		dc.l	TagList3
		dc.w	1

		dc.w	122,38,85,12
		dc.l	Keyboard_Txt
		dc.l	NG_HIGHLABEL
		dc.l	Poly2
		dc.l	CYCLE_KIND
		dc.l	TagList25
		dc.w	1

		dc.w	122,14,85,12
		dc.l	TuningTone_Txt
		dc.l	NG_HIGHLABEL
		dc.l	TuningTone
		dc.l	CYCLE_KIND
		dc.l	TagList4
		dc.w	1

		dc.w	116,81,91,11
		dc.l	Vol_Txt
		dc.l	0
		dc.l	Volume
		dc.l	SLIDER_KIND
		dc.l	TagList7
		dc.w	2

		dc.w	116,92,91,11
		dc.l	FineTune_Txt
		dc.l	0
		dc.l	Finetune
		dc.l	SLIDER_KIND
		dc.l	TagList8
		dc.w	2

		dc.w	116,103,91,11
		dc.l	SemiTone_Txt
		dc.l	0
		dc.l	SemiTone
		dc.l	SLIDER_KIND
		dc.l	TagList24
		dc.w	2

		dc.w	116,70,52,11
		dc.l	WLength_Txt
		dc.l	0
		dc.l	WaveLength
		dc.l	CYCLE_KIND
		dc.l	TagList22
		dc.w	1

		dc.w	116,125,26,11
		dc.l	Transpose2_Txt
		dc.l	0
		dc.l	Transpose
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	116,114,91,11
		dc.l	SlideSpeed_Txt
		dc.l	0
		dc.l	SlideSpeed
		dc.l	SLIDER_KIND
		dc.l	TagList39
		dc.w	2

		dc.w	584,152,0,0
		dc.l	0
		dc.l	0
		dc.l	WsVsButtons
		dc.l	MX_KIND
		dc.l	TagList20
		dc.w	3

EndOfList2	dc.l	-1

NewGadgetList3	dc.w	306,27,0,0
		dc.l	0
		dc.l	0
		dc.l	WsParameters
		dc.l	MX_KIND
		dc.l	TagList10
		dc.w	11+1

		dc.w	332,26,26,11
		dc.l	0
		dc.l	0
		dc.l	Envelope
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,37,26,11
		dc.l	0
		dc.l	0
		dc.l	Vibrato
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,48,26,11
		dc.l	0
		dc.l	0
		dc.l	Tremolo
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,59,26,11
		dc.l	0
		dc.l	0
		dc.l	Arpeggio
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,70,26,11
		dc.l	0
		dc.l	0
		dc.l	Transform
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,81,26,11
		dc.l	0
		dc.l	0
		dc.l	Phase
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,92,26,11
		dc.l	0
		dc.l	0
		dc.l	Mix
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,103,26,11
		dc.l	0
		dc.l	0
		dc.l	Resonance
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,114,26,11
		dc.l	0
		dc.l	0
		dc.l	Filter
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	332,125,26,11
		dc.l	0
		dc.l	0
		dc.l	Loop
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

EndOfList3	dc.l	-1

NewGadgetList4	dc.w	455,26,172,12
		dc.l	0
		dc.l	0
		dc.l	SustainToggle
		dc.l	CYCLE_KIND
		dc.l	TagList9
		dc.w	1+1

		dc.w	455,38,172,11
		dc.l	AttVol_Txt
		dc.l	0
		dc.l	AttackVol
		dc.l	SCROLLER_KIND
		dc.l	TagList11
		dc.w	4

		dc.w	455,49,172,11
		dc.l	Decay_Txt
		dc.l	0
		dc.l	DecayVol
		dc.l	SCROLLER_KIND
		dc.l	TagList11
		dc.w	4

		dc.w	455,60,172,11
		dc.l	Sustain_Txt
		dc.l	0
		dc.l	SustainVol
		dc.l	SCROLLER_KIND
		dc.l	TagList11
		dc.w	4

		dc.w	455,71,172,11
		dc.l	Release_Txt
		dc.l	0
		dc.l	ReleaseVol
		dc.l	SCROLLER_KIND
		dc.l	TagList11
		dc.w	4

		dc.w	455,82,172,11
		dc.l	AttackLen_Txt
		dc.l	0
		dc.l	AttackLen
		dc.l	SCROLLER_KIND
		dc.l	TagList12
		dc.w	4

		dc.w	455,93,172,11
		dc.l	DecayLen_Txt
		dc.l	0
		dc.l	DecayLen
		dc.l	SCROLLER_KIND
		dc.l	TagList12
		dc.w	4

		dc.w	455,104,172,11
		dc.l	SustainLen_Txt
		dc.l	0
		dc.l	SustainLen
		dc.l	SCROLLER_KIND
		dc.l	TagList12
		dc.w	4

		dc.w	455,115,172,11
		dc.l	ReleaseLen_Txt
		dc.l	0
		dc.l	ReleaseLen
		dc.l	SCROLLER_KIND
		dc.l	TagList12
		dc.w	4

EndOfList4	dc.l	-1

NewGadgetList5	dc.w	455,26,172,11
		dc.l	Speed_Txt
		dc.l	0
		dc.l	VibSpeed
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4+1

		dc.w	455,37,172,11
		dc.l	Depth_Txt
		dc.l	0
		dc.l	VibDepth
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,48,172,11
		dc.l	Attack_Txt
		dc.l	0
		dc.l	VibAttack
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,59,172,11
		dc.l	Delay_Txt
		dc.l	0
		dc.l	VibDelay
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,70,172,12
		dc.l	WaveType_Txt
		dc.l	0
		dc.l	VibWave
		dc.l	CYCLE_KIND
		dc.l	TagList16
		dc.w	1

		dc.w	455,82,172,12
		dc.l	Direction_Txt
		dc.l	0
		dc.l	VibDirection
		dc.l	CYCLE_KIND
		dc.l	TagList34
		dc.w	1

EndOfList5	dc.l	-1

NewGadgetList6	dc.w	455,26,172,11
		dc.l	Speed_Txt
		dc.l	0
		dc.l	TreSpeed
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4+1

		dc.w	455,37,172,11
		dc.l	Depth_Txt
		dc.l	0
		dc.l	TreDepth
		dc.l	SCROLLER_KIND
		dc.l	TagList23
		dc.w	4

		dc.w	455,48,172,11
		dc.l	Attack_Txt
		dc.l	0
		dc.l	TreAttack
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,59,172,11
		dc.l	Delay_Txt
		dc.l	0
		dc.l	TreDelay
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,70,172,12
		dc.l	WaveType_Txt
		dc.l	0
		dc.l	TreWave
		dc.l	CYCLE_KIND
		dc.l	TagList16
		dc.w	1

		dc.w	455,82,172,12
		dc.l	Direction_Txt
		dc.l	0
		dc.l	TreDirection
		dc.l	CYCLE_KIND
		dc.l	TagList34
		dc.w	1

EndOfList6	dc.l	-1

NewGadgetList7	dc.w	455,26,172,11
		dc.l	Amp_Txt
		dc.l	0
		dc.l	ResAmp
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4+1

		dc.w	455,37,172,11
		dc.l	Start_Txt
		dc.l	0
		dc.l	ResStart
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,48,172,11
		dc.l	Repeat_Txt
		dc.l	0
		dc.l	ResRepeat
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,59,172,11
		dc.l	RepEnd_Txt
		dc.l	0
		dc.l	ResRepEnd
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,70,172,11
		dc.l	Speed_Txt
		dc.l	0
		dc.l	ResSpeed
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,81,172,11
		dc.l	Delay_Txt
		dc.l	0
		dc.l	ResDelay
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,92,172,11
		dc.l	0
		dc.l	0
		dc.l	ResTurns
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,104,26,11
		dc.l	Init_Txt
		dc.l	0
		dc.l	ResInit
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	528,104,26,11
		dc.l	Step_Txt
		dc.l	0
		dc.l	ResStep
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	455,116,26,11
		dc.l	Boost_Txt
		dc.l	0
		dc.l	ResBoost
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

EndOfList7	dc.l	-1

NewGadgetList8	dc.w	455,26,172,11
		dc.l	Start_Txt
		dc.l	0
		dc.l	PhaStart
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4+1

		dc.w	455,37,172,11
		dc.l	Repeat_Txt
		dc.l	0
		dc.l	PhaRepeat
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,48,172,11
		dc.l	RepEnd_Txt
		dc.l	0
		dc.l	PhaRepEnd
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,59,172,11
		dc.l	Speed_Txt
		dc.l	0
		dc.l	PhaSpeed
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,70,172,11
		dc.l	Delay_Txt
		dc.l	0
		dc.l	PhaDelay
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,81,172,11
		dc.l	0
		dc.l	0
		dc.l	PhaTurns
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,93,142,12
		dc.l	Type_Txt
		dc.l	0
		dc.l	PhaType
		dc.l	CYCLE_KIND
		dc.l	TagList32
		dc.w	1

		dc.w	455,106,26,11
		dc.l	Init_Txt
		dc.l	0
		dc.l	PhaInit
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	528,106,26,11
		dc.l	Step_Txt
		dc.l	0
		dc.l	PhaStep
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	601,106,26,11
		dc.l	Fill_Txt
		dc.l	0
		dc.l	PhaFill
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

EndOfList8	dc.l	-1

NewGadgetList9	dc.w	455,26,172,11
		dc.l	Start_Txt
		dc.l	0
		dc.l	FilStart
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4+1

		dc.w	455,37,172,11
		dc.l	Repeat_Txt
		dc.l	0
		dc.l	FilRepeat
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,48,172,11
		dc.l	RepEnd_Txt
		dc.l	0
		dc.l	FilRepEnd
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,59,172,11
		dc.l	Speed_Txt
		dc.l	0
		dc.l	FilSpeed
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,70,172,11
		dc.l	Delay_Txt
		dc.l	0
		dc.l	FilDelay
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,81,172,11
		dc.l	0
		dc.l	0
		dc.l	FilTurns
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,93,142,12
		dc.l	Type_Txt
		dc.l	0
		dc.l	FilType
		dc.l	CYCLE_KIND
		dc.l	TagList33
		dc.w	1

		dc.w	455,106,26,11
		dc.l	Init_Txt
		dc.l	0
		dc.l	FilInit
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	528,106,26,11
		dc.l	Step_Txt
		dc.l	0
		dc.l	FilStep
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	455,118,26,11
		dc.l	Boost_Txt
		dc.l	0
		dc.l	FilBoost
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

EndOfList9	dc.l	-1

NewGadgetList10	dc.w	455,26,172,11
		dc.l	Start_Txt
		dc.l	0
		dc.l	MixStart
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4+1

		dc.w	455,37,172,11
		dc.l	Repeat_Txt
		dc.l	0
		dc.l	MixRepeat
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,48,172,11
		dc.l	RepEnd_Txt
		dc.l	0
		dc.l	MixRepEnd
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,59,172,11
		dc.l	Speed_Txt
		dc.l	0
		dc.l	MixSpeed
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,70,172,11
		dc.l	Delay_Txt
		dc.l	0
		dc.l	MixDelay
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,81,172,11
		dc.l	0
		dc.l	0
		dc.l	MixTurns
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,93,26,11
		dc.l	Init_Txt
		dc.l	0
		dc.l	MixInit
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	528,93,26,11
		dc.l	Step_Txt
		dc.l	0
		dc.l	MixStep
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	601,93,26,11
		dc.l	Buff_Txt
		dc.l	0
		dc.l	MixBuff
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	455,105,99,12
		dc.l	Counter_Txt
		dc.l	0
		dc.l	MixCntDir
		dc.l	CYCLE_KIND
		dc.l	TagList29
		dc.w	1

		dc.w	554,105,37,12
		dc.l	Set_Txt
		dc.l	0
		dc.l	MixSetWave
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

		dc.w	591,105,36,12
		dc.l	Clr_Txt
		dc.l	0
		dc.l	MixClrWave
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

		dc.w	455,118,172,12
		dc.l	MixWave_Txt
		dc.l	0
		dc.l	0
		dc.l	TEXT_KIND
		dc.l	TagList31
		dc.w	1

		dc.w	455,131,26,11
		dc.l	Boost_Txt
		dc.l	0
		dc.l	MixBoost
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

EndOfList10	dc.l	-1

NewGadgetList11	dc.w	7,26,172,76
		dc.l	Waves_Txt
		dc.l	NG_HIGHLABEL!PLACETEXT_ABOVE
		dc.l	0
		dc.l	LISTVIEW_KIND
		dc.l	TagList26
		dc.w	1+1

EndOfList11	dc.l	-1

NewGadgetList12	dc.w	455,26,172,11
		dc.l	Start_Txt
		dc.l	0
		dc.l	TraStart
		dc.l	SCROLLER_KIND
		dc.l	TagList30
		dc.w	4+1

		dc.w	455,37,172,11
		dc.l	Repeat_Txt
		dc.l	0
		dc.l	TraRepeat
		dc.l	SCROLLER_KIND
		dc.l	TagList30
		dc.w	4

		dc.w	455,48,172,11
		dc.l	RepEnd_Txt
		dc.l	0
		dc.l	TraRepEnd
		dc.l	SCROLLER_KIND
		dc.l	TagList30
		dc.w	4

		dc.w	455,59,172,11
		dc.l	Speed_Txt
		dc.l	0
		dc.l	TraSpeed
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,70,172,11
		dc.l	Delay_Txt
		dc.l	0
		dc.l	TraDelay
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,81,172,11
		dc.l	0
		dc.l	0
		dc.l	TraTurns
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	455,93,26,11
		dc.l	Init_Txt
		dc.l	0
		dc.l	TraInit
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	528,93,26,11
		dc.l	Step_Txt
		dc.l	0
		dc.l	TraStep
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	554,93,37,11
		dc.l	Add_Txt
		dc.l	0
		dc.l	AddTraWave
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

		dc.w	591,93,36,11
		dc.l	Clr_Txt
		dc.l	0
		dc.l	ClrTraWave
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

EndOfList12	dc.l	-1

NewGadgetList13	dc.w	416,71,26,11
		dc.l	Edit_Txt
		dc.l	0
		dc.l	ArpEdOnOff
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1+1

		dc.w	416,82,78,12
		dc.l	Mode_Txt
		dc.l	0
		dc.l	ArpEdMode
		dc.l	CYCLE_KIND
		dc.l	TagList6b
		dc.w	1

		dc.w	367,94,127,12
		dc.l	0
		dc.l	0
		dc.l	TransFixNote
		dc.l	CYCLE_KIND
		dc.l	TagList17
		dc.w	1

		dc.w	367,113,127,12
		dc.l	SetZero_Txt
		dc.l	0
		dc.l	SetZeroNote
		dc.l	BUTTON_KIND
		dc.l	TagEnd
		dc.w	1

		dc.w	455,126,39,12
		dc.l	ZeroNote2_Txt
		dc.l	0
		dc.l	0
		dc.l	TEXT_KIND
		dc.l	TagList18
		dc.w	1

EndOfList13	dc.l	-1

NewGadgetList14	dc.w	479,26,148,11
		dc.l	WsStart_Txt
		dc.l	0
		dc.l	LooStart
		dc.l	SCROLLER_KIND
		dc.l	TagList35
		dc.w	4+1

		dc.w	479,37,148,11
		dc.l	WsRepeat_Txt
		dc.l	0
		dc.l	LooRepeat
		dc.l	SCROLLER_KIND
		dc.l	TagList35
		dc.w	4

		dc.w	479,48,148,11
		dc.l	WsRepEnd_Txt
		dc.l	0
		dc.l	LooRepEnd
		dc.l	SCROLLER_KIND
		dc.l	TagList35
		dc.w	4

		dc.w	479,59,148,11
		dc.l	LopLen_Txt
		dc.l	0
		dc.l	LooLength
		dc.l	SCROLLER_KIND
		dc.l	TagList35
		dc.w	4

		dc.w	479,70,148,11
		dc.l	LpStep_Txt
		dc.l	0
		dc.l	LooLpStep
		dc.l	SCROLLER_KIND
		dc.l	TagList35
		dc.w	4

		dc.w	479,81,148,11
		dc.l	Wait_Txt
		dc.l	0
		dc.l	LooWait
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	479,92,148,11
		dc.l	Delay_Txt
		dc.l	0
		dc.l	LooDelay
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	479,103,148,11
		dc.l	0
		dc.l	0
		dc.l	LooTurns
		dc.l	SCROLLER_KIND
		dc.l	TagList21
		dc.w	4

		dc.w	479,115,26,11
		dc.l	Init_Txt
		dc.l	0
		dc.l	LooInit
		dc.l	CHECKBOX_KIND
		dc.l	TagList1
		dc.w	1

		dc.w	552,115,26,11
		dc.l	Step_Txt
		dc.l	0
		dc.l	LooStep
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

		dc.w	479,127,26,11
		dc.l	Stop_Txt
		dc.l	0
		dc.l	LooStop
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

EndOfList14	dc.l	-1

NewGadgetList15	dc.w	471,185,156,11
		dc.l	WsStart_Txt
		dc.l	0
		dc.l	WsStart
		dc.l	SCROLLER_KIND
		dc.l	TagList35
		dc.w	4+1

		dc.w	471,196,156,11
		dc.l	WsLoop_Txt
		dc.l	0
		dc.l	WsLoop
		dc.l	SCROLLER_KIND
		dc.l	TagList35
		dc.w	4

		dc.w	471,207,156,11
		dc.l	WsEnd_Txt
		dc.l	0
		dc.l	WsEnd
		dc.l	SCROLLER_KIND
		dc.l	TagList35
		dc.w	4

		dc.w	601,229,26,11
		dc.l	Loop_Txt
		dc.l	0
		dc.l	WsLoopOnOff
		dc.l	CHECKBOX_KIND
		dc.l	TagList15
		dc.w	1

EndOfList15	dc.l	-1

NewGadgetList16	dc.w	120,13,156,11
		dc.l	Frames_Txt
		dc.l	0
		dc.l	AnimFrames
		dc.l	SCROLLER_KIND
		dc.l	TagList36
		dc.w	4+1

		dc.w	120,26,156,11
		dc.l	MakeInstAnim_Txt
		dc.l	0
		dc.l	MakeInstAnim
		dc.l	BUTTON_KIND
		dc.l	0
		dc.w	1

*		dc.w	120,37,156,11
*		dc.l	MakeTuneSmpl_Txt
*		dc.l	0
*		dc.l	MakeTuneSmpl
*		dc.l	BUTTON_KIND
*		dc.l	0
*		dc.w	1

EndOfList16	dc.l	-1

NewGadgetList17	dc.w	226,13,50,9
		dc.l	Prev_Txt
		dc.l	0
		dc.l	PrevPage
		dc.l	BUTTON_KIND
		dc.l	0
		dc.w	1+1

		dc.w	276,13,50,9
		dc.l	Next_Txt
		dc.l	0
		dc.l	NextPage
		dc.l	BUTTON_KIND
		dc.l	0
		dc.w	1

EndOfList17	dc.l	-1

NewGadgetList18	dc.w	535-122,13,50,9
		dc.l	Prev_Txt
		dc.l	0
		dc.l	PrevPage
		dc.l	BUTTON_KIND
		dc.l	0
		dc.w	1+1

		dc.w	535-72,13,50,9
		dc.l	Next_Txt
		dc.l	0
		dc.l	NextPage
		dc.l	BUTTON_KIND
		dc.l	0
		dc.w	1

EndOfList18	dc.l	-1

TagList1	dc.l	GTCB_Checked
GTCB_Check	dc.l	TRUE
		dc.l	TAG_DONE

TagList2	dc.l	GTCB_Checked
GTCB_VuCheck	dc.l	TRUE
		dc.l	TAG_DONE

TagList3	dc.l	GTCY_Labels
		dc.l	KeyboardPtr
		dc.l	GTCY_Active
		dc.l	2
		dc.l	TAG_DONE

TagList4	dc.l	GTCY_Labels
		dc.l	TuningOnOffPtr
		dc.l	GTCY_Active
		dc.l	0
		dc.l	TAG_DONE
TagList5a
TuneShowSel	dc.l	GTLV_MakeVisible
GTLV_TuneSel	dc.l	0

TagList5	dc.l	GTLV_Labels
TuneListPtr	dc.l	0
		dc.l	GTLV_ShowSelected
		dc.l	0
		dc.l	GTLV_Selected
GTLV_TuneNum	dc.l	0
		dc.l	TAG_DONE

TagList6a	dc.l	GTCY_Labels
		dc.l	VertColumnPtr
		dc.l	GTCY_Active
GTCY_EditMode	dc.l	0
		dc.l	TAG_DONE

TagList6b	dc.l	GTCY_Labels
		dc.l	VertColumnPtr
		dc.l	GTCY_Active
GTCY_ArpEdMode	dc.l	0
		dc.l	TAG_DONE

TagList7	dc.l	GTSL_Max
		dc.l	64
		dc.l	GTSL_Level
VolLevel	dc.l	64
		dc.l	GTSL_LevelFormat
		dc.l	Hex_Fmt
		dc.l	GTSL_MaxLevelLen
		dc.l	2
		dc.l	TAG_DONE

TagList8	dc.l	GTSL_Min
		dc.l	-31
		dc.l	GTSL_Max
		dc.l	31
		dc.l	GTSL_Level
FineLevel	dc.l	0
		dc.l	GTSL_MaxLevelLen
		dc.l	2
		dc.l	TAG_DONE

TagList9	dc.l	GTCY_Labels
		dc.l	SustainTogglePtr
		dc.l	GTCY_Active
GTCY_SusNum	dc.l	0
		dc.l	TAG_DONE

TagList10	dc.l	GTMX_Labels
		dc.l	InstFxButtPtr
		dc.l	GTMX_Active
		dc.l	0
		dc.l	GTMX_Spacing
		dc.l	3
		dc.l	TAG_DONE

TagList11	dc.l	GTSC_Total
		dc.l	64+2
		dc.l	GTSC_Arrows
		dc.l	15
		dc.l	TAG_DONE

TagList12	dc.l	GTSC_Total
		dc.l	254+2
		dc.l	GTSC_Arrows
		dc.l	15
		dc.l	TAG_DONE
TagList13a
InstShowSel	dc.l	GTLV_MakeVisible
GTLV_InstSel	dc.l	0

TagList13	dc.l	GTLV_Labels
InstListPtr	dc.l	0
		dc.l	GTLV_ShowSelected
		dc.l	0
		dc.l	GTLV_Selected
GTLV_InstNum	dc.l	0
		dc.l	TAG_DONE

TagList14	dc.l	GTLV_Labels
SmplListPtr	dc.l	0
		dc.l	GTLV_ShowSelected
		dc.l	0
SmplShowSel	dc.l	GTLV_MakeVisible
GTLV_SmplSel	dc.l	0
		dc.l	GTLV_Selected
GTLV_SmplNum	dc.l	0
		dc.l	TAG_DONE

TagList15	dc.l	GTCB_Checked
		dc.l	0
		dc.l	TAG_DONE

TagList16	dc.l	GTCY_Labels
		dc.l	WaveTypePtr
		dc.l	GTCY_Active
GTCY_Wave	dc.l	0
		dc.l	TAG_DONE

TagList17	dc.l	GTCY_Labels
		dc.l	ArpModePtr
		dc.l	TAG_DONE

TagList18	dc.l	GTTX_Border
		dc.l	TRUE
		dc.l	GTTX_Text
		dc.l	ZeroNote_Txt
		dc.l	TAG_DONE

TagList19	dc.l	GTSC_Top
GTSC_Num	dc.l	0
		dc.l	TAG_DONE

TagList20	dc.l	GTMX_Labels
		dc.l	WsParaVisualPtr
		dc.l	GTMX_Active
		dc.l	0
		dc.l	GTMX_Spacing
		dc.l	3
		dc.l	TAG_DONE

TagList21	dc.l	GTSC_Total
		dc.l	255+2
		dc.l	GTSC_Arrows
		dc.l	15
		dc.l	TAG_DONE

TagList22	dc.l	GTCY_Labels
		dc.l	LengthPtr
		dc.l	GTCY_Active
GTCY_Len	dc.l	0
		dc.l	GA_Disabled
GTCY_LenOff	dc.l	TRUE
		dc.l	TAG_DONE

TagList23	dc.l	GTSC_Total
		dc.l	32+2
		dc.l	GTSC_Arrows
		dc.l	15
		dc.l	TAG_DONE

TagList24	dc.l	GTSL_Min
		dc.l	-11
		dc.l	GTSL_Max
		dc.l	11
		dc.l	GTSL_Level
SemiLevel	dc.l	0
		dc.l	GTSL_MaxLevelLen
		dc.l	2
		dc.l	TAG_DONE

TagList25	dc.l	GTCY_Labels
		dc.l	PolyOnOffPtr
		dc.l	GTCY_Active
		dc.l	0
		dc.l	TAG_DONE

TagList26	dc.l	GTLV_Labels
TraSelListPtr	dc.l	0
		dc.l	TAG_DONE

TagList27	dc.l	GTCY_Labels
		dc.l	DirectionPtr
		dc.l	GTCY_Active
GTCY_Dir	dc.l	0
		dc.l	TAG_DONE

TagList28	dc.l	GTCY_Labels
		dc.l	PlayModePtr
		dc.l	GTCY_Active
		dc.l	0
		dc.l	TAG_DONE

TagList29	dc.l	GTCY_Labels
		dc.l	CntWayPtr
		dc.l	GTCY_Active
GTCY_Way	dc.l	0
		dc.l	TAG_DONE

TagList30	dc.l	GTSC_Total
TraNumRange	dc.l	256+2
		dc.l	GTSC_Arrows
		dc.l	15
		dc.l	TAG_DONE

TagList31	dc.l	GTTX_Border
		dc.l	TRUE
		dc.l	GTTX_Justification
		dc.l	GTJ_CENTER
		dc.l	GTTX_Text
GTTX_Ptr	dc.l	0
		dc.l	TAG_DONE

TagList32	dc.l	GTCY_Labels
		dc.l	PhaTypePtr
		dc.l	GTCY_Active
GTCY_PhaType	dc.l	0
		dc.l	TAG_DONE

TagList33	dc.l	GTCY_Labels
		dc.l	FilTypePtr
		dc.l	GTCY_Active
GTCY_FilType	dc.l	0
		dc.l	TAG_DONE

TagList34	dc.l	GTCY_Labels
		dc.l	DirPtr
		dc.l	GTCY_Active
GTCY_DownUp	dc.l	0
		dc.l	TAG_DONE

TagList35	dc.l	GTSC_Total
WsRange		dc.l	0+2
TagList35a	dc.l	GTSC_Top
GTSC_Ws		dc.l	0
		dc.l	GTSC_Arrows
		dc.l	15
		dc.l	TAG_DONE

TagList36	dc.l	GTSC_Total
		dc.l	511+2
		dc.l	GTSC_Arrows
		dc.l	15
		dc.l	TAG_DONE

TagList37	dc.l	GTST_MaxChars
		dc.l	30
		dc.l	GTST_EditHook
StringEditHook	dc.l	0
		dc.l	GTST_String
StringPtr	dc.l	0
		dc.l	GA_Disabled
StrGadOff	dc.l	0
		dc.l	GA_Immediate
		dc.l	TRUE
		dc.l	TAG_DONE

TagList38	dc.l	GTSC_Top
GTSC_ScrPos	dc.l	0
		dc.l	GTSC_Total
		dc.l	30
		dc.l	GTSC_Visible
		dc.l	15
		dc.l	GTSC_Arrows
		dc.l	16
		dc.l	TAG_DONE

TagList39	dc.l	GTSL_Max
		dc.l	255
		dc.l	GTSL_Level
SlideLevel	dc.l	0
		dc.l	GTSL_MaxLevelLen
		dc.l	2
		dc.l	TAG_DONE

TagList40	dc.l	GTNM_Border
		dc.l	TRUE
		dc.l	GTNM_Justification
		dc.l	GTJ_CENTER
		dc.l	GTNM_Number
GTNM_Num	dc.l	125
		dc.l	TAG_DONE

TagList41	dc.l	GTCY_Labels
		dc.l	ScrollPartPtr
		dc.l	GTCY_Active
GTCY_ScrPart	dc.l	0
		dc.l	TAG_DONE

TagList42	dc.l	GTCY_Labels
		dc.l	FollowChannelPtr
		dc.l	GTCY_Active
GTCY_FollowChn	dc.l	0
		dc.l	TAG_DONE

InstFxButtPtr	dc.l	Envelope_Txt
		dc.l	Vibrato_Txt
		dc.l	Tremolo_Txt
		dc.l	Arpeggio_Txt
		dc.l	Transform_Txt
		dc.l	Phase_Txt
		dc.l	Mix_Txt
		dc.l	Resonance_Txt
		dc.l	Filter_Txt
		dc.l	PlayLoop_Txt
		dc.l	0

WaveTypePtr	dc.l	Sine_Txt
		dc.l	RampDown_Txt
		dc.l	SawTooth_Txt
		dc.l	Square_Txt
		dc.l	0

CntWayPtr	dc.l	TwoWay_Txt
		dc.l	OneWay_Txt
		dc.l	0

PlayModePtr	dc.l	P4Ch_Txt
		dc.l	P8Ch_Txt
		dc.l	0

KeyboardPtr	dc.l	Oct12_Txt
		dc.l	Oct23_Txt
		dc.l	Oct34_Txt
		dc.l	Oct45_Txt
		dc.l	0

PhaTypePtr	dc.l	Old_Txt
		dc.l	High_Txt
		dc.l	Med_Txt
		dc.l	Low_Txt
		dc.l	0

FilTypePtr	dc.l	Normal_Txt
		dc.l	Resonance_Txt
		dc.l	0

PolyOnOffPtr	dc.l	Mono_Txt
		dc.l	Poly_Txt
		dc.l	0

TuningOnOffPtr	dc.l	Off_Txt
		dc.l	On_Txt
		dc.l	0

VertColumnPtr	dc.l	Vert_Txt
		dc.l	Horiz_Txt
		dc.l	Column_Txt
		dc.l	0

ScrollPartPtr	dc.l	Off_Txt
		dc.l	Part_Txt
		dc.l	Seq_Txt
		dc.l	PartSeq_Txt
		dc.l	0

FollowChannelPtr
		dc.l	Off_Txt
		dc.l	Channel_Txt
		dc.l	0

SustainTogglePtr
		dc.l	SustainNorm_Txt
		dc.l	SustainHold_Txt
		dc.l	0

ArpModePtr	dc.l	Transpose_Txt
		dc.l	FixNote_Txt
		dc.l	0

DirectionPtr	dc.l	Forward_Txt
		dc.l	Backward_Txt
		dc.l	0

DirPtr		dc.l	Downward_Txt
		dc.l	Upward_Txt
		dc.l	0

WsParaVisualPtr	dc.l	WsPara_Txt
		dc.l	Visual_Txt
		dc.l	0

LengthPtr	dc.l	L16_Txt
		dc.l	L32_Txt
		dc.l	L64_Txt
		dc.l	L128_Txt
		dc.l	L256_Txt
		dc.l	0

L16_Txt		dc.b	"10",0
L32_Txt		dc.b	"20",0
L64_Txt		dc.b	"40",0
L128_Txt	dc.b	"80",0
L256_Txt	dc.b	"100",0
P4Ch_Txt	dc.b	"4Ch",0
P8Ch_Txt	dc.b	"8Ch",0
ZeroNote_Txt	dc.b	"C-4",0
SetZero_Txt	dc.b	"Set "
ZeroNote2_Txt	dc.b	"Zero Note",0
Part_Txt	dc.b	"Part",0
Seq_Txt		dc.b	"Seq",0
PartSeq_Txt	dc.b	"Seq&Prt",0
Channel_Txt	dc.b	"Channel",0
Info_Txt	dc.b	"?",0
Tunes_Txt	dc.b	"Tunes",0
Instruments_Txt	dc.b	"Instruments",0
Tempo_Txt	dc.b	"Tempo",0
Vol_Txt		dc.b	"Volume:   ",0
Spd_Txt		dc.b	"Speed",0
Grv_Txt		dc.b	"Groove",0
Fill_Txt	dc.b	"Fill",0
Type_Txt	dc.b	"Type",0
Init_Txt	dc.b	"Init",0
Step_Txt	dc.b	"Step",0
Boost_Txt	dc.b	"Boost",0
OneWay_Txt	dc.b	"One-Way",0
TwoWay_Txt	dc.b	"Two-Way",0
Counter_Txt	dc.b	"Counter",0
SetWave_Txt	dc.b	"Set Wave",0
Set_Txt		dc.b	"Set",0
MixWave_Txt	dc.b	"Mix Wave",0
WaveType_Txt	dc.b	"Wave Type",0
Direction_Txt	dc.b	"Direction",0
Sine_Txt	dc.b	"Sine",0
RampDown_Txt	dc.b	"RampDown",0
Square_Txt	dc.b	"Square",0
SawTooth_Txt	dc.b	"SawTooth",0
WLength_Txt	dc.b	"Wave Length",0
Stop_Txt	dc.b	"Stop",0
SetJump_Txt	dc.b	"Set Jump",0
SetEnd_Txt	dc.b	"Set End",0
PlayMode_Txt	dc.b	"PlayMode",0
EditMode_Txt	dc.b	"EditMode",0
Scroll_Txt	dc.b	"Scroll",0
Follow_Txt	dc.b	"Follow",0
Off_Txt		dc.b	"Off",0
On_Txt		dc.b	"On",0
Poly_Txt	dc.b	"Poly",0
Mono_Txt	dc.b	"Mono",0
EditOptions_Txt	dc.b	"Edit Options",0
PackSamples_Txt	dc.b	"Pack WaveSamples",0
PlayPos_Txt	dc.b	"PlayPosition",0
True_Txt	dc.b	"True",0
Fast_Txt	dc.b	"Fast",0
Keyboard_Txt	dc.b	"Keyboard",0
Octave_Txt	dc.b	"Octave",0
Oct12_Txt	dc.b	"1-2",0
Oct23_Txt	dc.b	"2-3",0
Oct34_Txt	dc.b	"3-4",0
Oct45_Txt	dc.b	"4-5",0
Low_Txt		dc.b	"Low",0
Med_Txt		dc.b	"Med",0
High_Txt	dc.b	"High",0
Old_Txt		dc.b	"Old",0
Add_Txt		dc.b	"Add",0
Clr_Txt		dc.b	"Clr",0
Buff_Txt	dc.b	"Buff",0
Remove_Txt	dc.b	"Remove",0
Tune_Txt	dc.b	"Tune",0
Inst_Txt	dc.b	"Instrument",0
Insts_Txt	dc.b	"Instruments",0
WaveSample_Txt	dc.b	"Wavesample",0
WaveSamples_Txt	dc.b	"Wavesamples",0
Vert_Txt	dc.b	"Vert.",0
Horiz_Txt	dc.b	"Horiz.",0
Column_Txt	dc.b	"Column",0
FixNote_Txt	dc.b	"FixNote",0
FineTune_Txt	dc.b	"Finetune:   ",0
SemiTone_Txt	dc.b	"Semitone:   ",0
SlideSpeed_Txt	dc.b	"Glide:   ",0
Transpose_Txt	dc.b	"Transpose",0
Transpose2_Txt	dc.b	"Transposable",0
TuningTone_Txt	dc.b	"Tuningtone",0
Envelope_Txt	dc.b	"Envelope",0
Vibrato_Txt	dc.b	"Vibrato",0
Tremolo_Txt	dc.b	"Tremolo",0
Arpeggio_Txt	dc.b	"Arpeggio",0
Transform_Txt	dc.b	"Transform",0
Phase_Txt	dc.b	"Phase",0
Mix_Txt		dc.b	"Mix",0
Resonance_Txt	dc.b	"Resonance",0
Filter_Txt	dc.b	"Filter",0
PlayLoop_Txt	dc.b	"PlayLoop",0
SustainHold_Txt	dc.b	"Hold Sustain",0
SustainNorm_Txt	dc.b	"Normal Sustain",0
Forward_Txt	dc.b	"Forward",0
Backward_Txt	dc.b	"Backward",0
Downward_Txt	dc.b	"Downward",0
Upward_Txt	dc.b	"Upward",0
Normal_Txt	dc.b	"Normal",0
AttVol_Txt	dc.b	"A Vol:   ",0
Decay_Txt	dc.b	"D Vol:   ",0
Sustain_Txt	dc.b	"S Vol:   ",0
Release_Txt	dc.b	"R Vol:   ",0
AttackLen_Txt	dc.b	"A Len:   ",0
DecayLen_Txt	dc.b	"D Len:   ",0
SustainLen_Txt	dc.b	"S Len:   ",0
ReleaseLen_Txt	dc.b	"R Len:   ",0
Amp_Txt		dc.b	"Amp:   ",0
Start_Txt	dc.b	"Start:   ",0
Repeat_Txt	dc.b	"Repeat:   ",0
RepEnd_Txt	dc.b	"RepEnd:   ",0
Speed_Txt	dc.b	"Speed:   ",0
Wait_Txt	dc.b	"Wait:   ",0
Delay_Txt	dc.b	"Delay:   ",0
Turns_Txt	dc.b	"Turns:   ",0
Depth_Txt	dc.b	"Depth:   ",0
Attack_Txt	dc.b	"Attack:   ",0
Frames_Txt	dc.b	"Frames:    ",0
Hex_Fmt		dc.b	"%02lx",0
Prev_Txt	dc.b	"Prev",0
Next_Txt	dc.b	"Next",0
		even

* Twins/PHA *****************************************************************
* Print Itext                                         Last Change: 92-10-24 *
*****************************************************************************

PrintIText1	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort1(a5),a0
		lea	ITextList1,a1
		CallIntuition PrintIText
		rts

PrintIText2	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList2,a1
		CallIntuition PrintIText

PrintIText3	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList3,a1
		CallIntuition PrintIText
		rts

PrintIText4	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList4,a1
		CallIntuition PrintIText
		rts

PrintIText5	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList5,a1
		CallIntuition PrintIText
		rts

PrintIText6	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList6,a1
		CallIntuition PrintIText
		rts

PrintIText7	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList7,a1
		CallIntuition PrintIText
		rts

PrintIText8	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList8,a1
		CallIntuition PrintIText
		rts

PrintIText9	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList9,a1
		CallIntuition PrintIText
		rts

PrintIText10	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList10,a1
		CallIntuition PrintIText
		rts

PrintIText11	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList11,a1
		CallIntuition PrintIText
		rts

PrintIText12	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList12,a1
		CallIntuition PrintIText
		rts

PrintIText13	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList13,a1
		CallIntuition PrintIText
		rts

PrintIText14	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList14,a1
		CallIntuition PrintIText
		rts

PrintIText15	moveq	#0,d0
		moveq	#0,d1
		move.l	_RastPort2(a5),a0
		lea	ITextList15,a1
		CallIntuition PrintIText
		rts

ITextList1
.part		dc.b	2,0,RP_JAM2,0
		dc.w	172,99
		dc.l	Font8
		dc.l	Part_Txt
		dc.l	.tempo

.tempo		dc.b	2,0,RP_JAM2,0
		dc.w	512,190
		dc.l	Font8
		dc.l	Tempo_Txt
		dc.l	.speed

.speed		dc.b	2,0,RP_JAM2,0
		dc.w	512,203
		dc.l	Font8
		dc.l	Spd_Txt
		dc.l	.groove

.groove		dc.b	2,0,RP_JAM2,0
		dc.w	504,216
		dc.l	Font8
		dc.l	Grv_Txt
		dc.l	0

ITextList2	dc.b	2,0,RP_JAM2,0
		dc.w	238,14
		dc.l	Font8
		dc.l	InstFx_Txt
		dc.l	.instpar

.instpar	dc.b	2,0,RP_JAM2,0
		dc.w	23,58
		dc.l	Font8
		dc.l	InstPar_Txt
		dc.l	0

ITextList3	dc.b	2,0,RP_JAM2,0
		dc.w	469,14
		dc.l	Font8
		dc.l	EnvGen_Txt
		dc.l	0

ITextList4	dc.b	2,0,RP_JAM2,0
		dc.w	469,14
		dc.l	Font8
		dc.l	VibPar_Txt
		dc.l	0

ITextList5	dc.b	2,0,RP_JAM2,0
		dc.w	469,14
		dc.l	Font8
		dc.l	TrePar_Txt
		dc.l	0

ITextList6	dc.b	1,0,RP_JAM2,0
		dc.w	375,220
		dc.l	Font8
		dc.l	WsLoop_Txt
		dc.l	.next1

.next1		dc.b	1,0,RP_JAM2,0
		dc.w	391,231
		dc.l	Font8
		dc.l	Ws_Txt
		dc.l	.next2

.next2		dc.b	1,0,RP_JAM2,0
		dc.w	471,220
		dc.l	Font8
		dc.l	Length_Txt
		dc.l	.next3

.next3		dc.b	1,0,RP_JAM2,0
		dc.w	471,231
		dc.l	Font8
		dc.l	Length_Txt
		dc.l	0

ITextList7	dc.b	2,0,RP_JAM2,0
		dc.w	461,14
		dc.l	Font8
		dc.l	ResPar_Txt
		dc.l	0

ITextList8	dc.b	2,0,RP_JAM2,0
		dc.w	477,14
		dc.l	Font8
		dc.l	PhaPar_Txt
		dc.l	0

ITextList9	dc.b	2,0,RP_JAM2,0
		dc.w	473,14
		dc.l	Font8
		dc.l	FilPar_Txt
		dc.l	0

ITextList10	dc.b	2,0,RP_JAM2,0
		dc.w	485,14
		dc.l	Font8
		dc.l	MixPar_Txt
		dc.l	0

ITextList11	dc.b	2,0,RP_JAM2,0
		dc.w	478,14
		dc.l	Font8
		dc.l	LoopPar_Txt
		dc.l	0

ITextList12	dc.b	2,0,RP_JAM2,0
		dc.w	461,14
		dc.l	Font8
		dc.l	TraPar_Txt
		dc.l	.next1

.next1		dc.b	2,0,RP_JAM2,0
		dc.w	391,107
		dc.l	Font8
		dc.l	Waves_Txt
		dc.l	.next2

.next2		dc.b	1,0,RP_JAM2,0
		dc.w	439,107
		dc.l	Font8
		dc.l	Ch1_Txt
		dc.l	.next3

.next3		dc.b	1,0,RP_JAM2,0
		dc.w	439,115
		dc.l	Font8
		dc.l	Ch2_Txt
		dc.l	.next4

.next4		dc.b	1,0,RP_JAM2,0
		dc.w	439,123
		dc.l	Font8
		dc.l	Ch3_Txt
		dc.l	.next5

.next5		dc.b	1,0,RP_JAM2,0
		dc.w	439,131
		dc.l	Font8
		dc.l	Ch4_Txt
		dc.l	.next6

.next6		dc.b	1,0,RP_JAM2,0
		dc.w	439,139
		dc.l	Font8
		dc.l	Ch5_Txt
		dc.l	0

ITextList13	dc.b	2,0,RP_JAM2,0
		dc.w	502,14
		dc.l	Font8
		dc.l	ArpEd_Txt
		dc.l	.next1

.next1		dc.b	1,0,RP_JAM2,0
		dc.w	377,29
		dc.l	Font8
		dc.l	Table_Txt
		dc.l	.next2

.next2		dc.b	1,0,RP_JAM2,0
		dc.w	377,42
		dc.l	Font8
		dc.l	Spd_Txt
		dc.l	.next3

.next3		dc.b	1,0,RP_JAM2,0
		dc.w	369,55
		dc.l	Font8
		dc.l	Grv_Txt
		dc.l	0

ITextList14	dc.b	1,0,RP_JAM2,0
Coords14	dc.w	0,0
		dc.l	Font8
		dc.l	Turns_Txt
		dc.l	0

ITextList15	dc.b	1,0,RP_JAM2,0
Coords15	dc.w	0,0
		dc.l	Font8
		dc.l	Speed_Txt
		dc.l	0

Ch1_Txt		dc.b	"1",0
Ch2_Txt		dc.b	"2",0
Ch3_Txt		dc.b	"3",0
Ch4_Txt		dc.b	"4",0
Ch5_Txt		dc.b	"5",0
Ch6_Txt		dc.b	"6",0
Ch7_Txt		dc.b	"7",0
Ch8_Txt		dc.b	"8",0
Ws_Txt		dc.b	"Ws:",0
InstFx_Txt	dc.b	"Instrument F/X",0
InstPar_Txt	dc.b	"Instrument Parameters",0
Visual_Txt	dc.b	"Waveform F/X Visualizer",0
WsPara_Txt	dc.b	"Wavesample Parameters",0
WsStart_Txt	dc.b	"Start:      ",0
WsLoop_Txt	dc.b	"Loop:      ",0
WsEnd_Txt	dc.b	"End:      ",0
WsRepeat_Txt	dc.b	"Repeat:      ",0
WsRepEnd_Txt	dc.b	"RepEnd:      ",0
LpStep_Txt	dc.b	"LpStep:      ",0
LopLen_Txt	dc.b	"LopLen:      ",0
Loop_Txt	dc.b	"Loop",0
Length_Txt	dc.b	"Length",0
Table_Txt	dc.b	"Table",0
Waves_Txt	dc.b	"Waves",0
EnvGen_Txt	dc.b	"Envelope Generator",0
VibPar_Txt	dc.b	"Vibrato Parameters",0
TrePar_Txt	dc.b	"Tremolo Parameters",0
ArpEd_Txt	dc.b	"Arpeggio Editor",0
TraPar_Txt	dc.b	"Transform Parameters",0
PhaPar_Txt	dc.b	"Phase Parameters",0
MixPar_Txt	dc.b	"Mix Parameters",0
FilPar_Txt	dc.b	"Filter Parameters",0
LoopPar_Txt	dc.b	"PlayLoop Parameters",0
ResPar_Txt	dc.b	"Resonance Parameters",0
		even

* Twins/PHA *****************************************************************
* Draw lines                                          Last Change: 95-07-16 *
*****************************************************************************

DrawLines	move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	NormalDrawMode1

		lea	ChannelLinesList,a3
		bsr.b	.drawlines
		rts

.drawlines	move	(a3)+,d0			Xcoord
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Move
		move	(a3)+,d0			Xcoord
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Draw
		tst	(a3)
		bpl.b	.drawlines
		rts

ChannelLinesList	dc.w	031,44,031,92
			dc.w	087,44,087,92
			dc.w	143,44,143,92
			dc.w	199,44,199,92
			dc.w	255,44,255,92
			dc.w	311,44,311,92
			dc.w	367,44,367,92
			dc.w	423,44,423,92
			dc.w	479,44,479,92
			dc.b	-1				Ends list

* Twins/PHA *****************************************************************
* Draw boxes                                          Last Change: 92-10-24 *
*****************************************************************************

DrawArpEdBoxes	move.l	#BBFT_BUTTON,GtFt
		move.l	_VisualInfo(a5),GtViPtr
		move.l	_RastPort2(a5),a0
		lea	BoxTagList,a1
		move	#496,d0
		move	#26,d1
		move	#131,d2
		move	#99,d3
		CallGadTools DrawBevelBoxA
		move.l	#BBFT_RIDGE,GtFt
		lea	ArpEdBoxCoords,a4
		moveq	#2,d7
.drawbevelbox	move	(a4)+,d0
		move	(a4)+,d1
		move	(a4)+,d2
		move	(a4)+,d3
		move.l	_RastPort2(a5),a0
		lea	BoxTagList,a1
		CallGadTools DrawBevelBoxA
		dbf	d7,.drawbevelbox
		rts

DrawTraNumBox	move.l	#BBFT_BUTTON,GtFt
		move.l	_VisualInfo(a5),GtViPtr
		move.l	_RastPort2(a5),a0
		lea	BoxTagList,a1
		move	#455,d0
		move	#105,d1
		move	#172,d2
		move	#44,d3
		CallGadTools DrawBevelBoxA
		rts

DrawBoxes	move.l	#BBFT_BUTTON,GtFt
		move.l	_VisualInfo(a5),GtViPtr
		lea	BoxCoords,a4
		moveq	#2-1,d7
.drawbevelbox	move	(a4)+,d0
		move	(a4)+,d1
		move	(a4)+,d2
		move	(a4)+,d3
		move.l	_RastPort1(a5),a0
		lea	BoxTagList,a1
		CallGadTools DrawBevelBoxA
		dbf	d7,.drawbevelbox

DrawReBoxes	move.l	#BBFT_BUTTON,GtFt
		move.l	_VisualInfo(a5),GtViPtr
		lea	ReBoxCoords,a4
		moveq	#1-1,d7
.drawbevelbox	move	(a4)+,d0
		move	(a4)+,d1
		move	(a4)+,d2
		move	(a4)+,d3
		move.l	_RastPort1(a5),a0
		lea	ReBoxTagList,a1
		CallGadTools DrawBevelBoxA
		dbf	d7,.drawbevelbox

DrawRiBoxes	move.l	#BBFT_RIDGE,GtFt
		lea	RiBoxCoords1,a4
		moveq	#4-1,d7
.drawbevelbox	move	(a4)+,d0
		move	(a4)+,d1
		move	(a4)+,d2
		move	(a4)+,d3
		move.l	_RastPort1(a5),a0
		lea	BoxTagList,a1
		CallLib DrawBevelBoxA
		dbf	d7,.drawbevelbox
		rts

BoxCoords	dc.w	8,43,476,51
		dc.w	8,110,280,131

ReBoxCoords	dc.w	8,13,476,29

RiBoxCoords1	dc.w	212,96,39,13
		dc.w	564,187,31,13
		dc.w	564,200,31,13
		dc.w	564,213,31,13

ArpEdBoxCoords	dc.w	426,26,31,13
		dc.w	426,39,31,13
		dc.w	426,52,31,13

ReBoxTagList	dc.l	GTBB_Recessed
		dc.l	0
BoxTagList	dc.l	GTBB_FrameType
GtFt		dc.l	0
		dc.l	GT_VisualInfo
GtViPtr		dc.l	0
		dc.l	TAG_DONE

*****************************************************************************
* Draw Images                                    * Conny Cyréus - Musicline *
*****************************************************************************
*	(srcbm, srcx, srcy, destrp, destX, destY, sizeX, sizeY, minterm)
*	 A0     D0    D1    A1      D2     D3     D4     D5     D6

DrawImages	bsr	NormalDrawMode
		move.l	_RastPort1(a5),d7
		lea	ImageList,a2

.loop		tst.l	(a2)
		beq.b	.exit
		move.l	(a2)+,a0
		moveq	#0,d0
		moveq	#0,d1
		move.l	d7,a1
		move	(a2)+,d2
		move	(a2)+,d3
		move	(a2)+,d4
		move	(a2)+,d5
		move	#$c0,d6
		CallGfx BltBitMapRastPort
		bra.b	.loop
.exit		rts

ImageList	dc.l	PlayText_bm
		dc.w	11,16,29,23	;destX,destY,sizeX,sizeY
		dc.l	EquMeter_bm
		dc.w	64,26,20,15
		dc.l	EquMeter_bm
		dc.w	120,26,20,15
		dc.l	EquMeter_bm
		dc.w	176,26,20,15
		dc.l	EquMeter_bm
		dc.w	232,26,20,15
		dc.l	EquMeter_bm
		dc.w	288,26,20,15
		dc.l	EquMeter_bm
		dc.w	344,26,20,15
		dc.l	EquMeter_bm
		dc.w	400,26,20,15
		dc.l	EquMeter_bm
		dc.w	456,26,20,15
		dc.l	0

PlayText_bm	dc.w	4		;bm_BytesPerRow
		dc.w	23		;bm_Rows
		dc.b	0		;bm_Flags
		dc.b	2		;bm_Depth
		dc.w	0		;bm_Pad
		dc.l	ZeroImage	;bm_Planes (8*4)
		dc.l	PlayTextImage
		dcb.l	6,0

EquMeter_bm	dc.w	4		;bm_BytesPerRow
		dc.w	15		;bm_Rows
		dc.b	0		;bm_Flags
		dc.b	2		;bm_Depth
		dc.w	0		;bm_Pad
		dc.l	ZeroImage	;bm_Planes (8*4)
		dc.l	EquMeterImage
		dcb.l	6,0

* Twins/PHA *****************************************************************
* Init some data                                      Last Change: 92-10-24 *
*****************************************************************************

SndBufSize	=	2560
_SndFBuf	rs.l	1
_SndCBuf	rs.l	1

InitSomeData	move	#24,_OctaveAdder(a5)
		clr	_PolyOnOff(a5)
		lea	Channel1Buf,a0
		move.l	a0,_ChannelPtr(a5)
		moveq	#0,d0
		moveq	#0,d1
		move.l	_UserPort1(a5),a0
		move.b	MP_SIGBIT(a0),d1
		move.b	d1,_UPort1SigNum(a5)
		bset	d1,d0
		move.l	_UserPort2(a5),a0
		move.b	MP_SIGBIT(a0),d1
		move.b	d1,_UPort2SigNum(a5)
		bset	d1,d0
		move.l	_Signal(a5),d1
		bset	d1,d0
		move.l	d0,_WaitSigMask(a5)
		move.b	#37,_ZeroNote(a5)
		clr.l	GTCY_LenOff
		move	FineLevel+2,d4
		and	#$ff,d4
		move.l	_FineTuneGad(a5),a4
		bsr	PrintHex2Digit
		move	SemiLevel+2,d4
		and	#$ff,d4
		move.l	_SemiToneGad(a5),a4
		bsr	PrintHex2Digit
		move	SlideLevel+2,d4
		and	#$ff,d4
		move.l	_SlideSpeedGad(a5),a4
		bsr	PrintHex2Digit
		move	#64*16,_MasterVol(a5)
		move	_KeybListSize1(a5),_KeybListSize(a5)
		lea	_VisualRastPort(a5),a1
		CallGfx InitRastPort
		move.l	_RastPort2(a5),a0
		move.l	rp_BitMap(a0),a0
		moveq	#0,d0
		move	bm_BytesPerRow(a0),d0
		move	d0,_VisBytesPerRow(a5)
		mulu	#64,d0
		move.l	d0,_VisualSize(a5)
		move.l	#MEMF_CHIP!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,_VisualRast(a5)
		bne.b	.ok
		jmp	Exit
.ok		move.l	#FreeVisualRast,_FreeVisualRast(a5)
		lea	_VisualBitMap(a5),a0
		move.l	d0,bm_Planes(a0)
		move.l	_RastPort2(a5),a1
		move.l	rp_BitMap(a1),a1
		move	bm_BytesPerRow(a1),bm_BytesPerRow(a0)
		move	#64,bm_Rows(a0)
		move.b	#1,bm_Depth(a0)
		lea	_VisualRastPort(a5),a1
		move.l	a0,rp_BitMap(a1)

.allocsndcbuf	move.l	#(4*(2*SndBufSize)),d0
		move.l	#MEMF_CHIP,d1
		CallSys AllocMem
		move.l	d0,_SndCBuf(a5)
		bne.b	.sndcok
		jmp	Exit
.sndcok		move.l	#FreeSndCBuf,_FreeSndCBuf(a5)

.allocsndfbuf	move.l	#(4*(2*SndBufSize)),d0
		move.l	#MEMF_FAST,d1
		CallSys AllocMem
		move.l	d0,_SndFBuf(a5)
		bne.b	.sndfok
		move.l	_SndCBuf(a5),_SndFBuf(a5)
		rts
.sndfok		move.l	#FreeSndFBuf,_FreeSndFBuf(a5)
		rts

FreeVisualRast	move.l	_VisualRast(a5),a1
		move.l	_VisualSize(a5),d0
		CallSys FreeMem
		rts

FreeSndCBuf	move.l	_SndCBuf(a5),a1
		move.l	#(4*(2*SndBufSize)),d0
		CallSys FreeMem
		rts

FreeSndFBuf	move.l	_SndFBuf(a5),a1
		move.l	#(4*(2*SndBufSize)),d0
		CallSys FreeMem
		rts

SetDefaultData	lea	DefaultConfig,a0
		jsr	SetDefConfig

		lea	_TuningTone(a5),a1
		move	#64,inst_Volume(a1)
		move	#256*2,inst_PhaStart(a1)
		move	#256*2,inst_PhaRepeat(a1)
		move	#256*2,inst_PhaRepEnd(a1)
		move	#1,inst_EnvAttLen(a1)
		move	#1,inst_EnvDecLen(a1)
		move	#1,inst_EnvSusLen(a1)
		move	#1,inst_EnvRelLen(a1)
		move.b	#1,inst_ArpSpeed(a1)
		bset	#WSLOOP,inst_Effects1(a1)
		move.l	#SineWave,d0
		move.l	d0,inst_SmplPointer(a1)
		move.l	d0,inst_SmplRepPointer(a1)
		moveq	#32,d0
		move	d0,inst_SmplLength(a1)
		move	d0,inst_SmplRepLength(a1)
		rts

DispSelTune	move.l	_TunesGad(a5),a0
		move.l	_Window1(a5),a1
		move	_TuneNum(a5),GTLV_TuneNum+2
		sub.l	a2,a2
		lea	TagList5,a3
		CallGadTools GT_SetGadgetAttrsA
		jsr	GetTune
		lea	tune_Title(a0),a1
		move.l	a1,StringPtr
		clr.l	StrGadOff
		move.l	_TunesStrGad(a5),a0
		move.l	_Window1(a5),a1
		lea	TagList37,a3
		CallLib GT_SetGadgetAttrsA
		rts

DispSelInst1	move.l	_Inst1Gad(a5),a0
		move.l	_Window1(a5),a1
		move	_InstNum(a5),GTLV_InstNum+2
		move	_InstNum(a5),GTLV_InstSel+2
		sub.l	a2,a2
		lea	TagList13a,a3
		CallGadTools GT_SetGadgetAttrsA
		jsr	GetInst
		lea	inst_Title(a0),a1
		move.l	a1,StringPtr
		clr.l	StrGadOff
		tst	_InstNum(a5)
		bne.b	.ok
		move.l	#TRUE,StrGadOff
.ok		move.l	_Inst1StrGad(a5),a0
		move.l	_Window1(a5),a1
		lea	TagList37,a3
		CallLib GT_SetGadgetAttrsA
		rts

DispSelInst2	move.l	_Inst2Gad(a5),a0
		move.l	_Window2(a5),a1
		move	_InstNum(a5),GTLV_InstNum+2
		move	_InstNum(a5),GTLV_InstSel+2
		sub.l	a2,a2
		lea	TagList13a,a3
		CallGadTools GT_SetGadgetAttrsA
		jsr	GetInst
		lea	inst_Title(a0),a1
		move.l	a1,StringPtr
		clr.l	StrGadOff
		tst	_InstNum(a5)
		bne.b	.ok
		move.l	#TRUE,StrGadOff
.ok		move.l	_Inst2StrGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList37,a3
		CallLib GT_SetGadgetAttrsA
		rts

DispSelSmpl	move.l	_SmplsGad(a5),a0
		move.l	_Window2(a5),a1
		move	_WsNum(a5),GTLV_SmplSel+2
		move	_WsNum(a5),GTLV_SmplNum+2
		sub.l	a2,a2
		lea	TagList14,a3
		CallGadTools GT_SetGadgetAttrsA
		jsr	GetSmpl
		lea	smpl_Title(a0),a1
		move.l	a1,StringPtr
		clr.l	StrGadOff
		move.l	_SmplsStrGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList37,a3
		CallLib GT_SetGadgetAttrsA
		rts

InitTuneData	lea	_TuneListView(a5),a0
		move.l	a0,TuneListPtr
		NEWLIST	a0
		bsr	AllocTune
		move.l	a1,TunePtr
		bsr	AllocVoices
		bsr	DispSelTune

InitSmplData	lea	_SmplListView(a5),a0
		move.l	a0,SmplListPtr
		NEWLIST	a0
		lea	_TraSelListView(a5),a0
		move.l	a0,TraSelListPtr
		rts

InitInstData	move.l	_GadToolsBase(a5),a0
		cmp	#38,LIB_VERSION(a0)
		bhi.b	.ok
		move.l	#GTLV_Top,TuneShowSel
		move.l	#GTLV_Top,InstShowSel
		move.l	#GTLV_Top,SmplShowSel
.ok		move.l	#inst_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		bne.b	.noexit
		jmp	Exit
.noexit		move.l	d0,a1
		lea	inst_NameStr(a1),a0
		move.l	a0,inst_Name(a1)
		lea	InstList_Txt,a2
		moveq	#33-1,d0
.copy		move.b	(a2)+,(a0)+
		dbeq	d0,.copy
		clr.b	(a0)
		lea	_InstListView(a5),a0
		move.l	a0,InstListPtr
		NEWLIST	a0
		ADDTAIL
		move	#64,inst_Volume(a1)
		move	#256*2,inst_PhaStart(a1)
		move	#256*2,inst_PhaRepeat(a1)
		move	#256*2,inst_PhaRepEnd(a1)
		move	#1,inst_EnvAttLen(a1)
		move	#1,inst_EnvDecLen(a1)
		move	#1,inst_EnvSusLen(a1)
		move	#1,inst_EnvRelLen(a1)
		move.b	#1,inst_ArpSpeed(a1)
		move.b	#-1,inst_Transpose(a1)
		move.l	a1,_InstPtrs(a5)
		jmp	InstSelec

_TuneListView	rs.l	3	; minimal list header
_InstListView	rs.l	3
_SmplListView	rs.l	3
_TraSelListView	rs.l	3

InstList_Txt	dc.b	"00 Empty",0
		even
TuneList_Txt	dc.b	"00 Untitled",0
		even

*****************************************************************************
* Options                                        * Conny Cyréus - Musicline *
*****************************************************************************

ToggleFilter	bchg	#1,$bfe001
		rts

*****************************************************************************
* HotKeys Help Window                            * Conny Cyréus - Musicline *
*****************************************************************************

_Window5	rs.l	1
_UserPort5	rs.l	1
_RastPort5	rs.l	1
_UPort5SigNum	rs.w	1

OpenWindow5	tst.l	_Window5(a5)
		beq.b	.open
		move.l	_Window5(a5),a0
		CallIntuition WindowToFront
		bra.b	.exit
.open		lea	_NewWindow(a5),a0
		lea	Window5Defs,a1
		move.l	(a1)+,nw_LeftEdge(a0)
		move.l	(a1)+,nw_Width(a0)
		move.l	(a1)+,nw_IDCMPFlags(a0)
		move.l	(a1)+,nw_Flags(a0)
		move.l	(a1)+,nw_FirstGadget(a0)
		move.l	(a1)+,nw_Title(a0)
		CallIntuition OpenWindow
		move.l	d0,_Window5(a5)
		beq.b	.exit
		move.l	_Window5(a5),a0
		move.l	wd_RPort(a0),_RastPort5(a5)
		move.l	wd_UserPort(a0),_UserPort5(a5)
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		move.l	#CloseWindow5,_CloseWindow5(a5)
		moveq	#0,d1
		move.l	_UserPort5(a5),a0
		move.b	MP_SIGBIT(a0),d1
		move	d1,_UPort5SigNum(a5)
		move.l	_WaitSigMask(a5),d0
		bset	d1,d0
		move.l	d0,_WaitSigMask(a5)
		bset	#4,_ActiveWindows(a5)
		lea	HotHelpDefs,a3
		move.l	_RastPort5(a5),d6
		bra	PrintPage
.exit		rts

CloseWindow5	move	_UPort5SigNum(a5),d1
		move.l	_WaitSigMask(a5),d0
		bclr	d1,d0
		move.l	d0,_WaitSigMask(a5)
		move.l	_Window5(a5),a0
		move.l	wd_LeftEdge(a0),Window5Defs
		CallIntuition CloseWindow
		bclr	#4,_ActiveWindows(a5)
		clr.l	_CloseWindow5(a5)
		clr.l	_Window5(a5)
		rts

UserPort5	move.l	_UserPort5(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,_Message(a5)
		bne.b	.ok
		rts
.ok		pea	.reply
		lea	HotHelpDefs,a3
		move.l	_RastPort5(a5),d6
		move.l	_Message(a5),a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_CLOSEWINDOW,d0
		beq.b	.closewindow
		cmp.l	#IDCMP_GADGETUP,d0
		beq.b	.gadgetselected
		cmp.l	#IDCMP_RAWKEY,d0
		bne.b	.exit
		move	im_Code(a4),d1
		btst	#7,d1
		bne.b	.exit
		cmp	#$45,d1
		beq.b	.closewindow
		cmp	#$4d,d1
		beq	NextPage
		cmp	#$4e,d1
		beq	NextPage
		cmp	#$4f,d1
		beq	PrevPage
		cmp	#$4c,d1
		beq	PrevPage
.exit		rts
.reply		move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		bra	UserPort5

.gadgetselected	move.l	im_IAddress(a4),a0
		move.l	gg_UserData(a0),d1
		beq.b	.x
		move.l	d1,a1
		jmp	(a1)
.x		rts

.closewindow	move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		move.l	#CloseWindow5,(sp)
		rts

Window5Defs	dc.w	0,0
		dc.w	535,210
		dc.l	IDCMP_CLOSEWINDOW!IDCMP_GADGETUP!IDCMP_ACTIVEWINDOW!IDCMP_INACTIVEWINDOW!IDCMP_RAWKEY
		dc.l	WFLG_ACTIVATE!WFLG_CLOSEGADGET!WFLG_DEPTHGADGET!WFLG_RMBTRAP!WFLG_DRAGBAR
Window5Gadgets	dc.l	0
		dc.l	Window5Title

Window5Title	dc.b	" Hotkeys & Structure Help",0
		even

*****************************************************************************
* FX Help Window                                 * Conny Cyréus - Musicline *
*****************************************************************************

_Window7	rs.l	1
_UserPort7	rs.l	1
_RastPort7	rs.l	1
_UPort7SigNum	rs.w	1

OpenWindow7	tst.l	_Window7(a5)
		beq.b	.open
		move.l	_Window7(a5),a0
		CallIntuition WindowToFront
		bra.b	.exit
.open		lea	_NewWindow(a5),a0
		lea	Window7Defs,a1
		move.l	(a1)+,nw_LeftEdge(a0)
		move.l	(a1)+,nw_Width(a0)
		move.l	(a1)+,nw_IDCMPFlags(a0)
		move.l	(a1)+,nw_Flags(a0)
		move.l	(a1)+,nw_FirstGadget(a0)
		move.l	(a1)+,nw_Title(a0)
		CallIntuition OpenWindow
		move.l	d0,_Window7(a5)
		beq.b	.exit
		move.l	_Window7(a5),a0
		move.l	wd_RPort(a0),_RastPort7(a5)
		move.l	wd_UserPort(a0),_UserPort7(a5)
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		move.l	#CloseWindow7,_CloseWindow7(a5)
		moveq	#0,d1
		move.l	_UserPort7(a5),a0
		move.b	MP_SIGBIT(a0),d1
		move	d1,_UPort7SigNum(a5)
		move.l	_WaitSigMask(a5),d0
		bset	d1,d0
		move.l	d0,_WaitSigMask(a5)
		bset	#6,_ActiveWindows(a5)
		lea	FxHelpDefs,a3
		move.l	_RastPort7(a5),d6
		bra	PrintPage
.exit		rts

CloseWindow7	move	_UPort7SigNum(a5),d1
		move.l	_WaitSigMask(a5),d0
		bclr	d1,d0
		move.l	d0,_WaitSigMask(a5)
		move.l	_Window7(a5),a0
		move.l	wd_LeftEdge(a0),Window7Defs
		CallIntuition CloseWindow
		bclr	#6,_ActiveWindows(a5)
		clr.l	_CloseWindow7(a5)
		clr.l	_Window7(a5)
		rts

UserPort7	move.l	_UserPort7(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,_Message(a5)
		bne.b	.ok
		rts
.ok		pea	.reply
		lea	FxHelpDefs,a3
		move.l	_RastPort7(a5),d6
		move.l	_Message(a5),a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_CLOSEWINDOW,d0
		beq.b	.closewindow
		cmp.l	#IDCMP_GADGETUP,d0
		beq.b	.gadgetselected
		cmp.l	#IDCMP_RAWKEY,d0
		bne.b	.exit
		move	im_Code(a4),d1
		btst	#7,d1
		bne.b	.exit
		cmp	#$45,d1
		beq.b	.closewindow
		cmp	#$4d,d1
		beq.b	NextPage
		cmp	#$4e,d1
		beq.b	NextPage
		cmp	#$4f,d1
		beq.b	PrevPage
		cmp	#$4c,d1
		beq.b	PrevPage
.exit		rts
.reply		move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		bra.b	UserPort7

.gadgetselected	move.l	im_IAddress(a4),a0
		move.l	gg_UserData(a0),d1
		beq.b	.x
		move.l	d1,a1
		jmp	(a1)
.x		rts

.closewindow	move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		move.l	#CloseWindow7,(sp)
		rts

Window7Defs	dc.w	288,121
		dc.w	348,131
		dc.l	IDCMP_CLOSEWINDOW!IDCMP_GADGETUP!IDCMP_ACTIVEWINDOW!IDCMP_INACTIVEWINDOW!IDCMP_RAWKEY
		dc.l	WFLG_ACTIVATE!WFLG_CLOSEGADGET!WFLG_DEPTHGADGET!WFLG_RMBTRAP!WFLG_DRAGBAR
Window7Gadgets	dc.l	0
		dc.l	Window7Title

Window7Title	dc.b	" Part Effect Commands",0
		even

NextPage	move	HelpPage(a3),d0
		addq	#1,d0
		cmp	HelpLen(a3),d0
		bls.b	.ok
		moveq	#0,d0
.ok		move	d0,HelpPage(a3)
		bra.b	PrintPage

PrevPage	move	HelpPage(a3),d0
		subq	#1,d0
		bpl.b	.ok
		move	HelpLen(a3),d0
.ok		move	d0,HelpPage(a3)

PrintPage	move	HelpPage(a3),d0
		lsl	#2,d0
		move.l	HelpList(a3,d0.w),a0
		move.l	a0,a2
		move	HelpRows(a3),d4

PrintText	move.l	_GfxBase(a5),a6
		bsr	SetFont7
		bsr	NormalDrawMode1
		moveq	#10,d0
		moveq	#20,d1
		move.l	d6,a1
		CallLib Move
		moveq	#0,d2
		move.b	(a2)+,d2
		move	d2,d0
		lea	(a2),a0
		move.l	d6,a1
		CallLib Text
		add	d2,a2

		moveq	#29,d3
		bsr	NormalDrawMode0
.printloop	move	HelpXPos1(a3),d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		lea	_String(a5),a0
		move.l	a0,a1
		move.l	#$20202020,d0
		moveq	#(80/4)-1,d1
.clear1		move.l	d0,(a1)+
		dbf	d1,.clear1
		moveq	#0,d2
		move.b	(a2)+,d2
		subq	#1,d2
		bmi.b	.space1
		move.l	a0,a1
.move1		move.b	(a2)+,(a1)+
		dbf	d2,.move1
.space1		moveq	#0,d0
		move.b	(a2)+,d0
		beq.b	.skip1
		move.l	d6,a1
		CallLib Text
.skip1		move	HelpXPos2(a3),d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		lea	_String(a5),a0
		move.l	a0,a1
		move.l	#$20202020,d0
		moveq	#(80/4)-1,d1
.clear2		move.l	d0,(a1)+
		dbf	d1,.clear2
		moveq	#0,d2
		move.b	(a2)+,d2
		subq	#1,d2
		bmi.b	.space2
		move.l	a0,a1
.move2		move.b	(a2)+,(a1)+
		dbf	d2,.move2
.space2		moveq	#0,d0
		move.b	(a2)+,d0
		beq.b	.skip2
		move.l	d6,a1
		CallLib Text
.skip2		addq	#7,d3
		dbf	d4,.printloop
		rts

HelpRows	=	0
HelpXPos1	=	2
HelpXPos2	=	4
HelpPage	=	6
HelpLen		=	8
HelpList	=	10

FxHelpDefs	dc.w	15-1		;page rows -1
		dc.w	10		;print xpos1
		dc.w	185		;print xpos2
		dc.w	0		;current page
		dc.w	6-1		;length of list -1
		dc.l	Pitch_Txt	;list with pointers
		dc.l	InstVol_Txt
		dc.l	ChannelVol_Txt
		dc.l	MasterVol_Txt
		dc.l	Other_Txt
		dc.l	ProTracker_Txt

Pitch_Txt	dc.b	22,"0x   Pitch            "
		dc.b	12,"01xx SlideUp",25,13,": 00-FF speed",20
		dc.b	14,"02xx SlideDown",25,13,": 00-FF speed",20
		dc.b	10,"03xx Glide",25,13,": 00-FF speed",20
		dc.b	24,"04xx InitInstrumentGlide",25,12,": 00    none",20
		dc.b	12,"05xx PitchUp",25,13,": 00-FF speed",20
		dc.b	14,"06xx PitchDown",25,13,": 00-FF speed",20
		dc.b	17,"07xx VibratoSpeed",25,13,": 00-FF speed",20
		dc.b	14,"08xx VibratoUp",25,18,": 00-40 depth init",20
		dc.b	16,"09xx VibratoDown",25,18,": 00-40 depth init",20
		dc.b	16,"0Axx VibratoWave",25,12,": 00    sine",20
		dc.b	0,25,16,": 01    rampdown",20
		dc.b	0,25,16,": 02    sawtooth",20
		dc.b	0,25,14,": 03    square",20
		dc.b	16,"0Bxx SetFinetune",25,17,": E1-1F pitch -/+",20
		dc.b	0,25,0,20

InstVol_Txt	dc.b	22,"1x   Instrument Volume"
		dc.b	14,"10xx SetVolume",25,14,": 00-40 volume",20
		dc.b	18,"11xx VolumeSlideUp",25,13,": 00-FF speed",20
		dc.b	20,"12xx VolumeSlideDown",25,13,": 00-FF speed",20
		dc.b	21,"13xx SetSlideToVolume",25,14,": 00-40 volume",20
		dc.b	18,"14xx SlideToVolume",25,18,": 00-FF speed init",20
		dc.b	14,"15xx VolumeAdd",25,14,": 00-40 volume",20
		dc.b	14,"16xx VolumeSub",25,14,": 00-40 volume",20
		dc.b	17,"17xx TremoloSpeed",25,13,": 00-FF speed",20
		dc.b	14,"18xx TremoloUp",25,18,": 00-40 depth init",20
		dc.b	16,"19xx TremoloDown",25,18,": 00-40 depth init",20
		dc.b	16,"1Axx TremoloWave",25,12,": 00    sine",20
		dc.b	0,25,16,": 01    rampdown",20
		dc.b	0,25,16,": 02    sawtooth",20
		dc.b	0,25,14,": 03    square",20
		dc.b	0,25,0,20

ChannelVol_Txt	dc.b	22,"2x   Channel Volume   "
		dc.b	14,"20xx SetVolume",25,14,": 00-40 volume",20
		dc.b	18,"21xx VolumeSlideUp",25,13,": 00-FF speed",20
		dc.b	20,"22xx VolumeSlideDown",25,13,": 00-FF speed",20
		dc.b	21,"23xx SetSlideToVolume",25,14,": 00-40 volume",20
		dc.b	18,"24xx SlideToVolume",25,18,": 00-FF speed init",20
		dc.b	14,"25xx VolumeAdd",25,14,": 00-40 volume",20
		dc.b	14,"26xx VolumeSub",25,14,": 00-40 volume",20
		dc.b	25,"27xx SetVolumeAllChannels",25,14,": 00-40 volume",20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20

MasterVol_Txt	dc.b	22,"3x   Master Volume    "
		dc.b	14,"30xx SetVolume",25,14,": 00-40 volume",20
		dc.b	18,"31xx VolumeSlideUp",25,13,": 00-FF speed",20
		dc.b	20,"32xx VolumeSlideDown",25,13,": 00-FF speed",20
		dc.b	21,"33xx SetSlideToVolume",25,14,": 00-40 volume",20
		dc.b	18,"34xx SlideToVolume",25,18,": 00-FF speed init",20
		dc.b	14,"35xx VolumeAdd",25,14,": 00-40 volume",20
		dc.b	14,"36xx VolumeSub",25,14,": 00-40 volume",20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20
		dc.b	0,25,0,20

Other_Txt	dc.b	22,"4x   Other            "
		dc.b	20,"40xx SpeedOneChannel",25,13,": 00-1F speed",20
		dc.b	21,"41xx GrooveOneChannel",25,13,": 00-1F speed",20
		dc.b	21,"42xx SpeedAllChannels",25,13,": 00-1F speed",20
		dc.b	0,25,13,": 20-FF tempo",20
		dc.b	22,"43xx GrooveAllChannels",25,13,": 00-1F speed",20
		dc.b	18,"44xx ArpeggioTable",25,13,": 00-FF table",20
		dc.b	25,"45xx ArpeggioTableOneStep",25,13,": 00-FF table",20
		dc.b	12,"46xx Sustain",25,15,": 00    release",20
		dc.b	0,25,12,": 01    hold",20
		dc.b	11,"47xx Filter",25,11,": 00    off",20
		dc.b	0,25,10,": 01    on",20
		dc.b	17,"48xx SampleOffset",25,18,": 00-FF offset <<8",20
		dc.b	20,"49xx RestartNoVolume",25,12,": 00    none",20
		dc.b	15,"4Axx WaveSample",25,18,": 00-FF wavesample",20
		dc.b	19,"4Bxx InitInstrument",25,12,": 00    none",20

ProTracker_Txt	dc.b	22,"Ex   ProTracker       "
		dc.b	12,"E1xx SlideUp",25,13,": 00-FF speed",20
		dc.b	14,"E2xx SlideDown",25,13,": 00-FF speed",20
		dc.b	15,"E3xx Portamento",25,13,": 00-FF speed",20
		dc.b	16,"E40x FineSlideUp",25,13,": 00-0F pitch",20
		dc.b	18,"E50x FineSlideDown",25,13,": 00-0F pitch",20
		dc.b	18,"E6xx VolumeSlideUp",25,13,": 00-FF speed",20
		dc.b	20,"E7xx VolumeSlideDown",25,13,": 00-FF speed",20
		dc.b	12,"E8xy Tremolo",25,19,": 00-FF speed/depth",20
		dc.b	16,"E9xx TremoloWave",25,12,": 00    sine",20
		dc.b	0,25,16,": 01    rampdown",20
		dc.b	0,25,14,": 02    square",20
		dc.b	12,"EAxy Vibrato",25,19,": 00-FF speed/depth",20
		dc.b	16,"EBxx VibratoWave",25,12,": 00    sine",20
		dc.b	0,25,16,": 01    rampdown",20
		dc.b	0,25,14,": 02    square",20
		even

HotHelpDefs	dc.w	26-1		;page rows -1
		dc.w	10		;print xpos1
		dc.w	128		;print xpos2
		dc.w	0		;current page
		dc.w	9-1		;length of list -1
		dc.l	Hotkeys1_Txt	;list with pointers
		dc.l	Hotkeys2_Txt
		dc.l	HotSeq1_Txt
		dc.l	HotSeq2_Txt
		dc.l	HotSeqStr1_Txt
		dc.l	HotPart1_Txt
		dc.l	HotPart2_Txt
		dc.l	HotArp1_Txt
		dc.l	HotArp2_Txt

Hotkeys1_Txt	dc.b	43,"Page: 1/9     MusicLine Editor HotKeys  1/2"
		dc.b	53,"RightMouseButton breaks playtune if it loops forever!",65,0,0
		dc.b	0,65,0,0
		dc.b	27,"Hotkeys in Sequence Window:",65,0,0
		dc.b	27,"---------------------------",65,0,0
		dc.b	8,"RAmiga+E",16,11,"= Erase All",50
		dc.b	8,"RAmiga+L",16,13,"= Load Module",50
		dc.b	8,"RAmiga+S",16,13,"= Save Module",50
		dc.b	8,"RAmiga+A",16,16,"= Save Module As",50
		dc.b	8,"RAmiga+Q",16,23,"= Quit Musicline Editor",50
		dc.b	8,"RAmiga+T",16,10,"= Add Tune",50
		dc.b	15,"RAmiga+RShift+T",16,13,"= Remove Tune",50
		dc.b	6,"RAlt+T",16,12,"= Clear Tune",50
		dc.b	0,65,0,0
		dc.b	1,"~",16,46,"= Toggle Sequence Window <-> Instrument Window",50
		dc.b	3,"Tab",16,22,"= Toggle Part <-> Tune",50
		dc.b	9,"Shift+Tab",16,50,"= Edit Cursor Selected Part & Toggle Part <-> Tune",50
		dc.b	5,"Space",16,43,"= Stop Tune,Part,Instrument = Total Silence",50
		dc.b	0,65,0,0
		dc.b	2,"F1",16,24,"= 1-2/2-3/3-4/4-5 Octave",50
		dc.b	8,"Shift+F1",16,20,"= Keyboard Mono/Poly",50
		dc.b	2,"F2",16,13,"= Edit On/Off",50
		dc.b	8,"Shift+F2",16,30,"= EditMode Vert./Horiz./Column",50
		dc.b	2,"F6",16,32,"= Play Tune From Cursor Position",50
		dc.b	8,"Shift+F6",16,26,"= Play Tune From Beginning",50
		dc.b	2,"F7",16,11,"= Play Part",50
		dc.b	0,65,0,0

Hotkeys2_Txt	dc.b	43,"Page: 2/9     MusicLine Editor HotKeys  2/2"
		dc.b	0,65,0,0
		dc.b	29,"Hotkeys in Instrument Window:",65,0,0
		dc.b	29,"-----------------------------",65,0,0
		dc.b	8,"RAmiga+Q",16,23,"= Quit Musicline Editor",50
		dc.b	8,"RAmiga+I",16,16,"= Add Instrument",50
		dc.b	15,"RAmiga+RSHIFT+I",16,19,"= Remove Instrument",50
		dc.b	15,"RAmiga+RSHIFT+W",16,19,"= Remove WaveSample",50
		dc.b	6,"RAlt+I",16,26,"= Remove UnusedInstruments",50
		dc.b	6,"RAlt+W",16,26,"= Remove UnusedWaveSamples",50
		dc.b	6,"RAlt+E",16,25,"= Remove EqualWaveSamples",50
		dc.b	0,65,0,0
		dc.b	1,"~",16,46,"= Toggle Sequence Window <-> Instrument Window",50
		dc.b	5,"Space",16,43,"= Stop Tune,Part,Instrument = Total Silence",50
		dc.b	0,65,0,0
		dc.b	2,"F1",16,24,"= 1-2/2-3/3-4/4-5 Octave",50
		dc.b	8,"Shift+F1",16,20,"= Keyboard Mono/Poly",50
		dc.b	2,"F2",16,22,"= Arpeggio Edit On/Off",50
		dc.b	8,"Shift+F2",16,39,"= Arpeggio EditMode Vert./Horiz./Column",50
		dc.b	2,"F6",16,11,"= Play Tune",50
		dc.b	8,"Shift+F6",16,26,"= Play Tune From Beginning",50
		dc.b	2,"F7",16,11,"= Play Part",50
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0

HotSeq1_Txt	dc.b	43,"Page: 3/9     Sequencer Hotkeys  1/2       "
		dc.b	0,65,0,0
		dc.b	6,"Escape",16,16,"= Exit mark mode",50
		dc.b	0,65,0,0
		dc.b	8,"RAmiga+B",16,32,"= Mark block in tune (mark mode)",50
		dc.b	8,"RAmiga+V",16,33,"= Paste buffer to current channel",50
		dc.b	8,"RAmiga+C",16,32,"= Copy current channel to buffer",50
		dc.b	8,"RAmiga+X",16,31,"= Cut current channel to buffer",50
		dc.b	8,"RAmiga+Z",16,34,"= Swap current channel with buffer",50
		dc.b	0,65,0,0
		dc.b	24,"If you are in mark mode:",65,0,0
		dc.b	24,"------------------------",65,0,0
		dc.b	8,"RAmiga+C",16,22,"= Copy block to buffer",50
		dc.b	8,"RAmiga+X",16,49,"= Cut block to buffer (selected block is cleared)",50
		dc.b	14,"Shift+RAmiga+X",16,49,"= Cut block to buffer (selected block is removed)",50
		dc.b	0,65,0,0
		dc.b	30,"If you have a block in buffer:",65,0,0
		dc.b	30,"------------------------------",65,0,0
		dc.b	8,"RAmiga+V",16,44,"= Paste block in buffer to tune at cursorpos",50
		dc.b	0,16,19,"  (overstrike mode)",50
		dc.b	14,"Shift+RAmiga+V",16,44,"= Paste block in buffer to tune at cursorpos",50
		dc.b	0,16,15,"  (insert mode)",50
		dc.b	0,65,0,0
		dc.b	12,"RAmiga+Minus",16,40,"= Subs one from part or transpose column",50
		dc.b	11,"RAmiga+Plus",16,38,"= Adds one to part or transpose column",50
		dc.b	0,65,0,0
		dc.b	0,65,0,0

HotSeq2_Txt	dc.b	43,"Page: 4/9     Sequencer Hotkeys  2/2       "
		dc.b	0,65,0,0
		dc.b	2,"F8",16,6,"= Wait",50
		dc.b	2,"F9",16,6,"= Jump",50
		dc.b	3,"F10",16,5,"= End",50
		dc.b	0,65,0,0
		dc.b	6,"Return",16,32,"= Insert line in current channel",50
		dc.b	12,"Return+Shift",16,29,"= Insert line in all channels",50
		dc.b	9,"Backspace",16,32,"= Remove line in current channel",50
		dc.b	15,"Backspace+Shift",16,29,"= Remove line in all channels",50
		dc.b	6,"Delete",16,32,"= Delete line in current channel",50
		dc.b	12,"Delete+Shift",18,29,"= Delete line in all channels",50
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0

HotSeqStr1_Txt	dc.b	43,"Page: 5/9     Sequencer Structure  1/1     "
		dc.b	0,65,0,0
		dc.b	12,"Channel Data",65,0,0
		dc.b	11,"     000 00",65,0,0
		dc.b	12,"        \  \",65,0,0
		dc.b	21,"         \  Transpose",65,0,0
		dc.b	14,"          Part",65,0,0
		dc.b	0,65,0,0
		dc.b	9,"Wait (F8)",65,0,0
		dc.b	11,"     ",$80,"00 00",65,0,0
		dc.b	12,"      \ \  \",65,0,0
		dc.b	38,"       \ \  Speed (00 = current speed)",65,0,0
		dc.b	16,"        \ Length",65,0,0
		dc.b	13,"         Wait",65,0,0
		dc.b	0,65,0,0
		dc.b	18,"Jump backward (F9)",65,0,0
		dc.b	11,"     ",$81,"00 00",65,0,0
		dc.b	12,"      \ \  \",65,0,0
		dc.b	46,"       \ \  Number of jumps (00 = jump always)",65,0,0
		dc.b	18,"        \ Position",65,0,0
		dc.b	42,"         Jump backward to channel position",65,0,0
		dc.b	0,65,0,0
		dc.b	18,"End of Voice (F10)",65,0,0
		dc.b	11,"     ",$82,"00 00",65,0,0
		dc.b	12,"      \ \  \",65,0,0
		dc.b	15,"       \ Unused",65,0,0
		dc.b	20,"        End of Voice",65,0,0

HotPart1_Txt	dc.b	43,"Page: 6/9     Part Editor Hotkeys  1/2     "
		dc.b	0,65,0,0
		dc.b	6,"Escape",16,16,"= Exit mark mode",50
		dc.b	0,65,0,0
		dc.b	8,"RAmiga+B",16,32,"= Mark block in part (mark mode)",50
		dc.b	8,"RAmiga+V",16,22,"= Paste buffer to part",50
		dc.b	8,"RAmiga+C",16,21,"= Copy part to buffer",50
		dc.b	8,"RAmiga+X",16,20,"= Cut part to buffer",50
		dc.b	8,"RAmiga+Z",16,23,"= Swap part with buffer",50
		dc.b	0,65,0,0
		dc.b	24,"If you are in mark mode:",65,0,0
		dc.b	24,"------------------------",65,0,0
		dc.b	8,"RAmiga+C",16,22,"= Copy block to buffer",50
		dc.b	8,"RAmiga+X",16,49,"= Cut block to buffer (selected block is cleared)",50
		dc.b	14,"Shift+RAmiga+X",16,49,"= Cut block to buffer (selected block is removed)",50
		dc.b	0,65,0,0
		dc.b	30,"If you have a block in buffer:",65,0,0
		dc.b	30,"------------------------------",65,0,0
		dc.b	8,"RAmiga+V",16,44,"= Paste block in buffer to part at cursorpos",50
		dc.b	0,16,19,"  (overstrike mode)",50                                    "
		dc.b	14,"Shift+RAmiga+V",17,44,"= Paste block in buffer to part at cursorpos",50
		dc.b	0,16,15,"  (insert mode)",50
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0

HotPart2_Txt	dc.b	43,"Page: 7/9     Part Editor Hotkeys  2/2     "
		dc.b	0,65,0,0
		dc.b	8,"RAmiga+U",16,43,"= Transpose all instruments in part note up",50
		dc.b	8,"RAmiga+D",16,45,"= Transpose all instruments in part note down",50
		dc.b	15,"RAmiga+RShift+U",16,45,"= Transpose all instruments in part octave up",50
		dc.b	15,"RAmiga+RShift+D",16,47,"= Transpose all instruments in part octave down",50
		dc.b	6,"RAlt+U",16,51,"= Transpose selected instruments in pattern note up",51
		dc.b	6,"RAlt+D",16,53,"= Transpose selected instruments in pattern note down",53
		dc.b	13,"RAlt+RShift+U",16,53,"= Transpose selected instruments in pattern octave up",53
		dc.b	13,"RAlt+RShift+D",16,55,"= Transpose selected instruments in pattern octave down",55
		dc.b	0,65,0,0
		dc.b	2,"F9",16,6,"= Jump",50
		dc.b	3,"F10",16,5,"= End",50
		dc.b	0,65,0,0
		dc.b	6,"Return",16,15,"= Insert column",50
		dc.b	12,"Shift+Return",16,13,"= Insert line",50
		dc.b	9,"Backspace",16,15,"= Remove column",50
		dc.b	15,"Shift+Backspace",18,13,"= Remove line",50
		dc.b	6,"Delete",16,15,"= Delete column",50
		dc.b	12,"Shift+Delete",16,13,"= Delete line",50
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0

HotArp1_Txt	dc.b	43,"Page: 8/9     Arpeggio Editor Hotkeys  1/2 "
		dc.b	0,65,0,0
		dc.b	6,"Escape",16,16,"= Exit mark mode",50
		dc.b	0,65,0,0
		dc.b	8,"RAmiga+B",16,32,"= Mark block in part (mark mode)",50
		dc.b	8,"RAmiga+V",16,23,"= Paste buffer to table",50
		dc.b	8,"RAmiga+C",16,22,"= Copy table to buffer",50
		dc.b	8,"RAmiga+X",16,21,"= Cut table to buffer",50
		dc.b	8,"RAmiga+Z",16,24,"= Swap table with buffer",50
		dc.b	0,65,0,0
		dc.b	24,"If you are in mark mode:",65,0,0
		dc.b	24,"------------------------",65,0,0
		dc.b	8,"RAmiga+C",16,22,"= Copy block to buffer",50
		dc.b	8,"RAmiga+X",16,49,"= Cut block to buffer (selected block is cleared)",50
		dc.b	14,"Shift+RAmiga+X",16,49,"= Cut block to buffer (selected block is removed)",50
		dc.b	0,65,0,0
		dc.b	30,"If you have a block in buffer:",65,0,0
		dc.b	30,"------------------------------",65,0,0
		dc.b	8,"RAmiga+V",16,44,"= Paste block in buffer to arpg at cursorpos",50
		dc.b	0,16,19,"  (overstrike mode)",50
		dc.b	14,"Shift+RAmiga+V",16,44,"= Paste block in buffer to arpg at cursorpos",50
		dc.b	0,16,15,"  (insert mode)",50
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0

HotArp2_Txt	dc.b	43,"Page: 9/9     Arpeggio Editor Hotkeys  2/2 "
		dc.b	0,65,0,0
		dc.b	2,"F9",16,6,"= Jump",50
		dc.b	3,"F10",16,5,"= End",50
		dc.b	0,65,0,0
		dc.b	6,"Return",16,13,"= Insert Line",50
		dc.b	9,"Backspace",16,13,"= Remove Line",50
		dc.b	6,"Delete",16,15,"= Delete Column",50
		dc.b	12,"Shift+Delete",16,13,"= Delete Line",50
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		dc.b	0,65,0,0
		even

*****************************************************************************
* Set pen colors                                 * Conny Cyréus - Musicline *
*****************************************************************************

SetPens		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr.b	SetBPenCol0
		bsr.b	SetAPenCol1
		move.l	_RastPort2(a5),d6
		bsr.b	SetBPenCol0
		bsr.b	SetAPenCol1
		
SetBPenCol0	moveq	#0,d0
		move.l	d6,a1
		CallLib SetBPen
		rts

SetAPenCol0	moveq	#0,d0
		move.l	d6,a1
		CallLib SetAPen
		rts

SetAPenCol1	moveq	#1,d0
		move.l	d6,a1
		CallLib SetAPen
		rts

SetAPenCol2	moveq	#2,d0
		move.l	d6,a1
		CallLib SetAPen
		rts

*****************************************************************************
* Set draw modes                                 * Conny Cyréus - Musicline *
*****************************************************************************
* d6 <= RastPort                                                            *
* a6 <= GfxBase                                                             *

NormalDrawMode	moveq	#1,d0
		move.l	d6,a1
		CallLib SetAPen
		move	#RP_JAM2,d0
		move.l	d6,a1
		CallLib SetDrMd
FreeMask	move.l	d6,a0
		move.l	#%00000000000000000000000000000011,d0
		bra.b	WriteMask

ClearDrawMode	move	#RP_JAM2!RP_INVERSVID,d0
		move.l	d6,a1
		CallLib SetDrMd
		bra.b	FreeMask

NormalDrawMode0	moveq	#1,d0
		move.l	d6,a1
		CallLib SetAPen
		move	#RP_JAM2,d0
		move.l	d6,a1
		CallLib SetDrMd
MaskBit1	move.l	d6,a0
		move.l	#%00000000000000000000000000000001,d0
		bra.b	WriteMask

NormalDrawMode1	moveq	#2,d0
		move.l	d6,a1
		CallLib SetAPen
		move	#RP_JAM2,d0
		move.l	d6,a1
		CallLib SetDrMd
MaskBit0	move.l	d6,a0
		move.l	#%00000000000000000000000000000010,d0
		bra 	WriteMask

WriteMask	move.l	_GfxBase(a5),a1
		cmp	#39,LIB_VERSION(a1)
		bhs.b	.ok
		move.b	d0,rp_Mask(a0)
		rts
.ok		CallLib SetWriteMask
		rts

SetFont7	move.l	_TextFont7(a5),a0
		move.l	d6,a1
		CallLib SetFont
		rts

SetFont8	move.l	_TextFont8(a5),a0
		move.l	d6,a1
		CallLib SetFont
		rts

*****************************************************************************
* Print Tune                                     * Conny Cyréus - Musicline *
*****************************************************************************

PrintTune	move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	SetFont7
		bsr	NormalDrawMode0
		lea	_AscIIHexTab(a5),a2
		move	X1CharPos(a4),d2
		move	Y1CharPos(a4),d3
		move	MinYPos(a4),d4
		add	d4,d4
		move	NumYPos(a4),d5
.loop1		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		moveq	#2,d0
		lea	(a2,d4.w),a0
		move.l	d6,a1
		CallLib Text
		addq	#6,d3
		addq	#2,d4
		dbf	d5,.loop1

		move.l	DataPtr(a4),a3
		move.l	tune_Ch1Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#3*8,d2
		bsr	.print2
		move.l	DataPtr(a4),a3
		move.l	tune_Ch2Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(3+7)*8,d2
		bsr	.print2
		move.l	DataPtr(a4),a3
		move.l	tune_Ch3Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(3+7+7)*8,d2
		bsr	.print2
		move.l	DataPtr(a4),a3
		move.l	tune_Ch4Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(3+7+7+7)*8,d2
		bsr	.print2
		move.l	DataPtr(a4),a3
		move.l	tune_Ch5Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(3+7+7+7+7)*8,d2
		bsr	.print2
		move.l	DataPtr(a4),a3
		move.l	tune_Ch6Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(3+7+7+7+7+7)*8,d2
		bsr	.print2
		move.l	DataPtr(a4),a3
		move.l	tune_Ch7Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(3+7+7+7+7+7+7)*8,d2
		bsr	.print2
		move.l	DataPtr(a4),a3
		move.l	tune_Ch8Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(3+7+7+7+7+7+7+7)*8,d2
		bsr	.print2

		move.l	DataPtr(a4),a3
		move.l	tune_Ch1Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#7*8,d2
		bsr	.print3
		move.l	DataPtr(a4),a3
		move.l	tune_Ch2Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(7+7)*8,d2
		bsr	.print3
		move.l	DataPtr(a4),a3
		move.l	tune_Ch3Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(7+7+7)*8,d2
		bsr	.print3
		move.l	DataPtr(a4),a3
		move.l	tune_Ch4Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(7+7+7+7)*8,d2
		bsr	.print3
		move.l	DataPtr(a4),a3
		move.l	tune_Ch5Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(7+7+7+7+7)*8,d2
		bsr	.print3
		move.l	DataPtr(a4),a3
		move.l	tune_Ch6Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(7+7+7+7+7+7)*8,d2
		bsr	.print3
		move.l	DataPtr(a4),a3
		move.l	tune_Ch7Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(7+7+7+7+7+7+7)*8,d2
		bsr	.print3
		move.l	DataPtr(a4),a3
		move.l	tune_Ch8Ptr(a3),a3
		move	X1CharPos(a4),d2
		add	#(7+7+7+7+7+7+7+7)*8,d2
		bsr.b	.print3

		rts

.print2		move	Y1CharPos(a4),d3
		move	MinYPos(a4),d4
		mulu	RowSize(a4),d4
		add	d4,a3
		move	NumYPos(a4),d5
.loop2		move	(a3)+,d7
		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		lea	_String+1(a5),a0
		move	d7,d1
		and	#$00c0,d1
		btst	#5,d7
		bne.b	.skip2
		lsr	#5,d1
		move.b	1(a2,d1.w),(a0)
		move	d7,d1
		and	#$ff00,d1
		lsr	#7,d1
		move	(a2,d1.w),1(a0)
		move.l	d6,a1
		moveq	#3,d0
		CallLib Text
		addq	#6,d3
		dbf	d5,.loop2
		rts

.skip2		lsr	#6,d1
		lea	_AscIICmdTab(a5),a1
		move.b	(a1,d1.w),(a0)
		move	d7,d1
		and	#$ff00,d1
		lsr	#7,d1
		move	(a2,d1.w),1(a0)
		move.l	d6,a1
		moveq	#3,d0
		CallLib Text
		addq	#6,d3
		dbf	d5,.loop2
		rts

.print3		move	Y1CharPos(a4),d3
		move	MinYPos(a4),d4
		mulu	RowSize(a4),d4
		add	d4,a3
		move	NumYPos(a4),d5
.loop3		move	(a3)+,d7
		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		move	d7,d1
		and	#$001f,d1
		btst	#5,d7
		bne.b	.skip3
		sub.b	#$10,d1
.skip3		add	d1,d1
		lea	(a2,d1.w),a0
		move.l	d6,a1
		moveq	#2,d0
		CallLib Text
		addq	#6,d3
		dbf	d5,.loop3
		rts

* Twins/PHA *****************************************************************
* Print one part                                      Last Change: 92-10-24 *
*****************************************************************************
* d6 <= RastPort                                                            *
* a4 <= PartData                                                            *
* a6 <= GfxBase                                                             *

PrintPart	bsr	SetFont8
		move	X1CharPos(a4),d2
		move	Y1CharPos(a4),d3
		move	NumYPos(a4),d4
		move	MinYPos(a4),d5
		move	d5,d7
		add	d5,d5
		move.l	DataPtr(a4),a3
		mulu	RowSize(a4),d7
		add	d7,a3
		bsr	PartPrinta
		rts

PrintArpg	bsr	SetFont8
		move	X1CharPos(a4),d2
		move	Y1CharPos(a4),d3
		move	NumYPos(a4),d4
		move	MinYPos(a4),d5
		move	d5,d7
		add	d5,d5
		move.l	DataPtr(a4),a3
		mulu	RowSize(a4),d7
		add	d7,a3
		bsr	ArpgPrint
		rts

* Twins/PHA *****************************************************************
* Get pointer to part                                 Last Change: 92-10-24 *
*****************************************************************************

GetPartPtr	move	_PartNum(a5),d3
		add	d3,d3
		add	d3,d3
		lea	_PartPtrs(a5),a0
		add	d3,a0
		move.l	a0,_PartPtr(a5)
		move.l	(a0),PartPtr
		rts

GetArpgPtr	move.l	d0,-(sp)
		jsr	GetInst
		move.l	(sp)+,d0
		move	inst_ArpTable(a0),d3
		add	d3,d3
		add	d3,d3
		lea	_ArpgPtrs(a5),a0
		add	d3,a0
		move.l	a0,_ArpgPtr(a5)
		move.l	(a0),ArpgPtr
		rts

* Twins/PHA *****************************************************************
* Init pointers to parts                              Last Change: 92-10-24 *
*****************************************************************************

InitPartPtrs	move	#1023,d0
		lea	_ZeroBuffer(a5),a0
		lea	_PartPtrs(a5),a1
.loop		move.l	a0,(a1)+
		dbf	d0,.loop
		rts

InitArpgPtrs	move	#255,d0
		lea	_ZeroBuffer(a5),a0
		lea	_ArpgPtrs(a5),a1
.loop		move.l	a0,(a1)+
		dbf	d0,.loop
		rts

* Twins/PHA *****************************************************************
* Allocate part memory                                Last Change: 92-10-24 *
*****************************************************************************

AllocVoices	move.l	a6,-(sp)
		lea	_ZeroBuffer(a5),a3
		move.l	TunePtr,a4
		lea	tune_Ch1Ptr(a4),a4
		moveq	#7,d3
.loop		move.l	(a4)+,a0
		cmp.l	a0,a3
		bne.b	.next
		move.l	#chnl_SIZE,d0
		move.l	#MEMF_ANY,d1
		CallSys AllocMem
		tst.l	d0
		beq.b	.exit
		move.l	d0,-4(a4)
		move.l	d0,a0
		move	#255,d0
		move	#$0010,d1
.clear		move	d1,(a0)+
		dbf	d0,.clear
.next		dbf	d3,.loop
.exit		move.l	(sp)+,a6
		rts

AllocPart	lea	_ZeroBuffer(a5),a0
		move.l	DataPtr(a4),a3
		cmp.l	a3,a0
		bne.b	.exit
		move.l	a6,-(sp)
		move.l	#part_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq.b	.exit
		move.l	d0,DataPtr(a4)
		move.l	_PartPtr(a5),a0
		move.l	d0,(a0)
		move.l	(sp)+,a6
.exit		rts

AllocArpg	lea	_ZeroBuffer(a5),a0
		move.l	DataPtr(a4),a3
		cmp.l	a3,a0
		bne.b	.exit
		move.l	a6,-(sp)
		move.l	#arpg_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq.b	.exit
		move.l	d0,DataPtr(a4)
		move.l	_ArpgPtr(a5),a0
		move.l	d0,(a0)
		move.l	(sp)+,a6
.exit		rts

* Twins/PHA *****************************************************************
* Free part memory                                    Last Change: 92-10-24 *
*****************************************************************************

FreeVoices	move.l	a6,-(sp)
		move.l	TunePtr,a4
		lea	tune_Ch1Ptr(a4),a4
		lea	_ZeroBuffer(a5),a3
		moveq	#7,d3
.loop		move.l	(a4)+,a1
		cmp.l	a1,a3
		beq.b	.next
		move	#256-1,d0
		move.l	a1,a0
.test		tst	(a0)+
		bne.b	.exit
		dbf	d0,.test
		move.l	#chnl_SIZE,d0
		CallSys FreeMem
		move.l	a3,-4(a4)
.next		dbf	d3,.loop
.exit		move.l	(sp)+,a6
		rts

FreePart	move	#128*3-1,d0
		move.l	PartPtr,a3
		lea	_ZeroBuffer(a5),a0
		cmp.l	a3,a0
		beq.b	.exit
		move.l	a3,a1
.loop		tst.l	(a3)+
		bne.b	.exit
		dbf	d0,.loop
		move.l	a6,-(sp)
		move.l	#part_SIZEOF,d0
		CallSys FreeMem
		lea	_ZeroBuffer(a5),a0
		move.l	_PartPtr(a5),a1
		move.l	a0,(a1)
		move.l	a0,PartPtr
		move.l	(sp)+,a6
.exit		rts

FreeArpg	move	#128*3-1,d0
		move.l	ArpgPtr,a3
		lea	_ZeroBuffer(a5),a0
;;		move.l	#ID2_hex,d4		ID2 <--------------
		cmp.l	a3,a0
		beq.b	.exit
		move.l	a3,a1
.loop		tst	(a3)+
		bne.b	.exit
		dbf	d0,.loop
		move.l	a6,-(sp)
		move.l	#arpg_SIZEOF,d0
		CallSys FreeMem
		lea	_ZeroBuffer(a5),a0
		move.l	_ArpgPtr(a5),a1
		move.l	a0,(a1)
		move.l	a0,ArpgPtr
		move.l	(sp)+,a6
.exit		rts

* Twins/PHA *****************************************************************
* Update part and draw cursor                         Last Change: 92-10-24 *
*****************************************************************************

UpdatePart	move	_Buffer(a5),d0
		lsr	#4,d0
		cmp	#$3ff,d0
		ble.b	.ok
		move	#$3ff,d0
.ok		move	d0,_PartNum(a5)
		bsr	PrintPartNum
		tst.b	_RawKey(a5)
		beq.b	UpdateParts
		move.b	#2,_TunePart(a5)
		lea	PartEditorDefs,a4
		jsr	PaintCursor
UpdateParts	bsr	GetPartPtr
		lea	PartEditorDefs,a4
		bra	PrintPart

UpdateArp	bsr	GetInst
		move.b	_Buffer(a5),inst_ArpTable+1(a0)
UpdateArpg	lea	ArpgEditorDefs,a4
		bsr	GetArpgPtr
		bra	PrintArpg

* Twins/PHA *****************************************************************
* Print X part lines                                  Last Change: 92-10-24 *
*****************************************************************************
* d2 <= X1Pos                                                               *
* d3 <= Y1Pos+6                                                             *
* d4 <= X NumLines -1                                                       *
* d5 <= MinYPos *2                                                          *
* d6 <= RastPort                                                            *
* a3 <= DataPtr                                                             *
* a6 <= GfxBase                                                             *

PartPrinta	move.l	_RastPort1(a5),d6
		move.l	a4,-(sp)
		bsr	NormalDrawMode0
		lea	_AscIIHexTab(a5),a2
		lea	AscIINotes,a4
.loop		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		moveq	#2,d0
		move	d5,d1
		lea	(a2,d1.w),a0
		move.l	d6,a1
		CallLib Text
		add	#24,d2
		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		moveq	#3,d0
		moveq	#0,d1
		move.b	(a3)+,d1
		cmp.b	#61,d1
		beq	.end
		bclr	#7,d1
		bne	.jump
		add	d1,d1
		add	d1,d1
		lea	(a4,d1.w),a0
		move.l	d6,a1
		CallLib Text
.instrument	add	#32,d2
		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		moveq	#2,d0
		moveq	#0,d1
		move.b	(a3)+,d1
		add	d1,d1
		lea	(a2,d1.w),a0
		move.l	d6,a1
		CallLib Text
		add	#24,d2
		moveq	#4,d7
.effects	move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		lea	_String(a5),a0
		moveq	#4,d0
		moveq	#0,d1
		move.b	(a3)+,d1
		add	d1,d1
		move	(a2,d1.w),(a0)
		moveq	#0,d1
		move.b	(a3)+,d1
		add	d1,d1
		move	(a2,d1.w),2(a0)
		move.l	d6,a1
		CallLib Text
		add	#40,d2
		dbf	d7,.effects
		sub	#280,d2
		addq	#8,d3
		addq	#2,d5
		dbf	d4,.loop
		move.l	(sp)+,a4
		rts

.end		move	d1,d7
		moveq	#3,d0
		moveq	#0,d1
		move.b	d7,d1
		add	d1,d1
		add	d1,d1
		lea	(a4,d1.w),a0
		move.l	d6,a1
		CallLib Text
		bra	.instrument

.jump		move	d1,d7
		lea	_String(a5),a0
		moveq	#1,d0
		moveq	#0,d1
		move.b	#$81,(a0)
		move.l	d6,a1
		CallLib Text
		moveq	#2,d0
		moveq	#0,d1
		move.b	d7,d1
		add	d1,d1
		lea	(a2,d1.w),a0
		move.l	d6,a1
		CallLib Text
		bra	.instrument

ArpgPrint	move.l	_RastPort2(a5),d6
		move.l	a4,-(sp)
		bsr	NormalDrawMode0
		lea	_AscIIHexTab(a5),a2
		lea	AscIINotes,a4
.loop		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		move	d5,d1
		lea	(a2,d1.w),a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		add	#21,d2
		moveq	#0,d1
		move.b	(a3)+,d1
		bpl.b	.ok
		add.b	#61,d1
		add	d1,d1
		lea	_String(a5),a1
		move.b	#$20,(a1)+
		move.b	(a2,d1.w),(a1)+
		move.b	1(a2,d1.w),(a1)+
		bra.b	.ok1
.ok		cmp.b	#61,d1
		blo.b	.oki
		move	d1,d7
		move	d7,d1
.oki		add	d1,d1
		add	d1,d1
		lea	_String(a5),a1
		move.b	(a4,d1.w),(a1)+
		move.b	1(a4,d1.w),(a1)+
		move.b	2(a4,d1.w),(a1)+
.ok1		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		moveq	#3,d0
		lea	_String(a5),a0
		move.l	d6,a1
		CallLib Text
		add	#29,d2
		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		moveq	#0,d1
		move.b	(a3)+,d1
		add	d1,d1
		lea	(a2,d1.w),a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		add	#21,d2
		moveq	#1,d7
.loopa		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		lea	_String(a5),a0
		moveq	#0,d1
		move.b	(a3)+,d1
		add	d1,d1
		move.b	1(a2,d1.w),(a0)
		moveq	#0,d1
		move.b	(a3)+,d1
		add	d1,d1
		move.b	(a2,d1.w),1(a0)
		move.b	1(a2,d1.w),2(a0)
		moveq	#3,d0
		move.l	d6,a1
		CallLib Text
		add	#29,d2
		dbf	d7,.loopa
		sub	#129,d2
		addq	#8,d3
		addq	#2,d5
		dbf	d4,.loop
		move.l	(sp)+,a4
		rts

* Twins/PHA *****************************************************************
* Print hex gadgets                                   Last Change: 92-10-24 *
*****************************************************************************

PrintPartNum	move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	SetFont8
		bsr	NormalDrawMode0
		lea	GadgetList1,a0
		move	gg_LeftEdge(a0),d0
		add	#8,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move.l	d6,a1
		CallLib Move
		lea	_String(a5),a0
		lea	_AscIIHexTab(a5),a1
		move	_PartNum(a5),d0
		move	d0,d1
		and	#$ff,d0
		add	d0,d0
		and	#$f00,d1
		lsr	#3,d1
		move.b	(a1,d1.w),(a0)
		add	d0,a1
		move.b	(a1)+,1(a0)
		move.b	(a1)+,2(a0)
		moveq	#3,d0
		move.l	d6,a1
		CallLib Text
		rts

PrintTempoNum	move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	SetFont8
		bsr	NormalDrawMode0
		lea	tempo,a0
		move	gg_LeftEdge(a0),d0
		add	#8,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move.l	d6,a1
		CallLib Move
		bsr	GetTune
		move	tune_Tempo(a0),d0
		move	d0,_TuneTmp(a5)
		lea	_AscIIHexTab(a5),a0
		add	d0,d0
		add	d0,a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		rts

PrintSpdNum	move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	SetFont8
		bsr	NormalDrawMode0
		lea	spd,a0
		move	gg_LeftEdge(a0),d0
		add	#8,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move.l	d6,a1
		CallLib Move
		bsr	GetTune
		moveq	#0,d0
		move.b	tune_Speed(a0),d0
		lea	_AscIIHexTab(a5),a0
		add	d0,d0
		add	d0,a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		rts

PrintGrvNum	move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	SetFont8
		bsr	NormalDrawMode0
		lea	grv,a0
		move	gg_LeftEdge(a0),d0
		add	#8,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move.l	d6,a1
		CallLib Move
		bsr	GetTune
		moveq	#0,d0
		move.b	tune_Groove(a0),d0
		lea	_AscIIHexTab(a5),a0
		add	d0,d0
		add	d0,a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		rts

PrintArpgTab	move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	SetFont8
		bsr	NormalDrawMode0
		lea	GadgetList3,a0
		move	gg_LeftEdge(a0),d0
		add	#8,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move.l	d6,a1
		CallLib Move
		bsr	GetInst
		move	inst_ArpTable(a0),d0
		lea	_AscIIHexTab(a5),a0
		add	d0,d0
		add	d0,a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		rts

PrintArpSpeed	move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	SetFont8
		bsr	NormalDrawMode0
		lea	speeded,a0
		move	gg_LeftEdge(a0),d0
		add	#8,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move.l	d6,a1
		CallLib Move
		bsr	GetInst
		moveq	#0,d0
		move.b	inst_ArpSpeed(a0),d0
		lea	_AscIIHexTab(a5),a0
		add	d0,d0
		add	d0,a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		rts

PrintArpGroove	move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	SetFont8
		bsr	NormalDrawMode0
		lea	grooveed,a0
		move	gg_LeftEdge(a0),d0
		add	#8,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move.l	d6,a1
		CallLib Move
		bsr	GetInst
		moveq	#0,d0
		move.b	inst_ArpGroove(a0),d0
		lea	_AscIIHexTab(a5),a0
		add	d0,d0
		add	d0,a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		rts

;Byte3
Msg_CpuToSlow	=	0
Msg_StartTimer	=	1
Msg_StartAudio	=	2
Msg_MouseButton	=	3
Msg_StepShower	=	4
Msg_StepArrow	=	5
Msg_PartArrow	=	6
Msg_PrintPart	=	7
;Byte2
Msg_VUMeters	=	0
Msg_DrawVisual	=	1

CpuToSlow	bclr	#Msg_CpuToSlow,_SigMsg+3(a5)
		tst	_IntMode(a5)
		beq	Wait3
		bsr	Stoppa
		jsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#CpuSlow_Txt,12(a1)
		move.l	#Ok_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		jsr	InputOn
		bra	Wait3

StartTimer	bclr	#Msg_StartTimer,_SigMsg+3(a5)
		bsr.b	StartTimerInt
		bra	Wait4

StartTimerInt	move	#$0080,$dff09a
		move	#$0080,$dff09c
		move.l	_TimerValue1(a5),d4
		bsr	GetTune
		move	tune_Tempo(a0),_TuneTmp(a5)
		divu	_TuneTmp(a5),d4
		lea	$bfd000,a4
		move.b	d4,ciatalo(a4)
		lsr	#8,d4
		move.b	d4,ciatahi(a4)
		bset	#CIACRAB_START,ciacra(a4)
		move	#1,_IntMode(a5)
		bra	CalcVUTimer

StartAudio	bclr	#Msg_StartAudio,_SigMsg+3(a5)
		bsr.b	StartAudioInt
		bra	Wait5

StartAudioInt	move	#2,_IntMode(a5)
		bsr	GetTune
		move	tune_Tempo(a0),_TuneTmp(a5)
		jsr	SetAudInt
		clr	_DoubleBuf(a5)
		move	#126,d0
		move	d0,_MixPeriod(a5)
		move	d0,d1
		mulu	#32768,d1
		move.l	d1,_PeriodValue(a5)
		move.l	_TimerValue2(a5),d1
		divu	d0,d1
		mulu	#125,d1
		move	_TuneTmp(a5),d2
		mulu	#50,d2
		divu	d2,d1
		bclr	#0,d1
		move	d1,_MixLength(a5)
		lsr	#1,d1
		move.l	_SndCBuf(a5),a0
		move.l	a0,$dff0a0
		move	d1,$dff0a4
		move	d0,$dff0a6
		add	#(2*SndBufSize),a0
		move.l	a0,$dff0b0
		move	d1,$dff0b4
		move	d0,$dff0b6
		add	#(2*SndBufSize),a0
		move.l	a0,$dff0c0
		move	d1,$dff0c4
		move	d0,$dff0c6
		add	#(2*SndBufSize),a0
		move.l	a0,$dff0d0
		move	d1,$dff0d4
		move	d0,$dff0d6
		bclr	#CIACRAB_START,ciacra(a4)
		move	#2,_IntMode(a5)
		jsr	Dma6
		rts

MouseButton	bclr	#Msg_MouseButton,_SigMsg+3(a5)
		cmp	#1,_StringEd(a5)
		bne.b	.inst1
		move.l	_TunesStrGad(a5),a0
		bsr	GetTuneName
		bra	Wait6
.inst1		cmp	#2,_StringEd(a5)
		bne.b	.inst2
		move.l	_Inst1StrGad(a5),a0
		bsr	GetInstName
		bra	Wait6
.inst2		cmp	#3,_StringEd(a5)
		bne.b	.smpl
		move.l	_Inst2StrGad(a5),a0
		bsr	GetInstName
.smpl		cmp	#4,_StringEd(a5)
		bne.b	.exit
		move.l	_SmplsStrGad(a5),a0
		bsr	GetSmplName
.exit		bra	Wait6

ClearArrowTunePos
		move.l	a0,-(sp)
		lea	_ArrowTunePos(a5),a0
		clr.l	(a0)+
		clr.l	(a0)+
		clr.l	(a0)+
		clr.l	(a0)+
		lea	_ArrowPartPos(a5),a0
		clr	(a0)
		lea	_StepPartPos(a5),a0
		clr.l	(a0)+
		clr.l	(a0)+
		lea	_PartLineYPos(a5),a0
		clr	(a0)
		lea	_PartShow(a5),a0
		clr.l	(a0)+
		clr.l	(a0)+
		clr.l	(a0)+
		clr.l	(a0)+
		lea	_TransposeShow(a5),a0
		clr.l	(a0)+
		clr.l	(a0)+
		lea	_TuneLineYPos(a5),a0
		clr.l	(a0)+
		clr.l	(a0)+
		clr.l	(a0)+
		clr.l	(a0)+
		lea	_ChannelLineXPos(a5),a0
		clr	(a0)
		move.l	(sp)+,a0
		rts

_StepArrowClear	rs.b	1
_PartArrowClear	rs.b	1
_ArrowTunePos	rs.b	16
_StepPartPos	rs.b	8
_ArrowPartPos	rs.b	2
_PartShow	rs.w	8
_TransposeShow	rs.b	8
_PartLineYPos	rs.w	1
_TuneLineYPos	rs.w	8

StepShow	movem.l	d0-a6,-(sp)
		bclr	#Msg_StepShower,_SigMsg+3(a5)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		lea	_AscIIHexTab(a5),a2
		bsr	SetFont7
		bsr	NormalDrawMode0

		lea	_ArrowTunePos(a5),a3
		moveq	#44,d5				Xcoord
		moveq	#4-1,d7
		tst.b	_PlayMode(a5)
		beq.b	.loop1
		addq	#4,d7				8 channels
.loop1		move	d5,d0
		moveq	#21,d1				Ycoord
		move.l	d6,a1
		CallLib Move
		moveq	#0,d0
		move.b	(a3)+,d0
		add	d0,d0
		lea	(a2,d0.w),a0
		moveq	#2,d0				Two digit print
		move.l	d6,a1
		CallLib Text
		add	#56,d5
		dbf	d7,.loop1

		lea	_PartShow(a5),a3
		moveq	#36,d5				Xcoord
		moveq	#4-1,d7
		tst.b	_PlayMode(a5)
		beq.b	.loop2
		addq	#4,d7				8 channels
.loop2		move	d5,d0
		moveq	#27,d1				Ycoord
		move.l	d6,a1
		CallLib Move
		moveq	#0,d0
		move.b	(a3)+,d0
		add	d0,d0
		lea	1(a2,d0.w),a0
		moveq	#1,d0				One digit print
		move.l	d6,a1
		CallLib Text
		moveq	#0,d0
		move.b	(a3)+,d0
		add	d0,d0
		lea	(a2,d0.w),a0
		moveq	#2,d0				Two digit print
		move.l	d6,a1
		CallLib Text
		add	#56,d5
		dbf	d7,.loop2

		lea	_StepPartPos(a5),a3
		moveq	#44,d5				Xcoord
		moveq	#4-1,d7
		tst.b	_PlayMode(a5)
		beq.b	.loop3
		addq	#4,d7				8 channels
.loop3		move	d5,d0
		moveq	#33,d1				Ycoord
		move.l	d6,a1
		CallLib Move
		moveq	#0,d0
		move.b	(a3)+,d0
		add	d0,d0
		lea	(a2,d0.w),a0
		moveq	#2,d0				Two digit print
		move.l	d6,a1
		CallLib Text
		add	#56,d5
		dbf	d7,.loop3

		lea	_TransposeShow(a5),a3
		moveq	#44,d5				Xcoord
		moveq	#4-1,d7
		tst.b	_PlayMode(a5)
		beq.b	.loop4
		addq	#4,d7				8 channels
.loop4		move	d5,d0
		moveq	#39,d1				Ycoord
		move.l	d6,a1
		CallLib Move
		moveq	#0,d0
		move.b	(a3)+,d0
		add	d0,d0
		lea	(a2,d0.w),a0
		moveq	#2,d0				Two digit print
		move.l	d6,a1
		CallLib Text
		add	#56,d5
		dbf	d7,.loop4
		movem.l	(sp)+,d0-a6
		rts

StepShower	bsr	StepShow
		bra	Wait7

_TuneLinePtr	rs.l	1

StepArrowMark	lea	TuneMarkEdDefs,a4
		bra.b	StepArrowSkip
StepArrow	lea	TuneEditorDefs,a4

StepArrowSkip	btst	#7,_MarkEd(a5)
		beq.b	.nomark
		rts
.nomark		movem.l	d0-a6,-(sp)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	NormalDrawMode1
		bsr	SetFont7
		move.l	d6,a0
		move	#$aaaa,rp_LinePtrn(a0)
		or	#FRST_DOT,rp_Flags(a0)
		move.b	#15,rp_linpatcnt(a0)

		lea	_TuneLineYPos(a5),a0
		move.l	a0,_TuneLinePtr(a5)
		lea	TuneEditorXCoords,a3
		moveq	#4-1,d7
		tst.b	_PlayMode(a5)
		beq.b	.scrollcheck
		addq	#4,d7				8 channels

.scrollcheck	lea	_ArrowTunePos(a5),a2
		tst.b	_PlayTune(a5)
		beq	.clearend
		cmp.b	#2,_ScrollPart(a5)
		blo	.ok
		cmp.b	#1,_TunePart(a5)
		bne.b	.notuneedit
		jsr	CursorSave

.notuneedit	move.l	_ChannelPtr(a5),a0
		moveq	#0,d2
		move.b	ch_TunePos(a0),d2
		move	ScrollDownPos(a4),d3
		sub	d3,d2
		bge.b	.done1
		moveq	#0,d2

.done1		move	#$ff,d3
		sub	NumYPos(a4),d3
		cmp	d3,d2
		bls.b	.done2
		move	d3,d2
.done2		moveq	#0,d3
		move.b	ch_TunePos(a0),d3
		sub	d2,d3
		move	d3,CursorYPos(a4)
		move	d2,d0

		move	MinYPos(a4),d1
		sub	d1,d2
		bne.b	.scroll
		cmp.b	#1,_TunePart(a5)
		bne.b	.ok
		jsr	CursorDraw
		bra.b	.ok

.scroll		movem.l	d7/a2/a3,-(sp)
		subq	#1,d2
		bne.b	.printtune
		jsr	CursorDownScroll
		cmp.b	#1,_TunePart(a5)
		bne.b	.restoreregs
		bra.b	.cursordraw
.printtune	move	d0,MinYPos(a4)
		bsr	PrintTune
		cmp.b	#1,_TunePart(a5)
		bne.b	.restoreregs
.cursordraw	jsr	CursorDraw
.restoreregs	movem.l	(sp)+,d7/a2/a3

.ok		bsr	NormalDrawMode1
.nextloop	tst.b	_StepArrowClear(a5)
		bne.b	.clearend
		moveq	#0,d2
		move.b	(a2),d2				New TunePos Arrow
		sub	MinYPos(a4),d2
		bmi.b	.nextcleardbf
		cmp	NumYPos(a4),d2
		bhi.b	.nextcleardbf
		move	d2,d0
		move	Y1CharPos(a4),d1		Ycoord
		mulu	#6,d2
		add	d2,d1
		move.l	_TuneLinePtr(a5),a0
		cmp	(a0),d1
		beq.b	.nextdbf
		bsr.b	.clear
		move	d1,(a0)
		move.b	d0,8(a2)			Update Old TunePos with the New TunePos
		move.l	d1,-(sp)
		bsr	SetAPenCol2
		move.l	(sp)+,d1
		move	(a3),d0
		move	d1,d3
		move.l	d6,a1
		CallLib Move
		move	(a3),d0
		add	#46,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Draw
		bra.b	.nextdbf
.nextcleardbf	bsr.b	.clear
.nextdbf	addq	#1,a2
		add	#5*2,a3
		addq.l	#2,_TuneLinePtr(a5)
		dbf	d7,.nextloop
		bra.b	.end

.clearend	bsr.b	.clear
		addq	#1,a2
		add	#5*2,a3
		addq.l	#2,_TuneLinePtr(a5)
		dbf	d7,.clearend

.end		clr.b	_StepArrowClear(a5)
		move.l	d6,a0
		move	#$ffff,rp_LinePtrn(a0)
		movem.l	(sp)+,d0-a6
		rts

.clear		movem.l	d0-a6,-(sp)
		bsr	SetAPenCol0
		moveq	#0,d2
		move.b	8(a2),d2			Old TunePos Arrow
		cmp	NumYPos(a4),d2
		bhi.b	.exitclear
		move	Y1CharPos(a4),d1		Ycoord
		mulu	#6,d2
		add	d2,d1
		move.l	_TuneLinePtr(a5),a0
		clr	(a0)
		move	(a3),d0
		move	d1,d3
		move.l	d6,a1
		CallLib Move
		move	(a3),d0
		add	#46,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Draw
.exitclear	movem.l	(sp)+,d0-a6
		rts


StepArrower	bclr	#Msg_StepArrow,_SigMsg+3(a5)
		bsr	StepArrow
		bra	Wait8

_PartPosSave	rs.b	1
		rs.b	1

PartArrowMark	lea	PartMarkEdDefs,a4
		bra.b	PartArrowSkip
PartArrow	lea	PartEditorDefs,a4

PartArrowSkip	btst	#7,_MarkEd(a5)
		beq.b	.nomark
		rts
.nomark		movem.l	d0-a6,-(sp)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	NormalDrawMode1
		jsr	SetFont8
		move.l	d6,a0
		move	#$aaaa,rp_LinePtrn(a0)
		or	#FRST_DOT,rp_Flags(a0)
		move.b	#15,rp_linpatcnt(a0)

		lea	_ArrowPartPos(a5),a2
		move.b	(a2),_PartPosSave(a5)	
.set		tst.b	_PlayPart(a5)
		bne.b	.scrollpart
		tst.b	_PlayTune(a5)
		beq	.clearend
		tst.b	_FollowChannel(a5)
		bne.b	.scrollpart
		move.l	_ChannelPtr(a5),a3
		moveq	#0,d1
		move.b	ch_TunePos(a3),d1
		add	d1,d1
		lea	TuneEditorDefs,a3
		moveq	#0,d0
		move	CursorXPos(a3),d0
		divu	#5,d0		
		lsl	#2,d0
		move.l	TunePtr,a3
		move.l	tune_Ch1Ptr(a3,d0.w),a3
		moveq	#0,d0
		move.b	(a3,d1.w),d0
		move.b	1(a3,d1.w),d1
		btst	#5,d1
		bne	.clearend
		and	#$c0,d1
		lsl	#2,d1
		or	d1,d0
		cmp	_PartNum(a5),d0
		bne	.clearend
		bra	.ok

.scrollpart	tst.b	_ScrollPart(a5)
		beq	.ok
		cmp.b	#2,_ScrollPart(a5)
		beq	.ok
		cmp.b	#2,_TunePart(a5)
		bne.b	.nopartedit
		jsr	CursorSave

.nopartedit	moveq	#0,d2
		move.b	_PartPosSave(a5),d2				New PartPos
		move	d2,d2
		move	ScrollDownPos(a4),d3
		sub	d3,d2
		bge.b	.done1
		moveq	#0,d2

.done1		move	#$7f,d3
		sub	NumYPos(a4),d3
		cmp	d3,d2
		bls.b	.done2
		move	d3,d2
.done2		moveq	#0,d3
		move.b	_PartPosSave(a5),d3				New PartPos
		sub	d2,d3
		move	d3,CursorYPos(a4)
		move	d2,d0

		move	MinYPos(a4),d1
		sub	d1,d2
		bne.b	.scroll
		cmp.b	#2,_TunePart(a5)
		bne.b	.ok
		jsr	CursorDraw
		bra.b	.ok

.scroll		movem.l	a2/a3,-(sp)
		subq	#1,d2
		bne.b	.printpart
		jsr	CursorDownScroll
		cmp.b	#2,_TunePart(a5)
		bne.b	.restoreregs
		bra.b	.cursordraw
.printpart	move	d0,MinYPos(a4)
		bsr	PrintPart
		cmp.b	#2,_TunePart(a5)
		bne.b	.restoreregs
.cursordraw	jsr	CursorDraw
.restoreregs	movem.l	(sp)+,a2/a3

.ok		tst.b	_PartArrowClear(a5)
		bne.b	.clearend
		moveq	#0,d2
		move.b	_PartPosSave(a5),d2				New PartPos Arrow
		sub	MinYPos(a4),d2
		bmi.b	.clearend
		cmp	NumYPos(a4),d2
		bhi.b	.clearend
		move.b	d2,d3
		move	Y1CharPos(a4),d1		Ycoord
		addq	#1,d1
		lsl	#3,d2
		add	d2,d1
		cmp	_PartLineYPos(a5),d1
		beq.b	.end
		bsr.b	.clear
		move	d1,_PartLineYPos(a5)
		move.b	d3,1(a2)			Update the Old PartLineScreenPos
		move.l	d1,-(sp)
		bsr	NormalDrawMode1
		move.l	(sp)+,d1
		move	X1CharPos(a4),d0
		add	#24,d0
		move	d0,d2
		move	d1,d3
		move.l	d6,a1
		CallLib Move
		move	d2,d0
		add	#46,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Draw
		bra.b	.end

.clearend	bsr.b	.clear

.end		move.l	d6,a0
		move	#$ffff,rp_LinePtrn(a0)
		clr.b	_PartArrowClear(a5)
		movem.l	(sp)+,d0-a6
		rts

.clear		movem.l	d0-a6,-(sp)
		moveq	#0,d2
		move.b	1(a2),d2			Old PartLineScreenPos
		cmp	NumYPos(a4),d2
		bhi.b	.exitclear
		clr	_PartLineYPos(a5)
		bsr	NormalDrawMode1
		bsr	SetAPenCol0
		move	Y1CharPos(a4),d1		Ycoord
		addq	#1,d1
		lsl	#3,d2
		add	d2,d1
		move	X1CharPos(a4),d0
		add	#24,d0
		move	d0,d2
		move	d1,d3
		move.l	d6,a1
		CallLib Move
		move	d2,d0
		add	#46,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Draw
.exitclear	movem.l	(sp)+,d0-a6
		rts

PartArrower	bclr	#Msg_PartArrow,_SigMsg+3(a5)
		bsr	PartArrow
		bra	Wait9

PrintParter	movem.l	d0-a6,-(sp)
		jsr	PrintPartNum
		lea	PartEditorDefs,a4
		cmp.b	#2,_TunePart(a5)
		bne.b	.notinpart
		jsr	PrintPart
		bra.b	.inpart
.notinpart	jsr	PrintPart
.inpart		bsr	PartArrow
		movem.l	(sp)+,d0-a6
		bclr	#Msg_PrintPart,_SigMsg+3(a5)
		bra	Wait10


*****************************************************************************
* VU Meters                                  * Christian Cyréus - Musicline *
*****************************************************************************

_VUMixBuf15	rs.b	16
_VUMixBuf26	rs.b	16
_VUMixBuf37	rs.b	16
_VUMixBuf48	rs.b	16

VUMeters	move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6

		move	#RP_JAM2,d0
		move.l	d6,a1
		CallLib SetDrMd
		move.l	d6,a0
		move.l	#%00000000000000000000000000000001,d0
		bsr	WriteMask

		lea	ChannelPointers,a3
		moveq	#68,d5			First Left XCoord
		moveq	#8-1,d7

.next		move.l	(a3)+,a4
		move	ch_VUAmp(a4),d2
		move	d2,d4
		move	ch_VUOldAmp(a4),d3
		cmp	d2,d3
		beq.b	.nextdbf
		blo.b	.up

.down		addq	#1,d2
		moveq	#0,d0
		move.l	d6,a1
		CallLib SetAPen
		bra.b	.coordsdone

.up		addq	#1,d3
		exg	d2,d3
		moveq	#1,d0
		move.l	d6,a1
		CallLib SetAPen

.coordsdone	moveq	#41,d1			Top YCoord
		sub	d3,d1
		moveq	#41,d3			Lower YCoord
		sub	d2,d3
		move	d5,d0			Left XCoord
		move	d0,d2
		add	#11,d2			Right XCoord
		move.l	d6,a1
		CallLib RectFill
		move	d4,ch_VUOldAmp(a4)	Update Old YPos

.nextdbf	add	#56,d5
		dbf	d7,.next
		rts

VUMetersWait	bclr	#Msg_VUMeters,_SigMsg+2(a5)
		bsr	VUMeters
		bra	Wait11

VUCounter	SSP	d0-a6
		lea	ChannelPointers,a0
		moveq	#4-1,d7

.nextloop	move.l	(a0)+,a4
		tst.l	ch_VUWsPointer(a4)
		beq	.nextdbf
		cmp.l	#ZeroSample,ch_VUWsPointer(a4)
		beq	.nextdbf

.getpeak	tst	_VUOnOff(a5)
		beq	.vuampdone
		tst.b	ch_ChannelOff(a4)
		bne.b	.vuampdone
		move.l	ch_VUWsPointer(a4),a1
		move.l	ch_VUWsLength(a4),d2
		moveq	#32,d3
		moveq	#0,d0
		moveq	#0,d1

.subagain	sub.l	d3,d2
		bpl.b	.vu2

		move	d3,d6
		add	d2,d3
		lsr	#1,d6
		subq	#1,d6
		beq.b	.vudone
		move.l	d2,d3
		neg.l	d3
.vuloop1	move.b	(a1)+,d0
		bpl.b	.vuplus1
		neg.b	d0
.vuplus1	cmp	d0,d1
		bhi.b	.vuhigh1
		move	d0,d1
.vuhigh1	addq	#1,a1
		dbf	d6,.vuloop1
		cmp.l	#ZeroSample,ch_VUWsRepPointer(a4)
		beq.b	.vudone
		move.l	ch_VUWsRepPointer(a4),a1
		move.l	ch_VUWsRepLength(a4),d2
		bra.b	.subagain

.vu2		moveq	#16-1,d6
.vuloop2	move.b	(a1)+,d0
		bpl.b	.vuplus2
		neg.b	d0
.vuplus2	cmp	d0,d1
		bhi.b	.vuhigh2
		move	d0,d1
.vuhigh2	addq	#1,a1
		dbf	d6,.vuloop2

.vudone		mulu	ch_VUVolume(a4),d1
		lsr	#6,d1
		addq	#7,d1
		lsr	#3,d1
		cmp	#$f,d1
		bls.b	.vumax
		move	#$f,d1
.vumax		tst	_VUOnOff(a5)
		beq.b	.vuampdone
		cmp	ch_VUAmp(a4),d1
		blo.b	.vuampdone
		move	d1,ch_VUAmp(a4)

.vuampdone	move.l	_TimerValue4(a5),d0
		move	ch_VUPeriod(a4),d1
		beq.b	.nextdbf
		divu	d1,d0			; = smpls/irq
		ext.l	d0
		move.l	ch_VUWsLength(a4),d1

		sub.l	d0,d1
		bpl.b	.norestart
		cmp.l	#ZeroSample,ch_VUWsRepPointer(a4)
		bne.b	.smplloop
		move.l	ch_VUWsRepPointer(a4),ch_VUWsPointer(a4)
		bra.b	.nextdbf

.subagain2	sub.l	d0,d1
		bpl.b	.norestart
.smplloop	move.l	d1,d0
		neg.l	d0
		move.l	ch_VUWsRepLength(a4),d1
		move.l	ch_VUWsRepPointer(a4),ch_VUWsPointer(a4)
		bra.b	.subagain2

.norestart	move.l	d1,ch_VUWsLength(a4)
		add.l	d0,ch_VUWsPointer(a4)

.nextdbf	dbf	d7,.nextloop
		LSP	d0-a6
		rts


CalcVUTimer	SSP	d0-d2/a0
		jsr	GetTune
		move.l	_TimerValue1(a5),d0
		divu	tune_Tempo(a0),d0
		move.l	_TimerValue3(a5),d1
		divu	d0,d1			; = irqs/second
		move.l	_TimerValue2(a5),d2
		divu	d1,d2
		moveq	#0,d0
		move	_TimerValue2(a5),d0
		divu	d1,d0
		swap	d0
		move	d2,d0
		move.l	d0,_TimerValue4(a5)
		LSP	d0-d2/a0
		rts

* Twins/PHA *****************************************************************
* Wait for signals and messages                       Last Change: 92-10-24 *
*****************************************************************************

_Message	rs.l	1
_Signals	rs.l	1
_WaitSigMask	rs.l	1
_UPort1SigNum	rs.b	1
_UPort2SigNum	rs.b	1

Wait		move.l	_WaitSigMask(a5),d0
		CallSys Wait
		move.l	d0,_Signals(a5)
		beq	Wait
		move.b	_UPort1SigNum(a5),d1
		beq.b	.return1
		btst	d1,d0
		beq.b	.return1
		pea	.return1
		bra	UserPort1
.return1	move.l	_Signals(a5),d0
		move.b	_UPort2SigNum(a5),d1
		beq.b	.return2
		btst	d1,d0
		beq.b	.return2
		pea	.return2
		bra	UserPort2
.return2	move.l	_Signals(a5),d0
		move.l	_Signal(a5),d1
		btst	d1,d0
		beq.b	Wait12
		tst.l	_SigMsg(a5)
		beq.b	Wait12
		btst	#Msg_CpuToSlow,_SigMsg+3(a5)
		bne	CpuToSlow
Wait3		btst	#Msg_StartTimer,_SigMsg+3(a5)
		bne	StartTimer
Wait4		btst	#Msg_StartAudio,_SigMsg+3(a5)
		bne	StartAudio
Wait5		btst	#Msg_MouseButton,_SigMsg+3(a5)
		bne	MouseButton
Wait6		btst	#Msg_StepShower,_SigMsg+3(a5)
		bne	StepShower
Wait7		btst	#Msg_StepArrow,_SigMsg+3(a5)
		bne	StepArrower
Wait8		btst	#Msg_PartArrow,_SigMsg+3(a5)
		bne	PartArrower
Wait9		btst	#Msg_PrintPart,_SigMsg+3(a5)
		bne	PrintParter
Wait10		btst	#Msg_VUMeters,_SigMsg+2(a5)
		bne	VUMetersWait
Wait11		btst	#Msg_DrawVisual,_SigMsg+2(a5)
		beq.b	Wait12
		jsr	DrawVisual
Wait12		tst.l	_Window5(a5)
		beq.b	.return5
		move.l	_Signals(a5),d0
		move	_UPort5SigNum(a5),d1
		btst	d1,d0
		beq.b	.return5
		pea	.return5
		bra	UserPort5
.return5	tst.l	_Window6(a5)
		beq.b	.return6
		move.l	_Signals(a5),d0
		move	_UPort6SigNum(a5),d1
		btst	d1,d0
		beq.b	.return6
		pea	.return6
		jmp	UserPort6
.return6	tst.l	_Window7(a5)
		beq.b	.return7
		move.l	_Signals(a5),d0
		move	_UPort7SigNum(a5),d1
		btst	d1,d0
		beq.b	.return7
		pea	.return7
		bra	UserPort7
.return7
		tst.l	_Window8(a5)
		beq.b	.return8
		move.l	_Signals(a5),d0
		move	_UPort8SigNum(a5),d1
		btst	d1,d0
		beq.b	.return8
		pea	.return8
		jmp	UserPort8
.return8
		tst.l	_FxHelp2Req(a5)
		beq.b	.wait
		move.l	_Signals(a5),d0
		move	_FxHelp2SigNum(a5),d1
		btst	d1,d0
		beq.b	.wait
		pea	.wait
		jmp	CheckFxHelp2Req
.wait		bra	Wait

UserPort1	move.l	_UserPort1(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,_Message(a5)
		bne.b	.ok
		rts
.ok		pea	.reply
		move.l	_Message(a5),a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_RAWKEY,d0
		beq	RawKeyPressed1
		cmp.l	#IDCMP_GADGETUP,d0
		beq	GadgetSelected1
		cmp.l	#IDCMP_GADGETDOWN,d0
		beq	GadgetSelected1
		cmp.l	#IDCMP_MOUSEMOVE,d0
		beq	GadgetSelected1
		cmp.l	#IDCMP_MENUPICK,d0
		beq	MenuSelected1
		cmp.l	#IDCMP_ACTIVEWINDOW,d0
		beq	ActiveWindow1
		cmp.l	#IDCMP_INACTIVEWINDOW,d0
		beq	InActiveWindow1
		rts
.reply		move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		bra	UserPort1

UserPort2	move.l	_UserPort2(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,_Message(a5)
		bne.b	.ok
		rts
.ok		pea	.reply
		move.l	_Message(a5),a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_RAWKEY,d0
		beq	RawKeyPressed2
		cmp.l	#IDCMP_GADGETUP,d0
		beq	GadgetSelected2
		cmp.l	#IDCMP_GADGETDOWN,d0
		beq	GadgetSelected2
		cmp.l	#IDCMP_MOUSEMOVE,d0
		beq	GadgetSelected2
		cmp.l	#IDCMP_MENUPICK,d0
		beq	MenuSelected2
		cmp.l	#IDCMP_ACTIVEWINDOW,d0
		beq.b	ActiveWindow2
		cmp.l	#IDCMP_INACTIVEWINDOW,d0
		beq	InActiveWindow2
		cmp.l	#IDCMP_INTUITICKS,d0
		bne.b	.exit
		jmp	CheckFxHelp2Req
.exit		rts
.reply		move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
		bra	UserPort2

* Twins/PHA *****************************************************************
* message handlers                                    Last Change: 92-10-24 *
*****************************************************************************
* a4 <= message                                                             *

_Qualifier	rs.w	1
_RawKey		rs.b	1
_AscIIKey	rs.b	1

_ie_Event	rs.l	1
_ie_Class	rs.b	1
		rs.b	1
_ie_Code	rs.w	1
_ie_Qual	rs.w	1
_ie_Addr	rs.l	1
		rs.l	1
		rs.l	1

_ActiveWindows	rs.b	1
_AudioChannels	rs.b	1

ActiveWindow1	bset	#0,_ActiveWindows(a5)
		tst.b	_AudioChannels(a5)
		bne.b	.tint
		bsr	AllocChannels
		bne.b	.tint
		clr.b	_AudioChannels(a5)
		bra.b	.exit
.tint		tst.l	_RemTimers(a5)
		bne.b	.exit
		jsr	AddTimers
.exit		rts

InActiveWindow1	bclr	#0,_ActiveWindows(a5)
		move.l	_IntuitionBase(a5),a0
		move.l	ib_ActiveScreen(a0),a1
		cmp.l	_Screen(a5),a1
		beq.b	.exit
		tst	_PlayTune(a5)
		bne.b	.exit
		jsr	RemTimers
		bsr	FreeChannels
		bsr	Stoppa
.exit		rts

ActiveWindow2	bset	#1,_ActiveWindows(a5)
		tst.b	_AudioChannels(a5)
		bne.b	.vbint
		bsr	AllocChannels
		bne.b	.vbint
		clr.b	_AudioChannels(a5)
		bra.b	.exit
.vbint		tst.l	_RemTimers(a5)
		bne.b	.exit
		jsr	AddTimers
.exit		rts

InActiveWindow2	bclr	#1,_ActiveWindows(a5)
		move.l	_IntuitionBase(a5),a0
		move.l	ib_ActiveScreen(a0),a1
		cmp.l	_Screen(a5),a1
		beq.b	.exit
		tst	_PlayTune(a5)
		bne.b	.exit
		jsr	RemTimers
		bsr	FreeChannels
		bsr	Stoppa
.exit		rts

GadgetSelected1	move.l	im_IAddress(a4),a0
		move	im_Qualifier(a4),_Qualifier(a5)
		move.l	gg_UserData(a0),d1
		bne.b	.ok
		rts
.ok		move.l	d1,a1
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		jmp	(a1)

GadgetSelected2	move.l	im_IAddress(a4),a0
		move	im_Qualifier(a4),_Qualifier(a5)
		move.l	gg_UserData(a0),d1
		bne.b	.ok
		rts
.ok		move.l	d1,a1
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		jmp	(a1)

MenuSelected1	move	im_Code(a4),d0
		move	im_Qualifier(a4),_Qualifier(a5)
		move.l	_Menus1(a5),a0
		CallIntuition ItemAddress
		tst.l	d0
		beq.b	.reply
		move.l	d0,a0
		move.l	mi_SIZEOF(a0),a0
		cmp.l	#0,a0
		beq.b	.reply
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		jmp	(a0)
.reply		rts

MenuSelected2	move	im_Code(a4),d0
		move	im_Qualifier(a4),_Qualifier(a5)
		move.l	_Menus2(a5),a0
		CallIntuition ItemAddress
		tst.l	d0
		beq.b	.reply
		move.l	d0,a0
		move.l	mi_SIZEOF(a0),a0
		cmp.l	#0,a0
		beq.b	.reply
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		jmp	(a0)
.reply		rts

RawKeyPressed1	move	im_Code(a4),d0
		move.b	d0,_RawKey(a5)
		btst	#7,d0
		bne	.exit
		move	im_Qualifier(a4),_Qualifier(a5)
		bsr	RawKeyPressed
		tst	d0
		bne.b	.next
		move	_Qualifier(a5),d1
		btst	#IEQUALIFIERB_REPEAT,d1
		bne.b	.reply
		move.l	_Window2(a5),d7
		move.l	d7,a0
		CallIntuition WindowToFront
		move.l	d7,a0
		CallLib ActivateWindow
.reply		rts
.next		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		cmp.b	#1,_HexNumEd1+1(a5)
		bne.b	.checkcharnum
		jmp	EditHexNum1
.checkcharnum	cmp.b	#2,_HexNumEd1+1(a5)
		bne.b	.checkkeys
		jmp	EditCharNum1
.checkkeys	move	_Qualifier(a5),d1
		btst	#IEQUALIFIERB_RCOMMAND,d1
		beq.b	.skip
		cmp.b	#$b,d0
		bne.b	.next2
		jmp	AMinus
.next2		cmp.b	#$c,d0
		bne.b	.skip
		jmp	APlus
.skip		cmp	#$55,d0
		beq	PlayTuneGad
		btst	#IEQUALIFIERB_REPEAT,d1
		bne.b	.ok
		btst	#IEQUALIFIERB_LSHIFT,d1
		beq.b	.rshift
		bsr	ShiftDown1
.rshift		btst	#IEQUALIFIERB_RSHIFT,d1
		beq.b	.tab
		bsr	ShiftDown1
.tab		cmp	#$42,d0
		beq	TogglePart
		cmp	#$40,d0
		beq	Stop
		cmp	#$50,d0
		beq	OctaveKeys
		cmp	#$51,d0
		beq	EditOnOff2
		cmp	#$56,d0
		beq	PlayPartGad
		cmp	#$5f,d0
		beq	OpenWindow7
		btst	#IEQUALIFIERB_RCOMMAND,d1
		bne	RightAmigaDown1
		btst	#IEQUALIFIERB_RALT,d1
		bne	RightAltDown1
.ok		btst	#7,_MarkEd(a5)
		beq.b	.next1
		jmp	MarkEditor
.next1		cmp.b	#1,_TunePart(a5)
		bne.b	.skipvoice
		jmp	VoiceEditor
.skipvoice	cmp.b	#2,_TunePart(a5)
		bne.b	.exit
		jmp	PartEditor
.exit		rts


RawKeyPressed2	move	im_Code(a4),d0
		move.b	d0,_RawKey(a5)
		btst	#7,d0
		bne	.exit
		move	im_Qualifier(a4),_Qualifier(a5)
		bsr	RawKeyPressed
		tst	d0
		bne.b	.next
		move	_Qualifier(a5),d1
		btst	#IEQUALIFIERB_REPEAT,d1
		bne.b	.reply
		move.l	_Window1(a5),d7
		move.l	d7,a0
		CallIntuition WindowToFront
		move.l	d7,a0
		CallLib ActivateWindow
.reply		rts
.next		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		cmp.b	#1,_HexNumEd2+1(a5)
		bne.b	.checkcharnum
		jmp	EditHexNum2
.checkcharnum	cmp.b	#2,_HexNumEd2+1(a5)
		bne.b	.checkkeys
		jmp	EditCharNum2
.checkkeys	cmp	#$55,d0
		beq	PlayTuneGad
		move	_Qualifier(a5),d1
		btst	#IEQUALIFIERB_REPEAT,d1
		bne.b	.ok
		btst	#IEQUALIFIERB_LSHIFT,d1
		beq.b	.rshift
		bsr	ShiftDown2
.rshift		btst	#IEQUALIFIERB_RSHIFT,d1
		beq.b	.space
		bsr	ShiftDown2
.space		cmp	#$40,d0
		beq	Stop
		cmp	#$50,d0
		beq	OctaveKeys
		cmp	#$51,d0
		beq	ArpEdOnOff2
		cmp	#$56,d0
		beq	PlayPartGad
		cmp	#$5f,d0
		bne.b	.next2
		jmp	FxHelp2Req
.next2		btst	#IEQUALIFIERB_RCOMMAND,d1
		bne	RightAmigaDown2
		btst	#IEQUALIFIERB_RALT,d1
		bne	RightAltDown2
.ok		btst	#3,_MarkEd(a5)
		beq.b	.next1
		jmp	ArpgMarkEditor
.next1		tst.b	_Arpg(a5)
		beq.b	.exit
		jmp	ArpgEditor
.exit		rts

;;Decrypt_ID1	dc.l	(Decrypt_ID1_EQU&$00000007)<<(7*4+1)!(Decrypt_ID1_EQU&$fffffff8)>>3
;;ID1_Offset	equ	Decrypt_ID1-Main

RawKeyPressed	move.b	#IECLASS_RAWKEY,_ie_Class(a5)
		move	d0,_ie_Code(a5)
		move	im_Qualifier(a4),_ie_Qual(a5)
		move.l	im_IAddress(a4),_ie_Addr(a5)
		moveq	#1,d1
		lea	_ie_Event(a5),a0
		lea	_AscIIKey(a5),a1
		sub.l	a2,a2
		move.l	_ConDevice(a5),a6
		CallLib RawKeyConvert
		tst.l	d0
		bgt.b	.noerror
		clr.b	_AscIIKey(a5)
.noerror	move	im_Code(a4),d0
		rts

ShiftDown1	cmp	#$50,d0
		beq	PolyOnOff
		cmp	#$51,d0
		beq	EditMode1
		rts

ShiftDown2	cmp	#$50,d0
		beq	PolyOnOff
		cmp	#$51,d0
		beq	ArpEdMode2
		rts

RightAmigaDown1	move.b	_RawKey(a5),d2
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.shiftdown
		cmp.b	#$14,d2
		beq	AddTune
		cmp.b	#$16,d2
		beq	TransAllPartNoteUp
		cmp.b	#$22,d2
		beq	TransAllPartNoteDown
		rts
.shiftdown	cmp.b	#$14,d2
		beq	RemoveTune
		cmp.b	#$16,d2
		beq	TransAllPartOctaUp
		cmp.b	#$22,d2
		beq	TransAllPartOctaDown
		rts

RightAltDown1	move.b	_RawKey(a5),d2
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.shiftdown
		cmp.b	#$14,d2
		beq	ClrTune
		cmp.b	#$16,d2
		beq	TransPartNoteUp
		cmp.b	#$22,d2
		beq	TransPartNoteDown
		rts
.shiftdown	cmp.b	#$16,d2
		beq	TransPartOctaUp
		cmp.b	#$22,d2
		beq	TransPartOctaDown
		rts

RightAmigaDown2	move.b	_RawKey(a5),d2
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.shiftdown
		cmp.b	#$17,d2
		beq	AddInst
		rts
.shiftdown	cmp.b	#$17,d2
		beq	RemoveInst
		cmp.b	#$11,d2
		beq	RemoveWs
		rts

RightAltDown2	move.b	_RawKey(a5),d2
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.x
		cmp.b	#$17,d2
		beq	RemUnusedInsts
		cmp.b	#$11,d2
		beq	RemoveUnWs
		cmp.b	#$12,d2
		beq	RemoveEqWs
.x		rts

Menu1Swap	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst	_HexNumEd1(a5)
		bne.b	.reply
		cmp.b	#1,_TunePart(a5)
		beq	SwapVoice
		cmp.b	#2,_TunePart(a5)
		beq	SwapPart
.reply		rts

Menu1Cut	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst	_HexNumEd1(a5)
		bne.b	.reply
		cmp.b	#1,_TunePart(a5)
		beq	CutVoice
		cmp.b	#2,_TunePart(a5)
		beq	CutPart
.reply		rts

Menu1Copy	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst	_HexNumEd1(a5)
		bne.b	.reply
		cmp.b	#1,_TunePart(a5)
		beq	CopyVoice
		cmp.b	#2,_TunePart(a5)
		beq	CopyPart
.reply		rts

Menu1Paste	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst.b	_PlayPart(a5)
		bne.b	.reply
		tst	_HexNumEd1(a5)
		bne.b	.reply
		cmp.b	#1,_TunePart(a5)
		beq	PasteVoice
		cmp.b	#2,_TunePart(a5)
		beq	PastePart
.reply		rts

Menu1Mark	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst.b	_PlayPart(a5)
		bne.b	.reply
		tst	_HexNumEd1(a5)
		bne.b	.reply
		cmp.b	#1,_TunePart(a5)
		beq	MarkVoice
		cmp.b	#2,_TunePart(a5)
		beq	MarkPart
.reply		rts

Menu2Cut	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst.b	_PlayPart(a5)
		bne.b	.reply
		tst	_HexNumEd2(a5)
		bne.b	.reply
		tst.b	_Arpg(a5)
		beq	CutInst
		bra	CutArpg
.reply		rts

Menu2Copy	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst.b	_PlayPart(a5)
		bne.b	.reply
		tst	_HexNumEd2(a5)
		bne.b	.reply
		tst.b	_Arpg(a5)
		beq	CopyInst
		bra	CopyArpg
.reply		rts

Menu2Paste	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst.b	_PlayPart(a5)
		bne.b	.reply
		tst	_HexNumEd2(a5)
		bne.b	.reply
		tst.b	_Arpg(a5)
		beq	PasteInst
		bra	PasteArpg
.reply		rts

Menu2Swap	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst.b	_PlayPart(a5)
		bne.b	.reply
		tst	_HexNumEd2(a5)
		bne.b	.reply
		tst.b	_Arpg(a5)
		beq	SwapInst
		bra	SwapArpg
.reply		rts

Menu2Mark	tst.b	_PlayTune(a5)
		bne.b	.reply
		tst.b	_PlayPart(a5)
		bne.b	.reply
		tst	_HexNumEd2(a5)
		bne.b	.reply
		tst.b	_Arpg(a5)
		bne	MarkArpg
.reply		rts

SwapPart	tst	_EditOnOff(a5)
		beq.b	.reply			;Message edit off
		cmp.b	#Part,_CopyOf_(a5)
		bne.b	.reply			;Message no part in buffer
		tst	_HexNumEd1(a5)
		bne.b	.reply
		move.b	_MarkEd(a5),d0
		and	#$c0,d0
		bne.b	.reply			;Message you can´t swap part blocks
		lea	PartEditorDefs,a4
		bsr	GetPartPtr
		bsr	AllocPart
		move.l	PartPtr,a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	.reply			;Message out of memory
		lea	_CopyBuffer(a5),a1
		move	#128*3-1,d0
.loop		move.l	(a0),d1
		move.l	(a1),d2
		move.l	d2,(a0)+
		move.l	d1,(a1)+
		dbf	d0,.loop
		bsr	FreePart
		bsr	UpdateParts
.reply		rts

CutPart		tst	_EditOnOff(a5)
		beq	.reply			;Message edit off
		tst	_HexNumEd1(a5)
		bne	.reply
		btst	#7,_MarkEd(a5)
		beq	.part
		move	_TempCopyMarkX(a5),_CopyMarkX1(a5)
		move	_TempCopyMarkY(a5),_CopyMarkY1(a5)
		lea	PartMarkEdDefs,a4
		move	CursorXPos(a4),_CopyMarkX2(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_CopyMarkY2(a5)
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkX1(a5),d0
		move	_CopyMarkX2(a5),d1
		cmp	d0,d1
		bgt.b	.ok
		exg	d0,d1
.ok		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
		bra.b	.okej
.again		addq	#1,d0
.okej		move.l	DataPtr(a4),a0
		move	d0,d4
		add	d4,d4
		add	d4,a0
		move	d2,d4
		mulu	RowSize(a4),d4
		add	d4,a0
		move	d2,d4
		bra.b	.coopy
.copy		addq	#1,d4
.coopy		move	(a0),(a1)+
		clr	(a0)
		add	#12,a0
		cmp	d3,d4
		bne.b	.copy
		cmp	d0,d1
		bne.b	.again
		move	_Qualifier(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		beq.b	.okeej
		jsr	DelPartLines
.okeej		move.b	#Part,_CopyOf_(a5)
		lea	PartMarkEdDefs,a4
		jsr	MarkClear
		lea	PartEditorDefs,a4
		bsr	FreePart
		bsr	PrintPart
		jsr	PaintCursor
		bclr	#7,_MarkEd(a5)
		bset	#6,_MarkEd(a5)
.reply		rts
.part		lea	PartEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	_CopyBuffer(a5),a1
		move	#128*3-1,d0
.loop		move.l	(a0),(a1)+
		clr.l	(a0)+
		dbf	d0,.loop
		move.b	#Part,_CopyOf_(a5)
		and.b	#$3f,_MarkEd(a5)
		bsr	FreePart
		bsr	UpdateParts
		rts

CopyPart	tst	_EditOnOff(a5)
		beq	.reply			;Message edit off
		tst	_HexNumEd1(a5)
		bne	.reply
		btst	#7,_MarkEd(a5)
		beq	.part
		move	_TempCopyMarkX(a5),_CopyMarkX1(a5)
		move	_TempCopyMarkY(a5),_CopyMarkY1(a5)
		lea	PartMarkEdDefs,a4
		move	CursorXPos(a4),_CopyMarkX2(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_CopyMarkY2(a5)
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkX1(a5),d0
		move	_CopyMarkX2(a5),d1
		cmp	d0,d1
		bgt.b	.ok
		exg	d0,d1
.ok		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
		bra.b	.okej
.again		addq	#1,d0
.okej		move.l	DataPtr(a4),a0
		move	d0,d4
		add	d4,d4
		add	d4,a0
		move	d2,d4
		mulu	RowSize(a4),d4
		add	d4,a0
		move	d2,d4
		bra.b	.coopy
.copy		addq	#1,d4
.coopy		move	(a0),(a1)+
		add	#12,a0
		cmp	d3,d4
		bne.b	.copy
		cmp	d0,d1
		bne.b	.again
		move.b	#Part,_CopyOf_(a5)
		lea	PartMarkEdDefs,a4
		jsr	MarkClear
		lea	PartEditorDefs,a4
		bsr	PrintPart
		jsr	PaintCursor
		bclr	#7,_MarkEd(a5)
		bset	#6,_MarkEd(a5)
.reply		rts
.part		lea	PartEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	_CopyBuffer(a5),a1
		move	#128*3-1,d0
.loop		move.l	(a0)+,(a1)+
		dbf	d0,.loop
		move.b	#Part,_CopyOf_(a5)
		and.b	#$3f,_MarkEd(a5)
		rts

PasteInsPart	btst	#7,_MarkEd(a5)
		bne.b	.reply			;Message no part block in buffer
		btst	#6,_MarkEd(a5)
		beq.b	.reply			;Message no part block in buffer
		lea	PartEditorDefs,a4
		move	CursorXPos(a4),d4
		lea	PartMarkEdDefs,a3
		lea	MarkXPos(a3),a2
		move	_CopyMarkX1(a5),d0
		move	_CopyMarkX2(a5),d1
		cmp	d0,d1
		bgt.b	.ok
		exg	d0,d1
.ok		move	d0,d5
		move.b	(a2,d4.w),d0
		cmp	d0,d5
		beq.b	.japp
		tst	d5
		beq.b	.reply		;Message you can´t paste notes on effects
		tst	d0
		beq.b	.reply		;Message you can´t paste effects on notes
.japp		jsr	InsPartLines
		bra.b	PasteIPart
.reply		rts

PastePart	tst	_EditOnOff(a5)
		beq	PastePartReply		;Message edit off
		cmp.b	#Part,_CopyOf_(a5)
		bne	PastePartReply		;Message no part block in buffer
		tst	_HexNumEd1(a5)
		bne	PastePartReply
		move	im_Qualifier(a4),d0
		btst	#IEQUALIFIERB_LSHIFT,d0
		bne	PasteInsPart
		btst	#IEQUALIFIERB_RSHIFT,d0
		bne	PasteInsPart
PasteIPart	btst	#7,_MarkEd(a5)
		bne	PastePartReply		;Message no part block in buffer
		btst	#6,_MarkEd(a5)
		beq	.part
		lea	PartEditorDefs,a4
		bsr	AllocPart
		move.l	DataPtr(a4),a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq	PastePartReply		;Message out of memory
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkX1(a5),d0
		move	_CopyMarkX2(a5),d1
		cmp	d0,d1
		bgt.b	.ok
		exg	d0,d1
.ok		sub	d0,d1
		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
.okej		sub	d2,d3
		lea	PartEditorDefs,a4
		move	CursorXPos(a4),d4
		lea	PartMarkEdDefs,a3
		lea	MarkXPos(a3),a2
		move	d0,d5
		move.b	(a2,d4.w),d0
		cmp	d0,d5
		beq.b	.again
		tst	d5
		beq.b	PastePartReply	;Message you can´t paste notes on effects
		tst	d0
		beq.b	PastePartReply	;Message you can´t paste effects on notes
.again		move.l	DataPtr(a4),a0
		move	d0,d4
		add	d4,d4
		add	d4,a0
		move	CursorYPos(a4),d4
		add	MinYPos(a4),d4
		move	d4,d2
		mulu	RowSize(a4),d4
		add	d4,a0
		move	d3,d4
.copy		move	(a1)+,(a0)
		add	#12,a0
		addq	#1,d2
		cmp	#127,d2
		bgt.b	.next
		subq	#1,d4
		bpl.b	.copy
		bra.b	.skip
.next		subq	#1,d4
		bmi.b	.skip
		addq	#2,a1
		bra.b	.next
.skip		subq	#1,d1
		bmi.b	.done
		addq	#1,d0
		cmp	#5,d0
		ble.b	.again
.done		bsr	UpdateParts
		rts
.part		lea	PartEditorDefs,a4
		bsr	AllocPart
		move.l	PartPtr,a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	PastePartReply		;Message out of memory
		lea	_CopyBuffer(a5),a1
		move	#128*3-1,d0
.loop		move.l	(a1)+,(a0)+
		dbf	d0,.loop
		bsr	UpdateParts
PastePartReply	rts

MarkPart	tst	_EditOnOff(a5)
		beq.b	.reply			;Message edit off
		btst	#7,_MarkEd(a5)
		beq.b	.normal
		lea	PartMarkEdDefs,a4
		jsr	MarkSave
		move	CursorXPos(a4),_TempCopyMarkX(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_TempCopyMarkY(a5)
		jsr	MarkDraw
.reply		rts
.normal		lea	PartEditorDefs,a4
		move	CursorXPos(a4),d0
		lea	PartMarkEdDefs,a3
		lea	MarkXPos(a3),a2
		move.b	(a2,d0.w),d0
		move	d0,_TempCopyMarkX(a5)
		move	d0,CursorXPos(a3)
		move	CursorYPos(a4),d0
		move	d0,CursorYPos(a3)
		move	MinYPos(a4),MinYPos(a3)
		add	MinYPos(a4),d0
		move	d0,_TempCopyMarkY(a5)
		move.l	DataPtr(a4),DataPtr(a3)
		move.l	PrintPtr(a4),PrintPtr(a3)
		bset	#7,_MarkEd(a5)
		bsr	SetFont8
		jsr	CursorClear
		lea	PartMarkEdDefs,a4
		jsr	MarkSave
		jsr	PaintMark
		rts

RemUnusedParts	jsr	InputOff
		jsr	CheckLowChipMem
		tst.l	d6
		beq.b	.skip
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemParts_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	.exita

.skip		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		lea	_CopyBuffer(a5),a3
		lea	(a3),a0
		move	#$400-1,d7
.clearbuffer	clr.b	(a0)+
		dbf	d7,.clearbuffer
		lea	_TunePtrs(a5),a0
		lea	_ZeroBuffer(a5),a4
		move	_TuneMaxNum(a5),d7
.loop1		move.l	(a0)+,a1
		move.l	tune_Ch1Ptr(a1),a2
		bsr.b	.checkchannel
		move.l	tune_Ch2Ptr(a1),a2
		bsr.b	.checkchannel
		move.l	tune_Ch3Ptr(a1),a2
		bsr.b	.checkchannel
		move.l	tune_Ch4Ptr(a1),a2
		bsr.b	.checkchannel
		move.l	tune_Ch5Ptr(a1),a2
		bsr.b	.checkchannel
		move.l	tune_Ch6Ptr(a1),a2
		bsr.b	.checkchannel
		move.l	tune_Ch7Ptr(a1),a2
		bsr.b	.checkchannel
		move.l	tune_Ch8Ptr(a1),a2
		bsr.b	.checkchannel
		dbf	d7,.loop1

		lea	_PartPtrs(a5),a2
		moveq	#0,d6
		move	#$400-1,d7
		
.nextpart	move.l	(a2)+,a1
		cmp.l	a1,a4
		beq.b	.nextpartdbf
		tst.b	(a3,d6.w)
		bne.b	.nextpartdbf
		move.l	#part_SIZEOF,d0
		CallSys FreeMem
		move.l	a4,-4(a2)
.nextpartdbf	addq	#1,d6
		dbf	d7,.nextpart

.exit		move.l	_RastPort1(a5),d6
		move.l	_GfxBase(a5),a6
		bsr	ExitTunePart
		bsr	UpdateParts
.exita		jsr	InputOn
		clr	_BlockPlay(a5)
		rts

.checkchannel	cmp.l	a2,a4
		beq.b	.x
		move	#$100-1,d6
.nextstep	btst	#5,1(a2)
		bne.b	.nextdbf
		move.b	1(a2),d0
		and	#$c,d0
		lsl	#2,d0
		move.b	(a2),d0
		move.b	#1,(a3,d0.w)
.nextdbf	addq	#2,a2
		dbf	d6,.nextstep
.x		rts

SwapVoice	tst	_EditOnOff(a5)
		beq.b	.reply			;Message edit off
		cmp.b	#Voice,_CopyOf_(a5)
		bne.b	.reply			;Message no voice in buffer
		tst	_HexNumEd1(a5)
		bne.b	.reply
		move.b	_MarkEd(a5),d0
		and	#$c0,d0
		bne.b	.reply			;Message you can´t swap voice blocks
		bsr	GetVoicePtr
		lea	_CopyBuffer(a5),a1
		move	#255,d0
.loop		move	(a0),d1
		move	(a1),d2
		move	d2,(a0)+
		move	d1,(a1)+
		dbf	d0,.loop
		bsr	PrintTune
.reply		rts

CutVoice	tst	_EditOnOff(a5)
		beq	.reply			;Message edit off
		tst	_HexNumEd1(a5)
		bne	.reply
		btst	#7,_MarkEd(a5)
		beq	.voice
		move	_TempCopyMarkX(a5),_CopyMarkX1(a5)
		move	_TempCopyMarkY(a5),_CopyMarkY1(a5)
		lea	TuneMarkEdDefs,a4
		move	CursorXPos(a4),_CopyMarkX2(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_CopyMarkY2(a5)
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkX1(a5),d0
		move	_CopyMarkX2(a5),d1
		cmp	d0,d1
		bgt.b	.ok
		exg	d0,d1
.ok		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
		bra.b	.okej
.again		addq	#1,d0
.okej		lea	TuneEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	tune_Ch1Ptr(a0),a0
		move	d0,d4
		lsl	#2,d4
		move.l	(a0,d4.w),a0
		move	d2,d4
		add	d4,d4
		add	d4,a0
		move	d2,d4
		bra.b	.coopy
.copy		addq	#1,d4
.coopy		move	(a0),(a1)+
		move	#$0010,(a0)+
		cmp	d3,d4
		bne.b	.copy
		cmp	d0,d1
		bne.b	.again
		move	_Qualifier(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		beq.b	.okeej
		jsr	DelVoiceLines
.okeej		move.b	#Voice,_CopyOf_(a5)
		lea	TuneMarkEdDefs,a4
		jsr	MarkClear
		lea	TuneEditorDefs,a4
		bsr	PrintTune
		bsr	PaintCursor
		bclr	#7,_MarkEd(a5)
		bset	#6,_MarkEd(a5)
.reply		rts
.voice		bsr	GetVoicePtr
		lea	_CopyBuffer(a5),a1
		move	#255,d0
.loop		move	(a0),(a1)+
		move	#$0010,(a0)+
		dbf	d0,.loop
		move.b	#Voice,_CopyOf_(a5)
		and.b	#$3f,_MarkEd(a5)
		bsr	PrintTune
		rts

CopyVoice	tst	_EditOnOff(a5)
		beq	.reply			;Message edit off
		tst	_HexNumEd1(a5)
		bne	.reply
		btst	#7,_MarkEd(a5)
		beq	.voice
		move	_TempCopyMarkX(a5),_CopyMarkX1(a5)
		move	_TempCopyMarkY(a5),_CopyMarkY1(a5)
		lea	TuneMarkEdDefs,a4
		move	CursorXPos(a4),_CopyMarkX2(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_CopyMarkY2(a5)
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkX1(a5),d0
		move	_CopyMarkX2(a5),d1
		cmp	d0,d1
		bgt.b	.ok
		exg	d0,d1
.ok		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
		bra.b	.okej
.again		addq	#1,d0
.okej		lea	TuneEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	tune_Ch1Ptr(a0),a0
		move	d0,d4
		lsl	#2,d4
		move.l	(a0,d4.w),a0
		move	d2,d4
		add	d4,d4
		add	d4,a0
		move	d2,d4
		bra.b	.coopy
.copy		addq	#1,d4
.coopy		move	(a0)+,(a1)+
		cmp	d3,d4
		bne.b	.copy
		cmp	d0,d1
		bne.b	.again
		move.b	#Voice,_CopyOf_(a5)
		lea	TuneMarkEdDefs,a4
		jsr	MarkClear
		lea	TuneEditorDefs,a4
		bsr	PrintTune
		bsr	PaintCursor
		bclr	#7,_MarkEd(a5)
		bset	#6,_MarkEd(a5)
.reply		rts
.voice		bsr	GetVoicePtr
		lea	_CopyBuffer(a5),a1
		move	#255,d0
.loop		move	(a0)+,(a1)+
		dbf	d0,.loop
		move.b	#Voice,_CopyOf_(a5)
		and.b	#$3f,_MarkEd(a5)
		rts

PasteInsVoice	btst	#7,_MarkEd(a5)
		bne.b	.reply		;Message no voice block in buffer
		btst	#6,_MarkEd(a5)
		beq.b	.reply		;Message no voice block in buffer
		jsr	InsVoiceLines
		bra.b	PasteIVoice
.reply		rts

PasteVoice	tst	_EditOnOff(a5)
		beq	PasteVoiceReply		;Message edit off
		cmp.b	#Voice,_CopyOf_(a5)
		bne	PasteVoiceReply		;Message no voice block in buffer
		tst	_HexNumEd1(a5)
		bne	PasteVoiceReply
		move	im_Qualifier(a4),d0
		btst	#IEQUALIFIERB_LSHIFT,d0
		bne	PasteInsVoice
		btst	#IEQUALIFIERB_RSHIFT,d0
		bne	PasteInsVoice
PasteIVoice	btst	#7,_MarkEd(a5)
		bne	PasteVoiceReply		;Message no voice block in buffer
		btst	#6,_MarkEd(a5)
		beq.b	.voice
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkX1(a5),d0
		move	_CopyMarkX2(a5),d1
		cmp	d0,d1
		bgt.b	.ok
		exg	d0,d1
.ok		sub	d0,d1
		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
.okej		sub	d2,d3
		lea	TuneEditorDefs,a4
		moveq	#0,d0
		move	CursorXPos(a4),d0
		divu	#5,d0
.again		move.l	DataPtr(a4),a0
		lea	tune_Ch1Ptr(a0),a0
		move	d0,d4
		lsl	#2,d4
		move.l	(a0,d4.w),a0
		move	CursorYPos(a4),d4
		add	MinYPos(a4),d4
		move	d4,d2
		add	d4,d4
		add	d4,a0
		move	d3,d4
.copy		move	(a1)+,(a0)+
		addq	#1,d2
		cmp	#255,d2
		bgt.b	.next
		subq	#1,d4
		bpl.b	.copy
		bra.b	.skip
.next		subq	#1,d4
		bmi.b	.skip
		addq	#2,a1
		bra.b	.next
.skip		subq	#1,d1
		bmi.b	.done
		addq	#1,d0
		cmp	#7,d0
		ble.b	.again
.done		bsr	PrintTune
		rts
.voice		bsr	GetVoicePtr
		lea	_CopyBuffer(a5),a1
		move	#255,d0
.loop		move	(a1)+,(a0)+
		dbf	d0,.loop
		bsr	PrintTune
PasteVoiceReply	rts

MarkVoice	tst	_EditOnOff(a5)
		beq.b	.reply			;Message edit off
		btst	#7,_MarkEd(a5)
		beq.b	.normal
		lea	TuneMarkEdDefs,a4
		jsr	MarkSave
		move	CursorXPos(a4),_TempCopyMarkX(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_TempCopyMarkY(a5)
		jsr	MarkDraw
.reply		rts
.normal		lea	TuneEditorDefs,a4
		move	CursorXPos(a4),d0
		lea	TuneMarkEdDefs,a3
		lea	MarkXPos(a3),a2
		move.b	(a2,d0.w),d0
		move	d0,_TempCopyMarkX(a5)
		move	d0,CursorXPos(a3)
		move	CursorYPos(a4),d0
		move	d0,CursorYPos(a3)
		move	MinYPos(a4),MinYPos(a3)
		add	MinYPos(a4),d0
		move	d0,_TempCopyMarkY(a5)
		move.l	DataPtr(a4),DataPtr(a3)
		move.l	PrintPtr(a4),PrintPtr(a3)
		bset	#7,_MarkEd(a5)
		bsr	SetFont7
		bsr	CursorClear
		lea	TuneMarkEdDefs,a4
		jsr	MarkSave
		jsr	PaintMark
		rts

GetVoicePtr	lea	TuneEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	tune_Ch1Ptr(a0),a0
		moveq	#0,d0
		move	CursorXPos(a4),d0
		divu	#5,d0
		lsl	#2,d0
		move.l	(a0,d0.w),a0
		rts

MarkArpg	tst	_ArpEdOnOff(a5)
		beq.b	.reply			;Message edit off
		btst	#3,_MarkEd(a5)
		beq.b	.normal
		lea	ArpgMarkEdDefs,a4
		jsr	MarkSave
		move	CursorXPos(a4),_TempCopyMarkX(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_TempCopyMarkY(a5)
		jsr	MarkDraw
.reply		rts
.normal		lea	ArpgEditorDefs,a4
		move	CursorXPos(a4),d0
		lea	ArpgMarkEdDefs,a3
		lea	MarkXPos(a3),a2
		move.b	(a2,d0.w),d0
		move	d0,_TempCopyMarkX(a5)
		move	d0,CursorXPos(a3)
		move	CursorYPos(a4),d0
		move	d0,CursorYPos(a3)
		move	MinYPos(a4),MinYPos(a3)
		add	MinYPos(a4),d0
		move	d0,_TempCopyMarkY(a5)
		move.l	DataPtr(a4),DataPtr(a3)
		move.l	PrintPtr(a4),PrintPtr(a3)
		bset	#3,_MarkEd(a5)
		bsr	SetFont8
		bsr	CursorClear
		lea	ArpgMarkEdDefs,a4
		jsr	MarkSave
		jsr	PaintMark
		rts

SwapArpg	tst	_ArpEdOnOff(a5)
		beq.b	.reply			;Message edit off
		cmp.b	#Arpg,_CopyOf_(a5)
		bne.b	.reply
		tst	_HexNumEd2(a5)
		bne.b	.reply
		move.b	_MarkEd(a5),d0
		and	#$0c,d0
		bne.b	.reply			;Message you can´t swap arpg blocks
		tst	_HexNumEd2(a5)
		bne.b	.reply
		lea	ArpgEditorDefs,a4
		bsr	GetArpgPtr
		bsr	AllocArpg
		move.l	ArpgPtr,a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	.reply			;Message out of memory
		lea	_CopyBuffer(a5),a1
		move	#128*3-1,d0
.loop		move	(a0),d1
		move	(a1),d2
		move	d2,(a0)+
		move	d1,(a1)+
		dbf	d0,.loop
		bsr	FreeArpg		Lägger in ID2 i d4.l
		bsr	UpdateArpg
.reply		rts

CutArpg		tst	_ArpEdOnOff(a5)
		beq	.reply			;Message edit off
		tst	_HexNumEd2(a5)
		bne	.reply
		btst	#3,_MarkEd(a5)
		beq	.arpg
		move	_TempCopyMarkX(a5),_CopyMarkX1(a5)
		move	_TempCopyMarkY(a5),_CopyMarkY1(a5)
		lea	ArpgMarkEdDefs,a4
		move	CursorXPos(a4),_CopyMarkX2(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_CopyMarkY2(a5)
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
.okej		move.l	DataPtr(a4),a0
		move	d2,d4
		mulu	RowSize(a4),d4
		add	d4,a0
		move	d2,d4
		bra.b	.coopy
.copy		addq	#1,d4
.coopy		move	(a0),(a1)+
		clr	(a0)+
		move.l	(a0),(a1)+
		clr.l	(a0)+
		cmp	d3,d4
		bne.b	.copy
		move	_Qualifier(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		beq.b	.okeej
		jsr	DelArpgLines
.okeej		move.b	#Arpg,_CopyOf_(a5)
		lea	ArpgMarkEdDefs,a4
		jsr	MarkClear
		lea	ArpgEditorDefs,a4
		bsr	FreeArpg		Lägger in ID2 i d4.l
		bsr	PrintArpg
		bsr	PaintCursor
		bclr	#3,_MarkEd(a5)
		bset	#2,_MarkEd(a5)
.reply		rts

.arpg		tst	_HexNumEd2(a5)
		bne.b	.reply
		lea	ArpgEditorDefs,a4
		bsr	GetArpgPtr
		move.b	#Arpg,_CopyOf_(a5)
		move.l	ArpgPtr,a0
		lea	_CopyBuffer(a5),a1
		moveq	#128-1,d0
.loop		move	(a0),(a1)+
		clr	(a0)+
		move.l	(a0),(a1)+
		clr.l	(a0)+
		dbf	d0,.loop
		bsr	FreeArpg		Lägger in ID2 i d4.l
		bsr	UpdateArpg
		rts

CopyArpg	tst	_ArpEdOnOff(a5)
		beq	.reply			;Message edit off
		tst	_HexNumEd2(a5)
		bne	.reply
		btst	#3,_MarkEd(a5)
		beq	.arpg
		move	_TempCopyMarkX(a5),_CopyMarkX1(a5)
		move	_TempCopyMarkY(a5),_CopyMarkY1(a5)
		lea	ArpgMarkEdDefs,a4
		move	CursorXPos(a4),_CopyMarkX2(a5)
		move	CursorYPos(a4),d0
		add	MinYPos(a4),d0
		move	d0,_CopyMarkY2(a5)
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
.okej		move.l	DataPtr(a4),a0
		move	d2,d4
		mulu	RowSize(a4),d4
		add	d4,a0
		move	d2,d4
		bra.b	.coopy
.copy		addq	#1,d4
.coopy		move	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		cmp	d3,d4
		bne.b	.copy
		move.b	#Arpg,_CopyOf_(a5)
		lea	ArpgMarkEdDefs,a4
		jsr	MarkClear
		lea	ArpgEditorDefs,a4
		bsr	FreeArpg		Lägger in ID2 i d4.l
		bsr	PrintArpg
		bsr	PaintCursor
		bclr	#3,_MarkEd(a5)
		bset	#2,_MarkEd(a5)
.reply		rts

.arpg		tst	_HexNumEd2(a5)
		bne.b	.reply
		lea	ArpgEditorDefs,a4
		bsr	GetArpgPtr
		move.b	#Arpg,_CopyOf_(a5)
		move.l	ArpgPtr,a0
		lea	_CopyBuffer(a5),a1
		moveq	#128-1,d0
.loop		move	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		dbf	d0,.loop
		bsr	FreeArpg		Lägger in ID2 i d4.l
		bsr	UpdateArpg
		rts

PasteInsArpg	btst	#3,_MarkEd(a5)
		bne.b	.reply			;Message no arpg block in buffer
		btst	#2,_MarkEd(a5)
		beq.b	.reply			;Message no arpg block in buffer
		jsr	InsArpgLines
		bra.b	PasteIArpg
.reply		rts

PasteArpg	tst	_ArpEdOnOff(a5)
		beq	PasteArpgReply		;Message edit off
		cmp.b	#Arpg,_CopyOf_(a5)
		bne	PasteArpgReply		;Message no arpg block in buffer
		tst	_HexNumEd1(a5)
		bne	PasteArpgReply
		move	im_Qualifier(a4),d0
		btst	#IEQUALIFIERB_LSHIFT,d0
		bne	PasteInsArpg
		btst	#IEQUALIFIERB_RSHIFT,d0
		bne	PasteInsArpg
PasteIArpg	btst	#3,_MarkEd(a5)
		bne	PasteArpgReply		;Message no arpg block in buffer
		btst	#2,_MarkEd(a5)
		beq.b	.arpg
		lea	ArpgEditorDefs,a4
		bsr	AllocArpg
		move.l	DataPtr(a4),a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	PasteArpgReply		;Message out of memory
		lea	_CopyBuffer(a5),a1
		move	_CopyMarkY1(a5),d2
		move	_CopyMarkY2(a5),d3
		cmp	d2,d3
		bgt.b	.okej
		exg	d2,d3
.okej		sub	d2,d3
		lea	ArpgEditorDefs,a4
.again		move.l	DataPtr(a4),a0
		move	CursorYPos(a4),d4
		add	MinYPos(a4),d4
		move	d4,d2
		mulu	RowSize(a4),d4
		add	d4,a0
		move	d3,d4
.copy		move	(a1)+,(a0)+
		move.l	(a1)+,(a0)+
		addq	#1,d2
		cmp	MaxYPos(a4),d2
		bgt.b	.done
		subq	#1,d4
		bpl.b	.copy
.done		bsr	UpdateArpg
		rts
.arpg		lea	ArpgEditorDefs,a4
		bsr	AllocArpg
		move.l	DataPtr(a4),a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	PasteArpgReply		;Message out of memory
		lea	_CopyBuffer(a5),a1
		moveq	#128-1,d0
.loop		move	(a1)+,(a0)+
		move.l	(a1)+,(a0)+
		dbf	d0,.loop
		bsr	UpdateArpg
PasteArpgReply	rts

TransAllPartNoteUp
		move	#60,d1
		move	#1,d4
		move	#-1,d5
		bra.b	TransPartUp

TransAllPartOctaUp
		move	#60-11,d1
		move	#12,d4
		move	#-1,d5
		bra.b	TransPartUp

TransPartNoteUp	move	#60,d1
		move	#1,d4
		move	_InstNum(a5),d5
		bra.b	TransPartUp

TransPartOctaUp	move	#60-11,d1
		move	#12,d4
		move	_InstNum(a5),d5
		bra	TransPartUp

TransPartUp	btst	#7,_MarkEd(a5)
		bne.b	.reply			;Message exit mark mode
		tst	_EditOnOff(a5)
		beq.b	.reply			;Message edit off
		tst	_HexNumEd1(a5)
		bne.b	.reply
		lea	PartEditorDefs,a4
		bsr	GetPartPtr
		move.l	PartPtr,a0
		move	MaxYPos(a4),d0
		move	#61,d2
.loop		tst	d5
		bmi.b	.alla
		cmp.b	1(a0),d5
		bne.b	.ok
.alla		move.b	(a0),d3
		cmp.b	d2,d3
		bhs.b	.ok
		cmp.b	d1,d3
		bge.b	.reply
.ok		add	RowSize(a4),a0
		dbf	d0,.loop
		move.l	PartPtr,a0
		move	MaxYPos(a4),d0
.loop2		move.b	(a0),d3
		ble.b	.skip
		cmp.b	d1,d3
		bge.b	.skip
		tst	d5
		bmi.b	.all
		cmp.b	1(a0),d5
		bne.b	.skip
.all		add.b	d4,d3
		move.b	d3,(a0)
.skip		add	RowSize(a4),a0
		dbf	d0,.loop2
		lea	PartEditorDefs,a4
		bsr	GetPartPtr
		bsr	PrintPart
.reply		rts

TransAllPartNoteDown
		move	#1,d1
		move	#1,d4
		move	#-1,d5
		bra.b	TransPartDown

TransAllPartOctaDown
		move	#1+11,d1
		move	#12,d4
		move	#-1,d5
		bra.b	TransPartDown

TransPartNoteDown
		move	#1,d1
		move	#1,d4
		move	_InstNum(a5),d5
		bra.b	TransPartDown

TransPartOctaDown
		move	#1+11,d1
		move	#12,d4
		move	_InstNum(a5),d5
		bra	TransPartDown

TransPartDown	btst	#7,_MarkEd(a5)
		bne.b	.reply			;Message exit mark mode
		tst	_EditOnOff(a5)
		beq.b	.reply			;Message edit off
		tst	_HexNumEd1(a5)
		bne.b	.reply
		lea	PartEditorDefs,a4
		bsr	GetPartPtr
		move.l	PartPtr,a0
		move	MaxYPos(a4),d0
.loop		move.b	(a0),d3
		ble.b	.ok
		cmp.b	d1,d3
		ble.b	.reply
.ok		add	RowSize(a4),a0
		dbf	d0,.loop
		move.l	PartPtr,a0
		move	MaxYPos(a4),d0
		move	#61,d2
.loop2		move.b	(a0),d1
		beq.b	.skip
		cmp.b	d2,d1
		bhs.b	.skip
		tst	d5
		bmi.b	.all
		cmp.b	1(a0),d5
		bne.b	.skip
.all		sub.b	d4,d1
		move.b	d1,(a0)
.skip		add	RowSize(a4),a0
		dbf	d0,.loop2
		lea	PartEditorDefs,a4
		bsr	GetPartPtr
		bsr	PrintPart
.reply		rts

* Twins/PHA *****************************************************************
* Play tune                                           Last Change: 92-10-24 *
*****************************************************************************

_TunePos	rs.b	1
_PlayBits	rs.b	1
_Ch1Volume	rs.w	1
_Ch2Volume	rs.w	1
_Ch3Volume	rs.w	1
_Ch4Volume	rs.w	1
_DmaSave	rs.w	1
_PlayTune	rs.b	1
_PlayPart	rs.b	1

PlayTuneGad	btst	#7,_MarkEd(a5)
		beq.b	.next			;Message exit mark mode
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	ExitTunePart
.next		tst.b	_AudioChannels(a5)
		beq	Stop

PlayTuneGadget	jsr	InputOff
		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		move.b	#2,_PlayBits(a5)
		move.l	_PlayTuneGad(a5),a0
		or	#GFLG_SELECTED,gg_Flags(a0)
		moveq	#1,d0
		move.l	_PlayTuneGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		CallIntuition RefreshGList

		bsr	GetTune
		move	tune_Tempo(a0),_TuneTmp(a5)
		bsr	CalcVUTimer
		move	tune_Volume(a0),d0
		lsl	#4,d0
		move	d0,_MasterVol(a5)
		moveq	#0,d0
		lea	Channel1Buf,a4
		bsr.b	.initchannel
		moveq	#1,d0
		lea	Channel2Buf,a4
		bsr.b	.initchannel
		moveq	#2,d0
		lea	Channel3Buf,a4
		bsr.b	.initchannel
		moveq	#3,d0
		lea	Channel4Buf,a4
		bsr.b	.initchannel
		tst.b	_PlayMode(a5)
		beq.b	.initplay
		moveq	#4,d0
		lea	Channel5Buf,a4
		bsr.b	.initchannel
		moveq	#5,d0
		lea	Channel6Buf,a4
		bsr.b	.initchannel
		moveq	#6,d0
		lea	Channel7Buf,a4
		bsr.b	.initchannel
		moveq	#7,d0
		lea	Channel8Buf,a4
		bsr.b	.initchannel
		bra.b	.initplay

.initchannel	btst	d0,_ChannelsOn(a5)
		seq.b	ch_ChannelOff(a4)
		move	#64*16,ch_CVolume(a4)
		move.b	tune_Speed(a0),_TuneSpd(a5)
		move.b	_TuneSpd(a5),ch_Spd(a4)
		move.b	tune_Groove(a0),_TuneGrv(a5)
		move.b	_TuneGrv(a5),ch_Grv(a4)
		beq.b	.skip
		not.b	ch_PartGrv(a4)
.skip		move.b	#1,ch_SpdCnt(a4)
		move	#-1,ch_PchSldToNote(a4)
		rts

.initplay	tst.b	_PlayMode(a5)
		bne.b	.play8ch

.play4ch	clr	_Ch1Volume(a5)
		clr	_Ch2Volume(a5)
		clr	_Ch3Volume(a5)
		clr	_Ch4Volume(a5)
		clr	_DmaSave(a5)

		lea	TuneEditorDefs,a4
		moveq	#0,d7
		move	CursorXPos(a4),d7
		divu	#5,d7
		move	d7,_Voice(a5)
		cmp	#3,d7
		bhi	.error
		move	MinYPos(a4),d7
		add	CursorYPos(a4),d7
		move	_Qualifier(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		beq.b	.okej1
		moveq	#0,d7
.okej1		move.b	d7,_TunePos(a5)
		move.l	DataPtr(a4),a4
		add	d7,d7
		add	d7,a4
		bra	.loop

.play8ch	move	#64,_Ch1Volume(a5)
		move	#64,_Ch2Volume(a5)
		move	#64,_Ch3Volume(a5)
		move	#64,_Ch4Volume(a5)
		clr	_DmaSave(a5)

		bsr	GetTune
		move	tune_Tempo(a0),_TuneTmp(a5)
		clr	_DoubleBuf(a5)
		move	#126,d0
		move	d0,_MixPeriod(a5)
		move	d0,d1
		mulu	#32768,d1
		move.l	d1,_PeriodValue(a5)
		move.l	_TimerValue2(a5),d1
		divu	d0,d1
		mulu	#125,d1
		move	_TuneTmp(a5),d2
		mulu	#50,d2
		divu	d2,d1
		bclr	#0,d1
		move	d1,_MixLength(a5)
		lsr	#1,d1
		move.l	_SndCBuf(a5),a0
		move.l	a0,$dff0a0
		move	d1,$dff0a4
		move	d0,$dff0a6
		add	#(2*SndBufSize),a0
		move.l	a0,$dff0b0
		move	d1,$dff0b4
		move	d0,$dff0b6
		add	#(2*SndBufSize),a0
		move.l	a0,$dff0c0
		move	d1,$dff0c4
		move	d0,$dff0c6
		add	#(2*SndBufSize),a0
		move.l	a0,$dff0d0
		move	d1,$dff0d4
		move	d0,$dff0d6

		lea	TuneEditorDefs,a4
		moveq	#0,d7
		move	CursorXPos(a4),d7
		divu	#5,d7
		move	d7,_Voice(a5)

		move	MinYPos(a4),d7
		add	CursorYPos(a4),d7
		move	_Qualifier(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		beq.b	.okej2
		moveq	#0,d7
.okej2		move.b	d7,_TunePos(a5)
		move.l	DataPtr(a4),a4
		add	d7,d7
		add	d7,a4
		bra.b	.loop

.error		bsr	Stopp
		clr	_DmaSave(a5)
.exit		clr	_BlockPlay(a5)
		clr.b	_PlayBits(a5)
		jsr	InputOn
		rts

.loop		btst	#0,_PlayBits(a5)
		bne.b	.error
		jsr	PlayTune
		lea	VoiceTab(pc),a0
		move	_Voice(a5),d0
		lsl	#2,d0
		move.l	(a0,d0.w),a4
		btst	#0,ch_PlayError(a4)
		bne	.error
		btst	#1,ch_PlayError(a4)
		bne	PTGPlay

		tst.b	_PlayPosMode(a5)
		bne.b	.fast
		jsr	PlayEffects
		jsr	PerCalc
		bsr	PlayPerVol2
		bsr	PlayDma2
		tst	_RMButton(a5)
		bne	.error
		bra	.loop

.fast		tst	_RMButton(a5)
		bne	.error
		lea	Channel1Buf,a4
		and.b	#$c0,ch_Play(a4)
		clr.b	ch_PartNote(a4)
		clr.b	ch_ArpWait(a4)
		lea	Channel2Buf,a4
		and.b	#$c0,ch_Play(a4)
		clr.b	ch_PartNote(a4)
		clr.b	ch_ArpWait(a4)
		lea	Channel3Buf,a4
		and.b	#$c0,ch_Play(a4)
		clr.b	ch_PartNote(a4)
		clr.b	ch_ArpWait(a4)
		lea	Channel4Buf,a4
		and.b	#$c0,ch_Play(a4)
		clr.b	ch_PartNote(a4)
		clr.b	ch_ArpWait(a4)
		lea	Channel5Buf,a4
		and.b	#$c0,ch_Play(a4)
		clr.b	ch_PartNote(a4)
		clr.b	ch_ArpWait(a4)
		lea	Channel6Buf,a4
		and.b	#$c0,ch_Play(a4)
		clr.b	ch_PartNote(a4)
		clr.b	ch_ArpWait(a4)
		lea	Channel7Buf,a4
		and.b	#$c0,ch_Play(a4)
		clr.b	ch_PartNote(a4)
		clr.b	ch_ArpWait(a4)
		lea	Channel8Buf,a4
		and.b	#$c0,ch_Play(a4)
		clr.b	ch_PartNote(a4)
		clr.b	ch_ArpWait(a4)
		bra	.loop
.ReplyMessage1	rts

PTGPlay		clr.b	_PlayBits(a5)
		move.b	#2,_PlayTune(a5)

		jsr	InputOn
		jsr	StepArrow
		movem.l	d0-a6,-(sp)
		move.b	#1,_PartArrowClear(a5)
		bsr	PartArrow

		tst.b	_FollowChannel(a5)
		beq.b	.end
		move.l	_ChannelPtr(a5),a3
		moveq	#0,d1
		move.b	ch_TunePos(a3),d1
		add	d1,d1
		lea	TuneEditorDefs,a3
		moveq	#0,d0
		move	CursorXPos(a3),d0
		divu	#5,d0		
		lsl	#2,d0
		move.l	TunePtr,a3
		move.l	tune_Ch1Ptr(a3,d0.w),a3
		moveq	#0,d0
		move.b	(a3,d1.w),d0
		move.b	1(a3,d1.w),d1
		btst	#5,d1
		bne.b	.end
		and	#$c0,d1
		lsl	#2,d1
		or	d1,d0
		move	d0,_PartNum(a5)
		jsr	GetPartPtr

.end		jsr	PrintPartNum
		lea	PartEditorDefs,a4
		jsr	PrintPart
		bsr	PartArrow
		movem.l	(sp)+,d0-a6

		tst.b	_PlayMode(a5)
		bne.b	.play8ch

		lea	$bfd000,a4
		bset	#CIACRAB_START,ciacra(a4)
		move	#1,_IntMode(a5)
		move.l	_TimerValue1(a5),d4
		divu	_TuneTmp(a5),d4
		lea	$bfd000,a4
		move.b	d4,ciatalo(a4)
		lsr	#8,d4
		move.b	d4,ciatahi(a4)
.return		clr	_BlockPlay(a5)
		rts

.play8ch	jsr	SetAudInt
		bclr	#CIACRAB_START,ciacra(a4)
		move	#2,_IntMode(a5)
		jsr	Dma6
		bra.b	.return

VoiceTab	dc.l	Channel1Buf
		dc.l	Channel2Buf
		dc.l	Channel3Buf
		dc.l	Channel4Buf
		dc.l	Channel5Buf
		dc.l	Channel6Buf
		dc.l	Channel7Buf
		dc.l	Channel8Buf

PlayPerVol2	tst.b	_PlayMode(a5)
		beq.b	.play4ch
		eor	#2560,_DoubleBuf(a5)
		lea	$dff000,a6
		jsr	Dma4
		jmp	Play8PerVol
.play4ch	lea	_Ch1Volume(a5),a0
		lea	Channel1Buf,a4
		bsr.b	.pervolplay
		lea	_Ch2Volume(a5),a0
		lea	Channel2Buf,a4
		bsr.b	.pervolplay
		lea	_Ch3Volume(a5),a0
		lea	Channel3Buf,a4
		bsr.b	.pervolplay
		lea	_Ch4Volume(a5),a0
		lea	Channel4Buf,a4

.pervolplay	btst	#0,ch_Play(a4)
		bne.b	.nopervol
		move.l	ch_CustomAddress(a4),a6
		move	ch_Period2(a4),6(a6)
.noper		tst.b	ch_ChannelOff(a4)
		bne.b	.nopervol
		move	ch_Volume3(a4),d1
.channelvol	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol	mulu	_MasterVol(a5),d1
.voldone	lsl.l	#2,d1
		swap	d1
		move	d1,(a0)
.nopervol	rts

PlayDma2	tst.b	_PlayMode(a5)
		beq.b	.p4ch
		jmp	Play8channels
.p4ch		moveq	#0,d0
		lea	$dff000,a6
		lea	Channel1Buf,a4
		bclr	#0,ch_Play(a4)
		beq.b	.noplay1
		or	#1,d0
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol1
		move	ch_Volume3(a4),d1
.channelvol	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol	mulu	_MasterVol(a5),d1
.voldone	lsl.l	#2,d1
		swap	d1
		move	d1,_Ch1Volume(a5)
.novol1		move.l	ch_WsPointer(a4),$a0(a6)
		move	ch_WsLength(a4),$a4(a6)
		move	ch_Period2(a4),$a6(a6)
.noplay1	lea	Channel2Buf,a4
		bclr	#0,ch_Play(a4)
		beq.b	.noplay2
		or	#2,d0
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol2
		move	ch_Volume3(a4),d1
.channelvol2	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol2	mulu	_MasterVol(a5),d1
.voldone2	lsl.l	#2,d1
		swap	d1
		move	d1,_Ch2Volume(a5)
.novol2		move.l	ch_WsPointer(a4),$b0(a6)
		move	ch_WsLength(a4),$b4(a6)
		move	ch_Period2(a4),$b6(a6)
.noplay2	lea	Channel3Buf,a4
		bclr	#0,ch_Play(a4)
		beq.b	.noplay3
		or	#4,d0
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol3
		move	ch_Volume3(a4),d1
.channelvol3	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol3	mulu	_MasterVol(a5),d1
.voldone3	lsl.l	#2,d1
		swap	d1
		move	d1,_Ch3Volume(a5)
.novol3		move.l	ch_WsPointer(a4),$c0(a6)
		move	ch_WsLength(a4),$c4(a6)
		move	ch_Period2(a4),$c6(a6)
.noplay3	lea	Channel4Buf,a4
		bclr	#0,ch_Play(a4)
		beq.b	.noplay4
		or	#8,d0
		tst.b	ch_ChannelOff(a4)
		bne.b	.novol4
		move	ch_Volume3(a4),d1
.channelvol4	mulu	ch_CVolume(a4),d1
		lsl.l	#6,d1
		swap	d1
.mastervol4	mulu	_MasterVol(a5),d1
.voldone4	lsl.l	#2,d1
		swap	d1
		move	d1,_Ch4Volume(a5)
.novol4		move.l	ch_WsPointer(a4),$d0(a6)
		move	ch_WsLength(a4),$d4(a6)
		move	ch_Period2(a4),$d6(a6)
.noplay4	tst.b	d0
		beq.b	.norep4
		or	d0,_DmaSave(a5)
		btst	#0,d0
		beq.b	.norep1
		lea	Channel1Buf,a4
		move.l	ch_WsRepPointer(a4),$a0(a6)
		move	ch_WsRepLength(a4),$a4(a6)
.norep1		btst	#1,d0
		beq.b	.norep2
		lea	Channel2Buf,a4
		move.l	ch_WsRepPointer(a4),$b0(a6)
		move	ch_WsRepLength(a4),$b4(a6)
.norep2		btst	#2,d0
		beq.b	.norep3
		lea	Channel3Buf,a4
		move.l	ch_WsRepPointer(a4),$c0(a6)
		move	ch_WsRepLength(a4),$c4(a6)
.norep3		btst	#3,d0
		beq.b	.norep4
		lea	Channel4Buf,a4
		move.l	ch_WsRepPointer(a4),$d0(a6)
		move	ch_WsRepLength(a4),$d4(a6)
.norep4		rts

* Twins/PHA *****************************************************************
* Play part                                           Last Change: 92-10-24 *
*****************************************************************************

_PartChPtr	rs.l	1

TestPlayPart	tst.b	_PlayPart(a5)
		beq.b	.outofhere
		bsr.b	PlayPartGadget
.outofhere	rts

PlayPartGad	btst	#7,_MarkEd(a5)
		beq.b	.next			;Message exit mark mode
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	ExitTunePart
		bsr.b	PlayPartGadget
.next		tst.b	_AudioChannels(a5)
		beq	Stop

PlayPartGadget	move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		move.l	_PlayPartGad(a5),a0
		or	#GFLG_SELECTED,gg_Flags(a0)
		moveq	#1,d0
		move.l	_PlayPartGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		CallIntuition RefreshGList
		bsr	GetTune
		move	tune_Tempo(a0),_TuneTmp(a5)
		move	tune_Volume(a0),d0
		lsl	#4,d0
		move	d0,_MasterVol(a5)

		move.l	_ChannelPtr(a5),a4
		move	#64*16,ch_CVolume(a4)
		move.l	a4,_PartChPtr(a5)
		move.b	tune_Speed(a0),_TuneSpd(a5)
		move.b	_TuneSpd(a5),ch_Spd(a4)
		move.b	tune_Groove(a0),_TuneGrv(a5)
		move.b	_TuneGrv(a5),ch_Grv(a4)
		beq.b	.skip
		not.b	ch_PartGrv(a4)
.skip		move.b	#1,ch_SpdCnt(a4)
		move	#-1,ch_PchSldToNote(a4)

		move.b	#1,_PlayPart(a5)
		clr	_BlockPlay(a5)
		clr	_DmaSave(a5)

		tst.b	_PlayMode(a5)
		beq	.play4ch
		move	#2,_IntMode(a5)
		jsr	SetAudInt
		clr	_DoubleBuf(a5)
		move	#126,d0
		move	d0,_MixPeriod(a5)
		move	d0,d1
		mulu	#32768,d1
		move.l	d1,_PeriodValue(a5)
		move.l	_TimerValue2(a5),d1
		divu	d0,d1
		mulu	#125,d1
		move	_TuneTmp(a5),d2
		mulu	#50,d2
		divu	d2,d1
		bclr	#0,d1
		move	d1,_MixLength(a5)
		lsr	#1,d1
		move.l	_SndCBuf(a5),a0
		lea	$dff0a0,a2
		move.l	a0,(a2)
		move	d1,4(a2)
		move	d0,6(a2)
		clr	8(a2)
		move.l	ch_CustomAddress(a4),a2
		move.l	a0,(a2)
		move	d1,4(a2)
		move	d0,6(a2)
		move.b	#7,_DmaWait(a5)
		move	#1300,d7
		lea	$bfd000,a4
		move.b	d7,ciatblo(a4)
		lsr.w	#8,d7
		move.b	d7,ciatbhi(a4)
		rts
.play4ch	bsr	StartTimerInt
.exit		clr	_BlockPlay(a5)
		rts

* Twins/PHA *****************************************************************
* Stop                                                Last Change: 92-10-24 *
*****************************************************************************

Stop		move	#$0101,_BlockPlay(a5)
		bsr.b	Stoppa
		clr	_BlockPlay(a5)
		rts

Stoppa		clr.b	_TunOnOff(a5)
		move.l	_TuningGad(a5),a0
		move.l	_Window2(a5),a1
		move.b	_TunOnOff(a5),CycleNum+3
		sub.l	a2,a2
		lea	CycleTags,a3
		CallGadTools GT_SetGadgetAttrsA
Stopp		move	#GFLG_SELECTED,d1
		not	d1
		move.l	_PlayTuneGad(a5),a0
		and	d1,gg_Flags(a0)
		move.l	_PlayPartGad(a5),a0
		and	d1,gg_Flags(a0)
		moveq	#2,d0
		move.l	_PlayTuneGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		CallIntuition RefreshGList
		move	#$000f,$dff096
		move	#$0080,$dff09a
		move	#$0080,$dff09c
		clr	$dff0a8
		clr	$dff0b8
		clr	$dff0c8
		clr	$dff0d8
		tst.l	_ClrAudInt(a5)
		beq.b	.not
		jsr	ClrAudInt
.not		clr	_PlayTune(a5)
		jsr	StepShow
		lea	$bfd000,a4
		bclr	#CIACRAB_START,ciacra(a4)
		clr	_IntMode(a5)
		bsr.b	ClearChannels
		bsr	UpdateChStruct
		bsr	GetTune
		move	tune_Volume(a0),d0
		lsl	#4,d0
		move	d0,_MasterVol(a5)
		jsr	StepArrow
		jsr	PartArrow
		rts


ClearChannels	SSP	d1-d3/a0/a2/a3
		lea	ChannelPointers,a0
		moveq	#8-1,d0
.amploop	move.l	(a0)+,a1
		move	ch_VUAmp(a1),d2
		move	ch_VUOldAmp(a1),d3
		move	#ch_SIZEOF/2-1,d1
		move.l	a1,a3
.clearloop	clr	(a3)+
		dbf	d1,.clearloop
		move	d2,ch_VUAmp(a1)
		move	d3,ch_VUOldAmp(a1)
		dbf	d0,.amploop
ClearBuffers	move.l	_SndCBuf(a5),a1
		move	#((4*2*SndBufSize)/32)-1,d0
.loop		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		dbf	d0,.loop
		move.l	_SndFBuf(a5),a1
		move	#((4*2*SndBufSize)/32)-1,d0
.loop2		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		clr.l	(a1)+
		dbf	d0,.loop2
		LSP	d1-d3/a0/a2/a3
		rts

* Twins/PHA *****************************************************************
* VU Button                                           Last Change: 95-07-23 *
*****************************************************************************

_VUOnOff	rs.w	1

VUButton	eor	#1,_VUOnOff(a5)
		rts
		
* Twins/PHA *****************************************************************
* Edit on/off                                         Last Change: 95-07-23 *
*****************************************************************************

_EditOnOff	rs.w	1
_ArpEdOnOff	rs.w	1
_ZeroNote	rs.b	1
_TransFixNote	rs.b	1

EditOnOff	eor	#1,_EditOnOff(a5)
		bne.b	.exit
		btst	#7,_MarkEd(a5)
		beq.b	.exit
		bra	ExitMarkTunePart
.exit		rts

EditOnOff2	eor	#1,_EditOnOff(a5)
		bne.b	.ok
		btst	#7,_MarkEd(a5)
		beq.b	.ok
		bsr	ExitMarkTunePart
.ok		move.l	_EditGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList1,a3
		move	_EditOnOff(a5),GTCB_Check+2
		CallGadTools GT_SetGadgetAttrsA
		rts

ArpEdOnOff	eor	#1,_ArpEdOnOff(a5)
		bne.b	.exit
		btst	#3,_MarkEd(a5)
		beq.b	.exit
		bra	ExitArpg
.exit		rts

ArpEdOnOff2	cmp	#3,_WsButtons(a5)
		bne.b	.exit
		eor	#1,_ArpEdOnOff(a5)
		bne.b	.ok
		btst	#3,_MarkEd(a5)
		beq.b	.ok
		bsr	ExitArpg
.ok		move	_ArpEdOnOff(a5),d0
		move	d0,CycleNum+2
		move.l	_ArpEditGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList1,a3
		move	_ArpEdOnOff(a5),GTCB_Check+2
		CallGadTools GT_SetGadgetAttrsA
.exit		rts

TransFixNote	not.b	_TransFixNote(a5)
		rts

* Twins/PHA *****************************************************************
* Edit column/vertical                                Last Change: 92-10-24 *
*****************************************************************************

_PlayMode	rs.b	1
		rs.b	1
_EditMode	rs.b	1
_ArpEdMode	rs.b	1

PlayMode	move	#$0101,_BlockPlay(a5)
		move.l	a4,-(sp)
		bsr	Stoppa
		move.b	#1,_StepArrowClear(a5)
		jsr	StepArrow
		move.b	#1,_PartArrowClear(a5)
		jsr	PartArrow
		jsr	ClearArrowTunePos
		move.b	#1,_PlayMode(a5)
		jsr	StepShow
		move.l	(sp)+,a4
		bsr	GetTune
		move.b	im_Code+1(a4),d0
		move.b	d0,tune_PlayMode(a0)
		move.b	d0,_PlayMode(a5)
		jsr	StepArrow
		jsr	PartArrow
		bsr	UpdateChannels
		move	#GFLG_SELECTED,d1
		not	d1
		move.l	_PlayTuneGad(a5),a0
		and	d1,gg_Flags(a0)
		move.l	_PlayPartGad(a5),a0
		and	d1,gg_Flags(a0)
		moveq	#2,d0
		move.l	_PlayTuneGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		CallIntuition RefreshGList
		clr	_BlockPlay(a5)
		rts

EditMode	move.b	im_Code+1(a4),_EditMode(a5)
		rts

EditMode1	addq.b	#1,_EditMode(a5)
		cmp.b	#2,_EditMode(a5)
		bls.b	.ok
		clr.b	_EditMode(a5)
.ok		move.b	_EditMode(a5),d0
		move.b	d0,CycleNum+3
		move.l	_EditModeGad(a5),a0
		move.l	_Window1(a5),a1
		bsr	SetCycleGad
		rts

ArpEdMode	move.b	im_Code+1(a4),_ArpEdMode(a5)
		rts

ArpEdMode2	cmp	#3,_WsButtons(a5)
		bne.b	.exit
		addq.b	#1,_ArpEdMode(a5)
		cmp.b	#2,_ArpEdMode(a5)
		bls.b	.ok
		clr.b	_ArpEdMode(a5)
.ok		move.b	_ArpEdMode(a5),d0
		move.b	d0,CycleNum+3
		move.l	_ArpEdModeGad(a5),a0
		move.l	_Window2(a5),a1
		bsr	SetCycleGad
.exit		rts

* Twins/PHA *****************************************************************
* ScrollPart On/Off                                   Last Change: 95-07-10 *
*****************************************************************************
_ScrollPart	rs.b	1

ScrollPartOnOff	move.b	im_Code+1(a4),_ScrollPart(a5)
		bsr	StepArrow
		rts

* Twins/PHA *****************************************************************
* FollowChannel On/Off                                Last Change: 95-07-10 *
*****************************************************************************
_FollowChannel	rs.b	1

FollowChannelOnOff
		move.b	im_Code+1(a4),_FollowChannel(a5)
		rts

* Twins/PHA *****************************************************************
* Channels on/off                                     Last Change: 92-10-24 *
*****************************************************************************

_ChannelsOn	rs.b	1
_PlayPosMode	rs.b	1

Channel1	bsr	GetTune
		lea	Channel1Buf,a4
		bchg	#0,_ChannelsOn(a5)
		sne.b	ch_ChannelOff(a4)
		beq.b	.ok
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	$dff0a8
.ok		rts

Channel2	bsr	GetTune
		lea	Channel2Buf,a4
		bchg	#1,_ChannelsOn(a5)
		sne.b	ch_ChannelOff(a4)
		beq.b	.ok
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	$dff0b8
.ok		rts

Channel3	bsr	GetTune
		lea	Channel3Buf,a4
		bchg	#2,_ChannelsOn(a5)
		sne.b	ch_ChannelOff(a4)
		beq.b	.ok
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	$dff0c8
.ok		rts

Channel4	bsr	GetTune
		lea	Channel4Buf,a4
		bchg	#3,_ChannelsOn(a5)
		sne.b	ch_ChannelOff(a4)
		beq.b	.ok
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	$dff0d8
.ok		rts

Channel5	bsr	GetTune
		lea	Channel5Buf,a4
		bchg	#4,_ChannelsOn(a5)
		sne.b	ch_ChannelOff(a4)
		beq.b	.ok
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	$dff0a8
.ok		rts

Channel6	bsr	GetTune
		lea	Channel6Buf,a4
		bchg	#5,_ChannelsOn(a5)
		sne.b	ch_ChannelOff(a4)
		beq.b	.ok
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	$dff0b8
.ok		rts

Channel7	bsr	GetTune
		lea	Channel7Buf,a4
		bchg	#6,_ChannelsOn(a5)
		sne.b	ch_ChannelOff(a4)
		beq.b	.ok
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	$dff0c8
.ok		rts

Channel8	bsr	GetTune
		lea	Channel8Buf,a4
		bchg	#7,_ChannelsOn(a5)
		sne.b	ch_ChannelOff(a4)
		beq.b	.ok
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	$dff0d8
.ok		rts

UpdateChannels	bsr	GetTune
		move.l	a0,d4
		sub.l	a2,a2
		lea	TagList1,a3
		lea	_Ch1Gad(a5),a4
		move.l	_GadToolsBase(a5),a6
		move	#1,GTCB_Check+2
		move.b	#$ff,_ChannelsOn(a5)
		bsr.b	.set4channels
		tst.b	_PlayMode(a5)
		bne.b	.ok
		clr	GTCB_Check+2
		move.b	#$0f,_ChannelsOn(a5)
.ok		bsr.b	.set4channels
		bsr.b	UpdateChStruct
		rts

.set4channels	moveq	#3,d5
.loop		move.l	(a4)+,a0
		move.l	_Window1(a5),a1
		CallLib GT_SetGadgetAttrsA
		dbf	d5,.loop
		rts

UpdateChStruct	move.b	_ChannelsOn(a5),d0
		lea	Channel1Buf,a4
		move	#64*16,ch_CVolume(a4)
		move.l	#$dff0a0,ch_CustomAddress(a4)
		move	#1,ch_DmaChannel(a4)
		btst	#0,d0
		seq.b	ch_ChannelOff(a4)
		move.l	#WaveBuffer1,ch_WaveBuffer(a4)
		lea	Channel2Buf,a4
		move	#64*16,ch_CVolume(a4)
		move.l	#$dff0b0,ch_CustomAddress(a4)
		move	#2,ch_DmaChannel(a4)
		btst	#1,d0
		seq.b	ch_ChannelOff(a4)
		move.l	#WaveBuffer2,ch_WaveBuffer(a4)
		lea	Channel3Buf,a4
		move	#64*16,ch_CVolume(a4)
		move.l	#$dff0c0,ch_CustomAddress(a4)
		move	#4,ch_DmaChannel(a4)
		btst	#2,d0
		seq.b	ch_ChannelOff(a4)
		move.l	#WaveBuffer3,ch_WaveBuffer(a4)
		lea	Channel4Buf,a4
		move	#64*16,ch_CVolume(a4)
		move.l	#$dff0d0,ch_CustomAddress(a4)
		move	#8,ch_DmaChannel(a4)
		btst	#3,d0
		seq.b	ch_ChannelOff(a4)
		move.l	#WaveBuffer4,ch_WaveBuffer(a4)
		lea	Channel5Buf,a4
		move	#64*16,ch_CVolume(a4)
		move.l	#$dff0a0,ch_CustomAddress(a4)
		move	#1,ch_DmaChannel(a4)
		btst	#4,d0
		seq.b	ch_ChannelOff(a4)
		lea	Channel6Buf,a4
		move	#64*16,ch_CVolume(a4)
		move.l	#$dff0b0,ch_CustomAddress(a4)
		move	#2,ch_DmaChannel(a4)
		btst	#5,d0
		seq.b	ch_ChannelOff(a4)
		lea	Channel7Buf,a4
		move	#64*16,ch_CVolume(a4)
		move.l	#$dff0c0,ch_CustomAddress(a4)
		move	#4,ch_DmaChannel(a4)
		btst	#6,d0
		seq.b	ch_ChannelOff(a4)
		lea	Channel8Buf,a4
		move	#64*16,ch_CVolume(a4)
		move.l	#$dff0d0,ch_CustomAddress(a4)
		move	#8,ch_DmaChannel(a4)
		btst	#7,d0
		seq.b	ch_ChannelOff(a4)
		rts

* Twins/PHA *****************************************************************
* Sliders     	                                      Last Change: 92-10-24 *
*****************************************************************************

Volume		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		move	im_Code(a4),inst_Volume(a0)
.exit		rts

Finetune	bsr	GetInst
		tst	_InstNum(a5)
		beq.b	.print
		move	im_Code(a4),inst_FineTune(a0)
		bsr	GetSmpl
		cmp.l	#0,a0
		beq.b	.print
		move	im_Code(a4),smpl_FineTune(a0)
.print		move	im_Code(a4),d4
		and	#$ff,d4
		move.l	_FineTuneGad(a5),a4
		bsr	PrintHex2Digit
		rts

SemiTone	bsr	GetInst
		tst	_InstNum(a5)
		beq.b	.print
		move	im_Code(a4),inst_SemiTone(a0)
		bsr	GetSmpl
		cmp.l	#0,a0
		beq.b	.print
		move	im_Code(a4),smpl_SemiTone(a0)
.print		move	im_Code(a4),d4
		and	#$ff,d4
		move.l	_SemiToneGad(a5),a4
		bsr	PrintHex2Digit
		rts

TuningTone	move	#$0101,_BlockPlay(a5)
		move	im_Code(a4),d4
		bsr	Stopp
		clr	_BlockPlay(a5)
		move.b	d4,_TunOnOff(a5)
		beq.b	.exit
		lea	Channel1Buf,a4
		move.b	#49,ch_PartNote(a4)
		move.b	#$ff,ch_PartInst(a4)
		clr	ch_PartEffectNum(a4)
		clr	ch_PartEffects(a4)
		clr	ch_PartEffects+2(a4)
		clr	ch_PartEffects+4(a4)
		clr	ch_PartEffects+6(a4)
		jsr	CheckInst
		tst	_IntMode(a5)
		bne.b	.exit
		tst.b	_PlayMode(a5)
		beq.b	.starttimer
		bsr	StartAudioInt
		bra.b	.exit
.starttimer	bsr	StartTimerInt
.exit		rts

SlideSpeed	bsr	GetInst
		tst	_InstNum(a5)
		beq.b	.print
		move.b	im_Code+1(a4),inst_SlideSpeed(a0)
.print		move	im_Code(a4),d4
		and	#$ff,d4
		move.l	_SlideSpeedGad(a5),a4
		bsr	PrintHex2Digit
		rts

Transpose	not.b	_TrnOnOff(a5)
		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		move.b	_TrnOnOff(a5),inst_Transpose(a0)
.exit		rts

MasterVol	bsr	GetTune
		move	im_Code(a4),d0
		move	d0,tune_Volume(a0)
		lsl	#4,d0
		move	d0,_MasterVol(a5)
		rts

_MasterVol	rs.w	1

* Twins/PHA *****************************************************************
* Envelope Gadgets                                    Last Change: 92-10-24 *
*****************************************************************************

_AVol		rs.w	1
_DVol		rs.w	1
_SVol		rs.w	1
_RVol		rs.w	1
_ALen		rs.w	1
_DLen		rs.w	1
_SLen		rs.w	1
_RLen		rs.w	1

WaveLength	tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	im_Code(a4),d0
		addq	#1,d0
		move.b	d0,inst_SmplType(a0)
.reply		rts

SustainToggle	tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bclr	#ADSRHOLDSUSTAIN,inst_EnvTraPhaFilBits(a0)
		tst	im_Code(a4)
		beq.b	.exit
		bset	#ADSRHOLDSUSTAIN,inst_EnvTraPhaFilBits(a0)
.exit		rts

AttackVol	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		bne.b	.ok
		rts
.ok		bsr	GetInst
		move	d4,inst_EnvAttVol(a0)
		lsl	#8,d4
		move	inst_EnvAttLen(a0),d1
		ext.l	d4
		divs	d1,d4
		move	d4,inst_EnvAttSpd(a0)
		move	inst_EnvDecVol(a0),d4
		bra.b	DecayCalc

DecayVol	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		bne.b	.ok
		rts
.ok		bsr	GetInst
		move	d4,inst_EnvDecVol(a0)
DecayCalc	sub	inst_EnvAttVol(a0),d4
		lsl	#8,d4
		move	inst_EnvDecLen(a0),d1
		ext.l	d4
		divs	d1,d4
		move	d4,inst_EnvDecSpd(a0)
		move	inst_EnvSusVol(a0),d4
		bra.b	SustainCalc

SustainVol	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		bne.b	.ok
		rts
.ok		bsr	GetInst
		move	d4,inst_EnvSusVol(a0)
SustainCalc	sub	inst_EnvDecVol(a0),d4
		lsl	#8,d4
		move	inst_EnvSusLen(a0),d1
		ext.l	d4
		divs	d1,d4
		move	d4,inst_EnvSusSpd(a0)
		move	inst_EnvRelVol(a0),d4
		bra.b	ReleaseCalc

ReleaseVol	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		bne.b	.ok
		rts
.ok		bsr	GetInst
		move	d4,inst_EnvRelVol(a0)
ReleaseCalc	sub	inst_EnvSusVol(a0),d4
		lsl	#8,d4
		move	inst_EnvRelLen(a0),d1
		ext.l	d4
		divs	d1,d4
		move	d4,inst_EnvRelSpd(a0)
		rts

AttackLen	move	im_Code(a4),d4
		addq	#1,d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	inst_EnvAttVol(a0),d1
		lsl	#8,d1
		move	d4,inst_EnvAttLen(a0)
		ext.l	d1
		divs	d4,d1
		move	d1,inst_EnvAttSpd(a0)
.reply		rts

DecayLen	move	im_Code(a4),d4
		addq	#1,d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	inst_EnvDecVol(a0),d1
		sub	inst_EnvAttVol(a0),d1
		lsl	#8,d1
		move	d4,inst_EnvDecLen(a0)
		ext.l	d1
		divs	d4,d1
		move	d1,inst_EnvDecSpd(a0)
.reply		rts

SustainLen	move	im_Code(a4),d4
		addq	#1,d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	inst_EnvSusVol(a0),d1
		sub	inst_EnvDecVol(a0),d1
		lsl	#8,d1
		move	d4,inst_EnvSusLen(a0)
		ext.l	d1
		divs	d4,d1
		move	d1,inst_EnvSusSpd(a0)
.reply		rts

ReleaseLen	move	im_Code(a4),d4
		addq	#1,d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	inst_EnvRelVol(a0),d1
		sub	inst_EnvSusVol(a0),d1
		lsl	#8,d1
		move	d4,inst_EnvRelLen(a0)
		ext.l	d1
		divs	d4,d1
		move	d1,inst_EnvRelSpd(a0)
.reply		rts

PrintADSRNum	bsr	GetInst
		move	inst_EnvAttVol(a0),_AVol(a5)
		move	inst_EnvDecVol(a0),_DVol(a5)
		move	inst_EnvSusVol(a0),_SVol(a5)
		move	inst_EnvRelVol(a0),_RVol(a5)
		move	inst_EnvAttLen(a0),_ALen(a5)
		move	inst_EnvDecLen(a0),_DLen(a5)
		move	inst_EnvSusLen(a0),_SLen(a5)
		move	inst_EnvRelLen(a0),_RLen(a5)
ADSRNumPrint	move	_AVol(a5),d4
		move.l	_AttackGad(a5),a4
		bsr	PrintHex2Digit
		move	_DVol(a5),d4
		move.l	_DecayGad(a5),a4
		bsr	PrintHex2Digit
		move	_SVol(a5),d4
		move.l	_SustainGad(a5),a4
		bsr	PrintHex2Digit
		move	_RVol(a5),d4
		move.l	_ReleaseGad(a5),a4
		bsr	PrintHex2Digit
		move	_ALen(a5),d4
		move.l	_AttackLenGad(a5),a4
		bsr	PrintHex2Digit
		move	_DLen(a5),d4
		move.l	_DecayLenGad(a5),a4
		bsr	PrintHex2Digit
		move	_SLen(a5),d4
		move.l	_SustainLenGad(a5),a4
		bsr	PrintHex2Digit
		move	_RLen(a5),d4
		move.l	_ReleaseLenGad(a5),a4
		bsr	PrintHex2Digit
		rts

_Speed		rs.w	1
_Delay		rs.w	1
_Attack		rs.w	1
_Depth		rs.w	1
_Start		rs.w	1
_Repeat		rs.w	1
_RepEnd		rs.w	1
_Turns		rs.w	1

PrintVibNum	bsr	GetInst
		move	inst_VibSpeed(a0),_Speed(a5)
		move	inst_VibDepth(a0),d0
		lsr	#8,d0
		move	d0,_Depth(a5)
		move	inst_VibAttack(a0),_Attack(a5)
		move	inst_VibDelay(a0),_Delay(a5)
VibNumPrint	move	_Speed(a5),d4
		move.l	_VibSpeedGad(a5),a4
		bsr	PrintHex2Digit
		move	_Depth(a5),d4
		move.l	_VibDepthGad(a5),a4
		bsr	PrintHex2Digit
		move	_Attack(a5),d4
		move.l	_VibAttackGad(a5),a4
		bsr	PrintHex2Digit
		move	_Delay(a5),d4
		move.l	_VibDelayGad(a5),a4
		bsr	PrintHex2Digit
		rts

PrintTreNum	bsr	GetInst
		move	inst_TreSpeed(a0),_Speed(a5)
		move	inst_TreDepth(a0),d0
		lsr	#8,d0
		move	d0,_Depth(a5)
		move	inst_TreAttack(a0),_Attack(a5)
		move	inst_TreDelay(a0),_Delay(a5)
TreNumPrint	move	_Speed(a5),d4
		move.l	_TreSpeedGad(a5),a4
		bsr	PrintHex2Digit
		move	_Depth(a5),d4
		move.l	_TreDepthGad(a5),a4
		bsr	PrintHex2Digit
		move	_Attack(a5),d4
		move.l	_TreAttackGad(a5),a4
		bsr	PrintHex2Digit
		move	_Delay(a5),d4
		move.l	_TreDelayGad(a5),a4
		bsr	PrintHex2Digit
		rts

PrintPhaNum	bsr	GetInst
		move	inst_PhaStart(a0),d0
		lsr	#1,d0
		neg	d0
		add	#256,d0
		move	d0,_Start(a5)
		move	inst_PhaRepeat(a0),d0
		lsr	#1,d0
		neg	d0
		add	#256,d0
		move	d0,_Repeat(a5)
		move	inst_PhaRepEnd(a0),d0
		lsr	#1,d0
		neg	d0
		add	#256,d0
		move	d0,_RepEnd(a5)
		move	inst_PhaSpeed(a0),_Speed(a5)
		move	inst_PhaDelay(a0),_Delay(a5)
		move	inst_PhaTurns(a0),_Turns(a5)
PhaNumPrint	move	_Start(a5),d4
		move.l	_PhaStartGad(a5),a4
		bsr	PrintHex2Digit
		move	_Repeat(a5),d4
		move.l	_PhaRepeatGad(a5),a4
		bsr	PrintHex2Digit
		move	_RepEnd(a5),d4
		move.l	_PhaRepEndGad(a5),a4
		bsr	PrintHex2Digit
		move	_Speed(a5),d4
		move.l	_PhaSpeedGad(a5),a4
		bsr	PrintHex2Digit
		move	_Delay(a5),d4
		move.l	_PhaDelayGad(a5),a4
		bsr	PrintHex2Digit
		move	_Turns(a5),d4
		move.l	_PhaTurnsGad(a5),a4
		bsr	PrintHex2Digit
		rts

PrintResNum	bsr	GetInst
		moveq	#0,d0
		move.b	inst_ResAmp(a0),d0
		move	d0,_Attack(a5)
		move	inst_ResStart(a0),d0
		lsr	#1,d0
		move	d0,_Start(a5)
		move	inst_ResRepeat(a0),d0
		lsr	#1,d0
		move	d0,_Repeat(a5)
		move	inst_ResRepEnd(a0),d0
		lsr	#1,d0
		move	d0,_RepEnd(a5)
		move	inst_ResSpeed(a0),_Speed(a5)
		move	inst_ResDelay(a0),_Delay(a5)
		move	inst_ResTurns(a0),_Turns(a5)
ResNumPrint	move	_Attack(a5),d4
		move.l	_ResAmpGad(a5),a4
		bsr	PrintHex2Digit
		move	_Start(a5),d4
		move.l	_ResStartGad(a5),a4
		bsr	PrintHex2Digit
		move	_Repeat(a5),d4
		move.l	_ResRepeatGad(a5),a4
		bsr	PrintHex2Digit
		move	_RepEnd(a5),d4
		move.l	_ResRepEndGad(a5),a4
		bsr	PrintHex2Digit
		move	_Speed(a5),d4
		move.l	_ResSpeedGad(a5),a4
		bsr	PrintHex2Digit
		move	_Delay(a5),d4
		move.l	_ResDelayGad(a5),a4
		bsr	PrintHex2Digit
		move	_Turns(a5),d4
		move.l	_ResTurnsGad(a5),a4
		bsr	PrintHex2Digit
		rts

PrintMixNum	bsr	GetInst
		move	inst_MixStart(a0),d0
		lsr	#1,d0
		move	d0,_Start(a5)
		move	inst_MixRepeat(a0),d0
		lsr	#1,d0
		move	d0,_Repeat(a5)
		move	inst_MixRepEnd(a0),d0
		lsr	#1,d0
		move	d0,_RepEnd(a5)
		move	inst_MixSpeed(a0),_Speed(a5)
		move	inst_MixDelay(a0),_Delay(a5)
		move	inst_MixTurns(a0),_Turns(a5)
MixNumPrint	move	_Start(a5),d4
		move.l	_MixStartGad(a5),a4
		bsr	PrintHex2Digit
		move	_Repeat(a5),d4
		move.l	_MixRepeatGad(a5),a4
		bsr	PrintHex2Digit
		move	_RepEnd(a5),d4
		move.l	_MixRepEndGad(a5),a4
		bsr	PrintHex2Digit
		move	_Speed(a5),d4
		move.l	_MixSpeedGad(a5),a4
		bsr	PrintHex2Digit
		move	_Delay(a5),d4
		move.l	_MixDelayGad(a5),a4
		bsr	PrintHex2Digit
		move	_Turns(a5),d4
		move.l	_MixTurnsGad(a5),a4
		bsr	PrintHex2Digit
		rts

PrintTraNum	bsr	GetInst
		move	inst_TraStart(a0),d0
		lsr	#1,d0
		move	d0,_Start(a5)
		move	inst_TraRepeat(a0),d0
		lsr	#1,d0
		move	d0,_Repeat(a5)
		move	inst_TraRepEnd(a0),d0
		lsr	#1,d0
		move	d0,_RepEnd(a5)
		move	inst_TraSpeed(a0),_Speed(a5)
		move	inst_TraDelay(a0),_Delay(a5)
		move	inst_TraTurns(a0),_Turns(a5)
TraNumPrint	move	_Start(a5),d4
		move.l	_TraStartGad(a5),a4
		bsr	PrintHex3Digit
		move	_Repeat(a5),d4
		move.l	_TraRepeatGad(a5),a4
		bsr	PrintHex3Digit
		move	_RepEnd(a5),d4
		move.l	_TraRepEndGad(a5),a4
		bsr	PrintHex3Digit
		move	_Speed(a5),d4
		move.l	_TraSpeedGad(a5),a4
		bsr	PrintHex3Digit
		move	_Delay(a5),d4
		move.l	_TraDelayGad(a5),a4
		bsr	PrintHex3Digit
		move	_Turns(a5),d4
		move.l	_TraTurnsGad(a5),a4
		bsr	PrintHex3Digit
		rts

PrintFilNum	bsr	GetInst
		move	inst_FilStart(a0),d0
		lsr	#1,d0
		move	d0,_Start(a5)
		move	inst_FilRepeat(a0),d0
		lsr	#1,d0
		move	d0,_Repeat(a5)
		move	inst_FilRepEnd(a0),d0
		lsr	#1,d0
		move	d0,_RepEnd(a5)
		move	inst_FilSpeed(a0),_Speed(a5)
		move	inst_FilDelay(a0),_Delay(a5)
		move	inst_FilTurns(a0),_Turns(a5)
FilNumPrint	move	_Start(a5),d4
		move.l	_FilStartGad(a5),a4
		bsr	PrintHex2Digit
		move	_Repeat(a5),d4
		move.l	_FilRepeatGad(a5),a4
		bsr	PrintHex2Digit
		move	_RepEnd(a5),d4
		move.l	_FilRepEndGad(a5),a4
		bsr	PrintHex2Digit
		move	_Speed(a5),d4
		move.l	_FilSpeedGad(a5),a4
		bsr	PrintHex2Digit
		move	_Delay(a5),d4
		move.l	_FilDelayGad(a5),a4
		bsr	PrintHex2Digit
		move	_Turns(a5),d4
		move.l	_FilTurnsGad(a5),a4
		bsr.b	PrintHex2Digit
		rts

PrintLooNum	bsr	GetInst
		move.l	a0,a3
		moveq	#0,d3
		moveq	#0,d2
		move	inst_LooStart(a3),d2
		add.l	d2,d2
		move.l	_LooStartGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#0,d2
		move	inst_LooRepeat(a3),d2
		add.l	d2,d2
		move.l	_LooRepeatGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#0,d2
		move	inst_LooRepEnd(a3),d2
		add.l	d2,d2
		move.l	_LooRepEndGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#0,d2
		move	inst_LooLpStep(a3),d2
		add.l	d2,d2
		move.l	_LooLpStepGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#0,d2
		move	inst_LooLength(a3),d2
		add.l	d2,d2
		move.l	_LooLengthGad(a5),a2
		bsr	PrintHex5Digit
		move	inst_LooWait(a3),d4
		move.l	_LooWaitGad(a5),a4
		bsr.b	PrintHex2Digit
		move	inst_LooDelay(a3),d4
		move.l	_LooDelayGad(a5),a4
		bsr.b	PrintHex2Digit
		move	inst_LooTurns(a3),d4
		move.l	_LooTurnsGad(a5),a4
		bsr.b	PrintHex2Digit
		rts

************************************************************** Conny Cyréus *
* a4 <- GadgetPointer
* d4 <- Number to print

PrintHex2Digit	move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	NormalDrawMode0
		move	gg_LeftEdge(a4),d0
		sub	#3*8,d0
		move	gg_TopEdge(a4),d1
		addq	#6+2,d1
		move.l	d6,a1
		CallLib Move
		lea	_AscIIHexTab(a5),a0
		move	d4,d0
		add	d0,d0
		add	d0,a0
		moveq	#2,d0
		move.l	d6,a1
		CallLib Text
		rts

PrintHex3Digit	move.l	_RastPort2(a5),d6
PrintHex3Digits	move.l	_GfxBase(a5),a6
		bsr	NormalDrawMode0
		move	gg_LeftEdge(a4),d0
		sub	#4*8,d0
		move	gg_TopEdge(a4),d1
		addq	#6+2,d1
		move.l	d6,a1
		CallLib Move
		lea	_String(a5),a0
		lea	_AscIIHexTab(a5),a1
		move.l	a0,a2
		move	d4,d0
		lsr	#8,d0
		add	d0,d0
		move.b	1(a1,d0.w),(a2)+
		move	d4,d0
		and	#$ff,d0
		add	d0,d0
		add	d0,a1
		move.b	(a1)+,(a2)+
		move.b	(a1)+,(a2)+
		moveq	#3,d0
		move.l	d6,a1
		CallLib Text
		rts

************************************************************** Conny Cyréus *
* a2 <- GadgetPointer
* d2 <- Number to print
* d3 <- Offset for gadgets y pos

PrintHex5Digit	move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	NormalDrawMode0
		move.l	a2,a0
		move	gg_LeftEdge(a0),d0
		sub	#6*8,d0
		move	gg_TopEdge(a0),d1
		add	#8,d1
		add	d3,d1
		move.l	d6,a1
		CallLib Move
		move.l	d2,d0
		lea	_AscIIHexTab(a5),a1
		lea	_String(a5),a2
		swap	d0
		and	#$f,d0
		add	d0,d0
		move.b	1(a1,d0.w),(a2)+
		rol.l	#8,d0
		and	#$ff,d0
		add	d0,d0
		move.b	(a1,d0.w),(a2)+
		move.b	1(a1,d0.w),(a2)+
		rol.l	#8,d0
		and	#$ff,d0
		add	d0,d0
		move.b	(a1,d0.w),(a2)+
		move.b	1(a1,d0.w),(a2)+
		clr.b	(a2)+
		moveq	#5,d0
		lea	_String(a5),a0
		move.l	d6,a1
		CallLib Text
		rts

* Twins/PHA *****************************************************************
* Vibrato Gadgets                                     Last Change: 92-10-25 *
*****************************************************************************

VibSpeed	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_VibSpeed(a0)
.reply		rts

VibDepth	moveq	#0,d4
		move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#8,d4
		move	d4,inst_VibDepth(a0)
		move	inst_VibAttack(a0),d0
		beq.b	.nodiv
		divu	d0,d4
.nodiv		move	d4,inst_VibAtkSpd(a0)
.reply		rts

VibAttack	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		moveq	#0,d0
		move	inst_VibDepth(a0),d0
		move	d4,inst_VibAttack(a0)
		beq.b	.nodiv
		divu	d4,d0
.nodiv		move	d0,inst_VibAtkSpd(a0)
.reply		rts

VibDelay	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_VibDelay(a0)
.reply		rts

VibWave		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		move.b	im_Code+1(a4),inst_VibWaveNum(a0)
.exit		rts

VibDirection	tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		move.b	im_Code+1(a4),inst_VibDir(a0)
.exit		rts

* Twins/PHA *****************************************************************
* Tremolo Gadgets                                     Last Change: 92-10-25 *
*****************************************************************************

TreSpeed	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_TreSpeed(a0)
.reply		rts

TreDepth	moveq	#0,d4
		move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#8,d4
		move	d4,inst_TreDepth(a0)
		move	inst_TreAttack(a0),d0
		beq.b	.nodiv
		divu	d0,d4
.nodiv		move	d4,inst_TreAtkSpd(a0)
.reply		rts

TreAttack	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		moveq	#0,d0
		move	inst_TreDepth(a0),d0
		move	d4,inst_TreAttack(a0)
		beq.b	.nodiv
		divu	d4,d0
.nodiv		move	d0,inst_TreAtkSpd(a0)
.reply		rts

TreDelay	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_TreDelay(a0)
.reply		rts

TreWave		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		move.b	im_Code+1(a4),inst_TreWaveNum(a0)
.exit		rts

TreDirection	tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		move.b	im_Code+1(a4),inst_TreDir(a0)
.exit		rts

* Twins/PHA *****************************************************************
* Phase Gadgets                                       Last Change: 92-12-04 *
*****************************************************************************

PhaStart	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		sub	#256,d4
		neg	d4
		lsl	#1,d4
		move	d4,inst_PhaStart(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

PhaRepeat	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		sub	#256,d4
		neg	d4
		lsl	#1,d4
		move	d4,inst_PhaRepeat(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

PhaRepEnd	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		sub	#256,d4
		neg	d4
		lsl	#1,d4
		move	d4,inst_PhaRepEnd(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

PhaSpeed	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_PhaSpeed(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

PhaDelay	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_PhaDelay(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

PhaTurns	move	im_Code(a4),d4
		move.l	a0,a4
		tst	_InstNum(a5)
		beq.b	.skip
		bsr	GetInst
		btst	#PHASESTEP,inst_EnvTraPhaFilBits(a0)
		beq.b	.ok
		sub.b	#$80,d4
.ok		move	d4,inst_PhaTurns(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.skip		bsr	PrintHex2Digit
		rts

PhaType		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	im_Code(a4),inst_PhaType(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

PhaFill		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#PHASEFILL,inst_EnvTraPhaFilBits(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

PhaInit		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#PHASEINIT,inst_EnvTraPhaFilBits(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

PhaStep		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		clr	inst_PhaTurns(a4)
		bchg	#PHASESTEP,inst_EnvTraPhaFilBits(a4)
		beq.b	.speed
		move	#375,Coords14
		move	#83,Coords14+2
		jsr	PrintIText14
		bra.b	.ok
.speed		move	#375,Coords15
		move	#83,Coords15+2
		jsr	PrintIText15
.ok		bsr	SetPhase
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

* Twins/PHA *****************************************************************
* Filter Gadgets                                      Last Change: 92-12-04 *
*****************************************************************************

FilStart	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_FilStart(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

FilRepeat	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_FilRepeat(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

FilRepEnd	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_FilRepEnd(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

FilSpeed	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_FilSpeed(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

FilDelay	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_FilDelay(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

FilTurns	move	im_Code(a4),d4
		move.l	a0,a4
		tst	_InstNum(a5)
		beq.b	.skip
		bsr	GetInst
		btst	#FILTERSTEP,inst_EnvTraPhaFilBits(a0)
		beq.b	.ok
		sub.b	#$80,d4
.ok		move	d4,inst_FilTurns(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.skip		bsr	PrintHex2Digit
		rts

FilType		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.b	im_Code+1(a4),inst_FilType(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

FilInit		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#FILTERINIT,inst_EnvTraPhaFilBits(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

FilStep		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		clr	inst_FilTurns(a4)
		bchg	#FILTERSTEP,inst_EnvTraPhaFilBits(a4)
		beq.b	.speed
		move	#375,Coords14
		move	#83,Coords14+2
		jsr	PrintIText14
		bra.b	.ok
.speed		move	#375,Coords15
		move	#83,Coords15+2
		jsr	PrintIText15
.ok		bsr	SetFilter
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

FilBoost	tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#0,inst_MixResFilBoost(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

* Twins/PHA *****************************************************************
* Mix Gadgets                                         Last Change: 92-12-04 *
*****************************************************************************

MixStart	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_MixStart(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

MixRepeat	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_MixRepeat(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

MixRepEnd	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_MixRepEnd(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

MixSpeed	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_MixSpeed(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

MixDelay	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_MixDelay(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

MixTurns	move	im_Code(a4),d4
		move.l	a0,a4
		tst	_InstNum(a5)
		beq.b	.skip
		bsr	GetInst
		btst	#MIXSTEP,inst_MixResLooBits(a0)
		beq.b	.ok
		sub.b	#$80,d4
.ok		move	d4,inst_MixTurns(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.skip		bsr	PrintHex2Digit
		rts

MixInit		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#MIXINIT,inst_MixResLooBits(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

MixStep		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		clr	inst_MixTurns(a4)
		bchg	#MIXSTEP,inst_MixResLooBits(a4)
		beq.b	.speed
		move	#375,Coords14
		move	#83,Coords14+2
		jsr	PrintIText14
		bra.b	.ok
.speed		move	#375,Coords15
		move	#83,Coords15+2
		jsr	PrintIText15
.ok		bsr	SetMix
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

MixBuff		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#MIXBUFF,inst_MixResLooBits(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

MixCntDir	tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bclr	#MIXCOUNTER,inst_MixResLooBits(a0)
		tst	im_Code(a4)
		beq.b	.exit
		bset	#MIXCOUNTER,inst_MixResLooBits(a0)
.exit		move.b	_InstNum+1(a5),_InstInit(a5)
		rts

MixBoost	tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#2,inst_MixResFilBoost(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

* Twins/PHA *****************************************************************
* Transform Gadgets                                   Last Change: 92-12-04 *
*****************************************************************************

TraStart	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex3Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		add	d4,d4
		move	d4,inst_TraStart(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

TraRepeat	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex3Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		add	d4,d4
		move	d4,inst_TraRepeat(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

TraRepEnd	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex3Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		add	d4,d4
		move	d4,inst_TraRepEnd(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

TraSpeed	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_TraSpeed(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

TraDelay	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_TraDelay(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

TraTurns	move	im_Code(a4),d4
		move.l	a0,a4
		tst	_InstNum(a5)
		beq.b	.skip
		bsr	GetInst
		btst	#TRANSFORMSTEP,inst_EnvTraPhaFilBits(a0)
		beq.b	.ok
		sub.b	#$80,d4
.ok		move	d4,inst_TraTurns(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.skip		bsr	PrintHex2Digit
		rts

TraInit		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#TRANSFORMINIT,inst_EnvTraPhaFilBits(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

TraStep		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		clr	inst_TraTurns(a4)
		bchg	#TRANSFORMSTEP,inst_EnvTraPhaFilBits(a4)
		beq.b	.speed
		move	#375,Coords14
		move	#83,Coords14+2
		jsr	PrintIText14
		bra.b	.ok
.speed		move	#375,Coords15
		move	#83,Coords15+2
		jsr	PrintIText15
.ok		bsr	SetTransform
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

* Twins/PHA *****************************************************************
* Ws Gadgets                                          Last Change: 92-12-04 *
*****************************************************************************

LooStart	move.l	a0,d7
		moveq	#0,d4
		move	im_Code(a4),d4
		add	d4,d4
		tst	_InstNum(a5)
		beq.b	.reply
		bsr.b	LooFix
		move	d4,inst_LooStart(a4)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooRepeat	move.l	a0,d7
		moveq	#0,d4
		move	im_Code(a4),d4
		add	d4,d4
		tst	_InstNum(a5)
		beq.b	.reply
		bsr.b	LooFix
		move	d4,inst_LooRepeat(a4)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooRepEnd	move.l	a0,d7
		moveq	#0,d4
		move	im_Code(a4),d4
		add	d4,d4
		tst	_InstNum(a5)
		beq.b	.reply
		bsr.b	LooFix
		move	d4,inst_LooRepEnd(a4)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooFix		bsr	GetInst
		move.l	a0,a4
		moveq	#0,d1
		move	inst_LooLength(a4),d1
		bsr	GetSmpl
		moveq	#0,d0
		move	smpl_Length(a0),d0
		sub.l	d1,d0
		cmp.l	d0,d4
		ble.b	.ok
		move	d0,d4
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	d7,a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList35a,a3
		CallGadTools GT_SetGadgetAttrsA
.ok		moveq	#0,d2
		move	d4,d2
		add.l	d2,d2
		moveq	#0,d3
		move.l	d7,a2
		bra	PrintHex5Digit

LooLength	move.l	a0,d7
		move	im_Code(a4),d4
		add	d4,d4
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		moveq	#0,d2
		move	inst_LooStart(a4),d2
		cmp	inst_LooRepeat(a4),d2
		bhs.b	.ok1
		move	inst_LooRepeat(a4),d2
.ok1		cmp	inst_LooRepEnd(a4),d2
		bhs.b	.ok2
		move	inst_LooRepEnd(a4),d2
.ok2		moveq	#0,d1
		move	d4,d1
		bsr	GetSmpl
		moveq	#0,d0
		move	smpl_Length(a0),d0
		sub.l	d1,d0
		cmp.l	d0,d2
		bls.b	.ok
		moveq	#0,d0
		move	smpl_Length(a0),d0
		sub.l	d2,d0
		move	d0,d4
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	d7,a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList35a,a3
		CallGadTools GT_SetGadgetAttrsA
.ok		moveq	#0,d2
		move	d4,d2
		add.l	d2,d2
		moveq	#0,d3
		move.l	d7,a2
		bsr	PrintHex5Digit
		move	d4,inst_LooLength(a4)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooLpStep	moveq	#0,d2
		move	im_Code(a4),d4
		move	d4,d2
		add.l	d2,d2
		moveq	#0,d3
		move.l	a0,a2
		bsr	PrintHex5Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_LooLpStep(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooWait		move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_LooWait(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooDelay	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_LooDelay(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooTurns	move	im_Code(a4),d4
		move.l	a0,a4
		tst	_InstNum(a5)
		beq.b	.skip
		bsr	GetInst
		btst	#LOOPSTEP,inst_MixResLooBits(a0)
		beq.b	.ok
		sub.b	#$80,d4
.ok		move	d4,inst_LooTurns(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.skip		bsr	PrintHex2Digit
		rts

LooInit		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#LOOPINIT,inst_MixResLooBits(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooStep		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		clr	inst_LooTurns(a4)
		bchg	#LOOPSTEP,inst_MixResLooBits(a4)
		beq.b	.speed
		move	#399,Coords14
		move	#105,Coords14+2
		jsr	PrintIText14
		bra.b	.ok
.speed		move	#399,Coords15
		move	#105,Coords15+2
		jsr	PrintIText15
.ok		bsr	SetLoop
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

LooStop		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#LOOPSTOP,inst_Effects1(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

*****************************************************************************
* Wavesample parameters Gadgets                              * Conny Cyréus *
*****************************************************************************

WsStart		moveq	#0,d2
		move	im_Code(a4),d2
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		add	d2,d2
		move	d2,inst_SmplStart(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
		bsr	WsStartFix
.reply		rts

WsLoop		moveq	#0,d2
		move	im_Code(a4),d2
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		add	d2,d2
		move	d2,inst_SmplRepStart(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
		bsr	WsLoopFix
.reply		rts

WsEnd		moveq	#0,d2
		move	im_Code(a4),d2
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		add	d2,d2
		move	d2,inst_SmplEnd(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
		bsr	WsEndFix
.reply		rts

WsLoopOnOff	tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#WSLOOP,inst_Effects1(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

* Twins/PHA *****************************************************************
* Resonance Gadgets                                   Last Change: 92-12-04 *
*****************************************************************************

ResAmp		move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.b	d4,inst_ResAmp(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

ResStart	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_ResStart(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

ResRepeat	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_ResRepeat(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

ResRepEnd	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		lsl	#1,d4
		move	d4,inst_ResRepEnd(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

ResSpeed	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_ResSpeed(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

ResDelay	move	im_Code(a4),d4
		move.l	a0,a4
		bsr	PrintHex2Digit
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move	d4,inst_ResDelay(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

ResTurns	move	im_Code(a4),d4
		move.l	a0,a4
		tst	_InstNum(a5)
		beq.b	.skip
		bsr	GetInst
		btst	#RESONANCESTEP,inst_MixResLooBits(a0)
		beq.b	.ok
		sub.b	#$80,d4
.ok		move	d4,inst_ResTurns(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.skip		bsr	PrintHex2Digit
		rts

ResInit		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#RESONANCEINIT,inst_MixResLooBits(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

ResStep		tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		move.l	a0,a4
		clr	inst_ResTurns(a4)
		bchg	#RESONANCESTEP,inst_MixResLooBits(a4)
		beq.b	.speed
		move	#375,Coords14
		move	#94,Coords14+2
		jsr	PrintIText14
		bra.b	.ok
.speed		move	#375,Coords15
		move	#94,Coords15+2
		jsr	PrintIText15
.ok		bsr	SetResonance
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

ResBoost	tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		bchg	#1,inst_MixResFilBoost(a0)
		move.b	_InstNum+1(a5),_InstInit(a5)
.reply		rts

*****************************************************************************
* Wavesample Parameters, Waveform F/X Visualizer routines    * Conny Cyréus *
*****************************************************************************

_WsVsButtons	rs.w	1
_PrintWsStart	rs.w	1
_PrintWsLoop	rs.w	1
_PrintWsEnd	rs.w	1
_PrintWsLoopLen	rs.w	1
_PrintWsLen	rs.w	1

WsVsButtons	move	im_Code(a4),d7
		move	_WsVsButtons(a5),d0
		cmp	d0,d7
		beq.b	.reply
		tst	d7
		bne.b	.visualizer
		move	d7,_WsVsButtons(a5)
		bsr	.cleararea
		moveq	#-1,d0
		move	_GadNum15(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList15(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList15(a5)
		move	_GadNum15(a5),d0
		move.l	_GadList15(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText6
		bsr	SetWsParameters
.reply		rts

.visualizer	move	_GadNum15(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList15(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList15(a5),a0
		move.l	a0,_GList15(a5)
		move	_GadNum15(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		bsr.b	.cleararea
		move.l	_VisualInfo(a5),GtViPtr
		move.l	#BBFT_BUTTON,GtFt
		move	#366,d0
		move	#174,d1
		move	#260,d2
		move	#68,d3
		move.l	_RastPort2(a5),a0
		lea	ReBoxTagList,a1
		CallGadTools DrawBevelBoxA
		move	d7,_WsVsButtons(a5)
.exit		rts

.cleararea	move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#366,d0
		move	#174,d1
		move	#626,d2
		move	#241,d3
		CallLib RectFill
		rts

SetWsParameters	bsr	GetInst
		move.l	a0,a4
		clr	_PrintWsStart(a5)
		clr	_PrintWsLoop(a5)
		clr	_PrintWsEnd(a5)
		clr	_PrintWsLoopLen(a5)
		clr	_PrintWsLen(a5)
		clr	GTSC_Ws+2
		tst	_InstNum(a5)
		beq.b	.empty
		tst.b	inst_SmplNumber(a0)
		beq.b	.empty
		move	inst_SmplStart(a0),_PrintWsStart(a5)
		move	inst_SmplRepStart(a0),_PrintWsLoop(a5)
		move	inst_SmplEnd(a0),_PrintWsEnd(a5)
		move	inst_SmplRepLen(a0),_PrintWsLoopLen(a5)
		bsr	GetSmpl
		move	smpl_Length(a0),_PrintWsLen(a5)
.empty		moveq	#0,d3
		moveq	#0,d2
		move	_PrintWsStart(a5),d2
		add.l	d2,d2
		move.l	_WsStartGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#0,d2
		move	_PrintWsLoop(a5),d2
		add.l	d2,d2
		move.l	_WsLoopGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#0,d2
		move	_PrintWsEnd(a5),d2
		add.l	d2,d2
		move.l	_WsEndGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#11,d3
		moveq	#0,d2
		move	_PrintWsLoopLen(a5),d2
		add.l	d2,d2
		move.l	_WsEndGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#22,d3
		moveq	#0,d2
		move	_PrintWsLen(a5),d2
		add.l	d2,d2
		move.l	_WsEndGad(a5),a2
		bsr	PrintHex5Digit
		moveq	#0,d6
		moveq	#0,d7
		tst	_InstNum(a5)
		beq.b	.zero
		bsr	GetInst
		tst.b	inst_SmplNumber(a0)
		beq.b	.zero
		bsr	GetSmpl
		moveq	#0,d7
		move	smpl_Length(a0),d7
		addq.l	#4,d7
		cmp.l	#$ffff,d7
		bls.b	.startok
		move.l	#$ffff,d7
.startok	lsr.l	#1,d7
		move.l	d7,d6
		subq.l	#1,d7
.zero		move	d7,WsRange+2
		move	_PrintWsStart(a5),d0
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	_WsStartGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList35,a3
		CallGadTools GT_SetGadgetAttrsA
		move	_PrintWsLoop(a5),d0
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	_WsLoopGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib	GT_SetGadgetAttrsA
		move	_PrintWsEnd(a5),d0
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move	d6,WsRange+2
		move.l	_WsEndGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib	GT_SetGadgetAttrsA
		btst	#WSLOOP,inst_Effects1(a4)
		sne	GTCB_Check+3
		move.l	_LoopGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList1,a3
		CallLib	GT_SetGadgetAttrsA
		rts

* Twins/PHA *****************************************************************
* Sample parameters gadget routines                   Last Change: 92-10-25 *
*****************************************************************************

_WsButtons	rs.w	1

WsParameters	bsr	SetFont8
		bsr	NormalDrawMode
		move	im_Code(a4),d7
		move	_WsButtons(a5),d0
		cmp	d0,d7
		beq.b	.reply
		move	d7,_WsButtons(a5)
		lea	WsParRemJump,a0
		add	d0,d0
		add	d0,d0
		move.l	(a0,d0.w),a0
		jsr	(a0)
		lea	WsParAddJump,a0
		add	d7,d7
		add	d7,d7
		move.l	(a0,d7.w),a0
		jsr	(a0)
.reply		rts

WsParRemJump	dc.l	RemEnvelope,RemVibrato,RemTremolo
		dc.l	RemArpeggio,RemTransform,RemPhase
		dc.l	RemMix,RemResonance,RemFilter,RemLoop

WsParAddJump	dc.l	AddEnvelope,AddVibrato,AddTremolo
		dc.l	AddArpeggio,AddTransform,AddPhase
		dc.l	AddMix,AddResonance,AddFilter,AddLoop

WsParSetJump	dc.l	SetEnvelope,SetVibrato,SetTremolo
		dc.l	SetArpeggio,SetTransform,SetPhase
		dc.l	SetMix,SetResonance,SetFilter,SetLoop

RemEnvelope	move	_GadNum4(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList4(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList4(a5),a0
		move.l	a0,_GList4(a5)
		move	_GadNum4(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#375,d0
		move	#14,d1
		move	#626,d2
		move	#125,d3
		CallLib RectFill
.exit		rts

RemVibrato	move	_GadNum5(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList5(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList5(a5),a0
		move.l	a0,_GList5(a5)
		move	_GadNum5(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#626,d2
		move	#93,d3
		CallLib RectFill
.exit		rts

RemTremolo	move	_GadNum6(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList6(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList6(a5),a0
		move.l	a0,_GList6(a5)
		move	_GadNum6(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#626,d2
		move	#93,d3
		CallLib RectFill
.exit		rts

RemArpeggio	move.l	d7,-(sp)
		clr.b	_Arpg(a5)
		bclr	#3,_MarkEd(a5)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	DoHexReturn
		move	_GadNum13(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList13(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList13(a5),a0
		move.l	a0,_GList13(a5)
		move	_GadNum13(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#626,d2
		move	#137,d3
		CallLib RectFill
.exit		move.l	(sp)+,d7
		rts

RemTransform	move	_GadNum12(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList12(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList12(a5),a0
		move.l	a0,_GList12(a5)
		move	_GadNum12(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#626,d2
		move	#148,d3
		CallLib RectFill
.exit		rts

RemPhase	move	_GadNum8(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList8(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList8(a5),a0
		move.l	a0,_GList8(a5)
		move	_GadNum8(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#626,d2
		move	#116,d3
		CallLib RectFill
.exit		rts

RemMix		move	_GadNum10(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList10(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList10(a5),a0
		move.l	a0,_GList10(a5)
		move	_GadNum10(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#626,d2
		move	#141,d3
		CallLib RectFill
.exit		rts

RemResonance	move	_GadNum7(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList7(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList7(a5),a0
		move.l	a0,_GList7(a5)
		move	_GadNum7(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#626,d2
		move	#126,d3
		CallLib RectFill
.exit		rts

RemFilter	move	_GadNum9(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList9(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList9(a5),a0
		move.l	a0,_GList9(a5)
		move	_GadNum9(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#626,d2
		move	#128,d3
		CallLib RectFill
.exit		rts

RemLoop		move	_GadNum14(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList14(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList14(a5),a0
		move.l	a0,_GList14(a5)
		move	_GadNum14(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#367,d0
		move	#14,d1
		move	#628,d2
		move	#137,d3
		CallLib RectFill
.exit		rts

AddEnvelope	moveq	#-1,d0
		move	_GadNum4(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList4(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList4(a5)
		move	_GadNum4(a5),d0
		move.l	_GadList4(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText3
		bsr	SetEnvelope
		rts

AddVibrato	moveq	#-1,d0
		move	_GadNum5(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList5(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList5(a5)
		move	_GadNum5(a5),d0
		move.l	_GadList5(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText4
		bsr	SetVibrato
		rts

AddTremolo	moveq	#-1,d0
		move	_GadNum6(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList6(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList6(a5)
		move	_GadNum6(a5),d0
		move.l	_GadList6(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText5
		bsr	SetTremolo
		rts

AddArpeggio	moveq	#-1,d0
		move	_GadNum13(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList13(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList13(a5)
		move	_GadNum13(a5),d0
		move.l	_GadList13(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText13
		jsr	DrawArpEdBoxes
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	SetArpeggio
		rts

AddTransform	bsr	GetInst
		move.l	a0,a4
		moveq	#-1,d0
		move	_GadNum12(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList12(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList12(a5)
		move	_GadNum12(a5),d0
		move.l	_GadList12(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText12
		btst	#TRANSFORMSTEP,inst_EnvTraPhaFilBits(a4)
		bne.b	.speed
		move	#375,Coords14
		move	#83,Coords14+2
		jsr	PrintIText14
		bra	SetTransform
.speed		move	#375,Coords15
		move	#83,Coords15+2
		jsr	PrintIText15
		bsr	SetTransform
		rts

AddPhase	bsr	GetInst
		move.l	a0,a4
		moveq	#-1,d0
		move	_GadNum8(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList8(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList8(a5)
		move	_GadNum8(a5),d0
		move.l	_GadList8(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText8
		btst	#PHASESTEP,inst_EnvTraPhaFilBits(a4)
		bne.b	.speed
		move	#375,Coords14
		move	#83,Coords14+2
		jsr	PrintIText14
		bra	SetPhase
.speed		move	#375,Coords15
		move	#83,Coords15+2
		jsr	PrintIText15
		bsr	SetPhase
		rts

AddMix		bsr	GetInst
		move.l	a0,a4
		moveq	#-1,d0
		move	_GadNum10(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList10(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList10(a5)
		move	_GadNum10(a5),d0
		move.l	_GadList10(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText10
		btst	#RESONANCESTEP,inst_MixResLooBits(a4)
		bne.b	.speed
		move	#375,Coords14
		move	#83,Coords14+2
		jsr	PrintIText14
		bra	SetMix
.speed		move	#375,Coords15
		move	#83,Coords15+2
		jsr	PrintIText15
		bsr	SetMix
		rts

AddResonance	bsr	GetInst
		move.l	a0,a4
		moveq	#-1,d0
		move	_GadNum7(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList7(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList7(a5)
		move	_GadNum7(a5),d0
		move.l	_GadList7(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText7
		btst	#RESONANCESTEP,inst_MixResLooBits(a4)
		bne.b	.speed
		move	#375,Coords14
		move	#94,Coords14+2
		jsr	PrintIText14
		bra	SetResonance
.speed		move	#375,Coords15
		move	#94,Coords15+2
		jsr	PrintIText15
		bsr	SetResonance
		rts

AddFilter	bsr	GetInst
		move.l	a0,a4
		moveq	#-1,d0
		move	_GadNum9(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList9(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList9(a5)
		move	_GadNum9(a5),d0
		move.l	_GadList9(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText9
		btst	#FILTERSTEP,inst_EnvTraPhaFilBits(a4)
		bne.b	.speed
		move	#375,Coords14
		move	#83,Coords14+2
		jsr	PrintIText14
		bra	SetFilter
.speed		move	#375,Coords15
		move	#83,Coords15+2
		jsr	PrintIText15
		bsr	SetFilter
		rts

AddLoop		bsr	GetInst
		move.l	a0,a4
		moveq	#-1,d0
		move	_GadNum14(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList14(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList14(a5)
		move	_GadNum14(a5),d0
		move.l	_GadList14(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		jsr	PrintIText11
		btst	#LOOPSTEP,inst_MixResLooBits(a4)
		bne.b	.speed
		move	#399,Coords14
		move	#105,Coords14+2
		jsr	PrintIText14
		bra	SetLoop
.speed		move	#399,Coords15
		move	#105,Coords15+2
		jsr	PrintIText15
		bra	SetLoop

SetEnvelope	bsr	GetInst
		move.l	a0,a4
		btst	#ADSRHOLDSUSTAIN,inst_EnvTraPhaFilBits(a4)
		sne	d0
		and	#1,d0
		move	d0,GTCY_SusNum+2
		move.l	_SustainToggleGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList9,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_EnvAttVol(a4),GTSC_Num+2
		move.l	_AttackGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList19,a3
		CallLib GT_SetGadgetAttrsA
		move	inst_EnvDecVol(a4),GTSC_Num+2
		move.l	_DecayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_EnvSusVol(a4),GTSC_Num+2
		move.l	_SustainGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_EnvRelVol(a4),GTSC_Num+2
		move.l	_ReleaseGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_EnvAttLen(a4),d0
		subq	#1,d0
		move	d0,GTSC_Num+2
		move.l	_AttackLenGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_EnvDecLen(a4),d0
		subq	#1,d0
		move	d0,GTSC_Num+2
		move.l	_DecayLenGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_EnvSusLen(a4),d0
		subq	#1,d0
		move	d0,GTSC_Num+2
		move.l	_SustainLenGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_EnvRelLen(a4),d0
		subq	#1,d0
		move	d0,GTSC_Num+2
		move.l	_ReleaseLenGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		bsr	PrintADSRNum
		rts

SetVibrato	bsr	GetInst
		move.l	a0,a4
		move	inst_VibSpeed(a4),GTSC_Num+2
		move.l	_VibSpeedGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList19,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_VibDepth(a4),d0
		lsr	#8,d0
		move	d0,GTSC_Num+2
		move.l	_VibDepthGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_VibAttack(a4),GTSC_Num+2
		move.l	_VibAttackGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_VibDelay(a4),GTSC_Num+2
		move.l	_VibDelayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move.b	inst_VibWaveNum(a4),GTCY_Wave+3
		move.l	_VibWaveGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList16,a3
		CallLib GT_SetGadgetAttrsA
		move.b	inst_VibDir(a4),GTCY_DownUp+3
		move.l	_VibDirGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList34,a3
		CallLib GT_SetGadgetAttrsA
		bsr	PrintVibNum
		rts

SetTremolo	bsr	GetInst
		move.l	a0,a4
		move	inst_TreSpeed(a4),GTSC_Num+2
		move.l	_TreSpeedGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList19,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_TreDepth(a4),d0
		lsr	#8,d0
		move	d0,GTSC_Num+2
		move.l	_TreDepthGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_TreAttack(a4),GTSC_Num+2
		move.l	_TreAttackGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_TreDelay(a4),GTSC_Num+2
		move.l	_TreDelayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move.b	inst_TreWaveNum(a4),GTCY_Wave+3
		move.l	_TreWaveGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList16,a3
		CallLib GT_SetGadgetAttrsA
		move.b	inst_TreDir(a4),GTCY_DownUp+3
		move.l	_TreDirGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList34,a3
		CallLib GT_SetGadgetAttrsA
		bsr	PrintTreNum
		rts

SetArpeggio	move.l	_RastPort2(a5),d6
		bsr	ExitArpg
		bsr	PrintArpgTab
		bsr	PrintArpSpeed
		bsr	PrintArpGroove
		bsr	UpdateArpg
		bsr	ClrArpgWait
		rts

SetTransform	bsr	GetInst
		move.l	a0,a4
		lea	inst_TraWaveNums(a4),a0
		move	_WsMaxNum(a5),d1
		moveq	#0,d7
.test		move.b	(a0)+,d0
		beq.b	.ok
		cmp.b	d1,d0
		bhi.b	.ok
		addq	#1,d7
		cmp	#5,d7
		blo.b	.test
.ok		mulu	#256,d7
		bne.b	.great
		move	#256,d7
.great		addq	#2,d7
		move	d7,TraNumRange+2
		move	inst_TraStart(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_TraStartGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList19,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_TraRepeat(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_TraRepeatGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_TraRepEnd(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_TraRepEndGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_TraSpeed(a4),GTSC_Num+2
		move.l	_TraSpeedGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_TraDelay(a4),GTSC_Num+2
		move.l	_TraDelayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_TraTurns(a4),GTSC_Num+2
		btst	#TRANSFORMSTEP,inst_EnvTraPhaFilBits(a4)
		beq.b	.oki
		sub.b	#$80,GTSC_Num+3
.oki		move.l	_TraTurnsGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#TRANSFORMINIT,inst_EnvTraPhaFilBits(a4)
		seq.b	GTCB_Check+3
		move.l	_TraInitGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList1,a3
		CallLib GT_SetGadgetAttrsA
		btst	#TRANSFORMSTEP,inst_EnvTraPhaFilBits(a4)
		sne.b	GTCB_Check+3
		move.l	_TraStepGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		bsr	PrintTraNum
		jsr	DrawTraNumBox
		bsr	PrintTraWsNums
		move.l	_TraStartGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList30,a3
		CallGadTools GT_SetGadgetAttrsA
		move.l	_TraRepeatGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move.l	_TraRepEndGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		rts

SetPhase	bsr	GetInst
		move.l	a0,a4
		move	inst_PhaStart(a4),d0
		lsr	#1,d0
		neg	d0
		add	#256,d0
		move	d0,GTSC_Num+2
		move.l	_PhaStartGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList19,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_PhaRepeat(a4),d0
		lsr	#1,d0
		neg	d0
		add	#256,d0
		move	d0,GTSC_Num+2
		move.l	_PhaRepeatGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_PhaRepEnd(a4),d0
		lsr	#1,d0
		neg	d0
		add	#256,d0
		move	d0,GTSC_Num+2
		move.l	_PhaRepEndGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_PhaSpeed(a4),GTSC_Num+2
		move.l	_PhaSpeedGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_PhaDelay(a4),GTSC_Num+2
		move.l	_PhaDelayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_PhaTurns(a4),GTSC_Num+2
		btst	#PHASESTEP,inst_EnvTraPhaFilBits(a4)
		beq.b	.ok
		sub.b	#$80,GTSC_Num+3
.ok		move.l	_PhaTurnsGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_PhaType(a4),GTCY_PhaType+2
		move.l	_PhaTypeGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList32,a3
		CallLib GT_SetGadgetAttrsA
		btst	#PHASEFILL,inst_EnvTraPhaFilBits(a4)
		sne	GTCB_Check+3
		move.l	_PhaFillGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList1,a3
		CallLib GT_SetGadgetAttrsA
		btst	#PHASEINIT,inst_EnvTraPhaFilBits(a4)
		seq.b	GTCB_Check+3
		move.l	_PhaInitGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#PHASESTEP,inst_EnvTraPhaFilBits(a4)
		sne	GTCB_Check+3
		move.l	_PhaStepGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		bsr	PrintPhaNum
		rts

SetMix		bsr	GetInst
		move.l	a0,a4
		move	inst_MixStart(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_MixStartGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList19,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_MixRepeat(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_MixRepeatGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_MixRepEnd(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_MixRepEndGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_MixSpeed(a4),GTSC_Num+2
		move.l	_MixSpeedGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_MixDelay(a4),GTSC_Num+2
		move.l	_MixDelayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_MixTurns(a4),GTSC_Num+2
		btst	#MIXSTEP,inst_MixResLooBits(a4)
		beq.b	.ok
		sub.b	#$80,GTSC_Num+3
.ok		move.l	_MixTurnsGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#MIXINIT,inst_MixResLooBits(a4)
		seq.b	GTCB_Check+3
		move.l	_MixInitGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList1,a3
		CallLib GT_SetGadgetAttrsA
		btst	#MIXSTEP,inst_MixResLooBits(a4)
		sne.b	GTCB_Check+3
		move.l	_MixStepGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#MIXBUFF,inst_MixResLooBits(a4)
		sne.b	GTCB_Check+3
		move.l	_MixBuffGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#2,inst_MixResFilBoost(a4)
		sne.b	GTCB_Check+3
		move.l	_MixBoostGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#MIXCOUNTER,inst_MixResLooBits(a4)
		sne.b	GTCY_Way+3
		move.l	_MixCntDirGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList29,a3
		CallLib GT_SetGadgetAttrsA
		bsr	UpdateMixWave
		bsr	PrintMixNum
		rts

SetResonance	bsr	GetInst
		move.l	a0,a4
		moveq	#0,d0
		move.b	inst_ResAmp(a4),d0
		move	d0,GTSC_Num+2
		move.l	_ResAmpGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList19,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_ResStart(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_ResStartGad(a5),a0
		move.l	_Window2(a5),a1
		CallGadTools GT_SetGadgetAttrsA
		move	inst_ResRepeat(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_ResRepeatGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_ResRepEnd(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_ResRepEndGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_ResSpeed(a4),GTSC_Num+2
		move.l	_ResSpeedGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_ResDelay(a4),GTSC_Num+2
		move.l	_ResDelayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_ResTurns(a4),GTSC_Num+2
		btst	#RESONANCESTEP,inst_MixResLooBits(a4)
		beq.b	.ok
		sub.b	#$80,GTSC_Num+3
.ok		move.l	_ResTurnsGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#RESONANCEINIT,inst_MixResLooBits(a4)
		seq.b	GTCB_Check+3
		move.l	_ResInitGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList1,a3
		CallLib GT_SetGadgetAttrsA
		btst	#RESONANCESTEP,inst_MixResLooBits(a4)
		sne	GTCB_Check+3
		move.l	_ResStepGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#1,inst_MixResFilBoost(a4)
		sne.b	GTCB_Check+3
		move.l	_ResBoostGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		bsr	PrintResNum
		rts

SetFilter	bsr	GetInst
		move.l	a0,a4
		move	inst_FilStart(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_FilStartGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList19,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_FilRepeat(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_FilRepeatGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_FilRepEnd(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Num+2
		move.l	_FilRepEndGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_FilSpeed(a4),GTSC_Num+2
		move.l	_FilSpeedGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_FilDelay(a4),GTSC_Num+2
		move.l	_FilDelayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_FilTurns(a4),GTSC_Num+2
		btst	#FILTERSTEP,inst_EnvTraPhaFilBits(a4)
		beq.b	.ok
		sub.b	#$80,GTSC_Num+3
.ok		move.l	_FilTurnsGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move.b	inst_FilType(a4),GTCY_FilType+3
		move.l	_FilTypeGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList33,a3
		CallLib GT_SetGadgetAttrsA
		btst	#FILTERINIT,inst_EnvTraPhaFilBits(a4)
		seq.b	GTCB_Check+3
		move.l	_FilInitGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList1,a3
		CallLib GT_SetGadgetAttrsA
		btst	#FILTERSTEP,inst_EnvTraPhaFilBits(a4)
		sne.b	GTCB_Check+3
		move.l	_FilStepGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#0,inst_MixResFilBoost(a4)
		sne.b	GTCB_Check+3
		move.l	_FilBoostGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		bsr	PrintFilNum
		rts

SetLoop		bsr	GetInst
		move.l	a0,a4
		clr	WsRange+2
		tst	_InstNum(a5)
		bne.b	.okej
		tst.b	inst_SmplNumber(a4)
		bne.b	.okej
		bra.b	.zero
.okej		tst.b	inst_SmplNumber(a4)
		beq.b	.zero
		bsr	GetSmpl
		move	smpl_Length(a0),d0
		lsr	#1,d0
		addq	#2,d0
		move	d0,WsRange+2
.zero		move	inst_LooStart(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	_LooStartGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList35,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_LooRepeat(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	_LooRepeatGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib	GT_SetGadgetAttrsA
		move	inst_LooRepEnd(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	_LooRepEndGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib	GT_SetGadgetAttrsA
		move	inst_LooLength(a4),d0
		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	_LooLengthGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib	GT_SetGadgetAttrsA
		move	#$342,WsRange+2
		move	inst_LooLpStep(a4),GTSC_Ws+2
		move.l	_LooLpStepGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib	GT_SetGadgetAttrsA
		move	inst_LooWait(a4),GTSC_Num+2
		move.l	_LooWaitGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList19,a3
		CallGadTools GT_SetGadgetAttrsA
		move	inst_LooDelay(a4),GTSC_Num+2
		move.l	_LooDelayGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		move	inst_LooTurns(a4),GTSC_Num+2
		btst	#LOOPSTEP,inst_MixResLooBits(a4)
		beq.b	.ok
		sub.b	#$80,GTSC_Num+3
.ok		move.l	_LooTurnsGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#LOOPINIT,inst_MixResLooBits(a4)
		seq.b	GTCB_Check+3
		move.l	_LooInitGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList1,a3
		CallLib GT_SetGadgetAttrsA
		btst	#LOOPSTEP,inst_MixResLooBits(a4)
		sne.b	GTCB_Check+3
		move.l	_LooStepGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		btst	#LOOPSTOP,inst_Effects1(a4)
		sne.b	GTCB_Check+3
		move.l	_LooStopGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		bsr	PrintLooNum
		rts

PrintTraWsNums	move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#459,d0
		move	#107,d1
		move	#622,d2
		move	#146,d3
		CallLib RectFill
		bsr	NormalDrawMode0
		bsr	GetInst
		lea	inst_TraWaveNums(a0),a3
		move	_WsMaxNum(a5),d3
		move	#459,d5
		move	#113,d4
		moveq	#5-1,d2
.loop		move.l	d6,a1
		move.l	d5,d0
		move.l	d4,d1
		CallLib Move
		lea	_WsPtrs(a5),a2
		moveq	#0,d0
		move.b	(a3)+,d0
		beq.b	.exit
		cmp.b	d3,d0
		bhi.b	.exit
		add	d0,d0
		add	d0,d0
		add	d0,a2
		move.l	(a2),a2
		lea	smpl_NameStr(a2),a0
		move.l	d6,a1
		moveq	#18,d0
		CallLib Text
		addq.l	#8,d4
		dbf	d2,.loop
.exit		rts

RemSampMxGad	move	_GadNum3(a5),d0
		move.l	_Window2(a5),a0
		move.l	_GadList3(a5),a1
		CallIntuition RemoveGList
		tst	d0
		bmi.b	.exit
		move.l	_GadList3(a5),a0
		move.l	a0,_GList3(a5)
		move	_GadNum3(a5),d0
		subq	#2,d0
.loop		move.l	(a0),a0
		dbf	d0,.loop
		clr.l	gg_NextGadget(a0)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ClearDrawMode
		move.l	d6,a1
		move	#218,d0
		move	#14,d1
		move	#352,d2
		move	#124,d3
		CallLib RectFill
.exit		rts

AddSampMxGad	moveq	#-1,d0
		move	_GadNum3(a5),d1
		move.l	_Window2(a5),a0
		move.l	_GadList3(a5),a1
		sub.l	a2,a2
		CallIntuition AddGList
		clr.l	_GList3(a5)
		move	_GadNum3(a5),d0
		move.l	_GadList3(a5),a0
		move.l	_Window2(a5),a1
		CallLib RefreshGList
		move.l	_Window2(a5),a0
		sub.l	a1,a1
		CallGadTools GT_RefreshWindow
		rts

* Twins/PHA *****************************************************************
* Hex gadgets routines                                Last Change: 92-10-24 *
*****************************************************************************

_ArrowPort	rs.l	1
_ArrowJump	rs.l	1
_ArrowReturn	rs.l	1
_ArrowGadget	rs.l	1
_ArrowDelay	rs.w	1
_ArrowTicks	rs.w	1
_ArrowSpeed	rs.w	1

PartPlus	move.l	#.plus,_ArrowJump(a5)
		move.l	#TestPlayPart,_ArrowReturn(a5)
		move.l	_UserPort1(a5),_ArrowPort(a5)
		move.l	#partplus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0101,_HexNumEd1(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
		bsr	GetPartPtr
		bsr	FreePart
.plus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		add	d1,_PartNum(a5)
		cmp	#1023,_PartNum(a5)
		ble	PartPrint
		move	#1023,_PartNum(a5)
		bra	PartPrint
.reply		rts

TempoPlus	move.l	#.plus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort1(a5),_ArrowPort(a5)
		move.l	#tempoplus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0301,_HexNumEd1(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.plus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetTune
		lea	tune_Tempo(a0),a0
		add.b	d1,1(a0)
		bcc.b	.printnum
		move	#$ff,(a0)
.printnum	bsr	PrintTempoNum
		jsr	CalcBPM
		bra	ArrowRepeat
.reply		rts

SpdPlus		move.l	#.plus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort1(a5),_ArrowPort(a5)
		move.l	#spdplus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0401,_HexNumEd1(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.plus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetTune
		lea	tune_Speed(a0),a0
		add.b	d1,(a0)
		cmp.b	#$1f,(a0)
		ble.b	.printnum
		move.b	#$1f,(a0)
.printnum	bsr	PrintSpdNum
		jsr	CalcBPM
		bra	ArrowRepeat
.reply		rts

GrvPlus		move.l	#.plus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort1(a5),_ArrowPort(a5)
		move.l	#grvplus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0501,_HexNumEd1(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.plus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetTune
		lea	tune_Groove(a0),a0
		add.b	d1,(a0)
		cmp.b	#$1f,(a0)
		ble.b	.printnum
		move.b	#$1f,(a0)
.printnum	bsr	PrintGrvNum
		jsr	CalcBPM
		bra	ArrowRepeat
.reply		rts

ArpgPlus	tst	_InstNum(a5)
		beq.b	.reply
		move.l	#.plus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort2(a5),_ArrowPort(a5)
		move.l	#arpgplus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0101,_HexNumEd2(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
		bsr	GetArpgPtr
		bsr	FreeArpg		Lägger in ID2 i d4.l
.plus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetInst
		lea	inst_ArpTable(a0),a0
		add.b	d1,1(a0)
		bcc	ArpPrint
		move	#$ff,(a0)
		bra	ArpPrint
.reply		rts

SpeedPlus	tst	_InstNum(a5)
		beq.b	.reply
		move.l	#.plus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort2(a5),_ArrowPort(a5)
		move.l	#speedplus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0201,_HexNumEd2(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.plus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetInst
		lea	inst_ArpSpeed(a0),a0
		add.b	d1,(a0)
		cmp.b	#$1f,(a0)
		ble.b	.printnum
		move.b	#$1f,(a0)
.printnum	bsr	PrintArpSpeed
		bra	ArrowRepeat
.reply		rts

GroovePlus	tst	_InstNum(a5)
		beq.b	.reply
		move.l	#.plus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort2(a5),_ArrowPort(a5)
		move.l	#grooveplus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0301,_HexNumEd2(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.plus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetInst
		lea	inst_ArpGroove(a0),a0
		add.b	d1,(a0)
		cmp.b	#$1f,(a0)
		ble.b	.printnum
		move.b	#$1f,(a0)
.printnum	bsr	PrintArpGroove
		bra	ArrowRepeat
.reply		rts

PartMinus	move.l	#.minus,_ArrowJump(a5)
		move.l	#TestPlayPart,_ArrowReturn(a5)
		move.l	_UserPort1(a5),_ArrowPort(a5)
		move.l	#partminus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0101,_HexNumEd1(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
		bsr	GetPartPtr
		bsr	FreePart
.minus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		sub	d1,_PartNum(a5)
		bcc	PartPrint
		clr	_PartNum(a5)
		bra	PartPrint
.reply		rts

TempoMinus	move.l	#.minus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort1(a5),_ArrowPort(a5)
		move.l	#tempominus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0301,_HexNumEd1(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.minus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetTune
		lea	tune_Tempo(a0),a0
		sub	d1,(a0)
		cmp	#$20,(a0)
		bge.b	.printnum
		move	#$20,(a0)
.printnum	bsr	PrintTempoNum
		jsr	CalcBPM
		bra	ArrowRepeat
.reply		rts

SpdMinus	move.l	#.minus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort1(a5),_ArrowPort(a5)
		move.l	#spdminus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0401,_HexNumEd1(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.minus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetTune
		lea	tune_Speed(a0),a0
		sub.b	d1,(a0)
		bgt.b	.printnum
		move.b	#1,(a0)
.printnum	bsr	PrintSpdNum
		jsr	CalcBPM
		bra	ArrowRepeat
.reply		rts

GrvMinus	move.l	#.minus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort1(a5),_ArrowPort(a5)
		move.l	#grvminus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0501,_HexNumEd1(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.minus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetTune
		lea	tune_Groove(a0),a0
		sub.b	d1,(a0)
		bcc.b	.printnum
		clr.b	(a0)
.printnum	bsr	PrintGrvNum
		jsr	CalcBPM
		bra	ArrowRepeat
.reply		rts

ArpgMinus	tst	_InstNum(a5)
		beq.b	.reply
		move.l	#.minus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort2(a5),_ArrowPort(a5)
		move.l	#arpgminus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0101,_HexNumEd2(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
		bsr	GetArpgPtr
		bsr	FreeArpg		Lägger in ID2 i d4.l
.minus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetInst
		lea	inst_ArpTable(a0),a0
		sub	d1,(a0)
		bcc	ArpPrint
		clr	(a0)
		bra	ArpPrint
.reply		rts

SpeedMinus	tst	_InstNum(a5)
		beq.b	.reply
		move.l	#.minus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort2(a5),_ArrowPort(a5)
		move.l	#speedminus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0201,_HexNumEd2(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.minus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetInst
		lea	inst_ArpSpeed(a0),a0
		sub.b	d1,(a0)
		bgt.b	.printnum
		move.b	#1,(a0)
.printnum	bsr	PrintArpSpeed
		bra	ArrowRepeat
.reply		rts

GrooveMinus	tst	_InstNum(a5)
		beq.b	.reply
		move.l	#.minus,_ArrowJump(a5)
		move.l	#.reply,_ArrowReturn(a5)
		move.l	_UserPort2(a5),_ArrowPort(a5)
		move.l	#grooveminus+gg_Flags,_ArrowGadget(a5)
		cmp	#$0301,_HexNumEd2(a5)
		beq.b	.reply
		cmp.l	#IDCMP_GADGETDOWN,d0
		bne.b	.reply
		move	#1,_ArrowSpeed(a5)
		move	#4,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
.minus		move	_ArrowSpeed(a5),d1
		tst	_RMButton(a5)
		beq.b	.ok
		lsl	#4,d1
.ok		bsr	GetInst
		lea	inst_ArpGroove(a0),a0
		sub.b	d1,(a0)
		bge.b	.printnum
		clr.b	(a0)
.printnum	bsr	PrintArpGroove
		bra.b	ArrowRepeat
.reply		rts

PartPrint	bsr	PrintPartNum
		lea	PartEditorDefs,a4
		bsr	GetPartPtr
		bsr	PrintPart
		bra.b	ArrowRepeat

ArpPrint	bsr	PrintArpgTab
		lea	ArpgEditorDefs,a4
		bsr	GetArpgPtr
		bsr	PrintArpg

ArrowRepeat	move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
.waitport	move.l	_ArrowPort(a5),a4
		move.l	a4,a0
		CallSys WaitPort
		move.l	a4,a0
		CallGadTools GT_GetIMsg
		move.l	d0,_Message(a5)
		beq	.waitport
		move.l	d0,a4
		move.l	im_Class(a4),d0
		move	im_Code(a4),d1
		cmp.l	#IDCMP_MOUSEBUTTONS,d0
		bne.b	.next
		cmp	#SELECTUP,d1
		beq.b	.exit
.next		cmp.l	#IDCMP_GADGETUP,d0
		beq.b	.exit
		cmp.l	#IDCMP_INTUITICKS,d0
		bne	ArrowRepeat
		addq	#1,_ArrowTicks(a5)
		move	_ArrowTicks(a5),d0
		cmp	_ArrowDelay(a5),d0
		bne	ArrowRepeat
		move	#1,_ArrowDelay(a5)
		clr	_ArrowTicks(a5)
		move.l	_ArrowGadget(a5),a0
		move	(a0),d0
		and	#GFLG_SELECTED,d0
		beq	ArrowRepeat
		move.l	_ArrowJump(a5),a0
		jmp	(a0)
.exit		move.l	_ArrowReturn(a5),a0
		jmp	(a0)

PartNumEd	bsr	SetFont8
		move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
		bsr	GetPartPtr
		bsr	FreePart
		move.l	#UpdatePart,_HexRoutine1(a5)
		move.l	im_IAddress(a4),_HexGadget1(a5)
		lea	_Buffer(a5),a1
		move	_PartNum(a5),d0
		lsl	#4,d0
		move	d0,(a1)
		move.l	a1,_HexNumPtr1(a5)
		move	#3,_HexNumChars1(a5)
		move.l	_Window1(a5),a2
		move	#$0101,_HexNumEd1(a5)
		bsr	LoadHexNum1
		bsr	HexCalcCursor
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		move.l	_RastPort1(a5),d6
		bsr	SetFont8
		bsr	HexPosCursor
		bsr	DrawHexCursor
		bsr	SaveHexNum1
		rts

TempoNumEd	bsr	SetFont8
		move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
		bsr	GetTune
		move.l	#TempoNumFix,_HexRoutine1(a5)
		move.l	im_IAddress(a4),_HexGadget1(a5)
		lea	_Buffer(a5),a1
		move.b	tune_Tempo+1(a0),(a1)
		move.l	a1,_HexNumPtr1(a5)
		move	#2,_HexNumChars1(a5)
		move.l	_Window1(a5),a2
		move	#$0301,_HexNumEd1(a5)
		bsr	LoadHexNum1
		bsr	HexCalcCursor
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		move.l	_RastPort1(a5),d6
		bsr	SetFont8
		bsr	HexPosCursor
		bsr	DrawHexCursor
		bsr	SaveHexNum1
		rts

TempoNumFix	bsr	GetTune
		moveq	#0,d0
		move.b	_Buffer(a5),d0
		cmp	#$ff,d0
		ble.b	.ok
		move	#$ff,d0
.ok		cmp	#$20,d0
		bge.b	.print
		move	#$20,d0
.print		move	d0,tune_Tempo(a0)
		bsr	PrintTempoNum
		jsr	CalcBPM
		rts

SpdNumEd	bsr	SetFont8
		move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
		bsr	GetTune
		move.l	#SpdNumFix,_HexRoutine1(a5)
		move.l	im_IAddress(a4),_HexGadget1(a5)
		lea	_Buffer(a5),a1
		move.b	tune_Speed(a0),(a1)
		move.l	a1,_HexNumPtr1(a5)
		move	#2,_HexNumChars1(a5)
		move.l	_Window1(a5),a2
		move	#$0401,_HexNumEd1(a5)
		bsr	LoadHexNum1
		bsr	HexCalcCursor
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		move.l	_RastPort1(a5),d6
		bsr	SetFont8
		bsr	HexPosCursor
		bsr	DrawHexCursor
		bsr	SaveHexNum1
		rts

SpdNumFix	bsr	GetTune
		move.b	_Buffer(a5),d0
		cmp.b	#$1f,d0
		ble.b	.ok
		move	#$1f,d0
.ok		tst.b	d0
		bne.b	.print
		moveq	#1,d0
.print		move.b	d0,tune_Speed(a0)
		bsr	PrintSpdNum
		jsr	CalcBPM
		rts

GrvNumEd	bsr	SetFont8
		move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
		bsr	GetTune
		move.l	#GrvNumFix,_HexRoutine1(a5)
		move.l	im_IAddress(a4),_HexGadget1(a5)
		lea	_Buffer(a5),a1
		move.b	tune_Groove(a0),(a1)
		move.l	a1,_HexNumPtr1(a5)
		move	#2,_HexNumChars1(a5)
		move.l	_Window1(a5),a2
		move	#$0501,_HexNumEd1(a5)
		bsr	LoadHexNum1
		bsr	HexCalcCursor
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		move.l	_RastPort1(a5),d6
		bsr	SetFont8
		bsr	HexPosCursor
		bsr	DrawHexCursor
		bsr	SaveHexNum1
		rts

GrvNumFix	bsr	GetTune
		move.b	_Buffer(a5),d0
		cmp.b	#$1f,d0
		ble.b	.print
		move	#$1f,d0
.print		move.b	d0,tune_Groove(a0)
		bsr	PrintGrvNum
		jsr	CalcBPM
		rts

ArpgNumEd	bsr	SetFont8
		tst	_InstNum(a5)
		beq.b	.reply
		move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
		bsr	GetArpgPtr
		bsr	FreeArpg		Lägger in ID2 i d4.l
		move.l	#UpdateArp,_HexRoutine2(a5)
		move.l	im_IAddress(a4),_HexGadget2(a5)
		bsr	GetInst
		lea	_Buffer(a5),a1
		move.b	inst_ArpTable+1(a0),(a1)
		move.l	a1,_HexNumPtr2(a5)
		move	#2,_HexNumChars2(a5)
		move.l	_Window2(a5),a2
		move	#$0101,_HexNumEd2(a5)
		bsr	LoadHexNum2
		bsr	HexCalcCursor
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		bsr	SetFont8
		bsr	HexPosCursor
		bsr	DrawHexCursor
		bsr	SaveHexNum2
.reply		rts

SpeedNumEd	bsr	SetFont8
		tst	_InstNum(a5)
		beq.b	.reply
		move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
		move.l	#SpeedFix,_HexRoutine2(a5)
		move.l	im_IAddress(a4),_HexGadget2(a5)
		bsr	GetInst
		lea	_Buffer(a5),a1
		move.b	inst_ArpSpeed(a0),(a1)
		move.l	a1,_HexNumPtr2(a5)
		move	#2,_HexNumChars2(a5)
		move.l	_Window2(a5),a2
		move	#$0201,_HexNumEd2(a5)
		bsr	LoadHexNum2
		bsr	HexCalcCursor
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		bsr	HexPosCursor
		bsr	DrawHexCursor
		bsr	SaveHexNum2
.reply		rts

SpeedFix	bsr	GetInst
		move.b	_Buffer(a5),d0
		cmp.b	#$1f,d0
		bls.b	.ok
		move.b	#$1f,d0
.ok		tst.b	d0
		bne.b	.print
		moveq	#1,d0
.print		move.b	d0,inst_ArpSpeed(a0)
		bra	PrintArpSpeed

GrooveNumEd	bsr	SetFont8
		tst	_InstNum(a5)
		beq.b	.reply
		move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
		move.l	#GrooveFix,_HexRoutine2(a5)
		move.l	im_IAddress(a4),_HexGadget2(a5)
		bsr	GetInst
		lea	_Buffer(a5),a1
		move.b	inst_ArpGroove(a0),(a1)
		move.l	a1,_HexNumPtr2(a5)
		move	#2,_HexNumChars2(a5)
		move.l	_Window2(a5),a2
		move	#$0301,_HexNumEd2(a5)
		bsr	LoadHexNum2
		bsr	HexCalcCursor
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		bsr	SetFont8
		bsr	HexPosCursor
		bsr	DrawHexCursor
		bsr	SaveHexNum2
.reply		rts

GrooveFix	bsr	GetInst
		move.b	_Buffer(a5),d0
		cmp.b	#$1f,d0
		bls.b	.ok
		move	#$1f,d0
.ok		move.b	d0,inst_ArpGroove(a0)
		bra	PrintArpGroove

WsStartFix	moveq	#0,d0
		move	inst_SmplStart(a4),d0
		moveq	#0,d1
		move	inst_SmplEnd(a4),d1
		cmp.l	d0,d1
		bhi.b	.ok
		subq.l	#1,d1
		move	d1,inst_SmplStart(a4)

		lsr	#1,d1
		move	d1,GTSC_Ws+2
		move.l	_WsStartGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList35a,a3
		CallGadTools GT_SetGadgetAttrsA

.ok		moveq	#0,d3
		moveq	#0,d2
		move	inst_SmplStart(a4),d2
		add.l	d2,d2
		move.l	_WsStartGad(a5),a2
		bsr	PrintHex5Digit

		bsr	GetSmpl
		move.l	smpl_Pointer(a0),d0
		moveq	#0,d1
		move	inst_SmplStart(a4),d1
		moveq	#0,d2
		move	inst_SmplEnd(a4),d2
		sub.l	d1,d2
		add.l	d1,d0
		add.l	d1,d0
		move.l	d0,inst_SmplPointer(a4)
		move	d2,inst_SmplLength(a4)
		rts

WsLoopFix	moveq	#0,d0
		move	inst_SmplRepStart(a4),d0
		moveq	#0,d1
		move	inst_SmplEnd(a4),d1
		cmp.l	d0,d1
		bhi.b	.ok
		subq.l	#1,d1
		move	d1,inst_SmplRepStart(a4)

		lsr	#1,d1
		move	d1,GTSC_Ws+2
		move.l	_WsLoopGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList35a,a3
		CallGadTools GT_SetGadgetAttrsA

.ok		moveq	#0,d3
		moveq	#0,d2
		move	inst_SmplRepStart(a4),d2
		add.l	d2,d2
		move.l	_WsLoopGad(a5),a2
		bsr	PrintHex5Digit

		moveq	#0,d2
		move	inst_SmplEnd(a4),d2
		moveq	#0,d1
		move	inst_SmplRepStart(a4),d1
		sub.l	d1,d2
		move	d2,inst_SmplRepLen(a4)
		add.l	d2,d2
		moveq	#11,d3
		move.l	_WsEndGad(a5),a2
		bsr	PrintHex5Digit

		bsr	GetSmpl
		move.l	smpl_Pointer(a0),d0
		moveq	#0,d1
		move	inst_SmplRepStart(a4),d1
		moveq	#0,d2
		move	inst_SmplEnd(a4),d2
		sub.l	d1,d2
		add.l	d1,d0
		add.l	d1,d0
		move.l	d0,inst_SmplRepPointer(a4)
		move	d2,inst_SmplRepLength(a4)
		rts

WsEndFix	moveq	#0,d0
		move	inst_SmplStart(a4),d0
		moveq	#0,d1
		move	inst_SmplRepStart(a4),d1
		cmp.l	d1,d0
		bhi.b	.ok
		exg	d0,d1
.ok		moveq	#0,d1
		move	inst_SmplEnd(a4),d1
		cmp.l	d0,d1
		bhi.b	.ok1
		addq.l	#1,d0
		move	d0,inst_SmplEnd(a4)

		lsr	#1,d0
		move	d0,GTSC_Ws+2
		move.l	_WsEndGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList35a,a3
		CallGadTools GT_SetGadgetAttrsA

.ok1		moveq	#0,d3
		moveq	#0,d2
		move	inst_SmplEnd(a4),d2
		add.l	d2,d2
		move.l	_WsEndGad(a5),a2
		bsr	PrintHex5Digit

		moveq	#0,d2
		move	inst_SmplEnd(a4),d2
		moveq	#0,d1
		move	inst_SmplRepStart(a4),d1
		sub.l	d1,d2
		move	d2,inst_SmplRepLen(a4)
		add.l	d2,d2
		moveq	#11,d3
		move.l	_WsEndGad(a5),a2
		bsr	PrintHex5Digit

		bsr	GetSmpl
		moveq	#0,d1
		move	inst_SmplRepStart(a4),d1
		moveq	#0,d2
		move	inst_SmplEnd(a4),d2
		move.l	d2,d0
		sub.l	d1,d2
		moveq	#0,d1
		move	inst_SmplStart(a4),d1
		sub.l	d1,d0
		move	d0,inst_SmplLength(a4)
		move	d2,inst_SmplRepLength(a4)
		rts

* Twins/PHA *****************************************************************
* Listwiew gadgets routines                           Last Change: 92-10-24 *
*****************************************************************************

_StringEditHook	rs.b	h_SIZEOF

StrEdHook	cmp.l	#SGH_KEY,(a1)
		beq.b	.keypressed
.noaction	rts

.keypressed	cmp	#EO_ENTER,sgw_EditOp(a2)
		beq.b	.clrbufpos
		rts

.clrbufpos	clr	sgw_BufferPos(a2)
		rts

ClrTuneScrGad	clr	_TunesScrPos(a5)
		clr	GTSC_ScrPos+2
		move.l	_TunesScrGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList38,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

ClrInstScrGads	clr	_InstsScrPos(a5)
		clr	GTSC_ScrPos+2
		move.l	_Inst1ScrGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList38,a3
		CallGadTools GT_SetGadgetAttrsA
		move.l	_Inst2ScrGad(a5),a0
		move.l	_Window2(a5),a1
		CallLib GT_SetGadgetAttrsA
		rts

ClrSmplScrGad	clr	_SmplsScrPos(a5)
		clr	GTSC_ScrPos+2
		move.l	_SmplsScrGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList38,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

XTunePartArpg	move.l	_RastPort1(a5),d6
		bsr     ExitTunePart
		move.l	_RastPort2(a5),d6
		bsr	ExitArpg
		rts

_TunesScrPos	rs.w	1

TunesScrGad	move	im_Code(a4),_TunesScrPos(a5)
		bsr.b	SetTuneScrPos
		rts

ClrTuneScrPos	clr	_TunesScrPos(a5)

SetTuneScrPos	move	_TunesScrPos(a5),d7
		bsr	RemTuneList
		lea	_TuneListView(a5),a0
.loop		move.l	(a0),d0
		beq.b	.exit
		move.l	d0,a0
		tst.l	(a0)
		beq.b	.exit
		lea	tune_NameStr(a0),a1
		add	d7,a1
		move.l	a1,tune_Name(a0)
		bra.b	.loop
.exit		lea	TuneShowSel,a4
		move.l	(a4),-(sp)
		move.l	#TAG_IGNORE,(a4)
		bsr	AddTuneList
		move.l	(sp)+,TuneShowSel
		rts

TunesStrGad	cmp.l	#IDCMP_GADGETDOWN,d0
		beq.b	.xtunepartarpg
		bsr.b	GetTuneName
		bsr	ClrTuneScrPos
		bsr	ClrTuneScrGad
		rts
.xtunepartarpg	bsr	XTunePartArpg
		bsr	DoHexReturn
		move	#1,_StringEd(a5)
		rts

GetTuneName	move.l	gg_SpecialInfo(a0),a0
		move.l	si_Buffer(a0),a1
		moveq	#30,d2
		move	si_NumChars(a0),d1
		beq.b	.clear
		subq	#1,d1
		sub	d1,d2
		bsr	GetTune
		lea	tune_Title(a0),a0
.loop		move.b	(a1)+,(a0)+
		dbf	d1,.loop
.clear		clr.b	(a0)+
		dbf	d2,.clear
		clr	_StringEd(a5)
		jmp	DispSelTune

_InstsScrPos	rs.w	1

Inst1ScrGad	move	im_Code(a4),_InstsScrPos(a5)
		bsr.b	SetInstScrPos
		move	d7,GTSC_ScrPos+2
		move.l	_Inst2ScrGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList38,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

Inst2ScrGad	move	im_Code(a4),_InstsScrPos(a5)
		bsr.b	SetInstScrPos
		move	d7,GTSC_ScrPos+2
		move.l	_Inst1ScrGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList38,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

ClrInstScrPos	clr	_InstsScrPos(a5)

SetInstScrPos	move	_InstsScrPos(a5),d7
		bsr	RemInstList
		lea	_InstListView(a5),a0
.loop		move.l	(a0),d0
		beq.b	.exit
		move.l	d0,a0
		tst.l	(a0)
		beq.b	.exit
		lea	inst_NameStr(a0),a1
		add	d7,a1
		move.l	a1,inst_Name(a0)
		bra.b	.loop
.exit		lea	InstShowSel,a4
		move.l	(a4),-(sp)
		move.l	#TAG_IGNORE,(a4)
		bsr	AddInstList
		move.l	(sp)+,InstShowSel
		rts

Inst1StrGad	cmp.l	#IDCMP_GADGETDOWN,d0
		beq.b	.xtunepartarpg
		bsr.b	GetInstName
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		rts
.xtunepartarpg	bsr	XTunePartArpg
		bsr	DoHexReturn
		move	#2,_StringEd(a5)
		rts

Inst2StrGad	cmp.l	#IDCMP_GADGETDOWN,d0
		beq.b	.xtunepartarpg
		bsr.b	GetInstName
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		rts
.xtunepartarpg	bsr	XTunePartArpg
		bsr	DoHexReturn
		move	#3,_StringEd(a5)
		rts

GetInstName	move.l	gg_SpecialInfo(a0),a0
		move.l	si_Buffer(a0),a1
		moveq	#30,d2
		move	si_NumChars(a0),d1
		beq.b	.clear
		subq	#1,d1
		sub	d1,d2
		bsr	GetInst
		lea	inst_Title(a0),a0
.loop		move.b	(a1)+,(a0)+
		dbf	d1,.loop
.clear		clr.b	(a0)+
		dbf	d2,.clear
		clr	_StringEd(a5)
		jsr	DispSelInst1
		jmp	DispSelInst2

_SmplsScrPos	rs.w	1

SmplsScrGad	move	im_Code(a4),_SmplsScrPos(a5)
		bra.b	SetSmplScrPos

ClrSmplScrPos	clr	_SmplsScrPos(a5)

SetSmplScrPos	move	_SmplsScrPos(a5),d7
		bsr	RemSmplList
		lea	_SmplListView(a5),a0
.loop		move.l	(a0),d0
		beq.b	.exit
		move.l	d0,a0
		tst.l	(a0)
		beq.b	.exit
		lea	smpl_NameStr(a0),a1
		add	d7,a1
		move.l	a1,smpl_Name(a0)
		bra.b	.loop
.exit		lea	SmplShowSel,a4
		move.l	(a4),-(sp)
		move.l	#TAG_IGNORE,(a4)
		bsr	AddSmplList
		move.l	(sp)+,SmplShowSel
		rts

SmplsStrGad	cmp.l	#IDCMP_GADGETDOWN,d0
		beq.b	.xtunepartarpg
		bsr.b	GetSmplName
		bsr	ClrSmplScrPos
		bsr	ClrSmplScrGad
		rts
.xtunepartarpg	bsr	XTunePartArpg
		bsr	DoHexReturn
		move	#4,_StringEd(a5)
		rts

GetSmplName	move.l	gg_SpecialInfo(a0),a0
		move.l	si_Buffer(a0),a1
		moveq	#30,d2
		move	si_NumChars(a0),d1
		beq.b	.clear
		subq	#1,d1
		sub	d1,d2
		bsr	GetSmpl
		lea	smpl_Title(a0),a0
.loop		move.b	(a1)+,(a0)+
		dbf	d1,.loop
.clear		clr.b	(a0)+
		dbf	d2,.clear
		clr	_StringEd(a5)
		jmp	DispSelSmpl

RemTuneList	move.l	_TunesGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	ListTags,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

AddTuneList	move	_TuneNum(a5),GTLV_TuneNum+2
		move	_TuneNum(a5),GTLV_TuneSel+2
		move.l	_TunesGad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList5a,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

RemInstList	move.l	_Inst1Gad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	ListTags,a3
		CallGadTools GT_SetGadgetAttrsA
		move.l	_Inst2Gad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	ListTags,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

AddInstList	move	_InstNum(a5),GTLV_InstNum+2
		move	_InstNum(a5),GTLV_InstSel+2
		move.l	_Inst1Gad(a5),a0
		move.l	_Window1(a5),a1
		sub.l	a2,a2
		lea	TagList13a,a3
		CallGadTools GT_SetGadgetAttrsA
		move.l	_Inst2Gad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList13a,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

RemSmplList	move.l	_SmplsGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	ListTags,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

AddSmplList	move	_WsNum(a5),GTLV_SmplNum+2
		move	_WsNum(a5),GTLV_SmplSel+2
		bsr	GetInst
		tst.b	inst_SmplNumber(a0)
		beq.b	.zerows
.return		move.l	_SmplsGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList14,a3
		CallGadTools GT_SetGadgetAttrsA
		rts
.zerows		move	#~0,GTLV_SmplNum+2
		clr	GTLV_SmplSel+2
		bra.b	.return

SetTraSelList	move.l	_TraSelListGad(a5),a0
		move.l	_Window3(a5),a1
		sub.l	a2,a2
		lea	TagList26,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

ListTags	dc.l	GTLV_Labels
		dc.l	~0
		dc.l	TAG_DONE

TuneSelected	move	#$0001,_BlockPlay(a5)
		clr	$dff0a8
		clr	$dff0b8
		clr	$dff0c8
		clr	$dff0d8
		cmp	#$0102,_HexNumEd1(a5)
		beq.b	.doreturn
		cmp	#$0201,_HexNumEd1(a5)
		ble.b	.next
.doreturn	move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
.next		move	im_Code(a4),_TuneNum(a5)
TuneSelec	bsr	FreeVoices
		move.b	#1,_StepArrowClear(a5)
		jsr	StepArrow
		move.b	#1,_PartArrowClear(a5)
		jsr	PartArrow
		move.b	#1,_PlayMode(a5)		8 channels
		jsr	StepShow
		bsr	GetTune
		move.b	tune_PlayMode(a0),_PlayMode(a5)
		move.l	a0,TunePtr
		jsr	AllocVoices
		jsr	DispSelTune
		lea	TuneEditorDefs,a4
		tst.b	_PlayTune(a5)
		beq.b	.doit
		bsr	CursorSave
		clr	MinYPos(a4)
		clr.l	CursorXPos(a4)
.doit		cmp.b	#1,_TunePart(a5)
		bne.b	.print
		btst	#7,_MarkEd(a5)
		beq.b	.print
		lea	TuneMarkEdDefs,a4
		bsr	MarkClear
		lea	TuneEditorDefs,a4
		bclr	#7,_MarkEd(a5)
.print		bsr	PrintTune
		cmp.b	#1,_TunePart(a5)
		bne.b	.exit
		tst	_HexNumEd1(a5)
		bne.b	.exit
		bsr	CursorDraw
.exit		bsr.b	SetMasterVolSpd
		move.b	_PlayMode(a5),CycleNum+3
		move.l	_PlayModeGad(a5),a0
		move.l	_Window1(a5),a1
		bsr	SetCycleGad
		bsr	UpdateChannels
		tst.b	_PlayTune(a5)
		beq.b	.outofhere
		bsr	PlayTuneGad
.outofhere	jsr	ClearArrowTunePos
		jsr	StepArrow
		jsr	PartArrow
		clr	_BlockPlay(a5)
		rts

SetMasterVolSpd	move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	NormalDrawMode0
		bsr	PrintTempoNum
		bsr	PrintSpdNum
		bsr	PrintGrvNum
		jsr	CalcBPM
		bsr	GetTune
		move.l	a0,a4
		move	tune_Volume(a4),d0
		move	d0,VolLevel+2
		lsl	#4,d0
		move	d0,_MasterVol(a5)
		move.l	_MasterVolGad(a5),a0
		move.l	_Window1(a5),a1
		lea	TagList7,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

WsSelected	cmp	#$0102,_HexNumEd2(a5)
		bne.b	.next
		move.l	a4,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,a4
.next		move	#$0101,_BlockPlay(a5)
		move	im_Code(a4),d0
		move	d0,_WsNum(a5)
WsSelect	move	d0,d7
		addq	#1,d7
		bsr	GetSmpl
		move.l	a0,a1
		bsr	GetInst
		move.b	d7,inst_SmplNumber(a0)
		move	smpl_Length(a1),d1
		clr	inst_SmplStart(a0)
		move	d1,inst_SmplEnd(a0)
		move	d1,inst_SmplLength(a0)
		move.l	smpl_Pointer(a1),d0
		move.l	d0,inst_SmplPointer(a0)
		bset	#WSLOOP,inst_Effects1(a0)
		move	smpl_RepLength(a1),d0
		bne.b	.notzero
		move	d1,d0
		bclr	#WSLOOP,inst_Effects1(a0)
.notzero	move	d0,inst_SmplRepLength(a0)
		move	d0,inst_SmplRepLen(a0)
		move.l	smpl_RepPointer(a1),inst_SmplRepPointer(a0)
		clr	inst_SmplRepStart(a0)
		cmp	#1,d0
		beq.b	.oneshot
		move.l	smpl_RepPointer(a1),d0
		sub.l	smpl_Pointer(a1),d0
		lsr.l	#1,d0
		move	d0,inst_SmplRepStart(a0)
		moveq	#0,d1
		move	inst_SmplRepLength(a0),d1
		add.l	d1,d0
		move	d0,inst_SmplLength(a0)
		move	d0,inst_SmplEnd(a0)
.oneshot	tst.b	inst_SmplType(a0)
		bne.b	.test
		bra.b	.ok
.test		tst.b	smpl_Type(a1)
		bne.b	WsPrintSel
.ok		move.b	smpl_Type(a1),inst_SmplType(a0)

WsPrintSel	move	smpl_FineTune(a1),d0
		move	smpl_SemiTone(a1),d1
		move	d0,FineLevel+2
		move	d1,SemiLevel+2
		move.b	inst_SmplType(a0),GTCY_Len+3
		tst	_InstNum(a5)
		beq.b	.next
		move	d0,inst_FineTune(a0)
		move	d1,inst_SemiTone(a0)
.next		clr	inst_LooStart(a0)
		clr	inst_LooRepeat(a0)
		clr	inst_LooRepEnd(a0)
		move	smpl_Length(a1),d0
		cmp	inst_LooLength(a0),d0
		bhs.b	.ok
		clr	inst_LooLength(a0)
.ok		clr	_BlockPlay(a5)
		tst	_WsVsButtons(a5)
		bne.b	.skip
		bsr	SetWsParameters
.skip		cmp	#9,_WsButtons(a5)
		bne.b	.skippa
		bsr	SetLoop
.skippa		clr.l	StrGadOff
		jsr	DispSelSmpl
		move.l	_FineTuneGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList8,a3
		CallGadTools GT_SetGadgetAttrsA
		move.l	_SemiToneGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList24,a3
		CallLib GT_SetGadgetAttrsA
		move	FineLevel+2,d4
		and	#$ff,d4
		move.l	_FineTuneGad(a5),a4
		bsr	PrintHex2Digit
		move	SemiLevel+2,d4
		and	#$ff,d4
		move.l	_SemiToneGad(a5),a4
		bsr	PrintHex2Digit
		move	SlideLevel+2,d4
		and	#$ff,d4

		subq.b	#1,GTCY_Len+3
		bmi.b	.off
		clr	GTCY_LenOff+2
		move.l	_WaveLengthGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList22,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

.off		clr.b	GTCY_Len+3
		move	#TRUE,GTCY_LenOff+2
		move.l	_WaveLengthGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList22,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

InstSelected	move	im_Code(a4),d0
		move	d0,_InstNum(a5)
InstSelec	jsr	DispSelInst1
		jsr	DispSelInst2
		move	#$0200,_BlockPlay(a5)
		move.l	_InstPtrs(a5),a0
		clr.b	inst_SmplType(a0)
		clr.b	inst_SmplNumber(a0)
		bsr	GetInst
		move.l	a0,-(sp)
		move	inst_Volume(a0),VolLevel+2
		move	inst_FineTune(a0),FineLevel+2
		move	inst_SemiTone(a0),SemiLevel+2
		move.b	inst_SlideSpeed(a0),SlideLevel+3
		move.b	inst_Transpose(a0),_TrnOnOff(a5)
		move.b	inst_SmplType(a0),GTCY_Len+3
		move.b	inst_SmplNumber(a0),d0
		beq.b	.skip
		subq.b	#1,d0
.skip		move.b	d0,_WsNum+1(a5)

		move	_WsButtons(a5),d0
		lea	WsParSetJump,a0
		add	d0,d0
		add	d0,d0
		move.l	(a0,d0.w),a0
		jsr	(a0)
		move.l	(sp)+,a4
		bsr	UpdateSampBoxes

		bsr	GetSmpl
		lea	smpl_Title(a0),a1
		move.l	a1,StringPtr
		clr.l	StrGadOff
		move	_WsNum(a5),GTLV_SmplSel+2
		move	_WsNum(a5),GTLV_SmplNum+2
		tst.b	inst_SmplNumber(a4)
		beq	ZeroWs
ClearWs		move.l	_SmplsGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList14,a3
		CallGadTools GT_SetGadgetAttrsA
		move.l	_SmplsStrGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList37,a3
		CallLib GT_SetGadgetAttrsA
		move.l	_VolumeGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList7,a3
		CallLib GT_SetGadgetAttrsA
		move.l	_FineTuneGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList8,a3
		CallLib GT_SetGadgetAttrsA
		move.l	_SemiToneGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList24,a3
		CallLib GT_SetGadgetAttrsA
		move.l	_SlideSpeedGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList39,a3
		CallLib GT_SetGadgetAttrsA
		move.l	_TransposeGad(a5),a0
		move.l	_Window2(a5),a1
		move.b	_TrnOnOff(a5),GTCB_Check+3
		lea	TagList1,a3
		CallLib GT_SetGadgetAttrsA
		move	FineLevel+2,d4
		and	#$ff,d4
		move.l	_FineTuneGad(a5),a4
		bsr	PrintHex2Digit
		move	SemiLevel+2,d4
		and	#$ff,d4
		move.l	_SemiToneGad(a5),a4
		bsr	PrintHex2Digit
		move	SlideLevel+2,d4
		and	#$ff,d4
		move.l	_SlideSpeedGad(a5),a4
		bsr	PrintHex2Digit
		subq.b	#1,GTCY_Len+3
		bmi.b	.off
		clr	GTCY_LenOff+2
		move.l	_WaveLengthGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList22,a3
		CallGadTools GT_SetGadgetAttrsA
		tst	_WsVsButtons(a5)
		bne.b	.skip
		bsr	SetWsParameters
.skip		clr	_BlockPlay(a5)
		rts

.off		clr.b	GTCY_Len+3
		move	#TRUE,GTCY_LenOff+2
		move.l	_WaveLengthGad(a5),a0
		move.l	_Window2(a5),a1
		lea	TagList22,a3
		CallGadTools GT_SetGadgetAttrsA
		tst	_WsVsButtons(a5)
		bne.b	.skipp
		bsr	SetWsParameters
.skipp		clr	_BlockPlay(a5)
		rts

ZeroWs		clr.l	StringPtr
		move.l	#TRUE,StrGadOff
		move	#~0,GTLV_SmplNum+2
		clr	GTLV_SmplSel+2
		clr	_WsNum(a5)
		bra	ClearWs

UpdateSampBoxes	move.l	_WsEnvChkGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList1,a3
		btst	#ADSR,inst_Effects1(a4)
		sne	GTCB_Check+3
		CallGadTools GT_SetGadgetAttrsA
		move.l	_WsVibChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#VIBRATO,inst_Effects1(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		move.l	_WsTreChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#TREMOLO,inst_Effects1(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		move.l	_WsArpChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#ARPEGGIO,inst_Effects1(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		move.l	_WsTraChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#TRANSFORM,inst_Effects2(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		move.l	_WsPhaChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#PHASE,inst_Effects2(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		move.l	_WsMixChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#MIX,inst_Effects2(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		move.l	_WsResChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#RESONANCE,inst_Effects2(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		move.l	_WsFilChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#FILTER,inst_Effects2(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		move.l	_WsLooChkGad(a5),a0
		move.l	_Window2(a5),a1
		btst	#LOOP,inst_Effects1(a4)
		sne	GTCB_Check+3
		CallLib GT_SetGadgetAttrsA
		rts

AddTune		tst.b	_PlayTune(a5)
		bne	.reply
		btst	#7,_MarkEd(a5)
		bne	.reply			;Message exit mark mode
		cmp	#255,_TuneMaxNum(a5)
		beq	.reply
		tst	_PlayTune(a5)
		bne.b	.reply
		bsr	DoHexReturn
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		move.l	_RastPort1(a5),d6
		bsr	ClrTuneScrPos
		bsr	ClrTuneScrGad
		addq	#1,_TuneMaxNum(a5)
		jsr	AllocTune
		tst.l	d7
		beq.b	.reply
		move.l	a1,a4
		bsr	RemTuneList
		move	_TuneMaxNum(a5),d0
		move	d0,_TuneNum(a5)
		add	d0,d0
		lea	_AscIIHexTab(a5),a0
		lea	tune_NameStr(a4),a1
		move.b	(a0,d0.w),(a1)
		move.b	1(a0,d0.w),1(a1)
		add	_TunesScrPos(a5),a1
		move.l	a1,tune_Name(a4)
		bsr	FreeVoices
		move.l	d7,TunePtr
		bsr	AllocVoices
		lea	TuneEditorDefs,a4
		bsr	PrintTune
		bsr	AddTuneList
		jsr	DispSelTune
		bsr	UpdateChannels
		bsr	SetMasterVolSpd
.reply		rts

ClrParts	btst	#7,_MarkEd(a5)
		bne.b	.reply			;Message exit mark mode
		jsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#ClrAllParts_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq.b	.exit
		jsr	FreeAllParts
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	GetPartPtr
		bsr	XTunePartArpg
		move.l	_RastPort1(a5),d6
		lea	PartEditorDefs,a4
		bsr	PrintPart
.exit		jsr	InputOn
.reply		rts

ClrTune		tst.b	_PlayTune(a5)
		bne.b	.reply
		btst	#7,_MarkEd(a5)
		bne.b	.reply			;Message exit mark mode
		jsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#ClrTune_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq.b	.exit
		bsr	DoHexReturn
		bsr	ClrTuneScrPos
		bsr	ClrTuneScrGad
		bsr	RemTuneList
		jsr	WipeTune
		bsr	UpdateChannels
		jsr	InputOn
		bra	UpDateList
.exit		jsr	InputOn
.reply		rts

RemoveTunes	btst	#7,_MarkEd(a5)
		bne.b	TReply			;Message exit mark mode
		jsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemAllTunes_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq.b	Texit
		bsr	DoHexReturn
		bsr	ClrTuneScrPos
		bsr	ClrTuneScrGad
		bsr	RemTuneList
		jsr	FreeAllTunes
		jsr	AllocTune
		bsr	AllocVoices
		bsr	UpdateChannels
		jsr	InputOn
		bra	UpDateList
Texit		jsr	InputOn
TReply		rts

RemoveTune	tst.b	_PlayTune(a5)
		bne.b	TReply
		btst	#7,_MarkEd(a5)
		bne.b	TReply			;Message exit mark mode
		jsr	InputOff
		move.l	_Window1(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemTune_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	Texit
		bsr	DoHexReturn
		bsr	ClrTuneScrPos
		bsr	ClrTuneScrGad
		bsr	RemTuneList
		move	_TuneNum(a5),d0
		lea	_TuneListView(a5),a1
		move.l	MLH_TAILPRED(a1),a2
.loop		move.l	(a1),a1
		dbf	d0,.loop
		tst	_TuneMaxNum(a5)
		beq	ClearTune
		move.l	a1,d7
.copy		cmp.l	a1,a2
		beq.b	.done
		move.l	tune_Pred(a2),a0
		move.b	tune_NameStr(a0),tune_NameStr(a2)
		move.b	tune_NameStr+1(a0),tune_NameStr+1(a2)
		move.l	a0,a2
		bra	.copy
.done		move.l	d7,a1
		REMOVE
		move.l	_SysBase(a5),a6
		move.l	d7,a1
		moveq	#7,d2
		lea	tune_Ch1Ptr(a1),a2
.free		move.l	(a2)+,a1
		move.l	#chnl_SIZE,d0
		CallLib FreeMem
		dbf	d2,.free
		move.l	d7,a1
		move.l	#tune_SIZEOF,d0
		CallLib FreeMem
		lea	_TunePtrs(a5),a0
		lea	_ZeroBuffer(a5),a1
		move	_TuneNum(a5),d0
		move	d0,d1
		add	d1,d1
		add	d1,d1
		add	d1,a0
		move	_TuneMaxNum(a5),d1
		bra.b	.check
.move		move.l	4(a0),(a0)+
		addq	#1,d0
.check		cmp	d0,d1
		bne	.move
		move.l	a1,(a0)
		tst	_TuneNum(a5)
		beq.b	.nosub
		subq	#1,_TuneNum(a5)
.nosub		subq	#1,_TuneMaxNum(a5)
		jsr	InputOn

UpDateList	bsr	AddTuneList
		bsr	GetTune
		move.l	a0,TunePtr
		move.b	tune_PlayMode(a0),_PlayMode(a5)
		bsr	AllocVoices
		jsr	DispSelTune
		move.l	_GfxBase(a5),a6
		bsr	XTunePartArpg
		move.l	_RastPort1(a5),d6
		lea	TuneEditorDefs,a4
		bsr	PrintTune
		bsr	SetMasterVolSpd
		move.b	_PlayMode(a5),CycleNum+3
		move.l	_PlayModeGad(a5),a0
		move.l	_Window1(a5),a1
		bsr	SetCycleGad
		bsr	UpdateChannels
		jsr	ClearArrowTunePos
		jsr	StepArrow
		jsr	PartArrow
		rts

ClearTune	jsr	WipeTune
		bsr	GetTune
		lea	TuneList_Txt,a1
		lea	tune_NameStr(a0),a2
		moveq	#33-1,d0
.copy		move.b	(a1)+,(a2)+
		dbeq	d0,.copy
		tst	d0
		bmi.b	.ok
.clear		clr.b	(a2)+
		dbf	d0,.clear
.ok		clr.b	(a2)
		bsr	UpdateChannels
		jsr	InputOn
		bra	UpDateList

AddInst		cmp	#255,_InstMaxNum(a5)
		beq	.reply
		bsr	DoHexReturn
		move.l	#inst_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,d7
		beq	.reply
		move.l	d7,-(sp)
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		move.l	(sp)+,d7
		bsr	RemInstList
		lea	_InstListView(a5),a0
		move.l	d7,a1
		ADDTAIL
		move	#64,inst_Volume(a1)
		move	#256*2,inst_PhaStart(a1)
		move	#256*2,inst_PhaRepeat(a1)
		move	#256*2,inst_PhaRepEnd(a1)
		move	#1,inst_EnvAttLen(a1)
		move	#1,inst_EnvDecLen(a1)
		move	#1,inst_EnvSusLen(a1)
		move	#1,inst_EnvRelLen(a1)
		move.b	#1,inst_ArpSpeed(a1)
		move.b	#-1,inst_Transpose(a1)
		lea	inst_NameStr(a1),a0
		move.l	a0,inst_Name(a1)
		lea	TuneList_Txt,a2
		moveq	#33-1,d0
.copy		move.b	(a2)+,(a0)+
		dbeq	d0,.copy
		clr.b	(a0)
		addq	#1,_InstMaxNum(a5)
		move	_InstMaxNum(a5),d0
		move	d0,_InstNum(a5)
		add	d0,d0
		lea	_AscIIHexTab(a5),a0
		move.b	(a0,d0.w),inst_NameStr(a1)
		move.b	1(a0,d0.w),inst_NameStr+1(a1)
		add	d0,d0
		lea	_InstPtrs(a5),a0
		move.l	d7,(a0,d0.w)
		bsr	AddInstList
		bsr	InstSelec
.reply		rts

SwapInst	cmp.b	#Inst,_CopyOf_(a5)
		bne.b	.reply
		tst	_HexNumEd2(a5)
		bne.b	.reply
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		bsr	RemInstList
		bsr	GetInst
		add	#inst_Title,a0
		lea	_CopyBuffer(a5),a1
		move	#inst_SIZE,d0
		lsr	#1,d0
		subq	#1,d0
.copy		move	(a0),d1
		move	(a1),d2
		move	d2,(a0)+
		move	d1,(a1)+
		dbf	d0,.copy
		bsr	AddInstList
		bsr	InstSelec
.reply		rts

CutInst		tst	_HexNumEd2(a5)
		bne	.reply
		tst	_InstNum(a5)
		beq	.reply
		move.b	#Inst,_CopyOf_(a5)
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		bsr	RemInstList
		bsr	GetInst
		move.l	a0,a2
		add	#inst_Title,a0
		lea	_CopyBuffer(a5),a1
		move	#inst_SIZE,d0
		lsr	#1,d0
		subq	#1,d0
.copy		move	(a0),(a1)+
		clr	(a0)+
		dbf	d0,.copy
		move.l	a2,a0
		add	#inst_Title,a0
		lea	TuneList_Txt+3,a1
		moveq	#30-1,d0
.move		move.b	(a1)+,(a0)+
		dbeq	d0,.move
		tst	d0
		bmi.b	.ok
.clear		clr.b	(a0)+
		dbf	d0,.clear
.ok		clr.b	(a0)
		move	#64,inst_Volume(a2)
		move	#256*2,inst_PhaStart(a2)
		move	#256*2,inst_PhaRepeat(a2)
		move	#256*2,inst_PhaRepEnd(a2)
		move	#1,inst_EnvAttLen(a2)
		move	#1,inst_EnvDecLen(a2)
		move	#1,inst_EnvSusLen(a2)
		move	#1,inst_EnvRelLen(a2)
		move.b	#1,inst_ArpSpeed(a2)
		move.b	#-1,inst_Transpose(a2)
		bsr	AddInstList
		bsr	InstSelec
.reply		rts

CopyInst	tst	_HexNumEd2(a5)
		bne.b	.reply
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		move.b	#Inst,_CopyOf_(a5)
		bsr	GetInst
		add	#inst_Title,a0
		lea	_CopyBuffer(a5),a1
		move	#inst_SIZE,d0
		lsr	#1,d0
		subq	#1,d0
.copy		move	(a0)+,(a1)+
		dbf	d0,.copy
.reply		rts

PasteInst	cmp.b	#Inst,_CopyOf_(a5)
		bne.b	.reply
		tst	_HexNumEd2(a5)
		bne.b	.reply
		tst	_InstNum(a5)
		beq.b	.reply
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		bsr	RemInstList
		bsr	GetInst
		add	#inst_Title,a0
		lea	_CopyBuffer(a5),a1
		move	#inst_SIZE,d0
		lsr	#1,d0
		subq	#1,d0
.copy		move	(a1)+,(a0)+
		dbf	d0,.copy
		bsr	AddInstList
		bsr	InstSelec
.reply		rts

RemoveInst	move	_InstNum(a5),d5
		beq	.reply
		jsr	InputOff
		jsr	CheckLowChipMem
		tst.l	d6
		beq.b	.skip
		move.l	_Window2(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemInst_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	.exit
.skip		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		move	#1023,d6
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a3
.lop		move.l	(a4)+,a1
		cmp.l	a3,a1
		beq.b	.zero
		moveq	#127,d0
.chk		cmp.b	1(a1),d5
		bne.b	.chkok
		move.l	_Window2(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemInstNot_Txt,12(a1)
		move.l	#Ok_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		jsr	InputOn
.reply		rts
.chkok		add	#12,a1
		dbf	d0,.chk
.zero		dbf	d6,.lop
		move	_InstNum(a5),d5
		move	_InstMaxNum(a5),d7
		move	#1023,d6
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a3
.lop2		move.l	(a4)+,a1
		cmp.l	a3,a1
		beq.b	.zero2
		move	#127,d0
.chk2		cmp.b	1(a1),d5
		bgt.b	.chkok2
		cmp.b	1(a1),d7
		blt.b	.chkok2
		subq.b	#1,1(a1)
.chkok2		add	#12,a1
		dbf	d0,.chk2
.zero2		dbf	d6,.lop2
		bsr	DoHexReturn
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		bsr	RemInstList
		bsr	GetInst
		lea	_InstListView(a5),a1
		move.l	MLH_TAILPRED(a1),a1
		move.l	a0,d7
.copy		cmp.l	a0,a1
		beq.b	.done
		move.l	inst_Pred(a1),a2
		move.b	inst_NameStr(a2),inst_NameStr(a1)
		move.b	inst_NameStr+1(a2),inst_NameStr+1(a1)
		move.l	a2,a1
		bra	.copy
.done		move.l	d7,a1
		REMOVE
		move.l	d7,a1
		move.l	#inst_SIZEOF,d0
		CallSys FreeMem
		lea	_InstPtrs(a5),a0
		move	_InstNum(a5),d0
		move	d0,d1
		add	d1,d1
		add	d1,d1
		add	d1,a0
		move	_InstMaxNum(a5),d1
		clr.l	(a0)
		bra.b	.check
.move		move.l	4(a0),(a0)+
		addq	#1,d0
.check		cmp	d0,d1
		bne	.move
		clr.l	(a0)
		subq	#1,_InstNum(a5)
		subq	#1,_InstMaxNum(a5)
		bsr	AddInstList
		bsr	InstSelec
		move.l	_RastPort1(a5),d6
		move.l	_GfxBase(a5),a6
		bsr	ExitTunePart
		bsr	UpdateParts
.exit		jsr	InputOn
		clr	_BlockPlay(a5)
		rts

RemInWs		dc.w	0

RemoveUnInstsWs	move	#1,RemInWs
RemUnusedInsts	tst	PT_RemUnIn
		bne.b	.skipreq
		jsr	InputOff
		jsr	CheckLowChipMem
		tst.l	d6
		beq.b	.skip
		move.l	_Window2(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemInsts_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	.exita
.skip		tst	_InstMaxNum(a5)
		beq	.exita
		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		bsr	RemInstList
.skipreq	moveq	#1,d5
.loopa		move	#1023,d6
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a3
.lop		move.l	(a4)+,a1
		cmp.l	a3,a1
		beq.b	.zero
		moveq	#127,d0
.chk		btst	#7,(a1)
		bne.b	.next
		cmp.b	#61,(a1)
		beq.b	.next
		cmp.b	1(a1),d5
		beq	.inuse
.next		add	#12,a1
		dbf	d0,.chk
.zero		dbf	d6,.lop
		move	_InstMaxNum(a5),d7
		move	#1023,d6
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a3
.lop2		move.l	(a4)+,a1
		cmp.l	a3,a1
		beq.b	.zero2
		moveq	#127,d0
.chk2		btst	#7,(a1)
		bne.b	.chkok2
		cmp.b	#61,(a1)
		beq.b	.chkok2
		cmp.b	1(a1),d5
		bgt.b	.chkok2
		cmp.b	1(a1),d7
		blt.b	.chkok2
		subq.b	#1,1(a1)
.chkok2		add	#12,a1
		dbf	d0,.chk2
.zero2		dbf	d6,.lop2
		tst	PT_RemUnIn
		bne.b	.skiphexreturn
		bsr	DoHexReturn
.skiphexreturn	lea	_InstPtrs(a5),a1
		move	d5,d0
		add	d0,d0
		add	d0,d0
		add	d0,a1
		move.l	(a1),a1
		lea	_InstListView(a5),a0
		move.l	MLH_TAILPRED(a0),a0
.copy		cmp.l	a0,a1
		beq.b	.done
		move.l	inst_Pred(a0),a2
		move.b	inst_NameStr(a2),inst_NameStr(a0)
		move.b	inst_NameStr+1(a2),inst_NameStr+1(a0)
		move.l	a2,a0
		bra	.copy
.done		move.l	a1,d7
		REMOVE
		move.l	d7,a1
		move.l	#inst_SIZEOF,d0
		CallSys FreeMem
		lea	_InstPtrs(a5),a0
		move	d5,d0
		add	d0,d0
		add	d0,d0
		add	d0,a0
		move	d5,d0
		move	_InstMaxNum(a5),d1
		clr.l	(a0)
		bra.b	.check
.move		move.l	4(a0),(a0)+
		addq	#1,d0
.check		cmp	d0,d1
		bne	.move
		clr.l	(a0)
		subq	#1,_InstMaxNum(a5)
		beq.b	.exit
		cmp	_InstMaxNum(a5),d5
		bgt.b	.exit
		bra	.loopa
.inuse		addq	#1,d5
		cmp	_InstMaxNum(a5),d5
		bgt.b	.exit
		bra	.loopa
.exit		tst	PT_RemUnIn
		beq.b	.nopt
		clr	PT_RemUnIn
		rts
.nopt		clr	_InstNum(a5)
		bsr	AddInstList
		bsr	InstSelec
		move.l	_RastPort1(a5),d6
		move.l	_GfxBase(a5),a6
		bsr	ExitTunePart
		bsr	UpdateParts
.exita		jsr	InputOn
		clr	_BlockPlay(a5)
		tst	RemInWs
		bne	RemoveUnWs
		rts

RemoveWs	tst	_WsMaxNum(a5)
		beq	.reply
		jsr	InputOff
		jsr	CheckLowChipMem
		tst.l	d6
		beq.b	.skipp
		move.l	_Window2(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemWs_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	.exit
.skipp		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		move	_WsNum(a5),d2
		addq	#1,d2
		move	_WsMaxNum(a5),d4
		bsr	TestWsInuse
		tst	d0
		bne	.inuse
		bsr	RenumberWs
		cmp	#$0102,_HexNumEd2(a5)
		bne.b	.ja
		bsr	DoHexReturn
.ja		bsr	ClrSmplScrPos
		bsr	ClrSmplScrGad
		bsr	RemSmplList
		bsr	GetSmpl
		move	_WsNum(a5),d2
		addq	#1,d2
		bsr	RemoveSmpl
		bsr	AddSmplList
		tst	_WsNum(a5)
		beq.b	.nosub
		subq	#1,_WsNum(a5)
.nosub		move.l	_RastPort1(a5),d6
		move.l	_GfxBase(a5),a6
		bsr	ExitTunePart
		bsr	UpdateParts
		move	_WsButtons(a5),d0
		cmp	#3,d0
		bne.b	.arpnot
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ExitArpg
		bsr	UpdateArpg
.arpnot		subq	#1,_WsMaxNum(a5)
		beq.b	.zerows
		move	_WsNum(a5),d0
		jsr	InputOn
		clr	_BlockPlay(a5)
		bra	WsSelect
.zerows		bsr	GetInst
		clr.b	inst_SmplType(a0)
		clr.b	inst_SmplNumber(a0)
		bsr	InstSelec
.exit		jsr	InputOn
		clr	_BlockPlay(a5)
.reply		rts

.inuse		move.l	_Window2(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemWsNot_Txt,12(a1)
		move.l	#Ok_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		bra	.exit

RemoveUnWs	clr	RemInWs
		tst	_WsMaxNum(a5)
		beq	.reply
		jsr	InputOff
		jsr	CheckLowChipMem
		tst.l	d6
		beq.b	.skipp
		move.l	_Window2(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemUnWs_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	.exit
.skipp		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		bsr	ClrSmplScrPos
		bsr	ClrSmplScrGad
		bsr	RemSmplList
		moveq	#1,d2
		move	_WsMaxNum(a5),d4
.loopa		bsr	TestWsInuse
		tst	d0
		bne.b	.inuse
		bsr	RenumberWs
		cmp	#$0102,_HexNumEd2(a5)
		bne.b	.ja
		move.l	d2,-(sp)
		bsr	DoHexReturn
		move.l	(sp)+,d2
.ja		lea	_WsPtrs(a5),a0
		move	d2,d0
		lsl	#2,d0
		add	d0,a0
		move.l	(a0),a0
		bsr	RemoveSmpl
		subq	#1,_WsMaxNum(a5)
		beq.b	.exita
		cmp	_WsMaxNum(a5),d2
		bgt.b	.exita
		bra	.loopa
.inuse		addq	#1,d2
		cmp	_WsMaxNum(a5),d2
		bgt.b	.exita
		bra	.loopa
.exita		move.l	_RastPort1(a5),d6
		move.l	_GfxBase(a5),a6
		bsr	ExitTunePart
		bsr	UpdateParts
		move	_WsButtons(a5),d0
		cmp	#3,d0
		bne.b	.arpnot
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ExitArpg
		bsr	UpdateArpg
.arpnot		clr	_InstNum(a5)
		bsr	AddSmplList
		bsr	InstSelec
.exit		jsr	InputOn
		clr	_BlockPlay(a5)
.reply		rts

TestWsInuse	move	_InstMaxNum(a5),d1
		subq	#1,d1
		bmi.b	.tstarpg
		lea	_InstPtrs+4(a5),a0
		move	_InstNum(a5),d0
		lsl	#2,d0
		lea	-4(a0,d0.w),a2
.check		cmp.l	a0,a2
		bne.b	.no
		addq	#4,a0
		bra.b	.ok
.no		move.l	(a0)+,a1
		cmp.b	inst_SmplNumber(a1),d2
		beq	.inuse
		cmp.b	inst_MixWaveNum(a1),d2
		beq.b	.inuse
		moveq	#5-1,d0
		lea	inst_TraWaveNums(a1),a3
.traloop	move.b	(a3)+,d3
		beq.b	.ok
		cmp.b	d3,d2
		beq.b	.inuse
		dbf	d0,.traloop
.ok		dbf	d1,.check

.tstarpg	move	#255,d1
		lea	_ArpgPtrs(a5),a4
		lea	_ZeroBuffer(a5),a2
.lop		move.l	(a4)+,a1
		cmp.l	a2,a1
		beq.b	.zero
		moveq	#127,d0
.chk		cmp.b	#61,(a1)
		bge.b	.skip
		cmp.b	1(a1),d2
		beq.b	.inuse
.skip		addq	#6,a1
		dbf	d0,.chk
.zero		dbf	d1,.lop

.tstpart	move	#1023,d1
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a2
.tstpartloop	move.l	(a4)+,a1
		cmp.l	a2,a1
		beq.b	.tstpartzero
		moveq	#127,d0
		moveq	#5-1,d5
.tstpartcheck	cmp.b	#fx_WaveSample,2(a1)
		bne.b	.tstpartnext
		cmp.b	3(a1),d2
		beq.b	.inuse
.tstpartnext	addq	#2,a1
		dbf	d5,.tstpartcheck
		moveq	#5-1,d5
		addq	#2,a1
		dbf	d0,.tstpartcheck
.tstpartzero	dbf	d1,.tstpartloop
		moveq	#0,d0
		rts
.inuse		moveq	#1,d0
		rts

RenumberWs	move	#255,d1
		lea	_ArpgPtrs(a5),a4
		lea	_ZeroBuffer(a5),a2
.lop2		move.l	(a4)+,a1
		cmp.l	a2,a1
		beq.b	.zero2
		moveq	#127,d0
.chk2		cmp.b	#61,(a1)
		bge.b	.chkok2
		cmp.b	1(a1),d2
		bgt.b	.chkok2
		cmp.b	1(a1),d4
		blt.b	.chkok2
		subq.b	#1,1(a1)
.chkok2		addq	#6,a1
		dbf	d0,.chk2
.zero2		dbf	d1,.lop2

.partrenumber	move	#1023,d1
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a2
.partloop	move.l	(a4)+,a1
		cmp.l	a2,a1
		beq.b	.partzero
		moveq	#127,d0
		moveq	#5-1,d5
.partcheck	cmp.b	#fx_WaveSample,2(a1)
		bne.b	.partnext
		cmp.b	3(a1),d2
		bgt.b	.partnext
		cmp.b	3(a1),d4
		blt.b	.partnext
		subq.b	#1,3(a1)
.partnext	addq	#2,a1
		dbf	d5,.partcheck
		moveq	#5-1,d5
		addq	#2,a1
		dbf	d0,.partcheck
.partzero	dbf	d1,.partloop

.instrenumber	move	_InstMaxNum(a5),d1
		subq	#1,d1
		bmi.b	.instdone
		lea	_InstPtrs+4(a5),a0
.instloop	move.l	(a0)+,a1
		cmp.b	inst_SmplNumber(a1),d2
		bgt.b	.instcheck1
		subq.b	#1,inst_SmplNumber(a1)
.instcheck1	cmp.b	inst_MixWaveNum(a1),d2
		bgt.b	.instcheck2
		subq.b	#1,inst_MixWaveNum(a1)
.instcheck2	moveq	#5-1,d0
		lea	inst_TraWaveNums(a1),a2
.insttraloop	move.b	(a2)+,d5
		beq.b	.instnext
		cmp.b	d5,d2
		bgt.b	.insttranext
		cmp.b	d5,d4
		blt.b	.insttranext
		subq.b	#1,-1(a2)
.insttranext	dbf	d0,.insttraloop
.instnext	dbf	d1,.instloop
.instdone	rts

_EqWsNum1	rs.w	1
_EqWsNum2	rs.w	1
_EqWsLen	rs.w	1
_EqWsPtr	rs.l	1

RemoveEqWs	cmp	#2,_WsMaxNum(a5)
		blo	.reply
		jsr	InputOff
		jsr	CheckLowChipMem
		tst.l	d6
		beq.b	.skip
		move.l	_Window2(a5),a0
		lea	EasyReqDefs,a1
		move.l	#RemEqWs_Txt,12(a1)
		move.l	#OkCancel_Txt,16(a1)
		sub.l	a2,a2
		sub.l	a3,a3
		CallIntuition EasyRequestArgs
		tst.l	d0
		beq	.exit
.skip		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		bsr	ClrSmplScrPos
		bsr	ClrSmplScrGad
		bsr	RemSmplList
		move	#1,_EqWsNum1(a5)

.checknextsmpl	move	_EqWsNum1(a5),_EqWsNum2(a5)
		lea	_WsPtrs(a5),a0
		move	_EqWsNum1(a5),d0
		lsl	#2,d0
		add	d0,a0
		move.l	(a0)+,a1
		move	smpl_Length(a1),_EqWsLen(a5)
		lea	smpl_SampleData(a1),a1
		move.l	a1,_EqWsPtr(a5)
		move	_WsMaxNum(a5),d3

.checknext	cmp	_EqWsNum2(a5),d3
		beq	.nextsmpl
		addq	#1,_EqWsNum2(a5)
		move.l	(a0)+,a2
		move	smpl_Length(a2),d1
		cmp	_EqWsLen(a5),d1
		bne.b	.checknext
		moveq	#0,d2
		move	d1,d2
		add.l	d2,d2
		move.l	_EqWsPtr(a5),a3
		lea	smpl_SampleData(a2),a4

.checksmpl	cmpm.b	(a3)+,(a4)+
		bne.b	.checknext
		subq.l	#1,d2
		bne.b	.checksmpl
		lea	-4(a0),a3
		move.l	a2,a0
		move	_EqWsNum2(a5),d2
		bsr	RemoveSmpl

.arpgrenumber	move	#255,d1
		lea	_ArpgPtrs(a5),a4
		lea	_ZeroBuffer(a5),a2
		move	_EqWsNum2(a5),d2
		move	_EqWsNum1(a5),d3
		move	_WsMaxNum(a5),d4
.arpgloop	move.l	(a4)+,a1
		cmp.l	a2,a1
		beq.b	.arpgzero
		moveq	#127,d0
.arpgcheck	cmp.b	#61,(a1)
		bge.b	.arpgnextline
		cmp.b	1(a1),d2
		bne.b	.arpgnext
		move.b	d3,1(a1)
		bra.b	.arpgnextline
.arpgnext	cmp.b	1(a1),d2
		bgt.b	.arpgnextline
		cmp.b	1(a1),d4
		blt.b	.arpgnextline
		subq.b	#1,1(a1)
.arpgnextline	addq	#6,a1
		dbf	d0,.arpgcheck
.arpgzero	dbf	d1,.arpgloop

.partrenumber	move	#255,d1
		lea	_PartPtrs(a5),a4
		lea	_ZeroBuffer(a5),a2
.partloop	move.l	(a4)+,a1
		cmp.l	a2,a1
		beq.b	.partzero
		moveq	#127,d0
		moveq	#5-1,d5
.partcheck	cmp.b	#fx_WaveSample,2(a1)
		bne.b	.partnext2
		cmp.b	3(a1),d2
		bne.b	.partnext
		move.b	d3,3(a1)
		bra.b	.partnext2
.partnext	cmp.b	3(a1),d2
		bgt.b	.partnext2
		cmp.b	3(a1),d4
		blt.b	.partnext2
		subq.b	#1,3(a1)
.partnext2	addq	#2,a1
		dbf	d5,.partcheck
		moveq	#5-1,d5
		addq	#2,a1
		dbf	d0,.partcheck
.partzero	dbf	d1,.partloop

.instrenumber	move	_InstMaxNum(a5),d1
		subq	#1,d1
		bmi	.instdone
		lea	_InstPtrs+4(a5),a0
.instloop	move.l	(a0)+,a1
		cmp.b	inst_SmplNumber(a1),d2
		bne.b	.instchk
		move.b	d3,inst_SmplNumber(a1)

.fixwsptrs	lea	_WsPtrs(a5),a2
		move	d3,d5
		lsl	#2,d5
		move.l	(a2,d5.w),a2
		move.l	smpl_Pointer(a2),d5
		moveq	#0,d6
		move	inst_SmplStart(a1),d6
		add.l	d6,d5
		add.l	d6,d5
		move.l	d5,inst_SmplPointer(a1)
		move.l	smpl_Pointer(a2),d5
		moveq	#0,d6
		move	inst_SmplRepStart(a1),d6
		add.l	d6,d5
		add.l	d6,d5
		move.l	d5,inst_SmplRepPointer(a1)
		bra.b	.instcheck
.instchk	cmp.b	inst_SmplNumber(a1),d2
		bgt.b	.instcheck
		subq.b	#1,inst_SmplNumber(a1)
.instcheck	cmp.b	inst_MixWaveNum(a1),d2
		bne.b	.instcheck1
		move.b	d3,inst_MixWaveNum(a1)
.instcheck1	cmp.b	inst_MixWaveNum(a1),d2
		bgt.b	.instcheck2
		subq.b	#1,inst_MixWaveNum(a1)
.instcheck2	moveq	#5-1,d0
		lea	inst_TraWaveNums(a1),a2
.insttraloop	move.b	(a2)+,d5
		beq.b	.instnext
		cmp.b	d5,d2
		bne.b	.insttranext1
		move.b	d3,-1(a2)
		bra.b	.insttranext2
.insttranext1	cmp.b	d5,d2
		bgt.b	.insttranext2
		cmp.b	d5,d4
		blt.b	.insttranext2
		subq.b	#1,-1(a2)
.insttranext2	dbf	d0,.insttraloop
.instnext	dbf	d1,.instloop

.instdone	move.l	a3,a0
		subq	#1,_EqWsNum2(a5)
		subq	#1,_WsMaxNum(a5)
		move	_WsMaxNum(a5),d3
		bra	.checknext

.nextsmpl	move	_WsMaxNum(a5),d0
		beq.b	.done
		addq	#1,_EqWsNum1(a5)
		cmp	_EqWsNum1(a5),d0
		bhi	.checknextsmpl

.done		clr	_InstNum(a5)
		bsr	AddSmplList
		bsr	InstSelec
.exit		jsr	InputOn
.reply		rts

GetTune		lea	_TunePtrs(a5),a0
		move	_TuneNum(a5),d0
		add	d0,d0
		add	d0,d0
		move.l	(a0,d0.w),a0
		rts

GetInst		lea	_InstPtrs(a5),a0
		move	_InstNum(a5),d0
		add	d0,d0
		add	d0,d0
		move.l	(a0,d0.w),a0
		rts

GetSmpl		lea	_WsPtrs(a5),a0
		move	_WsNum(a5),d0
		addq	#1,d0
		add	d0,d0
		add	d0,d0
		move.l	(a0,d0.w),a0
		rts

*******************
* a0 <- SmplPointer
* d2 <- SmplNumber

RemoveSmpl	move.l	a0,d7
		lea	_SmplListView(a5),a1
		move.l	MLH_TAILPRED(a1),a1
.copy		cmp.l	a0,a1
		beq.b	.done
		move.l	smpl_Pred(a1),a2
		move.b	smpl_NameStr(a2),smpl_NameStr(a1)
		move.b	smpl_NameStr+1(a2),smpl_NameStr+1(a1)
		move.l	a2,a1
		bra	.copy
.done		move.l	d7,a1
		REMOVE
		move.l	d7,a1
		moveq	#0,d0
		move	smpl_Length(a1),d0
		cmp.l	#128,d0
		bne.b	.okey
		add	#120,d0
.okey		add.l	d0,d0
		add.l	#smpl_SampleData,d0
		CallSys FreeMem
		lea	_WsPtrs(a5),a0
		move	d2,d1
		lsl	#2,d1
		add	d1,a0
		move	d2,d0
		move	_WsMaxNum(a5),d1
		bra.b	.check
.move		move.l	4(a0),(a0)+
		addq	#1,d0
.check		cmp	d0,d1
		bne	.move
		clr.l	(a0)
		rts

** GetEmptyArpg ***************************************************************
** a0 -> Empty Arpeggio Pointer
** d0 -> Empty Arpeggio Number

GetEmptyArpg	movem.l	a1/d7,-(sp)
		lea	_ArpgPtrs(a5),a0
		lea	_ZeroBuffer(a5),a1
		moveq	#0,d0
		move	#256-1,d7
.loop		cmp.l	(a0)+,a1
		beq.b	.found
		addq	#1,d0
		dbf	d7,.loop
		sub.l	a0,a0
		movem.l	(sp)+,a1/d7
		rts
.found		subq	#4,a0
		movem.l	(sp)+,a1/d7
		rts

* Twins/PHA *****************************************************************
* Change octaves                                      Last Change: 92-10-24 *
*****************************************************************************

_OctaveAdder	rs.w	1
_KeybListSave	rs.w	1

OctaveKeys	move	_KeybListSize1(a5),_KeybListSize(a5)
		moveq	#0,d0
		move	_OctaveAdder(a5),d0
		add	#12,d0
		cmp	#36,d0
		blo.b	.ok
		bhi.b	.clear
		move	_KeybListSize2(a5),_KeybListSize(a5)
		bra.b	.ok
.clear		moveq	#0,d0
.ok		move	d0,_OctaveAdder(a5)
		move.l	d0,d1
		divu	#12,d1
		move	d1,CycleNum+2
		bra	SetOctaves

Octave1		bsr.b	Octave
		move.l	_OctaveGad2(a5),a0
		move.l	_Window2(a5),a1
		bra.b	SetCycleGad

Octave2		bsr.b	Octave
		move.l	_OctaveGad1(a5),a0
		move.l	_Window1(a5),a1
		bra.b	SetCycleGad

Octave		move	_KeybListSize1(a5),_KeybListSize(a5)
		move	im_Code(a4),d0
		beq.b	LowOct
		cmp	#1,d0
		beq.b	MedOct
		cmp	#2,d0
		beq.b	HighOct

LameOct		move	#36,_OctaveAdder(a5)
		move.l	#3,CycleNum
		move	_KeybListSize2(a5),_KeybListSize(a5)
		rts

HighOct		move	#24,_OctaveAdder(a5)
		move.l	#2,CycleNum
		rts

MedOct		move	#12,_OctaveAdder(a5)
		move.l	#1,CycleNum
		rts

LowOct		clr	_OctaveAdder(a5)
		clr.l	CycleNum
		rts

SetCycleGad	sub.l	a2,a2
		lea	CycleTags,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

SetOctaves	move.l	_OctaveGad1(a5),a0
		move.l	_Window1(a5),a1
		bsr	SetCycleGad
		move.l	_OctaveGad2(a5),a0
		move.l	_Window2(a5),a1
		bra	SetCycleGad

CycleTags	dc.l	GTCY_Active
CycleNum	dc.l	0
		dc.l	TAG_DONE

PolyOnOff	eor	#1,_PolyOnOff(a5)
		move	_PolyOnOff(a5),d0
		bsr.b	Poly
		move.l	_PolyGad1(a5),a0
		move.l	_Window1(a5),a1
		bsr	SetCycleGad
		move.l	_PolyGad2(a5),a0
		move.l	_Window2(a5),a1
		bra	SetCycleGad

Poly1		move	im_Code(a4),d0
		move	d0,_PolyOnOff(a5)
		bsr.b	Poly
		move.l	_PolyGad2(a5),a0
		move.l	_Window2(a5),a1
		bsr	SetCycleGad
		rts

Poly2		move	im_Code(a4),d0
		move	d0,_PolyOnOff(a5)
		bsr.b	Poly
		move.l	_PolyGad1(a5),a0
		move.l	_Window1(a5),a1
		bsr	SetCycleGad
		rts

Poly		move	d0,CycleNum+2
		bne.b	.exit
		tst	_PlayTune(a5)
		bne.b	.exit
		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		clr	_BlockPlay(a5)
.exit		rts

SetZeroNote	lea	_WaitRequester1(a5),a0
		CallIntuition InitRequester
		lea	_WaitRequester1(a5),a0
		move.l	_Window1(a5),a1
		CallLib Request
		lea	_WaitRequester2(a5),a0
		CallLib InitRequester
		lea	_WaitRequester2(a5),a0
		move	#NOISYREQ,rq_Flags(a0)
		move.l	_Window2(a5),a1
		CallLib Request
		jsr	PointerOff
.reply		move.l	_Message(a5),a1
		CallGadTools GT_ReplyIMsg
.wait		move.l	_UserPort2(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,_Message(a5)
		beq	.wait
		move.l	d0,a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_RAWKEY,d0
		bne	.reply
		move	im_Code(a4),d2
		btst	#7,d2
		bne	.reply
		move	_KeybListSize(a5),d1
		subq	#3,d1
		move.l	_KeybListPtr(a5),a2
		addq	#3,a2
.search		cmp.b	(a2)+,d2
		beq.b	.found
		dbf	d1,.search
		bra	.reply
.found		add	_KeybListSize1(a5),a2
		moveq	#0,d1
		move.b	(a2),d1
		beq	.reply
		add	_OctaveAdder(a5),d1
		move.b	d1,_ZeroNote(a5)
		add	d1,d1
		add	d1,d1
		lea	AscIINotes,a0
		lea	ZeroNote_Txt,a1
		add	d1,a0
		move.b	(a0)+,(a1)+
		move.b	(a0)+,(a1)+
		move.b	(a0)+,(a1)+
		jsr	InputOn
		move.l	_ArpNoteGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList18,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

AddTraWave	tst	_InstNum(a5)
		beq.b	.reply
		tst	_WsMaxNum(a5)
		beq.b	.reply
		bsr	GetInst
		lea	inst_TraWaveNums(a0),a0
		move	_WsMaxNum(a5),d1
		moveq	#0,d7
.test		move.b	(a0)+,d0
		beq.b	.ok
		cmp.b	d1,d0
		bhi.b	.ok
		addq	#1,d7
		cmp	#5,d7
		blo.b	.test
.reply		rts
.ok		jsr	InputOff
		moveq	#0,d6
		lea	_SmplListView(a5),a4
		bra.b	.nowave
.loop		tst.b	smpl_Type(a4)
		beq.b	.nowave
		addq	#1,d6
.nowave		TSTNODE	a4,a4
		bne.b	.loop
		move.l	d6,d0
		beq	.exit
		addq	#1,d0
		mulu	#temp_SIZE,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	.exit
		move.l	d0,a1
		lea	_TraSelListView(a5),a2
		NEWLIST	a2
		lea	_SmplListView(a5),a4
		move.l	(a4),a4
		moveq	#0,d5
.loop1		addq	#1,d5
		tst.b	smpl_Type(a4)
		beq.b	.nowave1
		move.l	a2,a0
		ADDTAIL
		move.l	LN_NAME(a4),LN_NAME(a1)
		move	d5,temp_Num(a1)
		add	#temp_SIZE,a1
.nowave1	TSTNODE	a4,a4
		bne.b	.loop1
		move.l	#AddWave_Txt,Window3Title
		jsr	OpenWindow3
		tst.l	d3
		bne.b	.oki
		lea	_TraSelListView(a5),a1
		move.l	(a1),a1
		move.l	d6,d0
		addq	#1,d0
		mulu	#temp_SIZE,d0
		CallSys FreeMem
		jsr	InputOn
		rts
.oki		bsr	SetTraSelList
.wait		move.l	_UserPort3(a5),a0
		CallSys WaitPort
		move.l	_UserPort3(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,d4
		beq	.wait
		move.l	d0,a1
		CallLib GT_ReplyIMsg
		move.l	d4,a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_CLOSEWINDOW,d0
		beq.b	.closewindow
		cmp.l	#IDCMP_GADGETUP,d0
		beq.b	.gadgetselected
		bra.b	.wait
.gadgetselected	move	im_Code(a4),d0
		lea	_TraSelListView(a5),a4
.loop2		move.l	(a4),a4
		dbf	d0,.loop2
		bsr	GetInst
		lea	inst_TraWaveNums(a0),a0
		move	temp_Num(a4),d0
		move.b	d0,(a0,d7.w)
		move.l	d6,-(sp)
		bsr	PrintTraWsNums
		move.l	(sp)+,d6
		addq	#1,d7
		cmp	#5,d7
		blo	.wait
.closewindow	lea	_TraSelListView(a5),a1
		move.l	(a1),a1
		move.l	d6,d0
		addq	#1,d0
		mulu	#temp_SIZE,d0
		CallSys FreeMem
		jsr	CloseWindow3
		bsr	SetTransform
.exit		jsr	InputOn
		rts

ClrTraWave	tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		clr	inst_TraStart(a0)
		clr	inst_TraRepeat(a0)
		clr	inst_TraRepEnd(a0)
		lea	inst_TraWaveNums(a0),a0
		clr.b	(a0)+
		clr.b	(a0)+
		clr.b	(a0)+
		clr.b	(a0)+
		clr.b	(a0)+
		bsr	SetTransform
.reply		rts

MixSetWave	tst	_InstNum(a5)
		beq	.reply
		tst	_WsMaxNum(a5)
		beq	.reply
		jsr	InputOff
		moveq	#0,d6
		lea	_SmplListView(a5),a4
		bra.b	.nowave
.loop		tst.b	smpl_Type(a4)
		beq.b	.nowave
		addq	#1,d6
.nowave		TSTNODE	a4,a4
		bne.b	.loop
		move.l	d6,d0
		beq	.exit
		addq	#1,d0
		mulu	#temp_SIZE,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		tst.l	d0
		beq	.exit
		move.l	d0,a1
		lea	_TraSelListView(a5),a2
		NEWLIST	a2
		lea	_SmplListView(a5),a4
		move.l	(a4),a4
		moveq	#0,d5
.loop1		addq	#1,d5
		tst.b	smpl_Type(a4)
		beq.b	.nowave1
		move.l	a2,a0
		ADDTAIL
		move.l	LN_NAME(a4),LN_NAME(a1)
		move	d5,temp_Num(a1)
		add	#temp_SIZE,a1
.nowave1	TSTNODE	a4,a4
		bne.b	.loop1
		move.l	#SetWave_Txt,Window3Title
		jsr	OpenWindow3
		tst.l	d3
		bne.b	.ok
		lea	_TraSelListView(a5),a1
		move.l	(a1),a1
		move.l	d6,d0
		addq	#1,d0
		mulu	#temp_SIZE,d0
		CallSys FreeMem
		jsr	InputOn
.reply		rts
.ok		bsr	SetTraSelList
.wait		move.l	_UserPort3(a5),a0
		CallSys WaitPort
		move.l	_UserPort3(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,d4
		beq	.wait
		move.l	d0,a1
		CallLib GT_ReplyIMsg
		move.l	d4,a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_CLOSEWINDOW,d0
		beq.b	.closewindow
		cmp.l	#IDCMP_GADGETUP,d0
		beq.b	.gadgetselected
		bra.b	.wait
.gadgetselected	move	im_Code(a4),d0
		lea	_TraSelListView(a5),a4
.loop2		move.l	(a4),a4
		dbf	d0,.loop2
		bsr	GetInst
		move	temp_Num(a4),d0
		beq.b	.closewindow
		cmp	_WsMaxNum(a5),d0
		bhi.b	.closewindow
		move.b	d0,inst_MixWaveNum(a0)
		bsr.b	UpdateMixWave
		bra	.wait
.closewindow	lea	_TraSelListView(a5),a1
		move.l	(a1),a1
		move.l	d6,d0
		addq	#1,d0
		mulu	#temp_SIZE,d0
		CallSys FreeMem
		jsr	CloseWindow3
.exit		jsr	InputOn
		rts

UpdateMixWave	bsr	GetInst
		clr.l	GTTX_Ptr
		moveq	#0,d0
		move.b	inst_MixWaveNum(a0),d0
		beq.b	.zero
		lea	_WsPtrs(a5),a2
		add	d0,d0
		add	d0,d0
		add	d0,a2
		move.l	(a2),a2
		lea	smpl_NameStr(a2),a0
		move.l	a0,GTTX_Ptr
.zero		move.l	_MixWaveNumGad(a5),a0
		move.l	_Window2(a5),a1
		sub.l	a2,a2
		lea	TagList31,a3
		CallGadTools GT_SetGadgetAttrsA
		rts

MixClrWave	tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		clr	inst_MixStart(a0)
		clr	inst_MixRepeat(a0)
		clr	inst_MixRepEnd(a0)
		clr.b	inst_MixWaveNum(a0)
		bsr	UpdateMixWave
.reply		rts

_AnimFrames	rs.w	1
_AnimCounter	rs.w	1
_UPort4SigNum	rs.b	1
		rs.b	1
_Signals4	rs.l	1

MakeAnim	tst	_InstNum(a5)
		beq.b	.reply
		bsr	GetInst
		tst.b	inst_SmplNumber(a0)
		beq.b	.reply
		jsr	InputOff
		jsr	OpenWindow4
		tst.l	d7
		bne.b	.ok
		jsr	InputOn
.reply		rts
.ok		move.l	_GfxBase(a5),a6
		move.l	_RastPort4(a5),d6
		move	_AnimFrames(a5),d4
		move.l	_AnimFramesGad(a5),a4
		bsr	PrintHex3Digits
		bset	#3,_ActiveWindows(a5)
.waitloop	moveq	#0,d0
		moveq	#0,d1
		move.l	_UserPort4(a5),a0
		move.b	MP_SIGBIT(a0),d1
		move.b	d1,_UPort4SigNum(a5)
		bset	d1,d0
		move.l	_Signal(a5),d1
		bset	d1,d0
		CallSys Wait
		move.l	d0,_Signals4(a5)
		beq	.waitloop
		move.l	_Signals4(a5),d0
		move.b	_UPort4SigNum(a5),d1
		btst	d1,d0
		bne.b	.userport4
.wait		move.l	_Signals4(a5),d0
		move.l	_Signal(a5),d1
		btst	d1,d0
		beq.b	.waitloop
		btst	#Msg_DrawVisual,_SigMsg+2(a5)
		beq	.waitloop
		jsr	DrawVisual
		bra	.waitloop

.userport4	move.l	_UserPort4(a5),a0
		CallGadTools GT_GetIMsg
		move.l	d0,d4
		beq	.wait
		move.l	d0,a1
		CallLib GT_ReplyIMsg
		move.l	d4,a4
		move.l	im_Class(a4),d0
		cmp.l	#IDCMP_RAWKEY,d0
		beq.b	.startinterrupt
		cmp.l	#IDCMP_CLOSEWINDOW,d0
		beq	.closewindow
		cmp.l	#IDCMP_GADGETUP,d0
		beq.b	.gadgetselected
		cmp.l	#IDCMP_GADGETDOWN,d0
		beq.b	.gadgetselected
		cmp.l	#IDCMP_MOUSEMOVE,d0
		beq.b	.gadgetselected
		cmp.l	#IDCMP_ACTIVEWINDOW,d0
		beq	.activewindow
		cmp.l	#IDCMP_INACTIVEWINDOW,d0
		beq	.inactivewindow
		bra.b	.wait

.startinterrupt	move	im_Code(a4),d0
		move.b	d0,_RawKey(a5)
		btst	#7,d0
		bne	.wait
		cmp	#$55,d0
		bne.b	.skipa
		bsr	PlayTuneGadget
		bra	.wait
.skipa		cmp	#$40,d0
		bne.b	.skip
		move	#$0101,_BlockPlay(a5)
		bsr	Stoppa
		clr	_BlockPlay(a5)
		bra	.wait
.skip		tst	_IntMode(a5)
		bne	.wait
		tst.b	_PlayMode(a5)
		beq.b	.starttimerint
		jsr	StartAudioInt
		bra	.wait
.starttimerint	jsr	StartTimerInt
		bra	.wait

.gadgetselected	move.l	im_IAddress(a4),a0
		move.l	gg_UserData(a0),d1
		beq	.wait
		move.l	d1,a1
		move.l	_GfxBase(a5),a6
		move.l	_RastPort4(a5),d6
		jsr	(a1)
		bra	.wait

.activewindow	bset	#3,_ActiveWindows(a5)
		tst.b	_AudioChannels(a5)
		bne.b	.vbint
		jsr	AllocChannels
		bne.b	.vbint
		clr.b	_AudioChannels(a5)
		bra.b	.exit
.vbint		tst.l	_RemTimers(a5)
		bne.b	.exit
		jsr	AddTimers
.exit		bra	.wait

.inactivewindow	bclr	#3,_ActiveWindows(a5)
		move.l	_IntuitionBase(a5),a0
		move.l	ib_ActiveScreen(a0),a1
		cmp.l	_Screen(a5),a1
		beq.b	.exit2
		tst	_PlayTune(a5)
		bne.b	.exit2
		jsr	RemTimers
		jsr	FreeChannels
		bsr	Stoppa
.exit2		bra	.wait

.closewindow	bclr	#3,_ActiveWindows(a5)
		jsr	CloseWindow4
		jsr	InputOn
		rts

AnimFrames	move	im_Code(a4),d4
		move.l	a0,a4
		move.l	_RastPort4(a5),d6
		bsr	PrintHex3Digits
		bsr	GetInst
		move	d4,_AnimFrames(a5)
		move.b	_InstNum+1(a5),_InstInit(a5)
		rts

_OldInstPtr	rs.l	1
_OldWsPtr	rs.l	1
_OldInstNum	rs.w	1
_OldStep1	rs.b	1
_OldStep2	rs.b	1
_LoopSize	rs.w	1

anim_Text	dc.b	"anim."

MakeInstAnim	move	#$0101,_BlockPlay(a5)
		bset	#2,_PlayBits(a5)
		bsr	Stoppa
		cmp	#255,_InstMaxNum(a5)
		beq	.exit
		tst	_AnimFrames(a5)
		beq	.exit
		bsr	GetInst
		move.l	a0,_OldInstPtr(a5)
		move	inst_SmplRepLength(a0),d0
		btst	#LOOP,inst_Effects1(a0)
		beq.b	.ok
		move	inst_LooLength(a0),d0
.ok		cmp	#8,d0
		beq.b	.jabba
		cmp	#16,d0
		beq.b	.jabba
		cmp	#32,d0
		beq.b	.jabba
		cmp	#64,d0
		beq.b	.jabba
		cmp	#128,d0
		bne	.exit
.jabba		bsr	GetSmpl
		move.l	a0,_OldWsPtr(a5)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	DoHexReturn
		move.l	#inst_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,d7
		beq	.exit
		movem.l	d2-d7,-(sp)
		bsr	ClrInstScrPos
		bsr	ClrInstScrGads
		movem.l	(sp)+,d2-d7
		bsr	RemInstList
		lea	_InstListView(a5),a0
		move.l	d7,a1
		ADDTAIL
		move	#256*2,inst_PhaStart(a1)
		move	#256*2,inst_PhaRepeat(a1)
		move	#256*2,inst_PhaRepEnd(a1)
		move	#1,inst_EnvAttLen(a1)
		move	#1,inst_EnvDecLen(a1)
		move	#1,inst_EnvSusLen(a1)
		move	#1,inst_EnvRelLen(a1)
		move.b	#1,inst_ArpSpeed(a1)
		move.b	#-1,inst_Transpose(a1)
		lea	inst_NameStr(a1),a0
		move.l	a0,inst_Name(a1)
		move.l	_OldInstPtr(a5),a2
		move	inst_Volume(a2),inst_Volume(a1)
		move	inst_FineTune(a2),inst_FineTune(a1)
		move	inst_SemiTone(a2),inst_SemiTone(a1)
		move.b	inst_Transpose(a2),inst_Transpose(a1)
		move.b	inst_SlideSpeed(a2),inst_SlideSpeed(a1)
		move.b	inst_Effects1(a2),d0
		bset	#LOOP,d0
		bset	#LOOPSTOP,d0
		bclr	#WSLOOP,d0
		move.b	d0,inst_Effects1(a1)
		lea	inst_EnvAttLen(a2),a3
		lea	inst_EnvAttLen(a1),a4
		move.l	#inst_EnvTraPhaFilBits,d0
		sub.l	#inst_EnvAttLen,d0
		lsr	#1,d0
		subq	#1,d0
.loopmove	move	(a3)+,(a4)+
		dbf	d0,.loopmove
		lea	inst_NameStr(a2),a2
		moveq	#33-1,d0
.copy		move.b	(a2)+,(a0)+
		dbf	d0,.copy
		addq	#1,_InstMaxNum(a5)
		move	_InstMaxNum(a5),d0
		move	_InstNum(a5),_OldInstNum(a5)
		move	d0,_InstNum(a5)
		add	d0,d0
		lea	_AscIIHexTab(a5),a0
		move.b	(a0,d0.w),inst_NameStr(a1)
		move.b	1(a0,d0.w),inst_NameStr+1(a1)
		add	d0,d0
		lea	_InstPtrs(a5),a0
		move.l	d7,(a0,d0.w)
		bsr	AddInstList

		addq.b	#1,_WsMaxNum+1(a5)
		bcc.b	.okey
		move	#255,_WsMaxNum(a5)
		bra	.exit
.okey		move.l	_OldInstPtr(a5),a0
		moveq	#0,d1
		move.b	inst_SmplType(a0),d1
		bne.b	.wave
		move	inst_SmplRepLength(a0),d0
		btst	#LOOP,inst_Effects1(a0)
		beq.b	.oki
		move	inst_LooLength(a0),d0
.oki		add	d0,d0
		bra.b	.smpl
.wave		moveq	#8,d0
		lsl.l	d1,d0
.smpl		move	d0,_LoopSize(a5)
		mulu	_AnimFrames(a5),d0
		move.l	d0,d5
		add.l	#smpl_SampleData,d0
.allocmem	move.l	#MEMF_CHIP!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,d7
		beq	.exit
		movem.l	d2-d7,-(sp)
		bsr	ClrSmplScrPos
		bsr	ClrSmplScrGad
		movem.l	(sp)+,d2-d7
		bsr	RemSmplList
		lea	_SmplListView(a5),a0
		move.l	d7,a1
		move.l	d7,a3
		ADDTAIL
		lsr.l	#1,d5
		move	d5,smpl_Length(a3)
		lea	smpl_SampleData(a3),a0
		move.l	a0,smpl_Pointer(a3)
		move.l	a0,smpl_RepPointer(a3)
		lea	smpl_NameStr(a3),a0
		move.l	a0,smpl_Name(a3)
		lea	_WsPtrs(a5),a1
		move	_WsMaxNum(a5),d1
		add	d1,d1
		add	d1,d1
		move.l	a3,(a1,d1.w)
		move	_WsMaxNum(a5),d0
		add	d0,d0
		lea	_AscIIHexTab(a5),a1
		add	d0,a1
		move.b	(a1)+,(a0)+
		move.b	(a1)+,(a0)+
		move.b	#$20,(a0)+
		move.l	_OldWsPtr(a5),a2
		lea	anim_Text,a1
		moveq	#5-1,d0
.wsanimcopy	move.b	(a1)+,(a0)+
		dbf	d0,.wsanimcopy
		lea	smpl_Title(a2),a1
		moveq	#30-5-1,d0
.wscopy		move.b	(a1)+,(a0)+
		dbeq	d0,.wscopy
		move.l	a3,a4
		bsr	AddSmplList
		bsr	GetInst
		move.l	smpl_Pointer(a4),inst_SmplPointer(a0)
		move.l	smpl_RepPointer(a4),inst_SmplRepPointer(a0)
		moveq	#0,d0
		move	smpl_Length(a4),d0
		move	d0,inst_SmplLength(a0)
		move	d0,inst_SmplEnd(a0)
		move	d0,inst_SmplRepLen(a0)
		move	d0,inst_SmplRepLength(a0)
		moveq	#0,d1
		move	_LoopSize(a5),d1
		lsr	#1,d1
		sub.l	d1,d0
		move	d0,inst_LooRepEnd(a0)
		move	d1,inst_LooLength(a0)
		move	d1,inst_LooLpStep(a0)
		move	#1,inst_LooTurns(a0)
		move	_WsMaxNum(a5),d0
		move.b	d0,inst_SmplNumber(a0)
		subq	#1,d0
		bpl.b	.okej
		clr	d0
.okej		move	d0,_WsNum(a5)
		bsr	InstSelec
		move.l	_OldInstPtr(a5),a0
		move.b	inst_EnvTraPhaFilBits(a0),d0
		move.b	d0,_OldStep1(a5)
		bclr	#TRANSFORMSTEP,d0
		beq.b	.clr1
		tst	inst_TraTurns(a0)
		beq.b	.clr1
		bset	#TRANSFORMSTEP,d0
.clr1		bclr	#PHASESTEP,d0
		beq.b	.clr2
		tst	inst_PhaTurns(a0)
		beq.b	.clr2
		bset	#PHASESTEP,d0
.clr2		bclr	#FILTERSTEP,d0
		beq.b	.clr3
		tst	inst_FilTurns(a0)
		beq.b	.clr3
		bset	#FILTERSTEP,d0
.clr3		move.b	d0,inst_EnvTraPhaFilBits(a0)
		move.b	inst_MixResLooBits(a0),d0
		move.b	d0,_OldStep2(a5)
		bclr	#MIXSTEP,d0
		beq.b	.clr4
		tst	inst_MixTurns(a0)
		beq.b	.clr4
		bset	#MIXSTEP,d0
.clr4		bclr	#RESONANCESTEP,d0
		beq.b	.clr5
		tst	inst_ResTurns(a0)
		beq.b	.clr5
		bset	#RESONANCESTEP,d0
.clr5		bclr	#LOOPSTEP,d0
		beq.b	.clr6
		tst	inst_LooTurns(a0)
		beq.b	.clr6
		bset	#LOOPSTEP,d0
.clr6		move.b	d0,inst_MixResLooBits(a0)
		bsr	GetSmpl
		lea	smpl_SampleData(a0),a1
		move.l	_ChannelPtr(a5),a4
		move.b	#1,ch_PartNote(a4)
		move.b	_OldInstNum+1(a5),ch_PartInst(a4)
		move	_AnimFrames(a5),_AnimCounter(a5)
.animloop	move.l	a1,-(sp)
		jsr	CheckInst
		jsr	PlayEffects
		move.l	(sp)+,a1
		move.l	_ChannelPtr(a5),a4
		clr.b	ch_PartNote(a4)
		clr.b	ch_PartInst(a4)
		move.l	ch_WsRepPointer(a4),a0
		move	ch_WsRepLength(a4),d0
		subq	#1,d0
.moveloop	move	(a0)+,(a1)+
		dbf	d0,.moveloop
		subq	#1,_AnimCounter(a5)
		bne.b	.animloop
		move.l	_OldInstPtr(a5),a0
		move.b	_OldStep1(a5),inst_EnvTraPhaFilBits(a0)
		move.b	_OldStep2(a5),inst_MixResLooBits(a0)
		bsr	Stopp
.exit		bclr	#2,_PlayBits(a5)
		clr	_BlockPlay(a5)
		rts

MakeTuneSmpl	move	#$0101,_BlockPlay(a5)
		bset	#2,_PlayBits(a5)
		bsr	Stoppa
		cmp	#255,_InstMaxNum(a5)
		beq	.exit

		bsr	GetInst
		move.l	a0,_OldInstPtr(a5)

		bsr	GetSmpl
		move.l	a0,_OldWsPtr(a5)

		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	DoHexReturn
		move.l	#inst_SIZEOF,d0
		move.l	#MEMF_ANY!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,d7
		beq	.exit
		bsr	RemInstList
		lea	_InstListView(a5),a0
		move.l	d7,a1
		ADDTAIL
		move	#256*2,inst_PhaStart(a1)
		move	#256*2,inst_PhaRepeat(a1)
		move	#256*2,inst_PhaRepEnd(a1)
		move	#1,inst_EnvAttLen(a1)
		move	#1,inst_EnvDecLen(a1)
		move	#1,inst_EnvSusLen(a1)
		move	#1,inst_EnvRelLen(a1)
		move.b	#1,inst_ArpSpeed(a1)
		move.b	#-1,inst_Transpose(a1)
		lea	inst_NameStr(a1),a0
		move.l	a0,inst_Name(a1)
		move.l	_OldInstPtr(a5),a2
		move	inst_Volume(a2),inst_Volume(a1)
		move	inst_FineTune(a2),inst_FineTune(a1)
		move	inst_SemiTone(a2),inst_SemiTone(a1)
		move.b	inst_Transpose(a2),inst_Transpose(a1)
		move.b	inst_SlideSpeed(a2),inst_SlideSpeed(a1)

		lea	inst_NameStr(a2),a2
		moveq	#33-1,d0
.copy		move.b	(a2)+,(a0)+
		dbf	d0,.copy

		addq	#1,_InstMaxNum(a5)
		move	_InstMaxNum(a5),d0
		move	_InstNum(a5),_OldInstNum(a5)
		move	d0,_InstNum(a5)
		add	d0,d0
		lea	_AscIIHexTab(a5),a0
		move.b	(a0,d0.w),inst_NameStr(a1)
		move.b	1(a0,d0.w),inst_NameStr+1(a1)
		add	d0,d0
		lea	_InstPtrs(a5),a0
		move.l	d7,(a0,d0.w)
		bsr	AddInstList

		addq.b	#1,_WsMaxNum+1(a5)
		bcc.b	.okey
		move	#255,_WsMaxNum(a5)
		bra	.exit
.okey
		move	_MixLength(a5),d0
		mulu	_AnimFrames(a5),d0
		move.l	d0,d5
		add.l	#smpl_SampleData,d0
.allocmem	move.l	#MEMF_CHIP!MEMF_CLEAR,d1
		CallSys AllocMem
		move.l	d0,d7
		beq	.exit
		bsr	RemSmplList
		lea	_SmplListView(a5),a0
		move.l	d7,a1
		move.l	d7,a3
		ADDTAIL
		lsr.l	#1,d5
		move	d5,smpl_Length(a3)
		lea	smpl_SampleData(a3),a0
		move.l	a0,smpl_Pointer(a3)
		move.l	a0,smpl_RepPointer(a3)
		lea	smpl_NameStr(a3),a0
		move.l	a0,smpl_Name(a3)
		lea	_WsPtrs(a5),a1
		move	_WsMaxNum(a5),d1
		add	d1,d1
		add	d1,d1
		move.l	a3,(a1,d1.w)
		move	_WsMaxNum(a5),d0
		add	d0,d0
		lea	_AscIIHexTab(a5),a1
		add	d0,a1
		move.b	(a1)+,(a0)+
		move.b	(a1)+,(a0)+
		move.b	#$20,(a0)+
		move.l	_OldWsPtr(a5),a2
		lea	anim_Text,a1
		moveq	#5-1,d0
.wsanimcopy	move.b	(a1)+,(a0)+
		dbf	d0,.wsanimcopy
		lea	smpl_Title(a2),a1
		moveq	#30-5-1,d0
.wscopy		move.b	(a1)+,(a0)+
		dbeq	d0,.wscopy
		move.l	a3,a4
		bsr	AddSmplList
		bsr	GetInst
		move.l	smpl_Pointer(a4),inst_SmplPointer(a0)
		move.l	smpl_RepPointer(a4),inst_SmplRepPointer(a0)
		moveq	#0,d0
		move	smpl_Length(a4),d0
		move	d0,inst_SmplLength(a0)
		move	d0,inst_SmplEnd(a0)
		move	d0,inst_SmplRepLen(a0)
		move	d0,inst_SmplRepLength(a0)

		move	_WsMaxNum(a5),d0
		move.b	d0,inst_SmplNumber(a0)
		subq	#1,d0
		bpl.b	.okej
		clr	d0
.okej		move	d0,_WsNum(a5)
		bsr	InstSelec

		bsr	GetTune
		move	tune_Volume(a0),d0
		lsl	#4,d0
		move	d0,_MasterVol(a5)
		moveq	#0,d0
		lea	Channel1Buf,a4
		bsr.b	.initchannel
		moveq	#1,d0
		lea	Channel2Buf,a4
		bsr.b	.initchannel
		moveq	#2,d0
		lea	Channel3Buf,a4
		bsr.b	.initchannel
		moveq	#3,d0
		lea	Channel4Buf,a4
		bsr.b	.initchannel
		moveq	#4,d0
		lea	Channel5Buf,a4
		bsr.b	.initchannel
		moveq	#5,d0
		lea	Channel6Buf,a4
		bsr.b	.initchannel
		moveq	#6,d0
		lea	Channel7Buf,a4
		bsr.b	.initchannel
		moveq	#7,d0
		lea	Channel8Buf,a4
		bsr.b	.initchannel
		bra.b	.initplay

.initchannel	btst	d0,_ChannelsOn(a5)
		seq.b	ch_ChannelOff(a4)
		move	#64*16,ch_CVolume(a4)
		move.b	tune_Speed(a0),_TuneSpd(a5)
		move.b	_TuneSpd(a5),ch_Spd(a4)
		move.b	tune_Groove(a0),_TuneGrv(a5)
		move.b	_TuneGrv(a5),ch_Grv(a4)
		beq.b	.skip
		not.b	ch_PartGrv(a4)
.skip		move.b	#1,ch_SpdCnt(a4)
		move	#-1,ch_PchSldToNote(a4)
		rts

.initplay	move	#64,_Ch1Volume(a5)
		move	#64,_Ch2Volume(a5)
		move	#64,_Ch3Volume(a5)
		move	#64,_Ch4Volume(a5)
		clr	_DmaSave(a5)

		bsr	GetTune
		move	tune_Tempo(a0),_TuneTmp(a5)
		clr	_DoubleBuf(a5)
		move	#126,d0
		move	d0,_MixPeriod(a5)
		move	d0,d1
		mulu	#32768,d1
		move.l	d1,_PeriodValue(a5)
		move.l	_TimerValue2(a5),d1
		divu	d0,d1
		mulu	#125,d1
		move	_TuneTmp(a5),d2
		mulu	#50,d2
		divu	d2,d1
		bclr	#0,d1
		move	d1,_MixLength(a5)

		bsr	GetSmpl
		lea	smpl_SampleData(a0),a1
		move	_AnimFrames(a5),_AnimCounter(a5)
		move.b	_PlayMode(a5),_OldStep1(a5)
		move.b	#1,_PlayMode(a5)
.animloop	move.l	a1,-(sp)
		jsr	PlayTune
		jsr	PlayEffects
		jsr	PerCalc
		jsr	PerVolPlay
		jsr	DmaPlay
		move.l	(sp)+,a1
		move.l	_SndFBuf(a5),a0
		move	_MixLength(a5),d0
		lsr	#1,d0
		subq	#1,d0
.moveloop	move	(a0)+,(a1)+
		dbf	d0,.moveloop
		subq	#1,_AnimCounter(a5)
		bne.b	.animloop
		move.b	_OldStep1(a5),_PlayMode(a5)
		bsr	Stopp
.exit		bclr	#2,_PlayBits(a5)
		clr	_BlockPlay(a5)
		rts

* Twins/PHA *****************************************************************
* Toggle part/voices                                  Last Change: 92-10-24 *
*****************************************************************************

TogglePart	tst.b	_TunePart(a5)
		beq.b	.exit
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		btst	#7,_MarkEd(a5)
		bne.b	TogglePartMark
		eor.b	#3,_TunePart(a5)
		cmp.b	#1,_TunePart(a5)
		beq.b	.tune
		jsr	SetFont7
		lea	TuneEditorDefs,a4
		bsr	CursorClear
		jsr	SetFont8
		bsr	GetTunePartNum
		rts
.tune		jsr	SetFont8
		lea	PartEditorDefs,a4
		bsr	CursorClear
		jsr	SetFont7
		lea	TuneEditorDefs,a4
		bsr	PaintCursor
.exit		rts

TogglePartMark	eor.b	#3,_TunePart(a5)
		cmp.b	#1,_TunePart(a5)
		beq.b	.tune
		lea	TuneMarkEdDefs,a4
		bsr	MarkClear
		lea	TuneEditorDefs,a4
		jsr	PrintTune
		jsr	SetFont8
		bsr.b	GetTunePartNum
		bclr	#7,_MarkEd(a5)
		rts
.tune		lea	PartMarkEdDefs,a4
		bsr	MarkClear
		lea	PartEditorDefs,a4
		jsr	PrintPart
		jsr	SetFont7
		lea	TuneEditorDefs,a4
		bsr	PaintCursor
		bclr	#7,_MarkEd(a5)
		rts

GetTunePartNum	move	_Qualifier(a5),d1
		btst	#IEQUALIFIERB_LSHIFT,d1
		beq.b	.rshift
		bra.b	.getpart
.rshift		btst	#IEQUALIFIERB_RSHIFT,d1
		beq.b	.part
.getpart	move.l	DataPtr(a4),a0
		moveq	#0,d1
		move	CursorXPos(a4),d1
		divu	#5,d1
		lsl	#2,d1
		lea	tune_Ch1Ptr(a0),a0
		move.l	(a0,d1.w),a1
		move	MinYPos(a4),d7
		add	CursorYPos(a4),d7
		add	d7,d7
		move	(a1,d7.w),d7
		btst	#5,d7
		bne.b	.part
		lsr.b	#6,d7
		move.b	d7,d0
		lsl	#8,d0
		lsr	#8,d7
		or.b	d7,d0
		move	d0,_PartNum(a5)
		jsr	PrintPartNum
		jsr	UpdateParts
.part		lea	PartEditorDefs,a4
		bra	PaintCursor

ExitTunePart	move.l	_RastPort1(a5),d6
		btst	#7,_MarkEd(a5)
		bne.b	ExitMarkTunePart
		cmp.b	#1,_TunePart(a5)
		bne.b	.part
		jsr	SetFont7
		clr.b	_TunePart(a5)
		lea	TuneEditorDefs,a4
		bra	CursorClear
.part		cmp.b	#2,_TunePart(a5)
		bne.b	.exit
		jsr	SetFont8
		clr.b	_TunePart(a5)
		lea	PartEditorDefs,a4
		bra	CursorClear
.exit		rts
ExitMarkTunePart
		btst	#7,_MarkEd(a5)
		bne.b	.ok
.exit		rts
.ok		cmp.b	#1,_TunePart(a5)
		bne.b	.part
		lea	TuneMarkEdDefs,a4
		bsr	MarkClear
		move.b	#1,_StepArrowClear(a5)
		jsr	StepArrowMark
		lea	TuneEditorDefs,a4
		jsr	PrintTune
		jsr	StepArrow
		clr.b	_TunePart(a5)
		bclr	#7,_MarkEd(a5)
		rts

.part		cmp.b	#2,_TunePart(a5)
		bne.b	.exit
		lea	PartMarkEdDefs,a4
		bsr	MarkClear
		move.b	#1,_PartArrowClear(a5)
		jsr	PartArrowMark
		lea	PartEditorDefs,a4
		jsr	PrintPart
		jsr	PartArrow
		clr.b	_TunePart(a5)
		bclr	#7,_MarkEd(a5)
		rts

ExitArpg	move.l	_RastPort2(a5),d6
		btst	#3,_MarkEd(a5)
		bne.b	.ExitMarkArpg
		tst.b	_Arpg(a5)
		beq.b	.exit
		lea	ArpgEditorDefs,a4
		move.l	_GfxBase(a5),a6
		clr.b	_Arpg(a5)
		bra	CursorClear
.ExitMarkArpg	btst	#3,_MarkEd(a5)
		bne.b	.ok
.exit		rts
.ok		lea	ArpgMarkEdDefs,a4
		move.l	_GfxBase(a5),a6
		bsr	MarkClear
		lea	ArpgEditorDefs,a4
		jsr	PrintArpg
		bclr	#3,_MarkEd(a5)
		clr.b	_Arpg(a5)
		rts

* Twins/PHA *****************************************************************
* Part gadget                                         Last Change: 92-10-24 *
*****************************************************************************

PartGad		cmp.l	#IDCMP_GADGETUP,d0
		beq	PartGadExit
		move	im_MouseX(a4),d4
		move	im_MouseY(a4),d5
		tst	_HexNumEd1(a5)
		beq.b	.okej
		move	d4,-(sp)
		move	d5,-(sp)
		bsr	DoHexReturn
		move	(sp)+,d5
		move	(sp)+,d4
.okej		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ExitArpg
		move.l	_RastPort1(a5),d6
		cmp.b	#2,_TunePart(a5)
		beq.b	.part
		cmp.b	#1,_TunePart(a5)
		beq.b	.tune
		jsr	SetFont8
		lea	PartEditorDefs,a4
		bsr	PlaceCursor
		move.b	#2,_TunePart(a5)
		bra.b	PartGadExit
.tune		move	d4,-(sp)
		move	d5,-(sp)
		bsr	ExitTunePart
		move	(sp)+,d5
		move	(sp)+,d4
		jsr	SetFont8
		lea	PartEditorDefs,a4
		move.b	#1,_PlaceCursorAlwaysPrint(a5)
		bsr	PlaceCursor
		move.b	#2,_TunePart(a5)
		bra.b	PartGadExit
.part		btst	#7,_MarkEd(a5)
		beq.b	.normal
		lea	PartMarkEdDefs,a4
		bsr	MarkSave
		bsr	PlaceMark
		bra.b	PartGadExit
.normal		jsr	SetFont8
		lea	PartEditorDefs,a4
		bsr	CursorClear
		move.b	#1,_PlaceCursorAlwaysPrint(a5)
		bsr.b	PlaceCursor
PartGadExit	rts

ArpgGadget	cmp.l	#IDCMP_GADGETUP,d0
		beq.b	.exit
		move	im_MouseX(a4),d4
		move	im_MouseY(a4),d5
		tst	_HexNumEd2(a5)
		beq.b	.ok
		move	d4,-(sp)
		move	d5,-(sp)
		bsr	DoHexReturn
		move	(sp)+,d5
		move	(sp)+,d4
.ok		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		bsr	ExitTunePart
		move.l	_RastPort2(a5),d6
		lea	ArpgEditorDefs,a4
		tst.b	_Arpg(a5)
		beq.b	.arpg
		bsr	CursorClear
.arpg		move.b	#$ff,_Arpg(a5)
		move.b	#1,_PlaceCursorAlwaysPrint(a5)
		bsr.b	PlaceCursor
.exit		rts

_PlaceCursorAlwaysPrint	rs.b	1
			rs.b	1

PlaceCursor	lea	XPositions+2(a4),a3
		sub	Y1Pos(a4),d5
		bpl.b	.notlower
		moveq	#0,d5
.notlower	ext.l	d5
		divu	ScrollNum(a4),d5
		cmp	NumYPos(a4),d5
		ble.b	.nothigher
		move	NumYPos(a4),d5
.nothigher	move	d5,CursorYPos(a4)
		move	NumXPos(a4),d7
		subq	#1,d7
		moveq	#0,d5
.loop		cmp	(a3)+,d4
		blo.b	.ok
		addq	#1,d5
		dbf	d7,.loop
.ok		move	d5,CursorXPos(a4)

		tst.b	_PlaceCursorAlwaysPrint(a5)
		bne.b	.ok1
		cmp.b	#1,_TunePart(a5)
		blo.b	.ok1
		bhi.b	.part1

.tune1		tst.b	_PlayTune(a5)
		beq.b	.ok
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.skip
		bra.b	.ok1

.part1		tst.b	_PlayTune(a5)
		beq.b	.testpart
		tst.b	_FollowChannel(a5)
		beq.b	.ok1
		bra.b	.testscroll

.testpart	tst.b	_PlayPart(a5)
		beq.b	.ok1

.testscroll	tst.b	_ScrollPart(a5)
		beq.b	.ok1
		cmp.b	#2,_ScrollPart(a5)
		bne.b	.skip

.ok1		clr.b	_PlaceCursorAlwaysPrint(a5)
		bra	PaintCursor
.skip		rts

PlaceMark	move.l	MarkStartPtr(a4),a3
		addq	#2,a3
		sub	Y1Pos(a4),d5
		bpl.b	.notlower
		moveq	#0,d5
.notlower	ext.l	d5
		divu	ScrollNum(a4),d5
		cmp	NumYPos(a4),d5
		ble.b	.nothigher
		move	NumYPos(a4),d5
.nothigher	move	d5,CursorYPos(a4)
		move	NumXPos(a4),d7
		subq	#1,d7
		moveq	#0,d5
.loop		cmp	(a3)+,d4
		blo.b	.ok
		addq	#1,d5
		dbf	d7,.loop
.ok		move	d5,CursorXPos(a4)
		bra	MarkDraw

* Twins/PHA *****************************************************************
* Voice gadgets                                       Last Change: 92-10-24 *
*****************************************************************************

TuneGad		cmp.l	#IDCMP_GADGETUP,d0
		beq	TuneGadExit
		move	im_MouseX(a4),d4
		move	im_MouseY(a4),d5
		tst	_HexNumEd1(a5)
		beq.b	.okej
		movem	d4/d5,-(sp)
		bsr	DoHexReturn
		movem	(sp)+,d4/d5
.okej		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		bsr	ExitArpg
		move.l	_RastPort1(a5),d6
		cmp.b	#2,_TunePart(a5)
		beq.b	.part
		cmp.b	#1,_TunePart(a5)
		beq.b	.tune
		jsr	SetFont7
		lea	TuneEditorDefs,a4
		bsr	PlaceCursor
		move.b	#1,_TunePart(a5)
		bsr	SetChannel
		jsr	StepArrow
		bra.b	TuneGadExit
.tune		btst	#7,_MarkEd(a5)
		beq.b	.norm
		lea	TuneMarkEdDefs,a4
		bsr	MarkSave
		jsr	StepArrowMark
		bsr	PlaceMark
		bra.b	TuneGadExit
.norm		jsr	SetFont7
		lea	TuneEditorDefs,a4
		bsr	CursorClear
		move.b	#1,_PlaceCursorAlwaysPrint(a5)
		bsr	PlaceCursor
		bsr	SetChannel
		jsr	StepArrow
		bra.b	TuneGadExit
.part		movem	d4/d5,-(sp)
		bsr	ExitTunePart
		jsr	SetFont7
		movem	(sp)+,d4/d5
		lea	TuneEditorDefs,a4
		move.b	#1,_PlaceCursorAlwaysPrint(a5)
		bsr	PlaceCursor
		move.b	#1,_TunePart(a5)
		bsr	SetChannel
		jsr	StepArrow
TuneGadExit	rts

* Twins/PHA *****************************************************************
* Part/voices command gadgets                         Last Change: 92-10-24 *
*****************************************************************************

SetArpJump	tst	_HexNumEd2(a5)
		bne.b	.exit
		tst	_ArpEdOnOff(a5)
		beq.b	.exit
		tst.b	_Arpg(a5)
		beq.b	.exit
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		lea	ArpgEditorDefs,a4
		tst	CursorXPos(a4)
		bne.b	.exit
		move.l	_KeybListPtr(a5),a2
		addq	#3,a2
		add	_KeybListSize1(a5),a2
		bra	ArpgEnd
.exit		rts

SetArpEnd	tst	_HexNumEd2(a5)
		bne.b	.exit
		tst	_ArpEdOnOff(a5)
		beq.b	.exit
		tst.b	_Arpg(a5)
		beq.b	.exit
		move.l	_GfxBase(a5),a6
		move.l	_RastPort2(a5),d6
		lea	ArpgEditorDefs,a4
		tst	CursorXPos(a4)
		bne.b	.exit
		move.l	_KeybListPtr(a5),a2
		addq	#2,a2
		add	_KeybListSize1(a5),a2
		bra	ArpgEnd
.exit		rts

* Twins/PHA *****************************************************************
* Checkbox gadgets                                    Last Change: 92-10-24 *
*****************************************************************************

_TrnOnOff	rs.b	1
_TunOnOff	rs.b	1

Envelope	tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#ADSR,inst_Effects1(a0)
.exit		rts

Vibrato		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#VIBRATO,inst_Effects1(a0)
.exit		rts

Tremolo		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#TREMOLO,inst_Effects1(a0)
.exit		rts

Arpeggio	tst	_InstNum(a5)
		beq	.exit
		bsr	GetInst
		bchg	#ARPEGGIO,inst_Effects1(a0)
		move	_InstNum(a5),d0
		lea	Channel1Buf,a0
		cmp.b	ch_PartInst(a0),d0
		bne.b	.skip
		clr.b	ch_Arp(a0)
.skip		lea	Channel2Buf,a0
		cmp.b	ch_PartInst(a0),d0
		bne.b	.skip1
		clr.b	ch_Arp(a0)
.skip1		lea	Channel3Buf,a0
		cmp.b	ch_PartInst(a0),d0
		bne.b	.skip2
		clr.b	ch_Arp(a0)
.skip2		lea	Channel4Buf,a0
		cmp.b	ch_PartInst(a0),d0
		bne.b	.skip3
		clr.b	ch_Arp(a0)
.skip3		lea	Channel5Buf,a0
		cmp.b	ch_PartInst(a0),d0
		bne.b	.skip4
		clr.b	ch_Arp(a0)
.skip4		lea	Channel6Buf,a0
		cmp.b	ch_PartInst(a0),d0
		bne.b	.skip5
		clr.b	ch_Arp(a0)
.skip5		lea	Channel7Buf,a0
		cmp.b	ch_PartInst(a0),d0
		bne.b	.skip6
		clr.b	ch_Arp(a0)
.skip6		lea	Channel8Buf,a0
		cmp.b	ch_PartInst(a0),d0
		bne.b	.exit
		clr.b	ch_Arp(a0)
.exit		bra	ClrArpgWait

Transform	tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#TRANSFORM,inst_Effects2(a0)
.exit		rts

;;Decrypt_ID2	dc.l	(Decrypt_ID2_EQU&$00000007)<<(7*4+1)!(Decrypt_ID2_EQU&$fffffff8)>>3
;;ID2_Offset	equ	Decrypt_ID2-Main

Phase		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#PHASE,inst_Effects2(a0)
.exit		rts

Mix		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#MIX,inst_Effects2(a0)
.exit		rts

Resonance	tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#RESONANCE,inst_Effects2(a0)
.exit		rts

Filter		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#FILTER,inst_Effects2(a0)
.exit		rts

Loop		tst	_InstNum(a5)
		beq.b	.exit
		bsr	GetInst
		bchg	#LOOP,inst_Effects1(a0)
.exit		rts

* Twins/PHA *****************************************************************
* Voice Editor                                        Last Change: 92-10-24 *
*****************************************************************************
* d0 <= im_Code                                                             *
* d6 <= RastPort                                                            *
* a4 <= Message                                                             *
* a6 <= GfxBase                                                             *

VoiceEditor	move	d0,-(sp)
		jsr	SetFont7
		move	(sp)+,d0
		move	im_Qualifier(a4),d1
		lea	TuneEditorDefs,a4
		btst	#IEQUALIFIERB_LSHIFT,d1
		bne.b	.shift
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.shift
		tst.b	_PlayTune(a5)
		beq.b	.noplay1
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.play1
.noplay1	cmp.b	#CURSORUP,d0
		beq.b	VoiceUp
		cmp.b	#CURSORDOWN,d0
		beq.b	VoiceDown
.play1		cmp.b	#CURSORLEFT,d0
		beq.b	VoiceLeft
		cmp.b	#CURSORRIGHT,d0
		beq.b	VoiceRight
		tst	_EditOnOff(a5)
		bne	EditVoice
		bra.b	VoiceExit
.shift		tst.b	_PlayTune(a5)
		beq.b	.noplay2
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.play2
.noplay2	cmp.b	#CURSORUP,d0
		beq.b	VoiceShiftUp
		cmp.b	#CURSORDOWN,d0
		beq	VoiceShiftDown
.play2		cmp.b	#CURSORLEFT,d0
		beq	VoiceShiftLeft
		cmp.b	#CURSORRIGHT,d0
		beq	VoiceShiftRight
		tst	_EditOnOff(a5)
		bne	EditVoice
VoiceExit	rts

VoiceUp		bsr	CursorSave
		bsr	CursorUpScroll
		bsr	CursorDraw
		jmp	StepArrow

VoiceDown	bsr	CursorSave
		bsr	CursorDownScroll
		bsr	CursorDraw
		jmp	StepArrow

VoiceLeft	bsr	CursorSave
		bsr	CursorLeft
		bsr	CursorDraw
		bsr	SetChannel
		jmp	StepArrow

VoiceRight	bsr	CursorSave
		bsr	CursorRight
		bsr	CursorDraw
		bsr	SetChannel
		jmp	StepArrow

VoiceShiftUp	move.b	#1,_StepArrowClear(a5)
		jsr	StepArrow
		bsr	CursorSave
		bsr	CursorUpShift
		bsr	CursorDraw
		jmp	StepArrow

VoiceShiftDown	move.b	#1,_StepArrowClear(a5)
		jsr	StepArrow
		bsr	CursorSave
		bsr	CursorDownShift
		bsr	CursorDraw
		jmp	StepArrow

VoiceShiftLeft	bsr	CursorSave
		bsr	CursorLeftShiftTune
		bsr	CursorDraw
		jmp	StepArrow

VoiceShiftRight	bsr	CursorSave
		bsr	CursorRightShiftTune
		bsr	CursorDraw
		jmp	StepArrow

* Twins/PHA *****************************************************************
* Part Editor                                         Last Change: 92-10-24 *
*****************************************************************************
* d0 <= im_Code                                                             *
* d6 <= RastPort                                                            *
* a4 <= Message                                                             *
* a6 <= GfxBase                                                             *

PartEditor	move	d0,-(sp)
		jsr	SetFont8
		move	(sp)+,d0
		move	im_Qualifier(a4),d1
		lea	PartEditorDefs,a4
		jsr	GetPartPtr
		btst	#IEQUALIFIERB_LSHIFT,d1
		bne.b	.shift
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.shift
		tst.b	_ScrollPart(a5)
		beq.b	.ok1
		cmp.b	#2,_ScrollPart(a5)		Scroll Seq
		beq.b	.ok1
		tst.b	_PlayTune(a5)
		beq.b	.testpart1
		tst.b	_FollowChannel(a5)
		bne.b	.do1
.testpart1	tst.b	_PlayPart(a5)
		bne.b	.do1
.ok1		cmp.b	#CURSORUP,d0
		beq.b	PartUp
		cmp.b	#CURSORDOWN,d0
		beq.b	PartDown
.do1		cmp.b	#CURSORLEFT,d0
		beq	PartLeft
		cmp.b	#CURSORRIGHT,d0
		beq	PartRight
		tst	_EditOnOff(a5)
		bne	EditPart
		rts
.shift		tst.b	_ScrollPart(a5)
		beq.b	.ok2
		cmp.b	#2,_ScrollPart(a5)		Scroll Seq
		beq.b	.ok2
		tst.b	_PlayTune(a5)
		beq.b	.testpart2
		tst.b	_FollowChannel(a5)
		bne.b	.do2
.testpart2	tst.b	_PlayPart(a5)
		bne.b	.do2
.ok2		cmp.b	#CURSORUP,d0
		beq.b	PartShiftUp
		cmp.b	#CURSORDOWN,d0
		beq	PartShiftDown
.do2		cmp.b	#CURSORLEFT,d0
		beq.b	PartLeft
		cmp.b	#CURSORRIGHT,d0
		beq.b	PartRight
		tst	_EditOnOff(a5)
		bne	EditPart
.exit		rts

PartUp		move.b	#1,_PartArrowClear(a5)
		jsr	PartArrow
		bsr	CursorSave
		bsr	CursorUpScroll
		bsr	CursorDraw
		jmp	PartArrow

PartDown	move.b	#1,_PartArrowClear(a5)
		jsr	PartArrow
		bsr	CursorSave
		bsr	CursorDownScroll
		bsr	CursorDraw
		jmp	PartArrow

PartLeft	jsr	CursorSave
		bsr	CursorLeft
		bra	CursorDraw

PartRight	jsr	CursorSave
		bsr	CursorRight
		bra	CursorDraw

PartShiftUp	move.b	#1,_PartArrowClear(a5)
		jsr	PartArrow
		bsr	CursorSave
		bsr	CursorUpShift
		bsr	CursorDraw
		jmp	PartArrow

PartShiftDown	move.b	#1,_PartArrowClear(a5)
		jsr	PartArrow
		bsr	CursorSave
		bsr	CursorDownShift
		bsr	CursorDraw
		jmp	PartArrow

ArpgEditor	move	d0,-(sp)
		jsr	SetFont8
		move	(sp)+,d0
		move	im_Qualifier(a4),d1
		lea	ArpgEditorDefs,a4
		jsr	GetArpgPtr
		btst	#IEQUALIFIERB_LSHIFT,d1
		bne.b	.shift
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.shift
		cmp.b	#CURSORUP,d0
		beq.b	ArpgUp
		cmp.b	#CURSORDOWN,d0
		beq.b	ArpgDown
		cmp.b	#CURSORLEFT,d0
		beq.b	ArpgLeft
		cmp.b	#CURSORRIGHT,d0
		beq.b	ArpgRight
		tst	_ArpEdOnOff(a5)
		bne	EditArpg
		rts
.shift		cmp.b	#CURSORUP,d0
		beq.b	ArpgShiftUp
		cmp.b	#CURSORDOWN,d0
		beq.b	ArpgShiftDown
		cmp.b	#CURSORLEFT,d0
		beq.b	ArpgLeft
		cmp.b	#CURSORRIGHT,d0
		beq.b	ArpgRight
		tst	_ArpEdOnOff(a5)
		bne	EditArpg
		rts

ArpgUp		bsr.b	CursorSave
		bsr	CursorUpScroll
		bra.b	CursorDraw

ArpgDown	bsr.b	CursorSave
		bsr	CursorDownScroll
		bra.b	CursorDraw

ArpgLeft	bsr.b	CursorSave
		bsr	CursorLeft
		bra.b	CursorDraw

ArpgRight	bsr.b	CursorSave
		bsr	CursorRight
		bra.b	CursorDraw

ArpgShiftUp	bsr.b	CursorSave
		bsr	CursorUpShift
		bra.b	CursorDraw

ArpgShiftDown	bsr.b	CursorSave
		bsr	CursorDownShift
		bra.b	CursorDraw

* Twins/PHA *****************************************************************
* Cursor routines                                     Last Change: 92-10-24 *
*****************************************************************************
* d6 <= RastPort                                                            *
* a4 <= Tune/Part/ArpgData                                                  *
* a6 <= GfxBase                                                             *

_CursorXPos	rs.w	1
_CursorYPos	rs.w	1

CursorClear	bsr.b	CursorSave
		bra.b	ClearCursor

CursorSave	move	CursorXPos(a4),_CursorXPos(a5)
		move	CursorYPos(a4),_CursorYPos(a5)
		rts

CursorDraw	move	_CursorXPos(a5),d0
		cmp	CursorXPos(a4),d0
		bne.b	.cursordraw
		move	_CursorYPos(a5),d0
		cmp	CursorYPos(a4),d0
		bne.b	.cursordraw
		rts
.cursordraw	bsr.b	ClearCursor
		bra.b	PaintCursor

ClearCursor	moveq	#0,d0
		move.l	d6,a1
		CallLib SetAPen
		move	#RP_JAM1,d0
		move.l	d6,a1
		CallLib SetDrMd
		jsr	MaskBit0
		lea	XPositions(a4),a0
		move	_CursorXPos(a5),d0
		add	d0,d0
		move	(a0,d0.w),d0
		move	_CursorYPos(a5),d1
		mulu	ScrollNum(a4),d1
		add	Y1CharPos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#1,d0
		lea	_String(a5),a0
		move.b	#$83,(a0)
		move.l	d6,a1
		CallLib Text
		rts

PaintCursor	moveq	#2,d0
		move.l	d6,a1
		CallLib SetAPen
		move	#RP_JAM1,d0
		move.l	d6,a1
		CallLib SetDrMd
		jsr	MaskBit0
		lea	XPositions(a4),a0
		move	CursorXPos(a4),d0
		add	d0,d0
		move	(a0,d0.w),d0
		move	CursorYPos(a4),d1
		mulu	ScrollNum(a4),d1
		add	Y1CharPos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#1,d0
		lea	_String(a5),a0
		move.b	#$83,(a0)
		move.l	d6,a1
		CallLib Text
		rts

CursorUpScroll	jsr	NormalDrawMode0
		move	CursorYPos(a4),d0
		cmp	ScrollUpPos(a4),d0
		ble.b	.scroll
.noscroll	subq	#1,CursorYPos(a4)
		bge.b	.exit
		clr	CursorYPos(a4)
.exit		rts
.scroll		subq	#1,MinYPos(a4)
		bge.b	.scrolla
		clr	MinYPos(a4)
		bra	.noscroll
.scrolla	lea	X1Pos(a4),a0
		movem	(a0)+,d2-d5
		move	d2,d0
		move	d3,d1
		add	ScrollNum(a4),d3
		move.l	d6,a0
		move.l	a0,a1
		move.l	d6,d7
		move	#$c0,d6
		CallLib ClipBlit
		move.l	d7,d6
		move	NumYPos(a4),-(sp)
		clr	NumYPos(a4)
		move.l	PrintPtr(a4),a0
		jsr	(a0)
		move	(sp)+,NumYPos(a4)
		rts
CursorDownScroll
		jsr	NormalDrawMode0
		move	CursorYPos(a4),d0
		cmp	ScrollDownPos(a4),d0
		bge.b	.scroll
.noscroll	addq	#1,CursorYPos(a4)
		move	NumYPos(a4),d0
		cmp	CursorYPos(a4),d0
		bge.b	.exit
		move	d0,CursorYPos(a4)
.exit		rts
.scroll		addq	#1,MinYPos(a4)
		move	MinYPos(a4),d0
		move	MaxYPos(a4),d1
		sub	NumYPos(a4),d1
		cmp	d1,d0
		ble.b	.scrolla
		move	d1,MinYPos(a4)
		bra	.noscroll
.scrolla	lea	X1Pos(a4),a0
		movem	(a0)+,d2-d5
		move	d2,d0
		move	d3,d1
		add	ScrollNum(a4),d1
		move.l	d6,a0
		move.l	a0,a1
		move.l	d6,d7
		move	#$c0,d6
		CallLib ClipBlit
		move.l	d7,d6
		move	Y1CharPos(a4),d0
		move	d0,-(sp)
		move	NumYPos(a4),d1
		mulu	ScrollNum(a4),d1
		add	d1,d0
		move	d0,Y1CharPos(a4)
		move	MinYPos(a4),d0
		move	d0,-(sp)
		add	NumYPos(a4),d0
		move	d0,MinYPos(a4)
		move	NumYPos(a4),-(sp)
		clr	NumYPos(a4)
		move.l	PrintPtr(a4),a0
		jsr	(a0)
		move	(sp)+,NumYPos(a4)
		move	(sp)+,MinYPos(a4)
		move	(sp)+,Y1CharPos(a4)
		rts

CursorLeft	subq	#1,CursorXPos(a4)
		bge.b	.exit
		move	NumXPos(a4),CursorXPos(a4)
.exit		rts

CursorRight	addq	#1,CursorXPos(a4)
		move	CursorXPos(a4),d0
		cmp	NumXPos(a4),d0
		ble.b	.exit
		clr	CursorXPos(a4)
.exit		rts

CursorUpShift	tst	MinYPos(a4)
		bne.b	.next
		clr	CursorYPos(a4)
		rts
.next		move	NumYPos(a4),d0
		addq	#1,d0
		sub	d0,MinYPos(a4)
		bge.b	.jump
		clr	MinYPos(a4)
.jump		move.l	PrintPtr(a4),a0
		jsr	(a0)
		rts

CursorDownShift	move	MinYPos(a4),d0
		move	MaxYPos(a4),d1
		sub	NumYPos(a4),d1
		cmp	d1,d0
		bne.b	.next
		move	NumYPos(a4),CursorYPos(a4)
		rts
.next		move	NumYPos(a4),d0
		addq	#1,d0
		add	d0,MinYPos(a4)
		move	MinYPos(a4),d0
		cmp	d1,d0
		ble.b	.jump
		move	d1,MinYPos(a4)
.jump		move.l	PrintPtr(a4),a0
		jsr	(a0)
		rts

CursorLeftShiftTune
		subq	#5,CursorXPos(a4)
		bge.b	.nowrap
		move	NumXPos(a4),d0
		addq	#1,d0
		add	d0,CursorXPos(a4)
.nowrap		bra.b	SetChannel
		rts

CursorRightShiftTune
		addq	#5,CursorXPos(a4)
		move	NumXPos(a4),d0
		cmp	CursorXPos(a4),d0
		bge.b	.nowrap
		addq	#1,d0
		sub	d0,CursorXPos(a4)
.nowrap		bra.b	SetChannel
		rts

_ChannelLinePos		rs.w	2
_ChannelLineXPos	rs.w	1

SetChannel	movem.l	d0-a6,-(sp)
		lea	TuneEditorDefs,a4
		lea	ChannelPointers,a0
		moveq	#0,d0
		move	CursorXPos(a4),d0
		divu	#5,d0
		lsl	#2,d0
		move.l	(a0,d0.w),_ChannelPtr(a5)

		lea	_ChannelLinePos(a5),a2
		move	d0,(a2)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		jsr	NormalDrawMode1

.drawlines	lea	ChannelLinesList,a3
		move	(a2),d2				New ChannelLinePos
		add	d2,d2
		add	d2,a3
		move	d2,d3
		move	(a3)+,d0			Xcoord
		subq	#2,d0
		cmp	_ChannelLineXPos(a5),d0
		beq.b	.end
		bsr.b	.clearlines
		move	d0,_ChannelLineXPos(a5)
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Move
		move	d3,2(a2)			Update Old ChannelLinePos
		jsr	SetAPenCol2
		move	(a3)+,d0			Xcoord
		subq	#2,d0
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Draw
		move	(a3)+,d0			Xcoord
		addq	#2,d0
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Move
		move	(a3)+,d0			Xcoord
		addq	#2,d0
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Draw
.end		movem.l	(sp)+,d0-a6
		rts

.clearlines	movem.l	d0-a6,-(sp)
		jsr	SetAPenCol0
		lea	ChannelLinesList,a3
		add	2(a2),a3			Old ChannelLinePos
		move	(a3)+,d0			Xcoord
		subq	#2,d0
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Move
		move	(a3)+,d0			Xcoord
		subq	#2,d0
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Draw
		move	(a3)+,d0			Xcoord
		addq	#2,d0
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Move
		move	(a3)+,d0			Xcoord
		addq	#2,d0
		move	(a3)+,d1			Ycoord
		move.l	d6,a1
		CallLib Draw
		movem.l	(sp)+,d0-a6
		rts

ChannelPointers	dc.l	Channel1Buf,Channel2Buf,Channel3Buf,Channel4Buf
		dc.l	Channel5Buf,Channel6Buf,Channel7Buf,Channel8Buf

ClrArpgWait	lea	Channel1Buf,a0
		clr.b	ch_ArpWait(a0)
		lea	Channel2Buf,a0
		clr.b	ch_ArpWait(a0)
		lea	Channel3Buf,a0
		clr.b	ch_ArpWait(a0)
		lea	Channel4Buf,a0
		clr.b	ch_ArpWait(a0)
		lea	Channel5Buf,a0
		clr.b	ch_ArpWait(a0)
		lea	Channel6Buf,a0
		clr.b	ch_ArpWait(a0)
		lea	Channel7Buf,a0
		clr.b	ch_ArpWait(a0)
		lea	Channel8Buf,a0
		clr.b	ch_ArpWait(a0)
		rts

* Twins/PHA *****************************************************************
* Edit Chars/Hex Routines                             Last Change: 92-10-24 *
*****************************************************************************
* d6 <= RastPort                                                            *
* a6 <= GfxBase                                                             *

_HexNumEd	rs.w	1
_HexCursor	rs.w	1
_HexGadget	rs.l	1
_HexNumPtr	rs.l	1
_HexRoutine	rs.l	1
_HexNumChars	rs.w	1

_HexNumEd1	rs.w	1
_HexCursor1	rs.w	1
_HexGadget1	rs.l	1
_HexNumPtr1	rs.l	1
_HexRoutine1	rs.l	1
_HexNumChars1	rs.w	1

_HexNumEd2	rs.w	1
_HexCursor2	rs.w	1
_HexGadget2	rs.l	1
_HexNumPtr2	rs.l	1
_HexRoutine2	rs.l	1
_HexNumChars2	rs.w	1

DoHexReturn	clr.b	_RawKey(a5)
		move.b	#13,_AscIIKey(a5)
		move.l	_GfxBase(a5),a6
		move.l	_RastPort1(a5),d6
		cmp.b	#1,_HexNumEd1+1(a5)
		bne.b	.next1
		bsr.b	EditHexNum1
.next1		cmp.b	#2,_HexNumEd1+1(a5)
		bne.b	.next2
		bsr.b	EditCharNum1
.next2		move.l	_RastPort2(a5),d6
		cmp.b	#1,_HexNumEd2+1(a5)
		bne.b	.next3
		bsr.b	EditHexNum2
.next3		cmp.b	#2,_HexNumEd2+1(a5)
		bne.b	.exit
		bsr.b	EditCharNum2
.exit		rts

LoadHexNum1	lea	_HexNumEd(a5),a0
		lea	_HexNumEd1(a5),a1
		bra.b	CopyHexNum

LoadHexNum2	lea	_HexNumEd(a5),a0
		lea	_HexNumEd2(a5),a1
		bra.b	CopyHexNum

SaveHexNum1	lea	_HexNumEd(a5),a1
		lea	_HexNumEd1(a5),a0
		bra.b	CopyHexNum

SaveHexNum2	lea	_HexNumEd(a5),a1
		lea	_HexNumEd2(a5),a0
		bra	CopyHexNum

CopyHexNum	move.l	(a1)+,(a0)+
		move.l	(a1)+,(a0)+
		move.l	(a1)+,(a0)+
		move.l	(a1)+,(a0)+
		move	(a1)+,(a0)+
		rts

EditHexNum1	bsr	LoadHexNum1
		bsr.b	EditHexNum
		bsr	SaveHexNum1
		rts

EditCharNum1	bsr	LoadHexNum1
		bsr	EditCharNum
		bsr	SaveHexNum1
		cmp	#$0202,_HexNumEd2(a5)
		bne.b	.exit
		move.l	_RastPort2(a5),d6
		move	_HexCursor1(a5),_HexCursor2(a5)
		bsr	LoadHexNum2
		bsr	CharPosCursor
		bsr	CharPrint
.exit		rts

EditHexNum2	bsr	LoadHexNum2
		bsr.b	EditHexNum
		bsr	SaveHexNum2
		rts

EditCharNum2	bsr	LoadHexNum2
		bsr	EditCharNum
		bsr	SaveHexNum2
		cmp	#$0202,_HexNumEd1(a5)
		bne.b	.exit
		move.l	_RastPort1(a5),d6
		move	_HexCursor2(a5),_HexCursor1(a5)
		bsr	LoadHexNum1
		bsr	CharPosCursor
		bsr	CharPrint
.exit		rts

EditHexNum	jsr	SetFont8
		lea	HexChars,a2
		move.b	_AscIIKey(a5),d4
		moveq	#21,d7
.search		cmp.b	(a2)+,d4
		beq.b	.found_char
		dbf	d7,.search
		move.b	_RawKey(a5),d0
		cmp.b	#CURSORLEFT,d0
		beq	HexCursorLeft
		cmp.b	#CURSORRIGHT,d0
		beq	HexCursorRight
		move.b	_AscIIKey(a5),d0
		cmp.b	#13,d0
		beq	HexReturn
		rts
.found_char	cmp.b	#5,d7
		bgt.b	.upper
		sub.b	#$20,d4
.upper		jsr	NormalDrawMode
		bsr	HexPosCursor
		move.l	d6,a1
		CallLib Move
		moveq	#1,d0
		lea	_String(a5),a0
		move.b	d4,(a0)
		move.l	d6,a1
		CallLib Text
		add	#21,a2
		move.b	(a2),d4
		move.l	_HexNumPtr(a5),a4
		move	_HexCursor(a5),d0
		lsr	#1,d0
		bcs.b	.lastnibble
		add	d0,a4
		move.b	(a4),d0
		and	#$f,d0
		lsl	#4,d4
		or.b	d4,d0
		move.b	d0,(a4)
		bsr	HexAddCursor
		bsr	DrawHexCursor
		rts
.lastnibble	add	d0,a4
		move.b	(a4),d0
		and	#$f0,d0
		or.b	d4,d0
		move.b	d0,(a4)
		bsr	HexAddCursor
		bsr	DrawHexCursor
		rts

EditCharNum	move.b	_AscIIKey(a5),d4
		cmp.b	#$20,d4
		blo.b	.nochar
		cmp.b	#$7e,d4
		bls.b	.foundchar
		cmp.b	#$a0,d4
		bhs.b	.foundchar
.nochar		move.b	_RawKey(a5),d0
		cmp.b	#CURSORLEFT,d0
		beq.b	CharCursorLeft
		cmp.b	#CURSORRIGHT,d0
		beq.b	CharCursorRight
		move.b	_AscIIKey(a5),d0
		cmp.b	#8,d0
		beq	CharBackSpace
		cmp.b	#13,d0
		beq.b	CharReturn
		cmp.b	#127,d0
		beq	CharDelete
		rts
.foundchar	bsr.b	CharInsert
		rts

HexCursorLeft	bsr	HexPosCursor
		bsr	ClearHexCursor
		bsr	HexSubCursor
		bsr	DrawHexCursor
		rts

CharCursorLeft	bsr	CharPosCursor
		bsr	ClearHexCursor
		bsr	HexSubCursor
		bsr	DrawHexCursor
		rts

HexCursorRight	bsr	HexPosCursor
		bsr	ClearHexCursor
		bsr	HexAddCursor
		bsr	DrawHexCursor
		rts

CharCursorRight	bsr	CharPosCursor
		bsr	ClearHexCursor
		bsr	HexAddCursor
		bsr	DrawHexCursor
		rts

HexReturn	clr	_HexNumEd(a5)
		bsr	HexPosCursor
		bsr	ClearHexCursor
		move.l	_HexRoutine(a5),d0
		beq.b	.exit
		move.l	d0,a0
		jsr	(a0)
.exit		rts

CharReturn	clr	_HexNumEd(a5)
		bsr	CharPosCursor
		bsr	ClearHexCursor
		move.l	_HexRoutine(a5),d0
		beq.b	.exit
		move.l	d0,a0
		jsr	(a0)
.exit		rts

CharInsert	move.l	_HexNumPtr(a5),a0
		add	#14,a0
		cmp.b	#$20,(a0)
		bne.b	.exit2
		move	_HexNumChars(a5),d0
		subq	#1,d0
		move	_HexCursor(a5),d2
		cmp	d0,d2
		beq.b	.exit1
.loop		move.b	-1(a0),(a0)
		subq	#1,a0
		addq	#1,d2
		cmp	d0,d2
		bne	.loop
		move	_HexCursor(a5),d2
		bsr	CharPosCursor
		bsr	HexAddCursor
		move.l	_HexNumPtr(a5),a4
		move.b	d4,(a4,d2.w)
		bra.b	CharPrint
.exit1		move.l	_HexNumPtr(a5),a4
		move.b	d4,(a4,d2.w)
		bsr	CharPosCursor
		bra.b	CharPrint
.exit2		rts

CharBackSpace	move.l	_HexNumPtr(a5),a4
		move	_HexCursor(a5),d4
		add	d4,a4
		bsr	CharPosCursor
		bsr	HexSubCursor
		move.l	_HexNumPtr(a5),a3
		add	_HexCursor(a5),a3
		move	_HexNumChars(a5),d0
		sub	d4,d0
		subq	#1,d0
.loop		move.b	(a4)+,(a3)+
		dbf	d0,.loop
		move.b	#$20,(a3)
		bra.b	CharPrint

CharDelete	move.l	_HexNumPtr(a5),a4
		move	_HexCursor(a5),d4
		add	d4,a4
		move	_HexNumChars(a5),d0
		sub	d4,d0
		subq	#1,d0
		beq.b	.exit
		subq	#1,d0
.loop		move.b	1(a4),(a4)+
		dbf	d0,.loop
.exit		move.b	#$20,(a4)
		bsr.b	CharPosCursor
		bra.b	CharPrint
		rts

CharPrint	jsr	NormalDrawMode
		move.l	_HexGadget(a5),a0
		move	gg_LeftEdge(a0),d0
		add	#12,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move.l	d6,a1
		CallLib Move
		moveq	#18,d0
		move.l	_HexNumPtr(a5),a0
		subq	#3,a0
		move.l	d6,a1
		CallLib Text
		bsr.b	DrawHexCursor
		rts

HexPosCursor	move.l	_HexGadget(a5),a0
		move	gg_LeftEdge(a0),d0
		move	_HexCursor(a5),d1
		lsl	#3,d1
		add	d1,d0
		addq	#8,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move	d0,d5
		move	d1,d7
		rts

CharPosCursor	move.l	_HexGadget(a5),a0
		move	gg_LeftEdge(a0),d0
		move	_HexCursor(a5),d1
		lsl	#3,d1
		add	d1,d0
		add	#36,d0
		move	gg_TopEdge(a0),d1
		add	#9,d1
		move	d0,d5
		move	d1,d7
		rts

ClearHexCursor	moveq	#0,d0
		move.l	d6,a1
		CallLib SetAPen
		bra.b	HexDrawCursor

DrawHexCursor	moveq	#2,d0
		move.l	d6,a1
		CallLib SetAPen

HexDrawCursor	move	#RP_JAM1,d0
		move.l	d6,a1
		CallLib SetDrMd
		jsr	MaskBit0
		move	d5,d0
		move	d7,d1
		move.l	d6,a1
		CallLib Move
		moveq	#1,d0
		lea	_String(a5),a0
		move.b	#$83,(a0)
		move.l	d6,a1
		CallLib Text
		rts

HexAddCursor	addq	#8,d5
		addq	#1,_HexCursor(a5)
		move	_HexNumChars(a5),d0
		subq	#1,d0
		cmp	_HexCursor(a5),d0
		bge.b	.exit
		move	d0,_HexCursor(a5)
		subq	#8,d5
.exit		rts

HexSubCursor	subq	#8,d5
		subq	#1,_HexCursor(a5)
		bpl.b	.exit
		clr	_HexCursor(a5)
		addq	#8,d5
.exit		rts

HexCalcCursor	move.l	_HexGadget(a5),a0
		move	gg_LeftEdge(a0),d0
		addq	#8,d0
		move	wd_MouseX(a2),d1
		sub	d0,d1
		bpl.b	.nominus
		clr	d1
		bra.b	.exit
.nominus	lsr	#3,d1
		move	_HexNumChars(a5),d2
		subq	#1,d2
		cmp	d2,d1
		ble.b	.exit
		move	d2,d1
.exit		move	d1,_HexCursor(a5)
		rts

CharCalcCursor	move.l	_HexGadget(a5),a0
		move	gg_LeftEdge(a0),d0
		add	#36,d0
		move	wd_MouseX(a2),d1
		sub	d0,d1
		bpl.b	.nominus
		clr	d1
		bra.b	.exit
.nominus	lsr	#3,d1
		move	_HexNumChars(a5),d2
		subq	#1,d2
		cmp	d2,d1
		ble.b	.exit
		move	d2,d1
.exit		move	d1,_HexCursor(a5)
		rts

* Twins/PHA *****************************************************************
* Edit voices                                         Last Change: 92-10-24 *
*****************************************************************************
* d6 <= RastPort                                                            *
* a4 <= DataPtr                                                             *
* a6 <= GfxBase                                                             *

AMinus		moveq	#-1,d5
		bra.b	AMinusPlus
APlus		moveq	#1,d5
AMinusPlus	btst	#7,_MarkEd(a5)
		bne	.exit			;Message exit mark mode
		cmp.b	#1,_TunePart(a5)
		bne	.exit
		tst	_EditOnOff(a5)
		beq	.exit
		lea	TuneEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	tune_Ch1Ptr(a0),a0
		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		mulu	RowSize(a4),d3
		moveq	#0,d1
		move	CursorXPos(a4),d1
		move	d1,d0
		divu	#5,d1
		move	d1,d2
		mulu	#5,d2
		sub	d2,d0
		addq	#1,d0
		lsr	#1,d0
		lsl	#2,d1
		move.l	(a0,d1.w),a3
		add	d3,a3
		cmp	#1,d0
		ble.b	.byte1
.byte2		move	(a3),d0
		btst	#5,d0
		beq.b	.nofx2
		and	#$001f,d0
		add.b	d5,d0
		bpl.b	.ok20
		moveq	#0,d0
		bra.b	.ok21
.ok20		cmp	#$1f,d0
		ble.b	.ok21
		move	#$001f,d0
.ok21		and.b	#$e0,1(a3)
		or.b	d0,1(a3)
		bra.b	.print
.nofx2		and	#$001f,d0
		sub.b	#$10,d0
		add.b	d5,d0
		cmp.b	#$f,d0
		ble.b	.ok22
		moveq	#$f,d0
		bra.b	.ok23
.ok22		cmp.b	#$f0,d0
		bge.b	.ok23
		move	#$00f0,d0
.ok23		add.b	#$10,d0
		and.b	#$e0,1(a3)
		or.b	d0,1(a3)
		bra.b	.print
.byte1		move	(a3),d0
		btst	#5,d0
		beq.b	.nofx1
		lsr	#8,d0
		add	d5,d0
		bpl.b	.ok10
		sub	d5,d0
.ok10		cmp	#$ff,d0
		ble.b	.ok13
		move	#$ff,d0
.ok13		move.b	d0,(a3)
		bra.b	.print
.nofx1		and	#$00c0,d0
		lsl	#2,d0
		move.b	(a3),d0
		add	d5,d0
		bpl.b	.ok11
		moveq	#0,d0
		bra.b	.ok12
.ok11		cmp	#$3ff,d0
		ble.b	.ok12
		move	#$3ff,d0
.ok12		move.b	d0,(a3)
		clr.b	d0
		lsr	#2,d0
		and.b	#$3f,1(a3)
		or.b	d0,1(a3)
.print		bsr.b	PrintVoiceLine
.exit		rts

PrintVoiceLine	jsr	SetFont7
		jsr	NormalDrawMode0
		lea	XPositions(a4),a0
		add	d2,d2
		move	(a0,d2.w),d0
		move	d0,d4
		move	CursorYPos(a4),d1
		mulu	ScrollNum(a4),d1
		add	Y1CharPos(a4),d1
		move	d1,d5
		move.l	d6,a1
		CallLib Move
		move	(a3),d7
		lea	_AscIIHexTab(a5),a2
		lea	_String+1(a5),a0
		move	d7,d1
		and	#$00c0,d1
		btst	#5,d7
		bne.b	.skip2
		lsr	#5,d1
		move.b	1(a2,d1.w),(a0)
		bra.b	.print
.skip2		lsr	#6,d1
		lea	_AscIICmdTab(a5),a1
		move.b	(a1,d1.w),(a0)
.print		move	d7,d1
		and	#$ff00,d1
		lsr	#7,d1
		move	(a2,d1.w),1(a0)
		move.l	d6,a1
		moveq	#3,d0
		CallLib Text
		move	d4,d0
		add	#32,d0
		move	d5,d1
		move.l	d6,a1
		CallLib	Move
		move	d7,d1
		and	#$001f,d1
		btst	#5,d7
		bne.b	.skip3
		sub.b	#$10,d1
.skip3		add	d1,d1
		lea	(a2,d1.w),a0
		move.l	d6,a1
		moveq	#2,d0
		CallLib Text
		rts

EditVoice	bsr	CursorSave
		lea	HexChars,a2
		move.b	_AscIIKey(a5),d4
		moveq	#21,d7
.search		cmp.b	(a2)+,d4
		beq.b	.found_char
		dbf	d7,.search
		bra	VoiceCommand
.found_char	cmp.b	#5,d7
		bgt.b	.upper
		sub.b	#$20,d4
.upper		moveq	#0,d5
		move.b	21(a2),d5
		move.l	DataPtr(a4),a0
		lea	tune_Ch1Ptr(a0),a0
		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		mulu	RowSize(a4),d3
		moveq	#0,d1
		move	CursorXPos(a4),d1
		move	d1,d0
		divu	#5,d1
		move	d1,d2
		mulu	#5,d2
		sub	d2,d0
		lsl	#2,d1
		move.l	(a0,d1.w),a3
		add	d3,a3
		move	(a3),d7
		move	d0,d3
		beq	.byte0
		cmp	#2,d3
		ble	.byte1
.byte2		move	d7,d0
		btst	#0,d3
		beq.b	.nib2low
		btst	#5,d7
		bne.b	.test2
		tst	d5
		beq.b	.ok20
		cmp	#15,d5
		beq.b	.ok20
		bra.b	.skip
.test2		cmp	#1,d5
		bgt.b	.skip
.ok20		lsl	#4,d5
.nib2low	btst	#5,d7
		beq.b	.transpose
		btst	#0,d3
		beq.b	.2low
		and	#$ffef,d0
		or.b	d5,d0
		bra.b	.move2
.2low		and	#$fff0,d0
		or.b	d5,d0
		bra.b	.move2
.transpose	and	#$001f,d0
		sub.b	#$10,d0
		btst	#0,d3
		beq.b	.low2
		and	#$000f,d0
		or.b	d5,d0
		add.b	#$10,d0
		bra.b	.move2
.low2		and	#$00f0,d0
		or.b	d5,d0
		add.b	#$10,d0
.move2		move	d7,d1
		and	#$ffe0,d1
		or	d1,d0
		move	d0,(a3)
.skip		bsr	PrintVoiceLine
		tst.b	_EditMode(a5)
		beq	VoiceVertical
		btst	#0,d3
		beq.b	.nibble2low
		addq	#1,CursorXPos(a4)
		bra	CursorDraw
.nibble2low	cmp.b	#1,_EditMode(a5)
		beq	VoiceRight
		subq	#1,CursorXPos(a4)
		tst.b	_PlayTune(a5)
		beq.b	.noplay1
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.play1
.noplay1	bra	VoiceVertical
.play1		bra	CursorDraw

.byte1		move	d7,d0
		btst	#0,d3
		beq.b	.nib1low
		lsl	#4,d5
		and	#$0f00,d0
		bra.b	.move1
.nib1low	and	#$f000,d0
.move1		lsr	#8,d0
		or.b	d5,d0
		move.b	d0,(a3)
		bsr	PrintVoiceLine
		tst.b	_EditMode(a5)
		beq.b	VoiceVertical
		cmp.b	#1,_EditMode(a5)
		beq.b	.voiceright
		btst	#0,d3
		beq.b	.nibble1low
.voiceright	addq	#1,CursorXPos(a4)
		bra	CursorDraw
.nibble1low	subq	#2,CursorXPos(a4)
		tst.b	_PlayTune(a5)
		beq.b	.noplay2
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.play2
.noplay2	bra.b	VoiceVertical
.play2		bra	CursorDraw

.byte0		cmp.b	#3,d5
		ble.b	.nibble0hi
		bra.b	.skip2
.nibble0hi	btst	#5,d7
		bne.b	.skip2
		move	d7,d0
		and	#$001f,d0
		ror.b	#2,d5
		or.b	d5,d0
		move.b	d0,1(a3)
.skip2		bsr	PrintVoiceLine
		tst.b	_EditMode(a5)
		beq.b	VoiceVertical
		addq	#1,CursorXPos(a4)
		bra	CursorDraw

VoiceVertical	tst.b	_PlayTune(a5)
		beq.b	.noplay
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.play
.noplay		bsr	CursorDownScroll
		bsr	CursorDraw
.play		rts

VoiceCommand	jsr	NormalDrawMode0
		move.b	_RawKey(a5),d7
		tst.b	_PlayTune(a5)
		beq.b	.noplay
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.play
.noplay		cmp.b	#$41,d7
		beq	DeleteVoiceLine
		cmp.b	#$44,d7
		beq	InsertVoiceLine
.play		cmp.b	#$57,d7
		bne.b	.next3
		move	#$00e0,d7
		bra.b	.next6
.next3		cmp.b	#$58,d7
		bne.b	.next4
		move	#$00a0,d7
		bra.b	.next6
.next4		cmp.b	#$59,d7
		bne.b	.next5
		move	#$0060,d7
		bra.b	.next6
.next5		cmp.b	#$46,d7
		bne.b	.exit
		move	_ie_Qual(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		beq.b	.next7
		bra.b	.next9
.next6		bsr	.calcpos
		move	d2,d3
		move	(a3),d0
		and	#$ff3f,d0
		btst	#5,d0
		bne.b	.ok6
		moveq	#0,d0
.ok6		or	d7,d0
		move	d0,(a3)
		bsr	PrintVoiceLine
		bra.b	.testeditmode
.exit		rts

.next7		bsr.b	.calcpos
		move	d2,d3
		cmp	#2,d0
		beq.b	.next8
		move	#$0010,(a3)
		bsr	PrintVoiceLine
		bra.b	.testeditmode

.next8		move	(a3),d0
		and	#$ffe0,d0
		btst	#5,d0
		bne.b	.ok8
		or	#$0010,d0
.ok8		move	d0,(a3)
		bsr	PrintVoiceLine
.testeditmode	tst.b	_EditMode(a5)
		beq	VoiceVertical
		cmp.b	#1,_EditMode(a5)
		bne	VoiceVertical
		bsr	CursorSave
		move	d3,CursorXPos(a4)
		bsr	CursorRightShiftTune
		bsr	CursorDraw
		jmp	StepArrow

.next9		move.l	DataPtr(a4),a3
		lea	tune_Ch1Ptr(a3),a3
		moveq	#7,d7
.loop		move.l	(a3)+,a0
		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		mulu	RowSize(a4),d3
		add	d3,a0
		move	#$0010,(a0)
		dbf	d7,.loop
		jsr	PrintTune
		bra	VoiceVertical
		rts

.calcpos	move.l	DataPtr(a4),a0
		lea	tune_Ch1Ptr(a0),a0
		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		mulu	RowSize(a4),d3
		moveq	#0,d1
		move	CursorXPos(a4),d1
		move	d1,d0
		divu	#5,d1
		move	d1,d2
		mulu	#5,d2
		sub	d2,d0
		addq	#1,d0
		lsr	#1,d0
		lsl	#2,d1
		move.l	(a0,d1.w),a3
		add	d3,a3
		rts

InsertVoiceLine	move.b	#1,_StepArrowClear(a5)
		jsr	StepArrow
		move	_ie_Qual(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		beq.b	.column
		lea	TuneEditorDefs,a4
		move.l	DataPtr(a4),a3
		lea	tune_Ch1Ptr(a3),a0
		moveq	#7,d0
		moveq	#0,d1
.testloop	move.l	(a0)+,a1
		add	#chnl_SIZE,a1
		sub	RowSize(a4),a1
		or	(a1),d1
		dbf	d0,.testloop
		cmp	#$0010,d1
		bne	.exit			;Request data will be loss at end of tune
		lea	tune_Ch1Ptr(a3),a2
		moveq	#7,d7
.voiceloop	move.l	(a2)+,a0
		move.l	a0,a3
		add	#chnl_SIZE,a0
		move.l	a0,a1
		sub	RowSize(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		cmp	#255,d0
		beq	.exit			;Message end of tune
		bsr.b	.insertcolumn
		dbf	d7,.voiceloop
		bra.b	.fixcursor

.column		jsr	GetVoicePtr
		move.l	a0,a3
		add	#chnl_SIZE,a0
		move.l	a0,a1
		sub	RowSize(a4),a0
		cmp	#$0010,(a0)
		bne	.exit			;Request data will be loss at end of voice
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		cmp	#255,d0
		beq	.exit			;Message end of voice
		bsr.b	.insertcolumn
		bra.b	.fixcursor

.insertcolumn	move	#255,d1
.loop		move	-(a0),-(a1)
		subq	#1,d1
		cmp	d0,d1
		bne	.loop
		move	#$0010,(a0)
		move.l	a3,a0
		move	#255,d1
		move.b	#$80,d2
.search		move.b	1(a0),d3
		and.b	#$00c0,d3
		cmp.b	d3,d2
		bne.b	.ok
		cmp.b	(a0),d0
		bhi.b	.ok
		addq.b	#1,(a0)
.ok		add	RowSize(a4),a0
		dbf	d1,.search
		rts

.fixcursor	move	CursorYPos(a4),d0
		cmp	ScrollDownPos(a4),d0
		bge.b	.scroll
.noscroll	addq	#1,CursorYPos(a4)
		move	NumYPos(a4),d0
		cmp	CursorYPos(a4),d0
		bge.b	.scrolla
		move	d0,CursorYPos(a4)
		bra.b	.scrolla
.scroll		addq	#1,MinYPos(a4)
		move	MinYPos(a4),d0
		move	MaxYPos(a4),d1
		sub	NumYPos(a4),d1
		cmp	d1,d0
		ble.b	.scrolla
		move	d1,MinYPos(a4)
		bra	.noscroll
.scrolla	tst.b	_PlayTune(a5)
		beq.b	.noplay
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.exit
.noplay		jsr	PrintTune
		bsr	CursorDraw
.exit		jmp	StepArrow

DeleteVoiceLine	move.b	#1,_StepArrowClear(a5)
		jsr	StepArrow
		move	_ie_Qual(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		beq.b	.column
		lea	TuneEditorDefs,a4
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		beq	.exit			;Message top of tune
		move.l	DataPtr(a4),a3
		lea	tune_Ch1Ptr(a3),a2
		moveq	#7,d7
.voiceloop	move.l	(a2)+,a0
		move.l	a0,a3
		bsr.b	.deletecolumn
		dbf	d7,.voiceloop
		bra.b	.fixcursor

.column		jsr	GetVoicePtr
		move.l	a0,a3
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		beq	.exit			;Message top of voice
		bsr.b	.deletecolumn
		bra.b	.fixcursor

.deletecolumn	move	d0,d1
		mulu	RowSize(a4),d1
		add	d1,a0
		move.l	a0,a1
		sub	RowSize(a4),a1
.loop		move	(a0)+,(a1)+
		addq	#1,d0
		cmp	#256,d0
		bne	.loop
		move	#$0010,-(a0)
		move.l	a3,a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		move	#255,d1
		move.b	#$80,d2
.search		move.b	1(a0),d3
		and.b	#$00c0,d3
		cmp.b	d3,d2
		bne.b	.ok
		cmp.b	(a0),d0
		bhi.b	.ok
		subq.b	#1,(a0)
.ok		add	RowSize(a4),a0
		dbf	d1,.search
		rts

.fixcursor	move	CursorYPos(a4),d0
		cmp	ScrollUpPos(a4),d0
		ble.b	.scroll
.noscroll	subq	#1,CursorYPos(a4)
		bge.b	.scrolla
		clr	CursorYPos(a4)
		bra.b	.scrolla
.scroll		subq	#1,MinYPos(a4)
		bge.b	.scrolla
		clr	MinYPos(a4)
		bra	.noscroll
.scrolla	tst.b	_PlayTune(a5)
		beq.b	.noplay
		cmp.b	#2,_ScrollPart(a5)
		bhs.b	.exit
.noplay		jsr	PrintTune
		bsr	CursorDraw
.exit		jmp	StepArrow

InsVoiceLines	lea	TuneEditorDefs,a4
		move.l	DataPtr(a4),a3
		lea	tune_Ch1Ptr(a3),a0
.getcolumn	lea	TuneMarkEdDefs,a3
		move	CursorXPos(a4),d0
		lea	MarkXPos(a3),a2
		move.b	(a2,d0.w),d0
.getcolumns	move	_CopyMarkX2(a5),d1
		sub	_CopyMarkX1(a5),d1
		bpl.b	.getrows
		neg	d1
.getrows	move	_CopyMarkY2(a5),d2
		sub	_CopyMarkY1(a5),d2
		bpl.b	.okeej
		neg	d2
.okeej		move	d0,d3
		move	d1,d4
		move	d0,d5
		add	d5,d5
		add	d5,d5
		add	d5,a0
		move.l	a0,a3
.testloop	move.l	(a0)+,a1
		add	#chnl_SIZE,a1
		move	d2,d5
.test		cmp	#$0010,-(a1)
		bne	.datalossreq	;Request data will be loss at end of part
		dbf	d5,.test
		subq	#1,d4
		bmi.b	.getrow
		addq	#1,d3
		cmp	#8,d3
		bne.b	.testloop

.getrow		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		move	d0,d5
		move	d1,d7
		move.l	a3,a2
.moveagain	move.l	(a2)+,a0
		add	#chnl_SIZE,a0
		move.l	a0,a1
		move	d3,d4
		add	d2,d4
		addq	#1,d4
		cmp	#256,d4
		bge.b	.next
		move	d2,d4
		addq	#1,d4
		add	d4,d4
		sub	d4,a0
		move	MaxYPos(a4),d4
		sub	d2,d4
.moveloop	move	-(a0),-(a1)
		subq	#1,d4
		cmp	d3,d4
		bgt.b	.moveloop
.next		subq	#1,d7
		bmi.b	.renumber
		addq	#1,d5
		cmp	#8,d5
		bne.b	.moveagain

.renumber	move	#$0080,d5
		addq	#1,d2
.search		move	MaxYPos(a4),d4
		move.l	(a3)+,a0
.loop		move.b	1(a0),d7
		and	#$00c0,d7
		cmp	d7,d5
		bne.b	.ok
		cmp.b	(a0),d3
		bhi.b	.ok
		add.b	d2,(a0)
.ok		add	RowSize(a4),a0
		dbf	d4,.loop
		subq	#1,d1
		bmi.b	.exit
		addq	#1,d0
		cmp	#7,d0
		ble.b	.search
.exit		rts

.datalossreq	rts

DelVoiceLines	lea	TuneEditorDefs,a4
		move.l	DataPtr(a4),a3
		lea	tune_Ch1Ptr(a3),a0
.getcolumn	lea	TuneMarkEdDefs,a3
		move	CursorXPos(a4),d0
		lea	MarkXPos(a3),a2
		move.b	(a2,d0.w),d0
.getcolumns	move	_CopyMarkX2(a5),d1
		sub	_CopyMarkX1(a5),d1
		bpl.b	.getrows
		neg	d1
.getrows	move	_CopyMarkY2(a5),d2
		sub	_CopyMarkY1(a5),d2
		bpl.b	.okeej
		neg	d2
.okeej		move	d0,d5
		add	d5,d5
		add	d5,d5
		add	d5,a0
		move.l	a0,a3
.getrow		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		move	d0,d5
		move	d1,d7
		move.l	a3,a2
.moveagain	move.l	(a2)+,a1
		move	d3,d4
		add	d4,d4
		add	d4,a1
		move.l	a1,a0
		move	d2,d4
		addq	#1,d4
		add	d4,d4
		add	d4,a0
		move	MaxYPos(a4),d4
		sub	d2,d4
.moveloop	move	(a0)+,(a1)+
		subq	#1,d4
		cmp	d3,d4
		bhi.b	.moveloop
		move	d2,d6
.clear		move	#$0010,-(a0)
		dbf	d6,.clear
		subq	#1,d7
		bmi.b	.renumber
		addq	#1,d5
		cmp	#8,d5
		bne.b	.moveagain

.renumber	move	#$0080,d5
		addq	#1,d2
.search		moveq	#0,d4
		move.l	(a3)+,a0
.loop		moveq	#0,d6
		move.b	(a0),d6
		move.b	1(a0),d7
		and	#$00c0,d7
		cmp	d7,d5
		bne.b	.ok
		cmp	d6,d3
		bhs.b	.ok
		sub	d2,d6
		cmp	d6,d3
		ble.b	.ok
		move	d4,d6
.ok		move.b	d6,(a0)
		add	RowSize(a4),a0
		addq	#1,d4
		cmp	MaxYPos(a4),d4
		bls.b	.loop
		subq	#1,d1
		bmi.b	.exit
		addq	#1,d0
		cmp	#7,d0
		ble.b	.search
.exit		move.l	_RastPort1(a5),d6
		rts

* Twins/PHA *****************************************************************
* Edit part                                           Last Change: 92-10-24 *
*****************************************************************************
* d6 <= RastPort                                                            *
* a4 <= DataPtr                                                             *
* a6 <= GfxBase                                                             *

DelCheckPart	move	_ie_Qual(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		bne	ClrPartLine
		move	CursorXPos(a4),d0
		cmp.b	#2,d0
		bls	PartNote
		cmp.b	#4,d0
		bls	DelInst
		bra	DelEffect

EditPart	bsr	CursorSave
		move.b	_RawKey(a5),d0
		cmp.b	#$41,d0
		beq	DelPartLine
		cmp.b	#$44,d0
		beq	InsPartLine
		cmp.b	#$46,d0
		beq	DelCheckPart
		move	CursorXPos(a4),d0
		beq	PartNote
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d1
		add	CursorYPos(a4),d1
		mulu	RowSize(a4),d1
		add	d1,a0
		btst	#7,(a0)
		beq.b	.nojump
		cmp.b	#2,d0
		bhi.b	.nojump
		cmp.b	#$59,_RawKey(a5)
		beq	PartNote
		bra	Instr
.nojump		cmp.b	#2,d0
		bls	PartNote
		cmp.b	#4,d0
		bls	Instr
.effect		lea	HexChars,a2
		move.b	_AscIIKey(a5),d4
		moveq	#21,d7
.search1	cmp.b	(a2)+,d4
		beq.b	.found_char1
		dbf	d7,.search1
		rts
.found_char1	cmp.b	#5,d7
		bgt.b	.upper1
		sub.b	#$20,d4
.upper1		jsr	AllocPart
		jsr	NormalDrawMode0
		lea	XPositions(a4),a0
		move	CursorXPos(a4),d0
		add	d0,d0
		move	(a0,d0.w),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		add	Y1CharPos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#1,d0
		lea	_String(a5),a0
		move.b	d4,(a0)
		move.l	d6,a1
		CallLib Text
		add	#21,a2
		move.b	(a2),d4
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		move	CursorXPos(a4),d1
		subq	#5,d1
		move	d1,d2
		lsr	#1,d1
		move	d1,d3
		bclr	#0,d1
		add	d1,d0
		btst	#0,d3
		bne.b	.next
		btst	#0,d2
		bne.b	.noshift1
		add	d0,a0
		move.b	2(a0),d0
		and	#$f,d0
		lsl	#4,d4
		or.b	d4,d0
		move.b	d0,2(a0)
		tst.b	_EditMode(a5)
		beq	VoiceVert
		addq	#1,CursorXPos(a4)
		bra	DrawCursor
.noshift1	add	d0,a0
		move.b	2(a0),d0
		and	#$f0,d0
		or.b	d4,d0
		move.b	d0,2(a0)
		tst.b	_EditMode(a5)
		beq	VoiceVert
		addq	#1,CursorXPos(a4)
		bra	DrawCursor
.next		btst	#0,d2
		bne.b	.noshift2
		add	d0,a0
		move.b	3(a0),d0
		and	#$f,d0
		lsl	#4,d4
		or.b	d4,d0
		move.b	d0,3(a0)
		tst.b	_EditMode(a5)
		beq	VoiceVert
		addq	#1,CursorXPos(a4)
		bra	DrawCursor
.noshift2	add	d0,a0
		move.b	3(a0),d0
		and	#$f0,d0
		or.b	d4,d0
		move.b	d0,3(a0)
		tst.b	_EditMode(a5)
		beq	VoiceVert
		cmp.b	#1,_EditMode(a5)
		beq.b	Horizontal
		subq	#3,CursorXPos(a4)
		bra	VoiceVert
Horizontal	bsr	CursorRight
		bra	CursorDraw

DelEffect	jsr	AllocPart
		jsr	NormalDrawMode0
		lea	XPositions(a4),a0
		move	CursorXPos(a4),d1
		subq	#5,d1
		and	#$fc,d1
		addq	#5,d1
		add	d1,d1
		move	(a0,d1.w),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		add	Y1CharPos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#4,d0
		lea	_String(a5),a0
		move.l	#"0000",(a0)
		move.l	d6,a1
		CallLib Text
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a0
		move	CursorXPos(a4),d1
		subq	#5,d1
		lsr	#2,d1
		add	d1,d1
		add	d1,a0
		clr	2(a0)
		tst.b	_EditMode(a5)
		beq	VoiceVert
		cmp.b	#1,_EditMode(a5)
		bne	VoiceVert
		add	d1,d1
		addq	#8,d1
		move	d1,CursorXPos(a4)
		bra	Horizontal

PartNote	move.b	_RawKey(a5),d2
		cmp.b	#$46,d2
		beq.b	.ok
		move	_Qualifier(a5),d1
		btst	#IEQUALIFIERB_REPEAT,d1
		bne.b	.exit
.ok		move	_KeybListSize(a5),d1
		move.l	_KeybListPtr(a5),a2
.search		cmp.b	(a2)+,d2
		beq.b	.found
		dbf	d1,.search
.exit		rts
.found		add	_KeybListSize1(a5),a2
PartEnd		jsr	AllocPart
		jsr	NormalDrawMode0
		move	XPositions(a4),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		add	Y1CharPos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#0,d1
		moveq	#0,d3
		move.b	(a2),d1
		beq.b	.nonote
		cmp	#61,d1
		bne.b	.okeej
		move	d1,d7
		move	d7,d1
		add	d1,d1
		add	d1,d1
		lea	AscIINotes,a0
		add	d1,a0
		move.l	d6,a1
		moveq	#4,d0
		CallLib Text
		bra.b	.instrument
.okeej		cmp	#$80,d1
		beq.b	.jump
		add	_OctaveAdder(a5),d1
		move	_InstNum(a5),d3
.nonote		move	d1,d7
		add	d1,d1
		add	d1,d1
		lea	AscIINotes,a0
		add	d1,a0
		move.l	d6,a1
		moveq	#4,d0
		CallLib Text
.instrument	move	d3,d5
		add	d5,d5
		lea	_AscIIHexTab(a5),a0
		add	d5,a0
		move.l	d6,a1
		moveq	#2,d0
		CallLib Text
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a0
		move.b	d7,(a0)+
		move.b	d3,(a0)
		tst.b	_ScrollPart(a5)
		beq.b	.oki
		tst.b	_PlayTune(a5)
		beq.b	.testpart
		tst.b	_FollowChannel(a5)
		bne.b	.exit
.testpart	tst.b	_PlayPart(a5)
		bne.b	.exit
.oki		tst.b	_EditMode(a5)
		beq	VoiceVert
		cmp.b	#1,_EditMode(a5)
		bne	VoiceVert
		move	#4,CursorXPos(a4)
		bra	Horizontal
.exit		rts
.jump		move	d1,d7
		lea	_String(a5),a0
		move.b	#$81,(a0)
		move.l	d6,a1
		moveq	#1,d0
		CallLib Text
		lea	_String(a5),a0
		move.l	#"00  ",(a0)
		move.l	d6,a1
		moveq	#3,d0
		CallLib Text
		bra	.instrument
Instr		lea	HexChars,a2
		move.b	_AscIIKey(a5),d4
		moveq	#21,d7
.search2	cmp.b	(a2)+,d4
		beq.b	.found_char
		dbf	d7,.search2
		rts
.found_char	cmp.b	#5,d7
		bgt.b	.upper
		sub.b	#$20,d4
.upper		jsr	AllocPart
		jsr	NormalDrawMode0
		lea	XPositions(a4),a0
		move	CursorXPos(a4),d0
		add	d0,d0
		move	(a0,d0.w),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		add	Y1CharPos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#1,d0
		lea	_String(a5),a0
		move.b	d4,(a0)
		move.l	d6,a1
		CallLib Text
		add	#21,a2
		move.b	(a2),d4
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a0
		move	CursorXPos(a4),d1
		cmp.b	#3,d1
		bhs.b	.okeej
		btst	#7,(a0)
		bne.b	.partjump
.okeej		btst	#0,d1
		beq.b	.noshift
		move.b	1(a0),d0
		and	#$f,d0
		lsl	#4,d4
		or.b	d4,d0
		move.b	d0,1(a0)
		tst.b	_EditMode(a5)
		beq	VoiceVert
		addq	#1,CursorXPos(a4)
		bra	DrawCursor
.noshift	move.b	1(a0),d0
		and	#$f0,d0
		or.b	d4,d0
		move.b	d0,1(a0)
		tst.b	_EditMode(a5)
		beq	VoiceVert
		cmp.b	#1,_EditMode(a5)
		beq	Horizontal
		subq	#1,CursorXPos(a4)
		bra	VoiceVert

.partjump	move.b	(a0),d0
		btst	#0,d1
		beq.b	.noshifta
		and	#$f,d0
		lsl	#4,d4
		or.b	d4,d0
.ok1		cmp.b	#$3f,d0
		bls.b	.ok2
		move.b	#$3f,d0
.ok2		bset	#7,d0
		move.b	d0,(a0)
		tst.b	_EditMode(a5)
		beq.b	VoiceVert
		addq	#1,CursorXPos(a4)
		bra	DrawCursor
.noshifta	and	#$70,d0
		or.b	d4,d0
		bra.b	.ok1

DelInst		jsr	AllocPart
		jsr	NormalDrawMode0
		lea	XPositions(a4),a0
		move	6(a0),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		add	Y1CharPos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#2,d0
		lea	_String(a5),a0
		move	#"00",(a0)
		move.l	d6,a1
		CallLib Text
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a0
		clr.b	1(a0)
		tst.b	_EditMode(a5)
		beq.b	VoiceVert
		cmp.b	#1,_EditMode(a5)
		bne.b	VoiceVert
		move	#4,CursorXPos(a4)
		bra	Horizontal

VoiceVert	cmp.b	#2,_TunePart(a5)
		bne.b	.ok
		tst.b	_ScrollPart(a5)
		beq.b	.ok
		tst.b	_PlayTune(a5)
		beq.b	.testpart
		tst.b	_FollowChannel(a5)
		bne.b	DrawCursor
.testpart	tst.b	_PlayPart(a5)
		bne.b	DrawCursor
.ok		bsr	CursorDownScroll
DrawCursor	bra	CursorDraw

ClrPartLine	jsr	AllocPart
		jsr	NormalDrawMode0
		move	XPositions(a4),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		add	Y1CharPos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#31,d0
		lea	_String(a5),a0
		move.l	#"--- ",(a0)+
		move.l	#"00 0",(a0)+
		move.l	#"000 ",(a0)+
		move.l	#"0000",(a0)+
		move.l	#" 000",(a0)+
		move.l	#"0 00",(a0)+
		move.l	#"00 0",(a0)+
		move.l	#"000 ",(a0)+
		sub.l	#32,a0
		move.l	d6,a1
		CallLib Text
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a0
		clr.l	(a0)+
		clr.l	(a0)+
		clr.l	(a0)+
		bra	VoiceVert

InsPartLine	tst.b	_ScrollPart(a5)
		beq.b	.oki
		tst.b	_PlayTune(a5)
		beq.b	.testpart
		tst.b	_FollowChannel(a5)
		bne.b	.exit
.testpart	tst.b	_PlayPart(a5)
		bne.b	.exit
.oki		lea	PartEditorDefs,a4
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		cmp	MaxYPos(a4),d0
		beq.b	.exit
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq	.noins
		add	#part_SIZEOF,a0
		move.l	a0,a1
		sub	RowSize(a4),a0
		move	CursorXPos(a4),d2
		move	_ie_Qual(a5),d3
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d3
		beq.b	.column
		move.l	(a0),d1
		or.l	4(a0),d1
		or.l	8(a0),d1
		beq.b	.okej
.exit		rts				;Request data will be loss at end of part

.column		move.l	a0,a2
		move.l	a1,a3
		add	#12,a0
		bsr	WichPartCol
		tst	(a0)
		bne	.exit			;Request data will be loss at end of part column
		move.l	a2,a0
		move.l	a3,a1

.okej		move	MaxYPos(a4),d1
		tst	d3
		bne.b	.loop2
		bsr	WichPartCol
.loop1		move	(a0),(a1)
		sub	#12,a0
		sub	#12,a1
		subq	#1,d1
		cmp	d0,d1
		bne	.loop1
		clr	12(a0)
		cmp	#2,d2
		bhi.b	.noins
		bra.b	.renumber

.loop2		move.l	-(a0),-(a1)
		move.l	-(a0),-(a1)
		move.l	-(a0),-(a1)
		subq	#1,d1
		cmp	d0,d1
		bne	.loop2
		clr.l	(a0)+
		clr.l	(a0)+
		clr.l	(a0)+

.renumber	move.l	DataPtr(a4),a0
		move	MaxYPos(a4),d1
.search		move.b	(a0),d2
		bclr	#7,d2
		beq.b	.ok
		cmp.b	d2,d0
		bgt.b	.ok
		addq.b	#1,d2
		or.b	#$80,d2
		move.b	d2,(a0)
.ok		add	RowSize(a4),a0
		dbf	d1,.search

.noins		move	CursorYPos(a4),d0
		cmp	ScrollDownPos(a4),d0
		bge.b	.scroll
.noscroll	addq	#1,CursorYPos(a4)
		move	NumYPos(a4),d0
		subq	#1,d0
		cmp	CursorYPos(a4),d0
		bge.b	.scrolla
		move	d0,CursorYPos(a4)
		bra.b	.scrolla
.scroll		addq	#1,MinYPos(a4)
		move	MinYPos(a4),d0
		move	MaxYPos(a4),d1
		sub	NumYPos(a4),d1
		cmp	d1,d0
		ble.b	.scrolla
		move	d1,MinYPos(a4)
		bra	.noscroll
.scrolla	jsr	UpdateParts
		jmp	CursorDraw

WichPartCol	subq	#2,a0
		subq	#2,a1
		cmp	#21,d2
		bge.b	.ok
		subq	#2,a0
		subq	#2,a1
		cmp	#17,d2
		bge.b	.ok
		subq	#2,a0
		subq	#2,a1
		cmp	#13,d2
		bge.b	.ok
		subq	#2,a0
		subq	#2,a1
		cmp	#9,d2
		bge.b	.ok
		subq	#2,a0
		subq	#2,a1
		cmp	#5,d2
		bge.b	.ok
		subq	#2,a0
		subq	#2,a1
.ok		rts

DelPartLine	tst.b	_ScrollPart(a5)
		beq.b	.oki
		tst.b	_PlayTune(a5)
		beq.b	.testpart
		tst.b	_FollowChannel(a5)
		bne	.exit
.testpart	tst.b	_PlayPart(a5)
		bne	.exit
.oki		tst	_HexNumEd1(a5)
		bne	.exit
		lea	PartEditorDefs,a4
		jsr	GetPartPtr
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		beq	.exit			;Message top of part
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq	.nodel
		move	d0,d1
		mulu	RowSize(a4),d1
		add	d1,a0
		move.l	a0,a1
		sub	RowSize(a4),a1

		move	CursorXPos(a4),d2
		move	_ie_Qual(a5),d3
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d3
		bne.b	.loop2
		add	#12,a0
		add	#12,a1
		bsr	WichPartCol
.loop1		move	(a0),(a1)
		add	#12,a0
		add	#12,a1
		addq	#1,d0
		cmp	#128,d0
		bne.b	.loop1
		clr	-12(a0)
		cmp	#2,d2
		bhi.b	.nodel
		bra.b	.renumber

.loop2		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		addq	#1,d0
		cmp	#128,d0
		bne.b	.loop2
		clr.l	-(a0)
		clr.l	-(a0)
		clr.l	-(a0)

.renumber	move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		move	MaxYPos(a4),d1
.search		move.b	(a0),d2
		bclr	#7,d2
		beq.b	.ok
		cmp.b	d2,d0
		bgt.b	.ok
		subq.b	#1,d2
		or.b	#$80,d2
		move.b	d2,(a0)
.ok		add	RowSize(a4),a0
		dbf	d1,.search

.nodel		move	CursorYPos(a4),d0
		cmp	ScrollUpPos(a4),d0
		ble.b	.scroll
.noscroll	subq	#1,CursorYPos(a4)
		bge.b	.scrolla
		clr	CursorYPos(a4)
		bra.b	.scrolla
.scroll		subq	#1,MinYPos(a4)
		bge.b	.scrolla
		clr	MinYPos(a4)
		bra	.noscroll
.scrolla	jsr	UpdateParts
		jsr	CursorDraw
.exit		rts

InsPartLines	lea	PartEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq	.exit

.getcolumn	lea	PartMarkEdDefs,a3
		move	CursorXPos(a4),d0
		lea	MarkXPos(a3),a2
		move.b	(a2,d0.w),d0
.getcolumns	move	_CopyMarkX2(a5),d1
		sub	_CopyMarkX1(a5),d1
		bpl.b	.getrows
		neg	d1
.getrows	move	_CopyMarkY2(a5),d2
		sub	_CopyMarkY1(a5),d2
		bpl.b	.okeej
		neg	d2
.okeej		move	d0,d3
		move	d1,d4
.testloop	move.l	a0,a1
		add	#part_SIZEOF,a1
		move	d0,d5
		add	d5,d5
		add	d5,a1
		move	d2,d5
.test		sub	#12,a1
		tst	(a1)
		bne	.exit		;Request data will be loss at end of part
		dbf	d5,.test
		subq	#1,d4
		bmi.b	.getrow
		addq	#1,d3
		cmp	#6,d3
		bne.b	.testloop

.getrow		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		move	d0,d5
		move	d1,d7
.moveagain	move.l	DataPtr(a4),a0
		add	#part_SIZEOF-12,a0
		move.l	a0,a1
		move	d5,d4
		add	d4,d4
		add	d4,a0
		add	d4,a1
		move	d3,d4
		add	d2,d4
		addq	#1,d4
		cmp	#128,d4
		bge.b	.next
		move	d2,d4
		addq	#1,d4
		mulu	#12,d4
		sub.l	d4,a0
		move	MaxYPos(a4),d4
		sub	d2,d4
.moveloop	move	(a0),(a1)
		sub	#12,a0
		sub	#12,a1
		subq	#1,d4
		cmp	d3,d4
		bgt.b	.moveloop
.next		subq	#1,d7
		bmi.b	.renumber
		addq	#1,d5
		cmp	#6,d5
		bne.b	.moveagain

.renumber	tst	d0
		bne.b	.exit
		move.l	DataPtr(a4),a0
		move	MaxYPos(a4),d1
		addq	#1,d2
.search		move.b	(a0),d0
		bclr	#7,d0
		beq.b	.okej
		cmp.b	d0,d3
		bhi.b	.okej
		add.b	d2,d0
		or.b	#$80,d0
		move.b	d0,(a0)
.okej		add	RowSize(a4),a0
		dbf	d1,.search
.exit		rts

DelPartLines	lea	PartEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq	.exit
.getcolumn	lea	PartMarkEdDefs,a3
		move	CursorXPos(a4),d0
		lea	MarkXPos(a3),a2
		move.b	(a2,d0.w),d0
.getcolumns	move	_CopyMarkX2(a5),d1
		sub	_CopyMarkX1(a5),d1
		bpl.b	.getrows
		neg	d1
.getrows	move	_CopyMarkY2(a5),d2
		sub	_CopyMarkY1(a5),d2
		bpl.b	.getrow
		neg	d2
.getrow		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		move	d0,d5
		move	d1,d7
.moveagain	move.l	DataPtr(a4),a1
		move	d5,d6
		add	d6,d6
		add	d6,a1
		move	d3,d4
		mulu	RowSize(a4),d4
		add	d4,a1
		move.l	a1,a0
		move	d2,d4
		addq	#1,d4
		mulu	RowSize(a4),d4
		add	d4,a0
		move	MaxYPos(a4),d4
		sub	d2,d4
.moveloop	move	(a0),(a1)
		add	#12,a0
		add	#12,a1
		subq	#1,d4
		cmp	d3,d4
		bhi.b	.moveloop
		move	d2,d6
.clear		sub	#12,a0
		clr	(a0)
		dbf	d6,.clear
		subq	#1,d7
		bmi.b	.renumber
		addq	#1,d5
		cmp	#6,d5
		bne.b	.moveagain

.renumber	tst	d0
		bne.b	.exit
		move.l	DataPtr(a4),a0
		moveq	#0,d1
		addq	#1,d2
.search		moveq	#0,d0
		move.b	(a0),d0
		bclr	#7,d0
		beq.b	.okej
		cmp	d0,d3
		bhs.b	.okej
		sub	d2,d0
		cmp	d0,d3
		ble.b	.okeej
		move	d1,d0
.okeej		or	#$80,d0
		move.b	d0,(a0)
.okej		add	RowSize(a4),a0
		addq	#1,d1
		cmp	MaxYPos(a4),d1
		bls.b	.search
.exit		move.l	_RastPort1(a5),d6
		rts

DelCheckArpg	move	_ie_Qual(a5),d0
		and	#IEQUALIFIER_LSHIFT!IEQUALIFIER_RSHIFT,d0
		bne	ClrArpgLine
		move	CursorXPos(a4),d0
		beq.b	ArpNote
		bra	DelWs

EditArpg	bsr	CursorSave
		move.b	_RawKey(a5),d0
		cmp.b	#$41,d0
		beq	DelArpgLine
		cmp.b	#$44,d0
		beq	InsArpgLine
		cmp.b	#$46,d0
		beq	DelCheckArpg
		move	CursorXPos(a4),d0
		bne	WS
ArpNote		move.b	_RawKey(a5),d2
		cmp.b	#$46,d2
		beq.b	.ok
		move	_Qualifier(a5),d1
		btst	#IEQUALIFIERB_REPEAT,d1
		bne.b	.exit
.ok		move	_KeybListSize(a5),d1
		move.l	_KeybListPtr(a5),a2
.search		cmp.b	(a2)+,d2
		beq.b	.found
		dbf	d1,.search
.exit		rts
.found		add	_KeybListSize1(a5),a2
ArpgEnd		jsr	AllocArpg
		jsr	NormalDrawMode0
		lea	XPositions(a4),a0
		move	CursorXPos(a4),d0
		add	d0,d0
		move	(a0,d0.w),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		addq	#6,d1
		add	Y1Pos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#0,d1
		move.b	(a2),d1
		move	d1,d7
		beq.b	.note
		cmp	#61,d1
		beq.b	.nonote
		cmp	#$80,d1
		bne.b	.okeej
		move	#62,d1
		move	d1,d7
		bra.b	.nonote
.okeej		add	_OctaveAdder(a5),d1
		move	d1,d7
		tst.b	_TransFixNote(a5)
		bne.b	.note
		sub.b	_ZeroNote(a5),d1
		move	d1,d7
		sub.b	#61,d7
		add	d1,d1
		lea	_AscIIHexTab(a5),a0
		lea	_String(a5),a1
		add	d1,a0
		move.b	#" ",(a1)+
		move.b	(a0)+,(a1)+
		move.b	(a0)+,(a1)+
		move.b	#" ",(a1)+
		lea	_String(a5),a0
		bra.b	.print
.nonote		move	d1,d7
		move	d7,d1
.note		add	d1,d1
		add	d1,d1
		lea	AscIINotes,a0
		add	d1,a0
.print		move.l	d6,a1
		moveq	#3,d0
		CallLib Text
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a0
		move.b	d7,(a0)
		tst.b	_ArpEdMode(a5)
		beq	VoiceVert2
		cmp.b	#1,_ArpEdMode(a5)
		bne	VoiceVert2
		bra	Horizontal
WS		lea	HexChars,a2
		move.b	_AscIIKey(a5),d4
		moveq	#21,d7
.search2	cmp.b	(a2)+,d4
		beq.b	.found_char
		dbf	d7,.search2
		rts
.found_char	cmp.b	#5,d7
		bgt.b	.upper
		sub.b	#$20,d4
.upper		jsr	AllocArpg
		jsr	NormalDrawMode0
		lea	XPositions(a4),a0
		move	CursorXPos(a4),d0
		add	d0,d0
		move	(a0,d0.w),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		addq	#6,d1
		add	Y1Pos(a4),d1
		move.l	d6,a1
		CallLib Move
		moveq	#1,d0
		lea	_String(a5),a0
		move.b	d4,(a0)
		move.l	d6,a1
		CallLib Text
		add	#21,a2
		move.b	(a2),d4
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a0
		move	CursorXPos(a4),d1
		lea	ArpOffset,a1
		moveq	#0,d2
		move.b	(a1,d1.w),d2
		add	d2,a0
		move.b	9(a1,d1.w),d1
		tst.b	d1
		beq.b	.noshift
		move.b	(a0),d0
		and	#$f,d0
		lsl	#4,d4
		or.b	d4,d0
		move.b	d0,(a0)
.firstbyte	tst.b	_ArpEdMode(a5)
		beq	VoiceVert2
		addq	#1,CursorXPos(a4)
		bra	DrawCursor2
.noshift	move.b	(a0),d0
		and	#$f0,d0
		or.b	d4,d0
		move.b	d0,(a0)
		move	CursorXPos(a4),d1
		cmp	#3,d1
		beq.b	.firstbyte
		cmp	#6,d1
		beq.b	.firstbyte
		tst.b	_ArpEdMode(a5)
		beq	VoiceVert2
		cmp.b	#1,_ArpEdMode(a5)
		beq	Horizontal
		subq	#1,CursorXPos(a4)
		cmp	#3,d1
		blo	VoiceVert2
		subq	#1,CursorXPos(a4)
		bra	VoiceVert2

ArpOffset	dc.b	0,1,1,2,3,3,4,5,5
ArpShift	dc.b	0,1,0,0,1,0,0,1,0
ArpXPos		dc.b	0,1,1,3,3,3,6,6,6

DelWs		jsr	AllocArpg
		jsr	NormalDrawMode0
		move	CursorXPos(a4),d0
		lea	ArpXPos,a1
		move.b	(a1,d0.w),d0
		move	d0,d3
		add	d0,d0
		move	XPositions(a4,d0.w),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		addq	#6,d1
		add	Y1Pos(a4),d1
		move.l	d6,a1
		CallLib Move
		move.l	DataPtr(a4),a2
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a2
		lea	_String(a5),a0
		move.l	#$30303000,(a0)
		move.l	d6,a1
		cmp.b	#1,d3
		bne.b	.fx1
.ws		moveq	#2,d0
		CallLib Text
		clr.b	1(a2)
		tst.b	_ArpEdMode(a5)
		beq.b	VoiceVert2
		cmp.b	#1,_ArpEdMode(a5)
		bne.b	VoiceVert2
		move	#3,CursorXPos(a4)
		bra	CursorDraw
.fx1		cmp.b	#3,d3
		bne.b	.fx2
		moveq	#3,d0
		CallLib Text
		clr	2(a2)
		tst.b	_ArpEdMode(a5)
		beq.b	VoiceVert2
		cmp.b	#1,_ArpEdMode(a5)
		bne.b	VoiceVert2
		move	#6,CursorXPos(a4)
		bra	CursorDraw
.fx2		cmp.b	#6,d3
		bne.b	VoiceVert2
		moveq	#3,d0
		CallLib Text
		clr	4(a2)
		tst.b	_ArpEdMode(a5)
		beq.b	VoiceVert2
		cmp.b	#1,_ArpEdMode(a5)
		bne.b	VoiceVert2
		clr	CursorXPos(a4)
		bra	CursorDraw

VoiceVert2	bsr	CursorDownScroll
DrawCursor2	bra	CursorDraw

ClrArpgLine	jsr	AllocArpg
		jsr	NormalDrawMode0
		move	XPositions(a4),d0
		move	CursorYPos(a4),d1
		lsl	#3,d1
		addq	#6,d1
		add	Y1Pos(a4),d1
		move	d0,d2
		move	d1,d3
		move.l	d6,a1
		CallLib Move
		moveq	#3,d0
		lea	AscIINotes,a0
		move.l	d6,a1
		CallLib Text
		add	#29,d2
		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		moveq	#2,d0
		lea	_String(a5),a0
		move.l	#$30303000,(a0)
		move.l	d6,a1
		CallLib Text
		add	#21,d2
		moveq	#1,d4
.loopa		move	d2,d0
		move	d3,d1
		move.l	d6,a1
		CallLib Move
		lea	_String(a5),a0
		moveq	#3,d0
		move.l	d6,a1
		CallLib Text
		add	#29,d2
		dbf	d4,.loopa
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		mulu	RowSize(a4),d0
		add	d0,a0
		clr	(a0)+
		clr.l	(a0)+
		bsr	CursorDownScroll
		bra	DrawCursor2

InsArpgLine	jsr	GetArpgPtr
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		cmp	#127,d0
		beq	.exit
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	.noins
		add	#arpg_SIZEOF,a0
		move.l	a0,a1
		sub	RowSize(a4),a0
		move	(a0),d1
		or	2(a0),d1
		or	4(a0),d1
		bne.b	.exit
		move	MaxYPos(a4),d1
.loop		move.l	-(a0),-(a1)
		move	-(a0),-(a1)
		subq	#1,d1
		cmp	d0,d1
		bne	.loop
		clr	(a0)+
		clr.l	(a0)+

		move.l	DataPtr(a4),a0
		move	#127,d1
		move	#62,d2
.search		cmp.b	(a0),d2
		bne.b	.ok
		cmp.b	1(a0),d0
		bgt.b	.ok
		addq.b	#1,1(a0)
.ok		add	RowSize(a4),a0
		dbf	d1,.search

.noins		move	CursorYPos(a4),d0
		cmp	ScrollDownPos(a4),d0
		bge.b	.scroll
.noscroll	addq	#1,CursorYPos(a4)
		move	NumYPos(a4),d0
		cmp	CursorYPos(a4),d0
		bge.b	.scrolla
		move	d0,CursorYPos(a4)
		bra.b	.scrolla
.scroll		addq	#1,MinYPos(a4)
		move	MinYPos(a4),d0
		move	MaxYPos(a4),d1
		sub	NumYPos(a4),d1
		cmp	d1,d0
		ble.b	.scrolla
		move	d1,MinYPos(a4)
		bra	.noscroll
.scrolla	jsr	UpdateArpg
		jsr	CursorDraw
.exit		rts

DelArpgLine	jsr	GetArpgPtr
		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		beq 	.exit
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	.nodel
		move	d0,d1
		mulu	RowSize(a4),d1
		add	d1,a0
		move.l	a0,a1
		sub	RowSize(a4),a1
.loop		move	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		addq	#1,d0
		cmp	#128,d0
		bne	.loop
		clr.l	-(a0)
		clr	-(a0)

		move.l	DataPtr(a4),a0
		move	MinYPos(a4),d0
		add	CursorYPos(a4),d0
		move	MaxYPos(a4),d1
		move	#62,d2
.search		cmp.b	(a0),d2
		bne.b	.ok
		cmp.b	1(a0),d0
		bgt.b	.ok
		subq.b	#1,1(a0)
.ok		add	RowSize(a4),a0
		dbf	d1,.search

.nodel		move	CursorYPos(a4),d0
		cmp	ScrollUpPos(a4),d0
		ble.b	.scroll
.noscroll	subq	#1,CursorYPos(a4)
		bge.b	.scrolla
		clr	CursorYPos(a4)
		bra.b	.scrolla
.scroll		subq	#1,MinYPos(a4)
		bge.b	.scrolla
		clr	MinYPos(a4)
		bra	.noscroll
.scrolla	jsr	UpdateArpg
		jsr	CursorDraw
.exit		rts

DelArpgLines	lea	ArpgEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	.exit
.getrows	move	_CopyMarkY2(a5),d2
		sub	_CopyMarkY1(a5),d2
		bpl.b	.getrow
		neg	d2
.getrow		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		move.l	DataPtr(a4),a1
		move	d3,d4
		mulu	RowSize(a4),d4
		add	d4,a1
		move.l	a1,a0
		move	d2,d4
		addq	#1,d4
		mulu	RowSize(a4),d4
		add	d4,a0
		move	MaxYPos(a4),d4
		sub	d2,d4
.moveloop	move	(a0)+,(a1)+
		move.l	(a0)+,(a1)+
		subq	#1,d4
		cmp	d3,d4
		bhi.b	.moveloop
		move	d2,d6
.clear		clr.l	-(a0)
		clr	-(a0)
		dbf	d6,.clear

.renumber	move.l	DataPtr(a4),a0
		moveq	#0,d1
		addq	#1,d2
		moveq	#62,d4
.search		move.b	(a0),d0
		cmp.b	d4,d0
		bne.b	.okej
		moveq	#0,d0
		move.b	1(a0),d0
		cmp	d0,d3
		bhs.b	.okeej
		sub	d2,d0
		cmp	d0,d3
		ble.b	.okeej
		move	d1,d0
.okeej		move.b	d0,1(a0)
.okej		add	RowSize(a4),a0
		addq	#1,d1
		cmp	MaxYPos(a4),d1
		bls.b	.search
.exit		move.l	_RastPort2(a5),d6
		rts

InsArpgLines	lea	ArpgEditorDefs,a4
		move.l	DataPtr(a4),a0
		lea	_ZeroBuffer(a5),a1
		cmp.l	a0,a1
		beq.b	.exit

.getrows	move	_CopyMarkY2(a5),d2
		sub	_CopyMarkY1(a5),d2
		bpl.b	.testloop
		neg	d2
.testloop	move.l	a0,a1
		add	#arpg_SIZEOF,a1
		move	d2,d5
.test		move	-(a1),d0
		or	-(a1),d0
		or	-(a1),d0
		bne.b	.exit		;Request data will be loss at end of arpg
		dbf	d5,.test

.getrow		move	MinYPos(a4),d3
		add	CursorYPos(a4),d3
		move.l	DataPtr(a4),a0
		add	#arpg_SIZEOF,a0
		move.l	a0,a1
		addq	#1,d2
		move	d3,d4
		add	d2,d4
		cmp	#128,d4
		bge.b	.exit
		move	d2,d4
		mulu	RowSize(a4),d4
		sub.l	d4,a0
		move	MaxYPos(a4),d4
		sub	d2,d4
.moveloop	move.l	-(a0),-(a1)
		move	-(a0),-(a1)
		subq	#1,d4
		cmp	d3,d4
		bge.b	.moveloop

.renumber	move.l	DataPtr(a4),a0
		move	MaxYPos(a4),d1
		moveq	#62,d4
.search		move.b	(a0),d0
		cmp.b	d4,d0
		bne.b	.okej
		moveq	#0,d0
		move.b	1(a0),d0
		cmp	d0,d3
		bhi.b	.okej
		add	d2,d0
		move.b	d0,1(a0)
.okej		add	RowSize(a4),a0
		dbf	d1,.search
.exit		rts

MarkEditor	move	im_Qualifier(a4),d1
		lea	TuneMarkEdDefs,a4
		cmp.b	#1,_TunePart(a5)
		beq.b	.ok
		lea	PartMarkEdDefs,a4
		cmp.b	#2,_TunePart(a5)
		beq.b	.ok
		bra	.reply
.ok		btst	#IEQUALIFIERB_LSHIFT,d1
		bne.b	.shift
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.shift
		cmp.b	#CURSORUP,d0
		beq	MarkUp
		cmp.b	#CURSORDOWN,d0
		beq	MarkDown
		cmp.b	#CURSORLEFT,d0
		beq	MarkLeft
		cmp.b	#CURSORRIGHT,d0
		beq	MarkRight
		bra.b	.exit
.shift		cmp.b	#CURSORUP,d0
		beq	MarkShiftUp
		cmp.b	#CURSORDOWN,d0
		beq	MarkShiftDown
.exit		cmp.b	#$45,d0
		bne.b	.reply
		bsr	MarkClear
		cmp.b	#1,_TunePart(a5)
		bne.b	.part
		move.b	#1,_StepArrowClear(a5)
		jsr	StepArrowMark
		lea	TuneEditorDefs,a4
		jsr	PrintTune
		jsr	StepArrow
		bra.b	.okej
.part		move.b	#1,_PartArrowClear(a5)
		jsr	PartArrowMark
		lea	PartEditorDefs,a4
		jsr	PrintPart
		jsr	PartArrow
.okej		bsr	PaintCursor
		and.b	#$7f,_MarkEd(a5)
.reply		rts

MarkUp		bsr	MarkSave
		bsr	CursorUpScroll
		cmp.b	#1,_TunePart(a5)
		bne.b	.notune
		jsr	StepArrowMark
		bra.b	.goon
.notune		jsr	PartArrowMark
.goon		bra	MarkDraw

MarkDown	bsr	MarkSave
		bsr	CursorDownScroll
		cmp.b	#1,_TunePart(a5)
		bne.b	.notune
		jsr	StepArrowMark
		bra.b	.goon
.notune		jsr	PartArrowMark
.goon		bra	MarkDraw

MarkLeft	bsr	MarkSave
		bsr	CursorLeft
		bra	MarkDraw

MarkRight	bsr	MarkSave
		bsr	CursorRight
		bra	MarkDraw

MarkShiftUp	bsr	MarkSave
		bsr	CursorUpShift
		cmp.b	#1,_TunePart(a5)
		bne.b	.notune1
		move.b	#1,_StepArrowClear(a5)
		jsr	StepArrowMark
		bra.b	.goon1
.notune1	move.b	#1,_PartArrowClear(a5)
		jsr	PartArrowMark
.goon1		cmp.b	#1,_TunePart(a5)
		bne.b	.notune2
		jsr	StepArrowMark
		bra.b	.goon2
.notune2	jsr	PartArrowMark
.goon2		bra	MarkDraw

MarkShiftDown	bsr	MarkSave
		bsr	CursorDownShift
		cmp.b	#1,_TunePart(a5)
		bne.b	.notune1
		move.b	#1,_StepArrowClear(a5)
		jsr	StepArrowMark
		bra.b	.goon1
.notune1	move.b	#1,_PartArrowClear(a5)
		jsr	PartArrowMark
.goon1		cmp.b	#1,_TunePart(a5)
		bne.b	.notune2
		jsr	StepArrowMark
		bra.b	.goon2
.notune2	jsr	PartArrowMark
.goon2		bra.b	MarkDraw

ArpgMarkEditor	move	im_Qualifier(a4),d1
		lea	ArpgMarkEdDefs,a4
		btst	#IEQUALIFIERB_LSHIFT,d1
		bne.b	.shift
		btst	#IEQUALIFIERB_RSHIFT,d1
		bne.b	.shift
		cmp.b	#CURSORUP,d0
		beq.b	ArpgMarkUp
		cmp.b	#CURSORDOWN,d0
		beq.b	ArpgMarkDown
		bra.b	.exit
.shift		cmp.b	#CURSORUP,d0
		beq.b	ArpgMarkShiftUp
		cmp.b	#CURSORDOWN,d0
		beq.b	ArpgMarkShiftDown
.exit		cmp.b	#$45,d0
		bne.b	.reply
		bsr.b	MarkClear
		lea	ArpgEditorDefs,a4
		jsr	PrintArpg
		bsr	PaintCursor
		and.b	#$f7,_MarkEd(a5)
.reply		rts

ArpgMarkUp	bsr.b	MarkSave
		bsr	CursorUpScroll
		bra.b	MarkDraw

ArpgMarkDown	bsr.b	MarkSave
		bsr	CursorDownScroll
		bra.b	MarkDraw

ArpgMarkShiftUp	bsr.b	MarkSave
		bsr	CursorUpShift
		bra.b	MarkDraw
ArpgMarkShiftDown
		bsr.b	MarkSave
		bsr	CursorDownShift
		bra.b	MarkDraw

_MarkSave	rs.w	4

MarkClear	bsr.b	MarkSave
		bra.b	ClearMark

MarkSave	bsr.b	CalcMark
		movem	d0-d3,_MarkSave(a5)
		rts

MarkDraw	bsr.b	CalcMark
		lea	_MarkSave(a5),a0
		cmp	(a0)+,d0
		bne.b	.markdraw
		cmp	(a0)+,d1
		bne.b	.markdraw
		cmp	(a0)+,d2
		bne.b	.markdraw
		cmp	(a0)+,d3
		bne.b	.markdraw
		rts
.markdraw	bsr.b	ClearMark
		bra.b	PaintMark

ClearMark	moveq	#0,d0
		move.l	d6,a1
		CallLib SetAPen
		move	#RP_JAM1!RP_COMPLEMENT,d0
		move.l	d6,a1
		CallLib SetDrMd
		jsr	MaskBit0
		movem	_MarkSave(a5),d0-d3
		move.l	d6,a1
		CallLib RectFill
		rts

PaintMark	moveq	#2,d0
		move.l	d6,a1
		CallLib SetAPen
		move	#RP_JAM1!RP_COMPLEMENT,d0
		move.l	d6,a1
		CallLib SetDrMd
		jsr	MaskBit0
		bsr.b	CalcMark
		move.l	d6,a1
		CallLib RectFill
		rts

CalcMark	move.l	MarkStartPtr(a4),a0
		move.l	MarkStopPtr(a4),a1
		move	_TempCopyMarkX(a5),d1
		add	d1,d1
		move	CursorXPos(a4),d3
		add	d3,d3
		cmp	d1,d3
		bge.b	.ok
		exg	d1,d3
.ok		move	(a0,d1.w),d0
		move	(a1,d3.w),d2
		move	_TempCopyMarkY(a5),d1
		move	CursorYPos(a4),d3
		add	MinYPos(a4),d3
		cmp	d1,d3
		bge.b	.ok1
		exg	d1,d3
.ok1		sub	MinYPos(a4),d1
		bpl.b	.ok2
		clr	d1
.ok2		sub	MinYPos(a4),d3
		cmp	NumYPos(a4),d3
		ble.b	.ok3
		move	NumYPos(a4),d3
.ok3		mulu	ScrollNum(a4),d1
		mulu	ScrollNum(a4),d3
		add	Y1Pos(a4),d1
		add	Y1Pos(a4),d3
		add	FontYSize(a4),d3
		rts

	     IFNE CON_IDOffsets
IDCheck		move.l	#ID3_Offset,d0
		add.l	#ID1_Offset,d0
		sub.l	#ID2_Offset,d0
		add.l	#ID3.2_Offset,d0
		rts
	     ENDC



 ifne DEBUG 
desmsgDebugAndPrint
	* sp contains the return address, which is
	* the string to print
	movem.l	d0-d7/a0-a3/a6,-(sp)
	* get string
	move.l	4*(8+4+1)(sp),a0
	* find end of string
	move.l	a0,a1
.e	tst.b	(a1)+
	bne.b	.e
	move.l	a1,d7
	btst	#0,d7
	beq.b	.even
	addq.l	#1,d7
.even
	* overwrite return address 
	* for RTS to be just after the string
	move.l	d7,4*(8+4+1)(sp)

	lea	debugDesBuf(pc),a3
	move.l	sp,a1	
    lea     .putCharSerial(pc),a2
	move.l	4.w,a6
	jsr     _LVORawDoFmt(a6)
	movem.l	(sp)+,d0-d7/a0-a3/a6
	rts	* teleport!
.putc	
	move.b	d0,(a3)+	
	rts
.putCharSerial
    move.l  4.w,a6
    jsr     -516(a6)
    rts

debugDesBuf		ds.b	1024

 endif ;; DEBUG







* Twins/PHA *****************************************************************
* Data                                                Last Change: 92-10-24 *
*****************************************************************************

CursorXPos	=	0
CursorYPos	=	2
ScrollUpPos	=	4
ScrollDownPos	=	6
ScrollNum	=	8
FontYSize	=	10
NumXPos		=	12
NumYPos		=	14
MinYPos		=	16
MaxYPos		=	18
X1CharPos	=	20
Y1CharPos	=	22
X1Pos		=	24
Y1Pos		=	26
XSize		=	28
YSzie		=	30
RowSize		=	32
DataPtr		=	34
PrintPtr	=	38
XPositions	=	42
MarkStartPtr	=	42
MarkStopPtr	=	46
MarkXPos	=	50

TuneEditorDefs	dc.w	0		; CursorXPos
		dc.w	0		; CursorYPos
		dc.w	3		; ScrollUpPos
		dc.w	4		; ScrollDownPos
		dc.w	6		; ScrollNum
		dc.w	7-1		; FontYSzie
		dc.w	8*5-1		; NumXPos-1
		dc.w	8-1		; NumYPos-1
		dc.w	0		; MinYPos
		dc.w	255		; MaxYPos
		dc.w	12		; X1CharPos   ___top,left char pos
		dc.w	44+6		; Y1CharPos+6 _/
		dc.w	12		; X1Pos __
		dc.w	44		; Y1Pos _ \
		dc.w	463		; XSzie _\_\__area to scroll
		dc.w	48-6		; YSize _/
		dc.w	2		; Row size
TunePtr		dc.l	0		; TunePointer
		dc.l	PrintTune
TuneEditorXCoords
TX		set	36					Cursor left coord
		rept	8
		dc.w	TX,TX+8,TX+16,TX+32,TX+40		Cursor
TX		set	TX+56					XPositions
		endr


TuneMarkEdDefs	dc.w	0		; CursorXPos
		dc.w	0		; CursorYPos
		dc.w	3		; ScrollUpPos
		dc.w	4		; ScrollDownPos
		dc.w	6		; ScrollNum
		dc.w	7-1		; FontYSzie
		dc.w	8-1		; NumXPos-1
		dc.w	8-1		; NumYPos-1
		dc.w	0		; MinYPos
		dc.w	255		; MaxYPos
		dc.w	12		; X1CharPos   ___top,left char pos
		dc.w	44+6		; Y1CharPos+6 _/
		dc.w	12		; X1Pos __
		dc.w	44		; Y1Pos _ \
		dc.w	463		; XSize _\_\__area to scroll
		dc.w	48-6		; YSize _/    (- scrollnum)
		dc.w	2		; Row size
		dc.l	0		; TunePointer
		dc.l	PrintTune
		dc.l	TuneMarkStart
		dc.l	TuneMarkStop
TuneMarkXPos	dc.b	0,0,0,0,0,1,1,1,1,1,2,2,2,2,2,3,3,3,3,3
		dc.b	4,4,4,4,4,5,5,5,5,5,6,6,6,6,6,7,7,7,7,7
TuneMarkStart
TX		set	36					Cursor left coord
		rept	8
		dc.w	TX					Cursor
TX		set	TX+56					XPositions
		endr
TuneMarkStop
TX		set	83					Cursor left coord
		rept	8
		dc.w	TX					Cursor
TX		set	TX+56					XPositions
		endr

PartEditorDefs	dc.w	0
		dc.w	0
		dc.w	7
		dc.w	8
		dc.w	8		; ScrollNum
		dc.w	8-1		; FontYSzie
		dc.w	25-1
		dc.w	16-1
		dc.w	0
		dc.w	127
		dc.w	12
		dc.w	112+6
		dc.w	12
		dc.w	112
		dc.w	271
		dc.w	126-7
		dc.w	12
PartPtr		dc.l	0
		dc.l	PrintPart
PX		set	36					Cursor left coord
		dc.w	PX,PX+8,PX+16,PX+32,PX+40
PX		set	PX+56
		rept	5
		dc.w	PX,PX+8,PX+16,PX+24			Cursor
PX		set	PX+40					XPositions
		endr

PartMarkEdDefs	dc.w	0		; CursorXPos
		dc.w	0		; CursorYPos
		dc.w	7		; ScrollUpPos
		dc.w	8		; ScrollDownPos
		dc.w	8		; ScrollNum
		dc.w	8-1		; FontYSzie
		dc.w	6-1		; NumXPos-1
		dc.w	16-1		; NumYPos-1
		dc.w	0		; MinYPos
		dc.w	127		; MaxYPos
		dc.w	12		; X1CharPos   ___top,left char pos
		dc.w	112+6		; Y1CharPos+6 _/
		dc.w	12		; X1Pos __
		dc.w	112		; Y1Pos _ \
		dc.w	271		; XSize _\_\__area to scroll
		dc.w	126-7		; YSize _/
		dc.w	12		; Row size
		dc.l	0		; PartPointer
		dc.l	PrintPart
		dc.l	PartMarkStart
		dc.l	PartMarkStop
PartMarkXPos	dc.b	0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0
PartMarkStart
PX		set	36					Cursor left coord
		dc.w	PX
PX		set	PX+56
		rept	5
		dc.w	PX					Cursor
PX		set	PX+40					XPositions
		endr
PartMarkStop
PX		set	83					Cursor left coord
		rept	6
		dc.w	PX					Cursor
PX		set	PX+40					XPositions
		endr

ArpgEditorDefs	dc.w	0
		dc.w	0
		dc.w	5
		dc.w	6
		dc.w	8		; ScrollNum
		dc.w	8-1		; FontYSzie
		dc.w	9-1
		dc.w	12-1
		dc.w	0
		dc.w	127
		dc.w	500
		dc.w	28+6
		dc.w	500
		dc.w	28
		dc.w	123
		dc.w	94-7
		dc.w	6
ArpgPtr		dc.l	0
		dc.l	PrintArpg
		dc.w	521,550,558,571,579,587,600,608,616

ArpgMarkEdDefs	dc.w	0
		dc.w	0
		dc.w	5
		dc.w	6
		dc.w	8		; ScrollNum
		dc.w	8-1		; FontYSzie
		dc.w	1-1
		dc.w	12-1
		dc.w	0
		dc.w	127
		dc.w	500
		dc.w	28+6
		dc.w	500
		dc.w	28
		dc.w	123
		dc.w	94-7
		dc.w	6
		dc.l	0
		dc.l	PrintArpg
		dc.l	ArpgMarkStart
		dc.l	ArpgMarkStop
ArpgMarkXPos	dc.b	0,0,0,0,0,0,0,0,0,0
ArpgMarkStart	dc.w	521	; XStart
ArpgMarkStop	dc.w	623	; XStop

HexChars	dc.b	"0123456789ABCDEFabcdef"
		dc.b	0,1,2,3,4,5,6,7,8,9
		dc.b	10,11,12,13,14,15
		dc.b	10,11,12,13,14,15
		even

_KeybListPtr	rs.l	1
_KeybListSize	rs.w	1
_KeybListSize1	rs.w	1
_KeybListSize2	rs.w	1

RawKeyNotesEuro	dc.b	$46,$59,$58
		dc.b	$30,$20,$31,$21,$32,$33,$23,$34,$24,$35,$25,$36
		dc.b	$37,$27,$38,$28,$39,$3a,$2a
		dc.b	$10,$02,$11,$03,$12,$13,$05,$14,$06,$15,$07,$16
		dc.b	$17,$09,$18,$0a,$19,$1a,$0c,$1b,$0d

NumKeyNotesEuro	dc.b	0,61,$80
		dc.b	01,02,03,04,05,06,07,08,09,10,11,12
		dc.b	13,14,15,16,17,18,19
		dc.b	13,14,15,16,17,18,19,20,21,22,23,24
		dc.b	25,26,27,28,29,30,31,32,33

RawKeyNotesUsa	dc.b	$46,$59,$58
		dc.b	$31,$21,$32,$22,$33,$34,$24,$35,$25,$36,$26,$37
		dc.b	$38,$28,$39,$29,$3a
		dc.b	$10,$02,$11,$03,$12,$13,$05,$14,$06,$15,$07,$16
		dc.b	$17,$09,$18,$0a,$19,$1a,$0c,$1b,$0d

NumKeyNotesUsa	dc.b	0,61,$80
		dc.b	01,02,03,04,05,06,07,08,09,10,11,12
		dc.b	13,14,15,16,17
		dc.b	13,14,15,16,17,18,19,20,21,22,23,24
		dc.b	25,26,27,28,29,30,31,32,33
		even

AscIINotes	dc.b	"--- "
		dc.b	"C-1 C#1 D-1 D#1 E-1 F-1 F#1 G-1 G#1 A-1 A#1 B-1 "
		dc.b	"C-2 C#2 D-2 D#2 E-2 F-2 F#2 G-2 G#2 A-2 A#2 B-2 "
		dc.b	"C-3 C#3 D-3 D#3 E-3 F-3 F#3 G-3 G#3 A-3 A#3 B-3 "
		dc.b	"C-4 C#4 D-4 D#4 E-4 F-4 F#4 G-4 G#4 A-4 A#4 B-4 "
		dc.b	"C-5 C#5 D-5 D#5 E-5 F-5 F#5 G-5 G#5 A-5 A#5 B-5 "
		dc.b	$82,"-- ",$81,"-- "
		even

*--------------------------------------------

		incdir	Mline:raw/
SizerOffset256	incbin	sizeroffset.256
SizerOffset128	incbin	sizeroffset.128
SizerOffset64	incbin	sizeroffset.064
SizerOffset32	incbin	sizeroffset.032
SizerOffset16	incbin	sizeroffset.016
SizerTable256	incbin	sizertable.256
SizerTable128	incbin	sizertable.128
SizerTable64	incbin	sizertable.064
SizerTable32	incbin	sizertable.032
SizerTable16	incbin	sizertable.016
VolumeTables	incbin	volumelist.raw
Sine		incbin	mlsinus.raw
DownRamp	incbin	mldownramp.raw
SawTooth	incbin	mlsawtooth.raw
Square		incbin	mlsquare.raw
PalPitchTable	incbin	mlpalpitchtable32.raw
DefaultConfig	incbin	DefaultConfig
		cnop	0,4
HunkReloc32

*--------------------------------------------

_DmaWait1	rs.w	1
_DmaWait2	rs.w	1
_DmaWait3	rs.w	1
_DmaWait4	rs.w	1
_Arpg		rs.b	1
_TunePart	rs.b	1
_Voice		rs.w	1
_Buffer		rs.l	1
_String		rs.b	80
_MarkEd		rs.b	1
_CopyOf_	rs.b	1
_CopyMarkX1	rs.w	1
_CopyMarkY1	rs.w	1
_CopyMarkX2	rs.w	1
_CopyMarkY2	rs.w	1
_TempCopyMarkX	rs.w	1
_TempCopyMarkY	rs.w	1

_CopyBuffer	rs.b	256*2*8
_ZeroBuffer	rs.b	1536

_TuneNum	rs.w	1
_TuneMaxNum	rs.w	1
_TunePtrs	rs.l	256

_PartNum	rs.w	1
_PartPtr	rs.l	1
_PartPtrs	rs.l	1024

_ArpgPtr	rs.l	1
_ArpgPtrs	rs.l	256

_InstNum	rs.w	1
_InstMaxNum	rs.w	1
_InstPtrs	rs.l	256

_WsNum		rs.w	1
_WsMaxNum	rs.w	1
_WsPtrs		rs.l	256

_IFFData	rs.b	76

_TuningTone	rs.b	inst_SIZEOF

* Data_C ********************************************************************

		Section	Data_C,Data_C

Button1		incdir	Mline:raw/
		incbin	Images.raw
Button2		=	Button1+104
Button3		=	Button1+208
Button4		=	Button1+312
SineWave	incbin	Sinus.raw
PlayTextImage	incbin	PlayText.raw
EquMeterImage	incbin	EquMeter.raw
ZeroImage	dcb.b	92,0
WaitPointer	dc.w	$0000,$0000
		dc.w	$0400,$07c0
		dc.w	$0000,$07c0
		dc.w	$0100,$0380
		dc.w	$0000,$07e0
		dc.w	$07c0,$1ff8
		dc.w	$1ff0,$3fec
		dc.w	$3ff8,$7fde
		dc.w	$3ff8,$7fbe
		dc.w	$7ffc,$ff7f
		dc.w	$7efc,$ffff
		dc.w	$3ff8,$7ffe
		dc.w	$3ff8,$7ffe
		dc.w	$1ff0,$3ffc
		dc.w	$07c0,$1ff8
		dc.w	$0000,$07e0
ZeroSample	dc.w	$0000,$0000
WaveBuffer1	dcb.b	256,0
WaveBuffer2	dcb.b	256,0
WaveBuffer3	dcb.b	256,0
WaveBuffer4	dcb.b	256,0

* Bss ***********************************************************************

		Section	Bss,Bss

Bss_Size	rs.b	0
Bss		ds.b	Bss_Size

Channel1Buf	ds.b	ch_SIZEOF
Channel2Buf	ds.b	ch_SIZEOF
Channel3Buf	ds.b	ch_SIZEOF
Channel4Buf	ds.b	ch_SIZEOF
Channel5Buf	ds.b	ch_SIZEOF
Channel6Buf	ds.b	ch_SIZEOF
Channel7Buf	ds.b	ch_SIZEOF
Channel8Buf	ds.b	ch_SIZEOF
 
