import './index.scss';
import * as THREE from 'three';
import { SONGS } from '../../core/data';
import { settings } from '../../core/settings';
import { geo, colors, baseColors, sizes } from '../../scene/particles';
import { camera, controls } from '../../scene/renderer';
import { getNearestN, parseMood, parseFeatures, escHtml } from '../../core/utils';
import { getConfiguredProviders, streamUrl, openUrl } from '../../core/config';

// ── Selection state (live-exported binding) ───────────────────────────
export let selectedIdx = -1;

// ── Highlight helpers ─────────────────────────────────────────────────
export function highlightSelection(idx: number): void {
  const neighbors = new Set(getNearestN(SONGS, idx, settings.neighborCount));
  const ps = settings.particleSize;
  SONGS.forEach((_, i) => {
    if (i === idx) {
      colors[i*3] = 1; colors[i*3+1] = 1; colors[i*3+2] = 1;
      sizes[i] = 4.5 * ps;
    } else if (neighbors.has(i)) {
      colors[i*3] = baseColors[i*3]; colors[i*3+1] = baseColors[i*3+1]; colors[i*3+2] = baseColors[i*3+2];
      sizes[i] = 1.8 * ps;
    } else {
      const d = settings.dimAmount;
      colors[i*3] = baseColors[i*3] * d; colors[i*3+1] = baseColors[i*3+1] * d; colors[i*3+2] = baseColors[i*3+2] * d;
      sizes[i] = 0.5 * ps;
    }
  });
  geo.attributes.vColor.needsUpdate = true;
  geo.attributes.vSize.needsUpdate  = true;
}

export function resetColors(): void {
  SONGS.forEach((s, i) => {
    colors[i*3] = baseColors[i*3]; colors[i*3+1] = baseColors[i*3+1]; colors[i*3+2] = baseColors[i*3+2];
    sizes[i] = (1.0 + (s.energy ?? 0.5) * 0.8) * settings.particleSize;
  });
  geo.attributes.vColor.needsUpdate = true;
  geo.attributes.vSize.needsUpdate  = true;
}

// ── Panel content ─────────────────────────────────────────────────────
function populatePanel(idx: number): void {
  const song = SONGS[idx];

  document.getElementById('pt')!.textContent  = song.title ?? 'Unknown';
  document.getElementById('pa')!.textContent  = song.author ?? '';
  document.getElementById('pal')!.textContent = [song.album, song.year].filter(Boolean).join(' · ');

  const feats = parseFeatures(song.features);
  const setBar = (id: string, val: number) => {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.round(val * 100) + '%';
  };
  setBar('f-energy', song.energy ?? 0);
  setBar('f-dance',  feats.danceable);
  setBar('f-happy',  feats.happy);
  setBar('f-relax',  feats.relaxed);
  setBar('f-aggr',   feats.aggressive);
  setBar('f-sad',    feats.sad);

  document.getElementById('p-key')!.textContent   = song.key ? `${song.key} ${song.scale ?? ''}` : '—';
  document.getElementById('p-tempo')!.textContent = song.tempo ? `${Math.round(song.tempo)} BPM` : '—';
  document.getElementById('p-year')!.textContent  = String(song.year ?? '—');

  const mood = parseMood(song.mood);
  document.getElementById('p-mood')!.innerHTML = Object.entries(mood)
    .slice(0, 6)
    .map(([k, v]) => `<span>${k} <span style="opacity:.5">${Math.round(v * 100)}%</span></span>`)
    .join('');

  const aud = document.getElementById('aud') as HTMLAudioElement;
  aud.src = streamUrl(song.id, settings.mediaProvider || undefined);
  aud.load();

  document.getElementById('provider-links')!.innerHTML = getConfiguredProviders()
    .map(p => `<a class="provider-btn" href="${escHtml(openUrl(p, song.id))}" target="_blank">↗ Open in ${escHtml(p.label)}</a>`)
    .join('');

  document.getElementById('simlist')!.innerHTML = getNearestN(SONGS, idx, settings.neighborCount)
    .map(si => {
      const sim = SONGS[si];
      return `<li onclick="window.__selectSong(${si})">
        <div class="sl">${escHtml(sim.title ?? '')}</div>
        <div class="sa">${escHtml(sim.author ?? '')}</div>
      </li>`;
    })
    .join('');
}

// ── Camera animation ──────────────────────────────────────────────────
function zoomToSong(idx: number): void {
  const song     = SONGS[idx];
  const songPos  = new THREE.Vector3(song.x, song.y, song.z);
  const startTarget = controls.target.clone();
  const startCam    = camera.position.clone();
  const dist        = Math.max(7, camera.position.distanceTo(controls.target) * 0.5);
  const endCam      = songPos.clone().add(
    camera.position.clone().sub(controls.target).normalize().multiplyScalar(dist)
  );

  let t = 0;
  const anim = setInterval(() => {
    t += 0.05;
    const e = 1 - Math.pow(1 - Math.min(t, 1), 3);
    if (t >= 1) {
      controls.target.copy(songPos);
      camera.position.copy(endCam);
      clearInterval(anim);
      return;
    }
    controls.target.lerpVectors(startTarget, songPos, e);
    camera.position.lerpVectors(startCam, endCam, e);
  }, 16);
}

// ── Public API ────────────────────────────────────────────────────────
export function selectSong(idx: number): void {
  selectedIdx = idx;
  controls.autoRotate = false;
  (document.getElementById('reset') as HTMLElement).style.display = 'block';

  highlightSelection(idx);
  zoomToSong(idx);
  populatePanel(idx);
  document.getElementById('panel')!.classList.add('open');
}

export function closePanel(): void {
  document.getElementById('panel')!.classList.remove('open');
  (document.getElementById('aud') as HTMLAudioElement).pause();
  resetColors();
  controls.autoRotate = settings.autoRotate;
  (document.getElementById('reset') as HTMLElement).style.display = 'none';
  selectedIdx = -1;
}

// Expose to HTML onclick handlers
window.__selectSong = selectSong;
window.__closePanel = closePanel;
window.__resetView  = closePanel;
