#include "enums.h"
#include "structs.h"
#include "tables.h"
#include <cstdint>

// Resonance filter implementation matching Mline116.asm:13530-13575
// Float version: reads from ssamp (float -1..1), does all math in float.

extern bool bResoType;
void CPlayInst::ResonancePlay(MLModule* data) {
    struct Counter* count;
    unsigned short len;
    unsigned int cnt;
    float* ssamp;
    float* dsamp;
    // Float vars for alternative resonance mode (else branch)
    float oldsmp;
    float res;
    float amp;
    int i;

    if (m_Effects[inst_RESONANCE]) {
        count = &m_ResData;

        if ((m_EffectsPar2 & (1 << RESONANCESTEP)) != 0) {
            if ((m_EffectsPar2 & (1 << RESONANCEINIT)) == 0) {
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

        if ((m_EffectsPar2 & (1 << RESONANCESTEP)) != 0) {
            if (count->delay != 0) {
                count->delay -= 1;
            } else {
                int counter;

                counter = count->savecounter + (char)m_ResSpd;

                if (counter < 0) {
                    counter = 0;
                } else if (counter > 510) {
                    counter = 510;
                }

                count->savecounter = counter;
            }
        }

        // ASM behavior: read from waveform source, write to ResWaveBuffer
        ssamp = m_WsRepPointer;
        dsamp = &m_ResWaveBuffer[0];
        m_WsRepPointer = dsamp;

        if (m_Effects[inst_LOOP] || m_WaveOrSample) {
            m_WsPointer = dsamp;
        }
        if (!data->m_bPlay)
            return;

        if ((data->m_PlayBits & (1 << 1)) == 0) {
            // ASM uses waveform length (WsRepLength * 2 for samples)
            len = m_WsRepLength << 1;

            // Initialize oldsmp from last sample or cross-tick state
            float oldsmp_f;
            if (m_ResLastInit != 0) {
                m_ResLastInit = 0;
                // ASM: last_byte >> 2 then * 128 = byte×32 in int16 space
                // Float: ssamp is -1..1, scale to ±0.25 to match int16 proportion
                oldsmp_f = ssamp[len - 1] * 0.25f;
            } else {
                // Cross-tick: use persisted float state
                oldsmp_f = m_ResLastSample;
            }

            float fil_f = 0.0f;
            if (1) // bResoType==false)
            {
                cnt >>= 1; // :13539 and #$fffe,d0

                float res_f = float(resonancelist[cnt]);

                // Amplitude: ASM does (32768 - resamplist[ResAmp]) * 0xE666 >> 16,
                // then muls d2,d3; add.l d3,d3; swap d3 = fil * amp * 2 / 65536
                // Combined: fil *= (amp_i * 2) / 65536 = amp_i / 32768
                uint32_t amp_temp = uint32_t(32768 - resamplist[m_ResAmp]) * 0xE666u;
                float amp_f = float(int16_t(amp_temp >> 16)) * 2.0f / 65536.0f;

                // Boost: ASM shifts output by 6 (×2) or 7 (×1)
                float scale = (m_MixResFilBoost & (1 << 1)) ? 2.0f : 1.0f;

                for (i = 0; i < len; i++) {
                    // ASM: s8 << 5 = ×32 in int16 space (±4096 of ±32768 = ±0.125)
                    // Float: ssamp -1..1 × 0.25 = ±0.25, proportionally matching
                    float input_f = ssamp[i] * 0.25f;
                    float diff = input_f - oldsmp_f;
                    fil_f += (diff * 128.0f) / res_f;
                    oldsmp_f += fil_f;

                    // Clamp to prevent runaway (replaces int16 wrap limiting)
                    if (oldsmp_f > 1.0f)
                        oldsmp_f = 1.0f;
                    else if (oldsmp_f < -1.0f)
                        oldsmp_f = -1.0f;

                    dsamp[i] = oldsmp_f * scale;

                    fil_f *= amp_f;
                }
                m_ResoSinus = 0;
                m_ResLastSample = oldsmp_f; // Float cross-tick state
            } else {
                cnt >>= 1; // clear bit 0
                amp = float(32768 - resamplist[m_ResAmp]) / 32768;
                res = float(resonancelist[255 - cnt]) / 0xc00;
                unsigned int resospeed = 0x00000000;
                float b = 0;
                float is;
                float oldval = m_ResoSinus;
                //				amp/=(32768);//*256/len);
                cnt = resonancelist[255 - cnt] << 18;
                oldsmp = m_ResLastSample;

                for (i = 0; i < len; i++) {
                    is = ssamp[i];
                    /*
                    oldval+=(is-oldsmp);
                    dsamp[i]=(is+(VecSinus[resospeed>>16]*oldval*2))/2;
                    oldval*=amp;
                    oldsmp=is;
                    */

                    float c = (is - oldsmp * 4);
                    if (c < 0)
                        c = -c;
                    b = (b + c) * res;

                    //					oldval*=amp;
                    dsamp[i] = is + (VecSinus[resospeed >> 16] * b) / 4;
                    oldsmp = is;

                    resospeed += cnt;

                    //				is=ssamp[i];
                    //					float c=is-oldsmp;
                    //						b+=c;
                    //				oldsmp=is;
                    //				dsamp[i]=(is+(VecSinus[resospeed>>16]*-b))/4;
                    //				b*=amp;
                    //				resospeed+=cnt;
                }
                m_ResoSinus = oldval;
                m_ResLastSample = oldsmp;
            }
        }
    }
}
