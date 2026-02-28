* SCUMM-Player by Andy Silva 1994

		incdir	"include:"
		include	"Misc/EaglePlayer.i"

		PLAYERHEADER Test_TagArray	; define start of header

	dc.b '$VER: SCUMM Player 1.0 by ANDY SILVA (March 1994)',0
	even

Test_TagArray:
	dc.l	DTP_PlayerVersion,1			; define all the tags
	dc.l	DTP_PlayerName,Test_Name		; for the player
	dc.l	DTP_Creator,Test_Creator
	dc.l	DTP_Check2,Check			; omit any unused
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,EndSnd
	dc.l	DTP_StartInt,StartInt
	dc.l	DTP_StopInt,StopInt
	dc.l	EP_Date
	dc.b	10,3
	dc.w	1994

	dc.l	TAG_DONE				; signify end of tags

*-----------------------------------------------------------------------*
*---- Playername / creatorname and textstructure for our requesters ----*
*-----------------------------------------------------------------------*
Test_Name:	dc.b	'SCUMM Player',0
Test_Creator:	dc.b	'by ANDY SILVA in 1994',0
		even

*-----------------------------------------------------------------------------*
*-- Check if the module is a TestPlayer-Module (THIS ROUTINE MUST EXIST!!!) --*
*-----------------------------------------------------------------------------*

Check:		move.l	dtg_ChkData(a5),a0
		moveq	#1,d0
		cmp.w	#$6000,4(a0)
		bne.b	c_1
		move.w	6(a0),d0
		lea	2(a0,d0.w),a0
c_1		cmp.l	#$48e77ffe,4(a0)
		bne.b	c_no
		cmp.l	#$244b2a4b,8(a0)	; song?
		beq.b	c_yes
		cmp.l	#$08800004,8(a0)	; fx?
		bne.b	c_no
c_yes		moveq	#0,d0
c_no		rts

InitPlay:
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,modadr
	move.l	dtg_AudioAlloc(a5),a0		; Function
	jmp	(a0)				; returncode is already set !

EndPlay:
	clr.l	modadr
	move.l	dtg_AudioFree(a5),a0		; Function
	jmp	(a0)

InitSnd:
	move.w	#$f,$dff096
*	lea	$dff0a0,a0
*	moveq	#31,d0
*is_lp	clr.w	(a0)+
*	dbf	d0,is_lp
	rts
EndSnd:
	move.w	#$f,$dff096
	rts


StartInt:
	movem.l	d0-a6,-(a7)
	move.l	modadr(pc),a3
	lea	tmp(pc),a0
	addq.l	#2,a3
	move.w	(a3)+,d0
	lea	(a3,d0.w),a1
	moveq	#-1,d0
	jsr	(a3)
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
nixciaa	movem.l	(a7)+,d0-a6
	rts

StopInt:
	movem.l	d0-a6,-(a7)
	move.l	CiaaBase(pc),a6		;Zeiger auf Ciaa Resource
	lea	Interrupt(pc),a1	;Zeiger auf Int. Strukture
	moveq	#0,d0			;Timer A
	jsr	-12(A6)			;Interupt entfernen
	movem.l	(a7)+,d0-a6
	move.w	#$f,$dff096
	rts

modadr	dc.l	0
tmp	blk.b	16,0

Interrupt:
	dc.l	0			;letzter Node
	dc.l	0			;nächster Node
	dc.b	2			;Node Type = Interrupt
	dc.b	0 			;Priorität
	dc.l	InterruptName		;Name
	dc.l	0			;Zeiger auf Daten
	dc.l	IntCode			;Interrupt Routine
DelayValue:
	dc.w	14565
CiaaBase:
	dc.l	0
InterruptName:
	dc.b	"Andy Silva",0
CiaaResource:
	dc.b	'ciaa.resource',0
	even
IntCode:
	movem.l	d1-d7/a0-a6,-(a7)
	lea	tmp(pc),a0
	move.l	modadr(pc),a3
	addq.l	#2,a3
	move.w	(a3)+,d0
	lea	(a3,d0.w),a1
	moveq	#%1111,d0
	jsr	(a3)
	moveq	#0,d0			;kein Fehler
	movem.l	(a7)+,d1-d7/a0-a6
	rts

	END

