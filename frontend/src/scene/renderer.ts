import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { settings } from '../core/settings';

export const canvas   = document.getElementById('c') as HTMLCanvasElement;
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
export const scene    = new THREE.Scene();
export const camera   = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
export const controls = new OrbitControls(camera, canvas);

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000005, 1);

camera.position.set(0, 0, 32);

controls.enableDamping   = true;
controls.dampingFactor   = 0.06;
controls.minDistance     = 4;
controls.maxDistance     = 80;
controls.autoRotate      = settings.autoRotate;
controls.autoRotateSpeed = settings.rotateSpeed;

export function initResize(): void {
  const onResize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  onResize();
  window.addEventListener('resize', onResize);
}
