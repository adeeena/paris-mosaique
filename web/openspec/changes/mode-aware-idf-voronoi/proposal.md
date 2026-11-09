# Proposal

## Why

Parmap's central feature is a Voronoi view of Île-de-France public transport, but the current tessellation and overlays only use a static rail-oriented dataset. Users should be able to choose which transport modes define the map, with rail selected by default. Search can also show stale results when requests complete out of order, and the project remains on Angular 19 with a stale app-shell test and Karma setup.

## What Changes

- Add selectable transport modes, defaulting to rail modes, and use the selected set consistently for Voronoi cells, route lines, and station markers.
- Extend the generated transport data to retain mode information and support bus, cable car, and other supported public-transport route types without inferring mode from line references.
- Make search results correspond to the current query, including clear feedback for empty results and geocoding failures.
- Limit external address geocoding to explicit submissions with caching and cancellation, keeping local station search instant.
- Upgrade Angular to the latest compatible release and replace Karma with Jest; update tests to cover the map's core behavior and search.
- Keep journey planning, live arrivals, and service alerts out of scope.

## Capabilities

### New Capabilities
- `idf-transport-map`: Mode-aware Île-de-France transport map, Voronoi coverage, overlays, and location search.

### Modified Capabilities

## Impact

The OpenStreetMap/Overpass data generator and generated snapshot, transport-map and overlay components, Angular dependencies/build configuration, and unit tests are affected. Existing global visibility controls remain independent of the selected transport modes.