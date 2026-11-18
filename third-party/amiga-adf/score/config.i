UADE_STATE_DETECTION equ 0
;*--- PORT: allow -DUADE_TEST_LOGGING=1 on the assembler command line. score's
;     38 LOG_CALL sites are the only execution trace it has, and on a device
;     they are the difference between "it crashed" and knowing which call it
;     died in. Default is unchanged, so the upstream build is unaffected.
	ifnd	UADE_TEST_LOGGING
UADE_TEST_LOGGING equ 0
	endc
