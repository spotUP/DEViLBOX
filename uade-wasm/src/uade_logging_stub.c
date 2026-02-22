/* uade_logging_stub.c — WASM stub replacing uade_logging.c (no zakalwe dependency) */
#include <stdio.h>

void uade_logging_str(const char *s)
{
	(void)s;  /* No-op in WASM build */
}

void uade_logging_flush(void)
{
	/* No-op in WASM build */
}
