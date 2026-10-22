// Sichere Formelsprache für berechnete Felder. Kein eval, kein Zugriff auf irgendetwas außer Feldwerten.
// Grammatik: expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)* ;
// factor := number | {feld} | func '(' args ')' | '(' expr ')' | '-' factor
// Funktionen: sum, min, max, round(x, n), abs, if(bedingung, a, b) mit Vergleich >, <, >=, <=, ==, !=

type Tok = { t: 'num'; v: number } | { t: 'ref'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

const MAX_LEN = 500;

function tokenize(src: string): Tok[] {
  if (src.length > MAX_LEN) throw new Error('Formel zu lang');
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new Error('Ungültige Zahl');
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (c === '{') {
      const j = src.indexOf('}', i);
      if (j < 0) throw new Error('Feldreferenz nicht geschlossen');
      const key = src.slice(i + 1, j).trim();
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) throw new Error('Ungültige Feldreferenz');
      out.push({ t: 'ref', v: key });
      i = j + 1;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      let j = i;
      while (j < src.length && /[a-z]/i.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/(),<>'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Unerwartetes Zeichen „${c}“`);
  }
  return out;
}

export type Values = Record<string, string | undefined | null>;

export function referencedFields(src: string): string[] {
  return tokenize(src).filter((t) => t.t === 'ref').map((t) => t.v);
}

export function evaluateFormula(src: string, values: Values): number {
  const toks = tokenize(src);
  let p = 0;
  let depth = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const t = toks[p++];
    if (!t || (v !== undefined && !(t.t === 'op' && t.v === v))) throw new Error('Syntaxfehler in Formel');
    return t;
  };
  const num = (key: string) => {
    const raw = values[key];
    if (raw === undefined || raw === null || raw === '') return 0;
    const n = Number(String(raw).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const cmp = (): number => {
    const a = expr();
    const t = peek();
    if (t && t.t === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(t.v)) {
      p++;
      const b = expr();
      switch (t.v) {
        case '>': return a > b ? 1 : 0;
        case '<': return a < b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        default: return a !== b ? 1 : 0;
      }
    }
    return a;
  };
  const factor = (): number => {
    if (++depth > 50) throw new Error('Formel zu tief verschachtelt');
    try {
      const t = toks[p++];
      if (!t) throw new Error('Formel unvollständig');
      if (t.t === 'num') return t.v;
      if (t.t === 'ref') return num(t.v);
      if (t.t === 'op' && t.v === '-') return -factor();
      if (t.t === 'op' && t.v === '(') { const v = cmp(); eat(')'); return v; }
      if (t.t === 'id') {
        eat('(');
        const args: number[] = [];
        if (!(peek()?.t === 'op' && (peek() as any).v === ')')) {
          args.push(cmp());
          while (peek()?.t === 'op' && (peek() as any).v === ',') { p++; args.push(cmp()); }
        }
        eat(')');
        switch (t.v) {
          case 'sum': return args.reduce((a, b) => a + b, 0);
          case 'min': return Math.min(...args);
          case 'max': return Math.max(...args);
          case 'abs': return Math.abs(args[0] ?? 0);
          case 'round': { const f = 10 ** Math.max(0, Math.min(6, args[1] ?? 0)); return Math.round((args[0] ?? 0) * f) / f; }
          case 'if': return (args[0] ?? 0) !== 0 ? args[1] ?? 0 : args[2] ?? 0;
          default: throw new Error(`Unbekannte Funktion ${t.v}`);
        }
      }
      throw new Error('Syntaxfehler in Formel');
    } finally {
      depth--;
    }
  };
  const term = (): number => {
    let v = factor();
    while (peek()?.t === 'op' && ['*', '/'].includes((peek() as any).v)) {
      const op = (toks[p++] as any).v;
      const b = factor();
      v = op === '*' ? v * b : b === 0 ? 0 : v / b;
    }
    return v;
  };
  function expr(): number {
    let v = term();
    while (peek()?.t === 'op' && ['+', '-'].includes((peek() as any).v)) {
      const op = (toks[p++] as any).v;
      const b = term();
      v = op === '+' ? v + b : v - b;
    }
    return v;
  }
  const result = cmp();
  if (p !== toks.length) throw new Error('Syntaxfehler in Formel');
  return Number.isFinite(result) ? result : 0;
}

export function formatNumber(n: number, decimals = 2, locale = 'de'): string {
  return n.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
