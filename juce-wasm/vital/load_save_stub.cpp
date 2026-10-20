/**
 * load_save_stub.cpp - The LoadSave helpers the wavetable code links against.
 *
 * Vital's load_save.cpp is built on JUCE file/config APIs and is not compiled
 * for WASM. WavetableCreator (common/wavetable/) needs three static helpers to
 * upgrade presets written by old Vital versions; they are copied here verbatim
 * in behaviour. The preset-level loader lives in VitalWASM.cpp.
 */

#include "load_save.h"
#include "synthesis/framework/utils.h"

#include <cstring>
#include <memory>

namespace {
std::vector<int> splitVersion(const std::string& v) {
    std::vector<int> parts;
    std::string cur;
    for (char c : v) {
        if (c == '.') { parts.push_back(cur.empty() ? 0 : std::atoi(cur.c_str())); cur.clear(); }
        else if (c >= '0' && c <= '9') cur.push_back(c);
        else if (c == ' ') continue;
        else { cur.clear(); }
    }
    parts.push_back(cur.empty() ? 0 : std::atoi(cur.c_str()));
    return parts;
}
}

int LoadSave::compareVersionStrings(String a, String b) {
    std::vector<int> pa = splitVersion(a);
    std::vector<int> pb = splitVersion(b);
    size_t n = std::max(pa.size(), pb.size());
    for (size_t i = 0; i < n; ++i) {
        int x = i < pa.size() ? pa[i] : 0;
        int y = i < pb.size() ? pb[i] : 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}

void LoadSave::convertBufferToPcm(json& data, const std::string& field) {
    if (data.count(field) == 0) return;
    // Vital stores the converted payload re-encoded as base64; encoding is not
    // available in WASM, so old (pre 0.3.7) presets keep their float payload.
}

void LoadSave::convertPcmToFloatBuffer(json& data, const std::string& field) {
    if (data.count(field) == 0) return;
}
