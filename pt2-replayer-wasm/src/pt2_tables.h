#pragma once

#include <stdint.h>
#include "pt2_replayer.h"

// Minimal guiButton_t stub (from pt2_mouse.h, not needed for replayer but used in table data)
typedef struct guiButton_t
{
	uint16_t x1, y1, x2, y2, b;
} guiButton_t;

// TABLES

extern const char *ftuneStrTab[16];
extern const int8_t vuMeterHeights[65];
extern const char hexTable[16];
extern const uint32_t cursorColors[6][3];
extern const char *noteNames1[2+36];
extern const char *noteNames2[2+36];
extern const char *noteNames3[2+36];
extern const char *noteNames4[2+36];
extern const uint8_t vibratoTable[32];
extern const uint16_t modulationTable[64];
extern const int16_t periodTable[(37*16)+15];
extern int8_t pNoteTable[32];
extern const uint64_t musicTimeTab52[(MAX_BPM-MIN_BPM)+1+1];

// changable by config file
extern uint16_t analyzerColors[36];
extern uint16_t vuMeterColors[48];
