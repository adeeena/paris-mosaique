// Minimal type stubs for packages that don't expose TypeScript declarations
// under the "bundler" moduleResolution strategy used by this project.

declare module 'd3-delaunay' {
  /** Delaunay triangulation of a set of 2-D points. */
  export class Delaunay {
    static from(points: Iterable<[number, number]>): Delaunay;
    /** Returns the index of the input point nearest to (x, y). */
    find(x: number, y: number, i?: number): number;
    voronoi(bounds: [number, number, number, number]): Voronoi;
  }

  /** Voronoi diagram derived from a Delaunay triangulation. */
  export class Voronoi {
    /**
     * Returns the polygon for cell i as an array of [x, y] pairs,
     * or null if the cell is empty.
     */
    cellPolygon(i: number): [number, number][] | null;
  }
}
