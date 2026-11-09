import type { IdfLine } from './idf-datapoints';
import { DEFAULT_LINE_COLOR, DEFAULT_LINE_TEXT_COLOR, DEFAULT_LINE_WEIGHT, LINE_CONFIG } from './idf-line-config';
import { isRailMode } from './transport-modes';

export interface LineStyle {
  color: string;
  textColor: string;
  weight: number;
}

// LINE_CONFIG is keyed by ref only, so it must never be applied to non-rail modes ("4" is also a bus line).
const NON_RAIL_STYLE: Record<'cable_car' | 'bus' | 'other', LineStyle> = {
  cable_car: { color: '#C2410C', textColor: '#FFFFFF', weight: 3 },
  bus: { color: '#3F8F5F', textColor: '#FFFFFF', weight: 2 },
  other: { color: DEFAULT_LINE_COLOR, textColor: DEFAULT_LINE_TEXT_COLOR, weight: DEFAULT_LINE_WEIGHT }
};

export function lineStyle(line: Pick<IdfLine, 'ref' | 'mode'>): LineStyle {
  if (!isRailMode(line.mode)) return NON_RAIL_STYLE[line.mode];
  const cfg = LINE_CONFIG[line.ref];
  return {
    color: cfg?.color ?? DEFAULT_LINE_COLOR,
    textColor: cfg?.textColor ?? DEFAULT_LINE_TEXT_COLOR,
    weight: cfg?.weight ?? DEFAULT_LINE_WEIGHT
  };
}

/** Rail lines are shown only when officially configured; non-rail lines are always shown. */
export function visibleLines(lines: readonly IdfLine[]): IdfLine[] {
  return lines.filter(l => !isRailMode(l.mode) || !!LINE_CONFIG[l.ref]);
}

export function lineShape(mode: IdfLine['mode']): string {
  return mode === 'cable_car' ? 'cable' : mode;
}

/** Strip trailing disambiguation parentheses like "(9)" or "(M4)" from OSM station names */
export function cleanName(raw: string): string {
  return raw.replace(/\s*\([^)]*\)\s*$/, '').trim() || raw;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Inline HTML for a row of line badge chips; long lists are truncated. */
export function lineBadgesHtml(lines: readonly IdfLine[], max = 12): string {
  const shown = lines.slice(0, max);
  const badges = shown.map(line => {
    const style = lineStyle(line);
    return `<span class="parmap-line-badge parmap-line-badge--${lineShape(line.mode)}" style="background:${style.color};color:${style.textColor}">${escapeHtml(line.ref)}</span>`;
  });
  if (lines.length > max) badges.push(`<span style="opacity:.6;font-size:10px">+${lines.length - max}</span>`);
  return badges.join(' ');
}
