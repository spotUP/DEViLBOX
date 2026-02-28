; Audio Sculpture Amiga ---* REPLAY ROUTINE *---
; For you Assembler freaks out there... 
; The Synchron Assembly / EXPOSE SoftWare
 
; Call mt_init, then mt_music each frame, call mt_end to stop

; NOTE! The mt_amwaveforms have to reside in CHIPMEM! Therefore the ORG
;       below...
 

; TESTPLAY will play the composition until the left mouse button is pressed.

mt_data:	EQU	$40000	; load your module here
mt_data2:	EQU	$60000	; load the .AS file here

	org	$38000
	load	$38000

TESTPLAY:
	bsr	mt_init

tp_loop:cmp.b	#$f8,$dff006	; synchronise with the raster beam
	bne.s	tp_loop
	bsr	mt_music
	btst	#6,$bfe001
	bne.s	tp_loop

	bsr	mt_end
	rts

mt_init:lea	mt_data,a0
	lea	$3b8(a0),a1
	moveq	#$7f,d0
	moveq	#0,d2
	moveq	#0,d1
mt_lop2:move.b	(a1)+,d1
	cmp.b	d2,d1
	ble.s	mt_lop
	move.l	d1,d2
mt_lop:	dbf	d0,mt_lop2
	addq.b	#1,d2

	asl.l	#8,d2
	asl.l	#2,d2
	lea	4(a1,d2.l),a2
	lea	mt_samplestarts(pc),a1
	add	#42,a0
	moveq	#$1e,d0
mt_lop3:clr.l	(a2)
	move.l	a2,(a1)+
	moveq	#0,d1
	move	(a0),d1
	clr.b	2(a0)
	asl.l	#1,d1
	add.l	d1,a2
	add	#30,a0
	dbf	d0,mt_lop3

	or.b	#2,$bfe001
	move.b	#6,mt_speed
	moveq	#0,d0
	lea	$dff000,a0
	move	d0,$a8(a0)
	move	d0,$b8(a0)
	move	d0,$c8(a0)
	move	d0,$d8(a0)
	clr.b	mt_songpos
	clr.b	mt_counter
	clr	mt_pattpos
	rts

mt_end:	clr	$dff0a8
	clr	$dff0b8
	clr	$dff0c8
	clr	$dff0d8
	move	#$f,$dff096
	rts

mt_music:
	lea	mt_data,a0
	addq.b	#1,mt_counter
	move.b	mt_counter(pc),d0
	cmp.b	mt_speed(pc),d0
	blt.s	mt_honk
	clr.b	mt_counter
	bra.s	mt_hulk
mt_honk:bsr	mt_nonew
	bra	mt_exit
mt_hulk:
	lea	mt_data,a0
	lea	$c(a0),a3
	lea	$3b8(a0),a2
	lea	$43c(a0),a0

	moveq	#0,d0
	moveq	#0,d1
	move.b	mt_songpos(pc),d0
	move.b	(a2,d0),d1
	lsl	#8,d1
	lsl	#2,d1
	add	mt_pattpos(pc),d1

	clr	mt_dmacon

	lea	$dff0a0,a5
	lea	mt_voice1(pc),a4
	bsr	mt_playvoice
	addq.l	#4,d1
	lea	$dff0b0,a5
	lea	mt_voice2(pc),a4
	bsr	mt_playvoice
	addq.l	#4,d1
	lea	$dff0c0,a5
	lea	mt_voice3(pc),a4
	bsr	mt_playvoice
	addq.l	#4,d1
	lea	$dff0d0,a5
	lea	mt_voice4(pc),a4
	bsr	mt_playvoice

	bsr	mt_wait
	move	mt_dmacon(pc),d0
	or	#$8000,d0
	move	d0,$dff096
	bsr	mt_wait
	lea	$dff000,a3
	lea	mt_voice1(pc),a4
	move.l	$a(a4),$a0(a3)
	move	$e(a4),$a4(a3)
	tst	30(a4)
	bne.s	mt_nov1
	move	$12(a4),$a8(a3)
mt_nov1:lea	mt_voice2(pc),a4
	move.l	$a(a4),$b0(a3)
	move	$e(a4),$b4(a3)
	tst	30(a4)
	bne.s	mt_nov2
	move	$12(a4),$b8(a3)
mt_nov2:lea	mt_voice3(pc),a4
	move.l	$a(a4),$c0(a3)
	move	$e(a4),$c4(a3)
	tst	30(a4)
	bne.s	mt_nov3
	move	$12(a4),$c8(a3)
mt_nov3:lea	mt_voice4(pc),a4
	move.l	$a(a4),$d0(a3)
	tst	30(a4)
	bne.s	mt_nov4
	move	$e(a4),$d4(a3)
	move	$12(a4),$d8(a3)

mt_nov4:add	#$10,mt_pattpos
	cmp	#$400,mt_pattpos
	bne.s	mt_exit
mt_next:clr	mt_pattpos
mt_nxt2:clr.b	mt_break
	lea	mt_data,a0
	addq.b	#1,mt_songpos
	and.b	#$7f,mt_songpos
	move.b	$3b6(a0),d0
	cmp.b	mt_songpos(pc),d0
	bne.s	mt_exit
	move.b	$3b7(a0),mt_songpos
mt_exit:tst.b	mt_break
	beq	mt_amhandler
	clr	mt_pattpos
	bra.s	mt_nxt2

mt_wait:move	#4,d3		
mt_wai2:move.b	$dff006,d2	
mt_wai3:cmp.b	$dff006,d2	
	beq.s	mt_wai3
	dbf	d3,mt_wai2	
	move	#8,d2
mt_wai4:dbf	d2,mt_wai4
	rts
	
mt_nonew:
	lea	mt_voice1(pc),a4
	lea	$dff0a0,a5
	bsr	mt_com
	lea	mt_voice2(pc),a4
	lea	$dff0b0,a5
	bsr	mt_com
	lea	mt_voice3(pc),a4
	lea	$dff0c0,a5
	bsr	mt_com
	lea	mt_voice4(pc),a4
	lea	$dff0d0,a5
	bsr	mt_com
	rts

mt_mulu:
	dc	0,$1e,$3c,$5a,$78,$96,$b4,$d2,$f0,$10e,$12c,$14a
	dc	$168,$186,$1a4,$1c2,$1e0,$1fe,$21c,$23a,$258,$276
	dc	$294,$2b2,$2d0,$2ee,$30c,$32a,$348,$366,$384,$3a2

mt_playvoice:
	move.l	(a0,d1.l),(a4)
	moveq	#0,d2
	move.b	2(a4),d2
	lsr.b	#4,d2
	move.b	(a4),d0
	and.b	#$f0,d0
	or.b	d0,d2
	beq	mt_oldinstr

	lea	mt_samplestarts-4(pc),a1
	move	d2,34(a4)
	move	d2,d0
	mulu	#120,d0
	add.l	#mt_data2+24,d0
	move.l	a0,-(sp)
	move.l	d0,a0
	clr	30(a4)
	moveq	#64,d0
	cmp	#"AM",(a0)
	bne.s	mt_noa9
	move	6(a0),d0
	lsr	#2,d0
	st	30(a4)
mt_noa9:move.l	(sp)+,a0
	asl	#2,d2
	move.l	(a1,d2.l),4(a4)
	lsr	#2,d2
	mulu	#30,d2
	move	(a3,d2),8(a4)
	move	2(a3,d2),$12(a4)
	moveq	#0,d3
	move	4(a3,d2),d3
	move	d0,-(sp)
	tst	d3
	beq.s	mt_noloop
	move.l	4(a4),d0
	asl	#1,d3
	add.l	d3,d0
	move.l	d0,$a(a4)
	move	4(a3,d2),d0
	add	6(a3,d2),d0
	move	d0,8(a4)
	bra.s	mt_hejaSverige
mt_noloop:
	move.l	4(a4),d0
	add.l	d3,d0
	move.l	d0,$a(a4)
mt_hejaSverige:
	move	6(a3,d2),$e(a4)
	move	(sp)+,d0
	mulu	$12(a4),d0
	lsr	#6,d0
	move	d0,8(a5)
		
mt_oldinstr:
	move	(a4),d0
	and	#$fff,d0
	beq	mt_com2
	tst	30(a4)
	bne.s	mt_rambo
	tst	8(a4)
	beq	mt_stopsound
	tst.b	$12(a4)
	bne	mt_stopsound
	move.b	2(a4),d0
	and.b	#$f,d0
	cmp.b	#5,d0
	beq	mt_setport
	cmp.b	#3,d0
	beq	mt_setport
mt_rambo:
	move	(a4),$10(a4)
	and	#$fff,$10(a4)
	move	$1a(a4),$dff096
	clr.b	$19(a4)

	tst	30(a4)
	beq.s	mt_noaminst
	move.l	a0,-(sp)
	move	34(a4),d0
	mulu	#120,d0
	add.l	#mt_data2+24,d0
	move.l	d0,a0
	moveq	#0,d0
	move	26(a0),d0
	lsl	#5,d0
	add.l	#mt_amwaveforms,d0
	move.l	d0,(a5)
	move	#16,4(a5)
	move.l	d0,$a(a4)
	move	#16,$e(a4)
	move	6(a0),32(a4)
	move.l	#1,36(a4)
	move	34(a0),d0
	move	d1,-(sp)
	move	$10(a4),d1
	lsl	d0,d1
	move	d1,$10(a4)
	move	d1,74(a4)
	move	d1,6(a5)
	move	(sp)+,d1
	move.l	(sp)+,a0
	bra.s	mt_juck

mt_noaminst:
	move.l	4(a4),(a5)
	move	8(a4),4(a5)
	move	$10(a4),6(a5)

mt_juck:move	$1a(a4),d0
	or	d0,mt_dmacon
	bra	mt_com2

mt_stopsound:
	move	$1a(a4),$dff096
	bra	mt_com2

mt_setport:
	move	(a4),d2
	and	#$fff,d2
	move	d2,$16(a4)
	move	$10(a4),d0
	clr.b	$14(a4)
	cmp	d0,d2
	beq.s	mt_clrport
	bge	mt_com2
	move.b	#1,$14(a4)
	bra	mt_com2
mt_clrport:
	clr	$16(a4)
	rts

mt_port:move.b	3(a4),d0
	beq.s	mt_port2
	move.b	d0,$15(a4)
	clr.b	3(a4)
mt_port2:
	tst	$16(a4)
	beq.s	mt_rts
	moveq	#0,d0
	move.b	$15(a4),d0
	tst.b	$14(a4)
	bne.s	mt_sub
	add	d0,$10(a4)
	move	$16(a4),d0
	cmp	$10(a4),d0
	bgt.s	mt_portok
	move	$16(a4),$10(a4)
	clr	$16(a4)
mt_portok:
	move	$10(a4),6(a5)
	move	$10(a4),74(a4)
mt_rts:	rts

mt_sub:	sub	d0,$10(a4)
	move	$16(a4),d0
	cmp	$10(a4),d0
	blt.s	mt_portok
	move	$16(a4),$10(a4)
	clr	$16(a4)
	move	$10(a4),6(a5)
	move	$10(a4),74(a4)
	rts

mt_sin:	dc.b	0,$18,$31,$4a,$61,$78,$8d,$a1,$b4,$c5,$d4,$e0,$eb,$f4
	dc.b	$fa,$fd
	dc.b	$ff,$fd,$fa,$f4,$eb,$e0,$d4,$c5,$b4,$a1,$8d,$78,$61
	dc.b	$4a,$31,$18

mt_vib:	move.b	$3(a4),d0
	beq.s	mt_vib2
	move.b	d0,$18(a4)

mt_vib2:move.b	$19(a4),d0
	lsr	#2,d0
	and	#$1f,d0
	moveq	#0,d2
	move.b	mt_sin(pc,d0),d2
	move.b	$18(a4),d0
	and	#$f,d0
	mulu	d0,d2
	lsr	#7,d2
	move	$10(a4),d0
	tst.b	$19(a4)
	bmi.s	mt_vibsub
	add	d2,d0
	bra.s	mt_vib3
mt_vibsub:
	sub	d2,d0
mt_vib3:move	d0,6(a5)
	move	d0,74(a4)
	move.b	$18(a4),d0
	lsr	#2,d0
	and	#$3c,d0
	add.b	d0,$19(a4)
	rts

mt_arplist:
	dc.b	0,1,2,0,1,2,0,1,2,0,1,2,0
	dc.b	1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1

mt_arp:	moveq	#0,d0
	move.b	mt_counter(pc),d0
	move.b	mt_arplist(pc,d0),d0
	beq.s	mt_arp0
	cmp.b	#2,d0
	beq.s	mt_arp2
mt_arp1:moveq	#0,d0
	move.b	3(a4),d0
	lsr.b	#4,d0
	bra.s	mt_arpdo
mt_arp2:moveq	#0,d0
	move.b	3(a4),d0
	and.b	#$f,d0
mt_arpdo:
	asl	#1,d0
	move	$10(a4),d1
	and	#$fff,d1
	lea	mt_periods(pc),a0
	moveq	#$24,d2
mt_arp3:cmp	(a0)+,d1
	bge.s	mt_arpfound
	dbf	d2,mt_arp3
mt_arp0:move	$10(a4),6(a5)
	move	$10(a4),74(a4)
	rts
mt_arpfound:
	move	-2(a0,d0),6(a5)
	move	-2(a0,d0),74(a4)
	rts

mt_normper:
	move	$10(a4),6(a5)
	move	$10(a4),74(a4)
	rts

mt_com:	move	2(a4),d0
	and	#$fff,d0
	beq.s	mt_normper
	move.b	2(a4),d0
	and.b	#$f,d0
	tst.b	d0
	beq.s	mt_arp
	cmp.b	#1,d0
	beq	mt_portup
	cmp.b	#2,d0
	beq	mt_portdown
	cmp.b	#$e,d0
	beq.s	mt_playmacro
	cmp.b	#3,d0
	beq	mt_port
	cmp.b	#4,d0
	beq	mt_vib
	cmp.b	#5,d0
	beq	mt_volport
	cmp.b	#6,d0
	beq	mt_volvib
	tst	30(a4)
	bne.s	mt_jug
	move	$10(a4),6(a5)
mt_jug:	cmp.b	#$a,d0
	beq	mt_volslide
	rts

mt_playmacro:
	tst.l	42(a4)
	beq.s	mt_nomacroq
	movem.l	d0-d4/a0-a4/a6,-(sp)
	lea	(a4),a6
	move.l	42(a6),a3
	lea	mt_macrocall,a4
	moveq	#0,d0
	move.b	3(a6),d0
	and.b	#$f,d0
	movem.l	46(a6),d1-d4/a0-a2
	jsr	(a3)
	movem.l	d1-d4/a0-a2,46(a6)
	movem.l	(sp)+,d0-d4/a0-a4/a6
mt_nomacroq:
	rts

mt_macrocall:
	bra	mt_Mstopdma
	bra	mt_Mstartdma
	bra	mt_Mgetperiod
	bra	mt_Mgetnote
	rts	
	nop

mt_Mstopdma:
	move	d0,-(sp)
	move	26(a6),$dff096
	move	#400,d0
mt_mw1:	dbf	d0,mt_mw1
	move	(sp)+,d0
	rts

mt_Mstartdma:
	move	d0,-(sp)
	move	26(a6),d0
	or	#$8000,d0
	move	d0,$dff096
	move	#400,d0
mt_mw2:	dbf	d0,mt_mw2
	move	(sp)+,d0
	rts

mt_Mgetperiod:
	move.l	a0,-(sp)
	lea	mt_periods,a0
	add	d0,d0
	move	(a0,d0),d0
	move.l	(sp)+,a0
	rts

mt_Mgetnote:
	movem.l	d1-d2/a0,-(sp)
	lea	mt_periods,a0
	moveq	#$37,d2
	moveq	#0,d1
mt_mtl:	cmp	(a0)+,d0
	bge.s	mt_Mgotnote
	addq	#1,d1
	dbf	d2,mt_mtl
mt_Mgotnote:
	move	d1,d0
	movem.l	(sp)+,d1-d2/a0
	rts

mt_portup:
	moveq	#0,d0
	move.b	3(a4),d0
	sub	d0,$10(a4)
	move	$10(a4),d0
	cmp	#$71,d0
	bpl.s	mt_portup2
	move	#$71,$10(a4)
mt_portup2:
	move	$10(a4),6(a5)
	move	$10(a4),74(a4)
	rts

mt_portdown:
	moveq	#0,d0
	move.b	3(a4),d0
	add	d0,$10(a4)
	move	$10(a4),d0
	cmp	#$358,d0
	bmi.s	mt_portdown2
	move	#$358,$10(a4)
mt_portdown2:
	move	$10(a4),6(a5)
	move	$10(a4),74(a4)
	rts

mt_volvib:
	 bsr	mt_vib2
	 bra.s	mt_volslide
mt_volport:
	 bsr	mt_port2

mt_volslide:
	moveq	#0,d0
	move.b	3(a4),d0
	lsr.b	#4,d0
	beq.s	mt_vol3
	add.b	d0,$13(a4)
	cmp.b	#$40,$13(a4)
	bmi.s	mt_vol2
	move.b	#$40,$13(a4)
mt_vol2:tst	30(a4)
	bne.s	mt_zex
	moveq	#0,d0
	move.b	$13(a4),d0
	move	d0,8(a5)
mt_zex:	rts

mt_vol3:move.b	3(a4),d0
	and.b	#$f,d0
	sub.b	d0,$13(a4)
	bpl.s	mt_vol4
	clr.b	$13(a4)
mt_vol4:tst	30(a4)
	bne.s	mt_zeq
	moveq	#0,d0
	move.b	$13(a4),d0
	move	d0,8(a5)
mt_zeq:	rts

mt_com2:move.b	$2(a4),d0
	and.b	#$f,d0
	cmp.b	#$e,d0
	beq.s	mt_startmacro
	cmp.b	#$d,d0
	beq.s	mt_pattbreak
	cmp.b	#$b,d0
	beq.s	mt_songjmp
	cmp.b	#$c,d0
	beq	mt_setvol
	cmp.b	#$f,d0
	beq	mt_setspeed
	rts

mt_startmacro:
	movem.l	d0-d4/a0-a4/a6,-(sp)
	lea	(a4),a6
	move.b	3(a6),d0
	and	#$f0,d0
	lsr.b	#4,d0
	mulu	#272,d0
	add.l	#32*120+mt_data2+144+16,d0
	move.l	d0,a0
	cmp	#$ABCD,(a0)
	beq.s	mt_skipmac
	move.l	42(a6),d1
	move.l	d0,42(a6)
	cmp.l	d0,d1
	bne.s	mt_resetM
	move	(a6),d0
	and	#$fff,d0
	beq.s	mt_skipmac
mt_resetM:
	clr.l	46(a6)
	clr.l	50(a6)
	clr.l	54(a6)
	clr.l	58(a6)
	clr.l	62(a6)
	clr.l	66(a6)
	clr.l	70(a6)
	bsr	mt_playmacro
mt_skipmac:
	movem.l	(sp)+,d0-d4/a0-a4/a6
	rts

mt_pattbreak:
	move.b	#1,mt_break
	rts

mt_songjmp:
	move.b	#1,mt_break
	move.b	3(a4),d0
	subq.b	#1,d0
	move.b	d0,mt_songpos
	rts

mt_setvol:
	cmp.b	#$40,3(a4)
	bls.s	mt_sv2
	move.b	#$40,3(a4)
mt_sv2:	moveq	#0,d0
	move.b	3(a4),d0
	move.b	d0,$13(a4)
	move	d0,8(a5)
	rts

mt_setspeed:
	moveq	#0,d0
	move.b	3(a4),d0
	cmp.b	#$1f,d0
	bls.s	mt_sp2
	moveq	#$1f,d0
mt_sp2:	tst	d0
	bne.s	mt_sp3
	moveq	#1,d0
mt_sp3:	move.b	d0,mt_speed
	rts

mt_amhandler:
	moveq	#3,d7
	lea	mt_voice1,a6
	lea	$dff0a0,a5
mt_amloop:
	tst	30(a6)
	beq	mt_anrp
	move	34(a6),d0
	mulu	#120,d0
	add.l	#mt_data2+24,d0
	move.l	d0,a0
	tst	38(a6)
	beq	mt_anrp
	cmp	#1,38(a6)
	bne.s	mt_anat
	move	32(a6),d0
	cmp	8(a0),d0
	beq.s	mt_aaeq
	cmp	8(a0),d0
	blt.s	mt_aaad
	move	10(a0),d0
	sub	d0,32(a6)
	move	32(a6),d0
	cmp	8(a0),d0
	bgt	mt_anxt
	move	8(a0),32(a6)
mt_aaeq:move	#2,38(a6)
	bra	mt_anxt
mt_aaad:move	10(a0),d0
	add	d0,32(a6)
	move	32(a6),d0
	cmp	8(a0),d0
	blt	mt_anxt
	move	8(a0),32(a6)
	bra.s	mt_aaeq
mt_anat:cmp	#2,38(a6)
	bne.s	mt_ana2
	move	32(a6),d0
	cmp	12(a0),d0
	beq.s	mt_a2eq
	cmp	12(a0),d0
	blt.s	mt_a2ad
	move	14(a0),d0
	sub	d0,32(a6)
	move	32(a6),d0
	cmp	12(a0),d0
	bgt	mt_anxt
	move	12(a0),32(a6)
mt_a2eq:move	#3,38(a6)
	bra	mt_anxt
mt_a2ad:move	14(a0),d0
	add	d0,32(a6)
	move	32(a6),d0
	cmp	12(a0),d0
	blt	mt_anxt
	move	12(a0),32(a6)
	bra.s	mt_a2eq
mt_ana2:cmp	#3,38(a6)
	bne.s	mt_andc
	move	32(a6),d0
	cmp	16(a0),d0
	beq.s	mt_adeq
	cmp	16(a0),d0
	blt.s	mt_adad
	move	18(a0),d0
	sub	d0,32(a6)
	move	32(a6),d0
	cmp	16(a0),d0
	bgt.s	mt_anxt
	move	16(a0),32(a6)
mt_adeq:move	#4,38(a6)
	move	20(a0),40(a6)
	bra.s	mt_anxt
mt_adad:move	18(a0),d0
	add	d0,32(a6)
	move	32(a6),d0
	cmp	16(a0),d0
	blt.s	mt_anxt
	move	16(a0),32(a6)
	bra.s	mt_adeq
mt_andc:cmp	#4,38(a6)
	bne.s	mt_anst
	subq	#1,40(a6)
	bpl.s	mt_anxt
	move	#5,38(a6)
	bra.s	mt_anxt
mt_anst:move	24(a0),d0
	sub	d0,32(a6)
	bpl.s	mt_anxt
	clr.l	30(a6)
	clr	38(a6)
	move	26(a6),$dff096
mt_anxt:move	32(a6),d0
	lsr	#2,d0
	move	$12(a6),d1
	mulu	d1,d0
	lsr	#6,d0
	move	d0,8(a5)
	
	move	28(a0),d0
	add	d0,74(a6)
	add	d0,$10(a6)

	move	30(a0),d1
	beq.s	mt_nvib
	move	36(a6),d2
	moveq	#0,d3
	cmp	#360,d2
	blt.s	mt_vibq
	sub	#360,d2
	moveq	#1,d3
mt_vibq:lea	mt_amsinus,a2
	muls	(a2,d2),d1
	asr	#7,d1
	tst	d3
	beq.s	mt_nvib
	neg	d1
mt_nvib:add	74(a6),d1
	move	d1,6(a5)
	move	32(a0),d0
	add	d0,d0
	add	d0,36(a6)
	cmp	#720,36(a6)
	blt.s	mt_anrp
	sub	#720,36(a6)
mt_anrp:lea	$10(a5),a5
	lea	76(a6),a6
	dbf	d7,mt_amloop

	lea	mt_noisewave,a0
	move	#$7327,d0
	moveq	#31,d1
mt_nlop:move.b	d0,(a0)+
	add.b	$dff007,d0
	eor	#124,d0
	rol	#3,d0
	dbf	d1,mt_nlop
	rts

mt_amwaveforms:
	dc.b	0,25,49,71,90,106,117,125
	dc.b	127,125,117,106,90,71,49,25
	dc.b	0,-25,-49,-71,-90,-106,-117
	dc.b	-125,-127,-125,-117,-106
	dc.b	-90,-71,-49,-25
	dc.b	-128,-120,-112,-104,-96,-88,-80,-72,-64,-56,-48
	dc.b	-40,-32,-24,-16,-8,0,8,16,24,32,40,48,56,64,72,80
	dc.b	88,96,104,112,120
	dcb.b	16,-128
	dcb.b	16,127
mt_noisewave:
	dcb.b	32,0

mt_amsinus:
	dc	0,2,4,6,8,$b,$d,$f,$11,$14,$16,$18,$1a,$1c,$1e,$21
	dc	$23,$25,$27,$29,$2b,$2d,$2f,$32,$34,$36,$38,$3a,$3c,$3e
	dc	$3f,$41,$43,$45,$47,$49,$4b,$4d,$4e,$50,$52,$53,$55,$57
	dc	$58,$5a,$5c,$5d,$5f,$60,$62,$63,$64,$66,$67,$68,$6a,$6b
	dc	$6c,$6d,$6e,$6f,$71,$72,$73,$74,$74,$75,$76,$77,$78,$79
	dc	$79,$7a,$7b,$7b,$7c,$7c,$7d,$7d,$7e,$7e,$7e,$7f,$7f,$7f
	dc	$7f,$7f,$7f,$7f,$80,$7f,$7f,$7f,$7f,$7f,$7f,$7f,$7e,$7e
	dc	$7e,$7d,$7d,$7c,$7c,$7b,$7b,$7a,$79,$79,$78,$77,$76,$75
	dc	$74,$73,$72,$71,$6f,$6e,$6d,$6c,$6b,$6a,$68,$67,$66,$64
	dc	$63,$62,$60,$5f,$5d,$5c,$5a,$58,$57,$55,$53,$52,$50,$4e
	dc	$4d,$4b,$49,$47,$45,$43,$41,$40,$3e,$3c,$3a,$38,$36,$34
	dc	$32,$2f,$2d,$2b,$29,$27,$25,$23,$21,$1e,$1c,$1a,$18,$16
	dc	$14,$11,$f,$d,$b,$8,$6,$4,$2,0

mt_periods:
	dc	$358,$328,$2fa,$2d0,$2a6,$280,$25c,$23a,$21a,$1fc,$1e0
	dc	$1c5,$1ac,$194,$17d,$168,$153,$140,$12e,$11d,$10d,$fe
	dc	$f0,$e2,$d6,$ca,$be,$b4,$aa,$a0,$97,$8f,$87
	dc	$7f,$78,$71,0

mt_speed:	dc.b	6
mt_counter:	dc.b	0
mt_pattpos:	dc	0
mt_songpos:	dc.b	0
mt_break:	dc.b	0
mt_dmacon:	dc	0
mt_samplestarts:dcb.l	31,0
mt_voice1:	dcb	13,0
		dc	1
		dcb	24,0
mt_voice2:	dcb	13,0
		dc	2
		dcb	24,0
mt_voice3:	dcb	13,0
		dc	4
		dcb	24,0
mt_voice4:	dcb	13,0
		dc	8
		dcb	24,0

