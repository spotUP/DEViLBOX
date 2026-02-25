/*
 * ft2_wasm_bridge.c — WASM export layer for FT2 Sample Editor
 *
 * Bridges the real FT2 clone sample editor code to JavaScript.
 * All functions prefixed with ft2_sampled_ are exported via EMSCRIPTEN_KEEPALIVE.
 * PCM data and config are loaded from JS; parameter changes are reported back
 * via EM_JS callbacks.
 */

#include <emscripten.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#include "ft2_header.h"
#include "ft2_video.h"
#include "ft2_gui.h"
#include "ft2_palette.h"
#include "ft2_bmp.h"
#include "ft2_mouse.h"
#include "ft2_config.h"
#include "ft2_sample_ed.h"
#include "ft2_replayer.h"
#include "ft2_structs.h"
#include "ft2_keyboard.h"
#include "ft2_tables.h"

/* ── JS callbacks (EM_JS) ──────────────────────────────────────────────── */

EM_JS(void, js_onParamChange, (int paramId, int value), {
    if (Module.onParamChange) Module.onParamChange(paramId, value);
});

EM_JS(void, js_onLoopChange, (int loopStart, int loopLength, int loopType), {
    if (Module.onLoopChange) Module.onLoopChange(loopStart, loopLength, loopType);
});

EM_JS(void, js_onVolEnvChange, (int index, int tick, int value), {
    if (Module.onVolEnvChange) Module.onVolEnvChange(index, tick, value);
});

EM_JS(void, js_onPanEnvChange, (int index, int tick, int value), {
    if (Module.onPanEnvChange) Module.onPanEnvChange(index, tick, value);
});

EM_JS(void, js_onVolEnvFlagsChange, (int flags), {
    if (Module.onVolEnvFlagsChange) Module.onVolEnvFlagsChange(flags);
});

EM_JS(void, js_onPanEnvFlagsChange, (int flags), {
    if (Module.onPanEnvFlagsChange) Module.onPanEnvFlagsChange(flags);
});

/* ── Internal state ────────────────────────────────────────────────────── */

static bool g_initialized = false;

/* ── Exported WASM API ─────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_init(int w, int h)
{
    (void)w; (void)h; /* fixed 632×400 */

    if (g_initialized) return;

    /* Initialize config defaults */
    resetConfig();

    /* Set up palette (dark mode) */
    setPal16(palTable[config.cfg_StdPalNum], true);

    /* Allocate framebuffer */
    if (!setupWindow())
        return;

    /* Load BMP graphics data (fonts, GUI elements, loop pins, etc.) */
    if (!loadBMPs())
        return;

    /* Initialize sprites (loop pins, mouse cursor) */
    if (!setupSprites())
        return;

    /* Allocate instrument 1 for editing */
    allocateInstr(1);
    editor.curInstr = 1;
    editor.curSmp = 0;

    /* Set up initial song state */
    song.speed = 6;
    song.BPM = 125;
    song.numChannels = 8;
    song.songLength = 1;

    g_initialized = true;
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_start(void)
{
    if (!g_initialized) return;

    /* Show the sample editor screen */
    ui.sampleEditorShown = true;
    showSampleEditor();
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_shutdown(void)
{
    if (!g_initialized) return;

    freeSprites();
    closeVideo();
    freeAllInstr();

    g_initialized = false;
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_tick(void)
{
    if (!g_initialized) return;
    handleRedrawing();
}

EMSCRIPTEN_KEEPALIVE
uint32_t ft2_sampled_get_fb(void)
{
    return (uint32_t)(uintptr_t)video.frameBuffer;
}

/* ── PCM loading ───────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_load_pcm(int16_t *pcmData, int32_t numSamples)
{
    if (!g_initialized || !pcmData || numSamples <= 0) return;
    if (instr[1] == NULL) allocateInstr(1);

    sample_t *s = &instr[1]->smp[editor.curSmp];

    /* Free old sample data */
    if (s->origDataPtr != NULL)
    {
        free(s->origDataPtr);
        s->origDataPtr = NULL;
        s->dataPtr     = NULL;
    }

    /* Allocate new sample — use allocateSmpData for proper interpolation taps */
    if (!allocateSmpData(s, numSamples, true)) /* true = 16-bit */
        return;

    /* Copy PCM data */
    memcpy(s->dataPtr, pcmData, numSamples * sizeof(int16_t));

    s->length = numSamples;
    s->flags  = SAMPLE_16BIT; /* loop off by default */
    s->volume = 64;
    s->panning = 128;

    /* Fix interpolation edge taps */
    fixSample(s);

    /* Reset view to show the full sample and redraw the waveform.
     * updateSampleEditorSample() sets smpEd_ViewSize = numSamples and
     * calls writeSample(true) directly. updateSampleEditor() alone only
     * redraws labels/buttons and never triggers a waveform repaint. */
    updateSampleEditorSample();
}

/* ── Parameter access ──────────────────────────────────────────────────── */

enum {
    PARAM_VOLUME = 0,
    PARAM_PANNING = 1,
    PARAM_FINETUNE = 2,
    PARAM_RELATIVE_NOTE = 3,
    PARAM_VIB_TYPE = 4,
    PARAM_VIB_SWEEP = 5,
    PARAM_VIB_DEPTH = 6,
    PARAM_VIB_RATE = 7,
    PARAM_FADEOUT = 8,
};

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_set_param(int32_t paramId, int32_t value)
{
    if (!g_initialized || instr[1] == NULL) return;

    sample_t *s = &instr[1]->smp[editor.curSmp];
    instr_t *ins = instr[1];

    switch (paramId)
    {
        case PARAM_VOLUME:        s->volume = (uint8_t)value; break;
        case PARAM_PANNING:       s->panning = (uint8_t)value; break;
        case PARAM_FINETUNE:      s->finetune = (int8_t)value; break;
        case PARAM_RELATIVE_NOTE: s->relativeNote = (int8_t)value; break;
        case PARAM_VIB_TYPE:      ins->autoVibType = (uint8_t)value; break;
        case PARAM_VIB_SWEEP:     ins->autoVibSweep = (uint8_t)value; break;
        case PARAM_VIB_DEPTH:     ins->autoVibDepth = (uint8_t)value; break;
        case PARAM_VIB_RATE:      ins->autoVibRate = (uint8_t)value; break;
        case PARAM_FADEOUT:       ins->fadeout = (uint16_t)value; break;
        default: break;
    }

    updateSampleEditor();
}

EMSCRIPTEN_KEEPALIVE
int32_t ft2_sampled_get_param(int32_t paramId)
{
    if (!g_initialized || instr[1] == NULL) return 0;

    sample_t *s = &instr[1]->smp[editor.curSmp];
    instr_t *ins = instr[1];

    switch (paramId)
    {
        case PARAM_VOLUME:        return s->volume;
        case PARAM_PANNING:       return s->panning;
        case PARAM_FINETUNE:      return s->finetune;
        case PARAM_RELATIVE_NOTE: return s->relativeNote;
        case PARAM_VIB_TYPE:      return ins->autoVibType;
        case PARAM_VIB_SWEEP:     return ins->autoVibSweep;
        case PARAM_VIB_DEPTH:     return ins->autoVibDepth;
        case PARAM_VIB_RATE:      return ins->autoVibRate;
        case PARAM_FADEOUT:       return ins->fadeout;
        default: return 0;
    }
}

/* ── Loop control ──────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_set_loop(int32_t loopStart, int32_t loopLength, int32_t loopType)
{
    if (!g_initialized || instr[1] == NULL) return;

    sample_t *s = &instr[1]->smp[editor.curSmp];

    s->loopStart  = loopStart;
    s->loopLength = loopLength;

    /* Clear old loop flags, set new */
    s->flags &= ~(LOOP_FWD | LOOP_BIDI);
    if (loopType == 1) s->flags |= LOOP_FWD;
    else if (loopType == 2) s->flags |= LOOP_BIDI;

    fixSample(s);
    updateSampleEditor();
}

/* ── Envelope control ──────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_set_vol_env_point(int32_t index, int32_t tick, int32_t value)
{
    if (!g_initialized || instr[1] == NULL) return;
    if (index < 0 || index >= 12) return;

    instr[1]->volEnvPoints[index][0] = (int16_t)tick;
    instr[1]->volEnvPoints[index][1] = (int16_t)value;
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_set_pan_env_point(int32_t index, int32_t tick, int32_t value)
{
    if (!g_initialized || instr[1] == NULL) return;
    if (index < 0 || index >= 12) return;

    instr[1]->panEnvPoints[index][0] = (int16_t)tick;
    instr[1]->panEnvPoints[index][1] = (int16_t)value;
}

/* ── Config buffer (126 bytes) ─────────────────────────────────────────── */
/* Layout:
 * [0]:     volume (0-64)
 * [1]:     panning (0-128)
 * [2-3]:   finetune (int16 LE)
 * [4]:     relativeNote
 * [5]:     loopType (0=off, 1=forward, 2=pingpong)
 * [6-9]:   loopStart (int32 LE)
 * [10-13]: loopLength (int32 LE)
 * [14-15]: fadeout (uint16 LE)
 * [16]:    vibType
 * [17]:    vibSweep
 * [18]:    vibDepth
 * [19]:    vibRate
 * [20]:    volEnv enabled
 * [21]:    volEnv sustainPoint (0xFF = none)
 * [22]:    volEnv loopStart
 * [23]:    volEnv loopEnd
 * [24-71]: vol envelope points (12 × 4 bytes: tick(int16 LE), value(int16 LE))
 * [72]:    panEnv enabled
 * [73]:    panEnv sustainPoint
 * [74]:    panEnv loopStart
 * [75]:    panEnv loopEnd
 * [76-123]: pan envelope points (same format)
 * [124]:   num vol points
 * [125]:   num pan points
 */

static int16_t readInt16LE(const uint8_t *p)
{
    return (int16_t)(p[0] | (p[1] << 8));
}

static int32_t readInt32LE(const uint8_t *p)
{
    return (int32_t)(p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24));
}

static void writeInt16LE(uint8_t *p, int16_t v)
{
    p[0] = (uint8_t)(v & 0xFF);
    p[1] = (uint8_t)((v >> 8) & 0xFF);
}

static void writeInt32LE(uint8_t *p, int32_t v)
{
    p[0] = (uint8_t)(v & 0xFF);
    p[1] = (uint8_t)((v >> 8) & 0xFF);
    p[2] = (uint8_t)((v >> 16) & 0xFF);
    p[3] = (uint8_t)((v >> 24) & 0xFF);
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_load_config(const uint8_t *buf, int32_t len)
{
    if (!g_initialized || !buf || len < 126) return;
    if (instr[1] == NULL) allocateInstr(1);

    sample_t *s = &instr[1]->smp[editor.curSmp];
    instr_t *ins = instr[1];

    /* Sample params */
    s->volume       = buf[0];
    s->panning      = buf[1];
    s->finetune     = (int8_t)readInt16LE(&buf[2]);
    s->relativeNote = (int8_t)buf[4];

    /* Loop */
    int32_t loopType   = buf[5];
    s->loopStart  = readInt32LE(&buf[6]);
    s->loopLength = readInt32LE(&buf[10]);
    s->flags &= ~(LOOP_FWD | LOOP_BIDI);
    if (loopType == 1)      s->flags |= LOOP_FWD;
    else if (loopType == 2) s->flags |= LOOP_BIDI;

    /* Instrument params */
    ins->fadeout       = (uint16_t)readInt16LE(&buf[14]);
    ins->autoVibType   = buf[16];
    ins->autoVibSweep  = buf[17];
    ins->autoVibDepth  = buf[18];
    ins->autoVibRate   = buf[19];

    /* Volume envelope */
    ins->volEnvFlags = buf[20] ? ENV_ENABLED : 0;
    ins->volEnvSustain   = buf[21];
    ins->volEnvLoopStart = buf[22];
    ins->volEnvLoopEnd   = buf[23];
    if (ins->volEnvSustain != 0xFF) ins->volEnvFlags |= ENV_SUSTAIN;
    if (ins->volEnvLoopStart != ins->volEnvLoopEnd) ins->volEnvFlags |= ENV_LOOP;

    int32_t numVolPts = buf[124];
    if (numVolPts > 12) numVolPts = 12;
    ins->volEnvLength = (uint8_t)numVolPts;
    for (int32_t i = 0; i < 12; i++)
    {
        int32_t off = 24 + i * 4;
        ins->volEnvPoints[i][0] = readInt16LE(&buf[off]);
        ins->volEnvPoints[i][1] = readInt16LE(&buf[off + 2]);
    }

    /* Pan envelope */
    ins->panEnvFlags = buf[72] ? ENV_ENABLED : 0;
    ins->panEnvSustain   = buf[73];
    ins->panEnvLoopStart = buf[74];
    ins->panEnvLoopEnd   = buf[75];
    if (ins->panEnvSustain != 0xFF) ins->panEnvFlags |= ENV_SUSTAIN;
    if (ins->panEnvLoopStart != ins->panEnvLoopEnd) ins->panEnvFlags |= ENV_LOOP;

    int32_t numPanPts = buf[125];
    if (numPanPts > 12) numPanPts = 12;
    ins->panEnvLength = (uint8_t)numPanPts;
    for (int32_t i = 0; i < 12; i++)
    {
        int32_t off = 76 + i * 4;
        ins->panEnvPoints[i][0] = readInt16LE(&buf[off]);
        ins->panEnvPoints[i][1] = readInt16LE(&buf[off + 2]);
    }

    if (s->length > 0)
        fixSample(s);

    updateSampleEditor();
}

EMSCRIPTEN_KEEPALIVE
int32_t ft2_sampled_dump_config(uint8_t *buf, int32_t maxLen)
{
    if (!g_initialized || !buf || maxLen < 126 || instr[1] == NULL) return 0;
    if (editor.curSmp >= MAX_SMP_PER_INST) return 0;

    sample_t *s = &instr[1]->smp[editor.curSmp];
    instr_t *ins = instr[1];

    memset(buf, 0, 126);

    buf[0] = s->volume;
    buf[1] = s->panning;
    writeInt16LE(&buf[2], s->finetune);
    buf[4] = (uint8_t)s->relativeNote;

    uint8_t lt = GET_LOOPTYPE(s->flags);
    buf[5] = (lt == LOOP_FWD) ? 1 : (lt == LOOP_BIDI) ? 2 : 0;

    writeInt32LE(&buf[6],  s->loopStart);
    writeInt32LE(&buf[10], s->loopLength);
    writeInt16LE(&buf[14], (int16_t)ins->fadeout);

    buf[16] = ins->autoVibType;
    buf[17] = ins->autoVibSweep;
    buf[18] = ins->autoVibDepth;
    buf[19] = ins->autoVibRate;

    /* Volume envelope */
    buf[20] = (ins->volEnvFlags & ENV_ENABLED) ? 1 : 0;
    buf[21] = ins->volEnvSustain;
    buf[22] = ins->volEnvLoopStart;
    buf[23] = ins->volEnvLoopEnd;
    for (int32_t i = 0; i < 12; i++)
    {
        int32_t off = 24 + i * 4;
        writeInt16LE(&buf[off],     ins->volEnvPoints[i][0]);
        writeInt16LE(&buf[off + 2], ins->volEnvPoints[i][1]);
    }

    /* Pan envelope */
    buf[72] = (ins->panEnvFlags & ENV_ENABLED) ? 1 : 0;
    buf[73] = ins->panEnvSustain;
    buf[74] = ins->panEnvLoopStart;
    buf[75] = ins->panEnvLoopEnd;
    for (int32_t i = 0; i < 12; i++)
    {
        int32_t off = 76 + i * 4;
        writeInt16LE(&buf[off],     ins->panEnvPoints[i][0]);
        writeInt16LE(&buf[off + 2], ins->panEnvPoints[i][1]);
    }

    buf[124] = ins->volEnvLength;
    buf[125] = ins->panEnvLength;

    return 126;
}

/* ── Mouse input ───────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_on_mouse_down(int32_t x, int32_t y)
{
    if (!g_initialized) return;

    mouse.x = (int16_t)x;
    mouse.y = (int16_t)y;
    mouse.leftButtonPressed = true;

    mouseButtonDownHandler(SDL_BUTTON_LEFT);
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_on_mouse_up(int32_t x, int32_t y)
{
    if (!g_initialized) return;

    mouse.x = (int16_t)x;
    mouse.y = (int16_t)y;
    mouse.leftButtonPressed = false;

    mouseButtonUpHandler(SDL_BUTTON_LEFT);
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_on_mouse_move(int32_t x, int32_t y)
{
    if (!g_initialized) return;

    mouse.x = (int16_t)x;
    mouse.y = (int16_t)y;

    if (mouse.leftButtonPressed)
        handleLastGUIObjectDown();
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_on_wheel(int32_t deltaY, int32_t x, int32_t y)
{
    if (!g_initialized) return;

    mouse.x = (int16_t)x;
    mouse.y = (int16_t)y;

    /* FT2 sample editor zoom via scroll wheel */
    if (deltaY < 0)
        mouseZoomSampleDataIn();
    else if (deltaY > 0)
        mouseZoomSampleDataOut();
}

EMSCRIPTEN_KEEPALIVE
void ft2_sampled_on_key_down(int32_t keyCode)
{
    (void)keyCode;
    /* Not wired yet — sample editor doesn't need many keyboard shortcuts */
}
