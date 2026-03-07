#include "sfx.h"
#include <cstring>

// #include <memory.h>
//  Fixed-point mixing - no legacy float macros needed

CMLineSfx::CMLineSfx(int size, bool echo, bool bStereo) {
    Init(size, echo, bStereo);
    m_bInited = true;
}
void CMLineSfx::Init(int size, bool echo, bool bStereo) {
    m_songSpeed = 0;
    m_fOSurroundL = 0.0f;
    m_fOSurroundR = 0.0f;
    m_fSurround = 0.0f;
    m_nSampleRate = 28150;
    m_nSurroundDeley = int((28150.0 / 1000.0) * 5);
    m_fOctave = 1;
    m_nSample = -1;
    m_pData = nullptr;
    m_pMixBuf = nullptr;
    m_bOwnsMixBuf = false;
    m_nPos = 0;
    m_fAddPos = 0;
    m_nPitch = 1.0f;
    m_nPeriod = 65535; // Match UADE audio_reset default period
    m_fVolume = 0;
    m_fOVolume = 0;
    m_nVolumeInt = 0;
    m_prevVolumeInt = 0xFFFF; // Sentinel: not yet initialized
    m_fPan = 0.5f;
    m_nLoopStart = -1;
    m_nLoopEnd = 0x7fffffff;
    m_nSize = 0;
    m_bNew = false;
    m_bMix = false;
    m_bNewNote = false;
    if (echo) {
        m_nEchoMaxSamples = m_nSampleRate * 2 * 5;
        m_pEcho = new float[m_nEchoMaxSamples];
        memset(m_pEcho, 0, sizeof(float) * m_nEchoMaxSamples);
    } else {
        m_pEcho = 0;
    }
    m_nEchoLen = 0;
    m_nOldEchoLen = 0;
    m_nEchoPos = 0;
    m_nEchoAmp = 0.0f;
    m_nRevAmp = 0.0f;
    m_fPanSize = 1.0f;
    m_bPanUp = true;
    m_nRevSize = 1000;
    m_bOldRev = false;
    m_bRev = false;
    m_SurroundBuff = new float[4096];
    memset(m_SurroundBuff, 0, sizeof(float) * 4096);

    if (size != 0) {
        int mul = 1;
        if (bStereo) {
            mul = 2;
        }
        m_nSize = size * mul;
        m_bNew = true;

        // Allocate float mix buffer
        m_pMixBuf = new float[size * mul];
        m_bOwnsMixBuf = true;
        memset(m_pMixBuf, 0, sizeof(float) * size * mul);
    }
}
CMLineSfx::~CMLineSfx() {
    if (m_bInited) {
        delete[] m_pEcho;
        delete[] m_SurroundBuff;
        if (m_bOwnsMixBuf) {
            delete[] m_pMixBuf;
        }
    }
}
void CMLineSfx::Clear() {
    if (m_bNew) {
        if (m_pMixBuf && m_bOwnsMixBuf) {
            memset(m_pMixBuf, 0, sizeof(float) * m_nSize);
        }
    }
    if (m_pEcho)
        memset(m_pEcho, 0, sizeof(float) * m_nEchoMaxSamples);
    if (m_SurroundBuff)
        memset(m_SurroundBuff, 0, sizeof(float) * 4096);
    m_nSample = -1;
    m_nPos = 0;
    m_fAddPos = 0;
    m_nPitch = 1.0f;
    m_nPeriod = 65535; // Match UADE audio_reset default period
    m_fVolume = 0;
    m_fOVolume = 0;
    m_nVolumeInt = 0;
    m_prevVolumeInt = 0xFFFF; // Sentinel: not yet initialized
    m_fPan = 0.5f;
    //	m_nLoopStart=-1;
    //	m_nLoopEnd=0x7fffffff;
    //	m_nEchoLen=0;
    //	m_nOldEchoLen=0;
    m_nEchoPos = 0;
    m_nEchoAmp = 0.0f;
    m_nRevAmp = 0.0f;
    m_fPanSize = 1.0f;
    m_bPanUp = true;
    m_nRevSize = 1000;
    m_bOldRev = false;
    m_bRev = false;
    m_fOSurroundL = 0.0f;
    m_fOSurroundR = 0.0f;
    m_fSurround = 0.0f;
    m_fOctave = 1;
}
void CMLineSfx::SetReverbLen(unsigned long len) {
    if (len == 0) {
        m_nOldEchoLen = m_nEchoLen;
        m_nEchoLen = 0;
        m_bRev = true;
    } else {
        m_nEchoLen = len;
        m_bRev = true;
    }
}
void CMLineSfx::SetEchoLen(unsigned long len) {
    if (len == 0) {
        m_nOldEchoLen = m_nEchoLen;
        m_nEchoLen = 2;
        m_bOldRev = m_bRev;
        m_bRev = false;
    } else {
        m_nEchoLen = len;
        m_bRev = false;
    }
}

bool CMLineSfx::Mix(CMLineSfx* pSfx) {
    m_songSpeed = pSfx->m_songSpeed;

    // When VoiceOff is set, UpdateChannel() sets m_bMix = false.
    // Skip mixing to avoid adding stale data from the last active tick.
    if (!m_bMix)
        return false;

    // Float mixing: add this channel's mix buffer to destination
    // Source: m_pMixBuf contains mono float samples (sample * volume)
    // Destination: pSfx->m_pMixBuf is stereo interleaved (L, R, L, R...)
    if (!m_pMixBuf || !pSfx->m_pMixBuf) {
        return false;
    }

    // Stereo separation blending:
    // m_fPan = 0.0 -> left channel, m_fPan = 1.0 -> right channel
    // m_fStereoSep: 0.0 = mono, 1.0 = full stereo (hard pan)
    float sep = m_fStereoSep;
    float mainGain = 0.5f + 0.5f * sep;
    float crossGain = 0.5f - 0.5f * sep;
    bool isLeftChannel = (m_fPan < 0.5f);

    for (u32 i = 0; i < m_songSpeed; i++) {
        float sample = m_pMixBuf[i];
        if (isLeftChannel) {
            pSfx->m_pMixBuf[i * 2] += sample * mainGain;
            pSfx->m_pMixBuf[i * 2 + 1] += sample * crossGain;
        } else {
            pSfx->m_pMixBuf[i * 2] += sample * crossGain;
            pSfx->m_pMixBuf[i * 2 + 1] += sample * mainGain;
        }
    }

    return true;
}

bool CMLineSfx::Pan(CMLineSfx* pSfx, int size) {
    // Pan is handled in Mix() via m_fPan hard panning
    return false;
}

bool CMLineSfx::UpdateNormalReleaseEcho(CMLineSfx* pSfx, int size) {
    // Echo effects not supported in fixed-point mode
    return false;
}

bool CMLineSfx::UpdateNormalReleaseReverb(CMLineSfx* pSfx, int size) {
    // Reverb effects not supported in fixed-point mode
    return false;
}

bool CMLineSfx::UpdateNormalAndEcho(CMLineSfx* pSfx, int size) {
    // Echo effects not supported in fixed-point mode
    return false;
}

bool CMLineSfx::UpdateNormalAndReverb(CMLineSfx* pSfx, int size) {
    // Reverb effects not supported in fixed-point mode
    return false;
}

bool CMLineSfx::StoreMix(CMLineSfx* pSfx, int size) {
    if (!m_bMix || m_nSize == 0 || !m_pData || !pSfx->m_pMixBuf)
        return false;

    float* dest = pSfx->m_pMixBuf;
    float vol = (float)pSfx->m_nVolumeInt / 64.0f;

    // Playback rate: period -> step
    // Amiga: sample rate = PAL_CLOCK / period
    // Output rate = pSfx->m_nPitch Hz
    // step = (PAL_CLOCK / outputRate) / period = 3546900 / (outputRate * period)
    // At 28150 Hz: 3546900/28150 = 126.0, so step = 126.0/period (original formula)
    float add = 3546900.0f / (pSfx->m_nPitch * (float)m_nPeriod);

    for (int i = 0; i < size; i++) {
        if (m_nPos >= m_nSize) {
            if (m_nLoopStart >= 0) {
                m_nPos = (u32)m_nLoopStart;
            } else {
                dest[i] = 0.0f;
                continue;
            }
        }
        float fSample = m_pData[m_nPos];
        dest[i] = fSample * vol;

        m_fAddPos += add;
        while (m_fAddPos >= 1.0f) {
            m_fAddPos -= 1.0f;
            m_nPos++;
            if (m_nPos >= m_nSize && m_nLoopStart >= 0) {
                m_nPos = (u32)m_nLoopStart;
            }
        }
    }
    return true;
}

bool CMLineSfx::NormalMix(CMLineSfx* pSfx, int size) {
    if (!m_bMix || m_nSize == 0 || !m_pData || !pSfx->m_pMixBuf)
        return false;

    float* dest = pSfx->m_pMixBuf;
    float vol = (float)pSfx->m_nVolumeInt / 64.0f;

    // Same as StoreMix but += for chord mixing
    float add = 3546900.0f / (pSfx->m_nPitch * (float)m_nPeriod);

    for (int i = 0; i < size; i++) {
        if (m_nPos >= m_nSize) {
            if (m_nLoopStart >= 0) {
                m_nPos = (u32)m_nLoopStart;
            } else {
                continue;
            }
        }
        float fSample = m_pData[m_nPos];
        dest[i] += fSample * vol;

        m_fAddPos += add;
        while (m_fAddPos >= 1.0f) {
            m_fAddPos -= 1.0f;
            m_nPos++;
            if (m_nPos >= m_nSize && m_nLoopStart >= 0) {
                m_nPos = (u32)m_nLoopStart;
            }
        }
    }
    return true;
}

void CMLineSfx::Surround(int len) {
    // Surround effect not supported in fixed-point mode
    // Clear surround buffer to prevent stale data
    if (m_SurroundBuff) {
        memset(m_SurroundBuff, 0, sizeof(float) * (len + m_nSurroundDeley));
    }
}

void CMLineSfx::Save(CMLineSfx* pSrc) {}

void CMLineSfx::SetSampleRate(int rate) {
    if (rate <= 0)
        return;
    m_nSampleRate = rate;
    m_nSurroundDeley = int((rate / 1000.0) * 5); // 5ms delay

    // Reallocate echo buffer if we own it
    if (m_pEcho && m_bInited) {
        delete[] m_pEcho;
        m_nEchoMaxSamples = rate * 2 * 5; // 5 seconds stereo
        m_pEcho = new float[m_nEchoMaxSamples];
        memset(m_pEcho, 0, sizeof(float) * m_nEchoMaxSamples);
        m_nEchoPos = 0;
    }
}
