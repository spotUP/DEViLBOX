#include "../src/raffo_standalone.h"

extern "C" {

void* raffo_create(float sr) {
    return new RaffoSynth(sr);
}

void raffo_destroy(void* h) {
    delete static_cast<RaffoSynth*>(h);
}

void raffo_process(void* h, float* l, float* r, int n) {
    static_cast<RaffoSynth*>(h)->process(l, r, n);
}

void raffo_note_on(void* h, int note, int vel) {
    static_cast<RaffoSynth*>(h)->noteOn(note, vel);
}

void raffo_note_off(void* h, int note) {
    static_cast<RaffoSynth*>(h)->noteOff(note);
}

void raffo_set_param(void* h, int idx, float val) {
    static_cast<RaffoSynth*>(h)->setParameter(idx, val);
}

float raffo_get_param(void* h, int idx) {
    return static_cast<RaffoSynth*>(h)->getParameter(idx);
}

void raffo_all_notes_off(void* h) {
    static_cast<RaffoSynth*>(h)->allNotesOff();
}

void raffo_pitch_bend(void* h, int val) {
    static_cast<RaffoSynth*>(h)->pitchBend(val);
}

int raffo_get_num_params(void* h) {
    return static_cast<RaffoSynth*>(h)->getNumParams();
}

} // extern "C"
