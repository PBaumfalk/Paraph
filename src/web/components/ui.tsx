import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { t } from '../lib/i18n';
import { initials } from '../lib/format';
import { renderPage, type PdfDoc } from '../lib/pdf';

/** Der Paraph – ein Tintenzug. Erkennungszeichen, Ladezeichen und Abschlussmoment. */
export function Paraph({ size = 28, draw = false, color = 'var(--tinte)', stroke = 2.4, className = '' }: { size?: number; draw?: boolean; color?: string; stroke?: number; className?: string }) {
  return (
    <svg className={`paraph ${className}`} data-draw={draw} width={size} height={size * 0.62} viewBox="0 0 52 32" fill="none" aria-hidden="true">
      <path pathLength={1} d="M3 22c4-11 9-17 12-15s-4 14 1 13 7-12 12-11c3 .6-1 8-5 11 6-3 13-10 17-9 3 .8-2 7 0 8s7-4 9-6" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Spinner({ size = 36, label }: { size?: number; label?: string }) {
  return (
    <div className="row" role="status" aria-live="polite" style={{ justifyContent: 'center', gap: 10 }}>
      <svg className="spinner" width={size} height={size * 0.62} viewBox="0 0 52 32" fill="none" aria-hidden="true">
        <path pathLength={1} d="M3 22c4-11 9-17 12-15s-4 14 1 13 7-12 12-11c3 .6-1 8-5 11 6-3 13-10 17-9 3 .8-2 7 0 8s7-4 9-6" stroke="var(--tinte)" strokeWidth={2.4} strokeLinecap="round" />
      </svg>
      {label ? <span className="muted">{label}</span> : <span className="sr-only">{t('Lädt …')}</span>}
    </div>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <Paraph size={small ? 26 : 32} />
      <span className="display" style={{ fontSize: small ? 21 : 26, lineHeight: 1 }}>
        Paraph
      </span>
    </span>
  );
}

export function Dialog({ title, onClose, children, footer, wide, icon }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; icon?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusable = el?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button.btn-primary');
    focusable?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = ov;
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={ref}>
        <div className="dialog-head">
          {icon}
          <h2 id="dlg-title" className="grow">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Schließen')}><X /></button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.kind === 'error' ? 'toast-error' : ''}`}>{i.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Menu({ trigger, children, align = 'right', block = false }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; block?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: block ? 'block' : 'inline-block' }}>
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div className="menu" role="menu" style={{ [align]: 0, top: 'calc(100% + 6px)' }} onClick={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, status, title }: { name: string; status?: string; title?: string }) {
  return (
    <span className="avatar" data-s={status} title={title ?? name}>
      {initials(name)}
    </span>
  );
}

export const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Entwurf', cls: '' },
  sent: { label: 'Unterwegs', cls: 'pill-wait' },
  completed: { label: 'Abgeschlossen', cls: 'pill-done' },
  declined: { label: 'Abgelehnt', cls: 'pill-stop' },
  voided: { label: 'Widerrufen', cls: '' },
  expired: { label: 'Abgelaufen', cls: '' },
};
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: '' };
  return <span className={`pill ${s.cls}`}>{t(s.label)}</span>;
}

export const RSTATUS: Record<string, string> = {
  created: 'Wartet',
  waiting: 'Wartet auf Vorgänger',
  sent: 'Eingeladen',
  opened: 'Hat geöffnet',
  completed: 'Erledigt',
  declined: 'Abgelehnt',
  delegated: 'Weitergegeben',
  voided: 'Widerrufen',
};

export function Callout({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'stop' | 'done'; children: ReactNode }) {
  const Icon = kind === 'warn' || kind === 'stop' ? AlertTriangle : kind === 'done' ? CheckCircle2 : Info;
  return (
    <div className={`callout callout-${kind}`}>
      <Icon />
      <div className="grow">{children}</div>
    </div>
  );
}

/** Rendert eine PDF-Seite, sobald sie in Sichtweite kommt; neu bei Breitenänderung. */
export function PdfPage({ doc, index, width, onRendered }: { doc: PdfDoc | null; index: number; width: number; onRendered?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!doc || !visible || !canvas.current || width < 10) return;
    let task: any;
    let cancelled = false;
    const tm = setTimeout(() => {
      renderPage(doc, index, canvas.current!, width)
        .then((tk) => {
          task = tk;
          if (!cancelled) onRendered?.();
        })
        .catch(() => {});
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(tm);
      try {
        task?.cancel?.();
      } catch {}
    };
  }, [doc, index, width, visible]);
  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%' }} aria-hidden="true" />
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<null | { title: string; text: ReactNode; action: string; danger?: boolean; resolve: (v: boolean) => void }>(null);
  const confirm = (o: { title: string; text: ReactNode; action: string; danger?: boolean }) => new Promise<boolean>((resolve) => setState({ ...o, resolve }));
  const node = state ? (
    <Dialog
      title={state.title}
      onClose={() => {
        state.resolve(false);
        setState(null);
      }}
      footer={
        <>
          <button className="btn" onClick={() => { state.resolve(false); setState(null); }}>{t('Abbrechen')}</button>
          <button className={`btn ${state.danger ? 'btn-ink' : 'btn-primary'}`} onClick={() => { state.resolve(true); setState(null); }}>{state.action}</button>
        </>
      }
    >
      <div className="muted">{state.text}</div>
    </Dialog>
  ) : null;
  return { confirm, node };
}

export function errorText(e: unknown) {
  const err = e as any;
  if (err?.details?.problems) return err.details.problems.join(' ');
  return err?.message ?? t('Unbekannter Fehler');
}
