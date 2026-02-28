
	incdir	"Includes:"
	include	"misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Maniacs of Noise player module V1.0 (11 Sep 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,1
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_Interrupt,Int
	dc.l	DTP_SubSongRange,SubSong
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,RemSnd
	dc.l	DTP_PrevSong,PrevSub
	dc.l	DTP_NextSong,NextSub
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName	dc.b 'M.O.N.',0
CName	dc.b 'Maniacs of Noise/Charles Deenen,',10
	dc.b 'adapted by Delirium',0
	even
mon_data	dc.l 0

MaxSong		dc.w 0
MaxSong2	dc.w 0

*-----------------------------------------------------------------------*
;
;Interrupt für Replay

Int
	movem.l	d0-d7/a0-a6,-(sp)
	move.l	mon_data(pc),a0
	jsr	4(a0)				; DudelDiDum
	movem.l	(sp)+,d0-d7/a0-a6
	rts

*-----------------------------------------------------------------------*
;
; Testet auf Maniacs of Noise-Modul

Chk
	move.l	dtg_ChkData(a5),a0
	move.l	dtg_ChkSize(a5),d1

	moveq	#-1,d0				; Modul nicht erkannt (default)

	cmpi.w	#$4efa,$00(a0)
	bne.s	Unknown
	cmpi.w	#$4efa,$04(a0)
	bne.s	Unknown
	cmpi.w	#$4efa,$08(a0)
	bne.s	Unknown
	cmpi.w	#$4efa,$0c(a0)
	beq.s	Unknown

Check1	cmpi.w	#$4BFA,$00(a0)
	bne.s	Check2
	cmpi.w	#$0280,$04(a0)
	bne.s	Check2
	cmpi.l	#$000000FF,$06(a0)
	bne.s	Check2
	cmpi.l	#$5300B02D,$14(a0)
	beq.s	FindLastSong
Check2	addq.l	#2,a0
	subq.l	#2,d1
	bpl.s	Check1
	bra.s	Unknown
FindLastSong
	move.w	$0002(a0),d1
	lea	0(a0,d1.w),a1
	move.w	$0018(a0),d1
	lea	0(a1,d1.w),a1
	moveq	#0,d0
	move.b	2(a1),d0
	move.w	d0,MaxSong2

	moveq	#0,d0				; Modul erkannt
Unknown
	rts

*-----------------------------------------------------------------------*
;
; Set min. & max. subsong number

SubSong
	moveq	#1,d0				; min.
	move.w	MaxSong(pc),d1			; max.
	rts

*-----------------------------------------------------------------------*

; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,mon_data

	move.w	MaxSong2(pc),MaxSong		; copy buffer

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

; Init Sound

InitSnd
	move.l	a5,-(sp)
	moveq	#$00,d0
	move.l	mon_data(pc),a0
	jsr	(a0)
	move.l	(sp)+,a5

	move.l	a5,-(sp)
	moveq	#$00,d0
	move.w	dtg_SndNum(a5),d0
	moveq	#$00,d1
	move.l	mon_data(pc),a0
	jsr	$0008(a0)
	move.l	(sp)+,a5
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	move.l	a5,-(sp)
	moveq	#$00,d0
	moveq	#$00,d1
	move.l	mon_data(pc),a0
	jsr	$0008(a0)
	move.l	(sp)+,a5
	rts

*-----------------------------------------------------------------------*
;
; Previous SubSong

PrevSub
	cmpi.w	#1,dtg_SndNum(a5)		; min. subsongnumber reached ?
	beq.s	PrevSubEnd

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	bsr	RemSnd
	subq.w	#1,dtg_SndNum(a5)		; Vorheriger Sound
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)
PrevSubEnd
	rts
	
*-----------------------------------------------------------------------*
;
; Next SubSong

NextSub
	move.w	dtg_SndNum(a5),d0
	cmp.w	MaxSong(pc),d0			; max. subsongnumber reached ?
	beq.s	NextSubEnd

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	bsr	RemSnd
	addq.w	#1,dtg_SndNum(a5)		; Nächster Sound
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)
NextSubEnd
	rts

*-----------------------------------------------------------------------*


