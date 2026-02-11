/**
 * Stub Program.h for OB-Xf WASM build.
 * The real Program.h pulls in ParameterList → SynthParam → sst::basic_blocks.
 * SynthEngine doesn't actually use Program, so we stub it.
 */
#ifndef OBXF_SRC_ENGINE_PARAMETERS_H
#define OBXF_SRC_ENGINE_PARAMETERS_H

#include <string>
#include <unordered_map>
#include <atomic>

// Stub — provides the same include guard as the real Program.h
class Program {
public:
    Program() {}
    ~Program() {}
    void setToDefaultPatch() {}
    std::unordered_map<std::string, std::atomic<float>> values;
};

#endif // OBXF_SRC_ENGINE_PARAMETERS_H
