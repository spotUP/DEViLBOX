	opt l+,o-,d-

	incdir	"Includes:"
	include	"misc/DeliPlayer.i"
	include "exec/nodes.i"
	include "hardware/intbits.i"
	include "graphics/gfxbase.i"


_LVORemIntServer	EQU -$000000AE
_LVOAddIntServer	EQU -$000000A8


;
;
	SECTION Player,Code
;
;

	xref	OK_Init
	xref	OK_Play
	xref	OK_Stop
	xref	OK_SetBalance

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Oktalyzer 1.56 player module V1.0 (01 Sep 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,0
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,EndSnd
	dc.l	DTP_StartInt,StartSnd
	dc.l	DTP_StopInt,StopSnd
	dc.l	DTP_Volume,VolBal
	dc.l	DTP_Balance,VolBal
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'Oktalyzer',0
CName	dc.b 'OKPlay2 by Armin Sander, © MEDIA GmbH',0
	even

ok_data	dc.l 0

IntStruct
	dc.l 0					; Succ
	dc.l 0					; Pred
	dc.b NT_INTERRUPT			; Type
	dc.b $7F				; Pri
	dc.l IntName				; Name
	dc.l 0					; Data
	dc.l Int				; Code

IntName
	dc.b 'OK-Interrupt',0
	even

*-----------------------------------------------------------------------*
;
; Testet auf OK-Modul

Chk
	move.l	dtg_ChkData(a5),a0
	moveq	#-1,d0				; Modul nicht erkannt (default)
	cmpi.l	#'OKTA',(a0)+
	bne.s	ChkEnd
	cmpi.l	#'SONG',(a0)+
	bne.s	ChkEnd
	moveq	#0,d0				; Modul erkannt
ChkEnd
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,ok_data

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
; Init Sound

InitSnd
	moveq	#0,d0
	move.l	dtg_GfxBase(a5),a1		; GraphicsBase
	btst	#PALn,gb_DisplayFlags+1(a1)	; Pal/NTSC ?
	seq	d0				; 0 = pal 0!=ntsc
	move.l	ok_data(pc),a0
	jsr	OK_Init				; Init Sound
	rts

*-----------------------------------------------------------------------*
;
; End Sound

EndSnd
	jsr	OK_Stop				; End Sound
	rts

*-----------------------------------------------------------------------*
;
; Start IRQ

StartSnd
	lea	IntStruct(pc),a1		; Add a vertical blank int
	moveq	#INTB_VERTB,d0
	move.l	4.w,a6
	jsr	_LVOAddIntServer(a6)
	rts

*-----------------------------------------------------------------------*
;
; Stop IRQ

StopSnd
	lea	IntStruct(pc),a1
	moveq	#INTB_VERTB,d0
	move.l	4.w,a6
	jsr	_LVORemIntServer(a6)
	rts

*-----------------------------------------------------------------------*
;
; IRQ

Int
	movem.l	d1-d7/a1-a6,-(sp)		; Save All
	jsr	OK_Play
	movem.l	(sp)+,d1-d7/a1-a6		; Restore All
	lea	$dff000,a0			; for compatibility
	moveq	#0,d0				; read exec.doc/AddIntserver
	rts

*-----------------------------------------------------------------------*
;	We use the SetBalance Routine from OKPlay2 
;	Note:	Do not use OK_SetVol, cause this function sets
;		the Mastervolume of the left AND the right channels

VolBal	move.w	dtg_SndVol(a5),d0		; Max Vol
	move.w	dtg_SndLBal(a5),d1		; Balance
	mulu.w	d0,d1
	lsr.w	#6,d1
	mulu	dtg_SndRBal(a5),d0		; Balance
	lsr.w	#6,d0
	jsr	OK_SetBalance			; d0.w:	RightVol / d1.w: LeftVol
	rts

