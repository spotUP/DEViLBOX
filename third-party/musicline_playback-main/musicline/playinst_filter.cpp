#include "enums.h"
#include "structs.h"
#include "tables.h"

// Float filter implementation matching MusiclineEditor.asm:5467-5596.
// Reads from ssamp (float -1..1), does all math in float.

void CPlayInst::FilterPlay(MLModule* data) {
    MLModule* p = data;

    if (!m_Effects[inst_FILTER])
        return;

    struct Counter* count = &m_FilData;

    // Counter stepping logic (lines 5469-5498) — already integer, unchanged
    if ((m_EffectsPar1 & (1 << FILTERSTEP)) != 0) {
        if ((m_EffectsPar1 & (1 << FILTERINIT)) == 0) {
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

    unsigned short cnt = count->savecounter;

    if ((m_EffectsPar1 & (1 << FILTERSTEP)) != 0) {
        if (count->delay != 0) {
            count->delay -= 1;
        } else {
            int counter = count->savecounter + (char)m_FilSpd;
            if (counter < 0)
                counter = 0;
            else if (counter > 510)
                counter = 510;
            count->savecounter = counter;
        }
    }

    // ASM lines 5500-5507: redirect pointers
    float* ssamp = m_WsRepPointer;
    float* dsamp = &m_FilWaveBuffer[0];
    m_WsRepPointer = dsamp;

    if (m_Effects[inst_LOOP] || m_WaveOrSample) {
        m_WsPointer = dsamp;
    }
    if (!data->m_bPlay)
        return;

    if ((data->m_PlayBits & (1 << 1)) != 0)
        return;

    int len = m_WsRepLength << 1; // words to samples (ASM: add d7,d7)

    if (m_FilType != 0) {
        // === Resonance filter === (ASM lines 5519-5556)
        // Float version: scale factor 16384 maps int16 space to float -1..1

        float oldsmp_f;
        if (m_FilLastInit != 0) {
            m_FilLastInit = 0;
            // ASM: move.b (a0,d7.w),d4; asr.b #1,d4 => byte/2, then ext; asl #7 => byte*64
            // Float: ssamp[len-1] * 0.5f (byte*64 in int16 / 16384 scale factor = byte/256 * 2 = *0.5 of float)
            oldsmp_f = ssamp[len - 1] * 0.5f;
        } else {
            oldsmp_f = m_FilLastSample;
        }

        float fil_f = 0.0f;
        cnt &= 0xFFFE;
        u16 coeff = resfilterlist[cnt >> 1];

        // ASM: lsr #1,d1 then muls d1,d6; add.l d6,d6; add.l d6,d6; swap d6
        // = diff * (coeff/2) * 4 / 65536 = diff * coeff * 2 / 65536 = diff * coeff / 32768
        float coeff_f = float(coeff) / 32768.0f;

        // Damping: ASM mulu #$e666
        u16 d2_u = (u16)(0x8000 - coeff);
        u32 d2_32 = (u32)d2_u * (u32)0xe666u;
        // ASM: muls d2,d3; add.l d3,d3; swap d3 = fil * d2 * 2 / 65536
        float damp_f = float(int16_t(d2_32 >> 16)) * 2.0f / 65536.0f;

        float scale = (m_MixResFilBoost & 1) ? 2.0f : 1.0f;

        for (int i = 0; i < len; i++) {
            // ASM: move.b (a0)+,d6; ext d6; asl #6,d6 => byte * 64
            // Float: ssamp[i] * 0.5f (byte*64 / 16384 = byte/256 * 2 ≈ ssamp * 0.5)
            float input_f = ssamp[i] * 0.5f;
            float diff = input_f - oldsmp_f;
            fil_f += diff * coeff_f;
            oldsmp_f += fil_f;

            if (oldsmp_f > 1.0f)
                oldsmp_f = 1.0f;
            else if (oldsmp_f < -1.0f)
                oldsmp_f = -1.0f;

            dsamp[i] = oldsmp_f * scale;

            fil_f *= damp_f;
        }

        m_FilLastSample = oldsmp_f;

    } else {
        // === Normal filter === (ASM lines 5559-5596)

        float oldsmp_f;
        if (m_FilLastInit != 0) {
            m_FilLastInit = 0;
            // ASM: move.b (a0,d7.w),d4 => byte, then ext; asl #7 => byte*128
            // Float: ssamp[len-1] * 1.0f (byte*128 / 16384 = byte/128 ≈ ssamp)
            oldsmp_f = ssamp[len - 1] * 1.0f;
        } else {
            oldsmp_f = m_FilLastSample;
        }

        float fil_f = 0.0f;
        cnt &= 0xFFFE;
        u16 coeff = filterlist[cnt >> 1];

        float coeff_f = float(coeff) / 32768.0f;

        // Damping: ASM muls #$f000 ($F000 signed = -4096)
        s16 d2_s = (s16)(0x8000 - coeff);
        s32 d2_32 = (s32)d2_s * (s32)(s16)0xF000;
        float damp_f = float(int16_t(d2_32 >> 16)) * 2.0f / 65536.0f;

        float scale = (m_MixResFilBoost & 1) ? 2.0f : 1.0f;

        for (int i = 0; i < len; i++) {
            // ASM: move.b (a0)+,d6; ext d6; asl #7,d6 => byte * 128
            // Float: ssamp[i] * 1.0f (byte*128 / 16384 = byte/128 ≈ ssamp)
            float input_f = ssamp[i];
            float diff = input_f - oldsmp_f;
            fil_f += diff * coeff_f;
            oldsmp_f += fil_f;

            if (oldsmp_f > 1.0f)
                oldsmp_f = 1.0f;
            else if (oldsmp_f < -1.0f)
                oldsmp_f = -1.0f;

            dsamp[i] = oldsmp_f * scale;

            fil_f *= damp_f;
        }

        m_FilLastSample = oldsmp_f;
    }
}
