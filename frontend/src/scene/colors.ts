import type { ColorMode, RGB } from '../core/types';
import { SONGS } from '../core/data';
import { settings, saveSettings } from '../core/settings';
import { colors, baseColors, sizes, geo } from './particles';
import { lerpRGB, topGenre } from '../core/utils';

// ── Antipode color generation ─────────────────────────────────────────
// Assign maximally distinct hues via the golden angle, so N unknown
// groups always spread evenly across the spectrum regardless of N.
const GOLDEN_ANGLE = 137.508; // degrees

function hslToRgb(h: number, s: number, l: number): RGB {
  // h in [0,360], s and l in [0,1]
  const hn = h / 360;
  const a  = s * Math.min(l, 1 - l);
  const f  = (n: number) => {
    const k = (n + hn * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

// Built once per applyColors("antipode") call, keyed by antipodeId.
let antipodeColorMap: Map<string, RGB> = new Map();

function buildAntipodeColorMap(): void {
  const uniqueIds = [...new Set(
    SONGS.map(s => s.antipodeId).filter((id): id is string => id !== null)
  )];
  antipodeColorMap = new Map(
    uniqueIds.map((id, i) => [id, hslToRgb((i * GOLDEN_ANGLE) % 360, 0.78, 0.62)])
  );
}

function antipodeColor(song: import('../core/types').Song): RGB {
  if (!song.antipodeId) return [0.5, 0.5, 0.5];
  return antipodeColorMap.get(song.antipodeId) ?? [0.5, 0.5, 0.5];
}

// ── Color schemes ─────────────────────────────────────────────────────
function energyColor(e: number | null): RGB {
  const v = e ?? 0.5;
  if (v < 0.5) return lerpRGB([0.1, 0.15, 1.0], [0.1, 0.9, 0.65], v * 2);
  return lerpRGB([0.1, 0.9, 0.65], [1.0, 0.35, 0.05], (v - 0.5) * 2);
}

const KEY_COLORS: Record<string, RGB> = {
  'C':  [1.0, 0.25, 0.25], 'C#': [1.0, 0.55, 0.1],  'D':  [1.0, 0.85, 0.1],
  'D#': [0.6, 0.95, 0.1],  'E':  [0.15, 0.9, 0.2],  'F':  [0.1, 0.9, 0.7],
  'F#': [0.1, 0.6, 1.0],   'G':  [0.2, 0.25, 1.0],  'G#': [0.6, 0.1, 1.0],
  'A':  [0.9, 0.1, 0.9],   'A#': [1.0, 0.1, 0.55],  'B':  [1.0, 0.1, 0.2],
};

const GENRE_COLORS: Record<string, RGB> = {
  'rock':             [1.0, 0.2,  0.2],
  'electronic':       [0.1, 0.8,  1.0],
  'female vocalists': [1.0, 0.4,  0.8],
  'pop':              [1.0, 0.85, 0.1],
  'jazz':             [0.85, 0.65, 0.1],
  'indie':            [1.0, 0.55, 0.1],
  'soul':             [0.75, 0.1, 1.0],
  'folk':             [0.35, 0.85, 0.2],
  'blues':            [0.2, 0.4,  1.0],
  'ambient':          [0.1, 1.0,  0.8],
  'country':          [0.85, 0.55, 0.2],
  'oldies':           [1.0, 0.7,  0.4],
  '80s':              [1.0, 0.2,  0.85],
  'instrumental':     [0.3, 0.85, 0.8],
  'classical':        [0.7, 0.7,  0.95],
};

const DECADE_STOPS: [number, RGB][] = [
  [1950, [1.0, 0.05, 0.05]], // red
  [1960, [1.0, 0.50, 0.00]], // orange
  [1970, [1.0, 0.90, 0.00]], // yellow
  [1980, [0.25, 1.0, 0.10]], // green
  [1990, [0.00, 0.90, 0.75]], // cyan
  [2000, [0.10, 0.40, 1.00]], // blue
  [2010, [0.50, 0.10, 1.00]], // indigo
  [2020, [0.75, 0.00, 1.00]], // violet
];

function decadeColor(year: number | null): RGB {
  if (!year) return [0.5, 0.5, 0.5];
  if (year <= DECADE_STOPS[0][0]) return DECADE_STOPS[0][1];
  if (year >= DECADE_STOPS[DECADE_STOPS.length - 1][0]) return DECADE_STOPS[DECADE_STOPS.length - 1][1];
  for (let i = 0; i < DECADE_STOPS.length - 1; i++) {
    const [y0, c0] = DECADE_STOPS[i];
    const [y1, c1] = DECADE_STOPS[i + 1];
    if (year >= y0 && year <= y1) return lerpRGB(c0, c1, (year - y0) / (y1 - y0));
  }
  return [0.5, 0.5, 0.5];
}

export function getSongColor(song: import('../core/types').Song, mode: ColorMode): RGB {
  switch (mode) {
    case 'energy':  return energyColor(song.energy);
    case 'key':     return KEY_COLORS[song.key ?? ''] ?? [0.6, 0.6, 0.6];
    case 'genre':   return GENRE_COLORS[topGenre(song)] ?? [0.55, 0.55, 0.55];
    case 'decade':  return decadeColor(song.year);
    case 'antipode': return antipodeColor(song);
  }
}

// ── Live-exported color mode ──────────────────────────────────────────
export let colorMode: ColorMode = settings.colorMode;

export function applyColors(mode: ColorMode): void {
  if (mode === 'antipode') buildAntipodeColorMap();
  colorMode = mode;
  settings.colorMode = mode;
  saveSettings(settings);

  SONGS.forEach((s, i) => {
    const [r, g, b] = getSongColor(s, mode);
    baseColors[i*3] = colors[i*3] = r;
    baseColors[i*3+1] = colors[i*3+1] = g;
    baseColors[i*3+2] = colors[i*3+2] = b;
    sizes[i] = (1.0 + (s.energy ?? 0.5) * 0.8) * settings.particleSize;
  });
  geo.attributes.vColor.needsUpdate = true;
  geo.attributes.vSize.needsUpdate  = true;

  updateStats(mode);
}

export function updateStats(mode: ColorMode): void {
  const el = document.getElementById('stats')!;
  if (mode === 'energy') {
    el.innerHTML = '<span style="color:#1a3fff">■</span> Low &nbsp;<span style="color:#44ffaa">■</span> Mid &nbsp;<span style="color:#ff6611">■</span> High energy';
  } else if (mode === 'key') {
    el.innerHTML = 'Color = musical key<br><small style="opacity:.5">12 keys → 12 hues</small>';
  } else if (mode === 'genre') {
    const genres: [string, RGB][] = [['rock',[1,.2,.2]],['electronic',[.1,.8,1]],['pop',[1,.85,.1]],['jazz',[.85,.65,.1]],['soul',[.75,.1,1]],['folk',[.35,.85,.2]]];
    el.innerHTML = genres.map(([g, c]) => {
      const hex = '#' + (c as RGB).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
      return `<span style="color:${hex}">■</span> ${g}`;
    }).join(' &nbsp;');
  } else if (mode === 'decade') {
    el.innerHTML = '<span style="color:#ff0d0d">■</span>50s <span style="color:#ff8000">■</span>60s <span style="color:#ffe600">■</span>70s <span style="color:#40ff1a">■</span>80s<br><span style="color:#00e6bf">■</span>90s <span style="color:#1a66ff">■</span>00s <span style="color:#801aff">■</span>10s <span style="color:#bf00ff">■</span>20s';
  } else {
    const n = antipodeColorMap.size;
    el.innerHTML = `${n} groups · same color = same least-similar song`;
  }
}
