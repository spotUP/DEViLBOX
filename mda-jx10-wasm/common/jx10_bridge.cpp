/*
  C bridge for mdaJX10 WASM module.
  Provides extern "C" functions for Emscripten export.
*/

#include "../src/mdaJX10_standalone.h"

extern "C" {

// Lifecycle
void* jx10_create(float sampleRate) {
  return new mdaJX10(sampleRate);
}

void jx10_destroy(void* handle) {
  delete static_cast<mdaJX10*>(handle);
}

// Audio
void jx10_process(void* handle, float* outL, float* outR, int frames) {
  static_cast<mdaJX10*>(handle)->process(outL, outR, frames);
}

// MIDI
void jx10_note_on(void* handle, int note, int velocity) {
  static_cast<mdaJX10*>(handle)->noteOn(note, velocity);
}

void jx10_note_off(void* handle, int note) {
  static_cast<mdaJX10*>(handle)->noteOn(note, 0);
}

void jx10_all_notes_off(void* handle) {
  static_cast<mdaJX10*>(handle)->allNotesOff();
}

// Parameters (24 total, all 0.0-1.0)
void jx10_set_param(void* handle, int index, float value) {
  static_cast<mdaJX10*>(handle)->setParameter(index, value);
}

float jx10_get_param(void* handle, int index) {
  return static_cast<mdaJX10*>(handle)->getParameter(index);
}

// Presets
void jx10_set_program(void* handle, int program) {
  static_cast<mdaJX10*>(handle)->setProgram(program);
}

int jx10_get_num_programs(void* handle) {
  return static_cast<mdaJX10*>(handle)->getNumPrograms();
}

// Info
int jx10_get_num_params(void* handle) {
  return static_cast<mdaJX10*>(handle)->getNumParams();
}

int jx10_get_active_voices(void* handle) {
  return static_cast<mdaJX10*>(handle)->getActiveVoices();
}

} // extern "C"
