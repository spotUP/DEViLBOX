; uade_layout.i -- shared low-memory layout for the UADE backend's two
; debugger-visible blocks. Included by BOTH amiga/uade_glue.s (the locator
; block, _uade_publish_info) and amiga/uade_probe.s (the stage/fault block,
; UADE_STAGE). ONE definition of each base, so the two blocks cannot drift
; apart the way they did on 2026-09-21: the locator table grew a 33rd entry
; and its last write landed AT $3C0, silently overwriting the stage marker
; the probe rig's crash oracle depends on ($340 + 32*4 = $3C0).
;
; uade_glue.s enforces this at ASSEMBLY TIME (see UADE_TABLE_END's ifge/fail
; next to _uade_publish_info): the build fails the moment a future entry would
; make the table reach UADE_STAGE, rather than reading back as a dead probe.
;
; UADE_INFO  -- base of the locator block (comment at amiga/uade_glue.s's
;               _uade_publish_info explains why $340: vector slots 208+, which
;               no Amiga hardware uses).
; UADE_STAGE -- base of the probe rig's stage marker + group-0 fault frame
;               (see amiga/uade_probe.s's crash-oracle comment). Moved from
;               $3C0 to $400 here: $400 is one byte past the end of the 68000
;               exception vector table ($000-$3FF), so it costs the locator
;               table nothing and leaves (0x400-0x340)/4 = 48 slots of
;               headroom before the two blocks can collide again.
;
; 2026-10-12: UADE_INFO moved $340 -> $304. The table is 46 entries (184
; bytes); at $340 only 2 slots were spare before UADE_STAGE ($400) and the
; test wants 4. $300-$3FF is the 68k user-interrupt vector area (vectors
; 192-255), unused on Amiga. NOT $300: score's input word UADE_INPUT_MSG
; (uade_glue.s) is the longword at $300, and the 'UADE' magic there would be
; overwritten by AMSG_SETSUBSONG. $304 gives (0x400-0x304)/4 = 63 slots, 17
; spare. Every host reader derives the base from this file
; (tools/uade_format_sweep.UADE_INFO_BASE); nothing hardcodes it.
UADE_INFO       equ     $304
UADE_STAGE      equ     $400
