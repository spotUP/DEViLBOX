
	incdir	"Includes:"
	include "misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Jochen Hippel player module V1.2 (06 Sep 92)',0
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
	dc.l	DTP_PrevSong,PrevSub
	dc.l	DTP_NextSong,NextSub
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'Hippel',0
CName	dc.b 'Jochen Hippel,',10
	dc.b 'adapted by Delirium',0
	even
H_data		dc.l 0
H_offset	dc.l 0
H_offset2	dc.l 0

*-----------------------------------------------------------------------*
;
;Interrupt für Replay

Int
	movem.l	d2-d7/a2-a6,-(sp)
	move.l	H_offset(pc),a0
	jsr	(a0)				; DudelDiDum
	movem.l	(sp)+,d2-d7/a2-a6
	rts

*-----------------------------------------------------------------------*
;
; Testet, ob es sich um ein Hippel-Modul handelt

Chk
	move.l	dtg_ChkData(a5),a0

	moveq	#-1,d0				; Modul nicht erkannt (default)

	cmpi.b	#$60,(a0)			; bra.s
	bne.s	Chk2
	cmpi.b	#$60,2(a0)			; bra.s
	bne.s	Chk2
	cmpi.w	#$48e7,4(a0)			; movem
	bne.s	Chk2
	addq.l	#2,a0				; short branch
	bra.s	ChkOk
Chk2
	cmpi.b	#$60,(a0)			; bra.s
	bne.s	Chk3
	cmpi.b	#$60,2(a0)			; bra.s
	bne.s	Chk3
	cmpi.w	#$41fa,4(a0)			; lea
	bne.s	Chk3
	addq.l	#2,a0				; short branch
	bra.s	ChkOk
Chk3
	cmpi.w	#$6000,(a0)			; bra
	bne.s	Chk4
	cmpi.w	#$6000,4(a0)			; bra
	bne.s	Chk4
	cmpi.w	#$48e7,8(a0)			; movem
	bne.s	Chk4
	addq.l	#4,a0				; long branch
	bra.s	ChkOk
Chk4
	cmpi.w	#$6000,(a0)			; bra
	bne.s	ChkEnd
	cmpi.w	#$6000,4(a0)			; bra
	bne.s	ChkEnd
	cmpi.w	#$6000,8(a0)			; bra
	bne.s	ChkEnd
	cmpi.w	#$6000,12(a0)			; bra
	bne.s	ChkEnd
	cmpi.w	#$48e7,16(a0)			; movem
	bne.s	ChkEnd
	addq.l	#4,a0				; long branch
ChkOk
	move.l	a0,H_offset2			; IRQ offset
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
	move.l	a0,H_data

	move.l	H_offset2(pc),H_offset		; Copy IRQ

	move.w	#1,dtg_SndNum(a5)		; First Subsong

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
	bsr	ClearAudio

	bsr	ClearRegs

	moveq	#0,d0
	move.w	dtg_SndNum(a5),d0
	move.l	H_data(pc),a0
	jsr	(a0)				; Init Sound
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	bsr	ClearRegs

	moveq	#0,d0
	move.l	H_data(pc),a0
	jsr	(a0)				; End Sound

	bsr	ClearAudio
	rts

*-----------------------------------------------------------------------*
;
; Play Next Pattern

NextSub
	move.l	dtg_StopInt(a5),a0
	jsr	(a0)				; Sound Aus
	bsr	RemSnd
	addq.w	#1,dtg_SndNum(a5)		; Nächster Sound
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)				; Sound An
NextSubEnd
	rts

*-----------------------------------------------------------------------*
;
; Play Previous Pattern

PrevSub
	cmpi.w	#1,dtg_SndNum(a5)
	beq.s	PrevSubEnd

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)				; Sound Aus
	bsr	RemSnd
	subq.w	#1,dtg_SndNum(a5)		; Vorheriger Sound
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)				; Sound An
PrevSubEnd
	rts

*-----------------------------------------------------------------------*
;
; Löscht einige Hardware-Register

ClearAudio
	moveq	#0,d0
	lea	$dff000,a0
	move.w	d0,$a8(a0)
	move.w	d0,$b8(a0)
	move.w	d0,$c8(a0)
	move.w	d0,$d8(a0)
	move.w	#$f,$96(a0)
	rts

*-----------------------------------------------------------------------*
;
; Löscht einige Register (wegen unzureichender Initialisierung in manchen Modulen)

ClearRegs
	moveq	#0,d0
	moveq	#0,d1
	moveq	#0,d2
	moveq	#0,d3
	moveq	#0,d4
	moveq	#0,d5
	moveq	#0,d6
	moveq	#0,d7

	suba.l	a0,a0
	suba.l	a1,a1
	suba.l	a2,a2
	suba.l	a3,a3
	suba.l	a4,a4
	rts

*-----------------------------------------------------------------------*

