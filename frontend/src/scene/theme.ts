import * as THREE from 'three';
import type { Theme } from '../core/types';
import { renderer } from './renderer';
import { mat, bgPoints } from './particles';

const DARK_BG  = 0x000005;
const LIGHT_BG = 0xf0f0f5;

export function isLightTheme(theme: Theme): boolean {
  if (theme === 'light') return true;
  if (theme === 'dark')  return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light');
  if (theme === 'light') root.classList.add('theme-light');
  if (theme === 'dark')  root.classList.add('theme-dark');

  const light = isLightTheme(theme);
  renderer.setClearColor(light ? LIGHT_BG : DARK_BG, 1);

  // Additive blending creates glow on dark; normal alpha blending on light
  mat.blending    = light ? THREE.NormalBlending : THREE.AdditiveBlending;
  mat.needsUpdate = true;

  // Stars are invisible on a light canvas
  bgPoints.visible = !light;
}
