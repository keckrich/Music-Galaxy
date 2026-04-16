import './index.scss';
import { settings, saveSettings, DEFAULTS } from '../../core/settings';
import { getConfiguredProviders } from '../../core/config';
import { mat } from '../../scene/particles';
import { controls } from '../../scene/renderer';
import { applyTheme } from '../../scene/theme';
import { applyColors } from '../../scene/colors';
import { highlightSelection, resetColors, selectedIdx } from '../panel/index';
import { getNearestN, escHtml } from '../../core/utils';
import { SONGS } from '../../core/data';
import type { Theme, ColorMode } from '../../core/types';

// ── Apply settings to runtime state ──────────────────────────────────
export function applySettings(): void {
  mat.uniforms.sizeScale.value = settings.glowAmount;
  if (selectedIdx < 0) {
    controls.autoRotate      = settings.autoRotate;
    controls.autoRotateSpeed = settings.rotateSpeed;
  }
}

// ── Sync UI to current settings ───────────────────────────────────────
export function populateSettingsUI(): void {
  // Media source — only show when multiple providers are configured
  const providers   = getConfiguredProviders();
  const msSection   = document.getElementById('sp-media-source')!;
  const msSelect    = document.getElementById('s-media-source') as HTMLSelectElement;
  msSection.style.display = providers.length > 1 ? '' : 'none';
  if (providers.length > 1) {
    msSelect.innerHTML = providers
      .map(p => `<option value="${p.type}">${p.label}</option>`)
      .join('');
    msSelect.value = settings.mediaProvider || providers[0].type;
  }

  (document.getElementById('s-theme') as HTMLSelectElement).value = settings.theme;
  (document.getElementById('s-autorotate') as HTMLInputElement).checked = settings.autoRotate;

  const set = (id: string, val: string | number) =>
    ((document.getElementById(id) as HTMLInputElement).value = String(val));
  const label = (id: string, val: string) =>
    (document.getElementById(id)!.textContent = val);

  set('s-rotatespeed', settings.rotateSpeed);
  label('sv-rotatespeed', settings.rotateSpeed.toFixed(2));

  set('s-glow', settings.glowAmount);
  label('sv-glow', String(settings.glowAmount));

  set('s-size', settings.particleSize);
  label('sv-size', settings.particleSize.toFixed(1));

  set('s-physics', settings.physicsIntensity);
  label('sv-physics', settings.physicsIntensity.toFixed(1));

  set('s-neighbors', settings.neighborCount);
  label('sv-neighbors', String(settings.neighborCount));

  set('s-dim', settings.dimAmount);
  label('sv-dim', Math.round(settings.dimAmount * 100) + '%');
}

// ── Wire all controls ─────────────────────────────────────────────────
export function wireSettingsUI(): void {
  // Panel open/close
  const btn   = document.getElementById('settings-btn')!;
  const panel = document.getElementById('settings-panel')!;
  btn.addEventListener('click', () => btn.classList.toggle('active', panel.classList.toggle('open')));
  document.getElementById('sp-close')!.addEventListener('click', () => {
    panel.classList.remove('open');
    btn.classList.remove('active');
  });

  // Media source
  document.getElementById('s-media-source')!.addEventListener('change', (e) => {
    settings.mediaProvider = (e.target as HTMLSelectElement).value;
    saveSettings(settings);
  });

  // Theme
  document.getElementById('s-theme')!.addEventListener('change', (e) => {
    settings.theme = (e.target as HTMLSelectElement).value as Theme;
    saveSettings(settings);
    applyTheme(settings.theme);
  });

  // Auto-rotate
  document.getElementById('s-autorotate')!.addEventListener('change', (e) => {
    settings.autoRotate = (e.target as HTMLInputElement).checked;
    saveSettings(settings); applySettings();
  });

  // Rotate speed
  document.getElementById('s-rotatespeed')!.addEventListener('input', (e) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    settings.rotateSpeed = v;
    document.getElementById('sv-rotatespeed')!.textContent = v.toFixed(2);
    saveSettings(settings); applySettings();
  });

  // Glow
  document.getElementById('s-glow')!.addEventListener('input', (e) => {
    const v = parseInt((e.target as HTMLInputElement).value);
    settings.glowAmount = v;
    document.getElementById('sv-glow')!.textContent = String(v);
    saveSettings(settings); applySettings();
  });

  // Particle size
  document.getElementById('s-size')!.addEventListener('input', (e) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    settings.particleSize = v;
    document.getElementById('sv-size')!.textContent = v.toFixed(1);
    saveSettings(settings);
    if (selectedIdx >= 0) highlightSelection(selectedIdx); else resetColors();
  });

  // Physics
  document.getElementById('s-physics')!.addEventListener('input', (e) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    settings.physicsIntensity = v;
    document.getElementById('sv-physics')!.textContent = v.toFixed(1);
    saveSettings(settings);
  });

  // Neighbor count
  document.getElementById('s-neighbors')!.addEventListener('input', (e) => {
    const v = parseInt((e.target as HTMLInputElement).value);
    settings.neighborCount = v;
    document.getElementById('sv-neighbors')!.textContent = String(v);
    saveSettings(settings);
    if (selectedIdx >= 0) {
      highlightSelection(selectedIdx);
      document.getElementById('simlist')!.innerHTML = getNearestN(SONGS, selectedIdx, v)
        .map(si => {
          const sim = SONGS[si];
          return `<li onclick="window.__selectSong(${si})">
            <div class="sl">${escHtml(sim.title ?? '')}</div>
            <div class="sa">${escHtml(sim.author ?? '')}</div>
          </li>`;
        }).join('');
    }
  });

  // Dim brightness
  document.getElementById('s-dim')!.addEventListener('input', (e) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    settings.dimAmount = v;
    document.getElementById('sv-dim')!.textContent = Math.round(v * 100) + '%';
    saveSettings(settings);
    if (selectedIdx >= 0) highlightSelection(selectedIdx);
  });

  // Reset to defaults
  document.getElementById('sp-reset')!.addEventListener('click', () => {
    Object.assign(settings, DEFAULTS);
    saveSettings(settings);
    populateSettingsUI();
    applyTheme(settings.theme);
    applySettings();
    applyColors(settings.colorMode);
    document.querySelectorAll('.mb').forEach(b =>
      b.classList.toggle('active', (b as HTMLElement).dataset.mode === settings.colorMode)
    );
    if (selectedIdx >= 0) highlightSelection(selectedIdx); else resetColors();
  });
}
