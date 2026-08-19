/* Test shim for UADE's memory.h.
 *
 * Models 68k memory as one flat window [AD_TEST_BASE, AD_TEST_BASE+AD_TEST_SIZE).
 * get_real_address() translates WITHOUT checking, exactly like the real one, so
 * any address the code fails to validate resolves to a pointer outside the
 * backing array and ASan catches the access. See uade-wasm/tests/README.md. */
#ifndef AD_TEST_MEMORY_H
#define AD_TEST_MEMORY_H
#include "sysdeps.h"

#define AD_TEST_BASE 0x10000u
#define AD_TEST_SIZE 0x2000u

/* Heap-allocated on purpose: a 32 KB global lands in __common on macOS, which the
 * linker de-aligns and ASan then cannot fence with redzones, so overruns escape
 * detection. A malloc'd block gets exact redzones on every platform. */
extern uae_u8 *ad_test_mem;
void ad_test_mem_init(void);

static inline uae_u8 *get_real_address(uaecptr addr)
{
    return &ad_test_mem[addr - AD_TEST_BASE];
}

static inline int valid_address(uaecptr addr, uae_u32 size)
{
    if (addr < AD_TEST_BASE) return 0;
    if (size > AD_TEST_SIZE) return 0;
    return (addr - AD_TEST_BASE) <= (AD_TEST_SIZE - size);
}
#endif
