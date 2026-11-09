# Proposal

## Why

Mode-aware selection (see `mode-aware-idf-voronoi`) can raise the Voronoi site count from hundreds of rail stations to many thousands with buses. Rebuilding the diagram and redrawing SVG polygons on the main thread will make mode toggling and panning sluggish. Performance must be solved without adding runtime API calls.

## What Changes

- Compute Voronoi cell geometry off the main thread or at build time for each mode set, so toggling modes does not block the UI.
- Render cells, routes, and markers with a canvas renderer and add zoom-based level of detail (simplified geometry and hidden low-importance sites when zoomed out).
- Add repeatable performance measurements (site count, rebuild time, interaction frame time) so regressions are visible.
- No new runtime network requests.

## Capabilities

### New Capabilities
- `idf-map-performance`: Responsiveness budgets for mode changes, panning, and zooming on the transport map.

### Modified Capabilities

## Impact

Affects the transport layer component, the data generator and snapshot format (if cells are precomputed), build output size, and test/benchmark tooling. Depends on the mode metadata introduced by `mode-aware-idf-voronoi`.
