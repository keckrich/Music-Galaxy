import './index.scss';
import { SONGS } from '../../core/data';
import { parseMood } from '../../core/utils';

export function showTooltip(idx: number, x: number, y: number): void {
  const s   = SONGS[idx];
  const tip = document.getElementById('tip')!;

  document.getElementById('tt')!.textContent = s.title ?? '—';
  document.getElementById('ta')!.textContent = `${s.author ?? ''}  ·  ${s.year ?? ''}`;

  const mood = parseMood(s.mood);
  document.getElementById('tg')!.innerHTML =
    Object.keys(mood).slice(0, 4).map(k => `<span>${k}</span>`).join('') +
    (s.key   ? `<span>${s.key} ${s.scale ?? ''}</span>` : '') +
    (s.tempo ? `<span>${Math.round(s.tempo)} BPM</span>` : '');

  tip.classList.add('v');
  tip.style.left = Math.min(x + 16, window.innerWidth  - 240) + 'px';
  tip.style.top  = Math.min(y + 16, window.innerHeight - 100) + 'px';
}

export function hideTooltip(): void {
  document.getElementById('tip')!.classList.remove('v');
}
