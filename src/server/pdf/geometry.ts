// Umrechnung zwischen sichtbaren, normierten Feldkoordinaten und dem PDF-Benutzerkoordinatensystem.
// Sichtbar = so wie pdf.js die Seite anzeigt: CropBox, /Rotate angewandt, Ursprung oben links.
import type { PageInfo } from '../../shared/model.js';

export interface UserPlacement {
  /** Transformationsmatrix [a b c d e f]: lokales, aufrechtes Feldsystem (Ursprung unten links, Einheit pt) → Benutzerraum */
  matrix: [number, number, number, number, number, number];
  width: number; // pt (sichtbar)
  height: number; // pt (sichtbar)
}

export function normalizeRotation(r: number): 0 | 90 | 180 | 270 {
  if (!Number.isFinite(r) || r % 90 !== 0) return 0;
  return ((((r % 360) + 360) % 360) as 0 | 90 | 180 | 270);
}

/** Sichtbarer Punkt (pt, Ursprung oben links) → Benutzerraum. */
export function visualToUser(page: PageInfo, vx: number, vy: number): [number, number] {
  const [cx, cy, cw, ch] = page.crop;
  switch (page.rotation) {
    case 0: return [cx + vx, cy + ch - vy];
    case 90: return [cx + vy, cy + vx];
    case 180: return [cx + cw - vx, cy + vy];
    case 270: return [cx + cw - vy, cy + ch - vx];
  }
}

/** Benutzerraum → sichtbarer Punkt (Umkehrung, für Tests und Prüfwerkzeuge). */
export function userToVisual(page: PageInfo, ux: number, uy: number): [number, number] {
  const [cx, cy, cw, ch] = page.crop;
  switch (page.rotation) {
    case 0: return [ux - cx, cy + ch - uy];
    case 90: return [uy - cy, ux - cx];
    case 180: return [cx + cw - ux, uy - cy];
    case 270: return [cy + ch - uy, cx + cw - ux];
  }
}

export function placeField(page: PageInfo, r: { x: number; y: number; w: number; h: number }): UserPlacement {
  const vw = r.w * page.width;
  const vh = r.h * page.height;
  const vx = r.x * page.width;
  const vy = r.y * page.height;
  // Lokaler Ursprung = sichtbare linke untere Ecke des Felds
  const [px, py] = visualToUser(page, vx, vy + vh);
  const rad = (page.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  // Inhalt um page.rotation gegen den Uhrzeigersinn drehen; die Anzeige dreht im Uhrzeigersinn zurück.
  return { matrix: [cos, sin, -sin, cos, px, py], width: vw, height: vh };
}

export function clampRect(r: { x: number; y: number; w: number; h: number }) {
  const w = Math.min(Math.max(r.w, 0.005), 1);
  const h = Math.min(Math.max(r.h, 0.003), 1);
  return { x: Math.min(Math.max(r.x, 0), 1 - w), y: Math.min(Math.max(r.y, 0), 1 - h), w, h };
}
