/**
 * Official RATP / SNCF / IDFM line colours for Île-de-France public transport.
 *
 * This file is maintained MANUALLY — edit it to tweak colours or weights.
 * Running `npm run update-datapoints` refreshes stop/route geometry from OSM
 * but does NOT touch this file.
 *
 * Sources: RATP brand guidelines, Île-de-France Mobilités design system,
 *          https://www.ratp.fr and https://www.transilien.com official maps.
 */

export interface LineConfig {
  /** CSS hex colour used for the polyline and marker accent. */
  color: string;
  /** Contrasting colour for text/icons drawn on top of the line colour. */
  textColor: string;
  /** Polyline stroke width in pixels. Defaults to DEFAULT_LINE_WEIGHT. */
  weight?: number;
}

export const DEFAULT_LINE_COLOR  = '#888888';
export const DEFAULT_LINE_TEXT_COLOR = '#ffffff';
export const DEFAULT_LINE_WEIGHT = 3;

export const LINE_CONFIG: Record<string, LineConfig> = {

  // ── Métro (RATP) ────────────────────────────────────────────────────────────
  '1':   { color: '#FFCE00', textColor: '#000000', weight: 4 },
  '2':   { color: '#003CA6', textColor: '#FFFFFF', weight: 4 },
  '3':   { color: '#837902', textColor: '#FFFFFF', weight: 4 },
  '3b':  { color: '#6EC4E8', textColor: '#000000', weight: 4 },
  '4':   { color: '#CF009E', textColor: '#FFFFFF', weight: 4 },
  '5':   { color: '#FF7E2E', textColor: '#FFFFFF', weight: 4 },
  '6':   { color: '#6ECA97', textColor: '#000000', weight: 4 },
  '7':   { color: '#FA9ABA', textColor: '#000000', weight: 4 },
  '7b':  { color: '#6ECA97', textColor: '#000000', weight: 4 },
  '8':   { color: '#E19BDF', textColor: '#000000', weight: 4 },
  '9':   { color: '#B6BD00', textColor: '#000000', weight: 4 },
  '10':  { color: '#C9910D', textColor: '#FFFFFF', weight: 4 },
  '11':  { color: '#704B1C', textColor: '#FFFFFF', weight: 4 },
  '12':  { color: '#007852', textColor: '#FFFFFF', weight: 4 },
  '13':  { color: '#6EC4E8', textColor: '#000000', weight: 4 },
  '14':  { color: '#62259D', textColor: '#FFFFFF', weight: 4 },
  // Grand Paris Express (under construction / partial opening)
  '15':  { color: '#B90845', textColor: '#FFFFFF', weight: 4 },
  '16':  { color: '#F3A504', textColor: '#000000', weight: 4 },
  '17':  { color: '#D2B48C', textColor: '#000000', weight: 4 },
  '18':  { color: '#00A590', textColor: '#FFFFFF', weight: 4 },

  // ── RER (RATP / SNCF) ───────────────────────────────────────────────────────
  'A':   { color: '#FF1400', textColor: '#FFFFFF', weight: 4 },
  'B':   { color: '#4B92DB', textColor: '#FFFFFF', weight: 4 },
  'C':   { color: '#FFCE00', textColor: '#000000', weight: 4 },
  'D':   { color: '#00814F', textColor: '#FFFFFF', weight: 4 },
  'E':   { color: '#9B3F80', textColor: '#FFFFFF', weight: 4 },

  // ── Tramway (RATP / SNCF) ───────────────────────────────────────────────────
  'T1':  { color: '#0055C8', textColor: '#FFFFFF', weight: 3 },
  'T2':  { color: '#CC0000', textColor: '#FFFFFF', weight: 3 },
  'T3a': { color: '#008B00', textColor: '#FFFFFF', weight: 3 },
  'T3b': { color: '#008B00', textColor: '#FFFFFF', weight: 3 },
  'T4':  { color: '#FF8400', textColor: '#FFFFFF', weight: 3 },
  'T5':  { color: '#CC007A', textColor: '#FFFFFF', weight: 3 },
  'T6':  { color: '#0055C8', textColor: '#FFFFFF', weight: 3 },
  'T7':  { color: '#8B4513', textColor: '#FFFFFF', weight: 3 },
  'T8':  { color: '#FF6600', textColor: '#FFFFFF', weight: 3 },
  'T9':  { color: '#FF6600', textColor: '#FFFFFF', weight: 3 },
  'T10': { color: '#00BFFF', textColor: '#000000', weight: 3 },
  'T11': { color: '#8B0000', textColor: '#FFFFFF', weight: 3 },
  'T12': { color: '#006400', textColor: '#FFFFFF', weight: 3 },
  'T13': { color: '#FF69B4', textColor: '#000000', weight: 3 },

  // ── Transilien (SNCF) ───────────────────────────────────────────────────────
  // Multiple route variants per line (different termini) are stored in
  // idf-datapoints.ts and rendered individually — all share the line colour.
  'H':   { color: '#6EC4E8', textColor: '#000000', weight: 3 },
  'J':   { color: '#C3D842', textColor: '#000000', weight: 3 },
  'K':   { color: '#FF7E2E', textColor: '#FFFFFF', weight: 3 },
  'L':   { color: '#A0006E', textColor: '#FFFFFF', weight: 3 },
  'N':   { color: '#00814F', textColor: '#FFFFFF', weight: 3 },
  'P':   { color: '#F5A623', textColor: '#000000', weight: 3 },
  'R':   { color: '#FF1400', textColor: '#FFFFFF', weight: 3 },
  'U':   { color: '#CC007A', textColor: '#FFFFFF', weight: 3 },
  'V':   { color: '#556B2F', textColor: '#FFFFFF', weight: 3 },
};
