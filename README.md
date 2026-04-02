# qa-priorities

Chrome extension MVP for QA to-do priorities.

## Features

- Import a priorities Excel file (`.xlsx`).
- Display rows as a to-do table with:
  - Completed checkbox
  - Cut time (friendly format like `3pm` / `3:01pm`)
  - UPC (from `Gtin`)
  - Quantity
  - Current location
  - Delete (`×`) action
- Filters source rows to tracked container tags:
  - `QA_HOLD_PICKING`
  - `QA_HOLD_PUTAWAY`
  - `QA_HOLD_REPLENISHMENT`
  - `QA_HOLD_REWAREHOUSING`
- Also supports optional `Always priority locations` in the XLSX (legacy `Priority locations` still works). Any row whose `Current Location` matches a listed priority location is included even when the container tag is not one of the tracked QA hold tags.
- Priority-location matching is name-based (contains match, case-insensitive). Default priority name is `PUT`.
- You can edit always-priority names from Settings → **Always priority locations**.
- Uses text-friendly repo assets for now (no PNG icons committed) to keep PR diffs reviewable in chat/PR tooling.
- Default sort order:
  1. `Earliest Cut-time`
  2. `Current Location` using the same mixed alpha-numeric sorting approach used in `qa-locations`.

## Build zip

```bash
./build-zip.sh
```

Creates `dist/qa-priorities-mvp.zip`.
