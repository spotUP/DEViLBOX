#pragma once
// Stubs for GUI/SDL functions not available in WASM headless mode

#include <stdint.h>
#include <stdbool.h>

// Visual sync stubs (called by replayer)
#define setVisualsDataPtr(ch, ptr) (void)0
#define setVisualsLength(ch, len) (void)0
#define setVisualsDMACON(val) (void)0
#define setVisualsVolume(ch, vol) (void)0
#define setVisualsPeriod(ch, period) (void)0

// UI message stubs
static inline void displayErrorMsg(const char *msg) { (void)msg; }
static inline void displayMsg(const char *msg) { (void)msg; }
static inline void statusOutOfMemory(void) {}
static inline void statusAllRight(void) {}

// Pointer/cursor stubs
static inline void pointerSetMode(uint8_t mode, uint8_t carry) { (void)mode; (void)carry; }
static inline void pointerSetModeThreadSafe(uint8_t mode, bool carry) { (void)mode; (void)carry; }
static inline void updateCursorPos(void) {}
static inline void updateCurrSample(void) {}
static inline void updateSamplePos(void) {}
static inline void setErrPointer(void) {}
static inline void setMsgPointer(void) {}
static inline void renderMuteButtons(void) {}
static inline void displayMainScreen(void) {}

// Pos editor stubs
static inline void posEdClearNames(void) {}

// Sample redo stubs
static inline void fillSampleRedoBuffer(uint8_t smp) { (void)smp; }

// Visual sync stubs (audio thread)
static inline void fillVisualsSyncBuffer(void) {}
static inline void resetChSyncQueue(void) {}
static inline void calcAudioLatencyVars(uint32_t bufSize, uint32_t rate) { (void)bufSize; (void)rate; }

// Config stubs
static inline void createSampleMarkTable(void) {}

// Misc stubs
static inline void setupSprites(void) {}
static inline void freeSamples(void) {}

// Pointer mode enums (needed by replayer)
enum
{
	POINTER_MODE_IDLE = 0,
	POINTER_MODE_PLAY = 1,
	POINTER_MODE_EDIT = 2,
	POINTER_MODE_RECORD = 3,
	POINTER_MODE_MSG1 = 4
};

// Sync flag defines (from pt2_visuals_sync.h)
#define UPDATE_VUMETER      1
#define UPDATE_SPECTRUM_ANALYZER 2

// Visual sync timing stub
static inline void setSyncTickTimeLen(uint32_t t, uint64_t f) { (void)t; (void)f; }
