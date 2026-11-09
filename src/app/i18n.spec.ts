import { DICTIONARIES, MessageKey, setLanguage, t } from './i18n';

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  it('starts in English and fills in the placeholders', () => {
    expect(t('card.station')).toBe('Station');
    expect(t('defunct.closed', { year: 1939 })).toBe('Closed 1939');
  });

  it('leaves a placeholder alone when no value is given for it', () => {
    expect(t('duration.hmin', { h: 1 })).toBe('1 h {m} min');
  });

  it('translates every text into every language, keeping the placeholders', () => {
    const keys = Object.keys(DICTIONARIES.en) as MessageKey[];

    for (const language of ['fr', 'hu'] as const) {
      expect(Object.keys(DICTIONARIES[language]).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        const text = DICTIONARIES[language][key];
        expect(text.trim()).not.toBe('');
        expect(placeholders(text)).toEqual(placeholders(DICTIONARIES.en[key]));
      }
    }
  });

  it('names the two distances in the chosen language', () => {
    setLanguage('hu');
    expect([t('distance.direct'), t('distance.walking')]).toEqual(['Közvetlen', 'Gyalog']);
    setLanguage('fr');
    expect([t('distance.direct'), t('distance.walking')]).toEqual(['Direct', 'À pied']);
  });
});
