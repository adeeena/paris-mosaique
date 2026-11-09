# Design

## Context

See proposal.md for motivation and specs/idf-transport-map/spec.md for user-visible requirements. The current snapshot stores station line references and route references, but not transport modes. The station list is fetched from OpenStreetMap/Overpass and the Voronoi diagram is computed from all station coordinates. The current search combines local station matches with asynchronous Nominatim results.

## Goals / Non-Goals

**Goals:**
- Preserve the versioned, offline transport snapshot and avoid adding runtime Overpass requests.
- Give station and route records enough explicit mode metadata to filter independently of line reference strings.
- Keep mode selection as the shared filter for Voronoi sites and displayed transport data; keep existing global visibility controls independent.
- Keep the initial mode selection rail-focused: Metro, RER, Transilien, and tram selected; cable car, bus, and other modes unselected.
- Make search state belong to the latest query, including when a query is cleared or geocoding fails.

**Non-Goals:**
- Journey planning, travel-time calculations, live arrivals, or service alerts.
- Replacing OpenStreetMap/Overpass as the snapshot source or adding a runtime transit-data backend.
- Requiring exact track, road, or waterway geometry as part of this change.

## Decisions

### Persist normalized transport modes in the snapshot

The data generator will retain a normalized mode for each route and its serving station records. Mode classification must use route tags and available network/operator metadata, not just `ref`: numeric bus references can collide with Metro references, and train routes need to distinguish RER from Transilien. Keep the route reference as a separate identifier. Provide named categories for Metro, RER, Transilien, tram, cable car, and bus, plus an Other category for fetched route types not mapped to those names.

Alternative considered: infer mode in the browser from the line reference. This fails for overlapping references and cannot classify bus, cable car, or unknown route types reliably.

### Split the snapshot into an eager rail file and a lazy extras file

Bus data multiplies the site count about twelvefold (about 11,000 extra sites and 2,700 extra routes, roughly 2.3 MB of source versus 150 KB for rail). The rail modes stay in the eagerly loaded snapshot; cable car, bus, and other modes go in a separate file that the app loads only when one of those modes is first selected. A non-rail stop within 40 m of a rail station (or within 200 m with a matching name) is attached to that station instead of becoming a new site, which keeps interchanges to one geographic site.

Alternative considered: one combined snapshot. It would make the default rail-only view pay the parse and memory cost of bus data it never shows.

### Filter a deduplicated station set, then rebuild the Voronoi

When modes change, include a physical station once if it serves at least one selected mode. A multimode interchange is not duplicated as one Voronoi site per line or mode. Filter that station's displayed lines and route geometry to the selected modes, then rebuild the Voronoi cells from the resulting unique coordinates.

Alternative considered: compute a separate Voronoi site for every station-mode pair. Coincident sites at interchanges do not have a useful distinct geographic meaning and can produce unstable or redundant cells.

### Keep mode filtering separate from global visibility

Mode controls determine which transport entities participate in the map. The existing Voronoi, Lines, and Stations controls remain global visibility switches. This avoids changing the selected dataset when a user only wants to hide a visual layer.

### Retain snapshots and use request identity for search

Refresh transport records through the existing data-generation script. In the search flow, associate asynchronous responses with the query that initiated them (or cancel superseded work) and prevent a cleared query from accepting later responses. Keep local station search available when external geocoding is unavailable, and expose explicit empty/error states.

### Geocode only on explicit submission

Nominatim's usage policy discourages autocomplete-style requests, so per-keystroke geocoding is removed. Local station matching stays synchronous. Address geocoding runs on Enter or an explicit address action, uses an in-memory cache keyed by normalized query, and cancels the superseded request. This also removes most of the stale-response surface.

Alternative considered: keep debounced autocomplete with a throttle. It improves feel but still conflicts with the policy.

### Upgrade Angular and test runner as a separate maintenance track

Upgrade Angular framework, CLI, SSR, and build packages together to the latest stable compatible release at implementation time, following major-version migration guidance. Replace Karma with a Jest integration compatible with that Angular release, then replace the stale starter assertion with tests for actual map and search behavior.

Alternative considered: change the map and upgrade dependencies in one undifferentiated step. Separating the maintenance tasks makes regressions easier to localize while keeping them in this approved change.

## Risks / Trade-offs

- [OSM route tags and classifications may be incomplete or inconsistent] → Preserve an Other category, keep source metadata available in the generated snapshot, and validate counts per mode before release.
- [Adding bus stops may greatly increase Voronoi complexity and visually dominate rail stations] → Keep bus off by default and measure rebuild/render performance with the expanded snapshot.
- [The current route generator ignores route-way geometry and connects stop coordinates] → Treat resulting lines as approximate context; exact network geometry remains a follow-up if it is necessary for the map's purpose.
- [An Angular major-version upgrade can introduce unrelated build or SSR changes] → Upgrade through supported major migration steps and keep the Jest migration independently testable.
- [Nominatim remains an external dependency for address search] → Preserve local station results and clearly report when address geocoding is unavailable.

## Migration Plan

1. Add mode metadata and category mapping to the data generator, then regenerate and inspect the transport snapshot.
2. Implement mode controls and use their selection for Voronoi sites, routes, and markers; verify that global visibility controls still work independently.
3. Make search responses query-scoped and add explicit empty and geocoding-error states.
4. Upgrade Angular and move the test setup from Karma to Jest, adding behavior tests for mode filtering and search.
5. Validate default rail-only behavior and each selectable mode against the generated snapshot.

Rollback can restore the prior snapshot, map components, and Angular/test configuration together; no server-side data migration is required.

## Open Questions

- Confirm the exact OpenStreetMap route tags and network/operator metadata that identify cable car, water transport (for example Batobus), and future Other categories in Île-de-France. This can be resolved while implementing the generator without changing the user-facing mode-selection model.