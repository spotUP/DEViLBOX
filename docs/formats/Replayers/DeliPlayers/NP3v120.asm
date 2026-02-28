**
**	Noisepacker 3.x playroutine for DeliTracker 1.21+
**	Made for DT by Kevin Dackiw
**	Use Macro 68 for assembly
**
**	If you have any comments or make any changes to the code,
**	please contact me!
**
**	EMail:	kevind@ersys.edmonton.ab.ca
**		sikorsky@bode.ee.ualberta.ca
**
**	to do:	add <<,>> support
**		fix songend detection logic
**
**	bugs: none that I know of
**
**	History:
**
**	v1.00	Initial release.
**	v1.10	Added support for songend detection.
**		Streamlined the interface.
**		Note that it DOESN'T look for NPAK0003 headers now!
**	v1.20	Fixed up check routine.
**		Removed player's ability to change filter.
**		Optimized volume/balance code.
**		* Thanks to Peter for suggestions!...8-) *
**
	section NP3_player,code

	newsyntax
*	strict
*	debug
*	addsym
	objfile	'ram:npacker3'
	errfile	'ram:errorfile'
	normobj
*	smallobj
	exeobj
	incdir	'includes:'
	include	'misc/deliplayer.i'

start	PLAYERHEADER functions

version	dc.b	'$VER: NoisePacker_3 player module v1.20 '
	doscmd	'libdate >t:d1'
	incbin	't:d1'
	dc.b	$D,0

	dc.b	'Assembled: '
	doscmd	'date >t:d2'
	incbin	't:d2'
	dc.b	$D,0

	cnop	0,4	;next long for 68030 speed   8-)

functions	dc.l	DTP_PlayerVersion,3
	dc.l	DTP_PlayerName,playername
	dc.l	DTP_Creator,creator
	dc.l	DTP_Check2,checkmod
	dc.l	DTP_Interrupt,interrupt
	dc.l	DTP_InitPlayer,initplayer
	dc.l	DTP_EndPlayer,endplayer
	dc.l	DTP_InitSound,initsound
	dc.l	DTP_EndSound,endsound
	dc.l	DTP_Volume,volume
	dc.l	DTP_Balance,balance
	dc.l	TAG_DONE

playername	dc.b	'NoisePacker_3.x',0
creator	dc.b	'Original code by Phenomena;',$A
	dc.b	'Adapted by Kevin Dackiw',0

	cnop	0,4

checkmod	movea.l	(dtg_ChkData,a5),a0
	moveq	#0,d0
	moveq	#0,d1			;check module format
	movea.l	a0,a1
	move.w	(a0),d1			;check word 0
	andi.w	#$0f,d1			;for divisibility
	cmpi.w	#$0c,d1			;by $C
	bne	4$

	adda.w	(a0)+,a1
	move.w	(-4,a1),d2		;check 2 identical bytes
	cmp.w	(a0)+,d2
	bne	4$

	subq.w	#4,a0			;back to module start again...
	moveq	#0,d2			;...
	move.l	d2,a1			;...to check mod length!
	add.w	(a0)+,a1			;add length of inst table
	move.l	a1,d1			;save for counter
	subi.w	#$0c,d1			;fix
	lsr.l	#4,d1			;fix
	subq.w	#1,d1			;-> # of instrument entries
	moveq	#3-1,d3			;3 words to add
5$	move.w	(a0)+,d2			;add in position table length
	add.l	d2,a1			;and offset and pattern table
	dbf	d3,5$			;lengths
	addq.w	#6,a0			;jump to first inst length
3$	moveq	#0,d2			;clear
	move.w	(a0),d2			;fetch inst length
	add.l	d2,d2			;...add length
	add.l	d2,a1			;...and add to sum to get bytes
	addi.w	#$10,a0			;skip to next
	dbra	d1,3$			;do all instruments

	move.l	(dtg_ChkSize,a5),d1	;size of loaded module from DT
	move.l	d1,d2			;save
	sub.l	#1024,d1			;-1k ... adjust if necessary
	add.l	#1024,d2			;+1k ... adjust if necessary
	cmp.l	d1,a1			;check it
	blt	4$				;too small!
	cmp.l	d2,a1			;check it
	bgt	4$				;too big!
	rts					;ok!
4$	moveq	#-1,d0			;fail!
	rts					;gone!

interrupt	movem.l	d0-d7/a0-a6,-(sp)	;save all since an
	bsr	np_music
	movem.l	(sp)+,d0-d7/a0-a6	;interrupt calls this
	rts

initplayer	moveq	#0,d0
	movea.l	(dtg_GetListData,a5),a0
	jsr	(a0)
	move.l	a0,(np_data)
	move.w	(2,a0),(patterns)
	move.l	a5,(DTbase)		;save for later toying
	movea.l	(dtg_AudioAlloc,a5),a0
	jsr	(a0)
	rts

endplayer	movea.l	(dtg_AudioFree,a5),a0
	jsr	(a0)
	rts

initsound	bsr	np_init
	rts

endsound	moveq	#32-1,d0			;clear dma data
	lea	(np_voidat1),a0
6$	clr.l	(a0)+
	dbra	d0,6$
	movea.l	(np_data),a0
	move.w	(2,a0),(patterns)	;restore pattern counter
	bsr	np_end
	rts

balance	nop

volume	move.w	(dtg_SndVol,a5),(mv)
	move.w	(dtg_SndLBal,a5),(lv)
	move.w	(dtg_SndRBal,a5),(rv)
	rts

	cnop	0,4

np_data	dc.l	0
DTbase	dc.l	0
patterns	dc.w	0
currentvol	dc.w	0
mv	dc.w	0
lv	dc.w	0
rv	dc.w	0

	cnop	0,4

np_init	moveq	#1,d0
	moveq	#0,d1
	movea.l	(np_data),a4
	lea	($dff000),a5
	lea	(np_datastart,pc),a6
	move.l	#0,(a6)+
	move.w	d0,(a6)+
	movea.l	a4,a3
	adda.w	(a4)+,a3
	move.l	a3,(a6)+
	move.w	d1,(a6)+
np_ini1	adda.w	(a4)+,a3
	move.l	a3,(a6)+
	dbf	d0,np_ini1
	move.w	(a4)+,d0
	adda.l	d0,a3
	move.l	#$82000006,(a6)+
	move.w	#$0100,(a6)+
	move.l	#np_portup,(a6)+
	move.l	#np_portdown,(a6)+
	move.l	#np_port,(a6)+
	move.l	#np_vib,(a6)+
	move.l	#np_port2,(a6)+
	move.l	#np_vib2,(a6)+
	move.l	#np_volslide,(a6)+
	move.l	#np_arp,(a6)+
	move.l	#np_songjmp,(a6)+
	move.l	#np_setvol,(a6)+
	move.l	#np_pattbreak,(a6)+
	move.l	#np_filter,(a6)+
	move.l	#np_setspeed,(a6)+
	moveq	#0,d0
	movea.l	a4,a6
	adda.w	(-8,a4),a6
	suba.w	#12,a6
np_ini2	move.l	a3,(2,a4)
	movea.l	a3,a2
	move.w	(14,a4),d0
	add.w	d0,d0
	adda.l	d0,a2
	move.l	a2,(8,a4)
	move.w	(6,a4),d0
	add.w	d0,d0
	adda.l	d0,a3
	adda.w	#16,a4
	cmpa.l	a4,a6
	bne.b	np_ini2
	clr.w	($a8,a5)
	clr.w	($b8,a5)
	clr.w	($c8,a5)
	clr.w	($d8,a5)
	move.w	#$f,($96,a5)
	rts

np_end	lea	($dff000),a5
	clr.w	($a8,a5)
	clr.w	($b8,a5)
	clr.w	($c8,a5)
	clr.w	($d8,a5)
	move.w	#$f,($96,a5)
	rts

np_music	moveq	#0,d6
	lea	($dff0d0),a4
	lea	(np_block,pc),a6
	subq.w	#1,(a6)+
	bhi	np_nonew
	movea.l	(a6)+,a1
	adda.w	(a6)+,a1
	movea.l	(a6)+,a0
	adda.w	(a1),a0
	move.l	(a6)+,d2
	movea.l	(np_data),a1
	subq.w	#8,a1
	lea	(np_voidat1,pc),a2
	moveq	#8,d0
	moveq	#0,d1
	moveq	#0,d4
	moveq	#0,d5

np_loop1	move.w	(a0)+,d1
	tst.w	(a2)+
	bpl.b	np_lop3
	addq.w	#1,-(a2)
	adda.w	#32,a2
	addq.w	#8,a4
	bra	np_lop7

np_lop3	movea.l	d2,a3
	adda.l	d1,a3
	adda.w	(a2),a3
	move.b	(a3)+,d1
	bpl.b	np_lop4
	ext.w	d1
	addq.w	#1,d1
	addq.w	#1,(a2)
	move.w	d1,-(a2)
	move.w	d6,(8,a2)
	adda.w	#32,a2
	addq.w	#8,a4
	bra	np_lop7

np_lop4	move.b	(a3)+,d3
	move.b	(a3)+,d4
	addq.w	#3,(a2)+
	movea.l	a1,a3
	move.b	d1,d7
	lsl.w	#8,d7
	or.b	d3,d7
	andi.w	#$1f0,d7
	bne.b	np_loop3
	adda.w	(a2)+,a3
	addq.w	#2,a2
	addq.w	#2,a3
	bra.b	np_loop4

np_loop3	move.w	d7,(a2)+
	adda.w	d7,a3
	move.w	(a3)+,(a2)+
np_loop4	andi.w	#$f,d3
	move.w	d3,(a2)+
	move.w	d4,(a2)+
	andi.w	#$fe,d1
	beq.b	np_loop5
	move.w	(np_periods-2,pc,d1.w),d7
	subq.w	#3,d3
	beq	np_setport
	subq.w	#2,d3
	beq	np_setport
	or.w	d0,d5
	move.w	d7,(a2)+
	move.w	d1,(a2)+
	move.w	d6,(a2)+
	move.l	(a3)+,(a4)+
	move.w	(a3)+,(a4)+
	move.l	(a3)+,(a2)+
	move.w	(a3)+,(a2)+
	subq.w	#6,d3
	bmi.b	np_loop6
	add.w	d3,d3
	add.w	d3,d3
	movea.l	(38,a6,d3.w),a3
	jmp	(a3)

np_loop5	adda.w	#12,a2
	addq.w	#6,a4
	subi.w	#11,d3
	bmi.b	np_loop6
	add.w	d3,d3
	add.w	d3,d3
	movea.l	(38,a6,d3.w),a3
	jmp	(a3)

np_periods	dc.w	$0358,$0328,$02fa,$02d0,$02a6,$0280,$025c,$023a,$021a
	dc.w	$01fc,$01e0,$01c5,$01ac,$0194,$017d,$0168,$0153,$0140
	dc.w	$012e,$011d,$010d,$00fe,$00f0,$00e2,$00d6,$00ca,$00be
	dc.w	$00b4,$00aa,$00a0,$0097,$008f,$0087,$007f,$0078,$0071

np_loop6	move.w	(-12,a2),(a4)+
np_loop7	move.w	(-18,a2),(currentvol)
	bsr	dofix
	addq.w	#8,a2
	bra	passvolfix

np_lop7	move.w	(-26,a2),(currentvol)
	bsr	dofix

passvolfix	suba.w	#$18,a4
	lsr.w	#1,d0
	bne	np_loop1
	move.w	d5,(6,a4)
	or.w	d5,(a6)+
	move.w	(a6)+,(-20,a6)
	bsr	waitdma
	move.w	(np_block+16,pc),($dff096)
	bsr	waitdma
	bset	#0,(a6)+
	beq.b	np_break
	addq.b	#1,(a6)
	cmpi.b	#64,(a6)
	bne.b	np_next

np_break	subq.w	#1,(patterns)		;done 1 pattern
	bsr	np_checkend
	move.b	d6,(a6)
	move.l	d6,(-32,a2)
	move.l	d6,(-64,a2)
	move.l	d6,(-96,a2)
	move.l	d6,(-128,a2)
	lea	(np_block+2,pc),a6
	movea.l	(a6)+,a0
	addq.w	#2,(a6)
	move.w	(a6),d0
	cmp.w	(-4,a0),d0
	bne.b	np_next
	move.w	(-2,a0),(a6)
np_next	move.l	(np_voidat1+18,pc),($dff0d0)
	move.w	(np_voidat1+22,pc),($dff0d4)
	move.l	(np_voidat1+50,pc),($dff0c0)
	move.w	(np_voidat1+54,pc),($dff0c4)
	move.l	(np_voidat1+82,pc),($dff0b0)
	move.w	(np_voidat1+86,pc),($dff0b4)
	move.l	(np_voidat1+114,pc),($dff0a0)
	move.w	(np_voidat1+118,pc),($dff0a4)
	rts

np_checkend	bpl	np_notdone
	movem.l	a0/a5,-(sp)		;done patterns?
	move.l	(DTbase),a5		;yes!
	movea.l	(dtg_SongEnd,a5),a0
	jsr	(a0)				;inform DT
	movem.l	(sp)+,a0/a5
np_notdone	rts

np_setvol	move.w	d4,(-18,a2)
	bra.w	np_loop6

np_pattbreak	move.b	d6,(4,a6)
	bra.w	np_loop6

np_songjmp	move.b	#63,(5,a6)
	move.b	d4,(-9,a6)
	bra.w	np_loop6

np_setspeed	move.w	d4,(2,a6)
	bra	np_loop6

np_filter
*	andi.b	#$fd,($bfe001)
*	or.b	d4,($bfe001)
	bra	np_loop6

np_setport	adda.w	#12,a2
	addq.w	#8,a4
	cmp.w	(-12,a2),d7
	slt	(a2)
	beq.b	np_clear
	move.w	d7,(2,a2)
	bra	np_loop7

np_clear	move.w	d6,(2,a2)
	bra	np_loop7

np_nonew	lea	(np_voidat1,pc),a0
	moveq	#3,d0
np_lop1	move.w	(8,a0),d1
	beq.w	np_lop2
	subq.w	#8,d1
	bhi.w	np_lop2
	addq.w	#7,d1
	add.w	d1,d1
	add.w	d1,d1
	movea.l	(20,a6,d1.w),a3
	jmp	(a3)

np_lop2	adda.w	#32,a0
	suba.w	#$10,a4
	dbf	d0,np_lop1
	rts

np_portup	move.w	(10,a0),d2
	sub.w	d2,(12,a0)
	cmpi.w	#$71,(12,a0)
	bpl.b	np_portup2
	move.w	#$71,(12,a0)

np_portup2	move.w	(12,a0),(6,a4)
	bra.b	np_lop2

np_portdown	move.w	(10,a0),d2
	add.w	d2,(12,a0)
	cmpi.w	#$358,(12,a0)
	bmi.b	np_portdown2
	move.w	#$358,(12,a0)

np_portdown2	move.w	(12,a0),(6,a4)
	bra.b	np_lop2

np_arp	move.w	(-2,a6),d2
	sub.w	(16,a6),d2
	neg.w	d2
	move.b	(np_arplist,pc,d2.w),d2
	beq.b	np_arp0
	subq.w	#2,d2
	beq.b	np_arp2

np_arp1	move.w	(10,a0),d2
	lsr.w	#3,d2
	andi.w	#$e,d2
	bra.b	np_arp3

np_arp2	move.w	(10,a0),d2
	andi.w	#$f,d2
	add.w	d2,d2
np_arp3	add.w	(14,a0),d2
	cmpi.w	#$48,d2
	bls.b	np_arp4
	moveq	#$48,d2
np_arp4	lea	(np_periods-2,pc),a3
	move.w	(a3,d2.w),(6,a4)
	bra	np_lop2

np_arp0	move.w	(12,a0),(6,a4)
	bra	np_lop2

np_arplist	dc.b 0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1
np_sin	dc.b $00,$18,$31,$4a,$61,$78,$8d,$a1,$b4,$c5,$d4,$e0,$eb,$f4,$fa,$fd
	dc.b $ff,$fd,$fa,$f4,$eb,$e0,$d4,$c5,$b4,$a1,$8d,$78,$61,$4a,$31,$18

np_vib	move.w	(10,a0),d3
	beq.b	np_vib2
	move.w	d3,(30,a0)
np_vib2	move.w	(16,a0),d3
	lsr.w	#2,d3
	andi.w	#$1f,d3
	moveq	#0,d2
	move.b	(np_sin,pc,d3.w),d2
	move.w	(30,a0),d3
	andi.w	#$f,d3
	mulu.w	d3,d2
	lsr.w	#7,d2
	move.w	(12,a0),d3
	tst.b	(17,a0)
	bmi.b	np_vibsub
	add.w	d2,d3
	bra.b	np_vib3

np_vibsub	sub.w	d2,d3
np_vib3	move.w	d3,(6,a4)
	move.w	(30,a0),d3
	lsr.w	#2,d3
	andi.w	#$3c,d3
	add.b	d3,(17,a0)
	cmpi.b	#20,d1
	bne	np_lop2

np_volslide	move.w	(10,a0),d2
	add.b	d2,(7,a0)
	bmi.b	np_vol3
	cmpi.w	#$40,(6,a0)
	bmi.b	np_vol2
	move.w	#$40,(6,a0)
np_vol2	move.w	(6,a0),(currentvol)
	bsr	dofix
	bra	np_lop2

np_vol3	move.w	d6,(6,a0)
	move.w	d6,(currentvol)
	bsr	dofix
	bra	np_lop2

np_port	move.w	(10,a0),d2
	beq.b	np_port2
	move.w	d2,(28,a0)
np_port2	move.w	(26,a0),d2
	beq.b	np_rts
	move.w	(28,a0),d3
	tst.w	(24,a0)
	bne.b	np_sub
	add.w	d3,(12,a0)
	cmp.w	(12,a0),d2
	bgt.b	np_portok
	move.w	d2,(12,a0)
	move.w	d6,(26,a0)
np_portok	move.w	(12,a0),(6,a4)
np_rts	cmpi.b	#16,d1
	beq.b	np_volslide
	bra	np_lop2

np_sub	sub.w	d3,(12,a0)
	cmp.w	(12,a0),d2
	blt.b	np_portok
	move.w	d2,(12,a0)
	move.w	d6,(26,a0)
	move.w	(12,a0),(6,a4)
	cmpi.b	#16,d1
	beq	np_volslide
	bra	np_lop2

waitdma	movem.l	d0-d1,-(sp)
	moveq	#7,d0
dlp1	move.b	($dff006),d1
dlp2	cmp.b	($dff006),d1
	beq	dlp2
	dbra	d0,dlp1
	movem.l	(sp)+,d0-d1
	rts	

dofix	movem.l	d1,-(sp)
	move.l	a4,d1
	cmpi.b	#$d8,d1
	beq	fixleft
	cmpi.b	#$d0,d1
	beq	fixleft
	cmpi.b	#$c8,d1
	beq	fixright
	cmpi.b	#$c0,d1
	beq	fixright
	cmpi.b	#$b8,d1
	beq	fixright
	cmpi.b	#$b0,d1
	beq	fixright

fixleft	movem.l	d0,-(sp)
	moveq	#0,d0
	move.w	(currentvol),d0
	mulu.w	(lv),d0
	bra	divide

fixright	movem.l	d0,-(sp)
	moveq	#0,d0
	move.w	(currentvol),d0
	mulu.w	(rv),d0
divide	mulu.w	(mv),d0	
	lsl.l	#4,d0
	swap.w	d0
	btst.l	#3,d1
	bne	fixsave
	move.w	d0,(8,a4)
	bra	getout
fixsave	move.w	d0,(a4)
getout	movem.l	(sp)+,d0
	movem.l	(sp)+,d1
	rts

np_datastart	dc.l	0
np_block	dcb.l	19,0
np_voidat1	dcb.l	32,0
pad	dc.l	0
	END
