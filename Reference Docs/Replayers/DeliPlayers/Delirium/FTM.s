	opt l+,o-,d-

	incdir	"Includes:"
	include	"misc/DeliPlayer.i"


* Die PlayFTM-Routinen:
* Sie werden über eine Sprungtabelle am Anfang von PlayFTM aufgerufen
* (siehe Handbuch). Keine Routine verändert die Register D2-D7 und A2-A6.
* Eingabeparameter werden je nachdem in den Registern D0...D7 übergeben.
* Rückgabewerte erscheinen in D0.

* Hier die Offset-Tabelle für Assembler:

StartUp		equ	0	;Diese Routine ist für uns tabu!

InitSound	equ	4
RestoreSound	equ	8
LoadModule	equ	12
FreeModule	equ	16
StartPlay	equ	20
StopPlay	equ	24
SetSpeed	equ	28
SetVolume	equ	32
GetPitch	equ	36
GetAmplitude	equ	40
WaitSongOver	equ	44	;Im Handbuch nicht beschrieben, siehe unten!
AskSongOver	equ	48	;Im Handbuch nicht beschrieben, siehe unten!

CallStack	equ	52	;Diese Routine braucht man nur bei BASIC/C


;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Face The Music player module V1.0 (30 Mar 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,0
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check1,Chk
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_StartInt,StartSnd
	dc.l	DTP_StopInt,StopSnd
	dc.l	DTP_Volume,SetVol
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'FaceTheMusic',0
CName	dc.b 'J. Schmidt, © 1991 MAXON,',10
	dc.b 'adapted by Delirium',0
	even

_PlayFTM	dc.l PlayFTM			; Pointer auf FTM-Replay

*-----------------------------------------------------------------------*
;
; Testet auf Modul

Chk						; FaceTheMusic ?
	move.l	dtg_ChkData(a5),a0
	moveq	#0,d0
	move.l	(a0),d1
	lsr.l	#8,d1
	cmpi.l	#"FTM",d1
	sne	d0
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	move.l	a5,-(sp)
	move.l	_PlayFTM(pc),a5			; PlayerBase
	jsr	InitSound(a5)
	move.l	(sp)+,a5
	tst.l	d0				; SignalBit-Nummer testen
	bmi.s	InitPlayEnd			; InitSound scheiterte

	move.l	dtg_PathArrayPtr(a5),d0		; ^Filename (already set by DeliTracker)
	move.l	a5,-(sp)
	move.l	_PlayFTM(pc),a5			; PlayerBase
	jsr	LoadModule(a5)
	move.l	(sp)+,a5
	tst.l	d0				; Erfolgreich geladen?
	beq.s	InitPlayErr			; Nein
	moveq	#0,d0				; no Error
	rts

InitPlayErr
	move.l	_PlayFTM(pc),a5			; PlayerBase
	jsr	RestoreSound(a5)
InitPlayEnd
	moveq	#-1,d0				; Error
	rts

*-----------------------------------------------------------------------*
;
; End Player

EndPlay
	move.l	_PlayFTM(pc),a5			; PlayerBase
	jsr	FreeModule(a5)

	move.l	_PlayFTM(pc),a5			; PlayerBase
	jsr	RestoreSound(a5)
	rts

*-----------------------------------------------------------------------*
;
; Start Song

StartSnd
	moveq	#0,d0				; Endlosschleife
	moveq	#0,d1				; Starten bei Takt 0
	moveq	#0,d2				; Spielen bis Song-Ende
	moveq	#0,d3				; bis Stromausfall
	move.l	_PlayFTM(pc),a5			; PlayerBase
	jsr	StartPlay(a5)
	rts

*-----------------------------------------------------------------------*
;
; Stop Song

StopSnd
	move.l	_PlayFTM(pc),a5			; PlayerBase
	jsr	StopPlay(a5)
	rts

*-----------------------------------------------------------------------*
;
; Set Volume

SetVol
	moveq	#0,d0
	move.w	dtg_SndVol(a5),d0
	cmpi.w	#64,d0
	blt.s	SetVolOk
	moveq	#63,d0				; FTM wants volume only from 0 to 63
SetVolOk
	move.l	_PlayFTM(pc),a5			; PlayerBase
	jsr	SetVolume(a5)
	rts

*-----------------------------------------------------------------------*
;
; FaceTheMusic

;
;
	SECTION Replay,Code			; PseudoHunk zum Linken
;
;

PlayFTM
	dc.l 0

;	Cause the file 'PlayFTM' is a executable, you must patch the
;	resulting file after linking. Find the first Reloc32 Hunk
;	($000003EC), approximate offset is $1C0 bytes. Then search
;	the byte sequence $00,$00,$00,$01, $00,$00,$00,$01. Replace
;	the last $01 byte through $02. That's it !


