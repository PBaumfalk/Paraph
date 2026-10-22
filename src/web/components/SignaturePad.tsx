// Unterschrift erstellen: zeichnen (Maus, Finger, Stift), tippen oder als Bild hochladen.
// Ergebnis ist ein PNG mit transparentem Hintergrund, zugeschnitten auf die Tinte.
import { useEffect, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { Eraser, Undo2, PenLine, Keyboard, ImageUp } from 'lucide-react';
import '@fontsource/caveat/500.css';
import '@fontsource/homemade-apple/400.css';
import '@fontsource/mrs-saint-delafield/400.css';
import '@fontsource/la-belle-aurore/400.css';
import { Dialog } from './ui';
import { t } from '../lib/i18n';

const INK = '#1b2470';
const FONTS = [
  { family: 'Mrs Saint Delafield', size: 1.15 },
  { family: 'Homemade Apple', size: 0.62 },
  { family: 'Caveat', size: 0.95 },
  { family: 'La Belle Aurore', size: 0.8 },
];

type Pt = [number, number, number];

function pathFromStroke(points: number[][]) {
  if (!points.length) return '';
  const d = points.reduce((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length];
    acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    return acc;
  }, ['M', ...points[0], 'Q'] as (string | number)[]);
  d.push('Z');
  return d.join(' ');
}

/** Schneidet transparenten Rand ab und liefert PNG-Base64. */
function trimToPng(src: HTMLCanvasElement, pad = 12): { b64: string; w: number; h: number } | null {
  const ctx = src.getContext('2d')!;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  let w = x1 - x0 + 1, h = y1 - y0 + 1;
  const scale = Math.min(1, 1600 / w, 800 / h);
  const out = document.createElement('canvas');
  out.width = Math.max(20, Math.round(w * scale));
  out.height = Math.max(10, Math.round(h * scale));
  out.getContext('2d')!.drawImage(src, x0, y0, w, h, 0, 0, out.width, out.height);
  return { b64: out.toDataURL('image/png').split(',')[1], w: out.width, h: out.height };
}

export interface AdoptedSignature {
  method: 'drawn' | 'typed' | 'uploaded';
  png_base64: string;
  typed_text?: string;
  preview: string;
}

export function SignaturePad({ purpose, name, onCancel, onAdopt }: { purpose: 'signature' | 'initials'; name: string; onCancel: () => void; onAdopt: (s: AdoptedSignature) => Promise<void> }) {
  const initialsOf = name.split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 3);
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [typed, setTyped] = useState(purpose === 'initials' ? initialsOf : name);
  const [font, setFont] = useState(0);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const current = useRef<Pt[] | null>(null);
  const [size, setSize] = useState({ w: 600, h: 220 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ w, h: Math.round(Math.min(w * (purpose === 'initials' ? 0.45 : 0.38), 300)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [purpose]);

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = INK;
    if (mode === 'draw') {
      for (const s of [...strokes, ...(current.current ? [current.current] : [])]) {
        const outline = getStroke(s, { size: Math.max(3, size.w / 160), thinning: 0.6, smoothing: 0.55, streamline: 0.45, simulatePressure: s.every((p) => p[2] === 0.5) });
        ctx.fill(new Path2D(pathFromStroke(outline)));
      }
    } else if (mode === 'type' && typed.trim()) {
      const f = FONTS[font];
      let px = size.h * f.size * 0.55;
      ctx.font = `${px}px "${f.family}"`;
      while (ctx.measureText(typed).width > size.w * 0.9 && px > 10) {
        px -= 2;
        ctx.font = `${px}px "${f.family}"`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typed, size.w / 2, size.h * 0.55);
    } else if (mode === 'upload' && img) {
      const s = Math.min((size.w * 0.92) / img.width, (size.h * 0.85) / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (size.w - w) / 2, (size.h - h) / 2, w, h);
      // Weißen Hintergrund transparent machen, damit die Unterschrift auf dem Dokument sauber liegt
      const id = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < id.data.length; i += 4) {
        const l = id.data[i] + id.data[i + 1] + id.data[i + 2];
        if (l > 690) id.data[i + 3] = 0;
        else if (l > 560) id.data[i + 3] = Math.min(id.data[i + 3], Math.round(((690 - l) / 130) * 255));
      }
      ctx.putImageData(id, 0, 0);
    }
  };
  useEffect(draw, [strokes, size, mode, typed, font, img]);
  useEffect(() => {
    if (mode === 'type') Promise.all(FONTS.map((f) => document.fonts.load(`40px "${f.family}"`))).then(draw).catch(() => {});
  }, [mode]);

  const pos = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top, e.pressure || 0.5];
  };

  const adopt = async () => {
    setErr('');
    const c = canvas.current!;
    const res = trimToPng(c);
    if (!res) return setErr(t('Bitte unterschreiben Sie im Feld.'));
    if (mode === 'draw') {
      const len = strokes.reduce((a, s) => a + s.length, 0);
      if (len < 12) return setErr(t('Die Unterschrift ist sehr kurz. Bitte deutlicher unterschreiben.'));
    }
    setBusy(true);
    try {
      await onAdopt({ method: mode === 'draw' ? 'drawn' : mode === 'type' ? 'typed' : 'uploaded', png_base64: res.b64, typed_text: mode === 'type' ? typed : undefined, preview: 'data:image/png;base64,' + res.b64 });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      wide
      title={purpose === 'initials' ? t('Paraphe erstellen') : t('Unterschrift erstellen')}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>{t('Abbrechen')}</button>
          <button className="btn btn-primary btn-lg" onClick={adopt} disabled={busy}>{t('Übernehmen')}</button>
        </>
      }
    >
      <div className="stack">
        <div className="segmented" role="tablist">
          <button aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}><PenLine /> {t('Zeichnen')}</button>
          <button aria-pressed={mode === 'type'} onClick={() => setMode('type')}><Keyboard /> {t('Tippen')}</button>
          <button aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}><ImageUp /> {t('Bild')}</button>
        </div>
        <div className="sigpad" ref={box}>
          <canvas
            ref={canvas}
            style={{ width: size.w, height: size.h, touchAction: 'none', cursor: mode === 'draw' ? 'crosshair' : 'default' }}
            aria-label={t('Unterschriftsfeld')}
            onPointerDown={(e) => {
              if (mode !== 'draw') return;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              current.current = [pos(e)];
              draw();
            }}
            onPointerMove={(e) => {
              if (!current.current) return;
              const co = (e.nativeEvent as any).getCoalescedEvents?.() as PointerEvent[] | undefined;
              const evs = co && co.length ? co : [e.nativeEvent];
              for (const ev of evs) {
                const r = canvas.current!.getBoundingClientRect();
                current.current.push([ev.clientX - r.left, ev.clientY - r.top, ev.pressure || 0.5]);
              }
              draw();
            }}
            onPointerUp={() => {
              const stroke = current.current;
              current.current = null;
              if (stroke && stroke.length > 1) setStrokes((s) => [...s, stroke]);
            }}
            onPointerCancel={() => {
              current.current = null;
              draw();
            }}
          />
          <div className="sigpad-line" />
          <span className="sigpad-x">✕</span>
          {mode === 'draw' && strokes.length === 0 && <span className="sigpad-hint">{t('Hier mit Finger, Stift oder Maus unterschreiben')}</span>}
          {mode === 'draw' && strokes.length > 0 && (
            <div className="sigpad-tools">
              <button className="icon-btn" onClick={() => setStrokes((s) => s.slice(0, -1))} aria-label={t('Letzten Strich entfernen')}><Undo2 /></button>
              <button className="icon-btn" onClick={() => setStrokes([])} aria-label={t('Leeren')}><Eraser /></button>
            </div>
          )}
        </div>
        {mode === 'type' && (
          <div className="stack-sm">
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value.slice(0, 60))} aria-label={t('Name')} />
            <div className="font-choices">
              {FONTS.map((f, i) => (
                <button key={f.family} aria-pressed={font === i} onClick={() => setFont(i)} style={{ fontFamily: `"${f.family}"`, fontSize: 26 * f.size }}>
                  {typed || name}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === 'upload' && (
          <label className="btn" style={{ justifySelf: 'start', cursor: 'pointer' }}>
            <ImageUp /> {t('Bild auswählen (PNG oder JPG)')}
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) return setErr(t('Das Bild ist zu groß (max. 5 MB).'));
                const im = new Image();
                im.onload = () => setImg(im);
                im.onerror = () => setErr(t('Das Bild konnte nicht gelesen werden.'));
                im.src = URL.createObjectURL(f);
              }}
            />
          </label>
        )}
        {err && <p className="error-text">{err}</p>}
        <p className="hint">{t('Mit „Übernehmen“ wird das Bild Ihrer Unterschrift den Feldern zugeordnet. Ihre Erklärung geben Sie erst mit der abschließenden Bestätigung ab.')}</p>
      </div>
    </Dialog>
  );
}
