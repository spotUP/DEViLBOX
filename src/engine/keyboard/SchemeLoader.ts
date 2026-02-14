import { KeyboardScheme, PlatformType } from './types';

export class SchemeLoader {
  private currentScheme: KeyboardScheme | null = null;

  async loadScheme(schemeName: string): Promise<KeyboardScheme> {
    const response = await fetch(`/keyboard-schemes/${schemeName}.json`);

    if (!response.ok) {
      throw new Error(`Failed to load scheme: ${schemeName}`);
    }

    this.currentScheme = await response.json();
    return this.currentScheme;
  }

  getCommand(keyCombo: string, platform: PlatformType): string | undefined {
    if (!this.currentScheme) return undefined;
    return this.currentScheme.platform[platform][keyCombo];
  }
}
