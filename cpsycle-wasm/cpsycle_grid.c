/*
 * cpsycle_grid.c - Psycle (PSY3) pattern grid for the DEViLBOX editor (CpsycleEdit target).
 *
 * The song opens through the vendored cpsycle loader (cpsycle_init), which gives the order
 * (sequence track 0) and the track count. The cells come from the file's own PATD chunks,
 * unpacked by the vendored beerz77 decompressor: version 0/1 PATD chunks hold the legacy
 * Psycle grid (lines x song tracks x 5 bytes: note, inst, mach, cmd, param) that
 * psy_audio_convert_legacypattern turns into the player's event list.
 *
 * Edits change only the note and machine bytes whose decoded value differs; save re-packs
 * each changed pattern with beerz77comp2 and splices the PATD chunk back into the file
 * bytes (the PSY3 saver is not part of this build). Every other byte stays as loaded.
 *
 * Grid cell (5 ints): tracker note (0 empty, 1..120 = note 0..119, 97 = release), machine + 1
 * (0 = none), sampler instrument byte (255 = none), command, parameter.
 *
 * Row log: the sequencer hook (sequencer.c) records every played entry as
 * (pattern slot, row, track, raw note, raw machine) for the grid-matches-player test.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

#include "constants.h"
#include "datacompression.h"
#include "pattern.h"
#include "patterns.h"
#include "sequence.h"
#include "sequenceselection.h"
#include "song.h"

#define EXPORT EMSCRIPTEN_KEEPALIVE
#define CELL_INTS 5
#define MAX_PATD 1024

extern int cpsycle_init(const uint8_t *data, uint32_t size);
extern void cpsycle_stop(void);
extern psy_audio_Song *cpsycle_current_song(void);
extern void (*psy_audio_sequencer_rowlog_hook)(const psy_audio_Pattern *, const psy_audio_PatternEntry *);

typedef struct {
	int index, lines;
	uint32_t chunk_pos;   /* offset of the 4-char chunk id */
	uint32_t chunk_size;  /* size field of the chunk */
	uint32_t z77_pos;     /* offset of the sizez77 field */
	uint32_t z77_size;
	unsigned char *raw;   /* decompressed legacy grid */
	size_t raw_size;
	int32_t *cells;       /* lines x channels x CELL_INTS */
	int dirty;
} PatD;

static uint8_t *g_file = NULL;
static uint32_t g_file_size = 0;
static PatD g_pat[MAX_PATD];
static int g_npat = 0;
static int g_channels = 0;
static int *g_order = NULL;
static int g_order_len = 0;
static uint8_t *g_saved = NULL;

static uint32_t rd32(uint32_t p) { return (uint32_t)g_file[p] | ((uint32_t)g_file[p + 1] << 8) | ((uint32_t)g_file[p + 2] << 16) | ((uint32_t)g_file[p + 3] << 24); }
static void wr32(uint8_t *d, uint32_t v) { d[0] = v; d[1] = v >> 8; d[2] = v >> 16; d[3] = v >> 24; }

static int note_to_tracker(int n) {
	if (n == psy_audio_NOTECOMMANDS_RELEASE) return 97;
	if (n < 120) return n + 1;
	return 0; /* empty, tweaks and other commands stay in the file, not on the grid */
}

static int tracker_to_note(int t) {
	if (t == 0) return 255;
	if (t == 97) return psy_audio_NOTECOMMANDS_RELEASE;
	if (t >= 1 && t <= 120) return t - 1;
	return -1;
}

static unsigned char *cell_bytes(PatD *p, int row, int ch) { return p->raw + ((size_t)row * g_channels + ch) * EVENT_SIZE; }

static void fill_cell(PatD *p, int row, int ch) {
	unsigned char *b = cell_bytes(p, row, ch);
	int32_t *c = p->cells + ((size_t)row * g_channels + ch) * CELL_INTS;
	c[0] = note_to_tracker(b[0]);
	c[1] = b[2] == 255 ? 0 : b[2] + 1;
	c[2] = b[1];
	c[3] = b[3];
	c[4] = b[4];
}

void EXPORT cps_grid_close(void) {
	int i;
	for (i = 0; i < g_npat; i++) { free(g_pat[i].raw); free(g_pat[i].cells); }
	g_npat = 0;
	free(g_order); g_order = NULL; g_order_len = 0;
	free(g_file); g_file = NULL; g_file_size = 0;
	free(g_saved); g_saved = NULL;
	cpsycle_stop();
}

/* 0 ok; -1 not PSY3; -2 song load failed; -3 PATD chunk unreadable; -4 PATD version > 1 (event-list patterns, not supported) */
int EXPORT cps_grid_open(const uint8_t *data, uint32_t size) {
	uint32_t pos, hsize;
	psy_audio_Song *song;
	psy_audio_Sequence *seq;
	int k;
	cps_grid_close();
	if (size < 20 || memcmp(data, "PSY3SONG", 8) != 0) return -1;
	if (cpsycle_init(data, size) != 0) return -2;
	song = cpsycle_current_song();
	g_channels = (int)psy_audio_song_numsongtracks(song);
	seq = &song->sequence;
	g_order_len = (int)psy_audio_sequence_track_size(seq, 0);
	g_order = (int *)malloc(sizeof(int) * (g_order_len ? g_order_len : 1));
	for (k = 0; k < g_order_len; k++) g_order[k] = (int)psy_audio_sequence_patternindex(seq, psy_audio_orderindex_make(0, k));

	g_file = (uint8_t *)malloc(size);
	memcpy(g_file, data, size);
	g_file_size = size;
	hsize = rd32(12);
	pos = 16 + hsize;
	while (pos + 12 <= size) {
		uint32_t version = rd32(pos + 4), csize = rd32(pos + 8), q = pos + 12;
		if (memcmp(g_file + pos, "PATD", 4) == 0) {
			PatD *p;
			unsigned char *dst = NULL;
			int r, c;
			if (version > 1) return -4;
			if (g_npat >= MAX_PATD || q + 16 > size) return -3;
			p = &g_pat[g_npat];
			memset(p, 0, sizeof *p);
			p->index = (int32_t)rd32(q);
			p->lines = (int32_t)rd32(q + 4);
			q += 12;
			while (q < size && g_file[q]) q++;
			q++; /* name, null-terminated */
			if (q + 4 > size) return -3;
			p->chunk_pos = pos; p->chunk_size = csize; p->z77_pos = q; p->z77_size = rd32(q);
			if (q + 4 + p->z77_size > size) return -3;
			beerz77decomp2(g_file + q + 4, &dst, &p->raw_size);
			if (!dst || p->lines <= 0 || p->raw_size < (size_t)p->lines * g_channels * EVENT_SIZE) { free(dst); return -3; }
			p->raw = dst;
			p->cells = (int32_t *)calloc((size_t)p->lines * (g_channels ? g_channels : 1) * CELL_INTS, sizeof(int32_t));
			for (r = 0; r < p->lines; r++) for (c = 0; c < g_channels; c++) fill_cell(p, r, c);
			g_npat++;
		}
		pos += 12 + csize;
	}
	return 0;
}

static PatD *pat_by_index(int idx) {
	int i;
	for (i = 0; i < g_npat; i++) if (g_pat[i].index == idx) return &g_pat[i];
	return NULL;
}

int EXPORT cps_grid_channels(void) { return g_channels; }
int EXPORT cps_grid_order_length(void) { return g_order_len; }
int EXPORT cps_grid_order(int k) { return k >= 0 && k < g_order_len ? g_order[k] : -1; }
/* patterns are addressed by their Psycle pattern index, 0..count-1; a missing index has 0 rows */
int EXPORT cps_grid_pattern_count(void) {
	int i, m = 0;
	for (i = 0; i < g_npat; i++) if (g_pat[i].index + 1 > m) m = g_pat[i].index + 1;
	return m;
}
int EXPORT cps_grid_pattern_rows(int idx) { PatD *p = pat_by_index(idx); return p ? p->lines : 0; }
int32_t *EXPORT cps_grid_pattern(int idx) { PatD *p = pat_by_index(idx); return p ? p->cells : NULL; }

/* 0 set or unchanged; -1 out of range; -2 note has no Psycle encoding */
int EXPORT cps_edit_set(int idx, int row, int ch, int note, int ins) {
	PatD *p = pat_by_index(idx);
	unsigned char *b;
	int32_t *c;
	if (!p || row < 0 || row >= p->lines || ch < 0 || ch >= g_channels || ins < 0 || ins > 256) return -1;
	b = cell_bytes(p, row, ch);
	c = p->cells + ((size_t)row * g_channels + ch) * CELL_INTS;
	if (note != c[0]) {
		int n = tracker_to_note(note);
		if (n < 0) return -2;
		b[0] = (unsigned char)n;
		p->dirty = 1;
	}
	if (ins != c[1]) {
		b[2] = ins == 0 ? 255 : (unsigned char)(ins - 1);
		p->dirty = 1;
	}
	fill_cell(p, row, ch);
	return 0;
}

/* new file size, or -1 */
int EXPORT cps_edit_save(void) {
	uint32_t out_size = g_file_size, src = 0, dst = 0;
	unsigned char *z[MAX_PATD] = { 0 };
	unsigned int zn[MAX_PATD] = { 0 };
	int i;
	if (!g_file) return -1;
	for (i = 0; i < g_npat; i++) if (g_pat[i].dirty) {
		zn[i] = beerz77comp2(g_pat[i].raw, &z[i], (unsigned int)g_pat[i].raw_size);
		if (!z[i]) return -1;
		out_size = out_size - g_pat[i].z77_size + zn[i];
	}
	free(g_saved);
	g_saved = (uint8_t *)malloc(out_size);
	/* chunks are in file order; g_pat is filled in file order */
	for (i = 0; i < g_npat; i++) {
		PatD *p = &g_pat[i];
		uint32_t zend;
		if (!p->dirty) continue;
		zend = p->z77_pos + 4 + p->z77_size;
		memcpy(g_saved + dst, g_file + src, p->z77_pos - src);
		wr32(g_saved + dst + (p->chunk_pos + 8 - src), p->chunk_size - p->z77_size + zn[i]);
		dst += p->z77_pos - src;
		wr32(g_saved + dst, zn[i]); dst += 4;
		memcpy(g_saved + dst, z[i], zn[i]); dst += zn[i];
		src = zend;
		free(z[i]);
	}
	memcpy(g_saved + dst, g_file + src, g_file_size - src);
	return (int)out_size;
}

uint8_t *EXPORT cps_edit_saved_ptr(void) { return g_saved; }

/* row log: slot, row, track, note, mach */
#define LOG_REC 5
#define LOG_MAX 200000
static int32_t *g_log = NULL;
static int g_log_n = 0;

static void rowlog(const psy_audio_Pattern *pattern, const psy_audio_PatternEntry *entry) {
	psy_audio_Song *song = cpsycle_current_song();
	const psy_audio_PatternEvent *ev;
	uintptr_t slot, maxk;
	int32_t *r;
	if (!song || !entry || g_log_n >= LOG_MAX) return;
	maxk = psy_table_maxkey(&song->patterns.slots);
	for (slot = 0; slot <= maxk; slot++) if (psy_audio_patterns_at(&song->patterns, slot) == pattern) break;
	/* the global pattern (time signature / loop track) is sequencer state, not grid */
	if (slot > maxk || slot == psy_audio_GLOBALPATTERN) return;
	ev = psy_audio_patternentry_front_const(entry);
	r = g_log + (size_t)g_log_n * LOG_REC;
	r[0] = (int32_t)slot;
	r[1] = (int32_t)(entry->offset * song->properties.lpb + 0.5);
	r[2] = (int32_t)entry->track;
	r[3] = ev ? ev->note : 255;
	r[4] = ev ? ev->mach : 255;
	g_log_n++;
}

void EXPORT cps_rowlog_enable(int on) {
	g_log_n = 0;
	if (on && !g_log) g_log = (int32_t *)malloc(sizeof(int32_t) * LOG_REC * LOG_MAX);
	psy_audio_sequencer_rowlog_hook = on ? rowlog : NULL;
}
int EXPORT cps_rowlog_count(void) { return g_log_n; }
int EXPORT cps_rowlog_record_size(void) { return LOG_REC; }
int32_t *EXPORT cps_rowlog_ptr(void) { return g_log; }
