import { describe, it, expect } from 'vitest';
import { inspectAndNormalize } from '../src/server/pdf/inspect.js';
import { renderFields } from '../src/server/pdf/render.js';
import { visualToUser, userToVisual } from '../src/server/pdf/geometry.js';
import { makePdf, solidPng, rasterize, diffBBox } from './helpers/pdfs.js';

const rect = { x: 0.55, y: 0.12, w: 0.3, h: 0.08 };

describe('Feldpositionen überleben Rotation, CropBox und unsauberen Seiteninhalt', () => {
  const cases: { rotation: number; crop?: [number, number, number, number]; unbalancedCm?: boolean; size?: [number, number] }[] = [];
  for (const rotation of [0, 90, 180, 270, -90, 450]) {
    cases.push({ rotation });
    cases.push({ rotation, crop: [40, 60, 480, 700] });
    cases.push({ rotation, unbalancedCm: true, crop: [10, 20, 500, 760] });
  }
  cases.push({ rotation: 0, size: [842, 595] });
  cases.push({ rotation: 90, size: [300, 1200] });

  for (const c of cases) {
    it(`Rotation ${c.rotation}, Crop ${c.crop ? 'ja' : 'nein'}, cm ${c.unbalancedCm ? 'unbalanciert' : 'sauber'}, Größe ${c.size ?? 'A4'}`, async () => {
      const src = await makePdf({ ...c, pages: 2 });
      const n = await inspectAndNormalize(src, 50);
      const info = n.pages[1];
      const out = await renderFields(n.bytes, n.pages, [{ page: 1, ...rect, type: 'signature', image: solidPng(300, 80) }]);
      const r = rasterize(out, 1, 144);
      const sx = r.width / info.width, sy = r.height / info.height;
      expect(Math.abs(r.width - info.width * 2)).toBeLessThanOrEqual(2);
      // Nur im erwarteten Bereich ± Rand suchen, damit Seitentext nicht stört
      const ex0 = rect.x * info.width * sx, ey0 = rect.y * info.height * sy;
      const ex1 = (rect.x + rect.w) * info.width * sx, ey1 = (rect.y + rect.h) * info.height * sy;
      const bb = diffBBox(rasterize(n.bytes, 1, 144), r);
      expect(bb.n).toBeGreaterThan(1000);
      // Das schwarze Bild liegt vollständig im Feld (Rand 3 pt links für die Signaturklammer)
      expect(bb.x0).toBeGreaterThanOrEqual(ex0 - 2);
      expect(bb.y0).toBeGreaterThanOrEqual(ey0 - 2);
      expect(bb.x1).toBeLessThanOrEqual(ex1 + 2);
      expect(bb.y1).toBeLessThanOrEqual(ey1 + 2);
      // und füllt es im Wesentlichen aus (Seitenverhältnis 300:80 passt)
      expect(Math.max((bb.x1 - bb.x0) / (ex1 - ex0), (bb.y1 - bb.y0) / (ey1 - ey0))).toBeGreaterThan(0.8);
    });
  }

  it('visualToUser und userToVisual sind zueinander invers', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const p = { width: rotation % 180 ? 700 : 480, height: rotation % 180 ? 480 : 700, rotation, crop: [40, 60, 480, 700] as [number, number, number, number] };
      const [ux, uy] = visualToUser(p, 123, 456);
      const [vx, vy] = userToVisual(p, ux, uy);
      expect(vx).toBeCloseTo(123);
      expect(vy).toBeCloseTo(456);
    }
  });
});
