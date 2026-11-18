# amiga/uade.mk -- staging for the UADE music backend.
#
# Included unconditionally (like romsample.mk / adpcm.mk); everything inside is
# gated on the backend actually being uade, so a demo that does not use it pays
# nothing (RULE 12).
#
# The chain is: the project's music.filename names a module; its
# eagleplayer.conf prefix names an EaglePlayer; tools/uade_stage.py copies both
# into out/ and writes out/uade_sizes.i, which amiga/uade_glue.s includes.
# Nothing here is hardcoded to a pilot format.

UADE_ACTIVE := $(filter uade,$(UPROUGH_MUSIC_BACKEND))

ifneq ($(UADE_ACTIVE),)

UADE_ROOT      ?= amiga/vendor/uade-3.05
# Resolved: a project that vendors its own module is found first.
UADE_MUSIC     ?= $(call uprough_asset,Music,$(LSP_MUSIC_FILE))
# music.uade.player -- an explicit override when the prefix is ambiguous or the
# file is named unhelpfully. Empty means "resolve from eagleplayer.conf".
UPROUGH_UADE_PLAYER  ?=
UPROUGH_UADE_SUBSONG ?= 0
UPROUGH_UADE_ON_END  ?= loop
# Arena high-water marks. These are per-module and only the device can report
# them: boot amiga/uade_probe.s against the module and read the chippoint and
# uade_anypoint values it publishes. The defaults carry the AHX pilot's figures
# with headroom (2,576 chip / 412,152 any). Guessing low is safe but never
# silent -- score's PORT'd ceiling reports "AllocMem past end of pool" and stops.
# Arena sizes are MEASURED per player -- amiga/uade_arena_sizes.tsv, from a
# device sweep -- so these are left unset and tools/uade_stage.py decides.
# Setting either on the command line overrides the measurement for that build;
# a player with no row falls back to the stager's defaults and says so.
# They used to be `?=` defaults that were always passed, which meant one pair of
# numbers for every format: 27 of the 31 measured formats allocate NO MEMF_ANY
# at all, and carrying AHX's 448 KB arena for them is what put a uade demo out
# of reach on a machine with no fast RAM.

UADE_PLAYER_ARG := $(if $(UPROUGH_UADE_PLAYER),--player $(UPROUGH_UADE_PLAYER),)

# A playlist (music.songs, UPROUGH_UADE_SONGS set by compile_demo) stages N
# modules as one arena from the project JSON, instead of the single
# UADE_MUSIC file --module resolves. Empty UPROUGH_UADE_SONGS keeps the
# --module path -- that is what keeps the 40 single-song formats working.
#
# QUOTED, both of them. A module filename with SPACES in it -- which the UADE
# corpus is full of ("sdr.nobuddiesland end 2", "mdat.fatalheritage ship") --
# otherwise splits into several argv entries and argparse fails with
# "argument --module: expected one argument", from inside a build whose own
# DEMO_JSON was perfectly fine. Measured 2026-09-22.
#
# RECURSIVE (=), NOT IMMEDIATE (:=). This file is -included at Makefile.amiga
# line ~249, but LSP_MUSIC_FILE -- which UADE_MUSIC is built from -- is not
# defined until ~1451. With `:=` these expanded at include time, baked in an
# EMPTY module name, and every single-song UADE build failed with "no
# eagleplayer.conf prefix matches (tried nothing -- no dot in the name)",
# pointing at the module rather than at the ordering. Same class as the
# resolver that used to be defined below the .mk files that consume it.
# Measured 2026-09-22.
UADE_PLAYLIST_ARG = $(if $(UPROUGH_UADE_SONGS),--playlist "$(DEMO_JSON)",)
UADE_MODULE_ARG   = $(if $(UPROUGH_UADE_SONGS),,--module "$(UADE_MUSIC)")

# One recipe produces all these artifacts, so make cannot run it several times
# in parallel and race itself on out/uade_sizes.i.
UADE_STAGED := out/current.uademod out/current.uadeplayer out/uade_sizes.i \
               out/current.uadefiles.bin out/current.uadefiles.i

# $(DEMO_JSON) matters here: in playlist mode the song list lives in the
# PROJECT JSON (music.songs), not in $(UADE_MUSIC) -- that variable still
# defaults to Data/Music/$(LSP_MUSIC_FILE) and rarely changes when a playlist
# is edited. Without this, editing a playlist and rebuilding silently kept
# the PREVIOUS staged songs -- the same class of stale-artifact bug that has
# cost this project hours today (a stale exe, a stale companion table, a
# stale bytecode cache, a stale arena table).
# ...and the PATH of that JSON matters as much as its mtime. A dependency on
# $(DEMO_JSON) only re-stages when THAT FILE is newer than out/uade_sizes.i, so
# building project B whose JSON is OLDER than project A's last build silently
# kept A's songs staged: measured 2026-09-23, a two-song FuturePlayer repro that
# booted as the FredGray one and was very nearly reported as a result. The stamp
# is named after the path, and switching paths removes the old one, so any
# CHANGE of project re-stages regardless of mtimes.
UADE_JSON_STAMP := out/uade_json_stamp_$(shell printf '%s' "$(DEMO_JSON)" | shasum | cut -c1-12)
$(UADE_JSON_STAMP):
	@rm -f out/uade_json_stamp_*
	@mkdir -p out
	@touch $@

out/uade_sizes.i: $(UADE_MUSIC) $(DEMO_JSON) $(UADE_JSON_STAMP) tools/uade_stage.py tools/uade_lookup.py \
                  amiga/uade_player_min_cpu.tsv \
                  tools/uade_arena_table.py amiga/uade_arena_sizes.tsv \
                  amiga/uade_ahx_waves.bin \
                  $(UADE_ROOT)/eagleplayer.conf
	@mkdir -p out
	python3 tools/uade_stage.py $(UADE_MODULE_ARG) $(UADE_PLAYLIST_ARG) \
	    $(UADE_PLAYER_ARG) \
	    --uade-root $(UADE_ROOT) --outdir out \
	    --target-cpu $(UPROUGH_TARGET_CPU) \
	    $(if $(UPROUGH_UADE_POOL_BYTES),--pool-bytes $(UPROUGH_UADE_POOL_BYTES)) \
	    $(if $(UPROUGH_UADE_ANY_BYTES),--any-bytes $(UPROUGH_UADE_ANY_BYTES))

out/current.uademod out/current.uadeplayer \
out/current.uadefiles.bin out/current.uadefiles.i: out/uade_sizes.i
	@:

# The whole backend is one object: uade_glue.s includes the vendored score.s,
# which includes relocator.s.
out/uade_glue.o: amiga/uade_glue.s \
                 amiga/uade_layout.i \
                 $(UADE_ROOT)/amigasrc/score/score.s \
                 $(UADE_ROOT)/amigasrc/score/relocator.s \
                 $(UADE_STAGED) $(NO_MUSIC_STAMP)
	@mkdir -p $(@D)
	$(VASM) $(VASM_FLAGS) $(UADE_VASM_FLAGS) -o $@ $<

endif
