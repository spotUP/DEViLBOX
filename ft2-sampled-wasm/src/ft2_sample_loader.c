/* ft2_sample_loader.c — WASM stub: PCM loaded from JS, not from disk */
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include "ft2_header.h"
#include "ft2_replayer.h"
#include "ft2_sample_loader.h"

/* Globals declared extern in ft2_sample_loader.h */
bool loadAsInstrFlag = false;
bool smpFilenameSet = false;
char *smpFilename = NULL;
uint8_t sampleSlot = 0;
sample_t tmpSmp;
char *supportedSmpExtensions[] = { NULL };

void normalizeSigned32Bit(int32_t *d, uint32_t n)                  { (void)d;(void)n; }
void normalize32BitFloatToSigned16Bit(float *d, uint32_t n)        { (void)d;(void)n; }
void normalize64BitFloatToSigned16Bit(double *d, uint32_t n)       { (void)d;(void)n; }
bool loadSample(UNICHAR *f, uint8_t slot, bool instrFlag)           { (void)f;(void)slot;(void)instrFlag; return false; }
void removeSampleIsLoadingFlag(void)                                {}
