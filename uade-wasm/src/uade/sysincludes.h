/* sysincludes.h — WASM shim: minimal system includes for WASM/Emscripten */
#ifndef _UADE_SYSINCLUDES_H_
#define _UADE_SYSINCLUDES_H_

/* Emscripten provides POSIX-like headers via musl */
#include <sys/types.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

/* netinet/in.h is needed for htonl/ntohl (byte order) */
#include <arpa/inet.h>

#endif /* _UADE_SYSINCLUDES_H_ */
