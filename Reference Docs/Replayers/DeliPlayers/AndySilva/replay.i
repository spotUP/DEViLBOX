********************************************
** A short collection of Assembler-Macros **
**      for different replay-usages       **
**                                        **
**         by Andy Silva in 1994          **
********************************************

	IFND	SILVA_REPLAY_I
SILVA_REPLAY_I SET 1



* CIAa InterruptHandler

PlayCIA	MACRO
	tst.w	d1
	beq.b	pla_1
	move.w	d1,delayvalue
pla_1	movem.l	d1-d7/a0-a6,-(a7)
	lea	CiaaResource(pc),a1	;'ciaa.resource'
	move.l	4.w,a6
	moveq	#0,d0			;Version egal
	jsr	-498(A6)		;OpenResource()
	move.l	d0,CiaaBase		;Resource Base speichern
	move.l	d0,a6
	lea	Interrupt(pc),a1	;Sound Interupt Structure
	moveq	#0,d0			;TimerA
	jsr	-6(A6)			;installieren
	tst.l	d0
	bne.s	nixCIAA
	move.b	#%10000001,$bfee01	;Timer starten
	lea	DelayValue(pc),a1
	move.b	1(a1),$bfe401		;Timer A low
	move.b	0(a1),$bfe501		;Timer A high

gfhj	btst	#6,$bfe001
	bne.s	gfhj

	move.l	CiaaBase(pc),a6		;Zeiger auf Ciaa Resource
	lea	Interrupt(pc),a1	;Zeiger auf Int. Strukture
	moveq	#0,d0			;Timer A
	jsr	-12(A6)			;Interupt entfernen
	moveq	#0,d0			;Alles Ok	
nixCIAA	movem.l	(a7)+,d1-d7/a0-a6
	bra	plc_x

Interrupt:
	dc.l	0			;letzter Node
	dc.l	0			;nächster Node
	dc.b	2			;Node Type = Interrupt
	dc.b	0 			;Priorität
	dc.l	InterruptName		;Name
	dc.l	0			;Zeiger auf Daten
	dc.l	IntCode			;Interrupt Routine
DelayValue:
	dc.w	14209
CiaaBase:
	dc.l	0
InterruptName:
	dc.b	"VP's CIAA - UniRIP",0
CiaaResource:
	dc.b	'ciaa.resource',0
	even

IntCode:
	movem.l	d1-d7/a0-a6,-(a7)
	jsr	\1
	moveq	#0,d0			;kein Fehler
	movem.l	(a7)+,d1-d7/a0-a6
	rts
plc_x
	ENDM


* Vertical-Blanking Wait'n'Call

PlayVB	MACRO
plv_lp	MOVE.L	$DFF004,D0
	AND.L	#$1FF00,D0
	CMP.L	#$8000,D0
	BNE.S	plv_lp
	jsr	\1
	btst	#6,$bfe001
	bne.b	plv_lp
	ENDM


	ENDC
