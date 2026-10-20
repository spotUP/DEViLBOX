/**
 * load_save.h - WASM replacement for vital-main/src/common/load_save.h.
 *
 * The real header drags in JUCE file, config and threading types. The wavetable
 * code only calls these three version helpers; implementations are in
 * load_save_stub.cpp. This directory is first on the include path.
 */
#pragma once

#include "JuceHeader.h"
#include "json/json.h"

using json = nlohmann::json;

class LoadSave {
  public:
    static void convertBufferToPcm(json& data, const std::string& field);
    static void convertPcmToFloatBuffer(json& data, const std::string& field);
    static int compareVersionStrings(String a, String b);
};
