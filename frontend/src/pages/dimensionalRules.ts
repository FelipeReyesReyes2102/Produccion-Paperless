// Espejo de backend/app/services/dimensional.py (Administración). El servidor recalcula y decide.
export type Range = { min: string | number | null; max: string | number | null; definido: boolean };
export type Check = { state: 'neutral' | 'valid' | 'invalid'; message: string };

export const num = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function check(value: string, range: Range | undefined): Check {
  const min = num(range?.min),
    max = num(range?.max);
  if (!range?.definido || min === null || max === null)
    return { state: 'neutral', message: 'Sin límites en el SetUp' };
  const label = `Rango ${min} – ${max}`;
  const n = num(value);
  if (n === null) return { state: 'neutral', message: label };
  return n >= min && n <= max
    ? { state: 'valid', message: `${label} · Dentro` }
    : { state: 'invalid', message: `${label} · Fuera de tolerancia` };
}

export function average(values: string[]): string {
  const nums = values.map(num);
  if (nums.some((n) => n === null)) return '';
  return ((nums as number[]).reduce((a, b) => a + b, 0) / nums.length).toFixed(3);
}
