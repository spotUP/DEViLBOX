/* ft2_replayer.c — WASM stub: provides required globals, minimal replay state */
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include "ft2_header.h"
#include "ft2_replayer.h"
#include "ft2_audio.h"

/* Required globals declared extern in ft2_replayer.h */
int8_t playMode = PLAYMODE_IDLE;
bool songPlaying = false;
bool audioPaused = false;
bool musicPaused = false;
volatile bool replayerBusy = false;

const uint16_t *note2PeriodLUT = NULL;
int16_t patternNumRows[MAX_PATTERNS];
channel_t channel[MAX_CHANNELS];
song_t song;
instr_t *instr[128+4]; /* [0] unused, [1..128] instruments */
note_t *pattern[MAX_PATTERNS];

double getSampleC4Rate(sample_t *s)
{
    if (!s || s->length == 0) return C4_FREQ;
    double dFt = s->finetune / 128.0;
    return C4_FREQ * pow(2.0, (dFt + s->relativeNote) / 12.0);
}

void setNewSongPos(int32_t pos)           { song.songPos = (int16_t)pos; }
void fixString(char *str, int32_t last)    { (void)str; (void)last; }
void fixSongName(void)                     {}
void fixInstrAndSampleNames(int16_t n)     { (void)n; }
void calcReplayerVars(int32_t rate)        { (void)rate; }
void setSampleC4Hz(sample_t *s, double d)  { (void)s; (void)d; }

double dPeriod2Hz(uint32_t period)
{
    if (period == 0) return 0.0;
    return (double)(8363 * 1712) / (double)period;
}
uint64_t period2VoiceDelta(uint32_t p)     { (void)p; return 0; }
uint64_t period2ScopeDelta(uint32_t p)     { (void)p; return 0; }
uint64_t period2ScopeDrawDelta(uint32_t p) { (void)p; return 0; }

int32_t getPianoKey(int32_t period, int8_t ft, int8_t rel) { (void)period;(void)ft;(void)rel; return 0; }
void triggerNote(uint8_t note, uint8_t efx, uint8_t efxData, channel_t *ch) { (void)note;(void)efx;(void)efxData;(void)ch; }
void updateVolPanAutoVib(channel_t *ch)    { (void)ch; }

bool allocateInstr(int16_t insNum)
{
    if (insNum < 1 || insNum > MAX_INST) return false;
    if (instr[insNum] != NULL) return true;
    instr[insNum] = (instr_t *)calloc(1, sizeof(instr_t));
    return instr[insNum] != NULL;
}

void freeInstr(int32_t insNum)
{
    if (insNum < 1 || insNum > MAX_INST || instr[insNum] == NULL) return;
    for (int32_t i = 0; i < MAX_SMP_PER_INST; i++)
    {
        sample_t *s = &instr[insNum]->smp[i];
        if (s->origDataPtr != NULL)
        {
            free(s->origDataPtr);
            s->origDataPtr = NULL;
            s->dataPtr     = NULL;
        }
    }
    free(instr[insNum]);
    instr[insNum] = NULL;
}

void freeAllInstr(void)
{
    for (int32_t i = 1; i <= MAX_INST; i++)
        freeInstr(i);
}

void freeSample(int16_t insNum, int16_t smpNum)
{
    if (insNum < 1 || insNum > MAX_INST || instr[insNum] == NULL) return;
    if (smpNum < 0 || smpNum >= MAX_SMP_PER_INST) return;
    sample_t *s = &instr[insNum]->smp[smpNum];
    if (s->origDataPtr != NULL)
    {
        free(s->origDataPtr);
        s->origDataPtr = NULL;
        s->dataPtr     = NULL;
    }
    memset(s, 0, sizeof(sample_t));
}

void freeAllPatterns(void) {}
void updateChanNums(void)  {}
void calcMiscReplayerVars(void) {}
bool setupReplayer(void)   { return true; }
void closeReplayer(void)   {}
void resetMusic(void)      {}
void startPlaying(int8_t mode, int16_t row)     { (void)mode; (void)row; }
void stopPlaying(void)     {}
void stopVoices(void)      {}
void setPos(int16_t songPos, int16_t row, bool resetTimer) { (void)songPos;(void)row;(void)resetTimer; }
void pauseMusic(void)      {}
void resumeMusic(void)     {}
void setSongModifiedFlag(void)    {}
void removeSongModifiedFlag(void) {}
void playTone(uint8_t ch, uint8_t ins, uint8_t note, int8_t vol, uint16_t midiVib, uint16_t midiPitch) { (void)ch;(void)ins;(void)note;(void)vol;(void)midiVib;(void)midiPitch; }
void playSample(uint8_t ch, uint8_t ins, uint8_t smp, uint8_t note, uint16_t midiVib, uint16_t midiPitch) { (void)ch;(void)ins;(void)smp;(void)note;(void)midiVib;(void)midiPitch; }
void playRange(uint8_t ch, uint8_t ins, uint8_t smp, uint8_t note, uint16_t midiVib, uint16_t midiPitch, int32_t offset, int32_t len) { (void)ch;(void)ins;(void)smp;(void)note;(void)midiVib;(void)midiPitch;(void)offset;(void)len; }
void keyOff(channel_t *ch)                      { (void)ch; }
void conv8BitSample(int8_t *p, int32_t len, bool stereo)  { (void)p;(void)len;(void)stereo; }
void conv16BitSample(int8_t *p, int32_t len, bool stereo) { (void)p;(void)len;(void)stereo; }
void delta2Samp(int8_t *p, int32_t len, uint8_t flags)    { (void)p;(void)len;(void)flags; }
void samp2Delta(int8_t *p, int32_t len, uint8_t flags)    { (void)p;(void)len;(void)flags; }
void setPatternLen(uint16_t pattNum, int16_t numRows)      { (void)pattNum;(void)numRows; }
void setLinearPeriods(bool f)                              { (void)f; }
void resetVolumes(channel_t *ch)                           { (void)ch; }
void triggerInstrument(channel_t *ch)                      { (void)ch; }
void tickReplayer(void)    {}
void resetChannels(void)   {}
bool patternEmpty(uint16_t pattNum)                        { (void)pattNum; return true; }
int16_t getUsedSamples(int16_t n)                          { (void)n; return 0; }
int16_t getRealUsedSamples(int16_t n)                      { (void)n; return 0; }
void setStdEnvelope(instr_t *ins, int16_t i, uint8_t t)   { (void)ins;(void)i;(void)t; }
void setNoEnvelope(instr_t *ins)                           { (void)ins; }
void setSyncedReplayerVars(void) {}
void decSongPos(void)      {}
void incSongPos(void)      {}
void decCurIns(void)       {}
void incCurIns(void)       {}
void decCurSmp(void)       {}
void incCurSmp(void)       {}
void pbPlaySong(void)      {}
void pbPlayPtn(void)       {}
void pbRecSng(void)        {}
void pbRecPtn(void)        {}
