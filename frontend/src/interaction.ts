import * as THREE from 'three';
import { canvas, camera } from './scene/renderer';
import { points } from './scene/particles';
import { showTooltip, hideTooltip } from './ui/tooltip/index';
import { selectSong } from './ui/panel/index';

const raycaster = new THREE.Raycaster();
raycaster.params.Points = { threshold: 0.35 };

const mouse        = new THREE.Vector2();
let   hoveredIdx   = -1;
let   mouseDownIdx = -1;
let   lastRayTime  = 0;

export function initInteraction(): void {
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    const now = Date.now();
    if (now - lastRayTime < 30) return;
    lastRayTime = now;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(points);

    if (hits.length && hits[0].index !== undefined) {
      const idx = hits[0].index;
      if (idx !== hoveredIdx) {
        hoveredIdx = idx;
        showTooltip(idx, e.clientX, e.clientY);
      } else {
        // Update position even if same song
        const tip = document.getElementById('tip')!;
        tip.style.left = Math.min(e.clientX + 16, window.innerWidth  - 240) + 'px';
        tip.style.top  = Math.min(e.clientY + 16, window.innerHeight - 100) + 'px';
      }
      document.body.style.cursor = 'pointer';
    } else {
      hoveredIdx = -1;
      hideTooltip();
      document.body.style.cursor = '';
    }
  });

  canvas.addEventListener('mousedown', () => { mouseDownIdx = hoveredIdx; });

  canvas.addEventListener('mouseup', () => {
    if (hoveredIdx >= 0 && hoveredIdx === mouseDownIdx) selectSong(hoveredIdx);
    mouseDownIdx = -1;
  });
}
