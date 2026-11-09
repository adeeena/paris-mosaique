import { Component, ElementRef, HostListener, computed, effect, inject, viewChild } from '@angular/core';
import { LANGUAGES, MessageKey, t } from '../../i18n';
import { SettingsService, SettingsTab, Theme } from '../../settings.service';
import { MODE_OPTIONS, TransportMode } from './transport-modes';
import { TransportStore } from './transport-store.service';

interface TabOption { id: SettingsTab; title: MessageKey; }
interface ThemeOption { id: Theme; label: MessageKey; }

/** Their data still loads on demand; the checkboxes are hidden for now. */
const HIDDEN_MODES: readonly TransportMode[] = ['bus', 'other'];

/** The settings popup: a tab per group of settings, in the manner of a native preferences window. */
@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  templateUrl: './settings-dialog.component.html',
  styleUrls: ['./settings-dialog.component.scss']
})
export class SettingsDialogComponent {
  readonly settings = inject(SettingsService);
  readonly store = inject(TransportStore);
  readonly t = t;
  readonly modeOptions = MODE_OPTIONS.filter(m => !HIDDEN_MODES.includes(m.id));
  readonly languages = LANGUAGES;

  readonly tabs: readonly TabOption[] = [
    { id: 'appearance', title: 'tab.appearance' },
    { id: 'layers', title: 'tab.layers' },
    { id: 'language', title: 'tab.language' }
  ];
  readonly themeOptions: readonly ThemeOption[] = [
    { id: 'light', label: 'theme.light' },
    { id: 'dark', label: 'theme.dark' },
    { id: 'system', label: 'theme.system' }
  ];
  readonly tabTitleKey = computed(() => this.tabs.find(tab => tab.id === this.settings.tab())!.title);

  showVoronoi = true;
  showLines = true;
  showStations = true;

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    // Keyboard focus moves into the dialog when it opens, so Escape and Tab act on it.
    effect(() => this.dialog()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.settings.dialogOpen()) this.settings.closeDialog();
  }

  onScrim(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.settings.closeDialog();
  }

  isChecked(e: Event): boolean { return (e.target as HTMLInputElement).checked; }

  modeLabelKey(id: TransportMode): MessageKey { return `mode.${id}`; }

  modeHint(id: TransportMode): string {
    if (id === 'bus') return t('mode.bus.hint');
    if (id === 'other') return t('mode.other.hint');
    return '';
  }

  onModeChange(mode: TransportMode, e: Event): void { this.store.setMode(mode, this.isChecked(e)); }

  onVoronoiChange(e: Event): void { this.showVoronoi = this.isChecked(e); this.toggleLayer('voronoi', this.showVoronoi); }
  onLinesChange(e: Event): void { this.showLines = this.isChecked(e); this.toggleLayer('routes', this.showLines); }
  onStationsChange(e: Event): void { this.showStations = this.isChecked(e); this.toggleLayer('stations', this.showStations); }
  onDefunctChange(e: Event): void { this.store.setDefunct(this.isChecked(e)); }

  private toggleLayer(key: string, show: boolean): void {
    const layers = (window as any)._parmap_layers;
    const map = (window as any)._parmap_map;
    if (!layers || !map) return;
    if (show) layers[key].addTo(map);
    else layers[key].remove();
  }
}
