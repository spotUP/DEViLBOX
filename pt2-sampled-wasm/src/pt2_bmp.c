/*
** PT2 Clone Sample Editor - BMP unpacking
** Adapted from 8bitbubsy's pt2-clone (pt2_bmp.c)
*/

#include "pt2_wasm.h"

uint32_t *samplerScreenBMP = NULL;

uint32_t *unpackBMP(const uint8_t *src, uint32_t packedLen)
{
	// RLE decode
	int32_t decodedLength = (src[0] << 24) | (src[1] << 16) | (src[2] << 8) | src[3];

	// 2-bit to 8-bit conversion
	uint32_t *dst = (uint32_t *)malloc(((decodedLength * 4) * sizeof(uint32_t)) + 8);
	if (dst == NULL)
		return NULL;

	uint8_t *tmpBuffer = (uint8_t *)malloc(decodedLength + 128); // some margin needed
	if (tmpBuffer == NULL)
	{
		free(dst);
		return NULL;
	}

	const uint8_t *packSrc = src + 4; // skip "length" field
	uint8_t *packDst = tmpBuffer;

	int32_t i = packedLen - 4; // subtract "length" field
	while (i > 0)
	{
		uint8_t byteIn = *packSrc++;
		if (byteIn == 0xCC) // compactor code
		{
			int16_t count = *packSrc++;
			byteIn = *packSrc++;

			while (count-- >= 0)
				*packDst++ = byteIn;

			i -= 2;
		}
		else
		{
			*packDst++ = byteIn;
		}

		i--;
	}

	for (i = 0; i < decodedLength; i++)
	{
		const uint8_t byte1 = (tmpBuffer[i] & 0xC0) >> 6;
		dst[(i << 2) + 0] = video.palette[byte1];

		const uint8_t byte2 = (tmpBuffer[i] & 0x30) >> 4;
		dst[(i << 2) + 1] = video.palette[byte2];

		const uint8_t byte3 = (tmpBuffer[i] & 0x0C) >> 2;
		dst[(i << 2) + 2] = video.palette[byte3];

		const uint8_t byte4 = (tmpBuffer[i] & 0x03) >> 0;
		dst[(i << 2) + 3] = video.palette[byte4];
	}

	free(tmpBuffer);
	return dst;
}
