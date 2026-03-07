#include "defines.h"
#include "musicline.h"
#include "sfx.h"
#include <string.h>

CPlayInst::CPlayInst() {
    Init();
}

void CPlayInst::Init(void) {
    memset(this, 0, sizeof(CPlayInst));
    m_Sfx.Init(0, false, false);
    m_Sfx.m_fPan = 0.5f;
}

void CPlayInst::InstPlay(MLModule* data, Inst* inst) {
    if (m_PchSld != fx_Portamento) {
        if ((m_ArpWait & (1 << 0)) == 0) {
            m_Play |= (1 << 0);

            // vibrato
            if (m_Vib == 0) {
                if (m_Effects[inst_VIBRATO]) {
                    m_VibCount = 0;
                    m_VibCmdDepth = 0;
                    m_VibCmdSpeed = inst->Vib.Speed;
                    m_VibCmdDelay = inst->Vib.Delay;
                    m_VibAtkSpeed = inst->Vib.AtkSpd;
                    m_VibAtkLength = inst->Vib.Attack;
                    m_VibDepth = inst->Vib.Depth;
                    m_VibWaveNum = inst->Vib.WaveNum;
                    m_VibDir = inst->Vib.Dir;
                }
            }

            // tremolo
            if (m_Tre == 0) {
                if (m_Effects[inst_TREMOLO]) {
                    m_TreCount = 0;
                    m_TreCmdDepth = 0;
                    m_TreCmdSpeed = inst->Tre.Speed;
                    m_TreCmdDelay = inst->Tre.Delay;
                    m_TreAtkSpeed = inst->Tre.AtkSpd;
                    m_TreAtkLength = inst->Tre.Attack;
                    m_TreDepth = inst->Tre.Depth;
                    m_TreWaveNum = inst->Tre.WaveNum;
                    m_TreDir = inst->Tre.Dir;
                }
            }

            // adsr
            if (m_Effects[inst_ADSR]) {
                m_ADSRVolume = 0;

                memcpy(&m_ADSRData, &inst->Env, sizeof(struct iEnv));
            }

            // phaseing
            if (m_Effects[inst_PHASE]) {
                unsigned char ins;

                m_PhaType = inst->Pha.Type;

                if ((m_EffectsPar1 & (1 << PHASESTEP)) == 0) {
                    m_PhaData.step = 0;

                    m_PhaData.turns = inst->Pha.Turns;

                    if ((m_EffectsPar1 & (1 << PHASEINIT)) == 0) {
                        ins = 0xff;
                        m_PhaInit = 0;
                    } else {
                        ins = m_PhaInit;
                        m_PhaInit = m_PartInst;
                    }
                } else {
                    m_PhaData.step = 1;

                    m_PhaSpd = inst->Pha.Turns;
                    m_PhaData.turns = 0;

                    ins = m_PhaInit;
                    m_PhaInit = m_PartInst;
                }

                if (m_PhaInit != ins) {
                    m_PhaData.counter = inst->Pha.Start;
                    m_PhaData.speed = inst->Pha.Speed;
                    m_PhaData.repeat = inst->Pha.Repeat;
                    m_PhaData.repeatend = inst->Pha.RepEnd;

                    if (m_PhaData.counter > m_PhaData.repeat) {
                        m_PhaData.speed = -m_PhaData.speed;
                    }
                }

                m_PhaData.delay = inst->Pha.Delay;
            }

            // resonancing
            m_MixResFilBoost = inst->Res.MixResFilBoost;

            if (m_Effects[inst_RESONANCE]) {
                unsigned char ins;

                m_ResAmp = inst->Res.Amp;

                if ((m_EffectsPar2 & (1 << RESONANCESTEP)) == 0) {
                    m_ResData.step = 0;

                    m_ResData.turns = inst->Res.Turns;

                    if ((m_EffectsPar2 & (1 << RESONANCEINIT)) == 0) {
                        ins = 0xff;
                        m_ResInit = 0;
                    } else {
                        ins = m_ResInit;
                        m_ResInit = m_PartInst;
                    }
                } else {
                    m_ResData.step = 1;

                    m_ResSpd = inst->Res.Turns;
                    m_ResData.turns = 0;

                    ins = m_ResInit;
                    m_ResInit = m_PartInst;
                }

                if (m_ResInit != ins) {
                    m_ResLastInit = 1;
                    m_ResData.counter = inst->Res.Start;
                    m_ResData.speed = inst->Res.Speed;
                    m_ResData.repeat = inst->Res.Repeat;
                    m_ResData.repeatend = inst->Res.RepEnd;

                    if (m_ResData.counter > m_ResData.repeat) {
                        m_ResData.speed = -m_ResData.speed;
                    }
                }

                m_ResData.delay = inst->Res.Delay;
            }

            // filtering
            if (m_Effects[inst_FILTER]) {
                unsigned char ins;

                m_FilType = inst->Fil.Type;

                if ((m_EffectsPar1 & (1 << FILTERSTEP)) == 0) {
                    m_FilData.step = 0;

                    m_FilData.turns = inst->Fil.Turns;

                    if ((m_EffectsPar1 & (1 << FILTERINIT)) == 0) {
                        ins = 0xff;
                        m_FilInit = 0;
                    } else {
                        ins = m_FilInit;
                        m_FilInit = m_PartInst;
                    }
                } else {
                    m_FilData.step = 1;

                    m_FilSpd = inst->Fil.Turns;
                    m_FilData.turns = 0;

                    ins = m_FilInit;
                    m_FilInit = m_PartInst;
                }

                if (m_FilInit != ins) {
                    m_FilLastInit = 1;
                    m_FilData.counter = inst->Fil.Start;
                    m_FilData.speed = inst->Fil.Speed;
                    m_FilData.repeat = inst->Fil.Repeat;
                    m_FilData.repeatend = inst->Fil.RepEnd;

                    if (m_FilData.counter > m_FilData.repeat) {
                        m_FilData.speed = -m_FilData.speed;
                    }
                }

                m_FilData.delay = inst->Fil.Delay;
            }

            // mix
            if (m_Effects[inst_MIX]) {
                unsigned char ins;

                m_MixWaveNum = inst->Mix.WaveNum;

                if ((m_EffectsPar2 & (1 << MIXSTEP)) == 0) {
                    m_MixData.step = 0;

                    m_MixData.turns = inst->Mix.Turns;

                    if ((m_EffectsPar2 & (1 << MIXINIT)) == 0) {
                        ins = 0xff;
                        m_MixInit = 0;
                    } else {
                        ins = m_MixInit;
                        m_MixInit = m_PartInst;
                    }
                } else {
                    m_MixData.step = 1;

                    m_MixSpd = inst->Mix.Turns;
                    m_MixData.turns = 0;

                    ins = m_MixInit;
                    m_MixInit = m_PartInst;
                }

                if (m_MixInit != ins) {
                    m_MixData.counter = inst->Mix.Start;
                    m_MixData.speed = inst->Mix.Speed;
                    m_MixData.repeat = inst->Mix.Repeat;
                    m_MixData.repeatend = inst->Mix.RepEnd;

                    if (m_MixData.counter > m_MixData.repeat) {
                        m_MixData.speed = -m_MixData.speed;
                    }
                }

                m_MixData.delay = inst->Mix.Delay;
            }

            // transform
            if (m_Effects[inst_TRANSFORM]) {
                unsigned char ins;

                m_TraWsPtrs[0] = inst->Smpl.Number;
                m_TraWsPtrs[1] = inst->Tra.WaveNums[0];
                m_TraWsPtrs[2] = inst->Tra.WaveNums[1];
                m_TraWsPtrs[3] = inst->Tra.WaveNums[2];
                m_TraWsPtrs[4] = inst->Tra.WaveNums[3];
                m_TraWsPtrs[5] = inst->Tra.WaveNums[4];

                if ((m_EffectsPar1 & (1 << TRANSFORMSTEP)) == 0) {
                    m_TraData.step = 0;

                    m_TraData.turns = inst->Tra.Turns;

                    if ((m_EffectsPar1 & (1 << TRANSFORMINIT)) == 0) {
                        ins = 0xff;
                        m_TraInit = 0;
                    } else {
                        ins = m_TraInit;
                        m_TraInit = m_PartInst;
                    }
                } else {
                    m_TraData.step = 1;

                    m_TraSpd = inst->Tra.Turns;
                    m_TraData.turns = 0;

                    ins = m_TraInit;
                    m_TraInit = m_PartInst;
                }

                if (m_TraInit != ins) {
                    m_TraData.counter = inst->Tra.Start;
                    m_TraData.speed = inst->Tra.Speed;
                    m_TraData.repeat = inst->Tra.Repeat;
                    m_TraData.repeatend = inst->Tra.RepEnd;

                    if (m_TraData.counter > m_TraData.repeat) {
                        m_TraData.speed = -m_TraData.speed;
                    }
                }

                m_TraData.delay = inst->Tra.Delay;
            }

            // playloop
            if (m_Effects[inst_LOOP]) {
                if ((inst->Smpl.Type != 0) || (inst->Loo.Length == 0)) {
                    m_Effects[inst_LOOP] = false;
                } else {
                    unsigned char ins;

                    if ((m_EffectsPar2 & (1 << LOOPSTEP)) == 0) {
                        m_LooTurns = inst->Loo.Turns;

                        if ((m_EffectsPar2 & (1 << LOOPINIT)) == 0) {
                            ins = 0xff;
                            m_LooInit = 0;
                        } else {
                            ins = m_LooInit;
                            m_LooInit = m_PartInst;
                        }
                    } else {
                        m_LooSpd = inst->Loo.Turns;
                        m_LooTurns = 0;

                        ins = m_LooInit;
                        m_LooInit = m_PartInst;
                    }

                    if (m_LooInit != ins) {
                        struct Smpl* smpl;

                        smpl = data->m_SmplList[inst->Smpl.Number];

                        m_LooWsPointer = smpl->fPointer;
                        m_LooCounter = inst->Loo.Start;
                        m_LooCounterSave = inst->Loo.Start;
                        m_LooWsCounterMax = smpl->Length - inst->Loo.Length;
                        m_LooLength = inst->Loo.Length;
                        m_LooRepEnd = inst->Loo.RepEnd;
                        m_LooWait = inst->Loo.Wait;
                        m_LooStep = inst->Loo.LpStep;
                        m_LooRepeat = inst->Loo.Repeat;

                        if (m_LooCounter > m_LooRepeat) {
                            m_LooStep = -m_LooStep;
                        }
                    } else {
                        m_Play &= ~(1 << 0);
                    }

                    m_LooDelay = inst->Loo.Delay;
                    m_LooWaitCounter = 0;
                    m_WsPointer = m_LooWsPointer + (m_LooCounterSave << 1);
                    m_WsRepPointer = m_LooWsPointer + (m_LooCounterSave << 1);
                    m_WsRepPtrOrg = m_LooWsPointer + (m_LooCounterSave << 1);
                    m_WsLength = m_LooLength;
                    m_WsRepLength = m_LooLength;
                }
            }

            if ((m_WsRepLength != 8) && (m_WsRepLength != 16) && (m_WsRepLength != 32) && (m_WsRepLength != 64)
                && (m_WsRepLength != 128)) {
                for (int i = inst_TRANSFORM; i < (inst_FILTER + 1); i++) {
                    m_Effects[i] = false;
                }
            }
        }
    }
}

void CPlayInst::MoveLoop(MLModule* data) {
    long cnt;

    if (m_Effects[inst_LOOP]) {
        if ((m_EffectsPar2 & (1 << LOOPSTEP)) == 0) {
            if (m_LooDelay != 0) {
                m_LooDelay -= 1;

                m_WsRepPointer = m_LooWsPointer + (m_LooCounterSave << 1);
                m_WsRepPtrOrg = m_LooWsPointer + (m_LooCounterSave << 1);

                return;
            } else {
                if (m_LooWait != 0) {
                    if (m_LooWaitCounter != 0) {
                        m_LooWaitCounter -= 1;

                        return;
                    } else {
                        m_LooWaitCounter = m_LooWait;
                    }
                }

                m_LooCounterSave = m_LooCounter;

                LoopCounter(data);
            }
        } else {
            if ((m_EffectsPar2 & (1 << LOOPINIT)) == 0) {
                if (m_PartNote != 0) {
                    m_LooCounterSave = m_LooCounter;

                    LoopCounter(data);
                }
            } else {
                if (m_PartNote != 0) {
                    m_LooCounterSave = m_LooCounter;
                }

                LoopCounter(data);
            }
        }

        cnt = m_LooCounterSave;

        if ((m_EffectsPar2 & (1 << LOOPSTEP)) != 0) {
            if (m_LooDelay != 0) {
                m_LooDelay -= 1;
            } else {
                if (m_LooWait != 0) {
                    if (m_LooWaitCounter != 0) {
                        m_LooWaitCounter -= 1;
                    } else {
                        m_LooWaitCounter = m_LooWait;
                    }
                }

                if ((m_LooWait == 0) || (m_LooWait == m_LooWaitCounter)) {
                    int counter;
                    short step;

                    step = (short)m_LooStep;

                    if (step < 0) {
                        step = -step;
                    }

                    counter = m_LooCounterSave + (((char)m_LooSpd) * step);

                    if (counter < 0) {
                        counter = 0;
                    } else if (counter > m_LooWsCounterMax) {
                        counter = m_LooWsCounterMax;
                    }

                    m_LooCounterSave = counter;
                }
            }
        }

        m_WsRepPointer = m_LooWsPointer + (cnt << 1);
        m_WsRepPtrOrg = m_LooWsPointer + (cnt << 1);

        if (m_LooTurns < 0) {
            if (m_Effects[inst_LOOPSTOP]) {
                m_Effects[inst_LOOP] = false;

                // ASM (MusiclineEditor.asm:4255-4258): Write ZeroSample to
                // AUDxLC and VUWsPointer, length=1, silencing the channel
                m_VUWsPointer = &ZeroSample[0];
                m_VUWsRepPointer = &ZeroSample[0];
                m_VUWsLength = 2; // 1 word = 2 samples
                m_VUWsRepLength = 2;
            }
        }
    }
}

void CPlayInst::LoopCounter(MLModule* data) {
    s32 cnt;

    if (m_LooTurns >= 0) {
        cnt = m_LooCounter;

        if (m_LooRepeat < m_LooRepEnd) {
            // normal
            if (m_LooStep < 0) {
                // nsub
                cnt += m_LooStep;

                if (m_LooRepeat > cnt) {
                    if (m_LooTurns != 0) {
                        m_LooTurns -= 1;

                        if (m_LooTurns == 0) {
                            m_LooTurns = -1;
                        }
                    }

                    cnt -= m_LooStep;
                    m_LooStep = -m_LooStep;
                }
            } else {
                // nadd
                cnt += m_LooStep;

                if (m_LooRepEnd < cnt) {
                    if (m_LooTurns != 0) {
                        m_LooTurns -= 1;

                        if (m_LooTurns == 0) {
                            m_LooTurns = -1;
                        }
                    }

                    cnt -= m_LooStep;
                    m_LooStep = -m_LooStep;
                }
            }
        } else {
            // inverted
            if (m_LooStep < 0) {
                // isub
                cnt += m_LooStep;

                if (m_LooRepEnd > cnt) {
                    if (m_LooTurns != 0) {
                        m_LooTurns -= 1;

                        if (m_LooTurns == 0) {
                            m_LooTurns = -1;
                        }
                    }

                    cnt -= m_LooStep;
                    m_LooStep = -m_LooStep;
                }
            } else {
                // iadd
                cnt += m_LooStep;

                if (m_LooRepeat < cnt) {
                    if (m_LooTurns != 0) {
                        m_LooTurns -= 1;

                        if (m_LooTurns == 0) {
                            m_LooTurns = -1;
                        }
                    }

                    cnt -= m_LooStep;
                    m_LooStep = -m_LooStep;
                }
            }
        }

        m_LooCounter = (unsigned short)cnt;
    }
}

/***************************************************************************/

void CPlayInst::Pan(MLModule* data) {
    if (m_bAutoPan) {
        float pan = m_Sfx.m_fPan;
        bool dir = m_Sfx.m_bPanUp;
        float pansize = m_Sfx.m_fPanSize;
        if (dir) {
            pan += m_fPanAdd * pansize;
            if (pan >= (0.5 + (pansize / 2))) {
                dir = false;
                pan = 0.5f + (pansize / 2);
            }
        } else {
            pan -= m_fPanAdd * pansize;
            if (pan <= 0.5f - (pansize / 2)) {
                dir = true;
                pan = 0.5f - (pansize / 2);
            }
        }

        m_Sfx.m_fPan = pan;
        m_Sfx.m_bPanUp = dir;
    }
}

/***************************************************************************/

void CPlayInst::SlideNote(MLModule* data) {
    short nte;
    short spd;
    short per;

    if (m_PTPchSld == 0) {
        if ((m_PchSld != 0) || (m_InstPchSld != 0)) {
            if (m_PchSldToNote >= 0) {
                if (m_PchSldType == 0) {
                    // slideup
                    m_PchSldNote += m_PchSldSpd;

                    nte = m_Note + m_PchSldNote - m_PchSldToNote;

                    if (nte >= 0) {
                        m_PchSldNote -= nte;
                        m_PchSldToNote = -1;
                    }
                } else {
                    // slidedown
                    m_PchSldNote -= m_PchSldSpd;

                    nte = m_Note + m_PchSldNote - m_PchSldToNote;

                    if (nte <= 0) {
                        m_PchSldNote -= nte;
                        m_PchSldToNote = -1;
                    }
                }
            }
        }
    } else {
        // PTSlideNote

        if ((m_Play & (1 << 1)) == 0) {
            if (m_PTPchSldToNote >= 0) {
                if (m_PTPchSld == fx_PTPortamento) {
                    spd = m_PTPchSldSpd2;
                } else {
                    spd = m_PTPchSldSpd;
                }

                if (m_PTPchSldType == 0) {
                    // slideup
                    m_PTPchSldNote -= spd;

                    per = GetPeriod(data, m_Note);
                    per += m_PTPchSldNote;
                    per -= m_PTPchSldToNote;

                    if (per <= 0) {
                        m_PTPchSldNote -= per;
                        m_PTPchSldToNote = -1;
                    }
                } else {
                    // slidedown
                    m_PTPchSldNote += spd;

                    per = GetPeriod(data, m_Note);
                    per += m_PTPchSldNote;
                    per -= m_PTPchSldToNote;

                    if (per >= 0) {
                        m_PTPchSldNote -= per;
                        m_PTPchSldToNote = -1;
                    }
                }
            }
        }
    }
}

unsigned short CPlayInst::GetPeriod(MLModule* data, short note) {
    note += m_VibNote;
    note += m_PchSldNote;
    note += m_ArpPchSldNote;
    note += m_SemiTone;
    note += m_FineTune;
    note += m_PchAdd;

    if (m_Transpose != 0) {
        note += m_Transpose;
    }

    if (note < -32) {
        note = -32;
    } else if (note > ((5 * 12 + 6) * 32)) {
        note = (5 * 12 + 6) * 32;
    }

    return (PalPitchTable[note]);
}

void CPlayInst::SlideArpNote(MLModule* data) {
    short arp;

    if (m_ArpPchSld != 0) {
        if (m_ArpPchSldToNote >= 0) {
            if (m_ArpPchSldType == 0) {
                // slideup
                m_ArpPchSldNote += m_ArpPchSldSpd;

                arp = m_ArpNote + m_ArpPchSldNote - m_ArpPchSldToNote;

                if (arp >= 0) {
                    m_ArpPchSldNote -= arp;
                    m_ArpPchSldToNote = -1;
                }
            } else {
                // slidedown
                m_ArpPchSldNote -= m_ArpPchSldSpd;

                arp = m_ArpNote + m_ArpPchSldNote - m_ArpPchSldToNote;

                if (arp <= 0) {
                    m_ArpPchSldNote -= arp;
                    m_ArpPchSldToNote = -1;
                }
            }
        }
    }
}

void CPlayInst::SlideVol(MLModule* data) {
    short vol;

    if (m_VolSld == fx_VolumeSlideToVol) {
        if (m_VolSldToVolOff == 0) {
            if (m_VolSldType == 0) {
                // slideup
                vol = m_Volume1 + m_VolSldSpd;

                if (vol > m_VolSldToVol) {
                    vol = m_VolSldToVol;
                    m_VolSldToVolOff = 1;
                }

                m_Volume1 = vol;
                m_Volume2 = vol;
                m_Volume3 = vol;
            } else {
                // slidedown
                vol = m_Volume1 - m_VolSldSpd;

                if (vol < m_VolSldToVol) {
                    vol = m_VolSldToVol;
                    m_VolSldToVolOff = 1;
                }

                m_Volume1 = vol;
                m_Volume2 = vol;
                m_Volume3 = vol;
            }
        }
    } else if ((m_VolSld == fx_VolumeSlideUp) || ((m_VolSld == fx_PTVolSlideUp) && ((m_Play & (1 << 1)) == 0))) {
        vol = m_Volume1 + m_VolSldSpd;

        if (vol > (64 * 16)) {
            vol = 64 * 16;
        }

        m_Volume1 = vol;
        m_Volume2 = vol;
        m_Volume3 = vol;
    } else if ((m_VolSld == fx_VolumeSlideDown) || ((m_VolSld == fx_PTVolSlideDown) && ((m_Play & (1 << 1)) == 0))) {
        vol = m_Volume1 - m_VolSldSpd;

        if (vol < 0) {
            vol = 0;
        }

        m_Volume1 = vol;
        m_Volume2 = vol;
        m_Volume3 = vol;
    }
}

void CPlayInst::SlideChannelVol(MLModule* data) {
    short vol;

    if (m_CVolSld == fx_ChannelVolSlideToVol) {
        if (m_CVolSldToVolOff == 0) {
            if (m_CVolSldType == 0) {
                // slideup
                vol = m_CVolume + m_CVolSldSpd;

                if (vol > m_CVolSldToVol) {
                    vol = m_CVolSldToVol;
                    m_CVolSldToVolOff = 1;
                }

                m_CVolume = vol;
            } else {
                // slidedown
                vol = m_CVolume - m_CVolSldSpd;

                if (vol < m_CVolSldToVol) {
                    vol = m_CVolSldToVol;
                    m_CVolSldToVolOff = 1;
                }

                m_CVolume = vol;
            }
        }
    } else if (m_CVolSld == fx_ChannelVolSlideUp) {
        vol = m_CVolume + m_CVolSldSpd;

        if (vol > (64 * 16)) {
            vol = 64 * 16;
        }

        m_CVolume = vol;
    } else if (m_CVolSld == fx_ChannelVolSlideDown) {
        vol = m_CVolume - m_CVolSldSpd;

        if (vol < 0) {
            vol = 0;
        }

        m_CVolume = vol;
    }
}

void CPlayInst::SlideMasterVol(MLModule* data) {
    short vol;

    if (m_MVolSld == fx_MasterVolSlideToVol) {
        if (m_MVolSldToVolOff == 0) {
            if (m_MVolSldType == 0) {
                // slide up (ASM .slideup: add speed)
                vol = data->m_MasterVol + m_MVolSldSpd;

                if (vol > m_MVolSldToVol) {
                    vol = m_MVolSldToVol;
                    m_MVolSldToVolOff = 1;
                }

                data->m_MasterVol = vol;
            } else {
                // slide down (ASM .slidedown: sub speed)
                vol = data->m_MasterVol - m_MVolSldSpd;

                if (vol < m_MVolSldToVol) {
                    vol = m_MVolSldToVol;
                    m_MVolSldToVolOff = 1;
                }

                data->m_MasterVol = vol;
            }
        }
    } else if (m_MVolSld == fx_MasterVolSlideUp) {
        vol = data->m_MasterVol + m_MVolSldSpd;

        if (vol > (64 * 16)) {
            vol = 64 * 16;
        }

        data->m_MasterVol = vol;
    } else if (m_MVolSld == fx_MasterVolSlideDown) {
        vol = data->m_MasterVol - m_MVolSldSpd;

        if (vol < 0) {
            vol = 0;
        }

        data->m_MasterVol = vol;
    }
}

void CPlayInst::SlideArpVol(MLModule* data) {
    short vol;

    if (m_ArpVolSld == 4) {
        vol = m_Volume1 + m_ArpVolSldSpd;

        if (vol > (64 * 16)) {
            vol = 64 * 16;
        }

        m_Volume1 = vol;
        m_Volume2 = vol;
        m_Volume3 = vol;
    } else if (m_ArpVolSld == 5) {
        vol = m_Volume1 - m_ArpVolSldSpd;

        if (vol < 0) {
            vol = 0;
        }

        m_Volume1 = vol;
        m_Volume2 = vol;
        m_Volume3 = vol;
    }
}

void CPlayInst::ArpeggioPlay(MLModule* data) {
    struct Inst* inst;
    struct Arpg* arpg;
    struct Smpl* smpl;
    struct ArpgLine* aline;
    unsigned char spd;
    char nte;
    unsigned char smp;
    float* samp;
    unsigned short slen;
    int i;

    if (((m_Arp & (1 << 2)) != 0) || ((m_Arp & (1 << 0)) != 0)) {
        m_ArpSpdCnt -= 1;

        if (m_ArpSpdCnt == 0) {
            inst = m_InstPtr;

            spd = inst->Arp.Speed;

            m_ArpgGrv ^= 1;

            if (m_ArpgGrv != 0) {
                if (inst->Arp.Groove != 0) {
                    spd = inst->Arp.Groove;
                }
            }

            m_ArpSpdCnt = spd;

            if ((m_Arp & (1 << 2)) == 0) {
                arpg = data->m_ArpgList[inst->Arp.Table];
            } else {
                arpg = data->m_ArpgList[m_ArpTab];
            }

            if (arpg) {
                while (1) {
                    unsigned char pos;

                    pos = m_ArpPos;

                    m_ArpPos += 1;
                    m_ArpPos &= 0x7f;

                    aline = &arpg->Data[pos];

                    nte = (char)aline->Note;

                    if ((m_ArpWait != 0) && (nte == 0)) {
                        return;
                    }

                    if (nte == 61) {
                        // end
                        m_Arp = 0;
                        m_Note = m_ArpNote;

                        return;
                    }

                    if (nte == 62) {
                        // jump
                        if (aline->Smpl != pos) {
                            m_ArpPos = aline->Smpl;
                        }
                        continue;
                    }

                    break;
                }

                smp = aline->Smpl;

                if (smp == 0) {
                    m_WsNumber = inst->Smpl.Number;
                } else {
                    m_WsNumber = smp;
                }

                m_Restart = 0;
                m_ArpPchSld = 0;
                m_ArpVolSld = 0;

                for (i = 0; i < 2; i++) {
                    unsigned char cmd;
                    unsigned char arg;

                    cmd = (aline->Fx[i] >> 8);
                    arg = aline->Fx[i] & 0xff;

                    switch (cmd) {
                        case 0:
                            ArpRts(data, cmd, arg);
                            break;
                        case 1:
                            ArpSldUp(data, cmd, arg);
                            break;
                        case 2:
                            ArpSldDwn(data, cmd, arg);
                            break;
                        case 3:
                            ArpSetVol(data, cmd, arg);
                            break;
                        case 4:
                            ArpSldVol(data, cmd, arg);
                            break;
                        case 5:
                            ArpSldVol(data, cmd, arg);
                            break;
                        case 6:
                            ArpRestart(data, cmd, arg);
                            break;
                    }
                }

                m_Arp &= ~(1 << 5);

                if (nte != 0) {
                    if (nte >= 0) {
                        m_Arp |= (1 << 5);
                    } else {
                        nte += 61;
                        nte += m_ArpgNote;
                    }

                    m_ArpNote = nte << 5;
                    m_Note = nte << 5;
                    m_ArpPchSldNote = 0;

                    if ((m_ArpWait & (1 << 0)) != 0) {
                        m_ArpWait &= ~(1 << 0);

                        // wait
                        if (smp != 0) {
                            smpl = data->m_SmplList[smp];

                            if (smpl) {
                                m_WsPtr = smpl;
                                m_Arp |= (1 << 3);
                            }
                        }

                        PlayInst(data);
                    } else if ((m_Restart & (1 << 1)) != 0) {
                        // restart
                        m_Arp |= (1 << 1);

                        if (smp == 0) {
                            PlayInst(data);
                        } else {
                            smpl = data->m_SmplList[smp];

                            if (smpl) {
                                m_WsPtr = smpl;
                                m_Arp |= (1 << 3);
                                PlayInst(data);
                            }
                        }
                    } else if (smp == 0) {
                        m_SemiTone = inst->Smpl.SemiTone << 5;

                        if ((m_Play & (1 << 2)) == 0) {
                            m_FineTune = inst->Smpl.FineTune;
                        }
                    } else {
                        m_Play |= (1 << 0);

                        smpl = data->m_SmplList[smp];

                        if (smpl) {
                            m_SemiTone = smpl->SemiTone << 5;

                            if ((m_Play & (1 << 2)) == 0) {
                                m_FineTune = smpl->FineTune;
                            }

                            samp = smpl->fPointer;

                            m_WaveOrSample = smpl->Type;

                            if (m_WaveOrSample != 0) {
                                if (inst->Smpl.Type != 0) {
                                    m_WaveOrSample = inst->Smpl.Type;
                                } else {
                                    m_WaveOrSample = 3;
                                }

                                m_WsPointer = samp;
                                m_WsRepPointer = samp;
                                m_WsRepPtrOrg = samp;
                                m_WsLength = inst->Smpl.Length;
                                m_WsRepLength = inst->Smpl.Length;
                            } else {
                                m_WsPointer = samp;
                                m_WsLength = smpl->Length;

                                if (smpl->RepLength == 0) {
                                    samp = &ZeroSample[0];
                                    slen = 1;
                                } else {
                                    samp = smpl->fRepPointer;
                                    slen = smpl->RepLength;
                                }

                                m_WsRepPointer = samp;
                                m_WsRepPtrOrg = samp;
                                m_WsRepLength = slen;
                            }

                            if ((m_WsRepLength != 8) && (m_WsRepLength != 16) && (m_WsRepLength != 32)
                                && (m_WsRepLength != 64) && (m_WsRepLength != 128)) {
                                for (int i = inst_TRANSFORM; i < (inst_FILTER + 1); i++)
                                    m_Effects[i] = false;
                            } else {
                                for (int i = inst_TRANSFORM; i < (inst_FILTER + 1); i++)
                                    m_Effects[i] = inst->Effects[i];
                            }
                        }
                    }
                }
            }
        }
    }
}

// ADSR envelope implementation matching Mline116.asm:12850-12882
// Uses signed 16-bit arithmetic to match 68000 behavior.
// Speed values (AttSpd, DecSpd, etc.) can be negative for decay/release phases.
void CPlayInst::ADSRPlay(MLModule* data) {
    struct iEnv* env;
    unsigned short vol;

    if (m_Effects[inst_ADSR]) {
        env = &m_ADSRData;

        if (env->AttLen != 0) {
            env->AttLen -= 1;

            m_ADSRVolume += env->AttSpd;

            if (env->AttLen != 0) {
                // ASM uses lsr #8 (logical shift) - Mline116.asm:12873
                vol = u16(m_ADSRVolume) >> 8;
            } else {
                vol = env->AttVol;
            }
        } else if (env->DecLen != 0) {
            env->DecLen -= 1;

            m_ADSRVolume += env->DecSpd;

            if (env->DecLen != 0) {
                vol = u16(m_ADSRVolume) >> 8;
            } else {
                vol = env->DecVol;
            }
        } else if (env->SusLen != 0) {
            env->SusLen -= 1;

            m_ADSRVolume += env->SusSpd;

            if (env->SusLen != 0) {
                vol = u16(m_ADSRVolume) >> 8;
            } else {
                vol = env->SusVol;
            }
        } else {
            if ((m_EffectsPar1 & (1 << ADSRHOLDSUSTAIN)) != 0) {
                vol = env->SusVol;
            } else {
                if (env->RelLen != 0) {
                    env->RelLen -= 1;

                    m_ADSRVolume += env->RelSpd;

                    if (env->RelLen != 0) {
                        vol = u16(m_ADSRVolume) >> 8;
                    } else {
                        vol = env->RelVol;
                    }
                } else {
                    vol = env->RelVol;
                }
            }
        }

        m_Volume3 = (vol * m_Volume2) >> 6;
    }
}

void CPlayInst::TremoloPlay(MLModule* data) {
    unsigned short pos;
    short tre;
    short vol;

    if (m_Tre != fx_PTTremolo) {
        if ((m_Tre != 0) || (m_Effects[inst_TREMOLO] && !m_TreCmdDelay)) {
            if (m_TreAtkLength == 0) {
                m_TreCmdDepth = m_TreDepth;
            } else {
                m_TreCmdDepth += m_TreAtkSpeed;

                m_TreAtkLength -= 1;

                if (m_TreAtkLength == 0) {
                    m_TreCmdDepth = m_TreDepth;
                }
            }

            pos = m_TreCount >> 2;

            switch (m_TreWaveNum & 3) {
                case 0: /* sine */
                    tre = Sine[pos];
                    break;

                case 1: /* down */
                    tre = DownRamp[pos];
                    break;

                case 2: /* saw */
                    tre = SawTooth[pos];
                    break;

                case 3: /* square */
                    tre = Square[pos];
            }

            if (m_TreDir == 0) {
                tre = -tre;
            }

            tre = (tre * (m_TreCmdDepth >> 8)) >> 1;

            if (tre < 0) {
                tre += 16;
            }

            vol = m_Volume1;

            if (vol != 0) {
                vol += tre;

                if (vol < 0) {
                    vol = 0;
                } else if (vol > (64 * 16)) {
                    vol = (64 * 16);
                }
            }

            m_Volume2 = vol;
            m_Volume3 = vol;

            m_TreCount = (m_TreCount + m_TreCmdSpeed) & 0x1ff;
        } else {
            if (m_Effects[inst_TREMOLO]) {
                if (m_TreCmdDelay != 0) {
                    m_TreCmdDelay -= 1;
                }
            }
        }
    } else {
        // PTTremoloPlay

        if ((m_Play & (1 << 1)) == 0) {
            pos = (m_PTTrePos >> 2) & 0x001f;

            switch (m_PTTreWave & 3) {
                case 0: /* sine */
                    tre = PTVibratoTable[pos];
                    break;

                case 1: /* rampdown */
                    if (m_PTTrePos < 128) {
                        tre = pos << 3;
                    } else {
                        tre = 255 - (pos << 3);
                    }
                    break;

                default:
                    tre = 255;
                    break;
            }

            tre = (tre * (m_PTTreCmd & 15)) >> 2;

            if (m_PTTrePos < 128) {
                if (tre < 0) {
                    tre = -tre;
                }
            } else {
                if (tre > 0) {
                    tre = -tre;
                }
            }

            vol = m_Volume1;

            if (vol != 0) {
                vol += tre;

                if (vol < 0) {
                    vol = 0;
                } else if (vol > (64 * 16)) {
                    vol = (64 * 16);
                }
            }

            m_Volume2 = vol;
            m_Volume3 = vol;

            m_PTTrePos = (m_PTTrePos + ((m_PTTreCmd >> 2) & 0x3C)) & 0xFF;
        }
    }
}

void CPlayInst::VibratoPlay(MLModule* data) {
    unsigned short pos;
    short vib;

    if (m_Vib != fx_PTVibrato) {
        if ((m_Vib != 0) || (m_Effects[inst_VIBRATO] && m_VibCmdDelay == 0)) {
            if (m_VibAtkLength == 0) {
                m_VibCmdDepth = m_VibDepth;
            } else {
                m_VibCmdDepth += m_VibAtkSpeed;

                m_VibAtkLength -= 1;

                if (m_VibAtkLength == 0) {
                    m_VibCmdDepth = m_VibDepth;
                }
            }

            pos = m_VibCount >> 2;

            switch (m_VibWaveNum & 3) {
                case 0: /* sine */
                    vib = Sine[pos];
                    break;

                case 1: /* down */
                    vib = DownRamp[pos];
                    break;

                case 2: /* saw */
                    vib = SawTooth[pos];
                    break;

                case 3: /* square */
                    vib = Square[pos];
            }

            if (m_VibDir == 0) {
                vib = -vib;
            }

            vib = (vib * (m_VibCmdDepth >> 8)) >> 4;

            if (vib < 0) {
                vib += 1;
            }

            m_VibNote = vib;

            m_VibCount = (m_VibCount + m_VibCmdSpeed) & 0x1ff;
        } else {
            if (m_Effects[inst_VIBRATO]) {
                if (m_VibCmdDelay != 0) {
                    m_VibCmdDelay -= 1;
                }
            }
        }
    } else {
        // PTVibratoPlay

        if ((m_Play & (1 << 1)) == 0) {
            pos = (m_PTVibPos >> 2) & 0x001f;

            switch (m_PTVibWave & 3) {
                case 0: /* sine */
                    vib = PTVibratoTable[pos];
                    break;

                case 1: /* rampdown */
                    if (m_PTVibPos < 128) {
                        vib = pos << 3;
                    } else {
                        vib = 255 - (pos << 3);
                    }
                    break;

                default:
                    vib = 255;
                    break;
            }

            vib = (vib * (m_PTVibCmd & 15)) >> 7;

            if (m_PTVibPos < 128) {
                if (vib < 0) {
                    vib = -vib;
                }
            } else {
                if (vib > 0) {
                    vib = -vib;
                }
            }

            m_PTVibNote = vib;

            m_PTVibPos = (m_PTVibPos + ((m_PTVibCmd >> 2) & 0x3C)) & 0xFF;
        }
    }
}

void CPlayInst::OneWayCounter(MLModule* data, struct Counter* count) {
    if ((count->step == 0) && (count->delay != 0)) {
        count->delay -= 1;
    } else {
        count->counter = (count->counter + count->speed) & 0x01ff;
    }
}

void CPlayInst::Counter(MLModule* data, struct Counter* count) {
    long cnt;

    if ((count->step == 0) && (count->delay != 0)) {
        count->delay -= 1;
    } else {
        if (count->turns >= 0) {
            cnt = count->counter;

            if (count->repeat < count->repeatend) {
                // normal
                if (count->speed < 0) {
                    // nsub
                    cnt += count->speed;

                    if (count->repeat > cnt) {
                        if (count->turns != 0) {
                            count->turns -= 1;

                            if (count->turns == 0) {
                                count->turns = -1;
                            }
                        }

                        cnt -= count->speed;
                        count->speed = -count->speed;
                    }
                } else {
                    // nadd
                    cnt += count->speed;

                    if (count->repeatend < cnt) {
                        if (count->turns != 0) {
                            count->turns -= 1;

                            if (count->turns == 0) {
                                count->turns = -1;
                            }
                        }

                        cnt -= count->speed;
                        count->speed = -count->speed;
                    }
                }
            } else {
                // inverted
                if (count->speed < 0) {
                    // isub
                    cnt += count->speed;

                    if (count->repeatend > cnt) {
                        if (count->turns != 0) {
                            count->turns -= 1;

                            if (count->turns == 0) {
                                count->turns = -1;
                            }
                        }

                        cnt -= count->speed;
                        count->speed = -count->speed;
                    }
                } else {
                    // iadd
                    cnt += count->speed;

                    if (count->repeat < cnt) {
                        if (count->turns != 0) {
                            count->turns -= 1;

                            if (count->turns == 0) {
                                count->turns = -1;
                            }
                        }

                        cnt -= count->speed;
                        count->speed = -count->speed;
                    }
                }
            }

            count->counter = (unsigned short)cnt;
        }
    }
}

void CPlayInst::RemovePitchEffects(void) {
    m_PTPchSld = 0;
    m_PchSld = 0;
    m_VolSld = 0;
    m_PartNote = 0;

    m_Vib = 0;
    m_Tre = 0;
}
