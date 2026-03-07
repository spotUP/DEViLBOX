;------------------------------------------------------------------------------
; Debug printf macro - outputs via UADE trap at $f0ff14
;
; Usage:
;   printf "Something: %ld, %ld",d2,d7
;
; Formats: %d, %u, %x, %X, %s, %%
; Size prefixes: l=32-bit, h=16-bit, b=8-bit
;   %lx → 00f0ff14   %hx → ff14   %bx → 14
;   %ld → signed 32   %hd → signed 16   %bd → signed 8
; Up to 8 arguments (registers or values)
;------------------------------------------------------------------------------

printf		macro

		bra.s	.cont\@
.fmt\@:		dc.b	\1,0
		even
.cont\@
		IFGE	NARG-9
			move.l	\9,-(sp)
		ENDC
		IFGE	NARG-8
			move.l	\8,-(sp)
		ENDC
		IFGE	NARG-7
			move.l	\7,-(sp)
		ENDC
		IFGE	NARG-6
			move.l	\6,-(sp)
		ENDC
		IFGE	NARG-5
			move.l	\5,-(sp)
		ENDC
		IFGE	NARG-4
			move.l	\4,-(sp)
		ENDC
		IFGE	NARG-3
			move.l	\3,-(sp)
		ENDC
		IFGE	NARG-2
			move.l	\2,-(sp)
		ENDC

		pea.l	.fmt\@
		jsr	$f0ff14
		lea.l	NARG*4(sp),sp

		endm
