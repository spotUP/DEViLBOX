**
** DeliTracker Player for (see below)
**
	incdir	"Include:"
	include	"silva/easy.i"
	include	"misc/DeliPlayer.i"

	PLAYERHEADER PlayerTagArray

PlayerTagArray
	dl	DTP_PlayerVersion,1
	dl	DTP_PlayerName,Name
	dl	DTP_Creator,Comment

	dl	DTP_Check2,Checky
	dl	DTP_InitPlayer,InitPly
	dl	DTP_InitSound,Init
	dl	DTP_Interrupt,Play
	dl	DTP_EndSound,jp_dmaoff
	dl	DTP_EndPlayer,EndPly

	dl	DTP_NextSong,NextSong
	dl	DTP_PrevSong,PrevSong
	dl	DTP_Volume,SetVol

	dl	TAG_DONE

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Name	db	"Jason Page",0
Comment	db	"Andrew Braybrook & Jason Page,",10
	db	"adapted by Andy Silva",0

	db	'$VER: a player for the famous DeliTracker',0
	even

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Checky:
	moveq	#-1,d0
	move.l	dtg_ChkData(a5),a0
	cmp.w	#$0002,(a0)
	beq.b	c_1
	cmp.w	#$8002,(a0)
	bne.b	c_rts
c_1	btst	#0,3(a0)
	bne.b	c_rts
	move.w	4(a0),d1
	btst	#0,d1
	bne.b	c_rts
	tst.w	(a0,d1.w)
	bne.b	c_rts
	move.w	$30(a0),d0
	lea	2(a0),a1
	moveq	#22,d1
c_lp	tst.w	(a1)
	beq.b	c_rts
	btst	#0,1(a1)
	bne.b	c_rts
	cmp.w	(a1)+,d0
	ble.b	c_rts
	dbf	d1,c_lp
	move.l	a0,data
	moveq	#0,d0
c_rts	rts

****

InitPly
	move.l	data(pc),a0
	moveq	#0,d0
	clr.w	songnr
	bsr	jp_init
	move.l	(dtg_AudioAlloc,a5),a0
	jsr	(a0)
	tst.l	d0
	rts

EndPly
	bsr	jp_cleanup
	move.l	(dtg_AudioFree,a5),a0	; free audio channels
	jsr	(a0)
	rts

****

data	dc.l	0
songnr	dc.w	0
songs	dc.w	100
allow	dc.w	0

Init:
	pushm	d1-a6
	clr.w	allow
	bsr	SetVol
	move.w	songnr(pc),d0
	bsr	jp_super
	move.w	#1,allow
	popm	d1-a6
	rts

Play:
	pushm	d1-a6
	tst.w	allow
	beq.b	p_rts
	bsr	jp_play
p_rts	popm	d1-a6
	rts

NextSong:
	addq.w	#1,songnr
	move.w	songnr(pc),d0
	cmp.w	songs(pc),d0
	ble.b	Init
	clr.w	songnr
	bra.b	Init
PrevSong:
	subq.w	#1,songnr
	bge.b	Init
	clr.w	songnr
	bra.b	Init

SetVol:
	move.w	dtg_SndVol(a5),d0
	add.w	d0,d0
	bra	jp_SetVol

*	move.w	#$0000,d0	; pos.b*$10+nr.b, nr may be 0 to $f
*	jsr	jp_subsong	;                 pos may be 0 to $ff

*	move.w	#-1,d0		; destvolume 0 to $80, -1 = max
*	moveq	#-1,d1		; speed 1 to ?, -1 = immediate
*	jsr	jp_fade

*	move.l	#$00ff0020,d0	; fx1nr.w*$10000+fx2nr.w ($ff = none)
*	move.l	#$00ff00ff,d1	; fx3nr.w*$10000+fx4nr.w
*	jsr	jp_fx		; This func can start 4 effects together!

*	moveq	#7,d0		; exotic function, ehh?
*	jsr	jp_setspeed


**************************************************************************
** 'JasonPage' Player - ripped (from UridiumII) and fixed by Andy Silva **
**************************************************************************

** Does NOT work with those very old musicdatas from Paradroid!

	include	"exec/types.i"

 STRUCTURE JPHeader,0			; start
	UWORD	jph_flags
	UWORD	jph_SmpLenghts		; offset from start
	UWORD	jph_tab1
	UWORD	jph_tab2
	UWORD	jph_Speeds
	UWORD	jph_LoopInfo
	UWORD	jph_1aOffs
	UWORD	jph_2aOffs
	UWORD	jph_3aOffs
	UWORD	jph_4aOffs
	UWORD	jph_1bStart
	UWORD	jph_2bStart
	UWORD	jph_3bStart
	UWORD	jph_4bStart
	UWORD	jph_1aData
	UWORD	jph_2aData
	UWORD	jph_3aData
	UWORD	jph_4aData
	UWORD	jph_1bEnd
	UWORD	jph_2bEnd
	UWORD	jph_3bEnd
	UWORD	jph_4bEnd
	UWORD	jph_TrackOffsets
	UWORD	jph_TrackData
	UWORD	jph_Len		; in Modules this points to the Samples
	UWORD	jph_Unknown	; a zero word
	LABEL	jph_SizeOf

 STRUCTURE JPBuffer,0
	APTR	jpb_a		; 9c6 .
	APTR	jpb_Song	; 9ca ..
	APTR	jpb_b		; 9ce
	APTR	jpb_c		; 9d2
	APTR	jpb_tab1	; 9d6 ..
	APTR	jpb_tab2	; 9da ..
	APTR	jpb_Speeds	; 9de .. (one for each subsong)
	APTR	jpb_LoopInfo	; 9e2 ..
	APTR	jpb_TrackOffsets ; 9e6 ..
	APTR	jpb_Tracks	; 9ea ..
	APTR	jpb_1aOffs	; 9ee ..
	APTR	jpb_2aOffs	; 9f2 ..
	APTR	jpb_3aOffs	; 9f6 ..
	APTR	jpb_4aOffs	; 9fa ..
	APTR	jpb_1bStart	; 9fe ..
	APTR	jpb_2bStart	; a02 ..
	APTR	jpb_3bStart	; a06 ..
	APTR	jpb_4bStart	; a0a ..
	APTR	jpb_1aData	; a0e ..
	APTR	jpb_2aData	; a12 ..
	APTR	jpb_3aData	; a16 ..
	APTR	jpb_4aData	; a1a ..
	APTR	jpb_1bEnd	; a1e ..
	APTR	jpb_2bEnd	; a22 ..
	APTR	jpb_3bEnd	; a26 ..
	APTR	jpb_4bEnd	; a2a ..
	APTR	jpb_SmpTab	; a2e ..
	APTR	jpb_Samples	; a32 ..
	APTR	jpb_1aNow	; a36 ..
	APTR	jpb_2aNow	; a3a ..
	APTR	jpb_3aNow	; a3e ..
	APTR	jpb_4aNow	; a42 ..
	UWORD	jpb_NumSamples	; a46 .
	UWORD	jpb_d		; a48 ..
	UWORD	jpb_e		; a4a ..
	UWORD	jpb_f		; a4c ..
	UWORD	jpb_g		; a4e .
	UWORD	jpb_h		; a50 .
	UWORD	jpb_i		; a52 .
	UWORD	jpb_j		; a54 ..
	UBYTE	jpb_k		; a56 ..
	UBYTE	jpb_ka		; a57 ..
	UBYTE	jpb_l		; a58 ..
	UBYTE	jpb_la		; a59 ..
	UWORD	jpb_SpeedCount	; a5a ..
	UWORD	jpb_Speed	; a5c ..
	APTR	jpb_Slot1Ptr	; a5e .
	APTR	jpb_Slot2Ptr	; a62 .
	APTR	jpb_Slot3Ptr	; a66 .
	APTR	jpb_Slot4Ptr	; a6a .
	STRUCT	jpb_Slot1,$22	; a6e .
	STRUCT	jpb_Slot2,$22	; a90 .
	STRUCT	jpb_Slot3,$22	; ab2 .
	STRUCT	jpb_Slot4,$22	; ad4 .
	STRUCT	jpb_Tmp1,$5c	; af6 ..
	STRUCT	jpb_Tmp2,$5c	;     ..
	STRUCT	jpb_Tmp3,$5c	;     ..
	STRUCT	jpb_Tmp4,$5c	;     ..
	LABEL	jpb_Size

jp_init:

;a0	;*Patterns
;d0	;*Samples, the Samples are expected BEHIND Patterns if d0 is NULL

	; notice: 'BEHIND patterns' means that you MUST calculate their
	;	  proper lenght (see jp_init).
	;	  If you rip you will often find the samples before the
	;         patterns or the patterns are in fastram.
	;	  You may save the samples separately or behind the
	;         patterns. If you save with samples before the
	;	  patterns you must somehow get both addresses when
	;	  loading them into a player! (Don't ask how...)
	;      -> If you rip with a freezer and memory is not modified,
	;	  you may read the address of the samples from some
	;	  relocated entrys at the end of the patterns. (see below)

	MOVEM.L	d2/d3/A2/A3/a6,-(SP)
	lea	jp_buffer,a6
	MOVE.L	D0,(jpb_Samples,a6)
	MOVE.L	A0,(jpb_Song,a6)
	MOVEA.L	A0,A1
	MOVEA.L	A0,A2
	ADDQ.W	#2,A0
	MOVE.W	(A0)+,D0
	ADDA.W	D0,A1
	MOVE.L	A1,(jpb_SmpTab,a6)	; store *Samplelenghts
	MOVE.L	D0,-(SP)
	MOVEA.L	A2,A1
	ADDA.W	(A0)+,A1
	MOVE.L	A1,(jpb_tab1,a6)
	MOVEA.L	A2,A1
	ADDA.W	(A0)+,A1
	MOVE.L	A1,(jpb_tab2,a6)
	MOVEA.L	A2,A1
	ADDA.W	(A0)+,A1
	MOVE.L	A1,(jpb_Speeds,a6)
	MOVEA.L	A2,A1
	ADDA.W	(A0)+,A1
	MOVE.L	A1,(jpb_LoopInfo,a6)
	LEA	(jpb_1aOffs,a6),A3
	MOVE.W	#7,D1
L_3EE	MOVEA.L	A2,A1
	ADDA.W	(A0)+,A1
	MOVE.L	A1,(A3)+
	DBRA	D1,L_3EE
	LEA	(jpb_1aData,a6),A3
	MOVE.W	#7,D1
L_402	MOVEA.L	A2,A1
	ADDA.W	(A0)+,A1
	MOVE.L	A1,(A3)+
	DBRA	D1,L_402
	MOVEA.L	A2,A1
	ADDA.W	(A0)+,A1
	MOVE.L	A1,(jpb_TrackOffsets,a6)	; *Trackoffsets
	MOVEA.L	A2,A1
	ADDA.W	(A0)+,A1
	MOVE.L	A1,(jpb_Tracks,a6)	; *Tracks
	MOVE.L	(SP)+,D0	; get offset to Samplelenghts
	MOVE.W	(A0),D1		; get offset to behind Samplelnghts
	SUB.W	D0,D1		; subtract from each other
	LSR.W	#2,D1		; ...and get nr of samples by dividing /4
	MOVE.W	D1,(jpb_NumSamples,a6)	; number of samples (1 bis max)
	beq.b	L_45a
	MOVEA.L	(jpb_Song,a6),A0
	MOVEA.L	(jpb_SmpTab,a6),A1
	BSET	#7,(A0)
	beq.b	jpi_2
	move.l	a1,a2	; delocate
	move.w	d1,d3
	subq.w	#2,d3
jpd_lp	move.l	(a2),d0
	move.l	4(a2),d2
	sub.l	d0,d2
	move.l	d2,(a2)+
	dbf	d3,jpd_lp
	clr.l	(a2)
jpi_2	MOVE.L	(jpb_Samples,a6),d0
	bne.b	jpi_1
	move.l	a1,d0
	moveq	#0,d2
	move.w	d1,d2
	add.w	d2,d2
	add.w	d2,d2
	add.l	d2,d0
	move.l	d0,(jpb_Samples,a6)
jpi_1	move.l	d0,a0
	SUBQ.W	#1,D1
*	move.l	a1,$70000
L_450	MOVE.L	(A1),D2
	MOVE.L	A0,(A1)+
	ADDA.L	D2,A0
	DBRA	D1,L_450
L_45A	BSR.W	jp_dmaoff
	MOVEM.L	(SP)+,d2/d3/A2/A3/A6
	RTS

jp_super:
	movem.l	d2/d3/d7/a2/a3/a4/a6,-(a7)
	lea	jp_Buffer,a6
	move.l	jpb_1aOffs(a6),a0
	move.l	jpb_1aData(a6),a1
	move.l	jpb_LoopInfo(a6),d7
	sub.l	jpb_Speeds(a6),d7
	subq.w	#2,d7
	move.w	d0,d1
	moveq	#0,d0
jps_lp	move.w	(a0,d0.w),d3
	lea	(a1,d3.w),a2		; get startaddr
	move.l	a2,a4
	move.w	2(a0,d0.w),d3
	lea	(a1,d3.w),a3		; get endaddr
	moveq	#0,d2
jps_lp2	subq.w	#1,d1
	bmi.b	jps_2
jps_lp1	cmp.l	a2,a3
	bgt.b	jps_1
	addq.w	#2,d0
	cmp.w	d7,d0			; subsong maximum ueberschritten?
	beq.b	jps_2
	bgt.b	jps_3
	bra.b	jps_lp
jps_1	move.w	(a2)+,d4
	and.w	#$fe00,d4
	cmp.w	#$fe00,d4
	bne.b	jps_lp1
	move.l	a2,d2
	sub.l	a4,d2
	bra.b	jps_lp2
jps_3	subq.w	#2,d0
jps_2	lsl.w	#7,d2
	lsr.w	#1,d0
	or.w	d2,d0
	bsr.b	jp_subsong
jps_x	movem.l	(a7)+,d2/d3/d7/a2/a3/a4/a6
	rts

jp_subsong:
	movem.l	d2/a6,-(a7)
	lea	jp_Buffer,a6
	MOVE.W	D0,D2
	BCLR	#7,D2
	BEQ.B	L_46A
	BSR.W	L_588
L_46A	MOVE.W	#$FFFF,(jpb_j,a6)
	BTST	#6,D2
	BEQ.B	L_484
	BSR.W	L_538
	MOVE.W	D0,D2
	BMI.B	L_4C6
	BSR.W	L_4CE
	BRA.B	L_4c2

L_484	BSR.W	L_4CE
	MOVEQ	#-1,D1
	LEA	(jp_tmp1,PC),A1
	MOVEQ	#0,D7
	MOVE.W	D2,D7
	LSR.W	#7,D7
	ANDI.W	#$FFFE,D7
	LEA	(jpb_Tmp1,a6),A0
	MOVEQ	#3,D0
L_49E	MOVE.L	A1,(2,A0)
	MOVE.W	D7,($50,A0)
	CLR.W	($52,A0)
	CLR.W	($54,A0)
	CLR.W	($56,A0)
	CLR.W	($44,A0)
	MOVE.W	D1,($40,A0)
	LEA	($5C,A0),A0
	DBRA	D0,L_49E
L_4c2	BSR.W	jp_dmaoff
L_4C6	MOVE.W	D2,(jpb_j,a6)
	MOVEM.L	(a7)+,D2/a6
	RTS

L_4CE	MOVE.W	#$FFFF,(jpb_d,a6)
	ANDI.W	#$F,D0
	ADD.W	D0,D0
	MOVEA.L	(jpb_Speeds,a6),A0
	MOVE.W	(A0,D0.W),D1
	ANDI.W	#$FF,D1
	MOVE.W	D1,(jpb_Speed,a6)
	CLR.W	(jpb_SpeedCount,a6)
jp_getstarts
	MOVEA.L	(jpb_1aOffs,a6),A0	; 1
	MOVE.W	(A0,D0.W),D1
	MOVEA.L	(jpb_1aData,a6),A0
	ADDA.W	D1,A0
	MOVE.L	A0,(jpb_1aNow,a6)

	MOVEA.L	(jpb_2aOffs,a6),A0	; 2
	MOVE.W	(A0,D0.W),D1
	MOVEA.L	(jpb_2aData,a6),A0
	ADDA.W	D1,A0
	MOVE.L	A0,(jpb_2aNow,a6)

	MOVEA.L	(jpb_3aOffs,a6),A0	; 3
	MOVE.W	(A0,D0.W),D1
	MOVEA.L	(jpb_3aData,a6),A0
	ADDA.W	D1,A0
	MOVE.L	A0,(jpb_3aNow,a6)

	MOVEA.L	(jpb_4aOffs,a6),A0	; 4
	MOVE.W	(A0,D0.W),D1
	MOVEA.L	(jpb_4aData,a6),A0
	ADDA.W	D1,A0
	MOVE.L	A0,(jpb_4aNow,a6)
	RTS

L_538	LSR.W	#2,D0			; temp zurückschreiben
	ANDI.W	#%00001100,D0		; (4 slots)
	LEA	(jpb_Slot1Ptr,a6),A0
	MOVEA.L	(A0,D0.W),A0
	LEA	(jpb_Tmp1,a6),A1
	MOVEQ	#3,D0
L_54E	MOVE.W	(A0),($50,A1)
	MOVE.W	(2,A0),($52,A1)
	MOVE.W	(4,A0),(A1)
	MOVE.W	(6,A0),($56,A1)
	MOVE.L	#jp_tmp1,(2,A1)
	CLR.W	($54,A0)
	CLR.W	($44,A0)
	MOVE.W	#$FFFF,($40,A0)
	LEA	(8,A0),A0
	LEA	($5C,A1),A1
	DBRA	D0,L_54E
	MOVE.W	(A0),D0
	RTS

L_588	MOVE.L	D0,-(SP)		; temp merken (4 slots)
	LSR.W	#2,D0
	ANDI.W	#%00001100,D0
	LEA	(jpb_Slot1Ptr,a6),A0
	MOVEA.L	(A0,D0.W),A0
	LEA	(jpb_Tmp1,a6),A1
	MOVEQ	#3,D0
L_5A0	MOVE.W	($50,A1),(A0)
	MOVE.W	($52,A1),(2,A0)
	MOVE.W	(A1),(4,A0)
	MOVE.W	($56,A1),(6,A0)
	LEA	(8,A0),A0
	LEA	($5C,A1),A1
	DBRA	D0,L_5A0
	MOVE.W	(jpb_j,a6),(A0)
	MOVE.L	(SP)+,D0
	RTS

jp_dmaoff:
	LEA	($DFF000),A0
	MOVE.W	#$780,($9A,A0)
	MOVE.W	#$FF,($9E,A0)
	MOVEQ	#0,D0
	MOVE.W	D0,($A8,A0)
	MOVE.W	D0,($B8,A0)
	MOVE.W	D0,($C8,A0)
	MOVE.W	D0,($D8,A0)
	LEA	($BFE001),A0
	BSET	#1,(A0)
	RTS

jp_cleanup:			; I don't know what this routine does,
	MOVEM.L	D3/A2/a6,-(SP)	; to me it looks like 'cleanup'.
	lea	jp_Buffer,a6
	CLR.W	(jpb_l,a6)
	CLR.W	(jpb_k,a6)
	MOVEQ	#-1,D0
	MOVE.W	D0,(jpb_j,a6)
	MOVE.W	D0,(jpb_f,a6)
	MOVE.W	D0,(jpb_g,a6)
	MOVE.W	D0,(jpb_h,a6)
	MOVE.W	D0,(jpb_i,a6)
	TST.L	(jpb_Song,a6)
	BEQ.B	L_644
	LEA	(jpb_Tmp1,a6),A2
	MOVEQ	#0,D3
L_626	MOVEQ	#0,D0
	BSR.W	L_714
	CLR.W	($44,A2)
	LEA	(jp_tmp1,PC),A1
	MOVE.L	A1,(2,A2)
	LEA	($5C,A2),A2
	ADDQ.W	#1,D3
	CMPI.W	#4,D3
	BLT.B	L_626
L_644	MOVEM.L	(SP)+,D3/A2/a6
	bclr	#1,$bfe001	; <- I added this line..., who cares?
	RTS

jp_setvol:
	move.l	a6,-(a7)
	lea	jp_Buffer,a6
	ANDI.W	#$FF,D0			; volume 0 to $80
	MOVE.W	D0,(jpb_k,a6)
	MOVE.W	D0,(jpb_l,a6)
	move.l	(a7)+,a6
	RTS

jp_fade:
	move.l	a6,-(a7)
	lea	jp_Buffer,a6
	MOVE.B	D1,(jpb_l,a6)	; speed 1 to ?, -1 = immediate
	MOVE.B	D0,(jpb_la,a6)	; destvolume 0 to $80, -1 = max
	move.l	(a7)+,a6
	RTS

jp_setspeed:
	move.l	a6,-(a7)
	lea	jp_Buffer,a6
	MOVE.W	D0,(jpb_Speed,a6)
	BNE.B	L_680
	MOVEA.L	(jpb_Speeds,a6),A0
	MOVEQ	#15,D0
	AND.W	(jpb_j,a6),D0
	ADD.W	D0,D0
	MOVE.W	(A0,D0.W),D0
	ANDI.W	#$FF,D0
	MOVE.W	D0,(jpb_Speed,a6)
L_680	CLR.W	(jpb_SpeedCount,a6)
	move.l	(a7)+,a6
	RTS

jp_fx:				; Have not tested if this is really the
	MOVEM.L	D2/D3/a6,-(SP)	; fx-routine, it just looks like it...
	lea	jp_Buffer,a6
	MOVE.L	D0,D2
	MOVE.L	D1,D3
	MOVEQ	#0,D1
	BSR.B	L_6AE
	SWAP	D2
	MOVE.W	D2,D0
	MOVEQ	#1,D1
	BSR.B	L_6AE
	MOVE.W	D3,D0
	MOVEQ	#2,D1
	BSR.B	L_6AE
	SWAP	D3
	MOVE.W	D3,D0
	MOVEQ	#3,D1
	BSR.B	L_6AE
	MOVEM.L	(SP)+,D2/D3/a6
	RTS

L_6AE	CMPI.B	#$FF,D0
	BEQ.B	L_6EE
	EXT.W	D1
	ADD.W	D1,D1
	LEA	(jpb_Tmp1,a6),A0
	ADDA.W	(L_6F2,PC,D1.W),A0
	MOVEA.L	(jpb_LoopInfo,a6),A1
	MOVEQ	#0,D1
	MOVE.B	D0,D1
	ADD.B	D1,D1
	MOVE.W	(A1,D1.W),D1
	ANDI.W	#$FF,D1
	CMP.W	($44,A0),D1
	BCS.B	L_6EE
	MOVE.W	D1,($44,A0)
	MOVE.W	D0,D1
	LSR.W	#8,D1
	ANDI.W	#$FF,D0
	MOVE.W	D0,($40,A0)
	MOVE.W	D1,($42,A0)
	RTS

L_6EE	MOVEQ	#-1,D0
	RTS

L_6F2	dc.w	0,$5C,$B8,$114


L_6FA	MOVE.W	($42,A2),D0
	BEQ.B	L_708
	SUBQ.W	#1,D0
	MOVE.W	D0,($42,A2)
	RTS

L_708	MOVE.W	($40,A2),D0
	CMPI.B	#$FF,D0
	BNE.B	L_714
	RTS

L_714	MOVE.L	D0,-(SP)
	BSR.W	L_B96
	MOVE.L	(SP)+,D0
	MOVE.W	($5A,A2),D7
	LEA	(jpb_f,a6),A0
	MOVE.W	D0,(A0,D7.W)
	CLR.W	(6,A2)
	CLR.W	($2E,A2)
	CLR.W	($24,A2)
	CLR.W	($28,A2)
	CLR.W	($26,A2)
	CLR.W	($2C,A2)
	CLR.W	(8,A2)
	CLR.W	(10,A2)
	MOVEQ	#-1,D1
	MOVE.W	D1,($40,A2)
	MOVE.W	D1,($46,A2)
	MOVE.W	D1,($48,A2)
	MOVE.W	D1,($4A,A2)
	MOVE.W	D1,($4C,A2)
	ANDI.L	#$FF,D0
	ADD.W	D0,D0
	MOVEA.L	(jpb_tab1,a6),A0
	MOVE.W	(A0,D0.W),D0
	MOVEA.L	(jpb_tab2,a6),A0
	ADDA.W	D0,A0
	MOVE.L	A0,(2,A2)
	MOVEQ	#-1,D0
	MOVE.L	D0,($3C,A2)
	RTS


jp_play:
	MOVEM.L	D0/D1/D7/A0/A1/a6,-(SP)	; call this from a cia-interrupt
	lea	jp_Buffer,a6		; 50 times a second
	BSR.W	jp_play1
	BSR.W	jp_play2
	MOVEM.L	(SP)+,D0/D1/D7/A0/A1/a6
	RTS

jp_play1:
	TST.W	(jpb_j,a6)
	BMI.B	L_78E
	SUBQ.W	#1,(jpb_SpeedCount,a6)
	BMI.B	L_790
L_78E	RTS

L_790	MOVEM.L	D2/D3/A2/A3,-(SP)
	MOVE.W	(jpb_Speed,a6),(jpb_SpeedCount,a6)
	LEA	(jpb_Tmp1,a6),A2
	MOVEQ	#0,D3
	MOVE.W	(jpb_d,a6),(jpb_e,a6)
L_7A6	SUBQ.B	#1,($56,A2)
	BPL.W	L_902
	MOVE.B	($57,A2),($56,A2)
L_7B4	MOVE.W	D3,D0
	ADD.W	D0,D0
	ADD.W	D0,D0
	LEA	(jpb_1aNow,a6),A0
	MOVEA.L	(A0,D0.W),A0
	MOVE.W	($50,A2),D0
	MOVE.W	(A0,D0.W),D0
	MOVE.B	D0,($53,A2)
	LSR.W	#8,D0
	CMPI.B	#$FF,D0
	BNE.B	L_7E0
	MOVE.W	#$FFFF,(jpb_j,a6)
	BRA.W	L_910

L_7E0	CMPI.B	#$FE,D0
	BNE.B	L_7F6
L_7E6	MOVE.B	($53,A2),D0
L_7EA	ANDI.W	#$FF,D0
	ADD.W	D0,D0
	MOVE.W	D0,($50,A2)
	BRA	L_7B4

L_7F6	CMPI.B	#$FC,D0
	BNE.B	L_80E
	MOVE.W	(jpb_e,a6),D0
	CMPI.W	#$FFFF,D0
	BEQ.B	L_7E6
	MOVE.W	#$FFFF,(jpb_d,a6)
	BRA.B	L_7EA

L_80E	CMPI.B	#$FD,D0
	BNE.B	L_82C
	MOVE.W	(jpb_e,a6),D0
	CMPI.W	#$FFFF,D0
	BEQ.B	L_826
	MOVE.W	#$FFFF,(jpb_d,a6)
	BRA.B	L_7EA

L_826	ADDQ.W	#2,($50,A2)
	BRA	L_7B4

L_82C	ADD.W	D0,D0
	MOVEA.L	(jpb_TrackOffsets,a6),A0
	MOVE.W	(A0,D0.W),D0
	MOVEA.L	(jpb_Tracks,a6),A0
	ADDA.W	D0,A0
L_83C	MOVE.B	($52,A2),D0
	ANDI.W	#$FF,D0
	MOVE.B	(A0,D0.W),D0
	CMPI.B	#$F9,D0
	BCS.B	L_896
	CMPI.B	#$FF,D0
	BNE.B	L_860
	CLR.B	($52,A2)
	ADDQ.W	#2,($50,A2)
	BRA.W	L_7B4

L_860	CMPI.B	#$F9,D0
	BNE.B	L_86E
	ADDQ.B	#1,($52,A2)
	BRA.W	L_902

L_86E	CMPI.B	#$FE,D0
	BNE.B	L_896
	MOVE.B	($52,A2),D0
	ANDI.W	#$FF,D0
	ADDQ.W	#1,D0
	MOVE.B	(A0,D0.W),D1
	ASL.W	#8,D1
	ADDQ.W	#1,D0
	MOVE.B	(A0,D0.W),D1
	MOVE.W	D1,($2C,A2)
	ADDQ.B	#3,($52,A2)
	BRA.W	L_902

L_896	TST.B	D0
	BPL.B	L_8A6
	ANDI.W	#$7F,D0
	MOVE.W	D0,(A2)
	ADDQ.B	#1,($52,A2)
	BRA.B	L_83C

L_8A6	BTST	#6,D0
	BEQ.B	L_8C0
	ANDI.W	#$3F,D0
	MOVE.B	D0,($57,A2)
	MOVE.B	D0,($56,A2)
	ADDQ.B	#1,($52,A2)
	BRA.W	L_83C

L_8C0	ANDI.W	#$FF,D0
	MOVE.W	D3,D1
	MOVE.W	D0,D2
	MOVE.W	(A2),D0
	CMPI.W	#$78,D0
	BEQ.B	L_8DA
	BSR.W	L_6AE
	CMPI.B	#$FF,D0
	BEQ.B	L_8FE
L_8DA	MOVE.W	D2,D0
	ADD.B	($53,A2),D0
	CMPI.B	#$54,D0
	BLT.B	L_8E8
	MOVEQ	#$54,D0
L_8E8	MOVE.W	D0,($54,A2)
	ADD.W	D0,D0
	LEA	(jp_periodes,PC),A0
	ANDI.W	#$FF,D0
	MOVE.W	(A0,D0.W),D0
	MOVE.W	D0,($2A,A2)
L_8FE	ADDQ.B	#1,($52,A2)
L_902	LEA	($5C,A2),A2
	ADDQ.W	#1,D3
	CMPI.W	#4,D3
	BLT.W	L_7A6
L_910	MOVEM.L	(SP)+,D2/D3/A2/A3
	RTS

jp_play2	MOVEM.L	D2/D3/A2/A3,-(SP)
	MOVEQ	#0,D0
	MOVEQ	#0,D1
	MOVEQ	#0,D7
	MOVE.B	(jpb_ka,a6),D0
	MOVE.B	(jpb_la,a6),D7
	MOVE.B	(jpb_l,a6),D1
	BEQ.B	L_946
	CMP.W	D7,D0
	BLT.B	L_940
	SUB.W	D1,D0
	CMP.W	D7,D0
	BGT.B	L_946
L_938	MOVE.W	D7,D0
	CLR.B	(jpb_l,a6)
	BRA.B	L_946

L_940	ADD.W	D1,D0
	CMP.W	D7,D0
	BGE.B	L_938
L_946	MOVE.B	D0,(jpb_ka,a6)
	MOVEQ	#0,D3
	LEA	(jpb_Tmp1,a6),A2
L_950	BSR.W	L_6FA
	TST.W	(6,A2)
	BEQ.B	L_960
	SUBQ.W	#1,(6,A2)
	BNE.B	L_97E
L_960	MOVEA.L	(2,A2),A3
	MOVEQ	#0,D2
L_966	MOVE.W	(A3)+,D0
	ANDI.W	#$FF,D0
	ADD.W	D0,D0
	lea	jp_jumptable(pc),a0
	MOVE.w	(a0,D0.W),d0
	JSR	(A0,d0.w)
	TST.W	D2
	BEQ.B	L_966
	MOVE.L	A3,(2,A2)
L_97E	BSR.W	L_B04
	BSR.W	L_A8E
	BSR.W	L_9FC
	LEA	($5C,A2),A2
	ADDQ.W	#1,D3
	CMPI.W	#4,D3
	BLT.B	L_950
	MOVEM.L	(SP)+,D2/D3/A2/A3
	RTS

jp_jumptable
rel	dc.w	L_C4C-rel	; I made this table relative
	dc.w	L_C04-rel	;  (it was absolute)
	dc.w	L_BC8-rel
	dc.w	L_BE0-rel
	dc.w	L_BF0-rel
	dc.w	L_C00-rel
	dc.w	L_C08-rel
	dc.w	L_C26-rel
	dc.w	L_C5A-rel
	dc.w	L_C62-rel
	dc.w	L_C6C-rel
	dc.w	L_C74-rel
	dc.w	L_C7C-rel
	dc.w	L_C84-rel
	dc.w	L_B5A-rel
	dc.w	L_B60-rel
	dc.w	L_B7C-rel
	dc.w	L_B96-rel
	dc.w	L_C04-rel
	dc.w	L_B66-rel
	dc.w	L_B2E-rel
	dc.w	L_B46-rel
	dc.w	L_C9E-rel
	dc.w	L_CFA-rel

L_9FC	MOVEQ	#0,D1
	MOVE.B	(jpb_ka,a6),D1
	LSR.B	#2,D1
	MOVEQ	#0,D0
	MOVE.B	($2E,A2),D0
	LSR.B	#2,D0
	CMP.B	D1,D0
	BLE.B	L_A12
	MOVE.B	D1,D0
L_A12	LEA	($DFF000),A0
	MOVE.W	D3,D7
	LSL.W	#4,D7
	ADDA.W	D7,A0
	LSR.W	#1,D0
	MOVE.W	D0,($A8,A0)
	TST.L	($3C,A2)
	BEQ.B	L_A78
	MOVEQ	#0,D0
	MOVE.W	($38,A2),D0
	ADD.L	D0,D0
	MOVE.L	($34,A2),D1
	ADD.L	D0,D1
	MOVE.L	($3C,A2),D0
	SUB.L	D0,D1
	MOVE.L	D1,($A0,A0)
	MOVE.W	($38,A2),($A4,A0)
	MOVE.W	($2A,A2),($A6,A0)
	RTS

L_A50	MOVE.W	#0,($2E,A2)
	MOVE.W	#$FFFF,($46,A2)
	MOVE.W	#$FFFF,($48,A2)
	MOVE.W	#$FFFF,($4A,A2)
	MOVE.W	#$FFFF,($4C,A2)
	CLR.L	($3C,A2)
	MOVE.W	#0,($A8,A0)
L_A78	MOVE.W	#1,($A4,A0)
	LEA	(jpb_a,a6),A1
	MOVE.L	A1,($A0,A0)
	MOVE.W	($2A,A2),($A6,A0)
	RTS

L_A8E	MOVE.W	($4E,A2),D1
	MOVE.W	($46,A2),D0
	CMPI.B	#$FF,D0
	BEQ.B	L_AB4
	SUBQ.B	#1,($47,A2)
	ANDI.W	#$FF00,D0
	ADD.W	D0,D1
	BCC.B	L_AFA
	MOVE.W	#$FF00,D1
	MOVE.W	#$FFFF,($46,A2)
	BRA.B	L_AFA

L_AB4	MOVE.W	($48,A2),D0
	CMPI.B	#$FF,D0
	BEQ.B	L_AD4
	SUBQ.B	#1,($49,A2)
	ANDI.W	#$FF00,D0
	SUB.W	D0,D1
	BCC.B	L_AFA
	MOVEQ	#0,D1
	MOVE.W	#$FFFF,($48,A2)
	BRA.B	L_AFA

L_AD4	MOVE.W	($4A,A2),D0
	CMPI.W	#$FFFF,D0
	BEQ.B	L_AE4
	SUBQ.W	#1,($4A,A2)
	BRA.B	L_AFA

L_AE4	MOVE.W	($4C,A2),D0
	CMPI.W	#$FFFF,D0
	BEQ.B	L_B02
	SUB.W	D0,D1
	BCC.B	L_AFA
	MOVEQ	#0,D1
	MOVE.W	#$FFFF,($4C,A2)
L_AFA	MOVE.W	D1,($4E,A2)
	MOVE.W	D1,($2E,A2)
L_B02	RTS

L_B04	MOVE.W	($28,A2),D0
	BEQ.B	L_B24
	ADD.W	D0,($2A,A2)
	MOVE.W	($26,A2),D1
	BEQ.B	L_B18
	SUBQ.W	#1,D1
	BRA.B	L_B20

L_B18	MOVE.W	($24,A2),D1
	NEG.W	($28,A2)
L_B20	MOVE.W	D1,($26,A2)
L_B24	MOVE.W	($2C,A2),D0
	ADD.W	D0,($2A,A2)
	RTS

L_b2e	MOVE.W	(A3)+,D0
	ANDI.W	#$FF,D0
	MOVE.W	D0,($54,A2)
	ADD.W	D0,D0
	LEA	(jp_periodes,PC),A0
	MOVE.W	(A0,D0.W),($2A,A2)
	RTS

L_b46	MOVE.W	(A3)+,D0
	ADD.W	($54,A2),D0
	ADD.W	D0,D0
	LEA	(jp_periodes,PC),A0
	MOVE.W	(A0,D0.W),($2A,A2)
	RTS

L_b5a	MOVE.W	(A3)+,($2A,A2)
	RTS

L_b60	MOVE.W	(A3)+,($2E,A2)
	RTS

L_b66	MOVE.W	(A3)+,($46,A2)
	MOVE.W	(A3)+,($48,A2)
	MOVE.W	(A3)+,($4A,A2)
	MOVE.W	(A3)+,($4C,A2)
	CLR.W	($4E,A2)
	RTS

L_b7c	MOVE.W	D3,D0
	ADD.W	D0,D0
	LEA	($DFF000),A0
	MOVE.W	(jp_dmacontmp,PC,D0.W),($96,A0)
	RTS

jp_dmacontmp
	dc.w	$8001,$8002,$8004,$8008

L_B96	MOVE.W	D3,D0
	ADD.W	D0,D0
	LEA	($DFF000),A0
	ADDA.W	(L_BC0,PC,D0.W),A0
	BSR.W	L_A50
	LEA	($DFF000),A0
	MOVE.W	(L_BB8,PC,D0.W),($96,A0)
	MOVEQ	#1,D2
	RTS

L_BB8	dc.w	1,2,4,8
L_BC0	dc.w	0,$10,$20,$30

L_bc8	MOVE.W	(A3)+,D0
	ADD.W	D0,D0
	ADD.W	D0,D0
	move.l	jpb_SmpTab(a6),A0
	MOVE.L	(A0,D0.W),D0
	MOVE.L	D0,($34,A2)
	MOVE.L	D0,($30,A2)
	RTS

L_be0	MOVEQ	#0,D0
	MOVE.W	(A3)+,D0
	MOVE.L	D0,($3C,A2)
	LSR.W	#1,D0
	MOVE.W	D0,($38,A2)
	RTS

l_bf0	MOVE.L	(A3)+,D0
	MOVE.L	D0,($3C,A2)
	BEQ.B	L_BFE
	LSR.W	#1,D0
	MOVE.W	D0,($38,A2)
L_BFE	RTS

L_c00	MOVE.W	(A3)+,(6,A2)
L_c04	MOVEQ	#1,D2
	RTS

l_c08	MOVE.W	(8,A2),D1
	MOVE.W	D1,(10,A2)
	MOVE.W	(A3)+,(12,A2,D1.W)
	ADD.W	D1,D1
	MOVE.L	A3,($14,A2,D1.W)
	ADDQ.W	#2,(8,A2)
	ANDI.W	#6,(8,A2)
	RTS

l_c26	MOVE.W	(10,A2),D1
	MOVE.W	(12,A2,D1.W),D0
	BEQ.B	L_C36
	SUBQ.W	#1,(12,A2,D1.W)
	BEQ.B	L_C3E
L_C36	ADD.W	D1,D1
	MOVEA.L	($14,A2,D1.W),A3
	RTS

L_C3E	TST.W	D1
	BEQ.B	L_C4A
	SUBQ.W	#2,(8,A2)
	SUBQ.W	#2,(10,A2)
L_C4A	RTS

L_c4c	LEA	(jp_tmp1,PC),A3
	CLR.W	($44,A2)
	BSR.W	L_B96
	RTS

l_c5a	MOVE.L	(A3)+,D0
	ADD.L	D0,($34,A2)
	RTS

l_c62	MOVE.W	(A3)+,D0
	ASR.W	#1,D0
	ADD.W	D0,($38,A2)
	RTS

L_c6c	MOVE.L	(A3)+,D0
	ADD.L	D0,($3C,A2)
	RTS

l_c74	MOVE.W	(A3)+,D0
	ADD.W	D0,($2A,A2)
	RTS

l_c7c	MOVE.W	(A3)+,D0
	ADD.W	D0,($2E,A2)
	RTS

l_c84	MOVEQ	#0,D1
	MOVE.B	(A3),D1
	MOVE.W	(A3)+,D0
	ANDI.W	#$FF,D0
	MOVE.W	D1,($28,A2)
	MOVE.W	D0,($24,A2)
	LSR.W	#1,D0
	MOVE.W	D0,($26,A2)
	RTS

l_c9e	MOVEQ	#0,D0
	MOVE.B	(A3)+,D0
	ADD.W	D0,D0
	ADD.W	D0,D0
	move.l	jpb_SmpTab(a6),A1
	MOVEA.L	(A1,D0.W),A0
	MOVE.B	(A3)+,D0
	ADD.W	D0,D0
	ADD.W	D0,D0
	MOVEA.L	(A1,D0.W),A1
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	MOVE.L	(A0)+,(A1)+
	RTS

l_cfa	MOVE.W	(A3)+,D0
	ADD.W	D0,D0
	ADD.W	D0,D0
	move.l	jpb_SmpTab(a6),A0
	MOVEA.L	(A0,D0.W),A0
	MOVEA.L	($30,A2),A1
	MOVEQ	#$7F,D0
L_D0E	CMPM.B	(A0)+,(A1)+
	BHI.B	L_D1E
	BEQ.B	L_D22
	ADDQ.B	#1,(-1,A1)
	DBRA	D0,L_D0E
	RTS

L_D1E	SUBQ.B	#1,(-1,A1)
L_D22	DBRA	D0,L_D0E
	RTS

jp_periodes
	dc.l	$EEE0E17
	dc.l	$D4D0C8E
	dc.l	$BD90B2F
	dc.l	$A8E09F7
	dc.l	$96708E0
	dc.l	$86107E8
	dc.l	$777070B
	dc.l	$6A60647
	dc.l	$5EC0597
	dc.l	$54704FB
	dc.l	$4B30470
	dc.l	$43003F4
	dc.l	$3BB0385
	dc.l	$3530323
	dc.l	$2F602CB
	dc.l	$2A3027D
	dc.l	$25A0238
	dc.l	$21801FA
	dc.l	$1DD01C3
	dc.l	$1A90191
	dc.l	$17B0165
	dc.l	$151013E
	dc.l	$12D011C
	dc.l	$10C00FD
	dc.l	$EE00E1
	dc.l	$D400C8
	dc.l	$BD00B3
	dc.l	$A8009F
	dc.l	$96008E
	dc.l	$86007E
	dc.l	$770070
	dc.l	$6A0064
	dc.l	$5E0059
	dc.l	$54004F
	dc.l	$4B0047
	dc.l	$43003F
	dc.l	$3B0038
	dc.l	$350032
	dc.l	$2F002C
	dc.l	$2A0027
	dc.l	$250023
	dc.l	$21001F

jp_tmp1	dc.w	15,0,$13,0,0,0,0,6,0,$12,7,0

	section "Buffer",bss_c

jp_buffer:			; nasty that just 4 longwords in this
	blk.b	jpb_Size,0	; do really need chipram

	END



	END

