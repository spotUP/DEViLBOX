// Stand-in for ScummVM's common/mutex.h: the worklet renders on one thread, so locks do nothing.
#pragma once
namespace Common {
class Mutex {
 public:
  void lock() {}
  void unlock() {}
};
class StackLock {
 public:
  explicit StackLock(Mutex&, const char* = nullptr) {}
};
}  // namespace Common
