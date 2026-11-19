; uade_glue.s -- the UADE music backend.
;
; Runs UADE's own sound core (amiga/vendor/uade-3.05/amigasrc/score/score.s)
; on bare metal inside the demo runtime, so any of UADE's ~173 EaglePlayer /
; DeliTracker replayers can play natively on the Amiga. UADE's 68k emulator is
; redundant here: the replayers ARE Amiga code. Only the host side was missing,
; and score.s already is that host side.
;
; score.s is INCLUDED at the bottom of this file rather than assembled
; separately. Every symbol in it is local and it has no undefined externals, so
; including it makes labels like `start`, `eaglebase`, `mylevel3_body` and
; `chippoint` reachable with no xdef edits to the vendored source at all.
; Because of that, nothing here may reuse score's plain names -- `start`,
; `relocator`, `strlen`, `clearmem`, `memcopy`, `waittrap`. Everything in this
; file is prefixed uade_ / _uade_.
;
; DIVISION OF LABOUR (the PORT edits in score.s enforce it)
;   - The demo owns the display, DMACON/INTENA and the VBI vector $6c.
;   - score owns $68 (CIA-A) and $78 (CIA-B); we save and restore both, which
;     is the same contract music_glue.s documents for LSP at :20-56.
;   - score's play loop is NOT the audio tick. Notes come from an interrupt
;     (score's CIA timer for DTP_Interrupt, or the player's own via
;     DTP_StartInt). The loop only pumps messages, subsongs and song end, so we
;     run it as a COROUTINE resumed once per VBlank from _music_play2.
;
; LOW MEMORY. score keeps its parameter block at $100-$198 and its message
; window at $200-$300. Measured on an idle Kickstart with no disk, both ranges
; are in use on a real machine (A500/KS1.3: 3 of 128 longwords in $100-$2FF;
; A1200/KS3.1: all 128, filled with Kickstart's default vector handler). The OS
; is frozen while the demo runs, so instead of relocating those blocks -- which
; would mean editing ~20 absolute addressing modes in vendored code -- we
; SNAPSHOT $100-$300 at init and put it back in _music_shutdown. The fake
; ExecBase is different: it is 2 KB and must stay live for the whole demo, so
; that one really did move out of low memory (PORT 4 in score.s).

        xdef    _music_init
        xdef    _music_start
        xdef    _music_stop
        xdef    _music_shutdown
        xdef    _music_play1
        xdef    _music_play2
        xdef    _music_set_pos
        xdef    _music_select
        xdef    _music_select_pump

        xref    _SysBase
        xref    _cinter_ready
        xref    _input_own_keyboard ; amiga/input_sdk.s -- takes vector $68
        xref    _uprough_vbr        ; the startup publishes the vector base

; The shared Paula-zero macro (see _uade_audio_off below for why a bare
; DMA-off is not silence). Same definition the two startups use.
UPROUGH_PAULA_SILENCE  = 1
        include "amiga/paula_silence.i"
        include "amiga/cache_flush.i"
        xdef    uade_regs

; ---------------------------------------------------------------------------
; Tunables. UADE_RELOC_BYTES must hold the player's relocated hunks (the AHX
; player is 12484 bytes on disk; its hunks plus BSS land well inside 32 KB).
; UADE_POOL_BYTES is score's AllocMem arena. Both are placeholders until
; tools/uade_stage.py measures them per module -- see the port-pattern doc.
; ---------------------------------------------------------------------------
; Sizes come from tools/uade_stage.py, per module -- UADE_MODULE_BYTES,
; UADE_RELOC_BYTES, UADE_POOL_BYTES, UADE_ANY_BYTES. Two are exact (module file
; size; relocated hunk total laid out the way relocator.s does it) and two are
; the arena high-water marks the probe measures on the device. For the AHX
; pilot they came out at 12,276 relocated / 2,576 chip / 412,152 any, which is
; why the allocator splits on MEMF_CHIP: unsplit, that 412 KB waveform table
; would have to live in chip and could not fit a 512 KB A500.
; Resolved through vasm's -I, NOT hardcoded to out/. The staging directory is
; a BUILD INPUT: tools/uade_format_sweep.py stages a different module for every
; format it triages, and while the path was fixed at out/ the sweep and the
; demo build shared one out/uade_sizes.i. A demo built after a sweep silently
; inherited the SWEEP's arena sizes -- which is how an A500 demo came to be
; built with a 448 KB arena it had not asked for, and cost an hour of blaming
; the A500. Each build now passes its own -I.
;
; SECTION MATTERS HERE. This include is the file's first executable content
; -- nothing before it opens a `section` -- so without an explicit one, a
; playlist's uade_song_table/uade_player_N incbins/title-composer strings
; (all emitted by tools/uade_stage.py's stage_songs() INTO this generated
; file) land in vasm's own anonymous default hunk, not the `text,code`
; section the rest of this file uses (opened below at "section text,code").
; That extra hunk gets its OWN link-time base, address 0 in a `vlink
; -symfile` dump -- confirmed on device: uade_song_table's dc.l entries still
; resolved to the RIGHT symbols (song 0/AHX played correctly on both a fresh
; boot and after a switch), but reading a row for a LATER song during a
; device-side switch produced a `chippoint` that jumped straight to a huge,
; reproducible, out-of-arena value with the overflow guard never catching it
; -- relocator.s's hunk-size loop (relocator.s:24-44) walks a player image
; with NO bounds check at all, and is the one piece of code in this whole
; backend that trusts a raw pointer without going through exec_alloc_mem's
; checked path. `section text,code` here folds the generated table/incbins
; into the SAME hunk as everything else, the same way single-song builds'
; UADE_MODULE_BYTES-only uade_sizes.i has always been section-agnostic
; content (four equates, no bytes) and never exposed this.
;
; IT IS `uadedata,data`, NOT `text,code`. The named data section fixes the
; anonymous-hunk bug above just as well -- what broke was having NO section,
; not being outside the code one -- and putting BYTES in the CODE section does
; not scale: a playlist incbins every distinct player image plus the
; concatenated module blob here, 3.3 MB for a 37-song musicdisk. That pushed
; score.s and the demo's own startup past the 16-bit reach of a PC-relative
; reference, and the build died on `lea uade_msg_trap(pc)` in score.s and on
; hdd_startup.s's `bsr _music_init` -- assembling fine for a two-song demo and
; failing for a real one, which is the worst possible place for a size limit.
; The single-song path has always put its module and player in `uadedata,data`
; (see _uade_player_src / _uade_mods_src below); the playlist's blobs belong in
; the same place, and uade_song_table is reached by an ABSOLUTE `lea` (below),
; not a PC-relative one, so the table crossing a section boundary is fine.
	section	uadedata,data
	include	"uade_sizes.i"
        include "amiga/cia_giveback.i"

; score's `start` points a7 at this block, so EVERY nested frame -- the CIA-B
; interrupt, the player's handler, Cause, trap #3, the software interrupt --
; piles onto it. 8 KB was a guess; a guard word at the bottom now says whether
; it is enough instead of leaving it to be discovered as a wild jump.
; MEASURED 2026-09-20 on device (JochenHippel, painted stack, read at PLAY):
; the score stack's high-water was 156 BYTES, and the user stack was never
; touched at all. Two 64 KB stacks reserved 128 KB -- a bigger hunk than the
; whole score arena (73.7 KB), and the single largest reason a uade demo did
; not fit a stock A500. 8 KB each is 50x the measured depth and still leaves
; room for a player with a deeper call chain than Hippel's; undersizing is
; loud, not silent, because the guard word below is checked and score's own
; ceiling stops on overrun.
UADE_SCORE_STACK_BYTES  equ     8192
; A value no 68k stack frame would contain by accident: not a plausible
; address, not a small integer, and odd so it cannot be a longword pointer.
UADE_STACK_PAINT        equ     $DEADBE5F
UADE_STACK_GUARD        equ     $57414c4c       ; 'WALL'

; The module region is exactly the module, so nothing is reserved for a size we
; are not using. A pool overflow is no longer silent (PORT 7 in score.s reports
; and dies), so an under-sized pool is a diagnosable failure rather than a
; scribble through the demo's bitplanes.
; Arena layout MIRRORS uade.c, which is the reference implementation:
;     relocaddr = ((player_end) & 0x7FFFF000) + 0x4000
;     modaddr   = ((relocaddr + reloc_len) & 0x7FFFF000) + 0x2000
; i.e. both regions are PAGE ALIGNED and there is real slack between the
; relocated player and the module. Packing them tight (reloc sized exactly,
; module immediately after) is what broke SidMon 1.0: it has no BSS hunk at
; all, so whatever it keeps past its 832 bytes of code landed in the module,
; and the player then read a corrupted pointer at an odd address.
UADE_RELOC_SLACK        equ     $4000           ; uade.c's margin, incl. hippel-coso
UADE_MOD_SLACK          equ     $2000
; Single-song only: UADE_RELOC_BYTES/UADE_MODULE_BYTES/UADE_POOL_BYTES are
; per-module constants tools/uade_stage.py's main() emits and stage_songs()
; (playlist mode) does not -- a playlist's arena comes from
; UADE_ARENA_BYTES_MAX instead (below, near _uade_arena), computed as a MAX
; over the set on the host, because the assembler cannot. Guarded so this
; equate's own expression does not reference undefined symbols in that mode
; -- vasm evaluates an equate's expression where it is WRITTEN, not where
; it is (or isn't) later used.
        ifnd    UADE_SONG_COUNT
UADE_ARENA_BYTES        equ     $1000+UADE_RELOC_BYTES+UADE_RELOC_SLACK+UADE_MOD_SLACK+UADE_MODULE_BYTES+1024+UADE_POOL_BYTES
        endc

; Messages score can send (score.s:26-48). Kept in sync by
; tests/every_amigamsg_the_score_can_send_is_handled_test.py.
AMSG_SETSUBSONG         equ     1
AMSG_SONG_END           equ     2
AMSG_PLAYERNAME         equ     3
AMSG_MODULENAME         equ     4
AMSG_SUBSINFO           equ     5
AMSG_CHECKERROR         equ     6
AMSG_SCORECRASH         equ     7
AMSG_SCOREDEAD          equ     8
AMSG_GENERALMSG         equ     9
AMSG_NTSC               equ     10
AMSG_FORMATNAME         equ     11
AMSG_LOADFILE           equ     12
AMSG_READ               equ     13
AMSG_FILESIZE           equ     14
AMSG_TIME_CRITICAL      equ     15
AMSG_GET_INFO           equ     16
AMSG_START_OUTPUT       equ     17
AMSG_RESERVED_0         equ     18
AMSG_STATE_DETECTION_INIT     equ     19
AMSG_STATE_DETECTION_STEP     equ     20
AMSG_TEST_LOGGING       equ     21
AMSG_DEBUG_U32_STRING          equ     22
AMSG_DEBUG_U32_I32_STRING      equ     23

UADE_MSG                equ     $200    ; output window base (score's msgptr)
UADE_MSG_END            equ     $300
UADE_INPUT_MSG          equ     $300    ; input word

        section text,code

; NO_MUSIC: the project's way of reclaiming chip RAM during iteration. Every
; other backend stubs itself out under it and so must this one -- otherwise a
; NO_MUSIC build still links the whole sound core, both arenas and the staged
; module, which is exactly the bloat RULE 12 forbids, and out/uade_sizes.i may
; not even have been generated. The seven original ABI symbols plus
; _music_select/_music_select_pump (the musicdisk switch request and its
; per-frame pump) still exist, because amiga_main.c and the startup glue
; reference the first seven unconditionally, and Task 5's C caller reaches
; _music_select the same way regardless of backend. This is the exact class
; of bug that broke grejer on 2026-09-18: _music_shutdown referenced while its
; object was gated out, so a NO_MUSIC demo would not link at all.
        IFD     UPROUGH_NO_MUSIC
_music_init:
_music_start:
_music_stop:
_music_shutdown:
_music_play1:
_music_play2:
_music_set_pos:
_music_select:
_music_select_pump:
        rts
        ENDC

        IFND    UPROUGH_NO_MUSIC

; ===========================================================================
; _music_init -- called once from main_glue.s:193 / hdd_startup.s:553, after
; the OS takeover, in USER mode. Everything below needs supervisor (vector
; writes, CIA pokes), so bounce through Exec exactly like music_glue.s:90-97.
; main_glue.s:180-183 deliberately spares vector $20 so this keeps working.
; ===========================================================================
_music_init:
        movem.l d0-d7/a0-a6,-(sp)
        move.l  _SysBase,a6
        lea     _uade_init_super(pc),a5
        jsr     -30(a6)                 ; Supervisor()
        movem.l (sp)+,d0-d7/a0-a6
        rts

_uade_init_super:
        ; --- snapshot everything score is about to take -------------------
        lea     _uade_lowmem_save(pc),a0
        lea     $100,a1
        move.w  #(UADE_MSG_END-$100)/4-1,d0
.savelow:
        move.l  (a1)+,(a0)+
        dbf     d0,.savelow

        lea     _uade_saved_execbase(pc),a0
        move.l  4.w,(a0)
        ; EVERY vector score can take, not just the two it was known to take.
        ; score's exec_set_int_vector installs through `vectab` (score.s:4125-
        ; 4130), which names $64, $68, $6c, $70, $74 and $78 -- so a player
        ; asking for an audio interrupt puts score's mylevel4 in $70, and
        ; nothing here used to give $70 back. Today the demo's own quit path
        ; rebuilds the vector table, so it did not bite; but "somebody else
        ; happens to clean up after us" is not a contract the backend should
        ; lean on, and it is the same shape as the stale-pointer class this
        ; task spent six rounds removing. Saved and restored as a SET, derived
        ; from the same table score dispatches through, so a vendor drop that
        ; adds a vector cannot quietly escape (see
        ; tests/every_vector_score_can_take_must_be_given_back_test.py).
        lea     uade_vec_list(pc),a0
        lea     _uade_saved_vecs(pc),a1
        moveq   #UADE_VEC_COUNT-1,d0
;*--- PORT: VBR-RELATIVE. The list holds OFFSETS ($64..$78); the table they
;     index lives at the VBR, which is zero on every emulator and a fast-RAM
;     address on an accelerator with 68060.library or SetPatch. Saving and
;     restoring absolute low memory there protects the wrong bytes entirely.
.savevec:
        moveq   #0,d1
        move.w  (a0)+,d1
        add.l   _uprough_vbr,d1
        move.l  d1,a2
        move.l  (a2),(a1)+
        dbf     d0,.savevec
        lea     _uade_saved_intena(pc),a0
        move.w  $dff01c,(a0)
        ; What the OS had in the CIAs, before score's start and the player's
        ; timer install rewrite them. _music_shutdown gives it back -- see
        ; amiga/cia_giveback.i for what was leaking and how it was measured.
        CIA_SAVE_REGS _uade_saved_cia

;*--- PORT: TAKE THE KEYBOARD. score only writes $68 when a player installs a
;     CIA-A interrupt (add_ciaa_interrupt, score.s:3224), and a CIA-B or
;     VBlank-timed player never does -- so nothing read CIA-A's ICR, nothing
;     called input_key_event, and the demo had NO KEYBOARD for those formats
;     while running perfectly otherwise. Measured 2026-09-23: ArtOfNoise's key
;     ring never moved, David Whittaker's did, same injected keys.
;     input_sdk.s's handler goes in now; a player that wants CIA-A overwrites
;     it from its own init, and score's PORT hook delivers the keyboard then.
;     One ICR reader at a time either way.
        jsr     _input_own_keyboard

        ; --- publish the arena bounds score's PORT edits read -------------
        lea     uade_pool_end(pc),a0
        move.l  #_uade_arena_end,(a0)
        lea     uade_chip_lo(pc),a0
        move.l  #_uade_arena,(a0)
        lea     uade_chip_hi(pc),a0
        move.l  #_uade_arena_end,(a0)
        lea     uade_score_stack_top(pc),a0
        move.l  #_uade_score_stack_end,(a0)
        ; Paint both stacks so their HIGH-WATER can be read back, then put the
        ; guard word at the bottom of each. Two 64 KB stacks are 128 KB of the
        ; A500's chip budget -- more than the whole score arena -- and nothing
        ; had ever measured what the replayers actually use. A painted stack
        ; turns that into a number: the deepest address still holding the paint
        ; is as far as the stack never reached.
        ;
        ; Safe here: _music_init runs on the CALLER's stack (main_glue.s), and
        ; neither of these is in use until uade_enter_score switches to them.
        lea     _uade_score_stack,a0
        move.l  #(UADE_SCORE_STACK_BYTES*2)/4-1,d0     ; both, they are adjacent
.paint:
        move.l  #UADE_STACK_PAINT,(a0)+
        dbf     d0,.paint
        ; dbf counts words, so a stack pair bigger than 256 KB would need an
        ; outer loop; at 2x64 KB this is 32767 iterations and fits.
        ; Guard at the BOTTOM of the stack: if this is ever not 'WALL', the
        ; stack ran off the end and any rts after that is a wild jump.
        move.l  #UADE_STACK_GUARD,_uade_score_stack
        move.l  #UADE_STACK_GUARD,_uade_user_stack
        ; The MEMF_ANY arena: ordinary RAM, so a player's big non-DMA buffers
        ; (AHX's 403 KB waveform table) never touch the chip budget.
        lea     uade_anypoint(pc),a0
        move.l  #_uade_any_arena,(a0)
        lea     uade_anypool_end(pc),a0
        move.l  #_uade_any_arena_end,(a0)

        ; --- lay the arena out the way uade.c does -------------------------
        ; Page-align the reloc area, then page-align the module above it with
        ; slack, instead of packing them against each other.
        ;
        ; UADE_RELOC_BYTES is per-module (single-song builds). A playlist has
        ; N players sharing this SAME fixed split -- _uade_mod_base never
        ; moves again after this, uade_do_switch only changes what is copied
        ; into the two regions -- so the reloc region must be sized for the
        ; WORST player in the set, not whichever song boots first. Sizing it
        ; from a single song's reloc would let a later, bigger player's
        ; relocated hunks run past _uade_mod_base and corrupt the module (or
        ; the pool) of whichever song is current.
        move.l  #_uade_arena+$FFF,d0
        andi.l  #~$FFF,d0
        lea     _uade_reloc_base(pc),a0
        move.l  d0,(a0)                 ; relocated player goes here
        ifd     UADE_SONG_COUNT
        add.l   #UADE_RELOC_BYTES_MAX+UADE_RELOC_SLACK,d0
        else
        add.l   #UADE_RELOC_BYTES+UADE_RELOC_SLACK,d0
        endc
        andi.l  #~$FFF,d0
        add.l   #UADE_MOD_SLACK,d0
        lea     _uade_mod_base(pc),a0
        move.l  d0,(a0)                 ; module goes here

        ; --- copy the STARTING song's module into chip RAM ------------------
        ; The module is incbin'd into `data` (any RAM) because a data_c copy
        ; would also have to be contiguous with the pool, and score derives
        ; the pool start from the module: after relocation it sets
        ; chippoint = (moduleptr + modulesize + 1024) & ~$FF (score.s,
        ; reloc_success). So module and pool must be ONE chip block with the
        ; module first, and the relocated player must sit BELOW the module.
        ; ABSOLUTE, not (pc): a PC-relative reference from `text` into
        ; `uadedata` makes vlink COMBINE the two sections (warning 58), which
        ; is the same 16-bit-displacement trap music_glue.s:220-224 documents.
        ;
        ; Playlist builds look up UADE_START_SONG's row in uade_song_table the
        ; SAME way every later switch does (uade_song_entry/uade_do_switch),
        ; instead of the single-song incbins -- there is exactly one place
        ; that knows how to read that table.
        ifd     UADE_SONG_COUNT
        move.w  #UADE_START_SONG,d0
        bsr     uade_song_entry                 ; a0 = table row
        move.l  (a0),a2                         ; module source
        move.l  4(a0),d7                        ; module length
        move.l  8(a0),d6                        ; player hunkexe
        ; The song's ORIGINAL name, captured WHILE a0 is still the row: a0 is
        ; reused as a scratch pointer a few instructions below, long before
        ; $128 is published.
        move.l  20(a0),_uade_cur_name
        ; POTGO: enable the port bits so POTGOR's right-mouse-button bit reads
        ; back. NOTHING else in this project writes $dff034 -- not
        ; main_glue.s, not hdd_startup.s, not minimal_startup.s -- so the bit
        ; reflects whatever the OS left behind at takeover. On the floppy build
        ; that happened to be usable and RMB skipping worked; booting from DH0
        ; leaves it otherwise and the same code read a button that never
        ; appeared to be pressed. Write it ourselves rather than inherit it.
        ; $FF00 drives the upper four port bits high, which is the standard way
        ; to make POTGOR bit 10 report the right button (0 = held).
        move.w  #$ff00,$dff034

        ; Publish the BOOT song's title/format too, not just later switches --
        ; otherwise the demo draws nothing until the viewer presses something,
        ; and the first song is the one most likely to be looked at.
        move.l  12(a0),d0
        lea     _uade_cur_title(pc),a1
        move.l  d0,(a1)
        move.l  16(a0),d0
        lea     _uade_cur_composer(pc),a1
        move.l  d0,(a1)
        move.l  a2,a0
        else
        move.l  #_uade_module_src,a0
        move.l  _uade_module_len,d7     ; DEViLBOX ADF: patchable length word, not the slot size
        move.l  #_uade_player_src,d6
        endc
        move.l  _uade_mod_base(pc),a1
        ; Bounds check: FAIL LOUDLY rather than silently overrun the arena.
        ; Same defect class as uade_do_switch's copy (see its comment) -- the
        ; exposure here is a stale/hand-edited uade_sizes.i or an unmeasured
        ; player. score has not been entered yet at this point (_uade_host_sp
        ; is not meaningfully set for THIS attempt), so uade_die's
        ; coroutine-swap teardown would be wrong here too -- mark dead/fatal
        ; and let "run score until it first yields" below see _uade_dead and
        ; skip installing/entering score, instead of unwinding anything.
        move.l  a1,d2
        add.l   d7,d2
        cmp.l   #_uade_arena_end,d2
        bls.b   .modsize_ok
        lea     _uade_fatal(pc),a2
        move.l  #'MOVF',(a2)            ; Module OVerFlow
        lea     _uade_dead(pc),a2
        move.w  #1,(a2)
        bra.b   .nomod
.modsize_ok:
        move.l  d7,d0
        beq.b   .nomod
        ; NOT dbf: its counter is 16-bit and a module can exceed 64 KB.
.copymod:
        move.b  (a0)+,(a1)+
        subq.l  #1,d0
        bne.b   .copymod
.nomod:

        ; --- score's parameter block --------------------------------------
        move.l  _uade_mod_base(pc),$100.w               ; module address
        move.l  d7,$104.w                               ; module length
        move.l  d6,$108.w                               ; player hunkexe
        move.l  _uade_reloc_base(pc),$10c.w             ; relocate player here
        ; TWO stacks, not one. score's `start` loads $114 into a7 (supervisor)
        ; and $110 into usp (user), and it runs its own flow in user mode while
        ; every interrupt pushes a supervisor frame. Pointing both at the same
        ; block makes them trample each other: the guard longword score writes
        ; at each stack top gets popped by an rts, and the machine jumps to
        ; 0x57414C4C -- 'WALL' -- in user mode. That was the fault.
        move.l  #_uade_user_stack_end,$110.w            ; user stack
        move.l  #_uade_score_stack_end,$114.w           ; supervisor stack
        clr.l   $118.w                                  ; force
        clr.l   $11c.w                                  ; setsubsong flag
        clr.l   $120.w                                  ; subsong
        clr.l   $124.w                                  ; ntsc flag: PAL
        ; The module's ORIGINAL name, not out/current.uademod. score's
        ; split_module_name builds the dir/file arrays from it, and a
        ; DTP_ExtLoad player derives its companion's name from those
        ; (mdat.hbtitle -> smpl.hbtitle).
        ;
        ; $128=0 means "no name to split": split_module_name's own
        ; `beq.b nomodulename` skips the whole routine on a null pointer --
        ; that is the ONLY safe way to say "nothing here", NOT an
        ; empty-but-non-null string. A non-null pointer to an EMPTY string
        ; hits a real bug in split_module_name's backward '/' scan
        ; (score.s:894-897, `cmp.b #'/',-(a1)` then `cmp.l a0,a1`): the scan
        ; starts with a1 already equal to a0, the FIRST predecrement puts a1
        ; one byte BELOW a0, and the loop's only exit besides finding a '/'
        ; is a1 rising back up to equal a0 -- which a strictly-decreasing a1
        ; can never do again. It walks backward through memory indefinitely
        ; until it happens to hit a '/' byte or wanders into something that
        ; raises a fault -- reproduced on device as an unrelated-looking
        ; interrupt-level fault deep in Kickstart/unmapped space, minutes
        ; into a hang, tracing back (via a vlink -symfile symbol map) to
        ; PC = patharrayloop1 (score.s:903) every time.
        ;
        ; Playlist mode has no per-song DTP_ExtLoad staging yet (see
        ; uade_find_file's UADE_FILE_COUNT=0 fallback below), so there is
        ; nothing for split_module_name to build a path for either way --
        ; $128=0 is exactly the null-pointer case its own bounds check
        ; expects, and matches how a NO_MUSIC/no-module build already says
        ; "no name to match" elsewhere in this file (see .reallynotfound).
        ifd     UADE_SONG_COUNT
        ; PLAYLIST: the CURRENT song's own name, from its row in
        ; uade_song_table (offset 20). This used to be cleared, which is why a
        ; DTP_ExtLoad format could not be in a playlist at all: with no name to
        ; split there is no path for the player to derive its companion from,
        ; so it asked for nothing and got nothing. a0 still holds the row that
        ; was read a few instructions above.
        move.l  _uade_cur_name,$128.w                   ; this song's name
        else
        move.l  #uade_module_name,$128.w                ; module name ptr
        endc
;*--- PORT: TURN SONG-END DETECTION ON. $12C is the frontend's enable for it:
;     score checks `tst.l $12C.w / beq nosongendcheck` (score.s:741) and
;     IGNORES the player's own end report when it is zero. uadecore writes 1
;     here; this port cleared it, so no song ever ended as far as the demo was
;     concerned -- which is why the auto-advance on song end appeared to be a
;     property of Amiga formats ("most never signal one") rather than of this
;     one store, and why a module whose subsong 0 is EMPTY sat on the silence
;     for ever instead of stepping to the next one.
;     MEASURED on the host: eco.gray subsong 0 is 2337 frames of rms 0.0 and
;     then reports an end; subsong 1 is 264192 frames at rms 3142.
        move.l  #1,$12c.w                               ; song end bit: ON
        clr.l   $180.w
        clr.l   $184.w
        clr.l   $188.w                                  ; not delimon
        clr.l   $18c.w
        clr.l   $190.w
        clr.l   $194.w
        clr.l   $198.w                                  ; EP_ModuleChange on
        clr.l   UADE_INPUT_MSG.w

        ; --- park Paula on silence ----------------------------------------
        ; score's own zero-sample install is gated off (PORT 3c): its
        ; zero_sample now lives in `code`, which is NOT chip RAM, so Paula
        ; could not DMA it. Ours is a chip word.
        lea     $dff000,a2
        lea     _uade_zero_sample,a0
        moveq   #4-1,d7
.zeroloop:
        clr.w   $a8(a2)                 ; audxvol
        move.l  a0,$a0(a2)              ; audxlch
        move.w  #1,$a4(a2)              ; audxlen
        move.w  #150,$a6(a2)            ; audxper
        lea     $10(a2),a2
        dbf     d7,.zeroloop

        ; --- catch a privilege violation -----------------------------------
        ; $20 is normally left to Exec because Supervisor() rides it, but we are
        ; already INSIDE that Supervisor() call, so from here it is free. If it
        ; is not hooked, a privileged instruction executed in user mode lands in
        ; Exec's handler -- which runs with the REAL ExecBase while 4.w points at
        ; score's fake one -- and the machine wanders off. The register dump at
        ; the fault showed exactly that: a6 = real ExecBase, a2 = blitter, a7 a
        ; Kickstart stack. Probe builds only (UADE_PROBE).
        ifd     UADE_PROBE
        move.l  uade_priv_handler(pc),d0
        beq.b   .nopriv
        move.l  _uprough_vbr,a0         ; VBR-relative like every other vector
        move.l  d0,$20(a0)
.nopriv:
        endc

        ; --- run score until it first yields ------------------------------
        ; A bounds-check failure above (module copy would overrun the arena)
        ; already set _uade_dead -- do not enter score on a target we know is
        ; corrupt. What happens to _uade_installed then is NOT "leave it 0":
        ; see .initdead below, which sets it for a playlist so the pump can
        ; switch away from a bad boot song. _music_play1/_music_play2 stay
        ; silent either way -- they bail on _uade_dead, not only on
        ; _uade_installed.
        lea     _uade_dead(pc),a0
        tst.w   (a0)
        bne.b   .initdead

        lea     _uade_installed(pc),a0
        move.w  #1,(a0)

        ; Publish the locator block from HERE, not from the probe rig. Every
        ; uade build has a backend; only the sweep has a probe, so a demo build
        ; published nothing and every debugger read of $340 came back as
        ; whatever the OS left there -- which reads exactly like a dead backend.
        bsr     _uade_publish_info

        bsr     _uade_enter_score
        bra.b   .initdone
.initdead:
        ifd     UADE_SONG_COUNT
        ; A PLAYLIST must survive a bad BOOT song. _music_select_pump early-outs
        ; on _uade_installed, so leaving it 0 here meant song 0 overflowing the
        ; arena killed every later song too -- the same "one bad module bricks
        ; the disk" failure D3 removed from the switch path, relocated to boot.
        ; Installing while _uade_dead is set is safe: _music_play1 and
        ; _music_play2 both bail on _uade_dead and score was never entered, so
        ; nothing is ticked. The pump is then free to switch away, which clears
        ; dead/fatal and enters score through `start` rather than contplayer
        ; (see uade_do_switch step 4). A single-song build keeps the old
        ; behaviour exactly -- there is no other song to switch to.
        lea     _uade_installed(pc),a0
        move.w  #1,(a0)
        endc
        ; Still publish -- _uade_fatal ('MOVF') must be visible to a debugger
        ; even though we never enter score.
        bsr     _uade_publish_info
.initdone:

        ; Open the runtime's music gate. _Interrupt (main_glue.s:163,
        ; hdd_startup.s:559) does `tst.b _cinter_ready / beq .nomusic` and skips
        ; _music_play1/_play2 entirely until it is set -- it exists so Cinter is
        ; not ticked before its workspace is built. Every backend sets it
        ; (cinter_glue.s:59, synth_glue.s:36) and so must this one: without it
        ; the demo runs, the graphics run, and the music never starts because
        ; the coroutine is never resumed. Harmless when dead too --
        ; _uade_installed stays 0, so _music_play1/_music_play2 no-op forever.
        move.b  #1,_cinter_ready
        rte

; ===========================================================================
; The coroutine. score's waittrap jumps to uade_yield (PORT 2) instead of the
; privileged `stop #$2000` it uses upstream, so its play loop becomes a
; coroutine of our VBlank rather than the main loop of the machine.
; ===========================================================================
_uade_enter_score:
;*--- PORT: same flush as the switch path below. The BOOT song's player has
;     just been relocated into the arena too, and on an accelerated machine the
;     instruction cache may still hold whatever occupied those addresses
;     before -- the loader's own code, most likely.
        UPROUGH_CACHE_FLUSH _uade_saved_execbase(pc)
        movem.l d0-d7/a0-a6,-(sp)
        lea     _uade_host_sp(pc),a0
        move.l  sp,(a0)
        move.l  #_uade_score_stack_end,sp
        ifd     UADE_SONG_COUNT
        ; Record that score's ONE-TIME entry has happened. `start` builds the
        ; fake exec/dos/uade jump tables and then falls through to contplayer;
        ; contplayer alone does NOT build them. So a switch may only jump
        ; straight to contplayer once this has run -- see uade_do_switch step 4.
        lea     _uade_score_started(pc),a0
        move.w  #1,(a0)
        endc
        ; NO `pea uade_die` here. There used to be one, commented "if start
        ; ever falls out, die cleanly", and it could never do that: start's
        ; FIRST instruction is `move.l $114,a7` (score.s:180), which resets a7
        ; to _uade_score_stack_end -- ABOVE anything pushed here -- and then
        ; writes its own 'WALL' guard at (a7), so the pushed longword is gone
        ; before score's first push. It is unnecessary as well as dead: every
        ; exit score takes to uade_die is a `jmp` (score.s:441 flashloop, :469
        ; reloc_wait_forever, :788 default_exception), never an rts through a
        ; return address. A no-op that reads as a safety net is worse than no
        ; safety net -- a false comment in this file cost two rounds already.
        jmp     start                   ; score.s

        xdef    uade_yield
uade_yield:
        movem.l d0-d7/a0-a6,-(sp)
        lea     _uade_score_sp(pc),a0
        move.l  sp,(a0)
        move.l  _uade_host_sp(pc),sp
        movem.l (sp)+,d0-d7/a0-a6
        rts

; _uade_resume must refuse to resume a DEAD score. A death mid-switch
; (uade_pool_overflow -> dontplay -> flashloop -> uade_die, reachable from
; score.s:1145-1151/753-777) restores the host sp and returns here through
; whatever called into contplayer; without this check a caller that still
; thinks the coroutine is alive would swap onto _uade_score_sp and rts into
; memory contplayer has already started overwriting for the failed attempt --
; a silent freeze standing in for what should have been a loud death. Save
; first, THEN check, so a dead-bail still balances the stack it just pushed.
_uade_resume:
        movem.l d0-d7/a0-a6,-(sp)
        lea     _uade_dead(pc),a0
        tst.w   (a0)
        bne.b   .dead
        lea     _uade_host_sp(pc),a0
        move.l  sp,(a0)
        move.l  _uade_score_sp(pc),sp
        movem.l (sp)+,d0-d7/a0-a6
        rts                             ; back into waittrap's caller
.dead:
        movem.l (sp)+,d0-d7/a0-a6
        rts

; uade_answer_get_info -- answer score's AMIGAMSG_GET_INFO, as uadecore's
; get_info_for_ep() does (uade-3.05/src/uade.c). Window: +4 query string,
; +8 reply buffer, +12 buffer size in / reply length out (-1 = unknown or too
; long). The only query is 'eagleoptions': the current song's epopt= values from
; eagleplayer.conf, staged as uade_epopt_N (dc.w size, NUL-separated strings).
; Without it PTK-Prowiz never gets type:pt30, its Chk fails, score answers
; CHECKERROR and every ProTracker module boots to PLAY in silence.
; Called from uade_msg_trap with all registers already saved.
uade_answer_get_info:
        movea.l UADE_MSG+4,a0
        lea     .q(pc),a1
.cmp:   move.b  (a1)+,d0
        cmp.b   (a0)+,d0
        bne.b   .unknown
        tst.b   d0
        bne.b   .cmp
        moveq   #0,d1
        ifd     UADE_SONG_COUNT
        move.w  _uade_cur_song(pc),d1
        endif
        lsl.l   #2,d1
        lea     uade_epopt_table,a0
        movea.l (a0,d1.l),a0
        moveq   #0,d0
        move.w  (a0)+,d0
        cmp.l   UADE_MSG+12,d0
        bgt.b   .unknown
        move.l  d0,UADE_MSG+12
        movea.l UADE_MSG+8,a1
        bra.b   .cpend
.cp:    move.b  (a0)+,(a1)+
.cpend: dbf     d0,.cp
        rts
.unknown:
        move.l  #-1,UADE_MSG+12
        rts
.q:     dc.b    'eagleoptions',0
        even

; uade_die -- score has crashed, been rejected, or failed to relocate. Upstream
; spins forever (flashloop / reloc_wait_forever / default_exception); here the
; demo is still running and must get its machine back.
        xdef    uade_die
uade_die:
        bsr     _uade_audio_off
        ifd     UADE_SONG_COUNT
        ; A death INSIDE the incoming player's init is reached through the
        ; `pea uade_die` step 4 pushes, so it inherits step 1b's INTENA mask
        ; and never reaches contplayer's init_interrupts. No-op when no switch
        ; is in flight. (What the mask actually costs is in the comment beside
        ; step 1b -- NOT the keyboard: the quit is a polled mouse-button test.)
        bsr     uade_switch_intena_restore
        endc
        lea     _uade_dead(pc),a0
        move.w  #1,(a0)
        move.l  _uade_host_sp(pc),sp
        movem.l (sp)+,d0-d7/a0-a6
        rts

;*--- PORT: a TRUE zero, not just DMA off and AUDxVOL=0.
;     With DMA off a channel does not go quiet: Paula keeps converting the LAST
;     sample byte it latched at the LAST volume it latched, and both latches
;     only reload at a period boundary an idle channel never reaches. Writing
;     AUDxVOL=0 changes the register and not the sound. That is the buzz the
;     sanctuary intro left on the machine when it quit, and amiga/paula_silence.i
;     is the one definition of the way out (a CPU-driven zero word through a
;     124-tick period, with the AUDx INTREQ bits cleared so the DAT writes are
;     accepted).
;     It matters HERE because a musicdisk switches songs all day: the owner
;     heard songs 90 and 94 as "noise like sanctuary bbs intro on exit" --
;     both are songs whose player left Paula loaded and then stopped.
;     Registers saved: the old version clobbered nothing, and callers were
;     written against that.
; _uade_cache_clear -- what score's fake exec now calls for CacheClearU.
; A player that relocates its own code asks for this; before, it got an `rts`
; (score.s:414's harmlesslist) and kept executing whatever the instruction
; cache still held for those addresses. See amiga/cache_flush.i.
        xdef    _uade_cache_clear
_uade_cache_clear:
        UPROUGH_CACHE_FLUSH _uade_saved_execbase(pc)
        rts

_uade_audio_off:
        movem.l d0-d1/a0-a1,-(sp)
        PAULA_SILENCE
        movem.l (sp)+,d0-d1/a0-a1
        rts

; ===========================================================================
; Per-frame entry points, called back to back from _Interrupt (main_glue.s:227
; / hdd_startup.s:683) once per hardware VBlank, already in supervisor.
; ===========================================================================

; _music_play1 -- the VBI work score would have done from its own $6c handler.
; Must be exactly 50 Hz: framecount and any VERTB interrupt server a player
; installed through AddIntServer depend on it.
; NOTE: `tst.w <ea>(pc)` is 68020+; on a 68000 the guard has to go through an
; address register. RULE 7 makes the A500 the primary target, so everything
; here assembles for -m68000.
_music_play1:
        move.l  a0,-(sp)
        ifd     UADE_SONG_COUNT
;*--- PORT: SAMPLE THE SKIP BUTTON HERE, at the VBL, not in the pump.
;     It was sampled in _music_select_pump, which sits at the top of the demo's
;     main SPIN loop -- a loop whose rate is whatever the frame happens to be
;     doing, and which stops entirely for the length of a switch. A press
;     shorter than a stall was never seen at all, which is exactly the "works
;     sometimes" the owner reported. A button wants a STEADY sample rate, and
;     50 Hz is the one this machine guarantees.
;
;     Deliberately BEFORE the _uade_installed / _uade_dead early-outs: the
;     viewer must be able to skip AWAY from a song that failed to start, which
;     is the moment they are most likely to press. Only the LATCH is written
;     here; the switch itself still happens in the pump, outside the interrupt.
        bsr     uade_poll_skip
;*--- PORT: DRIVE THE UI FROM HERE WHILE A SWITCH IS BLOCKING THE MAIN LOOP.
;     The incoming player's init runs to completion inside the pump -- score
;     yields only at waittrap, which an init never reaches -- so a slow player
;     freezes the selector while its own music plays perfectly. MEASURED
;     2026-09-23: PreTracker (song 67) starts output in under a second and
;     keeps initialising for 102 more, with the demo's main loop stopped the
;     whole time (_uade_pump_seen flat, _uade_switch_step 8).
;     Half a second of grace first, so an ordinary switch -- which is over in
;     a frame or two -- never pays for this, and the callback runs only while
;     _uade_switching is set, i.e. never concurrently with the main loop's own
;     call into the same code: the main loop is parked in the pump.
        lea     _uade_switching(pc),a0
        tst.w   (a0)
        bne.b   .uade_ui_counting
        lea     _uade_switch_frames(pc),a0
        clr.w   (a0)
        bra.b   .uade_ui_done
.uade_ui_counting:
        lea     _uade_switch_frames(pc),a0
        addq.w  #1,(a0)
        cmpi.w  #25,(a0)
        blo.b   .uade_ui_done
        move.l  _uade_ui_tick(pc),d0
        beq.b   .uade_ui_done
        movem.l d0-d1/a0-a1,-(sp)
        move.l  d0,a0
        jsr     (a0)
        movem.l (sp)+,d0-d1/a0-a1
.uade_ui_done:
        endc
        lea     _uade_installed(pc),a0
        tst.w   (a0)
        beq.b   .out
        lea     _uade_dead(pc),a0
        tst.w   (a0)
        bne.b   .out
        ifd     UADE_SONG_COUNT
        ; _uade_quiesced, NOT _uade_switching. The two guard different things
        ; and are held for different lengths of time:
        ;
        ;   _uade_quiesced  covers the TEARDOWN and the arena rewrite only
        ;                   (uade_do_switch steps 1..3). While it is set,
        ;                   mylevel3_body must not run: it dispatches score's
        ;                   VERTB server list, which is the OUTGOING player's
        ;                   code, and the arena under it is being replaced.
        ;                   VERTB is deliberately never masked by the switch's
        ;                   INTENA quiesce, since the demo owns it, so this
        ;                   flag is the only thing holding it off.
        ;
        ;   _uade_switching covers the WHOLE switch, incoming contplayer init
        ;                   included, and gates the COROUTINE RESUME in
        ;                   _music_play2 (see there).
        ;
        ; Gating this on _uade_switching as well -- which is what fix round 1
        ; did -- starved the INCOMING player of vblank ticks for its entire
        ; init: uade_do_switch ends in `jmp contplayer` and only "returns" when
        ; score first yields, and because the demo owns $6c, mylevel3_body is
        ; the ONLY path score's VERTB servers ever run through. A player whose
        ; init waits on a frame counter then hung the main loop instead of the
        ; interrupt -- the same silence, moved rather than removed.
        lea     _uade_quiesced(pc),a0
        tst.w   (a0)
        bne.b   .out
        endc
        move.l  (sp)+,a0
        movem.l d0-d7/a0-a6,-(sp)
        ; Count this too. A player driven by score's VBlank SERVER LIST never
        ; touches CIA-A or CIA-B, so counting only those reports 0 for it --
        ; MusiclineEditor plays perfectly and shows zero CIA ticks, which a
        ; tempo check would read as "not keeping up".
        lea     _uade_vbl_seen(pc),a0
        addq.l  #1,(a0)
        bsr     mylevel3_body           ; score.s, PORT 5b
        movem.l (sp)+,d0-d7/a0-a6
        rts
.out:
        move.l  (sp)+,a0
        rts

; _music_play2 -- one coroutine step of score's play loop. Deliberately a thin
; wrapper, called from the VBL interrupt: it may NEVER do more than resume the
; coroutine one step. A musicdisk switch does relocation, a module copy and
; the incoming player's own init -- work that can wait on a CIA tick or an
; audio interrupt our own quiesce mask holds off, or simply run long -- so it
; must NEVER happen in here (CLAUDE.md/the spec: "the switch never runs
; inside the VBL interrupt"). That work lives in _music_select_pump below,
; called from the demo's MAIN LOOP (amiga_main.c), not from _Interrupt. (It
; runs on every iteration of that loop, not once per frame -- the first one
; with a pending request does the switch and the rest early-out. What matters
; is the call site's priority, not its rate.) This function gates on _uade_switching -- held across the WHOLE
; switch, teardown and incoming init alike -- so a VBlank landing mid-switch
; does not resume a coroutine the pump is still tearing down and rebuilding
; underneath it: _uade_score_sp still points at the OUTGOING coroutine's stack
; until contplayer first yields. _music_play1 deliberately uses the NARROWER
; _uade_quiesced instead, so score's VERTB servers keep running for the
; incoming player's init (see there).
_music_play2:
        move.l  a0,-(sp)
        lea     _uade_installed(pc),a0
        tst.w   (a0)
        beq.b   .out
        lea     _uade_dead(pc),a0
        tst.w   (a0)
        bne.b   .out
        ifd     UADE_SONG_COUNT
        lea     _uade_switching(pc),a0
        tst.w   (a0)
        bne.b   .out
        endc
        move.l  (sp)+,a0
        bra     _uade_resume
.out:
        move.l  (sp)+,a0
        rts

; ===========================================================================
; _music_select -- ask for song d0 (a musicdisk playlist only). Records the
; request and returns; the switch itself happens in _music_select_pump below,
; called from the main loop -- NEVER from _music_play2 / the VBL interrupt
; _music_play1 runs in (see the port comment on _music_play2).
;
; Single-song builds (no UADE_SONG_COUNT: 40 formats build this way today)
; keep the ABI symbol but it is a no-op -- there is only ever one song, and
; there is no uade_song_table to index.
; ===========================================================================
        ifd     UADE_SONG_COUNT
_music_select:
        cmpi.w  #UADE_SONG_COUNT,d0
        bhs.b   .ignore                 ; unsigned: also rejects negative
        lea     _uade_pending_song(pc),a0
        move.w  d0,(a0)
.ignore:
        rts
        else
_music_select:
        rts
        endc

; _music_select_pump -- called from the demo's MAIN LOOP (amiga_main.c's two
; main loops, NOT the VBL interrupt). It sits at the top of each spin loop, so
; it runs on every iteration rather than once per frame; that is harmless (it
; early-outs with nothing pending) and the point of the call site is its
; PRIORITY, not its rate. This is the ONLY
; place a pending switch is performed: relocation, the module copy and the
; incoming player's own init run here, at a normal interrupt level, where a
; CIA tick or an audio interrupt can still be serviced by whoever else needs
; it and a slow init cannot deadlock the ISR.
;
; _uade_switching brackets the call so a VBlank that preempts this (VERTB is
; deliberately never masked -- see UADE_SWITCH_INT_MASK) cannot resume the
; coroutine via _music_play2 while the switch is mid-teardown/rebuild.
;
; Every other backend and the NO_MUSIC build provide an rts stub for this
; symbol too (amiga_main.c calls it unconditionally, the way it does
; music_play1/music_play2), so a non-uade demo still links.
        ifd     UADE_SONG_COUNT
_music_select_pump:
        move.l  a0,-(sp)
;*--- PORT: MAIN-LOOP liveness counter. _uade_vbl_seen counts INTERRUPTS, so
;     it keeps advancing perfectly while the main loop is wedged -- a sweep
;     across 39 players reported every one of them "alive" on that signal
;     while the demo was in fact dead. This counter only advances if the
;     demo's main loop is still reaching the pump, which is the thing a
;     debugger actually needs to know. Bumped BEFORE any early-out so it
;     still ticks when the backend is idle or dead.
        lea     _uade_pump_seen(pc),a0
        addq.l  #1,(a0)
        lea     _uade_installed(pc),a0
        tst.w   (a0)
        beq.b   .out
        ; DELIBERATELY NOT gated on _uade_dead. Nothing anywhere clears that
        ; flag -- every write to it sets 1 -- so an early-out here turned ONE
        ; bad module into a dead musicdisk: the pump stopped accepting work,
        ; no further switch was ever attempted, and the demo ran silent for
        ; the rest of its life with no way back. A dead song must cost that
        ; SONG, not the disk. uade_do_switch tears the old player down (and
        ; skips score's own stop hooks when the score is dead -- see there)
        ; and clears dead/fatal before entering the new one, so a switch is
        ; exactly the recovery path. _music_play1/_music_play2 keep their
        ; _uade_dead guards: those must NOT run a dead coroutine, and they
        ; have no way to recover it.
        move.l  (sp)+,a0
;*--- PORT: SKIP BY RIGHT MOUSE BUTTON.
;     The viewer needs a way to move between songs, and the keyboard is not it
;     yet: the planned CIA-A poll reads the ICR to test the serial bit, and
;     READING A CIA'S ICR CLEARS IT -- the same property the switch teardown
;     depends on. That read would consume the timer A/B flags score's own
;     ciaa_interrupt dispatches on (score.s:3302-3322), so every player whose
;     dtg_Timer runs off CIA-A -- 44 of the 210 in the corpus retempo this way
;     -- would silently lose its tempo interrupt. Nothing crashes; the music
;     just plays at the wrong speed, and it reads as a player bug rather than
;     as our poll. That needs solving properly, not shipping.
;
;     POTGOR touches no CIA and no ICR, so it cannot take anything away from
;     score. Bit 10 is the right mouse button, 0 while held.
;     The LEFT button is NOT available: it is the quit (minimal_startup.s:140,
;     and the LMB exit the startups document).
;
;     Edge-triggered: a switch fires once per press, not once per frame the
;     button is down, and a press only LATCHES -- uade_do_switch below is what
;     performs it, still outside the interrupt.
        move.w  _uade_pending_song(pc),d0
        bmi.b   .none                    ; -1 = nothing pending
        lea     _uade_switching(pc),a0
        move.w  #1,(a0)
        bsr     uade_do_switch
        lea     _uade_switching(pc),a0
        clr.w   (a0)
.none:
        rts
.out:
        move.l  (sp)+,a0
        rts
        else
_music_select_pump:
        rts
        endc

        ifd     UADE_SONG_COUNT

; uade_poll_skip -- one 50 Hz sample of the right mouse button, edge-triggered,
; latching the next song. Called from _music_play1 (the VBL), never from the
; spin loop.
uade_poll_skip:
        movem.l d0/a0,-(sp)
        ifd     UADE_AUTO_ADVANCE_TICKS
;*--- PORT: TIMED AUTO-ADVANCE, for a disk that must be listenable with no
;     input at all. Measured 2026-09-21: an owner's Amiberry delivered NOTHING
;     to the emulated ports -- not the mouse buttons, not keys mapped to a
;     joystick, not even mouse MOVEMENT (JOY0DAT never changed across 15 s of
;     sampling) -- while the demo itself was provably healthy (main loop
;     ticking, AHX playing, fatal 0). A musicdisk that can only be heard by
;     pressing something is unusable on such a host, and auto-advance on song
;     END does not help either: most Amiga formats never signal one.
;     Counts VBLs here because this runs at exactly 50 Hz.
        lea     _uade_adv_ticks(pc),a0
        addq.l  #1,(a0)
        move.l  (a0),d0
        cmpi.l  #UADE_AUTO_ADVANCE_TICKS,d0
        blo.b   .no_auto
        clr.l   (a0)
        lea     _uade_pending_song(pc),a0
        tst.w   (a0)
        bpl.b   .no_auto                ; a request is already queued
        move.w  _uade_cur_song(pc),d0
        addq.w  #1,d0
        cmpi.w  #UADE_SONG_COUNT,d0
        blo.b   .auto_set
        moveq   #0,d0
.auto_set:
        move.w  d0,(a0)
.no_auto:
        endc
;*--- PORT: TWO inputs, either one skips.
;     POTGOR bit 10 (right mouse button) proved unreliable in practice -- not
;     because of anything here: the poll was measured running at exactly 50 Hz
;     (152 ticks in 3 s), POTGOR reads 0x5500 with bit 10 correct, and writing
;     a pending index by hand switched songs in under a second. The host simply
;     does not deliver a right-click to the emulated port, which no amount of
;     code on this side can fix.
;     So also accept the JOYSTICK FIRE button on port 1: CIA-A PRA bit 7, 0
;     while held. That is a PORT read ($bfe001), NOT the ICR -- it consumes no
;     interrupt flags, so unlike the planned keyboard poll it cannot steal the
;     timer interrupts score dispatches on. Bit 6 of the same register is the
;     LEFT button and stays the quit; bit 7 is a different pin.
;*--- PORT: decode UP and DOWN separately, then hand all three inputs to
;     whichever consumer this disk has. JOY1DAT's vertical pair is the
;     standard Amiga decode (HRM): forward = bit1 XOR bit0, back = bit9 XOR
;     bit8. The horizontal bits are read too, so that a left/right push on a
;     selector screen does not read as a cursor move.
        bsr     uade_poll_events
        ; NOT tst.w <label>(pc): that addressing mode is 68020+, and this
        ; file builds for a 68000 (see _uade_rmb_held's own note below).
        lea     _uade_selector(pc),a0
        tst.w   (a0)
        bne     .done                   ; a selector owns the inputs
        btst    #7,$bfe001              ; joystick port 1 fire, 0 = held
        beq.b   .pressed
        btst    #2,$dff016              ; POTGOR high byte: bit 10 = RMB
        beq.b   .pressed
        ; THIRD input: joystick DIRECTIONS on port 1 (JOY1DAT, $dff00c), which
        ; an emulator's keyboard-as-joystick maps to the arrow keys. A
        ; different register from the other two -- POTGOR needs the host to
        ; deliver a right-click (measured: it does not) and PRA bit 7 needs a
        ; fire button -- so this is the one a keyboard-only machine can
        ; actually reach. Idle reads as $0000; any direction held is non-zero.
        ; Chipset read, no CIA, so it consumes no interrupt flags.
        move.w  $dff00c,d0
        andi.w  #$0303,d0               ; the four direction bits
        bne.b   .pressed
        bra.b   .up
.pressed:
        lea     _uade_rmb_held(pc),a0
        tst.w   (a0)                    ; NOT tst.w <label>(pc): that form is
        bne.b   .done                   ; 68020+, and this builds for a 68000
        move.w  #1,(a0)
        lea     _uade_pending_song(pc),a0
        tst.w   (a0)
        bpl.b   .done                   ; a request is already queued
        move.w  _uade_cur_song(pc),d0
        addq.w  #1,d0
        cmpi.w  #UADE_SONG_COUNT,d0
        blo.b   .set
        moveq   #0,d0
.set:
        move.w  d0,(a0)
        bra.b   .done
.up:
        lea     _uade_rmb_held(pc),a0
        clr.w   (a0)
.done:
        movem.l (sp)+,d0/a0
        rts

; uade_poll_events -- one 50 Hz sample of fire, up and down, edge-triggered
; into the three counters. Runs for EVERY playlist build, selector or not:
; sampling costs three chipset reads and a CIA PORT read, and a disk that
; gains a selector later must not need the poll changed again.
;
; NO CIA ICR IS READ. $bfe001 is CIA-A's PORT A; reading a CIA's INTERRUPT
; CONTROL register is what would clear the timer flags score dispatches on.
uade_poll_events:
        movem.l d0-d2/a0-a1,-(sp)
        ; FIRE = joystick port 1 fire (0 = held) or the right mouse button.
        moveq   #0,d0
        btst    #7,$bfe001
        beq.b   .fire_held
        btst    #2,$dff016
        bne.b   .fire_done
.fire_held:
        moveq   #1,d0
.fire_done:
        lea     _uade_ev_fire(pc),a0
        lea     uade_held_fire(pc),a1
        bsr     uade_edge
        ; UP / DOWN from JOY1DAT. Each axis is a quadrature pair, so the
        ; direction is the XOR of its two bits, not the high bit alone.
        ;
        ; WHICH XOR IS WHICH WAS MEASURED, NOT READ. The Hardware Reference
        ; Manual's table calls bit1^bit0 FORWARD and bit9^bit8 BACKWARD, and
        ; that is how this was written first -- the owner pushed up and the
        ; cursor went down (2026-09-23, real Amiberry, cursor keys on port 1).
        ; Their hands are the oracle; the pairs are the other way round here.
        move.w  $dff00c,d1
        moveq   #0,d0
        move.w  d1,d2
        lsr.w   #1,d2
        eor.w   d2,d1                   ; bit0 and bit8 = the two axis XORs
        btst    #8,d1
        beq.b   .up_done
        moveq   #1,d0
.up_done:
        lea     _uade_ev_up(pc),a0
        lea     uade_held_up(pc),a1
        bsr     uade_edge
        moveq   #0,d0
        btst    #0,d1
        beq.b   .dn_done
        moveq   #1,d0
.dn_done:
        lea     _uade_ev_down(pc),a0
        lea     uade_held_down(pc),a1
        bsr     uade_edge
        movem.l (sp)+,d0-d2/a0-a1
        rts

; uade_edge -- d0 = pressed now (0/1), a0 = counter, a1 = held latch.
; Bumps the counter on a 0->1 transition only. Clobbers d0 and nothing else.
uade_edge:
        tst.w   d0
        bne.b   .now_down
        clr.w   (a1)
        rts
.now_down:
        tst.w   (a1)
        bne.b   .still
        move.w  #1,(a1)
        addq.w  #1,(a0)
.still:
        rts

uade_held_fire: dc.w    0
uade_held_up:   dc.w    0
uade_held_down: dc.w    0

;*--- PORT: the selector's three entry points, all C-callable (arguments on
;     the stack), all inside UADE_SONG_COUNT because they index the staged
;     song table. `_music_select` above takes its argument in d0 because it is
;     the backend-internal API every music glue shares; C cannot call that.
        xdef    _uade_select_song       ; void(long index)
        xdef    _uade_song_title        ; const char *(long index)
        xdef    _uade_song_composer     ; const char *(long index)
        xdef    _uade_take_events       ; long(void) -- packed, read-and-clear

_uade_select_song:
        move.l  4(a7),d0
        bsr     _music_select           ; bounds-checks and latches
        rts

_uade_song_title:
        move.l  4(a7),d0
        cmpi.l  #UADE_SONG_COUNT,d0
        bhs.b   .none                   ; unsigned: also rejects negative
        move.l  a0,-(sp)
        bsr     uade_song_entry
        move.l  12(a0),d0
        move.l  (sp)+,a0
        rts
.none:  moveq   #0,d0
        rts

_uade_song_composer:
        move.l  4(a7),d0
        cmpi.l  #UADE_SONG_COUNT,d0
        bhs.b   .none
        move.l  a0,-(sp)
        bsr     uade_song_entry
        move.l  16(a0),d0
        move.l  (sp)+,a0
        rts
.none:  moveq   #0,d0
        rts

; long uade_take_events(void)
;   Reads and CLEARS the three counters in one go, and marks this disk as
;   having a selector so uade_poll_skip stops skipping songs by itself.
;   Packed one byte each -- up in bits 0-7, down in 8-15, fire in 16-23 --
;   because the caller is one C function and three separate calls would cost
;   three subroutine calls per frame to answer one question.
;
;   SUBTRACTS WHAT IT READ instead of clearing, and NEVER TOUCHES SR.
;   The demo's main loop -- which is what calls this -- runs in USER MODE
;   (amiga/hdd_startup.s:507 says so in as many words), so `move.w sr,-(sp)`
;   and `ori.w #$0700,sr` are PRIVILEGE VIOLATIONS on the 68020 this targets.
;   Measured 2026-09-23: the first version did exactly that, the demo faulted
;   through vector 8 into low memory and died executing rubbish at PC $132
;   with an illegal instruction, while the SAME build with this function's
;   caller stubbed out ran perfectly.
;
;   Disabling interrupts was never needed anyway. The poll only ever ADDS to
;   these counters and this only ever subtracts what it just read, so an
;   increment that lands between the read and the subtract survives to the
;   next call instead of being lost -- which a `clr.w` would have dropped.
;   `sub.w Dn,<ea>` is a single instruction and the 68k takes interrupts only
;   BETWEEN instructions, so the read-modify-write cannot be split.
_uade_take_events:
        move.w  #1,_uade_selector
        moveq   #0,d0
        lea     _uade_ev_fire(pc),a0
        bsr     uade_take_one
        lsl.l   #8,d0
        or.l    d1,d0
        lea     _uade_ev_down(pc),a0
        bsr     uade_take_one
        lsl.l   #8,d0
        or.l    d1,d0
        lea     _uade_ev_up(pc),a0
        bsr     uade_take_one
        lsl.l   #8,d0
        or.l    d1,d0
        rts

; uade_take_one -- a0 = counter. Returns d1 = presses since the last call,
; capped at 255 so the byte packing above cannot overflow into its neighbour.
; Clobbers d1 only.
uade_take_one:
        move.w  (a0),d1
        beq.b   .none
        sub.w   d1,(a0)                 ; consume exactly what was read
        cmpi.w  #255,d1
        blo.b   .none
        move.w  #255,d1
.none:
        andi.l  #$ff,d1
        rts

; d0 = song index -> a0 = its row in uade_song_table (5 longwords,
; UADE_SONG_ENTRY_BYTES bytes -- already equated by the generated
; uade_sizes.i, included above): module address, module length, player
; image, title pointer, composer pointer -- the order stage_songs() writes
; them in.
uade_song_entry:
        andi.l  #$ffff,d0
        mulu    #UADE_SONG_ENTRY_BYTES,d0
        lea     uade_song_table,a0
        adda.l  d0,a0
        rts

; uade_zero_longs -- a0 = table base, d1 = longword count (1..127). Clobbers
; a0 and d1 only: d0 carries the target song index across the whole of
; uade_do_switch and must survive every call.
uade_zero_longs:
        clr.l   (a0)+
        subq.w  #1,d1
        bne.b   uade_zero_longs
        rts

; uade_switch_intena_restore -- put back the INTENA bits step 1b masked, once.
; Called from all three exits of a switch: the success path (step 3c), the
; module-overflow bail, and uade_die. Only the switch path ever masks them, so
; this lives inside UADE_SONG_COUNT and a single-song build is untouched.
; Clearing the saved word after the write is what makes it ONCE: a later
; uade_die must not re-enable bits recorded at a switch that finished long
; ago and that some other code has since turned off on purpose.
uade_switch_intena_restore:
        move.w  _uade_switch_intena(pc),d0
        beq.b   .none
        ori.w   #$8000,d0               ; SET
        move.w  d0,$dff09a
        lea     _uade_switch_intena(pc),a0
        clr.w   (a0)
.none:
        rts

; score's own teardown hooks, reached the same way the init path reaches its
; call_* helpers. Both are no-ops if the player never installed anything.
uade_call_stop_int:
        movem.l d0-d7/a0-a6,-(sp)
        bsr     call_stop_int           ; score.s:966
        movem.l (sp)+,d0-d7/a0-a6
        rts

uade_call_end_sound:
        movem.l d0-d7/a0-a6,-(sp)
        bsr     call_end_sound          ; score.s:1900
        movem.l (sp)+,d0-d7/a0-a6
        rts

; --- what score itself can ever set in INTENA across a session -------------
; Bit numbers, not the blanket $7fff the probe used to PROVE the mechanism
; (a stale-vector interrupt race at contplayer re-entry -- see
; .superpowers/sdd/2026-09-21-uade-musicdisk-engine/probe-2-report.md). That
; blanket clear also disables the DEMO's own VERTB (bit 5, $6c) mid-switch,
; which is what drives the whole demo and calls _music_play1/_music_play2 in
; the first place. This mask covers exactly what score.s installs and
; nothing else, verified against score.s directly:
;   bit 3  ($0008) PORTS  -- CIA-A, add_ciaa_interrupt (score.s:3224-3257)
;   bit 7  ($0080) AUD0   -- audio ch 0, exec_set_int_vector (score.s:3745,
;   bit 8  ($0100) AUD1   -- audio ch 1     valid range checked d0 in [7,10])
;   bit 9  ($0200) AUD2   -- audio ch 2
;   bit 10 ($0400) AUD3   -- audio ch 3
;   bit 13 ($2000) EXTER  -- CIA-B, add_ciab_interrupt (score.s:3212-3220)
; VERTB (bit 5, $0020) is deliberately EXCLUDED -- init_interrupts (score.s:
; 3700-3715) sets it unconditionally on every contplayer re-entry, but the
; demo owns $6c and this bit (uade_glue.s:18), so masking it here would stop
; the demo's own VBI for the duration of every switch.
UADE_SWITCH_INT_MASK    equ     $2788           ; PORTS|AUD0-3|EXTER, no VERTB

; uade_do_switch -- d0 = target song. Runs at demo tick, not in the ISR.
SWITCH_STEP     macro
        move.l  #\1,_uade_switch_step
        endm

uade_do_switch:
        movem.l d0-d7/a0-a6,-(sp)
        SWITCH_STEP 1
        ; Hold mylevel3_body off for the teardown and the arena rewrite only.
        ; Cleared again immediately before `jmp contplayer` below, and on every
        ; bail path, so the INCOMING player's init runs with vblanks flowing --
        ; see the comment in _music_play1.
        lea     _uade_quiesced(pc),a0
        move.w  #1,(a0)
        lea     _uade_pending_song(pc),a0
        move.w  #-1,(a0)                ; consume the request
        lea     _uade_cur_song(pc),a0
        move.w  d0,(a0)
;*--- PORT: publish the incoming song's TITLE and FORMAT for the demo to draw.
;     uade_song_table already carries both pointers per row (stage_songs writes
;     module/length/player/title/composer), so this is a lookup, not new data.
;     Published HERE rather than after contplayer returns because the switch
;     can stall for the length of a player's init -- the viewer should see the
;     name of the song that is arriving, not keep reading the one that left.
;     The composer slot carries the PLAYER name for this disk (stage_songs
;     takes it from the project), which is what "format" means to a listener.
        movem.l d0/a0,-(sp)
        bsr     uade_song_entry         ; d0 = index -> a0 = row
        move.l  12(a0),d0
        lea     _uade_cur_title(pc),a1
        move.l  d0,(a1)
        move.l  16(a0),d0
        lea     _uade_cur_composer(pc),a1
        move.l  d0,(a1)
        movem.l (sp)+,d0/a0

        ; 1. stop the outgoing player. All four steps: score's own stop hooks,
        ;    then the volumes, then the DMA bits. Leaving any out leaves a
        ;    channel that resumes when DMA is next enabled.
        ;
        ;    The two score-side hooks are SKIPPED when the outgoing score is
        ;    dead. They run the PLAYER's own DTP_StopInt/DTP_EndSound, and a
        ;    dead score is one that faulted, overflowed its pool or was
        ;    rejected -- calling back into it is how a recoverable death
        ;    becomes a second, unrecoverable one. The hardware teardown below
        ;    does not need the player's cooperation and always runs.
        lea     _uade_dead(pc),a0
        tst.w   (a0)
        bne.b   .skip_stop_hooks
        bsr     uade_call_stop_int
        bsr     uade_call_end_sound
.skip_stop_hooks:
        bsr     _uade_audio_off

        SWITCH_STEP 1
        ; 1a. STOP THE SOURCE, not just delivery. Fix round 1's quiesce below
        ; (INTENA mask + ICR read + INTREQ ack) silences DELIVERY, but the
        ; outgoing player's CIA timers keep counting in HARDWARE regardless
        ; of INTENA, and score's dispatch tables are untouched by any of it:
        ;   - add_cia_interrupt (score.s:3232-3260) writes only the ONE slot
        ;     (timer A or B) it is asked for and never clears the other.
        ;   - call_stop_int's rem_cia*_interrupt teardown only runs for a
        ;     player that installed through score's intfunc path; one that
        ;     went through the raw ciaa/ciab resource jump table (score.s
        ;     :3162) is torn down by NOTHING here.
        ;   - ciaa_interrupt/ciab_interrupt dispatch through ciaaints/
        ;     ciabints with (pre-fix-round-2) no null/bounds check at all.
        ; So a slot left by the OUTGOING player keeps pointing into the
        ; relocated-player region of the arena this very switch is about to
        ; overwrite, its physical timer keeps ticking, and the NEXT song's
        ; own add_cia_interrupt re-enables EXTER/PORTS in INTENA for ITS OWN
        ; timer -- which lets the zombie timer's next underflow through too.
        ;
        ; Symptom this was written against (fix round 2), AHX <-> Jochen
        ; Hippel: SR=$2600 (supervisor, inside the level-6/CIA-B handler),
        ; fault PC = ciabints[0]+2 exactly, uade_ciab_icr's masked low word
        ; = 1 (timer A), ciabints slot 0 a pointer inside
        ; [_uade_arena,_uade_mod_base), slot 1 and both CIA-A slots zero.
        ; _uade_fatal/_uade_dead stayed 0 throughout (a raw CPU exception,
        ; never reaches uade_die).
        ;
        ; STOP/ACK ROUND 2: this exact fix (stop both CIA timers, clear both
        ; ICR masks, zero all four dispatch slots, keep the delivery-side
        ; quiesce below) was implemented and RE-TESTED on device. The
        ; IDENTICAL crash signature above still reproduces afterward --
        ; same fault PC, same SR, same ICR bits, same code-pointer value --
        ; so "the outgoing player's own slot was never cleared" is NOT the
        ; whole story; something re-populates or re-derives the same
        ; pointer value after this teardown runs. Also newly observed: the
        ; crash this time landed on the FIRST switch after boot, not
        ; reliably the second as first reported, and the bytes at the fault
        ; address are a periodic 16-byte pattern (not obviously code) that
        ; sits inside AHX's OWN relocated-player footprint (offset ~0x1486
        ; of its own ~12 KB, not in another song's leftover slack). See
        ; .superpowers/sdd/2026-09-21-uade-musicdisk-engine/
        ; task-4-report-fix2.md for the full evidence chain. The teardown
        ; below is kept as a correct, defensible hardening (stopping a
        ; timer and null-guarding a table read are good practice regardless)
        ; but it is NOT proven to be the fix for this crash -- do not treat
        ; the comment above as settled until a later round confirms it.
        ;
        ; Stop BOTH CIAs' BOTH timers and clear BOTH ICR masks
        ; unconditionally -- never depending on the outgoing player having
        ; cooperated -- before anything below touches the arena. None of
        ; this needs supervisor: CIA registers are not privileged, so it
        ; works from this user-mode pump same as everything else here.
        lea     $bfe001,a4              ; CIA-A base (score.s's own addressing)
        clr.b   $e00(a4)                ; CRA: clear START -- stop timer A
        clr.b   $f00(a4)                ; CRB: clear START -- stop timer B
        move.b  #$7f,$d00(a4)           ; ICR mask: clear every bit (bit7=0
                                         ; is CLEAR mode -- the inverse of
                                         ; score's $81/$82 arming writes)
        lea     $bfd000,a4              ; CIA-B base
        clr.b   $e00(a4)
        clr.b   $f00(a4)
        move.b  #$7f,$d00(a4)

        ; Zero the dispatch tables too, as defence in depth -- NOT a
        ; substitute for stopping the timers above. score.s's
        ; ciaa_interrupt/ciab_interrupt now carry a PORT-marked,
        ; UADE_NATIVE-gated null guard on every jsr (both handlers, both
        ; timer slots), so a zeroed slot is skipped instead of repeating the
        ; ORIGINAL N=33 stale-vector fault (jsr (a0) with a0=0, PC=$4) --
        ; zeroing alone, with no guard, would have just traded one wild
        ; jump for another. Reachable by plain name: uade_glue.s INCLUDES
        ; score.s, so no xdef edit is needed.
        ; EVERY dispatch table score keeps, not just the CIA pair. The class
        ; is "score state that survives a contplayer re-entry while holding a
        ; pointer into the image the switch is about to replace", and the CIA
        ; tables were only the door the pilot pair happened to use -- AHX and
        ; JochenHippel are BOTH CIA-driven, so 52 clean switches proved nothing
        ; about the other three:
        ;
        ;   lev3serverlist  (score.s:4094, dcb.l 32 = 16 x {code,data})
        ;       exec_add_int_server (score.s:3899) APPENDS to it -- it walks to
        ;       the first zero slot and writes there, with NO bounds check, so
        ;       16 switches by VERTB-server players also walk off the end.
        ;       MYLEVEL3_BODY (score.s:3932) jsr's every entry every frame, and
        ;       since the demo owns $6c that runs through _music_play1.
        ;   irqlines / isdatapointers (score.s:4090-4091, dcb.l 14 each)
        ;       exec_set_int_vector (score.s:3877) writes ONLY the slot it is
        ;       asked for -- the audio vectors AUD0-3 among them -- and
        ;       mylevel4 (score.s:3977) dispatches through them.
        ;
        ; Both dispatchers already stop at / skip a zero entry
        ; (`beq.b .endserver5list`, `beq.b mylevel4_no_int_handler`), so
        ; zeroing needs no vendored guard the way the CIA tables did. And it is
        ; safe HERE: _uade_audio_off above has already stopped the audio DMA
        ; that raises mylevel4, the CIA timers are stopped, and _uade_quiesced
        ; is holding _music_play1 off mylevel3_body for the whole teardown.
        ;
        ; `oldstructs` (score.s:4092) is deliberately NOT swept: it is only
        ; ever read back by the SetIntVector call that just wrote it, so it
        ; cannot carry a stale pointer into a later song.
        lea     ciaaints,a0
        moveq   #2,d1
        bsr     uade_zero_longs
        lea     ciabints,a0
        moveq   #2,d1
        bsr     uade_zero_longs
        lea     ciaadatas,a0
        moveq   #2,d1
        bsr     uade_zero_longs
        lea     ciabdatas,a0
        moveq   #2,d1
        bsr     uade_zero_longs
        lea     lev3serverlist,a0
        moveq   #32,d1
        bsr     uade_zero_longs
        lea     irqlines,a0
        moveq   #14,d1
        bsr     uade_zero_longs
        lea     isdatapointers,a0
        moveq   #14,d1
        bsr     uade_zero_longs

        ;*--- PORT: and take $68 back. The OUTGOING player may have left
        ;     score's ciaa_interrupt there, pointing at the tables just zeroed
        ;     above. The incoming player installs its own if it wants CIA-A;
        ;     if it does not, this is what keeps the keyboard alive through
        ;     its song (see input_sdk.s's _input_own_keyboard).
        jsr     _input_own_keyboard

        ; Found by sweeping score's data for globals that are dispatched
        ; through, rather than by taking the three above on trust: score's
        ; timer.device emulation is a fourth door into the same class.
        ; HandleTimerDevice (score.s:939, called from score's play loop at
        ; :728) jsr's `vblanktimerfunc` with `timerioptr` in a1 once
        ; `vblanktimercount` reaches zero -- and both pointers come out of the
        ; requesting PLAYER's IORequest (score.s:2777-2782), so an armed timer
        ; left by the outgoing player fires into the incoming player's code on
        ; the first resume after the switch. score clears the arm bit on a song
        ; end (score.s:665) but nothing clears it on a contplayer re-entry.
        ; Zeroing the arm bit alone would reach HandleTimerDevice's
        ; `dontplay` error path, so the whole group goes.
        lea     vblanktimerstatusbit,a0
        clr.l   (a0)
        lea     vblanktimercount,a0
        clr.l   (a0)
        lea     vblanktimerbit,a0
        clr.l   (a0)
        lea     vblanktimerfunc,a0
        clr.l   (a0)
        lea     timerioptr,a0
        clr.l   (a0)
        ; cia_chip_sel / cia_timer_sel (score.s:4144-4145) look like they
        ; belong here and do NOT: they are read-only configuration, never
        ; written by any player, and cia_timer_sel's default is 1, so zeroing
        ; it would change behaviour rather than reset it.

        ; Per-player STATE rather than per-player pointers -- no wild jump, but
        ; the incoming song inherits the outgoing song's answer:
        ;   useciatimer     set_player_interrupt (score.s:1679) `st`s it on the
        ;                   intfunc branch and never clears it on the
        ;                   startintfunc branch, so a CIA player followed by a
        ;                   start-int player leaves it true for score.s:721.
        ;   cursubsong      init_base copies it into dtg_SndNum, which
        ;                   contplayer's nospecialsubs path then SetSubSong's:
        ;                   song 2 would start on song 1's subsong index. A
        ;                   WORD, and minsubsong sits immediately after it, so
        ;                   clr.w -- clr.l here would wipe the range
        ;                   call_check_subsongs is about to fill.
        ;   virginaudioints score clears this itself on a song end
        ;                   (score.s:681); a switch is the same boundary.
        lea     useciatimer,a0
        clr.l   (a0)
        ; amp_dma (score.s:3532, `dc 0,0`) is NOT a member of either class,
        ; and the comment that used to stand here said it was, with three wrong
        ; line numbers and a mechanism that does not exist. What is actually
        ; true, checked against the source:
        ;   - the only `lea amp_dma(pc),a0` outside the clear is score.s:3573,
        ;     in enpp_amplifier_dma, and a0 is NEVER DEREFERENCED there --
        ;     :3578 writes d1, the CALLER's mask, to DMACON. amp_dma is not
        ;     read anywhere in score.s at all.
        ;   - it is cleared at :3660-3661, inside enpp_amplifier_int (:3653).
        ;     (An earlier note put that clear in enpp_amplifier_adr, :3586.
        ;     The line is right, the routine name was not.)
        ; It was flagged only because the derivation's window ran past this
        ; routine's `rts` into np_init, and paired this dead load with np_init's
        ; `jsr (a0)` -- a different a0, loaded from noteplayerptr. That matcher
        ; is fixed (the window stops at routine boundaries now) and no longer
        ; flags it.
        ; The clr stays: four bytes, once per switch, and a write-only global
        ; that a future vendor drop might start reading is exactly the shape of
        ; everything else in this teardown. It is defence, not a fix.
        lea     amp_dma,a0
        clr.l   (a0)
        lea     virginaudioints,a0
        clr.l   (a0)
        lea     cursubsong,a0
        clr.w   (a0)

        SWITCH_STEP 2
        ; 1b. quiesce DELIVERY too (fix round 1, unchanged): mask INTENA,
        ; read both ICRs to drop each CIA's asserted line, then ack whatever
        ; Paula had latched. Now genuinely just the delivery side -- the
        ; source is already stopped above. d1 is scratch here -- d0 carries
        ; the target song index into step 3 below and must not be touched.
        ;
        ; Record which of those bits were ENABLED first, because NOTHING
        ; downstream puts them back on its own: contplayer's init_interrupts
        ; writes $C020 -- SET|MASTER|VERTB -- and enables nothing else, so
        ; PORTS/EXTER/AUD0-3 return only if the incoming player happens to call
        ; add_ciaa/add_ciab_interrupt. uade_switch_intena_restore puts back
        ; exactly what was on, once, from all three exits (step 3c on success,
        ; the overflow bail, uade_die).
        ;
        ; What that costs if it is skipped -- corrected from an earlier reading
        ; of this code, which claimed the demo's exit path needs CIA-A for the
        ; KEYBOARD: it does not. The quit is a polled `btst #6,$bfe001` mouse
        ; test (DemoStartup.S:241/256/280) and needs no PORTS interrupt at all.
        ; The real cost is that PORTS is level 2, which is where the A1200's
        ; IDE interrupt arrives (hdd_startup.s:375) -- so on a streamed build
        ; disk I/O stops after the first switch that leaves it masked.
        move.w  $dff01c,d2                      ; INTENAR
        andi.w  #UADE_SWITCH_INT_MASK,d2
        lea     _uade_switch_intena(pc),a2
        move.w  d2,(a2)
        move.w  #UADE_SWITCH_INT_MASK,$dff09a   ; INTENA: mask score's bits
        move.b  $bfed01,d1                      ; CIA-A ICR: clears its IR bit
        move.b  $bfdd00,d1                      ; CIA-B ICR: ditto
        move.w  #UADE_SWITCH_INT_MASK,$dff09c   ; INTREQ: ack any pending

        SWITCH_STEP 3
        ; 2. reset the ANY-ram bump allocator. chippoint is NOT reset here --
        ; that used to be dead code: contplayer itself resets it from $10c.w
        ; unconditionally at its very top (score.s:457-458), before it does
        ; anything else, so this write was always immediately overwritten.
        ; uade_anypoint has no such reset inside score -- AllocMem's MEMF_ANY
        ; arm just keeps bumping it -- so it stays here.
        lea     uade_anypoint(pc),a0
        move.l  #_uade_any_arena,(a0)

        SWITCH_STEP 4
        ; 3. the four parameters contplayer reads. The module must be COPIED
        ;    into chip RAM at _uade_mod_base first, exactly like
        ;    _uade_init_super does for the FIRST song -- $100.w cannot just
        ;    point at uade_song_table's ANY-ram source (_uade_mods_src+
        ;    offset) the way the naive version of this step did.
        ;
        ;    Why that broke, found on device: score's contplayer/reloc_success
        ;    derives the chip pool's start directly from $100.w --
        ;    chippoint = (moduleptr + modulesize + 1024) & ~$FF -- with NO
        ;    bounds check on that specific assignment (unlike every AllocMem
        ;    request, which IS checked). Pointing $100.w at the incbin'd
        ;    source left `moduleptr` holding a data-hunk address instead of a
        ;    chip one, and chippoint landed exactly where that arithmetic put
        ;    it: reproducibly 0xC1DC00 for warp_ingame2.hip (module source
        ;    0xC17CD7 + length 23530 + 1024, rounded down to $FF) -- nowhere
        ;    near the arena, no fault, no overflow report, just a coroutine
        ;    that silently stopped advancing a few frames later.
        ;    _uade_mod_base is the same FIXED destination every switch uses
        ;    (sized once for UADE_ARENA_BYTES_MAX / UADE_RELOC_BYTES_MAX), so
        ;    this is the same copy _uade_init_super does, run again per song.
        bsr     uade_song_entry         ; d0 = index -> a0 = table row
        move.l  (a0),a1                 ; module source (any ram)
        move.l  4(a0),d1                ; module length
        move.l  8(a0),$108.w            ; player image (relocator copies it)
        ; THE NAME FOLLOWS THE SONG. score's split_module_name reads $128 and a
        ; DTP_ExtLoad player derives its companion from the result, so a switch
        ; that left the previous song's name here would hand the new player the
        ; old song's samples -- or nothing, when the names do not collide.
        ; Captured and published while a0 is still the row: a0 becomes the chip
        ; module pointer four instructions below.
        move.l  20(a0),_uade_cur_name
        move.l  _uade_cur_name,$128.w
        move.l  _uade_reloc_base(pc),$10c.w

        move.l  _uade_mod_base(pc),a0
        move.l  a0,$100.w               ; module address: the CHIP copy
        move.l  d1,$104.w               ; module length

        ; Bounds check: FAIL LOUDLY, never a silent overrun past
        ; _uade_arena_end. Within one build uade_sizes.i's module/arena
        ; figures cannot disagree -- the exposure is a STALE or hand-edited
        ; uade_sizes.i, or an unmeasured player -- but a silent out-of-arena
        ; write is the defect class this project has lost the most time to
        ; (this very round found one), so two instructions here is cheap.
        ;
        ; We are still on the PUMP's own stack -- step 4 has not run yet, so
        ; sp has not moved onto the score stack. uade_die's coroutine-swap
        ; teardown would restore _uade_host_sp from the LAST successful
        ; entry, not this one, and unwind the wrong stack; a tagged fatal +
        ; audio-off + a PLAIN rts (undoing this routine's own entry movem) is
        ; the correct "die" here, exactly mirroring the equivalent check in
        ; _uade_init_super below.
        move.l  a0,d2
        add.l   d1,d2
        cmp.l   #_uade_arena_end,d2
        bls.b   .swsize_ok
        lea     _uade_fatal(pc),a2
        move.l  #'SMOV',(a2)            ; Switch: Module OVerflow. Distinct
                                        ; from init's 'MOVF' -- one fatal code
                                        ; for both sites made an overflow at
                                        ; boot and one on a switch read the
                                        ; same in the locator block.
        lea     _uade_dead(pc),a2
        move.w  #1,(a2)
        bsr     _uade_audio_off
        bsr     uade_switch_intena_restore
        lea     _uade_quiesced(pc),a2
        clr.w   (a2)
        movem.l (sp)+,d0-d7/a0-a6
        rts
.swsize_ok:
        move.l  d1,d0
        beq.b   .noswmod
        ; NOT dbf: its counter is 16-bit and a module can exceed 64 KB.
.swcopymod:
        move.b  (a1)+,(a0)+
        subq.l  #1,d0
        bne.b   .swcopymod
.noswmod:

        SWITCH_STEP 5
        ; 3b. the incoming song starts alive. Nothing else in the backend
        ;     ever clears these -- every other write to _uade_dead sets 1 --
        ;     so without this one bad module would leave the whole musicdisk
        ;     dead for the rest of the run. Cleared HERE, after every path
        ;     that can still bail loudly above, and immediately before the
        ;     new player is entered.
        lea     _uade_dead(pc),a0
        clr.w   (a0)
        lea     _uade_fatal(pc),a0
        clr.l   (a0)
        ;*--- PORT: and the song's own clock. _uade_adv_ticks counts VBLs for
        ;     the timed auto-advance and was only ever cleared BY that
        ;     advance, so a song the viewer picked by hand inherited the
        ;     previous song's count -- pick one 89 seconds in and it moved on
        ;     a second later. It is also the only measure of "how long has
        ;     THIS song been playing", which the song-end handler needs to
        ;     tell an empty subsong from a real ending.
        lea     _uade_adv_ticks(pc),a0
        clr.l   (a0)

        SWITCH_STEP 6
        ; 3c. the arena is now the incoming song's. Let score's VERTB servers
        ;     run again for the whole of contplayer's init -- a player whose
        ;     init waits on a frame counter needs them, and from here on they
        ;     are the INCOMING player's own servers. The coroutine resume stays
        ;     gated by _uade_switching until contplayer first yields.
        lea     _uade_quiesced(pc),a0
        clr.w   (a0)
        ; And put step 1b's INTENA mask back on the SUCCESS path, not only on
        ; the two death paths. contplayer's init_interrupts (score.s) writes
        ; $C020 -- SET|MASTER|VERTB -- and enables NOTHING else, so PORTS,
        ; EXTER and AUD0-3 come back only if the incoming player happens to
        ; call add_ciaa/add_ciab_interrupt. A playlist mixing a CIA player with
        ; a VERTB-server player therefore left PORTS masked for the rest of the
        ; run, and PORTS is level 2, which is where the A1200's IDE interrupt
        ; arrives (hdd_startup.s:375) -- so disk I/O on a streamed build died
        ; after one switch.
        ;
        ; Safe here: the CIA timers are stopped, both ICR masks are cleared and
        ; every dispatch table is zeroed, so re-enabling a line delivers at
        ; most one already-guarded null dispatch. The incoming player arms what
        ; it needs from its own init. The helper clears the saved word, which
        ; is also what stops a much later uade_die re-enabling bits recorded at
        ; a switch that has long since finished.
        bsr     uade_switch_intena_restore

        SWITCH_STEP 7
        ; 4. enter contplayer on a FRESH score stack -- it is an entry point,
        ;    not a return, so the old coroutine stack is abandoned.
        lea     _uade_host_sp(pc),a0
        move.l  sp,(a0)
        move.l  #_uade_score_stack_end,sp
        ; contplayer, UNLESS score's one-time `start` never ran. A boot module
        ; that overflowed the arena leaves _uade_dead set and score never
        ; entered, and this is the recovery switch out of that song (see
        ; _uade_init_super's .initdead). contplayer does not build score's fake
        ; exec/dos/uade jump tables -- `start` does (score.s:256-288), and then
        ; falls through to contplayer -- so entering contplayer first would run
        ; every emulated library call through an uninitialised table.
        ;
        ; KNOWN HAZARD, deliberately not restructured here. `start` is NOT
        ; side-effect free on a live machine, and this path runs mid-demo where
        ; the first-entry path runs before the demo owns the display:
        ;   score.s:180   `move.l $114,a7` repoints a7 at the score stack and
        ;                 so DISCARDS the `pea uade_die` pushed just above --
        ;                 a fall-out of contplayer on this path never reaches
        ;                 uade_die. (179 is the `start` label itself. The
        ;                 first-entry path, _uade_enter_score, has had the same
        ;                 dead push since it was written.)
        ;   score.s:203-210 rewrite CIA-A PRA/DDRA (203-204, the audio filter
        ;                 bit among them) and both CIAs' ICR and TOD control
        ;                 (206-210).
        ;   score.s:212-213 write BPLCON0=$0200 and ADKCON=$00FF, which belong
        ;                 to the demo once it is running.
        ; Reachable only when the BOOT song overflowed the arena, which means a
        ; stale or hand-edited uade_sizes.i, so it is a recovery path for a
        ; build error rather than something a playlist hits in normal use.
        lea     _uade_score_started(pc),a0
        tst.w   (a0)
        bne.b   .cont
        move.w  #1,(a0)
        ; See _uade_enter_score: a `pea uade_die` before `jmp start` cannot
        ; survive start's own stack reset, so this path does not pretend to
        ; have one.
        jmp     start
.cont:
        ; contplayer, unlike start, does NOT reset a7 -- so HERE the landing
        ; pad is real. score still leaves only by `jmp uade_die` today, but if
        ; a vendor drop ever rts'd out of contplayer this is where it goes,
        ; rather than into whatever the score stack happened to hold.
;*--- PORT: FLUSH THE CACHES BEFORE RUNNING THE CODE WE JUST WROTE. The
;     relocator has copied this song's player image into the arena, at the SAME
;     addresses the previous song's player occupied -- so a 68020 or better can
;     still hold the old bytes in its instruction cache, and an 040/060 in
;     copyback mode may not have flushed the new ones to memory at all.
;     A 68000 has neither cache, which is why every A500 and every emulator we
;     test on was happy; this is the same class as the VBR defect next door.
;     score's own CacheClearU is mapped to an `rts` (score.s:414 harmlesslist),
;     so a player that asks for the flush itself does not get one either.
        UPROUGH_CACHE_FLUSH _uade_saved_execbase(pc)
        pea     uade_die
        SWITCH_STEP 8
        jmp     contplayer

        endc                            ; UADE_SONG_COUNT

; ===========================================================================
; Start / stop gate audio only. score keeps running underneath, so the song
; stays in sync with the timeline instead of restarting. Same class of named
; deviation as LSP's (music_glue.s:212-214).
; ===========================================================================
_music_start:
        lea     _uade_gated(pc),a0
        clr.w   (a0)
        rts

_music_stop:
        lea     _uade_gated(pc),a0
        move.w  #1,(a0)
        bra     _uade_audio_off

; _music_set_pos -- UADE has no frame seek; the honest mapping is subsong
; select. Post SETSUBSONG into score's input word and let its own
; inputmessagehandler do the work on the next resume. Two stores, so it is safe
; at the interrupts-disabled call site in amiga_main.c:11100.
; NAMED DEVIATION: a seek restarts the subsong, it does not scrub.
_music_set_pos:
        move.l  4(sp),d0
        lea     _uade_want_subsong(pc),a0
        move.w  d0,(a0)
        ; $120.w is where score's inputmessagehandler READS the request
        ; (score.s:1038). Writing only _uade_want_subsong posted a message
        ; that moved score to whatever $120 already held -- 0, cleared at
        ; install.
        move.l  d0,$120.w
        move.l  #AMSG_SETSUBSONG,UADE_INPUT_MSG.w
        rts

; ===========================================================================
; _music_shutdown -- from quit_restore_hw (main_glue.s:67), in USER mode,
; BEFORE the vector table and INTENA are restored.
; ===========================================================================
_music_shutdown:
        move.l  a0,-(sp)
        lea     _uade_installed(pc),a0
        tst.w   (a0)
        move.l  (sp)+,a0
        beq.b   .done
        movem.l d0-d7/a0-a6,-(sp)
        move.l  _SysBase,a6
        lea     _uade_shutdown_super(pc),a5
        jsr     -30(a6)                 ; Supervisor()
        movem.l (sp)+,d0-d7/a0-a6
.done:
        rts

;*--- PORT (debug): colour-trace the shutdown. A hang here freezes the machine
;     with the demo's own display still up, which says nothing about WHICH step
;     stopped. COLOR00 is the one instrument that still works when everything
;     else is gone. Built only with -DUADE_SHUTDOWN_TRACE.
;       red     entered supervisor
;       yellow  player's DTP_StopInt returned
;       green   player's DTP_EndSound returned
;       cyan    Paula silenced
;       blue    4.w handed back
;       white   vectors + INTENA restored, shutdown complete
;     COLOR00 turned out to be useless here: the demo's copperlist repaints it
;     every frame, so a marker is erased before anyone can see it. The step
;     goes into MEMORY instead, published in the locator block, where a
;     debugger can read it over the socket after the machine has frozen --
;     which needs no display, no guesswork and no eyes on a colour.
        ifd     UADE_SHUTDOWN_TRACE
TRACE   macro
        move.w  #\1,_uade_shutdown_step
        endm
        else
TRACE   macro
        endm
        endc

_uade_shutdown_super:
        TRACE   1
        ; Player first, then score's own timers, then the hardware.
        lea     _uade_dead(pc),a0
        tst.w   (a0)
        bne.b   .hw
        bsr     call_stop_int           ; score.s: the player's DTP_StopInt
        TRACE   2
        bsr     call_end_sound          ; score.s: the player's DTP_EndSound
        TRACE   3
.hw:
        bsr     _uade_audio_off
        ; Give the CIAs back -- hardware only, before 4.w goes back, so it
        ; cannot race an OS call. score's start stopped CIA-A timer B (which is
        ; timer.device on Kickstart 2.0+) and zeroed both CRBs; the player's
        ; rem_cia*_interrupt clears its ICR mask bit and leaves its timer
        ; running. Registers first, exactly as saved, then the unreadable mask
        ; bits; the UADE build is always a plain takeover (uade + OS-alive is a
        ; build error), so both halves run. Measured 2026-09-21 (a1200/KS3.1):
        ; CIA-A CRB $01/mask $0F and CIA-B mask $00 at baseline, CIA-A CRB $00
        ; and CIA-B mask $01/CRA $01 while a CIA-B-timed player ran.
        CIA_RESTORE_REGS _uade_saved_cia
        CIA_REENABLE_MASKS _uade_saved_cia
        TRACE   4

        ; 4.w goes back FIRST: quit_cleanup (main_glue.s:88) calls
        ; _demo_exit_cleanup -> FreeMem, and vilcans' CACHEFLUSH does
        ; move.l $4.w,a6. Anything that touches Exec after this point must
        ; find the REAL ExecBase, not score's fake one.
        move.l  _uade_saved_execbase(pc),d0
        beq.b   .novec
        move.l  d0,4.w
.novec:
        TRACE   5
        ; Every vector score's exec_set_int_vector can install into, plus the
        ; two add_cia*_interrupt writes directly -- see the save site. A zero
        ; entry is skipped: it means the machine had no handler there when we
        ; arrived, and writing 0 back would be worse than leaving score's.
        lea     uade_vec_list(pc),a0
        lea     _uade_saved_vecs(pc),a1
        moveq   #UADE_VEC_COUNT-1,d0
.restvec:
        moveq   #0,d1
        move.w  (a0)+,d1
        add.l   _uprough_vbr,d1         ; VBR-relative, see .savevec
        move.l  (a1)+,d2
        beq.b   .skipvec
        move.l  d1,a2
        move.l  d2,(a2)
.skipvec:
        dbf     d0,.restvec
        ; Put $100-$300 back. On a 3.1 machine every one of those longwords is
        ; Kickstart's default vector handler.
        lea     _uade_lowmem_save(pc),a0
        lea     $100,a1
        move.w  #(UADE_MSG_END-$100)/4-1,d0
.restlow:
        move.l  (a0)+,(a1)+
        dbf     d0,.restlow

        ; Restore only the enable bits we may have cleared; the rest of INTENA
        ; belongs to whoever set it.
        ; NOT the master enable (INTEN, $4000). score does clear it -- `move
        ; #$7fff,intena` at score.s:440 and :788, and `move #$4000,intena`, a
        ; CLEAR, at :676 -- so it does need putting back, but NOT HERE: this
        ; runs while the demo's IRQ-silence stubs are still in every vector.
        ; Switching the master enable on at this point lets a pending EXTER
        ; into a bare `rte` that cannot acknowledge CIA-B, which is the very
        ; livelock the vector restore exists to prevent. It goes back in
        ; _uprough_restore_vectors instead, which runs inside StartupEnd
        ; immediately AFTER the real handlers are in place.
        move.w  _uade_saved_intena(pc),d0
        andi.w  #$2008,d0               ; EXTER | PORTS
        beq.b   .noint
        ori.w   #$8000,d0               ; SET
        move.w  d0,$dff09a
.noint:
        lea     _uade_installed(pc),a0
        clr.w   (a0)
        TRACE   9                    ; shutdown complete
        rte

; ===========================================================================
; _uade_publish_info -- write a locator block so a debugger can find our state
; in a LoadSeg-relocated binary. Amiberry's IPC has READ_MEM but no memory
; search, and the hunk base is not known in advance, so without this every
; device read would mean scanning RAM a longword at a time over a socket.
;
; Lands at UADE_INFO ($304, amiga/uade_layout.i): vector slots 193+, which no Amiga hardware uses (autovectors
; stop at $7C and score's own input word is at $300). Only the probe calls
; this, so a normal demo build pays nothing and writes nothing.
;
; This routine lives HERE rather than in uade_probe.s because chippoint is a
; local symbol of score.s, and score.s is included into this translation unit.
;
; UADE_INFO/UADE_STAGE come from amiga/uade_layout.i, shared with the probe
; rig's stage/fault block. PUBADDR/PUBLEA below both bump UADE_TABLE_ENTRIES,
; which the ifge/fail after the routine uses to fail the BUILD the moment a
; future entry would make this table reach UADE_STAGE -- the table growing
; into the stage marker is exactly how the 33rd entry (uade_msgring_idx)
; silently overwrote it on 2026-09-21 ($340 + 32*4 = the old $3C0). Every
; entry AFTER the fixed 'UADE' magic word must go through one of these two
; macros, or it is invisible to the guard and the guard is worthless.
; tools/uade_format_sweep.py's locator_names() parses THIS SOURCE for
; "PUBADDR name" / "PUBLEA name" (plus the magic literal) to derive each
; entry's slot address -- it does not expand macros, so an entry written any
; other way is invisible to every host tool too.
; ===========================================================================
        include "amiga/uade_layout.i"

UADE_TABLE_ENTRIES     set     0

PUBADDR macro                            ; publish #\1 (a constant or a symbol's address)
        move.l  #\1,(a0)+
UADE_TABLE_ENTRIES     set     UADE_TABLE_ENTRIES+1
        endm

PUBLEA  macro                            ; publish the PC-relative address of \1
        lea     \1(pc),a1
        move.l  a1,(a0)+
UADE_TABLE_ENTRIES     set     UADE_TABLE_ENTRIES+1
        endm

        xdef    _uade_publish_info
_uade_publish_info:
        lea     UADE_INFO,a0
        move.l  #'UADE',(a0)+                   ; UADE_INFO+0 magic
UADE_TABLE_ENTRIES     set     UADE_TABLE_ENTRIES+1
        PUBADDR _uade_playername                ;
        PUBADDR _uade_playing                   ; (word)
        PUBADDR _uade_fatal                     ;
        PUBADDR _uade_missing_lvo_off            ;
        PUBLEA  chippoint                       ; -> score's bump cursor / pool high-water
        PUBADDR _uade_arena                     ;
        PUBADDR _uade_arena_end                 ;
        PUBADDR _uade_song_ended                ;
        PUBADDR _uade_modulename                ;
        PUBADDR _uade_dead                      ;
        PUBADDR _uade_lastmsg                   ;
        PUBADDR _uade_msg_count                 ;
        PUBLEA  uade_pool_req_flags
        PUBADDR _uade_vbl_seen                  ; VBlank-server players
        PUBLEA  uade_ciaa_seen                  ; CIA-A timer players
        PUBLEA  uade_ciab_seen                  ; -> seen/icr/code/data, 4 in a row
        ; The LIVE dispatch tables (score.s:4022-4025), not the debug
        ; snapshot above -- ciab_interrupt's debug block only ever records
        ; slot 0 (timer A) regardless of which bit fired, so a stale TIMER B
        ; slot is invisible there. Each publishes 2 longwords (timer A slot,
        ; timer B slot) back to back.
        PUBLEA  ciaaints                        ; -> CIA-A timer A/B code ptrs
        PUBLEA  ciabints                        ; -> CIA-B timer A/B code ptrs
        PUBLEA  uade_cause_seen                 ; -> seen/code/node, 3 in a row
        PUBLEA  uade_big_size                   ; -> size/base/flags, 3 in a row
        PUBLEA  uade_anypoint                   ; -> anypoint/anypool_end
        PUBADDR _uade_any_arena
        PUBADDR _uade_any_arena_end
        PUBADDR _uade_score_stack               ; the guard word
        PUBADDR _uade_score_stack_end
        PUBADDR uade_regs                       ; d0-d7,a0-a7 at the fault
        PUBADDR _uade_user_stack                ; the user-stack guard
        PUBLEA  uade_pool_end                   ; -> the bound itself
        PUBLEA  uade_chip_lo
        PUBLEA  uade_pool_req
        ; -> _uade_mod_base. score derives the POOL base from the module:
        ; after relocation it sets chippoint = (moduleptr + modulesize + 1024)
        ; & ~$FF (score.s, reloc_success). Without this, the pool's own start is
        ; not recoverable from outside -- the module is page-aligned with a
        ; round-DOWN, so it cannot be reconstructed from the arena base and the
        ; sizes, and tools/uade_arena_table.py sized pools from a reconstruction
        ; that came out NEGATIVE for SIDMon. Publishing the base makes the
        ; measurement exact: pool used = chippoint - pool base.
        PUBLEA  _uade_mod_base
        PUBADDR _uade_missing_file               ; a LoadSeg we could not serve
        PUBADDR _uade_msgring                    ; the call-trace ring
        PUBLEA  _uade_msgring_idx                ; where it will write next
        PUBADDR _uade_cur_song                   ; musicdisk: current song index
        PUBADDR _uade_ciaa_hits                  ; CIA-A interrupts dispatched
        PUBADDR _uade_lev2_hits                  ; level-2 interrupts seen
        PUBADDR _uade_ciaa_tb_hits               ; dispatches into the player
        PUBADDR _uade_req_names                  ; last 4 LOADFILE names asked
        PUBADDR _uade_pump_seen                  ; musicdisk: MAIN-LOOP liveness
        PUBADDR _uade_shutdown_step              ; how far the exit path got
        PUBADDR _uade_cur_title                  ; musicdisk: -> current title
        PUBADDR _uade_cur_composer               ; musicdisk: -> current format
        PUBADDR _uade_pending_song               ; musicdisk: pending, -1 if none
        ; Publish the stage/fault block's OWN base last, so a host reader
        ; derives it from the locator instead of hardcoding $400 (RULE: see
        ; tools/uade_format_sweep.py's UADE_STAGE_BASE). This is a plain
        ; constant, not a pointer to a variable -- one dereference gets it.
        PUBADDR UADE_STAGE
        rts

; Build-time guard: fail loudly, not silently, if the table above ever grows
; far enough to reach the stage/fault block it must not touch.
UADE_TABLE_END  equ     UADE_INFO+4*UADE_TABLE_ENTRIES
        ifge    (UADE_TABLE_END-UADE_STAGE)
        fail    "uade_glue.s: _uade_publish_info's locator table reaches UADE_STAGE -- move UADE_STAGE out further in amiga/uade_layout.i"
        endc

; ===========================================================================
; uade_msg_trap -- installed at TRAP_VECTOR_5 by score's set_message_traps
; (PORT 6). Upstream that handler is a bare `rte` because UADE's emulator
; inspects the message window when the trap fires; on hardware nothing is
; watching, so the dispatcher runs here. Every put_message / put_string call
; site in score.s is untouched -- this is the whole seam.
; Runs in supervisor (it is a trap handler).
; ===========================================================================
        xdef    uade_msg_trap
uade_msg_trap:
        movem.l d0-d7/a0-a6,-(sp)
        move.l  UADE_MSG,d0

        cmpi.l  #AMSG_START_OUTPUT,d0
        bne.b   .not_start
        lea     _uade_playing(pc),a0    ; the green light
        move.w  #1,(a0)
        bra     .done
.not_start:
        cmpi.l  #AMSG_SONG_END,d0
        bne.b   .not_songend
        lea     _uade_song_ended(pc),a0
        addq.w  #1,(a0)
        ifd     UADE_SONG_COUNT
;*--- PORT: auto-advance. score reports the end of a song here, and a musicdisk
;     answers by moving to the next one. This only LATCHES a request -- the same
;     latch _music_select writes -- so the engine's own advance and a key press
;     go through ONE path, and the switch itself still happens in
;     _music_select_pump outside the interrupt. Doing the work here would put
;     relocation and the incoming player's init inside a trap handler, which is
;     the bug that cost six rounds.
;
;     A pending request already in the latch WINS: if the viewer pressed a key
;     in the same tick the song ended, their choice is the newer intent and
;     auto-advance must not overwrite it.
;
;     Wrapping at the end of the playlist means a ONE-song playlist re-posts
;     itself, which is exactly the loop behaviour the single-song path has
;     always had -- so the two paths still agree, which Task 10 asserts.
;
;     Many Amiga formats never signal an end at all. Those simply play until
;     the viewer moves, which is existing behaviour and not a failure.
;*--- PORT: A SONG END MOVES THE DISK ON -- that is what a musicdisk is for,
;     and it is what the owner asked for. score only reports one because $12C
;     is now set (see _music_init); with that store cleared, nothing ever
;     ended and the auto-advance timer was the only thing moving the disk.
;
;     ONE exception, and it is not a taste call: an end in the FIRST SECOND is
;     an EMPTY SUBSONG, not a finished tune. MEASURED on the host, one subsong
;     at a time: eco.gray subsong 0 is 2337 frames of rms 0.0 and then reports
;     an end; subsong 1 is 264192 frames at rms 3142. uade123 answers that by
;     stepping to the next subsong, and so does this -- otherwise song 27 is
;     silent for its whole slot, and a player that reports an end every frame
;     walks the entire playlist in a second (measured: cur=68 eight seconds
;     after selecting 27).
;     The request goes through $120.w, which is where score's
;     inputmessagehandler reads it (score.s:1038).
        move.l  _uade_adv_ticks(pc),d1
        cmpi.l  #50,d1                  ; one second at 50 Hz
        bhs.b   .adv_song               ; a real ending: next SONG
        move.l  _uade_sub_cur(pc),d1
        cmp.l   _uade_sub_max(pc),d1
        bge.b   .adv_done               ; no subsong left: let the timer do it
        addq.l  #1,d1
        lea     _uade_sub_cur(pc),a0
        move.l  d1,(a0)
        lea     _uade_want_subsong(pc),a0
        move.w  d1,(a0)
        move.l  d1,$120.w
        move.l  #AMSG_SETSUBSONG,UADE_INPUT_MSG.w
        lea     _uade_adv_ticks(pc),a0
        clr.l   (a0)                    ; the new subsong starts its own clock
        bra.b   .adv_done
.adv_song:
        lea     _uade_pending_song(pc),a0
        cmpi.w  #-1,(a0)
        bne.b   .adv_done               ; a key press already pending: it wins
        move.w  _uade_cur_song(pc),d1
        addq.w  #1,d1
        cmpi.w  #UADE_SONG_COUNT,d1
        blo.b   .adv_set
        moveq   #0,d1                   ; wrap to the first song
.adv_set:
        move.w  d1,(a0)
.adv_done:
        endc
        bra     .done
.not_songend:
        cmpi.l  #AMSG_PLAYERNAME,d0
        bne.b   .not_playername
        lea     _uade_playername(pc),a1
        bra     .copystr
.not_playername:
        cmpi.l  #AMSG_MODULENAME,d0
        bne.b   .not_modulename
        lea     _uade_modulename(pc),a1
        bra     .copystr
.not_modulename:
        cmpi.l  #AMSG_FORMATNAME,d0
        bne.b   .not_formatname
        lea     _uade_formatname(pc),a1
        bra     .copystr
.not_formatname:
        cmpi.l  #AMSG_SUBSINFO,d0
        bne.b   .not_subsinfo
;*--- PORT: the order is min, MAX, CUR -- score.s's ReportSubSongs writes
;     minsubsong at +4, maxsubsong at +8 and cursubsong at +12. This handler
;     read them as min/cur/max, so _uade_sub_cur held the MAXIMUM and
;     _uade_sub_max the CURRENT for as long as the locator has published them.
        lea     _uade_sub_min(pc),a0
        move.l  UADE_MSG+4,(a0)
        lea     _uade_sub_max(pc),a0
        move.l  UADE_MSG+8,(a0)
        lea     _uade_sub_cur(pc),a0
        move.l  UADE_MSG+12,(a0)
;*--- PORT: START AT THE MINIMUM SUBSONG, which is not always 0. score's
;     cursubsong is cleared to 0 on every switch (uade_do_switch step 1a) and
;     a module whose range starts higher then plays a subsong that does not
;     exist -- silence, with everything else healthy.
;     MEASURED 2026-09-23: song 66 of the owner's disk (`everton fc -
;     jingles.snk`, PaulSummers) reports "subsongs in range [1, 6]" and our
;     disk played 0: no audio DMA at all (the sweep's dma=0), while uade123 on
;     the host plays it. uade123 does exactly this -- it starts at the
;     reported minimum.
;     Posting into score's input word is the same mechanism _music_set_pos
;     uses; score's own inputmessagehandler does the work on the next resume,
;     so nothing here runs a subsong change inside the trap.
        move.l  UADE_MSG+12,d1          ; CURRENT
        cmp.l   UADE_MSG+4,d1           ; MINIMUM
        bge.b   .sub_ok                 ; already at or above the minimum
        move.l  UADE_MSG+4,d1
        lea     _uade_sub_cur(pc),a0
        move.l  d1,(a0)
        lea     _uade_want_subsong(pc),a0
        move.w  d1,(a0)
        ; score reads the REQUESTED subsong from $120.w (score.s:1038), not
        ; from anything of ours -- _uade_want_subsong is our own record.
        move.l  d1,$120.w
        move.l  #AMSG_SETSUBSONG,UADE_INPUT_MSG.w
.sub_ok:
        bra     .done
.not_subsinfo:
        ; DEBUG_U32_I32_STRING is score's library_unimplemented_call reporting
        ; the caller's return address and the LVO offset just before it
        ; executes `illegal`. It is the single most useful diagnostic in the
        ; port: it NAMES the exec function a new format needed and we did not
        ; fake, instead of leaving a black screen to bisect.
        cmpi.l  #AMSG_DEBUG_U32_I32_STRING,d0
        bne.b   .not_dbg2
        lea     _uade_missing_lvo_ret(pc),a0
        move.l  UADE_MSG+4,(a0)
        lea     _uade_missing_lvo_off(pc),a0
        move.l  UADE_MSG+8,(a0)
        bra     .done
.not_dbg2:
        ; --- DTP_ExtLoad: the second file of a two-file format --------------
        ; 42 of UADE's 173 players ask the host for a companion by name at init
        ; (TFMX wants smpl.<tune> beside mdat.<tune>). score's dos_fixfilename
        ; has already stripped the path, and uade_stage.py embedded the file, so
        ; all three of these are table lookups. Answering "not found" is what
        ; made TFMX untestable.
        cmpi.l  #AMSG_LOADFILE,d0
        bne     .not_loadfile
;*--- PORT: RECORD WHAT WAS ASKED FOR, not just what was missed.
;     _uade_missing_file keeps the last FAILURE, which cannot tell a player
;     that asked once and died from one that asked for a default name first
;     and the real one after. SynthDream asks for `SMP.set` before anything
;     else, and with only the failure recorded there was no way to see what
;     followed. Four slots of 32 bytes, oldest overwritten.
        movem.l d0-d2/a0-a1,-(sp)
        move.l  UADE_MSG+4,a0
        lea     _uade_req_idx,a1
        move.w  (a1),d1
        addq.w  #1,(a1)
        andi.w  #3,d1
        lsl.w   #5,d1                   ; * 32 bytes
        lea     _uade_req_names,a1
        adda.w  d1,a1
        moveq   #31-1,d2
.rq_copy:
        move.b  (a0)+,(a1)+
        beq.b   .rq_done
        dbf     d2,.rq_copy
.rq_done:
        clr.b   (a1)
        movem.l (sp)+,d0-d2/a0-a1
        move.l  UADE_MSG+4,a0           ; name
        bsr     uade_find_file
        tst.l   d0
        bne.b   .lf_fail
        move.l  UADE_MSG+8,a2           ; destination score picked
        move.l  d1,d2                   ; length
        beq.b   .lf_fail
;*--- PORT: BOUND THE COPY. score picks the destination by bumping `chippoint`
;     and NOTHING upstream checks it -- UADE's emulated machine is chip RAM end
;     to end. Here the arena is a fixed block with the demo's bitplanes above
;     it, so an oversized LoadSeg writes straight through the screen. MEASURED
;     2026-09-23: `dynamite dux.core` (CoreDesign, 156,532 B) landed 247 KB
;     past _uade_arena_end and corrupted the selector while the demo kept
;     running and kept switching songs -- graphics damage with no fault, no
;     message and no dead loop, which is the hardest shape to find.
;     tools/uade_stage.py now SIZES the arena for these (loadseg_bytes), so
;     this is the backstop for a module that was never sized -- and a backstop
;     that reports: 'LOVF' in the locator, audio off, this song dead, and the
;     NEXT switch clears it (uade_do_switch step 3b) so the disk survives.
        move.l  a2,d4
        add.l   d2,d4
        cmp.l   #_uade_arena_end,d4
        bls.b   .lf_fits
        move.l  #'LOVF',d0              ; LoadFile OVerFlow
        bra     .fatal
.lf_fits:
        move.l  d1,d4                   ; keep it: the window is not safe below
.lf_copy:
        move.b  (a1)+,(a2)+
        subq.l  #1,d2
        bne.b   .lf_copy
        ; Report the size AFTER the copy, never before -- see the comment on
        ; .rd_copy below. The window at UADE_MSG is shared with every other
        ; message, and a long copy is long enough for an interrupt to land in
        ; and rewrite it. A companion file here can be hundreds of KB (TFMX
        ; sample sets), which is the same exposure that cost AHX its waveform
        ; table.
        move.l  d4,UADE_MSG+12
        bra     .done
.lf_fail:
        ; Record WHICH file was missing. score answers a failed LoadSeg by
        ; relocating whatever is at the destination -- nothing -- and reports
        ; "loadseg relocation error", which says the relocation failed but not
        ; that a file was never delivered. BenDaglish-SID died three calls
        ; later jumping through a null, and the name asked for here is the only
        ; thing that says what to stage.
        clr.l   UADE_MSG+12
        move.l  UADE_MSG+4,a0           ; the name score asked for
        lea     _uade_missing_file,a1
        moveq   #64-1,d2
.mf_copy:
        ; `beq` word-branch, not beq.b: .done is past the 8-bit displacement
        ; from here and the assembler refuses it outright.
        move.b  (a0)+,(a1)+
        beq     .done
        dbf     d2,.mf_copy
        clr.b   -1(a1)
        bra     .done
.not_loadfile:

        cmpi.l  #AMSG_FILESIZE,d0       ; score's dos_open
        bne.b   .not_filesize
        move.l  UADE_MSG+4,a0
        bsr     uade_find_file
        tst.l   d0
        bne.b   .fs_fail
        move.l  d1,UADE_MSG+8           ; size
        move.l  d1,UADE_MSG+12          ; non-zero == "it exists"
        bra     .done
.fs_fail:
        clr.l   UADE_MSG+8
        clr.l   UADE_MSG+12
        bra     .done
.not_filesize:

        cmpi.l  #AMSG_READ,d0
        bne.b   .not_read
        move.l  UADE_MSG+4,a0
        bsr     uade_find_file
        tst.l   d0
        bne.b   .rd_fail
        ; clamp offset+length to the file: score tracks its own file position
        ; and will happily ask past the end at EOF.
        move.l  UADE_MSG+12,d2          ; offset
        cmp.l   d1,d2
        bhs.b   .rd_fail                ; at or past EOF -> 0 bytes
        sub.l   d2,d1                   ; bytes available from here
        move.l  UADE_MSG+16,d3          ; requested length
        cmp.l   d1,d3
        bls.b   .rd_have
        move.l  d1,d3                   ; short read
.rd_have:
        tst.l   d3
        beq.b   .rd_fail
        adda.l  d2,a1
        move.l  UADE_MSG+8,a2           ; dest
        ; --- THE COUNT IS REPORTED AFTER THE COPY, NEVER BEFORE ---------------
        ; UADE_MSG ($200) is ONE window shared by every message score sends,
        ; and this copy is long: 410,760 bytes for AHX's waveform table, ~91
        ; frames byte-wise. The trap does not raise the interrupt level, so
        ; every VBlank during it runs the demo's ISR -> _music_play1 ->
        ; mylevel3_body -> score code, which emits its own messages (a
        ; UADE_TEST_LOGGING build logs one per call; a plain build still emits
        ; warnings), and score's put_string/put_message REWRITE THE WINDOW from
        ; $200 up. Anything already published there is gone.
        ;
        ; Measured, not reasoned: with the count written before the copy, a
        ; probe read UADE_MSG+0 back at the end of the copy and found 21
        ; (UADE_TEST_LOGGING) where it had been 13 (AMSG_READ), with 91 nested
        ; entries to this handler per AHX init -- exactly one per frame of the
        ; copy. score's dos_read then returns whatever survived at +20 instead
        ; of the byte count, AHX's `cmpi.l #410760,d0` fails, and it rebuilds
        ; the whole table: 1420 frames instead of 122. Whether the value
        ; survived depended on where the interrupt landed, which under
        ; cycle-exact emulation is deterministic per build -- so the same
        ; source could stall or not depending on how many bytes of unrelated
        ; code sat in front of it.
        ;
        ; Writing the count last leaves nothing in the window to corrupt while
        ; the copy runs. What remains is score's own irreducible window between
        ; put_message returning and dos_read reading 20(a0), a handful of
        ; instructions wide and shared with upstream.
        ;
        ; Longword-wise while both ends are even, which they are for every
        ; table entry (the stager pads each to a word boundary and AllocMem
        ; returns aligned) -- but NOT assumed: a player can Seek to an odd
        ; offset, and `move.l` on an odd address is an address error on a
        ; 68000, i.e. a dead demo rather than a slow one.
        move.l  a1,d4
        move.l  a2,d5
        or.l    d5,d4
        move.l  d3,d2
        btst    #0,d4
        bne.b   .rd_copy_b              ; odd either end -> byte-wise
        move.l  d3,d2
        lsr.l   #2,d2
        beq.b   .rd_tail                ; fewer than 4 bytes
.rd_copy_l:
        move.l  (a1)+,(a2)+
        subq.l  #1,d2
        bne.b   .rd_copy_l
.rd_tail:
        move.l  d3,d2
        andi.l  #3,d2
        beq.b   .rd_done
.rd_copy_b:
        move.b  (a1)+,(a2)+
        subq.l  #1,d2
        bne.b   .rd_copy_b
.rd_done:
        move.l  d3,UADE_MSG+20          ; actually-read count
        bra     .done
.rd_fail:
        clr.l   UADE_MSG+20
        bra     .done
.not_read:

        cmpi.l  #AMSG_CHECKERROR,d0
        beq.b   .fatal
        cmpi.l  #AMSG_SCORECRASH,d0
        beq.b   .fatal
        cmpi.l  #AMSG_SCOREDEAD,d0
        beq.b   .fatal
        ; GENERALMSG is score's own put_string: every warning it emits about
        ; an unimplemented library call, a failed check or a bad reloc comes
        ; through here. Keeping the last one is the difference between "it
        ; crashed" and "it said why".
        ; TEST_LOGGING is score's own call trace (38 LOG_CALL sites, compiled
        ; in only when UADE_TEST_LOGGING=1). Latching the last one turns a
        ; silent hang into "it died in call_init_player".
        cmpi.l  #AMSG_TEST_LOGGING,d0
        beq.b   .is_general
        cmpi.l  #AMSG_GENERALMSG,d0
        bne.b   .not_general
.is_general:
        lea     _uade_msg_count(pc),a0
        addq.w  #1,(a0)
        ; next ring slot: base + idx*96, idx wrapping at UADE_MSG_SLOTS
        lea     _uade_msgring_idx(pc),a0
        move.w  (a0),d1
        addq.w  #1,(a0)
        cmpi.w  #UADE_MSG_SLOTS,(a0)
        blo.b   .idxok
        clr.w   (a0)
.idxok:
        andi.l  #$ffff,d1
        mulu    #UADE_MSG_SLOT_BYTES,d1
        lea     _uade_msgring,a1
        adda.l  d1,a1
        bra     .copystr
.not_general:
        cmpi.l  #AMSG_GET_INFO,d0
        bne.b   .not_getinfo
        bsr     uade_answer_get_info
        bra     .done
.not_getinfo:
        ; Everything else -- TIME_CRITICAL (no hardware equivalent),
        ; NTSC, the STATE_DETECTION pair, TEST_LOGGING, DEBUG_U32_STRING, RESERVED_0
        ; -- is deliberately a no-op here. LOADFILE / READ / FILESIZE land here
        ; too and answer "not found" until the DTP_ExtLoad file table lands
        ; (only the 42 ExtLoad formats reach them; the AHX pilot never does).
        bra     .done

.fatal:
        lea     _uade_fatal(pc),a0
        move.l  d0,(a0)
        bsr     _uade_audio_off
        lea     _uade_dead(pc),a0
        move.w  #1,(a0)
        bra     .done

.copystr:
        ; NUL-terminated string at UADE_MSG+4, bounded by the window end and
        ; by our 32-byte buffers.
        lea     UADE_MSG+4,a0
        moveq   #96-1,d1                ; bounded by the window end below too
.cpl:
        move.b  (a0)+,(a1)+
        beq.b   .done
        cmpa.l  #UADE_MSG_END,a0
        bhs.b   .cpterm
        dbf     d1,.cpl
.cpterm:
        clr.b   -1(a1)
.done:
        movem.l (sp)+,d0-d7/a0-a6
        rte

; uade_find_file -- a0 = NUL-terminated name score asked for.
;   out: d0 = 0 when found (else -1), a1 = data, d1 = length.
; Compares the BASENAME case-insensitively: score strips the path itself, but a
; player can pass whatever it likes, and Amiga filenames are not case sensitive.
uade_find_file:
        movem.l d2-d4/a2-a3/a5,-(sp)
        ; strip any path -- everything after the last '/' or ':'
        move.l  a0,a2
        move.l  a0,a3
.strip:
        move.b  (a3)+,d2
        beq.b   .stripped
        cmpi.b  #'/',d2
        beq.b   .newbase
        cmpi.b  #':',d2
        bne.b   .strip
.newbase:
        move.l  a3,a2
        bra.b   .strip
.stripped:
        moveq   #UADE_FILE_COUNT,d4
        subq.l  #1,d4
        bmi.b   .notfound               ; no companions embedded at all
        ; ABSOLUTE, not (pc): the table lives in `uadedata` with the blob, which
        ; is far past the 16-bit PC displacement -- the trap music_glue.s:220-224
        ; documents.
        lea     uade_file_table,a3
        ; TWO SONGS CAN ASK FOR THE SAME NAME. score asks by basename alone
        ; (its dos_fixfilename strips the path), and in a playlist both
        ; SynthPack's Dyter-07 set and SynthDream's monsterbusiness tunes want
        ; a bank called `smp.set` -- different files, same name. So a name
        ; match is not enough: an entry tagged with THIS song wins, and an
        ; entry tagged -1 ("any song", which is what a single-song build and
        ; the AHX waveform files use) is kept as the fallback.
        sub.l   a5,a5                   ; a5 = best "any song" match, none yet
.entry:
        move.l  (a3),a0                 ; candidate name
        move.l  a2,a1                   ; what was asked for
        bsr.b   .stricmp
        tst.l   d0
        bne.b   .next
        move.l  12(a3),d0               ; the song this entry belongs to
        bmi.b   .anysong                ; -1: usable, but keep looking
        move.w  _uade_cur_song(pc),d1
        andi.l  #$ffff,d1
        cmp.l   d1,d0
        beq.b   .hit                    ; this song's own file: take it
        bra.b   .next
.anysong:
        move.l  a3,a5                   ; remember it, prefer a song match
.next:
        lea     UADE_FILE_ENTRY_BYTES(a3),a3
        dbf     d4,.entry
        move.l  a5,d0                   ; no song-specific hit
        beq.b   .notfound
        move.l  a5,a3
        bra.b   .hit
.notfound:
        ; The MODULE, asked for by its own name.
        ;
        ; Some deliplayers LoadSeg() the module instead of parsing it: the file
        ; IS an AmigaDOS executable (terramex.bds starts $000003F3 -- HUNK_CODE,
        ; HUNK_RELOC32, HUNK_END) and the player wants it relocated before it
        ; runs. score's dos_loadseg turns that into a LOADFILE for the module's
        ; own name, and this table only ever held COMPANIONS, so the one file
        ; guaranteed to be present was the one we could not serve.
        ;
        ; What that looked like: "loadseg relocation error" -> InitPlayer
        ; returns fail -> score calls check_subsongs and init_sound ANYWAY ->
        ; the player jumps through a null a0 and dies at PC=4, four calls away
        ; from the cause. BenDaglish-SID and FuturePlayer both.
        ; assembler-time: a demo with no module has no name to match either.
        ; UADE_MODULE_BYTES is a single-song constant (tools/uade_stage.py's
        ; main(), not stage_songs()), so it answers for a single-song build
        ; only; the playlist arm below answers for a musicdisk.
        ;
        ;*--- PORT: PLAYLIST. Serving the module by its own name was a
        ; SINGLE-SONG-ONLY fallback until 2026-09-23, and a musicdisk that
        ; switched to FredGray or FuturePlayer died four calls later at PC=0.
        ; MEASURED on a standalone Amiberry (no focus-pause), song 2 =
        ; eco.gray: score's dos_loadseg took its load-a-file branch for
        ; LoadSeg("eco.gray"), uade_find_file had only COMPANIONS in the
        ; table, the LOADFILE handler recorded _uade_missing_file="eco.gray",
        ; the relocator then relocated an unwritten destination and failed,
        ; FredGray's InitPlayer left its dispatch pointer (hunk offset $14A)
        ; at zero, and InitSound tail-jumped `jmp (a0)` with a0 = 0. The main
        ; loop stopped dead with PC parked at $00000004 -- the exception
        ; vector table executed as code -- which reads as a hung demo with no
        ; fault and no message.
        ; The playlist already carries everything needed: uade_song_table's
        ; row holds the module source and length, and _uade_cur_name is that
        ; row's own basename, published by uade_do_switch (and by the boot
        ; path) precisely so score's split_module_name can see it.
        ifd     UADE_SONG_COUNT
        move.l  _uade_cur_name(pc),d0
        beq.b   .reallynotfound         ; no name published: nothing to match
        move.l  d0,a0
        move.l  a2,a1
        bsr     .stricmp
        tst.l   d0
        bne.b   .reallynotfound
        move.w  _uade_cur_song(pc),d0
        ; jsr, not bsr: uade_song_entry sits on the far side of this file's
        ; storage block and a 16-bit displacement is not guaranteed to reach
        ; it -- the same limit main_glue.s:220-224 documents.
        jsr     uade_song_entry         ; d0 = index -> a0 = the row
        move.l  (a0),a1                 ; module source (ANY ram)
        move.l  4(a0),d1                ; module length
        moveq   #0,d0
        bra.b   .out
        endc
        ifd     UADE_MODULE_BYTES
        ifne    UADE_MODULE_BYTES
        lea     uade_module_name,a0
        move.l  a2,a1
        bsr.b   .stricmp
        tst.l   d0
        bne.b   .reallynotfound
        lea     _uade_module_src,a1
        move.l  _uade_module_len,d1     ; DEViLBOX ADF: patchable length word
        moveq   #0,d0
        bra.b   .out
        endc
        endc
.reallynotfound:
        moveq   #-1,d0
        bra.b   .out
.hit:
        move.l  4(a3),d0                ; offset into the blob
        lea     _uade_files_blob,a1
        adda.l  d0,a1
        move.l  8(a3),d1                ; length
        moveq   #0,d0
.out:
        movem.l (sp)+,d2-d4/a2-a3/a5
        rts

; d0 = 0 when the two NUL-terminated strings match ignoring case.
.stricmp:
        move.b  (a0)+,d2
        move.b  (a1)+,d3
        cmpi.b  #'A',d2
        blo.b   .c1
        cmpi.b  #'Z',d2
        bhi.b   .c1
        addi.b  #32,d2
.c1:
        cmpi.b  #'A',d3
        blo.b   .c2
        cmpi.b  #'Z',d3
        bhi.b   .c2
        addi.b  #32,d3
.c2:
        cmp.b   d2,d3
        bne.b   .differ
        tst.b   d2
        bne.b   .stricmp
        moveq   #0,d0
        rts
.differ:
        moveq   #-1,d0
        rts

; ===========================================================================
; Storage. IN THE CODE SECTION, next to the routines that reach it with (pc)
; addressing -- music_glue.s:220-224 documents why: a data section is ~128 KB
; away in this link and every PC-relative reference to it blew the 16-bit
; displacement.
; ===========================================================================
        even
        xdef    uade_priv_handler
uade_priv_handler:      dc.l 0
        xdef    _uade_vbl_seen
_uade_vbl_seen:         dc.l 0
_uade_switch_intena:    dc.w 0          ; INTENA bits step 1b masked, to put back
        even
_uade_reloc_base:       dc.l 0
_uade_mod_base:         dc.l 0
_uade_host_sp:          dc.l 0
_uade_score_sp:         dc.l 0
_uade_saved_execbase:   dc.l 0
; The vectors score can take. $64/$68/$6c/$70/$74 come from score.s's `vectab`
; (4125-4130), which exec_set_int_vector indexes by interrupt number; $78 is
; written directly by add_ciab_interrupt and $68 by add_ciaa_interrupt. $6c is
; in the list because score's table names it -- the demo owns that vector and
; the PORT gates score's own install of it, but if a player ever reaches it
; through SetIntVector we want the demo's back.
UADE_VEC_COUNT          equ     6
uade_vec_list:          dc.w    $64,$68,$6c,$70,$74,$78
_uade_saved_vecs:       ds.l    UADE_VEC_COUNT
_uade_saved_intena:     dc.w 0
        CIA_SAVE_STORAGE _uade_saved_cia
_uade_installed:        dc.w 0
_uade_dead:             dc.w 0
_uade_gated:            dc.w 0
_uade_want_subsong:     dc.w 0

; A musicdisk playlist's current/pending song. Always defined -- even a
; single-song build publishes these two words, so the locator block's shape
; does not change between the two build modes -- but only ever written by
; _music_select/uade_do_switch, which are compiled in only when the project
; staged a playlist (UADE_SONG_COUNT).
        xdef    _uade_cur_name
; The CURRENT song's original module name. score's split_module_name reads it
; through $128 and a DTP_ExtLoad player derives its companion's name from the
; result (mdat.hbtitle -> smpl.hbtitle), so it has to follow the song across
; every switch -- not be captured once at boot.
_uade_cur_name:         dc.l    0

        xdef    _uade_cur_song
        ifd     UADE_SONG_COUNT
_uade_cur_song:         dc.w    UADE_START_SONG
        else
_uade_cur_song:         dc.w    0
        endc
        xdef    _uade_shutdown_step
; How far _music_shutdown got. 0 = never entered (so the main loop never
; returned), 1..5 = the step it reached, 9 = complete. Published so a frozen
; machine can be asked, instead of guessed at.
_uade_shutdown_step:    dc.w    0
; The demo's UI tick, for the length of a switch that will not return. A
; player's init runs to completion in the MAIN LOOP -- score only yields at
; waittrap, which an init never reaches -- so a slow one takes the whole demo
; with it: PreTracker (song 67 of the owner's disk) starts its audio within a
; second and then keeps initialising for 102 MORE seconds, measured, with the
; selector frozen on whatever frame it had drawn. The music is fine; only the
; UI is gone.
; So the VBlank drives the UI itself while that lasts. The effect registers
; this; nothing registers it in any other build, and a null pointer is simply
; not called.
        xdef    _uade_set_ui_tick
_uade_set_ui_tick:
        move.l  4(sp),d0
        lea     _uade_ui_tick(pc),a0
        move.l  d0,(a0)
        rts

        xdef    _uade_switch_step
; HOW FAR uade_do_switch GOT. A switch that never returns takes the demo's
; main loop with it (the pump calls it), and "frozen inside the switch" is
; four very different failures -- score's stop hooks, the teardown, the module
; copy, the incoming player's init. Read it with _uade_switching: non-zero
; switching plus a step is the answer, and it costs one word per step.
; 0 = not in a switch, 1..7 = the numbered steps, 9 = returned.
_uade_switch_step:      dc.l    0
_uade_ui_tick:          dc.l    0       ; C callback, or 0
        xdef    _uade_ciaa_hits
; Interrupt arrivals, so a silent song can be asked whether its player's timer
; is firing at all. score's own uade_ciaa_seen is UADE_PROBE-only and a demo
; build never defines that.
_uade_ciaa_hits:        dc.l    0
        xdef    _uade_lev2_hits
_uade_lev2_hits:        dc.l    0
        xdef    _uade_ciaa_tb_hits
_uade_ciaa_tb_hits:     dc.l    0       ; dispatches into the player's timer B
        xdef    _uade_req_names
_uade_req_names:        ds.b    4*32    ; the last four LOADFILE names asked for
        xdef    _uade_req_idx
_uade_req_idx:          dc.w    0
_uade_switch_frames:    dc.w    0       ; VBLs this switch has been running
        xdef    _uade_adv_ticks
_uade_adv_ticks:        dc.l    0       ; VBLs since the last auto-advance
        xdef    _uade_pump_seen
_uade_pump_seen:        dc.l    0       ; main-loop liveness (see the pump)
        xdef    _uade_pending_song
_uade_pending_song:     dc.w    -1              ; -1 = nothing pending
        xdef    _uade_rmb_held
_uade_rmb_held:         dc.w    0       ; skip edge latch: 1 while any skip
                                        ;   input is held (legacy behaviour)
;*--- PORT: SEPARATE EDGE COUNTERS, so a selector screen can tell the three
;     inputs apart. uade_poll_skip used to collapse fire, RMB and ALL FOUR
;     joystick directions into one "next song" latch -- correct for a disk
;     with no UI, useless for one with a cursor. Each counter is bumped once
;     per PRESS (never while held) and is read-and-cleared by whoever consumes
;     it, outside the interrupt. A counter rather than a flag so a press that
;     lands between two reads is not lost.
        xdef    _uade_ev_up
        xdef    _uade_ev_down
        xdef    _uade_ev_fire
        xdef    _uade_selector
_uade_ev_up:            dc.w    0
_uade_ev_down:          dc.w    0
_uade_ev_fire:          dc.w    0
; 0 = no selector on this disk: uade_poll_skip keeps its original behaviour
; and ANY input skips to the next song. A selector effect sets this to 1 in
; its init, and from then on the counters above are the only thing the poll
; does with the inputs. Default 0 so every build that exists today is
; bit-for-bit unchanged in behaviour.
_uade_selector:         dc.w    0
        xdef    _uade_cur_title
        xdef    _uade_cur_composer
; Pointers INTO the staged string table (uade_song_title_N / _composer_N),
; NUL-terminated, 31 chars max -- the bound stage_songs truncates to. Zero
; until the first switch publishes one, so any reader must tolerate NULL.
_uade_cur_title:        dc.l    0
_uade_cur_composer:     dc.l    0
; Set for the duration of uade_do_switch's call (bracketed by
; _music_select_pump), so _music_play1/_music_play2 -- reachable from a
; VBlank that preempts the pump, since VERTB is never masked -- do not touch
; score's coroutine while it is mid-teardown/rebuild.
_uade_switching:        dc.w    0
; 1 once score's one-time `start` has run. See uade_do_switch step 4.
_uade_score_started:    dc.w    0
; Set only across uade_do_switch's teardown + arena rewrite, never across the
; incoming player's init. See _music_play1 for why the two flags are separate.
_uade_quiesced:         dc.w    0

        xdef    _uade_playing
        xdef    _uade_dead
        xdef    _uade_song_ended
        xdef    _uade_fatal
        xdef    _uade_playername
        xdef    _uade_modulename
        xdef    _uade_formatname
        xdef    _uade_missing_lvo_ret
        xdef    _uade_missing_lvo_off
_uade_playing:          dc.w 0
_uade_song_ended:       dc.w 0
_uade_fatal:            dc.l 0

; d0-d7 then a0-a7, as movem stores them, at the moment of a fault. The buffer
; lives HERE and not in the probe rig because _uade_publish_info puts its
; address in the locator block, which every uade build publishes -- a demo
; build links no probe, so a buffer defined there left the backend unlinkable.
; The probe and any other fault handler write into it; nothing else does.
        even
uade_regs:              ds.l 16
_uade_sub_min:          dc.l 0
_uade_sub_cur:          dc.l 0
_uade_sub_max:          dc.l 0
_uade_missing_lvo_ret:  dc.l 0
_uade_missing_lvo_off:  dc.l 0
; The device reachability oracle: only score's PLAYERNAME message, dispatched
; by the trap handler above, can put the player's name here.
        xdef    _uade_lastmsg
        xdef    _uade_msg_count
_uade_msg_count:        dc.w 0
_uade_lastmsg:          ds.b 96
; A RING of the last UADE_MSG_SLOTS messages, not just the newest.
;
; score's LOG_CALL sites (38 of them, compiled in under UADE_TEST_LOGGING)
; arrive here as ordinary messages, so this IS UADE's own call trace -- the
; harness the plan wanted to build on the host was already arriving on the
; device and being thrown away one message at a time. Keeping only the newest
; answers "where did it get to" and has twice been mistaken for "where did it
; die": SetIntVector and call_init_sound both named a site that had already
; RETURNED. The sequence is what identifies a fault; a single frame does not.
UADE_MSG_SLOTS          equ     24
UADE_MSG_SLOT_BYTES     equ     96
        xdef    _uade_missing_file
_uade_missing_file:     ds.b 64
        xdef    _uade_msgring
_uade_msgring:          ds.b UADE_MSG_SLOTS*UADE_MSG_SLOT_BYTES
_uade_msgring_idx:      dc.w 0
_uade_playername:       ds.b 32
_uade_modulename:       ds.b 32
_uade_formatname:       ds.b 32
        even
_uade_lowmem_save:      ds.b UADE_MSG_END-$100

; ---------------------------------------------------------------------------
; The player hunkexe and the module, in ANY RAM: the player is relocated into
; chip by score's own relocator.s, and the module is copied into chip at init.
; Neither is DMA'd from here.
; ---------------------------------------------------------------------------
        section uadedata,data
        even
; Staged by tools/uade_stage.py from the project's music.filename and whichever
; player its eagleplayer.conf prefix resolves to -- NOT hardcoded to a pilot.
; A playlist build (UADE_SONG_COUNT) never writes current.uadeplayer/
; current.uademod -- stage_songs() writes one uade_player_N per DISTINCT
; player (incbin'd from uade_sizes.i itself, alongside uade_song_table) and
; one current.uademods.bin blob of every module concatenated, addressed
; through _uade_mods_src+offset. Both incbins below are single-song only, so
; a playlist build never tries to open a file that mode does not produce.
_uade_player_src:
        ifnd    UADE_SONG_COUNT
        incbin  "current.uadeplayer"
        endc
        even
; DEViLBOX ADF: the real module length. UADE_MODULE_BYTES is the slot size
; (the arena is sized for it); the browser patches this word and the slot.
        xdef    _uade_module_len
        xdef    _uade_module_src
        cnop    0,4
_uade_module_len:
        dc.l    UADE_MODULE_LEN
_uade_module_src:
        ifnd    UADE_SONG_COUNT
        incbin  "current.uademod"
        endc
        even
; The blob every uade_song_table row indexes with _uade_mods_src+offset
; (tools/uade_stage.py's stage_songs(), which concatenates every song's
; module in playlist order). Single-song only, so nothing here.
_uade_mods_src:
        ifd     UADE_SONG_COUNT
        incbin  "current.uademods.bin"
        endc
        even
; The companion files a DTP_ExtLoad format asks for, plus the name/offset/length
; table indexing them. Both generated by tools/uade_stage.py; when a format has
; no companions the table is empty and UADE_FILE_COUNT is 0.
;
; BOTH build modes come through the generated pair now. The playlist path used
; to hardcode `UADE_FILE_COUNT equ 0` and an empty table here, because
; stage_songs() stages no per-song DTP_ExtLoad companions (it rejects those
; formats at build time -- $128, score's module-name pointer, is cleared for
; every playlist song). That empty table is exactly what the AHX waveform cache
; needed: the table is the ONLY seam a player has for asking the host for a
; file, and AbyssHighestExperience asks for ENV:EaglePlayer/ahx at every init.
; stage_songs() therefore calls emit_file_table() too -- with no companions and
; either the two AHX waveform entries or nothing at all, which reproduces the
; old empty table byte for byte when the playlist has no AHX v2 song.
_uade_files_blob:
        incbin  "current.uadefiles.bin"
        even
        include "current.uadefiles.i"

; ---------------------------------------------------------------------------
; Chip RAM. One contiguous arena, because score derives the pool start from the
; module (reloc_success). Layout, low to high:
;     [ relocated player hunks ][ module ][ AllocMem pool ]
; It is bss_c, so it costs nothing in the executable and it shows up in the
; hunk header with HUNKF_CHIP set -- which is what makes
; tools/check_ram_budget.py gate the build on it with no new code.
; ---------------------------------------------------------------------------
        section uadechip,bss_c
        even
_uade_zero_sample:      ds.w 2
        even
; A playlist's worst song, not any one song's own formula -- the stager
; already computed the max over the whole set (tools/uade_stage.py's
; stage_songs()), because the assembler cannot.
        ifd     UADE_SONG_COUNT
_uade_arena:            ds.b UADE_ARENA_BYTES_MAX
        else
_uade_arena:            ds.b UADE_ARENA_BYTES
        endc
_uade_arena_end:

        section uadeany,bss
        even
_uade_any_arena:        ds.b UADE_ANY_BYTES
_uade_any_arena_end:

        section uadestack,bss
        even
_uade_score_stack:      ds.b UADE_SCORE_STACK_BYTES
_uade_score_stack_end:
        even
_uade_user_stack:       ds.b UADE_SCORE_STACK_BYTES
_uade_user_stack_end:
; HEADROOM FOR SCORE'S OWN GUARD WRITE, and it is not optional.
; score.s:181-183 does `move.l $114,a7 / move.l #'WALL',(a7)` and
; `move.l $110,a0 / move.l #'WALL',(a0)` -- it writes a longword AT each stack
; top it is handed, not below it. $114 gets _uade_score_stack_end, which is the
; first longword of the user stack and therefore still inside this section; $110
; gets _uade_user_stack_end, which without this pad is the first longword PAST
; it. vlink gives this section its own hunk, so AmigaDOS allocates it with its
; length in the longword immediately before the NEXT hunk's data -- and the two
; landed adjacent, so score's guard wrote 'WALL' straight over that length.
; UnLoadSeg then freed hunk 14 as 0x57414C4C bytes and Exec raised AN_MemCorrupt
; (Guru 8100 0005) as the demo exited. Measured 2026-09-21: the hunk header at
; $3FE8F0 read `57 41 4C 4C` where the exe says 0x808 (2048+8).
        ds.l    2

; score.s last: it opens its own section, and its `end` directive must be the
; final thing the assembler sees.
        include "score/score.s"

        ENDC                            ; UPROUGH_NO_MUSIC
