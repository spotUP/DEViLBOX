
	incdir	"Includes:"
	include	"misc/DeliPlayer6.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: ActivisionPro player module V0.8 (26 Sep 96)',0
	even

PlayerTagArray
	dc.l	DTP_RequestDTVersion,17
	dc.l	DTP_PlayerVersion,0<<16+80
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_DeliBase,delibase
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_CheckLen,ChkLen
	dc.l	DTP_Interrupt,Int
	dc.l	DTP_SubSongRange,SubSong
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,RemSnd
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'ActivisionPro',0
CName	dc.b 'Martin Walker,',10
	dc.b 'adapted by Delirium',0
	even

delibase	dc.l 0
module		dc.l 0
length		dc.l 0
SetMod		dc.l 0
InitMod		dc.l 0
EndMod		dc.l 0
IRQMod		dc.l 0
MaxSong		dc.w 128

*-----------------------------------------------------------------------*
;
; Interrupt für Replay

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
	move.l	dtg_ChkData(a5),a1
	move.l	dtg_ChkSize(a5),d1

	move.w	#128-1,d0
ChkLoopA
	cmpi.w	#$2F08,(a1)
	bne.s	CheckA
	cmpi.w	#$41FA,2(a1)
	bne.s	CheckA
	cmpi.w	#$1140,6(a1)
	bne.s	CheckA
	cmpi.w	#$7000,10(a1)
	beq.s	ChkLoopB
CheckA	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,ChkLoopA
	bra.s	ChkOld
ChkLoopB
	cmpi.w	#$48E7,(a1)
	bne.s	CheckB
	cmpi.w	#$43FA,4(a1)
	bne.s	CheckB
	cmpi.w	#$7200,8(a1)
	bne.s	CheckB
	cmpi.w	#$1229,10(a1)
	beq.s	ChkNew
CheckB	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,ChkLoopB
	bra.s	ChkOld
ChkNew
	bra	ChkOkay
ChkOld
	move.l	dtg_ChkData(a5),a1
	move.l	dtg_ChkSize(a5),d1

	move.w	#2048-1,d0
ChkLoop2
	cmpi.w	#$48E7,(a1)			; InitSnd
	bne.s	Check2
	cmpi.w	#$E941,4(a1)
	bne.s	Check2
	cmpi.w	#$7000,6(a1)
	bne.s	Check2
	cmpi.w	#$41FA,8(a1)
	beq.s	ChkLoop3
Check2	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,ChkLoop2
	bra.s	ChkFail
ChkLoop3
	cmpi.w	#$48E7,(a1)			; Interrupt
	bne.s	Check3
	cmpi.w	#$41FA,4(a1)
	bne.s	Check3
	cmpi.w	#$43FA,8(a1)
	bne.s	Check3
	cmpi.w	#$47FA,12(a1)
	beq.s	ChkOkay
Check3	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,ChkLoop3
ChkFail
	moveq	#-1,d0
	bra.s	ChkFail
ChkOkay
	moveq	#0,d0				; Modul erkannt !
ChkEnd
	rts

ChkLen = *-Chk

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
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,module
	move.l	d0,length

.NewReplay
	move.l	module(pc),a1			; Set Subsong
	move.l	length(pc),d1
	move.w	#128-1,d0
.LoopA	cmpi.w	#$2F08,(a1)
	bne.s	.NextA
	cmpi.w	#$41FA,2(a1)
	bne.s	.NextA
	cmpi.w	#$1140,6(a1)
	bne.s	.NextA
	cmpi.w	#$7000,10(a1)
	beq.s	.FoundA
.NextA	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,.LoopA
	bra.s	.OldReplay
.FoundA	move.l	a1,SetMod

	move.l	module(pc),a1			; EndSound/Interrupt
	move.l	length(pc),d1
	move.w	#128-1,d0
.LoopB	cmpi.w	#$48E7,(a1)
	bne.s	.NextB
	cmpi.w	#$43FA,4(a1)
	bne.s	.NextB
	cmpi.w	#$7200,8(a1)
	bne.s	.NextB
	cmpi.w	#$1229,10(a1)
	beq.s	.FoundB
.NextB	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,.LoopB
	bra.s	.OldReplay
.FoundB	move.l	a1,EndMod
	move.l	a1,IRQMod
	lea	DummyFunc(pc),a1		; InitSnd not available
	move.l	a1,InitMod
	bra	.Done

.OldReplay
	move.l	module(pc),a1			; EndSound
	move.l	length(pc),d1
	move.w	#2048-1,d0
.Loop1	cmpi.w	#$2F08,(a1)
	bne.s	.Next1
	cmpi.w	#$41FA,2(a1)
	bne.s	.Next1
	cmpi.w	#$4228,6(a1)
	beq.s	.Found1
.Next1	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,.Loop1
	lea	RemSndDef(pc),a1		; use default routine if none was found
.Found1	move.l	a1,EndMod

	move.l	module(pc),a1			; InitSnd
	move.l	length(pc),d1
	move.w	#2048-1,d0
.Loop2	cmpi.w	#$48E7,(a1)
	bne.s	.Next2
	cmpi.w	#$E941,4(a1)
	bne.s	.Next2
	cmpi.w	#$7000,6(a1)
	bne.s	.Next2
	cmpi.w	#$41FA,8(a1)
	beq.s	.Found2
.Next2	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,.Loop2
	bra.s	EndPlay2
.Found2	move.l	a1,InitMod

	move.l	module(pc),a1			; Interrupt
	move.l	length(pc),d1
	move.w	#2048-1,d0
.Loop3	cmpi.w	#$48E7,(a1)
	bne.s	.Next3
	cmpi.w	#$41FA,4(a1)
	bne.s	.Next3
	cmpi.w	#$43FA,8(a1)
	bne.s	.Next3
	cmpi.w	#$47FA,12(a1)
	beq.s	.Found3
.Next3	addq.l	#2,a1
	subq.l	#2,d1
	dbcs	d0,.Loop3
	bra.s	EndPlay2
.Found3	move.l	a1,IRQMod
	lea	DummyFunc(pc),a1		; Set Subsong not available
	move.l	a1,SetMod
.Done
	move.l	dtg_AudioAlloc(a5),a0		; Function
	jsr	(a0)				; returncode is already set !
	rts

*-----------------------------------------------------------------------*
;
; End Player

EndPlay
	move.l	dtg_AudioFree(a5),a0		; Function
	jsr	(a0)
EndPlay2
	rts

*-----------------------------------------------------------------------*

; Init Sound

InitSnd
	moveq	#0,d1
	move.w	dtg_SndNum(a5),d1
	move.l	SetMod(pc),a0
	jsr	(a0)

	moveq	#0,d1
	move.w	dtg_SndNum(a5),d1
	move.l	InitMod(pc),a0
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	moveq	#0,d1
	move.w	#$0080,d1
	move.l	SetMod(pc),a0
	jsr	(a0)

	move.l	EndMod(pc),a0
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Dummy routine (does nothing)

DummyFunc
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound (default)

RemSndDef
	lea	$dff000,a0
	moveq	#0,d0
	move.w	d0,$a8(a0)
	move.w	d0,$b8(a0)
	move.w	d0,$c8(a0)
	move.w	d0,$d8(a0)
	move.w	#$000F,$96(a0)			; End Sound
	rts

*-----------------------------------------------------------------------*

