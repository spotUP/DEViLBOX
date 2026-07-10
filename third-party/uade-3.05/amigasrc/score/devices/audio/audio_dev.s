****************************************************************************
**
**	poor man's audio.device implementation
**	ported into uade-3.05 from Juergen Wothke's WebUADE+ (uade-2.13)
**	original: amigasrc/score/devices/audio/audio_dev.s (C) 2022 Juergen Wothke
**
**	see https://wiki.amigaos.net/wiki/Audio_Device
**
**	MaxTrax (and A-Train, Kyrandia, ...) play through the Amiga audio.device
**	rather than raw Paula. Stock UADE has no audio.device, so its MaxTrax
**	EaglePlayer crashes. This file installs a FAKE audio.device: a library
**	base with a real LVO jump table whose BeginIO/AbortIO/Open vectors forward
**	the IOAudio request to the host (uade.c) via AMIGAMSG_AUDIO_DEV_* messages.
**
**	It also supplies the exec message-port routines MaxTrax relies on
**	(GetMsg / PutMsg / ReplyMsg / CopyMem) that upstream 3.05 left as
**	non-functional stubs (GetMsg always returned 0 -> every note hit the
**	"no free audio block" error path -> silence / crash).
**
**	The messages sent to the C side are COPIED: the C code cannot return data
**	inside the message. Async completion (one-shot attack -> sustain loop) is
**	handled host-side and delivered back through the reply list / DMA signal.
**
****************************************************************************

****************************************************************************
*  exec message-port support (missing from upstream 3.05)
****************************************************************************

****************************************************************************
*  message = GetMsg(port)
*  d0               a0
*  testcase: MaxTrax player (e.g. "A-Train")
*
exec_getmsg
	move.w	#$4000,$dff09a			* disable interrupts (clear master enable)
	addq.b	#1,IDNestCnt(a6)

	moveq	#0,d0

	lea	MP_MSGLIST(a0),a0
	IFEMPTY	a0,ag_listcont			* empty list -> return NULL
	REMHEAD					* in: a0=list ; out: d0=node
ag_listcont
	subq.b	#1,IDNestCnt(a6)		* enable interrupts
	bge.s	ag_end
	move.w	#$c000,$dff09a
ag_end
	rts

****************************************************************************
*  PutMsg(port, message)
*         a0    a1
*  see https://wiki.amigaos.net/wiki/Exec_Messages_and_Ports
*
exec_putmsg
	move.b	#NT_MESSAGE,d0
pm_begin
	move.w	#$4000,$dff09a			* disable interrupts (clear master enable)
	addq.b	#1,IDNestCnt(a6)

	move.b	d0,LN_TYPE(a1)

	push	a0
	lea	MP_MSGLIST(a0),a0
	ADDTAIL
	pull	a0

	move.b	MP_FLAGS(a0),d0
	and.l	#PF_ACTION,d0
	beq.b	pm_pasignal

	cmp.b	#PA_SOFTINT,d0
	beq.b	pm_pasoftint

	cmp.b	#PA_IGNORE,d0
	beq.b	pm_ignore

	bra.b	pm_ignore			* unknown action -> ignore

pm_pasignal
	move.l	MP_SIGTASK(a0),d1
	beq.b	pm_ignore
	move.b	MP_SIGBIT(a0),d0

	move.l	d1,a1
	moveq	#0,d1
	bset	d0,d1
	move.l	d1,d0
	jsr	Signal(a6)
	bra.b	pm_ignore

pm_pasoftint
	move.l	MP_SIGTASK(a0),d0
	beq.b	pm_ignore
	move.l	d0,a1
	jsr	Cause(a6)

pm_ignore
	subq.b	#1,IDNestCnt(a6)
	bge.b	pm_skipenable
	move.w	#$c000,$dff09a			* re-enable interrupts (set master enable)
pm_skipenable
	rts

****************************************************************************
*  ReplyMsg(message)
*           a1
*  testcase: MaxTrax player (fills _play_port with free audio blocks at init)
*
exec_replymsg
	move.l	MN_REPLYPORT(a1),d0
	beq.b	rm_noport
	move.l	d0,a0
	move.b	#NT_REPLYMSG,d0
	bra	pm_begin
rm_noport
	move.b	#NT_FREEMSG,LN_TYPE(a1)
	rts

****************************************************************************
*  Remove(node)
*         a1
*
exec_remove
	push	a0-a1
	REMOVE
	pull	a0-a1
	rts

****************************************************************************
*  CopyMem(source, dest, size)
*          a0      a1    d0
*  simple byte copy (UADE emulates 68000/020 - no move16); clobbers a0/a1/d0
*
exec_copymem
	tst.l	d0
	beq.b	cm_done
cm_loop
	move.b	(a0)+,(a1)+
	subq.l	#1,d0
	bne.b	cm_loop
cm_done
	rts

****************************************************************************
*  fake audio.device
****************************************************************************

*  install the 6 LVO vectors into the fake device's function table
*  (each entry is a JMP absolute: $4ef9 + 32-bit target). a6 = device base.

audiodevice_init
	lea	audio_device_base(pc),a6
	LVO_JMP	LIB_OPEN,	adopen
	LVO_JMP	LIB_CLOSE,	adclose
	LVO_JMP	LIB_EXPUNGE,	adexpunge
	LVO_JMP	LIB_EXTFUNC,	adextfunc
	LVO_JMP	DEV_BEGINIO,	adbeginio
	LVO_JMP	DEV_ABORTIO,	adabortio
	rts

adclosemsg1	dc.b	'audio.device Close called but not implemented!',0
adexpungemsg1	dc.b	'audio.device Expunge called but not implemented!',0
adextfuncmsg1	dc.b	'audio.device ExtFunc called but not implemented!',0
	even

****************************************************************************
*  Open(ioRequest)
*       a1
*  Delegated to the host; the OpenDevice result is derived from the
*  resulting IOAudio fields (status returned in the IOAudio, not d0).
*
ad_openmsg	dc.l	AMIGAMSG_AUDIO_DEV_OPEN		* input: request type
		dc.l	0				* input: IOAudio ptr
ad_openmsge

adopen	push	all
	lea	ad_openmsg(pc),a0
	move.l	a1,4(a0)			* IOAudio ptr
	moveq	#ad_openmsge-ad_openmsg,d0
	bsr	put_message
	pull	all
	rts

adclose	push	all
	lea	adclosemsg1(pc),a0
	bsr	put_string
	pull	all
	rts

adexpunge	push	all
	lea	adexpungemsg1(pc),a0
	bsr	put_string
	pull	all
	rts

adextfunc	push	all
	lea	adextfuncmsg1(pc),a0
	bsr	put_string
	pull	all
	rts

****************************************************************************
*  process a chained list of ReplyMsg nodes returned by the host.
*  handleDMAreplymsgs: called from the audio interrupt (host queues the list
*  head at $1fc); handlereplymsgs: called with a1 = list head.
*
handleDMAreplymsgs
	push	a6
	move.l	4.w,a6
	tst.l	$1fc
	beq.b	hrm_end
	move.l	$1fc,a1
	move.l	#0,$1fc
	bra	hrm_loopstart

* a1: ptr to first chained Message
handlereplymsgs
	push	a6
	move.l	4.w,a6
hrm_loopstart
	push	all
hrm_loop
	move.l	(a1),d0				* next msg (via LN_SUCC)
	push	d0
	move.l	#0,LN_SUCC(a1)			* clean up links
	move.l	#0,LN_PRED(a1)
	bsr	exec_replymsg
	pull	d0
	move.l	d0,a1
	cmp.l	#0,d0
	bne.b	hrm_loop
	pull	all
hrm_end
	pull	a6
	rts

****************************************************************************
*  BeginIO(ioRequest)
*          a1
*  Async (unless IO_ERROR set). Host may return a ReplyMsg list to process.
*
ad_replylist	dc.l	0

ad_beginiomsg	dc.l	AMIGAMSG_AUDIO_DEV_BEGINIO	* input: request type
		dc.l	0,0				* input: IOAudio ptr, out: ReplyMsg list ptr
ad_beginiomsge
	even

adbeginio	push	all
	lea	ad_replylist(pc),a2
	move.l	#0,(a2)				* reset

	lea	ad_beginiomsg(pc),a0
	move.l	a1,4(a0)			* input: IOAudio ptr
	move.l	a2,8(a0)			* output ptr: ReplyMsg list (if any)
	moveq	#ad_beginiomsge-ad_beginiomsg,d0
	bsr	put_message

	lea	ad_replylist(pc),a1		* process ReplyMsg list if host produced one
	move.l	(a1),d0
	cmp.l	#0,d0
	beq.b	ab_noreplies
	move.l	d0,a1
	bsr	handlereplymsgs
ab_noreplies
	pull	all
	rts

****************************************************************************
*  AbortIO(ioRequest)
*          a1
*
ad_abortiomsg	dc.l	AMIGAMSG_AUDIO_DEV_ABORTIO	* input: request type
		dc.l	0				* input: IOAudio ptr
ad_abortiomsge
	even

adabortio	push	all
	lea	ad_abortiomsg(pc),a0
	move.l	a1,4(a0)			* input: IOAudio ptr
	moveq	#ad_abortiomsge-ad_abortiomsg,d0
	bsr	put_message
	pull	all
	rts

****************************************************************************
*  memory layout: a library/device base points AT the Library struct; the
*  function-vector table sits immediately IN FRONT of it (negative offsets).
*
	dcb.b	$24,0		* 36 bytes = 6 function vectors (4 generic + BeginIO/AbortIO)
audio_device_base
	dcb.b	$22,0		* space for the Library struct (== LIB_SIZE)
