/* state_detection_stub.c — WASM stub replacing state_detection.c (no zakalwe dependency) */
#include "sysconfig.h"
#include "sysdeps.h"

void uade_state_detection_init(const uae_u32 addr, const uae_u32 size)
{
	(void)addr;
	(void)size;
	/* No-op in WASM build — state detection disabled */
}

int uade_state_detection_step(void)
{
	return 0;  /* Always report: not in a detected end state */
}
