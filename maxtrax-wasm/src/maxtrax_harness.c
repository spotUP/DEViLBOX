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
#define IOA_QUEUE_CAP 32
static uint32_t g_ioa_queue[IOA_QUEUE_CAP];
static int g_ioa_head = 0;
static int g_ioa_tail = 0;

static void ioa_enqueue(uint32_t addr) {
    int next = (g_ioa_tail + 1) % IOA_QUEUE_CAP;
    if (next == g_ioa_head) return;   /* full — drop (should not happen)  */
    g_ioa_queue[g_ioa_tail] = addr;
    g_ioa_tail = next;
}

static uint32_t ioa_dequeue(void) {
    if (g_ioa_head == g_ioa_tail) return 0;   /* empty */
    uint32_t addr = g_ioa_queue[g_ioa_head];
    g_ioa_head = (g_ioa_head + 1) % IOA_QUEUE_CAP;
    return addr;
}

/* VBlank ISR function pointer captured by _LVOAddIntServer               */
static uint32_t g_vblank_code = 0;

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
    void *p = calloc(1, (size_t)d0);
    d0 = (uint32_t)(uintptr_t)p;
}

/* exec FreeMem(a1=ptr, d0=size)                                           */
void _LVOFreeMem(void) {
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

/* exec GetMsg(a0=port) → d0=msg|0  — dequeue a free IOAudio block        */
void _LVOGetMsg(void) {
    d0 = ioa_dequeue();
}

/* exec ReplyMsg(a1=msg)  — return an IOAudio block to the free pool      */
void _LVOReplyMsg(void) {
    ioa_enqueue((uint32_t)a1);
}

/* exec PutMsg(a0=port, a1=msg)  — also enqueue (used by stop_audio path) */
void _LVOPutMsg(void) {
    ioa_enqueue((uint32_t)a1);
}

/* exec Signal(a1=task, d0=sigmask)  — no-op in our single-threaded model */
void _LVOSignal(void) {
    d0 = 0;
}

/* exec Cause(a1=interrupt)  — no-op                                       */
void _LVOCause(void) {
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
    uint32_t mode   = d3;
    uint32_t oldpos = g_file_pos;
    int64_t  np;
    if (mode == 0 /* OFFSET_BEGINNING */) {
        np = (int64_t)offset;
    } else if (mode == 1 /* OFFSET_CURRENT */) {
        np = (int64_t)g_file_pos + offset;
    } else { /* OFFSET_END = -1 */
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
void DEV_BEGINIO(void) {
    uint32_t blk = a1;
    uint16_t cmd     = (uint16_t)READ16(blk + 28u /* IO_COMMAND */);
    uint32_t io_unit = READ32(blk + 24u /* IO_UNIT */);

    if (cmd == 3u /* CMD_WRITE */) {
        /* Determine channel from IO_UNIT bitmask */
        int ch = -1;
        if      (io_unit & 1u) ch = 0;
        else if (io_unit & 2u) ch = 1;
        else if (io_unit & 4u) ch = 2;
        else if (io_unit & 8u) ch = 3;

        if (ch >= 0) {
            uint32_t data_addr = READ32(blk + 50u /* ioa_Data   */);
            uint32_t len_bytes = READ32(blk + 54u /* ioa_Length */);
            uint16_t period    = (uint16_t)READ16(blk + 58u /* ioa_Period */);
            uint8_t  ioa_vol   = (uint8_t) READ8 (blk + 61u /* ioa_Volume low byte */);
            uint16_t cycles    = (uint16_t)READ16(blk + 62u /* ioa_Cycles */);
            uint16_t len_words = (uint16_t)(len_bytes >> 1);
            const int8_t *data = (const int8_t *)(uintptr_t)data_addr;

            if (cycles == 1u) {
                /* Attack: start one-shot DMA immediately */
                paula_set_sample_ptr(ch, data);
                paula_set_length(ch, len_words);
                if (period > 0) paula_set_period(ch, period);
                paula_set_volume(ch, ioa_vol);
                paula_set_loop(ch, 0);
                paula_dma_write((uint16_t)(0x8000u | (1u << ch)));
            } else {
                /* Sustain: queue as follow-on buffer (loops) */
                paula_set_next(ch, data, len_words, 1 /* loop */);
            }
        }
    } else if (cmd == 0x8009u /* ADCMD_PERVOL */ ||
               cmd == 0x8008u /* ADCMD_PERSIZE */) {
        /* Live period/volume update for an active voice */
        int ch = -1;
        if      (io_unit & 1u) ch = 0;
        else if (io_unit & 2u) ch = 1;
        else if (io_unit & 4u) ch = 2;
        else if (io_unit & 8u) ch = 3;
        if (ch >= 0) {
            uint8_t  ioa_vol = (uint8_t)READ8 (blk + 61u /* ioa_Volume low byte */);
            uint16_t period  = (uint16_t)READ16(blk + 58u /* ioa_Period */);
            paula_set_volume(ch, ioa_vol);
            if (period > 0) paula_set_period(ch, period);
        }
    }
    /* CMD_FLUSH, CMD_STOP, ADCMD_ALLOCATE etc. → no-op */

    /* Acknowledge success and immediately re-enqueue the block.
     * This simulates IOF_QUICK DMA-complete: the audio.device returns
     * the block to _play_port so MaxTrax can reuse it for the next note. */
    WRITE8(blk + 31u /* IO_ERROR */, 0u);
    d0 = 0u;
    ioa_enqueue((uint32_t)blk);
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
    g_ioa_head = g_ioa_tail = 0;
    g_vblank_code = 0;
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

    /* --- NewInitMusic() ---
     * Allocates the audio memory pool, sets up IOAudio/MsgPort structs,
     * opens audio.device (→ _LVOOpenDevice), and registers the VBlank ISR
     * (→ _LVOAddIntServer), setting g_vblank_code = MusicVBlank address.
     * Also computes glob_FrameUnit and glob_ColorClocks from the fake exec. */
    NewInitMusic();

    if (g_vblank_code == 0) {
        /* VBlank registration failed — init went wrong */
        return -1;
    }

    /* --- Load performance file ---
     * LoadPerf() first calls CloseMusic() (safe: _AudioDevice=0 after init
     * because OpenMusic is called inside InitMusicTagList/OpenMusic path,
     * and CloseMusic checks _AudioDevice before doing anything real), then
     * opens the file via _LVOOpen/_LVORead and parses patches + score data. */
    a0 = (uint32_t)(uintptr_t)"maxtrax.mxtx"; /* non-null filename sentinel */
    d0 = 0u;                                   /* unused score arg to LoadPerf */
    LoadPerf();

    /* --- Select score and begin playback ---
     * PlaySong() calls OpenMusic() which re-opens the audio device and
     * re-enqueues the 4 play-IOAudio blocks via _LVOReplyMsg.              */
    d0 = (uint32_t)(int32_t)score;
    SelectScore();

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

    if (!vblank) {
        memset(buffer, 0, (size_t)frames * 2u * sizeof(float));
        return frames;
    }

    /* Set exec base register for any shims that might read a6-relative fields */
    a6 = READ32((uintptr_t)_SysBase);

    int written = 0;
    while (written < frames) {
        /* Fire MusicVBlank once per tick */
        vblank();
        /* Render up to VBLANK_SAMPLES frames */
        int chunk = frames - written;
        if (chunk > VBLANK_SAMPLES) chunk = VBLANK_SAMPLES;
        paula_render(buffer + written * 2, chunk);
        written += chunk;
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
        StopSong();
        CloseMusic();
        FreeMusic();
    }
    paula_reset();
    g_vblank_code = 0;
    g_ioa_head = g_ioa_tail = 0;
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
