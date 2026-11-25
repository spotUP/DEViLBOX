// Stand-in for ScummVM's audio/mixer.h: Paula only takes the mixer's mutex.
#pragma once
#include "common/mutex.h"
namespace Audio {
class Mixer {
 public:
  Common::Mutex& mutex() { return mutex_; }
 private:
  Common::Mutex mutex_;
};
}  // namespace Audio
class OSystem {
 public:
  Audio::Mixer* getMixer() { return &mixer_; }
 private:
  Audio::Mixer mixer_;
};
extern OSystem* g_system;
