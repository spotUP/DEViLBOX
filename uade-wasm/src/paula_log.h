/*
 * paula_log.h — Paula register write log shared between audio.c and entry.c.
 *
 * Enabled only in UADE_WASM builds. Used during enhanced scan to track which
 * chip RAM addresses source each AUDx register write, enabling auto-discovery
 * of per-instrument parameter layouts without format-specific parsers.
 */
#pragma once
#include <stdint.h>

#define PAULA_LOG_SIZE  512
#define PAULA_LOG_MASK  (PAULA_LOG_SIZE - 1)

/* Paula register indices */
#define PAULA_REG_LCH  0   /* AUDxLCH — sample ptr high */
#define PAULA_REG_LCL  1   /* AUDxLCL — sample ptr low  */
#define PAULA_REG_LEN  2   /* AUDxLEN — sample length   */
#define PAULA_REG_PER  3   /* AUDxPER — period (pitch)  */
#define PAULA_REG_VOL  4   /* AUDxVOL — volume 0-64     */
#define PAULA_REG_DAT  5   /* AUDxDAT — data word       */

typedef struct {
    uint8_t  channel;
    uint8_t  reg;
    uint16_t value;
    uint32_t source_addr;   /* g_uade_last_chip_read_addr at write time */
    uint32_t tick;          /* g_uade_tick_count at write time */
} UadePaulaLogEntry;        /* 12 bytes */

#ifdef UADE_WASM
extern void uade_wasm_log_paula_write(uint8_t channel, uint8_t reg, uint16_t value);
#endif
