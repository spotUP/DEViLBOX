
;*****************************************************************
;*  The Synthesis 4.2 ObjectReplayer Offsets - 22.April 1992     *
;*---------------------------------------------------------------*
;*  $04 = "h.Pc" Check Mark (Use this to check Modules)          *
;*  $08 = InitStuff  (Songnumber in D0)                          *
;*  $0c = ReplaySong (Call By VBI of Rwait)                      *
;*  $12 = Stop Muzak (DMA off)                                   *
;*  $16 = Insert Syntheffect     Channel in D1.L / Note in D0.L  *
;*---------------------------------------------------------------*
;*  $1c = Voice 0 On/Off |     All this Flags are in Byte Size   *
;*  $1d = Voice 1 On/Off |__   Use this Offsets with this way :  *
;*  $1e = Voice 2 On/Off  __ ------>>> $00=Off / $ff=On          *
;*  $1f = Voice 3 On/Off |     To Switch On / Off Some Channels  *
;*  Use This Feature Before you go on to make an SynthEffect !!  *
;*  $20 = SyncMark                                               *
;*---------------------------------------------------------------*
;*       Replayer Coding & Example Source By Carsten Herbst      *
;*          Copyright 1992 The Silicon Audio Department         *
;*****************************************************************

RasterStart:	lea	Replayer(pc),A6 ;Replayer Adress to A6
		cmp.l	#"h.Pc",4(A6)	;Check ModuleReplayer
		bne	ModulError	;No Replayer = Exit
		bset	#1,$bfe001	;Filter Off
		moveq	#0,d0		;Select Song Nr. 00
		jsr	$08(A6)		;Init the SongData
Loop:		cmp.b	#$c0,$dff006	;Wait For RasterLine $c0
		bne	loop		;Loop Until $c0 is Reached
		move.w	#$0f0f,$dff180  ;Show RasterTime
		jsr	$0c(A6)		;Play Muzak
		move.w	#$0000,$dff180  ;Show Rastetime (Final)
		cmp.b	#$ff,$20(a6)	;Wait For SyncMark
		beq	SyncExit	;Loop Until SyncMark =$ff
		btst	#6,$bfe001	;Wait for left MouseButton
		bne	loop		;Loop Until Pressed
SyncExit:	bclr	#1,$bfe001	;Filter On
		jsr	$12(A6)		;Stop Muzak
ModulError:	rts
;------------------------------------------------------------------
Install_VBI:	cmp.l	#"h.Pc",Replayer+$4 ;Check ModuleReplayer
		bne	VBIerror	    ;No Replayer = Exit
		Bset	#1,$bfe001
		Moveq	#0,d0
		jsr	Replayer+$08
		move.w	#$4000,$dff09a
		move.l	$6c.w,VB_oldint+2
		move.l	#VB_int,$6c.w
		move.w	#$780,$dff09c
		move.w	#$780,$dff09a
		move.w	#$c000,$dff09a
		moveq	#0,d0
VBIerror:	rts
Remove_VBI:	move.w	#$4000,$dff09a
		move.l	VB_oldint+2,$6c.w
		move.w	#$c000,$dff09a
		jsr	Replayer+$12
		Bclr	#1,$bfe001
		rts
VB_int:		btst	#5,$dff01f
		beq.s	VB_oldint
		movem.l	d0-d7/a0-a6,-(sp)
		Jsr	Replayer+$0c
		movem.l	(sp)+,d0-d7/a0-a6
VB_oldint:	jmp	0
;------------------------------------------------------------------
SynthFxExample:	lea	Replayer(pc),a6 ;Replayer Adress to A6
		Move.b	#$00,$1f(a6)    ;Switch Voice 3 Off
		move.l	#$03,d1		;Voice 3 For SynthFx
		move.l	#$d4030000,d0	;Note Nr.$d4,Instr.3,No Fx
		jsr	$16(A6)		;Start the Effect
		;WaitRoutine		;Wait Some VBI's Before you
		move.b	#$ff,$1f(A6)    ;Switch Voice 3 On
		rts
;------------------------------------------------------------------
Replayer:
incbin	"Synthesis 4.2 Workdisk:Modules/Replay Test Modul"
