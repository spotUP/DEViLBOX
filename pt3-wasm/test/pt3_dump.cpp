#include "../src/pt3_decode.h"
#include <cstdio>
#include <fstream>
#include <iterator>
#include <algorithm>
static const char* NN[12] = {"C-","C#","D-","D#","E-","F-","F#","G-","G#","A-","A#","B-"};
static void cellStr(const pt3::Cell& c, char* o) {
  char note[4] = "---";
  if (c.note == pt3::kNoteRelease) snprintf(note, 4, "OFF"); else if (c.note >= 0) snprintf(note, 4, "%s%d", NN[c.note % 12], c.note / 12 + 1);
  char s = c.sample >= 0 ? "0123456789ABCDEFGHIJKLMNOPQRSTUV"[c.sample] : '.';
  char orn = c.ornament >= 0 ? "0123456789ABCDEF"[c.ornament] : '.';
  char vol = c.volume >= 0 ? "0123456789ABCDEF"[c.volume] : '.';
  char env[8] = "...."; if (c.envType == 0) snprintf(env, 8, "off"); else if (c.envType > 0) snprintf(env, 8, "%X%04X", c.envType, c.envPeriod);
  char fx[40] = ""; int k = 0;
  for (auto& e : c.effects) { k += snprintf(fx + k, 40 - k, " %X", e.cmd); for (int i = 0; i < e.nargs && k < 34; i++) k += snprintf(fx + k, 40 - k, "%02X", e.args[i]); }
  snprintf(o, 96, "%s s%c o%c v%c e%s%s", note, s, orn, vol, env, fx);
}
int main(int argc, char** argv) {
  int rc = 0;
  for (int a = 1; a < argc; a++) {
    std::ifstream f(argv[a], std::ios::binary); std::vector<uint8_t> b((std::istreambuf_iterator<char>(f)), {});
    pt3::Module m; std::string err;
    printf("== %s (%zu bytes)\n", argv[a], b.size());
    if (!pt3::decode(b.data(), b.size(), m, err)) { printf("DECODE FAIL: %s\n", err.c_str()); rc = 1; continue; }
    int ns = 0, no = 0, noteCount = 0, totalRows = 0; for (auto& s : m.samples) ns += s.present; for (auto& o : m.ornaments) no += o.present;
    for (int p : m.positions) totalRows += m.patterns[p].rows;
    for (auto& P : m.patterns) for (int ch = 0; ch < 3; ch++) for (auto& c : P.cell[ch]) noteCount += c.note >= 0;
    printf("magic='%s' ver=%d title='%s' author='%s' table=%d speed=%d loop=%d\n", m.magic.c_str(), m.version, m.title.c_str(), m.author.c_str(), m.noteTable, m.speed, m.loopPos);
    printf("positions=%zu patterns=%zu samples=%d ornaments=%d song_rows=%d notes=%d warnings=%zu\n", m.positions.size(), m.patterns.size(), ns, no, totalRows, noteCount, m.warnings.size());
    for (size_t i = 0; i < std::min<size_t>(m.warnings.size(), 5); i++) printf("  warn: %s\n", m.warnings[i].c_str());
    const pt3::Pattern& P = m.patterns[m.positions[0]];
    printf("pattern %d (%d rows), first 8 rows:\n", m.positions[0], P.rows);
    for (int r = 0; r < std::min(8, P.rows); r++) { char x[3][96]; for (int ch = 0; ch < 3; ch++) cellStr(P.cell[ch][r], x[ch]); printf("%02d | %-28s | %-28s | %-28s\n", r, x[0], x[1], x[2]); }
    if (!m.warnings.empty()) rc = 2;
  }
  return rc;
}
