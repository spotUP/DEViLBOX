/* ft2_audio.c — WASM stub: no audio playback, just provides required globals */
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include "ft2_audio.h"

audio_t audio;
pattSyncData_t *pattSyncEntry;
chSyncData_t   *chSyncEntry;
chSync_t  chSync;
pattSync_t pattSync;
volatile bool pattQueueClearing, chQueueClearing;

int32_t  pattQueueReadSize(void)        { return 0; }
int32_t  pattQueueWriteSize(void)       { return 0; }
bool     pattQueuePush(pattSyncData_t t){ (void)t; return false; }
bool     pattQueuePop(void)             { return false; }
pattSyncData_t *pattQueuePeek(void)     { return NULL; }
uint64_t getPattQueueTimestamp(void)    { return 0; }
int32_t  chQueueReadSize(void)          { return 0; }
int32_t  chQueueWriteSize(void)         { return 0; }
bool     chQueuePush(chSyncData_t t)    { (void)t; return false; }
bool     chQueuePop(void)               { return false; }
chSyncData_t *chQueuePeek(void)         { return NULL; }
uint64_t getChQueueTimestamp(void)      { return 0; }
void     resetSyncQueues(void)          {}

void decreaseMasterVol(void)            {}
void increaseMasterVol(void)            {}
void calcPanningTable(void)             {}
void setAudioAmp(int16_t amp, int16_t masterVol, bool bitDepth32Flag) { (void)amp;(void)masterVol;(void)bitDepth32Flag; }
void setNewAudioFreq(uint32_t freq)     { (void)freq; }
void setBackOldAudioFreq(void)          {}
void setMixerBPM(int32_t bpm)           { (void)bpm; }
void audioSetVolRamp(bool volRamp)      { (void)volRamp; }
void audioSetInterpolationType(uint8_t t){ (void)t; }
void stopVoice(int32_t i)               { (void)i; }
bool setupAudio(bool showErrorMsg)      { (void)showErrorMsg; return true; }
void closeAudio(void)                   {}
void pauseAudio(void)                   {}
void resumeAudio(void)                  {}
bool setNewAudioSettings(void)          { return true; }
void resetAudioDither(void)             {}
void lockAudio(void)                    {}
void unlockAudio(void)                  {}
void lockMixerCallback(void)            {}
void unlockMixerCallback(void)          {}
void resetRampVolumes(void)             {}
void updateVoices(void)                 {}
void mixReplayerTickToBuffer(uint32_t n, void *s, uint8_t b) { (void)n;(void)s;(void)b; }
