/**
 * Closed, never-opened and replaced Paris metro stations, from
 * https://fr.wikipedia.org/wiki/Stations_fantômes_du_métro_de_Paris (summary table).
 * Hand-maintained: the coordinates are those of the Wikipedia articles, or of the old site where it is known to lie
 * apart from the live station (`approximate`). Reserved but never built shells (La Défense-Michelet,
 * Élysées-La Défense, Bruneseau-Masséna) and the Orly-Sud legend are not stations and are left out.
 */
export type DefunctStatus = 'closed' | 'never-opened' | 'relocated' | 'unused-platforms';

export interface DefunctStation {
  name: string;
  /** Metro line refs, in the app's line keys ("3b" for 3 bis). */
  lines: string[];
  status: DefunctStatus;
  /** Year it closed or was replaced; absent for stations that never opened or platforms that were never used. */
  year?: number;
  note: string;
  lat: number;
  lon: number;
  /** True when the position is that of the live station next to it, or an estimate. */
  approximate?: boolean;
}

export const DEFUNCT_STATIONS: readonly DefunctStation[] = [
  { name: 'Croix-Rouge', lines: ['10'], status: 'closed', year: 1939, lat: 48.85189, lon: 2.32950,
    note: 'Former terminus of line 10; trains still pass through it.' },
  { name: 'Saint-Martin', lines: ['8', '9'], status: 'closed', year: 1939, lat: 48.86844, lon: 2.35866,
    note: 'Too close to Strasbourg - Saint-Denis; it never reopened.' },
  { name: 'Arsenal', lines: ['5'], status: 'closed', year: 1939, lat: 48.84904, lon: 2.36664,
    note: 'Now used for RATP maintenance training.' },
  { name: 'Champ de Mars', lines: ['8'], status: 'closed', year: 1939, lat: 48.85186, lon: 2.30188,
    note: 'One of its platforms houses a ventilation post.' },
  { name: 'Gare du Nord USFRT', lines: ['5'], status: 'closed', year: 1942, lat: 48.87929, lon: 2.35437,
    note: 'Terminus loop of line 5 until the extension to Pantin; now RATP training tracks.' },
  { name: 'Martin Nadaud', lines: ['3'], status: 'closed', year: 1969, lat: 48.86490, lon: 2.39812,
    note: 'Absorbed by the new Gambetta station, 232 m away.' },
  { name: 'Haxo', lines: ['3b', '7b'], status: 'never-opened', lat: 48.87870, lon: 2.40164,
    note: 'Built on the voie des Fêtes shuttle; it has no exit to the street.' },
  { name: 'Porte Molitor', lines: ['9', '10'], status: 'never-opened', lat: 48.84298, lon: 2.25634,
    note: 'Built on the voie Murat link between lines 9 and 10, for Parc des Princes match days.' },
  { name: 'Les Halles (original)', lines: ['4'], status: 'relocated', year: 1977, lat: 48.86240, lon: 2.34470, approximate: true,
    note: 'Rebuilt about 100 m east for the Châtelet - Les Halles interchange; nothing of it is left.' },
  { name: 'Porte de Versailles (original)', lines: ['12'], status: 'relocated', year: 1930, lat: 48.83233, lon: 2.28784, approximate: true,
    note: 'The old terminus under rue de Vaugirard; its tiles are still visible in the tunnel.' },
  { name: 'Victor Hugo (original)', lines: ['2'], status: 'relocated', year: 1931, lat: 48.86980, lon: 2.28380, approximate: true,
    note: 'Moved about 100 m east because of its sharp curve; the old platforms are seen towards Porte Dauphine.' },
  { name: 'Porte Maillot (original)', lines: ['1'], status: 'relocated', year: 1937, lat: 48.87796, lon: 2.28184, approximate: true,
    note: 'The first terminus loop of line 1, now a maintenance workshop.' },
  { name: 'Porte des Lilas - Cinéma', lines: ['7b'], status: 'unused-platforms', lat: 48.87718, lon: 2.40666, approximate: true,
    note: 'Platform of the old line 7 shuttle, used for film and advertising shoots.' },
  { name: 'Invalides (east half-station)', lines: ['8', '13'], status: 'unused-platforms', lat: 48.86091, lon: 2.31446, approximate: true,
    note: 'A single-track dead end from a planned inner ring line that was never run.' }
];
