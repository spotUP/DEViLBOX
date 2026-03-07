#include "enums.h"
#include "structs.h"

void CPlayInst::ArpRts(MLModule* data, unsigned char cmd, unsigned char arg) {}

void CPlayInst::ArpSldUp(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_ArpPchSld = cmd;
    m_ArpPchSldType = 0;

    if (arg != 0) {
        m_ArpPchSldSpd = arg;
        m_ArpPchSldToNote = 59 * 32 + 32;
    }
}

void CPlayInst::ArpSldDwn(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_ArpPchSld = cmd;
    m_ArpPchSldType = 1;

    if (arg != 0) {
        m_ArpPchSldSpd = arg;
        m_ArpPchSldToNote = 0;
    }
}

void CPlayInst::ArpSetVol(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Restart |= (1 << 2);
    m_Volume1 = arg << 4;
    m_Volume2 = arg << 4;
    m_Volume3 = arg << 4;
}

void CPlayInst::ArpSldVol(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_ArpVolSld = cmd;

    if (arg != 0) {
        m_ArpVolSldSpd = arg;
    }
}

void CPlayInst::ArpRestart(MLModule* data, unsigned char cmd, unsigned char arg) {
    m_Restart |= (1 << 1);

    if ((m_EffectsPar1 & (1 << PHASEINIT)) != 0) {
        m_PhaInit = 0;
    }

    if ((m_EffectsPar1 & (1 << RESONANCEINIT)) != 0) {
        m_ResInit = 0;
    }

    if ((m_EffectsPar1 & (1 << FILTERINIT)) != 0) {
        m_FilInit = 0;
    }

    if ((m_EffectsPar1 & (1 << TRANSFORMINIT)) != 0) {
        m_TraInit = 0;
    }

    if ((m_EffectsPar1 & (1 << MIXINIT)) != 0) {
        m_MixInit = 0;
    }

    if ((m_EffectsPar2 & (1 << LOOPINIT)) != 0) {
        m_LooInit = 0;
    }
}

void CPlayInst::PlayArpg(MLModule* data) {
    struct Inst* inst;
    struct Arpg* arpg;
    struct Smpl* smpl;
    struct ArpgLine* aline;
    char nte;
    unsigned char smp;
    int i;

    if (m_PartNote != 0) {
        inst = m_InstPtr;

        if (inst) {
            m_ArpWait = 0;

            if (((m_Arp & (1 << 2)) == 0) && ((m_Arp & (1 << 0)) == 0)) {
                if (inst->Effects[ARPEGGIO]) {
                    m_Arp |= (1 << 0);
                }
            }

            if (((m_Arp & (1 << 2)) != 0) || ((m_Arp & (1 << 0)) != 0)) {
                if ((m_Restart != 0) || (m_PartInst != 0)) {
                    m_Arp |= (1 << 1);

                    if ((m_Arp & (1 << 2)) == 0) {
                        arpg = data->m_ArpgList[inst->Arp.Table]; // !!!
                    } else {
                        arpg = data->m_ArpgList[m_ArpTab];
                    }

                    if (arpg) {
                        m_ArpPos = 0;
                        m_ArpWait = 0;
                        m_ArpVolSld = 0;
                        m_ArpPchSld = 0;
                        m_ArpPchSldNote = 0;
                        m_ArpSpdCnt = inst->Arp.Speed;

                        while (1) {
                            unsigned char pos;

                            pos = m_ArpPos;

                            m_ArpPos += 1;
                            m_ArpPos &= 0x7f;

                            aline = &arpg->Data[pos];

                            m_ArpgNote = m_PartNote;

                            nte = (char)aline->Note;

                            if (nte == 0) {
                                m_ArpWait |= (1 << 0);
                                return;
                            }

                            if (nte == 61) {
                                // end
                                m_Effects[inst_ARPEGGIO] = false;
                                return;
                            }

                            if (nte == 62) {
                                // jump
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

                        for (i = 0; i < 2; i++) {
                            unsigned char cmd;
                            unsigned char arg;

                            cmd = (aline->Fx[i] >> 8);
                            arg = aline->Fx[i] & 0xff;

                            if (cmd < 6) // command #6 should not be executed at this point !
                            {
                                switch (cmd) {
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
                        }

                        if (nte >= 0) {
                            m_Arp |= (1 << 5);
                        } else {
                            nte += 61;
                            nte += m_ArpgNote;
                        }

                        m_Note = nte << 5;
                        m_ArpNote = nte << 5;

                        if (smp != 0) {
                            smpl = data->m_SmplList[smp];

                            if (smpl) {
                                m_WsPtr = smpl;
                                m_Arp |= (1 << 3);
                            }
                        }
                    }
                }
            }
        }
    }
}
