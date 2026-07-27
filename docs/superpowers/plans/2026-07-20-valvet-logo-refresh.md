# Valvet Logo Refresh Implementation Plan

**Status 2026-07-27:** Implementerad. Dokumentet bevaras som
genomförandehistorik; den nuvarande logotypen i `login.html` och `vault.html`
är källan till sanningen.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Valvet symbol with a stricter vault-door icon around a horizontal key, without changing the `Valvet` wordmark or the broader visual identity.

**Architecture:** Keep the change as a pure markup refresh. Replace the inline SVG instances that currently render the Valvet symbol in `login.html` and `vault.html`, preserving existing containers, classes, sizes, and colors so no CSS or JavaScript changes are needed.

**Tech Stack:** Static HTML, inline SVG, Vite

## Global Constraints

- Keep the text `Valvet` unchanged everywhere.
- Keep the existing gold color treatment unchanged: `#D9B876` for the main brand mark and `#A97C3E` for the guide-context variant.
- Implement the new symbol as inline SVG in the same usage pattern as the current logo.
- The new mark must read as a vault door in front view with a small geometric horizontal key at the center.
- Do not change layout, typography, spacing, JavaScript, or page copy as part of this work.

---

## File Structure

- Modify: `C:\Users\petwen\OneDrive - Höglandsförbundet\Projekt\valvet_promptbanken\login.html`
  - Responsibility: public login/signup page wordmark in the left hero area.
- Modify: `C:\Users\petwen\OneDrive - Höglandsförbundet\Projekt\valvet_promptbanken\vault.html`
  - Responsibility: authenticated app header wordmark and MCP guide block that reuse the Valvet mark.
- No other files should change.

### Task 1: Replace the login-page brand symbol

**Files:**
- Modify: `login.html`

**Interfaces:**
- Consumes: existing `.wordmark` and `.vault-mark` styling in `style.css`
- Produces: updated inline SVG symbol in the login page brand lockup, still sized by `.vault-mark`

- [ ] **Step 1: Replace the current login wordmark SVG with the new vault-door symbol**

In `login.html`, replace the existing SVG inside the first `.vault-mark` block with:

```html
<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="5" width="22" height="22" rx="4.5" stroke="#D9B876" stroke-width="1.6" />
  <rect x="8.5" y="8.5" width="15" height="15" rx="2.5" stroke="#D9B876" stroke-width="1.2" />
  <circle cx="10.6" cy="12" r="0.9" fill="#D9B876" />
  <circle cx="21.4" cy="12" r="0.9" fill="#D9B876" />
  <circle cx="10.6" cy="20" r="0.9" fill="#D9B876" />
  <circle cx="21.4" cy="20" r="0.9" fill="#D9B876" />
  <circle cx="13.4" cy="16" r="2.2" stroke="#D9B876" stroke-width="1.4" />
  <path d="M15.6 16H20.4" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
  <path d="M18.7 16V14.5" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
  <path d="M20.4 16V15.1" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
</svg>
```

Expected resulting block:

```html
<a class="wordmark" href="/login.html">
  <span class="vault-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="22" height="22" rx="4.5" stroke="#D9B876" stroke-width="1.6" />
      <rect x="8.5" y="8.5" width="15" height="15" rx="2.5" stroke="#D9B876" stroke-width="1.2" />
      <circle cx="10.6" cy="12" r="0.9" fill="#D9B876" />
      <circle cx="21.4" cy="12" r="0.9" fill="#D9B876" />
      <circle cx="10.6" cy="20" r="0.9" fill="#D9B876" />
      <circle cx="21.4" cy="20" r="0.9" fill="#D9B876" />
      <circle cx="13.4" cy="16" r="2.2" stroke="#D9B876" stroke-width="1.4" />
      <path d="M15.6 16H20.4" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
      <path d="M18.7 16V14.5" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
      <path d="M20.4 16V15.1" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
    </svg>
  </span>
  Valvet
</a>
```

- [ ] **Step 2: Run a focused production build check**

Run:

```bash
npm run build
```

Expected: Vite completes successfully and reports a built `dist/` output with no HTML parsing errors.

- [ ] **Step 3: Commit the login-page symbol refresh**

```bash
git add login.html
git commit -m "feat: refresh Valvet logo on login page"
```

### Task 2: Replace the app and guide symbol reuse in `vault.html`

**Files:**
- Modify: `vault.html`

**Interfaces:**
- Consumes: existing `.vault-mark` sizing rules and existing app header / guide markup
- Produces: the same new symbol reused in both the app header and the guide card, with the existing color split preserved

- [ ] **Step 1: Replace the header wordmark SVG in `vault.html`**

Replace the current SVG inside the first `.vault-mark` in `vault.html` with:

```html
<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="5" width="22" height="22" rx="4.5" stroke="#D9B876" stroke-width="1.6" />
  <rect x="8.5" y="8.5" width="15" height="15" rx="2.5" stroke="#D9B876" stroke-width="1.2" />
  <circle cx="10.6" cy="12" r="0.9" fill="#D9B876" />
  <circle cx="21.4" cy="12" r="0.9" fill="#D9B876" />
  <circle cx="10.6" cy="20" r="0.9" fill="#D9B876" />
  <circle cx="21.4" cy="20" r="0.9" fill="#D9B876" />
  <circle cx="13.4" cy="16" r="2.2" stroke="#D9B876" stroke-width="1.4" />
  <path d="M15.6 16H20.4" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
  <path d="M18.7 16V14.5" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
  <path d="M20.4 16V15.1" stroke="#D9B876" stroke-width="1.4" stroke-linecap="round" />
</svg>
```

- [ ] **Step 2: Replace the guide-card `.vault-mark` SVG with the brown variant of the same symbol**

Replace the current SVG inside the `.guide-intro .vault-mark` block in `vault.html` with:

```html
<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="5" width="22" height="22" rx="4.5" stroke="#A97C3E" stroke-width="1.6" />
  <rect x="8.5" y="8.5" width="15" height="15" rx="2.5" stroke="#A97C3E" stroke-width="1.2" />
  <circle cx="10.6" cy="12" r="0.9" fill="#A97C3E" />
  <circle cx="21.4" cy="12" r="0.9" fill="#A97C3E" />
  <circle cx="10.6" cy="20" r="0.9" fill="#A97C3E" />
  <circle cx="21.4" cy="20" r="0.9" fill="#A97C3E" />
  <circle cx="13.4" cy="16" r="2.2" stroke="#A97C3E" stroke-width="1.4" />
  <path d="M15.6 16H20.4" stroke="#A97C3E" stroke-width="1.4" stroke-linecap="round" />
  <path d="M18.7 16V14.5" stroke="#A97C3E" stroke-width="1.4" stroke-linecap="round" />
  <path d="M20.4 16V15.1" stroke="#A97C3E" stroke-width="1.4" stroke-linecap="round" />
</svg>
```

- [ ] **Step 3: Run the build again after the second HTML file changes**

Run:

```bash
npm run build
```

Expected: PASS. Vite emits a production build without syntax errors or malformed HTML output.

- [ ] **Step 4: Commit the app-side symbol refresh**

```bash
git add vault.html
git commit -m "feat: refresh Valvet logo in app surfaces"
```

### Task 3: Manual visual verification

**Files:**
- Modify: none
- Verify: `login.html`, `vault.html`, built output from Vite dev server

**Interfaces:**
- Consumes: Tasks 1-2 completed and committed, existing `web:dev` script from `package.json`
- Produces: human-verified confirmation that the new symbol reads as a vault door and works at both large and small sizes

- [ ] **Step 1: Start the local dev server**

Run:

```bash
npm run web:dev
```

Expected: Vite starts and prints a local URL such as `http://localhost:5173/` or similar.

- [ ] **Step 2: Verify the login-page wordmark**

Open the local `login.html` page in a browser and verify all of the following:

- The `Valvet` wordmark text is unchanged.
- The new icon reads as a vault door, not a medaljon or gender symbol.
- The key reads as horizontal and geometric.
- The icon remains centered and crisp within the existing `.vault-mark` size.
- No spacing or baseline alignment shifted next to the `Valvet` wordmark.

- [ ] **Step 3: Verify the app header and guide reuse**

Open the local `vault.html` page and verify all of the following:

- The header icon matches the login-page symbol in form and proportions.
- The guide-card icon uses the same shape with the darker `#A97C3E` color.
- The icon remains legible at the smaller header size.
- No CSS changes are required for either placement.

- [ ] **Step 4: If any of the checks above fail, adjust only the SVG geometry and re-run verification**

Allowed adjustment scope:

- move the outer frame by at most `0.5` units
- adjust the inner frame `rx`
- shorten or lengthen the key shaft by at most `1.0` unit
- move the four bolt circles by at most `0.6` units

Do not change:

- any text
- any CSS
- any color values
- any page layout

- [ ] **Step 5: Commit the verified final state**

```bash
git add login.html vault.html
git commit -m "fix: finalize refreshed Valvet logo geometry"
```
