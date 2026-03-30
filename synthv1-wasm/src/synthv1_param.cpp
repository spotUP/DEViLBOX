// synthv1_param.cpp — WASM version (no Qt serialization)

#include "synthv1_param.h"
#include <cmath>

enum ParamType { PARAM_FLOAT = 0, PARAM_INT, PARAM_BOOL };

static
struct ParamInfo {
	const char *name;
	ParamType type;
	float def;
	float min;
	float max;
} synthv1_params[synthv1::NUM_PARAMS] = {
	{ "DCO1_SHAPE1",   PARAM_INT,     1.0f,   0.0f,   4.0f },
	{ "DCO1_WIDTH1",   PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "DCO1_BANDL1",   PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DCO1_SYNC1",    PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DCO1_SHAPE2",   PARAM_INT,     1.0f,   0.0f,   4.0f },
	{ "DCO1_WIDTH2",   PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "DCO1_BANDL2",   PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DCO1_SYNC2",    PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DCO1_BALANCE",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "DCO1_DETUNE",   PARAM_FLOAT,   0.1f,   0.0f,   1.0f },
	{ "DCO1_PHASE",    PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCO1_RINGMOD",  PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCO1_OCTAVE",   PARAM_FLOAT,   0.0f,  -4.0f,   4.0f },
	{ "DCO1_TUNING",   PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "DCO1_GLIDE",    PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCO1_ENVTIME",  PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCF1_ENABLED",  PARAM_BOOL,    1.0f,   0.0f,   1.0f },
	{ "DCF1_CUTOFF",   PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCF1_RESO",     PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCF1_TYPE",     PARAM_INT,     0.0f,   0.0f,   3.0f },
	{ "DCF1_SLOPE",    PARAM_INT,     0.0f,   0.0f,   3.0f },
	{ "DCF1_ENVELOPE", PARAM_FLOAT,   1.0f,  -1.0f,   1.0f },
	{ "DCF1_ATTACK",   PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCF1_DECAY",    PARAM_FLOAT,   0.2f,   0.0f,   1.0f },
	{ "DCF1_SUSTAIN",  PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCF1_RELEASE",  PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "LFO1_ENABLED",  PARAM_BOOL,    1.0f,   0.0f,   1.0f },
	{ "LFO1_SHAPE",    PARAM_INT,     1.0f,   0.0f,   4.0f },
	{ "LFO1_WIDTH",    PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "LFO1_BPM",      PARAM_FLOAT, 180.0f,   0.0f, 360.0f },
	{ "LFO1_RATE",     PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "LFO1_SYNC",     PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "LFO1_SWEEP",    PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO1_PITCH",    PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO1_BALANCE",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO1_RINGMOD",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO1_CUTOFF",   PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO1_RESO",     PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO1_PANNING",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO1_VOLUME",   PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO1_ATTACK",   PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "LFO1_DECAY",    PARAM_FLOAT,   0.1f,   0.0f,   1.0f },
	{ "LFO1_SUSTAIN",  PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "LFO1_RELEASE",  PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCA1_VOLUME",   PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCA1_ATTACK",   PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCA1_DECAY",    PARAM_FLOAT,   0.1f,   0.0f,   1.0f },
	{ "DCA1_SUSTAIN",  PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "DCA1_RELEASE",  PARAM_FLOAT,   0.1f,   0.0f,   1.0f },
	{ "OUT1_WIDTH",    PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "OUT1_PANNING",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "OUT1_FXSEND",   PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "OUT1_VOLUME",   PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DEF1_PITCHBEND",PARAM_FLOAT,   0.2f,   0.0f,   4.0f },
	{ "DEF1_MODWHEEL", PARAM_FLOAT,   0.2f,   0.0f,   1.0f },
	{ "DEF1_PRESSURE", PARAM_FLOAT,   0.2f,   0.0f,   1.0f },
	{ "DEF1_VELOCITY", PARAM_FLOAT,   0.2f,   0.0f,   1.0f },
	{ "DEF1_CHANNEL",  PARAM_INT,     0.0f,   0.0f,  16.0f },
	{ "DEF1_MONO",     PARAM_INT,     0.0f,   0.0f,   2.0f },
	{ "DCO2_SHAPE1",   PARAM_INT,     1.0f,   0.0f,   4.0f },
	{ "DCO2_WIDTH1",   PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "DCO2_BANDL1",   PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DCO2_SYNC1",    PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DCO2_SHAPE2",   PARAM_INT,     1.0f,   0.0f,   4.0f },
	{ "DCO2_WIDTH2",   PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "DCO2_BANDL2",   PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DCO2_SYNC2",    PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DCO2_BALANCE",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "DCO2_DETUNE",   PARAM_FLOAT,   0.1f,   0.0f,   1.0f },
	{ "DCO2_PHASE",    PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCO2_RINGMOD",  PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCO2_OCTAVE",   PARAM_FLOAT,  -2.0f,  -4.0f,   4.0f },
	{ "DCO2_TUNING",   PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "DCO2_GLIDE",    PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCO2_ENVTIME",  PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCF2_ENABLED",  PARAM_BOOL,    1.0f,   0.0f,   1.0f },
	{ "DCF2_CUTOFF",   PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCF2_RESO",     PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCF2_TYPE",     PARAM_INT,     0.0f,   0.0f,   3.0f },
	{ "DCF2_SLOPE",    PARAM_INT,     0.0f,   0.0f,   3.0f },
	{ "DCF2_ENVELOPE", PARAM_FLOAT,   1.0f,  -1.0f,   1.0f },
	{ "DCF2_ATTACK",   PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCF2_DECAY",    PARAM_FLOAT,   0.2f,   0.0f,   1.0f },
	{ "DCF2_SUSTAIN",  PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCF2_RELEASE",  PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "LFO2_ENABLED",  PARAM_BOOL,    1.0f,   0.0f,   1.0f },
	{ "LFO2_SHAPE",    PARAM_INT,     1.0f,   0.0f,   4.0f },
	{ "LFO2_WIDTH",    PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "LFO2_BPM",      PARAM_FLOAT, 180.0f,   0.0f, 360.0f },
	{ "LFO2_RATE",     PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "LFO2_SYNC",     PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "LFO2_SWEEP",    PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO2_PITCH",    PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO2_BALANCE",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO2_RINGMOD",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO2_CUTOFF",   PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO2_RESO",     PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO2_PANNING",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO2_VOLUME",   PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "LFO2_ATTACK",   PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "LFO2_DECAY",    PARAM_FLOAT,   0.1f,   0.0f,   1.0f },
	{ "LFO2_SUSTAIN",  PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "LFO2_RELEASE",  PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCA2_VOLUME",   PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DCA2_ATTACK",   PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DCA2_DECAY",    PARAM_FLOAT,   0.1f,   0.0f,   1.0f },
	{ "DCA2_SUSTAIN",  PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "DCA2_RELEASE",  PARAM_FLOAT,   0.1f,   0.0f,   1.0f },
	{ "OUT2_WIDTH",    PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "OUT2_PANNING",  PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "OUT2_FXSEND",   PARAM_FLOAT,   1.0f,   0.0f,   1.0f },
	{ "OUT2_VOLUME",   PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DEF2_PITCHBEND",PARAM_FLOAT,   0.2f,   0.0f,   4.0f },
	{ "DEF2_MODWHEEL", PARAM_FLOAT,   0.2f,   0.0f,   1.0f },
	{ "DEF2_PRESSURE", PARAM_FLOAT,   0.2f,   0.0f,   1.0f },
	{ "DEF2_VELOCITY", PARAM_FLOAT,   0.2f,   0.0f,   1.0f },
	{ "DEF2_CHANNEL",  PARAM_INT,     0.0f,   0.0f,  16.0f },
	{ "DEF2_MONO",     PARAM_INT,     0.0f,   0.0f,   2.0f },
	{ "CHO1_WET",      PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "CHO1_DELAY",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "CHO1_FEEDB",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "CHO1_RATE",     PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "CHO1_MOD",      PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "FLA1_WET",      PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "FLA1_DELAY",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "FLA1_FEEDB",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "FLA1_DAFT",     PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "PHA1_WET",      PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "PHA1_RATE",     PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "PHA1_FEEDB",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "PHA1_DEPTH",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "PHA1_DAFT",     PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DEL1_WET",      PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "DEL1_DELAY",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DEL1_FEEDB",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "DEL1_BPM",      PARAM_FLOAT, 180.0f,   0.0f, 360.0f },
	{ "REV1_WET",      PARAM_FLOAT,   0.0f,   0.0f,   1.0f },
	{ "REV1_ROOM",     PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "REV1_DAMP",     PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "REV1_FEEDB",    PARAM_FLOAT,   0.5f,   0.0f,   1.0f },
	{ "REV1_WIDTH",    PARAM_FLOAT,   0.0f,  -1.0f,   1.0f },
	{ "DYN1_COMPRESS", PARAM_BOOL,    0.0f,   0.0f,   1.0f },
	{ "DYN1_LIMITER",  PARAM_BOOL,    1.0f,   0.0f,   1.0f },
	{ "KEY1_LOW",      PARAM_INT,     0.0f,   0.0f, 127.0f },
	{ "KEY1_HIGH",     PARAM_INT,   127.0f,   0.0f, 127.0f }
};


const char *synthv1_param::paramName(synthv1::ParamIndex index)
{
	return synthv1_params[index].name;
}

float synthv1_param::paramDefaultValue(synthv1::ParamIndex index)
{
	return synthv1_params[index].def;
}

float synthv1_param::paramSafeValue(synthv1::ParamIndex index, float fValue)
{
	const ParamInfo& param = synthv1_params[index];

	if (param.type == PARAM_BOOL)
		return (fValue > 0.5f ? 1.0f : 0.0f);

	if (fValue < param.min)
		return param.min;
	if (fValue > param.max)
		return param.max;

	if (param.type == PARAM_INT)
		return ::rintf(fValue);
	else
		return fValue;
}

float synthv1_param::paramValue(synthv1::ParamIndex index, float fScale)
{
	const ParamInfo& param = synthv1_params[index];

	if (param.type == PARAM_BOOL)
		return (fScale > 0.5f ? 1.0f : 0.0f);

	const float fValue = param.min + fScale * (param.max - param.min);

	if (param.type == PARAM_INT)
		return ::rintf(fValue);
	else
		return fValue;
}

float synthv1_param::paramScale(synthv1::ParamIndex index, float fValue)
{
	const ParamInfo& param = synthv1_params[index];

	if (param.type == PARAM_BOOL)
		return (fValue > 0.5f ? 1.0f : 0.0f);

	const float fScale = (fValue - param.min) / (param.max - param.min);

	if (param.type == PARAM_INT)
		return ::rintf(fScale);
	else
		return fScale;
}

bool synthv1_param::paramFloat(synthv1::ParamIndex index)
{
	return (synthv1_params[index].type == PARAM_FLOAT);
}
