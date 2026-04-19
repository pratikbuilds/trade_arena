# Trade Arena App UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-ready Vite React frontend in `app/` with TypeScript, TanStack Router, TanStack Query, Tailwind, and an initial routed shell for UI exploration and later program integration.

**Architecture:** The frontend lives as an isolated package under `app/` so it can evolve independently from the Anchor root package. Route components consume data through a small query-backed client layer, starting with placeholder state and leaving clean seams for wallet and Solana program reads.

**Tech Stack:** Vite, React 19, TypeScript, `@tanstack/react-router`, `@tanstack/react-query`, Tailwind CSS, ESLint, PostCSS, `clsx`, `tailwind-merge`

---

### Task 1: Scaffold the frontend package

**Files:**
- Create: `app/package.json`
- Create: `app/index.html`
- Create: `app/vite.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/tsconfig.app.json`
- Create: `app/tsconfig.node.json`
- Create: `app/.gitignore`

**Step 1: Create the frontend package manifest**

Write `app/package.json` with scripts for:

- `dev`
- `build`
- `preview`
- `typecheck`
- `lint`

Include runtime dependencies for React, TanStack Router, TanStack Query, and styling helpers. Include dev dependencies for Vite, TypeScript, Tailwind, PostCSS, and ESLint.

**Step 2: Create Vite and TypeScript config**

Write `app/vite.config.ts`, `app/tsconfig.json`, `app/tsconfig.app.json`, and `app/tsconfig.node.json` with strict TypeScript, alias support for `@/`, and a standard React Vite build setup.

**Step 3: Create the Vite HTML entry**

Write `app/index.html` with the `root` mount node and metadata suitable for the application shell.

**Step 4: Add package-local ignore rules**

Write `app/.gitignore` for local app build artifacts if any package-local files need to be ignored.

**Step 5: Verify install surface**

Run: `yarn --cwd app install`
Expected: dependencies install successfully and `yarn.lock` updates only as needed.

**Step 6: Commit**

```bash
git add app/package.json app/index.html app/vite.config.ts app/tsconfig.json app/tsconfig.app.json app/tsconfig.node.json app/.gitignore yarn.lock
git commit -m "feat: scaffold app frontend package"
```

### Task 2: Add styling and app bootstrap

**Files:**
- Create: `app/src/main.tsx`
- Create: `app/src/styles.css`
- Create: `app/postcss.config.js`
- Create: `app/tailwind.config.ts`
- Create: `app/src/lib/utils.ts`

**Step 1: Create the React entrypoint**

Write `app/src/main.tsx` to mount the app, initialize the router provider, initialize the query client provider, and import the global stylesheet.

**Step 2: Create the global stylesheet**

Write `app/src/styles.css` with Tailwind directives, base tokens, and a non-generic visual baseline suitable for a product shell.

**Step 3: Create Tailwind and PostCSS config**

Write `app/postcss.config.js` and `app/tailwind.config.ts` with content globs for the app source tree and theme tokens that can support a stronger visual direction later.

**Step 4: Add utility helpers**

Write `app/src/lib/utils.ts` with a `cn` helper using `clsx` and `tailwind-merge`.

**Step 5: Verify typecheck**

Run: `yarn --cwd app typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add app/src/main.tsx app/src/styles.css app/postcss.config.js app/tailwind.config.ts app/src/lib/utils.ts
git commit -m "feat: add app bootstrap and styling foundation"
```

### Task 3: Add TanStack Router structure

**Files:**
- Create: `app/src/router.tsx`
- Create: `app/src/routes/__root.tsx`
- Create: `app/src/routes/index.tsx`
- Create: `app/src/routes/games.tsx`
- Create: `app/src/routes/games.$gameId.tsx`
- Create: `app/src/routes/integrations.tsx`

**Step 1: Create the router definition**

Write `app/src/router.tsx` to compose the route tree and export the configured router.

**Step 2: Create the root route**

Write `app/src/routes/__root.tsx` with the persistent app shell, navigation, and outlet.

**Step 3: Create the exploration routes**

Write route files for:

- dashboard home
- games exploration
- game detail exploration
- integrations placeholder

Each route should render real interface structure, not empty stubs.

**Step 4: Verify routing build**

Run: `yarn --cwd app build`
Expected: PASS with generated production assets in `app/dist`

**Step 5: Commit**

```bash
git add app/src/router.tsx app/src/routes/__root.tsx app/src/routes/index.tsx app/src/routes/games.tsx app/src/routes/games.\$gameId.tsx app/src/routes/integrations.tsx
git commit -m "feat: add initial routed app shell"
```

### Task 4: Add query-backed placeholder domain data

**Files:**
- Create: `app/src/lib/query-client.ts`
- Create: `app/src/features/games/api.ts`
- Create: `app/src/features/games/types.ts`
- Create: `app/src/features/games/mock-data.ts`

**Step 1: Create the shared query client**

Write `app/src/lib/query-client.ts` with sensible React Query defaults for UI exploration.

**Step 2: Create feature types**

Write `app/src/features/games/types.ts` for the initial game summary and detail models.

**Step 3: Add mock-backed feature API**

Write `app/src/features/games/mock-data.ts` and `app/src/features/games/api.ts` so routes can call stable async functions that emulate future program reads.

**Step 4: Connect routes to queries**

Update route files to load data through React Query hooks instead of inline constants.

**Step 5: Verify app behavior**

Run: `yarn --cwd app build`
Expected: PASS

Run: `yarn --cwd app typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add app/src/lib/query-client.ts app/src/features/games/api.ts app/src/features/games/types.ts app/src/features/games/mock-data.ts app/src/routes/__root.tsx app/src/routes/index.tsx app/src/routes/games.tsx app/src/routes/games.\$gameId.tsx
git commit -m "feat: add query-backed placeholder game data"
```

### Task 5: Add frontend quality tooling

**Files:**
- Create: `app/eslint.config.js`
- Modify: `app/package.json`
- Optionally create: `app/.prettierrc` if needed for package-local clarity

**Step 1: Add lint configuration**

Write `app/eslint.config.js` for TypeScript and React code with rules that catch real mistakes without fighting the early scaffold.

**Step 2: Wire lint scripts**

Update `app/package.json` so `lint` runs ESLint across the package source tree.

**Step 3: Verify tooling**

Run: `yarn --cwd app lint`
Expected: PASS

Run: `yarn --cwd app typecheck`
Expected: PASS

Run: `yarn --cwd app build`
Expected: PASS

**Step 4: Commit**

```bash
git add app/eslint.config.js app/package.json
git commit -m "feat: add frontend linting and quality tooling"
```

### Task 6: Document integration seams

**Files:**
- Create: `app/README.md`

**Step 1: Write integration guidance**

Document:

- app purpose
- dev commands
- route structure
- where future wallet integration should live
- where future Solana read clients should live

**Step 2: Verify docs accuracy**

Run: `yarn --cwd app typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add app/README.md
git commit -m "docs: add app integration guide"
```

### Task 7: Final verification

**Files:**
- No new files required

**Step 1: Run final checks**

Run: `yarn --cwd app lint`
Expected: PASS

Run: `yarn --cwd app typecheck`
Expected: PASS

Run: `yarn --cwd app build`
Expected: PASS

**Step 2: Inspect git status**

Run: `git status --short`
Expected: only intended frontend files are modified or staged

**Step 3: Final commit**

```bash
git add app docs/plans
git commit -m "feat: add initial Trade Arena app shell"
```
