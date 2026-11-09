# Paris Mosaïque

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.17.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with [Jest](https://jestjs.io) (via `jest-preset-angular`), use the following command:

```bash
npm test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Transport data (IDF stations & lines)

Public-transport station and line data for Île-de-France is pre-fetched from the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) and stored locally in versioned files so the app never calls Overpass at runtime:

| File | Contents | How to update |
|---|---|---|
| `src/app/pages/map/idf-datapoints.ts` | Rail modes only (metro, RER, Transilien, tram): 888 stations, 151 route polylines. Shipped with the map. Auto-generated. | `npm run update-datapoints` |
| `src/app/pages/map/idf-datapoints-extra.ts` | Cable car, bus and other modes: 10,779 extra sites, non-rail lines attached to rail stations, 2,724 route polylines. Meant to be loaded on demand. Auto-generated. | `npm run update-datapoints` |
| `src/app/pages/map/idf-line-config.ts` | Official RATP/SNCF line colours & stroke weights (manual) | Edit directly |

Every line is stored as `{ ref, mode }`: a ref such as `4` or `A` is not unique across modes (Metro 4 and bus 4 are different lines). The mode comes from the OSM route type plus network/operator tags (see `scripts/transport-modes.js`), never from the ref. Modes are `metro`, `rer`, `transilien`, `tram`, `cable_car`, `bus` and `other` (long-distance trains, airport shuttles, ferries, funiculars, coaches).

A non-rail stop joins an existing rail station when it is within 40 m, or within 200 m with a matching name; otherwise it becomes its own site. Rail station indexes in `IDF_EXTRA_STATION_LINES` refer to `IDF_STATIONS`, so regenerate both files together.

### Refreshing station & route geometry

Run the fetch script whenever OSM data changes significantly (new lines, station moves, etc.):

```bash
npm run update-datapoints
```

The script queries Overpass for the full IDF bounding box (trying `overpass-api.de`, then `overpass.kumi.systems` and `overpass.private.coffee` on failure; set `OVERPASS_URL` to force one), builds the snapshot in `scripts/idf-pipeline.js`, and overwrites both data files. Commit the result to keep the versioned snapshot up to date. The script prints route counts per mode; compare them with the previous run to spot tagging regressions.

> **Note:** The script sets `NODE_TLS_REJECT_UNAUTHORIZED=0` internally to work behind corporate TLS-inspection proxies. This only affects the one-off data-fetch script, not the application itself.

### Updating line colours or stroke weights

Open `src/app/pages/map/idf-line-config.ts` and edit the `LINE_CONFIG` record directly — no script needed. Each entry looks like:

```typescript
'4': { color: '#CF009E', textColor: '#FFFFFF', weight: 4 },
```

- **`color`** — CSS hex used for the polyline and marker accent
- **`textColor`** — contrasting colour for labels drawn on top
- **`weight`** — Leaflet polyline stroke width in pixels (metro/RER: 4, tram/Transilien: 3)

Lines not present in `LINE_CONFIG` fall back to `DEFAULT_LINE_COLOR` (`#888888`).

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
