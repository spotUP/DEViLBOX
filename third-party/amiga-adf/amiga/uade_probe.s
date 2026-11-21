; uade_probe.s -- standalone rig for the UADE music backend.
;
; The smallest program that exercises the real backend contract: take the
; machine the way the demo does, call the seven-symbol music ABI, and do
; nothing else. No display, no effects, no compile_demo. It exists so a new
; format can be smoke-tested and the chip high-water measured without dragging
; the whole demo in, and so a failure here is unambiguously the backend's.
;
; Matches the runtime's environment deliberately (RULE 15):
;   - runs in USER mode, like _Main does under vilcans, so _music_init's
;     Supervisor() bounce is exercised for real;
;   - Exec stays resident (the demo does not tear it down either), so
;     Supervisor() and the saved ExecBase restore are real;
;   - DMA and interrupts are off, so score is a guest on a quiet machine.
;
; Build/boot: see the `uade_probe` target in Makefile.amiga.
; Exit: left mouse button.
;
; READING MEMORY OUT OF THIS RIG: send Amiberry's IPC `PAUSE` first, and
; `RESUME` after. A multi-kilobyte dump over the socket is one READ_MEM per
; longword and takes a minute or more of WALL CLOCK, during which the machine
; keeps running -- and with the switch driver below active it performs another
; switch every UADE_SWITCH_PERIOD frames. Fix round 3 dumped the arena
; unpaused, got a tidy mosaic of alternating 512-byte blocks from two different
; players, and spent a long time treating that torn read as residual memory
; corruption. It was the dump racing the thing it was measuring. A paused dump
; of the same region came back clean.

        section code,code

        xdef    _start
        xdef    _SysBase
        xdef    _uprough_vbr

        xref    _music_init
        xref    uade_priv_handler
        xref    _music_start
        xref    _music_stop
        xref    _music_shutdown
        xref    _music_play1
        xref    _music_play2
        xref    _music_select_pump
        xref    _music_select

EXEC_BASE           = 4
EXEC_OldOpenLibrary = -408
EXEC_Supervisor     = -30
EXEC_AttnFlags      = $128
EXEC_CloseLibrary   = -414
GFX_LoadView        = -222
GFX_WaitTOF         = -270

CUSTOM              = $dff000
DMACONR             = $002
VPOSR               = $004
INTENAR             = $01c
INTENA              = $09a
INTREQ              = $09c
DMACON              = $096

; Stage markers so a failure says WHERE. Amiberry's IPC has no memory search
; and the hunk base is unknown, so without a fixed breadcrumb a crash in the
; prologue is indistinguishable from "the disk never booted".
; UADE_STAGE comes from amiga/uade_layout.i, shared with uade_glue.s's locator
; block at UADE_INFO -- the two used to be independent constants ($380, then
; $3C0) and the locator table's growth silently walked into this one. See
; uade_layout.i for the collision story and uade_glue.s's assembly-time guard.
        include "amiga/uade_layout.i"

STAGE           macro
                move.l  #\1,UADE_STAGE
                endm

_start:
        move.l  #'STRT',UADE_STAGE      ; first instruction of the program
        movem.l d1-a6,-(sp)             ; AmigaOS ABI: preserve d1-a6

        move.l  EXEC_BASE.w,a6
        lea     _SysBase(pc),a0
        move.l  a6,(a0)                 ; uade_glue.s reads this for Supervisor()

        ; --- the vector base ---------------------------------------------
        ; PORT (502a9df4f): every startup publishes the VBR it read, and every
        ; vector write below goes through it. A 68000 has no VBR, so the table
        ; is at zero and MOVEC would be an illegal instruction there; on a
        ; 68010+ the table may have been moved (68060.library, SetPatch), and
        ; the same AttnFlags test DemoStartup.S uses (AFF_68010) picks the
        ; read. The probe is assembled -m68000, so MOVEC is spelled as words
        ; (see uade_getvbr).
        suba.l  a0,a0
        btst    #0,EXEC_AttnFlags+1(a6)
        beq.s   .novbr
        lea     uade_getvbr(pc),a5
        jsr     EXEC_Supervisor(a6)
.novbr:
        move.l  a0,_uprough_vbr

        ; --- open graphics and drop the view ------------------------------
        lea     gfxname(pc),a1
        jsr     EXEC_OldOpenLibrary(a6)
        move.l  d0,d7
        STAGE   'GFX1'
        beq     .noexit                 ; no graphics.library: bail politely
        move.l  d0,a6
        move.l  34(a6),oldview          ; gb_ActiView
        sub.l   a1,a1
        jsr     GFX_LoadView(a6)        ; blank the view
        STAGE   'VIEW'
        jsr     GFX_WaitTOF(a6)
        jsr     GFX_WaitTOF(a6)

        ; --- save what we are about to take -------------------------------
        lea     CUSTOM,a5
        move.w  INTENAR(a5),d0
        ori.w   #$8000,d0
        move.w  d0,saved_intena
        move.w  DMACONR(a5),d0
        ori.w   #$8000,d0
        move.w  d0,saved_dmacon

        move.w  #$7fff,INTENA(a5)       ; all interrupts off
        move.w  #$7fff,INTREQ(a5)
        move.w  #$7fff,DMACON(a5)       ; all DMA off -- score is a guest
        ; ...but put the MASTER DMA ENABLE back. Paula fetches nothing without
        ; DMAEN (bit 9) no matter how correct the per-channel bits are, so
        ; without this the player runs, sets AUDxLCH/LEN/PER/VOL, DMACON reads
        ; 000F -- and the machine is silent. Upstream score re-enabled it as
        ; part of `move #$8280,dmacon`, but that block also installs a blank
        ; copperlist, so the port gates the whole thing off (PORT 3c) and the
        ; DEMO supplies DMAEN itself. A black-screen probe has no demo, so it
        ; has to supply it here.
        move.w  #$8200,DMACON(a5)       ; SET | DMAEN
        STAGE   'DMAO'

        ; --- the backend --------------------------------------------------
        ; Publish BEFORE init, not after: score reports an unimplemented exec
        ; call and then executes `illegal`, so the run that most needs the
        ; diagnostic is exactly the run that never reaches the line after init.
        ; the locator block is published by _music_init in uade_glue.s
        STAGE   'PUBL'

        ; --- our own crash oracle -----------------------------------------
        ; Exec's alert handler REINITIALISES the exception vector table, which
        ; wipes every breadcrumb in low memory -- so a guru destroys exactly the
        ; evidence we booted to collect. Catch the faults ourselves instead:
        ; latch SR + PC and spin, leaving the machine alive and RAM intact so
        ; the whole state can be read out over the socket at leisure.
        ; There is no MMU, so a user-mode write to the vector table is fine.
        ; $20 (privilege violation) is deliberately NOT hooked: Exec's
        ; Supervisor() rides it, and main_glue.s:180-183 spares it for the same
        ; reason.
        ; score's init_interrupts ENABLES VERTB (INTENA $C020) but its own $6c
        ; install is gated off, because in the demo that vector belongs to
        ; vilcans' InterruptHandler -- which is safe, it never touches Exec.
        ; Here it would still be KICKSTART's VBL handler, and that does
        ; `move.l 4.w,a6` -- which by then points at score's FAKE ExecBase. Exec
        ; then walks a garbage interrupt-server list and jumps through null.
        ; The probe therefore owns $6c too: ack and return, nothing else. Timing
        ; comes from the polled VPOSR loop.
        move.l  _uprough_vbr,a4         ; a4 = vector base for the installs below
        lea     uade_vbl(pc),a0
        move.l  a0,$6c(a4)

        lea     uade_exc2(pc),a0        ; group 0: 14-byte frame
        move.l  a0,$08(a4)                ; bus error
        lea     uade_exc3(pc),a0
        move.l  a0,$0c(a4)                ; address error
        lea     uade_exc4(pc),a0        ; group 2: 6-byte frame
        move.l  a0,$10(a4)                ; illegal instruction
        lea     uade_exc5(pc),a0
        move.l  a0,$14(a4)                ; divide by zero
        lea     uade_exc10(pc),a0
        move.l  a0,$28(a4)                ; line A
        lea     uade_exc11(pc),a0
        move.l  a0,$2c(a4)                ; line F
        ; The first pass hooked only the obvious faults and the machine still
        ; got away -- low memory came back zeroed, i.e. it reset through a
        ; vector we had not taken. Cover the rest of the traps and every
        ; interrupt level the backend does NOT legitimately use. $20 stays
        ; Exec's (Supervisor() rides it); $68 and $78 stay score's; $6c is ours.
        lea     uade_excCHK(pc),a0
        move.l  a0,$18(a4)                ; CHK
        lea     uade_excTRAPV(pc),a0
        move.l  a0,$1c(a4)                ; TRAPV
        lea     uade_excPRIV(pc),a0
        move.l  a0,$24(a4)                ; trace
        lea     uade_excUNIN(pc),a0
        move.l  a0,$3c(a4)                ; uninitialised interrupt
        lea     uade_excSPUR(pc),a0
        move.l  a0,$60(a4)                ; spurious
        ; Hand the glue our privilege-violation handler; it installs it once
        ; Supervisor() has already been entered (see uade_glue.s).
        lea     uade_excPRIV2(pc),a0
        move.l  a0,uade_priv_handler
        lea     uade_excLVL(pc),a0
        move.l  a0,$64(a4)                ; level 1
        move.l  a0,$70(a4)                ; level 4
        move.l  a0,$74(a4)                ; level 5
        move.l  a0,$7c(a4)                ; level 7 (NMI)
        bsr     _music_init
        STAGE   'INIT'
        bsr     _music_start
        STAGE   'PLAY'
	xref	_screen_init,_screen_frame,_screen_paused
	bsr	_screen_init

        ; --- 50 Hz pump ----------------------------------------------------
        ; Polled, not an ISR, on purpose: this is arm 1 of the "does the play
        ; loop mind running in an interrupt" question. score uses trap #3 to
        ; ENTER supervisor for DTP_Interrupt, which hints its loop expects user
        ; mode. If polled works and ISR does not, that is the answer, and only
        ; _music_play2 has to move.
; UADE_PROBE_TICKS -- fix round 2 diagnostic. _uade_vbl_seen (score's own
; counter, incremented inside _music_play1) is NOT a "the loop is still
; alive" signal during a switch: _uade_switching gates _music_play1's call
; to mylevel3_body for the whole relocation+module-copy+incoming-init
; stretch (uade_do_switch ends in `jmp contplayer` and only "returns" when
; score first yields), so it is EXPECTED to sit flat then, not a symptom.
; The real demo has an independent counter for this (_vbl_count, incremented
; in _Interrupt outside anything _uade_switching gates) -- this probe has no
; such thing, so this is its equivalent: incremented right after
; uade_wait_vbl proves a real hardware VBlank edge occurred, unconditionally,
; never gated on switching state. A frozen UADE_PROBE_TICKS during a pending
; switch means the MAIN LOOP itself is stuck (a starvation hang, or a crash
; the exception handler already caught) -- not that the switch is merely
; slow.
UADE_PROBE_TICKS        equ     UADE_STAGE+$20
; UADE_PROBE_SWITCHES / UADE_PROBE_SONG -- fix round 3. A playlist build drives
; its own switches from here, so a soak needs no writes into the machine from
; outside: Amiberry's IPC is READ-only for us, and a rig that cannot ask for a
; song cannot reproduce a switch bug at all. Every UADE_SWITCH_PERIOD frames it
; calls _music_select with the next index, exactly as amiga_main.c would, and
; counts the request. A stalled UADE_PROBE_SWITCHES with a live
; UADE_PROBE_TICKS means the pump stopped accepting work; both frozen means the
; main loop itself is gone.
UADE_PROBE_SWITCHES     equ     UADE_STAGE+$24
UADE_PROBE_SONG         equ     UADE_STAGE+$28
; UADE_PROBE_VBL -- counted in the probe's own $6c HANDLER, so it keeps
; advancing while the main loop is stuck inside _music_select_pump. That is the
; only way this rig can measure a switch STALL: UADE_PROBE_TICKS is bumped by
; the polled main loop and therefore stops dead for exactly the interval we
; want to measure. Stall in frames = (VBL delta) - (TICKS delta) across a
; switch. score's init_interrupts enables VERTB ($C020) and the probe owns
; $6c, so this fires 50 times a second from the first init onward.
UADE_PROBE_VBL          equ     UADE_STAGE+$2c
; UADE_PROBE_STALLS / _RING -- per-switch stall measurement, fix round 5. One
; observation is not a number: round 4 reported "~1432 vblanks per AHX switch"
; from a single sample, with no count and no spread, and it could not be
; reconciled against anything else read out of the machine. So record EVERY
; switch: sample the ISR vblank clock either side of _music_select_pump and,
; when the pump actually did work, push (song << 16 | frames) into a 16-entry
; ring. _RING is the last 16; _STALLS is how many there have been in total, so
; a reader can tell a full ring from a partial one and can see wrap.
; The ring does NOT live in low memory. $420-$42F survives a 900-second run
; (the counters above have been read out of it all round), but $430 and $440
; do not -- a first attempt put the count at $430 and the ring at $440 and read
; back 0x01240000 switches and frame counts in the millions, because something
; in the resident OS still owns that span. So the instrument lives in the
; probe's own data and ONE low-memory longword carries its address, with a
; magic word at the base so a reader can tell a followed pointer from garbage.
UADE_PROBE_INSTR        equ     UADE_STAGE+$18          ; -> uade_instrument
UADE_PROBE_RING_N       equ     16
        ifnd    UADE_SWITCH_PERIOD
UADE_SWITCH_PERIOD      equ     250             ; ~5 s at 50 Hz
        endc
; Zero them first. These are ordinary low-memory longwords Kickstart has
; already used, so an un-initialised counter reads back as whatever the OS
; left there plus N -- 0x01800069 rather than 105 -- and a reader has no way
; to tell a counter from a constant. (UADE_PROBE_TICKS shipped that way in
; round 2 and read as a frozen 0xE20000.)
        clr.l   UADE_PROBE_TICKS
        clr.l   UADE_PROBE_SWITCHES
        clr.l   UADE_PROBE_SONG
        clr.l   UADE_PROBE_VBL
        lea     uade_instrument(pc),a0
        move.l  a0,UADE_PROBE_INSTR
        move.l  #'RING',(a0)+           ; magic: the pointer was followed
        moveq   #UADE_PROBE_RING_N*2,d0 ; the count longword, then the ring
.clrring:
        clr.l   (a0)+
        dbf     d0,.clrring
.mainloop:
        bsr     uade_wait_vbl
        addq.l  #1,UADE_PROBE_TICKS
        ifd     UADE_PROBE_SONGS
        clr.w   uade_switch_asked
        subq.l  #1,switch_countdown
        bne.b   .noswitch
        move.l  #UADE_SWITCH_PERIOD,switch_countdown
        moveq   #0,d0
        move.w  next_song(pc),d0
        move.l  d0,UADE_PROBE_SONG      ; a full longword -- a move.w here left
                                        ; the low half as OS garbage, and the
                                        ; reader was reading that half
        bsr     _music_select
        addq.l  #1,UADE_PROBE_SWITCHES
        move.w  #1,uade_switch_asked    ; record THIS iteration's stall
        ifd     UADE_PROBE_FIXED
        ; -DUADE_PROBE_FIXED pins every request to the same index, so a soak
        ; can ask for the song that is ALREADY playing. That separates "the
        ; incoming player is the problem" from "a second contplayer entry is
        ; the problem" without changing anything else.
        else
        move.w  next_song(pc),d0
        addq.w  #1,d0
        cmp.w   #UADE_PROBE_SONGS,d0
        blo.b   .wrapped
        moveq   #0,d0
.wrapped:
        lea     next_song(pc),a0
        move.w  d0,(a0)
        endc
.noswitch:
        endc
        ; Musicdisk switch pump -- fix round 1 (2026-09-21) moved the switch
        ; out of _music_play2 because the REAL demo calls _music_play1/
        ; _music_play2 from a genuine level-3 VBL interrupt (_Interrupt,
        ; main_glue.s/hdd_startup.s), and running relocation/player-init
        ; there deadlocks: being inside that handler blocks VBL (and any
        ; lower-priority source) from re-firing until it returns, so an
        ; init that waits on a frame counter, an audio interrupt or a CIA
        ; tick never sees it happen. This probe's own .mainloop is polled,
        ; not an interrupt (see the comment above), so it does not reproduce
        ; that specific IPL deadlock -- but it is still the right call site
        ; to exercise here: amiga_main.c calls the pump from ITS main loop
        ; the same way, and the probe should keep matching the real ABI.
        ifd     UADE_PROBE_SONGS
        move.l  UADE_PROBE_VBL,d3       ; ISR clock BEFORE the pump
        bsr     _music_select_pump
        move.l  UADE_PROBE_VBL,d4
        sub.l   d3,d4                   ; vblanks the pump consumed
        ; Record on "a switch was ASKED FOR this iteration", not on "the pump
        ; took more than N frames". The first version used `cmp.l #2 / blo` to
        ; tell a working pump from an idle one, which silently discarded any
        ; switch costing 0 or 1 frames -- so it could only ever bias the
        ; recorded figures UPWARD, and on the arm where that matters most (a
        ; cheap player on an 020, measured at 3-4 frames) that floor sat right
        ; next to the measurement. The driver above knows whether it asked.
        tst.w   uade_switch_asked
        beq     .nostall
        ; Two plain longwords per record, {song, frames}. An earlier version
        ; packed them into one with swap/move.w and read the wrong half of
        ; UADE_PROBE_SONG, which produced song numbers in the hundreds. Do the
        ; obvious thing instead -- this is an instrument, and an instrument
        ; that needs decoding is one more place to be wrong.
        lea     uade_instrument(pc),a0
        move.l  4(a0),d5                ; how many switches so far
        andi.l  #UADE_PROBE_RING_N-1,d5
        lsl.l   #3,d5                   ; 8 bytes per record
        adda.l  #8,a0                   ; past the magic and the count
        adda.l  d5,a0
        move.l  UADE_PROBE_SONG,(a0)+   ; the index this switch asked for
        move.l  d4,(a0)                 ; vblanks the main loop lost to it
        lea     uade_instrument(pc),a0
        addq.l  #1,4(a0)
.nostall:
        else
        bsr     _music_select_pump
        endc
        ifnd    PLAY_IN_IRQ
	tst.b	_screen_paused
	bne.b	.scr_skip
        bsr     _music_play1
        bsr     _music_play2
.scr_skip:
        endc
	bsr	_screen_frame
        btst    #6,$bfe001              ; CIA-A PRA bit 6 = left mouse button
        bne     .mainloop

        ; --- give it all back ----------------------------------------------
        bsr     _music_stop
        bsr     _music_shutdown

        lea     CUSTOM,a5
        move.w  #$7fff,INTENA(a5)
        move.w  #$7fff,INTREQ(a5)
        move.w  #$7fff,DMACON(a5)
        move.w  saved_dmacon(pc),DMACON(a5)
        move.w  saved_intena(pc),INTENA(a5)

        move.l  d7,a6                   ; graphics base
        move.l  oldview(pc),a1
        jsr     GFX_LoadView(a6)
        jsr     GFX_WaitTOF(a6)
        jsr     GFX_WaitTOF(a6)
        move.l  a6,a1
        move.l  EXEC_BASE.w,a6
        jsr     EXEC_CloseLibrary(a6)

.noexit:
        movem.l (sp)+,d1-a6
        moveq   #0,d0
        rts

; Runs in supervisor mode via Supervisor(); returns the VBR in a0.
uade_getvbr:
        dc.w    $4e7a,$8801             ; movec vbr,a0
        rte

; Minimal VBL handler: acknowledge and return. Deliberately does NOT touch
; Exec -- 4.w is score's fake ExecBase while the backend is live.
uade_vbl:
        move.w  #$0020,$dff09c          ; ack VERTB
        addq.l  #1,UADE_PROBE_VBL       ; see UADE_PROBE_VBL -- an ISR clock
        ifd     PLAY_IN_IRQ
        ; Like the demo's _Interrupt: the player ticks from a real level-3 VBL, so the
        ; software mixer is not delayed by the polled main loop (screen redraw).
        tst.b   _cinter_ready           ; set by _music_init; nothing to play before it
        beq.b   .irq_done
        tst.b   _screen_paused
        bne.b   .irq_done
        movem.l d0-d7/a0-a6,-(sp)
        bsr     _music_play1
        bsr     _music_play2
        movem.l (sp)+,d0-d7/a0-a6
.irq_done:
        endc
        rte

; The crash oracle.
;
; The two 68000 frame shapes are NOT interchangeable, and conflating them is how
; a bus error reads as "executing at a wild address":
;   group 2 (illegal, divide, line A/F, trap) -- 6 bytes: SR, PC
;   group 0 (bus error, address error)       -- 14 bytes: special status word,
;                                               access address (long),
;                                               instruction register, SR, PC
; So each vector gets its own stub, records WHICH vector fired, and decodes the
; frame it actually has.
uade_exc2:
        move.l  #'BUSE',UADE_STAGE
        bra.b   uade_exc_group0
uade_exc3:
        move.l  #'ADRE',UADE_STAGE
uade_exc_group0:
        movem.l d0-d7/a0-a7,uade_regs
        move.w  (sp),UADE_STAGE+4       ; special status word
        move.l  2(sp),UADE_STAGE+6      ; ACCESS ADDRESS that faulted
        move.w  6(sp),UADE_STAGE+10     ; instruction register
        move.w  8(sp),UADE_STAGE+12     ; SR
        move.l  10(sp),UADE_STAGE+14    ; PC of the faulting instruction
.spin0: bra.b   .spin0

uade_excPRIV2:
        move.l  #'PRIV',UADE_STAGE
        bra.b   uade_exc_group2
uade_excCHK:
        move.l  #'CHK ',UADE_STAGE
        bra.b   uade_exc_group2
uade_excTRAPV:
        move.l  #'TRPV',UADE_STAGE
        bra.b   uade_exc_group2
uade_excPRIV:
        move.l  #'TRCE',UADE_STAGE
        bra.b   uade_exc_group2
uade_excUNIN:
        move.l  #'UNIN',UADE_STAGE
        bra.b   uade_exc_group2
uade_excSPUR:
        move.l  #'SPUR',UADE_STAGE
        bra.b   uade_exc_group2
uade_excLVL:
        move.l  #'ILVL',UADE_STAGE
        bra.b   uade_exc_group2
uade_exc4:
        move.l  #'ILLG',UADE_STAGE
        bra.b   uade_exc_group2
uade_exc5:
        move.l  #'DIV0',UADE_STAGE
        bra.b   uade_exc_group2
uade_exc10:
        move.l  #'LINA',UADE_STAGE
        bra.b   uade_exc_group2
uade_exc11:
        move.l  #'LINF',UADE_STAGE
uade_exc_group2:
        movem.l d0-d7/a0-a7,uade_regs   ; which register carried the bad pointer?
        move.w  (sp),UADE_STAGE+12      ; SR
        move.l  2(sp),UADE_STAGE+14     ; PC
.spin2: bra.b   .spin2

; Wait for the start of the vertical blank. Polled on VPOSR so the probe needs
; no interrupt of its own -- the demo's VBL is what calls the backend for real,
; and installing one here would just be a second thing that can be wrong.
uade_wait_vbl:
        lea     CUSTOM,a0
.w1:    move.l  VPOSR(a0),d0            ; wait until we are PAST the blank
        andi.l  #$1ff00,d0
        cmpi.l  #$00300,d0
        blo.b   .w1
.w2:    move.l  VPOSR(a0),d0            ; then for it to come round again
        andi.l  #$1ff00,d0
        cmpi.l  #$00300,d0
        bhs.b   .w2
        rts

        even
        xref    uade_regs               ; the buffer lives in uade_glue.s

; The runtime's music gate, which this rig stands in for. main_glue.s:200 and
; hdd_startup.s:584 define this byte and their VBL ISR tests it before calling
; _music_play1/_play2; _music_init sets it (uade_glue.s, cinter_glue.s:59,
; synth_glue.s:36). The rig drives the backend from its own loop and never
; reads it, but the glue WRITES it, so without a definition here the rig does
; not link -- the mirror image of the four things the rig used to supply that
; the demo did not.
        xdef    _cinter_ready
_cinter_ready:  dc.b 0
        even
; The stall instrument: magic, total switch count, then 16 {song, frames}
; records. See UADE_PROBE_INSTR for why it is here and not in low memory.
        even
uade_instrument:
        dc.l    0                       ; 'RING'
        dc.l    0                       ; switches recorded in total
        dcb.l   UADE_PROBE_RING_N*2,0
_SysBase:       dc.l 0
        ifd     UADE_PROBE_SONGS
; Frames until the next switch request, and the index that request will carry.
; next_song starts at 0 so the first switch targets a song that is NOT
; UADE_START_SONG whenever the playlist starts anywhere but song 0 -- the
; fixture starts on song 1, so the first switch is 1 -> 0, the direction the
; fix-round-2 crash was observed in.
uade_switch_asked:  dc.w 0          ; set by the driver, read by the recorder
        even
switch_countdown:   dc.l UADE_SWITCH_PERIOD
        ifd     UADE_PROBE_FIRST
next_song:          dc.w UADE_PROBE_FIRST
        else
next_song:          dc.w 0
        endc
        even
        endc
oldview:        dc.l 0
; The vector base, read once at _start and published for uade_glue.s and
; input_sdk.s, which write their vectors through it. 0 on a 68000.
_uprough_vbr:   dc.l 0
saved_intena:   dc.w 0
saved_dmacon:   dc.w 0
gfxname:        dc.b 'graphics.library',0
        even
