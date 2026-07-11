/*
 * maxtrax_harness.c — MaxTrax WASM player harness
 *
 * Unity-build: #includes the transpiled maxtrax.c as a single TU.
 * Provides exec/DOS/audio.device OS shims so MaxTrax can initialize
 * and play without any real Amiga libraries.
 * Audio output is routed through paula_soft.h/.c.
 *
 * Calling order for playback:
 *   maxtrax_load(data, len, score)  — load + start
 *   maxtrax_render(buf, frames)     — render loop (F32 stereo @ 28150 Hz)
 *   maxtrax_stop()                  — stop + free
 */

#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdio.h>

/* Paula emulator API + PAULA_CHANNELS / PAULA_RATE_PAL constants. Also
 * #included (idempotently, #pragma once) from within maxtrax.c below, but
 * pulled in here first so the per-channel write FIFO can size on PAULA_CHANNELS. */
#include "paula_soft.h"

/* -----------------------------------------------------------------------
 * Debug instrumentation gate.
 *
 * The player's OS shims (BeginIO / ReadFunc / the VBlank driver / render)
 * carry printf probes used to lock-step the transpiled replayer against the
 * original 68k. They stay in the source for future debugging but compile out
 * by default — when active they fire up to 50×/sec and each one round-trips
 * through printErr → postMessage, which is not shippable. Build with
 * -DMXTX_DEBUG (see CMakeLists.txt) to re-enable them.
 * ---------------------------------------------------------------------- */
#ifdef MXTX_DEBUG
#define MXTX_DBG(...) fprintf(stderr, __VA_ARGS__)
#else
#define MXTX_DBG(...) ((void)0)
#endif

/* Ceiling on BeginIO-W note-stream probe prints. Default keeps shipped WASM
 * logs short; native trace driver overrides to dump the full stream. */
#ifndef MXTX_BEGINIO_GATE
#define MXTX_BEGINIO_GATE 12
#endif

/* -----------------------------------------------------------------------
 * Fake exec base
 *
 * MaxTrax calls _SysBase to get the exec library base, then reads fields
 * like VBlankFrequency (offset 530) and ex_EClockFrequency (offset 556).
 * We provide a static buffer and a 4-byte holder (g_sysbase_store) whose
 * contents — read as a big-endian uint32_t — yield the address of the
 * buffer so that READ32(_SysBase) → a6 → g_fake_exec.
 * ---------------------------------------------------------------------- */
static uint8_t g_fake_exec[600];    /* fake ExecBase, byte-addressable     */
static uint8_t g_sysbase_store[4];  /* big-endian ptr to g_fake_exec       */

/* Fake GfxBase (MaxTrax reads PALn from it when LIB_VERSION < 36).       */
static uint8_t g_fake_gfx[48];          /* ≥ (gb_DisplayFlags+2) bytes    */
static uint8_t g_gfxbase_store[4];      /* big-endian ptr to g_fake_gfx   */

/* Fake audio.device base (must survive READ16(addr+20) for LIB_VERSION). */
static uint8_t g_fake_audio_dev[64];

/* All #ifndef-guarded in maxtrax.c — our defines take precedence.         */
#define _SysBase           ((uintptr_t)g_sysbase_store)
#define _GfxBase           ((uintptr_t)g_gfxbase_store)
#define _DOSBase           ((uintptr_t)g_sysbase_store)  /* shims ignore a6 */
#define VBlankFrequency    530   /* ExecBase.VBlankFrequency offset (AmigaOS) */
#define LIB_VERSION        20    /* Library.lib_Version offset               */
#define gb_DisplayFlags    22    /* GfxBase.gb_DisplayFlags offset           */
#define PALn               1     /* bit 1 of gb_DisplayFlags+1 = PAL flag   */
#define ex_EClockFrequency 556   /* ExecBase.ex_EClockFrequency offset       */

/* -----------------------------------------------------------------------
 * 68k software stack
 * The transpiled code uses `sp` as a software stack (grows downward).
 * Must be initialised before any 68k function is called.
 * ---------------------------------------------------------------------- */
#define STACK_SIZE 32768
static uint8_t g_stack[STACK_SIZE];

/* -----------------------------------------------------------------------
 * In-memory "file" served through _LVOOpen / _LVORead / _LVOSeek
 * ---------------------------------------------------------------------- */
static const uint8_t *g_file_data = NULL;
static uint32_t       g_file_size = 0;
static uint32_t       g_file_pos  = 0;
#define MXTX_FH  1   /* fake BCPL file handle */

/* -----------------------------------------------------------------------
 * IOAudio free-block FIFO queue
 *
 * MaxTrax calls _LVOReplyMsg to return a free IOAudio block and
 * _LVOGetMsg to dequeue one before starting a new note.  We maintain a
 * simple circular buffer of 68k-space block addresses.
 * ---------------------------------------------------------------------- */
/* One FIFO pool per AmigaOS message port (keyed by port address).
 *
 * MaxTrax uses TWO distinct ports and a block returns ONLY to its own reply
 * port (io_Message.mn_ReplyPort):
 *   _play_port — the 3*NUM_VOICES CMD_WRITE blocks cycle here; note-on
 *                GetMsg(_play_port) pulls a free one, sets CMD_WRITE, sends it,
 *                and audio.device replies it here on DMA completion.
 *   _temp_port — the single ADCMD_PERVOL _audio_env block (IOF_QUICK /
 *                synchronous). MaxTrax owns it permanently via the _audio_env
 *                pointer and NEVER GetMsg's it.
 * A single shared ring collapses both ports, letting the env block leak into
 * _play_port's pool where a later note-on GetMsg grabs it and overwrites its
 * IO_COMMAND=ADCMD_PERVOL with CMD_WRITE — corrupting the entire volume-
 * envelope stream. Keying the pool by reply port preserves audio.device port
 * semantics so the env block can never be dequeued by a note-on. */
#define IOA_QUEUE_CAP 32
#define IOA_MAX_PORTS 4
typedef struct { uint32_t port; uint32_t q[IOA_QUEUE_CAP]; int head, tail; } IoaRing;
static IoaRing g_ioa_rings[IOA_MAX_PORTS];
static int g_ioa_ring_count = 0;

/* Free-pool depth reached during the pure SEED phase — before the first
 * note-on GetMsg dequeues a block. OpenMusic seeds `3*NUM_VOICES` (=12)
 * CMD_WRITE blocks into _play_port during init, all enqueued up front, so this
 * equals the seed count: 12 when the seed immediate `#3*NUM_VOICES-1`
 * transpiles correctly, ~4 when it collapses to its leading digit. Tracking is
 * frozen at the first dequeue (g_ioa_dequeued) so ongoing block returns during
 * playback — which otherwise saturate the ring — can't contaminate it.
 * Exported as the seed-bug lockstep signal. */
static int g_ioa_peak_depth = 0;
static int g_ioa_dequeued = 0;

/* Find (or lazily create) the FIFO for a given port address. */
static IoaRing *ioa_ring_for(uint32_t port) {
    int i = 0;
    while (i < g_ioa_ring_count) { if (g_ioa_rings[i].port == port) return &g_ioa_rings[i]; i++; }
    if (g_ioa_ring_count < IOA_MAX_PORTS) {
        IoaRing *r = &g_ioa_rings[g_ioa_ring_count++];
        r->port = port; r->head = r->tail = 0; return r;
    }
    return NULL;   /* more ports than expected — should not happen */
}

/* Return an IOAudio block to a specific port's free pool (ReplyMsg to port). */
static void ioa_enqueue_port(uint32_t port, uint32_t addr) {
    IoaRing *r = ioa_ring_for(port);
    if (!r) return;
    int next = (r->tail + 1) % IOA_QUEUE_CAP;
    if (next == r->head) return;   /* full — drop (should not happen)  */
    r->q[r->tail] = addr;
    r->tail = next;
    if (!g_ioa_dequeued) {
      int depth = (r->tail - r->head + IOA_QUEUE_CAP) % IOA_QUEUE_CAP;
      if (depth > g_ioa_peak_depth) g_ioa_peak_depth = depth;
    }
    { static int _eq = 0;
      if (_eq < 16) { _eq++; MXTX_DBG("[ioa] enqueue #%d addr=%u port=%u depth=%d\n",
          _eq, addr, port, (r->tail - r->head + IOA_QUEUE_CAP) % IOA_QUEUE_CAP); } }
}

/* Dequeue a free block from a specific port's pool (GetMsg(port)). */
static uint32_t ioa_dequeue_port(uint32_t port) {
    IoaRing *r = ioa_ring_for(port);
    if (!r || r->head == r->tail) {
        static int _emp = 0;
        if (_emp < 8) { _emp++; MXTX_DBG("[ioa] GetMsg EMPTY port=%u #%d\n", port, _emp); }
        return 0;   /* empty */
    }
    g_ioa_dequeued = 1;   /* freeze seed-depth tracking: seed phase is over */
    uint32_t addr = r->q[r->head];
    r->head = (r->head + 1) % IOA_QUEUE_CAP;
    return addr;
}

static void ioa_reset(void) {
    int i = 0;
    while (i < g_ioa_ring_count) { g_ioa_rings[i].head = g_ioa_rings[i].tail = 0; i++; }
    g_ioa_ring_count = 0;
}

/* -----------------------------------------------------------------------
 * Per-channel CMD_WRITE FIFO — faithful port of audiodevice.c _write_msg_list.
 *
 * MaxTrax issues CMD_WRITE per channel: an attack (ioa_Cycles==1, one-shot)
 * then a sustain (ioa_Cycles==0, loops). The audio.device starts the head
 * write, queues the rest, and on DMA completion of a one-shot replies that
 * block to the free pool and starts the next queued write. This queue holds
 * the 68k-space IOAudio block addresses currently owned by the "device"
 * (i.e. NOT yet replied). Distinct from the per-port free pools
 * (g_ioa_rings), which MaxTrax reads via GetMsg.
 * ---------------------------------------------------------------------- */
#define WR_CAP 8
static uint32_t g_wr[PAULA_CHANNELS][WR_CAP];
static int      g_wr_head[PAULA_CHANNELS];
static int      g_wr_count[PAULA_CHANNELS];

static uint32_t wr_at(int ch, int i)   { return g_wr[ch][(g_wr_head[ch] + i) % WR_CAP]; }
static uint32_t wr_head(int ch)        { return g_wr_count[ch] ? wr_at(ch, 0) : 0; }
static void     wr_push(int ch, uint32_t blk) {
    if (g_wr_count[ch] >= WR_CAP) return;   /* full — drop (should not happen) */
    g_wr[ch][(g_wr_head[ch] + g_wr_count[ch]) % WR_CAP] = blk;
    g_wr_count[ch]++;
}
static void     wr_pop(int ch)  { if (g_wr_count[ch]) { g_wr_head[ch] = (g_wr_head[ch] + 1) % WR_CAP; g_wr_count[ch]--; } }
static void     wr_clear_all(void) {
    for (int c = 0; c < PAULA_CHANNELS; c++) { g_wr_head[c] = 0; g_wr_count[c] = 0; }
}

/* VBlank ISR function pointer captured by _LVOAddIntServer               */
static uint32_t g_vblank_code = 0;

/* Debug counters (cleared on each maxtrax_load call) */
static int g_vblank_count = 0;
static int g_beginio_count = 0;

/* Per-command BeginIO tallies — always on (cheap ints), exported for the
 * lockstep regression test. Indexed: 0=CMD_WRITE, 1=CMD_FLUSH, 2=ADCMD_PERVOL,
 * 3=other. A healthy render is PERVOL-dominant (the volume-envelope stream);
 * if the _audio_env reply-port fix regresses, PERVOL collapses and CMD_WRITE
 * dominates as the env block gets reused as a sample restart. Cleared on load. */
static int g_cmd_count[4] = {0,0,0,0};

/* Samples rendered since last VBlank — fires ISR every VBLANK_SAMPLES    */
static int g_vblank_accum = 0;

/* Total frames rendered since load — sample-time stamp for BeginIO diff.
 * Advanced tick start in maxtrax_render before that tick's paula_render, so a
 * BeginIO fired inside vblank() logs the start-of-tick sample index.         */
long g_render_clock = 0;

/* 28150 / 50 = 563 samples per 50 Hz VBlank tick                         */
#define VBLANK_SAMPLES (PAULA_RATE_PAL / 50)

/* emscripten.h MUST come before the unity include: maxtrax.c defines
 * short macros (volume, value, flags, to, number) that clobber parameter
 * names in emscripten.h headers if included after.                        */
#ifdef __EMSCRIPTEN__
#  include <emscripten.h>
#  define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#  define EXPORT
#endif

/* Debug: trace indirect mxtx_*Func calls (LoadPerf file-IO callbacks).
 * MXTX_CALL replaces the raw fn-ptr call in maxtrax.c via sed patch.      */
static int g_mxtx_call_dbg = 0;
#define MXTX_CALL(off) do { \
    uint32_t _p = READ32((uintptr_t)_maxtrax + (off)); \
    if (g_mxtx_call_dbg < 8) { g_mxtx_call_dbg++; \
        MXTX_DBG("[mxtx] indirect " #off " ptr=%u\n", _p); } \
    ((void(*)(void))(uintptr_t)_p)(); } while (0)

/* -----------------------------------------------------------------------
 * Unity build: include the transpiled maxtrax.c
 * After this #include the READ/WRITE macros, hw_write{8,16,32}, and the
 * 68k register globals (d0..d7, a0..a6, sp) are all in scope.
 * ---------------------------------------------------------------------- */
#include "generated/maxtrax/maxtrax.c"

/* -----------------------------------------------------------------------
 * Helpers used by multiple shims
 * ---------------------------------------------------------------------- */

/* Write a host pointer as a big-endian uint32 into a 4-byte holder.      */
static void store_ptr32(uint8_t *holder, const void *ptr) {
    uint32_t v = (uint32_t)(uintptr_t)ptr;
    holder[0] = (uint8_t)(v >> 24);
    holder[1] = (uint8_t)(v >> 16);
    holder[2] = (uint8_t)(v >>  8);
    holder[3] = (uint8_t)(v      );
}

/* -----------------------------------------------------------------------
 * OS shim functions
 *
 * In --lib-mode the transpiler emits `extern void` decls for every OS
 * call, so these definitions are resolved at link time from this TU.
 * None of our shims use a6 (the library base register) — all state lives
 * in the globals above.
 * ---------------------------------------------------------------------- */

/* exec AllocMem(d0=size, d1=flags) → d0=ptr|0                            */
void _LVOAllocMem(void) {
    uint32_t _sz = d0;
    void *p = calloc(1, (size_t)d0);
    d0 = (uint32_t)(uintptr_t)p;
#ifdef MXTX_DEBUG
    MXTX_DBG("[AllocMem] ptr=%u size=%u\n", d0, _sz);
#endif
}

/* exec FreeMem(a1=ptr, d0=size)                                           */
void _LVOFreeMem(void) {
#ifdef MXTX_DEBUG
    static int g_freemem_calls = 0;
    MXTX_DBG("[FreeMem] #%d ptr=%u size=%u\n", ++g_freemem_calls, a1, d0);
#endif
    free((void *)(uintptr_t)a1);
    d0 = 0;
}

/* exec CopyMem(a0=src, a1=dst, d0=len)                                    */
void _LVOCopyMem(void) {
    memcpy((void *)(uintptr_t)a1, (void *)(uintptr_t)a0, (size_t)d0);
}

/* exec AddIntServer(d0=intnum, a1=IS_Node)
 * Capture the VBlank ISR pointer stored at IS_CODE (offset 18 from the
 * Interrupt struct start: IS_NODE=14 bytes + IS_DATA=4 bytes = 18).      */
void _LVOAddIntServer(void) {
    if (d0 == 5 /* INTB_VERTB */) {
        g_vblank_code = READ32(a1 + 18u /* IS_CODE */);
    }
    d0 = 0;
}

/* exec RemIntServer(d0=intnum, a1=IS_Node)                                */
void _LVORemIntServer(void) {
    if (d0 == 5) g_vblank_code = 0;
    d0 = 0;
}

/* exec GetMsg(a0=port) → d0=msg|0  — dequeue a free IOAudio block from the
 * pool of the requested port (note-on passes _play_port; _temp_port is never
 * GetMsg'd, so the _audio_env PERVOL block can never be pulled here).       */
void _LVOGetMsg(void) {
    d0 = ioa_dequeue_port(a0);
}

/* exec ReplyMsg(a1=msg)  — return a block to ITS reply port (mn_ReplyPort). */
void _LVOReplyMsg(void) {
    ioa_enqueue_port(READ32(a1 + MN_REPLYPORT), (uint32_t)a1);
}

/* exec PutMsg(a0=port, a1=msg)  — enqueue to the named port (stop_audio path) */
void _LVOPutMsg(void) {
    ioa_enqueue_port(a0, (uint32_t)a1);
}

/* exec Signal(a1=task, d0=sigmask)  — no-op in our single-threaded model */
void _LVOSignal(void) {
    d0 = 0;
}

/* exec Cause(a1=interrupt)  — invoke IS_CODE from the interrupt node
 * AmigaOS convention: IS_CODE(a1=IS_DATA).  MusicVBlank calls
 * Cause(_music_server) to schedule MusicServer; without this, no notes
 * are ever triggered and all audio is silent.                             */
void _LVOCause(void) {
    typedef void (*ISRFn)(void);
    uint32_t is_node = a1;
    uint32_t is_code = READ32(is_node + 18u /* IS_CODE */);
    if (is_code) {
        uint32_t saved_a1 = a1;
        a1 = READ32(is_node + 14u /* IS_DATA */);
        ISRFn fn = (ISRFn)(uintptr_t)is_code;
        fn();
        a1 = saved_a1;
    }
}

/* exec FindTask(a1=name)  — no task system                                */
void _LVOFindTask(void) {
    d0 = 0;
}

/* exec CreateMsgPort()  — return a non-zero sentinel                      */
void _LVOCreateMsgPort(void) {
    d0 = (uint32_t)(uintptr_t)g_sysbase_store;
}

/* exec DeleteMsgPort(a0)  — no-op                                         */
void _LVODeleteMsgPort(void) {
}

/* audio.device OpenDevice(a0=devname, d0=unit, a1=ioreq, d1=flags)
 * Write the fake audio device base address into IO_DEVICE(a1) so that
 * MaxTrax can store it in _AudioDevice.  Return d0=0 (success).          */
void _LVOOpenDevice(void) {
    uint32_t fake_dev = (uint32_t)(uintptr_t)g_fake_audio_dev;
    hw_write32(a1 + 20u /* IO_DEVICE */, fake_dev);
    d0 = 0;
}

/* audio.device CloseDevice(a1=ioreq)  — no-op                             */
void _LVOCloseDevice(void) {
    d0 = 0;
}

/* DOS Open(d1=filename_bcpl_ptr, d2=mode) → d0=fh|0                      */
void _LVOOpen(void) {
    if (d1 == 0 || g_file_data == NULL) { d0 = 0; return; }
    g_file_pos = 0;
    d0 = MXTX_FH;
}

/* DOS Read(d1=fh, d2=buf, d3=len) → d0=bytes_read|-1                     */
void _LVORead(void) {
#ifdef MXTX_DEBUG
    static int g_read_calls = 0;
    if (++g_read_calls <= 40 || (g_read_calls % 1000) == 0)
        MXTX_DBG("[Read] #%d fh=%u len=%u pos=%u size=%u\n", g_read_calls, d1, d3, g_file_pos, g_file_size);
    if (g_read_calls > 200000) { MXTX_DBG("[Read] ABORT: >200k reads (infinite loop) pos=%u\n", g_file_pos); abort(); }
#endif
    if (d1 != MXTX_FH || g_file_data == NULL) { d0 = (uint32_t)-1; return; }
    uint32_t remain = g_file_size - g_file_pos;
    uint32_t n = (d3 < remain) ? d3 : remain;
    if (n > 0 && d2 != 0) {
        memcpy((void *)(uintptr_t)d2, g_file_data + g_file_pos, (size_t)n);
        g_file_pos += n;
    }
    d0 = (uint32_t)n;
}

/* DOS Close(d1=fh) → d0=DOSTRUE                                           */
void _LVOClose(void) {
    d0 = (uint32_t)-1; /* DOSTRUE */
}

/* DOS Seek(d1=fh, d2=offset, d3=mode) → d0=old_pos|-1                    */
void _LVOSeek(void) {
    if (d1 != MXTX_FH) { d0 = (uint32_t)-1; return; }
    int32_t  offset = (int32_t)d2;
    int32_t  mode   = (int32_t)d3;
    uint32_t oldpos = g_file_pos;
    int64_t  np;
    /* AmigaDOS Seek modes: OFFSET_BEGINNING=-1, OFFSET_CURRENT=0, OFFSET_END=1 */
    if (mode == -1 /* OFFSET_BEGINNING */) {
        np = (int64_t)offset;
    } else if (mode == 0 /* OFFSET_CURRENT */) {
        np = (int64_t)g_file_pos + offset;
    } else { /* OFFSET_END = 1 */
        np = (int64_t)g_file_size + offset;
    }
    if (np < 0) np = 0;
    if (np > (int64_t)g_file_size) np = (int64_t)g_file_size;
    g_file_pos = (uint32_t)np;
    d0 = (uint32_t)oldpos;
}

/* -----------------------------------------------------------------------
 * audio.device BeginIO shim
 *
 * Called with a6=_AudioDevice, a1=IOAudio block pointer.
 * Decodes the IOAudio block and drives paula_soft accordingly.
 *
 * IOAudio field offsets (from maxtrax.c defines):
 *   IO_UNIT     = 24  (ULONG  channel bitmask: bit0=ch0 … bit3=ch3)
 *   IO_COMMAND  = 28  (UWORD  command)
 *   IO_ERROR    = 31  (UBYTE  error code, 0 = success)
 *   ioa_Data    = 50  (APTR   sample data pointer)
 *   ioa_Length  = 54  (ULONG  length in BYTES)
 *   ioa_Period  = 58  (UWORD  Paula period)
 *   ioa_Volume  = 60  (UWORD  volume 0-64, low byte used)
 *   ioa_Cycles  = 62  (UWORD  1=one-shot attack, 0=loop sustain)
 *
 * Attack/sustain model (MaxTrax two-phase notes):
 *   ioa_Cycles=1  → one-shot attack → paula_set_* + DMA on (one-shot)
 *   ioa_Cycles=0  → looped sustain  → paula_set_next() (queued buffer)
 *
 * After DEV_BEGINIO, the block is immediately re-enqueued (simulates
 * the IOF_QUICK DMA-complete callback that returns the block to _play_port).
 * ---------------------------------------------------------------------- */
/* audio.device command constants (from maxtrax.c / amiga-ndk devices/audio.i). */
#define AD_CMD_WRITE   3u    /* CMD_WRITE     — start/queue a DMA buffer        */
#define AD_CMD_STOP    6u    /* CMD_STOP                                        */
#define AD_CMD_FLUSH   8u    /* CMD_FLUSH     — abort all queued writes (note-off) */
#define AD_ADCMD_PERVOL 12u  /* ADCMD_PERVOL  — live period+volume, no restart  */
#define AD_ADCMD_ALLOC 32u   /* ADCMD_ALLOCATE                                  */

/* IOAudio bitmask → channel index (audiodevice.c uses the low set bit). */
static int mtx_unit_channel(uint32_t io_unit) {
    if      (io_unit & 1u) return 0;
    else if (io_unit & 2u) return 1;
    else if (io_unit & 4u) return 2;
    else if (io_unit & 8u) return 3;
    return -1;
}

/* Start a queued CMD_WRITE block on Paula (audiodevice.c start_audio_dma).
 * cycles==0 ⟹ infinite loop (sustain, never DMA-completes); ==1 ⟹ one-shot. */
static void mtx_start_write(int ch, uint32_t blk) {
    uint32_t data_addr = READ32(blk + 50u /* ioa_Data   */);
    uint32_t len_bytes = READ32(blk + 54u /* ioa_Length */);
    uint16_t period    = (uint16_t)READ16(blk + 58u /* ioa_Period */);
    uint8_t  vol       = (uint8_t) READ8 (blk + 61u /* ioa_Volume low byte */);
    uint16_t cycles    = (uint16_t)READ16(blk + 62u /* ioa_Cycles */);
    paula_set_sample_ptr(ch, (const int8_t *)(uintptr_t)data_addr);
    paula_set_length(ch, (uint16_t)(len_bytes >> 1));
    if (period > 0) paula_set_period(ch, period);
    paula_set_volume(ch, vol);
    paula_set_loop(ch, cycles == 0u ? 1 : 0);
    paula_dma_write((uint16_t)(0x8000u | (1u << ch)));
}

/* Pre-load a queued block as Paula's follow-on buffer so it swaps in gaplessly
 * when the current one-shot DMA completes (audio.device double-buffering). */
static void mtx_preload_next(int ch, uint32_t blk) {
    uint32_t data_addr = READ32(blk + 50u);
    uint32_t len_bytes = READ32(blk + 54u);
    uint16_t period    = (uint16_t)READ16(blk + 58u);
    uint8_t  vol       = (uint8_t) READ8 (blk + 61u);
    uint16_t cycles    = (uint16_t)READ16(blk + 62u);
    paula_set_next(ch, (const int8_t *)(uintptr_t)data_addr,
                   (uint16_t)(len_bytes >> 1), cycles == 0u ? 1 : 0, period, vol);
}

/* audiodevice.c add_write_command: queue the block; start it if the channel is
 * idle, else pre-load it behind the head for a gapless swap. */
static void mtx_add_write(int ch, uint32_t blk) {
    wr_push(ch, blk);
    if (g_wr_count[ch] == 1) {
        mtx_start_write(ch, blk);       /* head — start immediately */
    } else if (g_wr_count[ch] == 2) {
        mtx_preload_next(ch, blk);      /* follow-on — arm the swap */
    }
}

void DEV_BEGINIO(void) {
    g_beginio_count++;
    uint32_t blk = a1;
    uint16_t cmd     = (uint16_t)READ16(blk + 28u /* IO_COMMAND */);
    uint32_t io_unit = READ32(blk + 24u /* IO_UNIT */);
    int ch = mtx_unit_channel(io_unit);

    if (g_beginio_count < MXTX_BEGINIO_GATE)
        MXTX_DBG("[cmd] t=%ld n=%d cmd=%u unit=%u ch=%d\n",
                g_render_clock, g_beginio_count, cmd, io_unit, ch);

    switch (cmd) {
        case AD_CMD_WRITE:    g_cmd_count[0]++; break;
        case AD_CMD_FLUSH:    g_cmd_count[1]++; break;
        case AD_ADCMD_PERVOL: g_cmd_count[2]++; break;
        default:              g_cmd_count[3]++; break;
    }

    switch (cmd) {
    case AD_CMD_WRITE:
        /* Queue per channel; the block is replied to the free pool only when its
         * one-shot DMA completes (see maxtrax_render poll) — NOT here. */
        if (ch >= 0) {
            if (g_beginio_count < MXTX_BEGINIO_GATE) {
                uint16_t cyc = (uint16_t)READ16(blk + 62u);
                MXTX_DBG("[BeginIO-W] t=%ld n=%d ch=%d data=%u len_bytes=%u period=%u vol=%u cycles=%u depth=%d\n",
                        g_render_clock, g_beginio_count, ch, READ32(blk + 50u), READ32(blk + 54u),
                        (uint16_t)READ16(blk + 58u), (uint8_t)READ8(blk + 61u), cyc, g_wr_count[ch]);
            }
            mtx_add_write(ch, blk);
        }
        WRITE8(blk + 31u /* IO_ERROR */, 0u);
        break;

    case AD_CMD_FLUSH:
        /* Note-off: stop every channel in the unit bitmask and reply all its
         * queued writes to the free pool (audiodevice.c CMD_FLUSH). */
        int chn = 0;
        while (chn < PAULA_CHANNELS) {   /* maxtrax.c #defines `for`, so use while */
            if (io_unit & (1u << chn)) {
                paula_channel_dma_off(chn);
                while (g_wr_count[chn]) {
                    uint32_t w = wr_head(chn);
                    ioa_enqueue_port(READ32(w + MN_REPLYPORT), w);   /* → _play_port */
                    wr_pop(chn);
                }
            }
            chn++;
        }
        WRITE8(blk + 31u, 0u);
        ioa_enqueue_port(READ32(blk + MN_REPLYPORT), (uint32_t)blk);  /* reply the flush block itself */
        break;

    case AD_ADCMD_PERVOL:
        /* Live period/volume envelope update on the playing voice — no restart.
         * Replies to _temp_port (the env block's own reply port), NOT the
         * note-on GetMsg pool, so it can never be reused as a CMD_WRITE block. */
        if (ch >= 0) {
            uint8_t  vol    = (uint8_t) READ8 (blk + 61u);
            uint16_t period = (uint16_t)READ16(blk + 58u);
            paula_set_volume(ch, vol);
            if (period > 0) paula_set_period(ch, period);
        }
        WRITE8(blk + 31u, 0u);
        ioa_enqueue_port(READ32(blk + MN_REPLYPORT), (uint32_t)blk);  /* PERVOL replies immediately */
        break;

    default:
        /* ADCMD_ALLOCATE, CMD_STOP, etc.: acknowledge and reclaim the block. */
        WRITE8(blk + 31u, 0u);
        ioa_enqueue_port(READ32(blk + MN_REPLYPORT), (uint32_t)blk);
        break;
    }
    d0 = 0u;
}

/* -----------------------------------------------------------------------
 * Per-channel DMA-completion poll — the software analogue of the Amiga
 * audio-block-done interrupt (audiodevice.c audiodevice_DMA_signal).
 * Called after every paula_render chunk: when a one-shot buffer has reached
 * its end, reply its IOAudio block to MaxTrax's free pool and advance the
 * per-channel write queue (starting/arming the next buffer). A cycles==0
 * sustain loops forever and never completes — it is drained only by FLUSH.
 * ---------------------------------------------------------------------- */
static void mtx_poll_completions(void) {
    int chn = 0;
    while (chn < PAULA_CHANNELS) {   /* maxtrax.c #defines `for`, so use while */
        int cur = chn++;
        if (!paula_poll_completion(cur)) continue;
        uint32_t done = wr_head(cur);
        if (!done) continue;
        ioa_enqueue_port(READ32(done + MN_REPLYPORT), done);  /* reply finished one-shot → _play_port */
        wr_pop(cur);
        uint32_t next = wr_head(cur);
        if (!next) continue;
        /* paula already swapped into the pre-loaded follow-on if it was armed;
         * if the channel went idle (follow-on arrived after completion), start
         * it now. Then arm the one behind it for the next gapless swap. */
        if (!paula_is_active(cur)) mtx_start_write(cur, next);
        if (g_wr_count[cur] >= 2) mtx_preload_next(cur, wr_at(cur, 1));
    }
}

/* -----------------------------------------------------------------------
 * WASM exported API
 * ---------------------------------------------------------------------- */

/*
 * maxtrax_load(data, len, score)
 *
 * Load a MaxTrax performance from an in-memory buffer and begin playback.
 * `score` selects the sub-song (0 = first).
 * Returns 0 on success, non-zero on error.
 */
EXPORT int maxtrax_load(const uint8_t *data, uint32_t len, int score) {
    /* --- Reset state --- */
    paula_reset();
    ioa_reset();
    wr_clear_all();
    g_vblank_code = 0;
    g_vblank_accum = 0;
    g_vblank_count = 0;
    g_beginio_count = 0;
    g_cmd_count[0] = g_cmd_count[1] = g_cmd_count[2] = g_cmd_count[3] = 0;
    g_ioa_peak_depth = 0;
    g_ioa_dequeued = 0;
    g_render_clock = 0;
    g_file_data = data;
    g_file_size = len;
    g_file_pos  = 0;

    /* --- Build fake exec base ---
     * Byte 530 (VBlankFrequency) = 50  → PAL tick rate avoids divu by zero.
     * Bytes 556-559 (ex_EClockFrequency) = 709379 big-endian → ColorClocks
     * will be computed as 709379 × 5 = 3546895 = PAL_CLOCKS.             */
    memset(g_fake_exec, 0, sizeof(g_fake_exec));
    g_fake_exec[530] = 50u;   /* VBlankFrequency */
    {
        uint32_t eclock = 709379u;
        g_fake_exec[556] = (uint8_t)(eclock >> 24);
        g_fake_exec[557] = (uint8_t)(eclock >> 16);
        g_fake_exec[558] = (uint8_t)(eclock >>  8);
        g_fake_exec[559] = (uint8_t)(eclock      );
    }
    store_ptr32(g_sysbase_store, g_fake_exec);

    /* --- Build fake GfxBase ---
     * PALn = bit 1 of (gb_DisplayFlags + 1); set it so MaxTrax detects PAL.
     * Combined with ex_EClockFrequency above this gives PAL_CLOCKS exactly. */
    memset(g_fake_gfx, 0, sizeof(g_fake_gfx));
    g_fake_gfx[gb_DisplayFlags + 1u] = (1u << (PALn & 31));
    store_ptr32(g_gfxbase_store, g_fake_gfx);

    /* fake audio.device base: all-zero ⟹ LIB_VERSION = 0 < 37 (OK)      */
    memset(g_fake_audio_dev, 0, sizeof(g_fake_audio_dev));

    /* --- Init 68k stack ---
     * sp must be set before any function is called.                        */
    sp = (uint32_t)(uintptr_t)(g_stack + STACK_SIZE - 16u);

    /* --- Init MaxTrax data segment ---
     * _ds_init() writes the IS_CODE pointers for VBlank/Music/Extra ISRs. */
    _ds_init();
    MXTX_DBG("[mxtx] ds_init done (build: v8-renderprobe)\n");

    /* --- InitMusic() ---
     * Allocates the audio memory pool (NUM_SCORES=8 score slots), sets up
     * IOAudio/MsgPort structs, and registers the VBlank ISR via
     * _LVOAddIntServer, setting g_vblank_code = MusicVBlank address.
     * InitMusic internally sets d0=NUM_SCORES before calling InitMusicTagList.
     * We must NOT call NewInitMusic() without first setting d0=NUM_SCORES —
     * doing so leaves scoremax=0, causing LoadPerf to skip score loading and
     * PlaySong to read a score_Data pointer from past the calloc'd buffer. */
    MXTX_DBG("[mxtx] calling InitMusic\n");
    InitMusic();
    MXTX_DBG("[mxtx] InitMusic done, vblank=%u\n", g_vblank_code);

    if (g_vblank_code == 0) {
        /* VBlank registration failed — init went wrong */
        return -1;
    }

    /* --- Load performance file ---
     * LoadPerf() first calls CloseMusic() (safe: _AudioDevice=0 after init
     * because OpenMusic is called inside InitMusicTagList/OpenMusic path,
     * and CloseMusic checks _AudioDevice before doing anything real), then
     * opens the file via _LVOOpen/_LVORead and parses patches + score data. */
    MXTX_DBG("[mxtx] calling LoadPerf\n");
    a0 = (uint32_t)(uintptr_t)"maxtrax.mxtx"; /* non-null filename sentinel */
    d0 = 0u;                                   /* unused score arg to LoadPerf */
    LoadPerf();
    MXTX_DBG("[mxtx] LoadPerf done\n");

    /* --- Select score and begin playback ---
     * PlaySong() calls OpenMusic() which re-opens the audio device and
     * re-enqueues the 4 play-IOAudio blocks via _LVOReplyMsg.              */
    MXTX_DBG("[mxtx] calling SelectScore(%d)\n", score);
    d0 = (uint32_t)(int32_t)score;
    SelectScore();
    MXTX_DBG("[mxtx] SelectScore done\n");

    MXTX_DBG("[mxtx] calling PlaySong\n");
    d0 = (uint32_t)(int32_t)score;
    PlaySong();

    return 0;
}

/*
 * maxtrax_render(buffer, frames)
 *
 * Render `frames` frames of F32 stereo interleaved audio at PAULA_RATE_PAL
 * (28150 Hz).  Drives MusicVBlank at 50 Hz (one call per VBLANK_SAMPLES=563
 * frames).  Returns the number of frames written.
 */
EXPORT int maxtrax_render(float *buffer, int frames) {
    typedef void (*VBlankFn)(void);
    VBlankFn vblank = (VBlankFn)(uintptr_t)g_vblank_code;

    { static int rdbg = 0;
      if (rdbg < 6) { rdbg++;
        MXTX_DBG("[render] call frames=%d vblank_code=%u accum=%d count=%d\n",
                frames, g_vblank_code, g_vblank_accum, g_vblank_count); } }

    if (!vblank) {
        memset(buffer, 0, (size_t)frames * 2u * sizeof(float));
        return frames;
    }

    /* Set exec base register for any shims that might read a6-relative fields */
    a6 = READ32((uintptr_t)_SysBase);

    /* VBlank fires at 50 Hz = every VBLANK_SAMPLES (563) rendered frames.
     * g_vblank_accum persists across calls so the rate is correct even when
     * the worklet requests small chunks (e.g. 77 frames per output block). */
    int written = 0;
    while (written < frames) {
        if (g_vblank_accum == 0) {
            if (g_vblank_count < 5) {
                uint32_t aud_dev = READ32((uintptr_t)_AudioDevice);
                uint32_t tick_u  = READ32((uintptr_t)_globaldata + 12 /* glob_TickUnit */);
                uint32_t ticks   = READ32((uintptr_t)_globaldata + 8  /* glob_Ticks */);
                uint32_t freq    = (uint32_t)READ16((uintptr_t)_globaldata + 88 /* glob_Frequency */);
                MXTX_DBG("[mxtx] vblank#%d AudioDev=%u TickUnit=%u Ticks=%u Freq=%u BeginIO=%d\n",
                        g_vblank_count, aud_dev, tick_u, ticks, freq, g_beginio_count);
            }
            g_vblank_count++;
            vblank(); /* fire MusicVBlank at start of each 563-sample tick */
        }
        int remaining = VBLANK_SAMPLES - g_vblank_accum;
        int chunk = frames - written;
        if (chunk > remaining) chunk = remaining;
        paula_render(buffer + written * 2, chunk);
        mtx_poll_completions();   /* reply finished one-shot blocks, advance queues */
        written += chunk;
        g_render_clock += chunk;
        g_vblank_accum += chunk;
        if (g_vblank_accum >= VBLANK_SAMPLES) {
            g_vblank_accum = 0;
        }
    }
    return frames;
}

/*
 * maxtrax_stop()
 *
 * Stop playback, release audio resources, reset state.
 */
EXPORT void maxtrax_stop(void) {
    if (g_vblank_code) {
        MXTX_DBG("[stop] StopSong...\n");   StopSong();
        MXTX_DBG("[stop] CloseMusic...\n"); CloseMusic();
        MXTX_DBG("[stop] FreeMusic...\n");  FreeMusic();
        MXTX_DBG("[stop] done\n");
    }
    paula_reset();
    wr_clear_all();
    g_vblank_code = 0;
    g_vblank_accum = 0;
    ioa_reset();
    g_file_data = NULL;
    g_file_size = 0;
    g_file_pos  = 0;
}

/*
 * maxtrax_get_sample_rate()
 *
 * Return the output sample rate so the AudioWorklet knows what to expect.
 */
EXPORT int maxtrax_get_sample_rate(void) {
    return PAULA_RATE_PAL;
}

/*
 * maxtrax_get_cmd_count(which)
 *
 * BeginIO command tally since the last load, for the lockstep regression test.
 * which: 0=CMD_WRITE, 1=CMD_FLUSH, 2=ADCMD_PERVOL, 3=other. A correct render is
 * PERVOL-dominant; the _audio_env reply-port bug collapses PERVOL and inflates
 * CMD_WRITE, so the test asserts count(2) >> count(0).
 */
EXPORT int maxtrax_get_cmd_count(int which) {
    if (which < 0 || which > 3) return -1;
    return g_cmd_count[which];
}

/*
 * maxtrax_get_seed_pool_depth()
 *
 * Peak free-pool depth of any single audio.device reply port. OpenMusic seeds
 * `3*NUM_VOICES` (=12) CMD_WRITE blocks into _play_port up front, so a correct
 * transpile peaks at 12; the seed-immediate bug (`#3*NUM_VOICES-1` collapsing to
 * the leading digit 3 → 4 blocks) peaks at ~4. The lockstep test asserts >= 12.
 */
EXPORT int maxtrax_get_seed_pool_depth(void) {
    return g_ioa_peak_depth;
}

/*
 * maxtrax_get_tick_unit()
 *
 * Current glob_TickUnit (offset 12) — the tempo-derived per-tick advance the
 * MusicServer adds each VBlank. Exposed for the recook regression test: a mid-
 * song tempo event (CMD 0x80) mutates this; after recook rewinds the cursor it
 * must be reset to the score base-tempo value (SetTempo(glob_Tempo<<4)). The
 * test asserts recook restores it, so a stale-tempo replay after edit is caught.
 */
EXPORT uint32_t maxtrax_get_tick_unit(void) {
    return READ32((uintptr_t)_globaldata + 12 /* glob_TickUnit */);
}

/*
 * maxtrax_set_patch_scalar(patchNumber, field, value)
 *
 * Tier-1 live scalar edit. Writes directly into the in-memory _patch struct
 * (_patch = _ds + 516, patch_sizeof = 22, indexed by patch Number). field:
 *   0 = Tune   (i16 @ patch_Tune = 18) — re-read every tick in CalcNote → live
 *   1 = Volume (u16 @ patch_Volume = 16) — applies on next sustain segment
 * Returns 0 on success, -1 on out-of-range patchNumber or unknown field.
 */
EXPORT int maxtrax_set_patch_scalar(int patchNumber, int field, int val) {
    if (patchNumber < 0 || patchNumber >= NUM_PATCHES) return -1;
    uint32_t base = (uint32_t)(uintptr_t)_patch + (uint32_t)patchNumber * (uint32_t)patch_sizeof;
    if (field == 0)      WRITE16(base + (uint32_t)patch_Tune,   (uint16_t)val);
    else if (field == 1) WRITE16(base + (uint32_t)patch_Volume, (uint16_t)val);
    else return -1;
    return 0;
}

/* Read-back companion for the regression test (and future UI reconciliation). */
EXPORT int maxtrax_get_patch_scalar(int patchNumber, int field) {
    if (patchNumber < 0 || patchNumber >= NUM_PATCHES) return -1;
    uint32_t base = (uint32_t)(uintptr_t)_patch + (uint32_t)patchNumber * (uint32_t)patch_sizeof;
    if (field == 0) return (int)(int16_t)READ16(base + (uint32_t)patch_Tune);
    if (field == 1) return (int)(uint16_t)READ16(base + (uint32_t)patch_Volume);
    return -1;
}

/*
 * maxtrax_get_event_count(score)
 *
 * Return the number of CookedEvents (cev_* format) in the given score.
 * This is the same count that LoadPerf reads from the file (numEvents u32).
 * Returns -1 if the score index is out of range or the player is not loaded.
 *
 * Layout: _scoreptr → score array; score struct (score_sizeof=8 bytes) holds
 * score_Data (u32 ptr to cev buffer) at offset 0 and score_NumEvents (u32)
 * at offset 4. _scoremax holds the total score count.
 */
EXPORT int maxtrax_get_event_count(int score) {
    uint32_t sptr = READ32((uintptr_t)_scoreptr);
    if (!sptr) return -1;
    uint16_t n_scores = (uint16_t)READ16((uintptr_t)_scoremax);
    if (score < 0 || (uint32_t)score >= (uint32_t)n_scores) return -1;
    uint32_t score_struct = sptr + (uint32_t)(score) * (uint32_t)score_sizeof;
    return (int)(uint32_t)READ32(score_struct + (uint32_t)score_NumEvents);
}

/*
 * maxtrax_set_event(score, index, command, data, startTime, stopTime)
 *
 * Overwrite one CookedEvent in the score's cev buffer — the SAME buffer that
 * MusicServer reads on every VBlank tick via READ8/READ16 (big-endian).
 * Fields match the MaxTraxEvent TS interface:
 *   command  u8  — 0x00-0x7F note; 0x80 tempo; 0xA0 special; 0xFF end
 *   data     u8  — note: (velocity<<4)|channel; non-note: parameter
 *   startTime u16 — delta ticks from previous event
 *   stopTime  u16 — note duration in ticks; 0 for most non-note events
 *
 * How the edit reaches live playback: score_Data is the AllocMem'd buffer
 * that LoadPerf populated; MusicServer reads cev_Command/Data/StartTime/
 * StopTime from it using READ8/READ16 (big-endian) each tick via glob_Current.
 * WRITE8/WRITE16 here use the identical byte-swap convention — the bytes land
 * immediately in the buffer the running player reads. No shadow copy.
 *
 * Returns 0 on success, -1 if score or index is out of range.
 *
 * NOTE: maxtrax.c #defines `for` to 0 — use `while` for loops in this TU.
 * Also avoid variable names: for, volume, value, flags, to, number.
 */
EXPORT int maxtrax_set_event(int score, int index,
                             int command, int data,
                             int startTime, int stopTime) {
    uint32_t sptr = READ32((uintptr_t)_scoreptr);
    if (!sptr) return -1;
    uint16_t n_scores = (uint16_t)READ16((uintptr_t)_scoremax);
    if (score < 0 || (uint32_t)score >= (uint32_t)n_scores) return -1;
    uint32_t score_struct = sptr + (uint32_t)(score) * (uint32_t)score_sizeof;
    uint32_t n_evts = READ32(score_struct + (uint32_t)score_NumEvents);
    if (index < 0 || (uint32_t)index >= n_evts) return -1;
    uint32_t ev_data_ptr = READ32(score_struct + (uint32_t)score_Data);
    if (!ev_data_ptr) return -1;
    uint32_t ev_addr = ev_data_ptr + (uint32_t)(index) * (uint32_t)cev_sizeof;
    WRITE8 (ev_addr + (uint32_t)cev_Command,   (uint8_t) command);
    WRITE8 (ev_addr + (uint32_t)cev_Data,      (uint8_t) data);
    WRITE16(ev_addr + (uint32_t)cev_StartTime, (uint16_t)startTime);
    WRITE16(ev_addr + (uint32_t)cev_StopTime,  (uint16_t)stopTime);
    return 0;
}

/*
 * maxtrax_recook(score)
 *
 * Reset the replay cursor so the edited cev buffer is re-read from the start
 * on the next VBlank tick. Resets glob_Current to score_Data (top of the event
 * array), clears the time/tick accumulators, and marks all per-voice note-off
 * slots as empty (sev_Command=0xFF) so in-flight notes don't phantom-trigger
 * after the rewind.
 *
 * The `score` parameter is accepted for API consistency but ignored: the cursor
 * always rewinds to whatever score is currently selected in glob_CurrentScore.
 */
EXPORT void maxtrax_recook(int score) {
    (void)score;
    uint32_t cur_score = READ32((uintptr_t)_globaldata + (uint32_t)glob_CurrentScore);
    if (!cur_score) return;
    uint32_t score_data_start = READ32(cur_score + (uint32_t)score_Data);
    /* Reset the event-stream read pointer to the start of the (edited) buffer. */
    WRITE32((uintptr_t)_globaldata + (uint32_t)glob_Current,     score_data_start);
    /* Clear time / tick / tempo-time accumulators. */
    WRITE32((uintptr_t)_globaldata + (uint32_t)glob_CurrentTime, 0);
    WRITE32((uintptr_t)_globaldata + (uint32_t)glob_Ticks,       0);
    WRITE32((uintptr_t)_globaldata + (uint32_t)glob_TempoTime,   0);
    /* Re-derive glob_TickUnit from the score base tempo. A mid-song tempo event
     * (CMD 0x80) mutates glob_TickUnit; a recook that rewinds the cursor past that
     * event would otherwise keep replaying at the stale tempo until the event is
     * hit again. Replicate the score-start init exactly (maxtrax.c ~6930): load
     * glob_Tempo, shift left 4 (SetTempo takes 12.4 fixed-point and >>4s it back),
     * then SetTempo() recomputes glob_TickUnit. Single source: glob_Tempo. */
    d0 = (uint32_t)(uint16_t)READ16((uintptr_t)_globaldata + (uint32_t)glob_Tempo);
    W(d0) = (uint16_t)(W(d0) << 4);
    SetTempo();
    /* Drain any in-flight Paula DMA so a note still sustaining at rewind time does
     * not keep ringing and stack with the re-triggered note stream (phantom notes). */
    {
        int _pch = 0;
        while (_pch < PAULA_CHANNELS) {
            paula_channel_dma_off(_pch);
            _pch++;
        }
    }
    /* Mark all 4 per-voice note-off table slots as empty (sev_Command=0xFF). */
    int _vi = 0;
    while (_vi < 4) {
        WRITE8((uintptr_t)_globaldata + (uint32_t)glob_NoteOff
               + (uint32_t)_vi * (uint32_t)sev_sizeof
               + (uint32_t)sev_Command,
               0xff);
        _vi++;
    }
}
