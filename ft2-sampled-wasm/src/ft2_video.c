/*
 * ft2_video.c — WASM stub for FT2 video subsystem.
 *
 * Provides the video_t struct, framebuffer allocation, and complete sprite
 * system (loop pins, cursor). Removes all SDL window/renderer/texture code
 * since the WASM bridge exposes the framebuffer directly to JavaScript.
 *
 * The sprite code is preserved verbatim from the reference implementation
 * so loop pins render correctly on the waveform area.
 */

#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>
#include <assert.h>
#include "ft2_header.h"
#include "ft2_gui.h"
#include "ft2_video.h"
#include "ft2_bmp.h"
#include "ft2_structs.h"
#include "ft2_mouse.h"
#include "ft2_sample_ed.h"

/* text cursor palette entries (used for text-edit cursor sprite) */
static const uint8_t textCursorData[12] =
{
    PAL_FORGRND, PAL_FORGRND, PAL_FORGRND,
    PAL_FORGRND, PAL_FORGRND, PAL_FORGRND,
    PAL_FORGRND, PAL_FORGRND, PAL_FORGRND,
    PAL_FORGRND, PAL_FORGRND, PAL_FORGRND
};

video_t video; /* globalized */

static sprite_t sprites[SPRITE_NUM];

/* ── Stub functions (SDL/window/FPS not needed in WASM) ─────────────── */

void resetFPSCounter(void)  {}
void beginFPSCounter(void)  {}
void endFPSCounter(void)    {}

void updateWindowTitle(bool forceUpdate) { (void)forceUpdate; }
void showErrorMsgBox(const char *fmt, ...) { (void)fmt; }
void handleScopesFromChQueue(void *a, uint8_t *b) { (void)a; (void)b; }

void enterFullscreen(void)  {}
void leaveFullscreen(void)  {}
void setWindowSizeFromConfig(bool updateRenderer) { (void)updateRenderer; }
bool recreateTexture(void)  { return true; }
void toggleFullscreen(void) {}

bool setupWindow(void)
{
    /* Allocate the framebuffer — no SDL window needed */
    video.frameBuffer = (uint32_t *)calloc(SCREEN_W * SCREEN_H, sizeof(uint32_t));
    return video.frameBuffer != NULL;
}

bool setupRenderer(void)
{
    return true; /* no-op */
}

void closeVideo(void)
{
    if (video.frameBuffer != NULL)
    {
        free(video.frameBuffer);
        video.frameBuffer = NULL;
    }
}

/* flipFrame: called by the reference code at end of each frame.
 * In WASM, JavaScript reads the framebuffer directly — just run sprites. */
void flipFrame(void)
{
    renderLoopPins();
    renderSprites();
    eraseSprites();
}

/* ── Sprite system (copied verbatim from reference ft2_video.c) ──────── */

bool setupSprites(void)
{
    sprite_t *s;

    memset(sprites, 0, sizeof(sprites));

    /* hide all sprites at init */
    s = sprites;
    for (int32_t i = 0; i < SPRITE_NUM; i++, s++)
        s->x = s->y = INT16_MAX;

    s = &sprites[SPRITE_MOUSE_POINTER];
    s->data = bmp.mouseCursors;
    s->w = MOUSE_CURSOR_W;
    s->h = MOUSE_CURSOR_H;

    s = &sprites[SPRITE_LEFT_LOOP_PIN];
    s->data = &bmp.loopPins[0 * (154 * 16)];
    s->w = 16;
    s->h = SAMPLE_AREA_HEIGHT;

    s = &sprites[SPRITE_RIGHT_LOOP_PIN];
    s->data = &bmp.loopPins[2 * (154 * 16)];
    s->w = 16;
    s->h = SAMPLE_AREA_HEIGHT;

    s = &sprites[SPRITE_TEXT_CURSOR];
    s->data = textCursorData;
    s->w = 1;
    s->h = 12;

    hideSprite(SPRITE_MOUSE_POINTER);
    hideSprite(SPRITE_LEFT_LOOP_PIN);
    hideSprite(SPRITE_RIGHT_LOOP_PIN);
    hideSprite(SPRITE_TEXT_CURSOR);

    /* setup refresh buffer (used to clear sprites after each frame) */
    s = sprites;
    for (uint32_t i = 0; i < SPRITE_NUM; i++, s++)
    {
        s->refreshBuffer = (uint32_t *)malloc(s->w * s->h * sizeof(int32_t));
        if (s->refreshBuffer == NULL)
            return false;
    }

    return true;
}

void changeSpriteData(int32_t sprite, const uint8_t *data)
{
    sprites[sprite].data = data;
    memset(sprites[sprite].refreshBuffer, 0, sprites[sprite].w * sprites[sprite].h * sizeof(int32_t));
}

void freeSprites(void)
{
    sprite_t *s = sprites;
    for (int32_t i = 0; i < SPRITE_NUM; i++, s++)
    {
        if (s->refreshBuffer != NULL)
        {
            free(s->refreshBuffer);
            s->refreshBuffer = NULL;
        }
    }
}

void setLeftLoopPinState(bool clicked)
{
    changeSpriteData(SPRITE_LEFT_LOOP_PIN,
        clicked ? &bmp.loopPins[1 * (154 * 16)] : &bmp.loopPins[0 * (154 * 16)]);
}

void setRightLoopPinState(bool clicked)
{
    changeSpriteData(SPRITE_RIGHT_LOOP_PIN,
        clicked ? &bmp.loopPins[3 * (154 * 16)] : &bmp.loopPins[2 * (154 * 16)]);
}

int32_t getSpritePosX(int32_t sprite)
{
    return sprites[sprite].x;
}

void setSpritePos(int32_t sprite, int32_t x, int32_t y)
{
    sprites[sprite].newX = (int16_t)x;
    sprites[sprite].newY = (int16_t)y;
}

void hideSprite(int32_t sprite)
{
    sprites[sprite].newX = SCREEN_W;
}

void eraseSprites(void)
{
    sprite_t *s = &sprites[SPRITE_NUM - 1];
    for (int32_t i = SPRITE_NUM - 1; i >= 0; i--, s--)
    {
        if (s->x >= SCREEN_W || s->y >= SCREEN_H)
            continue;

        assert(s->refreshBuffer != NULL);

        int32_t sw = s->w;
        int32_t sh = s->h;
        int32_t sx = s->x;
        int32_t sy = s->y;

        if (sx < 0) { sw += sx; sx = 0; }
        if (sy < 0) { sh += sy; sy = 0; }

        const uint32_t *src32 = s->refreshBuffer;
        uint32_t *dst32 = &video.frameBuffer[(sy * SCREEN_W) + sx];

        if (sx + sw >= SCREEN_W) sw = SCREEN_W - sx;
        if (sy + sh >= SCREEN_H) sh = SCREEN_H - sy;

        const int32_t srcPitch = s->w - sw;
        const int32_t dstPitch = SCREEN_W - sw;

        for (int32_t y = 0; y < sh; y++)
        {
            for (int32_t x = 0; x < sw; x++)
                *dst32++ = *src32++;
            src32 += srcPitch;
            dst32 += dstPitch;
        }
    }
}

void renderSprites(void)
{
    sprite_t *s = sprites;
    for (int32_t i = 0; i < SPRITE_NUM; i++, s++)
    {
        /* loop pins are handled separately in renderLoopPins() */
        if (i == SPRITE_LEFT_LOOP_PIN || i == SPRITE_RIGHT_LOOP_PIN)
            continue;

        /* skip text cursor in WASM (no input focus concept) */
        if (i == SPRITE_TEXT_CURSOR)
            continue;

        s->x = s->newX;
        s->y = s->newY;

        if (s->x >= SCREEN_W || s->y >= SCREEN_H)
            continue;

        assert(s->data != NULL && s->refreshBuffer != NULL);

        int32_t sw = s->w;
        int32_t sh = s->h;
        int32_t sx = s->x;
        int32_t sy = s->y;
        const uint8_t *src8 = s->data;

        if (sx < 0) { sw += sx; src8 -= sx; sx = 0; }
        if (sy < 0) { sh += sy; src8 += (-sy * s->w); sy = 0; }
        if (sw <= 0 || sh <= 0) continue;

        uint32_t *dst32 = &video.frameBuffer[(sy * SCREEN_W) + sx];
        uint32_t *clr32 = s->refreshBuffer;

        if (sx + sw >= SCREEN_W) sw = SCREEN_W - sx;
        if (sy + sh >= SCREEN_H) sh = SCREEN_H - sy;

        const int32_t srcPitch = s->w - sw;
        const int32_t dstPitch = SCREEN_W - sw;

        for (int32_t y = 0; y < sh; y++)
        {
            for (int32_t x = 0; x < sw; x++)
            {
                *clr32++ = *dst32;
                if (*src8 != PAL_TRANSPR)
                {
                    assert(*src8 < PAL_NUM);
                    *dst32 = video.palette[*src8];
                }
                dst32++;
                src8++;
            }
            clr32 += srcPitch;
            src8  += srcPitch;
            dst32 += dstPitch;
        }
    }
}

void renderLoopPins(void)
{
    const uint8_t *src8;
    int32_t sx, x, y, sw, sh, srcPitch, dstPitch;
    uint32_t *clr32, *dst32;

    /* left loop pin */
    sprite_t *s = &sprites[SPRITE_LEFT_LOOP_PIN];
    assert(s->data != NULL && s->refreshBuffer != NULL);

    s->x = s->newX;
    s->y = s->newY;

    if (s->x < SCREEN_W)
    {
        sw = s->w;
        sh = s->h;
        sx = s->x;
        src8  = s->data;
        clr32 = s->refreshBuffer;

        if (sx < 0) { sw += sx; src8 -= sx; sx = 0; }
        dst32 = &video.frameBuffer[(s->y * SCREEN_W) + sx];

        if (sx + sw >= SCREEN_W) sw = SCREEN_W - sx;

        srcPitch = s->w - sw;
        dstPitch = SCREEN_W - sw;

        for (y = 0; y < sh; y++)
        {
            for (x = 0; x < sw; x++)
            {
                *clr32++ = *dst32;
                if (*src8 != PAL_TRANSPR)
                {
                    assert(*src8 < PAL_NUM);
                    *dst32 = video.palette[*src8];
                }
                dst32++;
                src8++;
            }
            src8  += srcPitch;
            clr32 += srcPitch;
            dst32 += dstPitch;
        }
    }

    /* right loop pin */
    s = &sprites[SPRITE_RIGHT_LOOP_PIN];
    assert(s->data != NULL && s->refreshBuffer != NULL);

    s->x = s->newX;
    s->y = s->newY;

    if (s->x < SCREEN_W)
    {
        sw = s->w;
        sh = s->h;
        sx = s->x;
        src8  = s->data;
        clr32 = s->refreshBuffer;

        if (sx < 0) { sw += sx; src8 -= sx; sx = 0; }
        dst32 = &video.frameBuffer[(s->y * SCREEN_W) + sx];

        if (sx + sw >= SCREEN_W) sw = SCREEN_W - sx;

        srcPitch = s->w - sw;
        dstPitch = SCREEN_W - sw;

        for (y = 0; y < sh; y++)
        {
            for (x = 0; x < sw; x++)
            {
                *clr32++ = *dst32;
                if (*src8 != PAL_TRANSPR)
                {
                    assert(*src8 < PAL_NUM);
                    *dst32 = video.palette[*src8];
                }
                dst32++;
                src8++;
            }
            src8  += srcPitch;
            clr32 += srcPitch;
            dst32 += dstPitch;
        }
    }
}

/* handleRedrawing: called from WASM tick.
 * We only need the sample editor redrawing path. */
void handleRedrawing(void)
{
    handleSamplerRedrawing();
    flipFrame();
}
