import './main.scss';

import { initResize, renderer, camera, controls, scene } from './scene/renderer';
import * as Particles from './scene/particles';
import { applyColors } from './scene/colors';
import { applyTheme } from './scene/theme';
import { SONGS, N, loadSongs } from './core/data';
import { settings } from './core/settings';
import { loadConfig } from './core/config';
import type { ColorMode } from './core/types';

import { selectedIdx, highlightSelection, closePanel } from './ui/panel/index';
import { wireSearch } from './ui/search/index';
import { populateSettingsUI, wireSettingsUI, applySettings } from './ui/settings/index';
import { wireLibraryUI } from './ui/libraries/index';
import { wireCapture } from './ui/capture/index';
import { initInteraction } from './interaction';

// ── Animation time getter — set once the render loop starts ──────────
let appGetTime: () => number = () => 0;

// ── Loading screen helpers ────────────────────────────────────────────
const loadingEl  = document.getElementById('loading')!;
const loadingMsg = document.getElementById('loading-msg')!;

function setStatus(msg: string): void {
  loadingMsg.textContent = msg;
}

// Poll /api/status while generating so we can show progress
async function pollStatus(): Promise<void> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const s = await res.json() as { generating: boolean };
    if (s.generating) setStatus('Computing 3D song map (this takes ~30s on first run)…');
  } catch { /* ignore */ }
}

// ── Async init ────────────────────────────────────────────────────────
async function init(): Promise<void> {
  initResize();

  setStatus('Connecting to server…');
  const pollTimer = setInterval(pollStatus, 2500);

  await loadConfig();

  try {
    await loadSongs(settings.activeLibrary || undefined);
  } catch (err: unknown) {
    clearInterval(pollTimer);
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load data: ${msg}`);
    return;
  }

  clearInterval(pollTimer);
  setStatus('Building galaxy…');

  // Init song particles now that SONGS/N are populated
  Particles.initParticles(SONGS);

  // Theme
  applyTheme(settings.theme);
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (settings.theme === 'default') applyTheme('default');
  });

  // Header subtitle
  document.getElementById('sub')!.textContent =
    `${N} songs · ${new Set(SONGS.map(s => s.author)).size} artists · 3D audio similarity`;

  // Color mode buttons
  applyColors(settings.colorMode);
  document.querySelectorAll<HTMLButtonElement>('.mb').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === settings.colorMode);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mb').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyColors(btn.dataset.mode as ColorMode);
      if (selectedIdx >= 0) highlightSelection(selectedIdx);
    });
  });

  window.__closePanel = closePanel;
  window.__resetView  = closePanel;

  populateSettingsUI();
  wireSettingsUI();
  wireSearch();
  wireLibraryUI(reinitGalaxy);
  initInteraction();
  applySettings();

  // Hide loading overlay
  loadingEl.style.display = 'none';

  // ── Render loop ───────────────────────────────────────────────────
  const t0 = Date.now();
  const DEFAULT_CAM_DIST = 32;

  // Expose current animation time for the capture module
  appGetTime = () => (Date.now() - t0) * 0.001;

  wireCapture(appGetTime);

  (function loop() {
    requestAnimationFrame(loop);
    const t = (Date.now() - t0) * 0.001;

    Particles.tickParticles(t, settings.physicsIntensity);

    const zoomFactor = Math.max(
      0.35,
      Math.min(2.5, camera.position.distanceTo(controls.target) / DEFAULT_CAM_DIST)
    );
    Particles.mat.uniforms.sizeScale.value = settings.glowAmount * zoomFactor;

    controls.update();
    renderer.render(scene, camera);
  })();
}

// ── Hot-swap the galaxy to the currently active library ───────────────
async function reinitGalaxy(): Promise<void> {
  closePanel();  // resets selectedIdx to -1
  (document.getElementById('search-input') as HTMLInputElement).value = '';
  (document.getElementById('search-results') as HTMLDivElement).innerHTML = '';

  Particles.teardownParticles();
  await loadSongs(settings.activeLibrary || undefined);  // mutates SONGS in-place, updates N
  Particles.initParticles(SONGS);
  applyColors(settings.colorMode);

  document.getElementById('sub')!.textContent =
    `${N} songs · ${new Set(SONGS.map(s => s.author)).size} artists · 3D audio similarity`;
}

// ── Refresh data (called from settings panel button) ──────────────────
window.__refreshData = async () => {
  const btn = document.getElementById('sp-refresh') as HTMLButtonElement;
  btn.disabled    = true;
  btn.textContent = 'Refreshing…';

  try {
    const res  = await fetch('/api/refresh', { method: 'POST' });
    const body = await res.json() as { error?: string };
    if (res.status === 400) {
      alert(body.error);
      return;
    }
    // Reload page to re-fetch and rebuild with fresh data
    window.location.reload();
  } catch {
    alert('Refresh failed — check the server.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Refresh Data';
  }
};

init();
