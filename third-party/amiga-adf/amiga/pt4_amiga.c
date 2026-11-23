/* DEViLBOX ADF: ProTracker 4 played by its own replayer (libpt4) on a 68000.
 *
 * libpt4's pt4__tick is the PT4 replay routine; after each tick its shadow Paula
 * registers (st.aud) and channel records (st.ch) are copied to the real Paula,
 * with the classic ProTracker SetDMA retrigger: DMA off for the triggered
 * channels, a few rasterlines, AUDxLC/LEN, DMA on, a few rasterlines, then the
 * loop registers. pt4_glue.s calls pt4a_init once and pt4a_tick from the CIA-B
 * timer A interrupt (level 6), whose period follows the song's BPM.
 *
 * Built with vbcc (+aos68k, 68000) together with libpt4's own sources; see
 * build_adf.py (--native pt4). PT4A_HOST builds the same file for the host
 * register-stream check (third-party/amiga-adf/tools/pt4_regcheck.c) without touching hardware.
 */
#include <string.h>
#include <stdlib.h>
#include "pt4_internal.h"

#define PT4A_LOGTICKS 1024

/* pt4_glue.s: the module slot, the chip pool (the sample arena lives in it, so
 * Paula can fetch it), and the bar shadow screen.s reads (stride 44). */
extern uint32_t uade_module_len;
extern uint8_t uade_module_src[];
#ifdef PT4A_HOST
uint8_t pt4_pool[4u << 20];
#define pt4_pool_end (pt4_pool + sizeof(pt4_pool))
#else
extern uint8_t pt4_pool[], pt4_pool_end[];
#endif
extern uint8_t pt4_vols[];

pt4_song *pt4a_song;
int32_t pt4a_err = 1;               /* 1 = not opened yet, else a PT4_ERR_* or PT4_OK */
uint32_t pt4a_logn;                 /* ticks logged */
/* per tick, per channel: period word, then volume | trigger << 8. The boot check
 * dumps it and tools/pt4_regcheck.c compares it with libpt4 on the host. */
uint16_t pt4a_log[PT4A_LOGTICKS * 4 * 2];

static uint8_t *pool_top;

static void *pool_alloc(size_t n, void *user)
{
    uint8_t *p = pool_top;
    (void)user;
    n = (n + 3) & ~(size_t)3;
    if (n > (size_t)(pt4_pool_end - p)) return NULL;
    pool_top = p + n;
    return p;
}

static void pool_free(void *p, void *user) { (void)p; (void)user; }   /* one song, never closed */

/* libpt4's no-hook fallback (pt4__malloc); with the hook set it is never reached,
 * but the symbol must resolve without pulling vbcc's AmigaOS malloc. */
#ifndef PT4A_HOST
void *malloc(size_t n) { return pool_alloc(n, NULL); }
void free(void *p) { (void)p; }
#endif

/* pt4_open without its length scan: scan_length runs the whole song (up to two
 * hours of ticks) before returning, seconds to minutes on a 68000. No pristine
 * arena copy either: real PT4 never restores EFx-funked samples, and it would
 * double the chip cost of the sample arena. */
int pt4a_init(void)
{
    static const pt4_alloc al = { pool_alloc, pool_free, NULL };
    pt4_song *s;
    int e;
    pool_top = pt4_pool;
    s = (pt4_song *)pool_alloc(sizeof(pt4_song), NULL);
    if (!s) return pt4a_err = PT4_ERR_MEMORY;
    memset(s, 0, sizeof(*s));
    s->al = al;
    s->opt_master = 64;
    s->opt_tempo = 125;
    s->rate = 44100;
    s->opt_path = PT4_PATH_PAULA;
    e = pt4__load(s, uade_module_src, uade_module_len);
    if (e != PT4_OK) return pt4a_err = e;
    s->loop = 1;
    s->path = PT4_PATH_PAULA;
    pt4__reset(s);
    pt4a_song = s;
    return pt4a_err = PT4_OK;
}

/* CIA-B timer value for the song's current BPM (the glue starts the timer with it). */
uint32_t pt4a_cia(void)
{
    return pt4__cia_period(pt4a_song ? pt4a_song->st.tempo : 125);
}

#ifdef PT4A_HOST
#define DMACON(v)         ((void)(v))
#define AUD_LC(n, v)       ((void)(v))
#define AUD_LEN(n, v)      ((void)(v))
#define AUD_PER(n, v)      ((void)(v))
#define AUD_VOL(n, v)      ((void)(v))
#define LINES(k)           ((void)0)
#else
#define CUSTOM_W(o)        (*(volatile uint16_t *)(0xdff000UL + (o)))
#define DMACON(v)          (CUSTOM_W(0x096) = (uint16_t)(v))
#define AUD_LC(n, v)       (*(volatile uint32_t *)(0xdff0a0UL + 16 * (n)) = (uint32_t)(v))
#define AUD_LEN(n, v)      (CUSTOM_W(0x0a4 + 16 * (n)) = (uint16_t)(v))
#define AUD_PER(n, v)      (CUSTOM_W(0x0a6 + 16 * (n)) = (uint16_t)(v))
#define AUD_VOL(n, v)      (CUSTOM_W(0x0a8 + 16 * (n)) = (uint16_t)(v))
#define LINES(k)           lines(k)

/* Paula picks up a DMA off / new pointer only at its next sample fetch: wait
 * k rasterlines (VHPOSR high byte), as ProTracker's DMA wait does. */
static void lines(int k)
{
    volatile uint8_t *vpos = (volatile uint8_t *)0xdff006UL;
    while (k--) {
        uint8_t l = *vpos;
        while (*vpos == l) {}
    }
}
#endif

/* One replay tick to Paula. Returns the CIA-B timer value for the NEXT interval
 * (the tick that just ran keeps the old one: pt4__cia_period, tempo latched as
 * on the Paula path of libpt4's do_tick), or 0 when unchanged. */
uint32_t pt4a_tick(void)
{
    pt4_song *s = pt4a_song;
    uint32_t lc[4];
    uint16_t len[4], mask = 0, old;
    int n;
    if (!s) return 0;
    old = s->st.tempo;
    pt4__tick(s);
    /* shortcut: F00 (song stop) restarts the song instead of stopping; upgrade
     * if a template ever needs a hard stop. */
    if (!s->st.playing) pt4__reset(s);
    for (n = 0; n < 4; n++) {
        pt4_chan *c = &s->st.ch[n];
        pt4_aud *a = &s->st.aud[n];
        if (c->dmawait || a->per == 1) {
            mask |= (uint16_t)(1u << n);
            lc[n] = a->lc;
            len[n] = a->len;
        }
    }
    /* libpt4's own trigger bookkeeping (clears dmawait, a->per = period, the
     * trigger volume): the state the host Paula path renders from.
     * shortcut: chunked (DYN envelope) samples play as one plain sample here;
     * PT4 walks their chunk list from the audio interrupt. Upgrade: an AUDx
     * interrupt that feeds the next chunk. */
    pt4__update_voices(s);
    if (mask) {
        DMACON(mask);
        LINES(5);
        for (n = 0; n < 4; n++) {
            if (!(mask & (1u << n))) continue;
            AUD_LC(n, s->arena + lc[n]);
            AUD_LEN(n, len[n]);
        }
    }
    for (n = 0; n < 4; n++) {
        pt4_aud *a = &s->st.aud[n];
        uint16_t per = a->per < 2 ? s->st.ch[n].period : a->per;
        uint16_t vol = s->st.v[n].vol;
        AUD_PER(n, per);
        AUD_VOL(n, vol);
        pt4_vols[44 * n] = (uint8_t)vol;
        if (pt4a_logn < PT4A_LOGTICKS) {
            pt4a_log[pt4a_logn * 8 + n * 2] = per;
            pt4a_log[pt4a_logn * 8 + n * 2 + 1] = (uint16_t)(vol | (((mask >> n) & 1u) << 8));
        }
    }
    if (pt4a_logn < PT4A_LOGTICKS) pt4a_logn++;
    if (mask) {
        DMACON(0x8000 | mask);
        LINES(5);
        for (n = 0; n < 4; n++) {
            pt4_chan *c = &s->st.ch[n];
            if (!(mask & (1u << n))) continue;
            AUD_LC(n, s->arena + c->loopstart);   /* replen 1 = the 2-byte one-shot loop */
            AUD_LEN(n, c->replen ? c->replen : 1);
        }
    }
    return s->st.tempo != old ? pt4__cia_period(s->st.tempo) : 0;
}
