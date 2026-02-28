
	incdir	"Includes:"
	include	"misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Mark II player module V1.1 (27 Oct 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,1
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_Interrupt,Int
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,RemSnd
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'Mark_II',0
CName	dc.b 'Cachet Software,',10
	dc.b 'adapted by Delirium',0
	even
M_data		dc.l 0

*-----------------------------------------------------------------------*
;
;Interrupt für Replay

Int
	movem.l	d0-d7/a0-a6,-(sp)
	move.l	M_data(pc),a0
	moveq	#0,d0
	moveq	#1,d1
	jsr	(a0)				; DudelDiDum
	movem.l	(sp)+,d0-d7/a0-a6
	rts

*-----------------------------------------------------------------------*
;
; Testet, ob es sich um ein Mark-II-Modul handelt

Chk
	move.l	dtg_ChkData(a5),a0

	moveq	#1,d0				; Modul nicht erkannt (default)
Chk1
	cmpi.l  #".ZAD",$33C(a0)
	bne.s	Chk2
	cmpi.l  #"S89.",$340(a0)
	beq.s	ChkOk
Chk2
	cmpi.l  #".ZAD",$348(a0)
	bne.s	ChkEnd
	cmpi.l  #"S89.",$34C(a0)
	bne.s	ChkEnd
ChkOk
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
	move.l	a0,M_data

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
	move.l	M_data(pc),a0

	moveq	#-1,d0
	jsr	(a0)				; Init Sound

	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	move.l	M_data(pc),a0

	moveq	#1,d0
	moveq	#1,d1
	jsr	(a0)				; Rem Sound

	lea	$dff000,a0
	moveq	#0,d0
	move.w	d0,$a8(a0)
	move.w	d0,$b8(a0)
	move.w	d0,$c8(a0)
	move.w	d0,$d8(a0)
	move.w	#$000F,$96(a0)			; End Sound

	rts

*-----------------------------------------------------------------------*

