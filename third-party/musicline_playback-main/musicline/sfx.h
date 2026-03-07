#pragma once

#include "math.h"
#include "types.h"

class CEcho;
class CMLMixer;
class CMLineSfx {
  public:
    CMLineSfx() {
        m_bInited = false;
        m_fSurround = 0.0f;
        m_SurroundBuff = nullptr;
        m_pEcho = nullptr;
        m_oldPanL = sin(0.f);
        m_oldPanL = cos(0.f);
    }
    CMLineSfx(int size, bool echo = false, bool bStereo = false);

    // Copy assignment - copies values but does NOT transfer buffer ownership
    CMLineSfx& operator=(const CMLineSfx& other) {
        if (this != &other) {
            // Copy all value fields
            m_songSpeed = other.m_songSpeed;
            m_oldPanL = other.m_oldPanL;
            m_oldPanR = other.m_oldPanR;
            m_nType = other.m_nType;
            m_fAddPos = other.m_fAddPos;
            m_bNew = other.m_bNew;
            m_nSample = other.m_nSample;
            m_fVolume = other.m_fVolume;
            m_fOVolume = other.m_fOVolume;
            m_nVolumeInt = other.m_nVolumeInt;
            m_prevVolumeInt = other.m_prevVolumeInt;
            m_fPan = other.m_fPan;
            m_bPanUp = other.m_bPanUp;
            m_fPanSize = other.m_fPanSize;
            m_nPos = other.m_nPos;
            m_nPitch = other.m_nPitch;
            m_nPeriod = other.m_nPeriod;
            m_nLoopStart = other.m_nLoopStart;
            m_nLoopEnd = other.m_nLoopEnd;
            m_nSize = other.m_nSize;
            m_bMix = other.m_bMix;
            m_bNewNote = other.m_bNewNote;
            m_bRev = other.m_bRev;
            m_bOldRev = other.m_bOldRev;
            m_nEchoLen = other.m_nEchoLen;
            m_nOldEchoLen = other.m_nOldEchoLen;
            m_nEchoPos = other.m_nEchoPos;
            m_nEchoAmp = other.m_nEchoAmp;
            m_nRevAmp = other.m_nRevAmp;
            m_nRevSize = other.m_nRevSize;
            m_fOctave = other.m_fOctave;
            m_fSurround = other.m_fSurround;
            m_nSurroundDeley = other.m_nSurroundDeley;
            // NOTE: m_fStereoSep intentionally NOT copied — it belongs to
            // m_pMixChord and is saved/restored in playinst_render.cpp
            m_fOSurroundL = other.m_fOSurroundL;
            m_fOSurroundR = other.m_fOSurroundR;

            // Copy pointers (shared, not owned by this copy)
            m_pData = other.m_pData;
            m_pMixBuf = other.m_pMixBuf;
            m_bOwnsMixBuf = false; // Copy doesn't own the buffer
            m_pEcho = other.m_pEcho;
            m_SurroundBuff = other.m_SurroundBuff;

            // Mark as NOT initialized to prevent double-free
            // The original owner keeps m_bInited=true
            m_bInited = false;
        }
        return *this;
    }
    void Init(int size, bool echo, bool bStereo);
    void Clear(void);
    ~CMLineSfx();
    bool Pan(CMLineSfx* pSfx, int size);

    bool Mix(CMLineSfx* pSfx);
    bool StoreMix(CMLineSfx* pSfx, int size);
    bool NormalMix(CMLineSfx* pSfx, int size);
    bool UpdateNormalReleaseEcho(CMLineSfx* pSfx, int size);
    bool UpdateNormalReleaseReverb(CMLineSfx* pSfx, int size);
    bool UpdateNormalAndEcho(CMLineSfx* pSfx, int size);
    bool UpdateNormalAndReverb(CMLineSfx* pSfx, int size);
    void DoMix() {
        m_bMix = true;
    }
    void SetEchoLen(unsigned long len);
    void SetReverbLen(unsigned long len);
    void SetReverbSize(unsigned long size) {
        m_nRevSize = size * 2;
    }
    void Surround(int len);
    void Save(CMLineSfx* pSrc);
    void SetSampleRate(int rate); // Update rate-dependent buffers (echo, surround delay)

    u32 m_songSpeed;

    float m_oldPanL;
    float m_oldPanR;

    int m_nType;
    float m_fAddPos;
    bool m_bNew;
    int m_nSample;

    float* m_pData;           // Waveform data (float, -1.0..1.0)
    float* m_pMixBuf;         // Float mix buffer (sample * vol, allocated for destination channels)
    bool m_bOwnsMixBuf;       // true if this object owns m_pMixBuf
    float m_fVolume;          // volume
    float m_fOVolume;         // volume
    u16 m_nVolumeInt;         // Integer volume (0-64 range for ASM compatibility)
    u16 m_prevVolumeInt;      // Previous tick's volume (for intra-tick volume transition)
    float m_fPan;             // pan
    bool m_bPanUp;            // if sliding upwards
    float m_fPanSize;         // if sliding upwards
    unsigned long m_nPos;     // position (sample index)
    float m_nPitch;           // pitch (float for precision to match ASM)
    uint16_t m_nPeriod;       // Paula period value for exact ASM MixAdd calculation
    long m_nLoopStart;        //
    unsigned long m_nLoopEnd; //
    unsigned long m_nSize;    //

    bool m_bMix;
    bool m_bNewNote;
    bool m_bRev;
    bool m_bOldRev;
    float* m_pEcho;
    unsigned long m_nEchoLen;
    unsigned long m_nOldEchoLen;
    unsigned long m_nEchoPos;

    float m_nEchoAmp;
    float m_nRevAmp;
    unsigned long m_nRevSize;
    bool m_bInited;
    int m_fOctave;
    float m_fSurround;
    int m_nSurroundDeley;
    float m_fOSurroundL;
    float m_fOSurroundR;
    float* m_SurroundBuff;
    float m_fStereoSep = 1.0f; // Stereo separation: 0.0 = mono, 1.0 = full stereo
    int m_nSampleRate = 28150;
    int m_nEchoMaxSamples = 0;
};
