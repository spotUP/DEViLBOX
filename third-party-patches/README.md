# third-party patches

`third-party/` holds upstream repos pinned to a commit (`.gitmodules`, `ignore = dirty`). DEViLBOX changes some of
them for the WASM ports. Those changes are the patch files here, one per nested repo, listed in `PATCHES.txt`.

- `scripts/third-party-patches.sh verify` - each patch is applied or applies cleanly to the pinned commit.
- `scripts/third-party-patches.sh apply` - after a fresh checkout of a nested repo, apply its patch.
- `scripts/third-party-patches.sh export` - after editing a nested repo, rewrite its patch file and commit it.

Edit a vendored repo, run `export`, commit the patch. A change that is not exported lives only in that working tree.
