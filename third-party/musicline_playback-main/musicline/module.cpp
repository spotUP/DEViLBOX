#include "file.h"
#include "musicline.h"
#include "sfx.h"
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <math.h>
#include <string.h>

// #include "sound.h"

// #define todisk

// #include <windows.h>
// #include "stdafx.h"

MLModule::MLModule() {
    int i = 0;
    for (i = 0; i < 256; i++) {
        m_TuneList[i] = 0;
    }
    for (i = 0; i < 1024; i++) {
        m_PartList[i] = 0;
    }

    for (i = 0; i < 256; i++) {
        m_ArpgList[i] = 0;
    }
    for (i = 0; i < 256; i++) {
        m_InstList[i] = 0;
    }
    for (i = 0; i < 256; i++) {
        m_SmplList[i] = 0;
    }

    for (int i = 0; i < MAXCHANS; ++i) {
        m_ChannelBuf[i] = new Channel;
    }

    for (i = 0; i < MAXCHANS; i++) {
        m_pChannel[i] = new CMLineSfx(0);
        m_pChannel[i]->m_nSize = 0;
    }
    for (i = MAXCHANS; i < MAXCHANS * 4 * 4; i++) {
        m_pChannel[i] = new CMLineSfx(0, false);
    }
    for (i = 0; i < MAXCHANS; i++) {
        m_pMixChord[i] = new CMLineSfx(4096, true);
        m_pMixChord[i]->m_fVolume = 1.0;
        m_pMixChord[i]->m_fOVolume = 1.0;
        m_pMixChord[i]->m_nPitch = (float)m_outputRate;
        // Amiga-style hard panning: channels 0,3 = left, 1,2 = right
        int ch = i % 4;
        m_pMixChord[i]->m_fPan = (ch == 0 || ch == 3) ? 0.0f : 1.0f;
    }
    m_pMixChan = new CMLineSfx(8192);
    m_pMixChan->m_fVolume = 1.0;
    m_pMixChan->m_fOVolume = 1.0; // Prevent first-frame volume interpolation

//	m_pMixChan->m_fSurround=1.0f;
#ifdef todisk
    m_pFile = new File("debug.raw", "wb");
#endif
    m_nPos = 0;
    m_fSamplesPerTick = 0;
    m_fTickAccum = 0;
    m_nCurrentTickSize = 0;
    m_fCurrent = 0;
    m_nTickCount = 0;
    m_Read = 0;
    m_Write = 0;
    SetSongSpeed(120);
    m_f1.mute = false;
    m_f1.frame = 0;

    m_TuneNum = 0;
    m_PartNum = 0;
    m_ArpgNum = 0;
    m_InstNum = 0;
    m_SmplNum = 0;
    m_PartList[1024] = new Part;
    m_PartList[1024]->Data[0].Note = 0;
    m_PartList[1024]->Data[1].Note = 127;
    m_nSingleChannel = -1;
    m_nValidSingleChannel = -1;
    m_nPattern = -1;

    // Allocate default buffers for internal rate
    m_outputRate = INTERNAL_RATE;
    m_maxOutputTick = MAX_INTERNAL_TICK;
    m_rbSize = MAX_INTERNAL_TICK * 3;
    m_ringBuf = new smp16[m_rbSize]();
    m_Temp = new short[MAX_INTERNAL_TICK * 2]();
}

MLModule::~MLModule() {
    FreeMod();

    int i;
    for (i = 0; i < (MAXCHANS * 4 * 4); i++) {
        delete m_pChannel[i];
    }
    for (i = 0; i < (MAXCHANS); i++) {
        delete m_pMixChord[i];
    }
    delete m_pMixChan;
#ifdef todisk
    delete m_pFile;
#endif

    delete m_PartList[1024];

    delete[] m_ringBuf;
    delete[] m_Temp;

    // Free persistent channel state (only here, NOT in FreeMod — see FreeMod comment).
    for (int i = 0; i < MAXCHANS; ++i) {
        delete m_ChannelBuf[i];
        m_ChannelBuf[i] = nullptr;
    }
}

void MLModule::SetSongSpeed(int bpm) {
    // ASM: TimerValue1 / TuneTmp gives CIA timer reload value
    //
    // NOTE: UADE's Musicline player binary detects NTSC mode because UADE's
    // fake GfxBase doesn't set bit 2 at offset 206 (PAL flag). So the player
    // uses NTSC timing values. We must match this to stay in sync with UADE.
    //
    // NTSC: TimerValue1 = 1789773, TimerValue3 = 715909
    // PAL:  TimerValue1 = 1773448, TimerValue3 = 709379
    //
    // For tempo 125:
    //   NTSC: 1789773/125 = 14318 CIA timer latch
    //   PAL:  1773448/125 = 14187 CIA timer latch
    //
    // The formula:
    // CIA timer latch = TimerValue1 / bpm (integer division)
    // Ticks per second = TimerValue3 / CIA_timer_latch
    // Samples per tick = OUTPUT_RATE / (ticks_per_second)
    double OUTPUT_RATE = (double)m_outputRate;
    if (bpm > 0) {
        // UADE uses NTSC timing due to GfxBase bug (see 37s_work_log.md Entry 15-16)
        constexpr int32_t TIMER_VALUE_1 = 1789773; // NTSC
        constexpr double TIMER_VALUE_3 = 715909.0; // NTSC

        // Calculate CIA timer latch using integer division (matches 68000 divu)
        int32_t cia_timer_latch = TIMER_VALUE_1 / bpm;

        // Calculate samples per tick
        double ticks_per_sec = TIMER_VALUE_3 / (double)cia_timer_latch;
        m_fSamplesPerTick = OUTPUT_RATE / ticks_per_sec;
        // Set initial tick size for any code that queries before the output loop runs
        if (m_nCurrentTickSize == 0) {
            m_nCurrentTickSize = (u32)m_fSamplesPerTick;
        }
    }
}

void MLModule::SetStereoSeparation(float sep) {
    if (sep < 0.0f)
        sep = 0.0f;
    if (sep > 1.0f)
        sep = 1.0f;
    m_stereoSeparation = sep;
    for (int i = 0; i < MAXCHANS; i++)
        m_pMixChord[i]->m_fStereoSep = sep;
}

void MLModule::SetOutputRate(int rate) {
    if (rate <= 0)
        rate = INTERNAL_RATE;
    m_outputRate = rate;

    // Compute max tick size at this output rate.
    // Scale from internal rate's max tick, with headroom.
    m_maxOutputTick = (int)ceil(MAX_INTERNAL_TICK * (double)rate / INTERNAL_RATE) + 16;
    m_rbSize = m_maxOutputTick * 3;

    // Reallocate buffers
    delete[] m_ringBuf;
    delete[] m_Temp;
    m_ringBuf = new smp16[m_rbSize]();
    m_Temp = new short[m_maxOutputTick * 2]();

    // Set mixer pitch and sample rate on all channels
    for (int i = 0; i < MAXCHANS; i++) {
        m_pMixChord[i]->m_nPitch = (float)rate;
        m_pMixChord[i]->SetSampleRate(rate);
    }
    m_pMixChan->SetSampleRate(rate);

    // Reset ring buffer pointers
    m_Read = 0;
    m_Write = 0;

    // Recompute tick size at new output rate
    SetSongSpeed(m_TuneTmp);
}

/*****************************************************************************
 * Load Mline module                              * Conny Cyréus - Musicline *
 *****************************************************************************/

// Helper to check if 4 bytes form a valid chunk ID
static bool isValidChunkId(u8* p) {
    u32 id = (p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3];
    switch (id) {
        case 0x4D4F444C: // MODL
        case 0x56455253: // VERS
        case 0x54554E45: // TUNE
        case 0x50415254: // PART
        case 0x41525047: // ARPG
        case 0x494E5354: // INST
        case 0x534D504C: // SMPL
        case 0x494E464F: // INFO
            return true;
        default:
            return false;
    }
}

bool MLModule::LoadMod(u8* mod, u32 len) {
    unsigned char chunkid[4];
    unsigned char chunklen[4];
    int i, j;

    if ((mod != NULL) && (len >= 4) && (memcmp(mod, "MLED", 4) == 0)) {
        mod += 4;
        len -= 4;

        while (1) {
            if (len >= 4) {
                // Some ML files have incorrect chunk lengths. If we're not at a valid
                // chunk ID, scan forward to find the next one.
                while (len >= 4 && !isValidChunkId(mod)) {
                    mod++;
                    len--;
                }
                if (len < 4)
                    break;

                memcpy(&chunkid[0], mod, 4);

                mod += 4;
                len -= 4;
            } else {
                break; // end of file reached
            }

            switch (GetBELong(&chunkid[0])) {
                case 0x4D4F444C: // MODL
                {
                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);
                    } else {
                        return false; // error
                    }

                    if (memcmp(&chunklen[0], "VERS", 4) != 0) {
                        mod += 4;
                        len -= 4;

                        if (len >= GetBELong(&chunklen[0])) {
                            mod += GetBELong(&chunklen[0]);
                            len -= GetBELong(&chunklen[0]);
                        } else {
                            return false; // error
                        }
                    }

                    break;
                }

                case 0x56455253: // VERS
                {
                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);

                        mod += 4;
                        len -= 4;
                    } else {
                        return false; // error
                    }

                    if (len >= GetBELong(&chunklen[0])) {
                        mod += GetBELong(&chunklen[0]);
                        len -= GetBELong(&chunklen[0]);
                    } else {
                        return false; // error
                    }

                    break;
                }

                case 0x54554E45: // TUNE
                {
                    struct Tune* tune;
                    struct Chnl* chnl;
                    unsigned char* ptr;

                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);

                        // Note: there is a bug in the MLine TUNE saver
                        // some old modules have an incorrect chunk length

                        mod += 4;
                        len -= 4;
                    } else {
                        return false; // error
                    }

                    tune = new Tune;

                    if (tune != NULL) {
                        m_TuneList[m_TuneNum] = tune;
                    } else {
                        return false; // error
                    }

                    if (len >= tune_LOADSIZE) {
                        memcpy(&tune->Title[0], mod + tune_Title, 32);
                        tune->Tempo = GetBEWord(mod + tune_Tempo);
                        tune->Speed = GetBEByte(mod + tune_Speed);
                        tune->Groove = GetBEByte(mod + tune_Groove);
                        tune->Volume = GetBEWord(mod + tune_Volume);
                        tune->PlayMode = GetBEByte(mod + tune_PlayMode);
                        tune->Channels = GetBEByte(mod + tune_Channels);

                        mod += tune_LOADSIZE;
                        len -= tune_LOADSIZE;
                    } else {
                        return false; // error
                    }

                    if (len >= ((unsigned long)(tune->Channels * 4))) {
                        ptr = mod;

                        mod += (tune->Channels * 4);
                        len -= (tune->Channels * 4);
                    } else {
                        return false; // error
                    }

                    for (i = 0; i < MAXCHANS; i++) {
                        tune->ChPtrs[i] = 0;
                    }

                    for (i = 0; i < tune->Channels; i++) {
                        if (GetBELong(ptr + i * 4) != 0) {
                            chnl = new Chnl;

                            if (chnl != NULL) {
                                tune->ChPtrs[i] = chnl;
                            } else {
                                return false; // error
                            }

                            for (j = 0; j < 256; j++) {
                                chnl->Data[j].Fx = 0x0010;
                            }

                            if (len >= GetBELong(ptr + i * 4)) {
                                int nwords = (int)GetBELong(ptr + i * 4) / 2;
                                for (j = 0; j < nwords; j++) {
                                    chnl->Data[j].Fx = GetBEWord(mod + j * 2);
                                }

                                mod += GetBELong(ptr + i * 4);
                                len -= GetBELong(ptr + i * 4);
                            } else {
                                return false; // error
                            }
                        }
                    }
                    // Allocate empty ChPtrs for unused slots (safety)
                    for (; i < MAXCHANS; i++) {
                        if (!tune->ChPtrs[i]) {
                            chnl = new Chnl;
                            if (chnl != NULL) {
                                tune->ChPtrs[i] = chnl;
                                for (j = 0; j < 256; j++) {
                                    chnl->Data[j].Fx = 0x0010;
                                }
                            } else {
                                return false;
                            }
                        }
                    }

                    m_TuneNum += 1;

                    break;
                }

                case 0x50415254: // PART
                {
                    struct Part* part;
                    unsigned short partnum;
                    unsigned char partpak;
                    unsigned char* ptr;

                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);

                        mod += 4;
                        len -= 4;
                    } else {
                        return false; // error
                    }

                    if (len >= GetBELong(&chunklen[0])) {
                        ptr = mod;

                        partnum = GetBEWord(ptr);

                        ptr += 2;

                        part = new Part;

                        if (part != NULL) {
                            m_PartList[partnum] = part;
                        } else {
                            return false; // error
                        }

                        for (i = 0; i < 128; i++) {
                            part->Data[i].Note = 0;
                            part->Data[i].Inst = 0;
                            for (j = 0; j < 5; j++)
                                part->Data[i].Fx[j] = 0;
                        }
                        for (i = 0; i < 128; i++) {
                            partpak = GetBEByte(ptr);

                            ptr += 1;

                            if ((partpak & 0x80) != 0) {
                                break;
                            }

                            if ((partpak & (1 << 0)) != 0) {
                                part->Data[i].Note = GetBEByte(ptr + 0);
                                part->Data[i].Inst = GetBEByte(ptr + 1);

                                if (part->Data[i].Note == 61)
                                    part->Data[i].Note = 127;
                                ptr += 2;
                            }

                            for (j = 0; j < 5; j++) {
                                if ((partpak & (2 << j)) != 0) {
                                    part->Data[i].Fx[j] = GetBEWord(ptr);

                                    ptr += 2;
                                }
                            }
                        }

                        // Note: Some ML files have incorrect PART chunk lengths (too large).
                        // The ASM player uses actual consumed bytes, not declared length.
                        // Use the actual consumed bytes for robust loading.
                        u32 actual_len = (u32)(ptr - mod);
                        mod += actual_len;
                        len -= actual_len;
                    } else {
                        return false; // error
                    }

                    m_PartNum += 1;

                    break;
                }

                case 0x41525047: // ARPG
                {
                    struct Arpg* arpg;
                    unsigned short arpnum;
                    unsigned char* ptr;

                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);

                        mod += 4;
                        len -= 4;
                    } else {
                        return false; // error
                    }

                    if (len >= GetBELong(&chunklen[0])) {
                        ptr = mod;

                        arpnum = GetBEWord(ptr);

                        ptr += 2;

                        arpg = new Arpg;

                        if (arpg != NULL) {
                            m_ArpgList[arpnum] = arpg;
                        } else {
                            return false; // error
                        }

                        for (i = 0; i < ((((int)GetBELong(&chunklen[0])) - 2) / 6); i++) {
                            arpg->Data[i].Note = GetBEByte(ptr + 0);
                            arpg->Data[i].Smpl = GetBEByte(ptr + 1);

                            ptr += 2;

                            for (j = 0; j < 2; j++) {
                                arpg->Data[i].Fx[j] = GetBEWord(ptr);

                                ptr += 2;
                            }
                        }

                        mod += GetBELong(&chunklen[0]);
                        len -= GetBELong(&chunklen[0]);
                    } else {
                        return false; // error
                    }

                    m_ArpgNum += 1;

                    break;
                }

                case 0x494E5354: // INST
                {
                    struct Inst* inst;

                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);

                        mod += 4;
                        len -= 4;
                    } else {
                        return false; // error
                    }

                    inst = new Inst;

                    if (inst != NULL) {
                        m_InstList[m_InstNum + 1] = inst;
                    } else {
                        return false; // error
                    }

                    if (len > GetBELong(&chunklen[0])) {
                        //						memcpy( &inst->Smpl.Title[0], mod+inst_Title, 32);
                        memcpy(&inst->Title[0], mod + inst_Title, 32);
                        inst->Smpl.Number = GetBEByte(mod + inst_SmplNumber);
                        inst->Smpl.Type = GetBEByte(mod + inst_SmplType);
                        inst->Smpl.fPointer = NULL;
                        inst->Smpl.Length = GetBEWord(mod + inst_SmplLength);
                        inst->Smpl.fRepPointer = NULL;
                        inst->Smpl.RepLength = GetBEWord(mod + inst_SmplRepLength);
                        inst->Smpl.fData = NULL;
                        inst->Smpl.FineTune = (short)GetBEWord(mod + inst_FineTune);
                        inst->Smpl.SemiTone = (short)GetBEWord(mod + inst_SemiTone);
                        inst->SmplStart = GetBEWord(mod + inst_SmplStart);
                        inst->SmplEnd = GetBEWord(mod + inst_SmplEnd);
                        inst->SmplRepStart = GetBEWord(mod + inst_SmplRepStart);
                        inst->SmplRepLen = GetBEWord(mod + inst_SmplRepLen);
                        inst->Volume = GetBEWord(mod + inst_Volume);
                        inst->Transpose = GetBEByte(mod + inst_Transpose);
                        inst->SlideSpeed = GetBEByte(mod + inst_SlideSpeed);
                        unsigned char bits = GetBEByte(mod + inst_Effects1);
                        int i;
                        for (i = 0; i < inst_TRANSFORM; i++) {
                            inst->Effects[i] = false;
                            if (bits & 1) {
                                inst->Effects[i] = true;
                            }
                            bits >>= 1;
                        }
                        bits = GetBEByte(mod + inst_Effects2);
                        for (i = inst_TRANSFORM; i < (inst_FILTER + 1); i++) {
                            inst->Effects[i] = false;
                            if (bits & 1) {
                                inst->Effects[i] = true;
                            }
                            bits >>= 1;
                        }
                        // Env
                        inst->Env.AttLen = GetBEWord(mod + inst_EnvAttLen);
                        inst->Env.DecLen = GetBEWord(mod + inst_EnvDecLen);
                        inst->Env.SusLen = GetBEWord(mod + inst_EnvSusLen);
                        inst->Env.RelLen = GetBEWord(mod + inst_EnvRelLen);
                        inst->Env.AttSpd = GetBEWord(mod + inst_EnvAttSpd);
                        inst->Env.DecSpd = GetBEWord(mod + inst_EnvDecSpd);
                        inst->Env.SusSpd = GetBEWord(mod + inst_EnvSusSpd);
                        inst->Env.RelSpd = GetBEWord(mod + inst_EnvRelSpd);
                        inst->Env.AttVol = GetBEWord(mod + inst_EnvAttVol);
                        inst->Env.DecVol = GetBEWord(mod + inst_EnvDecVol);
                        inst->Env.SusVol = GetBEWord(mod + inst_EnvSusVol);
                        inst->Env.RelVol = GetBEWord(mod + inst_EnvRelVol);
                        // Vib
                        inst->Vib.Dir = GetBEByte(mod + inst_VibDir);
                        inst->Vib.WaveNum = GetBEByte(mod + inst_VibWaveNum);
                        inst->Vib.Speed = GetBEWord(mod + inst_VibSpeed);
                        inst->Vib.Delay = GetBEWord(mod + inst_VibDelay);
                        inst->Vib.AtkSpd = GetBEWord(mod + inst_VibAtkSpd);
                        inst->Vib.Attack = GetBEWord(mod + inst_VibAttack);
                        inst->Vib.Depth = GetBEWord(mod + inst_VibDepth);
                        // Tre
                        inst->Tre.Dir = GetBEByte(mod + inst_TreDir);
                        inst->Tre.WaveNum = GetBEByte(mod + inst_TreWaveNum);
                        inst->Tre.Speed = GetBEWord(mod + inst_TreSpeed);
                        inst->Tre.Delay = GetBEWord(mod + inst_TreDelay);
                        inst->Tre.AtkSpd = GetBEWord(mod + inst_TreAtkSpd);
                        inst->Tre.Attack = GetBEWord(mod + inst_TreAttack);
                        inst->Tre.Depth = GetBEWord(mod + inst_TreDepth);
                        // Arp
                        inst->Arp.Table = GetBEWord(mod + inst_ArpTable);
                        inst->Arp.Speed = GetBEByte(mod + inst_ArpSpeed);
                        inst->Arp.Groove = GetBEByte(mod + inst_ArpGroove);
                        // Tra
                        inst->Tra.EnvTraPhaFilBits = GetBEByte(mod + inst_EnvTraPhaFilBits);
                        memcpy(&inst->Tra.WaveNums[0], mod + inst_TraWaveNums, 5);
                        inst->Tra.Start = GetBEWord(mod + inst_TraStart);
                        inst->Tra.Repeat = GetBEWord(mod + inst_TraRepeat);
                        inst->Tra.RepEnd = GetBEWord(mod + inst_TraRepEnd);
                        inst->Tra.Speed = GetBEWord(mod + inst_TraSpeed);
                        inst->Tra.Turns = GetBEWord(mod + inst_TraTurns);
                        inst->Tra.Delay = GetBEWord(mod + inst_TraDelay);
                        // Pha
                        inst->Pha.Start = GetBEWord(mod + inst_PhaStart);
                        inst->Pha.Repeat = GetBEWord(mod + inst_PhaRepeat);
                        inst->Pha.RepEnd = GetBEWord(mod + inst_PhaRepEnd);
                        inst->Pha.Speed = GetBEWord(mod + inst_PhaSpeed);
                        inst->Pha.Turns = GetBEWord(mod + inst_PhaTurns);
                        inst->Pha.Delay = GetBEWord(mod + inst_PhaDelay);
                        inst->Pha.Type = GetBEWord(mod + inst_PhaType);
                        // Mix
                        inst->Mix.ResLooBits = GetBEByte(mod + inst_MixResLooBits);
                        inst->Mix.WaveNum = GetBEByte(mod + inst_MixWaveNum);
                        inst->Mix.Start = GetBEWord(mod + inst_MixStart);
                        inst->Mix.Repeat = GetBEWord(mod + inst_MixRepeat);
                        inst->Mix.RepEnd = GetBEWord(mod + inst_MixRepEnd);
                        inst->Mix.Speed = GetBEWord(mod + inst_MixSpeed);
                        inst->Mix.Turns = GetBEWord(mod + inst_MixTurns);
                        inst->Mix.Delay = GetBEWord(mod + inst_MixDelay);
                        // Res
                        inst->Res.Start = GetBEWord(mod + inst_ResStart);
                        inst->Res.Repeat = GetBEWord(mod + inst_ResRepeat);
                        inst->Res.RepEnd = GetBEWord(mod + inst_ResRepEnd);
                        inst->Res.Speed = GetBEWord(mod + inst_ResSpeed);
                        inst->Res.Turns = GetBEWord(mod + inst_ResTurns);
                        inst->Res.Delay = GetBEWord(mod + inst_ResDelay);
                        inst->Res.MixResFilBoost = GetBEByte(mod + inst_MixResFilBoost);
                        inst->Res.Amp = GetBEByte(mod + inst_ResAmp);
                        // Fil
                        inst->Fil.Start = GetBEWord(mod + inst_FilStart);
                        inst->Fil.Repeat = GetBEWord(mod + inst_FilRepeat);
                        inst->Fil.RepEnd = GetBEWord(mod + inst_FilRepEnd);
                        inst->Fil.Speed = GetBEWord(mod + inst_FilSpeed);
                        inst->Fil.Turns = GetBEWord(mod + inst_FilTurns);
                        inst->Fil.Delay = GetBEWord(mod + inst_FilDelay);
                        //											inst->Fil.PadByte = GetBEByte( mod+inst_FilPadByte);
                        inst->Fil.Type = GetBEByte(mod + inst_FilType);
                        // Loo
                        inst->Loo.Start = GetBEWord(mod + inst_LooStart);
                        inst->Loo.Repeat = GetBEWord(mod + inst_LooRepeat);
                        inst->Loo.RepEnd = GetBEWord(mod + inst_LooRepEnd);
                        inst->Loo.Length = GetBEWord(mod + inst_LooLength);
                        inst->Loo.LpStep = GetBEWord(mod + inst_LooLpStep);
                        inst->Loo.Wait = GetBEWord(mod + inst_LooWait);
                        inst->Loo.Delay = GetBEWord(mod + inst_LooDelay);
                        inst->Loo.Turns = GetBEWord(mod + inst_LooTurns);

                        mod += GetBELong(&chunklen[0]);
                        len -= GetBELong(&chunklen[0]);
                    } else {
                        return false; // error
                    }

                    m_InstNum += 1;

                    break;
                }

                case 0x534D504C: // SMPL
                {
                    struct Smpl* smpl;
                    unsigned long origlen;
                    unsigned long packlen;
                    unsigned char cmdbyte;
                    unsigned long samplen;
                    unsigned char* ptr;

                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);

                        mod += 4;
                        len -= 4;
                    } else {
                        return false; // error
                    }

                    if (len >= 6) {
                        origlen = GetBELong(mod + 0); // Original Sample length
                        cmdbyte = GetBEByte(mod + 4); // Command Byte

                        mod += 6;
                        len -= 6;
                    } else {
                        return false; // error
                    }

                    smpl = new Smpl;

                    if (smpl != NULL) {
                        m_SmplList[m_SmplNum + 1] = smpl;
                    } else {
                        return false; // error
                    }

                    if (len >= smpl_SIZEOF) {
                        ptr = mod;

                        memcpy(&smpl->Title[0], mod + smpl_Title, 32);
                        smpl->Number = m_SmplNum + 1;
                        smpl->Type = GetBEByte(mod + smpl_Type);
                        smpl->Length = GetBEWord(mod + smpl_Length);
                        smpl->RepLength = GetBEWord(mod + smpl_RepLength);
                        smpl->FineTune = (short)GetBEWord(mod + smpl_FineTune);
                        smpl->SemiTone = (short)GetBEWord(mod + smpl_SemiTone);
                        smpl->fData = NULL;

                        mod += smpl_SIZEOF;
                        len -= smpl_SIZEOF;
                    } else {
                        return false; // error
                    }

                    samplen = origlen;

                    if (origlen == 256) {
                        samplen += 240;
                    }

                    // float is the internal sample type
                    float* pSamp = new float[samplen];
                    if (pSamp != NULL) {
                        smpl->fData = pSamp;
                    } else {
                        return false; // error
                    }

                    if (GetBELong(ptr + smpl_RepPointer) >= GetBELong(ptr + smpl_Pointer)) {
                        u32 repOffset = GetBELong(ptr + smpl_RepPointer) - GetBELong(ptr + smpl_Pointer);
                        smpl->fRepPointer = pSamp + repOffset;
                        smpl->fPointer = pSamp;
                    } else {
                        smpl->fRepPointer = pSamp;
                        smpl->fPointer = pSamp;
                    }

                    packlen = GetBELong(&chunklen[0]) - smpl_SIZEOF;

                    // Handle case where declared packlen exceeds remaining data
                    // (matches ASM behavior where DOS Read auto-limits to file size)
                    u32 available = (len < packlen) ? len : packlen;

                    if (origlen == packlen) {
                        // UnPacked Sample
                        for (u32 i = 0; i < available; i++) {
                            // Amiga samples are 8-bit SIGNED (-128 to 127)
                            // No negation - match UADE/Paula behavior
                            s8 sample = (s8)mod[i];
                            pSamp[i] = r32(sample) / 128.f;
                        }
                    } else {
                        // Packed Sample - DeltaDePacker knows origlen, handles correctly
                        smpl->DeltaDePacker(mod, cmdbyte, pSamp, origlen);
                    }

                    mod += available;
                    len -= available;

                    // If the smpl_Length is 128 words you must add 240 bytes to smpl_SampleData area.
                    // Then you must convert the sample to 5 octaves:

                    if (origlen == 256) // wave ?
                    {
                        // ASM clamps -128 to -127 before downsampling (Mline116.asm:5489-5491)
                        // pSamp stores floats in range [-1.0, 0.99], so -128 becomes -1.0f
                        // -127/128 = -0.9921875f
                        for (i = 0; i < 256; i++) {
                            if (pSamp[i] == -1.0f) {
                                pSamp[i] = -127.0f / 128.0f;
                            }
                        }

                        // Downsample waveform for lower octaves
                        for (i = 0; i < 240; i++) {
                            pSamp[256 + i] = pSamp[i * 2];
                        }
                    }

                    m_SmplNum += 1;

                    break;
                }

                case 0x494E464F: // INFO
                {
                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);
                        mod += 4;
                        len -= 4;
                    } else {
                        return false;
                    }

                    u32 infoLen = GetBELong(&chunklen[0]);
                    if (len < infoLen) {
                        return false;
                    }

                    // Parse 9 null-terminated strings matching ASM LoadInfo order
                    u8* infoPtr = mod;
                    u32 infoRemain = infoLen;

                    struct {
                        char* dst;
                        int maxLen;
                    } infoFields[] = {
                        { m_infoTitle, 64 },    { m_infoAuthor, 64 },  { m_infoDate, 16 },
                        { m_infoDuration, 16 }, { m_infoText[0], 64 }, { m_infoText[1], 64 },
                        { m_infoText[2], 64 },  { m_infoText[3], 64 }, { m_infoText[4], 64 },
                    };

                    for (auto& f : infoFields) {
                        int copied = 0;
                        bool foundNull = false;
                        while (infoRemain > 0 && copied < f.maxLen) {
                            u8 c = *infoPtr++;
                            infoRemain--;
                            if (c == 0) {
                                foundNull = true;
                                break;
                            }
                            f.dst[copied++] = static_cast<char>(c);
                        }
                        f.dst[copied] = '\0';
                        // If we hit maxLen without finding null, skip remaining bytes until null
                        if (!foundNull) {
                            while (infoRemain > 0) {
                                u8 c = *infoPtr++;
                                infoRemain--;
                                if (c == 0)
                                    break;
                            }
                        }
                    }

                    mod += infoLen;
                    len -= infoLen;

                    break;
                }

                default: // skip unknown chunk
                {
                    if (len >= 4) {
                        memcpy(&chunklen[0], mod, 4);

                        mod += 4;
                        len -= 4;
                    } else {
                        return false; // error
                    }

                    if (len >= GetBELong(&chunklen[0])) {
                        mod += GetBELong(&chunklen[0]);
                        len -= GetBELong(&chunklen[0]);
                    } else {
                        return false; // error
                    }
                }
            }
        }

        // module successfully loaded ?
        //
        if (m_TuneNum != 0) {
            // set the sample pointers for all instruments
            //
            for (i = 1; i <= m_InstNum; i++) {
                Inst* inst;

                inst = m_InstList[i];

                if (inst) {
                    for (j = 1; j <= m_SmplNum; j++) {
                        Smpl* smpl;

                        smpl = m_SmplList[j];

                        if (inst->Smpl.Number == smpl->Number) {
                            inst->Smpl.fPointer = smpl->fPointer + (inst->SmplStart << 1);
                            inst->Smpl.fRepPointer = smpl->fPointer + (inst->SmplRepStart << 1);
                        }
                    }
                }
            }
            for (int i = 0; i < 1024; i++) {
                if (!m_PartList[i]) {
                    m_PartList[i] = new Part;
                    for (int k = 0; k < PartSize; k++) {
                        m_PartList[i]->Data[k].Note = 0;
                        m_PartList[i]->Data[k].Inst = 0;
                        for (int j = 0; j < 5; j++)
                            m_PartList[i]->Data[k].Fx[j] = 0;
                    }
                }
            }
            return true; // success !
        }
    }
    return false; // error
}

void MLModule::FreeMod(void) {
    int i, j;

    // FreeAllTunes
    //
    for (i = 0; i < 256; i++) {
        Tune* tune = m_TuneList[i];

        if (tune) {
            for (j = 0; j < MAXCHANS; j++) {
                Chnl* chnl = tune->ChPtrs[j];
                delete chnl;
            }
            delete tune;
            m_TuneList[i] = 0;
        }
    }

    // FreeAllParts
    //
    for (i = 0; i < 1024; i++) {
        // Part* part = PartList[i];
        delete m_PartList[i];
        m_PartList[i] = 0;
    }

    // FreeAllArpgs
    //
    for (i = 0; i < 256; i++) {
        Arpg* arpg = m_ArpgList[i];
        delete arpg;
        m_ArpgList[i] = 0;
    }

    // FreeAllInsts
    //
    for (i = 0; i < 256; i++) {
        // Inst* inst = InstList[i];
        delete m_InstList[i];
        m_InstList[i] = 0;
    }
    for (i = 0; i < 256; i++) {
        Smpl* smpl = m_SmplList[i];

        if (smpl) {
            if (smpl->fData) {
                delete smpl->fData;
            }
            delete smpl;
            m_SmplList[i] = 0;
        }
    }

    // m_ChannelBuf[] are persistent MLModule state (allocated in constructor,
    // freed in destructor). Do NOT free them here — they must survive across
    // stop()/load() cycles so InitTune() can reuse them without dangling-pointer
    // crashes. FreeMod() is called from both stop() and ~MLModule(); freeing
    // ChannelBuf here would either leave dangling pointers (when called from stop())
    // or double-free them (when called again from the destructor via ~MLModule()).
}
void MLModule::SetTuneVariables(s32 i) {
    Tune* tune = m_TuneList[i];
    tune->Groove = m_TuneGrv;
    tune->Speed = m_TuneSpd;
    tune->Tempo = m_TuneTmp;
    tune->Volume = m_MasterVol;
    tune->PlayMode = m_PlayMode;
}

bool MLModule::InitTune(u32 num) {
    s32 i;

    if (num >= m_TuneNum) {
        return false;
    }

    Tune* tune = m_TuneList[num];

    m_TunePtr = tune;
    m_ChannelsOn = 0xff;
    m_TunePos = 0;
    m_PlayBits = 0; // enable synth effects
    // ASM: StartPlay sets _PlayTune=2, first tick skips PlayTune.
    // Each call to InitTune produces one _PlayTune==2 skip tick.
    // When UADE re-inits for a non-zero subsong, the second StartPlay
    // overwrites _PlayTune to 2 before any CIA tick fires, so only
    // ONE skip tick occurs (not two). Always use m_nPlayTune=2.
    m_nPlayTune = 2;
    m_MasterVol = 64 << 4;

    m_SongNum = num;
    m_ChanNum = tune->Channels;

    m_PlayMode = tune->PlayMode;
    if (m_PlayMode == 0) {
        if (m_ChanNum > 4) {
            m_ChanNum = 4; // limit channels in normal playmode
        }
    }

    m_TuneTmp = tune->Tempo;
    // Set timing immediately when tune is initialized (don't wait for Output loop)
    SetSongSpeed(m_TuneTmp);

    // Compute _MixLength for 8-channel software mixing
    if (m_PlayMode != 0) {
        computeMixLength();
        // Reset pair buffer playback positions
        for (int p = 0; p < 4; p++) {
            m_mixBufPlayPos[p] = 0;
        }
    }

    for (i = 0; i < m_ChanNum; i++) {
        if (i == m_nSingleChannel || m_nSingleChannel == -1) {
            Channel* chan;

            chan = m_ChannelBuf[i];

            chan->Clear();

            for (int j = 0; j < 4; j++) {
                chan->m_Instrument[j].Init();
                chan->m_Instrument[j].m_CVolume = 64 * 16;
                chan->m_Instrument[j].m_PchSldToNote = -1;
                chan->m_Instrument[j].m_pSfx = GetWorkChannel(i * 16 + j * 4);
            }

            chan->m_TunePos = 0;
            chan->m_PartPos = 0;

            chan->m_VoiceOff = 0;

            if ((m_ChannelsOn & (1 << i)) == 0) {
                chan->m_ChannelOff = 1;
            } else {
                chan->m_ChannelOff = 0;
            }

            m_TuneSpd = tune->Speed;
            chan->m_Spd = m_TuneSpd;

            m_TuneGrv = tune->Groove;
            chan->m_Grv = m_TuneGrv;

            if (chan->m_Grv == 0) {
                chan->m_PartGrv = 0;
            } else {
                chan->m_PartGrv = 1;
            }

            chan->m_SpdCnt = 1;

            chan->m_pChnl = tune->ChPtrs[i];
        } else {
            Channel* chan;
            chan = m_ChannelBuf[i];
            chan->m_VoiceOff = 1;
        }
    }
    m_nValidSingleChannel = m_nSingleChannel;
    m_nSingleChannel = -1;

    // Reset loop detection state
    m_loopDetected = false;
    m_loopDurationSamples = 0;
    m_totalSamplesAccum = 0;
    m_seenStates.clear();

    m_IntMode = 1;

    // ASM InitPlay loop (Mline116.asm:5975-5994) pre-processes the first row
    // before CIA interrupts start. The loop calls PlayTune (which triggers
    // PlayVoice → CheckInst → PlayInst, processing the first row and
    // initializing instruments/ADSR). The loop exits after PlayTune because
    // PlayError bit 1 is set when ch_TunePos == _TunePos. PlayEffects is
    // NOT called during init — only the note/instrument initialization happens.
    // Match ASM InitPlay: process row 0 (notes/instruments/ADSR) before CIA starts.
    // PlayTune processes the first row, initializing instruments/ADSR.
    m_bPlay = false;
    PlayTune();
    // (debug removed)
    // For normal playback, set m_bPlay=true so instrument processing
    // (playinst_render, playinst_filter, etc.) is active from tick 1.
    // m_bPlay is an editor construct; the ASM has no equivalent.
    if (m_nPattern == -1)
        m_bPlay = true;

    return true;

    //	ns->timerspeed = data->TuneTmp;
}

/*****************************************************************************
 * Init/End Tune                                  * Conny Cyréus - Musicline *
 *****************************************************************************/

void MLModule::EndTune(void) {
    m_IntMode = 0;
}

// Song has ended when all active channels have hit an END command.
// Only VoiceOff reliably indicates a true END — PlayError bit 0 is also
// set by jump-count expiry which doesn't mean the channel is done.
bool MLModule::isSongEnd() const {
    for (int i = 0; i < m_ChanNum; i++) {
        if ((m_ChannelsOn & (1 << i)) == 0)
            continue; // channel not active in this song
        if (m_ChannelBuf[i]->m_VoiceOff == 0)
            return false; // this channel hasn't ended yet
    }
    return true;
}

/* Twins/PHA *****************************************************************
 * Interuptserver routines                             Last Change: 92-10-24 *
 *****************************************************************************/

double MLModule::getLoopDurationSeconds(int sampleRate) const {
    return m_loopDurationSamples / (double)sampleRate;
}

void MLModule::checkLoopState() {
    if (m_loopDetected)
        return;

    // Build state buffer: 7 bytes per channel
    // TunePos, PartPos, TuneJumpCount, PartJmpCnt, SpdCnt, TuneWait, PartGrv
    // SpdCnt is needed because position fields stay the same for multiple ticks
    // (one row lasts SpdCnt ticks). Without it, we'd false-detect on tick 2.
    // TuneWait is needed for songs using WAIT commands — without it, different
    // countdown values at the same TunePos would hash identically.
    // PartGrv toggles every beat (affects speed), prevents even/odd beat collisions.
    constexpr int BYTES_PER_CH = 7;
    uint8_t state[MAXCHANS * BYTES_PER_CH];
    for (int i = 0; i < m_ChanNum && i < MAXCHANS; i++) {
        Channel* chan = m_ChannelBuf[i];
        state[i * BYTES_PER_CH + 0] = chan->m_TunePos;
        state[i * BYTES_PER_CH + 1] = chan->m_PartPos;
        state[i * BYTES_PER_CH + 2] = chan->m_TuneJumpCount;
        state[i * BYTES_PER_CH + 3] = chan->m_PartJmpCnt;
        state[i * BYTES_PER_CH + 4] = chan->m_SpdCnt;
        state[i * BYTES_PER_CH + 5] = chan->m_TuneWait;
        state[i * BYTES_PER_CH + 6] = chan->m_PartGrv;
    }
    // Zero out unused channels
    for (int i = m_ChanNum; i < MAXCHANS; i++) {
        for (int j = 0; j < BYTES_PER_CH; j++)
            state[i * BYTES_PER_CH + j] = 0;
    }

    // FNV-1a hash
    uint64_t hash = 14695981039346656037ULL;
    int stateLen = MAXCHANS * BYTES_PER_CH;
    for (int i = 0; i < stateLen; i++) {
        hash ^= state[i];
        hash *= 1099511628211ULL;
    }

    auto it = m_seenStates.find(hash);
    if (it != m_seenStates.end()) {
        m_loopDetected = true;
        m_loopDurationSamples = m_totalSamplesAccum - it->second;
    } else {
        m_seenStates[hash] = m_totalSamplesAccum;
    }
}

void MLModule::PlayMusic(void) {
    if (m_IntMode != 0) {
        if (!m_dryRun)
            ClearMixBuff();

        // ASM: _PlayTune==2 on first tick after StartPlay (Mline116.asm:9079-9086)
        // Skip PlayTune on first tick, only run PlaySongEffects (which writes volumes).
        //
        // NOTE: The ASM pre-processes the first row during InitPlay (Mline116.asm:
        // 5975-5986) before the first CIA interrupt fires. This means instruments
        // and ADSR are initialized one tick earlier than in C++, causing a one-tick
        // ADSR timing offset. This offset manifests as ~5% value mismatches during
        // ADSR transitions in per-channel A/B comparison. The ADSR math itself is
        // correct — both engines compute identical vol/speed/length progressions.
        // The offset is a known artifact of not being able to replicate the ASM
        // InitPlay loop without causing a DMA phase shift (see module.cpp InitTune
        // comment for details).
        if (m_nPlayTune >= 2) {
            m_nPlayTune--;
            if (!m_dryRun)
                PlaySongEffects();
            return;
        }

        // ASM PlayMusic calls PlayTune once per tick — no loop.
        // The do-while loop is an editor construct for pattern playback only.
        if (m_nPattern != -1) {
            do {
                PlayPattern(m_nPattern);
            } while (!m_bPlay);
        } else {
            PlayTune();
            if (!m_dryRun)
                PlaySongEffects();
            checkLoopState();
        }
        m_totalSamplesAccum += m_nCurrentTickSize;
    }
}
void MLModule::PlayPattern(int pattern) {
    ClearMixBuff();
    m_ChannelNum = m_nValidSingleChannel;
    m_ChannelBuf[m_nValidSingleChannel]->PlayPattern(this, pattern);
    PlayEffects(m_nValidSingleChannel);
    //	PerCalc(0);
    //	PlayDma(0);
}

void MLModule::DisableAllEffects() {
    // Disable all effects in all instruments for debugging/comparison
    for (int i = 0; i < MAX_INSTURUMENTS; i++) {
        if (m_InstList[i]) {
            for (int j = 0; j < 32; j++) {
                m_InstList[i]->Effects[j] = false;
            }
        }
    }
}

/* Twins/PHA *****************************************************************
 * PlayTune                                            Last Change: 93-01-15 *
 *****************************************************************************/

void MLModule::PlayTune(void) {
    int i;

    for (i = 0; i < m_ChanNum; i++) {
        m_ChannelNum = i;
        m_ChannelBuf[i]->PlayVoice(this);
    }
}

void MLModule::PlaySongEffects() {
    // 8-channel mode: read ch_Play state.
    // Note: UADE has _SndFBuf == _SndCBuf (no fast RAM), so there's no double buffer.
    // The mixer writes directly to the same memory that DMA reads from. We use a single
    // buffer (index [0]) to match this behavior. When ch_Play=0, the buffer retains
    // the LAST active tick's data (correct for single-buffer).
    if (m_PlayMode != 0) {
        // Clear pair buffers before mixing all channels every tick
        for (int p = 0; p < 4; p++)
            memset(m_softMixBuf[p][0], 0, m_mixLength * sizeof(float));
    }

    if (m_PlayMode != 0) {
        // 8-channel two-pass mode matching ASM order:
        //   Pass 1: PlayEffects for ALL channels (effects, ADSR, PerCalc — skips PlayDma+mixer)
        //   Pass 2: PlayDma + UpdateChannel for ALL channels (volume computation + soft mix)
        // This ensures cross-channel effects (MasterVol slides, AllChannelVol) from later
        // channels are applied before any channel computes its volume.
        m_deferMixing = true;
        for (int i = 0; i < m_ChanNum; i++) {
            m_ChannelNum = i;
            PlayEffects(i);
        }
        m_deferMixing = false;

        // Pass 2: volume computation + soft mix for all channels.
        // Must iterate all instruments per channel (matching Channel::PlayEffects
        // which calls m_Instrument[0..numof].PlayEffects for polyphonic channels).
        for (int i = 0; i < m_ChanNum; i++) {
            m_ChannelNum = i;
            Channel* chan = m_ChannelBuf[i];
            int numof = 1;
            if (numof < chan->m_InstNumOf)
                numof = chan->m_InstNumOf;
            int savedInst = chan->m_InstNum;
            for (int j = 0; j < numof; j++) {
                chan->m_InstNum = j;
                chan->m_Instrument[j].PlayDmaAndMix(this);
            }
            chan->m_InstNum = savedInst;
        }
    } else {
        for (int i = 0; i < m_ChanNum; i++) {
            m_ChannelNum = i;
            PlayEffects(i);
        }
    }

    // 8-channel mode: finalize software mixing and add pair outputs to stereo
    if (m_PlayMode != 0) {
        int size = (int)GetSongSpeed();
        finalizeSoftMix(size);
        m_pMixChan->m_songSpeed = size;
        for (int pair = 0; pair < 4; pair++) {
            m_pMixChord[pair]->m_bMix = true;
            m_pMixChord[pair]->Mix(m_pMixChan);
        }
    }
}

void MLModule::PlayEffects(int i) {
    m_ChannelBuf[i]->PlayEffects(this);
}

void MLModule::ResetModule(void) {
    int i = 0;
    for (int i = 0; i < 256; i++) {
        delete m_TuneList[i];
        m_TuneList[i] = 0;
    }
    for (i = 0; i < 1024; i++) {
        delete m_PartList[i];
        m_PartList[i] = 0;
    }

    for (i = 0; i < 256; i++) {
        delete m_ArpgList[i];
        m_ArpgList[i] = 0;
    }
    for (i = 0; i < 256; i++) {
        delete m_InstList[i];
        m_InstList[i] = 0;
    }
    for (i = 0; i < 256; i++) {
        delete m_SmplList[i];
        m_SmplList[i] = 0;
    }

    m_TuneNum = 0;
    m_PartNum = 0;
    m_ArpgNum = 0;
    m_InstNum = 0;
    m_SmplNum = 0;
}
void MLModule::LoadMod(char* szName) {
    File fil(szName);
    ResetModule();
    ReadMod(&fil);
}
void MLModule::LoadMod(wchar_t* szName) {
    File fil(szName);
    ResetModule();
    ReadMod(&fil);
}
void MLModule::ReadMod(File* file) {
    //	File *file=new File(szName,"rb");
    file->SeekEnd(0);
    int size = file->GetPosition();
    unsigned char* module = new unsigned char[size];
    file->SeekStart(0);
    file->Read(module, size);
    // unsigned long* p = (unsigned long*)module;
    if (memcmp(module, "MLED", 4) == 0) {
        LoadMod(module, size);
        InitTune(0);
    } else if (memcmp(module, "MLPC", 4) == 0) {
        file->SeekStart(0);
        Import(file);
        InitTune(0);
    } else {
    }
    delete module;
}
void MLModule::Import(File* pFile) {}

// Compute _MixLength matching ASM (Mline116.asm:19001-19008):
// _MixLength = ((_TimerValue2 / _MixPeriod) * 125) / (_TuneTmp * 50), made even
// UADE reports NTSC via VPosR, so the ASM player uses _TimerValue2 = 3579545 (NTSC).
// _MixPeriod = 126, _TuneTmp = TuneTmp (tempo).
// When output rate differs from INTERNAL_RATE, scale proportionally.
void MLModule::computeMixLength() {
    constexpr uint32_t NTSC_CLOCK = 3579545;
    constexpr uint16_t MIX_PERIOD = 126;
    uint16_t tuneTmp = m_TuneTmp ? m_TuneTmp : 125; // fallback to default tempo

    // Match 68000 divu: 32-bit / 16-bit → 16-bit quotient
    uint16_t q1 = (uint16_t)(NTSC_CLOCK / MIX_PERIOD); // 28409
    uint32_t d1 = (uint32_t)q1 * 125;                  // 3551125
    uint32_t d2 = (uint32_t)tuneTmp * 50;              // e.g. 6250
    uint16_t q2 = (uint16_t)(d1 / d2);                 // 568
    q2 &= ~1;                                          // bclr #0 — make even

    // Scale mix length for non-native output rates
    if (m_outputRate != INTERNAL_RATE) {
        q2 = (uint16_t)((uint32_t)q2 * m_outputRate / INTERNAL_RATE);
        q2 &= ~1; // keep even
    }

    m_mixLength = q2;
}

// 8-channel software mixing: resample one channel into a pair buffer.
// Matches ASM MixMove (add=false, store) / MixAdd (add=true, byte-add).
// Uses 16.16 fixed-point stepping based on ASM:
//   step = 2 * (PeriodValue / period)
//   At 28150 Hz: PeriodValue = 126 * 32768 = 4128768 (ASM original)
//   General: PeriodValue = PAL_CLOCK * 32768 / outputRate
//   intStep = step >> 16, fracStep = step & 0xFFFF
//   Inner loop: fracAcc += fracStep (16-bit, carry on overflow), pos += intStep + carry
// Volume via VolTable equivalent: (s8)((int)(s8)sample * vol_level / 128)
// ASM VolTable (volumelist.raw) divides by 128: Table[vol][byte] = byte * vol / 128
void MLModule::softMixResample(int ch, int mixLen, bool add) {
    Channel* chan = m_ChannelBuf[ch];
    int idx = ch * 16 + chan->m_InstNum * 4;
    CMLineSfx* sfx = m_pChannel[idx];

    int pair = ch % 4;
    float* dest = m_softMixBuf[pair][0]; // Single buffer (UADE: _SndFBuf == _SndCBuf)

    SoftMixChan& state = m_softMixChan[ch];

    // Use saved waveform pointer (ASM ch_MixWsPointer), NOT sfx->m_pData which
    // comes from VUWsPointer and may be overwritten by effects (resonance/filter).
    // The ASM 8-channel mixer (Play8ch/Play8PV) always reads from ch_MixWsPointer
    // which is saved from ch_WsPointer at new-note time and only updated to
    // ch_WsRepPointer on waveform wrap (.wsloop).
    float* waveform = state.mixWsPtr;

    if (!waveform || sfx->m_nPeriod == 0) {
        if (!add) {
            memset(dest, 0, mixLen * sizeof(float));
        }
        return;
    }

    if (state.ended) {
        if (!add) {
            memset(dest, 0, mixLen * sizeof(float));
        }
        return;
    }

    // Volume: same formula as 4-channel path (PerVolPlay)
    int vol = m_pMixChord[ch]->m_nVolumeInt;

    // Resampling step: ASM divu gives 16-bit quotient, then doubled
    // step_32 = 2 * (PeriodValue / period)
    // At 28150 Hz: PeriodValue = 126 * 32768 = 4128768 (ASM original)
    // General: PeriodValue = PAL_CLOCK * 32768 / outputRate = 3546900 * 32768 / rate
    // ch_MixAdd2 (high word) = integer bytes per output sample
    // ch_MixAdd1 (low word) = fractional part
    uint16_t period = sfx->m_nPeriod;
    uint32_t periodValue = (uint32_t)(3546900.0 * 32768.0 / m_outputRate);
    uint16_t quotient = (uint16_t)(periodValue / period);
    uint32_t step = (uint32_t)quotient * 2;
    uint16_t intStep = (uint16_t)(step >> 16);
    uint16_t fracStep = (uint16_t)(step & 0xFFFF);

    uint32_t pos = state.pos;
    uint16_t fracAcc = state.fracAcc;
    uint32_t waveLen = state.mixWsLen;

    CPlayInst* pi = chan->GetPlayingInstrument();

    for (int i = 0; i < mixLen; i++) {
        // Check end of waveform — ASM .wsloop (Mline116.asm:12062)
        if (pos >= waveLen) {
            if (pi->m_WsRepLength > 1) {
                // ASM .wsloop: switch to repeat pointer/length and reset pos to 0.
                // This reads the CURRENT tick's WsRepPointer (which may be
                // effect-modified), matching the ASM behavior where .wsloop
                // loads ch_WsRepPointer at the moment of wrap.
                state.mixWsPtr = pi->m_WsRepPointer;
                state.mixWsLen = (uint32_t)pi->m_WsRepLength << 1;
                waveform = state.mixWsPtr;
                waveLen = state.mixWsLen;
                pos = 0;
                fracAcc = 0; // ASM .wsloop clears ch_MixSaveDec2
            } else {
                state.ended = true;
                if (!add) {
                    memset(dest + i, 0, (mixLen - i) * sizeof(float));
                }
                break;
            }
        }

        // Fetch float waveform sample, apply volume (normalized to -1..1)
        float fSample = waveform[pos];
        float scaled = fSample * (float)vol / 64.0f;

        if (add) {
            // MixAdd: float addition (replaces ASM byte-wrapping add.b)
            dest[i] += scaled;
        } else {
            // MixMove: store
            dest[i] = scaled;
        }

        // Advance position: ASM add d2,d3 (frac) / addx.l d4,d0 (pos + carry)
        uint16_t oldFrac = fracAcc;
        fracAcc += fracStep;
        uint32_t carry = (fracAcc < oldFrac) ? 1 : 0;
        pos += intStep + carry;
    }

    state.pos = pos;
    state.fracAcc = fracAcc;
}

// After all 8 channels are software-mixed into 4 pair buffers, produce the final output.
// The software mixer generates exactly tick_size samples per pair buffer, with the
// resampler state persisting across ticks to produce a continuous waveform stream.
// The 63/128 attenuation matches the ASM 8-channel VolTable (divides by 128 vs 64).
void MLModule::finalizeSoftMix(int size) {
    if (size <= 0)
        return;

    // softMixResample generates exactly `size` output samples per pair buffer.
    // The resampler state persists across ticks, producing a continuous waveform.
    for (int pair = 0; pair < 4; pair++) {
        float* dest = m_pMixChord[pair]->m_pMixBuf;
        const float* src = m_softMixBuf[pair][0];

        // ASM 8ch attenuation: VolTable divides by 128 instead of 64
        // (halves volume because there are 8 channels vs 4), then scales by 63.
        // Net factor: 63/128 = 0.4921875
        for (int i = 0; i < size; i++) {
            dest[i] = src[i] * (63.0f / 128.0f);
        }
    }
}

void MLModule::UpdateChannel() {
    int size = GetSongSpeed();
    //	if(i==0)
    //		memset(m_pMixChan->_pDataLegacy,0,sizeof(float)*size*2);

    Channel* chan = m_ChannelBuf[m_ChannelNum];
    int i = m_ChannelNum * 16 + chan->m_InstNum * 4;
    int j = m_ChannelNum;

    // With >>14 fix (Mline116.asm:11461-11462), VUVolume is 0-64 (Paula range)
    // Divide by 16 to get m_fVolume in 0-4.0 range for mixing
    m_pMixChord[j]->m_fVolume /= 16;
    m_pChannel[i]->m_fVolume /= 16;

    CPlayInst* pChannel = chan->GetPlayingInstrument();

    if (pChannel->m_PartInst && pChannel->m_PartInst != m_pChannel[i]->m_nSample) {
        m_pChannel[i]->m_nSample = pChannel->m_PartInst;
    }
    if (m_pChannel[i]->m_nSample > 0) {
        m_pChannel[i]->m_nSize = pChannel->m_VUWsLength;
        m_pChannel[i]->m_nLoopEnd = pChannel->m_VUWsRepLength;
        if (pChannel->m_VUWsRepLength <= 2)
            m_pChannel[i]->m_nLoopStart = -1;
        else
            m_pChannel[i]->m_nLoopStart = pChannel->m_VUWsRepPointer - pChannel->m_VUWsPointer;
        m_pChannel[i]->m_pData = pChannel->m_VUWsPointer;
    }
    if (m_pMixChord[j]->m_bNewNote) {
        m_pMixChord[j]->DoMix();
        m_pMixChord[j]->m_bNewNote = false;

        m_pChannel[i]->DoMix();
        m_pChannel[i]->m_fAddPos = 0;

        // DMA restart gate: ASM DmaPlay checks ch_Play bit 0 first
        // Play bit 0 is cleared by LooInit check when instrument repeats
        // PlayBit0WasSet is saved in PlayDma before the bit is cleared
        bool playBitSet = pChannel->m_PlayBit0WasSet;

        // ASM DmaPlay (Mline116.asm:3549-3613) builds DMACON mask:
        // - WaveOrSample == 0 (waveform): always enable DMA
        // - WaveOrSample != 0 (sample): only enable if WsNumber changed
        // This controls which channels get Dma2 repeat pointer writes.
        bool fullDmaRestart
            = playBitSet && ((pChannel->m_WaveOrSample == 0) || (pChannel->m_WsNumber != pChannel->m_WsNumberOld));

        pChannel->m_WsNumberOld = pChannel->m_WsNumber;

        // ASM Dma1 (Mline116.asm:3650-3672) fires for ALL channels with
        // Play bit 0 set, regardless of DmaPlay's DMACON check. Dma1
        // unconditionally writes AUDxLC/AUDxLEN/AUDxPER, which latches
        // the new sample pointer. This means same-sample retriggers
        // still restart the sample from the beginning.
        if (playBitSet) {
            if (m_PlayMode != 0) {
                // 8-channel software mixing: reset resampler state (ASM Play8ch)
                // Save ORIGINAL waveform pointer/length — the ASM's Play8ch copies
                // ch_WsPointer/ch_WsLength into ch_MixWsPointer/ch_MixWsLen.
                // Effects modify WsRepPointer, NOT WsPointer, so this is the
                // unmodified waveform data.
                m_softMixChan[m_ChannelNum].pos = 0;
                m_softMixChan[m_ChannelNum].fracAcc = 0;
                m_softMixChan[m_ChannelNum].ended = false;
                m_softMixChan[m_ChannelNum].mixWsPtr = pChannel->m_WsPointer;
                m_softMixChan[m_ChannelNum].mixWsLen = (uint32_t)pChannel->m_WsLength << 1;
            } else {
                // 4-channel: Reset sample position for new note
                m_pChannel[i]->m_nPos = 0;
                m_pChannel[i]->m_fAddPos = 0;

                if (fullDmaRestart) {
                    // Full DMA restart: set loop from repeat pointer
                    if (pChannel->m_VUWsRepLength <= 2)
                        m_pChannel[i]->m_nLoopStart = -1;
                    else
                        m_pChannel[i]->m_nLoopStart = pChannel->m_VUWsRepPointer - pChannel->m_VUWsPointer;
                } else {
                    // Same-sample retrigger: loop from start
                    m_pChannel[i]->m_nLoopStart = 0;
                }
            }
        }

        m_pMixChord[j]->m_fOVolume = m_pMixChord[j]->m_fVolume;
        m_pChannel[i]->m_fOVolume = m_pChannel[i]->m_fVolume;
        float pit = m_pChannel[i + 1]->m_nPitch;
        *m_pChannel[i + 1] = *m_pChannel[i];
        m_pChannel[i + 1]->m_nPitch = pit;
        pit = m_pChannel[i + 2]->m_nPitch;
        *m_pChannel[i + 2] = *m_pChannel[i];
        m_pChannel[i + 2]->m_nPitch = pit;
        pit = m_pChannel[i + 3]->m_nPitch;
        *m_pChannel[i + 3] = *m_pChannel[i];
        m_pChannel[i + 3]->m_nPitch = pit;
    }

    // 8-channel software mixing: resample into pair buffers instead of StoreMix.
    // ASM has TWO mixer paths called every tick:
    //   Play8ch  (ch_Play=1): resets resampler to 0, then mixes (new note/waveform)
    //   Play8PV  (ch_Play=0): continues from previous position, mixes (ongoing playback)
    //                         If sample ended (ch_MixSmplEnd), clears buffer to zeros.
    // Both run MixMove/MixAdd — the mixer runs EVERY tick regardless of ch_Play.
    //
    // Use the output tick size (not m_mixLength) so the resampler generates exactly
    // as many pair buffer bytes as finalizeSoftMix consumes. Without this, the
    // resampler advances past the output, causing periodic phase-jump glitches.
    if (m_PlayMode != 0) {
        // Generate exactly tick_size output samples. The 8-channel software mixer
        // IS the audio output — it generates the pair buffer which Paula plays 1:1
        // at period 126 (= output rate). The resampler state persists across ticks,
        // producing a continuous waveform stream.
        int mixLen = (int)GetSongSpeed();
        if (mixLen <= 0)
            mixLen = 1;
        if (mixLen > SOFT_MIX_MAX)
            mixLen = SOFT_MIX_MAX;
        softMixResample(m_ChannelNum, mixLen, m_ChannelNum >= 4);
        // Per-channel capture happens in finalizeSoftMix (after all channels processed)
        return;
    }

    // 4-channel path: standard StoreMix through Paula emulation
    m_pMixChord[j]->m_nPos = 0;
    m_pMixChord[j]->m_fAddPos = 0;
    m_pMixChord[j]->m_nPitch = (float)m_outputRate;
    int num = 1;

    m_pChannel[i]->StoreMix(m_pMixChord[j], size);
    if (m_pChannel[i + 1]->m_nPitch != 1.0f) {
        m_pChannel[i + 1]->NormalMix(m_pMixChord[j], size);
        num++;
    }
    if (m_pChannel[i + 2]->m_nPitch != 1.0f) {
        m_pChannel[i + 2]->NormalMix(m_pMixChord[j], size);
        num++;
    }
    if (m_pChannel[i + 3]->m_nPitch != 1.0f) {
        m_pChannel[i + 3]->NormalMix(m_pMixChord[j], size);
        num++;
    }
}
void MLModule::ClearMixBuff(void) {
    if (m_pMixChan->m_pMixBuf) {
        memset(m_pMixChan->m_pMixBuf, 0, sizeof(float) * GetSongSpeed() * 2);
    }
}

void MLModule::Update() {
    u32 size = GetSongSpeed();
    m_pMixChan->m_fOVolume = m_pMixChan->m_fVolume;
    m_pMixChan->Surround(size);
    SaveData(size);
}

void MLModule::SaveData(u32 len) {
    // Convert float mix buffer to s16 output
    // m_pMixBuf holds normalized float: -1..1 per channel, up to ±2 after stereo sum
    // 16384 = 128 (s8 range) * 64 (max vol) * 2 (UADE <<1) — maps to old s16 levels
    if (m_pMixChan->m_pMixBuf) {
        for (u32 i = 0; i < len * 2; i++) {
            float fval = m_pMixChan->m_pMixBuf[i];
            s32 j = (s32)(fval * 16384.0f);
            if (j > 32767)
                j = 32767;
            else if (j < -32768)
                j = -32768;
            m_Temp[i] = j;
        }
    }
}

void MLModule::Output(vp sampbuf, u32 len) {
    s8* pSmp = (s8*)sampbuf;
    memset(pSmp, 0, len);
    if (!m_f1.mute) {
        u32 w = m_Write;
        if (m_Read > w)
            w += (u32)m_rbSize;

        int _hangDetect = 0;
        while ((w - m_Read) < (len / 4)) {
            _hangDetect++;
            if (_hangDetect > 10000) {
                fprintf(stderr,
                        "OUTPUT_HANG: stuck after %d iterations, w=%u m_Read=%u len=%u tickSize=%u songSpeed=%.1f "
                        "TuneTmp=%d\n",
                        _hangDetect, (unsigned)w, (unsigned)m_Read, (unsigned)len, (unsigned)m_nCurrentTickSize,
                        GetSongSpeed(), m_TuneTmp);
                break;
            }
            m_fTickAccum += m_fSamplesPerTick;
            m_nCurrentTickSize = (u32)m_fTickAccum;
            m_fTickAccum -= m_nCurrentTickSize;

            PlayMusic();

            SetSongSpeed(m_TuneTmp);
            m_fCurrent += m_fSamplesPerTick;
            m_nTickCount++;
            Update();

            smp16* p = (smp16*)m_Temp;
            u32 size = (u32)GetSongSpeed();
            if ((m_Write + size) >= (u32)m_rbSize) {
                u32 num = (u32)m_rbSize - m_Write;
                memcpy(m_ringBuf + m_Write, p, num * sizeof(smp16));
                m_Write = 0;
                p += num;
                size -= num;
            }
            if (size)
                memcpy(m_ringBuf + m_Write, p, size * sizeof(smp16));
            m_Write += size;
            w = m_Write;
            if (m_Read > m_Write)
                w += (u32)m_rbSize;
        }
    } else {
        memset(pSmp, 0, len);
        m_f1.frame++;
        return;
    }
    u32 size = len / 4;
    smp16* p = (smp16*)(vp)pSmp;
    for (u32 i = 0; i < size; i++) {
        if (m_Read == (u32)m_rbSize) {
            m_Read = 0;
        }
        smp16* s = m_ringBuf + m_Read;
        s32 samp = s->left;
        p[i].left = samp;
        samp = s->right;
        p[i].right = samp;
        m_Read++;
    }
    m_f1.frame++;
}

void MLModule::SetPattern(s32 i) {
    m_nPattern = i;
}

int MLModule::SubSongCount() {
    int count = 0;
    for (int i = 0; i < m_TuneNum; i++) {
        if (m_TuneList[i] && m_TuneList[i]->Channels > 0)
            count++;
    }
    return count;
}

int MLModule::SubSongIndex(int subsong) {
    // Map playable subsong index to TuneList index,
    // skipping non-playable entries (0-channel credit text)
    int count = 0;
    for (int i = 0; i < m_TuneNum; i++) {
        if (m_TuneList[i] && m_TuneList[i]->Channels > 0) {
            if (count == subsong)
                return i;
            count++;
        }
    }
    return -1;
}

s8* MLModule::SubSongName(int subsong) {
    int idx = SubSongIndex(subsong);
    if (idx >= 0) {
        return m_TuneList[idx]->Title;
    }
    return nullptr;
}
