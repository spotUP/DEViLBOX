/*
  C bridge for mdaDX10 WASM module.
  Provides extern "C" functions for Emscripten export.
*/

#include "../src/mdaDX10_standalone.h"

extern "C" {

// Lifecycle
void* dx10_create(float sampleRate) {
  return new mdaDX10(sampleRate);
}

void dx10_destroy(void* handle) {
  delete static_cast<mdaDX10*>(handle);
}

// Audio
void dx10_process(void* handle, float* outL, float* outR, int frames) {
  static_cast<mdaDX10*>(handle)->process(outL, outR, frames);
}

// MIDI
void dx10_note_on(void* handle, int note, int velocity) {
  static_cast<mdaDX10*>(handle)->noteOn(note, velocity);
}

void dx10_note_off(void* handle, int note) {
  static_cast<mdaDX10*>(handle)->noteOn(note, 0);
}

void dx10_all_notes_off(void* handle) {
  static_cast<mdaDX10*>(handle)->allNotesOff();
}

// Parameters (16 total, all 0.0-1.0)
void dx10_set_param(void* handle, int index, float value) {
  static_cast<mdaDX10*>(handle)->setParameter(index, value);
}

float dx10_get_param(void* handle, int index) {
  return static_cast<mdaDX10*>(handle)->getParameter(index);
}

// Presets
void dx10_set_program(void* handle, int program) {
  static_cast<mdaDX10*>(handle)->setProgram(program);
}

int dx10_get_num_programs(void* handle) {
  return static_cast<mdaDX10*>(handle)->getNumPrograms();
}

// Info
int dx10_get_num_params(void* handle) {
  return static_cast<mdaDX10*>(handle)->getNumParams();
}

int dx10_get_active_voices(void* handle) {
  return static_cast<mdaDX10*>(handle)->getActiveVoices();
}

} // extern "C"
