; cia_giveback.i -- save and restore what a music backend takes from the CIAs.
;
; Every backend that programs a CIA timer for its tempo (LSP on CIA-B, UADE's
; score on whichever CIA the player asks for) also rewrites CIA state that
; belongs to AmigaOS and, until 2026-09-21, never put it back:
;
;   * the ICR ENABLE MASK -- music_glue.s clears CIA-A's outright (`$7f ->
;     $bfed01`), score's rem_cia*_interrupt clears the bit it used. CIA-A's
;     mask is the keyboard (TA, SP) and, on Kickstart 2.0+, timer.device (TB).
;     A mask is write-only: once cleared, nothing can read what it was.
;   * CRA/CRB -- score's start zeroes CIA-A CRB (stopping timer B = timer.device
;     on KS2.0+) and CIA-B CRB; a player's timer install sets CRA/CRB=$11 and
;     the teardown leaves the timer running.
;   * CIA-A PRA -- the audio filter/LED bit, set by score's start.
;
; Measured on the device (a1200/KS3.1) 2026-09-21: baseline CIA-A CRB=$01
; running with mask $0F, CIA-B mask $00; after score's start CIA-A CRB=$00.
; The demo then exited through an otherwise clean path and AmigaDOS Guru'd
; (8000 0004) on a machine whose timer.device could never tick again. The
; sanctuary intro crashes on real hardware the same way, from the LSP side.
;
; Two macros, so the readable registers and the unreadable mask are handled
; separately and each glue can gate the mask part on its own takeover mode:
;
;   CIA_SAVE_REGS      <label>   -- 5 bytes: CIA-A PRA, CRA, CRB, CIA-B CRA, CRB.
;                                  Run BEFORE the backend touches a CIA.
;   CIA_RESTORE_REGS   <label>   -- write them back, CRs first, PRA last.
;                                  Run AFTER the backend's own stop, before
;                                  anything of the OS (4.w, vectors) is
;                                  re-armed -- hardware only.
;   CIA_REENABLE_MASKS <label>   -- the part that cannot be read back:
;                                  CIA-A gets TA|TB|ALRM|SP unconditionally
;                                  (every Kickstart has TA and SP on; a TB or
;                                  ALRM re-enabled on a timer the restored CRB
;                                  leaves STOPPED never fires); CIA-B gets a
;                                  timer's bit back only if its saved CR had
;                                  START set, i.e. the OS was running it and
;                                  therefore wanted its interrupt. ONLY for a
;                                  plain takeover (the OS was frozen); an
;                                  OS-alive build never cleared them.
;   CIA_SAVE_STORAGE   <label>   -- the 5-byte block, even-aligned after.
;
; Clobbers: CIA_SAVE_REGS a0; CIA_RESTORE_REGS d0/d1/a0; CIA_REENABLE_MASKS
; d0/a0. Callers run in supervisor with everything saved around them.

CIA_SAVE_REGS   macro
        lea     \1(pc),a0
        move.b  $bfe001,(a0)+           ; CIA-A PRA (the filter/LED bit)
        move.b  $bfee01,(a0)+           ; CIA-A CRA
        move.b  $bfef01,(a0)+           ; CIA-A CRB -- timer.device on KS2.0+
        move.b  $bfde00,(a0)+           ; CIA-B CRA
        move.b  $bfdf00,(a0)+           ; CIA-B CRB
        endm

CIA_RESTORE_REGS macro
        lea     \1(pc),a0
        move.b  (a0)+,d1                ; CIA-A PRA, written last
        move.b  (a0)+,$bfee01           ; CIA-A CRA
        move.b  (a0)+,$bfef01           ; CIA-A CRB
        move.b  (a0)+,$bfde00           ; CIA-B CRA
        move.b  (a0)+,$bfdf00           ; CIA-B CRB
        move.b  d1,$bfe001              ; CIA-A PRA
        endm

CIA_REENABLE_MASKS macro
        lea     \1+3(pc),a0             ; -> saved CIA-B CRA
        move.b  (a0)+,d0
        btst    #0,d0                   ; START was set: the OS ran timer A
        beq.b   .cia_no_b_ta\@
        move.b  #$81,$bfdd00            ; CIA-B ICR: TA back on
.cia_no_b_ta\@:
        move.b  (a0)+,d0                ; saved CIA-B CRB
        btst    #0,d0
        beq.b   .cia_no_b_tb\@
        move.b  #$82,$bfdd00            ; CIA-B ICR: TB back on
.cia_no_b_tb\@:
        move.b  #$8f,$bfed01            ; CIA-A ICR: TA|TB|ALRM|SP back on
        endm

CIA_SAVE_STORAGE macro
\1:     ds.b    5                       ; CIA-A PRA, CRA, CRB, CIA-B CRA, CRB
        even
        endm
