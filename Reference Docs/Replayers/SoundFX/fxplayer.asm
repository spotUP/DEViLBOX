****************************************************************************
*									   *	
*									   *
*		  Sound Abspiel Routine zu Sound FX		   	   *
*									   *
*		       © 1988 LINEL Switzerland				   *	
*									   *	
*			     Aztec Version				   *	
*									   *
****************************************************************************
	
	CSEG

	Public	_LoadSound,_StopSound,_StartSound,_RemSound

_LoadSound:
	movem.l	d0-d7/a0-a6,-(SP)
	move.l	4,a6			;ExcBase
	lea	DosLib,a1		;'dos.library'
	jsr	-408(A6)		;OldOpenLibrary()
	move.l	d0,DosBase
	move.l	#FileName,d0		;'sound.data'
	bsr	CheckFile		
	move.l	d0,SongLaenge
	tst.l	d0
	beq.s	EndLoadSound
	move.l	4,a6
	moveq	#2,d1
	jsr	-198(A6)
	move.l	d0,SongPointer
	tst.l	d0
	beq.s	EndLoadSound
	move.l	DosBase,a6
	move.l	#FileName,d1
	move.l	#1005,d2
	jsr	-30(A6)
	move.l	d0,d7
	move.l	d0,d1
	move.l	SongPointer,d2
	move.l	SongLaenge,d3
	jsr	-42(A6)
	move.l	d7,d1
	jsr	-36(A6)
	move.l	a6,a1
	move.l	4,a6
	jsr	-414(a6)
EndLoadSound:
	movem.l	(SP)+,d0-d7/a0-a6
	rts

CheckFile:
	movem.l	d1-d7/a0-a6,-(A7)
	move.l	d0,d6
	moveq	#0,d7
	
	move.l	4,a6
	move.l	#1024,d0
	moveq	#0,d1
	jsr	-198(A6)
	move.l	d0,FileInfo
	move.l	DosBase,a6
	tst.l	d0
	beq	EndCheckFile
	
	move.l	d6,d1
	move.l	#$3ed,d2
	jsr	-84(A6)
	tst.l	d0
	beq	EndCheckFile
	move.l	d0,d1
	move.l	d0,Lock
	move.l	FileInfo,d2
	jsr	-102(a6)
	move.l	FileInfo,a0
	move.l	124(A0),d7
	move.l	Lock,d1
	jsr	-90(A6)
EndCheckFile:
	clr.l	Lock
	move.l	4,a6
	move.l	FileInfo,a1
	move.l	#1024,d0
	jsr	-210(A6)
	move.l	d7,d0
	movem.l	(A7)+,d1-d7/a0-a6
	rts


_StartSound:
	movem.l	d1-d7/a0-a6,-(SP)
	move.l	4,a6			;ExecBase
	move.l	SongPointer,a0	;Zeiger auf SongDaten
	add	#60,a0			;Laengentabelle ueberspringen
	move.b	470(a0),AnzPat+1	;Laenge des Sounds
	move	4(A0),DelayValue 	;Geschwindigkeit
	bsr	SongLen			;Länge der Songdaten berechnen
	add.l	d0,a0			;Zur Adresse der Songstr.
	add.w	#600,a0			;Laenge der SongStr.
	move.l	SongPointer,a2
	lea	Instruments,a1		;Tabelle auf Samples
	moveq	#14,d7			;15 Instrumente
CalcIns:
	move.l	a0,(A1)+		;Startadresse des Instr.
	add.l	(a2)+,a0		;berechnen un speichern
	dbf	d7,CalcIns

	lea	CiaaResource,a1		;'ciaa.resource'
	moveq	#0,d0			;Version egal
	jsr	-498(A6)		;OpenResource()
	move.l	d0,CiaaBase		;Resource Base speichern
	move.l	d0,a6
	bsr	PlayDisable		;Sound DMA abschalten
	lea	Interrupt,a1		;Sound Interupt Structure
	moveq	#0,d0			;TimerA
	jsr	-6(A6)			;installieren
	move.l	d0,d5			;ergebnis speichern
	bsr	PlayInit		;Loop Bereich setzen
	bsr	PlayEnable		;Player erlauben
	bsr	InitTimer		;Timer starten
	moveq	#0,d0			;Ergebnisregister loeschen
EndStart:
	tst.l	d5			;ergebnis von Resource
	sne	d0			;ergebnis in d0 setzen 
	movem.l	(SP)+,d1-d7/a0-a6
	rts

;---------------------------------------------------------------------------

_StopSound:
	movem.l	d1-d7/a0-a6,-(SP)
	move.l	CiaaBase,a6		;Zeiger auf Ciaa Resource
	lea	Interrupt,a1		;Zeiger auf Int. Strukture
	moveq	#0,d0			;Timer A
	jsr	-12(A6)			;Interupt entfernen
	bsr	PlayDisable		;Player sperren
	moveq	#0,d0			;Alles Ok	
	movem.l	(SP)+,d1-d7/a0-a6
	rts
;---------------------------------------------------------------------------

_RemSound:
	movem.l	d0-d7/a0-a6,-(SP)
	move.l	4,a6
	move.l	SongPointer,a1
	move.l	SongLaenge,d0
	beq.s	EndRemSound
	jsr	-210(A6)
EndRemSound:
	movem.l	(SP)+,d0-d7/a0-a6
	rts
;------------------------------------------------------------------------

SongLen:
	movem.l	d1-d7/a0-a6,-(SP)
	move.l	SongPointer,a0
	lea	532(A0),a0
	move	AnzPat,d2		;wieviel Positions
	subq	#1,d2			;für dbf
	moveq	#0,d1
	moveq	#0,d0
SongLenLoop:
	move.b	(a0)+,d0		;Patternnummer holen
	cmp.b	d0,d1			;ist es die höchste ?
	bhi.s	LenHigher		;nein!
	move.b	d0,d1			;ja
LenHigher:
	dbf	d2,SongLenLoop
	move.l	d1,d0			;Hoechste BlockNummer nach d0
	addq	#1,d0			;plus 1
	mulu	#1024,d0		;Laenge eines Block
	movem.l	(SP)+,d1-d7/a0-a6
	rts

;--------------------------------------------------------------------	
	DSEG

Interrupt:
	dc.l	0			;letzter Node
	dc.l	0			;nächster Node
	dc.b	2			;Node Type = Interrupt
	dc.b	0 			;Priorität
	dc.l	InterruptName		;Name
	dc.l	0			;Zeiger auf Daten
	dc.l	IntCode			;Interrupt Routine

;-------------------------------------------------------------------
	CSEG

InitTimer:
	move.b	#%10000001,$bfee01	;Timer starten
	lea	DelayValue,a1
	move.b	1(a1),$bfe401		;Timer A low
	move.b	0(a1),$bfe501		;Timer A high
	rts

;--------------------------------------------------------------------

PlayInit:
	lea	Instruments,a0			;Zeiger auf instr.Tabelle
	moveq	#14,d7				;15 Instrumente
InitLoop:	
	move.l	(A0)+,a1			;Zeiger holen
	clr.l	(A1)				;erstes Longword löschen
	dbf	d7,InitLoop
	rts

;-----------------------------------------------------------------------

PlayEnable:
	lea	$dff000,a0		;AMIGA
	move.w	#-1,PlayLock		;player zulassen
	clr	$a8(A0)			;Alle Voloumenregs. auf 0
	clr	$b8(A0)
	clr	$c8(a0)
	clr	$d8(a0)
	clr.w	Timer			;zahler auf 0
	clr.l	TrackPos		;zeiger auf pos
	clr.l	PosCounter		;zeiger innehalb des pattern
	rts
;----------------------------------------------------------------------

PlayDisable:
	lea	$dff000,a0		;AMIGA
	clr.w	PlayLock		;player sperren
	clr	$a8(a0)			;volumen auf 0
	clr	$b8(a0)
	clr	$c8(a0)
	clr	$d8(a0)
	move.w	#$f,$96(A0)		;dma sperren
	rts

;---------------------------------------------------------------------

IntCode:
	bsr	PlaySong		;Note spielen
	moveq	#0,d0			;kein Fehler
	rts

;----------------------------------------------------------------------


;hier werden 5 * effekte gespielt und einmal der song

PlaySong:				;HauptAbspielRoutine
	movem.l	d0-d7/a0-a6,-(SP)
	addq.w	#1,Timer		;zähler erhöhen
	cmp.w	#6,Timer		;schon 6?
	bne.s	CheckEffects		;wenn nicht -> effekte
	clr.w	Timer			;sonst zähler löschen
	bsr 	PlaySound		;und sound spielen
NoPlay:	movem.l	(SP)+,d0-d7/a0-a6
	rts

;-------------------------------------------------------------------

CheckEffects:
	moveq	#3,d7			;4 kanäle
	lea	StepControl0,a4
	lea	ChannelData0,a6		;zeiger auf daten für 0
	lea	$dff0a0,a5		;Kanal 0
EffLoop:
	movem.l	d7/a5,-(SP)
	bsr.s	MakeEffekts		;Effekt spielen
	movem.l	(Sp)+,d7/a5
NoEff:
	add	#8,a4
	add	#$10,a5			;nächster Kanal
	add	#22,a6			;Nächste KanalDaten
	dbf	d7,EffLoop
	movem.l	(a7)+,d0-d7/a0-a6
	rts

MakeEffekts:
	move	(A4),d0
	beq.s	NoStep
	bmi.s	StepItUp
	add	d0,2(A4)
	move	2(A4),d0
	move	4(A4),d1
	cmp	d0,d1
	bhi.s	StepOk
	move	d1,d0
StepOk:
	move	d0,6(a5)
	MOVE	D0,2(A4)
	rts

StepItUp:
	add	d0,2(A4)
	move	2(A4),d0
	move	4(A4),d1
	cmp	d0,d1
	blt.s	StepOk
	move	d1,d0
	bra.s	StepOk



NoStep:
	move.b	2(a6),d0
	and.b	#$0f,d0
	cmp.b	#1,d0
	beq	appreggiato
	cmp.b	#2,d0
	beq	pitchbend
	cmp.b	#3,d0
	beq	LedOn
	cmp.b	#4,d0
	beq	LedOff
	cmp.b	#7,d0
	beq.s	SetStepUp
	cmp.b	#8,d0
	beq.s	SetStepDown
	rts

LedOn:
	bset	#1,$bfe001
	rts
LedOff:
	bclr	#1,$bfe001
	rts

SetStepUp:
	moveq	#0,d4
StepFinder:
	clr	(a4)
	move	(A6),2(a4)
	moveq	#0,d2
	move.b	3(a6),d2
	and	#$0f,d2
	tst	d4
	beq.s	NoNegIt
	neg	d2
NoNegIt:	
	move	d2,(a4)
	moveq	#0,d2
	move.b	3(a6),d2
	lsr	#4,d2
	move	(a6),d0
	lea	NoteTable,a0

StepUpFindLoop:
	move	(A0),d1
	cmp	#-1,d1
	beq.s	EndStepUpFind
	cmp	d1,d0
	beq.s	StepUpFound
	addq	#2,a0
	bra.s	StepUpFindLoop
StepUpFound:
	;move	d2,(a5)+
	lsl	#1,d2
	;move	d2,(a5)+
	tst	d4
	bne.s	NoNegStep
	neg	d2
NoNegStep:
	;move	d2,(A5)+
	;move.l	a0,(A5)+
	move	(a0,d2.w),d0
	move	d0,4(A4)
	rts

EndStepUpFind:
	move	d0,4(A4)
	rts
	
SetStepDown:
	st	d4
	bra.s	StepFinder

	DSEG

StepControl0:
	dc.l	0,0
StepControl1:
	dc.l	0,0
StepControl2:
	dc.l	0,0
StepControl3:
	dc.l	0,0

	CSEG

appreggiato:
	lea	ArpeTable,a0
	moveq	#0,d0
	move	Timer,d0
	subq	#1,d0
	lsl	#2,d0
	move.l	(A0,d0.l),a0
	jmp	(A0)

Arpe4:	lsl.l	#1,d0
	clr.l	d1
	move.w	16(a6),d1
	lea.l	NoteTable,a0
Arpe5:	move.w	(a0,d0.l),d2
	cmp.w	(a0),d1
	beq.s	Arpe6
	addq.l	#2,a0
	bra.s	Arpe5



Arpe1:	clr.l	d0
	move.b	3(a6),d0
	lsr.b	#4,d0
	bra.s	Arpe4


Arpe2:	clr.l	d0
	move.b	3(a6),d0
	and.b	#$0f,d0
	bra.s	Arpe4

Arpe3:	move.w	16(a6),d2
	
Arpe6:	move.w	d2,6(a5)
	rts


pitchbend:
	clr.l	d0
	move.b	3(a6),d0
	lsr.b	#4,d0
	cmp.b	#0,d0
	beq.s	pitch2
	add.w	d0,(a6)
	move.w	(a6),6(a5)
	rts
pitch2:	clr.l	d0
	move.b	3(a6),d0
	and.b	#$0f,d0
	cmp.b	#0,d0
	beq.s	pitch3
	sub.w	d0,(a6)
	move.w	(a6),6(a5)
pitch3:	rts


	
;--------------------------------------------------------------------

PlaySound:
	move.l	SongPointer,a0		;Zeiger auf SongFile
	add	#60,a0			;Laengentabelle ueberspringen
	move.l	a0,a3
	move.l	a0,a2
	lea	600(A0),a0		;Zeiger auf BlockDaten
	add	#472,a2			;zeiger auf Patterntab.
	add	#12,a3			;zeiger auf Instr.Daten
	move.l	TrackPos,d0		;Postionzeiger
	clr.l	d1
	move.b	(a2,d0.l),d1		;dazugehörige PatternNr. holen
	moveq	#10,d7
	lsl.l	d7,d1			;*1024 / länge eines Pattern
	add.l	PosCounter,d1		;Offset ins Pattern
	clr.w	DmaCon
	lea	StepControl0,a4
	lea	$dff0a0,a5		;Zeiger auf Kanal0
	lea	ChannelData0,a6		;Daten für Kanal0
	moveq	#3,d7			;4 Kanäle
SoundHandleLoop:
	bsr	PlayNote		;aktuelle Note spielen
	add.l	#$10,a5			;nächster Kanal
	add.l	#22,a6			;nächste Daten
	add	#8,a4
	dbf	d7,SoundHandleLoop	;4*
	
	move	DmaCon,d0		;DmaBits
	bset	#15,d0			;Clear or Set Bit setzen
	move.w	d0,$dff096		;DMA ein!

	move	#300,d0			;Verzögern (genug für MC68030)
Delay2:
	dbf	d0,Delay2

	lea	ChannelData3,a6
	lea	$dff0d0,a5
	moveq	#3,d7
SetRegsLoop:
	move.l	10(A6),(a5)		;Adresse
	move	14(A6),4(A5)		;länge
NoSetRegs:
	sub	#22,a6			;nächste Daten
	sub	#$10,a5			;nächster Kanal
	dbf	d7,SetRegsLoop
	tst	PlayLock
	beq.s	NoEndPattern
	add.l	#16,PosCounter		;PatternPos erhöhen
	cmp.l	#1024,PosCounter	;schon Ende ?
	blt.s	NoEndPattern

	clr.l	PosCounter		;PatternPos löschen
	addq.l	#1,TrackPos		;Position erhöhen
NoAddPos:
	move.w	AnzPat,d0		;AnzahlPosition
	move.l	TrackPos,d1		;Aktuelle Pos
	cmp.w	d0,d1			;Ende?
	bne.s	NoEndPattern		;nein!
	clr.l	TrackPos		;ja/ Sound von vorne
NoEndPattern:
	rts



PlayNote:
	clr.l	(A6)
	tst	PlayLock		;Player zugelassen ?
	beq.s	NoGetNote		;
	move.l	(a0,d1.l),(a6)		;Aktuelle Note holen
NoGetNote:
	addq.l	#4,d1			;PattenOffset + 4
	clr.l	d2
	cmp	#-3,(A6)		;Ist Note = 'PIC' ?
	beq	NoInstr2		;wenn ja -> ignorieren
	move.b	2(a6),d2		;Instr Nummer holen	
	and.b	#$f0,d2			;ausmaskieren
	lsr.b	#4,d2			;ins untere Nibble
	tst.b	d2			;kein Intrument ?
	beq.s	NoInstr2		;wenn ja -> überspringen
	
	clr.l	d3
	lea.l	Instruments,a1		;Instr. Tabelle
	move.l	d2,d4			;Instrument Nummer
	subq	#1,d2
	lsl	#2,d2			;Offset auf akt. Instr.
	mulu	#30,d4			;Offset Auf Instr.Daten
	move.l	(a1,d2.w),4(a6)		;Zeiger auf akt. Instr.
	move.w	(a3,d4.l),8(a6)		;Instr.Länge
	move.w	2(a3,d4.l),18(a6)	;Volume
	move.w	4(a3,d4.l),d3		;Repeat
	tst	d3			;kein Repeat?
	beq.s	NoRepeat		;Nein!
					;Doch!
	
	move.l	4(a6),d2		;akt. Instr.
	add.l	d3,d2			;Repeat dazu
	move.l	d2,10(a6)		;Repeat Instr.
	move.w	6(a3,d4),14(a6)		;rep laenge
	move.w	18(a6),d3 		;Volume in HardReg.
	bra.s	NoInstr

NoRepeat:
	move.l	4(a6),d2		;Instrument	
	add.l	d3,d2			;rep Offset
	move.l	d2,10(a6)		;in Rep. Pos.
	move.w	6(a3,d4.l),14(a6)	;rep Laenge
	move.w	18(a6),d3 		;Volume in Hardware

CheckPic:
NoInstr:
	move.b	2(A6),d2
	and	#$0f,d2
	cmp.b	#5,d2
	beq.s	ChangeUpVolume
	cmp.b	#6,d2
	bne.L	SetVolume2
	moveq	#0,d2
	move.b	3(A6),d2
	sub	d2,d3		
	tst	d3
	bpl	SetVolume2	
	clr	d3
	bra.L	SetVolume2
ChangeUpVolume:
	moveq	#0,d2
	move.b	3(A6),d2
	add	d2,d3
	tst	d3
	cmp	#64,d3
	ble.L	SetVolume2
	move	#64,d3
SetVolume2:
	move	d3,8(A5)
	
NoInstr2:
	cmp	#-3,(A6)		;Ist Note = 'PIC' ?
	bne.s	NoPic		
	clr	2(A6)			;wenn ja -> Note auf 0 setzen
	bra.s	NoNote	
NoPic:
	tst	(A6)			;Note ?
	beq.s	NoNote			;wenn 0 -> nicht spielen
	
	clr	(A4)
	move.w	(a6),16(a6)		;eintragen
	move.w	20(a6),$dff096		;dma abschalten
	move.l	d7,-(SP)
	move	#300,d7			;genug für MC68030
Delay1:
	dbf	d7,Delay1		;delay
	move.l	(SP)+,d7
	cmp	#-2,(A6)		;Ist es 'STP'
	bne.s	NoStop			;Nein!
	clr	8(A5)
	bra	Super
NoStop:
	move.l	4(a6),0(a5)		;Intrument Adr.
	move.w	8(a6),4(a5)		;Länge
	move.w	0(a6),6(a5)		;Period
Super:
	move.w	20(a6),d0		;DMA Bit
	or.w	d0,DmaCon		;einodern
NoNote:
	rts

;--------------------------------------------------------------------

	DSEG

ArpeTable:
	dc.l	Arpe1
	dc.l	Arpe2
	dc.l	Arpe3
	dc.l	Arpe2
	dc.l	Arpe1


ChannelData0:
	ds.l	5,0			;Daten für Note
	dc.w	1			;DMA - Bit
ChannelData1:	
	ds.l	5,0			;u.s.w
	dc.w	2
ChannelData2:	
	ds.l	5,0			;etc.
	dc.w	4
ChannelData3:	
	ds.l	5,0			;a.s.o
	dc.w	8
Instruments:
	ds.l	15,0			;Zeiger auf die 15 Instrumente
PosCounter:
	dc.l	0			;Offset ins Pattern
TrackPos:
	dc.l	0			;Position Counter
Timer:
	dc.w	0			;Zähler 0-5
DmaCon:
	dc.w	0			;Zwischenspeicher für DmaCon
AnzPat:
	dc.w	1			;Anzahl Positions
PlayLock:
	dc.w	0			;Flag fuer 'Sound erlaubt'
DelayValue:
	dc.w	14565
SongPointer:
	dc.l	0
Lock:
	dc.l	0
SongLaenge:
	dc.l	0
CiaaBase:
	dc.l	0
DosBase:
	dc.l	0
FileInfo:
	dc.l	0

InterruptName:
	dc.b	"Chris's SoundInterrupt",0
CiaaResource:
	dc.b	'ciaa.resource',0
DosLib:
	dc.b	'dos.library',0
FileName:
	dc.b	'sound.data',0
	even
	dcb.w	30,1076
NoteTable:
	dc.w	1076,1016,960,906,856,808,762,720,678,640,604,570
	dc.w	538,508,480,453,428,404,381,360,339,320,302,285
	dc.w	269,254,240,226,214,202,190,180,170,160,151,143
	dc.w	135,127,120,113
	dcb.w	30,113

