export class KeyboardNormalizer {
  static isMac(): boolean {
    // Try modern API first (Chrome 90+, Edge 90+)
    if ('userAgentData' in navigator && navigator.userAgentData) {
      const platform = navigator.userAgentData.platform;
      return platform.toUpperCase().indexOf('MAC') >= 0;
    }

    // Fallback to legacy API (all browsers)
    const platform = navigator.platform;
    return platform.toUpperCase().indexOf('MAC') >= 0;
  }
}
