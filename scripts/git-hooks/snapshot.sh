# Shared by pre-commit and pre-push (sourced, not executed): test a snapshot,
# never the working tree. Several agents edit the tree all day, and their
# unfinished edits must not fail (or falsely pass) someone else's commit or push.
#
# A snapshot is a throwaway --shared clone (no worktree, no index or ref changes
# in this repo) that reuses this checkout's node_modules and is removed on every
# exit path. The caller sets YLW/RST and a label in SNAP_LABEL.

SNAP=""
KEPT=""
KEPT_LOCK=""
# A kept snapshot is released, not deleted. Its release time is what
# prune_snapshots ages it by.
cleanup_snapshot() {
  if [ -n "$KEPT" ]; then
    [ -n "$SNAP" ] && touch "$SNAP/.git/devilbox-last-used" 2>/dev/null
    [ -n "$KEPT_LOCK" ] && rmdir "$KEPT_LOCK" 2>/dev/null; KEPT=""; KEPT_LOCK=""
  elif [ -n "$SNAP" ]; then rm -rf "$SNAP"; fi
  SNAP=""
}
# On a signal the running step (npm/tsc/vitest) is stopped first, or it would
# keep running in a directory that is being deleted.
stop_children() { pkill -TERM -P $$ 2>/dev/null || true; }
install_snapshot_traps() {
  trap cleanup_snapshot EXIT
  trap 'stop_children; cleanup_snapshot; exit 130' INT
  trap 'stop_children; cleanup_snapshot; exit 143' TERM
  # A closed terminal (HUP) or a reader that went away (PIPE: git's pager, a
  # killed `git push`) must also release the kept slot, or its lock stays
  # until the stale-lock takeover an hour later (2026-10-19: 2.6 GB of
  # orphaned slots in TMPDIR).
  trap 'stop_children; cleanup_snapshot; exit 129' HUP
  trap 'stop_children; cleanup_snapshot; exit 141' PIPE
}

# Every hook copy under TMPDIR is ~1 GB, and they piled up: one kept pool per
# working tree (2026-10-19: 2.6 GB of orphaned slots), and every fresh snapshot
# whose hook died by SIGKILL, which no trap sees (2026-10-20: 4.8 GB in a day, the
# Mac under 1 GB free). Before a hook makes a copy it removes, for every label:
#  - an unlocked kept slot whose working tree is gone (nothing can lock it again);
#  - an unlocked kept slot idle for DEVILBOX_HOOK_IDLE_MIN minutes (default 30);
#  - unlocked kept slots beyond DEVILBOX_HOOK_MAX_IDLE (default 2), oldest first;
#  - a fresh snapshot whose hook process is gone (its pid is in .git/devilbox-owner;
#    one without an owner file is a pre-2026-10-20 leftover once an hour old).
# A locked slot or a fresh snapshot of a live hook is never touched.
prune_snapshots() {
  local d url pid idle_min=${DEVILBOX_HOOK_IDLE_MIN:-30} max_idle=${DEVILBOX_HOOK_MAX_IDLE:-2} idle=()
  for d in "${TMPDIR:-/tmp}"/devilbox-*; do
    [ -d "$d/.git" ] || continue
    case "$d" in
      *-kept-*)
        [ -d "$d.lock" ] && continue
        url="$(snapshot_env git -C "$d" config remote.origin.url 2>/dev/null)"
        if [ -z "$url" ] || [ ! -e "$url" ]; then rm -rf "$d"; continue; fi
        [ -e "$d/.git/devilbox-last-used" ] || touch -r "$d/.git" "$d/.git/devilbox-last-used"
        if [ -n "$(find "$d/.git/devilbox-last-used" -mmin +"$idle_min" 2>/dev/null)" ]; then rm -rf "$d"; continue; fi
        idle+=("$d")
        ;;
      *)
        pid="$(cat "$d/.git/devilbox-owner" 2>/dev/null)"
        if [ -n "$pid" ]; then kill -0 "$pid" 2>/dev/null || rm -rf "$d"
        elif [ -n "$(find "$d" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then rm -rf "$d"; fi
        ;;
    esac
  done
  [ "${#idle[@]}" -gt "$max_idle" ] || return 0
  # Newest first; everything after the first max_idle goes.
  ls -td $(printf '%s/.git/devilbox-last-used\n' "${idle[@]}") | tail -n +"$((max_idle + 1))" | while read -r f; do
    rm -rf "${f%/.git/devilbox-last-used}"
  done
}

# The snapshot is its own repository: a hook (or commit-files.sh) exports
# GIT_INDEX_FILE / GIT_DIR / GIT_WORK_TREE for the OUTER repo, and git commands
# run by the tests would otherwise read or write that index instead.
snapshot_env() { env -u GIT_INDEX_FILE -u GIT_DIR -u GIT_WORK_TREE -u GIT_PREFIX -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES "$@"; }
in_snapshot() { ( cd "$SNAP" && snapshot_env "$@" ); }

# Runs test suites in the snapshot, each under the vitest config that includes it:
# server/ suites from server/ under server/vitest.config.ts, all others under the
# root vite.config.ts. Usage: run_vitest_suites [vitest flags...] -- <repo paths...>
# One root run used to get every suite, and the root config includes only src/**:
# a commit of server files alone aborted on "No test files found", and a mixed
# commit (or a push, with --passWithNoTests) skipped its server suites silently.
# server/ has no vitest of its own; its package script also runs the root one.
run_vitest_suites() {
  local flags=() src=() srv=() f rc=0
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do flags+=("$1"); shift; done
  [ $# -gt 0 ] && shift
  for f in "$@"; do
    case $f in
      server/*) srv+=("${f#server/}") ;;
      *) src+=("$f") ;;
    esac
  done
  if [ ${#src[@]} -gt 0 ]; then
    in_snapshot ./node_modules/.bin/vitest run --config vite.config.ts ${flags[@]+"${flags[@]}"} "${src[@]}" || rc=1
  fi
  if [ ${#srv[@]} -gt 0 ]; then
    ( cd "$SNAP/server" && snapshot_env ../node_modules/.bin/vitest run --config vitest.config.ts ${flags[@]+"${flags[@]}"} "${srv[@]}" ) || rc=1
  fi
  return $rc
}

# What a snapshot leaves out. A full checkout is 66 000 files / 2.2 GB, and 1.5 GB
# of it is read by no test, no type-check and no build step the hooks run. This is a
# BLACKLIST on purpose: a new src/ or tools/ file is always included, and only paths
# named here are skipped.
#
# Derivation (2026-10-13, census of vitest `include` = src/**/*.{test,spec}.{ts,tsx},
# tsconfig.app.json include = src, tsconfig.node.json include = vite.config.ts):
# for every tracked top-level directory and every public/ subdirectory, grep the
# whole of src/, vite.config.ts, tools/test-tiers and scripts/git-hooks for the path
# as a quoted or slash-delimited token, and keep only the entries with ZERO hits in
# test code (the single hit for Vestax Mixer is the vite watch-ignore list). The first pass of this census counted one spelling and missed that tests
# read third-party/uade-3.05 and third-party/nuade; the regression test counts
# every spelling, so the list is held to it. Tests that walk a directory (liveEditHeard, nativeExportReload
# and exportDialogNativeOption walk public/data/songs; the scratch suites read
# public/data/samples/packs) keep that directory whole, so public/data is NOT listed.
# public/models keeps guitarml, the one subtree a test reads.
# Regression: src/__tests__/hookSnapshotLeavesOutThePathsNoTestReads.test.ts re-runs
# the zero-hit check against these entries, so a test that starts reading one fails.
#
#   third-party/{furnace-master,vital-main,openmpt-master,odin2-master,
#     hivelytracker-master,musicline_playback-main}  638 MB / 23 800 files  vendored
#     upstream sources, the build inputs of the *-wasm dirs. The rest of third-party stays:
#     tests read uade-3.05 (players, eagleplayer.conf, assembler sources), nuade (licence,
#     pristine-tree check) and aylet-0.5.
#   (juce-wasm, 81 MB, is NOT skipped: softwarePaulaSingleCopy reads every tracked
#   <name>-wasm/**/CMakeLists*.txt by pattern, which the name census cannot see; 2026-10-14)
#   Vestax Mixer        50 MB  3D model sources
#   trace*.json.gz      72 MB  browser traces at the repo root
#   public/tumult/samples 254 MB  impulse-response samples fetched by the browser
#   public/projectm/presets 115 MB / 9 795 files  Milkdrop presets fetched by the browser
#   public/models       140 MB  glTF / glb, except guitarml (read by guitarMLWorkletDispose)
#   public/{odin2/Odin2UI.*,surge,monique,kissofshame} 96 MB  hardware-UI wasm bundles
#   (public/odin2/Odin2.{js,wasm}, the synth itself, stays: vstbridgeSynthsSoundOnNoteOn reads it)
SNAPSHOT_SKIPPED_PATHS=(
  /third-party/furnace-master/
  /third-party/vital-main/
  /third-party/openmpt-master/
  /third-party/odin2-master/
  /third-party/hivelytracker-master/
  /third-party/musicline_playback-main/
  "/Vestax Mixer/"
  /trace*.json.gz
  /public/tumult/samples/
  /public/projectm/presets/
  /public/models/Technics_SL1200GR_gltf/
  /public/models/enhancement/
  /public/models/vestax/
  /public/models/turntable.glb
  /public/models/vestax-mixer.glb
  /public/odin2/Odin2UI.*
  /public/surge/
  /public/monique/
  /public/kissofshame/
)
# The sparse-checkout file (non-cone, gitignore syntax: the last matching line wins).
snapshot_sparse_patterns() {
  local p
  echo "/*"
  for p in "${SNAPSHOT_SKIPPED_PATHS[@]}"; do echo "!$p"; done
}
# apply_sparse <clone>: write the patterns before the first checkout, so the files
# are never written. A kept clone whose patterns changed is rebuilt (cheaper than
# reasoning about which files the old patterns left behind).
apply_sparse() {
  local dir=$1 file
  file="$(snapshot_env git -C "$dir" rev-parse --git-path info/sparse-checkout)"
  case $file in /*) ;; *) file="$dir/$file" ;; esac
  mkdir -p "$(dirname "$file")"
  snapshot_sparse_patterns > "$file"
  snapshot_env git -C "$dir" config core.sparseCheckout true
  snapshot_env git -C "$dir" config core.sparseCheckoutCone false
}
sparse_fingerprint() { snapshot_sparse_patterns | cksum | cut -d' ' -f1; }

# materialise_reusable <commit> <tree>: the same snapshot, kept between runs.
# A kept clone only rewrites the files that differ from the last run (read-tree -u
# --reset compares against its index): measured 3 s against 73 s for a fresh
# checkout on a quiet machine, and the fresh one grows with the load. Several agents
# commit at once, and commit-files.sh re-runs the whole hook every time HEAD moves
# under it (up to 30 attempts), so a hook that falls back to a fresh checkout
# whenever one lock is held turns a few concurrent commits into a queue of fresh
# checkouts. Hence a small pool of kept clones (DEVILBOX_HOOK_SLOTS, default 2: each
# is ~0.7 GB sparse): a commit takes the first free slot and only falls back to a
# fresh snapshot when every slot is busy. One user per slot (mkdir lock).
# Untracked, non-ignored files are cleaned so a leftover cannot make a test pass.
materialise_reusable() {
  local sha=$1 tree=$2 base dir lock top slot n slots
  top="$(pwd)"
  slots=${DEVILBOX_HOOK_SLOTS:-2}
  # Not inside .git/: vite and vitest ignore every path under a .git directory.
  base="${TMPDIR:-/tmp}/devilbox-${SNAP_LABEL:-snapshot}-kept-$(printf '%s' "$top" | cksum | cut -d' ' -f1)"
  prune_snapshots
  dir=""
  for n in $(seq 1 "$slots"); do
    slot="$base"; [ "$n" -gt 1 ] && slot="$base-$n"
    lock="$slot.lock"
    if ! mkdir "$lock" 2>/dev/null; then
      # Stale lock (killed run) older than an hour is taken over.
      if [ -n "$(find "$lock" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
        rmdir "$lock" 2>/dev/null; mkdir "$lock" 2>/dev/null || continue
      else continue; fi
    fi
    dir="$slot"; KEPT_LOCK="$lock"; break
  done
  if [ -z "$dir" ]; then materialise "$sha" "$tree"; return; fi
  # A kept clone made with other patterns (or none: the full 2.2 GB checkouts the
  # first version left behind) is rebuilt once.
  if [ -d "$dir/.git" ] && [ "$(cat "$dir/.git/devilbox-sparse" 2>/dev/null)" != "$(sparse_fingerprint)" ]; then rm -rf "$dir"; fi
  if [ ! -d "$dir/.git" ]; then
    rm -rf "$dir"
    mkdir -p "$dir"
    snapshot_env git clone --quiet --shared --no-checkout "$top" "$dir"
    apply_sparse "$dir"
    sparse_fingerprint > "$dir/.git/devilbox-sparse"
  fi
  SNAP="$dir"
  KEPT=1
  echo "${YLW}[${SNAP_LABEL:-snapshot}] testing the staged files on commit ${sha:0:9} (kept snapshot, not the working tree)…${RST}" >&2
  snapshot_env git -C "$SNAP" -c advice.detachedHead=false checkout --quiet --force "$sha"
  snapshot_env git -C "$SNAP" read-tree -u --reset "$tree"
  snapshot_env git -C "$SNAP" clean -fdq
  link_node_modules "$top"
}

link_node_modules() {
  local top=$1 nm
  for nm in node_modules server/node_modules; do
    if [ -d "$top/$nm" ] && [ -d "$SNAP/$(dirname "$nm")" ] && [ ! -e "$SNAP/$nm" ]; then
      ln -s "$top/$nm" "$SNAP/$nm"
    fi
  done
}

# materialise <commit> [<tree>]: the snapshot holds <commit>, or, when <tree> is
# given, that tree (pre-commit passes the staged index from `git write-tree`).
materialise() {
  local sha=$1 tree=${2:-} top nm
  top="$(pwd)"
  prune_snapshots
  SNAP="$(mktemp -d "${TMPDIR:-/tmp}/devilbox-${SNAP_LABEL:-snapshot}.XXXXXX")"
  echo "${YLW}[${SNAP_LABEL:-snapshot}] testing ${tree:+the staged files on }commit ${sha:0:9} (snapshot, not the working tree)…${RST}" >&2
  # A throwaway clone, not a bare file tree: tests may ask git which files are
  # tracked (softwarePaulaSingleCopy), and a git-archive tree has no repository
  # to answer. --shared borrows this repo's object store (no copy), --no-checkout
  # writes nothing until the commit is checked out, and apply_sparse leaves out the
  # paths no test reads. Rule 2 for tests: read only
  # TRACKED fixtures, or the snapshot (and any clean checkout) lacks them.
  snapshot_env git clone --quiet --shared --no-checkout "$top" "$SNAP"
  echo $$ > "$SNAP/.git/devilbox-owner"
  apply_sparse "$SNAP"
  snapshot_env git -C "$SNAP" -c advice.detachedHead=false checkout --quiet "$sha"
  if [ -n "$tree" ]; then
    snapshot_env git -C "$SNAP" read-tree -u --reset "$tree"
  fi
  for nm in node_modules server/node_modules; do
    if [ -d "$top/$nm" ] && [ -d "$SNAP/$(dirname "$nm")" ]; then
      ln -s "$top/$nm" "$SNAP/$nm"
    fi
  done
}
