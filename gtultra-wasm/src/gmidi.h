/* gmidi.h — Stub for WASM build (RtMidi replaced with EM_JS callback) */
#ifndef GMIDI_H
#define GMIDI_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    unsigned char *message;
    int size;
} MIDI_MESSAGE;

static inline int initMidi(int midiPort) { (void)midiPort; return 0; }
static inline int checkForMidiInput(MIDI_MESSAGE *m, int midiPort) {
    (void)m; (void)midiPort; return 0;
}
static inline unsigned int getPortCount(void) { return 0; }
static inline char* getPortName(int portNumber) { (void)portNumber; return (char*)""; }

#ifdef __cplusplus
}
#endif

#endif
