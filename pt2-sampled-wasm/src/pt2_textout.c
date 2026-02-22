/*
** PT2 Clone Sample Editor - Text rendering
** Adapted from 8bitbubsy's pt2-clone (pt2_textout.c)
*/

#include "pt2_wasm.h"

const char hexTable[16] = {
	'0','1','2','3','4','5','6','7',
	'8','9','A','B','C','D','E','F'
};

void charOut(uint32_t xPos, uint32_t yPos, char ch, uint32_t color)
{
	if (ch == '\0' || ch == ' ')
		return;

	int32_t h = FONT_CHAR_H;
	if (ch == 5 || ch == 6) // arrow up/down has 1 more scanline
		h++;

	const uint8_t *srcPtr = &fontBMP[(ch & 0x7F) << 3];
	uint32_t *dstPtr = &video.frameBuffer[(yPos * SCREEN_W) + xPos];

	for (int32_t y = 0; y < h; y++)
	{
		for (int32_t x = 0; x < FONT_CHAR_W; x++)
		{
			if (srcPtr[x])
				dstPtr[x] = color;
		}

		srcPtr += 127 * FONT_CHAR_W;
		dstPtr += SCREEN_W;
	}
}

void charOut2(uint32_t xPos, uint32_t yPos, char ch) // for static GUI text
{
	if (ch == '\0' || ch == ' ')
		return;

	int32_t h = FONT_CHAR_H;
	if (ch == 5 || ch == 6)
		h++;

	const uint8_t *srcPtr = &fontBMP[(ch & 0x7F) << 3];
	uint32_t *dstPtr = &video.frameBuffer[(yPos * SCREEN_W) + xPos];

	const uint32_t fgColor = video.palette[PAL_BORDER];
	const uint32_t bgColor = video.palette[PAL_GENBKG2];

	for (int32_t y = 0; y < h; y++)
	{
		for (int32_t x = 0; x < FONT_CHAR_W; x++)
		{
			if (srcPtr[x])
			{
				dstPtr[x + (SCREEN_W + 1)] = bgColor;
				dstPtr[x] = fgColor;
			}
		}

		srcPtr += 127 * FONT_CHAR_W;
		dstPtr += SCREEN_W;
	}
}

void charOutBg(uint32_t xPos, uint32_t yPos, char ch, uint32_t fgColor, uint32_t bgColor)
{
	uint32_t colors[2];

	if (ch == '\0')
		return;

	int32_t h = FONT_CHAR_H;
	if (ch == 5 || ch == 6)
		h++;

	const uint8_t *srcPtr = &fontBMP[(ch & 0x7F) << 3];
	uint32_t *dstPtr = &video.frameBuffer[(yPos * SCREEN_W) + xPos];

	colors[0] = bgColor;
	colors[1] = fgColor;

	for (int32_t y = 0; y < h; y++)
	{
		for (int32_t x = 0; x < FONT_CHAR_W; x++)
			dstPtr[x] = colors[srcPtr[x]];

		srcPtr += 127 * FONT_CHAR_W;
		dstPtr += SCREEN_W;
	}
}

void textOut(uint32_t xPos, uint32_t yPos, const char *text, uint32_t color)
{
	uint32_t x = xPos;
	while (*text != '\0')
	{
		charOut(x, yPos, *text++, color);
		x += FONT_CHAR_W;
	}
}

void textOut2(uint32_t xPos, uint32_t yPos, const char *text) // for static GUI text
{
	uint32_t x = xPos;
	while (*text != '\0')
	{
		charOut2(x, yPos, *text++);
		x += FONT_CHAR_W - 1;
	}
}

void textOutBg(uint32_t xPos, uint32_t yPos, const char *text, uint32_t fgColor, uint32_t bgColor)
{
	uint32_t x = xPos;
	while (*text != '\0')
	{
		charOutBg(x, yPos, *text++, fgColor, bgColor);
		x += FONT_CHAR_W;
	}
}

void printTwoDecimals(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor)
{
	if (value == 0)
	{
		textOut(x, y, "00", fontColor);
	}
	else
	{
		if (value > 99) value = 99;
		charOut(x + (FONT_CHAR_W * 1), y, '0' + (value % 10), fontColor); value /= 10;
		charOut(x + (FONT_CHAR_W * 0), y, '0' + (value % 10), fontColor);
	}
}

void printFiveDecimalsBg(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor, uint32_t backColor)
{
	char numberText[6];

	if (value == 0)
	{
		textOutBg(x, y, "    0", fontColor, backColor);
	}
	else
	{
		if (value > 99999) value = 99999;

		numberText[5] = 0;
		numberText[4] = '0' + (value % 10); value /= 10;
		numberText[3] = '0' + (value % 10); value /= 10;
		numberText[2] = '0' + (value % 10); value /= 10;
		numberText[1] = '0' + (value % 10); value /= 10;
		numberText[0] = '0' + (value % 10);

		int32_t i = 0;
		while (numberText[i] == '0')
			numberText[i++] = ' ';

		textOutBg(x, y, numberText, fontColor, backColor);
	}
}

void printSixDecimalsBg(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor, uint32_t backColor)
{
	char numberText[7];

	if (value == 0)
	{
		textOutBg(x, y, "     0", fontColor, backColor);
	}
	else
	{
		if (value > 999999) value = 999999;

		numberText[6] = 0;
		numberText[5] = '0' + (value % 10); value /= 10;
		numberText[4] = '0' + (value % 10); value /= 10;
		numberText[3] = '0' + (value % 10); value /= 10;
		numberText[2] = '0' + (value % 10); value /= 10;
		numberText[1] = '0' + (value % 10); value /= 10;
		numberText[0] = '0' + (value % 10);

		int32_t i = 0;
		while (numberText[i] == '0')
			numberText[i++] = ' ';

		textOutBg(x, y, numberText, fontColor, backColor);
	}
}

void printOneHex(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor)
{
	charOut(x, y, hexTable[value & 15], fontColor);
}

void printTwoHex(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor)
{
	if (value == 0)
	{
		textOut(x, y, "00", fontColor);
	}
	else
	{
		value &= 0xFF;
		charOut(x + (FONT_CHAR_W * 0), y, hexTable[value >> 4], fontColor);
		charOut(x + (FONT_CHAR_W * 1), y, hexTable[value & 15], fontColor);
	}
}

void printFourHex(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor)
{
	if (value == 0)
	{
		textOut(x, y, "0000", fontColor);
	}
	else
	{
		value &= 0xFFFF;
		charOut(x + (FONT_CHAR_W * 0), y, hexTable[value >> 12], fontColor);
		charOut(x + (FONT_CHAR_W * 1), y, hexTable[(value & (15 << 8)) >> 8], fontColor);
		charOut(x + (FONT_CHAR_W * 2), y, hexTable[(value & (15 << 4)) >> 4], fontColor);
		charOut(x + (FONT_CHAR_W * 3), y, hexTable[value & 15], fontColor);
	}
}

void printFiveHex(uint32_t x, uint32_t y, uint32_t value, uint32_t fontColor)
{
	if (value == 0)
	{
		textOut(x, y, "00000", fontColor);
	}
	else
	{
		value &= 0xFFFFF;
		charOut(x + (FONT_CHAR_W * 0), y, hexTable[value >> 16], fontColor);
		charOut(x + (FONT_CHAR_W * 1), y, hexTable[(value & (15 << 12)) >> 12], fontColor);
		charOut(x + (FONT_CHAR_W * 2), y, hexTable[(value & (15 << 8)) >> 8], fontColor);
		charOut(x + (FONT_CHAR_W * 3), y, hexTable[(value & (15 << 4)) >> 4], fontColor);
		charOut(x + (FONT_CHAR_W * 4), y, hexTable[value & 15], fontColor);
	}
}

/* Status / error message display */

void displayMsg(const char *msg)
{
	editor.errorMsgActive = true;
	editor.errorMsgBlock = false;
	editor.errorMsgCounter = 0;

	if (*msg != '\0')
	{
		strcpy(ui.statusMessage, msg);
		ui.updateStatusText = true;
	}
}

void displayErrorMsg(const char *msg)
{
	editor.errorMsgActive = true;
	editor.errorMsgBlock = true;
	editor.errorMsgCounter = 0;

	if (*msg != '\0')
	{
		strcpy(ui.statusMessage, msg);
		ui.updateStatusText = true;
	}

	setErrPointer();
}
