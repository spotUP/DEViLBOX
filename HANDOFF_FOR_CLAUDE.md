# 📂 DEViLBOX Project Handoff

## 🚀 Status Summary
We have successfully decomposed a massive set of local development changes into **7 modular, feature-specific branches**. All branches have been pushed to `origin` and have open Pull Requests. The `main` branch is currently **clean** and matches the production state.

## 🌿 Active Feature Branches (PRs Created)

| Branch Name | Scope & Description | Dependencies |
| :--- | :--- | :--- |
| **`feat/electron-app`** | **Desktop Native Wrapper**: Adds `electron/` main & preload scripts, IPC handlers, and native application menus. | None |
| **`feat/virtualized-tracker`** | **Performance**: Implements `@tanstack/react-virtual` in the tracker grid to handle large patterns efficiently without DOM overload. | None |
| **`feat/export-import`** | **Data Persistence**: Adds JSON serialization/deserialization for Songs, Instruments, and Patterns. | None |
| **`feat/open303`** | **DSP Engine**: Ports the Open303 engine. Includes `AudioWorklet` setup and DSP logic. | **Critical Core** |
| **`feat/instrument-system`** | **Architecture**: New `InstrumentFactory`, `EffectChain` implementation, and visual instrument editors. | ⚠️ **Depends on `feat/open303`** |
| **`feat/pattern-management`** | **UX**: Drag-and-drop pattern ordering, clipboard operations, and improved pattern navigation. | None |
| **`feat/ui-polish`** | **Visuals**: CSS variable theming, new visualizers, and general layout cleanup. | None |

## ⚠️ Critical Technical Context

1.  **Dependency Chain**:
    -   `feat/instrument-system` **includes changes** from `feat/open303`. If merging manually, merge `feat/open303` first to avoid conflicts, or rebase `feat/instrument-system` on `main` after `open303` is merged.

2.  **AudioWorklets**:
    -   The Open303 and Chiptune engines rely on `public/*.worklet.js`. Ensure these files are correctly served by Vite in dev mode and copied to `dist/` during build (handled by current config, but verify if changing build tools).

3.  **Recoverability**:
    -   The original monolithic state (containing all changes mixed together) is preserved in the **git stash** (likely `stash@{1}` or older). If a file was missed during the split, check there.
    -   Large reference files (WAVs, external repos) in `Reference Code/` were **removed** to keep the repo clean.

## 📝 Next Actions
1.  **CI/CD**: Run `npm run lint` and `npm run build` on each branch to ensure isolation didn't break imports.
2.  **Review**: Prioritize reviewing and merging `feat/open303` as it is a foundation for other audio features.
3.  **Merge Strategy**: Squash and Merge is recommended to keep the history clean.
