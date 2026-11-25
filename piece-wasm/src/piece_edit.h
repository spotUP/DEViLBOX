// SPDX-License-Identifier: GPL-3.0-or-later
// Re-serialiser for P/ECE music driver songs: replace a byte range of the song (insert, delete or
// change the size of events) and fix every absolute u16 pointer the file holds, so the song plays
// on with the edit in place. Include after piece.cpp (uses piece::ARGS).
//
// Pointers in the file: the header (part starts, drum table, two titles), the drum table's macro
// pointers, and the address argument of every e2 (jump/loop) and e3 (call) reachable from a part.
// Repeats (e4/e5/f6) are found by scanning, so they need no fix.
#pragma once

#include <algorithm>
#include <cstdint>
#include <set>
#include <string>
#include <vector>

namespace piece {

inline uint16_t editRd16(const std::vector<uint8_t>& d, size_t p) {
  return p + 1 < d.size() ? static_cast<uint16_t>(d[p] | d[p + 1] << 8) : 0;
}

// File offsets of every u16 that holds an absolute address (value != 0), sorted.
inline std::vector<uint32_t> pointerSlots(const std::vector<uint8_t>& d) {
  std::set<uint32_t> slots;
  if (d.size() < 20 || d[0] != 0 || d[1] < 1 || d[1] > 16) return {};
  const int np = d[1];
  const size_t hdr = 2 + 2 * (np + 3);
  if (hdr > d.size()) return {};
  std::vector<uint32_t> work;
  for (int i = 0; i < np + 3; i++) {
    const uint32_t s = 2 + 2 * i;
    const uint16_t v = editRd16(d, s);
    if (!v || v >= d.size()) continue;
    slots.insert(s);
    if (i < np) work.push_back(v);
  }
  // Drum table: one macro pointer per note; it ends where the first macro starts.
  const uint16_t tab = editRd16(d, 2 + 2 * np);
  if (tab) {
    uint32_t stop = static_cast<uint32_t>(d.size());
    for (uint32_t k = 0; k < 0x60; k++) {
      const uint32_t s = tab + 2 * k;
      if (s + 1 >= d.size() || s >= stop) break;
      const uint16_t v = editRd16(d, s);
      if (!v || v >= d.size()) break;
      slots.insert(s);
      if (v > tab) stop = std::min<uint32_t>(stop, v);
    }
  }
  // Command streams: walk each part and every block it calls.
  std::set<uint32_t> seen;
  while (!work.empty()) {
    uint32_t p = work.back();
    work.pop_back();
    if (!seen.insert(p).second) continue;
    while (p < d.size()) {
      const uint8_t c = d[p];
      if (c == 0) break;
      if (c < 0x7f || (c >= 0x80 && c <= 0xe0)) { p++; continue; }
      if (c == 0x7f) { p += 2; continue; }
      const int n = ARGS[c - 0xe0];
      if (n < 0) break;
      if ((c == 0xe2 || c == 0xe3) && p + 2 < d.size()) {
        const uint16_t to = editRd16(d, p + 1);
        if (to && to < d.size()) {
          slots.insert(p + 1);
          work.push_back(to);
        }
      }
      if (c == 0xe2) break;  // the loop: nothing after it is reached
      p += 1 + n;
    }
  }
  return std::vector<uint32_t>(slots.begin(), slots.end());
}

// Replace d[off, off + oldLen) with `bytes` and fix the pointers. A pointer to `off` keeps
// pointing at the new bytes; a pointer into the cut range is refused (the edit would split an
// event a jump or call lands on). Address arguments inside `bytes` are the caller's, in the new
// file's offsets. Returns false (d untouched) with `why` set when the edit cannot be made.
inline bool splice(std::vector<uint8_t>& d, size_t off, size_t oldLen, const uint8_t* bytes,
                   size_t n, std::string& why) {
  if (off + oldLen > d.size()) { why = "edit past the end of the song"; return false; }
  const size_t size = d.size() - oldLen + n;
  if (size > 0xffff) { why = "song would pass 64 KiB (16-bit pointers)"; return false; }
  const size_t hdr = d.size() >= 2 ? 2 + 2 * (d[1] + 3) : 0;
  if (off < hdr) { why = "edit inside the header"; return false; }
  const std::vector<uint32_t> slots = pointerSlots(d);
  const long delta = static_cast<long>(n) - static_cast<long>(oldLen);
  std::vector<std::pair<uint32_t, uint16_t>> fixed;  // new slot offset, new value
  for (const uint32_t s : slots) {
    if (s >= off && s < off + oldLen) continue;       // replaced by the caller's bytes
    if (s + 1 >= off && s < off) { why = "edit cuts a pointer"; return false; }
    const uint16_t v = editRd16(d, s);
    uint32_t nv = v;
    if (v > off && v < off + oldLen) { why = "edit cuts an event a jump or call lands on"; return false; }
    if (v > off || (v == off && oldLen > 0 && v >= off + oldLen)) nv = static_cast<uint32_t>(v + delta);
    const uint32_t ns = s < off ? s : static_cast<uint32_t>(s + delta);
    fixed.push_back({ns, static_cast<uint16_t>(nv)});
  }
  std::vector<uint8_t> out;
  out.reserve(size);
  out.insert(out.end(), d.begin(), d.begin() + off);
  out.insert(out.end(), bytes, bytes + n);
  out.insert(out.end(), d.begin() + off + oldLen, d.end());
  for (const auto& [s, v] : fixed) {
    out[s] = static_cast<uint8_t>(v & 0xff);
    out[s + 1] = static_cast<uint8_t>(v >> 8);
  }
  d.swap(out);
  return true;
}

}  // namespace piece
