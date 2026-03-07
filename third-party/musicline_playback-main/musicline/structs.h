#pragma once

#include "defines.h"
#include "module.h"
#include "sfx.h"
#include "types.h"
#include <string.h>

class File;

struct Tune {
    Tune() {
        memset(this, 0, sizeof(Tune));
    }
    s8 Title[32];
    u16 Tempo;
    u8 Speed;
    u8 Groove;
    u16 Volume;
    u8 PlayMode;
    u8 Channels;
    struct Chnl* ChPtrs[MAXCHANS];
};

/***** VOICE *****/
struct chli {
    u16 hi : 5;
    u16 iscom : 1;
    u16 command : 2;
    u16 data : 8;
};

struct ChnlLine {
    ChnlLine() {
        Fx = 0;
    }
    union {
        u16 Fx;
        chli _Fx;
    };
};

struct Chnl {
    Chnl() {}
    struct ChnlLine Data[256];
};

/***** PART *****/
#define MAX_FX_CHANGES_PER_LINE 5
struct PartLine {
    PartLine() {
        memset(this, 0, sizeof(PartLine));
    }
    u8 Note;                         // note number
    u8 Inst;                         // inst number
    u16 Fx[MAX_FX_CHANGES_PER_LINE]; // fx word 1-5
};
#define PartSize 128
struct Part {
    Part() {
        memset(this, 0, sizeof(Part));
    }
    struct PartLine Data[PartSize];
};

/***** ARPEGGIO *****/

struct ArpgLine {
    ArpgLine() {
        memset(this, 0, sizeof(ArpgLine));
    }
    u8 Note;   // note number
    u8 Smpl;   // smpl number
    u16 Fx[2]; // fx word 1-2
};

struct Arpg {
    Arpg() {
        memset(this, 0, sizeof(Arpg));
    }
    ArpgLine Data[128];
};

/***** SAMPLE *****/
class Channel;

struct Smpl {
    Smpl() {
        memset(this, 0, sizeof(Smpl));
    }
    u32 DeltaDePacker(u8* source, s8 command, r32* dest, u32 size);
    void FixWaveLength(MLModule* data, Channel* chan, r32* samp);

    s8 Title[32];
    u8 Number;
    u8 Type;
    union {
        //		s8					*Pos32er;
        r32* fPointer;
    };

    u16 Length;
    union {
        //		s8					*RepPos32er;
        r32* fRepPointer;
    };
    u16 RepLength;
    s16 FineTune;
    s16 SemiTone;
    union {
        //		s8					*Data;	// actual sample data
        r32* fData;
    };
};

/***** INSTRUMENT *****/

struct iEnv {
    iEnv() {
        memset(this, 0, sizeof(iEnv));
    }
    u16 AttLen;
    u16 DecLen;
    u16 SusLen;
    u16 RelLen;
    s16 AttSpd; // Signed: ASM uses divs (signed division) - Mline116.asm:22406
    s16 DecSpd; // Signed: can be negative when DecVol < AttVol - Mline116.asm:22423
    s16 SusSpd; // Signed: can be negative when SusVol < DecVol - Mline116.asm:22440
    s16 RelSpd; // Signed: can be negative when RelVol < SusVol - Mline116.asm:22457
    u16 AttVol;
    u16 DecVol;
    u16 SusVol;
    u16 RelVol;
};

/** Vibrato **/

struct iVib {
    iVib() {
        memset(this, 0, sizeof(iVib));
    }
    u8 Dir;
    u8 WaveNum;
    u16 Speed;
    u16 Delay;
    u16 AtkSpd;
    u16 Attack;
    u16 Depth;
};

/** Tremolo **/

struct iTre {
    iTre() {
        memset(this, 0, sizeof(iTre));
    }
    u8 Dir;
    u8 WaveNum;
    u16 Speed;
    u16 Delay;
    u16 AtkSpd;
    u16 Attack;
    u16 Depth;
};

/** Arpeggio **/

struct iArp {
    iArp() {
        memset(this, 0, sizeof(iArp));
    }
    u16 Table;
    u8 Speed;
    u8 Groove;
};

/** Transform **/

struct iTra {
    iTra() {
        memset(this, 0, sizeof(iTra));
    }
    u8 EnvTraPhaFilBits;
    u8 WaveNums[5];
    u16 Start;
    u16 Repeat;
    u16 RepEnd;
    u16 Speed;
    u16 Turns;
    u16 Delay;
};

/** Phase **/

struct iPha {
    iPha() {
        memset(this, 0, sizeof(iPha));
    }
    u16 Start;
    u16 Repeat;
    u16 RepEnd;
    u16 Speed;
    u16 Turns;
    u16 Delay;
    u16 Type;
};

/** Mix **/

struct iMix {
    iMix() {
        memset(this, 0, sizeof(iMix));
    }
    u8 ResLooBits;
    u8 WaveNum;
    u16 Start;
    u16 Repeat;
    u16 RepEnd;
    u16 Speed;
    u16 Turns;
    u16 Delay;
};

/** Resonance **/

struct iRes {
    iRes() {
        memset(this, 0, sizeof(iRes));
    }
    u16 Start;
    u16 Repeat;
    u16 RepEnd;
    u16 Speed;
    u16 Turns;
    u16 Delay;
    u8 MixResFilBoost;
    u8 Amp;
};

/** Filter **/

struct iFil {
    iFil() {
        memset(this, 0, sizeof(iFil));
    }
    u16 Start;
    u16 Repeat;
    u16 RepEnd;
    u16 Speed;
    u16 Turns;
    u16 Delay;
    //	u8		PadByte;
    u8 Type;
};

/** Loop **/

struct iLoo {
    iLoo() {
        memset(this, 0, sizeof(iLoo));
    }
    u16 Start;
    u16 Repeat;
    u16 RepEnd;
    u16 Length;
    u16 LpStep;
    u16 Wait;
    u16 Delay;
    u16 Turns;
};

struct Inst {
    Inst() {
        memset(this, 0, sizeof(Inst));
    }
    struct Smpl Smpl;

    s8 Title[32];
    u16 SmplStart;
    u16 SmplEnd;
    u16 SmplRepStart;
    u16 SmplRepLen;
    u16 Volume;
    u8 Transpose;
    u8 SlideSpeed;
    bool Effects[32];

    struct iEnv Env;
    struct iVib Vib;
    struct iTre Tre;
    struct iArp Arp;
    struct iTra Tra;
    struct iPha Pha;
    struct iMix Mix;
    struct iRes Res;
    struct iFil Fil;
    struct iLoo Loo;
};

/***** Counter Structure *****/

struct Counter {
    Counter() {
        memset(this, 0, sizeof(Counter));
    }
    u16 counter;
    s16 speed;
    u16 repeat;
    u16 repeatend;
    s16 turns;
    u16 delay;
    u16 step; // flag
    u16 savecounter;
};

/***** ChannelData *****/

class CPlayInst {
  public:
    CPlayInst();
    void Init();
    void PlayFx(MLModule* data, u8 cmd, u8 arg);
    void PlayInst(MLModule* data);

    void RemovePitchEffects(void);
    void CheckInst(MLModule* data);
    void PlayPartFx(MLModule* data);
    void InitPartFx(void);
    void PlaySpecialFx(MLModule* data);
    void PlayArpg(MLModule* data);
    void Pan(MLModule* data);

    //
    void pfx_UNUSED(MLModule* data, u8 cmd, u8 arg);
    void pfx_SlideUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_SlideDown(MLModule* data, u8 cmd, u8 arg);
    void pfx_Portamento(MLModule* data, u8 cmd, u8 arg);
    void pfx_InitInstrumentPortamento(MLModule* data, u8 cmd, u8 arg);
    void pfx_PitchUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_PitchDown(MLModule* data, u8 cmd, u8 arg);
    void pfx_VibratoSpeed(MLModule* data, u8 cmd, u8 arg);
    void pfx_VibratoUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_VibratoDown(MLModule* data, u8 cmd, u8 arg);
    void Vibrato_pfx(MLModule* data, u8 cmd, u8 arg, u8 dir);
    void pfx_VibratoWave(MLModule* data, u8 cmd, u8 arg);
    void pfx_SetFinetune(MLModule* data, u8 cmd, u8 arg);
    void pfx_Volume(MLModule* data, u8 cmd, u8 arg);
    void pfx_VolumeSlideUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_VolumeSlideDown(MLModule* data, u8 cmd, u8 arg);
    void pfx_VolumeSlideToVolSet(MLModule* data, u8 cmd, u8 arg);
    void pfx_VolumeSlideToVol(MLModule* data, u8 cmd, u8 arg);
    void pfx_VolumeAdd(MLModule* data, u8 cmd, u8 arg);
    void pfx_VolumeSub(MLModule* data, u8 cmd, u8 arg);
    void pfx_TremoloSpeed(MLModule* data, u8 cmd, u8 arg);
    void pfx_TremoloUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_TremoloDown(MLModule* data, u8 cmd, u8 arg);
    void Tremolo_pfx(MLModule* data, u8 cmd, u8 arg, u8 dir);
    void pfx_TremoloWave(MLModule* data, u8 cmd, u8 arg);
    void pfx_ChannelVol(MLModule* data, u8 cmd, u8 arg);
    void pfx_ChannelVolSlideUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_ChannelVolSlideDown(MLModule* data, u8 cmd, u8 arg);
    void pfx_ChannelVolSlideToVolSet(MLModule* data, u8 cmd, u8 arg);
    void pfx_ChannelVolSlideToVol(MLModule* data, u8 cmd, u8 arg);
    void pfx_ChannelVolAdd(MLModule* data, u8 cmd, u8 arg);
    void pfx_ChannelVolSub(MLModule* data, u8 cmd, u8 arg);
    void pfx_AllChannelVol(MLModule* data, u8 cmd, u8 arg);
    void pfx_MasterVol(MLModule* data, u8 cmd, u8 arg);
    void pfx_MasterVolSlideUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_MasterVolSlideDown(MLModule* data, u8 cmd, u8 arg);
    void pfx_MasterVolSlideToVolSet(MLModule* data, u8 cmd, u8 arg);
    void pfx_MasterVolSlideToVol(MLModule* data, u8 cmd, u8 arg);
    void pfx_MasterVolAdd(MLModule* data, u8 cmd, u8 arg);
    void pfx_MasterVolSub(MLModule* data, u8 cmd, u8 arg);
    void pfx_SpeedPart(MLModule* data, u8 cmd, u8 arg);
    void pfx_GroovePart(MLModule* data, u8 cmd, u8 arg);
    void pfx_SpeedAll(MLModule* data, u8 cmd, u8 arg);
    void pfx_GrooveAll(MLModule* data, u8 cmd, u8 arg);
    void pfx_ArpeggioList(MLModule* data, u8 cmd, u8 arg);
    void pfx_ArpeggioListOneStep(MLModule* data, u8 cmd, u8 arg);
    void pfx_HoldSustain(MLModule* data, u8 cmd, u8 arg);
    void pfx_Filter(MLModule* data, u8 cmd, u8 arg);
    void pfx_SampleOffset(MLModule* data, u8 cmd, u8 arg);
    void pfx_RestartNoVolume(MLModule* data, u8 cmd, u8 arg);
    void pfx_WaveSample(MLModule* data, u8 cmd, u8 arg);
    void pfx_InitInstrument(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTSlideUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTSlideDown(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTPortamento(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTFineSlideUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTFineSlideDown(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTTremolo(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTTremoloWave(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTVibrato(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTVibratoWave(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTVolSlideUp(MLModule* data, u8 cmd, u8 arg);
    void pfx_PTVolSlideDown(MLModule* data, u8 cmd, u8 arg);
    void pfx_UserCommand(MLModule* data, u8 cmd, u8 arg);

    void pfx_NumPoly(MLModule* data, u8 cmd, u8 arg);
    void pfx_ReverbOn(MLModule* data, u8 cmd, u8 arg);
    void pfx_ReverbAmp(MLModule* data, u8 cmd, u8 arg);
    void pfx_ReverbSize(MLModule* data, u8 cmd, u8 arg);
    void pfx_EchoOn(MLModule* data, u8 cmd, u8 arg);
    void pfx_EchoAmp(MLModule* data, u8 cmd, u8 arg);
    void pfx_Pan(MLModule* data, u8 cmd, u8 arg);
    void pfx_PanAdd(MLModule* data, u8 cmd, u8 arg);
    void pfx_PanSize(MLModule* data, u8 cmd, u8 arg);
    void pfx_Chord(MLModule* data, u8 cmd, u8 arg);
    void pfx_SetResoCounter(MLModule* data, u8 cmd, u8 arg);
    void pfx_SetResoAmp(MLModule* data, u8 cmd, u8 arg);
    void pfx_SetFiltCounter(MLModule* data, u8 cmd, u8 arg);
    void pfx_SetSpecialVolume(MLModule* data, u8 cmd, u8 arg);
    void pfx_SetSurround(MLModule* data, u8 cmd, u8 arg);

    void ArpRts(MLModule* data, u8 cmd, u8 arg);
    void ArpSldUp(MLModule* data, u8 cmd, u8 arg);
    void ArpSldDwn(MLModule* data, u8 cmd, u8 arg);
    void ArpSetVol(MLModule* data, u8 cmd, u8 arg);
    void ArpSldVol(MLModule* data, u8 cmd, u8 arg);
    void ArpRestart(MLModule* data, u8 cmd, u8 arg);

    void InstPlay(MLModule* data, struct Inst* inst);
    void PerCalc();
    void PlayDma(MLModule* data);
    void PlayDmaAndMix(MLModule* data); // Deferred pass 2 for 8ch two-pass mode
    void PlayEffects(MLModule* data);
    void MoveLoop(MLModule* data);
    void LoopCounter(MLModule* data);
    void SlideNote(MLModule* data);
    u16 GetPeriod(MLModule* data, s16 note);
    void SlideArpNote(MLModule* data);
    void SlideVol(MLModule* data);
    void SlideChannelVol(MLModule* data);
    void SlideMasterVol(MLModule* data);
    void SlideArpVol(MLModule* data);
    void ArpeggioPlay(MLModule* data);
    void ADSRPlay(MLModule* data);
    void TremoloPlay(MLModule* data);
    void VibratoPlay(MLModule* data);
    void PhasePlay(MLModule* data);
    void MixPlay(MLModule* data);
    void ResonancePlay(MLModule* data);
    void FilterPlay(MLModule* data);
    void TransformPlay(MLModule* data);
    void SelectTraWave(MLModule* data);
    void OneWayCounter(MLModule* data, struct Counter* count);
    void Counter(MLModule* data, struct Counter* count);

    //

    u8 m_PartNote;
    u8 m_PartInst;
    u16 m_PartEffects[5];
    u8 m_Arp;
    u8 m_ArpPos;
    u8 m_ArpTab;
    u8 m_ArpWait;
    u8 m_ArpgNote;
    u8 m_ArpVolSld;
    u8 m_ArpPchSld;
    u8 m_ArpPchSldType; // flag
    s16 m_ArpNote;
    struct Inst* m_InstPtr;
    struct Smpl* m_WsPtr;
    u16 m_Volume1;
    u16 m_Volume2;
    u16 m_Volume3;
    r32* m_WsRepPtrOrg;
    r32* m_WsPointer;
    u16 m_WsLength;
    r32* m_WsRepPointer;
    u16 m_WsRepLength;

    s16 m_Note;
    s16 m_OldNote;
    u16 m_Period1;
    u16 m_Period2;

    u16 m_Chord_Period1;
    u16 m_Chord_Period2;
    u16 m_Chord_Period3;

    u16 m_VUAmp;
    u16 m_VUOldAmp;
    u16 m_VUPeriod;
    u16 m_VUVolume;
    r32* m_VUWsPointer;
    u32 m_VUWsLength;
    r32* m_VUWsRepPointer;
    u32 m_VUWsRepLength;

    s16 m_Transpose;
    s16 m_SemiTone;
    s16 m_FineTune;

    u8 m_SmpOfs;
    u8 m_SmplOfs;
    u8 m_OldInst;
    u8 m_Restart;

    u8 m_VolAdd;
    u8 m_VolSld;
    u8 m_CVolSld;
    u8 m_MVolSld;
    u16 m_VolSet;
    u16 m_CVolume;
    s16 m_VolAddNum;
    s16 m_CVolAddNum;
    s16 m_MVolAddNum;
    u16 m_VolSldSpd;
    u16 m_CVolSldSpd;
    u16 m_MVolSldSpd;

    u16 m_VolSldVol;
    u16 m_CVolSldVol;
    u16 m_MVolSldVol;
    s16 m_VolSldToVol;
    s16 m_CVolSldToVol;
    s16 m_MVolSldToVol;
    u8 m_VolSldType;  // flag
    u8 m_CVolSldType; // flag
    u8 m_MVolSldType; // flag
    u8 m_VolSldToVolOff;
    u8 m_CVolSldToVolOff;
    u8 m_MVolSldToVolOff;

    u8 m_Vol;

    u8 m_InstPchSld;
    u8 m_MixResFilBoost;

    s8 m_TransposeNum;
    u8 m_PchSld;
    u8 m_PchSldType; // flag
    u16 m_PchSldSpd;
    s16 m_PchSldNote;
    s16 m_PchSldToNote;
    s16 m_PchAdd;
    u16 m_ArpVolSldSpd;
    u16 m_ArpPchSldSpd;
    s16 m_ArpPchSldToNote;
    s16 m_ArpPchSldNote;

    u8 m_PTPchSld;
    u8 m_PTPchSldType; // flag
    u16 m_PTPchSldSpd;
    u16 m_PTPchSldSpd2;
    s16 m_PTPchSldNote;
    s16 m_PTPchSldToNote;
    s16 m_PTPchAdd;

    //	u8	Effects1;
    //	u8	Effects2;
    bool m_Effects[32];
    u8 m_EffectsPar1;
    u8 m_EffectsPar2;
    s16 m_ADSRVolume; // Signed: accumulates signed speeds - Mline116.asm:12871
    struct iEnv m_ADSRData;
    u8 m_Play;
    bool m_PlayBit0WasSet; // Saved state of Play bit 0 before PlayDma clears it
    u8 m_WaveOrSample;
    u8 m_PhaInit;
    u8 m_FilInit;
    u8 m_TraInit;

    u8 m_Vib;
    u8 m_VibDir;
    u8 m_VibWaveNum;
    u8 m_PartVibWaveNum;
    u16 m_VibCount;
    u16 m_VibCmdSpeed;
    u16 m_VibCmdDepth;
    u16 m_VibCmdDelay;
    u16 m_VibAtkSpeed;
    u16 m_VibAtkLength;
    u16 m_VibDepth;
    s16 m_VibNote;

    u8 m_PTTrePos;
    u8 m_PTTreCmd;
    u8 m_PTTreWave;
    u8 m_PTVibPos;
    u8 m_PTVibCmd;
    u8 m_PTVibWave;
    s16 m_PTVibNote;

    u8 m_Tre;
    u8 m_TreDir;
    u8 m_TreWaveNum;
    u8 m_PartTreWaveNum;
    u16 m_TreCount;
    u16 m_TreCmdSpeed;
    u16 m_TreCmdDepth;
    u16 m_TreCmdDelay;
    u16 m_TreAtkSpeed;
    u16 m_TreAtkLength;
    u16 m_TreDepth;

    r32 m_FilLastSample;
    r32 m_ResLastSample;
    u8 m_FilLastInit;
    u8 m_ResLastInit;
    u8 m_ResAmp;
    u8 m_ResInit;
    u16 m_PhaType;
    u8 m_FilType;
    struct Counter m_TraData;
    s16 m_TraSpd;
    struct Counter m_PhaData;
    s16 m_PhaSpd;
    struct Counter m_MixData;
    s16 m_MixSpd;
    struct Counter m_ResData;
    s16 m_ResSpd;
    struct Counter m_FilData;
    s16 m_FilSpd;
    u32 m_MixWaveNum;
    u32 m_MixInit;
    u32 m_TraWsPtrs[6];
    u32 m_LooInit;
    s32 m_LooRepeat;
    s32 m_LooRepEnd;
    u32 m_LooLength;
    s32 m_LooStep;
    u16 m_LooWait;
    u16 m_LooWaitCounter;
    u16 m_LooDelay;
    s16 m_LooTurns;
    u16 m_LooCounter;
    u16 m_LooCounterSave;
    u16 m_LooWsCounterMax;
    s16 m_LooSpd;
    r32* m_LooWsPointer;

    r32 m_ChannelBuffer[4096];
    r32 m_TraWaveBuffer[4096];
    r32 m_PhaWaveBuffer[4096];
    r32 m_MixWaveBuffer[4096];
    r32 m_ResWaveBuffer[4096];
    r32 m_FilWaveBuffer[4096];
    bool m_effectModifiedWaveform = false; // Saved for deferred PlayDma+UpdateChannel pass (8ch two-pass mode)
    r32 m_ResoSinus;
    CMLineSfx* m_pSfx;
    r32 m_SpecialVolume;
    r32 m_fPanAdd;
    bool m_bAutoPan;

    u8 m_ArpSpdCnt;
    u8 m_ArpgGrv; // flag
    u8 m_WsNumber;
    u8 m_WsNumberOld;
    CMLineSfx m_Sfx;
};

class Channel {
  public:
    Channel() {
        memset(this, 0, sizeof(Channel));
    }
    void Clear() {
        memset(this, 0, sizeof(Channel));
    }

    void PlayVoice(MLModule* data);
    void PlayEffects(MLModule* data);
    void PlayPattern(MLModule* data, s32 pattern);
    CPlayInst* GetPlayingInstrument() {
        return &m_Instrument[m_InstNum];
    }
    Chnl* m_pChnl;
    //	NoteChannel *CustomAddress;
    //	u16	DmaChannel;
    s32 m_InstNum;
    s32 m_InstNumOf;
    CPlayInst m_Instrument[4]; // last four notes
    u8 m_VoiceOff;             // flag
    u8 m_ChannelOff;           // flag
    u8 m_Spd;
    u8 m_Grv;
    u8 m_SpdPart;
    u8 m_GrvPart;
    u8 m_TuneSpd;
    u8 m_TuneGrv;
    u8 m_SpdCnt;
    u8 m_PartGrv; // flag

    u8 m_TunePos;
    u8 m_PartPos;
    u8 m_PartPosWork;

    u8 m_TuneJumpCount;
    u8 m_PartJmpCnt;
    u8 m_PlayError;
    u8 m_TuneWait;
    u16 m_PartNum;
    s8 m_TransposeNum;
    u8 m_PartNote;
    u8 m_PartInst;
    u16 m_PartEffects[5];

    //	s8				*WaveBuffer;
    //	u8	*MixVolTable;
    //	s8				*MixWsPos32er;
    //	u32	MixWsCounter;
    //	u32	MixWsLength;
    //	u32	MixSaveDec1;
    //	u16	MixSaveDec2;
    //	u8	MixSmplEnd;
    //	u8	MixLoop;
    //	u16	MixWsLen;
    //	u16	MixAdd2;
    //	u16	MixAdd1;
};
