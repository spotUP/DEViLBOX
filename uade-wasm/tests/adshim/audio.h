/* Test shim for UADE's audio.h — Paula register pokes are recorded instead of
 * emulated, so an out-of-range channel index lands in a real 4-element array
 * and ASan reports it. See uade-wasm/tests/README.md. */
#ifndef AD_TEST_AUDIO_H
#define AD_TEST_AUDIO_H
#include "sysdeps.h"

struct ad_test_channel { uae_u32 per, vol, lcl, lch, len; };
extern struct ad_test_channel ad_test_audio_channel[4];

void ad_test_poke(int channel, int reg, uae_u32 value);

#define AUDxPER(c, v) ad_test_poke((c), 0, (v))
#define AUDxVOL(c, v) ad_test_poke((c), 1, (v))
#define AUDxLCL(c, v) ad_test_poke((c), 2, (v))
#define AUDxLCH(c, v) ad_test_poke((c), 3, (v))
#define AUDxLEN(c, v) ad_test_poke((c), 4, (v))

void disable_audio_dma(int channel);
void update_audio(void);
void audio_use_text_scope(void);
#endif
