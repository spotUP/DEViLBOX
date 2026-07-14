/**
 * Compute a companion file's name relative to the main file's directory.
 *
 * Multi-file Amiga formats (Sonix Instruments/, ZoundMonitor Samples/,
 * SunTronic instr/) reference their sidecars by a path relative to the module,
 * and downstream consumers (UADE's virtual FS, native companion resolvers) key
 * on that exact relative path. When files arrive from a directory picker or a
 * folder drag-drop, `webkitRelativePath` carries the subdirectory structure, so
 * we must preserve it — using the bare `File.name` would collapse
 * `instr/perc1.x` to `perc1.x` and the replayer's open would miss.
 *
 * Single source of truth for this computation — used by the drag-drop path
 * (App.handleFileDrop) and the import-confirmation dialog (ImportModuleDialog).
 */
export function companionRelativeName(mainFile: File, companion: File): string {
  const mainRel = (mainFile as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  const compRel = (companion as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  if (mainRel && compRel) {
    // Both have relative paths from directory picker / folder drop.
    // Main: "Zoundmonitor/AJ/hittheroad.sng" → dir = "Zoundmonitor/AJ"
    // Companion: "Zoundmonitor/Samples/electom" → relative from main's dir = "Samples/electom"
    const mainDir = mainRel.substring(0, mainRel.lastIndexOf('/'));
    if (compRel.startsWith(mainDir + '/')) {
      return compRel.substring(mainDir.length + 1);
    }
    // Companion is in a different subtree — find common ancestor
    const mainParts = mainDir.split('/');
    const compParts = compRel.split('/');
    let common = 0;
    while (common < mainParts.length && common < compParts.length && mainParts[common] === compParts[common]) {
      common++;
    }
    return compParts.slice(common).join('/');
  }
  // Only companion has relative path (e.g. auto-prompted Samples/ folder for a single .sng)
  // webkitRelativePath: "Samples/electom" → use it as-is
  if (compRel && compRel.includes('/')) {
    return compRel;
  }
  return companion.name;
}
