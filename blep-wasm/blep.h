/**
 * PT2-clone BLEP (Band-Limited Step) implementation
 * Original code by aciddose
 * Ported for WebAssembly by DEViLBOX
 *
 * BLEP reduces aliasing artifacts in digital audio synthesis
 * by band-limiting discontinuities (steps) in the waveform.
 */

#ifndef BLEP_H
#define BLEP_H

#include <stdint.h>

/* BLEP configuration
 * ZC = zero crossings (ripples in impulse)
 * OS = oversampling (samples per zero crossing)
 * SP = step size per output sample
 * NS = number of samples to insert
 * RNS = (2^n > NS) - 1, used to wrap buffer
 */
#define BLEP_ZC 16
#define BLEP_OS 16
#define BLEP_SP 16
#define BLEP_NS (BLEP_ZC * BLEP_OS / BLEP_SP)
#define BLEP_RNS 31

typedef struct blep_t
{
    int32_t index;
    int32_t samplesLeft;
    double dBuffer[BLEP_RNS + 1];
    double dLastValue;
} blep_t;

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize a BLEP buffer
 * Must be called before using blepAdd/blepRun
 */
void blepInit(blep_t *b);

/**
 * Add a band-limited step correction to the buffer
 * @param b BLEP buffer
 * @param dOffset Fractional offset (0.0 - 1.0) within current sample
 * @param dAmplitude Amplitude change (delta) to band-limit
 */
void blepAdd(blep_t *b, double dOffset, double dAmplitude);

/**
 * Process input sample with BLEP correction
 * @param b BLEP buffer
 * @param dInput Input sample value
 * @return Band-limited output sample
 */
double blepRun(blep_t *b, double dInput);

#ifdef __cplusplus
}
#endif

#endif // BLEP_H
