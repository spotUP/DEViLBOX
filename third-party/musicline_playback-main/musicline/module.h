#pragma once

#include "defines.h"
#include "types.h"
#include <unordered_map>

static constexpr int INTERNAL_RATE = 28150;
static constexpr int MAX_INTERNAL_TICK = 1200; // generous max for slowest tempo

#define MAX_INSTURUMENTS (256)
#define MAX_TUNES (256)

struct Tune;
struct Part;
struct CMLineSfx;
struct Arpg;
struct Smpl;
class File;
class Channel;
struct Inst;

// Debug flags for isolating playback issues
struct MLDebugFlags {
    bool disableVolumeCalc = false;    // Use fixed volume instead of calculated
    bool disableVoiceOff = false;      // Ignore VoiceOff flag
    bool disableADSR = false;          // Skip ADSR envelope
    bool disableResonance = false;     // Skip resonance effect
    bool disableFilter = false;        // Skip filter effect
    bool disableVibrato = false;       // Skip vibrato
    bool disableTremolo = false;       // Skip tremolo
    bool disableArpeggio = false;      // Skip arpeggio
    bool disableSlides = false;        // Skip volume/note slides
    bool disableSpecialVolume = false; // Ignore SpecialVolume multiplier
    float fixedVolume = 64.0f;         // Volume to use when disableVolumeCalc is true
    bool logChannelActivity = false;   // Log channel volume activity
    int logStartSec = 0;               // Start logging at this second
    int logEndSec = 0;                 // Stop logging at this second
    bool logPatternPos = false;        // Log pattern position and notes
    int lastLoggedHalfSec = -1;        // For throttling time logging
};

class MLModule {
    //	NoteStruct* ns;
  public:
    MLModule();
    ~MLModule();

    static void Init();
    static bool CanPlay(u8* data, u32 len);

    // TODO: This should be the only public stuff for the API

    bool LoadMod(u8* mod, u32 len);
    void LoadMod(Text szName);
    void LoadMod(wchar_t* szName);
    bool InitTune(u32 num);
    void DisableAllEffects(); // Disable all instrument effects for debugging
    void Update();

    // Debug flags for isolating issues
    MLDebugFlags m_debugFlags;

    int SubSongCount();
    int SubSongIndex(int subsong); // Map playable subsong index to TuneList index
    s8* SubSongName(int entry);
    void Output(vp sampbuf, u32 size);

    void SetOutputRate(int rate);
    int GetOutputRate() const {
        return m_outputRate;
    }

    void SetStereoSeparation(float sep);
    float GetStereoSeparation() const {
        return m_stereoSeparation;
    }

    // ....

    void FreeMod(void);
    void EndTune(void);
    void PlayMusic(void);

    void SetTuneVariables(s32 i);
    void SetSongSpeed(int bpm);
    void ClearMixBuff();
    void SaveData(u32 len);
    void SetPattern(s32 i);

    void UpdateChannel();

    bool isSongEnd() const;
    double GetSongSpeed() {
        return m_nCurrentTickSize;
    }

    // Loop detection
    bool isLoopDetected() const {
        return m_loopDetected;
    }
    double getLoopDurationSeconds(int sampleRate = INTERNAL_RATE) const;
    bool m_loopDetected = false;
    uint64_t m_loopDurationSamples = 0;
    uint64_t m_totalSamplesAccum = 0;
    bool m_dryRun = false; // Skip audio processing in PlayMusic (for loop detection)

    // INFO chunk metadata accessors
    const char* GetInfoTitle() const {
        return m_infoTitle;
    }
    const char* GetInfoAuthor() const {
        return m_infoAuthor;
    }
    const char* GetInfoDate() const {
        return m_infoDate;
    }
    const char* GetInfoDuration() const {
        return m_infoDuration;
    }
    const char* GetInfoText(int idx) const {
        return (idx >= 0 && idx < 5) ? m_infoText[idx] : "";
    }
    void Mute(bool bMute) {
        m_f1.mute = bMute;
    }
    void Reset() {
        m_f1.frame = 0;
        m_f1.mute = false;
    }

    CMLineSfx* GetWorkChannel(int i) {
        return m_pChannel[i];
    }
    CMLineSfx* GetChannel(int i) {
        return m_pMixChord[i];
    }

  private:
    void ReadMod(File* file);
    void ResetModule(void);

    void Import(File* pFile);
    void PlayTune(void);
    void PlayPattern(s32 pattern);
    void PlayEffects(s32 i);
    void PlaySongEffects();
    void PerCalcSong(void);
    void PerCalc(s32 i);
    void PlayDmaSong(void);
    void PlayDma(s32 i);
    void checkLoopState();
    std::unordered_map<uint64_t, uint64_t> m_seenStates;

  public:
    u8* m_module;
    u32 m_modlen;

    u16 m_SongNum;
    u16 m_ChanNum;

    u16 m_TuneNum;
    u16 m_ArpgNum;
    u16 m_PartNum;
    u16 m_InstNum;
    u16 m_SmplNum;
    u32 m_ChannelNum;

    //	struct Chnl		*ZeroChannel;
    //	void				*ZeroBuffer;

    struct Tune* m_TunePtr;

    u8 m_PlayMode;
    u8 m_ChannelsOn;

    u8 m_TunePos;
    u8 m_PlayBits;
    u8 m_nPlayTune; // ASM: _PlayTune - 2 = first tick (skip notes), 1 = normal, 0 = stopped

    u8 m_TuneSpd;
    u8 m_TuneGrv;
    u16 m_TuneTmp;

    u16 m_MasterVol;
    u16 m_IntMode;
    s32 m_nPattern;
    u16 m_Version;
    s32 m_nChannelCheck;
    s32 m_nChannelPosCheck;
    bool m_bPlay;

    s32 m_nNote;
    s32 m_nInst;
    s32 m_nSingleChannel;
    s32 m_nValidSingleChannel;
    s32 m_nMixChord;
    s32 m_nChannel;

    Tune* m_TuneList[MAX_TUNES];
    Part* m_PartList[1025];
    Arpg* m_ArpgList[256];
    Inst* m_InstList[MAX_INSTURUMENTS];
    Smpl* m_SmplList[256];

    Channel* m_ChannelBuf[MAXCHANS];

    // Mixer stuff

    union {
        u32 m_flags1;
        struct {
            u32 mute : 1;
            u32 frame : 31;
        } m_f1;
    };
    r64 m_fSamplesPerTick;
    double m_fTickAccum;    // Fractional accumulator for variable tick sizing
    u32 m_nCurrentTickSize; // Integer tick size for current tick (562 or 563)
    r64 m_fCurrent;
    u64 m_nTickCount; // Total ticks since start (for timing analysis)
    u32 m_Read;
    u32 m_Write;

    CMLineSfx* m_pChannel[MAXCHANS * 4 * 4];
    CMLineSfx* m_pMixChord[MAXCHANS];
    //	short *GetTempBuffer(){return m_Temp;}

    CMLineSfx* m_pMixChan;

    // 8-channel software mixing (matches ASM MixMove/MixAdd)
    // Per-channel resampler state (persists across ticks)
    struct SoftMixChan {
        uint32_t pos = 0;     // waveform byte position
        uint16_t fracAcc = 0; // fractional accumulator (ch_MixSaveDec2)
        bool ended = true;    // sample ended (ch_MixSmplEnd) — starts true; cleared on first note (ch_Play=1)
        // ASM Play8ch saves ch_WsPointer/ch_WsLength at new-note time into
        // ch_MixWsPointer/ch_MixWsLen. Play8PV reuses these saved values.
        // .wsloop updates them to ch_WsRepPointer/ch_WsRepLength on wrap.
        float* mixWsPtr = nullptr; // saved ch_MixWsPointer
        uint32_t mixWsLen = 0;     // saved ch_MixWsLen (in samples)
    };
    static constexpr int SOFT_MIX_MAX = 4096;
    SoftMixChan m_softMixChan[MAXCHANS] = {};
    float m_softMixBuf[4][2][SOFT_MIX_MAX] = {}; // 4 pair buffers x 2 (double-buffered, matches ASM _DoubleBuf)
    int m_doubleBuf = 0;                         // ASM _DoubleBuf toggle: alternates 0/1 each tick
    int m_mixLength = 0;                         // ASM _MixLength: bytes generated per tick by software mixer
    int m_mixBufPlayPos[4] = {};                 // Paula playback position in pair buffer (persists across ticks)
    bool m_deferMixing = false; // When true, PlayEffects skips PlayDma+UpdateChannel (two-pass 8ch mode)
    void softMixResample(int ch, int mixLen, bool add);
    void finalizeSoftMix(int size);
    void computeMixLength(); // Calculate _MixLength from timing params

    // INFO chunk metadata
    char m_infoTitle[65] = {};
    char m_infoAuthor[65] = {};
    char m_infoDate[17] = {};
    char m_infoDuration[17] = {};
    char m_infoText[5][65] = {};

    // Output rate state
    int m_outputRate = INTERNAL_RATE;
    float m_stereoSeparation = 1.0f; // 0.0 = mono, 1.0 = full stereo

    int m_rbSize = 0;        // ring buffer capacity in smp16 entries
    int m_maxOutputTick = 0; // max output frames per tick at output rate
    smp16* m_ringBuf = nullptr;

  private:
    short* m_Temp = nullptr; // stereo output buffer (one tick at output rate)

#ifdef todisk
    File* m_pFile;
#endif
    s32 m_nPos;
    s16 m_nOld;
    s16 m_nOld2;
};
