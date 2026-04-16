// Global functions exposed to HTML onclick handlers
interface Window {
  __selectSong:   (idx: number) => void;
  __closePanel:   () => void;
  __resetView:    () => void;
  __refreshData:  () => Promise<void>;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
