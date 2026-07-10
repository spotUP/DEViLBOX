/* native_trace.c — offline driver to dump the MaxTrax Paula note stream.
 * Unity-includes the harness (which includes the transpiled maxtrax.c).
 * Build (via emcc, run under node — keeps 32-bit addressing):
 *   emcc -DMXTX_DEBUG -DMXTX_BEGINIO_GATE=100000 -Isrc -Isrc/generated/maxtrax \
 *     -I../tools/asm68k-to-c/runtime native_trace.c \
 *     ../tools/asm68k-to-c/runtime/paula_soft.c -s NODERAWFS=1 -s ENVIRONMENT=node \
 *     -o /tmp/mtx_trace.js
 * Usage: node /tmp/mtx_trace.js file.mxtx [seconds] [score] [--reload]
 *   --reload : load, render 1s, stop, load again, render — tests reload-once bug.
 */
int g_evprobe=0;
#include "src/maxtrax_harness.c"

/* The transpiler emits `#define for 0` / `#define to 0` etc. as fallbacks for
 * bare asm symbols. maxtrax.c is goto-based so it never trips on them, but they
 * poison the C keywords in this driver. Undo them here. */
#undef for
#undef to
#undef change
#undef flags

static FILE *g_wav = NULL;
static long g_wav_frames = 0;
static void wav_put32(FILE *f, uint32_t v){ fputc(v&0xff,f);fputc((v>>8)&0xff,f);fputc((v>>16)&0xff,f);fputc((v>>24)&0xff,f); }
static void wav_put16(FILE *f, uint16_t v){ fputc(v&0xff,f);fputc((v>>8)&0xff,f); }
static void wav_open(const char *path){
    g_wav = fopen(path,"wb"); if(!g_wav) return;
    fwrite("RIFF",1,4,g_wav); wav_put32(g_wav,0); fwrite("WAVE",1,4,g_wav);
    fwrite("fmt ",1,4,g_wav); wav_put32(g_wav,16); wav_put16(g_wav,1); wav_put16(g_wav,2);
    wav_put32(g_wav,PAULA_RATE_PAL); wav_put32(g_wav,PAULA_RATE_PAL*4); wav_put16(g_wav,4); wav_put16(g_wav,16);
    fwrite("data",1,4,g_wav); wav_put32(g_wav,0);
}
static void wav_close(void){
    if(!g_wav) return;
    long dbytes = g_wav_frames*4;
    fseek(g_wav,4,SEEK_SET); wav_put32(g_wav,36+dbytes);
    fseek(g_wav,40,SEEK_SET); wav_put32(g_wav,dbytes);
    fclose(g_wav); g_wav=NULL;
}

static int render_secs(double secs) {
    int total = (int)(secs * (double)PAULA_RATE_PAL);
    float out[563 * 2];
    int done = 0, chunk, k;
    long nonzero = 0;
    while (done < total) {
        chunk = 563;
        if (chunk > total - done) chunk = total - done;
        maxtrax_render(out, chunk);
        for (k = 0; k < chunk * 2; k++) { if (out[k] != 0.0f) nonzero++; }
        if (g_wav) {
            for (k = 0; k < chunk * 2; k++) {
                float s = out[k]; if(s>1.f)s=1.f; if(s<-1.f)s=-1.f;
                wav_put16(g_wav,(uint16_t)(int16_t)(s*32767.f));
            }
            g_wav_frames += chunk;
        }
        done += chunk;
    }
    return (int)nonzero;
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s file.mxtx [seconds] [score] [--reload]\n", argv[0]); return 2; }
    double secs = argc > 2 ? atof(argv[2]) : 10.0;
    int score   = argc > 3 ? atoi(argv[3]) : 0;
    int reload  = 0, ai;
    for (ai = 1; ai < argc; ai++) { if (!strcmp(argv[ai], "--reload")) reload = 1; }

    FILE *f = fopen(argv[1], "rb");
    if (!f) { perror("open"); return 1; }
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *buf = malloc(n);
    if (fread(buf, 1, n, f) != (size_t)n) { perror("read"); return 1; }
    fclose(f);

    int r = maxtrax_load(buf, (uint32_t)n, score);
    fprintf(stderr, "[trace] load#1 -> %d (len=%ld)\n", r, n);
    if (r != 0) return 3;

    if (reload) {
        int nz1 = render_secs(1.0);
        fprintf(stderr, "[trace] render#1 nonzero_samples=%d\n", nz1);
        maxtrax_stop();
        fprintf(stderr, "[trace] --- maxtrax_stop() ---\n");
        int r2 = maxtrax_load(buf, (uint32_t)n, score);
        fprintf(stderr, "[trace] load#2 -> %d\n", r2);
        int nz2 = render_secs(1.0);
        fprintf(stderr, "[trace] render#2 nonzero_samples=%d  (0 => reload-once bug reproduced)\n", nz2);
        return 0;
    }

    wav_open("/tmp/mtx.wav");
    int nz = render_secs(secs);
    wav_close();
    fprintf(stderr, "[trace] rendered %.1fs nonzero_samples=%d beginio_count=%d wav=/tmp/mtx.wav\n",
            secs, nz, g_beginio_count);
    return 0;
}
