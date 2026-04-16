import * as THREE from 'three';
import type { Song } from '../core/types';
import { scene } from './renderer';
import { settings } from '../core/settings';

// ── Per-song arrays — set by initParticles() ──────────────────────────
export let basePos!:    Float32Array;
export let positions!:  Float32Array;
export let colors!:     Float32Array;
export let baseColors!: Float32Array;
export let sizes!:      Float32Array;
export let phases!:     Float32Array;
export let freqs!:      Float32Array;
export let amps!:       Float32Array;

// ── Scene objects — set by initParticles() ────────────────────────────
export let geo!:    THREE.BufferGeometry;
export let points!: THREE.Points;

// ── Shared particle texture ───────────────────────────────────────────
function makeParticleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3,  'rgba(255,255,255,0.4)');
  g.addColorStop(0.6,  'rgba(255,255,255,0.05)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const particleTexture = makeParticleTexture();

// ── Shared GLSL shaders ───────────────────────────────────────────────
export const vertexShader = /* glsl */ `
  uniform float sizeScale;
  attribute float vSize;
  attribute vec3 vColor;
  varying vec3 fColor;
  void main() {
    fColor = vColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = vSize * (sizeScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D tex;
  varying vec3 fColor;
  void main() {
    vec4 t = texture2D(tex, gl_PointCoord);
    if (t.a < 0.02) discard;
    gl_FragColor = vec4(fColor, 1.0) * t;
  }
`;

// ── Song particle material (no SONGS dependency) ──────────────────────
export const mat = new THREE.ShaderMaterial({
  uniforms: {
    tex:       { value: particleTexture },
    sizeScale: { value: settings.glowAmount },
  },
  vertexShader,
  fragmentShader,
  transparent: true,
  blending:    THREE.AdditiveBlending,
  depthWrite:  false,
});

// ── Physics tick — call each frame with the current time ─────────────
export function tickParticles(t: number, physicsIntensity: number): void {
  if (!positions || !geo) return;
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const amp = amps[i] * physicsIntensity;
    positions[i*3]   = basePos[i*3]   + Math.sin(t * freqs[i]       + phases[i*3])   * amp;
    positions[i*3+1] = basePos[i*3+1] + Math.cos(t * freqs[i] * 0.7 + phases[i*3+1]) * amp;
    positions[i*3+2] = basePos[i*3+2] + Math.sin(t * freqs[i] * 0.5 + phases[i*3+2]) * amp;
  }
  geo.attributes.position.needsUpdate = true;
}

// ── Teardown song particles — call before reinit ──────────────────────
export function teardownParticles(): void {
  if (points) {
    scene.remove(points);
    geo.dispose();
    // mat is NOT disposed — it is the shared ShaderMaterial reused by initParticles().
    // bgPoints is NOT touched — it is a permanent scene fixture.
    points = null!;
    geo    = null!;
  }
}

// ── Init song particles — call after songs are loaded ─────────────────
export function initParticles(songs: Song[]): void {
  const N = songs.length;

  basePos    = new Float32Array(N * 3);
  positions  = new Float32Array(N * 3);
  colors     = new Float32Array(N * 3);
  baseColors = new Float32Array(N * 3);
  sizes      = new Float32Array(N);
  phases     = new Float32Array(N * 3);
  freqs      = new Float32Array(N);
  amps       = new Float32Array(N);

  songs.forEach((s, i) => {
    basePos[i*3]   = positions[i*3]   = s.x;
    basePos[i*3+1] = positions[i*3+1] = s.y;
    basePos[i*3+2] = positions[i*3+2] = s.z;
    phases[i*3]   = Math.random() * Math.PI * 2;
    phases[i*3+1] = Math.random() * Math.PI * 2;
    phases[i*3+2] = Math.random() * Math.PI * 2;
    freqs[i] = 0.2 + Math.random() * 0.4;
    amps[i]  = 0.03 + Math.random() * 0.07;
    sizes[i] = 1;
  });

  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('vColor',   new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('vSize',    new THREE.BufferAttribute(sizes, 1));

  points = new THREE.Points(geo, mat);
  scene.add(points);
}

// ── Background star field (no SONGS dependency — init at module load) ─
const bgGeo = new THREE.BufferGeometry();
const bgN   = 300;
const bgPos = new Float32Array(bgN * 3);
const bgCol = new Float32Array(bgN * 3);
const bgSiz = new Float32Array(bgN);

for (let i = 0; i < bgN; i++) {
  bgPos[i*3]   = (Math.random() - 0.5) * 60;
  bgPos[i*3+1] = (Math.random() - 0.5) * 40;
  bgPos[i*3+2] = (Math.random() - 0.5) * 40;
  const br = 0.03 + Math.random() * 0.08;
  bgCol[i*3] = br * 0.4; bgCol[i*3+1] = br * 0.5; bgCol[i*3+2] = br;
  bgSiz[i] = 0.3 + Math.random() * 1.5;
}

bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
bgGeo.setAttribute('vColor',   new THREE.BufferAttribute(bgCol, 3));
bgGeo.setAttribute('vSize',    new THREE.BufferAttribute(bgSiz, 1));

const bgMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: particleTexture }, sizeScale: { value: settings.glowAmount } },
  vertexShader,
  fragmentShader,
  transparent: true,
  blending:    THREE.AdditiveBlending,
  depthWrite:  false,
});

export const bgPoints = new THREE.Points(bgGeo, bgMat);
scene.add(bgPoints);
