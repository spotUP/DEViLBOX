---
date: 2026-07-20
topic: crash-recovery-deploy-confirm-and-native-builds-fix
tags: [ci, deploy, electron, native-builds, crash-recovery]
status: final
---

# Handoff — Crash-recovery deploy confirm + native builds fix

## Tasks

1. Confirm the crash-recovery autosave push actually deployed (carried from prior session).
2. Fix the desktop (Electron) native builds — none were being attached to the GitHub Release on deploy.

Both DONE and verified live. Nothing left in-flight.

## Recent Changes (this session)

- **9b74b940b** `fix(ci): produce and attach desktop native builds on deploy` — the native-builds fix (both roots below).
- **f368881e7** `fix(persistence): keep recovery armed after a Restore` — re-pushed clean (prior push had failed on an environmental test flake, not a code bug).
- Crash-recovery autosave stack (f368881e7 back to 7a449a65a) already landed prior; this session only confirmed it deployed.

## Native builds — root causes (systematic-debugging, real CI logs)

Two independent failures, both fixed in 9b74b940b:

1. **Dead `node-hid` dependency.** Declared in `package.json` `dependencies` (^3.3.0), imported NOWHERE. It was the ONLY native (node-gyp) module in the tree → `@electron/rebuild` tried to compile it per-platform → broke Windows electron ("Could not find any Visual Studio installation") and Linux ("libusb.h: No such file or directory") → zero .exe/.AppImage/.deb. Fix = REMOVE the unused dep (root level: unused native dep, NOT "runners lack toolchain"). `package-lock.json` regenerated.
2. **`release` job race.** `.github/workflows/deploy.yml` `release: needs: [build-server]` only → release + deploy webhook fired BEFORE electron jobs finished → `download-artifact` grabbed nothing. Fix = `release: needs: [build-server, electron]`. electron keeps `continue-on-error: true`, so a future electron break still never blocks web deploy.

## Verification

- Deploy run 29728346972 success; all 3 electron matrix jobs green.
- Release `latest` carries all 8 assets: `DEViLBOX.Setup.1.0.1.exe`, `DEViLBOX-1.0.1-win.zip`, `DEViLBOX-1.0.1-arm64.dmg`, `DEViLBOX-1.0.1-arm64-mac.zip`, `DEViLBOX-1.0.1.AppImage`, `devilbox_1.0.1_amd64.deb`, `devilbox-1.0.1.tar.gz`, `devilbox-dist.tar.gz`.
- Live `version.json` buildHash `9b74b940` (matches HEAD). devilbox.uprough.net serving new build.

## Learnings / Gotchas

- **`src/__tests__/ci/**` is EXCLUDED in `vite.config.ts:82`** → any test placed there silently never runs in `test:ci`. The new regression was placed at `src/__tests__/` ROOT for this reason. Latent separate issue: existing `src/__tests__/ci/regression.test.ts` never runs — out of scope, untouched.
- The prior "electron builds known-harmless" note in `project_ci_deploy_gotchas` was the misleading assumption — those electron failures WERE the bug.
- Push failures can be an environmental flake (CPU-oversubscribed forks timing a static test out), not code. Re-run test:ci with `--maxWorkers=4` and re-push before concluding a fix is wrong.

## Artifacts

- Regression: `src/__tests__/nativeBuildDeploy.test.ts` (in `test:ci` glob, package.json:30) — asserts no denylisted native node-gyp dep + release needs both jobs. Fails-on-revert of either fix.
- Memory: `memory/project_native_builds_deploy_todo.md` (RESOLVED), MEMORY.md index line updated.

## Next Steps

- None required for these two tasks.
- Open beta-push buckets untouched (not active): "Feature-complete + polish", modern instrument visualization (design task, no build go-ahead).
- If revisiting CI: consider un-excluding `src/__tests__/ci/**` or relocating the one file that lives there.

## Other Notes

Working-tree noise (`.serena/project.yml`, `public/uade/*`, `src/generated/*`, untracked `dragon'sbreath *.dsc` song files, submodule pointers) is pre-existing, unrelated to this session.
