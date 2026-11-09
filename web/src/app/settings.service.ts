import { Injectable, computed, effect, signal } from '@angular/core';
import { Language, isLanguage, language, setLanguage } from './i18n';

export type Theme = 'light' | 'dark' | 'system';
export type SettingsTab = 'appearance' | 'layers' | 'language';

const STORAGE_KEY = 'parmap.settings';

interface Stored {
  theme?: Theme;
  language?: Language;
  legend?: boolean;
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStored(): Stored {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Stored : {};
  } catch {
    return {};
  }
}

/** The language the browser asks for, when it is one we have. */
function browserLanguage(): Language {
  const preferred = typeof navigator === 'undefined' ? '' : (navigator.language ?? '').slice(0, 2).toLowerCase();
  return isLanguage(preferred) ? preferred : 'en';
}

/** The user's choices (theme, language, legend) and the settings dialog; saved in the browser. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly themeChoice = signal<Theme>('system');
  private readonly legendShown = signal(false);
  private readonly systemDark = signal(false);

  readonly theme = this.themeChoice.asReadonly();
  readonly language = language;
  readonly legend = this.legendShown.asReadonly();
  readonly resolvedTheme = computed<'light' | 'dark'>(() =>
    this.themeChoice() === 'system' ? (this.systemDark() ? 'dark' : 'light') : this.themeChoice() as 'light' | 'dark');

  readonly dialogOpen = signal(false);
  readonly tab = signal<SettingsTab>('appearance');

  constructor() {
    const stored = readStored();
    if (isTheme(stored.theme)) this.themeChoice.set(stored.theme);
    setLanguage(isLanguage(stored.language) ? stored.language : browserLanguage());
    this.legendShown.set(stored.legend === true);
    this.followDevice();

    effect(() => {
      if (typeof document === 'undefined') return;
      const resolved = this.resolvedTheme();
      document.documentElement.dataset['theme'] = resolved;
      document.documentElement.style.colorScheme = resolved;
    });
    effect(() => {
      if (typeof document !== 'undefined') document.documentElement.lang = this.language();
    });
  }

  setTheme(theme: Theme): void { this.themeChoice.set(theme); this.save(); }
  setLanguage(next: Language): void { setLanguage(next); this.save(); }
  setLegend(on: boolean): void { this.legendShown.set(on); this.save(); }

  openDialog(tab?: SettingsTab): void {
    if (tab) this.tab.set(tab);
    this.dialogOpen.set(true);
  }

  closeDialog(): void { this.dialogOpen.set(false); }

  toggleDialog(): void { this.dialogOpen.update(open => !open); }

  private followDevice(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDark.set(query.matches);
    query.addEventListener?.('change', e => this.systemDark.set(e.matches));
  }

  private save(): void {
    try {
      const stored: Stored = {
        theme: this.themeChoice(),
        language: this.language(),
        legend: this.legendShown()
      };
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch { /* private mode or full storage: the choices just last for this visit */ }
  }
}
