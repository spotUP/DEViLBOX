// for finding memory leaks in debug mode with Visual Studio 
#if defined _DEBUG && defined _MSC_VER
#include <crtdbg.h>
#endif

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <math.h>
#ifdef _WIN32
#include <io.h>
#else
#include <unistd.h>
#endif
#include <fcntl.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <limits.h>
#include "pt2_audio.h"
#include "pt2_helpers.h"
#include "pt2_config.h"
#include "pt2_stubs.h"
#include "pt2_downsample2x.h"
#include "pt2_replayer.h"
#include "pt2_paula.h"

// cumulative mid/side normalization factor (1/sqrt(2))*(1/sqrt(2))
#define STEREO_NORM_FACTOR 0.5

#define INITIAL_DITHER_SEED 0x12345000

static uint8_t panningMode;
static int32_t stereoSeparation = 100;
static uint32_t randSeed = INITIAL_DITHER_SEED;
static double *dMixBufferL, *dMixBufferR, dSideFactor, dPrngStateL, dPrngStateR;

audio_t audio; // globalized

void setAmigaFilterModel(uint8_t model)
{
	if (audio.amigaModel == model)
		return; // same state as before!

	const bool audioWasntLocked = !audio.locked;
	if (audioWasntLocked)
		lockAudio();

	audio.amigaModel = model;

	const int32_t paulaMixFrequency = audio.oversamplingFlag ? audio.outputRate*2 : audio.outputRate;
	paulaSetup(paulaMixFrequency, audio.amigaModel);

	if (audioWasntLocked)
		unlockAudio();
}

void toggleAmigaFilterModel(void)
{
	const bool audioWasntLocked = !audio.locked;
	if (audioWasntLocked)
		lockAudio();

	audio.amigaModel ^= 1;

	const int32_t paulaMixFrequency = audio.oversamplingFlag ? audio.outputRate*2 : audio.outputRate;
	paulaSetup(paulaMixFrequency, audio.amigaModel);

	if (audioWasntLocked)
		unlockAudio();

	if (audio.amigaModel == MODEL_A500)
		displayMsg("AUDIO: AMIGA 500");
	else
		displayMsg("AUDIO: AMIGA 1200");
}

void setLEDFilter(bool state)
{
	if (audio.ledFilterEnabled == state)
		return; // same state as before!

	const bool audioWasntLocked = !audio.locked;
	if (audioWasntLocked)
		lockAudio();

	audio.ledFilterEnabled = state;
	paulaWriteByte(0xBFE001, (uint8_t)audio.ledFilterEnabled << 1);

	if (audioWasntLocked)
		unlockAudio();
}

void toggleLEDFilter(void)
{
	const bool audioWasntLocked = !audio.locked;
	if (audioWasntLocked)
		lockAudio();

	audio.ledFilterEnabled ^= 1;
	paulaWriteByte(0xBFE001, (uint8_t)audio.ledFilterEnabled << 1);

	if (audioWasntLocked)
		unlockAudio();
}

void lockAudio(void)
{
	audio.locked = true;
	audio.resetSyncTickTimeFlag = true;
}

void unlockAudio(void)
{
	audio.resetSyncTickTimeFlag = true;
	audio.locked = false;
}

void resetAudioDither(void)
{
	randSeed = INITIAL_DITHER_SEED;
	dPrngStateL = dPrngStateR = 0.0;
}

static inline int32_t random32(void)
{
	// LCG 32-bit random
	randSeed *= 134775813;
	randSeed++;

	return (int32_t)randSeed;
}

#define NORM_FACTOR 2.0 /* nominally correct, but can clip from high-pass filter overshoot */

static inline void processMixedSamplesAmigaPanning(int32_t i, int16_t *out)
{
	int32_t out32;
	double dOut, dPrng;

	double dL = dMixBufferL[i];
	double dR = dMixBufferR[i];

	// normalize
	dL *= NORM_FACTOR * ((INT16_MAX+1.0) / PAULA_VOICES);
	dR *= NORM_FACTOR * ((INT16_MAX+1.0) / PAULA_VOICES);

	// left channel - 1-bit triangular dithering
	dPrng = random32() * (1.0 / (UINT32_MAX+1.0)); // -0.5 .. 0.5
	dOut = (dL + dPrng) - dPrngStateL;
	dPrngStateL = dPrng;
	out32 = (int32_t)dOut;
	CLAMP16(out32);
	out[0] = (int16_t)out32;

	// right channel - 1-bit triangular dithering
	dPrng = random32() * (1.0 / (UINT32_MAX+1.0)); // -0.5 .. 0.5
	dOut = (dR + dPrng) - dPrngStateR;
	dPrngStateR = dPrng;
	out32 = (int32_t)dOut;
	CLAMP16(out32);
	out[1] = (int16_t)out32;
}

static inline void processMixedSamples(int32_t i, int16_t *out)
{
	int32_t out32;
	double dOut, dPrng;

	double dL = dMixBufferL[i];
	double dR = dMixBufferR[i];

	// apply stereo separation
	const double dOldL = dL;
	const double dOldR = dR;
	double dMid  = (dOldL + dOldR) * STEREO_NORM_FACTOR;
	double dSide = (dOldL - dOldR) * dSideFactor;
	dL = dMid + dSide;
	dR = dMid - dSide;

	// normalize
	dL *= NORM_FACTOR * ((INT16_MAX+1.0) / PAULA_VOICES);
	dR *= NORM_FACTOR * ((INT16_MAX+1.0) / PAULA_VOICES);

	// left channel - 1-bit triangular dithering
	dPrng = random32() * (1.0 / (UINT32_MAX+1.0)); // -0.5 .. 0.5
	dOut = (dL + dPrng) - dPrngStateL;
	dPrngStateL = dPrng;
	out32 = (int32_t)dOut;
	CLAMP16(out32);
	out[0] = (int16_t)out32;

	// right channel - 1-bit triangular dithering
	dPrng = random32() * (1.0 / (UINT32_MAX+1.0)); // -0.5 .. 0.5
	dOut = (dR + dPrng) - dPrngStateR;
	dPrngStateR = dPrng;
	out32 = (int32_t)dOut;
	CLAMP16(out32);
	out[1] = (int16_t)out32;
}

static inline void processMixedSamplesAmigaPanning_2x(int32_t i, int16_t *out) // 2x oversampling
{
	int32_t out32;
	double dL, dR, dOut, dPrng;

	// 2x downsampling (decimation)
	const uint32_t offset1 = (i << 1) + 0;
	const uint32_t offset2 = (i << 1) + 1;
	dL = decimate2x_L(dMixBufferL[offset1], dMixBufferL[offset2]);
	dR = decimate2x_R(dMixBufferR[offset1], dMixBufferR[offset2]);

	// normalize
	dL *= NORM_FACTOR * ((INT16_MAX+1.0) / PAULA_VOICES);
	dR *= NORM_FACTOR * ((INT16_MAX+1.0) / PAULA_VOICES);

	// left channel - 1-bit triangular dithering
	dPrng = random32() * (1.0 / (UINT32_MAX+1.0)); // -0.5 .. 0.5
	dOut = (dL + dPrng) - dPrngStateL;
	dPrngStateL = dPrng;
	out32 = (int32_t)dOut;
	CLAMP16(out32);
	out[0] = (int16_t)out32;

	// right channel - 1-bit triangular dithering
	dPrng = random32() * (1.0 / (UINT32_MAX+1.0)); // -0.5 .. 0.5
	dOut = (dR + dPrng) - dPrngStateR;
	dPrngStateR = dPrng;
	out32 = (int32_t)dOut;
	CLAMP16(out32);
	out[1] = (int16_t)out32;
}

static inline void processMixedSamples_2x(int32_t i, int16_t *out) // 2x oversampling
{
	int32_t out32;
	double dL, dR, dOut, dPrng;

	// 2x downsampling (decimation)
	const uint32_t offset1 = (i << 1) + 0;
	const uint32_t offset2 = (i << 1) + 1;
	dL = decimate2x_L(dMixBufferL[offset1], dMixBufferL[offset2]);
	dR = decimate2x_R(dMixBufferR[offset1], dMixBufferR[offset2]);

	// apply stereo separation
	const double dOldL = dL;
	const double dOldR = dR;
	double dMid  = (dOldL + dOldR) * STEREO_NORM_FACTOR;
	double dSide = (dOldL - dOldR) * dSideFactor;
	dL = dMid + dSide;
	dR = dMid - dSide;

	// normalize
	dL *= NORM_FACTOR * ((INT16_MAX+1.0) / PAULA_VOICES);
	dR *= NORM_FACTOR * ((INT16_MAX+1.0) / PAULA_VOICES);

	// left channel - 1-bit triangular dithering
	dPrng = random32() * (1.0 / (UINT32_MAX+1.0)); // -0.5 .. 0.5
	dOut = (dL + dPrng) - dPrngStateL;
	dPrngStateL = dPrng;
	out32 = (int32_t)dOut;
	CLAMP16(out32);
	out[0] = (int16_t)out32;

	// right channel - 1-bit triangular dithering
	dPrng = random32() * (1.0 / (UINT32_MAX+1.0)); // -0.5 .. 0.5
	dOut = (dR + dPrng) - dPrngStateR;
	dPrngStateR = dPrng;
	out32 = (int32_t)dOut;
	CLAMP16(out32);
	out[1] = (int16_t)out32;
}

void outputAudio(int16_t *target, int32_t numSamples)
{
	if (audio.oversamplingFlag) // 2x oversampling
	{
		paulaGenerateSamples(dMixBufferL, dMixBufferR, numSamples*2);

		// downsample and normalize
		int16_t out[2];
		int16_t *outStream = target;
		if (stereoSeparation == 100)
		{
			for (int32_t i = 0; i < numSamples; i++)
			{
				processMixedSamplesAmigaPanning_2x(i, out);
				*outStream++ = out[0];
				*outStream++ = out[1];
			}
		}
		else
		{
			for (int32_t i = 0; i < numSamples; i++)
			{
				processMixedSamples_2x(i, out);
				*outStream++ = out[0];
				*outStream++ = out[1];
			}
		}
	}
	else
	{
		paulaGenerateSamples(dMixBufferL, dMixBufferR, numSamples);

		// normalize
		int16_t out[2];
		int16_t *outStream = target;
		if (stereoSeparation == 100)
		{
			for (int32_t i = 0; i < numSamples; i++)
			{
				processMixedSamplesAmigaPanning(i, out);
				*outStream++ = out[0];
				*outStream++ = out[1];
			}
		}
		else
		{
			for (int32_t i = 0; i < numSamples; i++)
			{
				processMixedSamples(i, out);
				*outStream++ = out[0];
				*outStream++ = out[1];
			}
		}
	}
}

// SDL audio callback removed for WASM headless build
// Use outputAudio() directly to generate samples synchronously

void audioSetStereoSeparation(uint8_t percentage) // 0..100 (percentage)
{
	assert(percentage <= 100);

	stereoSeparation = percentage;
	dSideFactor = (percentage / 100.0) * STEREO_NORM_FACTOR;
}

void generateBpmTable(double dAudioFreq, bool vblankTimingFlag)
{
	const bool audioWasntLocked = !audio.locked;
	if (audioWasntLocked)
		lockAudio();

	for (int32_t bpm = MIN_BPM; bpm <= MAX_BPM; bpm++)
	{
		const int32_t i = bpm - MIN_BPM; // index for tables

		double dBpmHz;
		if (vblankTimingFlag)
			dBpmHz = AMIGA_PAL_VBLANK_HZ;
		else
			dBpmHz = ciaBpm2Hz(bpm);

		const double dSamplesPerTick = dAudioFreq / dBpmHz;

		double dSamplesPerTickInt;
		double dSamplesPerTickFrac = modf(dSamplesPerTick, &dSamplesPerTickInt);

		audio.samplesPerTickIntTab[i] = (uint32_t)dSamplesPerTickInt;
		audio.samplesPerTickFracTab[i] = (uint64_t)((dSamplesPerTickFrac * BPM_FRAC_SCALE) + 0.5); // rounded
	}

	audio.tickSampleCounter = 0;
	audio.tickSampleCounterFrac = 0;

	if (audioWasntLocked)
		unlockAudio();
}

static void generateTickLengthTable(bool vblankTimingFlag)
{
	for (int32_t bpm = MIN_BPM; bpm <= MAX_BPM; bpm++)
	{
		const int32_t i = bpm - MIN_BPM; // index for tables

		double dHz;
		if (vblankTimingFlag)
			dHz = AMIGA_PAL_VBLANK_HZ;
		else
			dHz = ciaBpm2Hz(bpm);

		// tick length in microseconds (used for visual sync in GUI builds, stub here)
		const double dTickTime = 1000000.0 / dHz;

		double dTimeInt;
		double dTimeFrac = modf(dTickTime, &dTimeInt);

		audio.tickTimeIntTab[i] = (uint32_t)dTimeInt;
		audio.tickTimeFracTab[i] = (uint64_t)((dTimeFrac * TICK_TIME_FRAC_SCALE) + 0.5); // rounded
	}
}

void updateReplayerTimingMode(void)
{
	const bool audioWasntLocked = !audio.locked;
	if (audioWasntLocked)
		lockAudio();

	const bool vblankTimingMode = (editor.timingMode == TEMPO_MODE_VBLANK);
	generateBpmTable(audio.outputRate, vblankTimingMode);
	generateTickLengthTable(vblankTimingMode);

	if (audioWasntLocked)
		unlockAudio();
}

bool setupAudio(void)
{
	audio.callbackOngoing = false;
	audio.outputRate = config.soundFrequency;
	audio.audioBufferSize = config.soundBufferSize;
	audio.oversamplingFlag = (audio.outputRate < 96000);
	audio.amigaModel = config.amigaModel;

	uint32_t maxFrequency = audio.outputRate;
	if (maxFrequency < config.mod2WavOutputFreq)
		maxFrequency = config.mod2WavOutputFreq;

	maxFrequency *= 2; // oversampling

	const int32_t paulaMixFrequency = audio.oversamplingFlag ? audio.outputRate*2 : audio.outputRate;
	int32_t maxSamplesPerTick = (int32_t)ceil(maxFrequency / (MIN_BPM / 2.5)) + 1;

	dMixBufferL = (double *)malloc(maxSamplesPerTick * sizeof (double));
	dMixBufferR = (double *)malloc(maxSamplesPerTick * sizeof (double));

	if (dMixBufferL == NULL || dMixBufferR == NULL)
		return false;

	paulaSetup(paulaMixFrequency, audio.amigaModel);
	audioSetStereoSeparation(config.stereoSeparation);
	updateReplayerTimingMode();
	setLEDFilter(false);

	clearMixerDownsamplerStates();
	audio.resetSyncTickTimeFlag = true;

	audio.samplesPerTickInt = audio.samplesPerTickIntTab[125-MIN_BPM]; // BPM 125
	audio.samplesPerTickFrac = audio.samplesPerTickFracTab[125-MIN_BPM]; // BPM 125

	audio.tickSampleCounter = 0;
	audio.tickSampleCounterFrac = 0;

	return true;
}

void audioClose(void)
{
	audio.callbackOngoing = false;

	if (dMixBufferL != NULL)
	{
		free(dMixBufferL);
		dMixBufferL = NULL;
	}

	if (dMixBufferR != NULL)
	{
		free(dMixBufferR);
		dMixBufferR = NULL;
	}
}

void toggleAmigaPanMode(void)
{
	panningMode = (panningMode + 1) % 3;

	const bool audioWasntLocked = !audio.locked;
	if (audioWasntLocked)
		lockAudio();

	if (panningMode == 0)
		audioSetStereoSeparation(config.stereoSeparation);
	else if (panningMode == 1)
		audioSetStereoSeparation(0);
	else
		audioSetStereoSeparation(100);

	if (audioWasntLocked)
		unlockAudio();

	if (panningMode == 0)
		displayMsg("CUSTOM PANNING");
	else if (panningMode == 1)
		displayMsg("CENTERED PANNING");
	else
		displayMsg("AMIGA PANNING");
}

uint16_t get16BitPeak(int16_t *sampleData, uint32_t sampleLength)
{
	uint16_t samplePeak = 0;
	for (uint32_t i = 0; i < sampleLength; i++)
	{
		uint16_t sample = ABS(sampleData[i]);
		if (samplePeak < sample)
			samplePeak = sample;
	}

	return samplePeak;
}

uint32_t get32BitPeak(int32_t *sampleData, uint32_t sampleLength)
{
	uint32_t samplePeak = 0;
	for (uint32_t i = 0; i < sampleLength; i++)
	{
		uint32_t sample = ABS(sampleData[i]);
		if (samplePeak < sample)
			samplePeak = sample;
	}

	return samplePeak;
}

float getFloatPeak(float *fSampleData, uint32_t sampleLength)
{
	float fSamplePeak = 0.0f;
	for (uint32_t i = 0; i < sampleLength; i++)
	{
		const float fSample = fabsf(fSampleData[i]);
		if (fSamplePeak < fSample)
			fSamplePeak = fSample;
	}

	return fSamplePeak;
}

double getDoublePeak(double *dSampleData, uint32_t sampleLength)
{
	double dSamplePeak = 0.0;
	for (uint32_t i = 0; i < sampleLength; i++)
	{
		const double dSample = fabs(dSampleData[i]);
		if (dSamplePeak < dSample)
			dSamplePeak = dSample;
	}

	return dSamplePeak;
}

void normalize16BitTo8Bit(int16_t *sampleData, uint32_t sampleLength)
{
	const uint16_t samplePeak = get16BitPeak(sampleData, sampleLength);
	if (samplePeak == 0 || samplePeak >= INT16_MAX)
		return;

	const double dGain = (double)INT16_MAX / samplePeak;
	for (uint32_t i = 0; i < sampleLength; i++)
	{
		const int32_t sample = (const int32_t)(sampleData[i] * dGain);
		sampleData[i] = (int16_t)sample;
	}
}

void normalize32BitTo8Bit(int32_t *sampleData, uint32_t sampleLength)
{
	const uint32_t samplePeak = get32BitPeak(sampleData, sampleLength);
	if (samplePeak == 0 || samplePeak >= INT32_MAX)
		return;

	const double dGain = (double)INT32_MAX / samplePeak;
	for (uint32_t i = 0; i < sampleLength; i++)
	{
		const int32_t sample = (const int32_t)(sampleData[i] * dGain);
		sampleData[i] = (int32_t)sample;
	}
}

void normalizeFloatTo8Bit(float *fSampleData, uint32_t sampleLength)
{
	const float fSamplePeak = getFloatPeak(fSampleData, sampleLength);
	if (fSamplePeak <= 0.0f)
		return;

	const float fGain = INT8_MAX / fSamplePeak;
	for (uint32_t i = 0; i < sampleLength; i++)
		fSampleData[i] *= fGain;
}

void normalizeDoubleTo8Bit(double *dSampleData, uint32_t sampleLength)
{
	const double dSamplePeak = getDoublePeak(dSampleData, sampleLength);
	if (dSamplePeak <= 0.0)
		return;

	const double dGain = INT8_MAX / dSamplePeak;
	for (uint32_t i = 0; i < sampleLength; i++)
		dSampleData[i] *= dGain;
}
