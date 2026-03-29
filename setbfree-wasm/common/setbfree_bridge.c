/* setbfree_bridge.c — WASM bridge for setBfree Hammond B3 organ + Leslie
 *
 * Wraps the setBfree C library into a simple C API suitable for Emscripten.
 * Audio chain: ToneGen → Preamp/Overdrive → Reverb → Leslie (stereo out)
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>

#include "global_inst.h"
#include "tonegen.h"
#include "vibrato.h"
#include "reverb.h"
#include "whirl.h"
#include "overdrive.h"
#include "midi.h"
#include "program.h"
#include "state.h"
#include "cfgParser.h"

/* setBfree uses a global sample rate variable — defined in main.c/lv2.c,
 * but we include neither, so we define it here. */
double SampleRateD = 48000.0;

/* setKeyClick is declared in tonegen.h but never implemented in this version.
 * The key click is controlled via the attack envelope model instead. */
void setKeyClick(struct b_tonegen* t, int v) {
    if (v) {
        setEnvAttackModel(t, 1); /* ENV_CLICK */
    } else {
        setEnvAttackModel(t, 0); /* ENV_SHAPED (no click) */
    }
}


#define BUFFER_SIZE 128 /* setBfree internal buffer size */

/* Parameter indices — exposed to JS */
enum {
    /* Upper manual drawbars 0-8 */
    PARAM_DRAWBAR_UPPER_16     = 0,
    PARAM_DRAWBAR_UPPER_513    = 1,
    PARAM_DRAWBAR_UPPER_8      = 2,
    PARAM_DRAWBAR_UPPER_4      = 3,
    PARAM_DRAWBAR_UPPER_223    = 4,
    PARAM_DRAWBAR_UPPER_2      = 5,
    PARAM_DRAWBAR_UPPER_135    = 6,
    PARAM_DRAWBAR_UPPER_113    = 7,
    PARAM_DRAWBAR_UPPER_1      = 8,
    /* Lower manual drawbars 9-17 */
    PARAM_DRAWBAR_LOWER_16     = 9,
    PARAM_DRAWBAR_LOWER_513    = 10,
    PARAM_DRAWBAR_LOWER_8      = 11,
    PARAM_DRAWBAR_LOWER_4      = 12,
    PARAM_DRAWBAR_LOWER_223    = 13,
    PARAM_DRAWBAR_LOWER_2      = 14,
    PARAM_DRAWBAR_LOWER_135    = 15,
    PARAM_DRAWBAR_LOWER_113    = 16,
    PARAM_DRAWBAR_LOWER_1      = 17,
    /* Pedal drawbars 18-26 */
    PARAM_DRAWBAR_PEDAL_16     = 18,
    PARAM_DRAWBAR_PEDAL_513    = 19,
    PARAM_DRAWBAR_PEDAL_8      = 20,
    PARAM_DRAWBAR_PEDAL_4      = 21,
    PARAM_DRAWBAR_PEDAL_223    = 22,
    PARAM_DRAWBAR_PEDAL_2      = 23,
    PARAM_DRAWBAR_PEDAL_135    = 24,
    PARAM_DRAWBAR_PEDAL_113    = 25,
    PARAM_DRAWBAR_PEDAL_1      = 26,
    /* Percussion */
    PARAM_PERC_ENABLED         = 27, /* 0 or 1 */
    PARAM_PERC_VOLUME          = 28, /* 0=soft, 1=normal */
    PARAM_PERC_DECAY           = 29, /* 0=slow, 1=fast */
    PARAM_PERC_HARMONIC        = 30, /* 0=second, 1=third */
    /* Vibrato/Chorus */
    PARAM_VIBRATO_TYPE         = 31, /* 0=off,1=V1,2=C1,3=V2,4=C2,5=V3,6=C3 */
    PARAM_VIBRATO_UPPER        = 32, /* 0 or 1 */
    PARAM_VIBRATO_LOWER        = 33, /* 0 or 1 */
    /* Leslie */
    PARAM_LESLIE_SPEED         = 34, /* 0=slow, 1=stop, 2=fast */
    /* Overdrive */
    PARAM_OVERDRIVE_DRIVE      = 35, /* 0.0-1.0 */
    PARAM_OVERDRIVE_INPUT_GAIN = 36, /* 0.0-1.0 */
    PARAM_OVERDRIVE_OUTPUT_GAIN= 37, /* 0.0-1.0 */
    /* Reverb */
    PARAM_REVERB_MIX           = 38, /* 0.0-1.0 */
    /* Volume */
    PARAM_VOLUME               = 39, /* 0.0-1.0 */
    /* Key click */
    PARAM_KEY_CLICK            = 40, /* 0 or 1 */
    PARAM_KEY_CLICK_LEVEL      = 41, /* 0.0-1.0 */
    /* Overdrive character */
    PARAM_OVERDRIVE_FB         = 42, /* 0.0-1.0 feedback */
    PARAM_OVERDRIVE_FAT        = 43, /* 0.0-1.0 fat/warmth */
    NUM_PARAMS                 = 44
};

typedef struct {
    b_instance inst;

    /* Internal audio buffers matching lv2.c B3S struct */
    float bufA[BUFFER_SIZE]; /* tonegen output */
    float bufB[BUFFER_SIZE]; /* after preamp */
    float bufC[BUFFER_SIZE]; /* after reverb */
    float bufD[2][BUFFER_SIZE]; /* leslie temp (horn, drum) */
    float bufL[2][BUFFER_SIZE]; /* leslie stereo output */
    int   boffset;

    /* Current parameter state for get_param */
    float params[NUM_PARAMS];
    float volume;
} SetBfreeState;

/* Forward declarations for functions defined in lv2.c that we replicate */
static void alloc_synth(b_instance* inst);
static void init_synth(b_instance* inst, double rate);
static void free_synth(b_instance* inst);

static void alloc_synth(b_instance* inst)
{
    inst->state   = allocRunningConfig();
    inst->progs   = allocProgs();
    inst->reverb  = allocReverb();
    inst->whirl   = allocWhirl();
    inst->midicfg = allocMidiCfg(inst->state);
    inst->synth   = allocTonegen();
    inst->preamp  = allocPreamp();

    initControllerTable(inst->midicfg);
    midiPrimeControllerMapping(inst->midicfg);
}

static void init_synth(b_instance* inst, double rate)
{
    unsigned int defaultPreset[9] = { 8, 8, 6, 0, 0, 0, 0, 0, 0 };

    initToneGenerator(inst->synth, inst->midicfg);
    initVibrato(inst->synth, inst->midicfg);
    initPreamp(inst->preamp, inst->midicfg);
    initReverb(inst->reverb, inst->midicfg, rate);
    initWhirl(inst->whirl, inst->midicfg, rate);
    initRunningConfig(inst->state, inst->midicfg);

    initMidiTables(inst->midicfg);

    setDrawBars(inst, 0, defaultPreset);
    setDrawBars(inst, 1, defaultPreset);
    setDrawBars(inst, 2, defaultPreset);
}

static void free_synth(b_instance* inst)
{
    if (!inst) return;
    freeReverb(inst->reverb);
    freeWhirl(inst->whirl);
    freeToneGenerator(inst->synth);
    freeMidiCfg(inst->midicfg);
    freePreamp(inst->preamp);
    freeProgs(inst->progs);
    freeRunningConfig(inst->state);
}

/* ========== Public API ========== */

void* setbfree_create(int sampleRate)
{
    SetBfreeState* s = (SetBfreeState*)calloc(1, sizeof(SetBfreeState));
    if (!s) return NULL;

    SampleRateD = (double)sampleRate;

    alloc_synth(&s->inst);
    init_synth(&s->inst, (double)sampleRate);

    s->boffset = BUFFER_SIZE; /* force first fragment generation */
    s->volume = 1.0f;

    /* Initialize param state tracking */
    /* Upper drawbars default: 888000000 */
    s->params[0] = 8; s->params[1] = 8; s->params[2] = 6;
    for (int i = 3; i < 9; i++) s->params[i] = 0;
    /* Lower drawbars default: 888000000 */
    s->params[9] = 8; s->params[10] = 8; s->params[11] = 6;
    for (int i = 12; i < 18; i++) s->params[i] = 0;
    /* Pedal drawbars default: 888000000 */
    s->params[18] = 8; s->params[19] = 8; s->params[20] = 6;
    for (int i = 21; i < 27; i++) s->params[i] = 0;

    s->params[PARAM_PERC_ENABLED]  = 1;
    s->params[PARAM_PERC_VOLUME]   = 1; /* normal */
    s->params[PARAM_PERC_DECAY]    = 1; /* fast */
    s->params[PARAM_PERC_HARMONIC] = 0; /* second */
    s->params[PARAM_VIBRATO_TYPE]  = 0; /* off */
    s->params[PARAM_VIBRATO_UPPER] = 0;
    s->params[PARAM_VIBRATO_LOWER] = 0;
    s->params[PARAM_LESLIE_SPEED]  = 0; /* slow */
    s->params[PARAM_OVERDRIVE_DRIVE]      = 0.0f;
    s->params[PARAM_OVERDRIVE_INPUT_GAIN] = 0.5f;
    s->params[PARAM_OVERDRIVE_OUTPUT_GAIN]= 0.5f;
    s->params[PARAM_REVERB_MIX]    = 0.1f;
    s->params[PARAM_VOLUME]        = 1.0f;
    s->params[PARAM_KEY_CLICK]     = 1;
    s->params[PARAM_KEY_CLICK_LEVEL] = 0.5f;
    s->params[PARAM_OVERDRIVE_FB]  = 0.0f;
    s->params[PARAM_OVERDRIVE_FAT] = 0.0f;

    return s;
}

void setbfree_destroy(void* ptr)
{
    SetBfreeState* s = (SetBfreeState*)ptr;
    if (!s) return;
    free_synth(&s->inst);
    free(s);
}

void setbfree_process(void* ptr, float* left, float* right, int nframes)
{
    SetBfreeState* s = (SetBfreeState*)ptr;
    if (!s) return;

    int written = 0;
    while (written < nframes) {
        int nremain = nframes - written;

        if (s->boffset >= BUFFER_SIZE) {
            s->boffset = 0;
            oscGenerateFragment(s->inst.synth, s->bufA, BUFFER_SIZE);
            preamp(s->inst.preamp, s->bufA, s->bufB, BUFFER_SIZE);
            reverb(s->inst.reverb, s->bufB, s->bufC, BUFFER_SIZE);
            whirlProc3(s->inst.whirl, s->bufC,
                       s->bufL[0], s->bufL[1],
                       s->bufD[0], s->bufD[1],
                       BUFFER_SIZE);
        }

        int nread = nremain < (BUFFER_SIZE - s->boffset)
                  ? nremain : (BUFFER_SIZE - s->boffset);

        /* Apply master volume and copy to output */
        float vol = s->volume;
        for (int i = 0; i < nread; i++) {
            left[written + i]  = s->bufL[0][s->boffset + i] * vol;
            right[written + i] = s->bufL[1][s->boffset + i] * vol;
        }

        written += nread;
        s->boffset += nread;
    }
}

void setbfree_note_on(void* ptr, int note, int velocity)
{
    SetBfreeState* s = (SetBfreeState*)ptr;
    if (!s) return;
    /* setBfree routes MIDI via parse_raw_midi_data. Build a raw note-on. */
    unsigned char msg[3];
    msg[0] = 0x90; /* note on, channel 0 (upper manual) */
    msg[1] = (unsigned char)(note & 0x7F);
    msg[2] = (unsigned char)(velocity & 0x7F);
    parse_raw_midi_data(&s->inst, msg, 3);
}

void setbfree_note_off(void* ptr, int note)
{
    SetBfreeState* s = (SetBfreeState*)ptr;
    if (!s) return;
    unsigned char msg[3];
    msg[0] = 0x80; /* note off, channel 0 */
    msg[1] = (unsigned char)(note & 0x7F);
    msg[2] = 0;
    parse_raw_midi_data(&s->inst, msg, 3);
}

void setbfree_all_notes_off(void* ptr)
{
    SetBfreeState* s = (SetBfreeState*)ptr;
    if (!s) return;
    midi_panic(&s->inst);
}

void setbfree_set_drawbar(void* ptr, int manual, int drawbar, int value)
{
    SetBfreeState* s = (SetBfreeState*)ptr;
    if (!s) return;
    if (manual < 0 || manual > 2) return;
    if (drawbar < 0 || drawbar > 8) return;
    if (value < 0) value = 0;
    if (value > 8) value = 8;

    /* Use MIDI control function to set individual drawbar.
     * Drawbar CCs are inverted: MIDI 0 = max (8), MIDI 127 = min (0) */
    unsigned char midiVal = (unsigned char)(127 - (value * 127 / 8));

    /* Construct the drawbar function name: drawbarN where N = manual*9 + drawbar */
    int paramBase = manual * 9;
    s->params[paramBase + drawbar] = (float)value;

    /* Build a full 9-drawbar array and use setDrawBars */
    unsigned int setting[9];
    for (int i = 0; i < 9; i++) {
        setting[i] = (unsigned int)s->params[paramBase + i];
    }
    setDrawBars(&s->inst, (unsigned int)manual, setting);
}

void setbfree_set_param(void* ptr, int index, float value)
{
    SetBfreeState* s = (SetBfreeState*)ptr;
    if (!s || index < 0 || index >= NUM_PARAMS) return;

    s->params[index] = value;

    /* Drawbars (0-26) */
    if (index >= 0 && index <= 26) {
        int manual = index / 9;
        int drawbar = index % 9;
        setbfree_set_drawbar(ptr, manual, drawbar, (int)(value + 0.5f));
        return;
    }

    switch (index) {
    case PARAM_PERC_ENABLED:
        setPercussionEnabled(s->inst.synth, (int)value);
        break;
    case PARAM_PERC_VOLUME:
        setPercussionVolume(s->inst.synth, (int)value == 0 ? 1 : 0); /* 0=soft(isSoft=1), 1=normal(isSoft=0) */
        break;
    case PARAM_PERC_DECAY:
        setPercussionFast(s->inst.synth, (int)value);
        break;
    case PARAM_PERC_HARMONIC:
        setPercussionFirst(s->inst.synth, (int)value);
        break;
    case PARAM_VIBRATO_TYPE: {
        /* Map 0-6 to setBfree vibrato constants */
        int v = (int)value;
        switch (v) {
        case 0: /* off - disable both */
            setVibratoUpper(s->inst.synth, 0);
            setVibratoLower(s->inst.synth, 0);
            break;
        case 1: callMIDIControlFunction(s->inst.midicfg, "vibrato.knob", 0);   break; /* V1 */
        case 2: callMIDIControlFunction(s->inst.midicfg, "vibrato.knob", 23);  break; /* C1 */
        case 3: callMIDIControlFunction(s->inst.midicfg, "vibrato.knob", 45);  break; /* V2 */
        case 4: callMIDIControlFunction(s->inst.midicfg, "vibrato.knob", 68);  break; /* C2 */
        case 5: callMIDIControlFunction(s->inst.midicfg, "vibrato.knob", 90);  break; /* V3 */
        case 6: callMIDIControlFunction(s->inst.midicfg, "vibrato.knob", 113); break; /* C3 */
        }
        break;
    }
    case PARAM_VIBRATO_UPPER:
        setVibratoUpper(s->inst.synth, (int)value);
        break;
    case PARAM_VIBRATO_LOWER:
        setVibratoLower(s->inst.synth, (int)value);
        break;
    case PARAM_LESLIE_SPEED:
        setRevSelect(s->inst.whirl, (int)value);
        break;
    case PARAM_OVERDRIVE_DRIVE:
        fctl_biased(s->inst.preamp, value);
        break;
    case PARAM_OVERDRIVE_INPUT_GAIN:
        fsetInputGain(s->inst.preamp, value * 40.0f - 20.0f); /* 0-1 → -20..+20 dB */
        break;
    case PARAM_OVERDRIVE_OUTPUT_GAIN:
        fsetOutputGain(s->inst.preamp, value * 40.0f - 20.0f);
        break;
    case PARAM_REVERB_MIX:
        setReverbMix(s->inst.reverb, value);
        break;
    case PARAM_VOLUME:
        s->volume = value;
        break;
    case PARAM_KEY_CLICK:
        setKeyClick(s->inst.synth, (int)value);
        break;
    case PARAM_KEY_CLICK_LEVEL:
        setEnvAttackClickLevel(s->inst.synth, (double)value);
        setEnvReleaseClickLevel(s->inst.synth, (double)value);
        break;
    case PARAM_OVERDRIVE_FB:
        fctl_biased_fb(s->inst.preamp, value * 0.8f); /* scale to safe range */
        break;
    case PARAM_OVERDRIVE_FAT:
        fctl_biased_fat(s->inst.preamp, value);
        break;
    default:
        break;
    }
}

float setbfree_get_param(void* ptr, int index)
{
    SetBfreeState* s = (SetBfreeState*)ptr;
    if (!s || index < 0 || index >= NUM_PARAMS) return 0.0f;
    return s->params[index];
}

int setbfree_get_num_params(void* ptr)
{
    (void)ptr;
    return NUM_PARAMS;
}

/* Stub for mainConfig (required by cfgParser but not needed in WASM) */
int mainConfig(ConfigContext* cfg) {
    (void)cfg;
    return 0;
}

const ConfigDoc* mainDoc(void) {
    return NULL;
}
