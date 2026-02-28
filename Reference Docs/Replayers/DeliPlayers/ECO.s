
	incdir	"Includes:"
	include	"Misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: DeliCustom: ECO - © 1988 Denton Designs/Ocean',0
	even

PlayerTagArray
	dc.l	DTP_CustomPlayer,1		; CustomPlayer - Tag (important !!!)
	dc.l	DTP_Interrupt,Int
	dc.l	DTP_SubSongRange,SubSong
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,RemSnd
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Interrupt für Replay

Int
	movem.l	d2-d7/a2-a6,-(sp)
	jsr	lbC05BC08			; DudelDiDum
	movem.l	(sp)+,d2-d7/a2-a6
	rts

*-----------------------------------------------------------------------*
;
; Set min. & max. subsong number

SubSong
	moveq	#2,d0				; min.
	moveq	#15,d1				; max.
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
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
	jsr	lbC05BADC			; Init Sound

	moveq	#0,d0
	move.w	dtg_SndNum(a5),d0
	move.b	d0,lbB05CE5E
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	jsr	lbC05BADC			; End Sound
	rts

*-----------------------------------------------------------------------*
;
; Module (ripped from ECO/Denton Designs)

;
;
	SECTION Replay,Code_C
;
;

lbC05BADC
	move.l	#lbW05C6AA,$00DFF0A0
	move.l	#lbW05C69A,$00DFF0B0
	move.l	#lbW05C69A,$00DFF0C0
	move.w	#$0008,d0
	move.w	d0,$00DFF0A4
	move.w	d0,$00DFF0B4
	move.w	d0,$00DFF0C4
	move.w	#$0000,d0
	move.w	d0,$00DFF0A8
	move.w	d0,$00DFF0B8
	move.w	d0,$00DFF0C8
	move.w	#$0190,d0
	move.w	d0,$00DFF0A6
	move.w	d0,$00DFF0B6
	move.w	d0,$00DFF0C6
	move.w	#$8007,$00DFF096
	rts

lbC05BB46
	move.b	#$11,lbB05CE66
	rts

lbC05BB50
	move.b	#$10,lbB05CE66
	rts

lbC05BB5A
	move.b	#$08,lbB05CE66
	rts

lbC05BB64
	move.b	#$09,lbB05CE67
	rts

lbC05BB6E
	move.b	#$09,lbB05CE68
	rts

lbC05BB78
	move.b	#$02,lbB05CE66
	move.b	#$01,lbB05CE67
	move.b	#$01,lbB05CE68
	rts

lbC05BB92
	move.b	#$06,lbB05CE66
	rts

lbC05BB9C
	move.b	#$09,lbB05CE66
	rts

lbC05BBA6
	move.b	#$03,lbB05CE66
	rts

lbC05BBB0
	move.b	#$0A,lbB05CE66
	rts

lbC05BBBA
	move.b	#$18,lbB05CE66
	move.b	#$04,lbB05CE68
	rts

	move.b	#$09,lbB05CE66
	rts

lbC05BBD6
	move.b	#$0B,lbB05CE66
	rts

lbC05BBE0
	move.b	#$05,lbB05CE67
	rts

lbC05BBEA
	move.b	#$0A,lbB05CE67
	rts

lbC05BBF4
	move.b	#$17,lbB05CE68
	rts

	move.b	#$09,lbB05CE68
	rts

lbC05BC08
	bsr	lbC05C2CE
	clr.l	d7
	lea	lbL05CF20,a6
	bsr	lbC05BC56
	move.l	#$00000000,d6
	bsr	lbC05BC40
	move.l	#$00000024,d6
	bsr	lbC05BC40
	move.l	#$00000048,d6
	bsr	lbC05BC40
	bsr	lbC05C266
	bsr	lbC05C634
	rts

lbC05BC40
	bsr	lbC05C3DC
	bsr	lbC05C3BA
	bsr	lbC05C37A
	bsr	lbC05C470
	bsr	lbC05C5FA
	rts

lbC05BC56
	clr.l	d6
	lea	lbB05CE5E,a0
	move.b	(a0),d6
	beq	lbC05BC7E
	move.b	d6,$0001(a0)
	clr.l	d6
	move.b	d6,(a0)
	move.w	#$0008,$00DFF0C4
	clr.w	lbW05CE58
	bsr	lbC05C33C
lbC05BC7E
	move.b	$0001(a0),d6
	beq	lbC05BC9C
	move.b	d6,$0002(a0)
	clr.l	d6
	move.b	d6,$0001(a0)
	clr.w	lbW05CE5A
	clr.w	lbB05CE5C
lbC05BC9C
	move.b	$0002(a0),d6
	lea	lbL05CE6A,a0
	asl.l	#$02,d6
	add.l	d6,a0
	move.l	(a0),d6
	move.l	d6,a0
	jmp	(a0)

lbC05BCB0
	clr.b	lbB05CE60
	bra	lbC05C33C

lbC05BCBA
	move.b	#$08,d1
	bsr	lbC05C358
	move.l	#$0004080C,d0
	bsr	lbC05C440
	move.l	#lbW05C6AA,$00DFF0A0
	move.l	#lbW05C69A,$00DFF0B0
	move.l	#lbW05C69A,$00DFF0C0
	move.w	#$0008,$00DFF0C4
	lea	lbW05C764,a0
	move.l	#$00000024,a1
	bsr	lbC05C568
	lsr.w	#$04,d7
	lea	lbW05C75C,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
	move.w	lbB05CE5C,d7
	and.w	#$000F,d7
	lea	lbW05C74C,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
	move.b	#$10,d0
	bsr	lbC05C30C
	bra	lbC05C52E

lbC05BD3A
	move.w	#$0001,d0
	move.w	d0,lbW05CE58
lbC05BD44
	move.b	#$08,d1
	bsr	lbC05C358
	move.l	#lbW05C6AA,$00DFF0A0
	move.l	#lbW05C69A,$00DFF0B0
	move.l	#lbW05C69A,$00DFF0C0
	move.w	#$0008,$00DFF0C4
	move.l	#$0000080C,d0
	bsr	lbC05C440
	lea	lbW05C7E8,a0
	move.l	#$00000024,a1
	bsr	lbC05C568
	lsr.w	#$04,d7
	lea	lbW05C7E4,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
	move.w	lbB05CE5C,d7
	and.w	#$000F,d7
	lea	lbW05C74C,a0
	move.l	#$00000019,a1
	bsr	lbC05C592
	move.b	#$10,d0
	bsr	lbC05C30C
	bra	lbC05C52E

lbC05BDC4
	move.w	#$0000,lbW05CE58
	move.b	#$08,d1
	bsr	lbC05C358
	move.l	#$0000080C,d0
	bsr	lbC05C440
	lea	lbW05C918,a0
	move.l	#$00000024,a1
	bsr	lbC05C588
	lea	lbW05C918,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
	lea	lbW05C818,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
	bra	lbC05C52E

lbC05BE12
	move.b	#$02,lbB05CE5F
	rts

lbC05BE1C
	move.b	#$0A,lbB05CE5F
lbC05BE24
	move.l	#lbW05C6AA,$00DFF0A0
	move.l	#lbW05C69A,$00DFF0B0
	move.l	#lbW05C69A,$00DFF0C0
	move.b	lbB05CE5D,d0
	lsr.b	#$04,d0
	and.b	#$0F,d0
	eor.w	#$000F,d0
	move.b	d0,lbB05CE64
	move.b	#$08,d1
	bsr	lbC05C358
	move.l	#$00000C00,d0
	bsr	lbC05C440
	cmp.w	#$00F9,d7
	bcc	lbC05BEB6
	and.w	#$003F,d7
	lsr.w	#$04,d7
	lea	lbW05CA18,a0
	move.l	#$00000024,a1
	bsr	lbC05C568
	move.w	lbB05CE5C,d7
	and.w	#$003F,d7
	lea	lbW05CA44,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
	and.w	#$0007,d7
	lea	lbW05CA3C,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
lbC05BEB6
	move.w	#$0001,d1
	bra	lbC05C4FE

lbC05BEBE
	move.l	#lbW05C6AA,$00DFF0A0
	move.l	#lbW05C68A,$00DFF0B0
	move.l	#lbW05C68A,$00DFF0C0
	move.w	#$0001,$000E(a6)
	move.w	#$0001,$0032(a6)
	move.w	#$0001,$0056(a6)
	move.l	#$00101814,d0
	bsr	lbC05C440
	move.w	#$0002,lbW05CE58
	move.b	#$04,d1
	bsr	lbC05C358
	and.w	#$000F,d7
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C59C
	bra	lbC05C52E

lbC05BF40
	move.l	#$00181814,d0
	bsr	lbC05C440
	bra	lbC05BF6A

lbC05BF4E
	move.w	#$0001,$000E(a6)
	move.w	#$0001,$0032(a6)
	move.w	#$0001,$0056(a6)
	move.l	#$00101814,d0
	bsr	lbC05C440
lbC05BF6A
	move.w	#$0002,lbW05CE58
	move.b	#$04,d1
	bsr	lbC05C358
	and.w	#$000F,d7
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
	bra	lbC05C52E

lbC05BF92
	move.b	#$04,d1
	bsr	lbC05C358
	tst.b	d7
	bpl	lbC05BFA8
	move.w	#$0002,lbW05CE58
lbC05BFA8
	and.w	#$000F,d7
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
	move.w	lbB05CE5C,d7
	lsr.w	#$01,d7
	bcs	lbC05BFE8
	lea	lbW05CCC8,a0
	move.l	#$00000013,a1
	bsr	lbC05C59C
	lea	lbW05CCC8,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
lbC05BFE8
	bra	lbC05C52E

lbC05BFEC
	move.l	#$00101814,d0
	bsr	lbC05C440
	move.b	#$04,d1
	bsr	lbC05C358
	move.l	#lbW05C6AA,$00DFF0A0
	move.l	#lbW05C6AA,$00DFF0B0
	move.l	#lbW05C6AA,$00DFF0C0
	and.w	#$000F,d7
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
	move.w	lbB05CE5C,d7
	and.w	#$003F,d7
	lsr.w	#$01,d7
	bcs	lbC05C060
	lea	lbW05CD28,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
	lea	lbW05CD28,a0
	move.l	#$00000013,a1
	bsr	lbC05C592
lbC05C060
	bra	lbC05C52E

lbC05C064
	move.b	#$04,d1
	bsr	lbC05C358
	and.w	#$000F,d7
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
	move.w	lbB05CE5C,d7
	lsr.w	#$01,d7
	bcs	lbC05C0AC
	lea	lbW05CC88,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
	lea	lbW05CA84,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
lbC05C0AC
	bra	lbC05C52E

lbC05C0B0
	clr.w	lbW05CE58
lbC05C0B6
	move.l	#$00181014,d0
	bsr	lbC05C440
	move.b	#$04,d1
	bsr	lbC05C358
	and.w	#$000F,d7
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
	move.w	lbB05CE5C,d7
	lsr.w	#$01,d7
	bcs	lbC05C10C
	lea	lbW05CAC4,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
	and.w	#$003F,d7
	lea	lbW05CC88,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
lbC05C10C
	bra	lbC05C52E

lbC05C110
	clr.w	lbW05CE58
	move.b	#$04,d1
	bsr	lbC05C358
	and.w	#$000F,d7
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
	move.w	lbB05CE5C,d7
	lsr.w	#$01,d7
	bcs	lbC05C162
	lea	lbW05CA84,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
	and.w	#$001F,d7
	lea	lbW05CC68,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
lbC05C162
	bra	lbC05C52E

lbC05C166
	move.b	#$04,d1
	bsr	lbC05C358
	and.w	#$000F,d7
	lea	lbW05CB44,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
	move.w	lbB05CE5C,d7
	lsr.w	#$01,d7
	bcs	lbC05C1B2
	lea	lbW05CD28,a0
	move.l	#$0000001F,a1
	bsr	lbC05C592
	and.w	#$001F,d7
	lea	lbW05CCA8,a0
	move.l	#$0000000C,a1
	bsr	lbC05C59C
lbC05C1B2
	bra	lbC05C52E

lbC05C1B6
	move.l	#$00181808,d0
	bsr	lbC05C440
	move.b	#$04,d1
	bsr	lbC05C358
	move.w	lbB05CE5C,d7
	lsr.w	#$01,d7
	bcs	lbC05C208
	lea	lbW05CBD8,a0
	move.l	#$00000000,a1
	bsr	lbC05C59C
	lea	lbW05CB58,a0
	move.l	#$00000018,a1
	bsr	lbC05C592
	and.w	#$000F,d7
	lea	lbW05CC58,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
lbC05C208
	bra	lbC05C52E

lbC05C20C
	move.b	#$04,d1
	bsr	lbC05C358
	move.w	lbB05CE5C,d7
	lsr.w	#$01,d7
	bcs	lbC05C258
	lea	lbW05CB58,a0
	move.l	#$00000024,a1
	bsr	lbC05C592
	and.w	#$003F,d7
	lea	lbW05CC18,a0
	move.l	#$00000000,a1
	bsr	lbC05C59C
	and.w	#$000F,d7
	lea	lbW05CC58,a0
	move.l	#$00000018,a1
	bsr	lbC05C588
lbC05C258
	bra	lbC05C52E

lbC05C25C
	move.b	#$0F,lbB05CE5F
	rts

lbC05C266
	tst.b	lbB05CE60
	bne	lbC05C2A6
	tst.b	lbB05CE66
	beq	lbC05C282
	move.b	lbB05CE66,$001B(a6)
lbC05C282
	tst.b	lbB05CE67
	beq	lbC05C294
	move.b	lbB05CE67,$003F(a6)
lbC05C294
	tst.b	lbB05CE68
	beq	lbC05C2A6
	move.b	lbB05CE68,$0063(a6)
lbC05C2A6
	clr.b	lbB05CE66
	clr.b	lbB05CE67
	clr.b	lbB05CE68
	rts

	move.b	lbB05CE63,d0
	or.b	$1A(a6,d6.w),d0
	and.b	d1,d0
	move.b	d0,lbB05CE63
	rts

lbC05C2CE
	clr.w	d0
	move.w	lbW05C74A,d1
	add.w	#$0001,d1
	and.w	#$000F,d1
	move.w	d1,lbW05C74A
	lea	lbW05C69A,a1
	lea	lbW05C72A,a0
lbC05C2F0
	move.b	$00(a0,d0.w),d2
	add.b	$00(a0,d1.w),d2
	move.b	d2,$00(a1,d0.w)
	add.w	#$0001,d0
	add.w	#$0001,d1
	cmp.w	#$0010,d0
	bne.s	lbC05C2F0
	rts

lbC05C30C
	move.w	#$0008,$00DFF0C4
	move.w	lbB05CE5C,d2
	and.w	#$000F,d2
	lea	lbW05CE48,a0
	and.b	$00(a0,d2.w),d0
	beq	lbC05C33A
	move.w	#$00BC,$00DFF0C4
	move.b	#$06,$0063(a6)
lbC05C33A
	rts

lbC05C33C
	move.b	#$01,$001B(a6)
	move.b	#$01,$003F(a6)
	move.b	#$01,$0063(a6)
	move.b	#$0F,lbB05CE64
	rts

lbC05C358
	move.b	lbW05CE5A,d0
	addq.b	#$01,d0
	cmp.b	d0,d1
	bne	lbC05C36A
	clr.b	d0
	subq.l	#$04,sp
lbC05C36A
	move.b	d0,lbW05CE5A
	addq.l	#$04,sp
	move.w	lbB05CE5C,d7
	rts

lbC05C37A
	clr.w	d1
	clr.w	d0
	move.b	$1F(a6,d6.w),d0
	addq.b	#$01,d0
	and.b	#$0F,d0
	move.b	d0,$1F(a6,d6.w)
	or.b	$12(a6,d6.w),d0
	lea	lbW05CDC8,a0
	move.b	$00(a0,d0.w),d1
	bpl	lbC05C3A2
	or.w	#$FF00,d1
lbC05C3A2
	move.w	d1,$1C(a6,d6.w)
	tst.b	$1E(a6,d6.w)
	beq	lbC05C3B8
	sub.b	#$01,$1E(a6,d6.w)
	clr.w	$1C(a6,d6.w)
lbC05C3B8
	rts

lbC05C3BA
	move.w	$0A(a6,d6.w),a0
	cmp.w	$0C(a6,d6.w),a0
	beq	lbC05C3DA
	sub.w	$0E(a6,d6.w),a0
	bhi	lbC05C3D6
	add.w	$0E(a6,d6.w),a0
	add.w	$0E(a6,d6.w),a0
lbC05C3D6
	move.w	a0,$0A(a6,d6.w)
lbC05C3DA
	rts

lbC05C3DC
	add.b	#$01,$08(a6,d6.w)
	move.b	$08(a6,d6.w),d1
	sub.b	$15(a6,d6.w),d1
	bne	lbC05C43E
	clr.b	$08(a6,d6.w)
lbC05C3F2
	clr.l	d1
	move.b	$04(a6,d6.w),d1
	beq	lbC05C43E
	add.b	#$FF,d1
	move.b	d1,$04(a6,d6.w)
	lea	lbW05D12C,a0
	eor.b	#$0F,d1
	add.b	$14(a6,d6.w),d1
	move.b	$00(a0,d1.w),d1
	move.b	lbB05CE64,d2
	cmp.b	d1,d2
	bcc	lbC05C424
	move.b	d2,d1
lbC05C424
	move.b	d1,$05(a6,d6.w)
	move.b	$04(a6,d6.w),d1
	eor.b	#$0F,d1
	add.b	$09(a6,d6.w),d1
	move.b	$00(a0,d1.w),d1
	lsr.b	#$04,d1
	move.b	d1,$06(a6,d6.w)
lbC05C43E
	rts

lbC05C440
	clr.w	d6
	bsr	lbC05C45A
	lsr.w	#$08,d0
	move.b	#$24,d6
	bsr	lbC05C45A
	swap	d0
	move.b	#$48,d6
	bra	lbC05C45A

lbC05C45A
	move.b	d0,d1
	lea	lbL05CF04,a0
	and.w	#$00FF,d1
	move.l	$00(a0,d1.w),d1
	move.l	d1,$12(a6,d6.w)
	rts

lbC05C470
	move.b	$1B(a6,d6.w),d0
	cmp.b	#$01,d0
	bne	lbC05C47C
lbC05C47C
	clr.l	d0
	move.b	$1B(a6,d6.w),d0
	beq	lbC05C4D6
	asl.w	#$04,d0
	lea	lbL05CF8C,a0
	movem.l	-$10(a0,d0.w),d0-d3
	movem.l	d0-d3,$0A(a6,d6.w)
	clr.b	$1B(a6,d6.w)
	move.b	$17(a6,d6.w),d1
	and.b	#$08,d1
	beq	lbC05C4BE
	move.w	$0C,d0
	lsr.w	#$08,d0
	move.w	d0,$0A
	move.w	$0C,d0
	lsr.w	#$08,d0
	move.w	d0,$0A
lbC05C4BE
	clr.l	d1
	move.b	$17(a6,d6.w),d1
	asl.b	#$04,d1
	add.l	#lbW05C68A,d1
	move.l	$20(a6,d6.w),a0
	move.l	d1,(a0)
	bra	lbC05C5D8

lbC05C4D6
	sub.w	#$0001,$10(a6,d6.w)
	bne	lbC05C4E6
	move.b	$16(a6,d6.w),$1B(a6,d6.w)
lbC05C4E6
	rts

	move.b	$17(a6,d6.w),d0
	and.b	#$08,d0
	beq	lbC05C4FC
	move.b	$0B(a6,d6.w),lbB05CE62
lbC05C4FC
	rts

lbC05C4FE
	clr.w	d0
	move.b	lbB05CE60,d0
	asl.w	#$01,d0
	lea	lbW05CED2,a0
	move.w	$00(a0,d0.w),d6
	move.w	lbB05CE5C,d7
	addq.l	#$01,d7
	cmp.w	d6,d7
	bne	lbC05C526
	move.b	d1,lbB05CE5F
lbC05C526
	move.w	d7,lbB05CE5C
	rts

lbC05C52E
	clr.w	d0
	move.b	lbB05CE60,d0
	asl.w	#$01,d0
	lea	lbW05CED2,a0
	move.w	$00(a0,d0.w),d6
	move.w	lbB05CE5C,d7
	addq.l	#$01,d7
	cmp.w	d6,d7
	bne	lbC05C560
	move.b	lbB05CE60,d1
	add.b	#$01,d1
	move.b	d1,lbB05CE5F
lbC05C560
	move.w	d7,lbB05CE5C
	rts

lbC05C568
	clr.l	d6
	clr.l	d4
	move.b	$00(a0,d7.w),d4
	move.b	d4,d1
	and.b	#$0F,d4
	bne	lbC05C57C
	rts

lbC05C57C
	and.b	#$F0,d1
	move.b	d1,$12(a6,d6.w)
	bra	lbC05C5B2

lbC05C588
	move.l	#$00000000,d6
	bra	lbC05C5A6

lbC05C592
	move.l	#$00000024,d6
	bra	lbC05C5A6

lbC05C59C
	move.l	#$00000048,d6
	bra	lbC05C5A6

lbC05C5A6
	clr.w	d4
	move.b	$00(a0,d7.w),d4
	bne	lbC05C5B2
	rts

lbC05C5B2
	add.w	a1,d4
	move.b	d4,d1
	and.w	#$007F,d4
	add.w	lbW05CE58,d4
	move.b	d4,$02(a6,d6.w)
	asl.w	#$02,d4
	move.w	d4,$0C(a6,d6.w)
	bclr.l	#$07,d1
	bne	lbC05C5D8
	move.w	d4,$0A(a6,d6.w)
lbC05C5D8
	move.b	$13(a6,d6.w),$1E(a6,d6.w)
	clr.b	$08(a6,d6.w)
	clr.b	$1F(a6,d6.w)
	move.b	#$0F,d1
	move.b	d1,$04(a6,d6.w)
	bsr	lbC05C3F2
	clr.w	lbW05C74A
	rts

lbC05C5FA
	clr.l	d2
	clr.l	d1
	tst.w	lbB05CE60
	bne	lbC05C608
lbC05C608
	move.w	$0A(a6,d6.w),d1
	add.w	$1C(a6,d6.w),d1
	divu	#$0030,d1
	move.w	d1,d2
	swap	d1
	asl.w	#$01,d1
	lea	lbW05CD68,a1
	move.w	$00(a1,d1.w),d1
	and.b	#$FF,d2
	beq	lbC05C62E
	lsr.w	d2,d1
lbC05C62E
	move.w	d1,$00(a6,d6.w)
	rts

lbC05C634
	move.w	$0000(a6),d0
	asl.w	#$01,d0
	move.w	d0,$00DFF0A6
	move.w	$0024(a6),d0
	asl.w	#$01,d0
	move.w	d0,$00DFF0B6
	move.w	$0048(a6),d0
	asl.w	#$01,d0
	move.w	d0,$00DFF0C6
	move.b	$0005(a6),d0
	asl.b	#$02,d0
	and.w	#$00FF,d0
	move.w	d0,$00DFF0A8
	move.b	$0029(a6),d0
	asl.b	#$02,d0
	and.w	#$00FF,d0
	move.w	d0,$00DFF0B8
	move.b	$004D(a6),d0
	asl.b	#$02,d0
	and.w	#$00FF,d0
	move.w	d0,$00DFF0C8
lbC05C688
	rts

lbW05C68A
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
lbW05C69A
	dc.w	$1642
	dc.w	$6F9B
	dc.w	$7878
	dc.w	$7878
	dc.w	$8888
	dc.w	$8888
	dc.w	$8888
	dc.w	$8888
lbW05C6AA
	dc.w	$6F6F
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$6F42
	dc.w	$1600
	dc.w	$0000
	dc.w	$0000
	dc.w	$6359
	dc.w	$4F45
	dc.w	$3B31
	dc.w	$271D
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$1642
	dc.w	$6F9B
	dc.w	$7878
	dc.w	$7878
	dc.w	$8888
	dc.w	$8888
	dc.w	$8888
	dc.w	$8888
	dc.w	$6F6F
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$6F42
	dc.w	$1600
	dc.w	$0000
	dc.w	$0000
	dc.w	$6359
	dc.w	$4F45
	dc.w	$3B31
	dc.w	$271D
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$6300
	dc.w	$6300
	dc.w	$6300
	dc.w	$6300
	dc.w	$6300
	dc.w	$6300
	dc.w	$6300
	dc.w	$6300
	dc.w	$162C
	dc.w	$DE6F
	dc.w	$0304
	dc.w	$42DE
	dc.w	$0B6F
	dc.w	$0202
	dc.w	$DE63
	dc.w	$066F
lbW05C72A
	dc.w	$1642
	dc.w	$6F9B
	dc.w	$7878
	dc.w	$7878
	dc.w	$8888
	dc.w	$8888
	dc.w	$8888
	dc.w	$8888
	dc.w	$1642
	dc.w	$6F9B
	dc.w	$7878
	dc.w	$7878
	dc.w	$8888
	dc.w	$8888
	dc.w	$8888
	dc.w	$8888
lbW05C74A
	dc.w	$0000
lbW05C74C
	dc.w	$1011
	dc.w	$1510
	dc.w	$1117
	dc.w	$1011
	dc.w	$1810
	dc.w	$1117
	dc.w	$1011
	dc.w	$1510
lbW05C75C
	dc.w	$0907
	dc.w	$0204
	dc.w	$0907
	dc.w	$0204
lbW05C764
	dc.w	$4900
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$4900
	dc.w	$4900
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$4200
	dc.w	$4200
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$4200
	dc.w	$1200
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$4400
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$4900
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$4900
	dc.w	$4900
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$4200
	dc.w	$4200
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$4200
	dc.w	$4400
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
lbW05C7E4
	dc.w	$0303
	dc.w	$0303
lbW05C7E8
	dc.w	$4300
	dc.w	$0043
	dc.w	$4345
	dc.w	$2600
	dc.w	$0021
	dc.w	$4300
	dc.w	$4300
	dc.w	$4345
	dc.w	$2600
	dc.w	$4A00
	dc.w	$4600
	dc.w	$0021
	dc.w	$4300
	dc.w	$4300
	dc.w	$4345
	dc.w	$2600
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0808
lbW05C818
	dc.w	$0E11
	dc.w	$150E
	dc.w	$1115
	dc.w	$0E11
	dc.w	$150E
	dc.w	$1116
	dc.w	$0E11
	dc.w	$150E
	dc.w	$0D10
	dc.w	$150D
	dc.w	$1015
	dc.w	$0D10
	dc.w	$150D
	dc.w	$1016
	dc.w	$0D10
	dc.w	$150D
	dc.w	$0C0F
	dc.w	$130C
	dc.w	$0F13
	dc.w	$0C0F
	dc.w	$130C
	dc.w	$0F14
	dc.w	$0C0F
	dc.w	$130C
	dc.w	$0A0E
	dc.w	$130A
	dc.w	$0E13
	dc.w	$0A0E
	dc.w	$130A
	dc.w	$0E14
	dc.w	$0A0E
	dc.w	$130A
	dc.w	$0A0D
	dc.w	$120A
	dc.w	$0D12
	dc.w	$0A0D
	dc.w	$0C0D
	dc.w	$120C
	dc.w	$0D12
	dc.w	$0C0D
	dc.w	$0A0D
	dc.w	$120A
	dc.w	$0D12
	dc.w	$0A0D
	dc.w	$0C0D
	dc.w	$120C
	dc.w	$0D12
	dc.w	$0C0D
	dc.w	$0A0D
	dc.w	$120A
	dc.w	$0D12
	dc.w	$0A0D
	dc.w	$0C0D
	dc.w	$120C
	dc.w	$0D12
	dc.w	$0C0D
	dc.w	$0A0D
	dc.w	$120A
	dc.w	$0D12
	dc.w	$0A0D
	dc.w	$0C0D
	dc.w	$120C
	dc.w	$0D12
	dc.w	$0C0D
	dc.w	$0A0D
	dc.w	$120A
	dc.w	$0D12
	dc.w	$0A0D
	dc.w	$0C0F
	dc.w	$140C
	dc.w	$0F14
	dc.w	$0C0F
	dc.w	$0C10
	dc.w	$150C
	dc.w	$1015
	dc.w	$0C10
	dc.w	$0C10
	dc.w	$150C
	dc.w	$1015
	dc.w	$0C10
	dc.w	$0C10
	dc.w	$150C
	dc.w	$1015
	dc.w	$0C10
	dc.w	$0C10
	dc.w	$1510
	dc.w	$1118
	dc.w	$1011
	dc.w	$1710
	dc.w	$1115
	dc.w	$1011
	dc.w	$1510
	dc.w	$0E11
	dc.w	$150E
	dc.w	$1115
	dc.w	$0E11
	dc.w	$0B0F
	dc.w	$150B
	dc.w	$0F17
	dc.w	$0B0F
	dc.w	$0B0F
	dc.w	$150B
	dc.w	$0F17
	dc.w	$0B0F
	dc.w	$140B
	dc.w	$1015
	dc.w	$0B10
	dc.w	$0B10
	dc.w	$170B
	dc.w	$1015
	dc.w	$0B10
	dc.w	$140B
	dc.w	$140B
	dc.w	$1015
	dc.w	$0B10
	dc.w	$0B10
	dc.w	$170B
	dc.w	$1015
	dc.w	$0B10
	dc.w	$140B
	dc.w	$140B
	dc.w	$1015
	dc.w	$0B10
	dc.w	$0B10
	dc.w	$170B
	dc.w	$1015
	dc.w	$0B10
	dc.w	$140B
lbW05C918
	dc.w	$0900
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0909
	dc.w	$0900
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0909
	dc.w	$0700
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0707
	dc.w	$0700
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0707
	dc.w	$0600
	dc.w	$0000
	dc.w	$0000
	dc.w	$0600
	dc.w	$0800
	dc.w	$0000
	dc.w	$0000
	dc.w	$0800
	dc.w	$0A00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0A00
	dc.w	$0C00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0606
	dc.w	$0600
	dc.w	$0000
	dc.w	$0000
	dc.w	$0600
	dc.w	$0800
	dc.w	$0000
	dc.w	$0000
	dc.w	$0800
	dc.w	$0A00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0A00
	dc.w	$0C00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0C00
	dc.w	$0D00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0D00
	dc.w	$0F00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0F00
	dc.w	$1000
	dc.w	$0000
	dc.w	$0000
	dc.w	$1000
	dc.w	$1100
	dc.w	$0000
	dc.w	$0000
	dc.w	$1100
	dc.w	$1300
	dc.w	$0000
	dc.w	$0000
	dc.w	$1300
	dc.w	$1500
	dc.w	$0000
	dc.w	$1300
	dc.w	$0000
	dc.w	$1100
	dc.w	$0000
	dc.w	$1000
	dc.w	$0000
	dc.w	$0E00
	dc.w	$0000
	dc.w	$0C00
	dc.w	$0000
	dc.w	$0B00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0B00
	dc.w	$1000
	dc.w	$0000
	dc.w	$0E00
	dc.w	$0000
	dc.w	$0C00
	dc.w	$0000
	dc.w	$0B00
	dc.w	$0000
	dc.w	$1000
	dc.w	$0E00
	dc.w	$0C00
	dc.w	$0B00
	dc.w	$1000
	dc.w	$0E00
	dc.w	$0C00
	dc.w	$0B00
	dc.w	$100E
	dc.w	$0C0B
	dc.w	$100E
	dc.w	$0C0B
	dc.w	$100E
	dc.w	$0C0B
	dc.w	$100E
	dc.w	$0C0B
lbW05CA18
	dc.w	$2D6B
	dc.w	$4A49
	dc.w	$2D2D
	dc.w	$2D2D
	dc.w	$2D2D
	dc.w	$2D2D
	dc.w	$6B6B
	dc.w	$6B6B
	dc.w	$6B6B
	dc.w	$6B6B
	dc.w	$4A4A
	dc.w	$4A4A
	dc.w	$4A4A
	dc.w	$4A4A
	dc.w	$2929
	dc.w	$2929
	dc.w	$2929
	dc.w	$2929
lbW05CA3C
	dc.w	$0D00
	dc.w	$000D
	dc.w	$000D
	dc.w	$0D0F
lbW05CA44
	dc.w	$1400
	dc.w	$110F
	dc.w	$0D00
	dc.w	$0F11
	dc.w	$1400
	dc.w	$110F
	dc.w	$0D00
	dc.w	$0F11
	dc.w	$1400
	dc.w	$110F
	dc.w	$0D00
	dc.w	$0F11
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0008
	dc.w	$1400
	dc.w	$110F
	dc.w	$0D00
	dc.w	$0F11
	dc.w	$1400
	dc.w	$110F
	dc.w	$0D00
	dc.w	$0F11
	dc.w	$1400
	dc.w	$100F
	dc.w	$0D00
	dc.w	$0F10
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0008
lbW05CA84
	dc.w	$1917
	dc.w	$0016
	dc.w	$0014
	dc.w	$0012
	dc.w	$1100
	dc.w	$120D
	dc.w	$0000
	dc.w	$000D
	dc.w	$1200
	dc.w	$1211
	dc.w	$0000
	dc.w	$1414
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000D
	dc.w	$1917
	dc.w	$0016
	dc.w	$0014
	dc.w	$0012
	dc.w	$1100
	dc.w	$120D
	dc.w	$0000
	dc.w	$000D
	dc.w	$1200
	dc.w	$0011
	dc.w	$0000
	dc.w	$0D00
	dc.w	$0B00
	dc.w	$0000
	dc.w	$0000
	dc.w	$000D
lbW05CAC4
	dc.w	$1011
	dc.w	$1400
	dc.w	$1411
	dc.w	$1416
	dc.w	$1717
	dc.w	$1600
	dc.w	$1400
	dc.w	$1117
	dc.w	$0017
	dc.w	$1600
	dc.w	$1400
	dc.w	$1614
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000D
	dc.w	$1011
	dc.w	$1400
	dc.w	$0011
	dc.w	$1416
	dc.w	$1717
	dc.w	$1600
	dc.w	$1400
	dc.w	$1117
	dc.w	$0017
	dc.w	$1600
	dc.w	$1400
	dc.w	$1617
	dc.w	$0019
	dc.w	$001B
	dc.w	$0019
	dc.w	$0000
	dc.w	$1D00
	dc.w	$0000
	dc.w	$1900
	dc.w	$0000
	dc.w	$1700
	dc.w	$0014
	dc.w	$0000
	dc.w	$0014
	dc.w	$1D1D
	dc.w	$1D1E
	dc.w	$1D00
	dc.w	$1900
	dc.w	$1717
	dc.w	$1417
	dc.w	$0000
	dc.w	$0000
	dc.w	$1D00
	dc.w	$0000
	dc.w	$1900
	dc.w	$0000
	dc.w	$1700
	dc.w	$0014
	dc.w	$0000
	dc.w	$0014
	dc.w	$1D1D
	dc.w	$1D1E
	dc.w	$1D00
	dc.w	$1900
	dc.w	$1717
	dc.w	$1417
	dc.w	$0000
	dc.w	$1210
lbW05CB44
	dc.w	$1214
	dc.w	$1719
	dc.w	$1714
	dc.w	$1214
	dc.w	$1719
	dc.w	$1714
	dc.w	$1214
	dc.w	$1719
	dc.w	$1714
	dc.w	$1200
lbW05CB58
	dc.w	$0F00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000F
	dc.w	$1900
	dc.w	$0016
	dc.w	$0000
	dc.w	$0F00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000F
	dc.w	$1100
	dc.w	$000D
	dc.w	$0000
	dc.w	$0A00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0008
	dc.w	$0A00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0012
	dc.w	$0F00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000F
	dc.w	$1900
	dc.w	$0016
	dc.w	$0000
	dc.w	$0F00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000F
	dc.w	$1100
	dc.w	$000D
	dc.w	$0000
	dc.w	$0800
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0800
	dc.w	$0300
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$001E
lbW05CBD8
	dc.w	$2E00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0029
	dc.w	$2C00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$2E00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0022
	dc.w	$2700
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000D
lbW05CC18
	dc.w	$0F00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000A
	dc.w	$0D00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$1400
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000F
	dc.w	$1200
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$000D
lbW05CC58
	dc.w	$0A0D
	dc.w	$0F12
	dc.w	$0A0D
	dc.w	$0F14
	dc.w	$0A0D
	dc.w	$0F12
	dc.w	$0A0D
	dc.w	$0F11
lbW05CC68
	dc.w	$0D0F
	dc.w	$140D
	dc.w	$0F14
	dc.w	$0D0F
	dc.w	$0B0D
	dc.w	$120A
	dc.w	$0D12
	dc.w	$060D
	dc.w	$0B0D
	dc.w	$120A
	dc.w	$0B12
	dc.w	$0A0B
	dc.w	$0D0F
	dc.w	$140D
	dc.w	$0F14
	dc.w	$0D0F
lbW05CC88
	dc.w	$018D
	dc.w	$0000
	dc.w	$0000
	dc.w	$000D
	dc.w	$0D0D
	dc.w	$0B00
	dc.w	$0800
	dc.w	$0806
	dc.w	$010D
	dc.w	$0B00
	dc.w	$0800
	dc.w	$0608
	dc.w	$0008
	dc.w	$0B00
	dc.w	$0800
	dc.w	$0608
lbW05CCA8
	dc.w	$0D00
	dc.w	$000D
	dc.w	$0000
	dc.w	$0D0D
	dc.w	$0B00
	dc.w	$0B0A
	dc.w	$0000
	dc.w	$0600
	dc.w	$0B00
	dc.w	$000A
	dc.w	$0000
	dc.w	$0B00
	dc.w	$0D00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
lbW05CCC8
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0F12
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$1416
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
lbW05CD28
	dc.w	$0D99
	dc.w	$0019
	dc.w	$0000
	dc.w	$1900
	dc.w	$1700
	dc.w	$0016
	dc.w	$0000
	dc.w	$1200
	dc.w	$0D00
	dc.w	$000D
	dc.w	$0000
	dc.w	$0D00
	dc.w	$0B00
	dc.w	$000A
	dc.w	$0000
	dc.w	$0600
	dc.w	$0D99
	dc.w	$0019
	dc.w	$0000
	dc.w	$1900
	dc.w	$1700
	dc.w	$0016
	dc.w	$0000
	dc.w	$1200
	dc.w	$0D00
	dc.w	$000D
	dc.w	$0000
	dc.w	$0D00
	dc.w	$0B00
	dc.w	$0000
	dc.w	$0000
	dc.w	$0012
lbW05CD68
	dc.w	$0FFF
	dc.w	$0FC5
	dc.w	$0F8B
	dc.w	$0F52
	dc.w	$0F1A
	dc.w	$0EE3
	dc.w	$0EAC
	dc.w	$0E76
	dc.w	$0E41
	dc.w	$0E0D
	dc.w	$0DD9
	dc.w	$0DA6
	dc.w	$0D74
	dc.w	$0D43
	dc.w	$0D12
	dc.w	$0CE2
	dc.w	$0CB3
	dc.w	$0C84
	dc.w	$0C56
	dc.w	$0C29
	dc.w	$0BFD
	dc.w	$0BD1
	dc.w	$0BA5
	dc.w	$0B7A
	dc.w	$0B50
	dc.w	$0B27
	dc.w	$0AFE
	dc.w	$0AD6
	dc.w	$0AAE
	dc.w	$0A87
	dc.w	$0A60
	dc.w	$0A3A
	dc.w	$0A14
	dc.w	$09EF
	dc.w	$09CB
	dc.w	$09A7
	dc.w	$0983
	dc.w	$0961
	dc.w	$093E
	dc.w	$091C
	dc.w	$08FB
	dc.w	$08DA
	dc.w	$08B9
	dc.w	$0899
	dc.w	$087A
	dc.w	$085B
	dc.w	$083C
	dc.w	$081E
lbW05CDC8
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0014
	dc.w	$1C00
	dc.w	$141C
	dc.w	$0014
	dc.w	$1C00
	dc.w	$141C
	dc.w	$0014
	dc.w	$1C00
	dc.w	$0010
	dc.w	$1C00
	dc.w	$101C
	dc.w	$0010
	dc.w	$1C00
	dc.w	$101C
	dc.w	$0010
	dc.w	$1C00
	dc.w	$0008
	dc.w	$1C00
	dc.w	$081C
	dc.w	$0008
	dc.w	$1C00
	dc.w	$081C
	dc.w	$0008
	dc.w	$1C00
	dc.w	$000C
	dc.w	$1C00
	dc.w	$0C1C
	dc.w	$000C
	dc.w	$1C00
	dc.w	$0C1C
	dc.w	$000C
	dc.w	$1C00
	dc.w	$0001
	dc.w	$0201
	dc.w	$00FF
	dc.w	$FEFF
	dc.w	$0001
	dc.w	$0201
	dc.w	$00FF
	dc.w	$FEFF
	dc.w	$000C
	dc.w	$1800
	dc.w	$0C18
	dc.w	$000C
	dc.w	$1800
	dc.w	$0C18
	dc.w	$000C
	dc.w	$1800
	dc.w	$0030
	dc.w	$0030
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
lbW05CE48
	dc.w	$CB20
	dc.w	$A200
	dc.w	$B390
	dc.w	$A301
	dc.w	$F3B0
	dc.w	$A280
	dc.w	$03A0
	dc.w	$A729
lbW05CE58
	dc.w	$0000
lbW05CE5A
	dc.w	$0000
lbB05CE5C
	dc.b	$00
lbB05CE5D
	dc.b	$00
lbB05CE5E
	dc.b	$01
lbB05CE5F
	dc.b	$00
lbB05CE60
	dc.b	$00
	dc.b	$00
lbB05CE62
	dc.b	$00
lbB05CE63
	dc.b	$00
lbB05CE64
	dc.b	$00
	dc.b	$00
lbB05CE66
	dc.b	$00
lbB05CE67
	dc.b	$00
lbB05CE68
	dc.b	$00
	dc.b	$00
lbL05CE6A
	dc.l	lbC05C688
	dc.l	lbC05BCB0
	dc.l	lbC05BCBA
	dc.l	lbC05BD44
	dc.l	lbC05BD3A
	dc.l	lbC05BDC4
	dc.l	lbC05BE12
	dc.l	lbC05BE1C
	dc.l	lbC05BE24
	dc.l	lbC05BEBE
	dc.l	lbC05BEBE
	dc.l	lbC05BFEC
	dc.l	lbC05BF4E
	dc.l	lbC05BFEC
	dc.l	lbC05BF4E
	dc.l	lbC05BFEC
	dc.l	lbC05C064
	dc.l	lbC05C110
	dc.l	lbC05C166
	dc.l	lbC05C1B6
	dc.l	lbC05C20C
	dc.l	lbC05BF40
	dc.l	lbC05C0B6
	dc.l	lbC05C0B0
	dc.l	lbC05BF92
	dc.l	lbC05C25C
lbW05CED2
	dc.w	$0000
	dc.w	$0000
	dc.w	$0080
	dc.w	$002E
	dc.w	$0030
	dc.w	$0100
	dc.w	$0020
	dc.w	$0000
	dc.w	$0100
	dc.w	$0000
	dc.w	$0040
	dc.w	$0018
	dc.w	$0040
	dc.w	$0038
	dc.w	$0040
	dc.w	$0080
	dc.w	$0080
	dc.w	$0080
	dc.w	$0080
	dc.w	$0100
	dc.w	$00D0
	dc.w	$0040
	dc.w	$0080
	dc.w	$0100
	dc.w	$00C0
lbL05CF04
	dc.l	$50002001
	dc.l	$70001001
	dc.l	$500C3002
	dc.l	$50001008
	dc.l	$70001021
	dc.l	$5008600C
	dc.l	$5010500C
lbL05CF20
	dc.l	$00000000
	dc.l	$00000000
	dc.l	$00000000
	dc.l	$00000001
	dc.l	$00000000
	dc.l	$00000000
	dc.l	$00000900
	dc.l	$00000000
	dc.l	$00DFF0A0
	dc.l	$00000000
	dc.l	$00000001
	dc.l	$00000000
	dc.l	$00000001
	dc.l	$00000000
	dc.l	$00000000
	dc.l	$00001200
	dc.l	$00000000
	dc.l	$00DFF0B0
	dc.l	$00000000
	dc.l	$00000002
	dc.l	$00000000
	dc.l	$00000001
	dc.l	$00000000
	dc.l	$00000000
	dc.l	$00002400
	dc.l	$00000000
	dc.l	$00DFF0C0
lbL05CF8C
	dc.l	$02080208
	dc.l	$00000001
	dc.l	$00000001
	dc.l	$00010000
	dc.l	$001400DD
	dc.l	$000D08B4
	dc.l	$0000100A
	dc.l	$01010000
	dc.l	$006E000A
	dc.l	$000A08B4
	dc.l	$5000100A
	dc.l	$01010000
	dc.l	$00A0000A
	dc.l	$000108B4
	dc.l	$50001014
	dc.l	$01010000
	dc.l	$00010014
	dc.l	$000100DE
	dc.l	$100C1002
	dc.l	$01010000
	dc.l	$0104000A
	dc.l	$00010006
	dc.l	$50001001
	dc.l	$01010006
	dc.l	$00010014
	dc.l	$00010002
	dc.l	$100C1002
	dc.l	$07010007
	dc.l	$000A006E
	dc.l	$0003029A
	dc.l	$7000100C
	dc.l	$00010008
	dc.l	$0138000C
	dc.l	$00020457
	dc.l	$20001001
	dc.l	$01010009
	dc.l	$00DA0012
	dc.l	$00010457
	dc.l	$2000400C
	dc.l	$0101000A
	dc.l	$006E0136
	dc.l	$00020CE5
	dc.l	$20003004
	dc.l	$0101000B
	dc.l	$000A006E
	dc.l	$00140006
	dc.l	$70002002
	dc.l	$0101000C
	dc.l	$000C0070
	dc.l	$0000006F
	dc.l	$20004001
	dc.l	$0101000D
	dc.l	$00120012
	dc.l	$006E006F
	dc.l	$20004001
	dc.l	$0101000E
	dc.l	$006E000A
	dc.l	$000A0008
	dc.l	$5000100A
	dc.l	$0101000F
	dc.l	$0168000A
	dc.l	$00150008
	dc.l	$7000300A
	dc.l	$01010010
	dc.l	$017C000A
	dc.l	$00150008
	dc.l	$7000300A
	dc.l	$01010011
	dc.l	$0014014B
	dc.l	$000D0008
	dc.l	$300A1001
	dc.l	$01010012
	dc.l	$0168000A
	dc.l	$00150002
	dc.l	$7000300A
	dc.l	$13010013
	dc.l	$001400DD
	dc.l	$000D08B4
	dc.l	$00007001
	dc.l	$01090014
	dc.l	$00D2000A
	dc.l	$00812024
	dc.l	$50002008
	dc.l	$01080015
	dc.l	$0168000A
	dc.l	$001508B4
	dc.l	$70007001
	dc.l	$01090016
	dc.l	$001400DD
	dc.l	$00012024
	dc.l	$0000100C
	dc.l	$02080017
	dc.l	$00D2000A
	dc.l	$000208B4
	dc.l	$5000100A
	dc.l	$01080018
	dc.l	$0003000A
	dc.l	$00020001
	dc.l	$10002001
	dc.l	$01080019
	dc.l	$00010014
	dc.l	$00010001
	dc.l	$100C2001
	dc.l	$0108001A
lbW05D12C
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0F0E
	dc.w	$0D0C
	dc.w	$0B0A
	dc.w	$0908
	dc.w	$0706
	dc.w	$0504
	dc.w	$0302
	dc.w	$0100
	dc.w	$0408
	dc.w	$0D0F
	dc.w	$0E0D
	dc.w	$0C0B
	dc.w	$0A09
	dc.w	$0808
	dc.w	$0808
	dc.w	$0800
	dc.w	$0F0E
	dc.w	$0D0C
	dc.w	$0B0A
	dc.w	$0908
	dc.w	$0706
	dc.w	$0606
	dc.w	$0606
	dc.w	$0606
	dc.w	$0F0D
	dc.w	$0B09
	dc.w	$0705
	dc.w	$0301
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0000
	dc.w	$0F0E
	dc.w	$0D0D
	dc.w	$0D0D
	dc.w	$0D0D
	dc.w	$0D0D
	dc.w	$0D0D
	dc.w	$0D0D
	dc.w	$0D0D
	dc.w	$0E0D
	dc.w	$0C0B
	dc.w	$0B0A
	dc.w	$0B0A
	dc.w	$0B0A
	dc.w	$0B0A
	dc.w	$0B0A
	dc.w	$0B0A
	dc.w	$0102
	dc.w	$0304
	dc.w	$0506
	dc.w	$0708
	dc.w	$090A
	dc.w	$0B0C
	dc.w	$0B08
	dc.w	$0400

