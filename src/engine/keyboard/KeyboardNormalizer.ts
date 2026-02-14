export class KeyboardNormalizer {
  static isMac(): boolean {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  }
}
