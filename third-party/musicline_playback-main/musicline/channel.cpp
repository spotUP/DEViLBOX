#include "enums.h"
#include "sfx.h"
#include "structs.h"
#include "tables.h"

void Channel::PlayEffects(MLModule* data) {
    int numof = 1;
    if (numof < m_InstNumOf)
        numof = m_InstNumOf;
    int inst = m_InstNum;
    for (int i = 0; i < numof; i++) {
        m_InstNum = i;
        // if (!m_Instrument[i].m_pSfx)
        //     int b = 0;
        //		if(bPlay)
        //		m_Instrument[i].CheckInst(data);
        m_Instrument[i].PlayEffects(data);
    }
    m_InstNum = inst;
}

void Channel::PlayVoice(MLModule* data) {
    struct ChnlLine* cline;
    struct Part* part;
    struct PartLine* pline;
    unsigned char spd;
    unsigned char pos;
    unsigned char nte = 0;
    //	unsigned char cmd;
    //	unsigned char arg;
    int i, j;

    if (!m_pChnl)
        m_VoiceOff = true;

    if (m_VoiceOff == 0) {
        m_SpdCnt -= 1;

        if (m_SpdCnt == 0) {
            m_PartPosWork = m_PartPos;

            spd = m_Spd;

            m_PartGrv ^= 1;

            if (m_PartGrv != 0) {
                if (m_Grv != 0) {
                    spd = m_Grv;
                }
            }

            m_SpdCnt = spd;
            m_SpdPart = 0;
            m_GrvPart = 0;

            for (i = 0; i < 256; i++) {
                pos = m_TunePos;
                if (!data->m_bPlay) {
                    if (m_TunePos == data->m_nChannelPosCheck && (int)data->m_ChannelNum == (int)data->m_nChannelCheck)
                        data->m_bPlay = true;
                }

                if (pos == data->m_TunePos) {
                    m_PlayError |= (1 << 1);
                }

                cline = &m_pChnl->Data[pos];

                if (cline->_Fx.iscom != 0) {
                    //					arg = cline->Fx & 0x1f;

                    if (cline->_Fx.command == 1) {
                        // end
                        m_VoiceOff = 1;
                        m_PlayError |= (1 << 0);
                        break;
                    } else if (cline->_Fx.command == 2) {
                        // jump
                        if (m_TuneJumpCount != 0) {
                            m_TuneJumpCount -= 1;

                            if (m_TuneJumpCount != 0) {
                                m_TunePos = cline->_Fx.data;
                                continue;
                            } else {
                                m_TunePos += 1;
                                continue;
                            }
                        } else {
                            if (pos > cline->_Fx.data) {
                                m_TuneJumpCount = cline->_Fx.hi;

                                if (m_TuneJumpCount == 0) {
                                    m_PlayError |= (1 << 0);
                                }

                                m_TunePos = cline->_Fx.data;
                                continue;
                            } else {
                                m_TunePos += 1;
                                continue;
                            }
                        }
                    } else if (cline->_Fx.command == 3) {
                        // wait
                        if (m_TuneWait != 0) {
                            m_TuneWait -= 1;

                            if (m_TuneWait == 0) {
                                m_TunePos += 1;
                                continue;
                            } else {
                                break;
                            }
                        } else {
                            m_TuneWait = cline->_Fx.data;

                            if (m_TuneWait != 0) {
                                // TODO: this looks really incorrect
                                // original code: for (int j = 0; i < 4; i++) {
                                for (int i = 0; i < 4; i++) {
                                    m_Instrument[i].RemovePitchEffects();
                                }

                                if (cline->_Fx.hi != 0) {
                                    m_Spd = cline->_Fx.hi;
                                    m_SpdCnt = cline->_Fx.hi;
                                }
                                break;
                            } else {
                                m_TunePos += 1;
                                continue;
                            }
                        }
                    }
                }
                m_PartNum = (cline->_Fx.command << 8) | cline->_Fx.data;
                m_TransposeNum = cline->_Fx.hi - 0x10;
                part = data->m_PartList[m_PartNum];

                while (1) {
                    pos = m_PartPos;

                    m_PartPos += 1;
                    m_PartPos &= 0x7f;

                    if (m_PartPos == 0) {
                        m_TunePos += 1;
                        m_Spd = data->m_TuneSpd;
                        m_Grv = data->m_TuneGrv;
                    }

                    pline = &part->Data[pos];

                    m_PartNote = pline->Note;
                    m_PartInst = pline->Inst;

                    for (j = 0; j < 5; j++) {
                        m_PartEffects[j] = pline->Fx[j];
                    }

                    nte = m_PartNote;

                    if (nte == 127) {
                        // end of part (ASM: .partend cmp.b #61,d1; loaded as 127 after 61→127 conversion)
                        if (pos == 0) {
                            data->EndTune();
                            return;
                        } else {
                            m_PartPos = 0;
                            m_PartPosWork = 0;
                            m_Spd = data->m_TuneSpd;
                            m_Grv = data->m_TuneGrv;
                            m_SpdCnt = m_Spd;
                            m_TunePos += 1;
                            break;
                        }
                    }
                    if (data->m_nNote) {
                        nte = data->m_nNote;
                        m_PartNote = data->m_nNote;
                    }
                    if (data->m_nInst)
                        m_PartInst = data->m_nInst;
                    data->m_nNote = 0;
                    data->m_nInst = 0;

                    if ((nte & (1 << 7)) != 0) {
                        nte &= ~(1 << 7);

                        // jump
                        if (m_PartJmpCnt != 0) {
                            m_PartJmpCnt -= 1;

                            if (m_PartJmpCnt != 0) {
                                m_PartPos = nte;
                                m_PartPosWork = nte;
                            }
                        } else {
                            if (pos > nte) {
                                m_PartJmpCnt = m_PartInst;

                                if (m_PartJmpCnt == 0) {
                                    m_PlayError |= (1 << 0);
                                }

                                m_PartPos = nte;
                                m_PartPosWork = nte;
                            }
                        }
                    } else {
                        // playinst
                        if (nte != 0) {
                            m_Instrument[m_InstNum].RemovePitchEffects();
                            m_Instrument[m_InstNum].m_PartInst = 0;
                            m_Instrument[m_InstNum].m_PartNote = 0;
                            for (j = 0; j < 5; j++) {
                                m_Instrument[m_InstNum].m_PartEffects[j] = 0;
                            }
                            m_InstNum++;
                            if (m_InstNum > m_InstNumOf)
                                m_InstNum = 0;
                            m_Instrument[m_InstNum].m_Chord_Period1 = 0;
                            m_Instrument[m_InstNum].m_Chord_Period2 = 0;
                            m_Instrument[m_InstNum].m_Chord_Period3 = 0;
                            m_Instrument[m_InstNum].m_Transpose = m_TransposeNum << 5;
                            m_Instrument[m_InstNum].m_PartInst = m_PartInst;
                            m_Instrument[m_InstNum].m_PartNote = m_PartNote;
                            m_Instrument[m_InstNum].m_Sfx.m_bNewNote = true;
                            m_Instrument[m_InstNum].m_SpecialVolume = 1.0f;
                        } else {
                            // No note: update PartNote/PartInst from pattern data
                            // ASM loads ch_PartNote/ch_PartInst from pattern data every row
                            // (Mline116.asm:9782), so they are 0 for empty rows.
                            // Without this, stale values cause PlayInst to reset Volume1.
                            m_Instrument[m_InstNum].m_PartNote = m_PartNote;
                            m_Instrument[m_InstNum].m_PartInst = m_PartInst;
                        }
                        for (j = 0; j < 5; j++) {
                            m_Instrument[m_InstNum].m_PartEffects[j] = m_PartEffects[j];
                        }
                        m_Instrument[m_InstNum].CheckInst(data);
                        return;
                    }
                }
            }
        }
    }
}

void Channel::PlayPattern(MLModule* data, int pattern) {
    struct Part* part;
    PartLine* pline;
    int j;
    int spd;
    int pos;
    int nte = 0;

    // Debug: Log ch0 pattern playback early ticks
    if (!m_pChnl)
        m_VoiceOff = true;

    if (m_VoiceOff == 0) {
        m_SpdCnt -= 1;

        if (m_SpdCnt == 0) {
            m_PartPosWork = m_PartPos;

            spd = m_Spd;

            m_PartGrv ^= 1;

            if (m_PartGrv != 0) {
                if (m_Grv != 0) {
                    spd = m_Grv;
                }
            }

            m_SpdCnt = spd;
            m_SpdPart = 0;
            m_GrvPart = 0;
            //			if(pattern)
            m_PartNum = pattern;
            m_TransposeNum = 0x00;
            part = data->m_PartList[m_PartNum];

            while (1) {
                pos = m_PartPos;

                m_PartPos += 1;
                m_PartPos &= 0x7f;

                if (m_PartPos == 0) {
                    m_Spd = data->m_TuneSpd;
                    m_Grv = data->m_TuneGrv;
                }

                pline = &part->Data[pos];

                m_PartNote = pline->Note;
                m_PartInst = pline->Inst;

                for (j = 0; j < 5; j++) {
                    m_PartEffects[j] = pline->Fx[j];
                }

                nte = m_PartNote;

                if (nte == 127) {
                    // end of part (ASM: .partend cmp.b #61,d1; loaded as 127 after 61→127 conversion)
                    m_PartPos = 0;
                    m_PartPosWork = 0;
                    m_Spd = data->m_TuneSpd;
                    m_Grv = data->m_TuneGrv;
                    m_SpdCnt = m_Spd;
                }
                if (data->m_nNote) {
                    nte = data->m_nNote;
                    m_PartNote = data->m_nNote;
                }
                if (data->m_nInst)
                    m_PartInst = data->m_nInst;
                data->m_nNote = 0;
                data->m_nInst = 0;

                if ((nte & (1 << 7)) != 0) {
                    nte &= ~(1 << 7);

                    // jump
                    if (m_PartJmpCnt != 0) {
                        m_PartJmpCnt -= 1;

                        if (m_PartJmpCnt != 0) {
                            m_PartPos = nte;
                            m_PartPosWork = nte;
                        }
                    } else {
                        if (pos > nte) {
                            m_PartJmpCnt = m_PartInst;

                            if (m_PartJmpCnt == 0) {
                                m_PlayError |= (1 << 0);
                            }

                            m_PartPos = nte;
                            m_PartPosWork = nte;
                        }
                    }
                } else {
                    if (nte != 0) {
                        //						m_Instrument[InstNum].RemovePitchEffects();
                        m_Instrument[m_InstNum].m_PartInst = 0;
                        m_Instrument[m_InstNum].m_PartNote = 0;
                        for (j = 0; j < 5; j++) {
                            m_Instrument[m_InstNum].m_PartEffects[j] = 0;
                        }
                        m_InstNum++;
                        if (m_InstNum > m_InstNumOf - 1)
                            m_InstNum = 0;
                        m_Instrument[m_InstNum].m_Chord_Period1 = 0;
                        m_Instrument[m_InstNum].m_Chord_Period2 = 0;
                        m_Instrument[m_InstNum].m_Chord_Period3 = 0;
                        m_Instrument[m_InstNum].m_Transpose = m_TransposeNum << 5;
                        m_Instrument[m_InstNum].m_PartInst = m_PartInst;
                        m_Instrument[m_InstNum].m_PartNote = m_PartNote;
                        m_Instrument[m_InstNum].m_Sfx.m_bNewNote = true;
                        m_Instrument[m_InstNum].m_SpecialVolume = 1.0f;
                    } else {
                        // No note: update PartNote/PartInst from pattern data
                        // ASM loads ch_PartNote/ch_PartInst from pattern data every row
                        // (Mline116.asm:9782), so they are 0 for empty rows.
                        // Without this, stale values cause PlayInst to reset Volume1.
                        m_Instrument[m_InstNum].m_PartNote = m_PartNote;
                        m_Instrument[m_InstNum].m_PartInst = m_PartInst;
                    }
                    for (j = 0; j < 5; j++) {
                        m_Instrument[m_InstNum].m_PartEffects[j] = m_PartEffects[j];
                    }

                    m_Instrument[m_InstNum].CheckInst(data);
                    return;
                }
            }
        }
    }
}

void CPlayInst::CheckInst(MLModule* data) {
    struct Inst* inst;
    unsigned char ins = m_PartInst;

    if (ins) {
        inst = data->m_InstList[ins];

        if (inst) {
            m_InstPtr = inst;

            if (m_OldInst != ins) {
                m_Arp = 0;
                m_InstPchSld = 0;
                m_OldInst = ins;
            }
        }
    }

    InitPartFx();
    PlayPartFx(data);
    PlayArpg(data);
    PlayInst(data);
    PlaySpecialFx(data);
}
void CPlayInst::InitPartFx(void) {
    m_Play |= (1 << 1);
    // ASM (Mline116.asm:10039) clears ch_Vol unconditionally every row.
    // Without this, a SetVolume command's Vol value persists across rows,
    // overriding volume slide results on subsequent rows.
    m_Vol = 0;
    // Reset pan to default so we can detect if a pattern pan command is used this tick
    m_Sfx.m_fPan = 0.5f;
    m_Effects[inst_HOLDSUSTAIN] = false;
    m_Vib = 0;
    m_VibNote = 0;
    m_PTVibNote = 0;
    m_Tre = 0;
    m_VolAdd = 0;
    m_VolSld = 0;
    m_CVolSld = 0;
    m_MVolSld = 0;
    m_PchSld = 0;
    m_PTPchSld = 0;
    m_SmpOfs = 0;
    m_Restart = 0;
    m_Arp &= 0xf5;

    if ((m_Arp & (1 << 4)) != 0) {
        m_Arp &= ~(1 << 4);

        m_Arp = 0;
        m_ArpVolSld = 0;
        m_ArpPchSld = 0;
        m_ArpPchSldNote = 0;
    }

    if (m_PartNote != 0) {
        m_PchSldToNote = -1;
        m_PTPchSldToNote = -1;
        m_OldNote = m_PartNote;
    }
}

void CPlayInst::PlayPartFx(MLModule* data) {
    int i;
    // int numof = 1;
    for (i = 0; i < 5; i++) {
        if ((m_PartEffects[i] >> 8) < 0x50)
            PlayFx(data, (m_PartEffects[i] >> 8), m_PartEffects[i] & 0xff);
    }
}
void CPlayInst::PlaySpecialFx(MLModule* data) {
    int i;
    // int numof = 1;
    for (i = 0; i < 5; i++) {
        if ((m_PartEffects[i] >> 8) >= 0x50)
            PlayFx(data, (m_PartEffects[i] >> 8), m_PartEffects[i] & 0xff);
    }
}

void CPlayInst::PlayInst(MLModule* data) {
    struct Inst* inst;
    struct Smpl* smpl;
    unsigned char type;
    float* samp;
    unsigned short len;
    unsigned char bits;
    short vol;
    int i;
    if ((m_ArpWait & (1 << 0)) == 0) {
        inst = m_InstPtr;

        if (inst) {
            smpl = &inst->Smpl;

            if ((m_Restart & 3) != 0) {
                m_WsNumber = inst->Smpl.Number;
                type = inst->Smpl.Type;
            } else if (m_PartInst == 0) {
                goto playnote;
            } else if (m_PchSld == fx_Portamento) {
                goto getvol;
            } else if (m_PartNote == 0) {
                goto getvol;
            } else if ((m_Arp & (1 << 3)) == 0) {
                m_WsNumber = inst->Smpl.Number;
                type = inst->Smpl.Type;
            } else if (m_WsPtr) {
                smpl = m_WsPtr;

                if (smpl->Type != 0) {
                    type = inst->Smpl.Type;
                } else {
                    type = smpl->Type;
                }
            } else {
                return;
            }

            samp = smpl->fPointer;

            if (samp) {
                if (inst->Transpose == 0) {
                    m_Transpose = 0;
                }

                bits = inst->Tra.EnvTraPhaFilBits;

                if (m_Effects[inst_HOLDSUSTAIN]) {
                    // holdsus
                    bits &= 0xfe;
                    bits |= m_EffectsPar1 & 0x01;
                }

                m_EffectsPar1 = bits;
                m_EffectsPar2 = inst->Mix.ResLooBits;

                for (i = 0; i < inst_numOf; i++) {
                    m_Effects[i] = inst->Effects[i];
                }

                m_WaveOrSample = type;

                if (m_WaveOrSample) {
                    // Apply FixWaveLength for synthesized waveforms
                    // Only for standard 256-sample waveforms (smpl->Length == 128 words)
                    if (smpl->Length == 128) {
                        // Offsets and lengths based on WaveOrSample type (matching ASM FixWaveLength)
                        int offset = 0;
                        int length = smpl->Length; // in words (128 = 256 samples)
                        switch (m_WaveOrSample) {
                            case 1: // 16 samples at offset 480
                                offset = 480;
                                length = smpl->Length >> 4; // 128 >> 4 = 8 words = 16 samples
                                break;
                            case 2: // 32 samples at offset 448
                                offset = 448;
                                length = smpl->Length >> 3; // 128 >> 3 = 16 words = 32 samples
                                break;
                            case 3: // 64 samples at offset 384
                                offset = 384;
                                length = smpl->Length >> 2; // 128 >> 2 = 32 words = 64 samples
                                break;
                            case 4: // 128 samples at offset 256
                                offset = 256;
                                length = smpl->Length >> 1; // 128 >> 1 = 64 words = 128 samples
                                break;
                            case 5: // 256 samples at offset 0 (full waveform)
                            default:
                                offset = 0;
                                length = smpl->Length; // 128 words = 256 samples
                                break;
                        }
                        m_WsPointer = samp + offset;
                        m_WsRepPointer = samp + offset;
                        m_WsRepPtrOrg = samp + offset;
                        m_WsLength = length;
                        m_WsRepLength = length;
                    } else {
                        // Non-standard waveform - use as-is
                        m_WsPointer = samp;
                        m_WsRepPointer = samp;
                        m_WsRepPtrOrg = samp;
                        m_WsLength = smpl->Length;
                        m_WsRepLength = smpl->Length;
                    }

                } else {
                    // sample
                    len = smpl->Length;

                    if (m_SmpOfs) {
                        if ((m_SmplOfs << 7) < len) {
                            len -= m_SmplOfs << 7; // words!
                            samp += m_SmplOfs << 8;
                        } else {
                            len = 1;
                        }
                    }

                    m_WsPointer = samp;
                    m_WsLength = len;

                    samp = smpl->fRepPointer;
                    len = smpl->RepLength;

                    // Mline116.asm:10301-10310 - WSLOOP check for samples
                    // ASM logic:
                    //   10301: btst #3,ch_Arp(a4)     - test Arp bit 3
                    //   10302: beq.b .instlen         - if bit 3 clear, check WSLOOP
                    //   10303-10304: if bit 3 set, use RepLength and skip WSLOOP check
                    //   10306: btst #WSLOOP,inst_Effects1(a0) - test WSLOOP bit
                    //   10307: bne.b .wsloop          - if WSLOOP SET, branch (use normal repeat)
                    //   10308-10309: if WSLOOP NOT set, use ZeroSample
                    if ((m_Arp & (1 << 3)) != 0) {
                        // WaveSample effect active: only zero out if RepLength==0
                        if (len == 0) {
                            samp = &ZeroSample[0];
                            len = 1;
                        }
                    } else {
                        // No WaveSample effect: check WSLOOP
                        // WSLOOP=1 means loop IS enabled (use normal repeat)
                        // WSLOOP=0 means loop DISABLED (use ZeroSample)
                        if (!inst->Effects[inst_WSLOOP]) {
                            samp = &ZeroSample[0];
                            len = 1;
                        }
                    }

                    m_WsRepPointer = samp;
                    m_WsRepPtrOrg = samp;
                    m_WsRepLength = len;
                }

                m_Restart &= 7;

                if (m_Restart == 0) {
                getvol:
                    m_Volume1 = inst->Volume << 4;
                }
            playnote:
                if (m_Vol == 0) {
                    vol = m_Volume1;
                } else {
                    vol = m_VolSet;
                }

                if (m_VolAdd != 0) {
                    vol += m_VolAddNum;

                    if (vol < 0) {
                        vol = 0;
                    } else if (vol > (64 * 16)) {
                        vol = 64 * 16;
                    }
                }

                m_Volume1 = vol;
                m_Volume2 = vol;
                m_Volume3 = vol;

                if (m_PchSld != fx_Portamento) {
                    if (inst->SlideSpeed) {
                        if (m_PartNote) {
                            m_PchSldSpd = inst->SlideSpeed;
                            m_PchSldToNote = m_PartNote << 5;

                            if ((m_Note + m_PchSldNote) <= m_PchSldToNote) {
                                // slide up
                                m_PchSldType = 0;
                            } else {
                                // slide down
                                m_PchSldType = 1;
                            }

                            if (m_InstPchSld != 0) {
                                InstPlay(data, inst);

                                return;
                            } else {
                                m_InstPchSld = fx_Portamento;
                            }
                        }
                    }

                    if ((m_Arp & (1 << 1)) != 0) {
                        m_Arp &= ~(1 << 1);
                    } else {
                        if (m_PartNote) {
                            m_Note = m_PartNote << 5;

                            m_ArpVolSld = 0;
                            m_ArpPchSld = 0;
                            m_ArpPchSldNote = 0;
                        } else {
                            return;
                        }
                    }

                    m_SemiTone = smpl->SemiTone << 5;

                    if ((m_Play & (1 << 2)) == 0) {
                        m_FineTune = smpl->FineTune;
                    }

                    m_PTPchSldNote = 0;
                    m_PchSldNote = 0;
                    m_PTVibNote = 0;
                    m_PTTrePos = 0;
                    m_PTVibPos = 0;
                    m_VibNote = 0;
                    m_PTPchAdd = 0;
                    m_PchAdd = 0;

                    if ((m_PartInst) || ((m_Restart & 3))) {
                        InstPlay(data, inst);
                    }
                }
            }
        }
    }
}
