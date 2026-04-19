# Brand — Trade Arena

_Status: active_

This project uses a shadcn-compatible token system centered on a bright editorial light mode and a high-contrast dark mode.

## Palette

- Background: `#f7f9f3`
- Foreground: `#000000`
- Primary: `#4f46e5`
- Secondary: `#14b8a6`
- Accent: `#f59e0b`
- Destructive: `#ef4444`
- Border: `#000000`

## Typography

- Sans: `DM Sans`
- Serif: `DM Sans`
- Mono: `Space Mono`

## Surface Language

- Rounded geometry with `1rem` base radius
- Crisp borders with minimal shadow separation
- Token-first theming so shadcn components can be re-skinned later without rewriting layouts

## Notes

- The current palette is intentionally provisional.
- Future design exploration should preserve the token names and replace values rather than hardcoding new colors into components.
- Shadcn components should always consume semantic tokens such as `bg-card`, `text-muted-foreground`, and `border-border`.
