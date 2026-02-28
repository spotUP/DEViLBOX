
	opt	o-,d-

	incdir	includes:
	include	misc/deliplayer6.i
	include	exec/exec.i

*******************************************************************************
*
* DeliPlayer for TFMX-Professional modules

; CHANGES from V2.11:
; * Limit for 7v added to EFFE 0003 command, checks for overly fast tempo.
; * Check routine changed; now ignores old-style timeshare commands.
; * Mods with CIA tempo as initial speed fixed.
; * Is aware of combined DMAoff+Reset/SetAddVol commands (GemX, Monkey Island)
; CHANGES from V2.14:
; * Fixed the timeshare bug in the check routine
; * Check for overly fast tempo was broken
; CHANGES from V2.15:
; * Added StopInt/StartInt to PrevPatt and NextPatt
; * The InfoDataBlock is cleared in INITDATA now
; * Prescale is no longer cleared in SONGPLAY/PLAYCONT
; CHANGES from V2.16:
; * Attempted to improve the WaitOnDMA routine
; * Fixed the DMA on/off handling
; CHANGES from V2.17:
; * Replaced all fixed structure definitions with 'rs.x'
; * Fixed the size of the InfoDataBlock
; * Added a missing cdb_PortaRate offset
; * Note: sometimes SaveLen is set to very large values (or even zero) => ugly noise
;         (CH's original player has the same problem)
; * Made the Random routine hardware-independent (it does no longer use $DFF006)
; CHANGES from V2.18:
; * Fixed another bug in the WaitOnDMA routine *argl*

* info data block equates
			rsreset
idb_Fade		rs.w	1
			rs.b	$1
idb_NewTrack		rs.b	1
idb_Cue			rs.w	8
idb_SIZEOF		rs.b	0

* master data block equates
			rsreset
mdb_MdatBase		rs.l	1
mdb_SmplBase		rs.l	1
mdb_WorkBase		rs.l	1
mdb_PlayerEnable	rs.b	1
mdb_EndFlag		rs.b	1

mdb_CurrSong		rs.b	1
mdb_FadeSlope		rs.b	1
mdb_RandomSeed		rs.w	1
mdb_LongStore		rs.l	1
mdb_SpeedCnt		rs.w	1

mdb_CIAsave		rs.w	1
mdb_SongCont		rs.b	1
mdb_SongNum		rs.b	1
mdb_PlayPattFlag	rs.w	1

mdb_MasterVol		rs.b	1
mdb_FadeDest		rs.b	1
mdb_FadeTime		rs.b	1
mdb_FadeReset		rs.b	1

mdb_TrackLoop		rs.w	1
mdb_TrackBase		rs.l	1
mdb_PattBase		rs.l	1

mdb_MacroBase		rs.l	1
mdb_SfxBase		rs.l	1

mdb_DMAon		rs.w	1
mdb_DMAoff		rs.w	1
mdb_DMAstate		rs.w	1
mdb_SIZEOF		rs.b	0

* pattern data block equates
			rsreset
pdb_FirstPos		rs.w	1
pdb_LastPos		rs.w	1
pdb_CurrPos		rs.w	1
pdb_Prescale		rs.w	1
pdb_PAddr		rs.l	1
			rs.b	4*8-4
pdb_PNum		rs.b	1
pdb_PXpose		rs.b	1
pdb_PLoop		rs.b	1
			rs.b	4*8-3
pdb_PStep		rs.w	1
pdb_PWait		rs.b	1
			rs.b	4*8-3
pdb_PRoAddr		rs.l	1
			rs.b	4*8-4
pdb_PRoStep		rs.w	1
			rs.b	4*8-2
pdb_SIZEOF		rs.b	0

* channel data block equates
			rsreset
cdb_MacroRun		rs.b	1
cdb_NewStyleMacro	rs.b	1
cdb_EfxRun		rs.b	1
cdb_AddBeginTime	rs.b	1
cdb_PrevNote		rs.b	1
cdb_CurrNote		rs.b	1
cdb_WaitDMACount	rs.w	1
cdb_Velocity		rs.w	1
cdb_Finetune		rs.w	1
cdb_MacroPtr		rs.l	1

cdb_MacroStep		rs.w	1
cdb_MacroWait		rs.w	1
cdb_DMAbit		rs.w	1
cdb_CurVol		rs.w	1
cdb_Loop		rs.b	1
cdb_AddBeginReset	rs.b	1
cdb_EnvReset		rs.b	1
cdb_EnvTime		rs.b	1
cdb_EnvEndvol		rs.b	1
cdb_EnvRate		rs.b	1

cdb_VibWidth		rs.b	1
cdb_VibFlag		rs.b	1	; set but not used by player... hmm
cdb_PortaReset		rs.b	1
cdb_PortaTime		rs.b	1
cdb_VibOffset		rs.w	1
cdb_VibReset		rs.b	1
cdb_VibTime		rs.b	1
cdb_DestPeriod		rs.w	1
cdb_CurAddr		rs.l	1

cdb_PortaRate		rs.w	1
cdb_PortaPer		rs.w	1
cdb_CurrLength		rs.w	1
cdb_KeyUp		rs.b	1
cdb_RandomNote		rs.b	1
cdb_ReturnPtr		rs.l	1
cdb_SfxFlag		rs.b	1
cdb_SfxPriority		rs.b	1
cdb_SfxLockTime		rs.w	1

cdb_ReturnStep		rs.w	1
cdb_SfxNum		rs.b	1
cdb_SIDSaveState	rs.b	1
cdb_ArpReset		rs.b	1
cdb_ArpFlags		rs.b	1
cdb_ArpTime		rs.b	1
cdb_ArpRun		rs.b	1
cdb_ArpPtr		rs.l	1

cdb_ArpStep		rs.w	1
cdb_ArpMacro		rs.b	1
cdb_ReallyWait		rs.b	1
cdb_NextChannel		rs.l	1
cdb_Hardware		rs.l	1
cdb_WorkBase		rs.l	1
cdb_AddBegin		rs.l	1

cdb_SIDSrcSample	rs.l	1
cdb_SIDSrcLength	rs.w	1
cdb_SIDSize		rs.w	1
cdb_SIDVib2Ofs		rs.l	1

cdb_SIDVib2Time		rs.w	1
cdb_SIDVib2Reset	rs.w	1
cdb_SIDVib2Width	rs.w	1
cdb_SIDFilterTC		rs.w	1
cdb_SIDVibOfs		rs.l	1
cdb_SIDFilterTime	rs.w	1
cdb_SIDFilterReset	rs.w	1

cdb_SIDFilterWidth	rs.w	1
cdb_SIDVibWidth		rs.w	1
cdb_SIDVibTime		rs.w	1
cdb_SIDVibReset		rs.w	1
cdb_SfxCode		rs.l	1
cdb_CurPeriod		rs.w	1

cdb_SaveAddr		rs.l	1
cdb_SaveLen		rs.w	1
cdb_LastLen		rs.w	1
cdb_WorkLen		rs.w	1
cdb_SIZEOF		rs.b	0

****************************************************************************

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b	'$VER: TFMX player module V2.19 (15 Jun 95)',0
	even

PlayerTagArray
	dc.l	DTP_RequestDTVersion,17
	dc.l	DTP_PlayerVersion,2<<16+19
	dc.l	DTP_PlayerName,PlayerName
	dc.l	DTP_Creator,CreatorName
	dc.l	DTP_DeliBase,dt_DeliGlob
	dc.l	DTP_Check2,dt_Check
	dc.l	DTP_CheckLen,dt_CheckEnd-dt_Check
	dc.l	DTP_InitNote,dt_InitNote
	dc.l	DTP_Flags,PLYF_SONGEND
	dc.l	DTP_ExtLoad,dt_ExtLoad
	dc.l	DTP_NoteStruct,dt_NotePlay
	dc.l	DTP_SubSongRange,dt_SubSongRange
	dc.l	DTP_InitPlayer,dt_InitPlayer
	dc.l	DTP_EndPlayer,dt_EndPlayer
	dc.l	DTP_InitSound,dt_InitSound
	dc.l	DTP_EndSound,dt_EndSound
	dc.l	DTP_Interrupt,dt_IrqIn
	dc.l	DTP_NextPatt,dt_NextPatt
	dc.l	DTP_PrevPatt,dt_PrevPatt
	dc.l	0

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PlayerName
	dc.b	'TFMX',0
CreatorName
	dc.b	'Chris Hülsbeck,',10
	dc.b	'noteplayer adaptation by Jon Pickard',10
	dc.b	0
	even

dt_DeliGlob
	dc.l	0
SubSongCnt
	dc.w	0
DMAChans
	dc.w	0
DMAAllow
	dc.w	0

dt_NotePlay
	dc.l	NS

NS
	dc.l	NC0
	dc.l	NSTF_EvenLength|NSTF_Period|NSTF_Signed|NSTF_8Bit|NSTF_NTSCTiming
	dc.l	28867
	dc.w	64
	dcb.b	18,0

NC0	dc.l	NC1
	dc.l	0
	dc.l	0
	dc.w	NCHD_FarLeft,0
	dc.l	0,0
	dc.l	0,0
	dc.l	0
	dc.w	0
	dcb.b	26,0
NC1	dc.l	NC2
	dc.l	0
	dc.l	0
	dc.w	NCHD_FarRight,0
	dc.l	0,0
	dc.l	0,0
	dc.l	0
	dc.w	0
	dcb.b	26,0
NC2	dc.l	NC3
	dc.l	0
	dc.l	0
	dc.w	NCHD_FarRight,0
	dc.l	0,0
	dc.l	0,0
	dc.l	0
	dc.w	0
	dcb.b	26,0
NC3	dc.l	NC4
	dc.l	0
	dc.l	0
	dc.w	NCHD_FarLeft,0
	dc.l	0,0
	dc.l	0,0
	dc.l	0
	dc.w	0
	dcb.b	26,0
NC4	dc.l	NC5
	dc.l	0
	dc.l	0
	dc.w	NCHD_Ignore,0
	dc.l	0,0
	dc.l	0,0
	dc.l	0
	dc.w	0
	dcb.b	26,0
NC5	dc.l	NC6
	dc.l	0
	dc.l	0
	dc.w	NCHD_Ignore,0
	dc.l	0,0
	dc.l	0,0
	dc.l	0
	dc.w	0
	dcb.b	26,0
NC6	dc.l	NC7
	dc.l	0
	dc.l	0
	dc.w	NCHD_Ignore,0
	dc.l	0,0
	dc.l	0,0
	dc.l	0
	dc.w	0
	dcb.b	26,0
NC7	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	NCHD_Ignore,0
	dc.l	0,0
	dc.l	0,0
	dc.l	0
	dc.w	0
	dcb.b	26,0

*-----------------------------------------------------------------------*
;
; Testet, ob es sich um ein TFMX-Modul handelt

dt_Check
	lea	.MagicCookies(PC),A0
.checklp
	tst.b	(A0)
	beq.s	.fail
	move.l	dtg_ChkData(A5),A1
.checkcmplp
	tst.b	(A0)
	beq.s	.match
	cmpm.b	(A0)+,(A1)+
	beq.s	.checkcmplp
.checksklp
	tst.b	(A0)+
	bne.s	.checksklp
	bra.s	.checklp

.match
	moveq	#0,d0
	rts
.fail
	moveq	#-1,d0
	rts

.MagicCookies
	dc.b	'tfmxsong',0
	dc.b	'TFMX-SONG',0
	dc.b	'TFMX_SONG',0
	dc.b	0 ; terminator
	even

dt_CheckEnd

*-----------------------------------------------------------------------*
;
; NoteStruct Initialization

dt_InitNote
	move.l	dtg_ChkData(a5),a0
	move.w	$100(A0),D0
	move.l	$1D0(A0),D1
	bne.s	.is_pro1
	move.l	#$800,D1
.is_pro1
	add.l	D1,A0
	moveq	#0,D1
	move.w	#$000F,D3
.songlp
	move.w	D0,D2
	lsl.w	#4,D2
	move.l	A0,A2
	add.w	D2,A2
	move.w	(A2)+,D2
	cmp.w	#$EFFE,D2
	bne.s	.stop
	move.w	(A2)+,D2
	add.w	D2,D2
	cmp.w	#$A,D2
	bcs.s	.effe_ok
	moveq	#0,D2
.effe_ok
	jmp	.j(PC,D2.W)
.j
	bra.s	.stop
	bra.s	.jump
	bra.s	.ignore
	bra.s	.timeshare
	bra.s	.ignore

.jump
	tst.w	D1
	beq.s	.jump1
	bmi.s	.jump2
	bra.s	.jump3

.jump1
	move.w	#$FFFF,D1
	addq.w	#1,D0
	bra.s	.songlp

.jump2
	move.w	2(A2),D1
.jump3
	subq.w	#1,D1
	move.w	(A2),D0
	bra.s	.songlp

.timeshare
	tst.w	2(A2)
	bmi.s	.ignore
	move.w	#$80F7,D3
.ignore
	addq.w	#1,D0
	bra.s	.songlp

.stop
	move.w	#NCHD_FarRight,d0
	move.w	#NCHD_Ignore,d1
	move.w	#NCHD_FarLeft,d2
	move.w	d0,NC1+nch_StereoPos
	move.w	d0,NC2+nch_StereoPos
	move.w	d3,DMAChans
	bmi.s	.is7v
	move.w	d2,d0
	exg	d1,d2
.is7v
	move.w	d0,NC0+nch_StereoPos
	move.w	d1,NC3+nch_StereoPos
	move.w	d2,NC4+nch_StereoPos
	move.w	d2,NC5+nch_StereoPos
	move.w	d2,NC6+nch_StereoPos
	move.w	d2,NC7+nch_StereoPos
	moveq	#0,D0
	rts

.fail
	moveq	#-1,D0
	rts

*-----------------------------------------------------------------------*
;
; TFMX Samples laden

dt_ExtLoad
	move.l	dtg_PathArrayPtr(a5),a0
	clr.b	(a0)				; Path löschen
	move.l	dtg_CopyDir(a5),a0
	jsr	(a0)
	bsr.s	CopyName
	move.l	dtg_LoadFile(a5),a0
	jsr	(a0)				; returncode is already set !
	rts

*-----------------------------------------------------------------------*
;
; Kopiert den Filenamen und fügt davor 'smpl.' ein

CopyName
	move.l	dtg_PathArrayPtr(a5),a0
.loop	tst.b	(a0)+
	bne.s	.loop
	subq.l	#1,a0

	lea	TFMXsmpl(pc),a1
.smpl	move.b	(a1)+,(a0)+
	bne.s	.smpl
	subq.l	#1,a0

	move.l	dtg_FileArrayPtr(a5),a1
	lea	TFMXmdat(pc),a2
.mdat	move.b	(a2)+,d0
	beq.s	.copy
	move.b	(a1)+,d1
	bset	#5,d1
	cmp.b	d0,d1
	beq.s	.mdat

	move.l	dtg_FileArrayPtr(a5),a1
.copy	move.b	(a1)+,(a0)+
	bne.s	.copy
	rts

TFMXmdat
	dc.b 'mdat.',0
	even
TFMXsmpl
	dc.b 'smpl.',0
	even

*-----------------------------------------------------------------------*
;
; Set min. & max. subsong number

dt_SubSongRange
	moveq	#0,d0
	move.w	SubSongCnt(pc),d1
	rts

*-----------------------------------------------------------------------*
;
; Init Player

dt_InitPlayer
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0
	jsr	(a0)
	lea	$100(a0),a0
	moveq	#-2,d0				; calc max. Subsong
	moveq	#2,d1
	moveq	#31-1,d2
.Loop	addq.l	#1,d0
	tst.w	(a0)+
	bne.s	.Next
	subq.l	#1,d1
.Next	dbeq	d2,.Loop
	move.w	d0,SubSongCnt			; store max. Subsong

	lea	NoteRec4(pc),a0
	lea	NoteRec5(pc),a1
	lea	NoteRec6(pc),a2
	lea	NoteRec7(pc),a3
	move.w	DMAChans(pc),DMAAllow
	bmi.s	.is7v
	lea	NoteRec0(pc),a0
	lea	NoteRec1(pc),a1
	lea	NoteRec2(pc),a2
	lea	NoteRec3(pc),a3
.is7v
	lea	VoiceUseTable+$10,a4
	move.l	a0,$20(A4)
	move.l	a0,(A4)+
	move.l	a1,$20(A4)
	move.l	a1,(A4)+
	move.l	a2,$20(A4)
	move.l	a2,(A4)+
	move.l	a3,$20(A4)
	move.l	a3,(A4)+

	moveq	#0,d0				; no error
	rts

*-----------------------------------------------------------------------*
;
; End Player

dt_EndPlayer
	moveq	#-1,d0				; error
	rts

*-----------------------------------------------------------------------*
;
; Init Sound

dt_InitSound
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0
	jsr	(a0)
	move.l	a0,d3
	moveq	#1,d0
	move.l	dtg_GetListData(a5),a0
	jsr	(a0)
	move.l	a0,d1
	move.l	d3,d0
	lea	tfmx_BASE(pc),a0
	jsr	$14(a0)				; initdata
	move.w	dtg_SndNum(a5),d0
	lea	tfmx_BASE(pc),a0
	jsr	$0C(a0)				; songplay
	rts

*-----------------------------------------------------------------------*
;
; Cleanup Sound

dt_EndSound
	lea	tfmx_BASE(pc),a0
	jsr	$08(a0)				; alloff
	bsr.s	stopvoices
	rts

stopvoices
	moveq	#7,d0
.lp
	move.l	d0,-(sp)
	lea	tfmx_BASE(pc),a0
	jsr	$20(a0)				; chanoff
	move.l	(sp)+,d0
	dbf	d0,.lp
	rts

*-----------------------------------------------------------------------*
;
; Interrupt für Replay

dt_IrqIn
;	illegal
	bsr	tfmx_IRQIN
	move.l	dt_DeliGlob(pc),a0
	move.l	dtg_NotePlayer(a0),a0
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; One Pattern back

dt_PrevPatt
	move.l	dt_DeliGlob(pc),a5
	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	lea	PatternDataBlock(PC),a5
	lea	MasterDataBlock(PC),a6
	move.l	mdb_MdatBase(a6),a4
	bsr	stoptrax
	bsr	stopvoices
	move.w	pdb_CurrPos(A5),d0
.lp
	subq.w	#1,d0
	bcs.s	.sk2
	cmp.w	pdb_FirstPos(A5),D0
	bhs.s	.sk
.sk2
	move.w	pdb_LastPos(A5),d0
	subq.w	#1,d0
.sk
	move.w	d0,pdb_CurrPos(A5)
	move.w	d0,d1
	lsl.w	#4,d1
	move.l	mdb_TrackBase(A6),a0
	add.w	d1,a0
	cmp.w	#$EFFE,(a0)
	beq.s	.lp
	bsr	trk_GetTrackStep
	move.l	dt_DeliGlob(pc),a5
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Play next Pattern

dt_NextPatt
	move.l	dt_DeliGlob(pc),a5
	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	lea	PatternDataBlock(PC),a5
	lea	MasterDataBlock(PC),a6
	move.l	mdb_MdatBase(a6),a4
	bsr	stoptrax
	bsr	stopvoices
	bsr	dt_NextStep
	move.l	dt_DeliGlob(pc),a5
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)
	rts

stoptrax
	move.l	a5,a0
	moveq	#7,d0
.lp
	st	pdb_PNum(a0)
	addq.l	#4,a0
	dbf	d0,.lp
	rts

*-----------------------------------------------------------------------*
;
; TFMX-Replay

tfmx_BASE
	bra	tfmx_ALLOFF		; $00
	bra	tfmx_IRQIN		; $04
	bra	tfmx_ALLOFF		; $08
	bra	tfmx_SONGPLAY		; $0C
	bra	tfmx_NOTEPORT		; $10
	bra	tfmx_INITDATA		; $14
	bra	tfmx_VBION		; $18
	bra	tfmx_VBIOFF		; $1C
	bra	tfmx_CHANNELOFF		; $20
	bra	tfmx_SONGPLAY		; $24
	bra	tfmx_FADE		; $28
	bra	tfmx_INFO		; $2C
	bra	tfmx_ALLOFF		; $30
	bra	tfmx_PLAYPATT1		; $34
	bra	tfmx_PLAYPATT2		; $38
	bra	tfmx_PROSFX		; $3C
	bra	tfmx_PLAYCONT		; $40
	bra	tfmx_ALLOFF		; $44
	bra	tfmx_ALLOFF		; $48
	bra	tfmx_ALLOFF		; $4C
	bra	tfmx_ALLOFF		; $50
	bra	tfmx_PALNTSCINIT	; $54
	bra	tfmx_ALLOFF		; $58
	bra	tfmx_SETWORKBUF		; $5C
	bra	tfmx_ALLOFF		; $60

tfmx_IRQIN
	movem.l	D0-D7/A0-A6,-(SP)
	lea	MasterDataBlock(PC),A6
	move.l	mdb_LongStore(A6),-(SP)
lbC0004F8
	tst.b	mdb_PlayerEnable(A6)
	beq	lbC00054C
	clr.w	mdb_DMAon(A6)
	clr.w	mdb_DMAoff(A6)
lbC000502
	bsr	DoAllMacros
	tst.b	mdb_CurrSong(A6)
	bmi.s	lbC000510
	bsr	DoTracks
lbC000510
	move.w	mdb_DMAstate(A6),d4
	move.w	d4,d0
	move.w	mdb_DMAon(A6),d1
	and.w	DMAAllow(pc),d1
	or.w	d1,d0
	move.w	mdb_DMAoff(A6),d1
	and.w	DMAAllow(pc),d1
	not.w	d1
	and.w	d1,d0
	move.w	d0,mdb_DMAstate(A6)
	lea	NoteRec0(pc),A5
	moveq	#7,d1
.loop
	move.l	cdb_Hardware(A5),a0
	lsr.w	#1,d0
	bcs.s	.on
.off	move.l	mdb_SmplBase(A6),d2
	moveq	#1,d3
	lsr.w	#1,d4
	bcc	.nowait
	move.l	d2,nch_SampleStart(a0)
	move.w	d3,nch_SampleLength(a0)
	move.l	d2,nch_RepeatStart(a0)
	move.w	d3,nch_RepeatLength(a0)
	or.b	#NCHF_Sample|NCHF_Repeat,nch_Changed(a0)
	clr.w	cdb_WorkLen(A5)
	clr.w	cdb_LastLen(A5)
	tst.w	cdb_WaitDMACount(A5)		; DMA-Off generates an AudioInt !
	ble	.nowait
	subq.w	#1,cdb_WaitDMACount(A5)
	bgt	.nowait
	st	cdb_MacroRun(A5)
	bra	.nowait
.on	move.l	cdb_SaveAddr(A5),d2
	move.w	cdb_SaveLen(A5),d3
	lsr.w	#1,d4
	bcs.s	.skip
	move.l	d2,nch_SampleStart(a0)
	move.w	d3,nch_SampleLength(a0)
	or.b	#NCHF_Sample,nch_Changed(a0)
	move.w	d3,cdb_WorkLen(A5)
	tst.w	cdb_WaitDMACount(A5)		; DMA-On generates an AudioInt !
	ble.s	.skip
	subq.w	#1,cdb_WaitDMACount(A5)
	bgt.s	.skip
	st	cdb_MacroRun(A5)
.skip	move.l	d2,nch_RepeatStart(a0)
	move.w	d3,nch_RepeatLength(a0)
	or.b	#NCHF_Repeat,nch_Changed(a0)
	move.w	d3,cdb_LastLen(A5)
	moveq	#0,D2
	moveq	#0,D3
	move.b	mdb_MasterVol(A6),D3
	move.b	cdb_CurVol(A5),D2
	add.b	d3,d3
	bmi.s	.novolsc
	mulu	D3,D2
	lsr.w	#7,D2
.novolsc
	move.w	d2,nch_Volume(a0)
	move.w	cdb_CurPeriod(A5),nch_Frequency(a0)
	or.b	#NCHF_Volume|NCHF_Frequency,nch_Changed(a0)
.audint
	tst.w	cdb_WaitDMACount(A5)
	ble.s	.nowait
	moveq	#0,d2
	move.w	mdb_CIAsave(A6),d2
	move.l	d2,d3
	add.l	d2,d2
	add.l	d2,d2
	add.l	d3,d2
	lsr.l	#1,d2
	move.w	cdb_CurPeriod(A5),d3
	beq.s	.nowait
	divu	d3,d2
	move.w	cdb_WorkLen(A5),d3
	sub.w	d2,d3
	bcc.s	.notend
	move.w	cdb_LastLen(A5),d2
	beq.s	.endtst
.waitlp	add.w	d2,d3
	bcs.s	.endtst
	subq.w	#1,cdb_WaitDMACount(A5)
	bra.s	.waitlp
.endtst	subq.w	#1,cdb_WaitDMACount(A5)
	bgt.s	.notend
	st	cdb_MacroRun(A5)
;	move.w	cdb_IntOff(A5),$DFF09A
.notend
	move.w	d3,cdb_WorkLen(A5)
.nowait
	lea	cdb_SIZEOF(A5),A5
	dbf	d1,.loop
lbC00054C
	move.l	(SP)+,mdb_LongStore(A6)
	movem.l	(SP)+,D0-D7/A0-A6
lbC000554
	rts

DoTracks
	lea	PatternDataBlock(PC),A5
	move.l	mdb_MdatBase(A6),A4
	subq.w	#1,mdb_SpeedCnt(A6)
	bpl.s	lbC000554
	move.w	pdb_Prescale(A5),mdb_SpeedCnt(A6)
lbC00056A
	move.l	A5,A0
	clr.b	mdb_EndFlag(A6)
	bsr.s	DoFirstTrack
	tst.b	mdb_EndFlag(A6)
	bne.s	lbC00056A
	bsr.s	DoNextTrack
	tst.b	mdb_EndFlag(A6)
	bne.s	lbC00056A
	bsr.s	DoNextTrack
	tst.b	mdb_EndFlag(A6)
	bne.s	lbC00056A
	bsr.s	DoNextTrack
	tst.b	mdb_EndFlag(A6)
	bne.s	lbC00056A
	bsr.s	DoNextTrack
	tst.b	mdb_EndFlag(A6)
	bne.s	lbC00056A
	bsr.s	DoNextTrack
	tst.b	mdb_EndFlag(A6)
	bne.s	lbC00056A
	bsr.s	DoNextTrack
	tst.b	mdb_EndFlag(A6)
	bne.s	lbC00056A
	bsr.s	DoNextTrack
	tst.b	mdb_EndFlag(A6)
	bne.s	lbC00056A
	rts

DoNextTrack
	addq.l	#4,A0
DoFirstTrack
	cmp.b	#$90,pdb_PNum(A0)
	bcs.s	lbC0005D0
	cmp.b	#$FE,pdb_PNum(A0)
	bne.s	lbC0005E2
	st	pdb_PNum(A0)
	move.b	pdb_PXpose(A0),D0
	bra	tfmx_CHANNELOFF

lbC0005D0
	lea	InfoDataBlock(PC),A1
	st	idb_NewTrack(A1)
	tst.b	pdb_PWait(A0)
	beq.s	lbC0005E4
	subq.b	#1,pdb_PWait(A0)
lbC0005E2
	rts

lbC0005E4
	move.w	pdb_PStep(A0),D0
	add.w	D0,D0
	add.w	D0,D0
	move.l	pdb_PAddr(A0),A1
	move.l	0(A1,D0.W),mdb_LongStore(A6)
	move.b	mdb_LongStore(A6),D0
	cmp.b	#$F0,D0
	bcc.s	lbC000644
	move.b	D0,D7
	cmp.b	#$C0,D0
	bcc.s	lbC000618
	cmp.b	#$7F,D0
	bcs.s	lbC000618
	move.b	mdb_LongStore+3(A6),pdb_PWait(A0)
	clr.b	mdb_LongStore+3(A6)
lbC000618
	move.b	pdb_PXpose(A0),D1
	add.b	D1,D0
	cmp.b	#$C0,D7
	bcc.s	lbC000628
	and.b	#$3F,D0
lbC000628
	move.b	D0,mdb_LongStore(A6)
	move.l	mdb_LongStore(A6),D0
	bsr	tfmx_NOTEPORT
	cmp.b	#$C0,D7
	bcc.s	pat_NOP
	cmp.b	#$7F,D7
	bcs.s	pat_NOP
	bra	lbC000710

lbC000644
	and.w	#$F,D0
	add.w	D0,D0
	add.w	D0,D0
	jmp	lbC000650(PC,D0.W)

lbC000650
	bra	pat_End
	bra	pat_Loop
	bra	pat_Cont
	bra	pat_Wait
	bra	pat_Stop
	bra	pat_Note
	bra	pat_Note
	bra	pat_Note
	bra	pat_GsPt
	bra	pat_RoPt
	bra	pat_Fade
	bra	pat_PPat
	bra	pat_Note
	bra	pat_Cue
	bra	pat_StCu

pat_NOP
	addq.w	#1,pdb_PStep(A0)
	bra	lbC0005E4

pat_End
	st	pdb_PNum(A0)
dt_NextStep
	move.w	pdb_CurrPos(A5),D0
	cmp.w	pdb_LastPos(A5),D0
	bne.s	lbC0006AA
	move.w	pdb_FirstPos(A5),pdb_CurrPos(A5)
	move.l	dt_DeliGlob(pc),a0
	move.l	dtg_SongEnd(a0),a0
	pea	lbC0006AE(pc)
	jmp	(a0)
;	bra.s	lbC0006AE

lbC0006AA
	addq.w	#1,pdb_CurrPos(A5)
lbC0006AE
	bsr	trk_GetTrackStep
	st	mdb_EndFlag(A6)
	rts

pat_Loop
	tst.b	pdb_PLoop(A0)
	beq.s	lbC0006CC
	cmp.b	#$FF,pdb_PLoop(A0)
	beq.s	lbC0006D2
	subq.b	#1,pdb_PLoop(A0)
	bra.s	lbC0006DC

lbC0006CC
	st	pdb_PLoop(A0)
	bra.s	pat_NOP

lbC0006D2
	move.b	mdb_LongStore+1(A6),D0
	subq.b	#1,D0
	move.b	D0,pdb_PLoop(A0)
lbC0006DC
	move.w	mdb_LongStore+2(A6),pdb_PStep(A0)
	bra	lbC0005E4

pat_Cont
	move.b	mdb_LongStore+1(A6),D0
	move.b	D0,pdb_PNum(A0)
	add.w	D0,D0
	add.w	D0,D0
	move.l	mdb_PattBase(A6),A1
	move.l	0(A1,D0.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr(A0)
	move.w	mdb_LongStore+2(A6),pdb_PStep(A0)
	bra	lbC0005E4

pat_Wait
	move.b	mdb_LongStore+1(A6),pdb_PWait(A0)
lbC000710
	addq.w	#1,pdb_PStep(A0)
	rts

pat_StCu
	clr.w	mdb_PlayPattFlag(A6)
pat_Stop
	st	pdb_PNum(A0)
	rts

pat_Note
	move.l	mdb_LongStore(A6),D0
	bsr	tfmx_NOTEPORT
	bra	pat_NOP

pat_GsPt
	move.l	pdb_PAddr(A0),pdb_PRoAddr(A0)
	move.w	pdb_PStep(A0),pdb_PRoStep(A0)
	move.b	mdb_LongStore+1(A6),D0
	move.b	D0,pdb_PNum(A0)
	add.w	D0,D0
	add.w	D0,D0
	move.l	mdb_PattBase(A6),A1
	move.l	0(A1,D0.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr(A0)
	move.w	mdb_LongStore+2(A6),pdb_PStep(A0)
	bra	lbC0005E4

pat_RoPt
	move.l	pdb_PRoAddr(A5),pdb_PAddr(A5)
	move.w	pdb_PRoStep(A5),pdb_PStep(A5)
	bra	pat_NOP

pat_Fade
	lea	InfoDataBlock(PC),A1
	tst.w	idb_Fade(A1)
	bne	pat_NOP
	move.w	#1,idb_Fade(A1)
	move.b	mdb_LongStore+3(A6),mdb_FadeDest(A6)
	move.b	mdb_LongStore+1(A6),mdb_FadeTime(A6)
	move.b	mdb_LongStore+1(A6),mdb_FadeReset(A6)
	beq.s	lbC0007AE
	move.b	#1,mdb_FadeSlope(A6)
	move.b	mdb_MasterVol(A6),D0
	cmp.b	mdb_FadeDest(A6),D0
	beq.s	lbC0007B4
	bcs	pat_NOP
	neg.b	mdb_FadeSlope(A6)
	bra	pat_NOP

lbC0007AE
	move.b	mdb_FadeDest(A6),mdb_MasterVol(A6)
lbC0007B4
	clr.b	mdb_FadeSlope(A6)
	clr.w	idb_Fade(A1)
	bra	pat_NOP

pat_Cue
	lea	InfoDataBlock(PC),A1
	move.b	mdb_LongStore+1(A6),D0
	and.w	#3,D0
	add.w	D0,D0
	move.w	mdb_LongStore+2(A6),idb_Cue(A1,D0.W)
	bra	pat_NOP

pat_PPat
	move.b	mdb_LongStore+2(A6),D1
	and.w	#7,D1
	add.w	D1,D1
	add.w	D1,D1
	move.b	mdb_LongStore+1(A6),D0
	move.b	D0,pdb_PNum(A5,D1.W)
	move.b	mdb_LongStore+3(A6),pdb_PXpose(A5,D1.W)
	and.w	#$7F,D0
	add.w	D0,D0
	add.w	D0,D0
	move.l	mdb_PattBase(A6),A1
	move.l	0(A1,D0.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr(A5,D1.W)
	clr.l	pdb_PStep(A5,D1.W)
	st	pdb_PLoop(A5,D1.W)
	bra	pat_NOP

trk_GetTrackStep
	movem.l	A0/A1,-(SP)
lbC000818
	move.w	pdb_CurrPos(A5),D0
	lsl.w	#4,D0
	move.l	mdb_TrackBase(A6),A0
	add.w	D0,A0
	move.l	mdb_PattBase(A6),A1
	move.w	(A0)+,D0
	cmp.w	#$EFFE,D0
	bne.s	lbC000856
	move.w	(A0)+,D0
	add.w	D0,D0
	add.w	D0,D0
	cmp.w	#$14,D0
	bcs.s	lbC00083E
	moveq	#0,D0
lbC00083E
	jmp	lbC000842(PC,D0.W)

lbC000842
	bra	effe_Stop
	bra	effe_Loop
	bra	effe_Speed
	bra	effe_Timeshare
	bra	effe_Fade

lbC000856
	move.w	D0,pdb_PNum+4*0(A5)
	bmi.s	lbC000872
	clr.b	D0
	lsr.w	#6,D0
	move.l	0(A1,D0.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*0(A5)
	clr.l	pdb_PStep+4*0(A5)
	st	pdb_PLoop+4*0(A5)
lbC000872
	movem.w	(A0)+,D0-D6
	move.w	D0,pdb_PNum+4*1(A5)
	bmi.s	lbC000892
	clr.b	D0
	lsr.w	#6,D0
	move.l	0(A1,D0.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*1(A5)
	clr.l	pdb_PStep+4*1(A5)
	st	pdb_PLoop+4*1(A5)
lbC000892
	move.w	D1,pdb_PNum+4*2(A5)
	bmi.s	lbC0008AE
	clr.b	D1
	lsr.w	#6,D1
	move.l	0(A1,D1.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*2(A5)
	clr.l	pdb_PStep+4*2(A5)
	st	pdb_PLoop+4*2(A5)
lbC0008AE
	move.w	D2,pdb_PNum+4*3(A5)
	bmi.s	lbC0008CA
	clr.b	D2
	lsr.w	#6,D2
	move.l	0(A1,D2.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*3(A5)
	clr.l	pdb_PStep+4*3(A5)
	st	pdb_PLoop+4*3(A5)
lbC0008CA
	move.w	D3,pdb_PNum+4*4(A5)
	bmi.s	lbC0008E6
	clr.b	D3
	lsr.w	#6,D3
	move.l	0(A1,D3.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*4(A5)
	clr.l	pdb_PStep+4*4(A5)
	st	pdb_PLoop+4*4(A5)
lbC0008E6
	move.w	D4,pdb_PNum+4*5(A5)
	bmi.s	lbC000902
	clr.b	D4
	lsr.w	#6,D4
	move.l	0(A1,D4.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*5(A5)
	clr.l	pdb_PStep+4*5(A5)
	st	pdb_PLoop+4*5(A5)
lbC000902
	move.w	D5,pdb_PNum+4*6(A5)
	bmi.s	lbC00091E
	clr.b	D5
	lsr.w	#6,D5
	move.l	0(A1,D5.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*6(A5)
	clr.l	pdb_PStep+4*6(A5)
	st	pdb_PLoop+4*6(A5)
lbC00091E
	tst.w	mdb_PlayPattFlag(A6)
	bne.s	lbC000940
	move.w	D6,pdb_PNum+4*7(A5)
	bmi.s	lbC000940
	clr.b	D6
	lsr.w	#6,D6
	move.l	0(A1,D6.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*7(A5)
	clr.l	pdb_PStep+4*7(A5)
	st	pdb_PLoop+4*7(A5)
lbC000940
	movem.l	(SP)+,A0/A1
	rts

effe_Stop
	clr.b	mdb_PlayerEnable(A6)
	move.l	dt_DeliGlob(pc),a0
	move.l	dtg_SongEnd(a0),a0
	jsr	(a0)
	movem.l	(SP)+,A0/A1
	rts

effe_Loop
	tst.w	mdb_TrackLoop(A6)
	beq.s	.next
	bmi.s	.new
	subq.w	#1,mdb_TrackLoop(A6)
	bra.s	.loop
.next
	move.w	#$FFFF,mdb_TrackLoop(A6)
	addq.w	#1,pdb_CurrPos(A5)
	bra	lbC000818
.new
	move.w	2(A0),D0
	bgt.s	.sk
	move.l	a0,-(sp)
	move.l	dt_DeliGlob(pc),a0
	move.l	dtg_SongEnd(a0),a0
	jsr	(a0)
	move.l	(sp)+,a0
.sk
	subq.w	#1,D0
	move.w	D0,mdb_TrackLoop(A6)
.loop
	move.w	(A0),pdb_CurrPos(A5)
	bra	lbC000818

effe_Speed
	move.w	(A0),pdb_Prescale(A5)
	move.w	(A0),mdb_SpeedCnt(A6)
	move.w	2(A0),D0
	bmi.s	.nocia
	and.w	#$1FF,D0
	tst.w	D0
	beq.s	.nocia
	move.l	#$1B51F8,D1
	divu	D0,D1
	move.w	D1,mdb_CIAsave(A6)
.nocia
	addq.w	#1,pdb_CurrPos(A5)
	bra	lbC000818

effe_Timeshare
	move.w	2(A0),d0
	bmi.s	.skip
	ext.w	d0
	moveq	#-$20,d1
	cmp.w	d1,d0
	bge.s	.okay
	move.l	d1,d0
.okay
	add.w	#100,d0
	mulu.w	#(14318*128)/100,d0
	lsr.l	#7,d0
	move.w	D0,mdb_CIAsave(A6)
.skip
	addq.w	#1,pdb_CurrPos(A5)
	bra	lbC000818

effe_Fade
	addq.w	#1,pdb_CurrPos(A5)
	lea	InfoDataBlock(PC),A1
	tst.w	idb_Fade(A1)
	bne	lbC000818
	move.w	#1,idb_Fade(A1)
	move.b	3(A0),mdb_FadeDest(A6)
	move.b	1(A0),mdb_FadeTime(A6)
	move.b	1(A0),mdb_FadeReset(A6)
	beq.s	lbC0009EE
	move.b	#1,mdb_FadeSlope(A6)
	move.b	mdb_MasterVol(A6),D0
	cmp.b	mdb_FadeDest(A6),D0
	beq.s	lbC0009F4
	bcs	lbC000818
	neg.b	mdb_FadeSlope(A6)
	bra	lbC000818
lbC0009EE
	move.b	mdb_FadeDest(A6),mdb_MasterVol(A6)
lbC0009F4
	move.b	#0,mdb_FadeSlope(A6)
	clr.w	idb_Fade(A1)
	bra	lbC000818

DoAllMacros
	lea	NoteRec0(PC),A5
	bsr.s	lbC000A18
	lea	NoteRec1(PC),A5
	bsr.s	lbC000A18
	lea	NoteRec2(PC),A5
	bsr.s	lbC000A18
	lea	NoteRec3(PC),A5
	tst.w	DMAAllow
	bpl.s	lbC000A18
	lea	NoteRec4(PC),A5
	bsr.s	lbC000A18
	lea	NoteRec5(PC),A5
	bsr.s	lbC000A18
	lea	NoteRec6(PC),A5
	bsr.s	lbC000A18
	lea	NoteRec7(PC),A5
lbC000A18
	move.l	cdb_Hardware(A5),A4
	tst.w	cdb_SfxLockTime(A5)
	bmi.s	lbC000A28
	subq.w	#1,cdb_SfxLockTime(A5)
	bra.s	lbC000A30
lbC000A28
	clr.b	cdb_SfxFlag(A5)
	clr.b	cdb_SfxPriority(A5)
lbC000A30
	move.l	cdb_SfxCode(A5),D0
	beq.s	lbC000A48
	clr.l	cdb_SfxCode(A5)
	clr.b	cdb_SfxFlag(A5)
	bsr	tfmx_NOTEPORT
	move.b	cdb_SfxPriority(A5),cdb_SfxFlag(A5)
lbC000A48
	tst.b	cdb_MacroRun(A5)
	beq	mac_DoEffects
	tst.w	cdb_MacroWait(A5)
	beq.s	mac_NextStep
	subq.w	#1,cdb_MacroWait(A5)
lbC000A5A
	bra	mac_DoEffects

mac_NextStep
	move.l	cdb_MacroPtr(A5),A0
	move.w	cdb_MacroStep(A5),D0
	add.w	D0,D0
	add.w	D0,D0
	move.l	0(A0,D0.W),mdb_LongStore(A6)
	moveq	#0,D0
	move.b	mdb_LongStore(A6),D0
	clr.b	mdb_LongStore(A6)
	add.w	D0,D0
	add.w	D0,D0
	cmp.w	#$A8,D0
	bcc	lbC000B32
	jmp	lbC000A8A(PC,D0.W)

lbC000A8A
	bra	mac_DMAoffReset
	bra	mac_DMAon
	bra	mac_SetBegin
	bra	mac_SetLen
	bra	mac_Wait
	bra	mac_Loop
	bra	mac_Cont
	bra	mac_Stop
	bra	mac_AddNote
	bra	mac_SetNote
	bra	mac_Reset
	bra	mac_Porta
	bra	mac_Vibrato
	bra	mac_AddVolume
	bra	mac_SetVolume
	bra	mac_Envelope
	bra	mac_LoopKeyUp
	bra	mac_AddBegin
	bra	mac_AddLen
	bra	mac_DMAoff
	bra	mac_WaitKeyUp
	bra	mac_GoSub
	bra	mac_ReturnSub
	bra	mac_SetPeriod
	bra	mac_SampleLoop
	bra	mac_OneShot
	bra	mac_WaitOnDMA
	bra	mac_1B
	bra	mac_NoteSplit
	bra	mac_VolumeSplit
	bra	mac_1E
	bra	mac_AddPrevNote
	bra	mac_Cue
	bra	mac_StartMacro
	bra	mac_22
	bra	mac_23
	bra	mac_24
	bra	mac_25
	bra	mac_26
	bra	mac_27
	bra	mac_28
	bra	mac_29

lbC000B32
	tst.b	cdb_NewStyleMacro(A5)
	beq.s	lbC000B40
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_DoEffects

lbC000B40
	st	cdb_NewStyleMacro(A5)
lbC000B44
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_DMAoffReset
	clr.b	cdb_EnvReset(A5)
	clr.b	cdb_VibReset(A5)
	clr.w	cdb_PortaRate(A5)
	clr.b	cdb_ArpRun(A5)
	clr.w	cdb_SIDSize(A5)
	move.b	mdb_LongStore+3(a6),d0
	tst.b	mdb_LongStore+2(a6)
	bne.s	.set
	move.b	cdb_Velocity+1(a5),d1
	add.b	d1,d0
	add.b	d1,d0
	add.b	d1,d0
.set
	move.b	d0,cdb_CurVol(a5)

mac_DMAoff
	move.w	cdb_DMAbit(A5),D0
	and.w	DMAAllow(pc),d0
	addq.w	#1,cdb_MacroStep(A5)
	tst.b	mdb_LongStore+1(A6)
	bne.s	.new
;	or.w	D0,mdb_DMAoff(A6)
	not.w	d0
	and.w	d0,mdb_DMAstate(A6)
	move.l	mdb_SmplBase(a6),nch_SampleStart(a4)
	move.w	#1,nch_SampleLength(a4)
	move.l	mdb_SmplBase(a6),nch_RepeatStart(a4)
	move.w	#1,nch_RepeatLength(a4)
	or.b	#NCHF_Sample|NCHF_Repeat,nch_Changed(a4)
	clr.w	cdb_WorkLen(A5)
	clr.w	cdb_LastLen(A5)
;	move.w	#$00f,$dff180
	bra	mac_NextStep
.new
	or.w	D0,mdb_DMAoff(A6)
;	not.w	d0
;	and.w	d0,mdb_DMAstate(A6)
	clr.b	cdb_NewStyleMacro(A5)
	bra	mac_DoEffects

mac_DMAon
;	move.w	cdb_IntOff(A5),$DFF09A
;	move.w	cdb_IntOff(A5),$DFF09C
	move.b	mdb_LongStore+1(A6),cdb_EfxRun(A5)
	addq.w	#1,cdb_MacroStep(A5)
	move.w	cdb_DMAbit(A5),D0
	and.w	DMAAllow(pc),d0
	or.w	D0,mdb_DMAon(A6)
	bra	mac_NextStep

mac_SetBegin
	clr.b	cdb_AddBeginTime(A5)
	move.l	mdb_LongStore(A6),D0
	add.l	mdb_SmplBase(A6),D0
lbC000BB8
	move.l	D0,cdb_CurAddr(A5)
;	move.l	D0,(A4)
	move.l	d0,cdb_SaveAddr(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_AddBegin
	move.b	mdb_LongStore+1(A6),cdb_AddBeginTime(A5)
	move.b	mdb_LongStore+1(A6),cdb_AddBeginReset(A5)
	move.w	mdb_LongStore+2(A6),D1
	ext.l	D1
	move.l	D1,cdb_AddBegin(A5)
	move.l	d1,d0
	add.l	cdb_CurAddr(A5),D0
	tst.w	cdb_SIDSize(A5)
	beq.s	lbC000BB8
	move.l	D0,cdb_CurAddr(A5)
	move.l	D0,cdb_SIDSrcSample(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_AddLen
	move.w	mdb_LongStore+2(A6),D0
	move.w	cdb_CurrLength(A5),D1
	add.w	D0,D1
	move.w	D1,cdb_CurrLength(A5)
	tst.w	cdb_SIDSize(A5)
	beq.s	lbC000C18
	move.w	D1,cdb_SIDSrcLength(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

lbC000C18
;	move.w	D1,4(A4)
	move.w	d1,cdb_SaveLen(a5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_SetLen
	move.w	mdb_LongStore+2(A6),cdb_CurrLength(A5)
;	move.w	mdb_LongStore+2(A6),4(A4)
	move.w	mdb_LongStore+2(A6),cdb_SaveLen(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_Wait
	btst	#0,mdb_LongStore+1(A6)
	beq.s	lbC000C52
	tst.b	cdb_ReallyWait(A5)
	bne	lbC000A5A
	move.b	#1,cdb_ReallyWait(A5)
	bra	lbC000B44

lbC000C52
	move.w	mdb_LongStore+2(A6),cdb_MacroWait(A5)
	bra	lbC000B32

* Could/should be rewritten to use NCHF_Looped (when available)!!!

mac_WaitOnDMA
; $24(A6)=CIA value
; $34(A5)=sample length
; $8C(A5)=period
	move.w	mdb_LongStore+2(A6),d0
	addq.w	#1,d0				; for easier handling...
	move.w	d0,cdb_WaitDMACount(A5)
	clr.b	cdb_MacroRun(A5)
;	move.w	#$f00,$dff180
;???	st	cdb_NewStyleMacro(A5)
;	move.w	cdb_IntOn(A5),$DFF09A
	bra	lbC000B32

;mac_WaitOnDMA
;	move.w	mdb_LongStore+2(A6),cdb_WaitDMACount(A5)
;	clr.b	cdb_MacroRun(A5)
;	move.w	cdb_IntOn(A5),$DFF09A
;	bra	lbC000B32
;
;tfmx_SOUNDINT
;	movem.l	D0/A5,-(SP)
;	lea	NoteRec0(PC),A5
;	move.w	$DFF01E,D0
;	and.w	$DFF01C,D0
;	btst	#7,D0
;	bne.s	lbC000CA4
;	lea	NoteRec1(PC),A5
;	btst	#8,D0
;	bne.s	lbC000CA4
;	lea	NoteRec2(PC),A5
;	btst	#9,D0
;	bne.s	lbC000CA4
;	lea	NoteRec3(PC),A5
;lbC000CA4
;	move.w	cdb_IntOff(A5),$DFF09C
;	subq.w	#1,cdb_WaitDMACount(A5)
;	bpl.s	lbC000CC0
;	st	cdb_MacroRun(A5)
;	move.w	cdb_IntOff(A5),$DFF09A
;lbC000CC0
;	movem.l	(SP)+,D0/A5
;	rts

mac_NoteSplit
	move.b	mdb_LongStore+1(A6),D0
	cmp.b	cdb_CurrNote(A5),D0
	bcc	lbC000B44
	move.w	mdb_LongStore+2(A6),cdb_MacroStep(A5)
	bra	mac_NextStep

mac_VolumeSplit
	move.b	mdb_LongStore+1(A6),D0
	cmp.b	cdb_CurVol(A5),D0
	bcc	lbC000B44
	move.w	mdb_LongStore+2(A6),cdb_MacroStep(A5)
	bra	mac_NextStep

mac_1B	; arpeggio control?
	ifd	BREAKWEIRD
	illegal
	moveq	#$1B,d0
	endc
	move.b	mdb_LongStore+1(A6),cdb_ArpMacro(A5)
	move.w	mdb_LongStore+2(A6),cdb_ArpReset(A5)
	move.w	#$101,cdb_ArpTime(A5)
	bsr	lbC0012DE
	move.b	#1,cdb_ReallyWait(A5)
	bra	lbC000B44

mac_1E	; some limiting setup
	ifd	BREAKWEIRD
	illegal
	moveq	#$1E,d0
	endc
	move.b	mdb_LongStore+1(A6),cdb_RandomNote(A5)
	bra	lbC000B44

mac_Loop
	tst.b	cdb_Loop(A5)
	beq.s	lbC000D30
	cmp.b	#$FF,cdb_Loop(A5)
	beq.s	lbC000D3C
	subq.b	#1,cdb_Loop(A5)
	bra.s	lbC000D46

lbC000D30
	st	cdb_Loop(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

lbC000D3C
	move.b	mdb_LongStore+1(A6),D0
	subq.b	#1,D0
	move.b	D0,cdb_Loop(A5)
lbC000D46
	move.w	mdb_LongStore+2(A6),cdb_MacroStep(A5)
	bra	mac_NextStep

mac_LoopKeyUp
	tst.b	cdb_KeyUp(A5)
	bne.s	mac_Loop
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_Stop
	clr.b	cdb_MacroRun(A5)
	bra	mac_DoEffects

mac_AddVolume
	cmp.b	#$FE,mdb_LongStore+2(A6)
	bne.s	lbC000D86
	move.b	cdb_CurrNote(A5),D2
	move.b	mdb_LongStore+3(A6),D3
	clr.w	mdb_LongStore+2(A6)
	lea	lbW000D82(PC),A1
	bra	lbC000E02

lbW000D82
	move.b	d3,mdb_LongStore+3(A6)
;	dc.w	$1D43
;	dc.w	$1B

lbC000D86
	move.w	cdb_Velocity(A5),D0
	add.w	D0,D0
	add.w	cdb_Velocity(A5),D0
	add.w	mdb_LongStore+2(A6),D0
	move.b	D0,cdb_CurVol(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_SetVolume
	cmp.b	#$FE,mdb_LongStore+2(A6)
	bne.s	lbC000DBE
	move.b	cdb_CurrNote(A5),D2
	move.b	mdb_LongStore+3(A6),D3
	clr.w	mdb_LongStore+2(A6)
	lea	lbC000DBA(PC),A1
	bra.s	lbC000E02

lbC000DBA
	move.b	D3,mdb_LongStore+3(A6)
lbC000DBE
	move.b	mdb_LongStore+3(A6),cdb_CurVol(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_StartMacro
	move.b	cdb_CurrNote(A5),mdb_LongStore(A6)
	move.b	cdb_Velocity+1(A5),D0
	lsl.b	#4,D0
	or.b	D0,mdb_LongStore+2(A6)
	move.l	mdb_LongStore(A6),D0
	bsr	tfmx_NOTEPORT
	bra	lbC000B44

mac_AddPrevNote
	move.b	cdb_PrevNote(A5),D2
	lea	lbC000B32(PC),A1
	bra.s	lbC000E02

mac_SetNote
	moveq	#0,D2
	lea	lbC000B32(PC),A1
	bra.s	lbC000E02

mac_AddNote
	move.b	cdb_CurrNote(A5),D2
	lea	lbC000B32(PC),A1
lbC000E02
	move.b	mdb_LongStore+1(A6),D0
	add.b	D2,D0
	and.b	#$3F,D0
	ext.w	D0
	add.w	D0,D0
	lea	PeriodTable(PC),A0
	move.w	0(A0,D0.W),D0
	move.w	cdb_Finetune(A5),D1
	add.w	mdb_LongStore+2(A6),D1
	beq.s	lbC000E2A
	add.w	#$100,D1
	mulu	D1,D0
	lsr.l	#8,D0
lbC000E2A
	move.w	D0,cdb_DestPeriod(A5)
	tst.w	cdb_PortaRate(A5)
	bne.s	lbC000E38
	move.w	D0,cdb_CurPeriod(A5)
lbC000E38
	jmp	(A1)

mac_SetPeriod
	move.w	mdb_LongStore+2(A6),cdb_DestPeriod(A5)
	tst.w	cdb_PortaRate(A5)
	bne	lbC000B44
	move.w	mdb_LongStore+2(A6),cdb_CurPeriod(A5)
	bra	lbC000B44

mac_Porta
	move.b	mdb_LongStore+1(A6),cdb_PortaReset(A5)
	move.b	#1,cdb_PortaTime(A5)
	tst.w	cdb_PortaRate(A5)
	bne.s	lbC000E6A
	move.w	cdb_DestPeriod(A5),cdb_PortaPer(A5)
lbC000E6A
	move.w	mdb_LongStore+2(A6),cdb_PortaRate(A5)
	bra	lbC000B44

mac_Vibrato
	move.b	mdb_LongStore+1(A6),D0
	move.b	D0,cdb_VibReset(A5)
	lsr.b	#1,D0
	move.b	D0,cdb_VibTime(A5)
	move.b	mdb_LongStore+3(A6),cdb_VibWidth(A5)
	move.b	#1,cdb_VibFlag(A5)
	tst.w	cdb_PortaRate(A5)
	bne	lbC000B44
	move.w	cdb_DestPeriod(A5),cdb_CurPeriod(A5)
	clr.w	cdb_VibOffset(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_Envelope
	move.b	mdb_LongStore+2(A6),cdb_EnvReset(A5)
	move.b	mdb_LongStore+1(A6),cdb_EnvRate(A5)
	move.b	mdb_LongStore+2(A6),cdb_EnvTime(A5)
	move.b	mdb_LongStore+3(A6),cdb_EnvEndvol(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_Reset
	clr.b	cdb_ArpRun(A5)
	clr.w	cdb_SIDSize(A5)
	clr.b	cdb_AddBeginTime(A5)
	clr.b	cdb_EnvReset(A5)
	clr.b	cdb_VibReset(A5)
	clr.w	cdb_PortaRate(A5)
	bra	lbC000B44

mac_WaitKeyUp
	tst.b	cdb_KeyUp(A5)
	beq	lbC000B44
	tst.b	cdb_Loop(A5)
	beq.s	lbC000F00
	cmp.b	#$FF,cdb_Loop(A5)
	beq.s	lbC000F08
	subq.b	#1,cdb_Loop(A5)
	bra.s	lbC000F12

lbC000F00
	st	cdb_Loop(A5)
	bra	lbC000B44

lbC000F08
	move.b	mdb_LongStore+3(A6),D0
	subq.b	#1,D0
	move.b	D0,cdb_Loop(A5)
lbC000F12
	bra	mac_DoEffects

mac_GoSub
	move.l	cdb_MacroPtr(A5),cdb_ReturnPtr(A5)
	move.w	cdb_MacroStep(A5),cdb_ReturnStep(A5)
mac_Cont
	move.b	mdb_LongStore+1(A6),D0
	and.l	#$7F,D0
	move.l	mdb_MacroBase(A6),A0
	add.w	D0,D0
	add.w	D0,D0
	add.w	D0,A0
	move.l	(A0),D0
	add.l	mdb_MdatBase(A6),D0
	move.l	D0,cdb_MacroPtr(A5)
	move.w	mdb_LongStore+2(A6),cdb_MacroStep(A5)
	st	cdb_Loop(A5)
	bra	mac_NextStep

mac_ReturnSub
	move.l	cdb_ReturnPtr(A5),cdb_MacroPtr(A5)
	move.w	cdb_ReturnStep(A5),cdb_MacroStep(A5)
	bra	lbC000B44

mac_SampleLoop
	move.l	mdb_LongStore(A6),D0
	add.l	D0,cdb_CurAddr(A5)
;	move.l	cdb_CurAddr(A5),(A4)
	move.l	cdb_CurAddr(A5),cdb_SaveAddr(A5)
	lsr.w	#1,D0
	sub.w	D0,cdb_CurrLength(A5)
;	move.w	cdb_CurrLength(A5),4(A4)
	move.w	cdb_CurrLength(A5),cdb_SaveLen(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_OneShot
	clr.b	cdb_AddBeginTime(A5)
	move.l	mdb_SmplBase(A6),cdb_CurAddr(A5)
;	move.l	mdb_SmplBase(A6),(A4)
	move.l	mdb_SmplBase(A6),cdb_SaveAddr(A5)
	moveq	#1,d0
	move.w	d0,cdb_CurrLength(A5)
;	move.w	d0,4(A4)
	move.w	d0,cdb_SaveLen(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_Cue
	move.b	mdb_LongStore+1(A6),D0
	and.w	#3,D0
	add.w	D0,D0
	lea	InfoDataBlock(PC),A0
	move.w	mdb_LongStore+2(A6),idb_Cue(A0,D0.W)
	bra	lbC000B44

mac_22	; set source sample and start filter
	ifd	BREAKWEIRD
	illegal
	moveq	#$22,d0
	endc
	clr.b	cdb_AddBeginTime(A5)
	move.l	mdb_LongStore(A6),D0
	add.l	mdb_SmplBase(A6),D0
	move.l	D0,cdb_SIDSrcSample(A5)
	move.l	D0,cdb_CurAddr(A5)
	move.l	mdb_WorkBase(A6),D0
	add.l	cdb_WorkBase(A5),D0
;	move.l	D0,(A4)
	move.l	D0,cdb_SaveAddr(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_23	; set sid filter stuff length
	ifd	BREAKWEIRD
	illegal
	moveq	#$23,d0
	endc
	move.w	mdb_LongStore(A6),D0	;set up funky manipulations
	bne.s	lbC000FE8
	move.w	#$100,D0
lbC000FE8
	lsr.w	#1,D0
;	move.w	D0,4(A4)
	move.w	D0,cdb_SaveLen(A5)
	move.w	mdb_LongStore(A6),D0
	subq.w	#1,D0
	and.w	#$FF,D0
	move.w	D0,cdb_SIDSize(A5)
	move.w	mdb_LongStore+2(A6),cdb_SIDSrcLength(A5)
	move.w	mdb_LongStore+2(A6),cdb_CurrLength(A5)	;saved sample len
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_24	; sid vib 2 ofs
	ifd	BREAKWEIRD
	illegal
	moveq	#$24,d0
	endc
	move.l	mdb_LongStore(A6),D0
	lsl.l	#8,D0
	move.l	D0,cdb_SIDVib2Ofs(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_26	; sid vib ofs
	ifd	BREAKWEIRD
	illegal
	moveq	#$26,d0
	endc
	move.l	mdb_LongStore(A6),cdb_SIDVibOfs(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_25	; sid vib 2 speed/width
	ifd	BREAKWEIRD
	illegal
	moveq	#$25,d0
	endc
	move.w	mdb_LongStore(A6),cdb_SIDVib2Time(A5)
	move.w	mdb_LongStore(A6),cdb_SIDVib2Reset(A5)
	move.w	mdb_LongStore+2(A6),cdb_SIDVib2Width(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_27	; sid vib speed/width
	ifd	BREAKWEIRD
	illegal
	moveq	#$27,d0
	endc
	move.w	mdb_LongStore(A6),cdb_SIDVibTime(A5)
	move.w	mdb_LongStore(A6),cdb_SIDVibReset(A5)
	move.w	mdb_LongStore+2(A6),cdb_SIDVibWidth(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_28	; sid filter time constant
	ifd	BREAKWEIRD
	illegal
	moveq	#$28,d0
	endc
	move.b	mdb_LongStore+3(A6),cdb_SIDFilterTC(A5)
	move.b	mdb_LongStore+2(A6),D0
	ext.w	D0
	lsl.w	#4,D0
	move.w	D0,cdb_SIDFilterWidth(A5)
	move.w	mdb_LongStore(A6),cdb_SIDFilterTime(A5)
	move.w	mdb_LongStore(A6),cdb_SIDFilterReset(A5)
	addq.w	#1,cdb_MacroStep(A5)
	bra	mac_NextStep

mac_29	; clear sid
	ifd	BREAKWEIRD
	illegal
	moveq	#$29,d0
	endc
	addq.w	#1,cdb_MacroStep(A5)	;stop funky manipulations
	clr.w	cdb_SIDSize(A5)
	tst.b	mdb_LongStore+1(A6)
	beq	mac_NextStep
	clr.l	cdb_SIDVib2Ofs(A5)
	clr.w	cdb_SIDVib2Time(A5)
	clr.w	cdb_SIDVib2Reset(A5)
	clr.w	cdb_SIDVib2Width(A5)
	clr.l	cdb_SIDVibOfs(A5)
	clr.w	cdb_SIDVibTime(A5)
	clr.w	cdb_SIDVibReset(A5)
	clr.w	cdb_SIDVibWidth(A5)
	clr.b	cdb_SIDFilterTC(A5)
	clr.w	cdb_SIDFilterWidth(A5)
	clr.w	cdb_SIDFilterTime(A5)
	clr.w	cdb_SIDFilterReset(A5)
	bra	mac_NextStep

mac_DoEffects
	tst.b	cdb_EfxRun(A5)
	bmi.s	lbC0010DC
	bne.s	lbC0010E0
	move.b	#1,cdb_EfxRun(A5)
lbC0010DC
	bra	lbC001464

lbC0010E0
	tst.b	cdb_AddBeginTime(A5)
	beq.s	lbC001112
; addbegin
	move.l	cdb_CurAddr(A5),D0
	add.l	cdb_AddBegin(A5),D0
	move.l	D0,cdb_CurAddr(A5)
	tst.w	cdb_SIDSize(A5)
	beq.s	lbC0010FE
	move.l	D0,cdb_SIDSrcSample(A5)
	bra.s	lbC001100

lbC0010FE
;	move.l	D0,(A4)
	move.l	D0,cdb_SaveAddr(A5)
lbC001100
	subq.b	#1,cdb_AddBeginTime(A5)
	bne.s	lbC001112
	move.b	cdb_AddBeginReset(A5),cdb_AddBeginTime(A5)
	neg.l	cdb_AddBegin(A5)
lbC001112
	tst.w	cdb_SIDSize(A5)
	beq	lbC0011D2
; SID simulator stuff
;	illegal
	move.l	cdb_SIDSrcSample(A5),A0
	move.l	cdb_SIDVib2Ofs(A5),D4
	move.l	cdb_SIDVibOfs(A5),D5
	move.l	cdb_WorkBase(A5),A1
	add.l	mdb_WorkBase(A6),A1
	move.w	cdb_SIDSize(A5),D7
	move.w	cdb_SIDSrcLength(A5),D6
	move.b	cdb_SIDFilterTC(A5),D3
	moveq	#0,D0
	move.b	cdb_SIDSaveState(A5),D1
lbC001142
	add.l	D5,D4
	swap	D0
	add.l	D4,D0
	swap	D0
	and.w	D6,D0
	move.b	0(A0,D0.W),D2
	tst.b	D3
	beq.s	lbC001174
	cmp.b	D1,D2
	beq.s	lbC001172
	bgt.s	lbC00116A
	subx.b	D3,D1
	bvs.s	lbC001172
	cmp.b	D1,D2
	bge.s	lbC001172
lbC001162
	move.b	D1,(A1)+
	dbra	D7,lbC001142
	bra.s	lbC00117A

lbC00116A
	addx.b	D3,D1
	bvs.s	lbC001172
	cmp.b	D1,D2
	bgt.s	lbC001162
lbC001172
	move.b	D2,D1
lbC001174
	move.b	D2,(A1)+
	dbra	D7,lbC001142
lbC00117A
	move.b	D1,cdb_SIDSaveState(A5)
	tst.b	D3
	beq.s	lbC00119A
	move.w	cdb_SIDFilterWidth(A5),D0
	add.w	D0,cdb_SIDFilterTC(A5)
	subq.w	#1,cdb_SIDFilterTime(A5)
	bne.s	lbC00119A
	move.w	cdb_SIDFilterReset(A5),cdb_SIDFilterTime(A5)
	neg.w	cdb_SIDFilterWidth(A5)
lbC00119A
	move.w	cdb_SIDVib2Width(A5),D0
	ext.l	D0
	add.l	D0,cdb_SIDVib2Ofs(A5)
	subq.w	#1,cdb_SIDVib2Time(A5)
	bne.s	lbC0011B6
	move.w	cdb_SIDVib2Reset(A5),cdb_SIDVib2Time(A5)
	beq.s	lbC0011B6
	neg.w	cdb_SIDVib2Width(A5)
lbC0011B6
	move.w	cdb_SIDVibWidth(A5),D0
	ext.l	D0
	add.l	D0,cdb_SIDVibOfs(A5)
	subq.w	#1,cdb_SIDVibTime(A5)
	bne.s	lbC0011D2
	move.w	cdb_SIDVibReset(A5),cdb_SIDVibTime(A5)
	beq.s	lbC0011D2
	neg.w	cdb_SIDVibWidth(A5)
lbC0011D2

	tst.b	cdb_VibReset(A5)
	beq.s	lbC00121C
; vibrato
	move.b	cdb_VibWidth(A5),D0
	ext.w	D0
	add.w	D0,cdb_VibOffset(A5)
	move.w	cdb_DestPeriod(A5),D0
	move.w	cdb_VibOffset(A5),D1
	beq.s	lbC0011FC
	and.l	#$FFFF,D0
	add.w	#$800,D1
	mulu	D1,D0
	lsl.l	#5,D0
	swap	D0
lbC0011FC
	tst.w	cdb_PortaRate(A5)
	bne.s	lbC001206
	move.w	D0,cdb_CurPeriod(A5)
lbC001206
	subq.b	#1,cdb_VibTime(A5)
	bne.s	lbC00121C
	move.b	cdb_VibReset(A5),cdb_VibTime(A5)
	neg.b	cdb_VibWidth(A5)
lbC00121C
	tst.w	cdb_PortaRate(A5)
	beq.s	lbC00127A
; portamento
	subq.b	#1,cdb_PortaTime(A5)
	bne.s	lbC00127A
	move.b	cdb_PortaReset(A5),cdb_PortaTime(A5)
	move.w	cdb_DestPeriod(A5),D1
	moveq	#0,D0
	move.w	cdb_PortaPer(A5),D0
	cmp.w	D1,D0
	beq.s	lbC001250
	bcs.s	lbC001266
	move.w	#$100,D2
	sub.w	cdb_PortaRate(A5),D2
	mulu	D2,D0
	lsr.l	#8,D0
	cmp.w	D1,D0
	beq.s	lbC001250
	bcc.s	lbC001258
lbC001250
	clr.w	cdb_PortaRate(A5)
	move.w	cdb_DestPeriod(A5),D0
lbC001258
	and.w	#$7FF,D0
	move.w	D0,cdb_PortaPer(A5)
	move.w	D0,cdb_CurPeriod(A5)
	bra.s	lbC00127A

lbC001266
	move.w	cdb_PortaRate(A5),D2
	add.w	#$100,D2
	mulu	D2,D0
	lsr.l	#8,D0
	cmp.w	D1,D0
	beq.s	lbC001250
	bcc.s	lbC001250
	bra.s	lbC001258

lbC00127A
	tst.b	cdb_EnvReset(A5)
	beq.s	lbC0012C8
; envelope
	tst.b	cdb_EnvTime(A5)
	beq.s	lbC00128C
	subq.b	#1,cdb_EnvTime(A5)
	bra.s	lbC0012C8

lbC00128C
	move.b	cdb_EnvReset(A5),cdb_EnvTime(A5)
	move.b	cdb_EnvEndvol(A5),D0
	cmp.b	cdb_CurVol(A5),D0
	bgt.s	lbC0012BA
	move.b	cdb_EnvRate(A5),D1
	sub.b	D1,cdb_CurVol(A5)
	bmi.s	lbC0012AE
	cmp.b	cdb_CurVol(A5),D0
	bge.s	lbC0012AE
	bra.s	lbC0012C8

lbC0012AE
	move.b	cdb_EnvEndvol(A5),cdb_CurVol(A5)
	clr.b	cdb_EnvReset(A5)
	bra.s	lbC0012C8

lbC0012BA
	move.b	cdb_EnvRate(A5),D1
	add.b	D1,cdb_CurVol(A5)
	cmp.b	cdb_CurVol(A5),D0
	ble.s	lbC0012AE
lbC0012C8
;	tst.w	mdb_CIAsave(A6)
;	beq.s	lbC0012DE
; set tempo
	move.l	a0,-(sp)
	move.l	dt_DeliGlob(pc),a0
	move.w	mdb_CIAsave(A6),dtg_Timer(A0)
	move.l	dtg_SetTimer(a0),a0
	jsr	(a0)
	move.l	(sp)+,a0

lbC0012DE
	tst.b	cdb_ArpRun(A5)
	beq	lbC001464
	bmi.s	lbC00131E
	move.b	cdb_ArpMacro(A5),D0
	and.l	#$7F,D0
	move.l	mdb_MacroBase(A6),A0
	add.w	D0,D0
	add.w	D0,D0
	add.w	D0,A0
	move.l	(A0),D0
	add.l	mdb_MdatBase(A6),D0
	move.l	D0,cdb_ArpPtr(A5)
	clr.w	cdb_ArpStep(A5)
	move.b	#$FF,cdb_ArpRun(A5)
	btst	#0,cdb_ArpFlags(A5)
	beq.s	lbC00131E
	bsr	lbC0013F6
lbC00131E
	subq.b	#1,cdb_ArpTime(A5)
	bne	lbC00140C
	move.b	cdb_ArpReset(A5),cdb_ArpTime(A5)
	move.l	cdb_ArpPtr(A5),A0
lbC001330
	move.w	cdb_ArpStep(A5),D0
	move.b	0(A0,D0.W),D0
	move.b	D0,mdb_LongStore(A6)
	bne.s	lbC00134C
	tst.w	cdb_ArpStep(A5)
	beq	lbC001464
	clr.w	cdb_ArpStep(A5)
	bra.s	lbC001330

lbC00134C
	add.b	cdb_CurrNote(A5),D0
	and.w	#$3F,D0
	beq	lbC0013F6
	add.w	D0,D0
	lea	PeriodTable(PC),A0
	move.w	0(A0,D0.W),D0
	move.w	cdb_Finetune(A5),D1
	beq.s	lbC001370
	add.w	#$100,D1
	mulu	D1,D0
	lsr.l	#8,D0
lbC001370
	btst	#0,cdb_ArpFlags(A5)
	bne.s	lbC00139C
	move.w	D0,cdb_DestPeriod(A5)
	tst.w	cdb_PortaRate(A5)
	bne	lbC001464
	move.w	D0,cdb_CurPeriod(A5)
	btst	#7,mdb_LongStore(A6)
	beq.s	lbC001394
	clr.b	cdb_ReallyWait(A5)
lbC001394
	addq.w	#1,cdb_ArpStep(A5)
	bra	lbC001464

lbC00139C
	bsr	Random
	btst	#2,cdb_ArpFlags(A5)
	bne.s	lbC0013BC
	move.w	cdb_ArpStep(A5),D1
	and.w	#3,D1
	tst.w	D1
	bne.s	lbC0013BC
	moveq	#$10,D1
	cmp.b	mdb_RandomSeed+1(A6),D1
	bcc.s	lbC0013D8
lbC0013BC
	btst	#7,mdb_LongStore(A6)
	beq.s	lbC0013C8
	clr.b	cdb_ReallyWait(A5)
lbC0013C8
	move.w	D0,cdb_DestPeriod(A5)
	tst.w	cdb_PortaRate(A5)
	bne.s	lbC0013D8
	move.w	D0,cdb_CurPeriod(A5)
lbC0013D8
	addq.w	#1,cdb_ArpStep(A5)
	btst	#6,mdb_LongStore(A6)
	beq	lbC001464
	bsr	Random
	move.w	#6,D1
	cmp.b	mdb_RandomSeed(A6),D1
	bcc	lbC001464
lbC0013F6
	bsr	Random
	moveq	#0,D1
	move.b	mdb_RandomSeed+1(A6),D1
	and.b	cdb_RandomNote(A5),D1
	move.w	D1,cdb_ArpStep(A5)
	bra	lbC001464

lbC00140C
	btst	#1,cdb_ArpFlags(A5)
	beq.s	lbC001464
	moveq	#0,D0
	move.b	cdb_ArpReset(A5),D0
	mulu	#3,D0
	lsr.w	#3,D0
	cmp.b	cdb_ArpTime(A5),D0
	bne.s	lbC001464
	move.w	cdb_DestPeriod(A5),D0
	moveq	#0,D1
	move.b	cdb_CurVol(A5),D1
	mulu	#5,D1
	lsr.w	#3,D1
	move.l	A5,-(SP)
	add.l	cdb_NextChannel(A5),A5
	move.l	cdb_Hardware(A5),A4
	move.b	D1,cdb_CurVol(A5)
	cmp.w	cdb_DestPeriod(A5),D0
	beq.s	lbC00145E
	move.w	D0,cdb_DestPeriod(A5)
	move.w	D0,cdb_CurPeriod(A5)
	btst	#7,mdb_LongStore(A6)
	beq.s	lbC00145E
	clr.b	cdb_ReallyWait(A5)
lbC00145E
	move.l	(SP)+,A5
	move.l	cdb_Hardware(A5),A4

lbC001464
	tst.b	mdb_FadeSlope(A6)
	beq.s	lbC001494
; fade
	subq.b	#1,mdb_FadeTime(A6)
	bne.s	lbC001494
	move.b	mdb_FadeReset(A6),mdb_FadeTime(A6)
	move.b	mdb_FadeSlope(A6),D0
	add.b	D0,mdb_MasterVol(A6)
	move.b	mdb_FadeDest(A6),D0
	cmp.b	mdb_MasterVol(A6),D0
	bne.s	lbC001494
	clr.b	mdb_FadeSlope(A6)
	lea	InfoDataBlock(PC),A0
	clr.w	idb_Fade(A0)
lbC001494
;	move.w	D0,8(A4)
	rts

Random
	movem.l	D0/D1,-(SP)
	move.w	mdb_RandomSeed(A6),D0
	move.w	D0,D1
	asl.w	#$03,D1
	sub.w	D0,D1
	asl.w	#$03,D1
	add.w	D0,D1
	add.w	D1,D1
	add.w	D0,D1
	asl.w	#$04,D1
	sub.w	D0,D1
	add.w	D1,D1
	sub.w	D0,D1
	subq.w	#$01,D1
	move.w	D1,D0
	move.w	D0,mdb_RandomSeed(A6)
	movem.l	(SP)+,D0/D1
	rts

;Random
;	move.w	$DFF006,D7
;	eor.w	D7,mdb_RandomSeed(A6)
;	move.w	mdb_RandomSeed(A6),D7
;	add.w	#$4335,D7
;	move.w	D7,mdb_RandomSeed(A6)
;	rts

tfmx_NOTEPORT
	movem.l	D0/A4-A6,-(SP)
	lea	MasterDataBlock(PC),A6
	move.l	mdb_LongStore(A6),-(SP)
	lea	VoiceUseTable(PC),A5
	move.l	D0,mdb_LongStore(A6)
	move.b	mdb_LongStore+2(A6),D0
	and.w	#$F,D0
	add.w	D0,D0
	add.w	D0,D0
	move.l	0(A5,D0.W),A5
	move.b	mdb_LongStore(A6),D0
	cmp.b	#$FC,D0
	bne.s	lbC00150E
; channel lock
	move.b	mdb_LongStore+1(A6),cdb_SfxFlag(A5)
	moveq	#0,d0
	move.b	mdb_LongStore+3(A6),D0
	move.w	D0,cdb_SfxLockTime(A5)
	bra	lbC0015E8

lbC00150E
	tst.b	cdb_SfxFlag(A5)
	bne	lbC0015E8
	tst.b	D0
	bpl	lbC00157E
	cmp.b	#$F7,D0
	bne.s	lbC001542
; envelope
	move.b	mdb_LongStore+1(A6),cdb_EnvRate(A5)
	move.b	mdb_LongStore+2(A6),D0
	lsr.b	#4,D0
	addq.b	#1,D0
	move.b	D0,cdb_EnvTime(A5)
	move.b	D0,cdb_EnvReset(A5)
	move.b	mdb_LongStore+3(A6),cdb_EnvEndvol(A5)
	bra	lbC0015E8

lbC001542
	cmp.b	#$F6,D0
	bne.s	lbC00156C
; vibrato
	move.b	mdb_LongStore+1(A6),D0
	and.b	#$FE,D0
	move.b	D0,cdb_VibReset(A5)
	lsr.b	#1,D0
	move.b	D0,cdb_VibTime(A5)
	move.b	mdb_LongStore+3(A6),cdb_VibWidth(A5)
	move.b	#1,cdb_VibFlag(A5)
	clr.w	cdb_VibOffset(A5)
	bra.s	lbC0015E8

lbC00156C
	cmp.b	#$F5,D0
	bne.s	lbC001578
; keyup
	clr.b	cdb_KeyUp(A5)
	bra.s	lbC0015E8

lbC001578
	cmp.b	#$BF,D0
	bcc.s	lbC0015F2
lbC00157E
	move.b	mdb_LongStore+3(A6),D0
	ext.w	D0
	move.w	D0,cdb_Finetune(A5)
	move.b	mdb_LongStore+2(A6),D0
	lsr.b	#4,D0
	and.w	#$F,D0
	move.b	D0,cdb_Velocity+1(A5)
	move.b	mdb_LongStore+1(A6),D0
	move.b	cdb_CurrNote(A5),cdb_PrevNote(A5)
	move.b	mdb_LongStore(A6),cdb_CurrNote(A5)
	move.l	mdb_MacroBase(A6),A4
	add.w	D0,D0
	add.w	D0,D0
	add.w	D0,A4
	move.l	(A4),A4
	add.l	mdb_MdatBase(A6),A4
	move.l	A4,cdb_MacroPtr(A5)
	clr.w	cdb_MacroStep(A5)
	clr.w	cdb_MacroWait(A5)
	clr.b	cdb_EfxRun(A5)
	st	cdb_Loop(A5)
	st	cdb_MacroRun(A5)
	move.b	#1,cdb_KeyUp(A5)
lbC0015E8
	move.l	(SP)+,mdb_LongStore(A6)
	movem.l	(SP)+,D0/A4-A6
	rts

lbC0015F2
	move.b	mdb_LongStore+1(A6),cdb_PortaReset(A5)
	move.b	#1,cdb_PortaTime(A5)
	tst.w	cdb_PortaRate(A5)
	bne.s	lbC00160A
	move.w	cdb_DestPeriod(A5),cdb_PortaPer(A5)
lbC00160A
	clr.w	cdb_PortaRate(A5)
	move.b	mdb_LongStore+3(A6),cdb_PortaRate+1(A5)
	move.b	mdb_LongStore(A6),D0
	and.w	#$3F,D0
	move.b	D0,cdb_CurrNote(A5)
	add.w	D0,D0
	lea	PeriodTable(PC),A4
	move.w	0(A4,D0.W),cdb_DestPeriod(A5)
	bra.s	lbC0015E8

tfmx_CHANNELOFF
	movem.l	A5/A6,-(SP)
	lea	MasterDataBlock(pc),a6
	lea	VoiceUseTable(PC),A5
	and.w	#$F,D0
	add.w	D0,D0
	add.w	D0,D0
	move.l	0(A5,D0.W),A5
	tst.b	cdb_SfxFlag(A5)
	bne.s	.skip
	move.w	cdb_DMAbit(A5),d0
	not.w	d0
	and.w	d0,mdb_DMAstate(A6)
	clr.b	cdb_MacroRun(A5)
	clr.w	cdb_SIDSize(A5)
	clr.b	cdb_ArpRun(A5)
	st	cdb_NewStyleMacro(A5)
	move.l	mdb_SmplBase(a6),cdb_SaveAddr(a5)
	move.w	#1,cdb_SaveLen(a5)
	move.l	cdb_Hardware(a5),a5
	move.l	mdb_SmplBase(a6),nch_SampleStart(a5)
	move.w	#1,nch_SampleLength(a5)
	move.l	mdb_SmplBase(a6),nch_RepeatStart(a5)
	move.w	#1,nch_RepeatLength(a5)
	clr.w	nch_Volume(a5)
	or.b	#NCHF_Sample|NCHF_Repeat|NCHF_Volume,nch_Changed(a5)
.skip
	movem.l	(SP)+,A5/A6
	rts

tfmx_FADE
	movem.l	A5/A6,-(SP)
	lea	MasterDataBlock(PC),A6
	lea	InfoDataBlock(PC),A5
	move.w	#1,idb_Fade(A5)
	move.b	D0,mdb_FadeDest(A6)
	swap	D0
	move.b	D0,mdb_FadeTime(A6)
	move.b	D0,mdb_FadeReset(A6)
	beq.s	lbC0016A0
	move.b	mdb_MasterVol(A6),D0
	move.b	#1,mdb_FadeSlope(A6)
	cmp.b	mdb_FadeDest(A6),D0
	beq.s	lbC0016A6
	bcs.s	lbC0016AE
	neg.b	mdb_FadeSlope(A6)
	bra.s	lbC0016AE
lbC0016A0
	move.b	mdb_FadeDest(A6),mdb_MasterVol(A6)
lbC0016A6
	clr.b	mdb_FadeSlope(A6)
	clr.w	idb_Fade(A5)
lbC0016AE
	movem.l	(SP)+,A5/A6
	rts

tfmx_INFO
	lea	InfoDataBlock(PC),A0
	rts

tfmx_PLAYPATT1
	movem.l	A3-A6,-(SP)
	lea	MasterDataBlock(PC),A6
	lea	PatternDataBlock(PC),A5
	move.w	#1,mdb_PlayPattFlag(A6)
	move.l	mdb_MdatBase(A6),A4
	move.l	mdb_PattBase(A6),A3
	move.w	D0,pdb_PNum+4*7(A5)
	clr.b	D0
	lsr.w	#6,D0
	move.l	0(A3,D0.W),D0
	add.l	A4,D0
	move.l	D0,pdb_PAddr+4*7(A5)
	clr.l	pdb_PStep+4*7(A5)
	st	pdb_PLoop+4*7(A5)
	movem.l	(SP)+,A3-A6
	rts

tfmx_PLAYPATT2
	movem.l	A5/A6,-(SP)
	lea	MasterDataBlock(PC),A6
	lea	PatternDataBlock(PC),A5
	move.w	#1,mdb_PlayPattFlag(A6)
	move.w	D0,pdb_PNum+4*7(A5)
	move.l	A1,pdb_PAddr+4*7(A5)
	clr.l	pdb_PStep+4*7(A5)
	st	pdb_PLoop+4*7(A5)
	movem.l	(SP)+,A5/A6
	rts

; Whooooaaaaa!  Interesting!
; FB xx pp tt xx xx xx xx = pattern/transpose style soundeffect
; nn mm vc ff VC zz kk kk = note style soundeffect (lockout for kkkk)
; (plays on vc if song plays, on VC if no current song)
; zz[6..0]=priority, zz[7]=-restartable

tfmx_PROSFX
	movem.l	D1-D3/A4-A6,-(SP)
	lea	MasterDataBlock(PC),A6
	lea	VoiceUseTable(PC),A4
	move.w	D0,D2
	move.l	mdb_SfxBase(A6),A5
	lsl.w	#3,D2
	add.w	d2,a5
	cmp.b	#$FB,(A5)
	bne.s	.notpatt
	move.w	2(A5),D0
	bsr	tfmx_PLAYPATT1
	bra.s	.done
.notpatt
	move.b	2(A5),D3
	tst.b	mdb_CurrSong(A6)
	bpl.s	.songon
	move.b	4(A5),D3
.songon
	and.w	#$F,D3
	add.w	D3,D3
	add.w	D3,D3
	move.l	0(A4,D3.W),A4
	lsl.w	#6,D3
	move.b	5(A5),D1
	bclr	#7,D1
	cmp.b	cdb_SfxPriority(A4),D1	; abort new sfx if new
	bcc.s	.hipri			; is of lower priority
	tst.w	cdb_SfxLockTime(A4)	; than old, AND old still
	bpl.s	.done			; has lock on channel
.hipri
	cmp.b	cdb_SfxNum(A4),D2
	bne.s	.startit
	tst.w	cdb_SfxLockTime(A4)	; also don't start new if
	bmi.s	.startit		; lock expires, this is
	btst	#7,5(A5)		; the same sfx, and the sfx
	bne.s	.done			; is flagged non-restartable
.startit
	move.l	(A5),D0
	and.w	#$F0FF,D0
	or.w	D3,D0
	move.l	D0,cdb_SfxCode(A4)
	move.b	D1,cdb_SfxPriority(A4)
	move.w	6(A5),cdb_SfxLockTime(A4)
	move.b	D2,cdb_SfxNum(A4)
.done
	movem.l	(SP)+,D1-D3/A4-A6
	rts

tfmx_ALLOFF
	movem.l	A5-A6,-(SP)
	lea	MasterDataBlock(PC),A6
	clr.b	mdb_PlayerEnable(A6)
	clr.w	mdb_DMAstate(A6)
	lea	NoteRec0(PC),A5
	bsr.s	.kill
	lea	NoteRec1(PC),A5
	bsr.s	.kill
	lea	NoteRec2(PC),A5
	bsr.s	.kill
	lea	NoteRec3(PC),A5
	bsr.s	.kill
	lea	NoteRec4(PC),A5
	bsr.s	.kill
	lea	NoteRec5(PC),A5
	bsr.s	.kill
	lea	NoteRec6(PC),A5
	bsr.s	.kill
	lea	NoteRec7(PC),A5
	bsr.s	.kill
	lea	InfoDataBlock(PC),A5
	clr.w	idb_Fade(A5)
	clr.b	idb_NewTrack(A5)
	movem.l	(SP)+,A5-A6
	rts
.kill
	clr.b	cdb_MacroRun(A5)
	clr.l	cdb_SfxFlag(A5)
	clr.w	cdb_SIDSize(A5)
	clr.b	cdb_ArpRun(A5)
	st	cdb_NewStyleMacro(A5)
	move.l	cdb_Hardware(A5),A5
	move.l	mdb_SmplBase(A6),nch_SampleStart(A5)
	move.w	#1,nch_SampleLength(A5)
	move.l	mdb_SmplBase(A6),nch_RepeatStart(A5)
	move.w	#1,nch_RepeatLength(A5)
	clr.w	nch_Volume(A5)
	or.b	#NCHF_Sample|NCHF_Repeat|NCHF_Volume,nch_Changed(A5)
	rts

tfmx_SONGPLAY
	movem.l	D1-D7/A0-A6,-(SP)
	lea	MasterDataBlock(PC),A6
	move.b	D0,mdb_SongNum(A6)
	bsr.s	lbC001866
	movem.l	(SP)+,D1-D7/A0-A6
	rts

tfmx_PLAYCONT
	movem.l	D1-D7/A0-A6,-(SP)
	lea	MasterDataBlock(PC),A6
	or.w	#$100,D0
	move.w	D0,mdb_SongCont(A6)
	bsr.s	lbC001866
	movem.l	(SP)+,D1-D7/A0-A6
	rts

lbC001866
	bsr	tfmx_ALLOFF
	clr.b	mdb_PlayerEnable(A6)
	clr.w	mdb_PlayPattFlag(A6)
	move.l	mdb_MdatBase(A6),A4
	move.b	mdb_SongNum(A6),D0
	and.w	#$1F,D0
	add.w	D0,D0
	add.w	D0,A4
	lea	PatternDataBlock(PC),A5
	move.b	mdb_CurrSong(A6),D1
	bmi.s	lbC0018AA
	and.w	#$1F,D1
	add.w	D1,D1
	lea	SongHoldStats(PC),A0
	add.w	D1,A0
	move.w	pdb_CurrPos(A5),(A0)
	move.b	pdb_Prescale+1(A5),$41(A0)
	move.w	mdb_CIAsave(A6),$80(A0)
lbC0018AA
	bsr	tfmx_PALNTSCINIT
	move.w	$100(A4),pdb_CurrPos(A5)
	move.w	$100(A4),pdb_FirstPos(A5)
	move.w	$140(A4),pdb_LastPos(A5)
	move.w	$180(A4),D2
	btst	#0,mdb_SongCont(A6)
	beq.s	lbC0018FE
	lea	SongHoldStats(PC),A0
	add.w	D0,A0
	move.w	(A0),pdb_CurrPos(A5)
	moveq	#0,D2
	move.b	$41(A0),D2
	tst.w	$80(A0)
	beq.s	lbC0018FE
	move.w	$80(A0),mdb_CIAsave(A6)
	move.l	a1,-(sp)
	move.l	a0,a1
	move.l	dt_DeliGlob(pc),a0
	move.w	$80(A1),dtg_Timer(A0)
	move.l	dtg_SetTimer(a0),a0
	jsr	(a0)
	move.l	(sp)+,a0
	exg	a0,a1
	clr.w	$80(A0)
	bra.s	lbC001924

lbC0018FE
	cmp.w	#$F,D2
	bls.s	lbC001924
	move.w	D2,D0
	move.w	pdb_Prescale(A5),D2
	move.l	#$1B51F8,D1
	divu	D0,D1
	move.l	a0,-(sp)
	move.l	dt_DeliGlob(pc),a0
	move.w	d1,dtg_Timer(A0)
	move.l	dtg_SetTimer(a0),a0
	jsr	(a0)
	move.l	(sp)+,a0
	move.w	D1,mdb_CIAsave(A6)
lbC001924
	move.w	#$1C,D1
	lea	NullPattern(PC),A4
lbC00192C
	move.l	A4,pdb_PAddr(A5,D1.W)
	move.w	#$FF00,pdb_PNum(A5,D1.W)
	clr.l	pdb_PStep(A5,D1.W)
	subq.w	#4,D1
	bpl.s	lbC00192C
	move.w	D2,pdb_Prescale(A5)
	tst.b	mdb_SongNum(A6)
	bmi.s	lbC001950
	move.l	mdb_MdatBase(A6),A4
	bsr	trk_GetTrackStep
lbC001950
	clr.b	mdb_EndFlag(A6)
	clr.w	mdb_SpeedCnt(A6)
	st	mdb_TrackLoop(A6)
	move.b	mdb_SongNum(A6),mdb_CurrSong(A6)
	clr.b	mdb_SongCont(A6)
	lea	InfoDataBlock(PC),A4
	clr.w	idb_Fade(A4)
	clr.b	idb_NewTrack(A4)
	move.b	#1,mdb_PlayerEnable(A6)
	rts

tfmx_INITDATA
	movem.l	A2-A6,-(SP)
	lea	MasterDataBlock(PC),A6
	move.l	#$40400000,mdb_MasterVol(A6)
	clr.b	mdb_FadeSlope(A6)
	move.l	D0,mdb_MdatBase(A6)
	move.l	D1,mdb_SmplBase(A6)
	move.l	D1,A4
	clr.l	(A4)
	move.l	D1,mdb_WorkBase(A6)
	move.l	D0,A4
	tst.l	$1D0(A4)
	beq.s	lbC0019E4
	move.l	$1D0(A4),D1
	add.l	D0,D1
	move.l	D1,mdb_TrackBase(A6)
	move.l	$1D4(A4),D1
	add.l	D0,D1
	move.l	D1,mdb_PattBase(A6)
	move.l	$1D8(A4),D1
	add.l	D0,D1
	move.l	D1,mdb_MacroBase(A6)
	add.l	#$200,D0
	move.l	D0,mdb_SfxBase(A6)
	bra.s	lbC001A08
lbC0019E4
	move.l	#$800,D1
	add.l	D0,D1
	move.l	D1,mdb_TrackBase(A6)
	move.l	#$400,D1
	add.l	D0,D1
	move.l	D1,mdb_PattBase(A6)
	move.l	#$600,D1
	add.l	D0,D1
	move.l	D1,mdb_MacroBase(A6)
	add.l	$5FC(a4),d0
	move.l	d0,mdb_SfxBase(a6)
lbC001A08
	lea	PatternDataBlock(PC),A5
	move.w	#5,pdb_Prescale(A5)
	lea	SongHoldStats(PC),A6
	move.w	#$1F,D0
lbC001A1E
	move.w	#5,$40(A6)
	clr.w	$80(A6)
	clr.w	(A6)+
	dbra	D0,lbC001A1E
	lea	InfoDataBlock(PC),A4
	clr.w	idb_Fade(A4)
	clr.b	idb_NewTrack(A4)
	lea	MasterDataBlock(PC),A6
	movem.l	(SP)+,A2-A6
	rts

tfmx_SETWORKBUF
	move.l	A6,-(SP)
	lea	MasterDataBlock(PC),A6
	subq.l	#4,A0
	move.l	A0,mdb_WorkBase(A6)
	move.l	(SP)+,A6
	rts

tfmx_PALNTSCINIT
	movem.l	D0-D1/A5-A6,-(SP)
	lea	MasterDataBlock(PC),A6
;	clr.w	mdb_CIAsave(A6)
	move.l	4.w,A5
	move.l	ex_EClockFrequency(A5),d0
	moveq	#50/2,d1
	add.l	d1,d0
	divu	#50,d0
	move.l	dt_DeliGlob(pc),A5
	move.w	d0,dtg_Timer(A5)
	move.l	dtg_SetTimer(A5),A5
	jsr	(A5)
	move.l	mdb_MdatBase(A6),A5
;	btst	#1,$B(A5)
;	beq.s	lbC001ACE
	move.w	d0,mdb_CIAsave(A6)
lbC001ACE
	movem.l	(SP)+,D0-D1/A5-A6
	rts

tfmx_VBIIN
	bsr	tfmx_IRQIN
	rts

tfmx_VBION
	rts

tfmx_VBIOFF
	bsr	tfmx_ALLOFF
	rts

VoiceUseTable
	dc.l	NoteRec0,NoteRec1,NoteRec2,NoteRec3
	dc.l	NoteRec0,NoteRec1,NoteRec2,NoteRec3
	dc.l	NoteRec0,NoteRec1,NoteRec2,NoteRec3
	dc.l	NoteRec0,NoteRec1,NoteRec2,NoteRec3
NoteRec0
	dcb.w	$0A,0
	dc.w	$0001
	dcb.w	$1B,0
	dc.l	cdb_SIZEOF
	dc.l	NC0
	dc.l	$00000004
	dcb.w	$1C,0
NoteRec1
	dcb.w	$0A,0
	dc.w	$0002
	dcb.w	$1B,0
	dc.l	cdb_SIZEOF
	dc.l	NC1
	dc.l	$00000104
	dcb.w	$1C,0
NoteRec2
	dcb.w	$0A,0
	dc.w	$0004
	dcb.w	$1B,0
	dc.l	cdb_SIZEOF
	dc.l	NC2
	dc.l	$00000204
	dcb.w	$1C,0
NoteRec3
	dcb.w	$0A,0
	dc.w	$0008
	dcb.w	$1B,0
	dc.l	-3*cdb_SIZEOF
	dc.l	NC3
	dc.l	$00000304
	dcb.w	$1C,0
NoteRec4
	dcb.w	$0A,0
	dc.w	$0010
	dcb.w	$1B,0
	dc.l	cdb_SIZEOF
	dc.l	NC4
	dc.l	$00000004
	dcb.w	$1C,0
NoteRec5
	dcb.w	$0A,0
	dc.w	$0020
	dcb.w	$1B,0
	dc.l	cdb_SIZEOF
	dc.l	NC5
	dc.l	$00000104
	dcb.w	$1C,0
NoteRec6
	dcb.w	$0A,0
	dc.w	$0040
	dcb.w	$1B,0
	dc.l	cdb_SIZEOF
	dc.l	NC6
	dc.l	$00000204
	dcb.w	$1C,0
NoteRec7
	dcb.w	$0A,0
	dc.w	$0080
	dcb.w	$1B,0
	dc.l	-7*cdb_SIZEOF
	dc.l	NC7
	dc.l	$00000304
	dcb.w	$1C,0
MasterDataBlock
	dcb.b	mdb_SIZEOF,0
PatternDataBlock
	dcb.b	pdb_SIZEOF,0
InfoDataBlock
	dcb.b	idb_SIZEOF,0
SongHoldStats
	dcb.l	$30,0
NullPattern
	dc.l	$F4000000
	dc.l	$F0000000
PeriodTable
	dc.w					    $06AE,$064E,$05F4,$059E,$054D,$0501
	dc.w	$04B9,$0475,$0435,$03F9,$03C0,$038C,$0358,$032A,$02FC,$02D0,$02A8,$0282
	dc.w	$025E,$023B,$021B,$01FD,$01E0,$01C6,$01AC,$0194,$017D,$0168,$0154,$0140
	dc.w	$012F,$011E,$010E,$00FE,$00F0,$00E3,$00D6,$00CA,$00BF,$00B4,$00AA,$00A0
	dc.w	$0097,$008F,$0087,$007F,$0078,$0071,$00D6,$00CA,$00BF,$00B4,$00AA,$00A0
	dc.w	$0097,$008F,$0087,$007F,$0078,$0071,$00D6,$00CA,$00BF,$00B4

