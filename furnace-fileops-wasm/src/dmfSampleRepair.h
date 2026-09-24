/**
 * dmfSampleRepair — DefleMask files that are missing bytes from their deflate
 * stream.
 *
 * About a sixth of the DefleMask corpus carries a zlib checksum that does not
 * match its data. Upstream Furnace refuses those files at the checksum. Read
 * anyway, most of them lose single bytes from the compressed stream: a
 * 16-bit sample runs a byte short, its second half turns to byte-swapped
 * noise, and every record after it reads as garbage.
 *
 * The compressor's copy distances count the true data. So after a lost byte,
 * every copy that reaches back across the gap lands one byte early: the
 * damage spreads into later sample names ("opend hihat.wav"), lengths and
 * sound. Patching the inflated data cannot mend those copies; inflating again
 * with the byte put back mends all of them (measured on "Rainbow Island
 * title.dmf": one byte restores all five records and every name).
 *
 * dmfRestoreStream() does that one damaged record at a time, placing each
 * lost byte where the sample's own sound says (the smoothest path through the
 * byte pairing) or in the header that follows, and keeping a candidate only
 * when the records then read further. The value of a lost byte is estimated
 * from its neighbours; the checksums show the files carry other damage too,
 * so an exact match is not expected.
 *
 * dmfRepairSampleBlock() then mends what is left in the inflated data:
 * records found a few bytes early are realigned, and when a record cannot be
 * found at all, the samples before it are kept.
 */
#ifndef DMF_SAMPLE_REPAIR_H
#define DMF_SAMPLE_REPAIR_H

#include <cstddef>
#include <cstdint>
#include <vector>

// A byte to put back: position in the data it is inserted into, and value.
struct DmfInsert {
  size_t at;
  unsigned char value;
};

struct DmfSampleRepair {
  // False when the block reads as written; nothing below applies.
  bool changed=false;
  // The sample block rebuilt with every sample at its declared size, followed
  // by whatever trailed the last record in the file.
  std::vector<unsigned char> block;
  // Bytes the file lacked inside sample data. 0 = the block framed as-is.
  int missingBytes=0;
  // Samples that had bytes put back.
  int damagedSamples=0;
  // Records the block holds. Less than the file's count when a record could
  // not be found at all: the samples before it are kept, the last of them
  // held over its missing tail.
  int samplesKept=0;
  // The last kept sample ran out of data and was held over its missing tail.
  bool lastCutShort=false;
};

/**
 * `buf`/`len`: the sample records, from the first record's length field to the
 * end of the decompressed file. `version` is the DMF version byte, `count` the
 * number of samples. Always succeeds: when not even the first record reads,
 * the song keeps no samples rather than being refused.
 */
/** True when the sample block reads the upstream way: nothing to repair. */
bool dmfSampleBlockReadsAsWritten(const unsigned char* buf, size_t len, int version, int count);

void dmfRepairSampleBlock(const unsigned char* buf, size_t len, int version, int count, DmfSampleRepair& out);

/**
 * The raw deflate stream of the file being loaded (after the 2-byte zlib
 * header), kept by DivEngine::load() when the file was zlib-compressed. Empty
 * otherwise.
 */
extern std::vector<unsigned char> g_dmfDeflateStream;

/**
 * Put missing bytes back into the deflate stream itself. The compressor's copy
 * distances count the true data, so a copy made after a lost byte reaches one
 * byte too far back: patching the inflated data repairs the gap but leaves
 * every such copy wrong. Re-inflating with the byte in place fixes them all.
 *
 * Works one damaged record at a time: frame the block, take the first record
 * that lost bytes, work out where (the smoothness path for sample data, the
 * header reading for a header) and with what, re-inflate, and look again —
 * later records often read cleanly once the copies into them are right.
 *
 * `file`/`len` is the inflated file, `blockStart` where its sample records
 * begin. On return `out` holds the re-inflated file. Returns the number of
 * bytes put back; 0 leaves `out` empty.
 */
int dmfRestoreStream(const unsigned char* file, size_t len, size_t blockStart, int version, int count, std::vector<unsigned char>& out);


#endif
