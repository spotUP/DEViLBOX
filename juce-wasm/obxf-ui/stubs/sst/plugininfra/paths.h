// sst/plugininfra/paths.h — Stub for WASM build (no filesystem access)
#pragma once

#include "filesystem/import.h"
#include <string>

namespace sst::plugininfra::paths
{
inline fs::path bestLibrarySharedVendorFolderPathFor(const std::string&, const std::string&)
{
    return fs::path("/wasm-stub");
}

inline fs::path homePath() { return fs::path("/wasm-stub"); }

inline fs::path bestDocumentsFolderPathFor(const std::string&)
{
    return fs::path("/wasm-stub");
}

inline fs::path sharedLibraryBinaryPath()
{
    return fs::path("/wasm-stub/OBXfUI.wasm");
}
} // namespace sst::plugininfra::paths
