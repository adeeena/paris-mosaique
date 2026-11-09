import { Component } from '@angular/core';
import { MapLayerComponent } from './map-layer.component';
import { MapTransportLayerComponent } from './map-transport-layer.component';
import { MapOverlayComponent } from './map-overlay.component';

@Component({
  selector: 'app-pages-map',
  standalone: true,
  imports: [MapLayerComponent, MapTransportLayerComponent, MapOverlayComponent],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent {}
