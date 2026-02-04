/*
 * Dexed.h - Stub header for WASM build
 * Provides minimal definitions needed by msfa files
 */

#ifndef DEXED_H_INCLUDED
#define DEXED_H_INCLUDED

// Common definitions
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Helper macros
#ifndef max
#define max(a,b) ((a) > (b) ? (a) : (b))
#endif

#ifndef min
#define min(a,b) ((a) < (b) ? (a) : (b))
#endif

// MSFA configuration (defined in env.h, but kept here for reference)
#ifndef ACCURATE_ENVELOPE
#define ACCURATE_ENVELOPE 1
#endif

#endif // DEXED_H_INCLUDED
