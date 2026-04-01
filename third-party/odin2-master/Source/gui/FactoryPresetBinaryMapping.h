// FactoryPresetBinaryMapping.h — WASM stub
// Returns init_patch for all lookups (factory presets not embedded in WASM build)
#pragma once

#include "BinaryData.h"
#include <string>
#include <utility>

inline std::pair<const char*, int> getFactoryPresetBinaryData(const std::string&) {
    return std::make_pair(BinaryData::init_patch_odin, BinaryData::init_patch_odinSize);
}
