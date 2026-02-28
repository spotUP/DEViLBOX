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
	dl	DTP_EndSound,Stop
	dl	DTP_EndPlayer,EndPly

	dl	DTP_NextSong,NextSong
	dl	DTP_PrevSong,PrevSong

	dl	TAG_DONE

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Name	db	"MarkII Sound-System",0
Comment	db	"Darius Zendeh,",10
	db	"REWRITTEN by Andy Silva",0

	db	'$VER: a player for the famous DeliTracker',0
	even

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

InitPly
	clr.w	songnr
	move.w	mode1(pc),mode
	move.l	data1(pc),data
	move.l	(dtg_AudioAlloc,a5),a0
	jsr	(a0)
	tst.l	d0
	rts

EndPly	move.l	(dtg_AudioFree,a5),a0	; free audio channels
	jsr	(a0)
	rts

****

data1	dc.l	0
data	dc.l	0
songnr	dc.w	0
songs	dc.w	0
allow	dc.w	0
adr	dc.l	0
mode	dc.w	0
mode1	dc.w	0

Init:
	pushm	d1-a6
	clr.w	allow
	move.l	data(pc),a0
	tst.w	mode
	bne.b	i_1
	move.w	songnr(pc),d0
	bsr	_init
	bra.b	i_x
i_1	moveq	#-1,d0
	jsr	(a0)
i_x	move.w	#1,allow
	popm	d1-a6
	rts

Play:
	pushm	d1-a6
	tst.w	allow
	beq.b	p_x
	tst.w	mode
	bne.b	play2
	bsr	_Play
	bra.b	p_x
Play2	moveq	#0,d0
	move.l	data(pc),a0
	jsr	(a0)
p_x	popm	d1-a6
	rts

Stop:
	move.w	#$f,$dff096
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
	bgt	Init
	move.w	songs(pc),songnr
	bra	Init

***

clc:	addq.l	#4,a1
	move.w	(a1),d4
	lea	(a1,d4.w),a3
	addq.l	#2,a1
	move.l	a3,(a2)+
	rts
nix	popm	d1-a6
	moveq	#-1,d0
	rts
checky:
	pushm	d1-a6
	move.l	dtg_ChkData(a5),a0
	move.l	a0,data1
	cmp.w	#$4d41,(a0)	; teste auf MRK1 von PseudoDOS
	bne.s	m1
	cmp.w	#$524b,2(a0)
	bne.s	nix
	bra	fnd
m1	cmp.w	#$48e7,(a0)	; teste auf altes Mark I
	bne.s	nix
	cmp.w	#$00f0,2(a0)
	bne.s	nix
	cmp.w	#$41fa,4(a0)
	bne.s	nix
	cmp.w	#$4cd8,8(a0)
	bne.s	nix
	cmp.w	#$0600,10(a0)
	bne.s	nix
	move.l	a0,a1
	lea	dat(pc),a2
	move.w	#$300,d3
f_lp	cmp.l	#$20bc00d0,(a1)
	beq	mark2
	cmp.l	#$225145fa,(a1)		; patts
	bne.s	f_11
	bsr.s	clc
f_11	cmp.l	#$e74241fa,(a1)
	bne.s	f_21
	bsr	clc
	addq.l	#8,a1
	bsr	clc
f_21	cmp.w	#$00df,(a1)+
	beq.s	f_22
f_lpc	dbf	d3,f_lp
	bra	nix
f_22	cmp.l	#$f0a04e75,(a1)
	bne.s	f_lpc
	lea	18(a1),a1
	btst	#1,d7
	bne.s	md_1
	addq.l	#8,a1
md_1	lea	dat-4(pc),a2
	cmp.b	#$4a,12(a0)
	beq.s	md_2
	cmp.w	#$41fa,$12(a0)
	bne.s	md_2
	lea	$14(a0),a1
	move.w	(a1),d3
	lea	(a1,d3.w),a1
md_2	move.l	a1,(a2)
	lea	infe(pc),a3
	moveq	#infe-inf-1,d3
inf_lp	move.b	-(a3),-(a1)
	dbf	d3,inf_lp
	lea	-22(a1),a3
	move.l	a3,d4
	move.l	#"MARK",(a3)
	lea	6(a3),a1
	moveq	#3,d3
hdr_lp	move.l	(a2)+,(a1)
	sub.l	d4,(a1)+
	dbf	d3,hdr_lp
	lea	dat-4(pc),a1
	movem.l	(a1)+,a2/a4	; calc subsongs
	moveq	#0,d3
ss_lp	cmp.w	#-1,(a2)+
	bne.s	ss_lp
	addq.w	#1,d3
	cmp.l	a2,a4
	bne.s	ss_lp
	move.w	d3,4(a3)
	move.l	(a1)+,a2
	moveq	#0,d6
sum2_lp	addq.l	#4,a2
	add.l	(a2)+,d6
	cmp.w	#$5a0,(a2)
	bne.s	sum2_lp
	add.l	d6,d6
	move.l	(a1)+,a1
	move.l	a2,d3
	sub.l	a3,d3
	move.l	d3,18(a3)
cp_lp	move.l	(a1)+,(a2)+
	subq.l	#4,d6
	bpl.s	cp_lp
	move.l	a3,data1
	clr.w	(a0)
fnd	clr.w	mode1
fnd_x	popm	d1-a6
	moveq	#0,d0
	rts
mark2	move.w	#1,mode1
	move.w	#100,songs
	bra.s	fnd_x

	dc.l	0
dat	dc.l	0	; patts
	dc.l	0	; smptab
	dc.l	0	; smpdata
inf	dc.b	"          Adapted with Universal Ripper - " 
	dc.b	"(UniRIP by Vampire / PseudoDOS Group) "
infe

*********************************************************
*							*
*	Mark+ - The Replay Routine			*
*	--------------------------			*
*							*
*	For tunes converted with 'Universal Ripper'!	*
*							*
*	Made by Vampire / PseudoDOS Group		*
*	(hard work!)					*
*							*
*********************************************************

; file-format description:
;
; header:	dc.b	"MARK"
;		dc.w	0	; nr of subsongs
;		dc.l	0	; offset to first song
;		dc.l	0	; offset to patterns
;		dc.l	0	; offset to sampletable
;		dc.l	0	; offset to sampledata

patts	=	4
smptab	=	8
smpdata	=	12
sngptr1	=	16
sngptr2	=	20
posadr	=	30
L_134	=	38
VolCON	=	40
L_1e8	=	42
L_1f2	=	44
DMACON	=	46
lb	=	48
DMACON2	=	50
L_324	=	52

;d0 #song (0-x)
;a0 * mod

_init:
	lea	$dff000,a6
	lea	V(pc),a4
	move.l	a4,a1
	move.l	a0,d1
	addq.l	#4,a0
	move.w	(a0)+,songs
	moveq	#3,d2
ini_lp1	move.l	(a0)+,(a1)
	add.l	d1,(a1)+
	dbf	d2,ini_lp1
	move.l	(a4),a0
ini_lp3	subq.w	#1,d0
	bmi.s	ssngOk
ini_lp2	cmp.w	#$ffff,(a0)+
	bne.s	ini_lp2
	bra.s	ini_lp3
ssngOk	move.l	a0,d0
	lea	sngptr1(a4),A0
	move.l	D0,(A0)+
	move.l	D0,(A0)+
	clr.l	(A0)+
	moveq	#0,d0
	move.l	patts(a4),a0
ini_lp4	addq.w	#2,d0
	cmp.w	#-1,(a0)+
	bne.s	ini_lp4
	lea	modif(pc),a0
	move.w	d0,(a0)
	LEA	posadr(a4),A0
	MOVEM.L	(A0)+,A1-A2
	MOVE.W	#$F,$96(a6)
	clr.l	(a0)+
	move.w	#8,(a0)+
	move.w	#3,(a0)+
	move.w	#-$7df1,(a0)
	BSR.B	clrg
	BSR.W	L_230
	BRA.W	exitcont
init_x	rts

modif	dc.w	0

_play	lea	V(pc),a4
	lea	$dff000,a6
	LEA	posadr(a4),A0
	MOVEM.L	(A0),A1-A2
	BSR.B	tstplay
	CMPI.W	#$3F,L_134(a4)
	BNE.B	exitcont
	CMPI.W	#$3E,VolCON(A4)
	BEQ.B	exitstop
	ADDQ.W	#2,VolCON(A4)
exitcont
	MOVEQ	#4,D0
	MOVEQ	#0,D4
	BRA.B	exit
exitstop
	MOVEQ	#0,D0
	MOVE.W	#$F,$96(a6)
exit	LEA	L_134(a4),A0
	MOVEM.L	A1-A2,-(A0)
	RTS
clrg	MOVEQ	#0,D0
	MOVEQ	#0,D1
	MOVEQ	#0,D2
	MOVEQ	#0,D3
	MOVEQ	#0,D4
	RTS
tstplay	BSR.B	clrg
	tst.w	-(A0)
	BNE.B	playchans
	MOVE.W	#1,(A0)
	MOVE.W	DMACON2(a4),$96(a6)
	RTS
playchans
	CLR.W	(A0)
	ADDQ.L	#4,A2
	SUBA.W	L_1E8(a4),A1
	CMPI.B	#-1,(A2)
	BNE.B	L_23A
	move.l	patts(a4),A2	; get patterns pointer
	ADDA.W	L_1E8(a4),A1
	CMPI.B	#-1,(A1)
	BNE.B	L_23A
	MOVE.W	#1,-(A0)
	CMPI.W	#1,-(A0)
	BNE.B	L_230
	RTS
L_230	move.l	sngptr2(A4),A1
	move.l	patts(a4),A2	; nochmal
L_23A	MOVE.W	L_1F2(a4),D4
	LEA	DMACON2(a4),A0
	CLR.W	(A0)
	MOVE.W	#1,-(A0)
	LEA	$A0(a6),A3
setregs_lp
	MOVE.B	(A1)+,D0
	MOVE.B	(A1)+,D3
	move.w	modif(pc),d7
	MULU.w	d7,D0
	MOVE.B	(A2,D0.L),D2
	MOVE.B	1(A2,D0.L),D1
	ASL.W	#3,D2
setlenadr
	move.l	smptab(a4),A0
	MOVE.W	6(A0,D2.L),d5
	MOVE.L	(A0,D2.L),D2
	move.l	smpdata(a4),A0
	ADDA.L	D2,A0
	MOVE.L	A0,(A3)+
	move.w	d5,(a3)+
	MOVEQ	#0,D2
	MOVE.W	D1,D2
	ADD.W	D3,D1
	add.w	d1,d1
	LEA	peris(pc),A0
	MOVE.W	(A0,D1.L),D1
	move.l	d2,d3
	MOVEQ	#0,D2
	BCLR	#7,D3
	BEQ.B	setper
	LEA	L_324(a4),A0
	MOVE.W	D4,D2
	add.w	d2,D2
	MOVE.W	(A0,D2.L),D2
	BTST	#7,3(A2,D0.L)
	BEQ.B	L_2AC
	ADD.W	D2,D3
	BRA.B	L_2B0
L_2AC	SUB.W	D3,D2
	EXG	D3,D2
L_2B0	MOVE.W	D3,D1
setper	LEA	L_324(a4),A0
	MOVE.W	D4,D2
	add.w	d2,D2
	MOVE.W	D1,(A0,D2.L)
	MOVE.W	D1,(A3)+
	MOVEQ	#0,D3
	MOVEQ	#0,D2
	MOVEQ	#0,D1
	MOVE.B	2(A2,D0.L),D2
	MOVE.B	3(A2,D0.L),D1
	MOVE.W	VolCON(a4),D0
	CMP.W	D0,D2
	BGT.B	fadesub
	moveq	#1,D2
	BRA.B	setvol
fadesub	SUB.W	D0,D2
setvol	MOVE.W	d2,(A3)+
	addq.l	#6,a3
	LEA	lb(a4),A0
	move.w	(a0)+,d0
	BTST	#0,D1
	BNE.B	L_2FA
	ADD.W	D0,(A0)
L_2FA	add.w	d0,D0
	MOVE.W	D0,-(A0)
	DBRA	D4,setregs_lp
	MOVE.W	DMACON(a4),$96(a6)
	RTS	
	dc.b	"MarkI Player - Coded by Vampire!"
peris	dc.w	$05A0,$054C,$0500,$04B8,$0474,$0434
	dc.w	$03F8,$03C0,$038A,$0358,$0328,$02FA
	dc.w	$02D0,$02A6,$0280,$025C,$023A,$021A
	dc.w	$01FC,$01E0,$01C5,$01AC,$0194,$017D
	dc.w	$0168,$0153,$0140,$012E,$011D,$010D
	dc.w	$00FE,$00F0,$00E2,$00D6,$00CA,$00BE
	dc.w	$00B4,$00AA,$00A0,$0097,$008F,$0087
	dc.w	$007F,$0000,$5073,$6575,$646f,$444f
	dc.w	$5320,$4772,$6f75,$7020,$544d,$0000
V:	blk.b	60,0

	END

