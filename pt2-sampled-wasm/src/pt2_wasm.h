/*
** PT2 Clone Sample Editor - WASM extraction
** Based on 8bitbubsy's pt2-clone (https://github.com/8bitbubsy/pt2-clone)
**
** This file provides all types, constants, and prototypes needed for the
** extracted PT2 sample editor running in WebAssembly via Emscripten.
** No SDL2 dependency - uses direct framebuffer rendering.
*/

#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <assert.h>

/* ---- Constants (from pt2_header.h) ---- */

#define SCREEN_W 320
#define SCREEN_H 255

#define SAMPLE_VIEW_HEIGHT 64
#define SAMPLE_AREA_WIDTH 314
#define SAMPLE_AREA_Y_CENTER 169

#define FONT_CHAR_W 8
#define FONT_CHAR_H 5

#define MOD_SAMPLES 31
#define MAX_PATTERNS 100
#define MOD_ROWS 64
#define PAULA_VOICES 4

#ifndef PI
#define PI 3.14159265358979323846264338327950288
#endif

#define FILTERS_BASE_FREQ 22050.0

/* Max sample length: standard PT = 0xFFFE, 128K mode = 0x1FFFE */
#define MAX_SAMPLE_LENGTH 0xFFFE

/* ---- Palette (from pt2_palette.h) ---- */

enum {
    PAL_BACKGRD   = 0,
    PAL_BORDER    = 1,
    PAL_GENBKG    = 2,
    PAL_GENBKG2   = 3,
    PAL_QADSCP    = 4,
    PAL_PATCURSOR = 5,
    PAL_GENTXT    = 6,
    PAL_PATTXT    = 7,
    PAL_SAMPLLINE = 8,
    PAL_LOOPPIN   = 9,
    PAL_TEXTMARK  = 10,
    PAL_MOUSE_1   = 11,
    PAL_MOUSE_2   = 12,
    PAL_MOUSE_3   = 13,
    PAL_COLORKEY  = 14,
    PALETTE_NUM   = 15
};

/* ---- Helper macros (from pt2_helpers.h) ---- */

#define CLAMP(x, low, high) (((x) > (high)) ? (high) : (((x) < (low)) ? (low) : (x)))
#define CLAMP16(i) if ((int16_t)(i) != i) i = 0x7FFF ^ (i >> 31)
#define CLAMP8(i)  if ((int8_t)(i) != i) i = 0x7F ^ (i >> 15)

#define SGN(x) (((x) > 0) - ((x) < 0))
#define ABS(x) (((x) < 0) ? -(x) : (x))
#define MIN(a, b) (((a) < (b)) ? (a) : (b))
#define MAX(a, b) (((a) > (b)) ? (a) : (b))

#define R24(x) (((x) >> 16) & 0xFF)
#define G24(x) (((x) >>  8) & 0xFF)
#define B24(x) ((x) & 0xFF)
#define RGB24(r, g, b) (((r) << 16) | ((g) << 8) | (b))

/* ---- Header flags (from pt2_header.h) ---- */

enum {
    NO_CARRY = 0,
    DO_CARRY = 1,
    NO_SAMPLE_CUT = 0,
    SAMPLE_CUT = 1,
    REMOVE_SAMPLE_MARKING = 0,
    KEEP_SAMPLE_MARKING = 1,
    MOD_NOT_MODIFIED = 0,
    MOD_IS_MODIFIED = 1,
    MOUSE_BUTTON_NOT_HELD = 0,
    MOUSE_BUTTON_HELD = 1
};

/* ---- Data structures (adapted from pt2_structs.h) ---- */

typedef struct moduleSample_t {
    volatile int8_t *volumeDisp;
    volatile int32_t *lengthDisp, *loopStartDisp, *loopLengthDisp;
    char text[22 + 1];
    int8_t volume;
    uint8_t fineTune;
    int32_t offset, length, loopStart, loopLength;
} moduleSample_t;

typedef struct module_t {
    bool loaded, modified;
    int8_t *sampleData;
    moduleSample_t samples[MOD_SAMPLES];
    /* Minimal module state - we only use samples */
} module_t;

typedef struct sampler_t {
    const int8_t *samStart;
    int8_t *blankSample, *copyBuf, *sampleUndoCopy;
    int16_t loopStartPos, loopEndPos;
    uint16_t dragStart, dragEnd;
    int32_t samPointWidth, samOffset, samDisplay, samLength, saveMouseX, lastSamPos;
    int32_t lastMouseX, lastMouseY, tmpLoopStart, tmpLoopLength, copyBufSize;
} sampler_t;

typedef struct mouse_t {
    bool leftButtonPressed, rightButtonPressed;
    int32_t x, y, lastMouseX, lastGUIButton;
    uint32_t buttonState;
} mouse_t;

typedef struct keyb_t {
    bool shiftPressed, leftCtrlPressed, leftAltPressed;
} keyb_t;

typedef struct video_t {
    uint32_t *frameBuffer;
    uint32_t palette[PALETTE_NUM];
} video_t;

typedef struct config_t {
    bool waveformCenterLine;
    int32_t maxSampleLength;
} config_t;

typedef struct editor_t {
    bool errorMsgActive, errorMsgBlock;
    bool sampleZero, blockMarkFlag, normalizeFiltersFlag;
    bool halveSampleFlag;
    int8_t currSample;
    int8_t *smpRedoBuffer[MOD_SAMPLES];
    int8_t smpRedoFinetunes[MOD_SAMPLES], smpRedoVolumes[MOD_SAMPLES];
    int32_t smpRedoLoopStarts[MOD_SAMPLES], smpRedoLoopLengths[MOD_SAMPLES], smpRedoLengths[MOD_SAMPLES];
    int32_t markStartOfs, markEndOfs, samplePos;
    uint8_t errorMsgCounter;
    uint8_t tuningNote, resampleNote, currPlayNote;
    uint16_t hpCutOff, lpCutOff, vol1, vol2;
    char mixText[16+1];
} editor_t;

typedef struct ui_t {
    char statusMessage[18], prevStatusMessage[18];
    bool samplerScreenShown;
    bool leftLoopPinMoving, rightLoopPinMoving;
    bool forceSampleDrag, forceSampleEdit;
    bool samplerVolBoxShown, samplerFiltersBoxShown, samplingBoxShown;
    int8_t forceVolDrag;
    int16_t sampleMarkingPos;
    uint16_t lastSampleOffset;
    bool updateStatusText, updateSongSize, updateSongTiming;
    bool updateResampleNote, update9xxPos;
    bool updateCurrSampleLength, updateCurrSampleRepeat, updateCurrSampleReplen;
    bool updateCurrSampleVolume, updateCurrSampleNum, updateCurrSampleFineTune;
    bool updateCurrSampleName;
    bool updatePosText, updateVolFromText, updateVolToText;
    bool updateNormFlag, updateLPText, updateHPText;
} ui_t;

typedef struct cursor_t {
    uint8_t channel;
} cursor_t;

/* ---- RC Filter types (from pt2_rcfilters.h) ---- */

typedef struct onePoleFilter_t {
    double tmpL, tmpR, a1, a2;
} onePoleFilter_t;

typedef struct twoPoleFilter_t {
    double tmpL[4], tmpR[4], a1, a2, b1, b2;
} twoPoleFilter_t;

/* ---- Global variables ---- */

extern video_t video;
extern editor_t editor;
extern sampler_t sampler;
extern mouse_t mouse;
extern keyb_t keyb;
extern ui_t ui;
extern cursor_t cursor;
extern config_t config;
extern module_t *song;

/* Font and BMP data */
extern const uint8_t fontBMP[6096];
extern const uint8_t samplerScreenPackedBMP[3076];
extern uint32_t *samplerScreenBMP;
extern const char hexTable[16];

/* ---- Rendering primitives (from pt2_visuals.c) ---- */

void putPixel(int32_t x, int32_t y, uint32_t pixelColor);
void hLine(int32_t x, int32_t y, int32_t w, uint32_t pixelColor);
void vLine(int32_t x, int32_t y, int32_t h, uint32_t pixelColor);
void fillRect(int32_t x, int32_t y, int32_t w, int32_t h, uint32_t pixelColor);
void blit32(int32_t x, int32_t y, int32_t w, int32_t h, const uint32_t *src);

/* ---- Text rendering (from pt2_textout.c) ---- */

void charOut(uint32_t xPos, uint32_t yPos, char ch, uint32_t color);
void charOut2(uint32_t xPos, uint32_t yPos, char ch);
void charOutBg(uint32_t xPos, uint32_t yPos, char ch, uint32_t fgColor, uint32_t bgColor);
void textOut(uint32_t xPos, uint32_t yPos, const char *text, uint32_t color);
void textOut2(uint32_t xPos, uint32_t yPos, const char *text);
void textOutBg(uint32_t xPos, uint32_t yPos, const char *text, uint32_t fgColor, uint32_t bgColor);
void printTwoDecimals(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor);
void printFiveDecimalsBg(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor, uint32_t backColor);
void printSixDecimalsBg(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor, uint32_t backColor);
void printTwoHex(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor);
void printFourHex(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor);
void printFiveHex(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor);
void printOneHex(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor);

/* ---- BMP unpacking (from pt2_bmp.c) ---- */

uint32_t *unpackBMP(const uint8_t *src, uint32_t packedLen);

/* ---- RC Filters (from pt2_rcfilters.c) ---- */

void setupOnePoleFilter(double audioRate, double cutOff, onePoleFilter_t *f);
void clearOnePoleFilterState(onePoleFilter_t *f);
void onePoleLPFilter(onePoleFilter_t *f, double in, double *out);
void onePoleHPFilter(onePoleFilter_t *f, double in, double *out);

/* ---- Sampler (from pt2_sampler.c) ---- */

void sampleLine(int32_t line_x1, int32_t line_x2, int32_t line_y1, int32_t line_y2);
void renderSampleData(void);
void invertRange(void);
void displaySample(void);
void redrawSample(void);
void setLoopSprites(void);
void setDragBar(void);
void createSampleMarkTable(void);
int32_t smpPos2Scr(int32_t pos);
int32_t scr2SmpPos(int32_t x);
void fixSampleBeep(moduleSample_t *s);
void samplerScreen(void);

void samplerSamplePressed(bool mouseButtonHeld);
void samplerBarPressed(bool mouseButtonHeld);
void samplerEditSample(bool mouseButtonHeld);
void samplerLoopToggle(void);
void samplerZoomInMouseWheel(void);
void samplerZoomOutMouseWheel(void);
void samplerZoomOut2x(void);
void samplerShowAll(void);
void samplerShowRange(void);
void samplerRangeAll(void);
void sampleMarkerToBeg(void);
void sampleMarkerToCenter(void);
void sampleMarkerToEnd(void);

void samplerSamCopy(void);
void samplerSamPaste(void);
void samplerSamDelete(uint8_t cut);
void samplerRemoveDcOffset(void);

void killSample(void);
void upSample(void);
void downSample(void);
void boostSample(int32_t sample, bool ignoreMark);
void filterSample(int32_t sample, bool ignoreMark);
void highPassSample(int32_t cutOff);
void lowPassSample(int32_t cutOff);

bool allocSamplerVars(void);
void deAllocSamplerVars(void);
void fillSampleRedoBuffer(int8_t sample);
void redoSampleData(int8_t sample);
void fillSampleFilterUndoBuffer(void);
void updateSamplePos(void);

/* ---- Stub prototypes ---- */

void turnOffVoices(void);
void lockAudio(void);
void unlockAudio(void);
void updateCurrSample(void);
void updateWindowTitle(int modified);
void displayErrorMsg(const char *msg);
void displayMsg(const char *msg);
void statusNotSampleZero(void);
void statusSampleIsEmpty(void);
void statusOutOfMemory(void);
double getDoublePeak(const double *buf, int32_t len);
void setErrPointer(void);

/* ---- WASM bridge API ---- */

/* Parameter IDs - must match PT2Hardware.tsx */
enum PT2Param {
    PT2_VOLUME = 0,
    PT2_FINETUNE,
    PT2_LOOP_START_HI,
    PT2_LOOP_START_LO,
    PT2_LOOP_LENGTH_HI,
    PT2_LOOP_LENGTH_LO,
    PT2_LOOP_TYPE,
    PT2_PARAM_COUNT
};

void pt2_sampled_init(int w, int h);
void pt2_sampled_start(void);
void pt2_sampled_shutdown(void);
void pt2_sampled_load_pcm(const int8_t *data, int length);
void pt2_sampled_set_param(int param_id, int value);
int pt2_sampled_get_param(int param_id);
void pt2_sampled_load_config(const uint8_t *buf, int len);
int pt2_sampled_dump_config(uint8_t *buf, int max_len);
uint32_t *pt2_sampled_get_fb(void);
void pt2_sampled_on_mouse_down(int x, int y);
void pt2_sampled_on_mouse_up(int x, int y);
void pt2_sampled_on_mouse_move(int x, int y);
void pt2_sampled_on_wheel(int deltaY, int x, int y);
void pt2_sampled_on_key_down(int keyCode);
