
	incdir	"Includes:"
	include	"exec/execbase.i"
	include	"misc/DeliPlayer6.i"
	include	"misc/DevpacMacros.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Tiny Williams 1989 player module V1.5 (10 Jul 95)',0
	even

PlayerTagArray
	dc.l	DTP_RequestDTVersion,16
	dc.l	DTP_PlayerVersion,01<<16+50
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
;	dc.l	DTP_CheckLen,ChkLen
	dc.l	DTP_Interrupt,Int
	dc.l	DTP_Config,Config
	dc.l	DTP_SubSongRange,SubSong
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,RemSnd
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'TinyWilliams_89',0
CName	dc.b 'adapted by Andy Silva',0
	even
module		dc.l 0
VBRPointer	dc.l 0
AudioInt	dc.l 0
ModOffst	dc.l 0
MaxSong		dc.w 0

*-----------------------------------------------------------------------*
;
; Player Initialisation

Config
	move.l	$04.w,a6
	move.w	AttnFlags(a6),d0
	suba.l	a0,a0
	btst.l	#AFB_68010,d0
	beq.s	NoVBR
	lea	SuperFunc(pc),a5
	CALLEXEC Supervisor
NoVBR
	move.l	a0,VBRPointer

	moveq	#0,d0				; no error
	rts

SuperFunc
	dc.l	$4E7A8801
	rte

*-----------------------------------------------------------------------*
;
; Interrupt für Replay

Int
	movem.l	d2-d7/a2-a6,-(sp)
	move.l	ModOffst(pc),a0
	jsr	(a0)				; DudelDiDum
	movem.l	(sp)+,d2-d7/a2-a6
	rts

*-----------------------------------------------------------------------*
;
; Testet auf Tiny Williams 1989 Modul

Chk
	move.l	dtg_ChkData(a5),a0
	moveq	#0,d0
	moveq	#$64,d7
ChkLoop
	cmp.w	#$6000,(a0)+
	bne.s	ChkNext
	cmp.w	#$0086,$0002-2(a0)
	beq.s	ChkCont
	cmp.w	#$0076,$0002-2(a0)
	beq.s	ChkCont
	cmp.w	#$009A,$0002-2(a0)
	bne.s	ChkNext
ChkCont
	cmp.l	#$48E7C086,$001C-2(a0)
	beq.s	ChkEnd
	cmp.l	#$48E78086,$001A-2(a0)
	beq.s	ChkEnd
ChkNext
	dbra	d7,ChkLoop
	moveq	#-1,d0
ChkEnd
	rts

ChkLen = *-Chk

*-----------------------------------------------------------------------*
;
; Set min. & max. subsong number

SubSong
	moveq	#1,d0				; min.
	move.w	MaxSong(pc),d1			; max.
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,module

	moveq	#$64,d7
.Loop	cmp.w	#$6000,(a0)+
	bne.s	.Next
	cmp.w	#$0086,$0002-2(a0)
	beq.s	.Cont
	cmp.w	#$0076,$0002-2(a0)
	beq.s	.Cont
	cmp.w	#$009A,$0002-2(a0)
	bne.s	.Next
.Cont	cmp.l	#$48E7C086,$001C-2(a0)
	beq.s	.Okay
	cmp.l	#$48E78086,$001A-2(a0)
	beq.s	.Okay
.Next	dbra	d7,.Loop
.Okay	move.l	a0,ModOffst

	move.w	#$0500,d1
.Find	cmp.l	#$4E75B03C,(a0)
	beq.s	.Songs
	cmp.l	#$6766B03C,(a0)
	beq.s	.Songs
	lea	$0002(a0),a0
	dbra	d1,.Find
	move.w	#$0001,MaxSong
	bra.s	.Skip
.Songs
	move.w	$0004(a0),MaxSong
.Skip
	move.l	ModOffst(pc),a1
	lea	$001A(a1),a1
	move.l	VBRPointer(pc),a0
	move.l	$0070(a0),AudioInt
	move.l	a1,$0070(a0)

	move.l	dtg_AudioAlloc(a5),a0		; Function
	jsr	(a0)				; returncode is already set !
	rts

*-----------------------------------------------------------------------*
;
; End Player

EndPlay
	move.l	VBRPointer(pc),a0
	move.l	AudioInt(pc),$0070(a0)

	move.l	dtg_AudioFree(a5),a0		; Function
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Init Sound

InitSnd
	move.l	ModOffst(pc),a0
	move.w	dtg_SndNum(a5),d0
	lsl.w	#$08,d0
	move.w	d0,$0004(a0)
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	moveq	#0,d0
	lea	$dff000,a0
	move.w	d0,$a8(a0)
	move.w	d0,$b8(a0)
	move.w	d0,$c8(a0)
	move.w	d0,$d8(a0)
	move.w	#$f,$96(a0)
	rts

*-----------------------------------------------------------------------*

