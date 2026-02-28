*
* JamCracker V1.0 Replay routine, written by M. Gemmel
*
* Make sure you have read the ReadMe file on this disk too.
*
* This is not a demonstration source, showing how to write
* a song-play routine.  This source is merely ment for
* inclusion in other sources, or as assembly module for
* linkage with other programs.
*
* This source was modified for the MasterSeka V1.53 assembler
* and can be easily modified for other assemblers. (Not true, it's a lot of work - Arcade)
* The song should be inserted at 'mysong' near the bottom of
* this source, in chip memory.
*
*                  Modified for MasterSeka 1.53 by Arcade of CADCAM
* 
* Note from Arcade: I saved all of you who want to use the replayer
* with MasterSeka a lot of work. So leave this text here, I want the credits.

* This is the correct calling procedure
* Don't forget to save any important registers
* because I don't care

Start	bsr.s	pp_init			;First, initialize

here	bsr	pp_play			;Then, play every 1/50 sec.
hi	cmpi.b	#1,$dff006		;wait for raster
	bne.s	hi
	btst	#6,$bfe001		;Check left mouse button
	bne.s	here
	bsr	pp_end			;Finally, stop playing

	rts

it_name		equ	0
it_flags	equ	31
it_size		equ	32
it_address	equ	36
it_sizeof	equ	40

pt_size		equ	0
pt_address	equ	2
pt_sizeof	equ	6

nt_period	equ	0
nt_instr	equ	1
nt_speed	equ	2
nt_arpeggio	equ	3
nt_vibrato	equ	4
nt_phase	equ	5
nt_volume	equ	6
nt_porta	equ	7
nt_sizeof	equ	8

pv_waveoffset	equ	0
pv_dmacon	equ	2
pv_custbase	equ	4
pv_inslen	equ	8
pv_insaddress	equ	10
pv_peraddress	equ	14
pv_pers		equ	18
pv_por		equ	24
pv_deltapor	equ	26
pv_porlevel	equ	28
pv_vib		equ	30
pv_deltavib	equ	32
pv_vol		equ	34
pv_deltavol	equ	36
pv_vollevel	equ	38
pv_phase	equ	40
pv_deltaphase	equ	42
pv_vibcnt	equ	44
pv_vibmax	equ	45
pv_flags	equ	46
pv_sizeof	equ	48

*** This is the actual replay routine

wavesize	equ	$40

pp_init	lea	mysong,a0
	addq.w	#4,a0
	move.w	(a0)+,d0
	move.w	d0,d1
	move.l	a0,instable
	mulu	#it_sizeof,d0
	adda.w	d0,a0

	move.w	(a0)+,d0
	move.w	d0,d2
	move.l	a0,patttable
	mulu	#pt_sizeof,d0
	adda.w	d0,a0

	move.w	(a0)+,d0
	move.w	d0,songlen
	move.l	a0,songtable
	lsl.w	#1,d0
	adda.w	d0,a0

	movea.l	patttable,a1
	move.w	d2,d0
	subq.w	#1,d0
lab0	move.l	a0,pt_address(a1)
	move.w	pt_size(a1),d3
	mulu	#nt_sizeof*4,d3
	adda.w	d3,a0
	addq.w	#pt_sizeof,a1
	dbf	d0,lab0

	movea.l	instable,a1
	move.w	d1,d0
	subq.w	#1,d0
lab1	move.l	a0,it_address(a1)
	move.l	it_size(a1),d2
	adda.l	d2,a0
	adda.w	#it_sizeof,a1
	dbf	d0,lab1


	move.l	songtable,pp_songptr
	move.w	songlen,pp_songcnt
	movea.l	pp_songptr,a0
	move.w	(a0),d0
	mulu	#pt_sizeof,d0
	add.l	patttable,d0
	movea.l	d0,a0
	move.l	a0,pp_pattentry
	move.b	pt_size+1(a0),pp_notecnt
	move.l	pt_address(a0),pp_address
	move.b	#6,pp_wait
	move.b	#1,pp_waitcnt
	clr.w	pp_nullwave
	move.w	#$000f,$dff096

	lea	pp_variables,a0
	lea	$dff0a0,a1
	move.w	#$0001,d1
	move.w	#2*wavesize,d2
	move.w	#3,d0
lab2	clr.w	8(a1)
	move.w	d2,pv_waveoffset(a0)
	move.w	d1,pv_dmacon(a0)
	move.l	a1,pv_custbase(a0)
	move.l	#pp_periods,pv_peraddress(a0)
	move.w	#1019,pv_pers(a0)
	clr.w	pv_pers+2(a0)
	clr.w	pv_pers+4(a0)
	clr.l	pv_por(a0)
	clr.w	pv_porlevel(a0)
	clr.l	pv_vib(a0)
	clr.l	pv_vol(a0)
	move.w	#$0040,pv_vollevel(a0)
	clr.l	pv_phase(a0)
	clr.w	pv_vibcnt(a0)
	clr.b	pv_flags(a0)
	adda.w	#pv_sizeof,a0
	adda.w	#$0010,a1
	lsl.w	#1,d1
	addi.w	#wavesize,d2
	dbf	d0,lab2
	rts


pp_end	clr.w	$dff0a8
	clr.w	$dff0b8
	clr.w	$dff0c8
	clr.w	$dff0d8
	move.w	#$000f,$dff096
	rts


pp_play	subq.b	#1,pp_waitcnt
	bne.s	lab3
	bsr	pp_nwnt
	move.b	pp_wait,pp_waitcnt

lab3	lea	pp_variables,a1
	bsr.s	pp_uvs
	lea	pp_variables+pv_sizeof,a1
	bsr.s	pp_uvs
	lea	pp_variables+[2*pv_sizeof],a1
	bsr.s	pp_uvs
	lea	pp_variables+[3*pv_sizeof],a1


pp_uvs	movea.l	pv_custbase(a1),a0

lab4	move.w	pv_pers(a1),d0
	bne.s	lab5
	bsr	pp_rot
	bra.s	lab4
lab5	add.w	pv_por(a1),d0
	tst.w	pv_por(a1)
	beq.s	lab5c
	bpl.s	lab5a
	cmp.w	pv_porlevel(a1),d0
	bge.s	lab5c
	bra.s	lab5b
lab5a	cmp.w	pv_porlevel(a1),d0
	ble.s	lab5c
lab5b	move.w	pv_porlevel(a1),d0

lab5c	add.w	pv_vib(a1),d0
	cmpi.w	#135,d0
	bge.s	lab5d
	move.w	#135,d0
	bra.s	lab5e
lab5d	cmpi.w	#1019,d0
	ble.s	lab5e
	move.w	#1019,d0
lab5e	move.w	d0,6(a0)
	bsr	pp_rot


	move.w	pv_deltapor(a1),d0
	add.w	d0,pv_por(a1)
	cmpi.w	#-1019,pv_por(a1)
	bge.s	lab6
	move.w	#-1019,pv_por(a1)
	bra.s	lab7
lab6	cmpi.w	#1019,pv_por(a1)
	ble.s	lab7
	move.w	#1019,pv_por(a1)


lab7	tst.b	pv_vibcnt(a1)
	beq.s	lab8
	move.w	pv_deltavib(a1),d0
	add.w	d0,pv_vib(a1)
	subq.b	#1,pv_vibcnt(a1)
	bne.s	lab8
	neg.w	pv_deltavib(a1)
	move.b	pv_vibmax(a1),pv_vibcnt(a1)


lab8	move.w	pv_dmacon(a1),d0
	move.w	pv_vol(a1),8(a0)
	move.w	pv_deltavol(a1),d0
	add.w	d0,pv_vol(a1)
	tst.w	pv_vol(a1)
	bpl.s	lab9
	clr.w	pv_vol(a1)
	bra.s	lab10
lab9	cmpi.w	#$40,pv_vol(a1)
	ble.s	lab10
	move.w	#$40,pv_vol(a1)


lab10	btst	#1,pv_flags(a1)
	beq.s	lab12
	movea.l	pv_insaddress(a1),a0
	move.w	pv_waveoffset(a1),d0
	neg.w	d0
	lea	0(a0,d0.w),a2
	movea.l	a2,a3
	move.w	pv_phase(a1),d0
	lsr.w	#2,d0
	adda.w	d0,a3

	move.w	#wavesize-1,d0
lab11	move.b	(a2)+,d1
	ext.w	d1
	move.b	(a3)+,d2
	ext.w	d2
	add.w	d1,d2
	asr.w	#1,d2
	move.b	d2,(a0)+
	dbf	d0,lab11

	move.w	pv_deltaphase(a1),d0
	add.w	d0,pv_phase(a1)
	cmpi.w	#wavesize*4,pv_phase(a1)
	blt.s	lab12
	subi.w	#wavesize*4,pv_phase(a1)

lab12	rts


pp_rot	move.w	pv_pers(a1),d0
	move.w	pv_pers+2(a1),pv_pers(a1)
	move.w	pv_pers+4(a1),pv_pers+2(a1)
	move.w	d0,pv_pers+4(a1)
	rts


pp_nwnt	movea.l	pp_address,a0
	addi.l	#4*nt_sizeof,pp_address
	subq.b	#1,pp_notecnt
	bne.s	lab15

lab13	addq.l	#2,pp_songptr
	subq.w	#1,pp_songcnt
	bne.s	lab14
	move.l	songtable,pp_songptr
	move.w	songlen,pp_songcnt
lab14	movea.l	pp_songptr,a1
	move.w	(a1),d0
	mulu	#pt_sizeof,d0
	add.l	patttable,d0
	movea.l	d0,a1
	move.b	pt_size+1(a1),pp_notecnt
	move.l	pt_address(a1),pp_address


lab15	clr.w	pp_tmpdmacon
	lea	pp_variables,a1
	bsr	pp_nnt
	addq.w	#nt_sizeof,a0
	lea	pp_variables+pv_sizeof,a1
	bsr	pp_nnt
	addq.w	#nt_sizeof,a0
	lea	pp_variables+[2*pv_sizeof],a1
	bsr	pp_nnt
	addq.w	#nt_sizeof,a0
	lea	pp_variables+[3*pv_sizeof],a1
	bsr	pp_nnt


	move.w	pp_tmpdmacon,$dff096
	move.w	#300,d0
lab16	dbf	d0,lab16

	lea	pp_variables,a1
	bsr	pp_scr
	lea	pp_variables+pv_sizeof,a1
	bsr.s	pp_scr
	lea	pp_variables+[2*pv_sizeof],a1
	bsr.s	pp_scr
	lea	pp_variables+[3*pv_sizeof],a1
	bsr.s	pp_scr

	bset	#7,pp_tmpdmacon
	move.w	pp_tmpdmacon,$dff096
	move.w	#300,d0
lab17	dbf	d0,lab17


	move.l	pp_variables+pv_insaddress,$dff0a0
	move.w	pp_variables+pv_inslen,$dff0a4
	move.l	pp_variables+pv_sizeof+pv_insaddress,$dff0b0
	move.w	pp_variables+pv_sizeof+pv_inslen,$dff0b4
	move.l	pp_variables+[2*pv_sizeof]+pv_insaddress,$dff0c0
	move.w	pp_variables+[2*pv_sizeof]+pv_inslen,$dff0c4
	move.l	pp_variables+[3*pv_sizeof]+pv_insaddress,$dff0d0
	move.w	pp_variables+[3*pv_sizeof]+pv_inslen,$dff0d4

	rts


pp_scr	move.w	pp_tmpdmacon,d0
	and.w	pv_dmacon(a1),d0
	beq.s	lab18

	movea.l	pv_custbase(a1),a0
	move.l	pv_insaddress(a1),(a0)
	move.w	pv_inslen(a1),4(a0)
	move.w	pv_pers(a1),6(a0)
	btst	#0,pv_flags(a1)
	bne.s	lab18
	move.l	#pp_nullwave,pv_insaddress(a1)
	move.w	#1,pv_inslen(a1)

lab18	rts


pp_nnt	move.b	nt_period(a0),d1
	beq	lab22

	andi.l	#$000000ff,d1
	lsl.w	#1,d1
	addi.l	#pp_periods-2,d1
	movea.l	d1,a2

	btst	#6,nt_speed(a0)
	beq.s	lab21
	move.w	(a2),pv_porlevel(a1)
	bra	lab22


lab21	move.w	pv_dmacon(a1),d0
	or.w	d0,pp_tmpdmacon

	move.l	a2,pv_peraddress(a1)
	move.w	(a2),pv_pers(a1)
	move.w	(a2),pv_pers+2(a1)
	move.w	(a2),pv_pers+4(a1)

	clr.w	pv_por(a1)

	move.b	nt_instr(a0),d0
	ext.w	d0
	mulu	#it_sizeof,d0
	add.l	instable,d0
	movea.l	d0,a2
	tst.l	it_address(a2)
	bne.s	lab20
	move.l	#pp_nullwave,pv_insaddress(a1)
	move.w	#1,pv_inslen(a1)
	clr.b	pv_flags(a1)
	bra.s	lab22

lab20	movea.l	it_address(a2),a3
	btst	#1,it_flags(a2)
	bne.s	lab19a
	move.l	it_size(a2),d0
	lsr.l	#1,d0
	move.w	d0,pv_inslen(a1)
	bra.s	lab19
lab19a	move.w	pv_waveoffset(a1),d0
	adda.w	d0,a3
	move.w	#wavesize/2,pv_inslen(a1)
lab19	move.l	a3,pv_insaddress(a1)
	move.b	it_flags(a2),pv_flags(a1)
	move.w	pv_vollevel(a1),pv_vol(a1)


lab22	move.b	nt_speed(a0),d0
	andi.b	#$0f,d0
	beq.s	lab23
	move.b	d0,pp_wait


lab23	movea.l	pv_peraddress(a1),a2
	move.b	nt_arpeggio(a0),d0
	beq.s	lab25
	cmpi.b	#$ff,d0
	bne.s	lab24
	move.w	(a2),pv_pers(a1)
	move.w	(a2),pv_pers+2(a1)
	move.w	(a2),pv_pers+4(a1)
	bra.s	lab25
lab24	andi.b	#$0f,d0
	lsl.b	#1,d0
	ext.w	d0
	move.w	0(a2,d0.w),pv_pers+4(a1)
	move.b	nt_arpeggio(a0),d0
	lsr.b	#4,d0
	lsl.b	#1,d0
	ext.w	d0
	move.w	0(a2,d0.w),pv_pers+2(a1)
	move.w	(a2),pv_pers(a1)


lab25	move.b	nt_vibrato(a0),d0
	beq.s	lab27
	cmpi.b	#$ff,d0
	bne.s	lab26
	clr.l	pv_vib(a1)
	clr.b	pv_vibcnt(a1)
	bra.s	lab27
lab26	clr.w	pv_vib(a1)
	andi.b	#$0f,d0
	ext.w	d0
	move.w	d0,pv_deltavib(a1)
	move.b	nt_vibrato(a0),d0
	lsr.b	#4,d0
	move.b	d0,pv_vibmax(a1)
	lsr.b	#1,d0
	move.b	d0,pv_vibcnt(a1)


lab27	move.b	nt_phase(a0),d0
	beq.s	lab29
	cmpi.b	#$ff,d0
	bne.s	lab28
	clr.l	pv_phase(a1)
	bra.s	lab29
lab28	andi.b	#$0f,d0
	ext.w	d0
	move.w	d0,pv_deltaphase(a1)
	clr.w	pv_phase(a1)


lab29	move.b	nt_volume(a0),d0
	bne.s	lab29a
	btst	#7,nt_speed(a0)
	beq.s	lab33
	bra.s	lab30a
lab29a	cmpi.b	#$ff,d0
	bne.s	lab30
	clr.w	pv_deltavol(a1)
	bra.s	lab33
lab30	btst	#7,nt_speed(a0)
	beq.s	lab31
lab30a	move.b	d0,pv_vol+1(a1)
	move.b	d0,pv_vollevel+1(a1)
	clr.w	pv_deltavol(a1)
	bra.s	lab33
lab31	bclr	#7,d0
	beq.s	lab32
	neg.b	d0
lab32	ext.w	d0
	move.w	d0,pv_deltavol(a1)


lab33	move.b	nt_porta(a0),d0
	beq.s	lab36
	cmpi.b	#$ff,d0
	bne.s	lab34
	clr.l	pv_por(a1)
	bra.s	lab36
lab34	clr.w	pv_por(a1)
	btst	#6,nt_speed(a0)
	beq.s	lab34a
	move.w	pv_porlevel(a1),d1
	cmp.w	pv_pers(a1),d1
	bgt.s	lab34c
	neg.b	d0
	bra.s	lab34c
lab34a	bclr	#7,d0
	bne.s	lab35
	neg.b	d0
	move.w	#135,pv_porlevel(a1)
	bra.s	lab34c
lab35	move.w	#1019,pv_porlevel(a1)
lab34c	ext.w	d0
lab35a	move.w	d0,pv_deltapor(a1)


lab36	rts


* Replayer data

pp_periods	dc.w	1019,962,908,857,809,763,720,680,642,606,572,540
		dc.w	509,481,454,428,404,381,360,340,321,303,286,270
		dc.w	254,240,227,214,202,190,180,170,160,151,143,135
		dc.w	135,135,135,135,135,135,135,135,135
		dc.w	135,135,135,135,135,135

mysong		Incbin	"ST-00:Songs/DemoSong4"	;Insert your song here!

songlen		ds.w	1
songtable	ds.l	1
instable	ds.l	1
patttable	ds.l	1

pp_wait		ds.b	1
pp_waitcnt	ds.b	1
pp_notecnt	ds.b	1

		even
pp_address	ds.l	1
pp_songptr	ds.l	1
pp_songcnt	ds.w	1
pp_pattentry	ds.l	1
pp_tmpdmacon	ds.w	1
pp_variables	ds.b	4*48

pp_nullwave	ds.w	1

