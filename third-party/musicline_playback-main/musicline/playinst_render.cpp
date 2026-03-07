#include "defines.h"
#include "enums.h"
#include "structs.h"
#include "tables.h"

void CPlayInst::PlayEffects(MLModule* mod) {
    MLModule* p = mod;

    //	Printf(" chn: %ld\n", i);
    Channel* chan = mod->m_ChannelBuf[mod->m_ChannelNum];

    m_WsRepPointer = m_WsRepPtrOrg;
    Pan(mod);
    CMLineSfx* pS = p->m_pMixChord[mod->m_ChannelNum];
    m_Sfx.m_SurroundBuff = pS->m_SurroundBuff;
    m_Sfx.m_pEcho = pS->m_pEcho;
    //	m_Sfx.m_bNewNote=Mixer.m_pMixChord[mod->ChannelNum]->m_bNewNote;
    m_Sfx.m_nSize = pS->m_nSize;
    // Preserve Amiga-style channel panning when copying m_Sfx
    // BUT only if no pattern pan command was used (pfx_Pan sets m_fPan != 0.5)
    float savedPan = pS->m_fPan;
    bool patternPanUsed = (m_Sfx.m_fPan != 0.5f);
    // Preserve mix buffer pointers and stereo sep - they belong to m_pMixChord, not m_Sfx
    float* savedMixBuf = pS->m_pMixBuf;
    bool savedOwnsMixBuf = pS->m_bOwnsMixBuf;
    float savedStereoSep = pS->m_fStereoSep;
    *p->m_pMixChord[mod->m_ChannelNum] = m_Sfx;
    p->m_pMixChord[mod->m_ChannelNum]->m_pMixBuf = savedMixBuf;
    p->m_pMixChord[mod->m_ChannelNum]->m_bOwnsMixBuf = savedOwnsMixBuf;
    p->m_pMixChord[mod->m_ChannelNum]->m_fStereoSep = savedStereoSep;
    if (!patternPanUsed) {
        p->m_pMixChord[mod->m_ChannelNum]->m_fPan = savedPan;
    }

    if ((m_Play & (1 << 0)) == 0) {
        if (!mod->m_debugFlags.disableSlides) {
            SlideVol(mod);
            SlideChannelVol(mod);
            SlideMasterVol(mod);
            SlideArpVol(mod);
            SlideNote(mod);
            SlideArpNote(mod);
        }
        if (!mod->m_debugFlags.disableArpeggio) {
            ArpeggioPlay(mod);
        }
        if (!mod->m_debugFlags.disableVibrato) {
            VibratoPlay(mod);
        }
        if (!mod->m_debugFlags.disableTremolo) {
            TremoloPlay(mod);
        }
    }
    PerCalc();

    if (!mod->m_debugFlags.disableADSR) {
        ADSRPlay(mod);
    }

    MoveLoop(mod);
    TransformPlay(mod);
    PhasePlay(mod);
    MixPlay(mod);
    // ASM order: Apply resonance/filter to waveform BEFORE mixing
    // These modify WsRepPointer to point to filtered data
    if (!mod->m_debugFlags.disableResonance) {
        ResonancePlay(mod);
    }
    if (!mod->m_debugFlags.disableFilter) {
        FilterPlay(mod);
    }

    // Track whether any effect modified the waveform
    bool effectModifiedWaveform = (m_WsRepPointer != m_WsRepPtrOrg);

    // Save effectModifiedWaveform for deferred pass 2
    m_effectModifiedWaveform = effectModifiedWaveform;

    // In 8-channel two-pass mode, defer PlayDma + UpdateChannel + post-processing
    // to pass 2 (PlayDmaAndMix) so all channels' effects complete first.
    if (mod->m_deferMixing)
        return;

    if (mod->m_bPlay) {
        // With FixWaveLength in channel.cpp, the correct octave waveform is already selected
        // No need for playback speed multiplier - always use 1
        m_pSfx->m_fOctave = 1;
        p->m_pMixChord[mod->m_ChannelNum]->m_fOctave = 1;
        PlayDma(mod);

        // After effects modify WsRepPointer, update VU pointers so
        // UpdateChannel/mixer picks up effect data directly as float.
        if (effectModifiedWaveform) {
            m_VUWsPointer = m_WsRepPointer;
            m_VUWsRepPointer = m_WsRepPointer;
            m_VUWsLength = m_WsRepLength << 1;
            m_VUWsRepLength = m_WsRepLength << 1;
        }

        p->UpdateChannel();
    }
    {
        if ((m_Play & (1 << 0)) == 0) {
            if (m_Effects[inst_LOOP]) {
                m_WsRepLength = m_LooLength;
            }
        }

        if (m_ArpWait == 0) {
            m_PartNote = 0;
        }
        //	m_pMixChord[i]->Mix(m_pMixChan,size);
        // 8-channel mode: Mix is handled in PlaySongEffects after finalizeSoftMix
        if (mod->m_PlayMode == 0) {
            p->m_pMixChan->m_songSpeed = (u32)p->GetSongSpeed();
            p->m_pMixChord[mod->m_ChannelNum]->Mix(p->m_pMixChan);
        }
    }
    // ASM always copies back — PlayEffects doesn't gate this on VoiceOff.
    // Without this, stale m_Sfx volume overwrites m_pMixChord every tick
    // at line 27, preventing ADSR fade from reaching vol=0 after VoiceOff.
    m_Sfx = *p->m_pMixChord[mod->m_ChannelNum];

    // ASM .loopplay (MusiclineEditor.asm:4161-4172):
    // On non-note ticks when LOOP is active, write the MoveLoop-updated
    // WsRepPointer to Paula AUDxLC/AUDxLEN. The Amiga hardware latches
    // these values — they take effect at the next DMA buffer reload, not
    // immediately. By updating VU pointers AFTER Mix(), the change takes
    // effect on the next tick, approximating the Amiga's latched behavior.
    if ((m_Play & (1 << 0)) == 0 && m_Effects[inst_LOOP]) {
        long cnt = m_LooCounterSave;
        int loopStart = cnt << 1;       // samples offset from base
        int loopLen = m_LooLength << 1; // samples in repeat region
        m_VUWsRepPointer = m_LooWsPointer + loopStart;
        m_VUWsRepLength = loopLen;
        m_VUWsPointer = m_LooWsPointer;
        m_VUWsLength = loopStart + loopLen; // m_nSize = end of loop region
    }

    m_Play &= 1;
}

// Deferred pass 2 for 8-channel two-pass mode: runs PlayDma + effect waveform + UpdateChannel
// plus the post-processing that was skipped when PlayEffects returned early (loop update,
// PartNote clear, m_Sfx copy-back, .loopplay VU pointer update, Play mask).
void CPlayInst::PlayDmaAndMix(MLModule* mod) {
    MLModule* p = mod;

    if (mod->m_bPlay) {
        m_pSfx->m_fOctave = 1;
        p->m_pMixChord[mod->m_ChannelNum]->m_fOctave = 1;

        PlayDma(mod);

        if (m_effectModifiedWaveform) {
            m_VUWsPointer = m_WsRepPointer;
            m_VUWsRepPointer = m_WsRepPointer;
            m_VUWsLength = m_WsRepLength << 1;
            m_VUWsRepLength = m_WsRepLength << 1;
        }

        p->UpdateChannel();
    }

    // Post-processing that was skipped in pass 1's early return
    {
        if ((m_Play & (1 << 0)) == 0) {
            if (m_Effects[inst_LOOP]) {
                m_WsRepLength = m_LooLength;
            }
        }

        if (m_ArpWait == 0) {
            m_PartNote = 0;
        }
    }

    // m_Sfx copy-back (must happen after PlayDma sets volume in m_pMixChord)
    m_Sfx = *p->m_pMixChord[mod->m_ChannelNum];

    // .loopplay VU pointer update
    if ((m_Play & (1 << 0)) == 0 && m_Effects[inst_LOOP]) {
        long cnt = m_LooCounterSave;
        int loopStart = cnt << 1;
        int loopLen = m_LooLength << 1;
        m_VUWsRepPointer = m_LooWsPointer + loopStart;
        m_VUWsRepLength = loopLen;
        m_VUWsPointer = m_LooWsPointer;
        m_VUWsLength = loopStart + loopLen;
    }

    m_Play &= 1;
}

void CPlayInst::PlayDma(MLModule* data) {
    MLModule* p = data;

    float* samp;
    unsigned short len;

    Channel* chan = data->m_ChannelBuf[data->m_ChannelNum];

    // ASM: PerVolPlay skips volume write when ch_Play bit 0 is SET (Mline116.asm:11449-11450)
    // Save the state BEFORE clearing it, for use in volume calculation later
    bool newNoteTrigger = (m_Play & (1 << 0)) != 0;

    // Save Play bit 0 state for UpdateChannel's DMA restart check
    m_PlayBit0WasSet = (m_Play & (1 << 0)) != 0;

    if ((m_Play & (1 << 0)) != 0) {
        m_Play &= ~(1 << 0);

        //	Printf(" wslen: %lx\n", WsLength);

        samp = m_WsPointer;
        len = m_WsLength;

        // ASM Dma1 (Mline116.asm:3648-3670):
        // When Play bit 0 is set, Dma1 unconditionally writes ch_WsPointer to
        // both ch_VUWsPointer and the Paula AUDxLC register. This happens
        // regardless of whether DmaPlay included this channel in the DMA restart.
        // So VU pointer updates happen whenever Play bit 0 is set.
        {
            m_VUWsPointer = samp;
            m_VUWsLength = len << 1;
        }

        // Mline116.asm:10306-10312 - WSLOOP check is handled in channel.cpp
        // channel.cpp sets WsRepPointer/WsRepLength based on WSLOOP flag:
        //   - WSLOOP=1: WsRepPointer=smpl_RepPointer, WsRepLength=smpl_RepLength
        //   - WSLOOP=0: WsRepPointer=ZeroSample, WsRepLength=1
        // For waveforms (WaveOrSample 1-5), channel.cpp sets repeat = waveform
        // We just need to copy these values to VU* for the mixer
        if (m_WaveOrSample < 6) {
            m_VUWsRepPointer = m_WsRepPointer;
            m_VUWsRepLength = m_WsRepLength << 1; // Convert words to samples
        }

        //			VUWsRepPointer = samp;
        //			VUWsRepLength = len;

        //			nRepeatStart = samp;
        //			nRepeatLength = len;
        //			nChanged |= NCHF_Repeat;
        /*
        Mixer.m_pChannel[i]->m_nSize=VUWsLength;
        if(Mixer.m_pChannel[i]->m_nSize==0)
            int j=0;
        Mixer.m_pChannel[i]->m_nLoopEnd=VUWsLength;
        if(VUWsRepLength==2)
            Mixer.m_pChannel[i]->m_nLoopStart=-1;
        else
            Mixer.m_pChannel[i]->m_nLoopStart=VUWsRepPointer-VUWsPointer;
        */

        // WsNumberOld update moved to UpdateChannel() for DMA restart check
        // (matches ASM DmaPlay: Mline116.asm:11594 — update after comparison)
    }

    m_VUPeriod = m_Period2;
    int i = data->m_ChannelNum * 16 + chan->m_InstNum * 4;
    int j = data->m_ChannelNum;
    constexpr float PAL_CLOCK = 3546895.0f;

    // ASM period/volume writes:
    // - Non-note ticks: PerVolPlay writes period/volume (ch_Play bit 0 is clear)
    // - New note ticks: PerVolPlay SKIPS (bit 0 set), but Dma1 (CIA timer handler,
    //   Mline116.asm:3671-3776) clears bit 0 and writes period/volume/pointers
    // Net effect: period and volume are written on EVERY tick, just via different paths.
    if (m_VUPeriod) {
        p->m_pChannel[i]->m_nPitch = PAL_CLOCK / m_VUPeriod;
        p->m_pChannel[i]->m_nPeriod = m_VUPeriod;
    } else {
        p->m_pChannel[i]->m_nPitch = 1.0f;
        p->m_pChannel[i]->m_nPeriod = 0;
    }

    if (m_Chord_Period1) {
        p->m_pChannel[i + 1]->m_nPitch = PAL_CLOCK / m_Chord_Period1;
        p->m_pChannel[i + 1]->m_nPeriod = m_Chord_Period1;
    } else {
        p->m_pChannel[i + 1]->m_nPitch = 1.0f;
        p->m_pChannel[i + 1]->m_nPeriod = 0;
    }
    if (m_Chord_Period2) {
        p->m_pChannel[i + 2]->m_nPitch = PAL_CLOCK / m_Chord_Period2;
        p->m_pChannel[i + 2]->m_nPeriod = m_Chord_Period2;
    } else {
        p->m_pChannel[i + 2]->m_nPitch = 1.0f;
        p->m_pChannel[i + 2]->m_nPeriod = 0;
    }
    if (m_Chord_Period3) {
        p->m_pChannel[i + 3]->m_nPitch = PAL_CLOCK / m_Chord_Period3;
        p->m_pChannel[i + 3]->m_nPeriod = m_Chord_Period3;
    } else {
        p->m_pChannel[i + 3]->m_nPitch = 1.0f;
        p->m_pChannel[i + 3]->m_nPeriod = 0;
    }

    // ASM PerVolPlay (Mline116.asm:3444-3445): skips BOTH period and volume writes
    // when ch_Play bit 0 is set (new note tick). Volume stays at previous tick's value.
    // DmaPlay (called AFTER PerVolPlay in ASM, but BEFORE vol comp in C++) clears bit 0.
    // So we must skip vol computation on new-note ticks to match ASM timing.
    if (newNoteTrigger) {
        // ASM: PerVolPlay skips on new-note ticks (ch_Play bit 0 set), but Dma1
        // (CIA timer handler, MusiclineEditor.asm:3718-3730) fires between ticks,
        // clears bit 0, and writes volume computed from the newly initialized
        // instrument's Volume3. Match Dma1's behavior here.
        u16 prev = p->m_pMixChord[j]->m_nVolumeInt;
        if (chan->m_ChannelOff == 0) {
            unsigned short vol;
            if (data->m_debugFlags.disableVolumeCalc) {
                vol = static_cast<unsigned short>(data->m_debugFlags.fixedVolume);
            } else {
                vol = (((m_Volume3 * m_CVolume) >> 10) * data->m_MasterVol) >> 14;
            }

            m_VUVolume = vol;
            float specVol = data->m_debugFlags.disableSpecialVolume ? 1.0f : m_SpecialVolume;
            float finalVol = float(m_VUVolume) * specVol;
            p->m_pMixChord[j]->m_fVolume = finalVol;
            u16 newVol = (vol > 63) ? 63 : vol;
            // prevVolumeInt = old value for split-tick audio (audio uses old vol
            // until Dma1 fires mid-tick, then switches to new vol)
            p->m_pMixChord[j]->m_prevVolumeInt = (prev == 0xFFFF) ? 0 : prev;
            p->m_pMixChord[j]->m_nVolumeInt = newVol;
        } else {
            p->m_pMixChord[j]->m_prevVolumeInt = (prev == 0xFFFF) ? 0 : prev;
        }
    } else if (chan->m_ChannelOff == 0) {
        unsigned short vol;

        if (data->m_debugFlags.disableVolumeCalc) {
            vol = static_cast<unsigned short>(data->m_debugFlags.fixedVolume);
        } else {
            vol = (((m_Volume3 * m_CVolume) >> 10) * data->m_MasterVol) >> 14;
        }

        m_VUVolume = vol;
        float specVol = data->m_debugFlags.disableSpecialVolume ? 1.0f : m_SpecialVolume;
        float finalVol = float(m_VUVolume) * specVol;
        p->m_pMixChord[j]->m_fVolume = finalVol;
        // Save previous volume before setting new one.
        // In UADE, the CIA fires and the player code takes ~7 output samples
        // worth of CPU cycles before the AUDxVOL write for channel 0.
        // During those samples, audio uses the previous tick's volume.
        u16 newVol = (vol > 63) ? 63 : vol;
        u16 prev = p->m_pMixChord[j]->m_nVolumeInt;
        // On first volume set (sentinel 0xFFFF), use new volume as "previous"
        // to avoid a spurious transition from 0→vol during initialization
        p->m_pMixChord[j]->m_prevVolumeInt = (prev == 0xFFFF) ? newVol : prev;
        p->m_pMixChord[j]->m_nVolumeInt = newVol;
    } else {

        u16 prev = p->m_pMixChord[j]->m_nVolumeInt;
        p->m_pMixChord[j]->m_prevVolumeInt = (prev == 0xFFFF) ? 0 : prev;
        p->m_pMixChord[j]->m_fVolume = 0;
        p->m_pMixChord[j]->m_nVolumeInt = 0;
    }
}

void CPlayInst::PerCalc() {
    short nte;
    short per;

    nte = m_Note;
    nte += m_VibNote;
    nte += m_PchSldNote;
    nte += m_ArpPchSldNote;
    nte += m_SemiTone;
    nte += m_FineTune;
    nte += m_PchAdd;

    if ((m_Arp & (1 << 5)) == 0) {
        if (m_Transpose != 0) // �berfl�ssig...
        {
            nte += m_Transpose;
        }
    }

    if (nte < -32) {
        nte = -32;
    } else if (nte > (5 * 12 * 32)) {
        nte = 5 * 12 * 32; // ASM uses 5*12*32=1920, not 6*12*32
    }

    per = PalPitchTable[nte];
    per += m_PTPchSldNote;
    per += m_PTVibNote;
    per += m_PTPchAdd;

    if (per < 106) {
        per = 106; // ASM uses 106 as minimum, not 64
    } else if (per > 3591) {
        per = 3591;
    }

    m_Period1 = per;
    m_Period2 = per;
}
