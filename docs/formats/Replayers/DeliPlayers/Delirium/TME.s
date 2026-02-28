
	incdir	"Includes:"
	include "misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: The Musical Enlightenment player module V1.1 (10 Apr 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,1
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_Interrupt,Int
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

PName	dc.b 'TME',0
CName	dc.b 'N.J. Luuring jr.,',10
	dc.b 'adapted by Delirium',0
	even

Data	dc.l 0

*-----------------------------------------------------------------------*
;
;Interrupt für Replay

Int
	movem.l	d0-d7/a0-a6,-(sp)
	bsr	MUSIC_Player			; DudelDiDum
	movem.l	(sp)+,d0-d7/a0-a6
	rts

*-----------------------------------------------------------------------*
;
; Testet auf The_Musical_Enlightenment-Modul

Chk
	move.l	dtg_ChkData(a5),a0

	move.l	#song_SIZE,d2
	move.w	song_tableentries(a0),d0
	mulu.w	#entr_SIZE,d0
	add.l	d0,d2
	move.w	song_events(a0),d0
	mulu.w	#even_SIZE,d0
	add.l	d0,d2

	move.w	#MAXFX-1,d1
Chk_inloop
	add.l	#inuc_SIZE,d2
	cmp.l	dtg_ChkSize(a5),d2
	bgt.s	Chk_fail
	tst.b	inuc_ins-inuc_SIZE(a0,d2.l)
	bne.s	Chk_inloop
	dbra	d1,Chk_inloop

	move.w	#MAXINSTR-1,d1
	lea	song_instr(a0),a0
Chk_instl
	tst.b	inst_name(a0)
	beq.s	Chk_nextin
	add.l	inst_sample+samp_len(a0),d2
Chk_nextin
	lea	inst_SIZE(a0),a0
	dbra	d1,Chk_instl

	move.l	dtg_ChkSize(a5),d0		; size of module
	move.l	d0,d1
	sub.l	#$40,d0				; - 64 Bytes
	add.l	#$40,d1				; + 64 Bytes
	cmp.l	d0,d2
	blt.s	Chk_fail			; too small
	cmp.l	d1,d2
	bgt.s	Chk_fail			; too big

	moveq	#0,d0				; Modul erkannt
	bra.s	ChkEnd
Chk_fail
	moveq	#-1,d0				; Modul nicht erkannt
ChkEnd
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,Data

	clr.w	dtg_SndNum(a5)			; first Subsong

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
	move.l	Data,a0
	bsr	MUSIC_InitData			; Init Sound
	moveq	#0,d0
	move.w	dtg_SndNum(a5),d0
	bsr	MUSIC_Play
InitSndEnd
	rts

*-----------------------------------------------------------------------*
;
; Remove Sound

RemSnd
	bsr	MUSIC_Stop			; End Sound
	rts

*-----------------------------------------------------------------------*
;
; Previous SubSong

PrevSub
	move.w	dtg_SndNum(a5),d0		; Vorheriger Sound
	move.l	Data,a0
PrevSubLoop
	tst.w	d0
	beq.s	PrevSubEnd
	subq.w	#1,d0				; SoundNr. - 1
	move.w	d0,d1
	asl.w	#2,d1
	lea	song_tune(a0,d1.w),a1
	move.b	tune_start(a1),d1
	or.b	tune_end(a1),d1
	beq.s	PrevSubLoop			; not from 0 to 0 ...
	move.w	d0,dtg_SndNum(a5)		; SoundNr. sichern

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	bsr	RemSnd
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)				; Sound An
PrevSubEnd
	rts
	
*-----------------------------------------------------------------------*
;
; Next SubSong

NextSub
	move.w	dtg_SndNum(a5),d0		; Nächster Sound
	move.l	Data,a0
NextSubLoop
	addq.w	#1,d0				; SoundNr. + 1
	cmpi.w	#MAXTUNE,d0
	beq.s	NextSubEnd
	move.w	d0,d1
	asl.w	#2,d1
	lea	song_tune(a0,d1.w),a1
	move.b	tune_start(a1),d1
	or.b	tune_end(a1),d1
	beq.s	NextSubLoop			; not from 0 to 0 ...
	move.w	d0,dtg_SndNum(a5)		; SoundNr. sichern

	move.l	dtg_StopInt(a5),a0
	jsr	(a0)
	bsr	RemSnd
	bsr	InitSnd
	move.l	dtg_StartInt(a5),a0
	jsr	(a0)				; Sound An
NextSubEnd
	rts

*-----------------------------------------------------------------------*
;
; Replay-Routine for TME

***************************************************************************
*                                                                         *
* PLAY - module for Packed TME song-files      (DEVPAC version)           *
*                                                                         *
* Made by N.J.   (1/1/90)                                                 *
*                                                                         *
***************************************************************************
*                                                                         *
*                                                                         *
* MUSIC_Player   Is a routine to be added to your vertical-blank-handler  *
*                                                                         *
* MUSIC_InitData Can be called when the songdata is loaded/present.       *
*                This must be done before your vertical blank is going !! *
*                A0 must point to the song data (in CHIP_MEM !!)          *
*                                                                         *
* MUSIC_Stop     Must/can be called to (temporarily) stop the player      *
*                                                                         *
* MUSIC_Play     Can be called to start a tune.                           *
*                D0 is the number of the tune to be played.               * 
*                                                                         *
* MUSIC_Continue Can be called to continue a tune after MUSIC_Stop        *
*                                                                         *
* MUSIC_Times    Sets the number of times to play a tune.                 *
*                D0 is this number (0 means forever)                      *
*                                                                         *
***************************************************************************

;
;	SECTION	MUSIC
;

;
;	INCLUDE	playmodule.i
;

;*******************************************
;*                                         *
;*              STRUCTURES                 *
;*                                         *
;*******************************************

STRLEN     equ  32
MAXTUNE    equ  16
MAXINSTR   equ  32
MAXFX      equ  256
ARPLEN     equ  9
MAXARPS    equ  64
MAXLFOS    equ  16
LFOLEN     equ  128
TRACKLEN   equ  32
VOICE_OFF  equ  127
RELEASE    equ  126

samp_start   equ  0
samp_len     equ  4
samp_stlen   equ  8
samp_restoff equ  12
samp_restlen equ  16
samp_offlen  equ  20
samp_flags   equ  22
samp_SIZE    equ  24

tune_start   equ  0
tune_end     equ  1
tune_speed   equ  2
tune_mask    equ  3
tune_SIZE    equ  4

inuc_ins   equ 0
inuc_value equ 1
inuc_time  equ 2
inuc_SIZE  equ 4

envl_rate  equ 0
envl_level equ 3
envl_SIZE  equ 6

even_note   equ 0
even_sample equ 1
even_fx     equ 2
even_vol    equ 3
even_flags  equ 4
even_par    equ 5
even_SIZE   equ 6

entr_v0track   equ 0
entr_v0instadd equ 1
entr_v0noteadd equ 2
entr_v1track   equ 3
entr_v1instadd equ 4
entr_v1noteadd equ 5
entr_v2track   equ 6
entr_v2instadd equ 7
entr_v2noteadd equ 8
entr_v3track   equ 9
entr_v3instadd equ 10
entr_v3noteadd equ 11
entr_SIZE      equ 12

inst_sample equ 0
inst_name   equ samp_SIZE
inst_volume equ samp_SIZE+STRLEN
inst_eg     equ inst_volume+2
inst_fxmem  equ inst_eg+envl_SIZE
inst_SIZE   equ inst_fxmem+inuc_SIZE*16

song_len          equ 0
song_tune         equ song_len+4
song_instr        equ song_tune+tune_SIZE*MAXTUNE
song_arpeggio     equ song_instr+inst_SIZE*MAXINSTR
song_lfo          equ song_arpeggio+MAXARPS*ARPLEN
song_tableentries equ song_lfo+MAXLFOS*LFOLEN
song_events       equ song_tableentries+2
song_instructions equ song_events+2
song_name         equ song_instructions+2
song_SIZE         equ song_name+STRLEN

audi_start  equ 0
audi_len    equ 4
audi_period equ 6
audi_volume equ 8
audi_data   equ 10
audi_pad    equ 12
audi_SIZE   equ 16

fxda_src        equ 0
fxda_dst        equ 2
fxda_tolevel    equ 4
fxda_level      equ 5
fxda_tospeed    equ 6
fxda_speed      equ 7
fxda_pointer    equ 8
fxda_levelcount equ 12
fxda_speedcount equ 14
fxda_lfo        equ 16
fxda_SIZE       equ 20

voic_shadow       equ 0
voic_vibrato      equ audi_SIZE
voic_tremolo      equ voic_vibrato+fxda_SIZE
voic_special      equ voic_tremolo+fxda_SIZE
voic_instr        equ voic_special+fxda_SIZE
voic_event        equ voic_instr+4
voic_insp         equ voic_event+4
voic_egphase      equ voic_insp+4
voic_startphase   equ voic_egphase+2
voic_arpat        equ voic_startphase+2
voic_fxcount      equ voic_arpat+2
voic_gldcount     equ voic_fxcount+2
voic_egcount      equ voic_gldcount+4
voic_toperiod     equ voic_egcount+4
voic_egvolume     equ voic_toperiod+2
voic_basevolume   equ voic_egvolume+2
voic_egtovolume   equ voic_basevolume+2
voic_simplegldadd equ voic_egtovolume+2
voic_dma          equ voic_simplegldadd+2
voic_add          equ voic_dma+2
voic_arpeggio     equ voic_add+4
voic_arplen       equ voic_arpeggio+4
voic_nouse        equ voic_arplen+2
voic_doarpeggio   equ voic_nouse+1
voic_arpblow      equ voic_doarpeggio+1
voic_waitforfx    equ voic_arpblow+1
voic_basearpnote  equ voic_waitforfx+1
voic_arpcount     equ voic_basearpnote+1
voic_arponce      equ voic_arpcount+1
voic_arpspeed     equ voic_arponce+1
voic_SIZE         equ voic_arpspeed+1


;*******************************************
;*                                         *
;*                DEFINES                  *
;*                                         *
;*******************************************

BIT_ARPEGGIO    equ 0
BIT_SIMPLEGLIDE equ 1
BIT_NONOTEADD   equ 2
BIT_NOINSTADD   equ 3
BIT_SUPERGLIDE  equ 4
BIT_ARPONCE     equ 5
BIT_ARPBLOW     equ 6

ATT_PHASE equ 0
DEC_PHASE equ 1
REL_PHASE equ 2
SUS_PHASE equ 3

STARTSAMPLE equ 2
REPSAMPLE   equ 1
KILLSAMPLE  equ 0

BIT_SPECIAL equ 0

;	XDEF	MUSIC_Player
;	XDEF	MUSIC_InitData
;	XDEF	MUSIC_Stop
;	XDEF	MUSIC_Play
;	XDEF	MUSIC_Continue
;	XDEF	MUSIC_Times


tune        ds.l	1
firstentry  ds.l	1
lastentry   ds.l	1
entry       ds.l	1
spdcount    ds.l	1
trkcount    ds.l	1
times       ds.l	1
dmacon      ds.w	1
song        ds.l	1
tableentry  ds.l	1
event       ds.l	1
fx          ds.b	inuc_SIZE*MAXFX
voice       ds.b	voic_SIZE*4
NoteTable   dc.w	856,808,762,720,678,640,604,570,538,508,480,453
            dc.w	428,404,381,360,339,320,302,285,269,254,240,226
            dc.w	214,202,190,180,170,160,151,143,135,127,120,113
tabel       dc.w	1,2,1


***************************************************************************
*                                                                         *
* NEWTRACK    handles the jump over tracks, pointers are recalculated.    *
*                                                                         *
***************************************************************************

NewTrack
	move.l	#TRACKLEN,trkcount	; whole track must be done
	move.l	entry,a1		; A1 is current entry
	lea	voice,a0		; A0 is voice
	move.l	#3,d1
vloop5	move.l	#0,d0
	move.b	(a1)+,d0
	asl.l	#5,d0			; Put
	mulu.w	#6,d0			; track*6 << 5  +  event
	add.l	event,d0		; into voicedata
	move.l	d0,voic_event(a0)	; and
	move.l	a1,voic_add(a0)		; address of add is copied
	add.l	#2,a1
	add.l	#voic_SIZE,a0
	dbra	d1,vloop5
        cmp.l	lastentry,a1
        bne	nstrt			; Is it the last
        move.l	firstentry,a1		;   then make first
        sub.l	#1,times		;   and one less to play
nstrt   move.l	a1,entry		; store for next time
        rts


***************************************************************************
*                                                                         *
* NEWNOTES    handles the new notes, every time the spdcounter reaches 0  *
*                                                                         *
***************************************************************************

NewNotes
	movem.l	a2/a3/a5/a6,-(sp)
	lea	voice,a2			; a2 is at current voicedata
	lea	NoteTable,a5			; a5 is at NoteTable
	move.l	tune,a0
	move.l	#0,d3
	move.b	tune_mask(a0),d3		; d3 is mask for voices
	move.l	#3,d2				; 4 voices (so dbra from 3)
vloop3	move.l	voic_event(a2),a3		; a3 is at current event
	move.l	voic_add(a2),a6			; a6 is at table-adds
	move.l	voic_instr(a2),a1		; a1 is at instrument
	add.l	#even_SIZE,voic_event(a2)
	tst.b	voic_nouse(a2)			; is it a superglide-dest ?
	beq	weluse				;   then next will be used
	clr.b	voic_nouse(a2)			;   and goto next voice
	bra	nxtv3
weluse	move.b	even_note(a3),d0		; d0 is (long) note
	and.l	#127,d0				; is it 0 ?
	beq	nxtv3				;   then try next voice
	cmp.b	#VOICE_OFF,d0
	bne	voicon				; is it VOICE_OFF ?
	move.w	voic_dma(a2),d0			;   then
	and.w	d3,d0				;   custom.dmacon=mask|dma
	move.w	d0,$dff096			;   and goto next voice
	bra	nxtv3
voicon	cmp.b	#RELEASE,d0			; is it RELEASE ?
	bne	norel				;   then set egphase
	move.w	#REL_PHASE,voic_egphase(a2)
	bra	nxtv3
norel	btst.b	#BIT_NONOTEADD,even_flags(a3)
	bne	noad1
	add.b	1(a6),d0			; try to add the noteadd
noad1	sub.b	#1,d0				; is the note not legal ?
	bcs	nxtv3				;   then try next voice
	move.b	d0,voic_basearpnote(a2)		; put in basearpnote
	asl.l	#1,d0				; get period from table
	move.w	(a5,d0.l),voic_vibrato+fxda_src(a2)
	move.l	#0,d0
	btst.b	#BIT_SIMPLEGLIDE,even_flags(a3)
	beq	pokeadd				; get simpleglide-add in D0
	move.b	even_par(a3),d0
	ext.w	d0
pokeadd	move.w	d0,voic_simplegldadd(a2)
	clr.b	voic_doarpeggio(a2)		; clear doarpeggio
	move.l	#0,d1
	move.b	even_par(a3),d1			; get unsigned par in D1
	btst.b	#BIT_SUPERGLIDE,even_flags(a3)
	beq	nosuper				; is it SUPERGLIDE ?
	move.b	even_SIZE+even_note(a3),d0	;   get next note
	and.l	#127,d0
	btst.b	#BIT_NONOTEADD,even_flags(a3)	;   and add
	bne	noadd2
	add.b	1(a6),d0
noadd2	sub.b	#1,d0				;   is note not legal ?
	bcs	clrgld				;   then no glide, no arp
	asl.l	#1,d0
	move.w	(a5,d0.l),voic_toperiod(a2)	;   get period
	add.l	#1,d1
	move.l	d1,voic_gldcount(a2)		;   glidecount is par+1
	move.b	#1,voic_nouse(a2)		;   next note is not used
	bra	noarp
nosuper	btst.b	#BIT_ARPEGGIO,even_flags(a3)	; is it ARPEGGIO ?
	beq	clrgld				;   then
	clr.b	voic_arponce(a2)		;   get ARPONCE-value
	btst.b	#BIT_ARPONCE,even_flags(a3)	;   (1 when once)
	beq	notonce
	move.b	#1,voic_arponce(a2)
notonce	move.b	even_flags(a3),d0		;   get ARPBLOW-tstvalue
	and.b	#64,d0
	move.b	d0,voic_arpblow(a2)
	mulu.w	#ARPLEN,d1
	move.l	song,a0
	add.l	#song_arpeggio+1,a0		;   get start of arpeggio
	add.l	d1,a0
	move.l	a0,voic_arpeggio(a2)
	move.b	-1(a0),d0			;   before this stands
	move.l	#0,d1				;   - len<<4|speed -
	move.b	d0,d1
	and.b	#15,d0
	move.b	d0,voic_arpspeed(a2)		;   get speed
	add.b	#1,d0				;   for the  first:
	move.b	d0,voic_arpcount(a2)		;   count = speed + 1
	lsr.w	#4,d1
	bne	pokelen
	move.l	#8,d1				;   default len is 8
pokelen	move.w	d1,voic_arplen(a2)		;   poke len
	sub.w	#1,d1
	move.b	d1,voic_doarpeggio(a2)		;   doarpeggio is len-1
	clr.w	voic_arpat(a2)			;   start at begin of arp
clrgld	clr.l	voic_gldcount(a2)		;   no glide here
noarp	btst.b	#7,even_note(a3)
	bne	noblow				; is the note blown ?
	clr.w	voic_egphase(a2)		;   then
	clr.w	voic_egvolume(a2)		;   set new EG-values
	clr.l	voic_egcount(a2)		;   and sample-phase
	move.w	#STARTSAMPLE,voic_startphase(a2)
	move.l	#0,d0
	move.b	even_sample(a3),d0
	beq	samein				;   a new instrument ?
	sub.b	#1,d0				;     then
	btst.b	#BIT_NOINSTADD,even_flags(a3)	;     get instr-no
	bne	noadd3				;          (plus add)
	add.b	(a6),d0
	and.b	#$1f,d0				;     (ensure legality)
noadd3	asl.l	#7,d0
	move.l	song,a1
	add.l	#song_instr,a1			;     to instr-pointer
	add.l	d0,a1				;     into A1
	move.l	a1,voic_instr(a2)		;     and the structure
samein	move.w	voic_dma(a2),d0
	and.w	d3,d0				;   clr custom.dmacon,
	or.w	d0,dmacon			;   and prepare to set
	move.w	d0,$dff096
	move.l	#0,d0
	move.b	even_fx(a3),d0			;   get fx-pointer
	beq	deffx
	asl.l	#2,d0				;   non-default is from
	lea	fx,a0				;   the song structure
	move.l	(a0,d0.l),a0
	bra	pokefx				;   default comes from
deffx	lea	inst_fxmem(a1),a0		;   the instrument
pokefx	move.l	a0,voic_insp(a2)
	clr.b	voic_vibrato+fxda_level(a2)	;   clear all fx-levels
	clr.b	voic_vibrato+fxda_speed(a2)	;   and fx-speeds
	clr.b	voic_tremolo+fxda_level(a2)
	clr.b	voic_tremolo+fxda_speed(a2)
	clr.b	voic_special+fxda_level(a2)
	clr.b	voic_special+fxda_speed(a2)
	clr.l	voic_vibrato+fxda_pointer(a2)
	clr.l	voic_tremolo+fxda_pointer(a2)
	clr.l	voic_special+fxda_pointer(a2)	;   let TryNewFx do it...
	move.b	#1,voic_waitforfx(a2)		;   we are ready with waiting
	clr.w	voic_fxcount(a2)
noblow	move.b	inst_volume(a1),d0		; get instr-volume
	add.b	even_vol(a3),d0			; and add the volume-add
	ext.w	d0				; into the basevolume
	move.w	d0,voic_basevolume(a2)
nxtv3	add.l	#voic_SIZE,a2			; next voicedata
	dbra	d2,vloop3			; go again until all 4 voices
	movem.l	(sp)+,a2/a3/a5/a6		; are done
	rts


***************************************************************************
*                                                                         *
* TRYNEWFX    walks over the fx, every time the fxcounter reaches 0       *
*                                                                         *
***************************************************************************

TryNewFx
	movem.l	a2/a3,-(sp)
	lea	voice,a2			; A2 is at voicedata
	move.l	song,a1
	add.l	#song_lfo,a1			; A1 is at lfo
	move.l	#3,d3
vloop4	tst.b	voic_waitforfx(a2)		; are we waiting ?
	beq	nxtv4				;   if not then next voice
	sub.w	#1,voic_fxcount(a2)		;   dec fxcount
	bcc	nxtv4				;   if not ready then next
	move.l	voic_insp(a2),a3		;   A3 is instruction-pointer
iloop	move.b	inuc_ins(a3),d0
	and.l	#$f0,d0
	lsr.l	#3,d0				;   instruction in D0
	move.w	jmptab(pc,d0.w),d0		;   get jump-offset
jmpfrom	jmp	jmpfrom(pc,d0.w)		;   jump to right routine
nxtv4	add.l	#voic_SIZE,a2			;   get next voicedata
	dbra	d3,vloop4			;   for all 4 voices
	movem.l	(sp)+,a2/a3
	rts
jmptab	dc.w	stop-jmpfrom			; 0 = STOP
	dc.w	vlev-jmpfrom			; 1 = VIBRATO.level
	dc.w	vspd-jmpfrom			; 2 = VIBRATO.speed
	dc.w	tlev-jmpfrom			; 3 = TREMOLO.level
	dc.w	tspd-jmpfrom			; 4 = TREMOLO.speed
	dc.w	slev-jmpfrom			; 5 = SPECIAL.level
	dc.w	sspd-jmpfrom			; 6 = SPECIAL.speed
	dc.w	dela-jmpfrom			; 7 = DELAY
	dc.w	goto-jmpfrom			; 8 = GOTO
stop	clr.b	voic_waitforfx(a2)
	bra	nxtv4
vlev	move.b	inuc_value(a3),voic_vibrato+fxda_tolevel(a2)
	move.w	inuc_time(a3),voic_vibrato+fxda_levelcount(a2)
	add.w	#1,voic_vibrato+fxda_levelcount(a2)
	move.b	inuc_ins(a3),d0
	and.l	#15,d0
	asl.l	#7,d0
	add.l	a1,d0
	move.l	d0,voic_vibrato+fxda_lfo(a2)
	add.l	#inuc_SIZE,a3
	bra	iloop
vspd	move.b	inuc_value(a3),voic_vibrato+fxda_tospeed(a2)
	move.w	inuc_time(a3),voic_vibrato+fxda_speedcount(a2)
	add.w	#1,voic_vibrato+fxda_speedcount(a2)
	add.l	#inuc_SIZE,a3
	bra	iloop
tlev	move.b	inuc_value(a3),voic_tremolo+fxda_tolevel(a2)
	move.w	inuc_time(a3),voic_tremolo+fxda_levelcount(a2)
	add.w	#1,voic_tremolo+fxda_levelcount(a2)
	move.b	inuc_ins(a3),d0
	and.l	#15,d0
	asl.l	#7,d0
	add.l	a1,d0
	move.l	d0,voic_tremolo+fxda_lfo(a2)
	add.l	#inuc_SIZE,a3
	bra	iloop
tspd	move.b	inuc_value(a3),voic_tremolo+fxda_tospeed(a2)
	move.w	inuc_time(a3),voic_tremolo+fxda_speedcount(a2)
	add.w	#1,voic_tremolo+fxda_speedcount(a2)
	add.l	#inuc_SIZE,a3
	bra	iloop
slev	move.b	inuc_value(a3),voic_special+fxda_tolevel(a2)
	move.w	inuc_time(a3),voic_special+fxda_levelcount(a2)
	add.w	#1,voic_special+fxda_levelcount(a2)
	move.b	inuc_ins(a3),d0
	and.l	#15,d0
	asl.l	#7,d0
	add.l	a1,d0
	move.l	d0,voic_special+fxda_lfo(a2)
	add.l	#inuc_SIZE,a3
	bra	iloop
sspd	move.b	inuc_value(a3),voic_special+fxda_tospeed(a2)
	move.w	inuc_time(a3),voic_special+fxda_speedcount(a2)
	add.w	#1,voic_special+fxda_speedcount(a2)
	add.l	#inuc_SIZE,a3
	bra	iloop
dela	move.w	inuc_time(a3),voic_fxcount(a2)
	add.l	#inuc_SIZE,a3
	move.l	a3,voic_insp(a2)
	bra	nxtv4
goto	move.l	#0,d0
	move.b	inuc_value(a3),d0
	asl.l	#2,d0
	lea	fx,a0
	move.l	(a0,d0.l),a3
	bra	iloop


***************************************************************************
*                                                                         *
* CALCFXDATA  calculates vibrato/tremolo fxvalues, every frame 3x         *
*                                                                         *
***************************************************************************

CalcFxData
	move.b	fxda_tolevel(a1),d0	; are we going somewhere ?
	beq	jcopy			; if not then just copy src to dst
	tst.w	fxda_levelcount(a1)
	beq	levred			; is level not yet OK ?
	sub.b	fxda_level(a1),d0	;   then get difference with tolevel
	ext.w	d0			;   into long
	ext.l	d0
	divs.w	fxda_levelcount(a1),d0	;   and part of it
	add.b	d0,fxda_level(a1)	;   must be added to the level
	sub.w	#1,fxda_levelcount(a1)	;   (less to go)
levred	tst.w	fxda_speedcount(a1)
	beq	spdred			; is speed not yet OK ?
	move.b	fxda_tospeed(a1),d0	;   then get difference from
	sub.b	fxda_speed(a1),d0	;   tospeed and speed
	ext.w	d0			;   into long
	ext.l	d0
	divs.w	fxda_speedcount(a1),d0	;   and part of it
	add.b	d0,fxda_speed(a1)	;   must be added to speed
	sub.w	#1,fxda_speedcount(a1)	;   (less to go)
spdred	move.l	fxda_pointer(a1),d1
	move.l	fxda_lfo(a1),a0
	move.b	(a0,d1.l),d0		; get current lfo-value
	ext.w	d0			; into word D0
	move.l	#0,d1
	move.b	fxda_level(a1),d1	; multiply
	muls.w	d1,d0			; with unsigned word-level
	lsr.l	d2,d0			; shift by second parameter
	add.w	fxda_src(a1),d0		; and add source to it
	move.w	d0,fxda_dst(a1)		; into destination
	move.b	fxda_speed(a1),d0	
	add.b	d0,fxda_pointer+3(a1)	; add speed to pointer
	and.l	#127,fxda_pointer(a1)	; keep it within range
	rts
jcopy	move.w	fxda_src(a1),fxda_dst(a1)
	rts


***************************************************************************
*                                                                         *
* CALCFX      calculates all (new) dma-values, every frame again          *
*                                                                         *
***************************************************************************

CalcFx
	movem.l	d5/a2/a3/a5/a6,-(sp)
	lea	voice,a2			; A2 is at voicedata
	lea	NoteTable,a5			; A5 is at NoteTable
	lea	tabel,a6			; A6 is at phase-add table
	move.l	tune,a0
	move.l	#0,d3
	move.b	tune_mask(a0),d3		; D3 is mask
	move.l	#3,d5
vloop1	move.l	voic_instr(a2),a3		; A3 is at instrument
	move.w	voic_simplegldadd(a2),d0	; add simplegldadd
	add.w	d0,voic_vibrato+fxda_src(a2)	; to vibrato.src
	move.l	voic_gldcount(a2),d1
	beq	nogld
	move.l	#0,d0				; do we have SUPERGLIDE ?
	move.l	#0,d2				;   then
	move.w	voic_toperiod(a2),d0		;   get difference of
	move.w	voic_vibrato+fxda_src(a2),d2	;   unsigned values
	sub.l	d2,d0				;   and part of it
	divs.w	d1,d0				;   is added to the
	add.w	d0,voic_vibrato+fxda_src(a2)	;   vibrato.src
	sub.l	#1,voic_gldcount(a2)		;   (less to go)
	bra	dovibr				;   no arpeggio...
nogld	tst.b	voic_doarpeggio(a2)
	beq	dovibr				; do we have ARPEGGIO ?
	move.l	#0,d0				;   then
	move.w	voic_arpat(a2),d1		;   get pointer in D1
	sub.b	#1,voic_arpcount(a2)		;   switch to next arpnote ?
	bcc	hanarp				;     then
	add.w	#1,d1				;     move pointer
	divu.w	voic_arplen(a2),d1		;     through arpeggio
	swap	d1				;     (MOD arplen)
	move.w	d1,voic_arpat(a2)
	move.b	voic_arpspeed(a2),voic_arpcount(a2)
	move.b	voic_arponce(a2),d0		;     reset counter
	sub.b	d0,voic_doarpeggio(a2)		;     (dec doarpeggio)
	tst.b	voic_arpblow(a2)
	beq	hanarp				;     should arp be blown ?
	move.w	#STARTSAMPLE,voic_startphase(a2);       then
	clr.w	voic_egphase(a2)		;       set startphase
	clr.l	voic_egcount(a2)		;       set new EG-values
	clr.w	voic_egvolume(a2)		;       and clr dmabit
	move.w	voic_dma(a2),d0			;       (prepare for set)
	and.w	d3,d0
	or.w	d0,dmacon
	move.w	d0,$dff096			;   and
hanarp	move.b	voic_basearpnote(a2),d0		;   Handle ARPEGGIO-period
	move.l	voic_arpeggio(a2),a0
	add.b	(a0,d1.w),d0
	asl.l	#1,d0
	move.w	(a5,d0.l),voic_vibrato+fxda_src(a2)
dovibr	move.l	#7,d2				; Calc vibrato with
	lea	voic_vibrato(a2),a1		; shift is 7
	bsr	CalcFxData
	move.w	voic_vibrato+fxda_dst(a2),d0
	cmp.w	#113,d0
	bge	okper
	move.w	#113,d0				; set period to minimum
okper	move.w	d0,voic_shadow+audi_period(a2)	; of 113
	move.l	voic_egcount(a2),d1
	beq	newpha				; busy in EG-phase ?
	move.l	#0,d0				;   then
	move.l	#0,d2				;   get difference of
	move.w	voic_egtovolume(a2),d0		;   unsigned values
	move.w	voic_egvolume(a2),d2		;   and add
	sub.l	d2,d0				;   part of it
	divs.w	d1,d0				;   to the current volume
	add.w	d0,voic_egvolume(a2)		;   (less to go)
	sub.l	#1,voic_egcount(a2)
	bra	nocha				;   else
newpha	move.w	voic_egphase(a2),d2		;   D2 is egphase
	cmp.l	#SUS_PHASE,d2			;   is it in SUSTAIN ?
	beq	nocha				;     then nothing changes
	move.l	#0,d0
	move.b	inst_eg+envl_rate(a3,d2.w),d0
	add.l	#1,d0				;   egcount    := rate + 1
	move.l	d0,voic_egcount(a2)		;   egtovolume := level
	move.b	inst_eg+envl_level(a3,d2.w),voic_egtovolume+1(a2)
	asl.w	#1,d2				;   get next egphase
	move.w	(a6,d2.w),d1			;   with adds-tabel
	add.w	d1,voic_egphase(a2)
nocha	move.w	voic_basevolume(a2),d0
	muls.w	voic_egvolume(a2),d0		; get src-volume
	asr.w	#8,d0				; from base- and egvolume
	move.w	d0,voic_tremolo+fxda_src(a2)	; and calc the tremolo
	move.l	#9,d2				; with shift 9
	lea	voic_tremolo(a2),a1
	bsr	CalcFxData
	move.w	voic_tremolo+fxda_dst(a2),d0
	cmp.w	#64,d0
	ble	okvol				; maximize volume to 64
	move.l	#64,d0
okvol	move.w	d0,voic_shadow+audi_volume(a2)
	tst.w	voic_startphase(a2)		; get start and length
	beq	nxtv1				; according to current
	cmp.w	#STARTSAMPLE,voic_startphase(a2); startphase
	bne	repsam
	move.l	inst_sample+samp_start(a3),voic_shadow+audi_start(a2)
	move.w	inst_sample+samp_stlen+2(a3),voic_shadow+audi_len(a2)
	move.w	#1,voic_startphase(a2)
	bra	nxtv1
repsam	move.l	inst_sample+samp_start(a3),voic_shadow+audi_start(a2)
	move.l	inst_sample+samp_restoff(a3),d0
	asl.l	#1,d0
	add.l	d0,voic_shadow+audi_start(a2)
	move.w	inst_sample+samp_restlen+2(a3),voic_shadow+audi_len(a2)
	clr.w	voic_startphase(a2)
nxtv1	add.l	#voic_SIZE,a2
	dbra	d5,vloop1
	movem.l	(sp)+,d5/a2/a3/a5/a6
	rts


***************************************************************************
*                                                                         *
* GLOBAL routines                                                         *
*                                                                         *
***************************************************************************

MUSIC_Player
	movem.l	d4/a2,-(sp)
	move.l	times,d0
	beq	return			; if !times return (no play).
	move.l	tune,a2			; A2 is at tune
	move.l	#0,d4			; D4 is mask
	move.b	tune_mask(a2),d4
	tst.w	dmacon
	beq	nodma			; must we set some bits ?
	move.w	dmacon,d0		;   then
	or.w	#$8200,d0		;   set them
	move.w	d0,$dff096		;   (already masked)
	clr.w	dmacon
nodma	sub.b	#1,spdcount		; time for new notes ?
	bcc	nonewno			;   then
	move.b	2(a2),spdcount		;   reset spdcount
	sub.l	#1,trkcount		;   time for new track ?
	bne	nonewtr
	bsr	NewTrack		;     then New Track
nonewtr	bsr	NewNotes		;   New Notes
nonewno	bsr	TryNewFx		; walk through fx
	bsr	CalcFx			; calc all dma-values
	move.l	#3,d1
	lea	voice,a0		; A0 is at voicedata
	move.l	#$dff0a0,a1		; A1 is at hardware-audio
vloop2	move.w	d4,d0			; if mask is set ?
	and.w	voic_dma(a0),d0		;   then poke dma-values
	beq	nxtv2
	move.l	voic_shadow+audi_start(a0),audi_start(a1)
	move.w	voic_shadow+audi_len(a0),audi_len(a1)
	move.w	voic_shadow+audi_period(a0),audi_period(a1)
	move.w	voic_shadow+audi_volume(a0),audi_volume(a1)
nxtv2	add.l	#voic_SIZE,a0		; get next voicedata
	add.l	#audi_SIZE,a1		; and next audio-channel
	dbra	d1,vloop2		; until all voices are done
return	movem.l	(sp)+,d4/a2
	rts

MUSIC_InitData
	move.w	#255,$dff09e
	move.l	a0,song			; ->  Song structure
	move.l	a0,a1
	add.l	#song_SIZE,a0
	move.l	a0,tableentry		; ->  TableEntries
	move.w	song_tableentries(a1),d0
	mulu.w	#entr_SIZE,d0
	add.l	d0,a0
	move.l	a0,event		; ->  Events
	move.w	song_events(a1),d0
	mulu.w	#even_SIZE,d0
	add.l	d0,a0
	move.l	#0,d1
	lea	fx,a1			; ->  Fx
fxloop	move.l	a0,(a1,d1.l)
inloop	add.l	#inuc_SIZE,a0
	tst.b	inuc_ins-inuc_SIZE(a0)
	bne	inloop
	add.l	#inuc_SIZE,d1
	cmp.l	#inuc_SIZE*MAXFX,d1
	blt	fxloop
	move.l	#0,d1
	move.l	song,a1
	add.l	#song_instr,a1
instl	tst.b	inst_name(a1,d1.l)	; -> Sample Data
	beq	nextin
	move.l	a0,inst_sample+samp_start(a1,d1.l)
	add.l	inst_sample+samp_len(a1,d1.l),a0
nextin	add.l	#inst_SIZE,d1
	cmp.l	#inst_SIZE*MAXINSTR,d1
	blt	instl

MUSIC_Stop
	move.l	#0,times		; no playing,
	move.w	#15,$dff096		; clear dma
;	bclr    #1,$bfe001		; and LED on
	clr.w	dmacon
	rts

MUSIC_Play
	asl.l	#2,d0
	move.l	song,a1
	add	#song_tune,a1
	add.l	d0,a1
	move.l	a1,tune			; get pointer to current tune
	bsr	MUSIC_Stop		; and stop the music
	move.b	tune_start(a1),d0
	or.b	tune_end(a1),d0
	bne	normal			; not from 0 to 0 ...
	rts
normal	move.l	#0,d0
	move.b	tune_start(a1),d0
	mulu.w	#entr_SIZE,d0
	add.l	tableentry,d0
	move.l	d0,firstentry		; set first,
	move.l	#0,d0			; and lastentry
	move.b	tune_end(a1),d0
	mulu.w	#entr_SIZE,d0
	add.l	tableentry,d0
	move.l	d0,lastentry
	move.w	#1,voice+voic_SIZE*0+voic_dma
	move.w	#2,voice+voic_SIZE*1+voic_dma
	move.w	#4,voice+voic_SIZE*2+voic_dma
	move.w	#8,voice+voic_SIZE*3+voic_dma
	move.w	#0,voice+voic_SIZE*0+voic_egtovolume
	move.w	#0,voice+voic_SIZE*1+voic_egtovolume
	move.w	#0,voice+voic_SIZE*2+voic_egtovolume
	move.w	#0,voice+voic_SIZE*3+voic_egtovolume
	move.l	firstentry,d0
	add.l	#entr_SIZE,d0
	move.l	d0,entry		; entry is firstentry+1

MUSIC_Continue
	bsr	MUSIC_Stop		; first stop the music
	move.l	tune,a0			; set new spdcount
	clr.l	spdcount
	move.b	tune_speed(a0),spdcount+3
	move.l	entry,a0
	cmp.l	firstentry,a0		; go back one entry
	bne	okentr
	move.l	lastentry,a0
okentr	sub.l	#entr_SIZE,a0
	move.l	a0,entry
	bsr	NewTrack		; and prepare for this track
	add.l	#1,trkcount
	move.l	tune,a1
;	btst.b	#4,tune_mask(a1)	; handle LED for this tune
;	beq	ledon
;	bset    #1,$bfe001
;	bra	okled
;ledon	bclr    #1,$bfe001
okled	move.l	#$ffffffff,times	; START play endlessly
	rts

MUSIC_Times
	tst.l	d0
	bne	oktime
	move.l	#$ffffffff,d0
oktime	move.l	d0,times
	rts
