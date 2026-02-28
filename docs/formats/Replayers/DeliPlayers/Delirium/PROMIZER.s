
	incdir	"Includes:"
	include "misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: PROMIZER 0.1a player module V0.2 (14 Aug 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,0
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_Interrupt,Int
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_Volume,SetVol
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'PROMIZER',0
CName	dc.b 'Frank Hülsmann,',10
	dc.b 'Testversion by Delirium',0
	even

*-----------------------------------------------------------------------*
;
; Testet, ob es sich um ein PROMIZER-Modul handelt

Chk
	move.l	dtg_ChkData(a5),a0		; ptr to module

	moveq	#-1,d0				; Modul nicht erkannt (default)

	move.l	762(a0),d3			; get patternlenght
	beq.s	ChkEnd
	addi.l	#762,d3				; add pattern offset

	moveq	#31-1,d2			; #instr
ChkSamp
	moveq	#0,d1
	move.w	(a0),d1				; samplelength in words
	add.l	d1,d1				; samplelength in bytes
	add.l	d1,d3				; add length of sample
	addq.l	#8,a0				; next sample info
	dbf	d2,ChkSamp

	sub.l	dtg_ChkSize(a5),d3		; test size of module
	cmpi.l	#-64,d3				; - 64 Bytes
	blt.s	ChkEnd				; too small
	cmpi.l	#+64,d3				; + 64 Bytes
	bgt.s	ChkEnd				; too big

	moveq	#0,d0				; Modul erkannt
ChkEnd
	rts

*-----------------------------------------------------------------------*
;
;Interrupt für Replay

Int
	movem.l	d0-d7/a0-a6,-(sp)
	bsr	mt_music			; DudelDiDum
	movem.l	(sp)+,d0-d7/a0-a6
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,mt_dataptr

	move.l	dtg_AudioAlloc(a5),a0		; Function
	jsr	(a0)				; returncode is already set !
	rts

*-----------------------------------------------------------------------*
;
; End Player

EndPlay
	move.l	dtg_AudioFree(a5),a0		; Function
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Init Sound

InitSnd
	bsr	mt_init
	rts

*-----------------------------------------------------------------------*
;
; End Sound

EndSnd
	bsr	mt_end
	rts

*-----------------------------------------------------------------------*
;
; Set new volume

SetVol
	move.w	dtg_SndVol(a5),d0
	move.b	d0,mt_maxvol
	rts

*-----------------------------------------------------------------------*
;
; Promizer - Replay

;------------------------------------------------------------------------------
;                      PROMIZER PLAYER V0.1a ... MAY 1992
;------------------------------------------------------------------------------
;                           coded by MC68000 of TECH
;                                Frank Hülsmann
;                             Timmerscheidtstr. 14
;                             4400 Münster/Germany
;------------------------------------------------------------------------------
;
; MODIFY 'mt_maxvol' (0-64 ... size : byte) TO SET MAXIMUM ABSOLUT VOLUME !!!
;
; THIS PLAYER WORKS WITH FINETUNED SAMPLES BY USING A MINIMUM OF RASTER TIME !!
; THE CODE BASED ON THE PROTRACKER V1.1b REPLAYER BY ZAP/AMIGA FREELANCERS, BUT
; IT'S MAX.400% FASTER AND FULLY PC-RELOCATIBLE ...
;
;------------------------------------------------------------------------------

mt_level6=0			;1=level 6 interupt on (faster dmareg. init)
mt_dmawaiter=4			;no.of rasterlines waiting for dma

; INIT_PLAYING ----------------------------------------------------------------

mt_init	movem.l	d0-a6,-(a7)
	lea	mt_pm(pc),a5
	move.l	mt_dataptr(pc),a0

	lea	762(a0),a1			;patternlenght
	move.l	(a1)+,d0
	add.l	d0,a1				;samplestarts
			
	lea	mt_samplestarts(pc),a2
	moveq	#30,d1
mt_samploop
	moveq	#0,d0
	move.w	(a0),d0				;samplelength in words
	add.l	d0,d0				;samplelength in bytes
	move.l	a1,(a2)+			;save sample adress
	add.l	d0,a1				;next sample
	addq.l	#8,a0				;next sample info
	dbf	d1,mt_samploop

;	or.b	#2,$bfe001			;filter off
	move.b	#6,mt_speed-mt_pm(a5)
	clr.b	mt_counter-mt_pm(a5)
	clr.w	mt_songpos-mt_pm(a5)
	clr.w	mt_patternpos-mt_pm(a5)
	ifne mt_level6
	move.l	$78.w,mt_oldirq-mt_pm(a5)	;save old_irq
	endc
	lea	$dff096,a0
	clr.w	$a8-$96(a0)
	clr.w	$b8-$96(a0)
	clr.w	$c8-$96(a0)
	clr.w	$d8-$96(a0)			;volume voice 1-4 = 0
	moveq	#$f,d0
	move.w	d0,(a0)				;no sound_dma

; CREATE PERIOD MULTAB (FOR FASTER FINE_TUNING)

	moveq	#15,d7
	moveq	#0,d0
	moveq	#72,d1
mt_mulloop2
	move.w	d0,(a5)+
	add.w	d1,d0
	dbf	d7,mt_mulloop2

; CALCULATE RELATIVE JUMP ADRESSES IN JUMPTABS (FOR PC-COMPATIBLE CODE !!!)
;
;	lea	mt_init(pc),a0
;	move.l	a0,d0
;	lea	mt_jumptab1(pc),a0
;	lea	mt_jumptab2(pc),a1
;	lea	mt_jumptab3(pc),a2
;	lea	mt_jumptab4(pc),a3
;	moveq	#15,d1
;mt_jumpcalcloop
;	add.l	d0,(a0)+
;	add.l	d0,(a1)+
;	add.l	d0,(a2)+
;	add.l	d0,(a3)+
;	dbf	d1,mt_jumpcalcloop

	ifne mt_level6
	lea	mt_irqpointer(pc),a0
	add.l	d0,(a0)
	endc
	
	movem.l	(a7)+,d0-a6
	rts

; END_PLAYING -----------------------------------------------------------------

mt_end	movem.l	d0/a0,-(a7)
	ifne mt_level6
	move.l	mt_oldirq(pc),$78.w
	endc
	lea	$dff096,a0
	clr.w	$a8-$96(a0)
	clr.w	$b8-$96(a0)
	clr.w	$c8-$96(a0)
	clr.w	$d8-$96(a0)
	moveq	#$f,d0
	move.w	d0,(a0)
	movem.l	(a7)+,d0/a0
	rts

; SOUND_PLAYER ---------------------------------------------------------------

; kills d0-d7/a0-a6 !!!!

mt_music
	moveq	#$f,d5				;ander com_low
	moveq	#-16,d6				;ander com	
	lea	mt_pm(pc),a2

	addq.b	#1,mt_counter-mt_pm(a2)
	move.b	mt_counter-mt_pm(a2),d0
	cmp.b	mt_speed-mt_pm(a2),d0
	blo.b	mt_nonewallchannels
	clr.b	mt_counter-mt_pm(a2)
	tst.b	mt_pattdeltime2-mt_pm(a2)
	beq.b	mt_getnewnote
	bsr.b	mt_nonewallchannels
	bra.w	mt_dskip

mt_nonewallchannels
	lea	$dff0a0,a5
	lea	mt_chan1temp(pc),a6
	bsr.w	mt_checkefx
	lea	$10(a5),a5
	lea	48(a6),a6
	bsr.w	mt_checkefx
	lea	$10(a5),a5
	lea	48(a6),a6
	bsr.w	mt_checkefx
	lea	$10(a5),a5
	lea	48(a6),a6
	bsr.w	mt_checkefx
	bra.w	mt_nonewposyet

mt_getnewnote
	move.l	mt_dataptr(pc),a0
	move.l	a0,a3				;sample infos
	lea	250(a0),a4			;patterpositions
	lea	766(a0),a0			;patterndata
	moveq	#0,d1
	move.w	mt_songpos(pc),d0
	move.l	(a4,d0.w),d1
	add.w	mt_patternpos(pc),d1

	clr.w	mt_dmacontemp-mt_pm(a2)

	lea	$dff0a0,a5
	lea	mt_chan1temp(pc),a6
	bsr.b	mt_playvoice
	lea	$10(a5),a5
	lea	48(a6),a6
	bsr.b	mt_playvoice
	lea	$10(a5),a5
	lea	48(a6),a6
	bsr.b	mt_playvoice
	lea	$10(a5),a5
	lea	48(a6),a6
	bsr.b	mt_playvoice
	bra.w	mt_setdma

mt_playvoice
	tst.l	(a6)
	bne.b	mt_plvskip
	bsr.w	mt_pernop
mt_plvskip
	move.l	(a0,d1.l),d2
	eor.l	d6,d2
	move.l	d2,(a6)
	addq.l	#4,d1
	moveq	#0,d2
	move.l	d2,d3
	move.b	2(a6),d2
	lsr.b	#4,d2
	move.b	(a6),d0
	and.b	d6,d0
	or.b	d0,d2
	beq.w	mt_setregs
	lea	mt_samplestarts(pc),a1
	subq.w	#1,d2
	lsl.w	#2,d2
	move.w	d2,d4
	add.w	d4,d4	
	move.w	(a3,d4.w),8(a6)
	move.w	(a3,d4.w),40(a6)		;sample lenght in words
	move.l	(a1,d2.w),4(a6)			;sample adress

	moveq	#0,d0
	move.b	2(a3,d4.w),d0
	move.b	d0,18(a6)			;set finetune number
	add.w	d0,d0
	move.w	(a2,d0.w),d0
	lea	mt_periodtable(pc),a4
	add.l	d0,a4
	move.l	a4,44(a6)			;save periodtable


	move.b	3(a3,d4.w),d0			;sample volume
	cmp.b	mt_maxvol(pc),d0
	bls.b	mt_nv
	move.b	mt_maxvol(pc),d0		;cut volume -> no relative
mt_nv						;calculation here ...
	move.b	d0,19(a6)

	move.w	4(a3,d4.w),d3 			;get repeat
	beq.b	mt_noloop
	move.l	4(a6),d2			;get start
	add.w	d3,d3
	add.l	d3,d2				;add repeat
	move.l	d2,10(a6)
	move.l	d2,36(a6)
	move.w	4(a3,d4.w),d0			;get repeat
	add.w	6(a3,d4.w),d0			;add replen
	move.w	d0,8(a6)
	move.w	6(a3,d4.w),14(a6)		;save replen
	move.b	19(a6),9(a5)			;init volume
	bra.b	mt_setregs
mt_noloop
	move.l	4(a6),d2
	add.l	d3,d2
	move.l	d2,10(a6)
	move.l	d2,36(a6)
	move.w	6(a3,d4.w),14(a6)		;save replen
	move.b	19(a6),9(a5)
mt_setregs
	move.w	(a6),d0
	and.w	#$0fff,d0
	beq.w	mt_checkmoreefx			;if no note
	move.w	2(a6),d0
	and.w	#$0ff0,d0
	cmp.w	#$0e50,d0
	beq.b	mt_dosetfinetune
	moveq	#0,d0
	move.b	2(a6),d0
	and.b	d5,d0
	lsl.b	#2,d0
	move.l	mt_jumptab3(pc,d0.w),a4
	jmp	(a4)

mt_jumptab3	
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_chktoneporta
	dc.l	mt_setperiod
	dc.l	mt_chktoneporta
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_moreplusperiod
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_setperiod
	dc.l	mt_setperiod	; ???

mt_moreplusperiod
	bsr.w	mt_checkmoreefx
	bra.b	mt_setperiod

mt_dosetfinetune
	bsr.w	mt_setfinetune
	bra.b	mt_setperiod

mt_chktoneporta
	bsr.w	mt_settoneporta
	bra.w	mt_checkmoreefx

mt_setperiod
	move.w	(a6),d2
	and.w	#$0fff,d2		; period 'ausanden'
	move.w	d2,16(a6)		; set normal period
	move.w	2(a6),d0
	and.w	#$0ff0,d0
	cmp.w	#$0ed0,d0 		; notedelay
	beq.w	mt_checkmoreefx

	move.w	20(a6),$dff096
	btst	#2,30(a6)
	bne.b	mt_vibnoc
	clr.b	27(a6)
mt_vibnoc
	btst	#6,30(a6)
	bne.b	mt_trenoc
	clr.b	29(a6)
mt_trenoc
	move.l	4(a6),(a5)		; init start
	move.w	8(a6),4(a5)		; init length
	move.w	16(a6),6(a5)		; init period
	
	move.w	20(a6),d0
	or.w	d0,mt_dmacontemp-mt_pm(a2)
	bra.w	mt_checkmoreefx
 
mt_setdma
	ifeq mt_level6
	bsr.w	mt_dmawait
	move.w	mt_dmacontemp(pc),d0
	or.w	#$8000,d0
	move.w	d0,$dff096
	bsr.w	mt_dmawait
	lea	$dff0a0,a5
	lea	mt_chan1temp(pc),a6
	move.l	10(a6),(a5)
	move.w	14(a6),4(a5)
	move.l	58(a6),$10(a5)
	move.w	62(a6),$14(a5)
	move.l	106(a6),$20(a5)
	move.w	110(a6),$24(a5)
	move.l	154(a6),$30(a5)
	move.w	158(a6),$34(a5)
	elseif

	lea	$bfd000,a3
	move.b	#$7f,$d00(a3)
	move.w	#$2000,$dff09c
	move.w	#$a000,$dff09a
	lea	mt_irq1(pc),a4
	move.l	a4,$78.w
	moveq	#0,d0
	move.b	d0,$e00(a3)
	move.b	#$a8,$400(a3)
	move.b	d0,$500(a3)
	move.b	#$11,$e00(a3)
	move.b	#$81,$d00(a3)
	or.w	#$8000,mt_dmacontemp-mt_pm(a2)
	bra.w	mt_dskip


mt_irq1
	tst.b	$bfdd00
	move.w	mt_dmacontemp(pc),$dff096
	move.w	#$2000,$dff09c
	move.l	mt_irqpointer(pc),$78.w
	rte

mt_irqpointer	dc.l	mt_irq2-mt_init

mt_irq2
	tst.b	$bfdd00
	movem.l	a5-a6,-(a7)

	lea	$dff0a0,a5
	lea	mt_chan1temp(pc),a6
	move.l	10(a6),(a5)
	move.w	14(a6),4(a5)
	move.l	58(a6),$10(a5)
	move.w	62(a6),$14(a5)
	move.l	106(a6),$20(a5)
	move.w	110(a6),$24(a5)
	move.l	154(a6),$30(a5)
	move.w	158(a6),$34(a5)
	clr.b	$bfde00
	move.b	#$7f,$bfdd00
	move.w	#$2000,$dff09c
	movem.l	(a7)+,a5-a6
	rte
	endc

mt_dskip
	add.w	#16,mt_patternpos-mt_pm(a2)
	move.b	mt_pattdeltime(pc),d0
	beq.b	mt_dskc
	move.b	d0,mt_pattdeltime2-mt_pm(a2)
	clr.b	mt_pattdeltime-mt_pm(a2)
mt_dskc	tst.b	mt_pattdeltime2-mt_pm(a2)
	beq.b	mt_dska
	subq.b	#1,mt_pattdeltime2-mt_pm(a2)
	beq.b	mt_dska
	sub.w	#16,mt_patternpos-mt_pm(a2)
mt_dska	tst.b	mt_pbreakflag-mt_pm(a2)
	beq.b	mt_nnpysk
	sf	mt_pbreakflag-mt_pm(a2)
	moveq	#0,d0
	move.b	mt_pbreakpos(pc),d0
	clr.b	mt_pbreakpos-mt_pm(a2)
	lsl.w	#4,d0
	move.w	d0,mt_patternpos-mt_pm(a2)
mt_nnpysk
	cmp.w	#1024,mt_patternpos-mt_pm(a2)
	blo.b	mt_nonewposyet
mt_nextposition	
	moveq	#0,d0
	move.b	mt_pbreakpos(pc),d0
	lsl.w	#4,d0
	move.w	d0,mt_patternpos-mt_pm(a2)
	clr.b	mt_pbreakpos-mt_pm(a2)
	clr.b	mt_posjumpflag-mt_pm(a2)
	addq.w	#4,mt_songpos-mt_pm(a2)
	and.w	#511,mt_songpos-mt_pm(a2)
	move.w	mt_songpos(pc),d1
	move.l	mt_dataptr(pc),a0
	cmp.w	248(a0),d1
	blo.b	mt_nonewposyet
	clr.w	mt_songpos-mt_pm(a2)
mt_nonewposyet	
	tst.b	mt_posjumpflag-mt_pm(a2)
	bne.b	mt_nextposition
	rts

mt_checkefx
	bsr.w	mt_updatefunk
	move.w	2(a6),d0
	and.w	#$0fff,d0
	beq.b	mt_pernop
	moveq	#0,d0
	move.b	2(a6),d0
	and.b	d5,d0
	move.w	d0,d2
	lsl.b	#2,d2	
	move.l	mt_jumptab1(pc,d2.w),a4
	jmp	(a4)

mt_jumptab1
	dc.l	mt_arpeggio
	dc.l	mt_portaup
	dc.l	mt_portadown
	dc.l	mt_toneportamento
	dc.l	mt_vibrato
	dc.l	mt_toneplusvolslide
	dc.l	mt_vibratoplusvolslide
	dc.l	mt_setback
	dc.l	mt_setback
	dc.l	mt_setback
	dc.l	mt_setback
	dc.l	mt_setback
	dc.l	mt_setback
	dc.l	mt_setback
	dc.l	mt_e_commands
	dc.l	mt_setback

mt_setback	
	move.w	16(a6),6(a5)
	subq.b	#7,d0
	beq.w	mt_tremolo
	subq.b	#3,d0
	beq.w	mt_volumeslide
mt_return2
	rts

mt_pernop
	move.w	16(a6),6(a5)
	rts

mt_arpeggio
	moveq	#0,d0
	move.b	mt_counter(pc),d0
	moveq	#3,d2
	divs	d2,d0
	swap	d0
	tst.w	d0
	beq.b	mt_arpeggio2
	subq.w	#2,d0
	beq.b	mt_arpeggio1
	moveq	#0,d0
	move.b	3(a6),d0
	lsr.b	#4,d0
	bra.b	mt_arpeggio3

mt_arpeggio1
	moveq	#0,d0
	move.b	3(a6),d0
	and.b	d5,d0
	bra.b	mt_arpeggio3

mt_arpeggio2
	move.w	16(a6),d2
	bra.b	mt_arpeggio4

mt_arpeggio3
	add.w	d0,d0
	move.l	44(a6),a0
	moveq	#36,d7
mt_arploop
	move.w	(a0,d0.w),d2
	cmp.w	(a0),d1
	bhs.b	mt_arpeggio4
	addq.l	#2,a0
	dbf	d7,mt_arploop
	rts

mt_arpeggio4
	move.w	d2,6(a5)
	rts

mt_fineportaup
	tst.b	mt_counter-mt_pm(a2)
	bne.b	mt_return2
	move.b	d1,mt_lowmask-mt_pm(a2)
mt_portaup
	moveq	#0,d0
	move.b	3(a6),d0
	and.b	mt_lowmask(pc),d0
	move.b	#$ff,mt_lowmask-mt_pm(a2)
	sub.w	d0,16(a6)
	move.w	16(a6),d0
	and.w	#$0fff,d0
	cmp.w	#113,d0
	bhi.b	mt_portauskip
	and.w	#$f000,16(a6)
	or.w	#113,16(a6)
mt_portauskip
	move.w	16(a6),d0
	and.w	#$0fff,d0
	move.w	d0,6(a5)
	rts	
 
mt_fineportadown
	tst.b	mt_counter-mt_pm(a2)
	bne.w	mt_return2
	move.b	d5,mt_lowmask-mt_pm(a2)
mt_portadown
	moveq	#0,d0
	move.b	3(a6),d0
	and.b	mt_lowmask(pc),d0
	move.b	#$ff,mt_lowmask-mt_pm(a2)
	add.w	d0,16(a6)
	move.w	16(a6),d0
	and.w	#$0fff,d0
	cmp.w	#856,d0
	blo.b	mt_portadskip
	and.w	#$f000,16(a6)
	or.w	#856,16(a6)
mt_portadskip
	move.w	16(a6),d0
	and.w	#$0fff,d0
	move.w	d0,6(a5)
	rts

mt_settoneporta
	move.w	(a6),d2
	and.w	#$0fff,d2
	move.l	44(a6),a4
	moveq	#0,d0
mt_stploop
	cmp.w	(a4,d0.w),d2
	bhs.b	mt_stpfound
	addq.w	#2,d0
	cmp.w	#37*2,d0
	blo.b	mt_stploop
	moveq	#35*2,d0
mt_stpfound
	move.b	18(a6),d2
	and.b	#8,d2
	beq.b	mt_stpgoss
	tst.w	d0
	beq.b	mt_stpgoss
	subq.w	#2,d0
mt_stpgoss
	move.w	(a4,d0.w),d2
	move.w	d2,24(a6)
	move.w	16(a6),d0
	clr.b	22(a6)
	cmp.w	d0,d2
	beq.b	mt_cleartoneporta
	bge.w	mt_return2
	move.b	#1,22(a6)
	rts

mt_cleartoneporta
	clr.w	24(a6)
	rts

mt_toneportamento
	move.b	3(a6),d0
	beq.b	mt_toneportnochange
	move.b	d0,23(a6)
	clr.b	3(a6)
mt_toneportnochange
	tst.w	24(a6)
	beq.w	mt_return2
	moveq	#0,d0
	move.b	23(a6),d0
	tst.b	22(a6)
	bne.b	mt_toneportaup
mt_toneportadown
	add.w	d0,16(a6)
	move.w	24(a6),d0
	cmp.w	16(a6),d0
	bgt.b	mt_toneportasetper
	move.w	24(a6),16(a6)
	clr.w	24(a6)
	bra.b	mt_toneportasetper

mt_toneportaup
	sub.w	d0,16(a6)
	move.w	24(a6),d0
	cmp.w	16(a6),d0
	blt.b	mt_toneportasetper
	move.w	24(a6),16(a6)
	clr.w	24(a6)

mt_toneportasetper
	move.w	16(a6),d2
	move.b	31(a6),d0
	and.b	d5,d0
	beq.b	mt_glissskip

	move.l	44(a6),a0
	moveq	#35,d7
mt_glissloop
	cmp.w	(a0)+,d2
	bge.b	mt_glissfound
	dbf	d7,mt_glissloop
	subq.l	#2,a0
mt_glissfound
	move.w	-2(a0),d2
mt_glissskip
	move.w	d2,6(a5) 		; set period
	rts

mt_vibrato
	move.b	3(a6),d0
	beq.b	mt_vibrato2
	move.b	26(a6),d2
	and.b	d5,d0
	beq.b	mt_vibskip
	and.b	d6,d2
	or.b	d0,d2
mt_vibskip
	move.b	3(a6),d0
	and.b	d6,d0
	beq.b	mt_vibskip2
	and.b	d5,d2
	or.b	d0,d2
mt_vibskip2
	move.b	d2,26(a6)
mt_vibrato2
	move.b	27(a6),d0
	lea	mt_vibratotable(pc),a4
	lsr.w	#2,d0
	and.w	#$001f,d0
	moveq	#0,d2
	move.b	30(a6),d2
	and.b	#$03,d2
	beq.b	mt_vib_sine
	lsl.b	#3,d0
	cmp.b	#1,d2
	beq.b	mt_vib_rampdown
	moveq	#-1,d2
	bra.b	mt_vib_set
mt_vib_rampdown
	tst.b	27(a6)
	bpl.b	mt_vib_rampdown2
	moveq	#-1,d2
	sub.b	d0,d2
	bra.b	mt_vib_set
mt_vib_rampdown2
	move.b	d0,d2
	bra.b	mt_vib_set
mt_vib_sine
	move.b	(a4,d0.w),d2
mt_vib_set
	move.b	26(a6),d0
	and.w	d5,d0
	mulu	d0,d2
	lsr.w	#7,d2
	move.w	16(a6),d0
	tst.b	27(a6)
	bmi.b	mt_vibratoneg
	add.w	d2,d0
	bra.b	mt_vibrato3
mt_vibratoneg
	sub.w	d2,d0
mt_vibrato3
	move.w	d0,6(a5)
	move.b	26(a6),d0
	lsr.w	#2,d0
	and.w	#$003c,d0
	add.b	d0,27(a6)
	rts

mt_toneplusvolslide
	bsr.w	mt_toneportnochange
	bra.w	mt_volumeslide

mt_vibratoplusvolslide
	bsr.b	mt_vibrato2
	bra.w	mt_volumeslide

mt_tremolo
	move.b	3(a6),d0
	beq.b	mt_tremolo2
	move.b	28(a6),d2
	and.b	d5,d0
	beq.b	mt_treskip
	and.b	d6,d2
	or.b	d0,d2
mt_treskip
	move.b	3(a6),d0
	and.b	d6,d0
	beq.b	mt_treskip2
	and.b	d5,d2
	or.b	d0,d2
mt_treskip2
	move.b	d2,28(a6)
mt_tremolo2
	move.b	29(a6),d0
	lea	mt_vibratotable(pc),a4
	lsr.w	#2,d0
	moveq	#$1f,d2
	and.w	d2,d0
	move.b	30(a6),d2
	and.w	d6,d2
	lsr.b	#4,d2
	and.b	#$03,d2
	beq.b	mt_tre_sine
	lsl.b	#3,d0
	cmp.b	#1,d2
	beq.b	mt_tre_rampdown
	moveq	#-1,d2
	bra.b	mt_tre_set
mt_tre_rampdown
	tst.b	27(a6)
	bpl.b	mt_tre_rampdown2
	moveq	#-1,d2
	sub.b	d0,d2
	bra.b	mt_tre_set
mt_tre_rampdown2
	move.b	d0,d2
	bra.b	mt_tre_set
mt_tre_sine
	move.b	(a4,d0.w),d2
mt_tre_set
	move.b	28(a6),d0
	and.w	d5,d0
	mulu	d0,d2
	lsr.w	#6,d2
	moveq	#0,d0
	move.b	19(a6),d0
	tst.b	29(a6)
	bmi.b	mt_tremoloneg
	add.w	d2,d0
	bra.b	mt_tremolo3
mt_tremoloneg
	sub.w	d2,d0
mt_tremolo3
	bpl.b	mt_tremoloskip
	moveq	#0,d0
mt_tremoloskip
	cmp.b	mt_maxvol(pc),d0
	bls.b	mt_tremolook
	move.b	mt_maxvol(pc),d0
mt_tremolook
	move.b	d0,9(a5)
	move.b	28(a6),d0
	lsr.w	#2,d0
	and.w	#$003c,d0
	add.b	d0,29(a6)
	rts

mt_sampleoffset
	moveq	#0,d0
	move.b	3(a6),d0
	beq.b	mt_sononew
	move.b	d0,32(a6)
mt_sononew
	move.b	32(a6),d0
	lsl.w	#7,d0
	cmp.w	8(a6),d0
	bge.b	mt_sofskip
	sub.w	d0,8(a6)
	add.w	d0,d0
	add.l	d0,4(a6)
	rts
mt_sofskip
	move.w	#1,8(a6)
	rts

mt_volumeslide
	move.b	3(a6),d0
	lsr.b	#4,d0
	beq.b	mt_volslidedown
mt_volslideup
	add.b	d0,19(a6)
	move.b	mt_maxvol(pc),d2
	cmp.b	19(a6),d2
	bge.b	mt_vsuskip
	move.b	d2,19(a6)
mt_vsuskip
	move.b	19(a6),9(a5)
	rts

mt_volslidedown
	move.b	3(a6),d0
	and.b	d5,d0
mt_volslidedown2
	sub.b	d0,19(a6)
	bpl.b	mt_vsdskip
	clr.b	19(a6)
mt_vsdskip
	move.b	19(a6),9(a5)
	rts

mt_positionjump
	moveq	#0,d0
	move.b	3(a6),d0
	subq.b	#1,d0
	lsl.w	#2,d0
	move.w	d0,mt_songpos-mt_pm(a2)
mt_pj2	clr.b	mt_pbreakpos-mt_pm(a2)
	st 	mt_posjumpflag-mt_pm(a2)
	rts

mt_volumechange
	move.b	3(a6),d0
	cmp.b	mt_maxvol(pc),d0
	ble.b	mt_volumeok
	move.b	mt_maxvol(pc),d0
mt_volumeok
	move.b	d0,19(a6)
	move.b	d0,9(a5)
	rts

mt_patternbreak
	move.b	3(a6),d0
	move.b	d0,d2
	lsr.b	#4,d0
	move.b	d0,d1
	add.b	d0,d0		;*2
	lsl.b	#3,d1		;*8
	add.b	d1,d0		;+ -> *10
	and.b	d5,d2
	add.b	d2,d0
	cmp.b	#63,d0
	bhi.b	mt_pj2
	move.b	d0,mt_pbreakpos-mt_pm(a2)
	st	mt_posjumpflag-mt_pm(a2)
	rts

mt_setspeed
	move.b	3(a6),d0
	beq.w	mt_return2
	clr.b	mt_counter-mt_pm(a2)
	move.b	d0,mt_speed-mt_pm(a2)
	rts

mt_checkmoreefx
	bsr.w	mt_updatefunk
	moveq	#0,d0
	move.b	2(a6),d0
	and.b	d5,d0
	lsl.b	#2,d0
	move.l	mt_jumptab4(pc,d0.w),a4
	jmp	(a4)

mt_jumptab4	
	dc.l	mt_pernop
	dc.l	mt_pernop
	dc.l	mt_pernop
	dc.l	mt_pernop
	dc.l	mt_pernop
	dc.l	mt_pernop
	dc.l	mt_pernop
	dc.l	mt_pernop
	dc.l	mt_pernop
	dc.l	mt_sampleoffset
	dc.l	mt_pernop
	dc.l	mt_positionjump
	dc.l	mt_volumechange
	dc.l	mt_patternbreak
	dc.l	mt_e_commands
	dc.l	mt_setspeed
	dc.l	mt_pernop	; ???

mt_e_commands
	moveq	#0,d0
	move.b	3(a6),d0
	lsr.b	#4,d0
	lsl.b	#2,d0
	move.l	mt_jumptab2(pc,d0.w),a4
	jmp	(a4)

mt_jumptab2	
	dc.l	mt_filteronoff
	dc.l	mt_fineportaup
	dc.l	mt_fineportadown
	dc.l	mt_setglisscontrol
	dc.l	mt_setvibratocontrol
	dc.l	mt_setfinetune
	dc.l	mt_jumploop
	dc.l	mt_settremolocontrol
	dc.l	mt_return2
	dc.l	mt_retrignote
	dc.l	mt_volumefineup
	dc.l	mt_volumefinedown
	dc.l	mt_notecut
	dc.l	mt_notedelay
	dc.l	mt_patterndelay
	dc.l	mt_funkit

mt_filteronoff
	move.b	3(a6),d0
	and.b	#1,d0
	add.w	d0,d0
	and.b	#$fd,$bfe001
	or.b	d0,$bfe001
	rts	

mt_setglisscontrol
	move.b	3(a6),d0
	and.b	d5,d0
	and.b	d6,31(a6)
	or.b	d0,31(a6)
	rts

mt_setvibratocontrol
	move.b	3(a6),d0
	and.b	d5,d0
	and.b	d6,30(a6)
	or.b	d0,30(a6)
	rts

mt_setfinetune
	moveq	#0,d0
	move.b	3(a6),d0
	and.b	d5,d0
	move.b	d0,18(a6)
	add.w	d0,d0
	move.w	(a2,d0.w),d0
	lea	mt_periodtable(pc),a4
	add.l	d0,a4
	move.l	a4,44(a6)
	rts

mt_jumploop
	move.b	mt_counter(pc),d1
	bne.w	mt_return2
	move.b	3(a6),d0
	and.b	d5,d0
	beq.b	mt_setloop
	tst.b	34(a6)
	beq.b	mt_jumpcnt
	subq.b	#1,34(a6)
	beq.w	mt_return2
mt_jmploop	
	move.b	33(a6),mt_pbreakpos-mt_pm(a2)
	st	mt_pbreakflag-mt_pm(a2)
	rts

mt_jumpcnt
	move.b	d0,34(a6)
	bra.b	mt_jmploop

mt_setloop
	move.w	mt_patternpos(pc),d0
	lsr.w	#4,d0
	move.b	d0,33(a6)
	rts

mt_settremolocontrol
	move.b	3(a6),d0
	and.b	d5,d0
	lsl.b	#4,d0
	and.b	d5,30(a6)
	or.b	d0,30(a6)
	rts

mt_retrignote
	move.b	3(a6),d0
	and.b	d5,d0
	beq.b	mt_rtnend
	moveq	#0,d2
	move.b	mt_counter(pc),d2
	bne.b	mt_rtnskp
	move.w	(a6),d2
	and.w	#$0fff,d2
	bne.b	mt_rtnend
	moveq	#0,d2
	move.b	mt_counter(pc),d2
mt_rtnskp
	divu	d0,d2
	swap	d2
	tst.w	d2
	bne.b	mt_rtnend
mt_doretrig
	move.w	20(a6),$dff096		; channel dma off
	move.l	4(a6),(a5)		; set sampledata pointer
	move.w	8(a6),4(a5)		; set length
	bsr.w	mt_dmawait
	move.w	20(a6),d0
	or.w	#$8000,d0
	move.w	d0,$dff096
	bsr.w	mt_dmawait
	move.l	10(a6),(a5)
	move.l	14(a6),4(a5)
mt_rtnend
	rts

mt_volumefineup
	move.b	mt_counter(pc),d1
	bne.w	mt_return2
	move.b	3(a6),d0
	and.b	d5,d0
	bra.w	mt_volslideup

mt_volumefinedown
	move.b	mt_counter(pc),d1
	bne.w	mt_return2
	move.b	3(a6),d0
	and.b	d5,d0
	bra.w	mt_volslidedown2

mt_notecut
	cmp.b	mt_counter(pc),d0
	bne.w	mt_return2
	clr.b	19(a6)
	clr.w	8(a5)
	rts

mt_notedelay
	move.b	3(a6),d0
	and.b	d5,d0
	cmp.b	mt_counter(pc),d0
	bne.w	mt_return2
	move.w	(a6),d0
	beq.w	mt_return2
	bra.b	mt_doretrig

mt_patterndelay
	move.b	mt_counter(pc),d1
	bne.w	mt_return2
	move.b	mt_pattdeltime2(pc),d1
	bne.w	mt_return2
	move.b	3(a6),d0
	and.b	d5,d0
	addq.b	#1,d0
	move.b	d0,mt_pattdeltime-mt_pm(a2)
	rts

mt_funkit
	move.b	mt_counter(pc),d1
	bne.w	mt_return2
	move.b	3(a6),d0
	and.b	d5,d0
	lsl.b	#4,d0
	and.b	d5,31(a6)
	or.b	d0,31(a6)
	tst.b	d0
	beq.w	mt_return2
mt_updatefunk
	moveq	#0,d0
	move.b	31(a6),d0
	lsr.b	#4,d0
	beq.b	mt_funkend
	lea	mt_funktable(pc),a4
	move.b	(a4,d0.w),d0
	add.b	d0,35(a6)
	btst	#7,35(a6)
	beq.b	mt_funkend
	clr.b	35(a6)

	move.l	10(a6),d0
	moveq	#0,d2
	move.w	14(a6),d2
	add.w	d2,d2
	add.l	d2,d0
	move.l	36(a6),a4
	addq.l	#1,a4
	cmp.l	d0,a4
	blo.b	mt_funkok
	move.l	10(a6),a4
mt_funkok
	move.l	a4,36(a6)
	moveq	#-1,d0
	sub.b	(a4),d0
	move.b	d0,(a4)
mt_funkend
	rts

mt_dmawait
	ifgt mt_dmawaiter
	moveq	#mt_dmawaiter-1,d4
mt_waitdma2
	move.b	$dff006,d3
mt_waitdma3
	cmp.b	$dff006,d3
	beq.b	mt_waitdma3
	dbf	d4,mt_waitdma2		;wait some rasters
	endc
	rts

mt_funktable 	dc.b 	0,5,6,7,8,10,11,13,16,19,22,26,32,43,64,128
mt_vibratotable	dc.b   	000,024,049,074,097,120,141,161
		dc.b 	180,197,212,224,235,244,250,253
		dc.b 	255,253,250,244,235,224,212,197
		dc.b 	180,161,141,120,097,074,049,024
mt_periodtable	dc.w	856,808,762,720,678,640,604,570,538,508,480,453
		dc.w	428,404,381,360,339,320,302,285,269,254,240,226
		dc.w	214,202,190,180,170,160,151,143,135,127,120,113	;0
		dc.w	850,802,757,715,674,637,601,567,535,505,477,450
		dc.w	425,401,379,357,337,318,300,284,268,253,239,225
		dc.w	213,201,189,179,169,159,150,142,134,126,119,113	;1
		dc.w	844,796,752,709,670,632,597,563,532,502,474,447
		dc.w	422,398,376,355,335,316,298,282,266,251,237,224
		dc.w	211,199,188,177,167,158,149,141,133,125,118,112	;2
		dc.w	838,791,746,704,665,628,592,559,528,498,470,444
		dc.w	419,395,373,352,332,314,296,280,264,249,235,222
		dc.w	209,198,187,176,166,157,148,140,132,125,118,111	;3
		dc.w	832,785,741,699,660,623,588,555,524,495,467,441
		dc.w	416,392,370,350,330,312,294,278,262,247,233,220
		dc.w	208,196,185,175,165,156,147,139,131,124,117,110	;4
		dc.w	826,779,736,694,655,619,584,551,520,491,463,437
		dc.w	413,390,368,347,328,309,292,276,260,245,232,219
		dc.w	206,195,184,174,164,155,146,138,130,123,116,109	;5
		dc.w	820,774,730,689,651,614,580,547,516,487,460,434
		dc.w	410,387,365,345,325,307,290,274,258,244,230,217
		dc.w	205,193,183,172,163,154,145,137,129,122,115,109	;6
		dc.w	814,768,725,684,646,610,575,543,513,484,457,431
		dc.w	407,384,363,342,323,305,288,272,256,242,228,216
		dc.w	204,192,181,171,161,152,144,136,128,121,114,108	;7
		dc.w	907,856,808,762,720,678,640,604,570,538,508,480
		dc.w	453,428,404,381,360,339,320,302,285,269,254,240
		dc.w	226,214,202,190,180,170,160,151,143,135,127,120	;-8
		dc.w	900,850,802,757,715,675,636,601,567,535,505,477
		dc.w	450,425,401,379,357,337,318,300,284,268,253,238
		dc.w	225,212,200,189,179,169,159,150,142,134,126,119 ;-7
		dc.w	894,844,796,752,709,670,632,597,563,532,502,474
		dc.w	447,422,398,376,355,335,316,298,282,266,251,237
		dc.w	223,211,199,188,177,167,158,149,141,133,125,118	;-6
		dc.w	887,838,791,746,704,665,628,592,559,528,498,470
		dc.w	444,419,395,373,352,332,314,296,280,264,249,235
		dc.w	222,209,198,187,176,166,157,148,140,132,125,118	;-5
		dc.w	881,832,785,741,699,660,623,588,555,524,494,467
		dc.w	441,416,392,370,350,330,312,294,278,262,247,233
		dc.w	220,208,196,185,175,165,156,147,139,131,123,117	;-4
		dc.w	875,826,779,736,694,655,619,584,551,520,491,463
		dc.w	437,413,390,368,347,328,309,292,276,260,245,232
		dc.w	219,206,195,184,174,164,155,146,138,130,123,116	;-3
		dc.w	868,820,774,730,689,651,614,580,547,516,487,460
		dc.w	434,410,387,365,345,325,307,290,274,258,244,230
		dc.w	217,205,193,183,172,163,154,145,137,129,122,115	;-2
		dc.w	862,814,768,725,684,646,610,575,543,513,484,457
		dc.w	431,407,384,363,342,323,305,288,272,256,242,228
		dc.w	216,203,192,181,171,161,152,144,136,128,121,114	;-1
mt_chan1temp	dc.l	0,0,0,0,0,$00010000,0,0,0,0,0,0
mt_chan2temp	dc.l	0,0,0,0,0,$00020000,0,0,0,0,0,0
mt_chan3temp	dc.l	0,0,0,0,0,$00040000,0,0,0,0,0,0
mt_chan4temp	dc.l	0,0,0,0,0,$00080000,0,0,0,0,0,0
mt_samplestarts	dcb.l	31
mt_speed	dc.b 	6
mt_counter	dc.b 	0
mt_songpos	dc.w 	0
mt_pbreakpos	dc.b 	0
mt_posjumpflag	dc.b 	0
mt_pbreakflag	dc.b 	0
mt_lowmask	dc.b 	0
mt_pattdeltime	dc.b 	0
mt_pattdeltime2	dc.b 	0
mt_maxvol	dc.b	64			;maximum volume
		dc.b	0			;unsed
mt_patternpos	dc.w 	0
mt_dmacontemp	dc.w 	0
	ifne mt_level6
mt_oldirq	dc.l	0
	endc
mt_pm		dcb.w	16
mt_dataptr	dc.l	0			;pointer auf sound


