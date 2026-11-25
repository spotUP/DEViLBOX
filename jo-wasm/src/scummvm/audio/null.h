// Stand-in for ScummVM's audio/null.h: just enough for the plugin tail of paula.cpp to
// compile. The WASM build has no plugin system, so registration does nothing.
#pragma once
#include <vector>
class MusicPluginObject;
enum MusicType { MT_AMIGA = 1 };
class MusicDevice {
 public:
  MusicDevice(const void*, const char*, MusicType) {}
};
typedef std::vector<MusicDevice> MusicDevices;
class NullMusicPlugin {
 public:
  virtual ~NullMusicPlugin() {}
  virtual const char* getName() const { return ""; }
  virtual const char* getId() const { return ""; }
  virtual MusicDevices getDevices() const { return MusicDevices(); }
};
#define REGISTER_PLUGIN_STATIC(id, type, cls)
