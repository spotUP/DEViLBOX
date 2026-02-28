**
** Hippel-TFMX normal replay - 6 sample version 1.0
** converted to source by Vampire / PseudoDOS Group
**
** call h_initsmpl (a0=modadr) to initialize the sample-addresses!!
** call h_control (d0=nr) to start subsong / nr is 1-max
** call h_replay each vbi to play the song
** call h_stop to stop audio-dma (nooo!!!)
**

   	moveq   #-1,d0			; this should return an error
   	rts   				; in case someone tried to run it
	dc.b	'DELIPLAY'		; idetifyer
	dc.w	7	 	; version
	dc.w	1			; userversion
	dc.l 	name			; ^playername (string max. 15 chars)
	dc.l	autor			; ^creator (NULL-terminated string)
	dc.l	h_Chck			; ChkFormat
	dc.l	0			; ExtLoad (load additional files)
	dc.l	h_replay		; Interrupt routine
	dc.l	h_stop			; Stop (clear Patterncounter, restart from begin)
	dc.l	0			; player specific configroutine
	dc.l	0			; user-configroutine
	dc.l	0			; initialisize player
	dc.l	h_stop			; player clean up
	dc.l	h_initsmpl		; InitSnd (soundinitialisation routine)
	dc.l	h_stop			; RemSnd (remove sound)
	dc.l	0			; StartSnd (start interrupt, usually NULL !!! )
	dc.l	0			; StopSnd (stop interrupt, usually NULL !!! )
	dc.l	0			; Volume
	dc.l	0			; Balance
	dc.l	0			; Faster (incease playspeed)
	dc.l	0			; Slower (decrease playspeed)	
	dc.l	0			; NextPatt (jump to next pattern)
	dc.l	0			; PrevPatt (jump to previous pattern)
	dc.l	0			; NextSong (play next subsong)
	dc.l	0			; PrevSong (play previous subsong)	

name	dc.b	"HippelTFMX",0
autor	dc.b	"adapted by Vampire / PseudoDOS        "
	dc.b	">>TFMX in HIPP ändern und ab da saven!",0

	;------ When a subroutine in the player is called A5 will contain
	;------ the pointer to the DeliTrackerGlobals, the only exeption is 
	;------ of course the interrupt routine.
	;------ The interruptroutine is called every 1/50 sec (via timerint).

	;------ D7 will contain an ID number when ChkFormat is called, supply 
	;------ THIS ID in dtg_ChkFlag if the format is ok else noting.
	;------ This is the only call which is allowed to change dtg_ChkFlag! 

	;------ SetVolume usualy only copy's the values dtg_Volume, dtg_SndLBal
	;------ and dtg_SndRBal to an internal buffer. The interrupt code has 
	;------ access to this buffer and can set the volume correct. 

	;------ For not existing functions supply a NULL-pointer. 
	;------ ExtLoad: routine for loading additional files (instruments)

	;------ Note: the Player can consist of more Hunks. That means you
	;------ can seperate CHIP DATA form CODE (and you should do this!). 
	;------ Hint: The players are loaded via LoadSeg() so you may crunch 
	;------ them with TurboImploder (Fish #422) using the explode.library.

;---------------------------- Global Variables ------------------------------

* STRUCTURE DeliTrackerGlobals,0

*	APTR	dtg_ReqBase		; librarybase don't CloseLibrary()
*	APTR	dtg_DOSBase		; librarybase "
*	APTR	dtg_IntuitionBase	; librarybase "
*	APTR	dtg_GfxBase		; librarybase "

*	APTR	dtg_ChkData		; pointer to the modules to be checked
*	ULONG	dtg_ChkSize		; size of the Module
	
*	APTR	dtg_FileArrayPtr	; 
*	APTR	dtg_WorkPathPtr		;
*	STRUCT	dtg_WorkPath,162	; 
	
*	UWORD	dtg_ChkFlag		; 0 if not a Module
*	UWORD	dtg_SndNum		; current sound number
*	UWORD	dtg_SndVol		; volume (ranging from 0 to 63)
*	UWORD	dtg_SndLBal		; left volume (ranging from 0 to 63)
*	UWORD	dtg_SndRBal		; right volume (ranging from 0 to 63)
*	UWORD	dtg_LED			; filter (0 if the LED is off)
*	UWORD	dtg_Timer		; timer-value for the CIA-Timers

*	FPTR	dtg_GetListData		;
*	FPTR	dtg_LoadFile		;
* 	FPTR	dtg_CopyFile		;
*	FPTR	dtg_CopyDir		;
*	FPTR	dtg_AudioAlloc		; 
*	FPTR	dtg_AudioFree		;
*	FPTR	dtg_InitInt		;
*	FPTR	dtg_RemInt		;

h_chck		move.l	10(a5),a0
		cmp.l	#"HIPP",(a0)
*		bne.s	h_chckx
		move.w	d7,$c2(a5)
h_chckx		rts

h_initsmpl	move.l	10(a5),a0
		BSET	#1,$00BFE001.L
		LEA	$0020(A0),A1	; a0 must point to module
		LEA	h_smpl2(PC),A2
		MOVE.L	A1,(A2)
		MOVE.W	4(A0),D0
		ADDQ.W	#1,D0
		ASL.W	#6,D0
		ADDA.W	D0,A1
		LEA	h_smpl3(PC),A2
		MOVE.L	A1,(A2)
		MOVE.W	6(A0),D0
		ADDQ.W	#1,D0
		ASL.W	#6,D0
		ADDA.W	D0,A1
		LEA	h_smpl1(PC),A2
		MOVE.L	A1,(A2)
		MOVEQ	#0,D0
		MOVEQ	#0,D1
		MOVE.W	8(A0),D0
		MOVE.W	$000C(A0),D1
		LEA	L_0000097A(PC),A2
		MOVE.W	D1,(A2)
		ADDQ.W	#1,D0
		MULU	D1,D0
		ADDA.W	D0,A1
		LEA	h_smpl4(PC),A2
		MOVE.L	A1,(A2)
		MOVEQ	#0,D0
		MOVE.W	$000A(A0),D0
		ADDQ.W	#1,D0
		MULU	#$000C,D0
		ADDA.W	D0,A1
		LEA	h_smplhdr(PC),A2
		MOVE.L	A1,(A2)
		MOVEQ	#0,D0
		MOVE.W	$0010(A0),D0
		ADDQ.W	#1,D0
		MULU	#6,D0
		ADDA.W	D0,A1
		LEA	h_smpl5(PC),A2
		MOVE.L	A1,(A2)
		MOVEQ	#0,D0
		MOVE.W	$0012(A0),D0
		MULU	#$001E,D0
		ADDA.W	D0,A1
		LEA	h_smpl6(PC),A2
		MOVE.L	A1,(A2)
		moveq	#1,d0
		bsr.s	h_control
		RTS	
h_stop		LEA	L_00000848(PC),A0
		MOVE.W	#1,(A0)
		MOVE.W	#$000F,$00DFF096.L
		RTS

h_control	MOVEM.L	D0-D7/A0-A6,-(A7)
		MOVEA.L	h_smplhdr(PC),A1
		ANDI.L	#$000000FF,D0
		SUBQ.L	#1,D0
		MULU	#6,D0
		ADDA.W	D0,A1
		MOVE.W	(A1)+,D0
		MOVE.W	(A1)+,D1
		LEA	L_00000844(PC),A6
		MOVE.W	(A1),(A6)+
		MOVE.W	(A1)+,(A6)+
		BSR	L_00000722
		MOVEM.L	(A7)+,D0-D7/A0-A6
		RTS

h_replay	MOVEM.L	D0-D7/A0-A6,-(A7)
		LEA	L_00000A24(PC),A5
		LEA	L_00000844(PC),A0
		TST.W	4(A0)
		BEQ.S	h_playvoices
		MOVE.W	#$000F,$00DFF096.L
		MOVEQ	#0,D0
		MOVE.W	D0,$00DFF0A8.L
		MOVE.W	D0,$00DFF0B8.L
		MOVE.W	D0,$00DFF0C8.L
		MOVE.W	D0,$00DFF0D8.L
		MOVEM.L	(A7)+,D0-D7/A0-A6
		RTS	
h_playvoices	SUBQ.W	#1,(A0)+
		BNE.S	h_playvoices2
		MOVE.W	(A0),-(A0)
		MOVEQ	#0,D5
		MOVEQ	#6,D6
		LEA	$00DFF000.L,A4
		LEA	h_voc1(PC),A0
		BSR	h_effects
		LEA	h_voc2(PC),A0
		BSR	h_effects
		LEA	h_voc3(PC),A0
		BSR	h_effects
		LEA	h_voc4(PC),A0
		BSR	h_effects
h_playvoices2	MOVE.W	D5,(A5)
		MOVEQ	#6,D6
		LEA	h_voc1(PC),A0
		BSR	h_effects2
		MOVE.L	D0,$00DFF0A6.L
		LEA	h_voc2(PC),A0
		BSR	h_effects2
		MOVE.L	D0,$00DFF0B6.L
		LEA	h_voc3(PC),A0
		BSR	h_effects2
		MOVE.L	D0,$00DFF0C6.L
		LEA	h_voc4(PC),A0
		BSR	h_effects2
		MOVE.L	D0,$00DFF0D6.L
		MOVE.W	(A5),D7
		ORI.W	#-$8000,D7
		MOVE.W	h_voc1dat1(PC),D0
		MOVEA.L	h_voc1dat2(PC),A0
		MOVE.W	h_voc2dat1(PC),D1
		MOVEA.L	h_voc2dat2(PC),A1
		MOVE.W	h_voc3dat1(PC),D2
		MOVEA.L	h_voc3dat2(PC),A2
		MOVE.W	h_voc4dat1(PC),D3
		MOVEA.L	h_voc4dat2(PC),A3
		LEA	$00DFF000.L,A6
		BSR.S	h_wait1
		MOVE.W	D7,$0096(A6)
		BSR.S	h_wait1
		MOVE.L	A0,$00A0(A6)
		MOVE.W	D0,$00A4(A6)
		MOVE.L	A1,$00B0(A6)
		MOVE.W	D1,$00B4(A6)
		MOVE.L	A2,$00C0(A6)
		MOVE.W	D2,$00C4(A6)
		MOVE.L	A3,$00D0(A6)
		MOVE.W	D3,$00D4(A6)
		MOVEM.L	(A7)+,D0-D7/A0-A6
		RTS	
h_wait1		MOVE.B	6(A6),D6
h_wait2		CMP.B	6(A6),D6
		BEQ.S	h_wait2
		RTS	
h_effects	MOVE.W	L_0000097A(PC),D7
		MOVEA.L	$0022(A0),A1
		ADDA.W	$0028(A0),A1
		MOVE.B	(A1),D0
		ANDI.W	#$007F,D0
		CMPI.W	#1,D0
		BEQ.S	L_00000220
		CMP.W	$0028(A0),D7
		BNE.S	L_0000026C
L_00000220	MOVEA.L	$0034(A0),A3
		MOVEA.L	(A0),A2
		ADDA.L	4(A0),A2
		CMPA.L	A3,A2
		BNE.S	L_00000234
		MOVE.L	D5,4(A0)
		MOVEA.L	(A0),A2
L_00000234	MOVEQ	#0,D1
		MOVE.B	(A2),D1
		MOVE.B	1(A2),$002C(A0)
		MOVE.B	2(A2),$0016(A0)
		CMPI.B	#-$0080,2(A2)
		BNE.S	L_00000252
		LEA	L_00000848(PC),A2
		ST 	(A2)
L_00000252	MOVE.W	D5,$0028(A0)
		MULU	D7,D1
		MOVEA.L	h_smpl1(PC),A3
		ADDA.L	D1,A3
		MOVE.L	A3,$0022(A0)
		ADDI.L	#$0000000C,4(A0)
		MOVEA.L	A3,A1
L_0000026C	MOVE.B	(A1)+,D0
		MOVE.B	D0,D1
		ANDI.W	#$007F,D1
		TST.W	D1
		BEQ	L_000002FE
		MOVE.L	D5,$0038(A0)
		MOVE.B	D1,8(A0)
		MOVEA.L	A1,A3
		TST.W	$0028(A0)
		BNE.S	L_0000028C
		ADDA.W	D7,A3
L_0000028C	MOVE.B	-2(A3),$001F(A0)
		MOVE.B	(A1),9(A0)
		TST.B	D0
		BMI.S	L_000002FE
		MOVE.B	(A1),D1
		ANDI.W	#$001F,D1
		ADD.B	$0016(A0),D1
		MOVEA.L	h_smpl3(PC),A2
		LSL.W	D6,D1
		ADDA.W	D1,A2
		MOVE.L	D5,$000E(A0)
		MOVE.B	(A2),$0017(A0)
		MOVE.B	(A2)+,$0018(A0)
		MOVEQ	#0,D1
		MOVE.B	(A2)+,D1
		MOVE.B	(A2)+,$001B(A0)
		MOVEQ	#0,D0
		MOVE.B	#$0040,$002E(A0)
		MOVE.B	(A2)+,D0
		MOVE.B	D0,$001C(A0)
		MOVE.B	D0,$001D(A0)
		MOVE.B	(A2)+,$001E(A0)
		MOVE.L	A2,$000A(A0)
		MOVEA.L	h_smpl2(PC),A2
		BTST	#6,9(A0)
		BEQ.S	L_000002EA
		MOVE.B	$001F(A0),D1
L_000002EA	LSL.W	D6,D1
		ADDA.W	D1,A2
		MOVE.L	A2,$0012(A0)
		MOVE.L	D5,$0030(A0)
		MOVE.B	D5,$001A(A0)
		MOVE.B	D5,$0019(A0)
L_000002FE	ADDQ.W	#2,$0028(A0)
		RTS	
h_effects2	MOVEQ	#0,D7
L_00000306	TST.B	$001A(A0)
		BEQ.S	L_00000314
		SUBQ.B	#1,$001A(A0)
		BRA	L_000005F8
L_00000314	MOVEA.L	$0012(A0),A1
		ADDA.L	$0030(A0),A1
		MOVE.B	(A1),D0
		CMPI.B	#-$001F,D0
		BEQ	L_000005F8
		CMPI.B	#-$0020,D0
		BNE.S	L_0000033E
		MOVEQ	#0,D0
		MOVE.B	1(A1),D0
		MOVE.L	D0,$0030(A0)
		MOVEA.L	$0012(A0),A1
		ADDA.L	D0,A1
		MOVE.B	(A1),D0
L_0000033E	CMPI.B	#-$001E,D0
		BNE.S	L_000003A0
		ST 	$0026(A0)
		MOVE.W	$0020(A0),D1
		OR.W	D1,(A5)
		MOVE.W	D1,$00DFF096.L
		MOVEQ	#0,D1
		MOVE.B	1(A1),D1
		MOVEA.L	h_smpl5(PC),A4
		MOVE.W	D1,D3
		LSL.W	#5,D1
		ADD.W	D3,D3
		SUB.W	D3,D1
		ADDA.W	D1,A4
		MOVEA.L	$003C(A0),A3
		MOVEA.L	$0012(A4),A2
		ADDA.L	h_smpl6(PC),A2
		MOVE.L	A2,(A3)
		MOVEQ	#0,D1
		MOVE.W	$001A(A4),D1
		ADDA.L	D1,A2
		MOVE.L	A2,$0044(A0)
		MOVE.W	$0016(A4),4(A3)
		MOVE.L	$001A(A4),$0040(A0)
		MOVE.L	D7,$000E(A0)
		MOVE.B	#1,$0017(A0)
		ADDQ.L	#2,$0030(A0)
		BRA	L_000005E8
L_000003A0	CMPI.B	#-$0017,D0
		BNE	L_00000430
		ST 	$0026(A0)
		MOVE.W	$0020(A0),D1
		OR.W	D1,(A5)
		MOVE.W	D1,$00DFF096.L
		MOVEQ	#0,D1
		MOVE.B	1(A1),D1
		MOVEA.L	h_smpl5(PC),A4
		MOVE.W	D1,D3
		LSL.W	#5,D1
		ADD.W	D3,D3
		SUB.W	D3,D1
		ADDA.W	D1,A4
		MOVEA.L	$0012(A4),A2
		ADDA.L	h_smpl6(PC),A2
		CMPI.L	#$53534D50,(A2)
		BNE.S	L_00000428
		MOVEQ	#0,D0
		MOVE.W	4(A2),D0
		MOVE.W	6(A2),D2
		LSL.W	#2,D2
		MULU	#$0018,D0
		ADDQ.L	#8,A2
		MOVEA.L	A2,A4
		ADDA.L	D0,A2
		ADDA.W	D2,A2
		MOVEQ	#0,D1
		MOVE.B	2(A1),D1
		MULU	#$0018,D1
		ADDA.L	D1,A4
		MOVE.L	(A4)+,D1
		MOVE.L	(A4)+,D2
		SUB.L	D1,D2
		LSR.L	#1,D2
		ADD.L	A2,D1
		MOVEA.L	$003C(A0),A3
		MOVE.L	D1,(A3)
		MOVE.W	D2,4(A3)
		MOVE.L	D1,$0044(A0)
		MOVEQ	#1,D1
		MOVE.L	D1,$0040(A0)
		MOVE.L	D7,$000E(A0)
		MOVE.B	#1,$0017(A0)
L_00000428	ADDQ.L	#3,$0030(A0)
		BRA	L_000005E8
L_00000430	CMPI.B	#-$001B,D0
		BNE.S	L_0000049E
		MOVE.W	$0020(A0),D1
		OR.W	D1,(A5)
		MOVE.W	D1,$00DFF096.L
		MOVEQ	#0,D1
		MOVE.B	1(A1),D1
		MOVEA.L	h_smpl5(PC),A4
		MOVEQ	#0,D2
		MOVE.B	2(A1),D2
		MOVE.W	D1,D3
		LSL.W	#5,D1
		ADD.W	D3,D3
		SUB.W	D3,D1
		ADDA.W	D1,A4
		MOVEA.L	$003C(A0),A3
		MOVEA.L	$0012(A4),A2
		ADDA.L	h_smpl6(PC),A2
		MOVEQ	#0,D1
		MOVE.W	$001C(A4),D1
		MULU	D2,D1
		ADDA.L	D1,A2
		MOVE.L	A2,(A3)
		MOVEQ	#0,D1
		MOVE.W	$001A(A4),D1
		ADDA.L	D1,A2
		MOVE.L	A2,$0044(A0)
		MOVE.W	$001C(A4),4(A3)
		MOVE.L	$001A(A4),$0040(A0)
		MOVE.L	D7,$000E(A0)
		MOVE.B	#1,$0017(A0)
		ADDQ.L	#3,$0030(A0)
		BRA	L_000005E8
L_0000049E	CMPI.B	#-$001C,D0
		BNE.S	L_000004E6
		MOVEQ	#0,D1
		MOVE.B	1(A1),D1
		MOVEA.L	h_smpl5(PC),A4
		MOVE.W	D1,D3
		LSL.W	#5,D1
		ADD.W	D3,D3
		SUB.W	D3,D1
		ADDA.W	D1,A4
		MOVEA.L	$003C(A0),A3
		MOVEA.L	$0012(A4),A2
		ADDA.L	h_smpl6(PC),A2
		MOVE.L	A2,(A3)
		MOVEQ	#0,D1
		MOVE.W	$001A(A4),D1
		ADDA.L	D1,A2
		MOVE.L	A2,$0044(A0)
		MOVE.W	$0016(A4),4(A3)
		MOVE.L	$001A(A4),$0040(A0)
		ADDQ.L	#2,$0030(A0)
		BRA	L_000005E8
L_000004E6	CMPI.B	#-$001A,D0
		BNE.S	L_00000554
		CMPI.B	#-$001B,D0
		BNE.S	L_0000049E
		MOVE.W	$0020(A0),D1
		OR.W	D1,(A5)
		MOVEQ	#0,D1
		MOVE.B	1(A1),D1
		MOVEA.L	h_smpl5(PC),A4
		MOVEQ	#0,D2
		MOVE.B	2(A1),D2
		MOVE.W	D1,D3
		LSL.W	#5,D1
		ADD.W	D3,D3
		SUB.W	D3,D1
		ADDA.W	D1,A4
		MOVEA.L	$003C(A0),A3
		MOVEA.L	$0012(A4),A2
		ADDA.L	h_smpl6(PC),A2
		MOVEQ	#0,D1
		MOVE.W	$001C(A4),D1
		MULU	D2,D1
		ADDA.L	D1,A2
		MOVE.L	A2,(A3)
		MOVEQ	#0,D1
		MOVE.W	$001A(A4),D1
		ADDA.L	D1,A2
		MOVE.L	A2,$0044(A0)
		MOVE.W	$001C(A4),4(A3)
		MOVE.L	$001A(A4),$0040(A0)
		MOVE.L	D7,$000E(A0)
		MOVE.B	#1,$0017(A0)
		ADDQ.L	#3,$0030(A0)
		BRA	L_000005E8
L_00000554	CMPI.B	#-$0019,D0
		BNE.S	L_000005BE
		MOVEQ	#0,D1
		MOVE.B	1(A1),D1
		CMP.B	$0026(A0),D1
		BEQ	L_000005AC
		MOVE.B	D1,$0026(A0)
		MOVE.W	$0020(A0),D0
		OR.W	D0,(A5)
		MOVE.W	D0,$00DFF096.L
		MOVEA.L	h_smpl5(PC),A4
		MOVE.W	D1,D3
		LSL.W	#5,D1
		ADD.W	D3,D3
		SUB.W	D3,D1
		ADDA.W	D1,A4
		MOVEA.L	$003C(A0),A3
		MOVEA.L	$0012(A4),A2
		ADDA.L	h_smpl6(PC),A2
		MOVE.L	A2,(A3)
		MOVEQ	#0,D1
		MOVE.W	$001A(A4),D1
		ADDA.L	D1,A2
		MOVE.L	A2,$0044(A0)
		MOVE.W	$0016(A4),4(A3)
		MOVE.L	$001A(A4),$0040(A0)
L_000005AC	MOVE.L	D7,$000E(A0)
		MOVE.B	#1,$0017(A0)
		ADDQ.L	#2,$0030(A0)
		BRA	L_000005E8
L_000005BE	CMPI.B	#-$0018,D0
		BNE.S	L_000005D2
		MOVE.B	1(A1),$001A(A0)
		ADDQ.L	#2,$0030(A0)
		BRA	L_00000306
L_000005D2	CMPI.B	#-$001D,D0
		BNE.S	L_000005E8
		ADDQ.L	#3,$0030(A0)
		MOVE.B	1(A1),$001B(A0)
		MOVE.B	2(A1),$001C(A0)
L_000005E8	MOVEA.L	$0012(A0),A1
		ADDA.L	$0030(A0),A1
		MOVE.B	(A1),$002B(A0)
		ADDQ.L	#1,$0030(A0)
L_000005F8	TST.B	$0019(A0)
		BEQ.S	L_00000604
		SUBQ.B	#1,$0019(A0)
		BRA.S	L_0000064E
L_00000604	SUBQ.B	#1,$0017(A0)
		BNE.S	L_0000064E
		MOVE.B	$0018(A0),$0017(A0)
L_00000610	MOVEA.L	$000A(A0),A1
		ADDA.L	$000E(A0),A1
		MOVE.B	(A1),D0
		CMPI.B	#-$0018,D0
		BNE.S	L_0000062C
		ADDQ.L	#2,$000E(A0)
		MOVE.B	1(A1),$0019(A0)
		BRA.S	L_000005F8
L_0000062C	CMPI.B	#-$001F,D0
		BEQ.S	L_0000064E
		CMPI.B	#-$0020,D0
		BNE.S	L_00000646
		MOVEQ	#0,D0
		MOVE.B	1(A1),D0
		SUBQ.L	#5,D0
		MOVE.L	D0,$000E(A0)
		BRA.S	L_00000610
L_00000646	MOVE.B	D0,$002D(A0)
		ADDQ.L	#1,$000E(A0)
L_0000064E	MOVE.B	$002B(A0),D0
		BMI.S	L_0000065C
		ADD.B	8(A0),D0
		ADD.B	$002C(A0),D0
L_0000065C	ANDI.W	#$007F,D0
		LEA	h_perio(PC),A1
		ADD.W	D0,D0
		MOVE.W	D0,D1
		ADDA.W	D0,A1
		MOVE.W	(A1),D0
		MOVE.B	$002E(A0),D7
		TST.B	$001E(A0)
		BEQ.S	L_0000067C
		SUBQ.B	#1,$001E(A0)
		BRA.S	L_000006D2
L_0000067C	MOVE.B	D1,D5
		MOVE.B	$001C(A0),D4
		ADD.B	D4,D4
		MOVE.B	$001D(A0),D1
		TST.B	D7
		BPL.S	L_00000692
		BTST	#0,D7
		BNE.S	L_000006B8
L_00000692	BTST	#5,D7
		BNE.S	L_000006A6
		SUB.B	$001B(A0),D1
		BCC.S	L_000006B4
		BSET	#5,D7
		MOVEQ	#0,D1
		BRA.S	L_000006B4
L_000006A6	ADD.B	$001B(A0),D1
		CMP.B	D4,D1
		BCS.S	L_000006B4
		BCLR	#5,D7
		MOVE.B	D4,D1
L_000006B4	MOVE.B	D1,$001D(A0)
L_000006B8	LSR.B	#1,D4
		SUB.B	D4,D1
		BCC.S	L_000006C2
		SUBI.W	#$0100,D1
L_000006C2	ADDI.B	#-$0060,D5
		BCS.S	L_000006D0
L_000006C8	ADD.W	D1,D1
		ADDI.B	#$0018,D5
		BCC.S	L_000006C8
L_000006D0	ADD.W	D1,D0
L_000006D2	EORI.B	#1,D7
		MOVE.B	D7,$002E(A0)
		BTST	#5,9(A0)
		BEQ.S	L_00000716
		MOVEQ	#0,D7
		MOVEQ	#0,D1
		MOVE.B	$001F(A0),D1
		TST.B	D1
		BMI.S	L_00000702
		MOVEQ	#$000B,D3
		MOVE.L	$0038(A0),D2
		LSL.L	D3,D1
		ADD.L	D1,D2
		MOVE.L	D2,$0038(A0)
		SWAP	D2
		SUB.W	D2,D0
		BRA.S	L_00000716
L_00000702	NEG.B	D1
		MOVEQ	#$000B,D3
		MOVE.L	$0038(A0),D2
		LSL.L	D3,D1
		ADD.L	D1,D2
		MOVE.L	D2,$0038(A0)
		SWAP	D2
		ADD.W	D2,D0
L_00000716	SWAP	D0
		MOVE.W	#0,D0
		MOVE.B	$002D(A0),D0
		RTS	
L_00000722	MOVEQ	#0,D5
		LEA	$00DFF000.L,A6
		MOVE.W	#$000F,$0096(A6)
		MOVE.W	#$0780,$009A(A6)
		MOVE.L	D0,D7
		MULU	#$000C,D7
		MOVE.L	D1,D6
		ADDQ.L	#1,D6
		MULU	#$000C,D6
		MOVEQ	#3,D0
		MOVEQ	#0,D3
		LEA	h_voc1(PC),A0
		LEA	L_00000826(PC),A1
		LEA	L_0000096A(PC),A2
		LEA	L_0000083E(PC),A5
L_00000758	MOVE.L	A1,$000A(A0)
		MOVE.L	A1,$0012(A0)
		MOVE.B	#1,$0017(A0)
		MOVE.W	#$0100,$0018(A0)
		MOVE.L	D5,$000E(A0)
		MOVE.L	D5,$001A(A0)
		MOVE.W	D5,$001E(A0)
		MOVE.B	#-1,$0026(A0)
		MOVE.W	D5,$0028(A0)
		MOVE.B	D5,$002B(A0)
		MOVE.B	D5,$002D(A0)
		MOVE.L	D5,$0030(A0)
		MOVE.W	D5,$0038(A0)
		MOVE.W	D5,$0040(A0)
		MOVE.W	(A2)+,D1
		MOVE.W	(A2)+,D3
		DIVU	#3,D3
		MOVEQ	#0,D4
		BSET	D3,D4
		MOVE.W	D4,$0020(A0)
		MULU	#3,D3
		ANDI.L	#$000000FF,D3
		ANDI.L	#$000000FF,D1
		ADD.L	A6,D1
		MOVEA.L	D1,A4
		MOVE.L	A4,(A4)+
		MOVE.W	#1,(A4)+
		MOVE.W	D5,(A4)+
		MOVE.W	D5,(A4)+
		MOVE.L	D1,$003C(A0)
		MOVE.L	h_smpl4(PC),(A0)
		MOVE.L	h_smpl4(PC),$0034(A0)
		ADD.L	D6,$0034(A0)
		ADD.L	D3,$0034(A0)
		ADD.L	D7,(A0)
		ADD.L	D3,(A0)
		MOVE.L	#$0000000C,4(A0)
		MOVEA.L	(A0),A3
		MOVEQ	#0,D1
		MOVE.B	(A3),D1
		MOVE.W	L_0000097A(PC),D2
		MULU	D1,D2
		MOVEA.L	h_smpl1(PC),A4
		ADDA.L	D2,A4
		MOVE.L	A4,$0022(A0)
		MOVE.B	#2,$002A(A0)
		MOVE.B	1(A3),$002C(A0)
		MOVE.B	2(A3),$0016(A0)
		ADDA.L	#$00000048,A0
		DBRA	D0,L_00000758
		LEA	L_00000844(PC),A0
		MOVE.W	#1,(A0)
		MOVE.W	D5,4(A0)
		RTS	
L_00000826	DC.L	$1000000,$E1,0,0,0,0
L_0000083E	DC.W	0,0,0
L_00000844	DC.L	4
L_00000848	DC.W	0
h_voc1		BLK.W	33,0
h_voc1dat1	DC.W	0
h_voc1dat2	DC.L	0
h_voc2		BLK.W	33,0
h_voc2dat1	DC.W	0
h_voc2dat2	DC.L	0
h_voc3		BLK.W	33,0
h_voc3dat1	DC.W	0
h_voc3dat2	DC.L	0
h_voc4		BLK.W	33,0
h_voc4dat1	DC.W	0
h_voc4dat2	DC.L	0
L_0000096A	DC.L	$A00000,$B00003,$C00006,$D00009
L_0000097A	DC.W	$40
h_smpl1		DC.L	0
h_smpl2		DC.L	0
h_smpl3		DC.L	0
h_smpl4		DC.L	0
h_smpl5		DC.L	0
h_smpl6		DC.L	0
h_perio		DC.W	$6B0,$650,$5f4,$5A0,$54C,$500,$4B8,$474,$434,$3F8
		DC.W	$3C0,$38A,$358,$328,$2FA,$2D0,$2A6,$280,$25C,$23A
		DC.W	$21A,$1FC,$1E0,$1C5,$1AC,$194,$17D,$168,$153,$140
		DC.W	$12E,$11D,$10D,$FE,$F0,$E2,$D6,$CA,$BE,$B4,$AA,$A0
		DC.W	$97,$8F,$87,$7F,$78,$71,$71,$71,$71,$71,$71,$71,$71
		DC.W	$71,$71,$71,$71,$71,$D60,$CA0,$BE8,$B40,$A98,$A00
		DC.W	$970,$8E8,$868,$7F0,$780,$714
L_00000A24	DC.W	0
h_smplhdr	DC.L	0
