# Trade Arena App UI Design

## Goal

Establish a production-ready frontend workspace in `app/` for exploring and iterating on the first user interface for Trade Arena while preserving fast local development and a clean path to Solana program integration.

## Context

The repository is currently an Anchor workspace with tests and on-chain program code but no frontend package. The `app/` directory exists and is empty. The frontend should support design exploration now, then evolve into the main product UI for reading from and interacting with the program.

## Decision

Use a standard Vite React single-page application in `app/` with TypeScript and TanStack tooling instead of TanStack Start.

## Why This Approach

- Vite matches the requested frontend runtime and keeps local iteration fast.
- A client-heavy UI is the correct first fit for wallet-connected Solana interactions.
- `@tanstack/react-router` provides typed routing without introducing server runtime constraints.
- `@tanstack/react-query` gives a stable data-fetching and caching layer that can start with mocked state and later back onto program reads.
- This keeps the initial architecture production-ready without adding SSR or full-stack complexity before it is needed.

## Alternatives Considered

### 1. Vite + React Router + TanStack Query

This is viable and slightly simpler, but it gives up route typing and a more cohesive TanStack app structure. It is acceptable for prototypes, but weaker for a frontend expected to grow into a serious product surface.

### 2. TanStack Start

This would be appropriate if the product already required server rendering or a TanStack full-stack runtime. That need is not established yet, and it would add unnecessary framework weight to an early integration phase.

## Frontend Architecture

The frontend will be an isolated package under `app/` with its own package metadata, TypeScript config, Vite config, linting, and styling setup. It should not mutate the existing Anchor test setup at the repo root beyond any minimal convenience wiring that is clearly scoped.

The app should include:

- React 19
- Vite
- TypeScript
- `@tanstack/react-router`
- `@tanstack/react-query`
- Tailwind CSS
- Small utility packages such as `clsx` and `tailwind-merge`

## Initial Information Architecture

The initial scaffold should include a shell layout and a route structure that supports design exploration immediately:

- Landing or dashboard route
- Games list exploration route
- Game detail exploration route
- Integration surface for wallet or program connectivity placeholders

The first version does not need to execute transactions. It should prioritize structure, navigation, state boundaries, and a visual foundation suitable for later integration work.

## Data Flow

Program and API access should sit behind a small client-facing abstraction layer rather than being called directly from route components. Early UI routes can use mock or placeholder query data through React Query so components and navigation stabilize before program reads are wired in.

This creates a clean migration path:

1. Static UI shell
2. Mocked query-backed exploration
3. Read-only program integration
4. Transactional flows

## Production Baseline

The scaffold should be production-ready in foundation, not just demo-ready:

- Strict TypeScript settings
- Path aliases
- Environment variable handling
- ESLint and formatting compatibility
- Build, dev, preview, and typecheck scripts
- Clear separation between routes, shared UI primitives, and data clients

## Testing Direction

The first scaffold only needs lightweight validation:

- Typecheck must pass
- Production build must pass
- Lint should be configured and runnable

As program integration arrives, route-level and data-layer tests can be added incrementally.

## Risks And Constraints

- Wallet integration can distort early UI architecture if introduced too soon.
- Mixing frontend tooling into the root package would create unnecessary coupling with Anchor test tooling.
- Overbuilding SSR or backend concerns now would slow down UI iteration without immediate product value.

## Next Step

Create a detailed implementation plan that scaffolds the app package, establishes tooling, adds a routed shell, and leaves clean extension points for wallet and program integration.
