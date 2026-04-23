# Chart Surface Reset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the chart screen into a product-oriented trading surface with lighter chrome and faster perceived updates.

**Architecture:** Keep the current Vite React app, Liveline integration, and Pyth proxy path. Replace the hero shell and right-rail cards with a compact top bar and a single chart-first module that carries only operational metadata.

**Tech Stack:** React 19, Vite, Tailwind CSS, shadcn UI primitives, Liveline, Pyth History API via Vite proxy

---

### Task 1: Simplify the app shell

**Files:**
- Modify: `app/src/App.tsx`

**Step 1: Remove the hero framing**

Replace the large decorative header with a compact top navigation bar.

**Step 2: Keep product actions only**

Retain product name and wallet action. Remove nonessential “hero” copy and secondary CTA framing.

### Task 2: Rebuild the chart surface

**Files:**
- Modify: `app/src/components/market-chart.tsx`

**Step 1: Remove heavy side panels**

Delete the right-side “Market pulse” stack and supporting explanatory cards.

**Step 2: Compress metadata**

Move price, change, timeframe, and sync state into slim strips above and below the chart.

**Step 3: Calm the surrounding chrome**

Reduce nested borders, padding, and decorative gradients so the chart remains the visual focus.

### Task 3: Improve perceived chart responsiveness

**Files:**
- Modify: `app/src/hooks/use-pyth-chart.ts`

**Step 1: Tighten refresh cadence**

Lower the polling interval so the chart updates feel less delayed.

**Step 2: Keep status subtle**

Expose sync timing in the lightweight chart metadata instead of separate status cards.

### Task 4: Verify visually

**Files:**
- No new source files required

**Step 1: Build**

Run the direct Vite build path.

**Step 2: Preview**

Run Vite preview with the proxy enabled.

**Step 3: Browser check**

Open the built page with headless Playwright and confirm:

- no console errors
- no page errors
- candlestick chart is visible
- surrounding UI is materially lighter
