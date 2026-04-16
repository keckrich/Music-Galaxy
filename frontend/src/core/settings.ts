import type { AppSettings } from './types';

export const DEFAULTS: AppSettings = {
  autoRotate: true,
  rotateSpeed: 0.35,
  glowAmount: 220,
  particleSize: 1.2,
  physicsIntensity: 1.0,
  neighborCount: 18,
  dimAmount: 1.0,
  colorMode: 'energy',
  theme: 'dark',
  activeLibrary: '',
  mediaProvider: '',
};

const STORAGE_KEY = 'musicGalaxy_settings';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export const settings = loadSettings();
