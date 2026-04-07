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

/* Snapshot of all 4 Paula channels captured at each CIA-A Timer A tick.
 * Each tick corresponds to one tracker "speed" unit. Every `speed` ticks = one pattern row.
 * Unlike the Paula write log, tick snapshots capture held notes (no register writes).
 */
#define TICK_SNAP_SIZE  32768
#define TICK_SNAP_MASK  (TICK_SNAP_SIZE - 1)

typedef struct {
    uint16_t period;      /* AUDx PER register (current playing period) */
    uint16_t volume;      /* AUDx VOL register (0-64) */
    uint32_t lc;          /* AUDx LC — current sample pointer (chip RAM addr) */
    uint16_t len;         /* AUDx LEN — sample length in words */
    uint8_t  dma_en;      /* Paula DMA enable bit for this channel */
    uint8_t  triggered;   /* 1 if DMA restarted this tick (new note), else 0 */
} UadeChannelTick;        /* 12 bytes */

typedef struct {
    uint32_t        tick;        /* CIA-A Timer A tick count */
    UadeChannelTick channels[4]; /* All 4 Paula channels */
} UadeTickSnapshot;              /* 4 + 4*12 = 52 bytes */

#ifdef UADE_WASM
extern void uade_wasm_log_paula_write(uint8_t channel, uint8_t reg, uint16_t value);
#endif
