// Stand-in for ScummVM's audio/audiostream.h: the AudioStream interface Paula implements.
#pragma once
#include "common/scummsys.h"
namespace Audio {
class AudioStream {
 public:
  virtual ~AudioStream() {}
  virtual int readBuffer(int16* buffer, const int numSamples) = 0;
  virtual bool isStereo() const = 0;
  virtual int getRate() const = 0;
  virtual bool endOfData() const = 0;
  virtual bool endOfStream() const { return endOfData(); }
};
}  // namespace Audio
