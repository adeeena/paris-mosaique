# Proposal

## Why

The map shows which station is nearest but not how near, how coverage varies, or how to share a view. Because the project is exploratory, offline insights derived from the existing snapshot add value without extra API traffic.

## What Changes

- Show the nearest station and straight-line distance for a clicked point or the user's location, with 5 and 10 minute walking radius rings.
- Persist the view, selected modes, and selected station in the URL so map states can be shared and restored.
- Add cell-area analytics: colour cells by area and list the largest cells for the selected modes to highlight sparsely served areas.
- Defer network-distance (walking-graph) Voronoi; revisit after the performance work shows what is feasible.

## Capabilities

### New Capabilities
- `idf-coverage-insights`: Nearest-station readout, distance rings, shareable map state, and cell-area analytics.

### Modified Capabilities

## Impact

Affects the overlay UI, transport layer selection logic, routing/URL handling, and tests. All computation uses the local snapshot and the selected modes from `mode-aware-idf-voronoi`; geolocation is the only new browser permission.
