#include "enums.h"
#include "module.h"
#include "structs.h"
#include <cassert>
#include <cstdio>

void CPlayInst::pfx_NumPoly(MLModule* data, unsigned char cmd, unsigned char arg) {
    int old = data->m_ChannelBuf[data->m_ChannelNum]->m_InstNumOf;
    data->m_ChannelBuf[data->m_ChannelNum]->m_InstNumOf = ((arg & 7) % 5);
    if (old != data->m_ChannelBuf[data->m_ChannelNum]->m_InstNumOf) {
        for (int i = old; i < 4; i++) {
            data->m_ChannelBuf[data->m_ChannelNum]->m_Instrument[i].m_OldInst = 0;
        }
    }
}
void CPlayInst::pfx_ReverbSize(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Sfx.m_nRevSize = int(data->GetSongSpeed() * 2 * arg);
}
void CPlayInst::pfx_ReverbAmp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Sfx.m_nRevAmp = float(arg) / 256;
}
void CPlayInst::pfx_EchoAmp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Sfx.m_nEchoAmp = float(arg) / 256;
}
void CPlayInst::pfx_ReverbOn(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Sfx.SetReverbLen(data->GetSongSpeed() * arg * 2);
}
void CPlayInst::pfx_EchoOn(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Sfx.SetEchoLen(data->GetSongSpeed() * arg * 2);
}
void CPlayInst::pfx_Pan(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Sfx.m_fPan = float(arg) / 256.;
}
void CPlayInst::pfx_PanSize(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Sfx.m_fPanSize = float(arg) / 256.f;
}
void CPlayInst::pfx_PanAdd(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg == 0) {
        m_bAutoPan = false;
        return;
    }
    m_bAutoPan = true;
    m_fPanAdd = float(arg) / 256;
}

void CPlayInst::pfx_Chord(MLModule* data, unsigned char cmd, unsigned char arg) {
    int n1 = (m_OldNote + (cmd & 0xf)) * 32;
    int n2 = (m_OldNote + (arg >> 4)) * 32;
    int n3 = (m_OldNote + (arg & 0x0f)) * 32;
    if (n1 != m_OldNote * 32)
        m_Chord_Period1 = GetPeriod(data, n1);
    if (n2 != m_OldNote * 32)
        m_Chord_Period2 = GetPeriod(data, n2);
    if (n3 != m_OldNote * 32)
        m_Chord_Period3 = GetPeriod(data, n3);
}

void CPlayInst::pfx_SetResoCounter(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_ResData.counter = arg;
    m_ResData.savecounter = arg;
    m_Effects[inst_RESONANCE] = true;
}
void CPlayInst::pfx_SetResoAmp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_ResAmp = arg;
    m_Effects[inst_RESONANCE] = true;
}
void CPlayInst::pfx_SetFiltCounter(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_FilData.counter = arg;
    m_FilData.savecounter = arg;
    m_Effects[inst_FILTER] = true;
}
void CPlayInst::pfx_SetSpecialVolume(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_SpecialVolume = float(arg) / 128.0f;
}

void CPlayInst::pfx_SetSurround(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg == 0)
        m_Sfx.m_fSurround = 0.0f;
    else
        m_Sfx.m_fSurround = float(arg) / 255;
}

// old commands

void CPlayInst::pfx_UNUSED(MLModule* data, unsigned char cmd, unsigned char arg) {}

void CPlayInst::pfx_SlideUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_PchSld = cmd;
    m_PchSldType = 0;

    if (arg != 0) {
        m_PchSldSpd = arg;
    }

    m_PchSldToNote = 59 * 32 + 32;
}

void CPlayInst::pfx_SlideDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_PchSld = cmd;
    m_PchSldType = 1;

    if (arg != 0) {
        m_PchSldSpd = arg;
    }

    m_PchSldToNote = 0;
}

void CPlayInst::pfx_Portamento(MLModule* data, unsigned char cmd, unsigned char arg) {
    short nte;

    m_PchSld = cmd;

    if (arg != 0) {
        m_PchSldSpd = arg;
    }

    nte = m_Note + m_PchSldNote;

    if (m_PartNote != 0) {
        m_PchSldToNote = m_PartNote << 5;
        m_PartNote = 0;

        if (nte < m_PchSldToNote) {
            // slide up
            m_PchSldType = 0;
        } else if (nte > m_PchSldToNote) {
            // slide down
            m_PchSldType = 1;
        } else {
            // don't slide
            m_PchSldToNote = -1;
            m_PchSld = 0;
        }
    } else {
        if (m_PchSldToNote == -1) {
            m_PchSld = 0;
        }
    }
}

void CPlayInst::pfx_InitInstrumentPortamento(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_InstPchSld = 0;
}

void CPlayInst::pfx_PitchUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg != 0) {
        m_PchAdd += arg;
    }
}

void CPlayInst::pfx_PitchDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg != 0) {
        m_PchAdd -= arg;
    }
}

void CPlayInst::pfx_VibratoSpeed(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg != 0) {
        m_VibCmdSpeed = arg;
    }
}

void CPlayInst::pfx_VibratoUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    Vibrato_pfx(data, cmd, arg, 1);
}

void CPlayInst::pfx_VibratoDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    Vibrato_pfx(data, cmd, arg, 0);
}

void CPlayInst::Vibrato_pfx(MLModule* data, unsigned char cmd, unsigned char arg, unsigned char dir) {
    m_Vib = cmd;

    if (m_PartNote != 0) {
        m_VibDir = dir;
        m_VibCount = 0;
        m_VibCmdDepth = 0;
        m_VibCmdDelay = 0;
        m_VibAtkSpeed = 0;
        m_VibAtkLength = 0;
    }

    if (arg != 0) {
        m_VibDepth = arg << 8;
    }

    m_VibWaveNum = m_PartVibWaveNum;
}

void CPlayInst::pfx_VibratoWave(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg <= 3) {
        m_VibWaveNum = arg;
        m_PartVibWaveNum = arg;
    }
}

void CPlayInst::pfx_SetFinetune(MLModule* data, unsigned char cmd, unsigned char arg) {
    char ftn;

    ftn = (char)arg;

    if (ftn > 31) {
        ftn = 31;
    } else if (ftn < -31) {
        ftn = -31;
    }

    m_FineTune = ftn;
    m_Play |= (1 << 2);
}

/*�����            Instrument Volume                 �����*/

void CPlayInst::pfx_Volume(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Vol = cmd;
    m_VolSet = arg << 4;
}

void CPlayInst::pfx_VolumeSlideUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_VolSld = cmd;

    if (arg != 0) {
        m_VolSldSpd = arg;
    }
}

void CPlayInst::pfx_VolumeSlideDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_VolSld = cmd;

    if (arg != 0) {
        m_VolSldSpd = arg;
    }
}

void CPlayInst::pfx_VolumeSlideToVolSet(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_VolSldToVol = arg << 4;
}

void CPlayInst::pfx_VolumeSlideToVol(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_VolSld = cmd;

    if (arg != 0) {
        m_VolSldSpd = arg;
    }

    m_VolSldVol = m_Volume1;

    if (m_VolSldVol < m_VolSldToVol) {
        // slide up
        m_VolSldType = 0;

        m_VolSldToVolOff = 0;
    } else if (m_VolSldVol > m_VolSldToVol) {
        // slide down
        m_VolSldType = 1;

        m_VolSldToVolOff = 0;
    } else {
        // don't slide
        m_VolSldToVolOff = 1;
    }
}

void CPlayInst::pfx_VolumeAdd(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_VolAdd = cmd;

    if (arg != 0) {
        m_VolAddNum = arg << 4;
    }
}

void CPlayInst::pfx_VolumeSub(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_VolAdd = cmd;

    if (arg != 0) {
        m_VolAddNum = -(arg << 4);
    }
}

void CPlayInst::pfx_TremoloSpeed(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg != 0) {
        m_TreCmdSpeed = arg;
    }
}

void CPlayInst::pfx_TremoloUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    Tremolo_pfx(data, cmd, arg, 1);
}

void CPlayInst::pfx_TremoloDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    Tremolo_pfx(data, cmd, arg, 0);
}

void CPlayInst::Tremolo_pfx(MLModule* data, unsigned char cmd, unsigned char arg, unsigned char dir) {
    m_Tre = cmd;

    if (m_PartNote != 0) {
        m_TreDir = dir;
        m_TreCount = 0;
        m_TreCmdDepth = 0;
        m_TreCmdDelay = 0;
        m_TreAtkSpeed = 0;
        m_TreAtkLength = 0;
    }

    if (arg != 0) {
        m_TreDepth = arg << 8;
    }

    m_TreWaveNum = m_PartTreWaveNum;
}

void CPlayInst::pfx_TremoloWave(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg <= 3) {
        m_TreWaveNum = arg;
        m_PartTreWaveNum = arg;
    }
}

/*�����            Channel Volume                    �����*/

void CPlayInst::pfx_ChannelVol(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_CVolume = arg << 4;
}

void CPlayInst::pfx_ChannelVolSlideUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_CVolSld = cmd;

    if (arg != 0) {
        m_CVolSldSpd = arg;
    }
}

void CPlayInst::pfx_ChannelVolSlideDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_CVolSld = cmd;

    if (arg != 0) {
        m_CVolSldSpd = arg;
    }
}

void CPlayInst::pfx_ChannelVolSlideToVolSet(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_CVolSldToVol = arg << 4;
}

void CPlayInst::pfx_ChannelVolSlideToVol(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_CVolSld = cmd;

    if (arg != 0) {
        m_CVolSldSpd = arg;
    }

    m_CVolSldVol = m_CVolume;

    if (m_CVolSldVol < m_CVolSldToVol) {
        // slide up
        m_CVolSldType = 0;

        m_CVolSldToVolOff = 0;
    } else if (m_CVolSldVol > m_CVolSldToVol) {
        // slide down
        m_CVolSldType = 1;

        m_CVolSldToVolOff = 0;
    } else {
        // don't slide
        m_CVolSldToVolOff = 1;
    }
}

void CPlayInst::pfx_ChannelVolAdd(MLModule* data, unsigned char cmd, unsigned char arg) {
    int vol;

    if (arg != 0) {
        m_CVolAddNum = arg << 4;
    }

    vol = m_CVolume + m_CVolAddNum;

    if (vol > (64 * 16)) {
        vol = 64 * 16;
    }

    m_CVolume = vol;
}

void CPlayInst::pfx_ChannelVolSub(MLModule* data, unsigned char cmd, unsigned char arg) {
    int vol;

    if (arg != 0) {
        m_CVolAddNum = arg << 4;
    }

    vol = m_CVolume - m_CVolAddNum;

    if (vol < 0) {
        vol = 0;
    }

    m_CVolume = vol;
}

void CPlayInst::pfx_AllChannelVol(MLModule* data, unsigned char cmd, unsigned char arg) {
    int vol = arg << 4;
    for (int i = 0; i < data->m_ChanNum; i++) {
        data->m_ChannelBuf[i]->GetPlayingInstrument()->m_CVolume = vol;
    }
}

/*�����            Master Volume                     �����*/

void CPlayInst::pfx_MasterVol(MLModule* data, unsigned char cmd, unsigned char arg) {
    data->m_MasterVol = arg << 4;
}

void CPlayInst::pfx_MasterVolSlideUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_MVolSld = cmd;

    if (arg != 0) {
        m_MVolSldSpd = arg;
    }
}

void CPlayInst::pfx_MasterVolSlideDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_MVolSld = cmd;

    if (arg != 0) {
        m_MVolSldSpd = arg;
    }
}

void CPlayInst::pfx_MasterVolSlideToVolSet(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_MVolSldToVol = arg << 4;
}

void CPlayInst::pfx_MasterVolSlideToVol(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_MVolSld = cmd;

    if (arg != 0) {
        m_MVolSldSpd = arg;
    }

    // BUG IN ORIGINAL ASM (Mline116.asm:2724): The direction comparison
    // should use _MasterVol (the current master volume), but the ASM uses d1
    // which still holds command_byte * 4 from the effect dispatch table lookup
    // (lines 2074-2076: d1=d0; add d1,d1; add d1,d1). For cmd 0x34, that's
    // 0x34*4 = 208 — a meaningless value that has nothing to do with volume.
    //
    // The equivalent channel volume command (pfx_ChanVolSlideToVol) does NOT
    // have this bug — it correctly loads CVolume into d1 before comparing.
    //
    // The correct code would be: MVolSldVol = data->MasterVol;
    // We intentionally replicate the bug to match the original player behavior.
    m_MVolSldVol = cmd * 4;

    if (m_MVolSldVol < m_MVolSldToVol) {
        // ASM: cmp d1,d2 → d2-d1 > 0 → N=0 → smi sets 0x00 → .slideup
        m_MVolSldType = 0;

        m_MVolSldToVolOff = 0;
    } else if (m_MVolSldVol > m_MVolSldToVol) {
        // ASM: cmp d1,d2 → d2-d1 < 0 → N=1 → smi sets 0xFF → .slidedown
        m_MVolSldType = 1;

        m_MVolSldToVolOff = 0;
    } else {
        // equal → don't slide
        m_MVolSldToVolOff = 1;
    }
}

void CPlayInst::pfx_MasterVolAdd(MLModule* data, unsigned char cmd, unsigned char arg) {
    int vol;

    if (arg != 0) {
        m_MVolAddNum = arg << 4;
    }

    vol = data->m_MasterVol + m_MVolAddNum;

    if (vol > (64 * 16)) {
        vol = 64 * 16;
    }

    data->m_MasterVol = vol;
}

void CPlayInst::pfx_MasterVolSub(MLModule* data, unsigned char cmd, unsigned char arg) {
    int vol;

    if (arg != 0) {
        m_MVolAddNum = arg << 4;
    }

    vol = data->m_MasterVol - m_MVolAddNum;

    if (vol < 0) {
        vol = 0;
    }

    data->m_MasterVol = vol;
}

/*�����            Other                  �����*/

void CPlayInst::pfx_SpeedPart(MLModule* data, unsigned char cmd, unsigned char arg) {
    unsigned char spd;

    if (arg != 0) {
        spd = arg;

        if (spd > 0x1f) {
            spd = 0x1f;
        }

        Channel* chan = data->m_ChannelBuf[data->m_ChannelNum];
        chan->m_SpdPart = 1;
        chan->m_Spd = spd;

        if ((chan->m_Grv == 0) || (chan->m_PartGrv == 0)) {
            chan->m_SpdCnt = spd;
        }
    }
}

void CPlayInst::pfx_GroovePart(MLModule* data, unsigned char cmd, unsigned char arg) {
    unsigned char grv;

    if (arg != 0) {
        grv = arg;

        if (grv > 0x1f) {
            grv = 0x1f;
        }

        Channel* chan = data->m_ChannelBuf[data->m_ChannelNum];
        chan->m_GrvPart = 1;
        chan->m_Grv = grv;

        if ((chan->m_Grv == 0) || (chan->m_PartGrv != 0)) {
            chan->m_SpdCnt = grv;
        }
    }
}

void CPlayInst::pfx_SpeedAll(MLModule* data, unsigned char cmd, unsigned char arg) {
    unsigned char spd;
    int i;

    if (arg != 0) {
        spd = arg;

        if (spd < 0x20) {
            data->m_TuneSpd = spd;

            // ASM SpeedAllMacro (MusiclineEditor.asm:2782-2797):
            // Channels already processed this tick (index <= current) get full
            // treatment (SpdPart/Grv/PartGrv checks before setting SpdCnt).
            // Channels not yet processed (index > current) only get Spd set —
            // their SpdCnt countdown is not disrupted.
            int currentCh = data->m_ChannelNum;
            for (i = 0; i < data->m_ChanNum; i++) {
                Channel* chan2 = data->m_ChannelBuf[i];
                if (i <= currentCh) {
                    if (chan2->m_SpdPart == 0) {
                        chan2->m_Spd = spd;
                        if (chan2->m_Grv == 0 || chan2->m_PartGrv == 0) {
                            chan2->m_SpdCnt = spd;
                        }
                    }
                } else {
                    chan2->m_Spd = spd;
                }
            }
        } else {
            data->m_TuneTmp = spd;
        }
    }
}

void CPlayInst::pfx_GrooveAll(MLModule* data, unsigned char cmd, unsigned char arg) {
    int i;

    if (arg != 0) {
        data->m_TuneGrv = arg & 0x1f;

        // ASM GrooveAllMacro (MusiclineEditor.asm:2799-2813):
        // Same channel-ordering logic as SpeedAllMacro.
        int currentCh = data->m_ChannelNum;
        for (i = 0; i < data->m_ChanNum; i++) {
            Channel* chan2 = data->m_ChannelBuf[i];
            if (i <= currentCh) {
                if (chan2->m_GrvPart == 0) {
                    chan2->m_Grv = arg & 0x1f;
                    if (chan2->m_Grv != 0 && chan2->m_PartGrv == 0) {
                        chan2->m_SpdCnt = arg & 0x1f;
                    }
                }
            } else {
                chan2->m_Grv = arg & 0x1f;
            }
        }
    }
}

void CPlayInst::pfx_ArpeggioList(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Arp |= (1 << 2);
    m_ArpTab = arg;
}

void CPlayInst::pfx_ArpeggioListOneStep(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Arp |= 0x14;
    m_ArpTab = arg;
}

void CPlayInst::pfx_HoldSustain(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Effects[inst_HOLDSUSTAIN] = true;
    m_EffectsPar1 &= ~(1 << ADSRHOLDSUSTAIN);

    if (arg != 0) {
        m_EffectsPar1 |= (1 << ADSRHOLDSUSTAIN);
    }
}

void CPlayInst::pfx_Filter(MLModule* data, unsigned char cmd, unsigned char arg) {
    // TODO: LED filter not yet implemented (arg=0 off, arg=1 on)
}

void CPlayInst::pfx_SampleOffset(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_SmpOfs = cmd;

    if (arg != 0) {
        m_SmplOfs = arg;
    }
}

void CPlayInst::pfx_RestartNoVolume(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (m_PartInst == 0) {
        m_Restart = 1;
    }
}

void CPlayInst::pfx_WaveSample(MLModule* data, unsigned char cmd, unsigned char arg) {
    struct Smpl* smpl;

    if (arg != 0) {
        smpl = data->m_SmplList[arg];

        if (smpl != NULL) {
            m_WsPtr = smpl;

            m_Arp |= (1 << 3);
        }
    }
}

void CPlayInst::pfx_InitInstrument(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_PhaInit = 0;
    m_ResInit = 0;
    m_FilInit = 0;
    m_TraInit = 0;
    m_MixInit = 0;
    m_LooInit = 0;
}

/*�����            ProTracker Pitch           �����*/

void CPlayInst::pfx_PTSlideUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_PTPchSld = cmd;
    m_PTPchSldType = 0;

    if (arg != 0) {
        m_PTPchSldSpd = arg;
        m_PTPchSldToNote = 106;
    }
}

void CPlayInst::pfx_PTSlideDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_PTPchSld = cmd;
    m_PTPchSldType = 1;

    if (arg != 0) {
        m_PTPchSldSpd = arg;
        m_PTPchSldToNote = 3591;
    }
}

void CPlayInst::pfx_PTPortamento(MLModule* data, unsigned char cmd, unsigned char arg) {
    unsigned short per;

    m_PchSld = fx_Portamento;
    m_PTPchSld = cmd;

    if (arg != 0) {
        m_PTPchSldSpd2 = arg;
    }

    per = GetPeriod(data, m_Note);
    per += m_PTPchSldNote;

    if (m_PartNote != 0) {
        m_PTPchSldToNote = GetPeriod(data, m_PartNote << 5);
        m_PartNote = 0;

        if (per > m_PTPchSldToNote) {
            // slide up
            m_PTPchSldType = 0;
        } else if (per < m_PTPchSldToNote) {
            // slide down
            m_PTPchSldType = 1;
        } else {
            // don't slide
            m_PTPchSldToNote = -1;
            m_PTPchSld = 0;
            m_PchSld = 0;
        }
    } else {
        if (m_PTPchSldToNote == -1) {
            m_PTPchSld = 0;
            m_PchSld = 0;
        }
    }
}

void CPlayInst::pfx_PTFineSlideUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg != 0) {
        m_PTPchAdd -= arg & 0x0f;
    }
}

void CPlayInst::pfx_PTFineSlideDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    if (arg != 0) {
        m_PTPchAdd += arg & 0x0f;
    }
}

void CPlayInst::pfx_PTTremolo(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Tre = cmd;

    if (arg != 0) // �berfl�ssig...
    {
        if ((arg & 0x0f) != 0) {
            m_PTTreCmd = (m_PTTreCmd & 0xf0) | (arg & 0x0f);
        }

        if ((arg & 0xf0) != 0) {
            m_PTTreCmd = (m_PTTreCmd & 0x0f) | (arg & 0xf0);
        }
    }
}

void CPlayInst::pfx_PTTremoloWave(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_PTTreWave = arg & 0x0f;
}

void CPlayInst::pfx_PTVibrato(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Vib = cmd;

    if (arg != 0) // �berfl�ssig...
    {
        if ((arg & 0x0f) != 0) {
            m_PTVibCmd = (m_PTVibCmd & 0xf0) | (arg & 0x0f);
        }

        if ((arg & 0xf0) != 0) {
            m_PTVibCmd = (m_PTVibCmd & 0x0f) | (arg & 0xf0);
        }
    }
}

void CPlayInst::pfx_PTVibratoWave(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_PTVibWave = arg & 0x0f;
}

void CPlayInst::pfx_PTVolSlideUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    pfx_VolumeSlideUp(data, cmd, arg);
}

void CPlayInst::pfx_PTVolSlideDown(MLModule* data, unsigned char cmd, unsigned char arg) {
    pfx_VolumeSlideDown(data, cmd, arg);
}

/*�����            UserCommand            �����*/

void CPlayInst::pfx_UserCommand(MLModule* data, unsigned char cmd, unsigned char arg) {}

void CPlayInst::PlayFx(MLModule* data, unsigned char cmd, unsigned char arg) {
    switch (cmd) {
        case fx_SlideUp:
            pfx_SlideUp(data, cmd, arg);
            break;
        case fx_SlideDown:
            pfx_SlideDown(data, cmd, arg);
            break;
        case fx_Portamento:
            pfx_Portamento(data, cmd, arg);
            break;
        case fx_InitInstrumentPortamento:
            pfx_InitInstrumentPortamento(data, cmd, arg);
            break;
        case fx_PitchUp:
            pfx_PitchUp(data, cmd, arg);
            break;
        case fx_PitchDown:
            pfx_PitchDown(data, cmd, arg);
            break;
        case fx_VibratoSpeed:
            pfx_VibratoSpeed(data, cmd, arg);
            break;
        case fx_VibratoUp:
            pfx_VibratoUp(data, cmd, arg);
            break;
        case fx_VibratoDown:
            pfx_VibratoDown(data, cmd, arg);
            break;
        case fx_VibratoWave:
            pfx_VibratoWave(data, cmd, arg);
            break;
        case fx_SetFinetune:
            pfx_SetFinetune(data, cmd, arg);
            break;
        case fx_Volume:
            pfx_Volume(data, cmd, arg);
            break;
        case fx_VolumeSlideUp:
            pfx_VolumeSlideUp(data, cmd, arg);
            break;
        case fx_VolumeSlideDown:
            pfx_VolumeSlideDown(data, cmd, arg);
            break;
        case fx_VolumeSlideToVolSet:
            pfx_VolumeSlideToVolSet(data, cmd, arg);
            break;
        case fx_VolumeSlideToVol:
            pfx_VolumeSlideToVol(data, cmd, arg);
            break;
        case fx_VolumeAdd:
            pfx_VolumeAdd(data, cmd, arg);
            break;
        case fx_VolumeSub:
            pfx_VolumeSub(data, cmd, arg);
            break;
        case fx_TremoloSpeed:
            pfx_TremoloSpeed(data, cmd, arg);
            break;
        case fx_TremoloUp:
            pfx_TremoloUp(data, cmd, arg);
            break;
        case fx_TremoloDown:
            pfx_TremoloDown(data, cmd, arg);
            break;
        case fx_TremoloWave:
            pfx_TremoloWave(data, cmd, arg);
            break;
        case fx_SetSurround:
            pfx_SetSurround(data, cmd, arg);
            break;
        case fx_SpecialVolume:
            pfx_SetSpecialVolume(data, cmd, arg);
            break;
        case fx_ChannelVol:
            pfx_ChannelVol(data, cmd, arg);
            break;
        case fx_ChannelVolSlideUp:
            pfx_ChannelVolSlideUp(data, cmd, arg);
            break;
        case fx_ChannelVolSlideDown:
            pfx_ChannelVolSlideDown(data, cmd, arg);
            break;
        case fx_ChannelVolSlideToVolSet:
            pfx_ChannelVolSlideToVolSet(data, cmd, arg);
            break;
        case fx_ChannelVolSlideToVol:
            pfx_ChannelVolSlideToVol(data, cmd, arg);
            break;
        case fx_ChannelVolAdd:
            pfx_ChannelVolAdd(data, cmd, arg);
            break;
        case fx_ChannelVolSub:
            pfx_ChannelVolSub(data, cmd, arg);
            break;
        case fx_AllChannelVol:
            pfx_AllChannelVol(data, cmd, arg);
            break;
        case fx_MasterVol:
            pfx_MasterVol(data, cmd, arg);
            break;
        case fx_MasterVolSlideUp:
            pfx_MasterVolSlideUp(data, cmd, arg);
            break;
        case fx_MasterVolSlideDown:
            pfx_MasterVolSlideDown(data, cmd, arg);
            break;
        case fx_MasterVolSlideToVolSet:
            pfx_MasterVolSlideToVolSet(data, cmd, arg);
            break;
        case fx_MasterVolSlideToVol:
            pfx_MasterVolSlideToVol(data, cmd, arg);
            break;
        case fx_MasterVolAdd:
            pfx_MasterVolAdd(data, cmd, arg);
            break;
        case fx_MasterVolSub:
            pfx_MasterVolSub(data, cmd, arg);
            break;
        case fx_SpeedPart:
            pfx_SpeedPart(data, cmd, arg);
            break;
        case fx_GroovePart:
            pfx_GroovePart(data, cmd, arg);
            break;
        case fx_SpeedAll:
            pfx_SpeedAll(data, cmd, arg);
            break;
        case fx_GrooveAll:
            pfx_GrooveAll(data, cmd, arg);
            break;
        case fx_ArpeggioList:
            pfx_ArpeggioList(data, cmd, arg);
            break;
        case fx_ArpeggioListOneStep:
            pfx_ArpeggioListOneStep(data, cmd, arg);
            break;
        case fx_HoldSustain:
            pfx_HoldSustain(data, cmd, arg);
            break;
        case fx_Filter:
            pfx_Filter(data, cmd, arg);
            break;
        case fx_SampleOffset:
            pfx_SampleOffset(data, cmd, arg);
            break;
        case fx_RestartNoVolume:
            pfx_RestartNoVolume(data, cmd, arg);
            break;
        case fx_WaveSample:
            pfx_WaveSample(data, cmd, arg);
            break;
        case fx_InitInstrument:
            pfx_InitInstrument(data, cmd, arg);
            break;
        case fx_PTSlideUp:
            pfx_PTSlideUp(data, cmd, arg);
            break;
        case fx_PTSlideDown:
            pfx_PTSlideDown(data, cmd, arg);
            break;
        case fx_PTPortamento:
            pfx_PTPortamento(data, cmd, arg);
            break;
        case fx_PTFineSlideUp:
            pfx_PTFineSlideUp(data, cmd, arg);
            break;
        case fx_PTFineSlideDown:
            pfx_PTFineSlideDown(data, cmd, arg);
            break;
        case fx_PTVolSlideUp:
            pfx_PTVolSlideUp(data, cmd, arg);
            break;
        case fx_PTVolSlideDown:
            pfx_PTVolSlideDown(data, cmd, arg);
            break;
        case fx_PTTremolo:
            pfx_PTTremolo(data, cmd, arg);
            break;
        case fx_PTTremoloWave:
            pfx_PTTremoloWave(data, cmd, arg);
            break;
        case fx_PTVibrato:
            pfx_PTVibrato(data, cmd, arg);
            break;
        case fx_PTVibratoWave:
            pfx_PTVibratoWave(data, cmd, arg);
            break;
        case fx_ReverbOn:
            pfx_ReverbOn(data, cmd, arg);
            break;
        case fx_ReverbAmp:
            pfx_ReverbAmp(data, cmd, arg);
            break;
        case fx_ReverbSize:
            pfx_ReverbSize(data, cmd, arg);
            break;
        case fx_Pan:
            pfx_Pan(data, cmd, arg);
            break;
        case fx_PanAdd:
            pfx_PanAdd(data, cmd, arg);
            break;
        case fx_PanSize:
            pfx_PanSize(data, cmd, arg);
            break;
        case fx_EchoOn:
            pfx_EchoOn(data, cmd, arg);
            break;
        case fx_EchoAmp:
            pfx_EchoAmp(data, cmd, arg);
            break;
        case fx_Chord:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 1:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 2:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 3:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 4:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 5:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 6:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 7:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 8:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 9:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 10:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 11:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 12:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 13:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 14:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_Chord + 15:
            pfx_Chord(data, cmd, arg);
            break;
        case fx_SetResoCounter:
            pfx_SetResoCounter(data, cmd, arg);
            break;
        case fx_SetResoAmp:
            pfx_SetResoAmp(data, cmd, arg);
            break;
        case fx_SetFiltCounter:
            pfx_SetFiltCounter(data, cmd, arg);
            break;
        case fx_NumPoly:
            pfx_NumPoly(data, cmd, arg);
            break;
    }
}
