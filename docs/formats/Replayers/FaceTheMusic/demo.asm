*
* Demo.asm - Aufruf der Abspielroutine von Assembler aus
*
* Dieses Sourcefile müßte so von allen gängigen Assemblern
* akzeptiert werden. Für Seka-Assembler müssen Sie die
* Lokalen Labels mit $-Zeichen (z.B. "2$") ersetzen durch
* normale Labels mit Doppelpunkt (z.B. "Label1:").
*
OldOpenLibrary	equ	-408
CloseLibrary	equ	-414
LoadSeg		equ	-150 
UnLoadSeg	equ	-156 

_SysBase	equ	4

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
*
* Programmstart
*

* dos.library öffnen:

_main:	movea.l	_SysBase,a6
	lea	DosName(pc),a1
	jsr	OldOpenLibrary(a6)
	tst.l	d0
	beq.s	2$	;dos.library konnte nicht geöffnet werden
	movea.l	d0,a6

* Abspielroutine laden:

	move.l	#PlayFTMName,d1
	jsr	LoadSeg(a6)
	move.l	d0,d7	;Segment-Pointer
	beq.s	1$	;Abspielroutine konnte nicht geladen werden

	addq.l	#1,d0	;+1
	asl.l	#2,d0	;*4
	movea.l	d0,a5	;-> Basisadresse der Sprungtabelle

* InitSound: Amiga auf achtstimmige Soundausgabe vorbereiten
* (Interruptvektoren verbiegen usw.). Zurückgegeben wird die Nummer eines
* sogenannten "Signal-Bits". Diese Bits verwendet das Amiga-Betriebssystem
* um unserem Task mitzuteilen, daß ein bestimmtes Ereignis eingetreten ist.
* Jeder Task hat 32 Bits für diesen Zweck, die aber z.T. schon vom Betriebs-
* system genutzt werden. InitSound fordert auch ein solches Bit an. Wenn
* unser Task kein freies Bit mehr hat, wird in D0 -1 zurückgegeben.
* Das SignalBit können wir verwenden, wir müssen es aber nicht. In diesem
* Beispiel speichern wir es in D6 ab, da wir es weiter unten benutzen wollen.

* Ebenfalls wird -1 in D0 zurückgegeben, wenn InitSound schon einmal
* aufgerufen wurde (z.B. von einem anderen Task), und hinterher vergessen
* wurde, InitSound wieder mit RestoreSound rückgängig zu machen. Das soll
* verhindern, daß die Abspielroutine zweimal gleichzeitig läuft, was ja
* u.U. recht merkwürdig klingen könnte.

* Wichtig: InitSound braucht nur einmal, und zwar am Programmanfang auf-
* gerufen zu werden, also nicht jedesmal, wenn Sie ein Modul laden und
* abspielen wollen. Ebenso müssen Sie RestoreSound erst wieder auf-
* rufen, bevor Sie Ihr Programm verlassen.

	jsr	InitSound(a5)
	move.l	d0,d6	;SignalBit-Nummer holen & in D6 speichern
	bmi.s	3$	;InitSound scheiterte aus einem o.g. Grund

* Die Initialisierungsphase ist jetzt beendet. Mit der Folge
* LoadModule - StartPlay - StopPlay - FreeModule
* können Sie nun beliebig viele Songs abspielen lassen. Hier soll nur ein
* Song geladen & abgespielt werden, nämlich der Trainigs-Song:

* Song (genauer gesagt: Modul) laden: Diese Routine kehrt mit 0 in D0
* zurück, wenn irgend etwas schiefgegangen ist (z.B. zuwenig Speicher,
* File nicht gefunden, File ist kein FTM-Song, File ist zwar ein FTM-Song,
* aber kein Modul mit "eingebauten" Samples).

	move.l	#ModuleName,d0
	jsr	LoadModule(a5)
	tst.l	d0	;Erfolgreich geladen?
	beq.s	4$	;Nein

* StartPlay: Anfangen zu spielen. Es werden vier Parameter (Register D0-D3)
* übergeben:
*
* D0=Wie oft der Song gespielt werden soll (0 bedeutet endlose Wiederholung).
* D1=Nummer des Takts, bei dem angefangen werden soll, zu spielen.
* D2=Nummer des Takts, bis zu (ausschließlich) dem gespielt werden soll.
* D2=0 bedeutet, daß bis zum normalen Songende gespielt wird.
* D3=Abbruchflag: Hier sind nur die Bits 0, 1, und 2 von Bedeutung.
* Wenn Bit #0 gesetzt: Abbruch über jede Taste der Tastatur
* Wenn Bit #1 gesetzt: Abbruch über linke Maustaste
* Wenn Bit #2 gesetzt: Abbruch über Joystickknopf
* Sie können alle Bits natürlich kombinieren; wenn Sie kein Bit setzen
* (also D3=0) wird ein Abbruch nur nach Songende signalisiert.
* Im Gegensatz zum Aufruf von PlayFTM über CLI hat Bit 3 hier keine
* Bedeutung (hier würde bei gesetztem Bit #3 ein eigenes Fenster eröffnet)

	moveq	#1,d0	;Einmal spielen (0 wäre Endlosschleife)
	moveq	#0,d1	;Starten bei Takt 0
	moveq	#0,d2	;Spielen bis Song-Ende
	moveq	#%010,d3	;Warten auf linke Maustaste (Bit #1 gesetzt)
	jsr	StartPlay(a5)

* Der Song dudelt jetzt vor sich hin, ihr Programm könnte nun alles mögliche
* machen. Wir wollen jetzt aber einfach nur
*
* Beim Anspielen des Songs wird nun ständig überprüft, ob eine der
* gewünschten Abbruchbedingungen erfüllt ist. Ist das der Fall, wird das
* bei InitSound reservierte Signalbit bei unserem Task gesetzt. Wenn also
* unser Programm auf das Ende des Songs (sei es durch Abbruch über eine
* Taste oder weil er einfach zuende ist) warten soll, müssen wir es einfach
* darauf warten lassen, bis das Bit gesetzt ist. Dazu gibt es die Betriebs-
* systemroutine "Wait()" in der exec.library, der wir in D0 einen Wert
* übergeben, bei dem nur die Bits gesetzt sind, auf die wir warten wollen.
*
* Wir müßten also schreiben:
*
*	moveq	#0,d0	;D0 löschen
*	bset	d6,d0	;Bit setzen, dessen Nummer wir bei InitSound bekamen
*	movea.l	_SysBase,a6
*       jsr	Wait(a6)	;Warten
*
* Diese Methode hat den entscheidenden Vorteil, daß unser Task beim Warten
* keinerlei Rechenzeit verbraucht, die andere Tasks nutzen könnten.
* Die obigen Zeilen sind in der Routine "WaitSongOver" zusammengefaßt:

	jsr	WaitSongOver(a5)	;Warten, bis Abbruchbed. erfüllt.

* Wenn Ihr Programm aber beim Song-Dudeln noch etwas anderes machen will
* z.B. eine Grafik-Animation zeigen o.ä. möchten Sie ja nur von Zeit zu
* Zeit wissen, ob der Song zuende ist oder ob der User einen Abbruch wünscht.
* Dazu dient die Routine "AskSongOver(a5)", mit der Sie folgende Schleife
* programmieren könnten:
*
*5$	...		;Hier Ihr Programm (z.B. die Animation)
*	jsr	AskSongOver(a5)
*	tst.w	d0	;Song zuende?
*	beq.s	5$	;Nein, weiter
*
* Eine solche Schleife sollten Sie aber nie verwenden, wenn Sie NUR auf das
* Songende warten wollen und sonst nichts passieren soll: Sie verschlingt
* sehr viel Multitasking-Rechenzeit, verwenden Sie dann lieber WaitSongOver()!
*
* Allerdings: Sie BRAUCHEN weder AskSongOver noch WaitSongOver zu benutzen!
* Nach StartPlay können Sie machen was Sie wollen, z.B. auch einfach zehn
* Sekunden warten usw.
*
* Wie auch immer, die erfüllten Abbruchbedingungen reichen nicht aus, um
* den Song dann auch wirklich verstummen zu lassen: Uns wurde nur GEMELDET,
* daß die Abspielroutine meint, wir sollten jetzt aufhören zu spielen.
* Wenn Sie wirklich wollen, daß der Song aufhört müssen Sie ausdrücklich
* StopPlay aufrufen:

	jsr	StopPlay(a5)

* Modul wieder freigeben: Ihr Programm könnte danach wieder mit LoadModule
* ein neues Modul laden, es abspielen usw. In diesem Fall machen wir aber
* nichts dergleichen, sondern gehen zu RestoreSound über (Programmende).

	jsr	FreeModule(a5)

* RestoreSound: InitSound wieder rückgängig machen. Erst nach RestoreSound
* kann InitSound überhaupt erst wieder aufgerufen werden. Vergessen Sie also
* nie, am Programmende RestoreSound aufzurufen.

4$	jsr	RestoreSound(a5)

* Segment wieder aus Speicher löschen:

3$	move.l	d7,d1
	jsr	UnLoadSeg(a6)

* dos.library schließen, Programmende:

1$	movea.l	a6,a1
	movea.l	_SysBase,a6
	jsr	CloseLibrary(a6)
2$	moveq	#0,d0
	rts

DosName:	dc.b	'dos.library',0
PlayFTMName:	dc.b	'FTM:FTM-Player/PlayFTM',0
ModuleName:	dc.b	'FTM:FTM-Player/Trainings-Song',0
