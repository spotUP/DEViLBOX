/*
 * ixs_grid.cpp - pattern grid decode + edit save for the DEViLBOX editor (IxalanceEdit wasm).
 *
 * The grid is read through the replayer's own loader (IXS__Module__loadSongFileData) and its own
 * IT pattern unpacker (IXS__Module__update16Kbuf), so the editor shows exactly the cells the
 * replayer plays. Save re-packs only the edited patterns in standard IT packing, splices them into
 * the inflated tracker data and deflates the file again (the IXS body is one zlib stream).
 *
 * The row hook (IXS_rowHook in PlayerCore.cpp) logs each row the replayer plays, so a test can
 * compare playback against the grid.
 */

#include "PlayerIXS.h"
#include "PlayerCore.h"
#include "Module.h"

#include <zlib.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

namespace {

const int CHANNELS = 64;
const int ROW_BYTES = CHANNELS * 5;
const int CELL_INTS = 5;          // tracker note, instrument, raw vol/pan, cmd, arg
const int EMPTY_ROWS = 64;        // rows shown for a pattern stored as 'p' (no data)
const uint32_t HEADER_SIZE = 0x38;
const int XM_NOTE_OFF = 97;

struct GridPattern {
  bool stored = false;            // false: the file stores 'p' (no data)
  bool dirty = false;
  int rows = 0;
  std::vector<byte> raw;          // rows * ROW_BYTES, the update16Kbuf layout
  std::vector<byte> storedData;   // the packed bytes as loaded (finds the record on save)
  uint16_t storedRows = 0;
};

struct Grid {
  std::vector<byte> file;
  std::vector<GridPattern> patterns;
  std::vector<int> order;         // pattern numbers in play order (0xfe skipped, stops at 0xff)
  int channels = 0;
  std::vector<int32_t> cells;     // scratch for ixs_grid_pattern
  std::vector<byte> saved;
};

Grid *g_grid = nullptr;

uint32_t rd32(const byte *p) { return (uint32_t) p[0] | ((uint32_t) p[1] << 8) | ((uint32_t) p[2] << 16) | ((uint32_t) p[3] << 24); }
uint16_t rd16(const byte *p) { return (uint16_t) (p[0] | (p[1] << 8)); }
void wr32(byte *p, uint32_t v) { p[0] = (byte) v; p[1] = (byte) (v >> 8); p[2] = (byte) (v >> 16); p[3] = (byte) (v >> 24); }
void wr16(std::vector<byte> &out, uint16_t v) { out.push_back((byte) v); out.push_back((byte) (v >> 8)); }

// IT note byte -> tracker note (ITParser convention: IT n is tracker n + 1; off, cut and fade are XM note off).
int itToTrackerNote(byte n) {
  if (n == 0) return 0;           // the unpacker leaves 0 for "no note" (IT C-0 reads the same)
  if (n < 120) return n + 1;
  return XM_NOTE_OFF;
}

// Tracker note -> IT note byte; -1 = not writable.
int trackerToItNote(int n) {
  if (n == 0) return 0;
  if (n == XM_NOTE_OFF) return 255;
  // shortcut: tracker note 1 (IT C-0) is refused, since the unpacked grid cannot tell C-0 from empty; upgrade if a song needs C-0
  if (n >= 2 && n <= 120) return n - 1;
  return -1;
}

// Standard IT packing of one pattern, without the "last value" compression (bits 0x10-0x80).
void packPattern(const GridPattern &p, std::vector<byte> &out) {
  for (int r = 0; r < p.rows; r++) {
    const byte *row = &p.raw[(size_t) r * ROW_BYTES];
    for (int c = 0; c < CHANNELS; c++) {
      const byte *cell = row + c * 5;
      byte mask = 0;
      if (cell[0] != 0) mask |= 1;
      if (cell[1] != 0) mask |= 2;
      if (cell[2] != 0xFF) mask |= 4;
      if (cell[3] != 0 || cell[4] != 0) mask |= 8;
      if (!mask) continue;
      out.push_back((byte) ((c + 1) | 0x80));
      out.push_back(mask);
      if (mask & 1) out.push_back(cell[0]);
      if (mask & 2) out.push_back(cell[1]);
      if (mask & 4) out.push_back(cell[2]);
      if (mask & 8) { out.push_back(cell[3]); out.push_back(cell[4]); }
    }
    out.push_back(0);
  }
}

void freeGrid() {
  delete g_grid;
  g_grid = nullptr;
}

/* ---- row log (playback probe) ---- */

const int LOG_RECORD = 4 + CHANNELS * 2;    // ordIdx, pattern, row lo, row hi, 64 notes, 64 instruments
const int LOG_MAX_ROWS = 20000;
std::vector<byte> g_rowLog;

void rowHook(IXS::PlayerCore *core) {
  if ((int) (g_rowLog.size() / LOG_RECORD) >= LOG_MAX_ROWS) return;
  size_t at = g_rowLog.size();
  g_rowLog.resize(at + LOG_RECORD);
  byte *rec = &g_rowLog[at];
  rec[0] = core->ordIdx_0x3215;
  rec[1] = core->order_0x3214;
  rec[2] = (byte) core->currentRow_0x3216;
  rec[3] = (byte) (core->currentRow_0x3216 >> 8);
  for (int c = 0; c < CHANNELS; c++) {
    rec[4 + c] = core->channels_0xc.channels[c].chan5_0x1.note_0x0;
    rec[4 + CHANNELS + c] = core->channels_0xc.channels[c].chan5_0x1.numIns_0x1;
  }
}

}  // namespace

/* ---- grid ---- */

// Returns 0 on success.
EXPORT int ixs_grid_open(const byte *data, uint32_t size) {
  freeGrid();
  if (size < HEADER_SIZE || memcmp(data, "IXS!", 4) != 0) return -1;

  IXS::PlayerIXS *player = IXS::IXS__PlayerIXS__createPlayer_00405d90(44100);
  if (!player) return -2;
  Grid *grid = new Grid();
  grid->file.assign(data, data + size);
  // the loader reads from the buffer it gets; give it a copy so grid->file stays the original bytes
  std::vector<byte> loadCopy(grid->file);
  if ((*player->vftable->loadIxsFileData)(player, loadCopy.data(), size, nullptr, nullptr, nullptr) != 0) {
    (*player->vftable->delete0)(player);
    delete grid;
    return -3;
  }

  IXS::Module *module = player->ptrCore_0x4->ptrModule_0x8;
  int patNum = module->impulseHeader_0x0.PatNum_0x26;
  int ordNum = module->impulseHeader_0x0.OrdNum_0x20;
  grid->patterns.resize(patNum);
  int maxChannel = -1;
  for (int p = 0; p < patNum; p++) {
    GridPattern &gp = grid->patterns[p];
    if (module->patDataPtrArray_0xdc[p] == nullptr) {
      gp.rows = EMPTY_ROWS;
      gp.raw.assign((size_t) EMPTY_ROWS * ROW_BYTES, 0);
      for (int i = 0; i < EMPTY_ROWS * CHANNELS; i++) gp.raw[(size_t) i * 5 + 2] = 0xFF;
      continue;
    }
    gp.stored = true;
    gp.storedRows = module->patHeadPtrArray_0xd8[p]->rows_0x2;
    gp.storedData.assign(module->patDataPtrArray_0xdc[p], module->patDataPtrArray_0xdc[p] + module->patHeadPtrArray_0xd8[p]->len_0x0);
    gp.rows = gp.storedRows;
    if (gp.rows > 200) gp.rows = 200;  // update16Kbuf holds 200 rows
    module->lastOrder_0xfaec = -1;
    IXS::IntBuffer16k *buf = IXS::IXS__Module__update16Kbuf_00408ec0(module, p);
    const byte *src = (const byte *) buf->buf_0x0;
    gp.raw.assign(src, src + (size_t) gp.rows * ROW_BYTES);
    for (int r = 0; r < gp.rows; r++)
      for (int c = 0; c < CHANNELS; c++) {
        const byte *cell = &gp.raw[(size_t) r * ROW_BYTES + c * 5];
        if ((cell[0] || cell[1] || cell[2] != 0xFF || cell[3] || cell[4]) && c > maxChannel) maxChannel = c;
      }
  }
  module->lastOrder_0xfaec = -1;
  for (int k = 0; k < ordNum; k++) {
    byte o = module->ordersBuffer_0xc8[k];
    if (o == 0xff) break;
    if (o == 0xfe) continue;
    grid->order.push_back(o);
  }
  grid->channels = maxChannel + 1 > 0 ? maxChannel + 1 : 1;
  // the WaveGen sample cache stays: a running player may share it
  (*player->vftable->delete0)(player);

  g_grid = grid;
  return 0;
}

EXPORT void ixs_grid_close(void) { freeGrid(); }
EXPORT int ixs_grid_channels(void) { return g_grid ? g_grid->channels : 0; }
EXPORT int ixs_grid_order_length(void) { return g_grid ? (int) g_grid->order.size() : 0; }
EXPORT int ixs_grid_order(int k) {
  if (!g_grid || k < 0 || k >= (int) g_grid->order.size()) return -1;
  return g_grid->order[k];
}
EXPORT int ixs_grid_pattern_count(void) { return g_grid ? (int) g_grid->patterns.size() : 0; }
EXPORT int ixs_grid_pattern_rows(int p) {
  if (!g_grid || p < 0 || p >= (int) g_grid->patterns.size()) return 0;
  return g_grid->patterns[p].rows;
}

// Pointer to rows * channels * CELL_INTS int32 cells: tracker note, instrument, raw vol/pan, cmd, arg.
EXPORT int32_t *ixs_grid_pattern(int p) {
  if (!g_grid || p < 0 || p >= (int) g_grid->patterns.size()) return nullptr;
  const GridPattern &gp = g_grid->patterns[p];
  int ch = g_grid->channels;
  g_grid->cells.assign((size_t) gp.rows * ch * CELL_INTS, 0);
  for (int r = 0; r < gp.rows; r++)
    for (int c = 0; c < ch; c++) {
      const byte *cell = &gp.raw[(size_t) r * ROW_BYTES + c * 5];
      int32_t *out = &g_grid->cells[((size_t) r * ch + c) * CELL_INTS];
      out[0] = itToTrackerNote(cell[0]);
      out[1] = cell[1];
      out[2] = cell[2];
      out[3] = cell[3];
      out[4] = cell[4];
    }
  return g_grid->cells.data();
}

/* ---- edit + save ---- */

// Sets note + instrument of one cell. Writes only when the tracker value differs from the decoded one,
// so unedited cells keep their original bytes (IT off / cut / fade all show as note off).
// Returns 0 = ok, -1 = out of range, -2 = note not writable.
EXPORT int ixs_edit_set(int p, int row, int ch, int note, int ins) {
  if (!g_grid || p < 0 || p >= (int) g_grid->patterns.size()) return -1;
  GridPattern &gp = g_grid->patterns[p];
  if (row < 0 || row >= gp.rows || ch < 0 || ch >= CHANNELS || ins < 0 || ins > 255) return -1;
  byte *cell = &gp.raw[(size_t) row * ROW_BYTES + ch * 5];
  if (itToTrackerNote(cell[0]) != note) {
    int it = trackerToItNote(note);
    if (it < 0) return -2;
    cell[0] = (byte) it;
    gp.dirty = true;
  }
  if (cell[1] != ins) {
    cell[1] = (byte) ins;
    gp.dirty = true;
  }
  return 0;
}

// Builds the edited file. Returns its size, or < 0 on error. Bytes via ixs_edit_saved_ptr.
EXPORT int ixs_edit_save(void) {
  if (!g_grid) return -1;
  const std::vector<byte> &file = g_grid->file;
  uint32_t offset1 = rd32(&file[8]);
  uint32_t offset2 = rd32(&file[12]);
  uint32_t packedLen = rd32(&file[16]);
  if (HEADER_SIZE + (size_t) packedLen > file.size()) return -2;

  uLongf rawLen = (uLongf) packedLen * 64 + 64 * 1024 * 1024;
  std::vector<byte> raw(rawLen);
  if (uncompress(raw.data(), &rawLen, &file[HEADER_SIZE], packedLen) != Z_OK) return -3;
  raw.resize(rawLen);
  if (offset1 > rawLen || offset2 > rawLen || offset2 < offset1) return -4;

  // The loader reads the pattern records last, in sequence, right up to offset1: start = offset1 - S.
  std::vector<GridPattern> &pats = g_grid->patterns;
  size_t span = 0;
  for (const GridPattern &gp : pats) span += gp.stored ? 5 + gp.storedData.size() : 1;
  if (span > offset1) return -5;
  size_t start = offset1 - span;
  // check every record against what the loader kept
  for (size_t at = start, p = 0; p < pats.size(); p++) {
    const GridPattern &gp = pats[p];
    if (!gp.stored) {
      if (raw[at] != 'p') return -6;
      at += 1;
      continue;
    }
    if (raw[at] == 'p' || rd16(&raw[at + 1]) != gp.storedData.size() || rd16(&raw[at + 3]) != gp.storedRows) return -6;
    if (memcmp(&raw[at + 5], gp.storedData.data(), gp.storedData.size()) != 0) return -6;
    at += 5 + gp.storedData.size();
  }

  std::vector<byte> section;
  for (size_t at = start, p = 0; p < pats.size(); p++) {
    const GridPattern &gp = pats[p];
    size_t recLen = gp.stored ? 5 + gp.storedData.size() : 1;
    if (!gp.dirty) {
      section.insert(section.end(), raw.begin() + at, raw.begin() + at + recLen);
    } else {
      std::vector<byte> packed;
      packPattern(gp, packed);
      if (packed.size() > 0xFFFF) return -7;
      section.push_back(gp.stored ? raw[at] : 0);
      wr16(section, (uint16_t) packed.size());
      wr16(section, (uint16_t) gp.rows);
      section.insert(section.end(), packed.begin(), packed.end());
    }
    at += recLen;
  }

  std::vector<byte> body(raw.begin(), raw.begin() + start);
  body.insert(body.end(), section.begin(), section.end());
  body.insert(body.end(), raw.begin() + offset1, raw.end());
  int32_t delta = (int32_t) section.size() - (int32_t) span;

  uLongf packedOut = compressBound(body.size());
  std::vector<byte> out(HEADER_SIZE + packedOut);
  if (compress2(&out[HEADER_SIZE], &packedOut, body.data(), body.size(), 9) != Z_OK) return -8;
  memcpy(out.data(), file.data(), HEADER_SIZE);
  wr32(&out[8], offset1 + delta);
  wr32(&out[12], offset2 + delta);
  wr32(&out[16], (uint32_t) packedOut);
  out.resize(HEADER_SIZE + packedOut);
  // keep any bytes the file carries after the zlib stream
  out.insert(out.end(), file.begin() + HEADER_SIZE + packedLen, file.end());
  g_grid->saved.swap(out);
  return (int) g_grid->saved.size();
}

EXPORT const byte *ixs_edit_saved_ptr(void) { return g_grid ? g_grid->saved.data() : nullptr; }

/* ---- row log ---- */

EXPORT void ixs_rowlog_enable(int on) {
  g_rowLog.clear();
  IXS::IXS_rowHook = on ? rowHook : nullptr;
}
EXPORT int ixs_rowlog_count(void) { return (int) (g_rowLog.size() / LOG_RECORD); }
EXPORT int ixs_rowlog_record_size(void) { return LOG_RECORD; }
EXPORT const byte *ixs_rowlog_ptr(void) { return g_rowLog.data(); }
