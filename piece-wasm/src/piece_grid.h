// SPDX-License-Identifier: GPL-3.0-or-later
// Editable grid for P/ECE music driver songs (docs/FORMAT_COMMAND_STREAM_GRID.md): each part's
// command stream is unrolled the way step() in piece.cpp reads it (calls, repeats, the f6 break;
// one pass, up to the loop), every note, rest and "?" note becomes an event at its driver tick,
// and each event keeps the file offset of its byte, so a cell edit writes the byte the driver
// reads. An edit inside a called block or a repeat is heard (and shown on reload) in every copy.
// Include after piece.cpp and piece_edit.h.
#pragma once

#include <cstdint>
#include <numeric>
#include <string>
#include <vector>

namespace piece {

struct GridEvent {
  int part = 0, tick = 0, len = 0;
  int note = 0;           // tracker note: 1..96 (1 = C0, note byte 0), 97 = rest
  int inst = -1, vol = -1, tempo = -1;  // set by a command since the part's last event, else -1
  uint32_t offset = 0;    // the note / rest byte, or the "?" (ec) command byte
  int kind = 0;           // 0 note or rest, 1 drum note, 2 "?" note
  int transpose = 0;
};

struct Grid {
  std::vector<GridEvent> events;
  int rowTicks = 6;       // a 16th note (24 ticks a quarter), finer when the song needs it
  int ticks = 0;          // the longest part
  int tempo = 120;        // at tick 0
};

inline Grid buildGrid(const std::vector<uint8_t>& d) {
  Grid g;
  if (d.size() < 20 || d[0] != 0 || d[1] < 1 || d[1] > 16) return g;
  const int np = d[1];
  constexpr int MAX_TICKS = 24 * 4 * 2048;  // 2048 bars of 4/4: a song with no loop and no end
  for (int part = 0; part < np && part < PARTS; part++) {
    uint32_t pos = editRd16(d, 2 + 2 * part);
    if (!pos || pos >= d.size()) continue;
    std::vector<Part::Call> calls;
    std::vector<Part::Rep> reps;
    int tick = 0, len = 24, transpose = 0, inst = -1, vol = -1, tempo = -1;
    bool drums = false;
    auto event = [&](uint32_t off, int note, int kind) {
      GridEvent e;
      e.part = part; e.tick = tick; e.len = std::max(1, len); e.note = note; e.offset = off;
      e.kind = kind; e.transpose = transpose; e.inst = inst; e.vol = vol; e.tempo = tempo;
      g.events.push_back(e);
      inst = vol = tempo = -1;
      tick += e.len;
    };
    for (int guard = 0; guard < 1000000 && pos < d.size() && tick < MAX_TICKS; guard++) {
      const uint8_t c = d[pos];
      if (c == 0x00) {
        if (calls.empty()) break;
        Part::Call& k = calls.back();
        if (--k.count > 0) pos = k.addr;
        else { pos = k.ret; calls.pop_back(); }
        continue;
      }
      if (c < 0x7f) { len = c; pos++; continue; }
      if (c == 0x7f) {
        const int v = pos + 1 < d.size() ? d[pos + 1] : 0;
        len = v >= 0x7f ? v : v + 256;
        pos += 2;
        continue;
      }
      if (c == 0xec) {
        const int n = (pos + 1 < d.size() ? d[pos + 1] : 0x80) - 0x80;
        event(pos, std::clamp(n, 0, 95) + 1, 2);
        pos += 2;
        continue;
      }
      if (c <= 0xe0) {
        if (c == 0xe0) event(pos, 97, 0);
        else if (drums) event(pos, c - 0x80 + 1, 1);
        else event(pos, std::clamp(c - 0x80 + transpose, 0, 95) + 1, 0);
        pos++;
        continue;
      }
      const int n = ARGS[c - 0xe0];
      if (n < 0) break;
      const uint32_t a = pos + 1;
      auto arg = [&](int i) -> int { return a + i < d.size() ? d[a + i] : 0; };
      pos += 1 + n;
      bool stop = false;
      switch (c) {
        case 0xe2:
          if (calls.empty()) stop = true;  // the song's loop: one pass is the grid
          else pos = editRd16(d, a);
          break;
        case 0xe3: {
          const int cnt = arg(2);
          if (cnt > 0 && calls.size() < 32) { calls.push_back({pos, editRd16(d, a), cnt}); pos = calls.back().addr; }
          break;
        }
        case 0xe4: if (reps.size() < 32) reps.push_back({pos, arg(0)}); break;
        case 0xe5:
          if (!reps.empty()) {
            Part::Rep& r = reps.back();
            if (r.count == 0) { if (calls.empty()) stop = true; else pos = r.start; }
            else if (--r.count > 0) pos = r.start;
            else reps.pop_back();
          }
          break;
        case 0xf6:
          if (!reps.empty() && reps.back().count == 1) { pos = findNext(d, pos) + 1; reps.pop_back(); }
          break;
        case 0xe6: transpose = static_cast<int8_t>(arg(0)); break;
        case 0xe7: if (arg(0)) { tempo = arg(0); if (tick == 0) g.tempo = tempo; } break;
        case 0xe8: inst = arg(0); break;
        case 0xe9: vol = arg(0); break;
        case 0xf0: drums = arg(0) != 0; break;
        default: break;
      }
      if (stop) break;
    }
    g.ticks = std::max(g.ticks, tick);
  }
  int r = 6;
  for (const GridEvent& e : g.events) r = std::gcd(r, e.tick);
  g.rowTicks = std::max(1, r);
  return g;
}

// Length command bytes for <len> ticks (1..382), as step() reads them.
inline bool lengthBytes(int len, std::vector<uint8_t>& out) {
  if (len >= 1 && len <= 0x7e) { out.push_back(static_cast<uint8_t>(len)); return true; }
  if (len >= 0x7f && len <= 0xff) { out.push_back(0x7f); out.push_back(static_cast<uint8_t>(len)); return true; }
  if (len >= 256 && len < 256 + 0x7f) { out.push_back(0x7f); out.push_back(static_cast<uint8_t>(len - 256)); return true; }
  return false;
}

// Write tracker note <note> (0 or 97 = rest, 1..96) into the cell of <part> at grid row <row>.
// On an event: its byte (or the "?" argument) is rewritten, same length. Inside a longer event:
// the event is split there (length bytes around it, pointers fixed through splice). Returns
// false with `why` set when nothing changed.
inline bool editCell(std::vector<uint8_t>& d, int part, int row, int note, std::string& why) {
  const Grid g = buildGrid(d);
  const int t = row * g.rowTicks;
  const bool rest = note == 0 || note == 97;
  if (!rest && (note < 1 || note > 96)) { why = "note out of range"; return false; }
  const GridEvent* at = nullptr;
  for (const GridEvent& e : g.events)
    if (e.part == part && e.tick <= t && t < e.tick + e.len) { at = &e; break; }
  if (!at) { why = "no event of the part reaches this row"; return false; }
  auto noteByte = [&](const GridEvent& e) -> uint8_t {
    if (rest) return 0xe0;
    const int n = e.kind == 1 ? note - 1 : note - 1 - e.transpose;
    return static_cast<uint8_t>(0x80 + std::clamp(n, 0, 0x5f));
  };
  if (at->tick == t) {
    if (at->kind == 2) {
      if (rest) { const uint8_t b = 0xe0; return splice(d, at->offset, 2, &b, 1, why); }
      d[at->offset + 1] = static_cast<uint8_t>(0x80 + note - 1);
      return true;
    }
    d[at->offset] = noteByte(*at);
    return true;
  }
  if (note == 0) { why = "clearing inside a held note changes nothing"; return false; }
  std::vector<uint8_t> b;
  const size_t evLen = at->kind == 2 ? 2 : 1;
  if (!lengthBytes(t - at->tick, b)) { why = "length out of range"; return false; }
  b.insert(b.end(), d.begin() + at->offset, d.begin() + at->offset + evLen);
  if (!lengthBytes(at->tick + at->len - t, b)) { why = "length out of range"; return false; }
  b.push_back(noteByte(*at));
  if (!lengthBytes(at->len, b)) { why = "length out of range"; return false; }  // the length the next events read
  return splice(d, at->offset, evLen, b.data(), b.size(), why);
}

}  // namespace piece
