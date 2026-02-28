
	incdir	"Includes:"
	include "misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Music-Assembler player module V1.1 (12 Sep 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,1
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
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

PName	dc.b 'Music-Assembler',0
CName	dc.b 'Oscar Giesen and Marco Swagerman,',10
	dc.b 'adapted by Delirium',0
	even
ma_data		dc.l 0

*-----------------------------------------------------------------------*
;
;Interrupt für Replay

Int
	movem.l	d0-d7/a0-a6,-(sp)
	move.l	ma_data(pc),a0			; Base
	jsr	$c(a0)				; DudelDiDum
	movem.l	(sp)+,d0-d7/a0-a6
	rts

*-----------------------------------------------------------------------*
;
; Testet, ob es sich um ein Music-Assembler-Modul handelt

Chk
	move.l	dtg_ChkData(a5),a0

	moveq	#-1,d0				; Modul nicht erkannt (default)

	cmpi.w	#$6000,$0(a0)			; bra - Instruction
	bne.s	ChkEnd
	cmpi.w	#$6000,$4(a0)			; bra - Instruction
	bne.s	ChkEnd
	cmpi.w	#$6000,$8(a0)			; bra - Instruction
	bne.s	ChkEnd
	cmpi.w	#$48e7,$c(a0)			; movem - Instruction
	bne.s	ChkEnd

	moveq	#0,d0				; Modul erkannt
ChkEnd
	rts

*-----------------------------------------------------------------------*
;
; Set min. & max. subsong number

SubSong
	moveq	#0,d0				; min.
	moveq	#9,d1				; max.
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,ma_data

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
	move.w	dtg_SndNum(a5),d0
	move.l	ma_data(pc),a0
	jsr	(a0)				; Init Sound

	bsr	Volume				; set Volume
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	lea	$dff000,a0
	moveq	#0,d0
	move.w	d0,$a8(a0)
	move.w	d0,$b8(a0)
	move.w	d0,$c8(a0)
	move.w	d0,$d8(a0)
	move.w	#$000F,$96(a0)			; End Sound
	rts

*-----------------------------------------------------------------------*
;
; Previous SubSong

PrevSub
	tst.w	dtg_SndNum(a5)			; min Subsong ?
	beq.s	PrevSubEnd

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	bsr	RemSnd
	subq.w	#1,dtg_SndNum(a5)		; Vorheriger Sound
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)
PrevSubEnd
	rts

*-----------------------------------------------------------------------*
;
; Next SubSong

NextSub
	cmpi.w	#9,dtg_SndNum(a5)		; max Subsong ?
	beq.s	PrevSubEnd

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	bsr	RemSnd
	addq.w	#1,dtg_SndNum(a5)		; Nächster Sound
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)
NextSubEnd
	rts

*-----------------------------------------------------------------------*
;
; Change Volume

Volume
	move.w	dtg_SndVol(a5),d0
	moveq	#15,d1
	move.l	ma_data(pc),a0
	jsr	$8(a0)				; New Volume
	rts

*-----------------------------------------------------------------------*

