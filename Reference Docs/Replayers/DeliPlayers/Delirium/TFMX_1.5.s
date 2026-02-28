
	incdir	"Includes:"
	include	"misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: TFMX 1.5 player module V1.6 (12 Sep 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,3
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_ExtLoad,Load
	dc.l	DTP_Interrupt,Int
	dc.l	DTP_SubSongRange,SubSong
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,RemSnd
	dc.l	DTP_Volume,Volume
	dc.l	DTP_PrevSong,PrevSub
	dc.l	DTP_NextSong,NextSub
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'TFMX_1.5',0
CName	dc.b 'Chris Hülsbeck,',10
	dc.b 'adapted by Delirium',0
	even

MaxSong		dc.w 0

*-----------------------------------------------------------------------*
;
; Testet, ob es sich um ein TFMX-Modul handelt

Chk
	moveq	#-1,d0				; Modul nicht erkannt (default)
	move.l	dtg_ChkData(a5),a0
	cmpi.l	#"TFMX",(a0)
	bne.s	ChkEnd
	move.l	6(a0),d0
	move.b	5(a0),d0
	ror.l	#8,d0
	cmpi.l	#"SONG",d0
	beq.s	ChkEnd
	moveq	#0,d0				; Modul erkannt
ChkEnd	rts

*-----------------------------------------------------------------------*
;
; TFMX laden

Load
	move.l	dtg_PathArrayPtr(a5),a0
	clr.b	(a0)				; Path löschen
	move.l	dtg_CopyDir(a5),a0
	jsr	(a0)
	bsr.s	CopyTFMX
	move.l	dtg_LoadFile(a5),a0
	jsr	(a0)				; returncode is already set !
	rts

*-----------------------------------------------------------------------*
;
; Kopiert den Filenamen und fügt davor 'smpl.' ein

CopyTFMX
	move.l	dtg_PathArrayPtr(a5),a0
CopyTFMXloop
	tst.b	(a0)+
	bne.s	CopyTFMXloop
	subq.l	#1,a0

	lea	TFMXsmpl(pc),a1
CopyTFMXsmpl
	move.b	(a1)+,(a0)+
	bne.s	CopyTFMXsmpl
	subq.l	#1,a0

	move.l	dtg_FileArrayPtr(a5),a1
	lea	TFMXmdat(pc),a2
CopyTFMXmdat
	move.b	(a2)+,d0
	beq.s	CopyTFMXok
	move.b	(a1)+,d1
	bset	#5,d1
	cmp.b	d0,d1
	beq.s	CopyTFMXmdat

	move.l	dtg_FileArrayPtr(a5),a1
CopyTFMXok
	move.b	(a1)+,(a0)+
	bne.s	CopyTFMXok
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

SubSong
	moveq	#0,d0				; min.
	move.w	MaxSong(pc),d1			; max.
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0
	jsr	(a0)
	lea	$100(a0),a0
	moveq	#-2,d0				; calc max. Subsong
	moveq	#2,d1
	moveq	#31-1,d2
InitPlayLoop
	addq.l	#1,d0
	tst.w	(a0)+
	bne.s	InitPlayNext
	subq.l	#1,d1
InitPlayNext
	dbeq	d2,InitPlayLoop

	move.w	d0,MaxSong			; store max. Subsong

	move.l	dtg_AudioAlloc(a5),a0		; Function
	jsr	(a0)				; returncode is already set !
	rts

*-----------------------------------------------------------------------*
;
; End Player

EndPlay
	move.l	dtg_AudioFree(a5),a0		; Function
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Init TFMX-Sound

InitSnd
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0
	jsr	(a0)
	move.l	a0,d3
	moveq	#1,d0
	move.l	dtg_GetListData(a5),a0
	jsr	(a0)
	move.l	a0,d1
	move.l	d3,d0
	lea	TFMXBase(pc),a0
	jsr	$34(a0)				; Init Sound

	move.w	dtg_SndNum(a5),d0
	lea	TFMXBase(pc),a0
	jsr	$2c(a0)				; Init Sound

	bsr	Volume
	rts

*-----------------------------------------------------------------------*
;
; Remove TFMX-Sound

RemSnd
	lea	TFMXBase(pc),a0
	jsr	$28(a0)				; End Sound

	moveq	#0,d0
	lea	TFMXBase(pc),a0
	jsr	$40(a0)				; End Sound
	moveq	#1,d0
	lea	TFMXBase(pc),a0
	jsr	$40(a0)				; End Sound
	moveq	#2,d0
	lea	TFMXBase(pc),a0
	jsr	$40(a0)				; End Sound
	moveq	#3,d0
	lea	TFMXBase(pc),a0
	jsr	$40(a0)				; End Sound

	rts

*-----------------------------------------------------------------------*
;
; Previous TFMX-SubSong

PrevSub
	tst.w	dtg_SndNum(a5)			; min. subsongnumber reached?
	beq.s	PrevSubEnd			; yes !

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	bsr	RemSnd
	subq.w	#1,dtg_SndNum(a5)
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)
PrevSubEnd
	rts

*-----------------------------------------------------------------------*
;
; Next TFMX-SubSong

NextSub
	move.w	dtg_SndNum(a5),d0		; get max. subsong
	cmp.w	MaxSong(pc),d0			; max. subsongnumber reached?
	beq.s	NextSubEnd			; yes !

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	bsr	RemSnd
	addq.w	#1,dtg_SndNum(a5)
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)
NextSubEnd
	rts

*-----------------------------------------------------------------------*
;
; Set Volume

Volume
	moveq	#1,d0				; set volume (almost) immediately
	swap.w	d0
	move.w	dtg_SndVol(a5),d0		; volume value
	lea	TFMXBase(pc),a0
	jsr	$48(a0)
	rts

*-----------------------------------------------------------------------*
;
;Interrupt für TFMX-Replay

Int
	movem.l	d0-d7/a0-a6,-(sp)
	lea	TFMXBase(pc),a0			; Base
	jsr	$24(a0)				; DudelDiDum
	movem.l	(sp)+,d0-d7/a0-a6
	rts

*-----------------------------------------------------------------------*
;
; TFMX-Replay (TFMX 1.5)

TFMXBase
	incbin	"ass:project/deliplayers/tfmx/tfmx(1.5).obj"


