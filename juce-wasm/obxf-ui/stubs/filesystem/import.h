// filesystem/import.h — Stub for sst-plugininfra filesystem import
// WASM build: just use std::filesystem
#pragma once

#include <filesystem>
namespace fs = std::filesystem;

#define SST_PLUGININFRA_FILESYSTEM_STD 1

#include <utility>
#include <string>

inline std::string path_to_string(const fs::path& path)
{
    return path.generic_string();
}

template<typename T>
inline fs::path string_to_path(T&& path)
{
    return fs::path(std::forward<T>(path));
}

void string_to_path(fs::path) = delete;
