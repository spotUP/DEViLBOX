/* Test shim for sysdeps.h — only the types audiodevice.c and the shim memory
 * model actually need. See uade-wasm/tests/README.md. */
#ifndef AD_TEST_SYSDEPS_H
#define AD_TEST_SYSDEPS_H
#include <stdint.h>
typedef uint8_t  uae_u8;
typedef int8_t   uae_s8;
typedef uint16_t uae_u16;
typedef int16_t  uae_s16;
typedef uint32_t uae_u32;
typedef int32_t  uae_s32;
typedef uae_u32  uaecptr;
#endif
