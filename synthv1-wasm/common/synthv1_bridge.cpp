// synthv1_bridge.cpp — C bridge for WASM

#include "../src/synthv1.h"
#include "../src/synthv1_param.h"

#include <emscripten.h>

extern "C" {

EMSCRIPTEN_KEEPALIVE
void* synthv1_create(int sampleRate)
{
	synthv1 *synth = new synthv1(2, float(sampleRate), 128);

	// Set default parameter values
	for (int i = 0; i < synthv1::NUM_PARAMS; ++i) {
		synthv1::ParamIndex idx = synthv1::ParamIndex(i);
		synth->setParamValue(idx, synthv1_param::paramDefaultValue(idx));
	}

	synth->reset();

	return static_cast<void*>(synth);
}

EMSCRIPTEN_KEEPALIVE
void synthv1_destroy(void* ptr)
{
	synthv1 *synth = static_cast<synthv1*>(ptr);
	delete synth;
}

EMSCRIPTEN_KEEPALIVE
void synthv1_process(void* ptr, float* left, float* right, int nframes)
{
	synthv1 *synth = static_cast<synthv1*>(ptr);

	float *ins[2]  = { left, right };
	float *outs[2] = { left, right };

	synth->process(ins, outs, uint32_t(nframes));
}

EMSCRIPTEN_KEEPALIVE
void synthv1_note_on(void* ptr, int note, int velocity)
{
	synthv1 *synth = static_cast<synthv1*>(ptr);
	synth->directNoteOn(note, velocity);
}

EMSCRIPTEN_KEEPALIVE
void synthv1_note_off(void* ptr, int note)
{
	synthv1 *synth = static_cast<synthv1*>(ptr);
	synth->directNoteOn(note, 0);
}

EMSCRIPTEN_KEEPALIVE
void synthv1_set_param(void* ptr, int index, float value)
{
	synthv1 *synth = static_cast<synthv1*>(ptr);

	if (index >= 0 && index < synthv1::NUM_PARAMS) {
		synthv1::ParamIndex idx = synthv1::ParamIndex(index);
		synth->setParamValue(idx,
			synthv1_param::paramSafeValue(idx, value));
	}
}

EMSCRIPTEN_KEEPALIVE
float synthv1_get_param(void* ptr, int index)
{
	synthv1 *synth = static_cast<synthv1*>(ptr);

	if (index >= 0 && index < synthv1::NUM_PARAMS)
		return synth->paramValue(synthv1::ParamIndex(index));

	return 0.0f;
}

EMSCRIPTEN_KEEPALIVE
int synthv1_get_num_params(void* /*ptr*/)
{
	return synthv1::NUM_PARAMS;
}

EMSCRIPTEN_KEEPALIVE
void synthv1_all_notes_off(void* ptr)
{
	// Send MIDI all-notes-off message (CC#123 on all channels)
	synthv1 *synth = static_cast<synthv1*>(ptr);
	uint8_t midi[3] = { 0xB0, 0x7B, 0x00 };
	synth->process_midi(midi, 3);
}

} // extern "C"
