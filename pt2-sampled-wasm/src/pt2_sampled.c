/*
** pt2_sampled.c - PT2 Clone Sample Editor WASM bridge
**
** Based on 8bitbubsy's pt2-clone (https://github.com/8bitbubsy/pt2-clone)
**
** This file provides:
** - All global variable definitions (declared extern in pt2_wasm.h)
** - Period table for note resampling (37 notes x 16 finetunes)
** - Default Amiga palette initialization
** - Stub functions for unused subsystems
** - EM_JS callbacks for notifying JavaScript of parameter changes
** - EMSCRIPTEN_KEEPALIVE exported WASM bridge API
*/

#include <emscripten.h>
#include "pt2_wasm.h"

/* ---- Global variable definitions ---- */

video_t video;
editor_t editor;
sampler_t sampler;
mouse_t mouse;
keyb_t keyb;
ui_t ui;
cursor_t cursor;
config_t config;

static module_t songData;
module_t *song = &songData;
static int8_t sampleDataPool[MAX_SAMPLE_LENGTH + 4]; /* +4 safety */

/* ---- Period table (37 notes x 16 finetunes = 592 entries) ---- */

const int16_t periodTable[37 * 16] = {
	/* finetune 0 */
	856,808,762,720,678,640,604,570,538,508,480,453,
	428,404,381,360,339,320,302,285,269,254,240,226,
	214,202,190,180,170,160,151,143,135,127,120,113,0,
	/* finetune 1 */
	850,802,757,715,674,637,601,567,535,505,477,450,
	425,401,379,357,337,318,300,284,268,253,239,225,
	213,201,189,179,169,159,150,142,134,126,119,113,0,
	/* finetune 2 */
	844,796,752,709,670,632,597,563,532,502,474,447,
	422,398,376,355,335,316,298,282,266,251,237,224,
	211,199,188,177,167,158,149,141,133,125,118,112,0,
	/* finetune 3 */
	838,791,746,704,665,628,592,559,528,498,470,444,
	419,395,373,352,332,314,296,280,264,249,235,222,
	209,198,187,176,166,157,148,140,132,125,118,111,0,
	/* finetune 4 */
	832,785,741,699,660,623,588,555,524,495,467,441,
	416,392,370,350,330,312,294,278,262,247,233,220,
	208,196,185,175,165,156,147,139,131,124,117,110,0,
	/* finetune 5 */
	826,779,736,694,655,619,584,551,520,491,463,437,
	413,390,368,347,328,309,292,276,260,245,232,219,
	206,195,184,174,164,155,146,138,130,123,116,109,0,
	/* finetune 6 */
	820,774,730,689,651,614,580,547,516,487,460,434,
	410,387,365,345,325,307,290,274,258,244,230,217,
	205,193,183,172,163,154,145,137,129,122,115,109,0,
	/* finetune 7 */
	814,768,725,684,646,610,575,543,513,484,457,431,
	407,384,363,342,323,305,288,272,256,242,228,216,
	204,192,181,171,161,152,144,136,128,121,114,108,0,
	/* finetune -8 */
	907,856,808,762,720,678,640,604,570,538,508,480,
	453,428,404,381,360,339,320,302,285,269,254,240,
	226,214,202,190,180,170,160,151,143,135,127,120,0,
	/* finetune -7 */
	900,850,802,757,715,675,636,601,567,535,505,477,
	450,425,401,379,357,337,318,300,284,268,253,238,
	225,212,200,189,179,169,159,150,142,134,126,119,0,
	/* finetune -6 */
	894,844,796,752,709,670,632,597,563,532,502,474,
	447,422,398,376,355,335,316,298,282,266,251,237,
	223,211,199,188,177,167,158,149,141,133,125,118,0,
	/* finetune -5 */
	887,838,791,746,704,665,628,592,559,528,498,470,
	444,419,395,373,352,332,314,296,280,264,249,235,
	222,209,198,187,176,166,157,148,140,132,125,118,0,
	/* finetune -4 */
	881,832,785,741,699,660,623,588,555,524,494,467,
	441,416,392,370,350,330,312,294,278,262,247,233,
	220,208,196,185,175,165,156,147,139,131,123,117,0,
	/* finetune -3 */
	875,826,779,736,694,655,619,584,551,520,491,463,
	437,413,390,368,347,328,309,292,276,260,245,232,
	219,206,195,184,174,164,155,146,138,130,123,116,0,
	/* finetune -2 */
	868,820,774,730,689,651,614,580,547,516,487,460,
	434,410,387,365,345,325,307,290,274,258,244,230,
	217,205,193,183,172,163,154,145,137,129,122,115,0,
	/* finetune -1 */
	862,814,768,725,684,646,610,575,543,513,484,457,
	431,407,384,363,342,323,305,288,272,256,242,228,
	216,204,192,181,171,161,152,144,136,128,121,114,0
};

/* ---- Default Amiga palette ---- */

static void initDefaultPalette(void)
{
	video.palette[PAL_BACKGRD]   = 0x000000;
	video.palette[PAL_BORDER]    = 0xBBBBBB;
	video.palette[PAL_GENBKG]    = 0x888888;
	video.palette[PAL_GENBKG2]   = 0x555555;
	video.palette[PAL_QADSCP]    = 0x7DB8B8;
	video.palette[PAL_PATCURSOR] = 0xAAAAAA;
	video.palette[PAL_GENTXT]    = 0x000000;
	video.palette[PAL_PATTXT]    = 0x3344FF;
	video.palette[PAL_SAMPLLINE] = 0x7DB8B8;
	video.palette[PAL_LOOPPIN]   = 0xFF2200;
	video.palette[PAL_TEXTMARK]  = 0x4477FF;
	video.palette[PAL_MOUSE_1]   = 0x444444;
	video.palette[PAL_MOUSE_2]   = 0x777777;
	video.palette[PAL_MOUSE_3]   = 0xAAAAAA;
	video.palette[PAL_COLORKEY]  = 0x0000FF;
}

/* ---- Stub functions ---- */

void turnOffVoices(void) { }
void lockAudio(void) { }
void unlockAudio(void) { }

static void notifyParamChanges(void); /* forward declaration */

void updateCurrSample(void)
{
	notifyParamChanges();
	redrawSample();
}

void updateWindowTitle(int modified) { (void)modified; }
void statusNotSampleZero(void) { displayErrorMsg("NOT SAMPLE 0 !"); }
void statusSampleIsEmpty(void) { displayErrorMsg("SAMPLE IS EMPTY"); }
void statusOutOfMemory(void)  { displayErrorMsg("OUT OF MEMORY !"); }

double getDoublePeak(const double *buf, int32_t len)
{
	double peak = 0.0;
	for (int32_t i = 0; i < len; i++)
	{
		double abs_val = fabs(buf[i]);
		if (abs_val > peak) peak = abs_val;
	}
	return peak;
}

void setErrPointer(void) { }

/* Vol/filter box stubs (not rendered in our extraction) */
void renderSamplerVolBox(void) { }
void renderSamplerFiltersBox(void) { }
void showVolFromSlider(void) { }
void showVolToSlider(void) { }

/* Chord/replayer stubs */
void recalcChordLength(void) { }
void updatePaulaLoops(void) { }

/* Play stubs (no audio in WASM extraction) */
static void samplerPlayWaveform(void) { displayMsg("PLAY WAVEFORM"); }
static void samplerPlayDisplay(void) { displayMsg("PLAY DISPLAY"); }
static void samplerPlayRange(void) { displayMsg("PLAY RANGE"); }
static void toggleTuningTone(void) { displayMsg("TUNING TONE"); }
static void samplerResample(void) { displayMsg("RESAMPLE N/A"); }
static void exitFromSam(void) { /* no-op: sampler is always shown */ }

/* ---- EM_JS callback functions ---- */

EM_JS(void, js_onParamChange, (int paramId, int value), {
	if (Module.onParamChange) Module.onParamChange(paramId, value);
});

EM_JS(void, js_onLoopChange, (int loopStart, int loopLength, int loopType), {
	if (Module.onLoopChange) Module.onLoopChange(loopStart, loopLength, loopType);
});

/* ---- notifyParamChanges helper ---- */

static void notifyParamChanges(void)
{
	moduleSample_t *s = &song->samples[editor.currSample];
	js_onParamChange(PT2_VOLUME, s->volume);
	js_onParamChange(PT2_FINETUNE, s->fineTune);

	int loopType = (s->loopStart + s->loopLength > 2) ? 1 : 0;
	js_onLoopChange(s->loopStart, s->loopLength, loopType);
}

/* ---- WASM bridge API (all EMSCRIPTEN_KEEPALIVE) ---- */

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_init(int w, int h)
{
	(void)w; (void)h;

	memset(&video, 0, sizeof(video));
	memset(&editor, 0, sizeof(editor));
	memset(&sampler, 0, sizeof(sampler));
	memset(&mouse, 0, sizeof(mouse));
	memset(&keyb, 0, sizeof(keyb));
	memset(&ui, 0, sizeof(ui));
	memset(&cursor, 0, sizeof(cursor));
	memset(&config, 0, sizeof(config));
	memset(&songData, 0, sizeof(songData));
	memset(sampleDataPool, 0, sizeof(sampleDataPool));

	/* allocate framebuffer */
	video.frameBuffer = (uint32_t *)calloc(SCREEN_W * SCREEN_H, sizeof(uint32_t));

	/* setup config */
	config.maxSampleLength = MAX_SAMPLE_LENGTH;
	config.waveformCenterLine = true;

	/* setup palette */
	initDefaultPalette();

	/* setup song data */
	songData.sampleData = sampleDataPool;
	for (int i = 0; i < MOD_SAMPLES; i++)
	{
		songData.samples[i].offset = 0; /* all samples share the pool (we only use sample 0) */
		songData.samples[i].loopLength = 2;
	}

	/* setup editor */
	editor.currSample = 0;
	editor.markStartOfs = -1;

	/* allocate sampler variables */
	allocSamplerVars();

	/* unpack sampler screen BMP */
	samplerScreenBMP = unpackBMP(samplerScreenPackedBMP, sizeof(samplerScreenPackedBMP));

	/* create the mark/invert table */
	createSampleMarkTable();
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_start(void)
{
	ui.samplerScreenShown = true;

	/* draw the sampler screen background */
	if (samplerScreenBMP != NULL)
		memcpy(&video.frameBuffer[121 * SCREEN_W], samplerScreenBMP, 320 * 134 * sizeof(uint32_t));

	/* set initial status */
	strcpy(ui.statusMessage, "ALL RIGHT");
	ui.updateStatusText = true;

	redrawSample();
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_shutdown(void)
{
	deAllocSamplerVars();
	if (samplerScreenBMP != NULL) { free(samplerScreenBMP); samplerScreenBMP = NULL; }
	if (video.frameBuffer != NULL) { free(video.frameBuffer); video.frameBuffer = NULL; }
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_load_pcm(const int8_t *data, int length)
{
	if (length > MAX_SAMPLE_LENGTH) length = MAX_SAMPLE_LENGTH;
	if (length < 0) length = 0;

	turnOffVoices();

	moduleSample_t *s = &song->samples[editor.currSample];

	memcpy(&song->sampleData[s->offset], data, length);
	if (length < (int)config.maxSampleLength)
		memset(&song->sampleData[s->offset + length], 0, config.maxSampleLength - length);

	s->length = length & ~1; /* even length */

	/* reset loop if it extends beyond new length */
	if (s->loopStart + s->loopLength > s->length)
	{
		s->loopStart = 0;
		s->loopLength = 2;
	}

	editor.samplePos = 0;
	editor.markStartOfs = -1;

	/* fill redo buffer */
	fillSampleRedoBuffer(editor.currSample);

	if (ui.samplerScreenShown)
		redrawSample();

	notifyParamChanges();
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_set_param(int param_id, int value)
{
	moduleSample_t *s = &song->samples[editor.currSample];
	switch (param_id)
	{
		case PT2_VOLUME:
			s->volume = CLAMP(value, 0, 64);
			break;
		case PT2_FINETUNE:
			s->fineTune = value & 0x0F;
			break;
		case PT2_LOOP_START_HI:
			sampler.tmpLoopStart = (sampler.tmpLoopStart & 0xFFFF) | ((value & 0xFFFF) << 16);
			break;
		case PT2_LOOP_START_LO:
			sampler.tmpLoopStart = (sampler.tmpLoopStart & 0xFFFF0000) | (value & 0xFFFF);
			s->loopStart = sampler.tmpLoopStart & ~1;
			if (s->loopStart + s->loopLength > s->length)
			{
				s->loopStart = 0;
				s->loopLength = 2;
			}
			if (ui.samplerScreenShown) displaySample();
			break;
		case PT2_LOOP_LENGTH_HI:
			sampler.tmpLoopLength = (sampler.tmpLoopLength & 0xFFFF) | ((value & 0xFFFF) << 16);
			break;
		case PT2_LOOP_LENGTH_LO:
			sampler.tmpLoopLength = (sampler.tmpLoopLength & 0xFFFF0000) | (value & 0xFFFF);
			s->loopLength = sampler.tmpLoopLength;
			if (s->loopLength < 2) s->loopLength = 2;
			if (s->loopStart + s->loopLength > s->length)
			{
				s->loopLength = s->length - s->loopStart;
				if (s->loopLength < 2)
				{
					s->loopStart = 0;
					s->loopLength = 2;
				}
			}
			if (ui.samplerScreenShown) displaySample();
			break;
		case PT2_LOOP_TYPE:
		{
			int loopEnabled = (value != 0);
			if (loopEnabled && s->loopStart + s->loopLength <= 2)
			{
				/* enable loop over entire sample */
				s->loopStart = 0;
				s->loopLength = s->length;
			}
			else if (!loopEnabled)
			{
				s->loopStart = 0;
				s->loopLength = 2;
			}
			if (ui.samplerScreenShown) displaySample();
			break;
		}
	}
}

EMSCRIPTEN_KEEPALIVE
int pt2_sampled_get_param(int param_id)
{
	moduleSample_t *s = &song->samples[editor.currSample];
	switch (param_id)
	{
		case PT2_VOLUME:         return s->volume;
		case PT2_FINETUNE:       return s->fineTune;
		case PT2_LOOP_START_HI:  return (s->loopStart >> 16) & 0xFFFF;
		case PT2_LOOP_START_LO:  return s->loopStart & 0xFFFF;
		case PT2_LOOP_LENGTH_HI: return (s->loopLength >> 16) & 0xFFFF;
		case PT2_LOOP_LENGTH_LO: return s->loopLength & 0xFFFF;
		case PT2_LOOP_TYPE:      return (s->loopStart + s->loopLength > 2) ? 1 : 0;
		default:                 return 0;
	}
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_load_config(const uint8_t *buf, int len)
{
	if (len < 11) return;

	moduleSample_t *s = &song->samples[editor.currSample];
	s->volume = buf[0];
	s->fineTune = buf[1] & 0x0F;
	s->loopStart = buf[2] | (buf[3] << 8) | (buf[4] << 16) | (buf[5] << 24);
	s->loopLength = buf[6] | (buf[7] << 8) | (buf[8] << 16) | (buf[9] << 24);
	if (s->loopLength < 2) s->loopLength = 2;
	int loopType = buf[10];
	if (!loopType) { s->loopStart = 0; s->loopLength = 2; }

	if (ui.samplerScreenShown) displaySample();
}

EMSCRIPTEN_KEEPALIVE
int pt2_sampled_dump_config(uint8_t *buf, int max_len)
{
	if (max_len < 11) return 0;

	moduleSample_t *s = &song->samples[editor.currSample];
	buf[0] = (uint8_t)s->volume;
	buf[1] = s->fineTune;
	buf[2] = s->loopStart & 0xFF;
	buf[3] = (s->loopStart >> 8) & 0xFF;
	buf[4] = (s->loopStart >> 16) & 0xFF;
	buf[5] = (s->loopStart >> 24) & 0xFF;
	buf[6] = s->loopLength & 0xFF;
	buf[7] = (s->loopLength >> 8) & 0xFF;
	buf[8] = (s->loopLength >> 16) & 0xFF;
	buf[9] = (s->loopLength >> 24) & 0xFF;
	buf[10] = (s->loopStart + s->loopLength > 2) ? 1 : 0;

	return 11;
}

EMSCRIPTEN_KEEPALIVE
uint32_t *pt2_sampled_get_fb(void)
{
	return video.frameBuffer;
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_on_mouse_down(int x, int y)
{
	mouse.x = x;
	mouse.y = y;
	mouse.leftButtonPressed = true;
	mouse.buttonState = 1;

	if (!ui.samplerScreenShown) return;

	/* ---- Sample waveform area (y 138-201) ---- */
	if (y >= 138 && y <= 201)
	{
		if (ui.forceSampleEdit)
			samplerEditSample(true);
		else
			samplerSamplePressed(false);
		return;
	}

	/* ---- Zoom/drag bar area (y 205-210) ---- */
	if (y >= 205 && y <= 210)
	{
		samplerBarPressed(false);
		return;
	}

	/* ---- EXIT button (y 124-134) ---- */
	if (y >= 124 && y <= 134 && x >= 6 && x <= 25)
	{
		exitFromSam();
		return;
	}

	/* ---- Row: PLAY WAV / SHOW RANGE / ZOOM OUT (y 211-221) ---- */
	if (y >= 211 && y <= 221)
	{
		if (x >= 32 && x <= 95) samplerPlayWaveform();
		else if (x >= 96 && x <= 175) samplerShowRange();
		else if (x >= 176 && x <= 245) samplerZoomOut2x();
		return;
	}

	/* ---- STOP button spans rows 222-243 (x 0-30) ---- */
	if (y >= 222 && y <= 243 && x >= 0 && x <= 30)
	{
		turnOffVoices();
		displayMsg("ALL RIGHT");
		return;
	}

	/* ---- Row: PLAY DISP / SHOW ALL / RANGE ALL / LOOP (y 222-232) ---- */
	if (y >= 222 && y <= 232)
	{
		if (x >= 32 && x <= 95) samplerPlayDisplay();
		else if (x >= 96 && x <= 175) samplerShowAll();
		else if (x >= 176 && x <= 245) samplerRangeAll();
		else if (x >= 246 && x <= 319) samplerLoopToggle();
		return;
	}

	/* ---- Row: PLAY RNG / BEG / END / CENTER / SAMPLE / RESAMPLE / NOTE (y 233-243) ---- */
	if (y >= 233 && y <= 243)
	{
		if (x >= 32 && x <= 94) samplerPlayRange();
		else if (x >= 96 && x <= 115) sampleMarkerToBeg();
		else if (x >= 116 && x <= 135) sampleMarkerToEnd();
		else if (x >= 136 && x <= 174) sampleMarkerToCenter();
		else if (x >= 176 && x <= 210) displayMsg("SAMPLING N/A");
		else if (x >= 211 && x <= 245) samplerResample();
		else if (x >= 246 && x <= 319) samplerResample();
		return;
	}

	/* ---- Row: CUT / COPY / PASTE / VOLUME / TUNE / DC / FILTERS (y 244-254) ---- */
	if (y >= 244 && y <= 254)
	{
		if (x >= 0 && x <= 31) samplerSamDelete(SAMPLE_CUT);
		else if (x >= 32 && x <= 63) samplerSamCopy();
		else if (x >= 64 && x <= 95) samplerSamPaste();
		else if (x >= 96 && x <= 135) renderSamplerVolBox();
		else if (x >= 136 && x <= 175) toggleTuningTone();
		else if (x >= 176 && x <= 210) samplerRemoveDcOffset();
		else if (x >= 211 && x <= 245) renderSamplerFiltersBox();
		return;
	}
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_on_mouse_up(int x, int y)
{
	(void)x; (void)y;
	mouse.leftButtonPressed = false;
	mouse.rightButtonPressed = false;
	mouse.buttonState = 0;
	ui.forceSampleDrag = false;
	ui.forceSampleEdit = false;
	ui.leftLoopPinMoving = false;
	ui.rightLoopPinMoving = false;
	ui.forceVolDrag = 0;
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_on_mouse_move(int x, int y)
{
	mouse.x = x;
	mouse.y = y;

	if (!mouse.leftButtonPressed) return;
	if (!ui.samplerScreenShown) return;

	if (ui.forceSampleDrag)
	{
		samplerBarPressed(true);
	}
	else if (ui.forceSampleEdit)
	{
		samplerEditSample(true);
	}
	else if (ui.leftLoopPinMoving || ui.rightLoopPinMoving)
	{
		samplerSamplePressed(true);
	}
	else if (y >= 138 && y <= 201)
	{
		samplerSamplePressed(true);
	}
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_on_wheel(int deltaY, int x, int y)
{
	(void)y;
	mouse.x = x;

	if (!ui.samplerScreenShown) return;

	if (deltaY < 0)
		samplerZoomInMouseWheel();
	else if (deltaY > 0)
		samplerZoomOutMouseWheel();
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_on_key_down(int keyCode)
{
	if (!ui.samplerScreenShown) return;

	/* Negative keyCode = key up (for modifier release) */
	if (keyCode < 0)
	{
		switch (-keyCode)
		{
			case 16: keyb.shiftPressed = false; break;
			case 17: keyb.leftCtrlPressed = false; break;
			case 18: keyb.leftAltPressed = false; break;
		}
		return;
	}

	switch (keyCode)
	{
		case 16: keyb.shiftPressed = true; break;    /* Shift */
		case 17: keyb.leftCtrlPressed = true; break;  /* Ctrl */
		case 18: keyb.leftAltPressed = true; break;   /* Alt */

		/* Sampler keyboard shortcuts */
		case 65: samplerRangeAll(); break;             /* A = select all */
		case 67: samplerSamCopy(); break;              /* C = copy */
		case 86: samplerSamPaste(); break;             /* V = paste */
		case 88: samplerSamDelete(SAMPLE_CUT); break;  /* X = cut */
		case 46: samplerSamDelete(NO_SAMPLE_CUT); break; /* Delete */
		case 90: samplerShowAll(); break;              /* Z = show all */
		case 82: samplerShowRange(); break;            /* R = show range */

		/* Zoom */
		case 187: samplerZoomInMouseWheel(); break;    /* + zoom in */
		case 189: samplerZoomOutMouseWheel(); break;   /* - zoom out */

		/* Mark positions */
		case 49: sampleMarkerToBeg(); break;           /* 1 = beginning */
		case 50: sampleMarkerToCenter(); break;        /* 2 = center */
		case 51: sampleMarkerToEnd(); break;           /* 3 = end */

		/* Loop toggle */
		case 76: samplerLoopToggle(); break;           /* L = loop toggle */

		/* DC offset removal */
		case 68:
			if (keyb.leftCtrlPressed)
				samplerRemoveDcOffset();
			break;

		/* Boost / Filter */
		case 66:
			boostSample(editor.currSample, false);
			displaySample();
			break;
		case 70:
			filterSample(editor.currSample, false);
			displaySample();
			break;

		/* Undo */
		case 85:
			redoSampleData(editor.currSample);
			break;
	}
}

EMSCRIPTEN_KEEPALIVE
void pt2_sampled_tick(void)
{
	if (!ui.samplerScreenShown) return;

	/* Handle error message timeout (~2 seconds at 60fps) */
	if (editor.errorMsgActive)
	{
		if (++editor.errorMsgCounter >= 120)
		{
			editor.errorMsgActive = false;
			editor.errorMsgBlock = false;
			editor.errorMsgCounter = 0;

			strcpy(ui.statusMessage, "ALL RIGHT");
			ui.updateStatusText = true;
		}
	}

	/* Render status text to framebuffer */
	if (ui.updateStatusText)
	{
		ui.updateStatusText = false;

		/* Clear status text area and draw message */
		fillRect(88, 127, 17 * FONT_CHAR_W, FONT_CHAR_H,
			video.palette[PAL_GENBKG]);
		textOut(88, 127, ui.statusMessage,
			video.palette[PAL_GENTXT]);
	}
}
