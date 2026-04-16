import './index.scss';

import * as THREE from 'three';
import {
  Output, BufferTarget, WebMOutputFormat, Mp4OutputFormat, MovOutputFormat,
  VideoSampleSource, VideoSample, canEncodeVideo,
} from 'mediabunny';
import type { VideoCodec } from 'mediabunny';

import { renderer as liveRenderer, scene, camera, controls } from '../../scene/renderer';
import { tickParticles, mat } from '../../scene/particles';
import { settings } from '../../core/settings';

const FPS         = 30;
const YIELD_EVERY = 15;
const RESOLUTIONS = { '720p': [1280, 720], '1080p': [1920, 1080] } as const;
type ResKey = keyof typeof RESOLUTIONS;
type FmtKey = 'mp4' | 'mov' | 'webm';

// Preferred codec order and container config per format
const FORMAT_CONFIG = {
  mp4:  { codecs: ['avc', 'hevc', 'av1'] as VideoCodec[], ext: 'mp4',  mime: 'video/mp4',      makeFormat: () => new Mp4OutputFormat()  },
  mov:  { codecs: ['avc', 'hevc', 'av1'] as VideoCodec[], ext: 'mov',  mime: 'video/quicktime', makeFormat: () => new MovOutputFormat()  },
  webm: { codecs: ['vp9', 'vp8']         as VideoCodec[], ext: 'webm', mime: 'video/webm',      makeFormat: () => new WebMOutputFormat() },
} as const;

// ── Public init ───────────────────────────────────────────────────────
export function wireCapture(getAppTime: () => number): void {
  const modal      = document.getElementById('capture-modal')!;
  const openBtn    = document.getElementById('capture-btn')!;
  const closeBtn   = document.getElementById('capture-close')!;
  const renderBtn  = document.getElementById('capture-render')! as HTMLButtonElement;
  const dlBtn      = document.getElementById('capture-download')! as HTMLButtonElement;
  const linkBtn    = document.getElementById('capture-copy-link')!;
  const preview    = document.getElementById('capture-preview') as HTMLVideoElement;
  const statusEl   = document.getElementById('capture-status')!;
  const fillEl     = document.getElementById('capture-fill')!;
  const optionsEl  = document.getElementById('capture-options')!;
  const progressEl = document.getElementById('capture-progress')!;
  const resultEl   = document.getElementById('capture-result')!;

  let durSec: number = 10;
  let resKey: ResKey = '720p';
  let fmtKey: FmtKey = 'mp4';
  let resultBlob: Blob | null = null;

  // Format pill buttons
  modal.querySelectorAll<HTMLButtonElement>('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fmtKey = btn.dataset.fmt as FmtKey;
    });
  });

  // Duration pill buttons
  modal.querySelectorAll<HTMLButtonElement>('.dur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      durSec = parseInt(btn.dataset.sec!, 10);
    });
  });

  // Resolution selector
  (document.getElementById('capture-res') as HTMLSelectElement)
    .addEventListener('change', e => {
      resKey = (e.target as HTMLSelectElement).value as ResKey;
    });

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  renderBtn.addEventListener('click', async () => {
    optionsEl.style.display  = 'none';
    progressEl.style.display = 'block';
    renderBtn.disabled = true;

    try {
      resultBlob = await renderVideo(
        getAppTime(), durSec, resKey, fmtKey,
        (f, total) => {
          statusEl.textContent = `Rendering frame ${f} / ${total}…`;
          fillEl.style.width   = `${(f / total) * 100}%`;
        },
      );
      progressEl.style.display = 'none';
      resultEl.style.display   = 'block';
      const ext = FORMAT_CONFIG[fmtKey].ext;
      dlBtn.textContent = `Download .${ext}`;
      preview.src = URL.createObjectURL(resultBlob);
      preview.play().catch(() => {/* autoplay policy */});
    } catch (err) {
      console.error('Capture failed:', err);
      statusEl.textContent = 'Render failed — see console.';
    } finally {
      renderBtn.disabled = false;
    }
  });

  dlBtn.addEventListener('click', () => {
    if (!resultBlob) return;
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(resultBlob);
    a.download = `music-galaxy-${Date.now()}.${FORMAT_CONFIG[fmtKey].ext}`;
    a.click();
  });

  linkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(buildShareURL()).then(() => {
      linkBtn.textContent = 'Copied!';
      setTimeout(() => { linkBtn.textContent = 'Copy share link'; }, 2000);
    }).catch(() => {/* clipboard denied */});
  });

  function openModal(): void {
    resultBlob = null;
    optionsEl.style.display  = 'block';
    progressEl.style.display = 'none';
    resultEl.style.display   = 'none';
    fillEl.style.width        = '0%';
    dlBtn.textContent         = 'Download';
    modal.style.display       = 'flex';
  }

  function closeModal(): void {
    modal.style.display = 'none';
    if (preview.src) { URL.revokeObjectURL(preview.src); preview.src = ''; }
  }
}

// ── Share URL ─────────────────────────────────────────────────────────
function buildShareURL(): string {
  const p = camera.position;
  const t = controls.target;
  const hash = [
    `cam=${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`,
    `target=${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}`,
    `mode=${settings.colorMode}`,
    `theme=${settings.theme}`,
  ].join('&');
  return `${location.origin}${location.pathname}#${hash}`;
}

// ── Offscreen render + Mediabunny encode ──────────────────────────────
async function renderVideo(
  startT: number,
  durationSec: number,
  resKey: ResKey,
  fmtKey: FmtKey,
  onProgress: (frame: number, total: number) => void,
): Promise<Blob> {
  const [width, height] = RESOLUTIONS[resKey];
  const totalFrames     = durationSec * FPS;
  const dt              = 1 / FPS;
  const cfg             = FORMAT_CONFIG[fmtKey];

  // ── Offscreen canvas + renderer ──────────────────────────────────
  const offCanvas  = document.createElement('canvas');
  offCanvas.width  = width;
  offCanvas.height = height;

  const offRenderer = new THREE.WebGLRenderer({
    canvas: offCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  offRenderer.setPixelRatio(1);
  offRenderer.setSize(width, height);

  const clearColor = new THREE.Color();
  liveRenderer.getClearColor(clearColor);
  offRenderer.setClearColor(clearColor, liveRenderer.getClearAlpha());

  // ── Camera orbit params ───────────────────────────────────────────
  const offCamera   = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  const orbitTarget = controls.target.clone();
  const startPos    = camera.position.clone();
  const dx          = startPos.x - orbitTarget.x;
  const dy          = startPos.y - orbitTarget.y;
  const dz          = startPos.z - orbitTarget.z;
  const radius      = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const theta0      = Math.atan2(dx, dz);
  const phi         = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
  const orbitRate   = (2 * Math.PI) / durationSec;

  // ── Mediabunny pipeline ───────────────────────────────────────────
  const codec = await pickCodec(cfg.codecs);
  const mbTarget = new BufferTarget();
  const output   = new Output({ format: cfg.makeFormat(), target: mbTarget });
  const source   = new VideoSampleSource({ codec, bitrate: 8_000_000, keyFrameInterval: 2 });
  output.addVideoTrack(source);
  await output.start();

  const savedSizeScale = mat.uniforms.sizeScale.value as number;

  try {
    for (let f = 0; f < totalFrames; f++) {
      const t     = startT + f * dt;
      const theta = theta0 + f * dt * orbitRate;

      tickParticles(t, settings.physicsIntensity);

      offCamera.position.set(
        orbitTarget.x + radius * Math.cos(phi) * Math.sin(theta),
        orbitTarget.y + radius * Math.sin(phi),
        orbitTarget.z + radius * Math.cos(phi) * Math.cos(theta),
      );
      offCamera.lookAt(orbitTarget);

      mat.uniforms.sizeScale.value = settings.glowAmount *
        Math.max(0.35, Math.min(2.5, radius / 32));

      offRenderer.render(scene, offCamera);

      const sample = new VideoSample(offCanvas, { timestamp: f * dt, duration: dt });
      await source.add(sample);
      sample.close();

      if (f % YIELD_EVERY === 0) {
        onProgress(f, totalFrames);
        await yieldToEventLoop();
      }
    }
  } finally {
    mat.uniforms.sizeScale.value = savedSizeScale;
    offRenderer.dispose();
  }

  onProgress(totalFrames, totalFrames);
  await output.finalize();

  return new Blob([mbTarget.buffer!], { type: cfg.mime });
}

// ── Helpers ───────────────────────────────────────────────────────────
async function pickCodec(codecs: readonly VideoCodec[]): Promise<VideoCodec> {
  for (const c of codecs) {
    if (await canEncodeVideo(c)) return c;
  }
  return codecs[0];
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
