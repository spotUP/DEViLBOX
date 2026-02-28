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
	dl	DTP_EndPlayer,EndPly

	dl	DTP_NextSong,NextSong
	dl	DTP_PrevSong,PrevSong
	dl	DTP_NextPatt,Fast

	dl	TAG_DONE

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Name	db	"Gremlin's",0
Comment	db	"maybe Ben Daglish,",10
	db	"adapted by Andy Silva",0

	db	'$VER: a player for the famous DeliTracker',0
	even

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

nix	addq.l	#2,a0
	dbf	d7,hdr_lp
	popm	d1-a6
	moveq	#-1,d0
	rts
Checky	pushm	d1-a6
	movea.l	(dtg_ChkData,a5),a0
	move.w	#5000,d7
hdr_lp	move.w	#$6000,d6
	cmp.w	(a0),d6
	bne.s  	nix
	cmp.w	4(a0),d6
	bne.s  	nix
	cmp.w	#$ff00,8(a0)
	beq.s	ok1
	tst.w	8(a0)	
	bne.s  	nix
ok1	cmp.w	$a(a0),d6
	bne.s  	nix
	cmp.w	#$3080,$16(a0)
	beq.s	ok
	cmp.l	#$41fafff8,$e(a0)
	bne.s  	nix
ok	move.l	a0,a1
	move.l	a0,a2
	move.w	#$1000,d5
	move.w	#$4e71,d6
sr_lp	cmp.w	#$f000,(a1)+
	bne.s	ok4
	cmp.w	#$40e7,(a1)
	bne.s	ok4
	move.w	d6,(a1)+
	move.w	d6,(a1)+
	move.w	d6,(a1)+
	dbf	d5,sr_lp
	bra.s  	fnd
ok4	cmp.l	#$46df4e73,-2(a1)
	beq.s	ok5
	cmp.l	#$00064e73,-2(a1)
	bne.s	ok6
	move.w	#$4e75,(a1)
	bra.s	sr_lp
ok5	move.l	#$4e714e75,-2(a1)
	bra.s	sr_lp
ok6	cmp.l	#$d0403033,-2(a1)
	bne.s	ok7
	cmp.l	#$000047fa,2(a1)
	bne.s	sr_lp
ok7	cmp.l	#$21c80070,(a1)
	bne.s	sr_lp
	move.w	-2(a1),d0
	lea	-2(a1,d0.w),a2
	move.w	d6,(a1)+
	move.w	d6,(a1)+
	move.l	a2,ptr1
	bra.s	sr_lp
fnd	lea	dat1(pc),a1
	move.l	a0,(a1)
	bsr.b	GetNumSubs
	subq.w	#1,d0
	move.w	d0,songs
	popm	d1-a6
	moveq	#0,d0
	rts

;a0	*Module
;>d0	number of subsongs

GetNumSubs:
	moveq	#0,d0
	move.w	#5000,d1
gns_lp	cmp.l	#$d040d040,(a0)
	bne.b	gns_lpc
	cmp.l	#$d04041fa,4(a0)
	beq.b	gns_ok
gns_lpc	addq.l	#2,a0
	dbf	d1,gns_lp
	rts
gns_ok	move.w	8(a0),d1
	lea	8(a0,d1.w),a0
	move.w	(a0),d2
gns_lp1	move.w	(a0)+,d1
	addq.w	#2,d0
	cmp.w	d1,d2
	ble.b	gns_1
	move.w	d1,d2
gns_1	cmp.w	d2,d0	; kleinster > offset
	blt.b	gns_lp1
	lsr.w	#3,d0
	rts

****

InitPly
	clr.w	songnr
	move.l	dat1(pc),dat2
	move.l	ptr1(pc),a1
	move.l	4.w,a0
	move.w	$128(a0),d0
	sub.l	a0,a0
	btst	#1,d0
	beq.b	ip_1
	move.l	vbr,a0
ip_1	move.l	a1,$70(a0)
	move.l	(dtg_AudioAlloc,a5),a0
	jsr	(a0)
	tst.l	d0
	rts

EndPly	move.l	(dtg_AudioFree,a5),a0	; free audio channels
	jsr	(a0)
	rts

****

* einsprungtabelle sieht so aus:
*
*	dc.w	$6000,$....,$6000,$....,$..00,$6000,$....
*	dc.w	$41fa,$fff8,$4250,$6000,$....

* offset zur songstartadr steht nach:
*
*		$d040 $3033 $0000 $47fa $.... <-negativ.w

ptr1	dc.l	0
dat1	dc.l	0
dat2	dc.l	0
songnr	dc.w	0
songs	dc.w	0
allow	dc.w	0

Init:
	pushm	d1-a6
	clr.b	allow
	move.l	dat2(pc),a0
	moveq	#0,d0
	move.w	songnr(pc),d0
	jsr	(a0)
	move.b	#1,allow
	popm	d1-a6
	rts

Play:
	pushm	d1-a6
	tst.b	allow
	beq.b	p_rts
	move.l	dat2(pc),a0
	jsr	4(a0)
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
	move.w	songs(pc),songnr
	bra.b	Init

Fast:
	move.w	dtg_Timer(a5),d1
	move.w	d1,d0
	lsr.w	#4,d0
	move.w	d0,dtg_Timer(a5)
	move.l	dtg_SetTimer(a5),a0
	jsr	(a0)
	nop
	move.w	d0,dtg_Timer(a5)
	jsr	(a0)
	rts

	END

