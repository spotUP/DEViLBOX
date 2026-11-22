; Mega Drive MDSDRV player shell (vasmm68k_mot -Fbin -spaces). Built by tools/build-md-player.sh -> public/md/player.bin.
; Fixed layout (public/md/player.json): header patched by buildMdRom (checksum $18E, ROM end $1A4);
; PCMPTR slot at $200 = absolute address of the 32 KiB aligned PCM blob; the sequence sits at SEQ = $4000.
WORK	equ	$FF0000
	dc.l	$00FFF800,start
	dcb.l	28,idle
	dc.l	vint			; vector 30 = level 6 VINT
	dcb.l	33,idle
	dc.b	"SEGA MEGA DRIVE "
	dc.b	"(C)DEVL 2026.NOV"
	dc.b	"DEViLBOX MDSDRV EXPORT                          "
	dc.b	"DEViLBOX MDSDRV EXPORT                          "
	dc.b	"GM 00000000-00"
	dc.w	0
	dc.b	"J               "
	dc.l	0,$003FFFFF,$00FF0000,$00FFFFFF
	dcb.b	$200-*,' '
pcmptr:	dc.l	0
start:
	move.w	#$2700,sr
	move.b	$A10001,d0
	andi.b	#$0F,d0
	beq.s	.notmss
	move.l	#'SEGA',$A14000
.notmss:
	lea	$FF0000,a0
	move.w	#$1FFF,d0
.clr:	clr.l	(a0)+
	dbf	d0,.clr
	move.w	#$8004,$C00004
	lea	WORK,a0
	lea	$4000,a1
	move.l	pcmptr,a2
	jsr	drv
	lea	WORK,a0
	moveq	#1,d0
	moveq	#3,d1
	jsr	drv+8
	move.w	#$8174,$C00004
	move.w	#$2300,sr
.loop:	bra.s	.loop
vint:	movem.l	d0-a6,-(sp)
	lea	WORK,a0
	jsr	drv+4
	movem.l	(sp)+,d0-a6
idle:	rte
	cnop	0,2
drv:	incbin	"mdsdrv.bin"
	cnop	0,2
	dcb.b	$4000-*,0
