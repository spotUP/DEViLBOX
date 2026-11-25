// Host check for piece_edit.h: on every song given, insert bytes at the start of each part, then
// delete them again; the song must come back byte-identical, the inserted copy must still load,
// and every pointer must move with its target.
// Build: c++ -std=c++17 -O1 -I../src piece_edit_test.cpp -o /tmp/x && /tmp/x <song.pmd>...
#include "piece.cpp"
#include "piece_edit.h"

#include <cstdio>
#include <fstream>
#include <iterator>

int main(int argc, char** argv) {
  int bad = 0;
  for (int a = 1; a < argc; a++) {
    std::ifstream f(argv[a], std::ios::binary);
    const std::vector<uint8_t> orig((std::istreambuf_iterator<char>(f)), {});
    const int np = orig[1];
    const std::vector<uint32_t> slots = piece::pointerSlots(orig);
    for (int i = 0; i < np; i++) {
      const uint16_t at = piece::editRd16(orig, 2 + 2 * i);
      if (!at) continue;
      std::vector<uint8_t> d = orig;
      std::string why;
      const uint8_t ins[2] = {0xe0, 0x18};  // a rest, then a length
      if (!piece::splice(d, at, 0, ins, 2, why)) { printf("[ERROR] %s part %d insert: %s\n", argv[a], i, why.c_str()); bad++; continue; }
      if (piece::editRd16(d, 2 + 2 * i) != at) { printf("[ERROR] %s part %d start moved\n", argv[a], i); bad++; }
      if (piece::pointerSlots(d).size() != slots.size()) { printf("[ERROR] %s part %d pointer count changed\n", argv[a], i); bad++; }
      std::string err;
      if (!piece::load(d, err)) { printf("[ERROR] %s part %d reload: %s\n", argv[a], i, err.c_str()); bad++; }
      if (!piece::splice(d, at, 2, nullptr, 0, why) || d != orig) { printf("[ERROR] %s part %d round trip: %s\n", argv[a], i, why.c_str()); bad++; }
    }
  }
  printf("%s %d songs\n", bad ? "[ERROR]" : "[OK]", argc - 1);
  return bad ? 1 : 0;
}
