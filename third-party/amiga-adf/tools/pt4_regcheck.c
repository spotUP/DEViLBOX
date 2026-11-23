/* pt4_regcheck: the per-tick Paula register stream of the native ProTracker 4 ADF
 * (amiga/pt4_amiga.c) against libpt4 on the host.
 *
 *   pt4_regcheck <module> [<amiga log dump>] [ticks]
 *
 * Reference: the module opened through libpt4's public pt4_open on the Paula path,
 * then per tick pt4__tick + pt4__update_voices, logging what reaches Paula: the
 * period (a->per, or the channel period while a trigger is pending), the voice
 * volume and the trigger bit. Checked against it:
 *   1. pt4_amiga.c built for the host (-DPT4A_HOST): pt4a_init + pt4a_tick, the
 *      exact code the ADF runs, minus the register writes;
 *   2. optionally the ADF's own pt4a_log, dumped from the emulator (big-endian
 *      words, as tools/adf-boot-check.py --dump writes it).
 * Prints the first mismatches and "[OK] n ticks" or "[ERROR] ...". Exit 1 on a mismatch.
 *
 * Build (host): cc -std=c99 -O2 -DPT4A_HOST -I<libpt4>/src -I<libpt4>/include
 *   tools/pt4_regcheck.c amiga/pt4_amiga.c <libpt4.a> -o pt4_regcheck
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "pt4.h"
#include "pt4_internal.h"

/* the symbols pt4_glue.s provides on the Amiga (the host pool lives in pt4_amiga.c) */
uint32_t uade_module_len;
uint8_t uade_module_src[1u << 20];
uint8_t pt4_vols[4 * 44];

extern pt4_song *pt4a_song;
extern int32_t pt4a_err;
extern uint32_t pt4a_logn;
extern uint16_t pt4a_log[];
int pt4a_init(void);
uint32_t pt4a_tick(void);

static int report(const char *what, int tick, int ch, unsigned per_a, unsigned vt_a, unsigned per_b, unsigned vt_b)
{
    printf("  %s tick %d ch %d: per %u vol %u trig %u  vs  per %u vol %u trig %u\n", what, tick, ch,
           per_a, vt_a & 0xff, vt_a >> 8, per_b, vt_b & 0xff, vt_b >> 8);
    return 1;
}

int main(int argc, char **argv)
{
    FILE *f;
    long len;
    int err, t, n, ticks = argc > 3 ? atoi(argv[3]) : 1024, bad = 0, amiga_n = 0;
    pt4_song *s;
    static uint16_t ref[1024 * 8], amiga[1024 * 8];
    if (argc < 2) { fprintf(stderr, "usage: pt4_regcheck <module> [<amiga log dump>] [ticks]\n"); return 2; }
    if (ticks > 1024) ticks = 1024;
    f = fopen(argv[1], "rb");
    if (!f) { perror(argv[1]); return 2; }
    len = (long)fread(uade_module_src, 1, sizeof(uade_module_src), f);
    fclose(f);
    uade_module_len = (uint32_t)len;

    s = pt4_open(uade_module_src, (size_t)len, NULL, &err);
    if (!s) { printf("[ERROR] pt4_open %d\n", err); return 1; }
    pt4_set_option(s, PT4_OPT_PATH, PT4_PATH_PAULA);
    s->loop = 1;
    pt4__reset(s);
    for (t = 0; t < ticks; t++) {
        uint16_t trig = 0;
        pt4__tick(s);
        if (!s->st.playing) pt4__reset(s);
        for (n = 0; n < 4; n++)
            if (s->st.ch[n].dmawait || s->st.aud[n].per == 1) trig |= (uint16_t)(1u << n);
        pt4__update_voices(s);
        for (n = 0; n < 4; n++) {
            pt4_aud *a = &s->st.aud[n];
            ref[t * 8 + n * 2] = a->per < 2 ? s->st.ch[n].period : a->per;
            ref[t * 8 + n * 2 + 1] = (uint16_t)(s->st.v[n].vol | (((trig >> n) & 1u) << 8));
        }
    }

    if (pt4a_init() != PT4_OK) { printf("[ERROR] pt4a_init %d\n", (int)pt4a_err); return 1; }
    for (t = 0; t < ticks; t++) pt4a_tick();
    for (t = 0; t < ticks; t++)
        for (n = 0; n < 4; n++)
            if (memcmp(&ref[t * 8 + n * 2], &pt4a_log[t * 8 + n * 2], 4) && bad++ < 8)
                report("host pt4a", t, n, ref[t * 8 + n * 2], ref[t * 8 + n * 2 + 1],
                       pt4a_log[t * 8 + n * 2], pt4a_log[t * 8 + n * 2 + 1]);

    if (argc > 2) {
        uint8_t buf[sizeof(amiga)];
        size_t got;
        f = fopen(argv[2], "rb");
        if (!f) { perror(argv[2]); return 2; }
        got = fread(buf, 1, sizeof(buf), f);
        fclose(f);
        amiga_n = (int)(got / 16);
        if (amiga_n > ticks) amiga_n = ticks;
        for (t = 0; t < amiga_n * 8; t++) amiga[t] = (uint16_t)(buf[t * 2] << 8 | buf[t * 2 + 1]);
        for (t = 0; t < amiga_n; t++)
            for (n = 0; n < 4; n++)
                if (memcmp(&ref[t * 8 + n * 2], &amiga[t * 8 + n * 2], 4) && bad++ < 16)
                    report("amiga", t, n, ref[t * 8 + n * 2], ref[t * 8 + n * 2 + 1],
                           amiga[t * 8 + n * 2], amiga[t * 8 + n * 2 + 1]);
    }
    if (bad) { printf("[ERROR] %d mismatching channel-ticks (%d ticks, amiga %d)\n", bad, ticks, amiga_n); return 1; }
    printf("[OK] %d ticks match libpt4 (host pt4a_tick); amiga dump %d ticks\n", ticks, amiga_n);
    return 0;
}
