export interface Song {
  id: string;
  x: number;
  y: number;
  z: number;
  title: string | null;
  author: string | null;
  album: string | null;
  albumArtist: string | null;
  tempo: number | null;
  key: string | null;
  scale: string | null;
  energy: number | null;
  mood: string | null;
  features: string | null;
  year: number | null;
  rating: number | null;
  antipodeId: string | null;
}

export type ColorMode = "energy" | "genre" | "key" | "decade" | "antipode";

export type Theme = "dark" | "light" | "default";

export type RGB = [number, number, number];

export interface ParsedFeatures {
  danceable: number;
  aggressive: number;
  happy: number;
  party: number;
  relaxed: number;
  sad: number;
}

export interface AppSettings {
  autoRotate: boolean;
  rotateSpeed: number;
  glowAmount: number;       // shader size constant, 80–320
  particleSize: number;     // base size multiplier, 0.3–2.5
  physicsIntensity: number; // drift amplitude multiplier, 0–3
  neighborCount: number;    // songs highlighted on click, 3–30
  dimAmount: number;        // brightness of non-neighbors, 0–1
  colorMode: ColorMode;     // persisted color mode
  theme: Theme;             // ui theme
  activeLibrary: string;    // active library filename; '' = use default
  mediaProvider: string;    // active provider type; '' = use first configured
}
