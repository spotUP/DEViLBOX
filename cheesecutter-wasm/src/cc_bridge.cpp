/*
 * CheeseCutter WASM Bridge — 6502 CPU + reSID audio rendering.
 *
 * Loads a CheeseCutter .ct 64KB memory image, runs the player via
 * the 6502 CPU in flat-RAM mode (matching CheeseCutter's own emulator),
 * and renders audio through reSID.
 *
 * The key difference from PSID wrapping: no I/O mapping at $D400.
 * The player writes SID register values to RAM[$D400-$D418], and
 * this bridge reads those bytes and feeds them to reSID directly.
 */

#include <emscripten.h>
#include <cstring>
#include <cmath>
#include "resid/sid.h"

extern "C" {
#include "cpu6502.h"
}

/* --- Globals --- */
static CPU6502 cpu;
static SID* sid = nullptr;
static int sample_rate = 44100;
static int multiplier = 1;         /* speed multiplier (1-16) */
static int accumulator = 0;        /* sample accumulator for frame timing */
static int samples_per_frame = 882; /* sampleRate / 50 (PAL) */
static int frame_counter = 0;      /* counts sub-frames within a multiplied frame */
static int initialized = 0;
static uint8_t prev_sid_regs[29];  /* previous SID state for diff detection */

/* --- Init --- */
extern "C" EMSCRIPTEN_KEEPALIVE
void cc_init(int rate, int sid_model) {
    sample_rate = rate;
    samples_per_frame = rate / 50; /* PAL 50Hz */

    if (sid) delete sid;
    sid = new SID();
    sid->set_chip_model(sid_model == 1 ? MOS8580 : MOS6581);
    sid->set_sampling_parameters(985248, SAMPLE_FAST, rate);
    sid->reset();

    cpu_reset(&cpu);
    memset(prev_sid_regs, 0, sizeof(prev_sid_regs));
    memset(cpu.ram, 0, sizeof(cpu.ram));
    initialized = 1;
    multiplier = 1;
    accumulator = 0;
    frame_counter = 0;
}

/* --- Load 64KB memory image --- */
extern "C" EMSCRIPTEN_KEEPALIVE
int cc_load(const uint8_t* data, int len) {
    if (!initialized || len < 1) return 0;

    /* Load into CPU RAM starting at offset 0 */
    int copy_len = len > 65536 ? 65536 : len;
    memcpy(cpu.ram, data, copy_len);

    /* Verify player ID at $0DFE-$0DFF: should be $00,$0E (load addr $0E00) */
    if (cpu.ram[0x0DFE] != 0x00 || cpu.ram[0x0DFF] != 0x0E) {
        /* Not a standard CheeseCutter player layout */
    }

    return 1;
}

/* --- Set speed multiplier (1-16) --- */
extern "C" EMSCRIPTEN_KEEPALIVE
void cc_set_multiplier(int mult) {
    if (mult < 1) mult = 1;
    if (mult > 16) mult = 16;
    multiplier = mult;
}

/* --- Call init routine at $1000 with A = subtune --- */
extern "C" EMSCRIPTEN_KEEPALIVE
void cc_play_init(int subtune) {
    if (!initialized || !sid) return;

    cpu_reset(&cpu);
    /* Reload RAM isn't needed — it persists across reset.
       Reset only clears CPU registers. */
    cpu.a = (uint8_t)subtune;
    cpu.x = 0;
    cpu.y = 0;
    cpu.sp = 0xFF;
    cpu.status = 0x04; /* IRQ disabled */
    cpu.sid_dirty = 0;
    cpu.jam = 0;

    /* Call init at $1000 */
    cpu_jsr(&cpu, 0x1000, 1000000); /* max 1M cycles (~1 sec) */

    /* Apply initial SID state from RAM to reSID */
    for (int r = 0; r < 25; r++) {
        uint8_t val = cpu.ram[0xD400 + r];
        sid->write(r, val);
        prev_sid_regs[r] = val;
    }

    sid->reset();
    accumulator = 0;
    frame_counter = 0;
}

/* --- SID register diff buffer (for hardware output) --- */
#define MAX_SID_DIFFS 256
static struct { uint8_t reg; uint8_t val; } sid_diff_buf[MAX_SID_DIFFS];
static int sid_diff_count = 0;

/* --- Apply SID register changes from RAM to reSID --- */
static void sync_sid_regs(void) {
    for (int r = 0; r < 25; r++) {
        uint8_t val = cpu.ram[0xD400 + r];
        if (val != prev_sid_regs[r]) {
            sid->write(r, val);
            prev_sid_regs[r] = val;
            if (sid_diff_count < MAX_SID_DIFFS) {
                sid_diff_buf[sid_diff_count].reg = r;
                sid_diff_buf[sid_diff_count].val = val;
                sid_diff_count++;
            }
        }
    }
}

/* --- Get buffered SID register diffs since last call --- */
extern "C" EMSCRIPTEN_KEEPALIVE
int cc_get_sid_diffs(uint8_t* out) {
    int count = sid_diff_count;
    for (int i = 0; i < count; i++) {
        out[i * 2] = sid_diff_buf[i].reg;
        out[i * 2 + 1] = sid_diff_buf[i].val;
    }
    sid_diff_count = 0;
    return count;
}

/* --- Render audio --- */
extern "C" EMSCRIPTEN_KEEPALIVE
void cc_render(float* outL, float* outR, int frames) {
    if (!initialized || !sid) {
        memset(outL, 0, frames * sizeof(float));
        memset(outR, 0, frames * sizeof(float));
        return;
    }

    static short buf[65536];
    int to_render = frames;
    if (to_render > 32768) to_render = 32768;

    int out_idx = 0;
    int remaining = to_render;

    while (remaining > 0) {
        /* How many samples until next frame tick? */
        int until_tick = samples_per_frame - accumulator;
        int chunk = remaining < until_tick ? remaining : until_tick;

        /* Render this chunk through reSID */
        cycle_count delta_t = (cycle_count)((double)chunk * 985248.0 / sample_rate);
        if (delta_t < 1) delta_t = 1;
        sid->clock(delta_t, buf + out_idx, chunk, chunk);

        out_idx += chunk;
        remaining -= chunk;
        accumulator += chunk;

        /* Frame tick — call the play routine */
        if (accumulator >= samples_per_frame) {
            accumulator -= samples_per_frame;

            for (int m = 0; m < multiplier; m++) {
                /* First sub-frame: call $1003 (main play).
                   Additional sub-frames: call $1006 (sub-frame play). */
                uint16_t play_addr = (m == 0) ? 0x1003 : 0x1006;
                cpu_jsr(&cpu, play_addr, 100000); /* max 100K cycles per play call */

                /* Sync SID registers from flat RAM to reSID */
                sync_sid_regs();
            }
        }
    }

    /* Convert int16 to float */
    float scale = 1.0f / 32768.0f;
    for (int i = 0; i < to_render; i++) {
        float s = buf[i] * scale;
        outL[i] = s;
        outR[i] = s; /* mono → both channels */
    }
    /* Zero any remaining */
    for (int i = to_render; i < frames; i++) {
        outL[i] = outR[i] = 0.0f;
    }
}

/* --- Get current SID registers (for ASID hardware bridge) --- */
extern "C" EMSCRIPTEN_KEEPALIVE
uint8_t* cc_get_sid_regs(void) {
    return &cpu.ram[0xD400];
}

/* --- Read a byte from CPU RAM --- */
extern "C" EMSCRIPTEN_KEEPALIVE
uint8_t cc_read_byte(uint16_t addr) {
    return cpu.ram[addr];
}

/* --- Write a byte to CPU RAM (for live editing instruments/tables) --- */
extern "C" EMSCRIPTEN_KEEPALIVE
void cc_write_byte(uint16_t addr, uint8_t value) {
    cpu.ram[addr] = value;
}

/* --- Get pointer to CPU RAM (for bulk read/write) --- */
extern "C" EMSCRIPTEN_KEEPALIVE
uint8_t* cc_get_ram(void) {
    return cpu.ram;
}

/* --- Shutdown --- */
extern "C" EMSCRIPTEN_KEEPALIVE
void cc_shutdown(void) {
    if (sid) { delete sid; sid = nullptr; }
    initialized = 0;
}
