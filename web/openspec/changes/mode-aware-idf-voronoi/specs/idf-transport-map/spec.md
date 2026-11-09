# Spec Delta

## Purpose

Shows Île-de-France public-transport coverage as a Voronoi map whose included stations and visible route data can be selected by transport mode. It also provides reliable station and address search within that map.

## ADDED Requirements

### Requirement: Select transport modes for the map
The system SHALL let users independently select supported transport modes that determine which transport data is included in the map, defaulting to rail modes only.

#### Scenario: Initial rail-only selection
- **WHEN** a user opens the map with its default settings
- **THEN** Metro, RER, Transilien, and tram are selected, while cable car, bus, and other modes are not selected

#### Scenario: User changes selected modes
- **WHEN** a user selects or deselects a supported transport mode
- **THEN** the map updates to reflect the new mode selection

### Requirement: Apply selected modes consistently
The system SHALL use the selected transport modes for Voronoi sites, route lines, and station markers while preserving the existing global visibility controls for those visual layers.

#### Scenario: A station serves multiple selected modes
- **WHEN** a station serves more than one selected mode
- **THEN** it contributes one geographic site to the Voronoi map and its visible station and route information reflects only selected modes

#### Scenario: No modes are selected
- **WHEN** a user deselects every transport mode
- **THEN** no transport stations, route lines, or Voronoi cells are shown, and the base map remains available

#### Scenario: Global visibility is disabled
- **WHEN** a user hides a global visual layer while transport modes remain selected
- **THEN** that visual layer is hidden without changing the selected modes or the content of other visible layers

### Requirement: Keep search results aligned with the current query
The system SHALL display and select search results only when they correspond to the current search query.

#### Scenario: An older geocoding request completes late
- **WHEN** a result request for an earlier query completes after the user has entered a newer query
- **THEN** the earlier response does not replace or become selectable among the newer query's results

#### Scenario: The user clears search while a request is pending
- **WHEN** the user clears the search field before a result request completes
- **THEN** the search results remain cleared and the pending response does not reopen the results list

### Requirement: Limit external geocoding requests
The system SHALL show local station matches while the user types and SHALL request address geocoding only when the user explicitly submits a query or chooses to search addresses.

#### Scenario: Typing a query
- **WHEN** the user types in the search field without submitting
- **THEN** local station matches update and no address geocoding request is sent

#### Scenario: Repeating a query
- **WHEN** the user submits a query whose address results were already retrieved in the current session
- **THEN** the results are shown without a new geocoding request

#### Scenario: Submitting a new query while one is pending
- **WHEN** the user submits a new query before the previous geocoding request completes
- **THEN** the previous request is cancelled

### Requirement: Communicate search outcomes
The system SHALL distinguish successful matches, no matches, and unavailable address geocoding in the search interface.

#### Scenario: Search has no matches
- **WHEN** station search and address geocoding return no matches for the current query
- **THEN** the interface communicates that no results were found

#### Scenario: Address geocoding is unavailable
- **WHEN** the address geocoding request fails and there are no local station matches
- **THEN** the interface communicates that address search is temporarily unavailable