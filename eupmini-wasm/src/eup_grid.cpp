/*
 * eup_grid.cpp - EUP (FM Towns Euphony) event stream as an editable tracker grid.
 *
 * The walk follows EUPPlayer::nextTick (eupplayer.cpp, OVERSTEP 2): events start at header + 6, step time is
 * p[2] + 0x80 * p[3] clamped to 383, a 0xF2 bar marker starts the next bar, 0x9x note-on is 12 bytes, every
 * other command 6, 0xFE ends the song. One pattern per bar, 16 rows of 24 steps (a 16th note at 96 steps per
 * beat). A channel is one voice slot of one track: notes of a track that start in the same row take the next slot.
 *
 * Edits change the file in place: pitch and velocity bytes of an existing note-on; a cleared note becomes two
 * 0xFF dummy events (same length, the player skips them); a new note is inserted as a 12-byte note-on in step
 * order. eup_oracle_* runs the vendored EUPPlayer over the same bytes with a recording device,
 * so tests compare the grid with what the player plays.
 */
#include <cstdint>
#include <cstring>
#include <vector>
#include <map>
#include <algorithm>
#include "eupplayer.hpp"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

namespace {

const int kHeader = 2048 + 6;
const int kRowSteps = 24;
const int kRows = 16;
/** Ints per cell: tracker note, velocity, byte offset of the note-on (-1 none), player tick, tempo (row's 0xF8, 0 none). */
const int kCell = 5;

struct Ev { int bar, step, tick, track, midi, velo, off; };

std::vector<uint8_t> g_buf;
std::vector<int> g_cells;
std::vector<int> g_chanTrack;  // channel -> track
std::vector<int> g_chanSlot;   // channel -> voice slot within the track
int g_bars = 0;

inline int stepOf(const uint8_t *p) { return std::min(p[2] + 0x80 * p[3], 383); }
inline int noteOf(int midi) { int n = midi - 11; return n >= 1 && n <= 96 ? n : 0; }

/** Walk the event stream like the player; fills notes and per-row tempo, returns the bar count. */
int walk(std::vector<Ev> &notes, std::map<long, int> &tempos, std::vector<int> &barEnd) {
    notes.clear(); tempos.clear(); barEnd.clear();
    size_t p = kHeader;
    int bar = 0, barTick = 0, cur = 0;
    while (p + 6 <= g_buf.size()) {
        const uint8_t *e = &g_buf[p];
        int cmd = e[0];
        // shortcut: invalid / unsupported commands also end the player's tick early; none occur in the corpus
        if (cmd >= 0x90 && cmd < 0xA0) {
            if (p + 12 > g_buf.size()) break;
            cur = std::max(cur, stepOf(e));
            notes.push_back({bar, cur, barTick + cur, e[1], e[4], e[5], (int)p});
            p += 12;
            continue;
        }
        if (cmd == 0xFF || cmd < 0x80) { p += 6; continue; }
        cur = std::max(cur, stepOf(e));  // every other handled command waits for its step
        if (cmd == 0xF8) tempos[(long)bar * kRows + std::min(cur / kRowSteps, kRows - 1)] = 30 + e[4] + (e[5] << 7);
        if (cmd == 0xFE) break;
        if (cmd == 0xF2) { barEnd.push_back((int)p); barTick += cur; cur = 0; bar++; }
        p += 6;
    }
    barEnd.push_back((int)p);
    return bar + 1;
}

void decode() {
    std::vector<Ev> notes; std::map<long, int> tempos; std::vector<int> barEnd;
    g_bars = walk(notes, tempos, barEnd);
    // voice slots per track: the n-th note of a track in one row takes slot n
    std::map<long, int> used;
    std::map<int, int> slots;  // track -> slot count
    std::vector<int> slotOf(notes.size());
    for (size_t i = 0; i < notes.size(); i++) {
        const Ev &n = notes[i];
        long k = ((long)n.bar * kRows + std::min(n.step / kRowSteps, kRows - 1)) * 64 + n.track;
        slotOf[i] = used[k]++;
        slots[n.track] = std::max(slots[n.track], slotOf[i] + 1);
    }
    g_chanTrack.clear(); g_chanSlot.clear();
    std::map<long, int> chanOf;
    for (auto &ts : slots) for (int s = 0; s < ts.second; s++) {
        chanOf[(long)ts.first * 64 + s] = (int)g_chanTrack.size();
        g_chanTrack.push_back(ts.first); g_chanSlot.push_back(s);
    }
    int ch = std::max<int>(1, (int)g_chanTrack.size());
    g_cells.assign((size_t)g_bars * kRows * ch * kCell, 0);
    for (size_t c = 0; c < g_cells.size(); c += kCell) g_cells[c + 2] = -1;
    for (size_t i = 0; i < notes.size(); i++) {
        const Ev &n = notes[i];
        int row = std::min(n.step / kRowSteps, kRows - 1);
        int *cell = &g_cells[(((size_t)n.bar * kRows + row) * ch + chanOf[(long)n.track * 64 + slotOf[i]]) * kCell];
        cell[0] = noteOf(n.midi); cell[1] = n.velo; cell[2] = n.off; cell[3] = n.tick;
    }
    for (auto &t : tempos) g_cells[(size_t)t.first * ch * kCell + 4] = t.second;
}

/** Byte offset where a note-on at (bar, step) goes: after the last event of that bar at or before the step. */
int insertPoint(int bar, int step) {
    size_t p = kHeader;
    int b = 0;
    while (p + 6 <= g_buf.size()) {
        const uint8_t *e = &g_buf[p];
        int len = (e[0] >= 0x90 && e[0] < 0xA0) ? 12 : 6;
        bool timed = e[0] >= 0x80 && e[0] != 0xFF;
        if (b == bar && (e[0] == 0xF2 || e[0] == 0xFE || (timed && stepOf(e) > step))) return (int)p;
        if (e[0] == 0xFE) return -1;
        if (e[0] == 0xF2) b++;
        p += len;
    }
    return -1;
}

/** Recording device for the oracle: channel == track (identity map), tick counted by the caller. */
struct Recorder : PolyphonicAudioDevice {
    std::vector<int> log;
    int tick = 0;
    void enable(int, bool) override {}
    void note(int channel, int n, int onVelo, int, int) override {
        log.push_back(tick); log.push_back(channel); log.push_back(n); log.push_back(onVelo);
    }
    void controlChange(int, int, int) override {}
    void programChange(int, int) override {}
    void pitchBend(int, int) override {}
};
Recorder g_rec;

}  // namespace

EXPORT int eup_grid_open(const uint8_t *data, int size) {
    if (size < kHeader + 6) return -1;
    g_buf.assign(data, data + size);
    decode();
    return 0;
}
EXPORT void eup_grid_close() { g_buf.clear(); g_buf.shrink_to_fit(); g_cells.clear(); g_cells.shrink_to_fit(); }
EXPORT int eup_grid_bars() { return g_bars; }
EXPORT int eup_grid_rows() { return kRows; }
EXPORT int eup_grid_channels() { return std::max<int>(1, (int)g_chanTrack.size()); }
EXPORT int eup_grid_channel_track(int ch) { return ch < (int)g_chanTrack.size() ? g_chanTrack[ch] : 0; }
EXPORT int eup_grid_channel_slot(int ch) { return ch < (int)g_chanSlot.size() ? g_chanSlot[ch] : 0; }
EXPORT int eup_grid_cell_ints() { return kCell; }
EXPORT int *eup_grid_cells() { return g_cells.data(); }
/** Initial tempo the harness sets (header 0x805 + 30). */
EXPORT int eup_grid_tempo() { return g_buf.size() > 0x805 ? g_buf[0x805] + 30 : 120; }

/**
 * Edits go by the byte offset the grid gave (cell int 2), so one edit never moves another: change pitches and
 * clear notes first (same length), insert last. note: tracker note, 0 clears. velo 1..127, 0 keeps the byte.
 * Returns 0 done, -1 no note-on at off, -2 note has no EUP encoding.
 */
EXPORT int eup_edit_note(int off, int note, int velo) {
    if (off < kHeader || off + 12 > (int)g_buf.size() || (g_buf[off] & 0xF0) != 0x90) return -1;
    if (note < 0 || note > 96) return -2;
    uint8_t *e = &g_buf[off];
    if (note == 0) std::memset(e, 0xFF, 12);  // two dummy events: same length, the player skips them
    else { e[4] = (uint8_t)(note + 11); if (velo > 0) e[5] = (uint8_t)std::min(velo, 127); }
    return 0;
}

/**
 * Insert a note-on for `track` in (bar, row): after the last event of the bar that starts at or before the row's
 * last step, with step = max(row start, that event's step) so it plays inside the row and takes the track's next
 * free voice slot there. Gate one row, off velocity 0 (= on velocity). Returns 0, -1 no such bar, -2 bad note.
 */
EXPORT int eup_edit_insert(int bar, int row, int track, int note, int velo) {
    if (note < 1 || note > 96) return -2;
    if (bar < 0 || row < 0 || row >= kRows || track < 0 || track > 31) return -1;
    int last = row == kRows - 1 ? 383 : (row + 1) * kRowSteps - 1;
    int at = insertPoint(bar, last);
    if (at < 0) return -1;
    int step = row * kRowSteps;
    // the event before the insert point sets the player's current step when it is in this bar and later
    for (size_t p = kHeader, b = 0; (int)p < at;) {
        const uint8_t *e = &g_buf[p];
        if (e[0] == 0xF2) { b++; step = row * kRowSteps; }
        else if ((int)b == bar && e[0] >= 0x80 && e[0] != 0xFF) step = std::max(step, stepOf(e));
        p += (e[0] >= 0x90 && e[0] < 0xA0) ? 12 : 6;
    }
    const int gate = kRowSteps;
    uint8_t ev[12] = {(uint8_t)0x90, (uint8_t)track, (uint8_t)(step & 0x7F), (uint8_t)(step >> 7),
                      (uint8_t)(note + 11), (uint8_t)(velo > 0 ? std::min(velo, 127) : 100),
                      0x80, (uint8_t)(gate & 15), (uint8_t)((gate >> 4) & 15), (uint8_t)((gate >> 8) & 15),
                      (uint8_t)((gate >> 12) & 15), 0};
    g_buf.insert(g_buf.begin() + at, ev, ev + 12);
    return 0;
}
/** Decode the grid again after edits (cells, channels and bars from the edited bytes). */
EXPORT void eup_grid_redecode() { decode(); }
EXPORT int eup_edit_size() { return (int)g_buf.size(); }
EXPORT const uint8_t *eup_edit_ptr() { return g_buf.data(); }

/** Play the open bytes through EUPPlayer for up to maxTicks steps; returns the note count (4 ints each). */
EXPORT int eup_oracle_run(int maxTicks) {
    g_rec.log.clear();
    if (g_buf.size() < (size_t)kHeader + 6) return 0;
    EUPPlayer player;
    player.outputDevice(&g_rec);
    for (int t = 0; t < 32; t++) player.mapTrack_toChannel(t, t);
    player.tempo(eup_grid_tempo());
    g_buf.push_back(0xFE); g_buf.insert(g_buf.end(), 11, 0);  // guard: the player reads past a missing end mark
    player.startPlaying(g_buf.data() + kHeader);
    for (g_rec.tick = 0; g_rec.tick < maxTicks && player.isPlaying(); g_rec.tick++) player.nextTick();
    g_buf.resize(g_buf.size() - 12);
    return (int)g_rec.log.size() / 4;
}
EXPORT int *eup_oracle_log() { return g_rec.log.data(); }
