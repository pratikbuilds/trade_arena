# Trade Arena Chart Surface Reset Design

## Goal

Refocus the app around the candlestick chart so it reads as a product surface, not a presentation shell.

## Decision

Use a terminal-light product layout:

- compact top bar
- one dominant chart surface
- minimal operational metadata
- no explanatory sidecards

## Why

The previous layout made the chart visually interesting but surrounded it with too much boxed context. That created two problems:

1. The UI felt heavier than requested.
2. The chart felt slower because the surrounding chrome competed for attention.

## Layout

- Remove the hero-style header treatment and decorative background.
- Replace it with a slim product bar that only contains product identity and wallet action.
- Let the chart occupy the main surface width.
- Move chart metadata into a thin strip above and below the chart instead of separate cards.

## Chart Surface

- Keep Liveline as the primary visual stage.
- Reduce nested borders and stacked panels around it.
- Preserve space for future agent trade overlays, markers, and execution annotations.
- Make the chart frame calmer than the chart itself so price movement remains the strongest visual event.

## Data Feel

- Keep Pyth history via the local proxy.
- Reduce refresh cadence so the surface feels less delayed.
- Show sync state quietly in metadata instead of verbose copy blocks.

## Product Tone

- State facts only.
- Remove narrative or marketing-like copy.
- Present the chart as infrastructure for later agent trading features.
