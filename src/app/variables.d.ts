export interface MapCoords {
  center: [number, number];
  zoom: number;
  bounds: [[number, number], [number, number]];
}

export const MAP_COORDS: MapCoords;
export default MAP_COORDS;
