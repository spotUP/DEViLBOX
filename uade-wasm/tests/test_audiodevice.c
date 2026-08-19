/*
 * test_audiodevice.c — memory-safety harness for the fake audio.device.
 *
 * audiodevice.c is a boundary: it turns 68k values a module controls into host
 * pointers and array indices. This harness drives its three entry points
 * (audiodevice_open / _beginIO / _abortIO) with the hostile-but-reachable values
 * a malformed or unlucky player produces, under AddressSanitizer.
 *
 * Built against tests/adshim/, which models 68k memory as one flat window and
 * translates addresses WITHOUT checking — the same unchecked translation the real
 * get_real_address() does — so anything the code fails to validate lands outside
 * the backing array and ASan reports it.
 *
 * Each case runs in its own process (see run_audiodevice_tests.sh): a case that
 * traps must not stop the others from running.
 *
 * Usage: test_audiodevice <case>
 * Cases: write_no_channel pervol_no_channel abortio_bad_cmd
 *        open_huge_length bad_request_addr cyclic_reply_list
 */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stddef.h>

#include "sysdeps.h"
#include "memory.h"
#include "audio.h"
#include "custom.h"
#include "devices/audio/audio.h"
#include "audiodevice.h"

/* ---- shim state -------------------------------------------------------- */

uae_u8 *ad_test_mem;

void ad_test_mem_init(void)
{
    ad_test_mem = calloc(1, AD_TEST_SIZE);
    if (!ad_test_mem) { fprintf(stderr, "out of memory\n"); exit(2); }
}
struct ad_test_channel ad_test_audio_channel[4];

void ad_test_poke(int channel, int reg, uae_u32 value)
{
    /* Deliberately unguarded: audiodevice.c must never hand us a bad channel.
     * With channel == -1 this writes before ad_test_audio_channel[0], which is
     * what audio.c's audio_channel[-1] would do in the real build. */
    struct ad_test_channel *c = &ad_test_audio_channel[channel];
    switch (reg) {
        case 0: c->per = value; break;
        case 1: c->vol = value; break;
        case 2: c->lcl = value; break;
        case 3: c->lch = value; break;
        default: c->len = value; break;
    }
}

void disable_audio_dma(int channel) { (void)channel; }
void update_audio(void) {}
void audio_use_text_scope(void) {}
void audiodevice_dmacon(uae_u32 value) { (void)value; }

/* ---- big-endian helpers (the 68k side writes big-endian) ---------------- */

static uae_u8 *host(uaecptr addr) { return &ad_test_mem[addr - AD_TEST_BASE]; }

static void poke16(uaecptr addr, uae_u16 v)
{
    uae_u8 *p = host(addr);
    p[0] = (uae_u8)(v >> 8); p[1] = (uae_u8)v;
}

static void poke32(uaecptr addr, uae_u32 v)
{
    uae_u8 *p = host(addr);
    p[0] = (uae_u8)(v >> 24); p[1] = (uae_u8)(v >> 16);
    p[2] = (uae_u8)(v >> 8);  p[3] = (uae_u8)v;
}

/* Field offsets inside the packed struct IOAudio, taken from the struct itself
 * so the harness cannot drift from the code under test. */
#define OFF(field) ((uaecptr)offsetof(struct IOAudio, field))
#define REQ_OFF(field) ((uaecptr)offsetof(struct IOAudio, ioa_Request) + \
                        (uaecptr)offsetof(struct IORequest, field))

/* ioa_Data is deliberately the HIGHEST structure in the window: alloc_channels()
 * scans forward from it for ioa_Length bytes, so anything placed after it (the
 * fake Library, the reply list) would be read as a channel mask and end the scan
 * early, hiding the very overrun the open_huge_length case exists to catch. */
static const uaecptr REQ_ADDR   = AD_TEST_BASE + 0x100;
static const uaecptr DEV_ADDR   = AD_TEST_BASE + 0x200;
static const uaecptr PORT_ADDR  = AD_TEST_BASE + 0x300;
static const uaecptr LIST_ADDR  = AD_TEST_BASE + 0x400;
static const uaecptr NODE_A     = AD_TEST_BASE + 0x500;
static const uaecptr NODE_B     = AD_TEST_BASE + 0x600;
static const uaecptr DATA_ADDR  = AD_TEST_BASE + 0x700;

/* al_ addresses are amiga addresses in little-endian byte order. */
static uae_u32 al(uaecptr addr) { return swap32(addr); }

static void build_request(uae_u16 command, uae_u32 unit, uae_u32 length)
{
    memset(ad_test_mem, 0, AD_TEST_SIZE);
    poke32(REQ_ADDR + REQ_OFF(io_Device), DEV_ADDR);
    poke32(REQ_ADDR + REQ_OFF(io_Unit), unit);
    poke16(REQ_ADDR + REQ_OFF(io_Command), command);
    poke32(REQ_ADDR + OFF(ioa_Data), DATA_ADDR);
    poke32(REQ_ADDR + OFF(ioa_Length), length);
    poke16(REQ_ADDR + OFF(ioa_Period), 200);
    poke16(REQ_ADDR + OFF(ioa_Volume), 64);
    poke16(REQ_ADDR + OFF(ioa_Cycles), 1);
    host(DATA_ADDR)[0] = 0x0f;   /* channel-combination array: "any of the four" */
}

/* ---- cases ------------------------------------------------------------- */

/* io_Unit carries no channel bit -> get_target_channel() returns -1, which the
 * unfixed code used to index _write_msg_list[] (read AND write). */
static void case_write_no_channel(void)
{
    build_request(CMD_WRITE, 0, 64);
    audiodevice_beginIO(al(REQ_ADDR), al(LIST_ADDR));
}

/* Same -1, this time reaching audio_channel[-1] through AUDxPER/AUDxVOL. */
static void case_pervol_no_channel(void)
{
    build_request(ADCMD_PERVOL, 0, 64);
    audiodevice_beginIO(al(REQ_ADDR), al(LIST_ADDR));
}

/* io_Command is module-controlled; the unfixed abortIO indexed a 33-entry table
 * with it and passed the result to %s. */
static void case_abortio_bad_cmd(void)
{
    build_request(9999, 0x1, 64);
    audiodevice_abortIO(al(REQ_ADDR));
}

/* ioa_Length is a 32-bit module-supplied count; alloc_channels() looped over it. */
static void case_open_huge_length(void)
{
    build_request(ADCMD_ALLOCATE, 0, 0x0fffffffu);
    /* Zero prefs: every chnmask is 0, so alloc_channels() never returns early and
     * really walks all ioa_Length bytes. A non-zero first byte matches at once and
     * would hide the unbounded loop. */
    host(DATA_ADDR)[0] = 0;
    audiodevice_open(al(REQ_ADDR));
}

/* The request address itself comes from Amiga memory and was never validated. */
static void case_bad_request_addr(void)
{
    memset(ad_test_mem, 0, AD_TEST_SIZE);
    audiodevice_beginIO(al(AD_TEST_BASE + AD_TEST_SIZE + 8), al(LIST_ADDR));
}

/* A reply chain that points back at itself: the unfixed walk had no cycle
 * detection and no hop limit, so it spun forever on the render thread. */
static void case_cyclic_reply_list(void)
{
    build_request(CMD_FLUSH, 0xf, 64);
    poke32(LIST_ADDR, NODE_A);      /* list head -> A */
    poke32(NODE_A, NODE_B);         /* A -> B */
    poke32(NODE_B, NODE_A);         /* B -> A  (cycle, never reaches msgBuf) */
    audiodevice_beginIO(al(REQ_ADDR), al(LIST_ADDR));
}

int main(int argc, char **argv)
{
    if (argc != 2) { fprintf(stderr, "usage: %s <case>\n", argv[0]); return 2; }

    ad_test_mem_init();
    audiodevice_reset();

    const char *name = argv[1];
    if      (!strcmp(name, "write_no_channel"))   case_write_no_channel();
    else if (!strcmp(name, "pervol_no_channel"))  case_pervol_no_channel();
    else if (!strcmp(name, "abortio_bad_cmd"))    case_abortio_bad_cmd();
    else if (!strcmp(name, "open_huge_length"))   case_open_huge_length();
    else if (!strcmp(name, "bad_request_addr"))   case_bad_request_addr();
    else if (!strcmp(name, "cyclic_reply_list"))  case_cyclic_reply_list();
    else { fprintf(stderr, "unknown case: %s\n", name); return 2; }

    printf("ok: %s\n", name);
    return 0;
}
