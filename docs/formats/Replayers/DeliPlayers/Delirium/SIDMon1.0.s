
	incdir	"Includes:"
	include "misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: SIDMon 1.0 player module V1.2 (02 Aug 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,2
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

PName	dc.b 'SIDMon_1.0',0
CName	dc.b 'Reiner van Vliet,',10
	dc.b 'adapted by Delirium',0
	even

sm_offset1a	dc.l 0
sm_offset1b	dc.l 0
sm_offset2a	dc.l 0
sm_offset2b	dc.l 0

*-----------------------------------------------------------------------*
;
;Interrupt für Replay

Int
	movem.l	d0-d7/a0-a6,-(sp)
	move.l	sm_offset2a(pc),a0
	jsr	(a0) 				; DudelDiDum
	movem.l	(sp)+,d0-d7/a0-a6
	rts

*-----------------------------------------------------------------------*
;
; Testet, ob es sich um ein SIDMon1.0-Modul handelt

Chk
	move.l	dtg_ChkData(a5),a0

	moveq	#-1,d0				; Modul nicht erkannt (default)

	cmpi.l	#$08f90001,$0(a0)		; bset - Instruction
	bne.s	Chk2
	cmpi.l	#$00bfe001,$4(a0)
	bne.s	Chk2

	cmpi.w	#$4e75,$25c(a0)			; RTS ?
	beq.s	ChkOk1
	cmpi.w	#$4ef9,$25c(a0)			; JMP ?
	bne.s	Chk2
	move.w	#$4e75,$25c(a0)			; RTS -> JMP
ChkOk1
	moveq	#$2c,d1
	move.l	#$16a,d2
	bra.s	ChkOk
Chk2
	cmpi.w	#$41fa,$0(a0)			; lea - Instruction
	bne.s	ChkEnd
	cmpi.w	#$d1e8,$4(a0)			; add - Instruction
	bne.s	ChkEnd

	cmpi.w	#$4e75,$230(a0)			; RTS ?
	beq.s	ChkOk2
	cmpi.w	#$4ef9,$230(a0)			; JMP ?
	bne.s	Chk3
	move.w	#$4e75,$230(a0)			; RTS -> JMP
ChkOk2
	moveq	#0,d1
	move.l	#$13e,d2
	bra.s	ChkOk
Chk3
	cmpi.w	#$4e75,$29c(a0)			; RTS ?
	beq.s	ChkOk3
	cmpi.w	#$4ef9,$29c(a0)			; JMP ?
	bne.s	ChkEnd
	move.w	#$4e75,$29c(a0)			; RTS -> JMP
ChkOk3
	moveq	#0,d1
	move.l	#$16a,d2
ChkOk
	moveq	#0,d0				; Modul erkannt
	add.l	a0,d1
	move.l	d1,sm_offset1b			; Offset 1
	add.l	a0,d2
	move.l	d2,sm_offset2b			; Offset 2
ChkEnd
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	move.l	sm_offset1b(pc),sm_offset1a	; copy buffer
	move.l	sm_offset2b(pc),sm_offset2a	; copy buffer

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
	move.l	sm_offset1a(pc),a0
	jsr	(a0)				; Init Sound
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


