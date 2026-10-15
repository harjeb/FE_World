// Per-viewer display preferences. Browser storage may be unavailable, so every access is guarded
// and the page works with the defaults.
export type ScenePolicy = 'all' | 'boss' | 'off';

export interface Settings {
  threat: boolean;
  grid: boolean;
  scenes: ScenePolicy;
  zoom: 2 | 3;
}

const KEY = 'agent-tactics.battle-settings';
export const DEFAULT_SETTINGS: Settings = { threat: true, grid: true, scenes: 'all', zoom: 3 };

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private windows and blocked storage just lose the preference.
  }
}
