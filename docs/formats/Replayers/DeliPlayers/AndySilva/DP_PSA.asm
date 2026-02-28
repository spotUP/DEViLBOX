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
	dl	DTP_EndSound,_Stop
	dl	DTP_EndPlayer,EndPly

	dl	DTP_NextSong,NextSong
	dl	DTP_PrevSong,PrevSong
*	dl	DTP_NextPatt,NextPat
*	dl	DTP_PrevPatt,PrevPat
*	dl	DTP_Volume,Volume
*	dl	DTP_Balance,Volume

	dl	TAG_DONE

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Name	db	"Professional Sound Artists",0
Comment	db	"Dave 'Steve' Hasler of PSA",10
	db	"adapted by Andy Silva",0

	db	"$VER: a player for the famous DeliTracker, "
	db	"made by Andreas da Silva in 11/94"
	even

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Checky	moveq	#-1,d0
	movea.l	(dtg_ChkData,a5),a0
	cmp.l	#$50534100,(a0)
	bne.b	.fail
	move.l	(dtg_ChkSize,a5),d1
	move.l	$24(a0),d2
	clr.b	d1
	clr.b	d2
	cmp.l	d1,d2
	bne.b	.fail
	moveq	#0,d0
.fail	rts

****

InitPly	
	clr.w	songnr
	move.l	a5,(delibase)
	moveq	#0,d0
	move.l	(dtg_GetListData,a5),a0
	jsr	(a0)
	move.l	a0,(Data)		; store module-ptr
	move.w	$2a(a0),d0
	sub.w	#$40,d0
	lsr.w	#3,d0
	move.w	d0,songs
	move.l	(dtg_AudioAlloc,a5),a0
	jsr	(a0)
	push	d0
	TST.B	(ready)
	BNE.B	i_x
	lea	SynthDatas,a0
	moveq	#63,d0
	move.l	#$80808080,d1
i_lp1	move.l	d1,(a0)+
	dbf	d0,i_lp1
	moveq	#63,d0
	not.l	d1
i_lp2	move.l	d1,(a0)+
	dbf	d0,i_lp2
	MOVE.B	#1,(ready)
i_x	pop	d0
	tst.l	d0
	rts

EndPly	move.l	(dtg_AudioFree,a5),a0	; free audio channels
	jsr	(a0)
	rts

****

Play
	PUSHM.l	d0-a6
	tst.w	(IntReq)
	beq.b	_NoInt
	bsr	psa_ir
	clr.w	(IntReq)
_NoInt	bsr	_Play
	POPM.l	d0-a6
	rts

Raster
wait	move.b	$DFF006,d1
..	cmp.b	$DFF006,d1
	beq.b	..
	dbra	d0,wait
	rts

Init:
	clr.b	allow
	move.l	(data,pc),a0
	move.w	songnr(pc),d0
	bsr	_Init
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
	move.w	songs(pc),songnr
	bra.b	Init

songnr	dc.w	0
songs	dc.w	0

*-----------------------------------------------------------------------*
*Volume	move.w	(dtg_SndVol,a5),(MainVol)
*	move.w	(dtg_SndRBal,a5),(RightVol)
*	move.w	(dtg_SndLBal,a5),(LeftVol)
*	rts
*MainVol	dw	0
*RightVol	dw	0
*LeftVol	dw	0
Data	dl	0
delibase	dl	0
IntReq	dw	0
*-----------------------------------------------------------------------*

** PSA Replay by PSA / ripped+fixed+optimized by Andy Silva in 1994 **

* Typ: wahrscheinlich Tracker-Clone mit im Player enthaltener fm-waveform
*      und möglicherweise Subsongs.
* (habe Player in 3 Hunks aufgeteilt, jetzt ciab statt ursprünglich a
*  für DMA-Start-Interrupt verwendet, fm-waveform war recht simpel aber
*  lang und deswegen Rautine zur Erzeugung gemacht, Player hat zwar
*  immernoch ca 50 Relocs, läuft aber wenigstens einwandfrei)

_Init
	MOVEM.L	D0/D1/A0/A5,-(a7)
	move.l	a0,modptr
	MOVE.B	#6,(speed)
	CLR.B	(counter)
	lea	$dff000,a5
	MOVE.W	#$f,($96,a5)
	MOVEQ	#0,D1
	MOVE.W	D1,($A8,A5)
	MOVE.W	D1,($B8,A5)
	MOVE.W	D1,($C8,A5)
	MOVE.W	D1,($D8,A5)
	MOVEA.L	($28,A0),A1
	ADDA.L	A0,A1
	MOVE.L	A1,(l_7D2)
	MOVEA.L	($2C,A0),A1
	ADDA.L	A0,A1
	MOVE.L	A1,(l_7D6)
	MOVEA.L	($30,A0),A1
	ADDA.L	A0,A1
	MOVE.L	A1,(l_7DA)
	ASL.W	#3,D0
	MOVE.W	($38,A0,D0.W),(w_774)
	MOVE.W	($3A,A0,D0.W),(w_776)
	MOVE.W	($3C,A0,D0.W),(w_778)
	MOVE.W	(w_774,PC),(w_772)
	MOVEA.L	(l_7D6,PC),A0
	MOVE.W	(w_772,PC),D0
	MOVEQ	#0,D1
	MOVE.W	(A0,D0.W),D1
	ASL.L	#8,D1
	ASL.L	#2,D1
	ADD.L	(l_7DA,PC),D1
	MOVE.L	D1,(l_77A)
	CLR.B	(b_771)
	MOVE.W	#$8000,(w_782)
	move.b	#1,(allow)
	MOVEM.L	(a7)+,D0/D1/A0/A5
	RTS

psa_ir
	movem.l	d0/a0/a2,-(a7)
	moveq	#10,d0
	bsr	Raster
	lea	$dff000,a0
	MOVE.W	(w_782,PC),($96,a0)
	MOVE.W	#$8000,(w_782)
	moveq	#20,d0
	bsr	Raster
	lea	Buffer,a2
	TST.B	(b_786)
	BEQ.B	L_1BE
	CLR.B	(b_786)
	MOVE.L	(a2),($A0,a0)
	MOVE.W	4(a2),($A4,a0)
L_1BE	TST.B	(b_787)
	BEQ.B	L_1DC
	CLR.B	(b_787)
	MOVE.L	$5c(a2),($B0,a0)
	MOVE.W	$5c+4(a2),($B4,a0)
L_1DC	TST.B	(b_788)
	BEQ.B	L_1FA
	CLR.B	(b_788)
	MOVE.L	$5c+$5c(a2),($C0,a0)
	MOVE.W	$5c+$5c+4(a2),($C4,a0)
L_1FA	TST.B	(b_789)
	BEQ.B	L_21C
	CLR.B	(b_789)
	MOVE.L	$5c+$5c+$5c(a2),($D0,a0)
	MOVE.W	$5c+$5c+$5c+4(a2),($D4,a0)
L_21C	MOVE.W	#$2000,($9C,a0)
	movem.l	(a7)+,d0/a0/a2
	rts

_Stop	CLR.B	(allow)
	lea	$dff000,a0
L_252	MOVE.W	#$F,($96,a0)
	MOVEQ	#0,D0
	MOVE.W	D0,($A8,A0)
	MOVE.W	D0,($B8,A0)
	MOVE.W	D0,($C8,A0)
	MOVE.W	D0,($D8,A0)
	BCLR	#1,($BFE001)
	RTS

_Play	TST.B	(allow)
	BNE.B	L_286
	RTS

L_286	MOVEM.L	D0-D7/A0-A6,-(a7)
	SUBQ.B	#1,(counter)
	BPL.B	L_298
	BSR.B	L_2EC
L_298	MOVE.B	(b_784,PC),D7
	ADDQ.W	#1,D7
	CMP.B	#3,D7
	BNE.B	L_2A6
	MOVEQ	#0,D7
L_2A6	MOVE.B	D7,(b_784)
	MOVEA.L	(l_77E,PC),A0
	LEA	Buffer,A2
	LEA	($DFF0A0),A1
	BSR.W	L_50C
	LEA	($5c,a2),A2
	LEA	($10,A1),A1
	BSR.W	L_50C
	LEA	($5c,a2),A2
	LEA	($10,A1),A1
	BSR.W	L_50C
	LEA	($5c,a2),A2
	LEA	($10,A1),A1
	BSR.W	L_50C
	MOVEM.L	(a7)+,D0-D7/A0-A6
	RTS

L_2EC	move.l	(modptr,PC),A5
	MOVEA.L	(l_77A,PC),A0
	MOVE.L	A0,(l_77E)
	LEA	(Periodes,PC),A4
	MOVEQ	#1,D7
	LEA	($DFF0A0),A1
	LEA	Buffer,A2
	BSR.W	L_3A4
	MOVE.B	D6,(b_786)
	LEA	($10,A1),A1
	LEA	($5c,a2),A2
	BSR.W	L_3A4
	MOVE.B	D6,(b_787)
	LEA	($10,A1),A1
	LEA	($5c,a2),A2
	BSR.B	L_3A4
	MOVE.B	D6,(b_788)
	LEA	($10,A1),A1
	LEA	($5c,a2),A2
	BSR.B	L_3A4
	MOVE.B	D6,(b_789)
	move.w	#1,IntReq
	ADDQ.B	#1,(b_771)
	ANDI.B	#$3F,(b_771)
	BNE.B	L_394
	MOVEA.L	(l_7D6,PC),A2
	MOVE.W	(w_772,PC),D0
	ADDQ.W	#2,D0
	CMP.W	(w_776,PC),D0
	BNE.B	L_37E
	MOVE.W	(w_778,PC),D0
	CMP.W	#$FFFF,D0
	BNE.B	L_37E
	BSR.W	_Stop
	BRA.B	L_394

L_37E	MOVE.W	D0,(w_772)
	MOVEQ	#0,D1
	MOVE.W	(A2,D0.W),D1
	ASL.L	#8,D1
	ASL.L	#2,D1
	ADD.L	(l_7DA,PC),D1
	MOVEA.L	D1,A0
L_394	MOVE.L	A0,(l_77A)
	MOVE.B	(speed,PC),(counter)
	RTS

L_3A4	MOVEQ	#0,D6
	MOVEQ	#0,D1
	MOVEQ	#0,D0
	MOVEQ	#0,D3
	MOVE.B	(A0)+,D0
	MOVE.B	(A0)+,D1
	MOVE.B	(A0)+,D2
	MOVE.B	(A0)+,D3
	TST.B	D0
	BEQ.W	L_4D0
	TST.B	D2
	BMI.W	L_4BC
	CMP.B	#3,D2
	BNE.B	L_3EA
	SUBQ.W	#1,D0
	ADD.W	D0,D0
	MOVE.W	(A4,D0.W),D0
	MOVE.W	D0,(12,A2)
	CMP.W	(6,A2),D0
	BPL.B	L_3E0
	MOVE.W	D3,(10,A2)
	BRA.W	L_508

L_3E0	NEG.W	D3
	MOVE.W	D3,(10,A2)
	BRA.W	L_508

L_3EA	MOVE.W	D7,($DFF096)
	OR.W	D7,(w_782)
	ASL.W	#6,D1
	ADD.L	(l_7D2,PC),D1
	MOVEA.L	D1,A3
	MOVE.L	($16,A3),($22,A2)
	MOVE.L	($1A,A3),($26,A2)
	MOVE.L	($1E,A3),($2A,A2)
	MOVE.B	#1,($21,A2)
	MOVE.L	(14,A3),($16,A2)
	MOVE.L	($12,A3),($1A,A2)
	TST.B	(14,A3)
	BEQ.B	L_474
	CLR.B	($20,A2)
	MOVE.B	($19,A2),($1F,A2)
	MOVE.B	($1A,A2),($1E,A2)
	LEA	(SynthDatas+$100),A6
	MOVE.W	(4,A3),D1
	MOVE.W	D1,(4,A1)
	ADD.W	D1,D1
	SUBA.W	D1,A6
	MOVE.L	A6,(0,A2)
	MOVEQ	#0,D1
	MOVE.B	(15,A3),D1
	ADDA.W	D1,A6
	MOVE.L	A6,(A1)
	CMP.B	#12,D2
	BNE.B	L_466
	MOVE.W	D3,(8,A1)
	MOVE.W	D3,(14,A2)
	BRA.B	L_4B6

L_466	MOVE.W	(12,A3),D4
	MOVE.W	D4,(8,A1)
	MOVE.W	D4,(14,A2)
	BRA.B	L_4B6

L_474	MOVEQ	#1,D6
	MOVE.L	(0,A3),D1
	ADD.L	A5,D1
	MOVE.L	D1,(A1)
	MOVE.W	(4,A3),(4,A1)
	CMP.B	#12,D2
	BNE.B	L_494
	MOVE.W	D3,(8,A1)
	MOVE.W	D3,(14,A2)
	BRA.B	L_4A0

L_494	MOVE.W	(12,A3),D4
	MOVE.W	D4,(8,A1)
	MOVE.W	D4,(14,A2)
L_4A0	MOVE.L	(6,A3),D1
	BNE.B	L_4B0
	LEA	(l_78A,PC),A6
	MOVE.L	A6,(0,A2)
	BRA.B	L_4B6

L_4B0	ADD.L	A5,D1
	MOVE.L	D1,(0,A2)
L_4B6	MOVE.W	(10,A3),(4,A2)
L_4BC	SUBQ.W	#1,D0
	MOVE.W	D0,(8,A2)
	ADD.W	D0,D0
	MOVE.W	(A4,D0.W),D0
	MOVE.W	D0,(6,A1)
	MOVE.W	D0,(6,A2)
L_4D0	CMP.B	#5,D2
	BNE.B	L_4DC
	MOVE.B	#1,($29,A2)
L_4DC	CMP.B	#12,D2
	BNE.B	L_4EC
	MOVE.W	D3,(8,A1)
	MOVE.W	D3,(14,A2)
	BRA.B	L_508

L_4EC	CMP.B	#13,D2
	BNE.B	L_4FC
	MOVE.B	#$3F,(b_771)
	BRA.B	L_508

L_4FC	CMP.B	#15,D2
	BNE.B	L_508
	MOVE.B	D3,(speed)
L_508	ADD.W	D7,D7
	RTS

L_50C	MOVEQ	#0,D1
	MOVE.B	(2,A0),D0
	ANDI.B	#$7F,D0
	MOVE.B	(3,A0),D1
	BEQ.B	L_55E
	TST.B	D0
	BNE.B	L_55E
	TST.B	D7
	BEQ.B	L_554
	LEA	(Periodes,PC),A3
	MOVE.W	(8,A2),D2
	CMP.B	#2,D7
	BEQ.B	L_542
	LSR.B	#4,D1
	ADD.W	D1,D2
	ADD.W	D2,D2
	MOVE.W	(A3,D2.W),(6,A1)
	BRA.W	L_680

L_542	ANDI.B	#15,D1
	ADD.W	D1,D2
	ADD.W	D2,D2
	MOVE.W	(A3,D2.W),(6,A1)
	BRA.W	L_680

L_554	MOVE.W	(6,A2),(6,A1)
	BRA.W	L_680

L_55E	CMP.B	#4,D0
	BNE.B	L_5BE
	MOVE.B	(counter),D2
	CMP.B	(speed),D2
	BNE.B	L_594
	TST.B	D1
	BEQ.B	L_594
	MOVEQ	#0,D2
	MOVE.B	D1,D2
	LSR.B	#4,D2
	MOVE.W	D2,($10,A2)
	MOVE.B	D1,D2
	ANDI.B	#15,D2
	MOVE.B	D2,($14,A2)
	ADD.B	D2,D2
	MOVE.B	D2,($15,A2)
	CLR.W	($12,A2)
L_594	MOVE.W	($12,A2),D2
	ADD.W	($10,A2),D2
	MOVE.W	D2,($12,A2)
	ADD.W	(6,A2),D2
	MOVE.W	D2,(6,A1)
	SUBQ.B	#1,($14,A2)
	BNE.W	L_680
	MOVE.B	($15,A2),($14,A2)
	NEG.W	($10,A2)
	BRA.W	L_680

L_5BE	MOVE.W	(6,A2),(6,A1)
	CMP.B	#10,D0
	BNE.B	L_602
	TST.B	D1
	BMI.B	L_5EA
	MOVE.W	(14,A2),D2
	ADD.W	D1,D2
	CMP.B	#$40,D2
	BMI.B	L_5DE
	MOVE.B	#$40,D2
L_5DE	MOVE.W	D2,(8,A1)
	MOVE.W	D2,(14,A2)
	BRA.W	L_680

L_5EA	ANDI.W	#$7F,D1
	MOVE.W	(14,A2),D2
	SUB.W	D1,D2
	BPL.B	L_5F8
	MOVEQ	#0,D2
L_5F8	MOVE.W	D2,(8,A1)
	MOVE.W	D2,(14,A2)
	BRA.B	L_680

L_602	CMP.B	#1,D0
	BNE.B	L_618
	MOVE.W	(6,A2),D2
	SUB.W	D1,D2
	MOVE.W	D2,(6,A1)
	MOVE.W	D2,(6,A2)
	BRA.B	L_680

L_618	CMP.B	#2,D0
	BNE.B	L_62E
	MOVE.W	(6,A2),D2
	ADD.W	D1,D2
	MOVE.W	D2,(6,A1)
	MOVE.W	D2,(6,A2)
	BRA.B	L_680

L_62E	CMP.B	#3,D0
	BNE.B	L_680
	MOVE.W	(10,A2),D1
	BEQ.B	L_680
	BMI.B	L_65A
	MOVE.W	(6,A2),D0
	SUB.W	D1,D0
	CMP.W	(12,A2),D0
	BPL.B	L_678
	MOVE.W	(12,A2),(6,A1)
	MOVE.W	(12,A2),(6,A2)
	CLR.W	(10,A2)
	BRA.B	L_680

L_65A	MOVE.W	(6,A2),D0
	SUB.W	D1,D0
	CMP.W	(12,A2),D0
	BMI.B	L_678
	MOVE.W	(12,A2),(6,A1)
	MOVE.W	(12,A2),(6,A2)
	CLR.W	(10,A2)
	BRA.B	L_680

L_678	MOVE.W	D0,(6,A1)
	MOVE.W	D0,(6,A2)
L_680	TST.B	($16,A2)
	BEQ.B	L_6DA
	SUBQ.B	#1,($1F,A2)
	BNE.B	L_6DA
	MOVEQ	#0,D2
	MOVE.B	($17,A2),D2
	TST.B	($20,A2)
	BNE.B	L_6B4
	MOVE.B	($19,A2),($1F,A2)
	ADD.B	($18,A2),D2
	SUBQ.B	#1,($1E,A2)
	BNE.B	L_6CE
	MOVE.B	($1D,A2),($1E,A2)
	NOT.B	($20,A2)
	BRA.B	L_6CE

L_6B4	MOVE.B	($1C,A2),($1F,A2)
	SUB.B	($1B,A2),D2
	SUBQ.B	#1,($1E,A2)
	BNE.B	L_6CE
	MOVE.B	($1A,A2),($1E,A2)
	NOT.B	($20,A2)
L_6CE	MOVE.B	D2,($17,A2)
	MOVEA.L	(0,A2),A6
	ADDA.W	D2,A6
	MOVE.L	A6,(A1)
L_6DA	MOVE.B	($22,A2),D2
	BEQ.W	L_76A
	SUBQ.B	#1,($21,A2)
	BNE.W	L_76A
	MOVE.W	(14,A2),D0
	CMP.B	#1,D2
	BEQ.B	L_718
	CMP.B	#2,D2
	BEQ.B	L_72E
	CMP.B	#3,D2
	BEQ.B	L_744
	MOVE.B	($2B,A2),($21,A2)
	SUB.B	($2A,A2),D0
	SUBQ.B	#1,($2C,A2)
	BNE.B	L_75C
	MOVE.B	#0,($22,A2)
	BRA.B	L_75C

L_718	MOVE.B	($24,A2),($21,A2)
	ADD.B	($23,A2),D0
	SUBQ.B	#1,($25,A2)
	BNE.B	L_75C
	ADDQ.B	#1,($22,A2)
	BRA.B	L_75C

L_72E	MOVE.B	($27,A2),($21,A2)
	SUB.B	($26,A2),D0
	SUBQ.B	#1,($28,A2)
	BNE.B	L_75C
	ADDQ.B	#1,($22,A2)
	BRA.B	L_75C

L_744	MOVE.B	#1,($21,A2)
	TST.B	($29,A2)
	BEQ.B	L_76A
	SUBQ.B	#1,($29,A2)
	BNE.B	L_76A
	ADDQ.B	#1,($22,A2)
	BRA.B	L_76A

L_75C	TST.B	D0
	BPL.B	L_762
	MOVEQ	#0,D0
L_762	MOVE.W	D0,(14,A2)
	MOVE.W	D0,(8,A1)
L_76A	ADDQ.W	#4,A0
	RTS
Periodes
	dc.l	$3580328,$2FA02D0,$2A60280,$25C023A,$21A01FC,$1E001C5
	dc.l	$1AC0194,$17D0168,$1530140,$12E011D,$10D00FE,$F000E2
	dc.l	$D600CA,$BE00B4,$AA00A0,$97008F,$87007F,$780071
	dc.w	$6B

oldvec	dc.l	0
modptr	dc.l	0
allow	dc.b	0
counter	dc.b	0
speed	dc.b	0
b_771	dc.b	0
w_772	dc.w	0
w_774	dc.w	0
w_776	dc.w	0
w_778	dc.w	0
l_77A	dc.l	0
l_77E	dc.l	0
w_782	dc.w	0
b_784	dc.b	0
ready	dc.b	0
b_786	dc.b	0
b_787	dc.b	0
b_788	dc.b	0
b_789	dc.b	0
l_78A	dc.l	0
l_7D2	dc.l	0
l_7D6	dc.l	0
l_7DA	dc.l	0

	section	"Buffer",bss

Buffer	blk.b	$5c*4,0


	section	"SynthDatas",bss_c

SynthDatas	blk.b	$200,0

	END

