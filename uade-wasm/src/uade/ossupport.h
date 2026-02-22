/* ossupport.h — WASM shim: minimal OS support for UADE WASM build */
#ifndef _UADE_OSSUPPORT_H_
#define _UADE_OSSUPPORT_H_

/* Include the standard unixsupport.h for macro/function declarations */
#include <uade/unixsupport.h>

/* memmem() replacement — WASM/musl typically has it, but declare if needed */
#ifndef _GNU_SOURCE
void *memmem(const void *haystack, size_t haystacklen,
             const void *needle, size_t needlelen);
#endif

#endif /* _UADE_OSSUPPORT_H_ */
