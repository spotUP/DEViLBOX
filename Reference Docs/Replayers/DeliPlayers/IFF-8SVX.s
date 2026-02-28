
	opt o-,d-

	incdir	"Includes:"
	include	"misc/DevpacMacros.i"
	include	"misc/DeliPlayer.i"
	include	"exec/exec.i"
	include	"exec/io.i"
	include	"devices/audio.i"


Left_0		EQU 1				; Audiokanal 1
Right_1		EQU 2				; Audiokanal 2
Right_2		EQU 4				; Audiokanal 3
Left_3		EQU 8				; Audiokanal 4

FORM		EQU ('F'<<24)!('O'<<16)!('R'<<8)!('M')
ID_8SVX		EQU ('8'<<24)!('S'<<16)!('V'<<8)!('X')
ID_VHDR		EQU ('V'<<24)!('H'<<16)!('D'<<8)!('R')
ID_CHAN		EQU ('C'<<24)!('H'<<16)!('A'<<8)!('N')
ID_SEQN		EQU ('S'<<24)!('E'<<16)!('Q'<<8)!('N')
ID_FADE		EQU ('F'<<24)!('A'<<16)!('D'<<8)!('E')
ID_BODY		EQU ('B'<<24)!('O'<<16)!('D'<<8)!('Y')

sCmpNone	EQU 0

sCompression	EQU 15
samplesPerSec	EQU 12

sampletype	EQU 0
LEFT		EQU 2
RIGHT		EQU 4
STEREO		EQU 6


*-----------------------------------------------------------------------*

    STRUCTURE	DeliPlayMsg,MN_SIZE
	APTR	dpm_Command
	LONG	dpm_UserData
	LABEL	dpm_SIZEOF

*-----------------------------------------------------------------------*


;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: IFF-8SVX player module V1.3 (08 Apr 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,2
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_StartInt,StartSnd
	dc.l	DTP_StopInt,StopSnd
	dc.l	DTP_Volume,SetVol
	dc.l	DTP_Balance,SetVol
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName		dc.b 'IFF-8SVX',0

CName		dc.b 'Frank Riffel and Peter Kunath in 1992',0

TaskName	dc.b 'IFF-8SVX_Player',0
DeliPortName	dc.b '8SVX->Player',0
PlayerPortName	dc.b '8SVX<-Player',0
AudioPortName	dc.b '8SVX_Player',0
audioname	dc.b 'audio.device',0
ChannelMap	dc.b Left_0!Right_1
		dc.b Left_0!Right_2
		dc.b Left_3!Right_1
		dc.b Left_3!Right_2
	even

_DOSBase	dc.l 0
SongendPtr	dc.l 0
QuitFlag	dc.w 0

s_adr		dc.l 0			; Startaddress
s_end		dc.l 0			; Endaddress
s_size		dc.l 0			; Samplesize
s_speed		dc.w 0			; Initial Speed
s_chan1		dc.l 0			; channel 1
s_chan2		dc.l 0			; channel 2

p_chmap		dc.l 0			; channelmap
p_size		dc.l 0			; Samplesize
p_pos		dc.l 0			; Position in sample
p_len		dc.l 0			; Length of sampleblock
p_speed		dc.w 0			; see above ... for playing
p_chan1		dc.l 0			; channel 1
p_chan2		dc.l 0			; channel 2
p_l_vol		dc.w 0			; left volume
p_r_vol		dc.w 0			; right volume
p_wmsg		dc.w 0			; write message counter
p_pause		dc.w 0			; playing/paused
p_endpos	dc.l 0			; songend

p_ioreq1	dc.l IORequest1a
p_ioreq1b	dc.l IORequest1b
p_ioreq2	dc.l IORequest2a
p_ioreq2b	dc.l IORequest2b

PlayerPort	dcb.b MP_SIZE,0
DeliPort	dcb.b MP_SIZE,0

DeliMsg		dcb.b dpm_SIZEOF,0

AudioPort	dcb.b MP_SIZE,0

IORequest	dcb.b ioa_SIZEOF,0
IORequest1a	dcb.b ioa_SIZEOF,0
IORequest1b	dcb.b ioa_SIZEOF,0
IORequest2a	dcb.b ioa_SIZEOF,0
IORequest2b	dcb.b ioa_SIZEOF,0

*-----------------------------------------------------------------------*
;
; Testet auf IFF 8SVX

Chk
	move.l	dtg_ChkData(a5),a0

	cmpi.l	#FORM,(a0)+			; right file type ?
	bne	ChkErr				; no IFF File at all
	move.l	(a0)+,a1			; size
	cmp.l	dtg_ChkSize(a5),a1
	bgt	ChkErr				; file is too small
	add.l	a0,a1				; calculate last address
	move.l	a1,s_end			; end address in memory

	cmpi.l	#ID_8SVX,(a0)+			; is it a 8SVX sample file?
	bne	ChkErr				; no
	move.l	a0,s_adr			; start address in memory

	move.l	#ID_VHDR,d0			; find VHDR chunk
	move.l	s_adr,a0			; start address
	move.l	s_end,a1			; end address
	bsr.s	FindChunk			; search chunk
	tst.l	d0				; test result
	beq.s	ChkErr				; this file must be mangled!

	addq.l	#4,a0				; skip chunk length
	cmpi.b	#sCmpNone,sCompression(a0)	; is the sample packed?
	bne.s	ChkErr				; packing is not supported yet
	move.w	samplesPerSec(a0),s_speed	; samples per second

	moveq	#0,d2				; sample is mono (default)

	move.l	#ID_CHAN,d0			; find CHAN chunk
	move.l	s_adr,a0			; start address
	move.l	s_end,a1			; end address
	bsr.s	FindChunk			; search chunk
	tst.l	d0				; test result
	beq.s	ChkNoChan			; sorry, no chan chunk found

	addq.l	#4,a0				; skip chunk length
	cmpi.l	#STEREO,sampletype(a0)		; type of sample ?
	bne.s	ChkNoChan			; LEFT and RIGHT are ignored and it
	moveq	#1,d2				; is played in mono on both speakers
ChkNoChan
	move.l	#ID_BODY,d0			; find BODY chunk
	move.l	s_adr,a0			; start address
	move.l	s_end,a1			; end address
	bsr.s	FindChunk			; search chunk
	tst.l	d0				; test result
	beq.s	ChkErr				; sorry, no body chunk found

	move.l	(a0)+,d1			; chunk size
	lsr.l	d2,d1				; halfe size if stereo
	move.l	d1,s_size			; save size of the sample
	move.l	a0,s_chan1			; waveform data for channel 1
	mulu	d2,d1				; same data if mono
	add.l	d1,a0				; add size
	move.l	a0,s_chan2			; waveform data for channel 2

	moveq	#0,d0				; it is a sample!
	bra.s	ChkEnd
ChkErr
	moveq	#-1,d0				; not a sample !
ChkEnd
	rts

;-----------------------------------------------------------------------
;
; This function finds the given chunk and skips all others in between!
;
; in:	d0.l ChunkID
;	a0.l StartPosition
;	a1.l LastPosition
;
; out:	a0.l ChunkStart if not found NULL

FindChunk
	cmp.l	(a0)+,d0			; is this the searched chunk ?
	beq.s	Found				; yes !
	adda.l	(a0)+,a0			; no, then skip this chunk
	cmpa.l	a0,a1				; are we behind the mem limit ?
	bgt.s	FindChunk			; no, search until error or success
	suba.l	a0,a0				; we are behind the limits
	moveq	#0,d0				; errorflag
Found	rts					; exit this routine

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	move.l	dtg_DOSBase(a5),_DOSBase	; DOS

	move.l	dtg_SongEnd(a5),SongendPtr	; store Songend FunctionPtr

	lea	PlayerPort(pc),a0		; init Port
	clr.l	LN_SUCC(a0)
	clr.l	LN_PRED(a0)
	move.b	#NT_MSGPORT,LN_TYPE(a0)
	clr.b	LN_PRI(a0)
	move.l	#PlayerPortName,LN_NAME(a0)
	move.b	#PA_SIGNAL,MP_FLAGS(a0)

	moveq	#-1,d0
	CALLEXEC AllocSignal			; Signalbit für PlayerPort besorgen
	lea	PlayerPort(pc),a1		; ^Port
	move.b	d0,MP_SIGBIT(a1)
	move.l	ThisTask(a6),MP_SIGTASK(a1)	; copy ^ThisTask
	CALLEXEC AddPort			; MsgPort anlegen

	move.l	#TaskName,d1			; name
	moveq	#10,d2				; pri
	lea	PlayerProc(pc),a0		; ^segment
	move.l	a0,d3
	lsr.l	#2,d3				; APTR -> BPTR
	move.l	#4096,d4			; stack
	CALLDOS CreateProc			; start a new process
	tst.l	d0
	beq.s	EndPlay2			; error

	lea	PlayerPort(pc),a0
	CALLEXEC WaitPort			; Schlaf gut

	lea	PlayerPort(pc),a0
	CALLEXEC GetMsg

	move.l	d0,a0				; Message
	move.l	dpm_UserData(a0),d0		; set returnvalue
	bne.s	EndPlay2			; error
	rts

*-----------------------------------------------------------------------*
;
; End Player

EndPlay
	lea	DeliPort(pc),a0
	lea	DeliMsg(pc),a1
	move.l	#PlayerPort,MN_REPLYPORT(a1)
	move.w	#dpm_SIZEOF,MN_LENGTH(a1)
	move.l	#EndPlayer,dpm_Command(a1)
	CALLEXEC PutMsg

	lea	PlayerPort(pc),a0
	CALLEXEC WaitPort			; Schlaf gut

	lea	PlayerPort(pc),a0
	CALLEXEC GetMsg
EndPlay2
	lea	PlayerPort(pc),a1
	CALLEXEC RemPort			; MsgPort entfernen
	lea	PlayerPort(pc),a1
	move.b	MP_SIGBIT(a1),d0
	CALLEXEC FreeSignal			; Signalbit für PlayerPort freigeben

	moveq	#-1,d0				; set error
	rts

*-----------------------------------------------------------------------*
;
; Start Sound

StartSnd
	lea	DeliPort(pc),a0
	lea	DeliMsg(pc),a1
	move.l	#PlayerPort,MN_REPLYPORT(a1)
	move.w	#dpm_SIZEOF,MN_LENGTH(a1)
	move.l	#StartSound,dpm_Command(a1)
	CALLEXEC PutMsg

	lea	PlayerPort(pc),a0
	CALLEXEC WaitPort			; Schlaf gut

	lea	PlayerPort(pc),a0
	CALLEXEC GetMsg
	rts

*-----------------------------------------------------------------------*
;
; Stop Sound

StopSnd
	lea	DeliPort(pc),a0
	lea	DeliMsg(pc),a1
	move.l	#PlayerPort,MN_REPLYPORT(a1)
	move.w	#dpm_SIZEOF,MN_LENGTH(a1)
	move.l	#StopSound,dpm_Command(a1)
	CALLEXEC PutMsg

	lea	PlayerPort(pc),a0
	CALLEXEC WaitPort			; Schlaf gut

	lea	PlayerPort(pc),a0
	CALLEXEC GetMsg
	rts

*-----------------------------------------------------------------------*
;
; Set Volume & Balance

SetVol
	move.w	dtg_SndLBal(a5),d0
	mulu	dtg_SndVol(a5),d0
	lsr.w	#6,d0
	move.w	d0,p_l_vol			; Left Volume

	move.w	dtg_SndRBal(a5),d0
	mulu	dtg_SndVol(a5),d0
	lsr.w	#6,d0
	move.w	d0,p_r_vol			; Right Volume

	lea	DeliPort(pc),a0
	lea	DeliMsg(pc),a1
	move.l	#PlayerPort,MN_REPLYPORT(a1)
	move.w	#dpm_SIZEOF,MN_LENGTH(a1)
	move.l	#SetVolume,dpm_Command(a1)
	CALLEXEC PutMsg

	lea	PlayerPort(pc),a0
	CALLEXEC WaitPort			; Schlaf gut

	lea	PlayerPort(pc),a0
	CALLEXEC GetMsg
	rts

*-----------------------------------------------------------------------*
;
; Player Process

	cnop 0,4				; Align to longword
PlayerProc
	dc.l	16				; Segment "length" (faked)
	dc.l	0				; Pointer to next segment

Begin
	lea	DeliPort(pc),a0			; init Port
	clr.l	LN_SUCC(a0)
	clr.l	LN_PRED(a0)
	move.b	#NT_MSGPORT,LN_TYPE(a0)
	clr.b	LN_PRI(a0)
	move.l	#DeliPortName,LN_NAME(a0)
	move.b	#PA_SIGNAL,MP_FLAGS(a0)

	moveq	#-1,d0
	CALLEXEC AllocSignal			; Signalbit für DeliPort besorgen
	lea	DeliPort(pc),a1			; ^Port
	move.b	d0,MP_SIGBIT(a1)
	move.l	ThisTask(a6),MP_SIGTASK(a1)	; copy ^ThisTask
	CALLEXEC AddPort			; MsgPort anlegen

	lea	AudioPort(pc),a0		; init Port
	clr.l	LN_SUCC(a0)
	clr.l	LN_PRED(a0)
	move.b	#NT_MSGPORT,LN_TYPE(a0)
	clr.b	LN_PRI(a0)
	move.l	#AudioPortName,LN_NAME(a0)
	move.b	#PA_SIGNAL,MP_FLAGS(a0)

	lea	IORequest(pc),a0		; init IORequest
	clr.l	LN_SUCC(a0)
	clr.l	LN_PRED(a0)
	clr.b	LN_TYPE(a0)
	move.b	#ADALLOC_MAXPREC,LN_PRI(a0)
	clr.l	LN_NAME(a0)
	move.l	#AudioPort,MN_REPLYPORT(a0)

	moveq	#-1,d0
	CALLEXEC AllocSignal			; Signalbit für AudioPort besorgen
	lea	AudioPort(pc),a1		; ^Port
	move.b	d0,MP_SIGBIT(a1)	
	move.l	ThisTask(a6),MP_SIGTASK(a1)	; copy ^ThisTask
	CALLEXEC AddPort			; MsgPort für AudioDevice anlegen

	moveq	#0,d0				; AudioDevice öffnen
	moveq	#0,d1				
	lea	audioname(pc),a0
	lea	IORequest(pc),a1		; IORequeststruktur

	clr.l	IO_UNIT(a1)			; (re-)init structure
	move.w	#ADCMD_ALLOCATE,IO_COMMAND(a1)
	move.b	#ADIOF_NOWAIT,IO_FLAGS(a1)
	clr.b	IO_ERROR(a1)
	move.l	#ChannelMap,ioa_Data(a1)
	move.l	#4,ioa_Length(a1)
	clr.w	ioa_Period(a1)
	clr.w	ioa_Volume(a1)
	clr.w	ioa_Cycles(a1)

	CALLEXEC OpenDevice

	lea	DeliMsg(pc),a0			; Message
	clr.l	MN_REPLYPORT(a0)
	move.w	#dpm_SIZEOF,MN_LENGTH(a0)
	move.l	d0,dpm_UserData(a0)		; set retunvalue

	lea	IORequest(pc),a0		; IORequeststruktur
	move.l	IO_UNIT(a0),p_chmap		; store Channelmap

	lea	AudioPort(pc),a1		; Audio Port

	move.l	IO_DEVICE(a0),d0		; get ^Device & AllocKey
	move.w	ioa_AllocKey(a0),d1

	lea	IORequest1a(pc),a0
	bsr	InitIORequest			; IORequest 1a

	lea	IORequest1b(pc),a0
	bsr	InitIORequest			; IORequest 1b

	lea	IORequest2a(pc),a0
	bsr	InitIORequest			; IORequest 2a

	lea	IORequest2b(pc),a0
	bsr	InitIORequest			; IORequest 2b

	move.l	#3579547,d0			; copy & convert chk values
	divu	s_speed,d0
	move.w	d0,p_speed
	move.l	s_size,p_size
	move.l	s_chan1,p_chan1
	move.l	s_chan2,p_chan2

	move.w	#-1,QuitFlag			; kein Ende
	move.w	#-1,p_pause			; paused

	lea	PlayerPort(pc),a0
	lea	DeliMsg(pc),a1			; Message
	CALLEXEC PutMsg				; player is ready !

	lea	DeliMsg(pc),a0
	tst.l	dpm_UserData(a0)		; initialisation error ?
	bne	NoAudioDev			; yes !

;--------------------------------------------------------------------------
;
; Hauptschleife

MainLoop
	bsr	PlaySample

	moveq	#0,d0				; clear WaitMask

	lea	AudioPort(pc),a0
	move.b	MP_SIGBIT(a0),d1		; AudioMask holen
	bset.l	d1,d0

	lea	DeliPort(pc),a0
	move.b	MP_SIGBIT(a0),d1		; DeliMask holen
	bset.l	d1,d0

	CALLEXEC Wait				; Schlaf gut

AudioCollect					; collects Write msg's
	lea	AudioPort(pc),a0
	CALLEXEC GetMsg
	tst.l	d0				; Msg da ?
	beq.s	DeliCollect			; Nein !
	subq.w	#1,p_wmsg			; Messagecounter - 1
	bra.s	AudioCollect

DeliCollect					; collects DeliTracker msg's
	lea	DeliPort(pc),a0
	CALLEXEC GetMsg
	tst.l	d0				; Msg da ?
	beq.s	DeliSelect			; Nein !
	move.l	d0,-(sp)			; store ^Msg
	move.l	d0,a0
	move.l	dpm_Command(a0),a0		; CMD
	jsr	(a0)				; Befehl ausführen
	move.l	(sp)+,a1			; restore ^Msg
	CALLEXEC ReplyMsg			; return to sender
	bra.s	DeliCollect

DeliSelect
	tst.w	QuitFlag			; schon Ende ?
	bne.s	MainLoop			; noch nicht !

;--------------------------------------------------------------------------
;
; quit Player

Quit
	lea	IORequest(pc),a1		; Audio Device schließen
	CALLEXEC CloseDevice
NoAudioDev
	lea	AudioPort(pc),a1
	CALLEXEC RemPort			; MsgPort für AudioDevice entfernen
	lea	AudioPort(pc),a1
	move.b	MP_SIGBIT(a1),d0
	CALLEXEC FreeSignal			; Signalbit für AudioPort freigeben

	lea	DeliPort(pc),a1
	CALLEXEC RemPort			; MsgPort entfernen
	lea	DeliPort(pc),a1
	move.b	MP_SIGBIT(a1),d0
	CALLEXEC FreeSignal			; Signalbit für DeliPort freigeben

	rts					; Playerprozess beenden

;--------------------------------------------------------------------------
;
; End Player

EndPlayer
	clr.w	QuitFlag			; Player beenden
	rts

;--------------------------------------------------------------------------
;
; Init IORequest
;
; in: a0:^iorequest
;     a1:^port
;     d0:Device
;     d1:AllocKey

InitIORequest
	move.b	#ADALLOC_MAXPREC,LN_PRI(a0)
	clr.l	LN_NAME(a0)
	move.l	a1,MN_REPLYPORT(a0)
	move.l	d0,IO_DEVICE(a0)
	clr.l	IO_UNIT(a0)
	clr.w	IO_COMMAND(a0)
	clr.b	IO_FLAGS(a0)
	clr.b	IO_ERROR(a0)
	move.w	d1,ioa_AllocKey(a0)
	clr.l	ioa_Data(a0)
	clr.l	ioa_Length(a0)
	clr.w	ioa_Period(a0)
	clr.w	ioa_Volume(a0)
	clr.w	ioa_Cycles(a0)
	rts

*-----------------------------------------------------------------------*
;
; Start Sound

StartSound
	tst.w	p_pause				; playing/paused ?
	beq.s	StSnd_End			; playing !

	clr.w	p_pause				; playing
	clr.l	p_pos				; start from begin

	lea	IORequest(pc),a1
	move.l	p_chmap(pc),IO_UNIT(a1)		; stop both channels
	move.w	#CMD_STOP,IO_COMMAND(a1)
	move.b	#IOF_QUICK,IO_FLAGS(a1)
	BEGINIO					; execute command

	bsr	SetVolume			; Lautstärke setzen

	bsr	DoubleBuff			; Sound zweimal starten
	bsr	DoubleBuff			; (wegen Double Buffering)

	lea	IORequest(pc),a1
	move.l	p_chmap(pc),IO_UNIT(a1)		; start both channels
	move.w	#CMD_START,IO_COMMAND(a1)
	move.b	#IOF_QUICK,IO_FLAGS(a1)
	BEGINIO					; execute command
StSnd_End
	rts

*-----------------------------------------------------------------------*
;
; Plays the Sample

PlaySample
	tst.w	p_pause				; playing/paused ?
	bne	PlSam_End			; paused !

	tst.w	p_wmsg				; all write msg's replied ?
	bgt	PlSam_End			; no !

	tst.l	p_endpos			; songend reached ?
	bne.s	DoubleBuff			; no !
	move.l	SongendPtr(pc),a0
	jsr	(a0)				; signal songend to DeliTracker
DoubleBuff
	move.w	#2,p_wmsg			; 2 write msg's are pending

	move.l	p_size(pc),d0
	sub.l	p_pos(pc),d0
	cmpi.l	#128*1024,d0
	ble.s	SmallSample
	move.l	#128*1024,d0
SmallSample
	move.l	d0,p_len

	move.l	p_ioreq1(pc),a1
	move.l	p_chmap(pc),d0
	andi.l	#Left_0!Left_3,d0
	move.l	d0,IO_UNIT(a1)			; Channel 1
	move.w	#CMD_WRITE,IO_COMMAND(a1)
	move.b	#IOF_QUICK,IO_FLAGS(a1)
	move.l	p_chan1(pc),d0
	add.l	p_pos(pc),d0
	move.l	d0,ioa_Data(a1)
	move.l	p_len(pc),ioa_Length(a1)
	move.w	#1,ioa_Cycles(a1)
	BEGINIO					; execute command

	move.l	p_ioreq1(pc),d0			; swap ^ioreq
	move.l	p_ioreq1b(pc),p_ioreq1
	move.l	d0,p_ioreq1b

	move.l	p_ioreq2(pc),a1
	move.l	p_chmap(pc),d0
	andi.l	#Right_1!Right_2,d0
	move.l	d0,IO_UNIT(a1)			; Channel 2
	move.w	#CMD_WRITE,IO_COMMAND(a1)
	move.b	#IOF_QUICK,IO_FLAGS(a1)
	move.l	p_chan2(pc),d0
	add.l	p_pos(pc),d0
	move.l	d0,ioa_Data(a1)
	move.l	p_len(pc),ioa_Length(a1)
	move.w	#1,ioa_Cycles(a1)
	BEGINIO					; execute command

	move.l	p_ioreq2(pc),d0			; swap ^ioreq
	move.l	p_ioreq2b(pc),p_ioreq2
	move.l	d0,p_ioreq2b

	move.l	p_pos(pc),p_endpos

	move.l	p_len(pc),d0
	add.l	p_pos(pc),d0
	cmp.l	p_size(pc),d0
	blt.s	NextSampleBlock
	moveq	#0,d0
NextSampleBlock
	move.l	d0,p_pos

PlSam_End
	rts

*-----------------------------------------------------------------------*
;
; Stop Sound

StopSound
	tst.w	p_pause				; playing/paused ?
	bne.s	SpSnd_End			; paused !

	move.w	#-1,p_pause			; paused

	lea	IORequest(pc),a1
	move.l	p_chmap(pc),IO_UNIT(a1)		; both Channels
	move.w	#CMD_FLUSH,IO_COMMAND(a1)
	move.b	#IOF_QUICK,IO_FLAGS(a1)
	BEGINIO					; execute command
SpSnd_End
	rts
 
*-----------------------------------------------------------------------*
;
; Set Volume & Balance

SetVolume
	tst.w	p_pause				; playing/paused ?
	bne.s	StVol_End			; paused !

	lea	IORequest(pc),a1
	move.l	p_chmap(pc),d0
	andi.l	#Left_0!Left_3,d0
	move.l	d0,IO_UNIT(a1)			; Channel 1
	move.w	#ADCMD_PERVOL,IO_COMMAND(a1)
	move.b	#IOF_QUICK,IO_FLAGS(a1)
	move.w	p_speed(pc),ioa_Period(a1)
	move.w	p_l_vol(pc),ioa_Volume(a1)	; Left Volume
	BEGINIO					; execute command

	lea	IORequest(pc),a1
	move.l	p_chmap(pc),d0
	andi.l	#Right_1!Right_2,d0
	move.l	d0,IO_UNIT(a1)			; Channel 2
	move.w	#ADCMD_PERVOL,IO_COMMAND(a1)
	move.b	#IOF_QUICK,IO_FLAGS(a1)
	move.w	p_speed(pc),ioa_Period(a1)
	move.w	p_r_vol(pc),ioa_Volume(a1)	; Right Volume
	BEGINIO					; execute command
StVol_End
	rts

*-----------------------------------------------------------------------*

