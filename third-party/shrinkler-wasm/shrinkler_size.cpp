/*
 * shrinkler_size.cpp — WASM wrapper exposing Shrinkler's data compressor purely to
 * REPORT the compressed size. Cinter musicians optimize their songs for the
 * Shrinkler-crunched size; showing it live in DEViLBOX speeds up that iteration.
 *
 * Uses Blueberry's Shrinkler cruncher (github.com/askeksa/Shrinkler) unmodified via
 * its headers; this file only replicates DataFile::compress() without file I/O and
 * returns the crunched byte count. Default params mirror the CLI preset 3 (the
 * default `Shrinkler -d` invocation).
 *
 * Silence the cruncher's progress printf() (it prints per-iteration sizes) so calling
 * this live on every edit doesn't spam the console.
 */
#include <vector>
#include <cstdio>
#include <emscripten.h>

#define printf(...) (0)

// NUM_RELOC_CONTEXTS lives in HunkFile.h (Amiga hunk handling we don't need); define it
// directly so we only pull the portable cruncher core.
#define NUM_RELOC_CONTEXTS 256
#include "Pack.h"

using std::vector;

extern "C" {

/**
 * Return the Shrinkler-compressed size (crunched bytes, excluding the 14-byte data
 * container header) of `len` bytes at `data`. `iterations` <= 0 uses the preset default.
 * `preset` 1..9 selects the compression preset (default 3, matching the CLI).
 */
EMSCRIPTEN_KEEPALIVE
int shrinkler_compressed_size(const unsigned char* data, int len, int iterations, int preset) {
  if (data == 0 || len <= 0) return 0;
  int p = (preset >= 1 && preset <= 9) ? preset : 3;

  PackParams params;
  params.parity_context = true;
  params.iterations     = iterations > 0 ? iterations : 1 * p;
  params.length_margin  = 1 * p;
  params.skip_length    = 1000 * p;
  params.match_patience = 100 * p;
  params.max_same_length = 10 * p;

  vector<unsigned char> buf(data, data + len); // packData takes non-const data
  vector<unsigned char> pack_buffer;
  RangeCoder range_coder(LZEncoder::NUM_CONTEXTS + NUM_RELOC_CONTEXTS, pack_buffer);
  RefEdgeFactory edge_factory(100000);

  range_coder.reset();
  packData(&buf[0], (int)buf.size(), 0, &params, &range_coder, &edge_factory, false);
  range_coder.finish();

  return (int)pack_buffer.size();
}

}
