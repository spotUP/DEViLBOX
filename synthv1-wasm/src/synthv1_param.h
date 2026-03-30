// synthv1_param.h — WASM version (no Qt)
#ifndef __synthv1_param_h
#define __synthv1_param_h

#include "synthv1.h"

namespace synthv1_param
{
	const char *paramName(synthv1::ParamIndex index);
	float paramDefaultValue(synthv1::ParamIndex index);
	float paramSafeValue(synthv1::ParamIndex index, float fValue);
	float paramValue(synthv1::ParamIndex index, float fScale);
	float paramScale(synthv1::ParamIndex index, float fValue);
	bool paramFloat(synthv1::ParamIndex index);
};

#endif // __synthv1_param_h
