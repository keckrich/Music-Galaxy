import './index.scss';
import type { Song } from '../../core/types';
import { SONGS } from '../../core/data';
import { escHtml } from '../../core/utils';
import { selectSong } from '../panel/index';

// ── Bigram fuzzy search ───────────────────────────────────────────────
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function bigramSim(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const ba = bigrams(a), bb = bigrams(b);
  let hits = 0;
  for (const g of ba) if (bb.has(g)) hits++;
  return (2 * hits) / (ba.size + bb.size);
}

function fieldScore(tokens: string[], field: string): number {
  const hay   = norm(field);
  const words = hay.split(' ');
  let total = 0, matched = 0;
  for (const token of tokens) {
    let best = hay.includes(token) ? 1.0 : 0;
    if (!best) {
      for (const word of words) {
        const sim = bigramSim(token, word);
        if (sim > best) best = sim;
      }
    }
    if (best >= 0.5) { total += best; matched++; }
  }
  return matched < tokens.length ? 0 : total / tokens.length;
}

function fuzzyScore(query: string, song: Song): number {
  const tokens = norm(query).split(' ').filter(t => t.length > 0);
  if (!tokens.length) return 0;

  const titleScore  = song.title  ? fieldScore(tokens, song.title)  : 0;
  const authorScore = song.author ? fieldScore(tokens, song.author) : 0;
  const albumScore  = song.album  ? fieldScore(tokens, song.album)  : 0;

  // Title matches rank highest, then author, then album
  const best = Math.max(titleScore * 1.5, authorScore * 1.1, albumScore);
  return best;
}

// ── Results UI ────────────────────────────────────────────────────────
function renderResults(query: string): void {
  const resultsEl = document.getElementById('search-results')!;

  if (!query.trim()) {
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('v');
    return;
  }

  const scored = SONGS
    .map((s, i) => ({ i, score: fuzzyScore(query, s) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  if (!scored.length) {
    resultsEl.innerHTML = '<div class="sr-empty">No results</div>';
    resultsEl.classList.add('v');
    return;
  }

  resultsEl.innerHTML = scored.map(({ i }) => {
    const s   = SONGS[i];
    const sub = [s.author, s.album].filter(Boolean).join(' · ');
    return `<div class="sr-item" data-idx="${i}">
      <div class="sr-title">${escHtml(s.title ?? 'Unknown')}</div>
      ${sub ? `<div class="sr-sub">${escHtml(sub)}</div>` : ''}
    </div>`;
  }).join('');

  resultsEl.classList.add('v');

  resultsEl.querySelectorAll<HTMLElement>('.sr-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const inp = document.getElementById('search-input') as HTMLInputElement;
      inp.value = '';
      resultsEl.innerHTML = '';
      resultsEl.classList.remove('v');
      selectSong(parseInt(el.dataset.idx!));
    });
  });
}

export function wireSearch(): void {
  const input = document.getElementById('search-input') as HTMLInputElement;
  let timer: ReturnType<typeof setTimeout>;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => renderResults(input.value), 80);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; renderResults(''); input.blur(); }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('search-wrap')!.contains(e.target as Node)) {
      document.getElementById('search-results')!.classList.remove('v');
    }
  });
}
