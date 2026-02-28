; STARTREKKER 1.2     8 CHANNEL REPLAYER

; BY BJOERN WESEN / EXOLON OF FAIRLIGHT


; This player takes quite a lot of rastertime... (And it could use a
; bit more optimizing) But I made it so no one should complain.
; To use, call mt8_init, and call mt8_music first among your raster
; routines. mt8_music waits for the raster itself, so you should not
; do that. This is important, again, call mt8_music first and then your
; own routines. To finish, call mt8_end.

; NOTE! DON'T call mt8_music from a vblank interrupt. In fact, shut off
; all interrupts when using this player... 

; The mt8_data doesn't have to be in CHIP mem, it can be as well in
; fast mem.

; HOWEVER the mt8_buf0 and others have to reside in CHIP mem. Therefore
; the ORG below.


mt8_data:	EQU	$40000	

	ORG	$35000
	LOAD	$35000

TESTPLAY:
	move.w	#$4000,$dff09a	
	bsr	mt8_init
loop:	bsr	mt8_music
	btst	#6,$bfe001
	bne.s	loop
	bsr	mt8_end
	move.w	#$c000,$dff09a
	rts

mt8_init:
	lea	mt8_data+$3b8,a1
	moveq	#$7f,d0
	moveq	#0,d1
mt8_l1:	move.l	d1,d2
	subq.w	#1,d0
mt8_l2:	move.b	(a1)+,d1
	cmp.b	d2,d1
	bgt.s	mt8_l1
	dbra	d0,mt8_l2
	addq.b	#2,d2

	lea	mt8_samplestarts,a1
	lsl.l	#8,d2
	lsl.l	#2,d2
	lea	mt8_data,a2
	lea	42(a2),a0
	add.l	d2,a2
	add.w	#$43c,a2
	moveq	#31,d0
mt8_il:	move.l	a2,(a1)+
	moveq	#0,d1
	move.w	(a0),d1
	add.l	d1,d1
	add.l	d1,a2
	add.w	#$1e,a0
	dbra	d0,mt8_il

	lea	mt8_buf0,a0
	move.w	#697,d0
mt8_clr:clr.l	(a0)+
	dbra	d0,mt8_clr

	move.w	#6,mt8_speed
	move.w	#1,mt8_speedcnt
	clr.w	mt8_songpos
	clr.w	mt8_doublebuf
	bsr	mt8_gtsongpos
	move.w	#$f,$dff096
	move.l	#mt8_buf0,$dff0a0
	move.l	#mt8_buf1,$dff0b0
	move.l	#mt8_buf2,$dff0c0
	move.l	#mt8_buf3,$dff0d0
	move.w	#313,d0
	move.w	d0,$dff0a4
	move.w	d0,$dff0b4
	move.w	d0,$dff0c4
	move.w	d0,$dff0d4
	move.w	#227,d0
	move.w	d0,$dff0a6
	move.w	d0,$dff0b6
	move.w	d0,$dff0c6
	move.w	d0,$dff0d6
	moveq	#64,d0
	move.w	d0,$dff0a8
	move.w	d0,$dff0b8
	move.w	d0,$dff0c8
	move.w	d0,$dff0d8
mt8_fw2:move.l	$dff004,d0
	lsr.l	#8,d0
	and.w	#$1ff,d0
	cmp.w	#301,d0
	bne.s	mt8_fw2
	move.w	#$800f,$dff096
	rts

mt8_end:move.w	#$f,$dff096
	clr.w	$dff0a8
	clr.w	$dff0b8
	clr.w	$dff0c8
	clr.w	$dff0d8
	bclr	#1,$bfe001
	rts

mt8_music:
	move.l	$dff004,d0
	lsr.l	#8,d0
	and.w	#$1ff,d0
	cmp.w	#301,d0
	bne.s	mt8_music
	subq.w	#1,mt8_speedcnt
	beq.s	mt8_dor
	bra	mt8_zup
mt8_dor:move.w	mt8_speed,mt8_speedcnt
	add.l	#16,mt8_trackpos
	add.l	#16,mt8_trackpos2
	lea	mt8_samplestarts-4,a0
	lea	mt8_data+42,a1		
	lea	mt8_voice1,a3
	lea	$dff0a8,a6
	lea	mt8_oldins,a4
	move.l	mt8_trackpos,a2
	moveq	#7,d7
mt8_voiceloop:
	moveq	#0,d0
	move.b	d0,d3
	move.b	2(a2),d0
	and.b	#$f,d0
	beq	mt8_ncm
	cmp.b	#$f,d0		; tempo change
	bne.s	mt8_nsc
	move.b	3(a2),mt8_speed+1
	bra	mt8_ncm
mt8_nsc:cmp.b	#$d,d0		; pattern break
	bne.s	mt8_npq
	st	mt8_pbflag
	bra	mt8_ncm
mt8_npq:cmp.b	#$c,d0		; volume change
	bne.s	mt8_nvc
	move.b	3(a2),1(a6)
	move.b	3(a2),25(a3)
	st	d3
	bra	mt8_ncm
mt8_nvc:cmp.b	#$1,d0		; picth up
	bne.s	mt8_nfu
	moveq	#0,d0
	move.b	3(a2),d0
	lsl.w	#7,d0
	add.l	d0,8(a3)
	bra	mt8_ncm
mt8_nfu:cmp.b	#$2,d0		; pitch down
	bne.s	mt8_nfd
	moveq	#0,d0
	move.b	3(a2),d0
	lsl.w	#7,d0
	sub.l	d0,8(a3)
	bra	mt8_ncm
mt8_nfd:cmp.b	#$a,d0		; volume slide
	bne.s	mt8_nvs
	move.w	(a2),d0
	and.w	#$fff,d0
	bne.s	mt8_n64
	move.w	#64,24(a3)
mt8_n64:moveq	#0,d0
	move.b	3(a2),d0
	move.w	d0,d1
	and.w	#$f,d0
	add.w	d0,d0
	and.w	#$f0,d1
	lsr.w	#3,d1
	add.w	d1,24(a3)
	sub.w	d0,24(a3)
	bpl.s	mt8_vm1
	clr.w	24(a3)
	bra.s	mt8_vm2
mt8_vm1:cmp.w	#64,24(a3)
	ble.s	mt8_vm2
	move.w	#64,24(a3)
mt8_vm2:move.w	24(a3),(a6)
	st	d3
	bra	mt8_ncm
mt8_nvs:cmp.b	#$4,d0		; vibrato
	bne	mt8_ncm
	move.b	3(a2),d0
	beq.s	mt8_nv2
	move.b	d0,26(a3)
	move.l	8(a3),28(a3)
mt8_nv2:move.b	27(a3),d0
	lsr.w	#2,d0
	and.w	#$1f,d0
	moveq	#0,d2
	move.l	a4,-(sp)
	lea	mt8_sin,a4
	move.b	(a4,d0.w),d2
	move.l	(sp)+,a4
	sub.b	#128,d2
	ext.w	d2
	move.b	26(a3),d0
	and.w	#$f,d0
	muls	d0,d2
	move.l	28(a3),d0
	add.l	d2,d0
	move.l	d0,8(a3)
	move.b	26(a3),d0
	lsr.w	#2,d0
	and.w	#$3c,d0
	add.b	d0,27(a3)
mt8_ncm:move.w	(a2),d0	
	and.w	#$fff,d0
	beq	mt8_nxt
	move.b	#$22,26(a3)
	tst.b	d3
	bne	mt8_vas
	move.w	#64,(a6)
	move.w	#64,24(a3)
mt8_vas:move.l	#227*16384,d1
	divu	d0,d1
	swap	d1
	clr.w	d1
	swap	d1
	add.l	d1,d1
	add.l	d1,d1
	move.l	d1,8(a3)
	move.l	d1,28(a3)
	moveq	#0,d0
	move.b	2(a2),d0
	lsr.b	#4,d0
	btst	#7,(a2)
	beq.s	mt8_n10
	add.b	#16,d0
mt8_n10:tst.w	d0
	bne.s	mt8_nsa
	move.w	(a4),d0
	bra.s	mt8_nas
mt8_nsa:move.w	d0,(a4)
mt8_nas:move.w	d0,d1
	subq.b	#1,d1
	add.w	d0,d0
	add.w	d0,d0
	move.l	(a0,d0.w),d2
	move.l	d2,(a3)
	mulu	#$1e,d1
	move.w	(a1,d1.w),d0
	add.l	d0,d0
	sub.l	#313,d0
	bpl.s	mt8_sma
	move.l	#313,d0
mt8_sma:add.l	d2,d0
	move.l	d0,4(a3)
	tst.w	4(a1,d1.w)
	beq.s	mt8_nir
	move.l	(a3),12(a3)
	moveq	#0,d0
	move.w	4(a1,d1.w),d0
	add.l	d0,d0
	sub.l	#313,d0
	bpl.s	mt8_sm2	
	move.l	#313,d0
mt8_sm2:add.l	d0,12(a3)
	move.w	6(a1,d1.w),d0
	add.l	d0,d0
	move.l	d0,16(a3)
	bra.s	mt8_nxt
mt8_nir:clr.l	12(a3)	
	clr.l	16(a3)	
	clr.l	20(a3)
mt8_nxt:cmp.w	#4,d7
	bne.s	mt8_chp
	lea	$dff0a8,a6
	move.l	mt8_trackpos2,a2
	bra.s	mt8_urk
mt8_chp:add.w	#$10,a6
	addq.w	#4,a2
mt8_urk:addq.w	#2,a4
	lea	36(a3),a3
	dbra	d7,mt8_voiceloop

	tst.w	mt8_pbflag
	bne.s	mt8_pb
	addq.w	#1,mt8_patpos
	cmp.w	#64,mt8_patpos
	bne.s	mt8_zup
mt8_pb:	clr.w	mt8_pbflag
	addq.w	#1,mt8_songpos
mt8_gtsongpos:
	clr.w	mt8_patpos
	lea	mt8_data,a0
	move.w	mt8_songpos,d0
	cmp.b	$3b6(a0),d0
	blt.s	mt8_grz
	clr.b	mt8_songpos
	move.b	$3b7(a0),mt8_songpos+1
mt8_grz:move.w	mt8_songpos,d0
	lea	mt8_data+$3b8,a0
	moveq	#0,d1
	move.b	(a0,d0.w),d1
	lsl.l	#8,d1
	lsl.l	#2,d1
	add.l	#mt8_data+$43c-16,d1
	move.l	d1,mt8_trackpos
	add.l	#1024,d1
	move.l	d1,mt8_trackpos2

mt8_zup:move.w	mt8_doublebuf,d5
	eor.w	#313,mt8_doublebuf
mt8_zip:lea	mt8_voices,a2
	movem.l	(a2)+,a3-a4
	lea	mt8_buf0,a5
	add.w	d5,a5
	bsr	mt8_makebuffer
	movem.l	(a2)+,a3-a4
	lea	mt8_buf1,a5
	add.w	d5,a5
	bsr	mt8_makebuffer
	movem.l	(a2)+,a3-a4
	lea	mt8_buf2,a5
	add.w	d5,a5
	bsr	mt8_makebuffer
	movem.l	(a2)+,a3-a4
	lea	mt8_buf3,a5
	add.w	d5,a5
	bsr	mt8_makebuffer
	rts

mt8_gs:	macro
	move.b	(a0,d0.w),d4
	ext.w	d4
	move.b	(a1,d1.w),d6
	ext.w	d6
	add.w	d6,d4
	asr.w	#1,d4		
	move.b	d4,(a5)+	
	swap	d0
	swap	d1
	add.l	d2,d0
	add.l	d3,d1
	swap	d0
	swap	d1
	endm

mt8_makebuffer:
	move.l	(a3),d0
	cmp.l	4(a3),d0
	bcs.s	mt8_sun
	tst.l	12(a3)
	beq.s	mt8_nr1
	move.l	12(a3),d0
	move.l	d0,(a3)
	move.l	16(a3),4(a3)
	add.l	d0,4(a3)
	bra.s	mt8_sun
mt8_nr1:clr.l	(a3)
	clr.l	4(a3)
	clr.l	8(a3)

mt8_sun:move.l	(a4),d0
	cmp.l	4(a4),d0
	bcs.s	mt8_pbx
	tst.l	12(a4)
	beq.s	mt8_nr2
	move.l	12(a4),d0
	move.l	d0,(a4)
	move.l	16(a4),4(a4)
	add.l	d0,4(a4)
	bra.s	mt8_pbx
mt8_nr2:clr.l	(a4)
	clr.l	4(a4)
	clr.l	8(a4)
mt8_pbx:move.l	(a3),a0
	move.l	8(a3),d2
	move.l	(a4),a1
	move.l	8(a4),d3
	moveq	#0,d0
	moveq	#0,d1

	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs
	mt8_gs

	add.w	d0,a0
	add.w	d1,a1
	move.l	a0,(a3)
	move.l	a1,(a4)
	rts

mt8_speed:	dc.w	0
mt8_speedcnt:	dc.w	0
mt8_songpos:	dc.w	0
mt8_trackpos:	dc.l	0
mt8_trackpos2:	dc.l	0
mt8_patpos:	dc.w	0
mt8_pbflag:	dc.w	0
mt8_doublebuf:	dc.w	0

mt8_voices:	dc.l	mt8_voice1,mt8_voice5,mt8_voice2,mt8_voice6
		dc.l	mt8_voice3,mt8_voice7,mt8_voice4,mt8_voice8

mt8_oldins:	blk.w	8,0

mt8_sin:	dc.b	128,153,177,199,219,234,246,254,255,254,246
		dc.b	234,219,199,177,153,128,103,79,57,37,22,9,2,0
		dc.b	2,9,22,37,57,79,103

mt8_samplestarts:
		blk.l	31,0

mt8_buf0:	blk.w	313,0
mt8_buf1:	blk.w	313,0
mt8_buf2:	blk.w	313,0
mt8_buf3:	blk.w	313,0
mt8_voice1:	blk.w	18,0
mt8_voice2:	blk.w	18,0
mt8_voice3:	blk.w	18,0
mt8_voice4:	blk.w	18,0
mt8_voice5:	blk.w	18,0
mt8_voice6:	blk.w	18,0
mt8_voice7:	blk.w	18,0
mt8_voice8:	blk.w	18,0


