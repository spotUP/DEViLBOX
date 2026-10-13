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
# A kept snapshot is released, not deleted.
cleanup_snapshot() {
  if [ -n "$KEPT" ]; then [ -n "$KEPT_LOCK" ] && rmdir "$KEPT_LOCK" 2>/dev/null; KEPT=""; KEPT_LOCK=""
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
}

# The snapshot is its own repository: a hook (or commit-files.sh) exports
# GIT_INDEX_FILE / GIT_DIR / GIT_WORK_TREE for the OUTER repo, and git commands
# run by the tests would otherwise read or write that index instead.
snapshot_env() { env -u GIT_INDEX_FILE -u GIT_DIR -u GIT_WORK_TREE -u GIT_PREFIX -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES "$@"; }
in_snapshot() { ( cd "$SNAP" && snapshot_env "$@" ); }

# materialise_reusable <commit> <tree>: the same snapshot, kept between runs.
# A full checkout is 66 000 files / 2.2 GB (minutes on a loaded machine), too slow
# for every commit; a kept clone only rewrites the files that differ from the last
# run (read-tree -u --reset compares against its index), seconds. One user at a
# time (mkdir lock); a concurrent commit gets a fresh temporary snapshot instead.
# Untracked, non-ignored files are cleaned so a leftover cannot make a test pass.
materialise_reusable() {
  local sha=$1 tree=$2 dir lock top
  top="$(pwd)"
  # Not inside .git/: vite and vitest ignore every path under a .git directory.
  dir="${TMPDIR:-/tmp}/devilbox-${SNAP_LABEL:-snapshot}-kept-$(printf '%s' "$top" | cksum | cut -d' ' -f1)"
  lock="$dir.lock"
  if ! mkdir "$lock" 2>/dev/null; then
    # Stale lock (killed run) older than an hour is taken over.
    if [ -n "$(find "$lock" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then rmdir "$lock" 2>/dev/null; mkdir "$lock" 2>/dev/null || { materialise "$sha" "$tree"; return; }
    else materialise "$sha" "$tree"; return; fi
  fi
  KEPT_LOCK="$lock"
  if [ ! -d "$dir/.git" ]; then
    rm -rf "$dir"
    mkdir -p "$dir"
    git clone --quiet --shared --no-checkout "$top" "$dir"
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
  SNAP="$(mktemp -d "${TMPDIR:-/tmp}/devilbox-${SNAP_LABEL:-snapshot}.XXXXXX")"
  echo "${YLW}[${SNAP_LABEL:-snapshot}] testing ${tree:+the staged files on }commit ${sha:0:9} (snapshot, not the working tree)…${RST}" >&2
  # A throwaway clone, not a bare file tree: tests may ask git which files are
  # tracked (softwarePaulaSingleCopy), and a git-archive tree has no repository
  # to answer. --shared borrows this repo's object store (no copy), --no-checkout
  # writes nothing until the commit is checked out. Rule 2 for tests: read only
  # TRACKED fixtures, or the snapshot (and any clean checkout) lacks them.
  snapshot_env git clone --quiet --shared --no-checkout "$top" "$SNAP"
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
