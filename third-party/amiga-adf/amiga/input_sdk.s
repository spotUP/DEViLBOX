; input_sdk.s -- the demo system's ONE reader of the input hardware.
;
; WHY IT EXISTS. Input was ad hoc and spread across the tree: uade_poll_skip
; sampled the joystick, the right mouse button and the fire button and meant
; only "next song"; DemoStartup.S polls the LEFT button for the quit and the
; RIGHT one for its pause; UPROUGH_RMB_PAUSE had to be compiled OUT of every
; playlist build because a held right button froze the main loop. Three owners,
; one set of bits, no way for an effect to ask a question of its own. Owner,
; 2026-09-22: "we have to add a proper input sdk to the demo system, mosue,
; joysticks, keyboards.."
;
; THE RULE THIS FILE ENFORCES: every input register is read ONCE PER FRAME, by
; input_poll, and what it read is published for everyone else. That is not
; tidiness -- one of the registers is DESTRUCTIVE to read:
;
;   $bfe001  CIA-A PRA    bit 6 = port 0 fire (the left mouse button)
;                         bit 7 = port 1 fire.  A PORT read: safe, repeatable.
;   $dff016  POTGOR       bit 14 = port 0 right button, bit 10 = port 1's.
;                         Safe, but needs POTGO driven (see input_init).
;   $dff00a  JOY0DAT      port 0: the mouse's two 8-bit quadrature counters.
;   $dff00c  JOY1DAT      port 1: a joystick's direction bits.
;   $bfec01  CIA-A SDR    the keyboard byte.
;   $bfed01  CIA-A ICR    *** READING IT CLEARS EVERY FLAG IN IT ***, timer A
;                         and timer B included -- which is what the UADE score
;                         dispatches its music interrupt on. A second reader
;                         here would silently stop the music. This file never
;                         touches the ICR; the keyboard arrives through
;                         input_key_event, which the ONE existing ICR owner
;                         calls with the byte it already read.
;
; SAMPLED IN THE VBLANK, not in the main loop. A press shorter than a frame
; stall is otherwise never seen -- that is exactly how "skipping looked random"
; on the first musicdisk, whose poll sat at the top of a spin loop that stops
; for the length of a song switch.
;
; EDGES ARE COUNTED AND CONSUMED BY SUBTRACTION, never cleared. A reader takes
; what it read and leaves anything that arrived meanwhile, so a press landing
; between a read and its acknowledgement survives to the next call. Nothing
; here masks interrupts to achieve that: the demo's main loop runs in USER MODE
; (amiga/hdd_startup.s:507), where `ori.w #$0700,sr` is a privilege violation.
;
; *** OCS / 68000 code ***, no 68020-only addressing.

; ---- the bits the C header mirrors (src/engine/input_sdk.h) ---------------
IN_FIRE0        equ     1               ; port 0 fire = the LEFT mouse button
IN_RMB0         equ     2               ; port 0 right button
IN_FIRE1        equ     4               ; port 1 fire
IN_RMB1         equ     8               ; port 1 right button

IN_UP           equ     1
IN_DOWN         equ     2
IN_LEFT         equ     4
IN_RIGHT        equ     8

IN_KEY_SLOTS    equ     128             ; raw keycodes 0..127
IN_RING_SLOTS   equ     16              ; power of two: the mask below needs it

                section code,code

                xdef    _input_init         ; void(void)
                xdef    _input_poll         ; void(void) -- once per VBlank
                xdef    _input_key_event    ; void(long icr, long sdr)
                xdef    _input_own_keyboard ; void(void) -- take $68
                xref    _uprough_vbr        ; the startup publishes it
                xdef    _input_buttons      ; long(void)  held
                xdef    _input_buttons_pressed  ; long(void) edges, consumed
                xdef    _input_dir          ; long(long port) held
                xdef    _input_dir_pressed  ; long(long port) edges, consumed
                xdef    _input_mouse_dx     ; long(void) consumed
                xdef    _input_mouse_dy     ; long(void) consumed
                xdef    _input_key_held     ; long(long rawcode)
                xdef    _input_key_pressed  ; long(long rawcode) consumed
                xdef    _input_key_take     ; long(void) -1 when empty
                xdef    _input_frame        ; the sample counter, for debugging
                                            ; (defined with the state below)

; ---------------------------------------------------------------------------
; void input_init(void)
;   Drive POTGO so POTGOR's right-button bits read back, and drop any state a
;   previous run left. NOTHING ELSE in this project writes $dff034, so without
;   this the bit reflects whatever the OS happened to leave: on a floppy boot
;   that was usable and the right button worked, booting from DH0 it was not
;   and the same code read a button that never appeared pressed.
; ---------------------------------------------------------------------------
_input_init:
        move.w  #$ff00,$dff034
        lea     in_state(pc),a0
        moveq   #(in_state_end-in_state)/4-1,d0
.wipe:  clr.l   (a0)+
        dbf     d0,.wipe
        ; The mouse baseline must be the CURRENT counter, not zero, or the
        ; first poll reports the whole distance the pointer travelled before
        ; the demo started.
        move.w  $dff00a,in_last_joy0
        rts

; ---------------------------------------------------------------------------
; void input_poll(void)
;   One sample of everything that is safe to read. Called from the level-3
;   VBlank body in amiga/hdd_startup.s and amiga/main_glue.s.
; ---------------------------------------------------------------------------
_input_poll:
        movem.l d0-d3/a0-a1,-(sp)
        ; SELF-INITIALISING on the first frame rather than relying on someone
        ; calling input_init first. The poll lives in the level-3 VBlank body,
        ; which starts running the moment the server is installed -- before any
        ; demo code gets a turn -- so an ordering rule here would be a rule
        ; that is broken by default. input_init stays public for a caller that
        ; wants to re-baseline the mouse deliberately.
        tst.w   in_ready
        bne.b   .ready
        move.w  #1,in_ready
        bsr     _input_init
.ready:
        addq.l  #1,in_frame

        ; ---- buttons -------------------------------------------------------
        ; Every one of these reads 0 WHILE HELD, so each test is inverted into
        ; a 1-means-held bit before anything else looks at it.
        moveq   #0,d0
        btst    #6,$bfe001              ; port 0 fire / left mouse button
        bne.b   .nf0
        ori.w   #IN_FIRE0,d0
.nf0:   btst    #7,$bfe001              ; port 1 fire
        bne.b   .nf1
        ori.w   #IN_FIRE1,d0
.nf1:   move.w  $dff016,d1              ; POTGOR
        btst    #6,d1                   ; bit 14 = port 0 right button
        bne.b   .nr0
        ori.w   #IN_RMB0,d0
.nr0:   btst    #2,d1                   ; bit 10 = port 1 right button
        bne.b   .nr1
        ori.w   #IN_RMB1,d0
.nr1:
        lea     in_held(pc),a0
        lea     in_edge(pc),a1
        bsr     in_edges                ; d0 = held now

        ; ---- port 1 directions --------------------------------------------
        ;*--- PORT: A MOUSE IN THE JOYSTICK PORT IS NOT A JOYSTICK.
        ;     JOY1DAT decodes as direction bits whatever is plugged in, and a
        ;     MOUSE there is two free-running 8-bit counters -- so moving it
        ;     reads as up/down/left/right held at random, dozens of times a
        ;     second. slash, 2026-09-23, on a real A1200: "the musicdisk
        ;     flipped out when he moved the mouse", with the cursor flying
        ;     through a 104-song list.
        ;     THE REGISTER CAN TELL THEM APART even though the decode cannot.
        ;     A joystick only ever moves bits 0, 1, 8 and 9; the rest of each
        ;     byte is a mouse counter's upper bits. So: a CHANGE in any of
        ;     those bits is a mouse, and from then on this port stops steering
        ;     anything. A change, not merely a non-zero value -- an
        ;     unconnected port can read anything, and a static reading must
        ;     never disable a joystick that is simply sitting still.
        ;     68000 ONLY in here: `eor.w <ea>,Dn` does not exist (EOR goes
        ;     Dn -> ea) and `tst.w <label>(pc)` is 68020+. Both are spelled out
        ;     through a data register, which is what the rest of this file does
        ;     for the same reason.
        move.w  $dff00c,d1
        move.w  in_last_joy1(pc),d2
        move.w  d1,in_last_joy1
        eor.w   d1,d2                   ; the bits that CHANGED
        andi.w  #$FCFC,d2               ; everything a joystick cannot move
        beq.b   .p1_joy
        move.w  #1,in_port1_mouse
.p1_joy:
        move.w  in_port1_mouse(pc),d2   ; move sets Z, so no tst needed
        bne.b   .p1_mouse
        bsr     in_decode_dirs
        bra.b   .p1_store
.p1_mouse:
        moveq   #0,d0                   ; a mouse: no directions from here
.p1_store:
        lea     in_dir1(pc),a0
        lea     in_dir1_edge(pc),a1
        bsr     in_edges

        ; ---- port 0: a MOUSE, so its counters are a position, not a switch --
        ; PORT 0 IS A MOUSE AND PORT 1 IS A JOYSTICK on this system. The two
        ; cannot be told apart from the register -- JOY0DAT reads as counters
        ; either way -- so input_dir(0) stays 0 and a joystick belongs in
        ; port 1, which is where a stock Amiga puts it anyway.
        ; JOY0DAT's two halves are free-running 8-bit counters that wrap, so
        ; the delta has to be taken in 8 bits and sign-extended -- subtracting
        ; the 16-bit words reports a 255-pixel jump every time either half
        ; wraps. Accumulated rather than replaced: a reader that looks every
        ; few frames must not lose the frames in between.
        move.w  $dff00a,d1
        move.w  d1,d2
        move.w  in_last_joy0(pc),d3
        move.w  d1,in_last_joy0
        ; X = low byte
        sub.b   d3,d2
        ext.w   d2
        add.w   d2,in_mouse_dx
        ; Y = high byte
        lsr.w   #8,d1
        lsr.w   #8,d3
        sub.b   d3,d1
        ext.w   d1
        add.w   d1,in_mouse_dy

        movem.l (sp)+,d0-d3/a0-a1
        rts

; in_decode_dirs -- d1 = a JOYxDAT word -> d0 = IN_UP/DOWN/LEFT/RIGHT bits.
; Each axis is a quadrature PAIR, so its direction is the XOR of the two bits,
; not the high bit alone. WHICH XOR IS WHICH WAS MEASURED: the Hardware
; Reference Manual's table names bit1^bit0 FORWARD, and with that reading the
; owner pushed up and the cursor went down (2026-09-23, real Amiberry, cursor
; keys mapped to port 1). Their hands decided it.
; Clobbers d0-d2.
in_decode_dirs:
        moveq   #0,d0
        move.w  d1,d2
        lsr.w   #1,d2
        eor.w   d2,d1                   ; bit 0 and bit 8 are the two XORs
        btst    #8,d1
        beq.b   .nu
        ori.w   #IN_UP,d0
.nu:    btst    #0,d1
        beq.b   .nd
        ori.w   #IN_DOWN,d0
.nd:    btst    #9,d1                   ; LEFT is the raw bit, not an XOR
        beq.b   .nl
        ori.w   #IN_LEFT,d0
.nl:    btst    #1,d1                   ; RIGHT likewise
        beq.b   .nr
        ori.w   #IN_RIGHT,d0
.nr:    rts

; in_edges -- d0 = the bits held NOW, a0 = the held word, a1 = the edge word.
; Records the held state and ORs in every bit that was not set last time.
; Clobbers d1.
in_edges:
        move.w  (a0),d1
        not.w   d1
        and.w   d0,d1                   ; bits that went 0 -> 1
        or.w    d1,(a1)
        move.w  d0,(a0)
        rts

; ---------------------------------------------------------------------------
; void input_key_event(long icr, long sdr)
;   Called by whoever owns CIA-A's ICR, with the byte it already read. In a
;   UADE build that is score's own ciaa_interrupt -- it reads $bfed01 and then
;   throws away everything but bits 0 and 1, so the keyboard flag was being
;   discarded by the one routine allowed to see it.
;
;   The Amiga keyboard sends its code INVERTED and ROTATED ONE BIT LEFT, so
;   the raw code is `ror.b #1, not.b(sdr)`; bit 0 of the result is the
;   up/down flag, 1 meaning RELEASE.
;
;   THE HANDSHAKE IS DONE HERE, not by the caller. The keyboard holds the line
;   until the machine acknowledges: CIA-A's CRA bit 6 is flipped to OUTPUT for
;   at least 85 us and back. Leaving that to the ICR's owner would mean every
;   owner has to know a keyboard protocol to call an input routine; doing it
;   here means the hook is one jsr wherever the ICR is already read. Without
;   it the keyboard sends its byte once and then goes quiet forever.
; ---------------------------------------------------------------------------
; ===========================================================================
; _input_own_keyboard -- THE KEYBOARD WHEN NOBODY ELSE READS THE ICR.
;
; The header above says this file never touches CIA-A's ICR because the UADE
; score's ciaa_interrupt is the one permitted reader and hands the keyboard
; flag on. That is true ONLY WHILE A PLAYER HAS A CIA-A INTERRUPT INSTALLED.
; score writes $68 from add_ciaa_interrupt (score.s:3224) and a player that
; times itself on CIA-B or on the VBlank never calls it -- so nothing reads the
; ICR, nothing calls input_key_event, and the demo has no keyboard at all.
;
; MEASURED 2026-09-23 on the owner's 110-song disk, with the demo running at a
; full 50 Hz the whole time:
;   ArtOfNoise (4ch), song 5   key ring write pointer 12 -> 12   keys DEAD
;   David Whittaker, song 18   key ring write pointer  3 -> 10   keys alive
; the same injected keypresses both times. The owner read it as a freeze --
; "27 eco freeze the demo", "amanda still swallow input for a long time" --
; because the only way out is the auto-advance.
;
; SO THE DEMO TAKES THE VECTOR WHEN SCORE DOES NOT WANT IT. uade_glue.s calls
; this at install and again in every switch teardown, BEFORE the incoming
; player runs: if that player installs a CIA-A interrupt, score overwrites $68
; with ciaa_interrupt and the keyboard arrives through score's PORT hook as
; before; if it does not, this handler stays and reads the ICR itself. Exactly
; one reader either way, which is the invariant that matters -- two readers
; would silently eat each other's timer flags and stop the music.
;
; $68 is already in uade_glue.s's uade_vec_list, so the OS gets it back at
; shutdown with the rest.
_input_own_keyboard:
;*--- VBR-RELATIVE. `$68.w` is the level-2 vector only while VBR = 0 -- true on
;     every emulator, false on an accelerator with 68060.library or SetPatch,
;     where this write lands in dead low memory and the keyboard never arrives.
;     REPRODUCED 2026-09-23 with UPROUGH_TEST_VBR: the demo guru'd 8000 0025.
        move.l  _uprough_vbr,a0
        move.l  #input_keyboard_isr,$68(a0)
        ; CIA-A ICR: SET (bit 7) | SP (bit 3). Enabling the serial line's
        ; interrupt does not disturb the timer mask bits a player may set
        ; later -- writes to the ICR are set/clear by bit 7, not a whole-byte
        ; store.
        move.b  #$88,$bfed01
        move.w  #$8008,$dff09a          ; INTENA: SET | PORTS
        rts

; Level 2 (PORTS). Supervisor, and the ONLY reader of $bfed01 while it is
; installed. Acks INTREQ before the read, exactly as score's ciaa_interrupt
; does, so a flag raised during the handler is not lost.
input_keyboard_isr:
        movem.l d0-d1/a0-a1,-(sp)
        move.w  #$0008,$dff09c          ; INTREQ: ack PORTS
        move.b  $bfed01,d0              ; ONE read -- it CLEARS every flag
        andi.l  #$ff,d0
        move.b  $bfec01,d1              ; CIA-A SDR: the key byte
        andi.l  #$ff,d1
        move.l  d1,-(sp)
        move.l  d0,-(sp)
        ; Returns immediately unless ICR bit 3 is set, so a PORTS interrupt
        ; from anything else costs four instructions.
        jsr     _input_key_event
        addq.l  #8,sp
        movem.l (sp)+,d0-d1/a0-a1
        rte

_input_key_event:
        move.l  4(a7),d0
        btst    #3,d0                   ; ICR bit 3 = SP, a keyboard byte
        ; beq.w, not beq.b: the raster-timed handshake below pushed .none past
        ; the 127-byte reach of a short branch (vasm error 2029).
        beq.w   .none
        movem.l d0-d2/a0,-(sp)
        move.l  8+16(a7),d0
        not.b   d0
        ror.b   #1,d0
        ; ACKNOWLEDGE FIRST, decode after: the keyboard is waiting on the line
        ; and the decode below can take a branch or two. Bit 6 of CRA
        ; ($bfee01) to 1 = the serial port drives the clock, which is the
        ; handshake pulse, and it must last AT LEAST 85 us.
        ;
        ;*--- PORT: TIME IT OFF THE RASTER, NOT OFF INSTRUCTIONS. This used to
        ;     be `move.w #95,d0 / .hs dbf d0,.hs` -- ~600 cycles, which is
        ;     134 us on a 7.09 MHz 68000 and far too short on anything faster:
        ;     roughly 40 us on a stock A1200's 020, and single-digit us on a
        ;     TF1260. A handshake that short is one the keyboard never sees, so
        ;     it sends its first byte and goes silent for ever.
        ;     REPORTED 2026-09-23, slash, on a real A1200: the musicdisk's keys
        ;     were DEAD, on every song -- and every emulator we have was happy,
        ;     because an emulated keyboard forgives the pulse a real one does
        ;     not.
        ;     A PAL scanline is 63.56 us and VHPOSR's high byte ($dff006) is the
        ;     line counter, which runs whatever the CPU is: waiting for it to
        ;     change twice is 63..127 us of real time on every machine. Two
        ;     changes, not one, because the first may land a cycle before a
        ;     line boundary.
        bset    #6,$bfee01
        movem.l d0/d2/a0,-(sp)
        lea     $dff000,a0
        moveq   #2-1,d2                 ; two line changes
.hsline:
        move.b  $006(a0),d0             ; VHPOSR high byte = the raster line
.hssame:
        cmp.b   $006(a0),d0
        beq.b   .hssame
        dbf     d2,.hsline
        movem.l (sp)+,d0/d2/a0
        bclr    #6,$bfee01
        move.b  d0,d1
        andi.w  #$7f,d1                 ; the keycode
        btst    #7,d0
        bne.b   .release
        lea     in_key_held(pc),a0
        tst.b   0(a0,d1.w)
        bne.b   .done                   ; auto-repeat: not a new press
        move.b  #1,0(a0,d1.w)
        lea     in_key_edge(pc),a0
        addq.b  #1,0(a0,d1.w)
        ; ...and into the ring, so a reader that wants the ORDER of the
        ; presses (a text field, a menu shortcut) does not have to scan 128
        ; slots to find out which came first.
        move.w  in_ring_w(pc),d2
        move.w  d2,d0
        addq.w  #1,d0
        andi.w  #IN_RING_SLOTS-1,d0
        cmp.w   in_ring_r(pc),d0
        beq.b   .done                   ; full: drop the oldest-first policy
        lea     in_ring(pc),a0
        move.b  d1,0(a0,d2.w)
        move.w  d0,in_ring_w
        bra.b   .done
.release:
        lea     in_key_held(pc),a0
        clr.b   0(a0,d1.w)
.done:
        movem.l (sp)+,d0-d2/a0
.none:
        rts

; ---------------------------------------------------------------------------
; The readers. Every "pressed" one CONSUMES what it returns by subtracting it,
; so an event arriving between the read and the write survives.
; ---------------------------------------------------------------------------
_input_buttons:
        moveq   #0,d0
        move.w  in_held(pc),d0
        rts

_input_buttons_pressed:
        moveq   #0,d0
        move.w  in_edge(pc),d0
        beq.b   .none
        move.w  d0,d1
        not.w   d1
        lea     in_edge(pc),a0
        and.w   d1,(a0)                 ; clear EXACTLY the bits returned --
.none:  rts                             ; one RMW, so the VBlank cannot split it

_input_dir:
        move.l  4(a7),d0
        moveq   #0,d1
        tst.l   d0
        bne.b   .p1
        move.w  in_dir0(pc),d1
        move.l  d1,d0
        rts
.p1:    move.w  in_dir1(pc),d1
        move.l  d1,d0
        rts

_input_dir_pressed:
        move.l  4(a7),d0
        lea     in_dir1_edge(pc),a0
        tst.l   d0
        bne.b   .have
        lea     in_dir0_edge(pc),a0
.have: moveq   #0,d0
        move.w  (a0),d0
        beq.b   .none
        move.w  d0,d1
        not.w   d1
        and.w   d1,(a0)
.none:  rts

_input_mouse_dx:
        lea     in_mouse_dx(pc),a0
        bra.b   in_take_word
_input_mouse_dy:
        lea     in_mouse_dy(pc),a0
in_take_word:
        move.w  (a0),d0
        sub.w   d0,(a0)                 ; consume exactly what was read
        ext.l   d0
        rts

_input_key_held:
        move.l  4(a7),d0
        cmpi.l  #IN_KEY_SLOTS,d0
        bhs.b   .no                     ; unsigned: rejects negatives too
        lea     in_key_held(pc),a0
        moveq   #0,d1
        move.b  0(a0,d0.l),d1
        move.l  d1,d0
        rts
.no:    moveq   #0,d0
        rts

_input_key_pressed:
        move.l  4(a7),d0
        cmpi.l  #IN_KEY_SLOTS,d0
        bhs.b   .no
        lea     in_key_edge(pc),a0
        moveq   #0,d1
        move.b  0(a0,d0.l),d1
        beq.b   .no
        sub.b   d1,0(a0,d0.l)           ; consume what was read
        move.l  d1,d0
        rts
.no:    moveq   #0,d0
        rts

_input_key_take:
        move.w  in_ring_r(pc),d1
        cmp.w   in_ring_w(pc),d1
        beq.b   .empty
        lea     in_ring(pc),a0
        moveq   #0,d0
        move.b  0(a0,d1.w),d0
        addq.w  #1,d1
        andi.w  #IN_RING_SLOTS-1,d1
        move.w  d1,in_ring_r
        rts
.empty: moveq   #-1,d0
        rts

; ---------------------------------------------------------------------------
                section data,data

; in_ready is OUTSIDE the block input_init wipes -- it is what says the wipe
; already happened.
in_ready:       dc.w    0
                even
in_state:
in_frame:       dc.l    0
in_held:        dc.w    0
in_edge:        dc.w    0
in_dir0:        dc.w    0
in_dir0_edge:   dc.w    0
in_dir1:        dc.w    0
in_dir1_edge:   dc.w    0
in_mouse_dx:    dc.w    0
in_mouse_dy:    dc.w    0
in_last_joy1:   dc.w    0
; Latched the first time port 1 moves a bit no joystick can move. Never
; cleared: a mouse does not become a joystick while the demo runs.
in_port1_mouse: dc.w    0
in_last_joy0:   dc.w    0
in_ring_r:      dc.w    0
in_ring_w:      dc.w    0
in_pad:         dc.w    0               ; keeps in_state_end - in_state a
                                        ; multiple of 4, which input_init's
                                        ; longword wipe loop depends on
in_ring:        ds.b    IN_RING_SLOTS
in_key_held:    ds.b    IN_KEY_SLOTS
in_key_edge:    ds.b    IN_KEY_SLOTS
                even
in_state_end:

_input_frame    equ     in_frame
