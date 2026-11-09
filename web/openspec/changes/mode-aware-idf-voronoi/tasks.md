# Tasks

## 1. Upgrade the Angular and test toolchain

- [x] 1.1 Upgrade Angular framework, CLI, SSR, and build dependencies to the latest compatible stable release, following supported major migrations; verify `npm run build` and the SSR server build.
- [x] 1.2 Replace Karma/Jasmine with a Jest setup compatible with the upgraded Angular release; verify the test command runs in a non-watch mode.
- [x] 1.3 Replace the stale starter-template assertion with app-shell tests for the actual routed map; verify all existing test-suite cases pass under Jest.

## 2. Add transport-mode metadata to generated data

- [x] 2.1 Inventory the Île-de-France OSM route tags and network/operator metadata for Metro, RER, Transilien, tram, cable car, bus, water transport, and unmatched route types; verify each supported category has a tested mapping and unmatched types map to Other.
- [x] 2.2 Update the Overpass fetcher and normalized station/route data to retain mode independently from line reference; add Jest tests proving identical refs in different modes remain distinct.
- [x] 2.3 Regenerate the versioned snapshot and document its mode coverage and refresh procedure; verify expected category counts and that bus, cable-car, and other data are represented when present in the source.

## 3. Filter the map by selected modes

- [x] 3.1 Add independently selectable mode controls with Metro, RER, Transilien, and tram selected by default and cable car, bus, and Other unselected; verify the default state and empty-selection behavior.
- [x] 3.2 Apply selected modes consistently to unique Voronoi station sites, route lines, and station markers; verify a shared station appears once and only selected-mode information is shown.
- [x] 3.3 Preserve the global Voronoi, Lines, and Stations visibility controls independently from mode selection; verify hiding one visual layer does not alter other layers or the selected modes.

## 4. Make search results reliable

- [x] 4.1 Prevent superseded geocoding responses from replacing current results and prevent pending responses from reopening a cleared search; verify with out-of-order and clear-while-pending Jest tests.
- [x] 4.2 Remove per-keystroke address geocoding, geocode only on submit with a normalized-query cache and request cancellation; verify with Jest that typing sends no request, a repeated query hits the cache, and a superseded request is aborted.
- [x] 4.3 Show explicit no-results and address-geocoding-unavailable states while retaining local station matches; verify each state with mocked successful, empty, and failed geocoding responses.

## 5. Verify integrated behavior

- [x] 5.1 Run the full Jest suite and production build; verify default rail-only rendering, mode changes across all map layers, independent visibility toggles, and search recovery after an older request completes.