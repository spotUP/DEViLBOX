/*
** PT2 Clone Sample Editor - RC filters
** Adapted from 8bitbubsy's pt2-clone (pt2_rcfilters.c)
*/

#include "pt2_wasm.h"

#define SMALL_NUMBER (1E-4)

/* 1-pole RC low-pass/high-pass filter, based on:
** https://www.musicdsp.org/en/latest/Filters/116-one-pole-lp-and-hp.html
*/

void setupOnePoleFilter(double audioRate, double cutOff, onePoleFilter_t *f)
{
	if (cutOff >= audioRate / 2.0)
		cutOff = (audioRate / 2.0) - SMALL_NUMBER;

	const double a = 2.0 - cos(((2.0 * PI) * cutOff) / audioRate);
	const double b = a - sqrt((a * a) - 1.0);

	f->a1 = 1.0 - b;
	f->a2 = b;
}

void clearOnePoleFilterState(onePoleFilter_t *f)
{
	f->tmpL = f->tmpR = 0.0;
}

void onePoleLPFilter(onePoleFilter_t *f, double in, double *out)
{
	f->tmpL = (in * f->a1) + (f->tmpL * f->a2);
	*out = f->tmpL;
}

void onePoleHPFilter(onePoleFilter_t *f, double in, double *out)
{
	f->tmpL = (in * f->a1) + (f->tmpL * f->a2);
	*out = in - f->tmpL;
}
