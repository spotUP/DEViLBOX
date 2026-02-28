
	incdir	"Includes:"
	include	"misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Activision player module V0.3 (22 Sep 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,0
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_Interrupt,Int
;	dc.l	DTP_SubSongRange,SubSong
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

PName	dc.b 'Activision',0
CName	dc.b '???,',10
	dc.b 'Testversion by Delirium',0
	even

module		dc.l 0

InitMod		dc.l 0
InitMod2	dc.l 0
EndMod		dc.l 0
EndMod2		dc.l 0
IRQMod		dc.l 0
IRQMod2		dc.l 0

MaxSong		dc.w 0

*-----------------------------------------------------------------------*
;
;Interrupt für Replay

Int
	movem.l	d0-d7/a0-a6,-(sp)
	move.l	IRQMod(pc),a0
	jsr	(a0)				; DudelDiDum
	movem.l	(sp)+,d0-d7/a0-a6
	rts

*-----------------------------------------------------------------------*
;
; Testet auf Activision-Modul

Chk
	moveq	#-1,d0				; Modul nicht erkannt (default)

	move.l	dtg_ChkSize(a5),d1
	cmpi.l	#2*1024,d1
	ble.s	ChkEnd

	move.l	dtg_ChkData(a5),a1
	move.l	#2*1024,d1
ChkFormat1
	cmpi.w	#$2f08,(a1)
	bne.s	Check1
	cmpi.w	#$41fa,2(a1)
	bne.s	Check1
	cmpi.w	#$217c,6(a1)
	beq.s	CheckOk1
Check1	addq.l	#2,a1
	subq.l	#2,d1
	bpl.s	ChkFormat1
	bra.s	ChkEnd
CheckOk1
	move.l	a1,EndMod2

ChkFormat2
	cmpi.w	#$48e7,(a1)
	bne.s	Check2
	cmpi.w	#$e941,4(a1)
	bne.s	Check2
	cmpi.w	#$7000,6(a1)
	beq.s	CheckOk2
Check2	addq.l	#2,a1
	subq.l	#2,d1
	bpl.s	ChkFormat2
	bra.s	ChkEnd
CheckOk2
	move.l	a1,InitMod2

ChkFormat3
	cmpi.w	#$48e7,(a1)
	bne.s	Check3
	cmpi.w	#$41fa,4(a1)
	bne.s	Check3
	cmpi.w	#$43fa,8(a1)
	beq.s	CheckOk3
Check3	addq.l	#2,a1
	subq.l	#2,d1
	bpl.s	ChkFormat3
	bra.s	ChkEnd
CheckOk3
	move.l	a1,IRQMod2

	moveq	#0,d0				; Modul erkannt !
ChkEnd
	rts

*-----------------------------------------------------------------------*
;
; Set min. & max. subsong number

SubSong
	moveq	#0,d0				; min.
	move.w	MaxSong(pc),d1			; max.
	rts

*-----------------------------------------------------------------------*

; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,module

	move.l	InitMod2(pc),InitMod		; copy buffer
	move.l	EndMod2(pc),EndMod
	move.l	IRQMod2(pc),IRQMod

	clr.w	dtg_SndNum(a5)			; first Subsong

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

; Init Sound

InitSnd
	moveq	#$00,d1
	move.w	dtg_SndNum(a5),d1
	move.l	InitMod(pc),a0
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	move.l	EndMod(pc),a0
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Previous SubSong

PrevSub
	tst.w	dtg_SndNum(a5)			; min. subsongnumber reached ?
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
	move.w	dtg_SndNum(a5),d0
	cmp.w	MaxSong(pc),d0			; max. subsongnumber reached ?
;	beq.s	NextSubEnd

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


