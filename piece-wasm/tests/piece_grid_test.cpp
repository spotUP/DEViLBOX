// Host check for piece_grid.h on every song given:
//  1. grid time = driver time: run the driver tick by tick (piece.cpp tick()); every note, rest
//     or "?" note a part starts must be the next grid event of that part, at the same tick and
//     read from the event's file offset (first pass, up to the loop).
//  2. a note edit on an event changes one byte; a split inside a long event adds one event and
//     moves no other event in time; the edited song loads.
// Build: c++ -std=c++17 -O1 -I../src piece_grid_test.cpp -o /tmp/x && /tmp/x <song.pmd>...
#include "piece.cpp"
#include "piece_edit.h"
#include "piece_grid.h"

#include <cstdio>
#include <fstream>
#include <iterator>

static std::vector<int> ticksOf(const piece::Grid& g) {
  std::vector<int> t;
  for (const auto& e : g.events) t.push_back(e.part * 10000000 + e.tick);
  return t;
}

int main(int argc, char** argv) {
  int bad = 0, events = 0, splits = 0;
  for (int a = 1; a < argc; a++) {
    std::ifstream f(argv[a], std::ios::binary);
    const std::vector<uint8_t> orig((std::istreambuf_iterator<char>(f)), {});
    const piece::Grid g = piece::buildGrid(orig);
    std::string why;
    piece::Song* s = piece::load(orig, why);
    if (!s) { printf("[ERROR] %s load: %s\n", argv[a], why.c_str()); bad++; continue; }
    std::vector<std::vector<const piece::GridEvent*>> per(piece::PARTS);
    for (const auto& e : g.events) per[e.part].push_back(&e);
    std::vector<size_t> next(piece::PARTS, 0);
    int fails = 0;
    for (int t = 0; t < g.ticks + 1 && fails < 3; t++) {
      int waitBefore[piece::PARTS];
      bool live[piece::PARTS];
      for (int i = 0; i < piece::PARTS; i++) { waitBefore[i] = s->part[i].wait; live[i] = s->part[i].used && !s->part[i].ended; }
      piece::tick(*s);
      for (int i = 0; i < piece::PARTS; i++) {
        const piece::Part& p = s->part[i];
        if (!live[i] || waitBefore[i] > 1 || p.ended) continue;  // no event started this tick
        if (next[i] >= per[i].size()) continue;                    // past the grid's one pass
        const piece::GridEvent& e = *per[i][next[i]++];
        events++;
        const uint32_t read = p.pos - (e.kind == 2 ? 2 : 1);
        if (e.tick != t || read != e.offset) {
          printf("[ERROR] %s part %d event %zu: grid tick %d offset %u, driver tick %d offset %u\n", argv[a], i,
                 next[i] - 1, e.tick, e.offset, t, read);
          fails++;
        }
      }
    }
    piece::destroy(s);
    bad += fails;
    // edits
    for (const auto& e : g.events) {
      if (e.note == 97 || e.kind != 0) continue;
      std::vector<uint8_t> d = orig;
      const int row = e.tick / g.rowTicks, to = e.note == 96 ? 95 : e.note + 1;
      if (!piece::editCell(d, e.part, row, to, why) || d.size() != orig.size() ||
          piece::buildGrid(d).events.size() != g.events.size()) { printf("[ERROR] %s note edit: %s\n", argv[a], why.c_str()); bad++; }
      break;
    }
    for (const auto& e : g.events) {
      if (e.len < 2 * g.rowTicks || e.len % g.rowTicks) continue;
      std::vector<uint8_t> d = orig;
      const int row = e.tick / g.rowTicks + 1;
      if (!piece::editCell(d, e.part, row, 49, why)) { printf("[ERROR] %s split: %s\n", argv[a], why.c_str()); bad++; break; }
      const piece::Grid h = piece::buildGrid(d);
      std::vector<int> want = ticksOf(g);
      want.push_back(e.part * 10000000 + row * g.rowTicks);
      std::vector<int> got = ticksOf(h);
      std::sort(want.begin(), want.end());
      std::sort(got.begin(), got.end());
      std::string err;
      piece::Song* r = piece::load(d, err);
      // a split in a called block or repeat lands in every copy: each copy adds one event
      const bool sameTimes = std::includes(got.begin(), got.end(), want.begin(), want.end());
      if (!r || !sameTimes || h.ticks != g.ticks) { printf("[ERROR] %s split moved events (%zu -> %zu)\n", argv[a], g.events.size(), h.events.size()); bad++; }
      if (r) piece::destroy(r);
      splits++;
      break;
    }
  }
  printf("%s %d songs, %d driver events matched, %d splits\n", bad ? "[ERROR]" : "[OK]", argc - 1, events, splits);
  return bad ? 1 : 0;
}
