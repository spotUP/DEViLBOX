#include "enums.h"
#include "module.h"
#include "structs.h"
#include "tables.h"

void CPlayInst::PhasePlay(MLModule* data) {
    struct Counter* count;
    unsigned short len;
    unsigned short cnt;
    unsigned char* sizertab;
    unsigned short* sizeroff;
    float* ssamp;
    float* dsamp;
    int i, j;

    if (m_Effects[inst_PHASE]) {
        count = &m_PhaData;

        len = m_WsRepLength << 1;

        if ((m_EffectsPar1 & (1 << PHASESTEP)) != 0) {
            if ((m_EffectsPar1 & (1 << PHASEINIT)) == 0) {
                if (m_PartNote != 0) {
                    count->savecounter = count->counter;

                    Counter(data, count);
                }
            } else {
                if (m_PartNote != 0) {
                    count->savecounter = count->counter;
                }

                Counter(data, count);
            }
        } else {
            count->savecounter = count->counter;

            Counter(data, count);
        }

        cnt = count->savecounter;

        if ((m_EffectsPar1 & (1 << PHASESTEP)) != 0) {
            if (count->delay != 0) {
                count->delay -= 1;
            } else {
                int counter;

                counter = count->savecounter - (char)m_PhaSpd;

                if (counter < 2) {
                    counter = 2;
                } else if (counter > 512) {
                    counter = 512;
                }

                count->savecounter = counter;
            }
        }

        if (len > 128) {
            cnt += 1;
            cnt >>= 1;

            sizertab = &SizerTable256[0];
            sizeroff = &SizerOffset256[0];
        } else if (len > 64) {
            cnt += 3;
            cnt >>= 2;

            sizertab = &SizerTable128[0];
            sizeroff = &SizerOffset128[0];
        } else if (len > 32) {
            cnt += 7;
            cnt >>= 3;

            sizertab = &SizerTable64[0];
            sizeroff = &SizerOffset64[0];
        } else if (len > 16) {
            cnt += 15;
            cnt >>= 4;

            sizertab = &SizerTable32[0];
            sizeroff = &SizerOffset32[0];
        } else {
            cnt += 31;
            cnt >>= 5;

            sizertab = &SizerTable16[0];
            sizeroff = &SizerOffset16[0];
        }

        ssamp = m_WsRepPointer;
        dsamp = &m_PhaWaveBuffer[0];
        m_WsRepPointer = dsamp;
        if (!data->m_bPlay)
            return;

        if (m_Effects[inst_LOOP] || m_WaveOrSample) {
            m_WsPointer = dsamp;
        }

        if ((data->m_PlayBits & (1 << 1)) == 0) {
            if ((cnt >= len) || (cnt == 0)) {
                // Phase_Mova: straight copy (ASM: Mline116.asm:13369-13371)
                for (i = 0; i < len; i++) {
                    dsamp[i] = ssamp[i];
                }
            } else {
                sizertab += sizeroff[cnt - 1];
                // d1 = remaining samples after phase lookup (ASM: d1 = d6 - d0)
                int remaining = len - cnt;

                switch (m_PhaType) {
                    default: // Phase_Quick (ASM: Mline116.asm:13194-13215)
                    {
                        unsigned char* sizer_start = sizertab; // saved for PHASEFILL
                        unsigned char idx;

                        // Main loop: pure lookup
                        for (i = 0; i < cnt; i++) {
                            idx = *sizertab++;
                            dsamp[i] = ssamp[idx];
                        }

                        if ((m_EffectsPar1 & (1 << PHASEFILL)) == 0) {
                            // No fill: remaining samples get last lookup value
                            // ASM: move.b (a1,d0.w),d0 then loop2 fills with d0
                            if (remaining > 0) {
                                float last_val = ssamp[idx];
                                for (; i < len; i++) {
                                    dsamp[i] = last_val;
                                }
                            }
                        } else {
                            // Fill: copy from output buffer start (ASM: move.l d4,a1; move.b (a1)+,(a2)+)
                            if (remaining > 0) {
                                for (; i < len; i++) {
                                    dsamp[i] = dsamp[i - cnt];
                                }
                            }
                        }

                        break;
                    }

                    case 1: // Phase_High (ASM: Mline116.asm:13217-13268)
                    {
                        unsigned char* sizer_start = sizertab;
                        unsigned char idx;
                        // a0 = ssamp (sequential source)
                        int seq_pos = 0;

                        // Main loop: 75% lookup + 25% original
                        for (i = 0; i < cnt; i++) {
                            idx = *sizertab++;
                            dsamp[i] = (3.0f * ssamp[idx] + ssamp[seq_pos]) * 0.25f;
                            seq_pos++;
                        }

                        if ((m_EffectsPar1 & (1 << PHASEFILL)) == 0) {
                            // No fill: last lookup value * 3, blended with sequential
                            // ASM: move.b (a1,d0.w),d0; ext d0; move d0,d2; add d2,d2; add d2,d0
                            if (remaining > 0) {
                                float last_phase = ssamp[idx];
                                for (; i < len; i++) {
                                    dsamp[i] = (3.0f * last_phase + ssamp[seq_pos]) * 0.25f;
                                    seq_pos++;
                                }
                            }
                        } else {
                            // Fill: wrap SizerTable, continue blending with sequential
                            // ASM: fillagain loop resets a3=sizer_start, d7=d5(=cnt-1)
                            if (remaining > 0) {
                                sizertab = sizer_start;
                                int sizer_j = 0;
                                for (; i < len; i++) {
                                    idx = sizertab[sizer_j];
                                    dsamp[i] = (3.0f * ssamp[idx] + ssamp[seq_pos]) * 0.25f;
                                    seq_pos++;
                                    sizer_j++;
                                    if (sizer_j >= cnt)
                                        sizer_j = 0;
                                }
                            }
                        }

                        break;
                    }

                    case 2: // Phase_Med (ASM: Mline116.asm:13270-13314)
                    {
                        unsigned char* sizer_start = sizertab;
                        unsigned char idx;
                        int seq_pos = 0;

                        // Main loop: 50/50 blend
                        for (i = 0; i < cnt; i++) {
                            idx = *sizertab++;
                            dsamp[i] = (ssamp[idx] + ssamp[seq_pos]) * 0.5f;
                            seq_pos++;
                        }

                        if ((m_EffectsPar1 & (1 << PHASEFILL)) == 0) {
                            // No fill: last lookup value, blended with sequential
                            if (remaining > 0) {
                                float last_phase = ssamp[idx];
                                for (; i < len; i++) {
                                    dsamp[i] = (last_phase + ssamp[seq_pos]) * 0.5f;
                                    seq_pos++;
                                }
                            }
                        } else {
                            // Fill: wrap SizerTable, continue blending with sequential
                            if (remaining > 0) {
                                int sizer_j = 0;
                                for (; i < len; i++) {
                                    sizertab = sizer_start; // ASM resets a3 each outer loop
                                    idx = sizertab[sizer_j];
                                    dsamp[i] = (ssamp[idx] + ssamp[seq_pos]) * 0.5f;
                                    seq_pos++;
                                    sizer_j++;
                                    if (sizer_j >= cnt)
                                        sizer_j = 0;
                                }
                            }
                        }

                        break;
                    }

                    case 3: // Phase_Low (ASM: Mline116.asm:13316-13367)
                    {
                        unsigned char* sizer_start = sizertab;
                        unsigned char idx;
                        int seq_pos = 0;

                        // Main loop: 25% lookup + 75% original
                        for (i = 0; i < cnt; i++) {
                            idx = *sizertab++;
                            dsamp[i] = (ssamp[idx] + 3.0f * ssamp[seq_pos]) * 0.25f;
                            seq_pos++;
                        }

                        if ((m_EffectsPar1 & (1 << PHASEFILL)) == 0) {
                            // No fill: last lookup + sequential*3
                            // ASM: move.b (a1,d0.w),d0; ext d0; loop2: move.b (a0)+,d2; ext d2;
                            //      move d2,d3; add d3,d3; add d3,d2; add d0,d2; asr #2,d2
                            if (remaining > 0) {
                                float last_phase = ssamp[idx];
                                for (; i < len; i++) {
                                    dsamp[i] = (last_phase + 3.0f * ssamp[seq_pos]) * 0.25f;
                                    seq_pos++;
                                }
                            }
                        } else {
                            // Fill: wrap SizerTable, continue blending with sequential
                            // ASM: fillagain resets a3=sizer_start, d7=d5
                            if (remaining > 0) {
                                sizertab = sizer_start;
                                int sizer_j = 0;
                                for (; i < len; i++) {
                                    idx = sizertab[sizer_j];
                                    dsamp[i] = (ssamp[idx] + 3.0f * ssamp[seq_pos]) * 0.25f;
                                    seq_pos++;
                                    sizer_j++;
                                    if (sizer_j >= cnt)
                                        sizer_j = 0;
                                }
                            }
                        }

                        break;
                    }
                }
            }
        }
    }
}

void CPlayInst::MixPlay(MLModule* data) {
    struct Counter* count;
    unsigned short len;
    unsigned short cnt;
    unsigned short off;
    float bst;
    float* ssamp1;
    float* ssamp2;
    float* dsamp;
    int i;

    if (m_Effects[inst_MIX]) {
        count = &m_MixData;

        len = m_WsRepLength << 1;

        if ((m_EffectsPar2 & (1 << MIXSTEP)) != 0) {
            if ((m_EffectsPar2 & (1 << MIXINIT)) == 0) {
                if (m_PartNote != 0) {
                    count->savecounter = count->counter;

                    if ((m_EffectsPar2 & (1 << MIXCOUNTER)) != 0) {
                        // oneway
                        OneWayCounter(data, count);
                    } else {
                        // twoway
                        Counter(data, count);
                    }
                }
            } else {
                if (m_PartNote != 0) {
                    count->savecounter = count->counter;
                }

                if ((m_EffectsPar2 & (1 << MIXCOUNTER)) != 0) {
                    // oneway
                    OneWayCounter(data, count);
                } else {
                    // twoway
                    Counter(data, count);
                }
            }
        } else {
            count->savecounter = count->counter;

            if ((m_EffectsPar2 & (1 << MIXCOUNTER)) != 0) {
                // oneway
                OneWayCounter(data, count);
            } else {
                // twoway
                Counter(data, count);
            }
        }

        cnt = count->savecounter;

        if ((m_EffectsPar2 & (1 << MIXSTEP)) != 0) {
            if (count->delay != 0) {
                count->delay -= 1;
            } else {
                int counter;

                counter = count->savecounter + (char)m_MixSpd;

                if (counter < 0) {
                    counter = 0;
                } else if (counter > 510) {
                    counter = 510;
                }

                count->savecounter = counter;
            }
        }

        if (len > 128) {
            cnt >>= 1;
            off = 0;
        } else if (len > 64) {
            cnt >>= 2;
            off = 256;
        } else if (len > 32) {
            cnt >>= 3;
            off = 256 + 128;
        } else if (len > 16) {
            cnt >>= 4;
            off = 256 + 128 + 64;
        } else {
            cnt >>= 5;
            off = 256 + 128 + 64 + 32;
        }

        ssamp1 = m_WsRepPointer;
        ssamp2 = &m_MixWaveBuffer[0];

        if ((m_EffectsPar2 & (1 << MIXBUFF)) == 0) {
            ssamp2 = ssamp1;

            if (m_MixWaveNum != 0) {
                ssamp2 = data->m_SmplList[m_MixWaveNum]->fRepPointer + off;
            }
        }

        dsamp = &m_MixWaveBuffer[0];
        m_WsRepPointer = dsamp;

        if (m_WaveOrSample != 0) {
            m_WsPointer = dsamp;
        }
        if (!data->m_bPlay)
            return;

        if ((data->m_PlayBits & (1 << 1)) == 0) {
            // ASM: d4=1 (normal, shift right by 1 = average), d4=0 (boost, no shift)
            float scale = (m_MixResFilBoost & (1 << 2)) ? 1.0f : 0.5f;

            // Part 1: len-cnt samples, reads wave B at offset cnt
            // ASM: add d0,a1 (a1 points to secondary+cnt), d7 = len-cnt-1
            for (i = 0; i < (len - cnt); i++) {
                dsamp[i] = (ssamp1[i] + ssamp2[cnt + i]) * scale;
            }

            // Part 2: cnt samples, reads wave B from start (wrap-around)
            // ASM: move.l a3,a1 (reset to start of secondary), d7 = cnt-1
            if (cnt != 0) {
                for (i = 0; i < cnt; i++) {
                    int idx = (len - cnt) + i;
                    dsamp[idx] = (ssamp1[idx] + ssamp2[i]) * scale;
                }
            }
        }
    }
}

void CPlayInst::TransformPlay(MLModule* data) {
    struct Counter* count;
    unsigned short len;
    unsigned short cnt;
    unsigned short off;
    unsigned short tra;
    float* ssamp1;
    float* ssamp2;
    float* dsamp;
    int i;

    if (m_Effects[inst_TRANSFORM]) {
        count = &m_TraData;

        len = m_WsRepLength << 1;

        if (len == 256) {
            off = 0;
        } else if (len == 128) {
            off = 256;
        } else if (len == 64) {
            off = 256 + 128;
        } else if (len == 32) {
            off = 256 + 128 + 64;
        } else {
            off = 256 + 128 + 64 + 32;
        }

        if ((m_EffectsPar1 & (1 << TRANSFORMSTEP)) != 0) {
            if ((m_EffectsPar1 & (1 << TRANSFORMINIT)) == 0) {
                if (m_PartNote != 0) {
                    count->savecounter = count->counter;

                    Counter(data, count);
                }
            } else {
                if (m_PartNote != 0) {
                    count->savecounter = count->counter;
                }

                Counter(data, count);
            }
        } else {
            count->savecounter = count->counter;

            Counter(data, count);
        }

        cnt = count->savecounter;

        if ((m_EffectsPar1 & (1 << TRANSFORMSTEP)) != 0) {
            if (count->delay != 0) {
                count->delay -= 1;
            } else {
                int counter;

                counter = count->savecounter + (char)m_TraSpd;

                if (counter < 0) {
                    counter = 0;
                } else if (counter > 510) {
                    counter = 510;
                }

                count->savecounter = counter;
            }
        }

        cnt >>= 1;

        tra = 0;

        for (i = 0; i < 5; i++) {
            if (cnt <= 256) {
                break;
            }

            cnt -= 256;
            tra += 1;
        }

        if (m_TraWsPtrs[tra + 0] != 0) {
            if (tra != 0) {
                ssamp1 = data->m_SmplList[m_TraWsPtrs[tra + 0]]->fRepPointer + off;
            } else {
                ssamp1 = m_WsRepPointer;
            }
            if (!data->m_bPlay)
                return;

            if (m_TraWsPtrs[tra + 1] != 0) {
                ssamp2 = data->m_SmplList[m_TraWsPtrs[tra + 1]]->fRepPointer + off;

                dsamp = &m_TraWaveBuffer[0];

                if ((data->m_PlayBits & (1 << 1)) == 0) {
                    float t = float(cnt) / 256.0f;
                    for (i = 0; i < len; i++) {
                        dsamp[i] = ssamp1[i] + (ssamp2[i] - ssamp1[i]) * t;
                    }
                }

                // Update float pointer for downstream effects (MixPlay reads from WsRepPointer).
                // ASM sets ch_WsRepPointer = ch_TraWaveBuffer here, and .playfx resets it
                // to ch_WsRepPtrOrg each tick (line 4113), so there is NO feedback.
                // We only update WsRepPointer (float), not WsRepPtrOrg.
                m_WsRepPointer = dsamp;

                if (m_Effects[inst_LOOP] || m_WaveOrSample) {
                    m_WsPointer = dsamp;
                }
            }
        }
    }
}
