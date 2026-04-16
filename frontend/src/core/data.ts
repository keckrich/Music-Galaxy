import type { Song } from './types';

export let SONGS: Song[] = [];
export let N = 0;

export async function loadSongs(library?: string): Promise<{ noDefault: boolean }> {
  while (true) {
    const url = library ? `/api/songs?library=${encodeURIComponent(library)}` : '/api/songs';
    const res = await fetch(url);

    if (res.status === 202) {
      // Server is still computing UMAP — poll every 3s
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    if (res.status === 503) {
      // No default library available (Postgres not configured, generation failed, etc.)
      // The caller can decide whether to fall back to an uploaded library.
      const body = await res.json().catch(() => ({})) as { no_default?: boolean; error?: string };
      if (body.no_default) return { noDefault: true };
      throw new Error(body.error ?? 'Service unavailable');
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      throw new Error(body.error ?? `Server error ${res.status}`);
    }

    const data = await res.json() as Song[];
    // Populate in-place so all existing module references to SONGS stay valid
    SONGS.length = 0;
    for (const s of data) SONGS.push(s);
    N = SONGS.length;
    return { noDefault: false };
  }
}
