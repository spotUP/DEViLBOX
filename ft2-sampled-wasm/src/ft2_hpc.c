/* ft2_hpc.c — WASM stub: high-precision counter timing no-ops */
#include "ft2_hpc.h"

hpcFreq_t hpcFreq;

void hpc_Init(void)                              {}
void hpc_SetDurationInHz(hpc_t *hpc, double dHz) { (void)hpc; (void)dHz; }
void hpc_SetDurationInMs(hpc_t *hpc, double dMs) { (void)hpc; (void)dMs; }
void hpc_ResetCounters(hpc_t *hpc)               { (void)hpc; }
void hpc_Wait(hpc_t *hpc)                        { (void)hpc; }
