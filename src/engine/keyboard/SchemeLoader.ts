import { KeyboardScheme, PlatformType } from './types';

/**
 * SchemeLoader - Loads and manages keyboard shortcut schemes
 *
 * Loads JSON scheme files from /keyboard-schemes/ and provides
 * O(1) lookup of commands by key combination and platform.
 *
 * Example:
 * ```typescript
 * const loader = new SchemeLoader();
 * await loader.loadScheme('fasttracker2');
 * const command = loader.getCommand('Space', 'pc'); // 'play_stop_toggle'
 * ```
 */
export class SchemeLoader {
  private currentScheme: KeyboardScheme | null = null;

  /**
   * Validate that loaded data matches KeyboardScheme interface
   */
  private validateScheme(data: unknown): data is KeyboardScheme {
    if (!data || typeof data !== 'object') return false;
    const scheme = data as any;

    if (typeof scheme.name !== 'string') return false;
    if (typeof scheme.version !== 'string') return false;
    if (!scheme.platform || typeof scheme.platform !== 'object') return false;

    const { pc, mac } = scheme.platform;
    if (!pc || typeof pc !== 'object' || Array.isArray(pc)) return false;
    if (!mac || typeof mac !== 'object' || Array.isArray(mac)) return false;

    return true;
  }

  /**
   * Load a keyboard scheme from JSON file
   * @param schemeName - Scheme file name (without .json extension)
   * @returns The loaded scheme
   * @throws Error if scheme not found or invalid format
   */
  async loadScheme(schemeName: string): Promise<KeyboardScheme> {
    const response = await fetch(`/keyboard-schemes/${schemeName}.json`);

    if (!response.ok) {
      throw new Error(
        `Failed to load scheme '${schemeName}': ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!this.validateScheme(data)) {
      throw new Error(`Invalid scheme format: ${schemeName}`);
    }

    this.currentScheme = data;
    return this.currentScheme;
  }

  /**
   * Get command name for a key combination
   * @param keyCombo - Key combination string (e.g., 'Ctrl+C', 'Space')
   * @param platform - Target platform ('pc' or 'mac')
   * @returns Command name if mapped, undefined otherwise
   */
  getCommand(keyCombo: string, platform: PlatformType): string | undefined {
    if (!this.currentScheme) return undefined;
    return this.currentScheme.platform[platform]?.[keyCombo];
  }
}
