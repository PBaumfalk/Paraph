// Studio: Felder direkt auf dem Dokument platzieren.
// Koordinaten sind normiert (0–1) relativ zur sichtbaren Seite – identisch mit dem Server.
// Darstellung über Prozentwerte: Zoom und Bildschirmgröße verändern die Position nie.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PenLine,
  Signature as SigIcon,
  Type,
  Calendar,
  CalendarCheck,
  CheckSquare,
  ListChecks,
  Hash,
  AtSign,
  User,
  Sigma,
  Paperclip,
  Trash2,
  Copy,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Wand2,
  Layers,
  MoveHorizontal,
} from 'lucide-react';
import { PdfPage } from './ui';
import { loadPdf, type PdfDoc } from '../lib/pdf';
import { fetchBytes } from '../lib/api';
import { t } from '../lib/i18n';

export interface PageInfo {
  width: number;
  height: number;
  rotation: number;
  crop: number[];
}
export interface StudioDoc {
  id: string;
  name: string;
  pages: PageInfo[];
  pdfUrl: string;
}
export interface Party {
  id: string;
  name: string;
  color: string;
  kind: string;
}
export interface FieldModel {
  id: string;
  key: string;
  type: string;
  doc: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  party: string;
  required: boolean;
  label: string;
  config: Record<string, any>;
  value?: string | null;
}
export interface Suggestion {
  doc: number;
  page: number;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  reason: string;
}

export const FIELD_META: Record<string, { label: string; icon: any; size: [number, number]; forKinds?: string[] }> = {
  signature: { label: 'Unterschrift', icon: SigIcon, size: [180, 48], forKinds: ['signer', 'witness'] },
  initials: { label: 'Paraphe', icon: PenLine, size: [64, 34], forKinds: ['signer', 'witness'] },
  name: { label: 'Name', icon: User, size: [170, 20] },
  signed_date: { label: 'Datum der Unterschrift', icon: CalendarCheck, size: [100, 20] },
  text: { label: 'Text', icon: Type, size: [170, 20] },
  date: { label: 'Datum', icon: Calendar, size: [100, 20] },
  number: { label: 'Zahl', icon: Hash, size: [100, 20] },
  checkbox: { label: 'Ankreuzfeld', icon: CheckSquare, size: [16, 16] },
  select: { label: 'Auswahl', icon: ListChecks, size: [150, 20] },
  email: { label: 'E-Mail', icon: AtSign, size: [190, 20] },
  formula: { label: 'Berechnung', icon: Sigma, size: [110, 20] },
  attachment: { label: 'Anhang', icon: Paperclip, size: [170, 24] },
};

const uid = () => 'f' + Math.random().toString(36).slice(2, 10);
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

function uniqueKey(type: string, fields: FieldModel[]) {
  let n = fields.filter((f) => f.type === type).length + 1;
  const keys = new Set(fields.map((f) => f.key));
  while (keys.has(`${type}_${n}`)) n++;
  return `${type}_${n}`;
}

export function newField(type: string, doc: number, page: number, info: PageInfo, at: { x: number; y: number } | null, party: string, fields: FieldModel[], label?: string): FieldModel {
  const [wPt, hPt] = FIELD_META[type]?.size ?? [150, 20];
  const w = Math.min(wPt / info.width, 0.95);
  const h = Math.min(hPt / info.height, 0.5);
  const x = clamp((at?.x ?? 0.5) - w / 2, 0, 1 - w);
  const y = clamp((at?.y ?? 0.5) - h / 2, 0, 1 - h);
  return {
    id: uid(),
    key: uniqueKey(type, fields),
    type,
    doc,
    page,
    x,
    y,
    w,
    h,
    party,
    required: type !== 'checkbox',
    label: label ?? t(FIELD_META[type]?.label ?? type),
    config: type === 'select' ? { options: [t('Option 1'), t('Option 2')] } : type === 'formula' ? { formula: '', decimals: 2 } : {},
  };
}

type Drag =
  | { kind: 'move'; ids: string[]; startX: number; startY: number; orig: Record<string, FieldModel>; pageRect: DOMRect; moved: boolean }
  | { kind: 'resize'; id: string; handle: string; startX: number; startY: number; orig: FieldModel; pageRect: DOMRect }
  | { kind: 'new'; type: string; x: number; y: number };

interface Guide {
  doc: number;
  page: number;
  axis: 'x' | 'y';
  pos: number;
}

export function Studio({
  docs,
  parties,
  fields,
  onChange,
  activeParty,
  setActiveParty,
  inspectorExtra,
  suggestions,
  onAcceptSuggestions,
  docTools,
  readOnly,
}: {
  docs: StudioDoc[];
  parties: Party[];
  fields: FieldModel[];
  onChange: (f: FieldModel[]) => void;
  activeParty: string;
  setActiveParty: (id: string) => void;
  inspectorExtra?: ReactNode;
  suggestions?: Suggestion[];
  onAcceptSuggestions?: () => void;
  docTools?: ReactNode;
  readOnly?: boolean;
}) {
  const [pdfs, setPdfs] = useState<Record<string, PdfDoc>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [placing, setPlacing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverPage, setHoverPage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState(800);
  const history = useRef<{ past: FieldModel[][]; future: FieldModel[][] }>({ past: [], future: [] });
  const clipboard = useRef<FieldModel[]>([]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  // PDFs laden
  useEffect(() => {
    for (const d of docs) {
      if (pdfs[d.id]) continue;
      loadPdf(d.pdfUrl, () => fetchBytes(d.pdfUrl)).then((p) => setPdfs((x) => ({ ...x, [d.id]: p }))).catch(() => {});
    }
  }, [docs]);

  // Verfügbare Breite messen
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBaseWidth(Math.max(260, Math.min(el.clientWidth - 48, 980))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pageWidth = Math.round(baseWidth * zoom);

  const commit = useCallback(
    (next: FieldModel[], record = true) => {
      if (record) {
        history.current.past.push(fieldsRef.current);
        if (history.current.past.length > 100) history.current.past.shift();
        history.current.future = [];
      }
      onChange(next);
    },
    [onChange],
  );
  const update = (id: string, patch: Partial<FieldModel>) => commit(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const sel = fields.filter((f) => selected.includes(f.id));
  const one = sel.length === 1 ? sel[0] : null;

  const undo = () => {
    const p = history.current.past.pop();
    if (!p) return;
    history.current.future.push(fieldsRef.current);
    onChange(p);
  };
  const redo = () => {
    const n = history.current.future.pop();
    if (!n) return;
    history.current.past.push(fieldsRef.current);
    onChange(n);
  };

  // Tastatur
  useEffect(() => {
    if (readOnly) return;
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement).isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        setPlacing(null);
        setSelected([]);
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (!sel.length) return;
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commit(fields.filter((f) => !selected.includes(f.id)));
        setSelected([]);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && e.key.toLowerCase() === 'c') {
        clipboard.current = sel;
      } else if (mod && e.key.toLowerCase() === 'v' && clipboard.current.length) {
        e.preventDefault();
        const copies = clipboard.current.map((f, i) => ({ ...f, id: uid(), key: uniqueKey(f.type, [...fields, ...clipboard.current.slice(0, i)]), y: clamp(f.y + 0.02, 0, 1 - f.h), x: clamp(f.x + 0.02, 0, 1 - f.w) }));
        commit([...fields, ...copies]);
        setSelected(copies.map((c) => c.id));
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        commit(
          fields.map((f) => {
            if (!selected.includes(f.id)) return f;
            const info = docs[f.doc].pages[f.page];
            const dx = (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0) / info.width;
            const dy = (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0) / info.height;
            return { ...f, x: clamp(f.x + dx, 0, 1 - f.w), y: clamp(f.y + dy, 0, 1 - f.h) };
          }),
        );
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const duplicate = () => {
    const copies = sel.map((f, i) => ({ ...f, id: uid(), key: uniqueKey(f.type, [...fields, ...sel.slice(0, i)]), y: clamp(f.y + f.h + 0.01, 0, 1 - f.h) }));
    commit([...fields, ...copies]);
    setSelected(copies.map((c) => c.id));
  };

  const allPages = () => {
    if (!one) return;
    const d = docs[one.doc];
    const copies: FieldModel[] = [];
    d.pages.forEach((_, p) => {
      if (p === one.page) return;
      copies.push({ ...one, id: uid(), key: uniqueKey(one.type, [...fields, ...copies]), page: p });
    });
    commit([...fields, ...copies]);
  };

  // Magnetische Hilfslinien: Kanten und Mitten anderer Felder derselben Seite (± 5 px)
  const snap = (f: FieldModel, rect: DOMRect, others: FieldModel[]) => {
    const tol = 5 / rect.width;
    const tolY = 5 / rect.height;
    const g: Guide[] = [];
    let { x, y } = f;
    const xs = (o: FieldModel) => [o.x, o.x + o.w / 2, o.x + o.w];
    const ys = (o: FieldModel) => [o.y, o.y + o.h / 2, o.y + o.h];
    let bestX: [number, number] | null = null;
    let bestY: [number, number] | null = null;
    for (const o of others) {
      for (const ox of xs(o))
        for (const [i, fx] of [f.x, f.x + f.w / 2, f.x + f.w].entries()) {
          const d = Math.abs(ox - fx);
          if (d < tol && (!bestX || d < Math.abs(bestX[0] - (bestX[1] === 0 ? f.x : bestX[1] === 1 ? f.x + f.w / 2 : f.x + f.w)))) bestX = [ox, i];
        }
      for (const oy of ys(o))
        for (const [i, fy] of [f.y, f.y + f.h / 2, f.y + f.h].entries()) {
          const d = Math.abs(oy - fy);
          if (d < tolY && !bestY) bestY = [oy, i];
        }
    }
    if (bestX) {
      x = bestX[0] - (bestX[1] === 0 ? 0 : bestX[1] === 1 ? f.w / 2 : f.w);
      g.push({ doc: f.doc, page: f.page, axis: 'x', pos: bestX[0] });
    }
    if (bestY) {
      y = bestY[0] - (bestY[1] === 0 ? 0 : bestY[1] === 1 ? f.h / 2 : f.h);
      g.push({ doc: f.doc, page: f.page, axis: 'y', pos: bestY[0] });
    }
    return { x: clamp(x, 0, 1 - f.w), y: clamp(y, 0, 1 - f.h), g };
  };

  const pageAt = (clientX: number, clientY: number): { doc: number; page: number; rect: DOMRect } | null => {
    const els = document.elementsFromPoint(clientX, clientY);
    const el = els.find((e) => (e as HTMLElement).dataset?.page !== undefined) as HTMLElement | undefined;
    if (!el) return null;
    return { doc: Number(el.dataset.doc), page: Number(el.dataset.page), rect: el.getBoundingClientRect() };
  };

  // Zeiger-Interaktion (Maus, Stift, Touch)
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (drag.kind === 'new') {
        setDrag({ ...drag, x: e.clientX, y: e.clientY });
        const p = pageAt(e.clientX, e.clientY);
        setHoverPage(p ? `${p.doc}:${p.page}` : null);
        return;
      }
      const dx = (e.clientX - drag.startX) / drag.pageRect.width;
      const dy = (e.clientY - drag.startY) / drag.pageRect.height;
      if (drag.kind === 'move') {
        if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 3) return;
        drag.moved = true;
        let gl: Guide[] = [];
        const next = fieldsRef.current.map((f) => {
          if (!drag.ids.includes(f.id)) return f;
          const o = drag.orig[f.id];
          let nf = { ...f, x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) };
          if (drag.ids.length === 1) {
            const s = snap(nf, drag.pageRect, fieldsRef.current.filter((x) => x.id !== f.id && x.doc === f.doc && x.page === f.page));
            nf = { ...nf, x: s.x, y: s.y };
            gl = s.g;
          }
          return nf;
        });
        setGuides(gl);
        onChange(next);
      } else if (drag.kind === 'resize') {
        const o = drag.orig;
        const info = docs[o.doc].pages[o.page];
        const minW = 12 / info.width, minH = 10 / info.height;
        let { x, y, w, h } = o;
        if (drag.handle.includes('e')) w = clamp(o.w + dx, minW, 1 - o.x);
        if (drag.handle.includes('s')) h = clamp(o.h + dy, minH, 1 - o.y);
        if (drag.handle.includes('w')) {
          const nx = clamp(o.x + dx, 0, o.x + o.w - minW);
          w = o.w + (o.x - nx);
          x = nx;
        }
        if (drag.handle.includes('n')) {
          const ny = clamp(o.y + dy, 0, o.y + o.h - minH);
          h = o.h + (o.y - ny);
          y = ny;
        }
        if (o.type === 'checkbox' && e.shiftKey === false) {
          // Ankreuzfelder bleiben quadratisch (in pt)
          const s = Math.max(w * info.width, h * info.height);
          w = s / info.width;
          h = s / info.height;
        }
        onChange(fieldsRef.current.map((f) => (f.id === drag.id ? { ...f, x, y, w, h } : f)));
      }
    };
    const up = (e: PointerEvent) => {
      if (drag.kind === 'new') {
        const p = pageAt(e.clientX, e.clientY);
        if (p) {
          const info = docs[p.doc].pages[p.page];
          const f = newField(drag.type, p.doc, p.page, info, { x: (e.clientX - p.rect.left) / p.rect.width, y: (e.clientY - p.rect.top) / p.rect.height }, activeParty, fieldsRef.current);
          commit([...fieldsRef.current, f]);
          setSelected([f.id]);
        }
        setHoverPage(null);
      } else if (drag.kind === 'move' && drag.moved) {
        // Seitenwechsel beim Ablegen
        const p = pageAt(e.clientX, e.clientY);
        let next = fieldsRef.current;
        if (p && drag.ids.length === 1) {
          const f = next.find((x) => x.id === drag.ids[0])!;
          if (p.doc !== f.doc || p.page !== f.page) {
            const info = docs[p.doc].pages[p.page];
            const o = drag.orig[f.id];
            const pw = (o.w * docs[o.doc].pages[o.page].width) / info.width;
            const ph = (o.h * docs[o.doc].pages[o.page].height) / info.height;
            const nx = (e.clientX - p.rect.left) / p.rect.width - pw / 2;
            const ny = (e.clientY - p.rect.top) / p.rect.height - ph / 2;
            next = next.map((x) => (x.id === f.id ? { ...x, doc: p.doc, page: p.page, w: pw, h: ph, x: clamp(nx, 0, 1 - pw), y: clamp(ny, 0, 1 - ph) } : x));
          }
        }
        history.current.past.push(Object.values(drag.orig).length ? fieldsRef.current.map((f) => drag.orig[f.id] ?? f) : fieldsRef.current);
        history.current.future = [];
        onChange(next);
      } else if (drag.kind === 'resize') {
        history.current.past.push(fieldsRef.current.map((f) => (f.id === drag.id ? drag.orig : f)));
        history.current.future = [];
      }
      setGuides([]);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, docs, activeParty]);

  const partyOf = (id: string) => parties.find((p) => p.id === id);
  const activePartyObj = partyOf(activeParty);
  const availableTypes = Object.keys(FIELD_META).filter((k) => !FIELD_META[k].forKinds || !activePartyObj || FIELD_META[k].forKinds!.includes(activePartyObj.kind));

  const startField = (e: React.PointerEvent, f: FieldModel) => {
    if (readOnly) return;
    e.stopPropagation();
    if ((e.target as HTMLElement).dataset.handle) return;
    const pageEl = (e.currentTarget as HTMLElement).closest('[data-page]') as HTMLElement;
    let ids = selected.includes(f.id) ? selected : [f.id];
    if (e.shiftKey) ids = selected.includes(f.id) ? selected.filter((i) => i !== f.id) : [...selected, f.id];
    setSelected(ids);
    const orig: Record<string, FieldModel> = {};
    for (const x of fields) if (ids.includes(x.id)) orig[x.id] = x;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDrag({ kind: 'move', ids, startX: e.clientX, startY: e.clientY, orig, pageRect: pageEl.getBoundingClientRect(), moved: false });
  };

  const startResize = (e: React.PointerEvent, f: FieldModel, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    const pageEl = (e.currentTarget as HTMLElement).closest('[data-page]') as HTMLElement;
    setDrag({ kind: 'resize', id: f.id, handle, startX: e.clientX, startY: e.clientY, orig: f, pageRect: pageEl.getBoundingClientRect() });
  };

  const clickPage = (e: React.MouseEvent, doc: number, page: number) => {
    if (readOnly) return;
    if (placing) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const f = newField(placing, doc, page, docs[doc].pages[page], { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }, activeParty, fields);
      commit([...fields, f]);
      setSelected([f.id]);
      if (!e.shiftKey) setPlacing(null);
    } else setSelected([]);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of fields) c[f.party] = (c[f.party] ?? 0) + 1;
    return c;
  }, [fields]);

  return (
    <div className={`studio ${placing ? 'is-placing' : ''}`}>
      {/* Seitenübersicht */}
      <aside className="studio-thumbs" aria-label={t('Seiten')}>
        {docs.map((d, di) => (
          <div key={d.id} className="thumb-doc">
            <div className="thumb-doc-name" title={d.name}>{d.name}</div>
            {d.pages.map((p, pi) => (
              <button
                key={pi}
                className="thumb"
                style={{ aspectRatio: `${p.width} / ${p.height}` }}
                onClick={() => document.getElementById(`pg-${di}-${pi}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                aria-label={t('Seite {n}', { n: pi + 1 })}
              >
                <PdfPage doc={pdfs[d.id] ?? null} index={pi} width={96} />
                {fields.some((f) => f.doc === di && f.page === pi) && <span className="thumb-dot" />}
                <span className="thumb-num">{pi + 1}</span>
              </button>
            ))}
          </div>
        ))}
        {docTools}
      </aside>

      {/* Dokument */}
      <div className="studio-canvas" ref={canvasRef} data-own-drop onPointerDown={() => !placing && setSelected([])}>
        <div className="studio-toolbar">
          <div className="segmented" role="group" aria-label={t('Zoom')}>
            <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} aria-label={t('Verkleinern')}><ZoomOut /></button>
            <button aria-pressed={zoom === 1} onClick={() => setZoom(1)} title={t('Seitenbreite')}><MoveHorizontal /> {Math.round(zoom * 100)} %</button>
            <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label={t('Vergrößern')}><ZoomIn /></button>
          </div>
          {!readOnly && (
            <div className="segmented">
              <button onClick={undo} disabled={!history.current.past.length} aria-label={t('Rückgängig')} title={t('Rückgängig (⌘Z)')}><Undo2 /></button>
              <button onClick={redo} disabled={!history.current.future.length} aria-label={t('Wiederholen')} title={t('Wiederholen (⇧⌘Z)')}><Redo2 /></button>
            </div>
          )}
          {placing && (
            <span className="placing-hint">
              {t('Klicken Sie auf die Stelle im Dokument')} · <span className="kbd">esc</span>
            </span>
          )}
        </div>
        <div className="studio-pages" onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setZoom((z) => clamp(+(z - e.deltaY * 0.002).toFixed(2), 0.5, 2.5)); } }}>
          {docs.map((d, di) =>
            d.pages.map((p, pi) => (
              <div key={`${d.id}-${pi}`} className="page-wrap" id={`pg-${di}-${pi}`}>
                <div className="page-label">
                  {docs.length > 1 && <span>{d.name} · </span>}
                  {t('Seite {n} von {m}', { n: pi + 1, m: d.pages.length })}
                </div>
                <div
                  className={`pdfpage ${hoverPage === `${di}:${pi}` ? 'page-hover' : ''}`}
                  data-doc={di}
                  data-page={pi}
                  style={{ width: pageWidth, aspectRatio: `${p.width} / ${p.height}` }}
                  onClick={(e) => clickPage(e, di, pi)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <PdfPage doc={pdfs[d.id] ?? null} index={pi} width={pageWidth} />
                  {suggestions?.filter((s) => s.doc === di && s.page === pi).map((s, i) => (
                    <div key={i} className="suggestion" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }} title={s.reason} />
                  ))}
                  {guides.filter((g) => g.doc === di && g.page === pi).map((g, i) => (
                    <div key={i} className={`guide guide-${g.axis}`} style={g.axis === 'x' ? { left: `${g.pos * 100}%` } : { top: `${g.pos * 100}%` }} />
                  ))}
                  {fields.filter((f) => f.doc === di && f.page === pi).map((f) => {
                    const party = partyOf(f.party);
                    const Icon = FIELD_META[f.type]?.icon ?? Type;
                    const isSel = selected.includes(f.id);
                    const fontPx = Math.max(9, Math.min(13, f.h * (pageWidth * (p.height / p.width)) * 0.55));
                    return (
                      <div
                        key={f.id}
                        className={`fbox fbox-${f.type} ${isSel ? 'is-sel' : ''}`}
                        style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, ['--pc' as any]: party?.color ?? '#6b7189', fontSize: fontPx }}
                        onPointerDown={(e) => startField(e, f)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={() => document.getElementById('insp-label')?.focus()}
                        tabIndex={0}
                        role="button"
                        aria-label={`${f.label} – ${party?.name ?? ''}`}
                        onFocus={() => !isSel && setSelected([f.id])}
                      >
                        {f.type !== 'checkbox' && (
                          <span className="fbox-label">
                            <Icon aria-hidden="true" />
                            <span>{f.value && f.config.readonly ? f.value : f.label}</span>
                            {f.required && f.type !== 'formula' && <i aria-hidden="true">*</i>}
                          </span>
                        )}
                        {f.config.condition && <span className="fbox-cond" title={t('Bedingtes Feld')}>?</span>}
                        {isSel && !readOnly && sel.length === 1 && ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => (
                          <span key={h} className={`handle h-${h}`} data-handle={h} onPointerDown={(e) => startResize(e, f, h)} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )),
          )}
        </div>
      </div>

      {/* Werkzeuge */}
      <aside className="studio-inspector">
        {!readOnly && (
          <>
            <section className="insp-section">
              <div className="eyebrow">{t('Wer füllt aus?')}</div>
              <div className="party-chips">
                {parties.map((p) => (
                  <button key={p.id} className="party-chip" aria-pressed={p.id === activeParty} style={{ ['--pc' as any]: p.color }} onClick={() => setActiveParty(p.id)}>
                    <span className="party-dot" />
                    <span className="grow">{p.name || t('Ohne Namen')}</span>
                    <span className="mono muted">{counts[p.id] ?? 0}</span>
                  </button>
                ))}
                {!parties.length && <p className="hint">{t('Fügen Sie zuerst eine Person hinzu.')}</p>}
              </div>
            </section>
            <section className="insp-section">
              <div className="eyebrow">{t('Felder')}</div>
              <div className="palette-grid">
                {availableTypes.map((type) => {
                  const M = FIELD_META[type];
                  return (
                    <button
                      key={type}
                      className="pal-item"
                      aria-pressed={placing === type}
                      disabled={!activeParty}
                      style={{ ['--pc' as any]: activePartyObj?.color }}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || !activeParty) return;
                        e.preventDefault();
                        const sx = e.clientX, sy = e.clientY;
                        const mv = (ev: PointerEvent) => {
                          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
                            window.removeEventListener('pointermove', mv);
                            window.removeEventListener('pointerup', cancel);
                            setPlacing(null);
                            setDrag({ kind: 'new', type, x: ev.clientX, y: ev.clientY });
                          }
                        };
                        const cancel = () => {
                          window.removeEventListener('pointermove', mv);
                          window.removeEventListener('pointerup', cancel);
                          setPlacing((p) => (p === type ? null : type));
                        };
                        window.addEventListener('pointermove', mv);
                        window.addEventListener('pointerup', cancel);
                      }}
                    >
                      <M.icon />
                      <span>{t(M.label)}</span>
                    </button>
                  );
                })}
              </div>
              {suggestions && suggestions.length > 0 && onAcceptSuggestions && (
                <button className="btn btn-sm btn-block suggest-btn" onClick={onAcceptSuggestions}>
                  <Wand2 /> {t('{n} erkannte Felder übernehmen', { n: suggestions.length })}
                </button>
              )}
            </section>
          </>
        )}
        {one && !readOnly && <FieldInspector field={one} fields={fields} parties={parties} update={(patch) => update(one.id, patch)} onDelete={() => { commit(fields.filter((f) => f.id !== one.id)); setSelected([]); }} onDuplicate={duplicate} onAllPages={allPages} pages={docs[one.doc].pages.length} />}
        {sel.length > 1 && !readOnly && (
          <section className="insp-section">
            <div className="eyebrow">{t('{n} Felder ausgewählt', { n: sel.length })}</div>
            <div className="row">
              <button className="btn btn-sm" onClick={duplicate}><Copy /> {t('Duplizieren')}</button>
              <button className="btn btn-sm btn-danger" onClick={() => { commit(fields.filter((f) => !selected.includes(f.id))); setSelected([]); }}><Trash2 /> {t('Löschen')}</button>
            </div>
            <div className="field">
              <label className="label">{t('Zuordnen an')}</label>
              <select className="select" value="" onChange={(e) => e.target.value && commit(fields.map((f) => (selected.includes(f.id) ? { ...f, party: e.target.value } : f)))}>
                <option value="">—</option>
                {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </section>
        )}
        {!one && sel.length === 0 && !readOnly && (
          <section className="insp-section insp-tips">
            <p>{t('Ziehen Sie ein Feld auf das Dokument oder tippen Sie es an und dann auf die gewünschte Stelle.')}</p>
            <p className="hint">
              <span className="kbd">⇧</span> {t('Mehrfachauswahl')} · <span className="kbd">⌘D</span> {t('Duplizieren')} · <span className="kbd">←↑→↓</span> {t('Feinjustieren')}
            </p>
          </section>
        )}
        {inspectorExtra}
      </aside>

      {drag?.kind === 'new' && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y, ['--pc' as any]: activePartyObj?.color }}>
          {t(FIELD_META[drag.type].label)}
        </div>
      )}
    </div>
  );
}

function FieldInspector({ field: f, fields, parties, update, onDelete, onDuplicate, onAllPages, pages }: { field: FieldModel; fields: FieldModel[]; parties: Party[]; update: (p: Partial<FieldModel>) => void; onDelete: () => void; onDuplicate: () => void; onAllPages: () => void; pages: number }) {
  const cfg = f.config ?? {};
  const setCfg = (p: Record<string, any>) => update({ config: { ...cfg, ...p } });
  const others = fields.filter((x) => x.id !== f.id && ['checkbox', 'select', 'text', 'number', 'name', 'email', 'date'].includes(x.type));
  const numeric = fields.filter((x) => x.id !== f.id && ['number', 'formula'].includes(x.type));
  const textual = ['text', 'name'].includes(f.type);
  return (
    <section className="insp-section insp-field" key={f.id}>
      <div className="row">
        <div className="eyebrow grow">{t(FIELD_META[f.type]?.label ?? f.type)}</div>
        <button className="icon-btn" onClick={onDuplicate} title={t('Duplizieren (⌘D)')} aria-label={t('Duplizieren')}><Copy /></button>
        <button className="icon-btn" onClick={onDelete} title={t('Löschen (Entf)')} aria-label={t('Löschen')}><Trash2 /></button>
      </div>
      <div className="field">
        <label className="label" htmlFor="insp-label">{t('Beschriftung')}</label>
        <input id="insp-label" className="input" value={f.label} onChange={(e) => update({ label: e.target.value })} />
      </div>
      <div className="field">
        <label className="label">{t('Ausgefüllt von')}</label>
        <select className="select" value={f.party} onChange={(e) => update({ party: e.target.value })}>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {f.type !== 'formula' && f.type !== 'signed_date' && (
        <label className="check">
          <input type="checkbox" checked={f.required} onChange={(e) => update({ required: e.target.checked })} />
          {f.type === 'checkbox' ? t('Muss angekreuzt werden') : t('Pflichtfeld')}
        </label>
      )}
      {f.type === 'initials' && pages > 1 && (
        <button className="btn btn-sm" onClick={onAllPages}><Layers /> {t('Auf allen Seiten wiederholen')}</button>
      )}
      {['text', 'name', 'email', 'number', 'date', 'select'].includes(f.type) && (
        <div className="field">
          <label className="label">{t('Vorbelegung')}</label>
          <input className="input" value={cfg.prefill ?? ''} placeholder={t('leer lassen')} onChange={(e) => setCfg({ prefill: e.target.value || undefined })} />
          {cfg.prefill && (
            <label className="check" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={!!cfg.readonly} onChange={(e) => setCfg({ readonly: e.target.checked })} />
              {t('Nicht änderbar (fester Text im Dokument)')}
            </label>
          )}
        </div>
      )}
      {f.type === 'select' && (
        <div className="field">
          <label className="label">{t('Optionen (eine pro Zeile)')}</label>
          <textarea className="textarea" rows={4} value={(cfg.options ?? []).join('\n')} onChange={(e) => setCfg({ options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </div>
      )}
      {textual && (
        <div className="field">
          <label className="label">{t('Prüfung')}</label>
          <select className="select" value={cfg.validation?.preset ?? ''} onChange={(e) => setCfg({ validation: e.target.value ? { ...(cfg.validation ?? {}), preset: e.target.value } : undefined })}>
            <option value="">{t('Keine')}</option>
            <option value="iban">IBAN</option>
            <option value="plz">{t('Postleitzahl (DE)')}</option>
            <option value="phone">{t('Telefonnummer')}</option>
            <option value="email">{t('E-Mail-Adresse')}</option>
            <option value="integer">{t('Ganze Zahl')}</option>
            <option value="regex">{t('Eigenes Muster (Regex)')}</option>
          </select>
          {cfg.validation?.preset === 'regex' && <input className="input mono" placeholder="^[A-Z]{2}-\\d{4}$" value={cfg.validation?.pattern ?? ''} onChange={(e) => setCfg({ validation: { ...cfg.validation, pattern: e.target.value } })} />}
        </div>
      )}
      {f.type === 'number' && (
        <div className="grid-2">
          <div className="field"><label className="label">{t('Minimum')}</label><input className="input" type="number" value={cfg.validation?.min ?? ''} onChange={(e) => setCfg({ validation: { ...(cfg.validation ?? {}), min: e.target.value === '' ? undefined : Number(e.target.value) } })} /></div>
          <div className="field"><label className="label">{t('Maximum')}</label><input className="input" type="number" value={cfg.validation?.max ?? ''} onChange={(e) => setCfg({ validation: { ...(cfg.validation ?? {}), max: e.target.value === '' ? undefined : Number(e.target.value) } })} /></div>
        </div>
      )}
      {f.type === 'formula' && (
        <div className="field">
          <label className="label">{t('Formel')}</label>
          <input className="input mono" value={cfg.formula ?? ''} placeholder="{menge} * {preis}" onChange={(e) => setCfg({ formula: e.target.value })} />
          <span className="hint">{t('Felder in geschweiften Klammern. Erlaubt: + − × ÷, sum(), round(x, 2), min(), max(), if().')}</span>
          {numeric.length > 0 && (
            <div className="row row-wrap" style={{ gap: 6 }}>
              {numeric.map((n) => (
                <button key={n.id} className="btn btn-sm" onClick={() => setCfg({ formula: `${cfg.formula ?? ''}{${n.key}}` })}>{`{${n.key}}`}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {(f.type === 'date' || f.type === 'signed_date') && (
        <div className="field">
          <label className="label">{t('Datumsformat')}</label>
          <select className="select" value={cfg.dateFormat ?? 'DD.MM.YYYY'} onChange={(e) => setCfg({ dateFormat: e.target.value })}>
            <option value="DD.MM.YYYY">31.12.2026</option>
            <option value="YYYY-MM-DD">2026-12-31</option>
            <option value="MM/DD/YYYY">12/31/2026</option>
          </select>
        </div>
      )}
      <details className="insp-more">
        <summary>{t('Bedingung und Feldname')}</summary>
        <div className="stack-sm" style={{ marginTop: 10 }}>
          <div className="field">
            <label className="label">{t('Nur anzeigen, wenn …')}</label>
            <select className="select" value={cfg.condition?.field ?? ''} onChange={(e) => setCfg({ condition: e.target.value ? { field: e.target.value, op: 'checked' } : undefined })}>
              <option value="">{t('immer anzeigen')}</option>
              {others.map((o) => <option key={o.id} value={o.key}>{o.label} ({o.key})</option>)}
            </select>
            {cfg.condition && (
              <div className="row">
                <select className="select" value={cfg.condition.op} onChange={(e) => setCfg({ condition: { ...cfg.condition, op: e.target.value } })}>
                  <option value="checked">{t('angekreuzt ist')}</option>
                  <option value="unchecked">{t('nicht angekreuzt ist')}</option>
                  <option value="equals">{t('gleich ist')}</option>
                  <option value="not_equals">{t('ungleich ist')}</option>
                  <option value="filled">{t('ausgefüllt ist')}</option>
                  <option value="empty">{t('leer ist')}</option>
                </select>
                {(cfg.condition.op === 'equals' || cfg.condition.op === 'not_equals') && <input className="input" value={cfg.condition.value ?? ''} onChange={(e) => setCfg({ condition: { ...cfg.condition, value: e.target.value } })} />}
              </div>
            )}
          </div>
          <div className="field">
            <label className="label">{t('Feldname (für API, Formeln, Massenversand)')}</label>
            <input className="input mono" value={f.key} onChange={(e) => update({ key: e.target.value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64) })} />
          </div>
        </div>
      </details>
    </section>
  );
}
