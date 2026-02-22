/*
** PT2 Clone Sample Editor - Rendering primitives
** Adapted from 8bitbubsy's pt2-clone (pt2_visuals.c)
*/

#include "pt2_wasm.h"

void putPixel(int32_t x, int32_t y, uint32_t pixelColor)
{
	video.frameBuffer[(y * SCREEN_W) + x] = pixelColor;
}

void hLine(int32_t x, int32_t y, int32_t w, uint32_t pixelColor)
{
	uint32_t *dstPtr = &video.frameBuffer[(y * SCREEN_W) + x];
	for (int32_t xx = 0; xx < w; xx++)
		dstPtr[xx] = pixelColor;
}

void vLine(int32_t x, int32_t y, int32_t h, uint32_t pixelColor)
{
	uint32_t *dstPtr = &video.frameBuffer[(y * SCREEN_W) + x];
	for (int32_t yy = 0; yy < h; yy++)
	{
		*dstPtr = pixelColor;
		dstPtr += SCREEN_W;
	}
}

void fillRect(int32_t x, int32_t y, int32_t w, int32_t h, uint32_t pixelColor)
{
	uint32_t *dstPtr = &video.frameBuffer[(y * SCREEN_W) + x];
	for (int32_t yy = 0; yy < h; yy++)
	{
		for (int32_t xx = 0; xx < w; xx++)
			dstPtr[xx] = pixelColor;

		dstPtr += SCREEN_W;
	}
}

void blit32(int32_t x, int32_t y, int32_t w, int32_t h, const uint32_t *src)
{
	const uint32_t *srcPtr = src;
	uint32_t *dstPtr = &video.frameBuffer[(y * SCREEN_W) + x];

	for (int32_t yy = 0; yy < h; yy++)
	{
		memcpy(dstPtr, srcPtr, w * sizeof(uint32_t));

		srcPtr += w;
		dstPtr += SCREEN_W;
	}
}
