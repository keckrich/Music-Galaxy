import type { Song, ParsedFeatures, RGB } from './types';

export function parseMood(raw: string | null): Record<string, number> {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(',').map(p => {
      const [k, v] = p.split(':');
      return [k.trim(), parseFloat(v)];
    })
  );
}

export function parseFeatures(raw: string | null): ParsedFeatures {
  const defaults: ParsedFeatures = { danceable: 0, aggressive: 0, happy: 0, party: 0, relaxed: 0, sad: 0 };
  if (!raw) return defaults;
  const map = Object.fromEntries(
    raw.split(',').map(p => { const [k, v] = p.split(':'); return [k.trim(), parseFloat(v)]; })
  );
  return { ...defaults, ...map } as ParsedFeatures;
}

export function topGenre(song: Song): string {
  const m = parseMood(song.mood);
  return Object.keys(m)[0] ?? 'unknown';
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dist3(a: Song, b: Song): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function getNearestN(songs: Song[], idx: number, n: number): number[] {
  const s = songs[idx];
  return songs
    .map((t, i) => ({ i, d: dist3(s, t) }))
    .sort((a, b) => a.d - b.d)
    .slice(1, n + 1)
    .map(x => x.i);
}

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
