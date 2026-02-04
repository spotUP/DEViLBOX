/*
 * tuning.cc - Tuning support for WASM build
 * Provides standard 12-TET tuning only (no JUCE dependencies)
 */

#include "tuning.h"
#include <cmath>

/**
 * Standard 12-TET tuning implementation
 */
struct StandardTuning : public TuningState {
    StandardTuning() {
        // DX7-style log frequency table
        // (1 << 24) * (log2(440) - 69/12) = 50857777
        const int base = 50857777;
        const int step = (1 << 24) / 12;

        for (int mn = 0; mn < 128; ++mn) {
            current_logfreq_table_[mn] = base + step * mn;
        }
    }

    int32_t midinote_to_logfreq(int midinote) override {
        if (midinote < 0) midinote = 0;
        if (midinote > 127) midinote = 127;
        return current_logfreq_table_[midinote];
    }

    bool is_standard_tuning() override { return true; }
    int scale_length() override { return 12; }
    std::string display_tuning_str() override { return "Standard 12-TET"; }

private:
    int current_logfreq_table_[128];
};

std::shared_ptr<TuningState> createStandardTuning() {
    return std::make_shared<StandardTuning>();
}

// Stub implementations for SCL/KBM (not supported in WASM build)
std::shared_ptr<TuningState> createTuningFromSCLData(const std::string&) {
    return createStandardTuning();
}

std::shared_ptr<TuningState> createTuningFromKBMData(const std::string&) {
    return createStandardTuning();
}

std::shared_ptr<TuningState> createTuningFromSCLAndKBMData(const std::string&, const std::string&) {
    return createStandardTuning();
}
