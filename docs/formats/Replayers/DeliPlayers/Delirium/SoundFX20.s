
	incdir	"Includes:"
	include	"misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: SoundFX 2.0 player module V0.7 (12 Sep 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,0
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_Interrupt,PlaySong
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,RemSnd
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName		dc.b 'SoundFX_2.0',0
CName		dc.b '1988/89/90 by C.Haller and C.A.Weber,',10
		dc.b 'adapted by Delirium',0
	even
fx_songend	dc.l 0

*-----------------------------------------------------------------------*
;
; Testet auf SoundFX2.0-Modul

Chk
	move.l	dtg_ChkData(a5),a0
	move.l	124(a0),d0
	subi.l	#'SO31',d0
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
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
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	add.l	a0,d0
	move.l	d0,fx_songend

	bsr	StartSound			; Init Sound

	move.w	DelayValue(pc),dtg_Timer(a5)
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	bsr	PlayDisable			; End Sound
	rts

*-----------------------------------------------------------------------*
;
; SoundFX2.0-Replay

****************************************************************************
*									   *
*									   *
*		  Sound Abspiel Routine zu Sound FX			   *
*									   *
*									   *
****************************************************************************

;--------------------------------------------------------------------

StartSound
	movem.l	d0-d7/a0-a6,-(sp)
	move.l	a0,SongPointer		;Zeiger auf SongDaten
	move.w	$0080(a0),DelayValue 	;Geschwindigkeit
	moveq	#$00,d0
	move.b	$0432(a0),d0
	move.w	d0,AnzPatt
	bsr	SongLen			;Länge der Songdaten berechnen
	add.l	d0,a0
	lea	$04B8(a0),a0
	move.l	SongPointer(pc),a2
	lea	Instruments(pc),a1	;Tabelle auf Samples
	moveq	#$1E,d7			;31 Instrumente
CalcIns
	move.l	a0,(a1)+		;Startadresse des Instr.
	add.l	(a2)+,a0		;berechnen un speichern
	dbra	d7,CalcIns
	bsr	PlayInit		;Loop Bereich setzen
	bsr	PlayEnable		;Player erlauben
	movem.l	(sp)+,d0-d7/a0-a6
	rts

SongLen
	movem.l	d1-d7/a0-a6,-(sp)
	move.l	SongPointer(pc),a0
	lea	$0434(a0),a0
	move.w	AnzPatt(pc),d2		;wieviel Positions
	subq.w	#$01,d2
	moveq	#$00,d1
	moveq	#$00,d0
SongLenLoop
	move.b	(a0)+,d0		;Patternnummer holen
	cmp.b	d0,d1			;ist es die höchste ?
	bhi.s	LenHigher		;nein!
	move.b	d0,d1			;ja
LenHigher
	dbra	d2,SongLenLoop
	move.l	d1,d0			;Hoechste BlockNummer nach d0
	addq.w	#$01,d0			;plus 1
	mulu	#$0400,d0		;Laenge eines Block
	movem.l	(sp)+,d1-d7/a0-a6
	rts

PlayInit
	move.l	d0,-(sp)
	lea	Instruments(pc),a0	;Zeiger auf instr.Tabelle
	moveq	#$1E,d7			;31 Instrumente
InitLoop
	move.l	(a0)+,a1		;Zeiger holen
	move.l	a1,d0
	beq.s	InitLoop2
	cmp.l	fx_songend,d0
	bge.s	InitLoop2
	clr.l	(a1)			;erstes Longword löschen
InitLoop2
	dbra	d7,InitLoop
	move.l	(sp)+,d0
	rts

PlayEnable
	lea	$00DFF000,a0
	move.l	d0,-(sp)
	move.w	#$FFFF,PlayLock		;player zulassen
	moveq	#$00,d0
	move.w	d0,$00A8(a0)
	move.w	d0,$00B8(a0)
	move.w	d0,$00C8(a0)
	move.w	d0,$00D8(a0)
	clr.w	Timer			;zahler auf 0
	clr.l	TrackPos		;zeiger auf pos
	clr.l	PosCounter		;zeiger innehalb des pattern
	move.l	(sp)+,d0
	rts

;--------------------------------------------------------------------

PlayDisable
	lea	$00DFF000,a0
	clr.w	PlayLock		;player sperren
	move.l	d0,-(sp)
	moveq	#$00,d0
	move.w	d0,$00A8(a0)
	move.w	d0,$00B8(a0)
	move.w	d0,$00C8(a0)
	move.w	d0,$00D8(a0)
	move.w	#$000F,$0096(a0)
	move.l	(sp)+,d0
	rts

;--------------------------------------------------------------------
;
; hier werden 5 * effekte gespielt und einmal der song

PlaySong				;HauptAbspielRoutine
	movem.l	d0-d7/a0-a6,-(sp)
	addq.w	#$01,Timer		;zähler erhöhen
	cmp.w	#$0006,Timer		;schon 6?
	bne.s	CheckEffects		;wenn nicht -> effekte
	clr.w	Timer			;sonst zähler löschen
	bsr	PlaySound		;und sound spielen
	movem.l	(sp)+,d0-d7/a0-a6
	rts

CheckEffects
	moveq	#$03,d7			;4 kanäle
	lea	ChannelData0(pc),a6	;zeiger auf daten für 0
	lea	$00DFF0A0,a3
EffLoop
	bsr.s	MakeEffekts		;Effekt spielen
	add.w	#$0010,a3		;nächster Kanal
	add.w	#$0024,a6		;Nächste KanalDaten
	dbra	d7,EffLoop
	movem.l	(sp)+,d0-d7/a0-a6
	rts

MakeEffekts
	move.w	$0016(a6),d0
	beq.s	NoStep
	bmi.s	StepItUp
	add.w	d0,$0018(a6)
	move.w	$0018(a6),d0
	move.w	d0,$0010(a6)
	move.w	$001A(a6),d1
	cmp.w	d0,d1
	bhi.s	StepOk
	clr.w	$0016(a6)
	move.w	d1,d0
	move.w	d0,$0010(a6)
StepOk
	move.w	d0,$0006(a3)
	move.w	d0,$0018(a6)
	rts

StepItUp
	add.w	d0,$0018(a6)
	move.w	$0018(a6),d0
	move.w	d0,$0010(a6)
	move.w	$001A(a6),d1
	cmp.w	d0,d1
	blt.s	StepOk2
	clr.w	$0016(a6)
	move.w	d1,d0
	move.w	d0,$0010(a6)
StepOk2
	move.w	d0,$0006(a3)
	move.w	d0,$0018(a6)
	rts

NoStep
	move.b	$0002(a6),d0
	and.w	#$000F,d0
	tst.w	d0
	beq.s	NoEff
	subq.w	#$01,d0
	lsl.w	#$02,d0
	lea	EffTable(pc),a0
	move.l	$00(a0,d0.w),d0
	beq.s	NoEff
	move.l	d0,a0
	jsr	(a0)
NoEff
	rts

EffTable
	dc.l	appreggiato
	dc.l	pitchbend
	dc.l	0	; LedOn
	dc.l	0	; LedOff
	dc.l	0
	dc.l	0
	dc.l	SetStepUp
	dc.l	SetStepDown
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0

LedOn
	bset	#$01,$00BFE001
	rts

LedOff
	bclr	#$01,$00BFE001
	rts

SetStepDown
	st	d4
	bra.s	StepFinder

SetStepUp
	moveq	#$00,d4
StepFinder
	clr.w	$0016(a6)
	move.w	$0010(a6),$0018(a6)
	move.b	$0003(a6),d2
	and.w	#$000F,d2
	tst.w	d4
	beq.s	NoNegIt
	neg.w	d2
NoNegIt
	move.w	d2,$0016(a6)
	moveq	#$00,d2
	move.b	$0003(a6),d2
	lsr.w	#$04,d2
	move.w	$0010(a6),d0
	lea	NoteTable(pc),a0
StepUpFindLoop
	move.w	(a0),d1
	cmp.w	#$FFFF,d1
	beq.s	EndStepUpFind
	cmp.w	d1,d0
	beq.s	StepUpFound
	addq.w	#$02,a0
	bra.s	StepUpFindLoop

StepUpFound
	add.w	d2,d2
	tst.w	d4
	bne.s	NoNegStep
	neg.w	d2
NoNegStep
	move.w	$00(a0,d2.w),d0
	move.w	d0,$001A(a6)
	rts

EndStepUpFind
	move.w	d0,$001A(a6)
	rts

appreggiato
	lea	ArpeTable(pc),a0
	moveq	#$00,d0
	move.w	Timer(pc),d0
	subq.w	#$01,d0
	lsl.w	#$02,d0
	move.l	$00(a0,d0.w),a0
	jmp	(a0)

ArpeTable
	dc.l	Arpe1
	dc.l	Arpe2
	dc.l	Arpe3
	dc.l	Arpe2
	dc.l	Arpe1

Arpe4
	add.w	d0,d0
	move.w	$0010(a6),d1
	lea	NoteTable(pc),a0
Arpe5
	move.w	$00(a0,d0.l),d2
	tst.w	(a0)
	bmi.s	Arpe7
	cmp.w	(a0),d1
	beq.s	Arpe6
	addq.w	#$02,a0
	bra.s	Arpe5

Arpe1
	moveq	#$00,d0
	move.b	$0003(a6),d0
	lsr.b	#$04,d0
	bra.s	Arpe4

Arpe2
	moveq	#$00,d0
	move.b	$0003(a6),d0
	and.b	#$0F,d0
	bra.s	Arpe4

Arpe3
	move.w	$0010(a6),d2
Arpe6
	move.w	d2,$0006(a3)
	rts

Arpe7
	move.w	#$00F0,$00DFF180
	rts

pitchbend
	moveq	#$00,d0
	move.b	$0003(a6),d0
	lsr.b	#$04,d0
	tst.b	d0
	beq.s	pitch2
	move.w	(a6),d1
	and.w	#$1000,d1
	and.w	#$EFFF,(a6)
	add.w	d0,(a6)
	move.w	(a6),d0
	move.w	d0,$0006(a3)
	or.w	d1,(a6)
	rts

pitch2
	moveq	#$00,d0
	move.b	$0003(a6),d0
	and.b	#$0F,d0
	tst.b	d0
	beq.s	pitch3
	move.w	(a6),d1
	and.w	#$1000,d1
	and.w	#$EFFF,(a6)
	sub.w	d0,(a6)
	move.w	(a6),d0
	move.w	d0,$0006(a3)
	or.w	d1,(a6)
pitch3
	rts

PlaySound
	move.l	SongPointer(pc),a0	;Zeiger auf SongFile
	lea	$0434(a0),a2		;Zeiger auf Patterntab.
	lea	$0090(a0),a3		;Zeiger auf Instr.Daten
	lea	$04B8(a0),a0		;Zeiger auf BlockDaten
	move.l	TrackPos(pc),d0		;Postionzeiger
	moveq	#$00,d1
	move.b	$00(a2,d0.l),d1
	moveq	#$0A,d7
	lsl.l	d7,d1			;*1024 / länge eines Pattern
	add.l	PosCounter(pc),d1	;Offset ins Pattern
	clr.w	DmaCon
	lea	$00DFF0A0,a4
	lea	ChannelData0(pc),a6	;Daten für Kanal0
	moveq	#$03,d7			;4 Kanäle
SoundHandleLoop
	bsr	PlayNote		;aktuelle Note spielen
	add.w	#$0010,a4		;nächster Kanal
	add.w	#$0024,a6		;nächste Daten
	dbra	d7,SoundHandleLoop
	move.w	DmaCon(pc),d0
	and.w	#$000F,d0
	or.w	#$8000,d0
	move.w	d0,$00DFF096
	bsr	Delay
	lea	ChannelData3(pc),a6
	lea	$00DFF0D0,a4
	moveq	#$03,d7
SetRegsLoop
	move.l	$000A(a6),(a4)		;Adresse
	move.w	$000E(a6),$0004(a4)	;Länge
	sub.w	#$0024,a6		;nächste Daten
	sub.w	#$0010,a4		;nächster Kanal
	dbra	d7,SetRegsLoop
	tst.w	PlayLock
	beq.s	NoEndPattern
	tst.w	Break
	beq.s	NoBreakPattern
	move.l	#$000003F0,PosCounter
	clr.w	Break
NoBreakPattern
	add.l	#$00000010,PosCounter	;PatternPos erhöhen
	cmp.l	#$00000400,PosCounter	;schon Ende ?
	blt.s	NoEndPattern
	clr.l	PosCounter		;PatternPos löschen
	tst.b	PlayLock
	beq.s	NoAddPos
	addq.l	#$01,TrackPos		;Position erhöhen
NoAddPos
	move.w	AnzPatt(pc),d0		;AnzahlPosition
	move.l	TrackPos(pc),d1		;Aktuelle Pos
	cmp.w	d0,d1			;Ende?
	bne.s	NoEndPattern		;nein!
	clr.l	TrackPos		;ja/ Sound von vorne
NoEndPattern
	rts

PlayNote
	tst.b	$0014(a6)
	bne.s	NoGetNote
	clr.l	(a6)
	tst.w	PlayLock
	beq.s	NoGetNote
	move.l	$00(a0,d1.l),(a6)
NoGetNote
	addq.w	#$04,d1
	moveq	#$00,d2
	cmp.w	#$FFFD,(a6)
	beq	NoInstr2
	move.b	$0002(a6),d2
	and.b	#$F0,d2
	lsr.b	#$04,d2
	btst	#$04,(a6)
	beq.s	PlayInstr
	add.b	#$10,d2
PlayInstr
	tst.b	d2
	beq	NoInstr2
	lea	Instruments(pc),a1
	subq.w	#$01,d2
	move.w	d2,d4
	lsl.w	#$02,d2
	mulu	#$001E,d4
	move.l	$00(a1,d2.w),$0004(a6)
	move.w	$16(a3,d4.l),$0008(a6)
	move.w	$18(a3,d4.l),$0012(a6)
	moveq	#$00,d3
	move.w	$1A(a3,d4.l),d3
	tst.w	d3
	beq.s	NoRepeat
	move.l	$0004(a6),d2
	add.l	d3,d2
	move.l	d2,$000A(a6)
	move.w	$1C(a3,d4.w),$000E(a6)
	move.w	$0012(a6),d3
	bra.s	NoInstr

NoRepeat
	move.l	$0004(a6),d2
	add.l	d3,d2
	move.l	d2,$000A(a6)
	move.w	$1C(a3,d4.l),$000E(a6)
	move.w	$0012(a6),d3
NoInstr
	move.b	$0002(a6),d2
	and.w	#$000F,d2
	cmp.b	#$05,d2
	beq.s	ChangeUpVolume
	cmp.b	#$06,d2
	bne.s	SetVolume2
	moveq	#$00,d2
	move.b	$0003(a6),d2
	sub.w	d2,d3
	tst.w	d3
	bpl.s	SetVolume2
	clr.w	d3
	bra.s	SetVolume2

ChangeUpVolume
	moveq	#$00,d2
	move.b	$0003(a6),d2
	add.w	d2,d3
	tst.w	d3
	cmp.w	#$0040,d3
	ble.s	SetVolume2
	moveq	#$40,d3
SetVolume2
	move.w	d3,$0008(a4)
NoInstr2
	cmp.w	#$FFFD,(a6)
	bne.s	NoPic
	clr.w	$0002(a6)
	bra.s	NoNote

NoPic
	tst.w	(a6)
	beq.s	NoNote
	clr.w	$0016(a6)
	move.w	(a6),d0
	and.w	#$EFFF,d0
	move.w	d0,$0010(a6)
	move.w	$0014(a6),d0
	ext.w	d0
	move.w	d0,$00DFF096
	bsr	Delay
	cmp.w	#$FFFE,(a6)
	bne.s	NoStop
	move.w	#$0000,$0008(a4)
	bra.s	Super

NoStop
	cmp.w	#$FFFC,(a6)
	bne.s	NoBreak
	st	Break
	and.w	#$EFFF,(a6)
	bra	EndNote

NoPic2
	and.w	#$EFFF,(a6)
	bra.s	NoNote

NoBreak
	cmp.w	#$FFFB,(a6)
	beq.s	NoPic2
	move.l	$0004(a6),(a4)
	move.w	$0008(a6),$0004(a4)
	move.w	(a6),d0
	and.w	#$EFFF,d0
	move.w	d0,$0006(a4)
Super
	move.w	$0014(a6),d0
	ext.w	d0
	or.w	d0,DmaCon
NoNote
	clr.b	$0014(a6)
EndNote
	rts

Delay
	movem.l	d0-d3,-(sp)
	moveq	#$05,d0
	move.l	d0,d1
DelayLoop
	bsr.s	WaitLine
	move.w	d0,d2
DelayLoop2
	bsr.s	WaitLine
	cmp.w	d0,d2
	beq.s	DelayLoop2
	dbra	d1,DelayLoop
	movem.l	(sp)+,d0-d3
	rts

WaitLine
	move.l	$00DFF004,d0
	and.l	#$0001FFFF,d0
	lsr.l	#$08,d0
	tst.w	d0
	beq.s	WaitLine
	rts

;--------------------------------------------------------------------

ChannelData0	dcb.b	$14,0			;Daten für Note
		dc.w	$0001
		dcb.b	$0E,0

ChannelData1	dcb.b	$14,0			;u.s.w
		dc.w	$0002
		dcb.b	$0E,0

ChannelData2	dcb.b	$14,0			;etc.
		dc.w	$0004
		dcb.b	$0E,0

ChannelData3	dcb.b	$14,0			;a.s.o
		dc.w	$0008
		dcb.b	$0E,0

Instruments	dcb.l 31,0			;Zeiger auf die 31 Instrumente

PosCounter	dc.l 0				;Offset ins Pattern

TrackPos	dc.l 0				;Position Counter

Break		dc.w 0				;Flag fuer 'Pattern abbrechen'

Timer		dc.w 0				;Zähler 0-5

DmaCon		dc.w 0				;Zwischenspeicher für DmaCon

AnzPatt		dc.w 0				;Anzahl Positions

PlayLock	dc.w 0				;Flag fuer 'Sound erlaubt'

DelayValue	dc.w 0

SongPointer	dc.l 0


	dc.w	$0434,$0434,$0434,$0434,$0434,$0434,$0434,$0434,$0434,$0434
	dc.w	$0434,$0434,$0434,$0434,$0434,$0434,$0434,$0434,$0434,$0434
NoteTable
	dc.w	$0434,$03F8,$03C0,$038A,$0358,$0328,$02FA,$02D0,$02A6,$0280
	dc.w	$025C,$023A,$021A,$01FC,$01E0,$01C5,$01AC,$0194,$017D,$0168
	dc.w	$0153,$0140,$012E,$011D,$010D,$00FE,$00F0,$00E2,$00D6,$00CA
	dc.w	$00BE,$00B4,$00AA,$00A0,$0097,$008F,$0087,$007F,$0078,$0071
	dc.w	$0071,$0071,$0071,$0071,$0071,$0071,$0071,$0071,$0071,$0071
	dc.w	$0071,$0071,$0071,$0071,$0071,$0071,$0071,$0071,$0071,$0071
	dc.w	$0071,$0071,$0071,$0071,$0071,$0071,$FFFF

