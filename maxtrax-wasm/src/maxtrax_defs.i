*   maxtrax_defs.i — canonical AmigaOS struct offsets + constants for the
*   MaxTrax transpile. Supplied as a transpiler preamble (-P) in place of the
*   NDK includes (exec/*.i, devices/audio.i) that max.asm `include`s but which
*   the transpiler ignores. Struct layouts use the STRUCTURE offset-macro form
*   (handled built-in by the transpiler) so offsets are computed, not hand-typed.

* -- exec/nodes.i : struct Node --
			STRUCTURE	Node,0
			APTR	LN_SUCC
			APTR	LN_PRED
			UBYTE	LN_TYPE
			BYTE	LN_PRI
			APTR	LN_NAME
			LABEL	LN_SIZE

NT_INTERRUPT		equ		2
NT_MSGPORT			equ		4

* -- exec/ports.i : struct Message / MsgPort (List is 14 bytes) --
			STRUCTURE	Message,0
			STRUCT	MN_NODE,LN_SIZE
			APTR	MN_REPLYPORT
			UWORD	MN_LENGTH
			LABEL	MN_SIZE

			STRUCTURE	MsgPort,0
			STRUCT	MP_NODE,LN_SIZE
			UBYTE	MP_FLAGS
			UBYTE	MP_SIGBIT
			APTR	MP_SIGTASK
			STRUCT	MP_MSGLIST,14
			LABEL	MP_SIZE

* -- exec/interrupts.i : struct Interrupt --
			STRUCTURE	Interrupt,0
			STRUCT	IS_NODE,LN_SIZE
			APTR	IS_DATA
			APTR	IS_CODE
			LABEL	IS_SIZE

* -- exec/io.i : struct IORequest / IOStdReq --
			STRUCTURE	IO,0
			STRUCT	IO_MESSAGE,MN_SIZE
			APTR	IO_DEVICE
			APTR	IO_UNIT
			UWORD	IO_COMMAND
			UBYTE	IO_FLAGS
			BYTE	IO_ERROR
			LABEL	IO_SIZE

			STRUCTURE	IOStdReq,IO_SIZE
			ULONG	IO_ACTUAL
			ULONG	IO_LENGTH
			APTR	IO_DATA
			ULONG	IO_OFFSET
			LABEL	IOSTD_SIZE

* io_Mem alias sometimes used for the request's memory block base
IO_MEM				equ		0

* -- devices/audio.i : struct IOAudio --
			STRUCTURE	IOAudio,IOSTD_SIZE
			UWORD	ioa_AllocKey
			APTR	ioa_Data
			ULONG	ioa_Length
			UWORD	ioa_Period
			UWORD	ioa_Volume
			UWORD	ioa_Cycles
			STRUCT	ioa_WriteMsg,MN_SIZE
			LABEL	ioa_SIZEOF

* exec device standard commands (exec/io.i)
CMD_INVALID			equ		0
CMD_RESET			equ		1
CMD_READ			equ		2
CMD_WRITE			equ		3
CMD_UPDATE			equ		4
CMD_CLEAR			equ		5
CMD_STOP			equ		6
CMD_START			equ		7
CMD_FLUSH			equ		8
CMD_NONSTD			equ		9

* audio.device commands (devices/audio.i)
ADCMD_FREE			equ		9
ADCMD_SETPREC		equ		10
ADCMD_FINISH		equ		11
ADCMD_PERVOL		equ		12
ADCMD_LOCK			equ		13
ADCMD_WAITCYCLE		equ		14

* IORequest / audio io flags
IOF_QUICK			equ		(1<<0)
IOF_PERVOL			equ		(1<<4)

* exec/memory.i memory flags
MEMF_PUBLIC			equ		(1<<0)
MEMF_CHIP			equ		(1<<1)
MEMF_FAST			equ		(1<<2)
MEMF_CLEAR			equ		(1<<16)

* hardware/intbits.i
INTB_VERTB			equ		5
INTF_VERTB			equ		(1<<5)

* hardware/custom.i — audio register block base within custom chips ($dff0a0)
aud					equ		$a0
