# Trade Arena App

Frontend workspace for the Trade Arena UI shell.

## Commands

- `yarn dev`
- `yarn build`
- `yarn preview`
- `yarn lint`
- `yarn typecheck`

## Structure

- `src/router.tsx`: TanStack Router route tree
- `src/routes`: page-level route components
- `src/features/games`: placeholder domain data and async API surface
- `src/components/ui`: shadcn-generated primitives
- `src/lib`: shared utilities and query client setup

## Integration Direction

- Wallet state should live behind a dedicated integration boundary rather than being threaded through every route directly.
- Program reads should replace the mock game API in `src/features/games/api.ts`.
- Route components should keep consuming shaped view models instead of raw Anchor account data.

## Theme

The app uses token-driven shadcn-compatible theming from `src/index.css`, backed by the project-level `brand.md`.
