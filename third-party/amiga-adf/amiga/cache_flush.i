; cache_flush.i -- invalidate the caches after writing code the CPU will run.
;
; WHY THIS EXISTS. The UADE backend RELOCATES a player image into the arena on
; every song switch, and it reuses the SAME addresses each time (the arena
; layout is fixed at _music_init). A 68020 or better fetches instructions
; through an instruction cache: the lines cached from the PREVIOUS song's
; player are still valid as far as the CPU is concerned, so it can execute the
; old bytes at the new song's address. On an 040/060 the data cache makes it
; worse -- in copyback mode the freshly written code may not have reached
; memory at all when the CPU goes to fetch it.
;
; Nothing in this project flushed anything. score's own answer is worse than
; nothing: `harmlesslist dc CacheClearU,...` (score.s:414) maps exec's
; CacheClearU to an `rts`, so a player that correctly asks for a flush after
; relocating its own code gets a no-op.
;
; A 68000 has no cache and no `movec`, which is why every emulator and every
; A500 test passed: the defect needs an accelerated machine to show, exactly
; like the VBR one (see DemoStartup.S's PORT note).
;
; HOW. The flush instructions are privileged, and the demo's main loop runs in
; USER mode -- so it goes through exec's Supervisor(), using the REAL ExecBase
; saved at install time (4.w holds score's fake one while a song is playing).
; Exec's Supervisor rides the privilege-violation vector, which the takeover
; deliberately leaves alone (hdd_startup.s's .silloop skips $20).
;
; The opcodes are emitted as dc.w so this assembles for -m68000 too: the code
; is only REACHED when AttnFlags says the CPU has the cache in question.
;   4E7A 0002  movec cacr,d0
;   4E7B 0002  movec d0,cacr
;   F4F8       cpusha bc      (040/060: push and invalidate both caches)

UPROUGH_CACHE_FLUSH     macro
; void(void) -- safe from user mode, safe on a 68000 (does nothing there).
;
; THE CPU IS DECIDED OUT HERE, NOT INSIDE THE SUPERVISOR STUB. 4.w holds
; score's FAKE ExecBase while a song is playing, so reading AttnFlags from it
; in the stub returns whatever score's structure has at $128 -- which sent a
; 68020 down the `cpusha bc` path and hung the machine on exit (measured
; 2026-09-23: the demo never returned to DOS at all). The REAL ExecBase is the
; macro's argument; the flags are read from it here and the choice is made
; before exec's Supervisor is ever called.
                movem.l d0-d1/a0-a1/a5-a6,-(sp)
                move.l  \1,a6                   ; the REAL ExecBase
                move.l  a6,d0
                beq.b   .cf_done\@
                move.w  $128(a6),d1             ; AttnFlags
                andi.w  #$00C2,d1               ; 68020|68040|68060 bits
                beq.b   .cf_done\@              ; 68000/68010: no cache at all
                andi.w  #$0088,d1               ; 68040|68060?
                bne.b   .cf_want040\@
                lea     .cf_020\@(pc),a5
                bra.b   .cf_call\@
.cf_want040\@:
                lea     .cf_040\@(pc),a5
.cf_call\@:
                jsr     -30(a6)                 ; Supervisor(a5)
                bra.b   .cf_done\@
.cf_020\@:
                dc.w    $4E7A,$0002             ; movec cacr,d0
                ori.w   #$0808,d0               ; clear I and D cache
                dc.w    $4E7B,$0002             ; movec d0,cacr
                rte
.cf_040\@:
                dc.w    $F4F8                   ; cpusha bc
                rte
.cf_done\@:
                movem.l (sp)+,d0-d1/a0-a1/a5-a6
                endm
