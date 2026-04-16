export interface MediaProvider {
  type: string;
  url: string;
  label: string;
}

let _providers: MediaProvider[] = [];
export function getConfiguredProviders(): MediaProvider[] { return _providers; }

export async function loadConfig(): Promise<void> {
  try {
    const res  = await fetch('/api/config');
    const data = await res.json() as { providers: MediaProvider[] };
    _providers = data.providers ?? [];
  } catch {
    _providers = [];
  }
}

export function streamUrl(id: string, providerType?: string): string {
  const p = providerType || _providers[0]?.type || 'navidrome';
  return `/api/stream/${encodeURIComponent(id)}?provider=${encodeURIComponent(p)}`;
}

export function openUrl(provider: MediaProvider, songId?: string): string {
  switch (provider.type) {
    case 'jellyfin':
    case 'emby': return songId
      ? `${provider.url}/web/index.html#!/details?id=${songId}`
      : `${provider.url}/web/`;
    case 'navidrome': return `${provider.url}/app/`;
    case 'lyrion':    return `${provider.url}/`;
    default:          return provider.url;
  }
}
