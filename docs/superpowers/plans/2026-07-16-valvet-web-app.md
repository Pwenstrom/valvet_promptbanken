# Valvet — Webbapp (Plan C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg webbappen för Valvet från grunden i detta tomma repo: logga in, mina insättningar, ny insättning, sök, redigera, arkiv, MCP-nyckel + installationsguide.

**Architecture:** Statisk Vite-app, samma mönster som `promptbanken`-repot (`@supabase/supabase-js`, vanilla JS-moduler i `src/`, inget UI-ramverk). Två HTML-ingångar: `login.html` (inloggning/signup) och `vault.html` (allt annat — en app-liknande sida med flikbaserad vy-växling, samma konsolideringsmönster som `promptbanken/admin.html` redan använder för sina motsvarande sju logiska vyer). CRUD sker direkt mot Supabase via `@supabase/supabase-js` och RLS — **inte** via MCP-servern (MCP är enbart AI-klienternas ingång, se `docs/superpowers/specs/2026-07-16-valvet-design.md`). Alla databasregler (tak, modul-lås, synlighetslås) sitter redan i triggers från Plan A och gäller lika för webbens direkta inserts som för MCP:s RPC-vägar.

**Tech Stack:** Vite 7, `@supabase/supabase-js`, vanilla JS/HTML/CSS. Inget test-ramverk (matchar `promptbanken`-repots konvention) — verifiering sker manuellt: `npm run build` + click-through i webbläsare.

**Beroende:** Kräver att **Plan A** (`promptbanken`-repot) är applicerad mot **staging** Supabase innan Task 4+ kan testas end-to-end mot riktig data (inloggning/kontoskapande fungerar redan från Task 2, oberoende av Plan A, eftersom auth/`ensure_personal_workspace` redan finns).

## Global Constraints

- Alla nya poster skapas med `module: 'valvet'`, `visibility: 'private'`, `status: 'draft'` — aldrig något annat (triggers från Plan A blockerar avvikelser, men klienten ska inte ens försöka).
- `module` skickas ALDRIG i en UPDATE-payload (triggern `lock_content_item_module` i Plan A avvisar det ändå, men UI:t ska inte bjuda in till det).
- Frontend använder bara `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/publishable), aldrig en service-nyckel.
- Svensk UI-text, samma direkta ton som `promptbanken`-repot.
- Arkivering och radering-liknande handlingar kräver tvåstegsbekräftelse i UI (samma mönster som `admin.html`: klicka en gång → knappen byter text till "Bekräfta..." i några sekunder → klicka igen för att utföra).
- Denna app har **ingen roll-/behörighetsmodell** att ta hänsyn till (till skillnad från `admin.html`) — varje inloggad användare äger och hanterar bara sina egna Valvet-poster i sitt eget personliga workspace. Ingen `canEdit(role)`-liknande kod ska finnas.

---

## Filstruktur

- `package.json`, `vite.config.js`, `.nojekyll`, `CNAME` — projekt-scaffold.
- `.github/workflows/deploy.yml` — GitHub Pages-deploy.
- `src/supabaseClient.js`, `src/auth.js` — portade oförändrade från `promptbanken`-repot.
- `login.html`, `src/login.js` — inloggning/signup, portat och trimmat.
- `vault.html`, `src/vault.js` — huvudappen: Mina insättningar / Ny insättning / Redigera / Sök / Arkiv / MCP-nyckel.
- `style.css` — egen, liten stilmall (medvetet INTE en full kopia av `promptbanken`-repots 1000+ rader `style.css` — se Task 1).

---

### Task 1: Projekt-scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `.nojekyll`
- Create: `CNAME`
- Create: `.gitignore`
- Create: `src/supabaseClient.js`
- Create: `src/auth.js`
- Create: `style.css`
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: `hasSupabaseConfig: boolean`, `supabase: SupabaseClient | null` (från `supabaseClient.js`), `requireSupabaseConfig(el)`, `getCurrentSession()`, `redirectIfAuthenticated(target)`, `requireSession()`, `getRedirectTarget()` (från `auth.js`) — identiska signaturer som `promptbanken`-repots motsvarigheter, så senare tasks kan följa samma mönster rakt av.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "valvet-promptbanken",
  "private": true,
  "type": "module",
  "scripts": {
    "web:dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "2.84.0"
  },
  "devDependencies": {
    "vite": "7.3.5"
  }
}
```

- [ ] **Step 2: `vite.config.js`**

```javascript
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        login: resolve(__dirname, 'login.html'),
        vault: resolve(__dirname, 'vault.html')
      }
    }
  }
});
```

- [ ] **Step 3: `.nojekyll`, `CNAME`, `.gitignore`**

```
```
(tom fil: `.nojekyll`)

```
valvet.promptbanken.se
```
(`CNAME`, ingen radbrytning i slutet)

```
node_modules/
dist/
.env.local
.DS_Store
```
(`.gitignore`)

- [ ] **Step 4: `src/supabaseClient.js`** (identisk med `promptbanken`-repots version)

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
```

- [ ] **Step 5: `src/auth.js`** (portat, redirect-mål bytt till `vault.html`)

```javascript
import { hasSupabaseConfig, supabase } from './supabaseClient.js';

export function requireSupabaseConfig(statusElement) {
  if (hasSupabaseConfig) {
    return true;
  }

  if (statusElement) {
    statusElement.textContent = 'Supabase saknar lokal konfiguration. Kontrollera .env.local.';
    statusElement.classList.add('is-error');
  }

  return false;
}

export async function getCurrentSession() {
  if (!hasSupabaseConfig) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error && error.name !== 'AuthSessionMissingError') {
    throw error;
  }

  return data?.session ?? null;
}

export async function redirectIfAuthenticated(targetUrl = 'vault.html') {
  const session = await getCurrentSession();
  if (session) {
    window.location.replace(targetUrl);
  }
}

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    const redirectTo = encodeURIComponent(window.location.pathname.split('/').pop() || 'vault.html');
    window.location.replace(`login.html?redirect=${redirectTo}`);
    return null;
  }

  return session;
}

export function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  if (!redirect || !/^[a-zA-Z0-9_-]+\.html$/.test(redirect)) {
    return 'vault.html';
  }

  return redirect;
}
```

- [ ] **Step 6: `style.css`** — liten, egen stilmall (medvetet minimal; utökas vid behov i senare tasks, inte en kopia av `promptbanken`-repots stora fil eftersom den innehåller mycket kommun-specifikt/oanvänt för Valvet)

```css
:root {
  color-scheme: light;
  --bg: #f7f7f5;
  --panel: #ffffff;
  --border: #ddd;
  --text: #1a1a1a;
  --muted: #666;
  --accent: #2563eb;
  --danger: #b91c1c;
  --success: #15803d;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}

header.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 1.5rem;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

nav.app-nav {
  display: flex;
  gap: 0.5rem;
}

nav.app-nav button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
}

nav.app-nav button.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

main {
  max-width: 860px;
  margin: 0 auto;
  padding: 1.5rem;
}

section[data-view-panel] { display: block; }
section[data-view-panel][hidden] { display: none; }

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

form.item-form label {
  display: block;
  margin: 0.5rem 0 0.25rem;
  font-weight: 600;
  font-size: 0.9rem;
}

form.item-form input,
form.item-form select,
form.item-form textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: inherit;
  font-size: 1rem;
}

form.item-form textarea { min-height: 8rem; }

.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
  gap: 1rem;
}

.item-row:last-child { border-bottom: none; }

.item-row .item-meta { flex: 1; min-width: 0; }
.item-row .item-title { font-weight: 600; }
.item-row .item-sub { color: var(--muted); font-size: 0.85rem; }

.item-row .item-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }

button {
  font-family: inherit;
}

button.primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
}

button.secondary {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
}

button.danger {
  background: transparent;
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}

.status-message { min-height: 1.2rem; margin: 0.5rem 0; font-size: 0.9rem; }
.status-message.is-error { color: var(--danger); }
.status-message.is-success { color: var(--success); }

.counter-badge { font-size: 0.85rem; color: var(--muted); }
.counter-badge.is-limit { color: var(--danger); font-weight: 600; }

[data-secret-panel] {
  background: #fef9c3;
  border: 1px solid #eab308;
  border-radius: 6px;
  padding: 0.75rem;
  margin-top: 0.5rem;
}

code.secret-value {
  display: block;
  word-break: break-all;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}
```

- [ ] **Step 7: `.github/workflows/deploy.yml`** (samma mönster som `promptbanken`-repot)

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

**Not:** `vite-plugin-static-copy` behövs inte här (till skillnad från `promptbanken`-repot) — Valvet har inga fristående statiska filer utanför Vite-bygget (ingen `prompts.json`/`prompts/`-katalog).

- [ ] **Step 8: Installera och sanity-bygg**

```bash
npm install
npm run build
```
Förväntat: `dist/login.html` och `dist/vault.html` skapas (vault.html/login.html skapas i nästa tasks — om de inte finns än blir bygget tomt/fel, det är förväntat just nu; kör om efter Task 2–3).

- [ ] **Step 9: Commit**

```bash
git add package.json vite.config.js .nojekyll CNAME .gitignore src/supabaseClient.js src/auth.js style.css .github/workflows/deploy.yml
git commit -m "chore: scaffold Vite + Supabase project structure"
```

---

### Task 2: Inloggning

**Files:**
- Create: `login.html`
- Create: `src/login.js`

**Interfaces:**
- Consumes: `src/auth.js`, `src/supabaseClient.js` (Task 1).

- [ ] **Step 1: `login.html`**

```html
<!doctype html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Logga in — Valvet</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <main style="max-width: 400px; margin: 4rem auto;">
    <div class="card">
      <h1>Valvet</h1>
      <p>Ditt personliga AI-valv för prompts och assistenter.</p>

      <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
        <button type="button" class="secondary active" data-auth-mode="login">Logga in</button>
        <button type="button" class="secondary" data-auth-mode="signup">Skapa konto</button>
        <button type="button" class="secondary" data-auth-mode="reset">Glömt lösenord</button>
      </div>

      <form data-login-form>
        <label for="login-email">E-post</label>
        <input id="login-email" type="email" data-login-email required autocomplete="email" />

        <div data-password-field>
          <label for="login-password">Lösenord</label>
          <input id="login-password" type="password" data-login-password required autocomplete="current-password" />
        </div>

        <p class="status-message" data-login-status></p>

        <button type="submit" class="primary" data-auth-submit>Logga in</button>
      </form>

      <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border);" />

      <button type="button" class="secondary" data-google-signin style="width:100%;">
        Fortsätt med Google
      </button>
    </div>
  </main>
  <script type="module" src="/src/login.js"></script>
</body>
</html>
```

- [ ] **Step 2: `src/login.js`** (portat från `promptbanken`-repots `src/login.js`, redirect-mål `vault.html`)

```javascript
import { getRedirectTarget, redirectIfAuthenticated, requireSupabaseConfig } from './auth.js';
import { supabase } from './supabaseClient.js';

const form = document.querySelector('[data-login-form]');
const emailInput = document.querySelector('[data-login-email]');
const passwordInput = document.querySelector('[data-login-password]');
const statusElement = document.querySelector('[data-login-status]');
const submitButton = document.querySelector('[data-auth-submit]');
const modeButtons = document.querySelectorAll('[data-auth-mode]');
let authMode = 'login';

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('is-error', isError);
}

async function handleLogin(event) {
  event.preventDefault();

  if (!requireSupabaseConfig(statusElement)) {
    return;
  }

  setStatus(authMode === 'signup' ? 'Skapar konto...' : 'Loggar in...');

  const credentials = {
    email: emailInput.value.trim(),
    password: passwordInput.value
  };

  if (authMode === 'reset') {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(credentials.email);
    if (resetError) {
      setStatus(resetError.message || 'Kunde inte skicka återställningslänk.', true);
    } else {
      setStatus('Återställningslänk skickad — kolla din e-post.');
    }
    return;
  }

  const { data, error } = authMode === 'signup'
    ? await supabase.auth.signUp(credentials)
    : await supabase.auth.signInWithPassword(credentials);

  if (error) {
    setStatus(error.message || 'Åtgärden misslyckades.', true);
    return;
  }

  if (authMode === 'signup') {
    if (!data.session) {
      setStatus('Kontot är skapat. Bekräfta e-posten och logga sedan in.');
      return;
    }

    const { error: workspaceError } = await supabase.rpc('ensure_personal_workspace');
    if (workspaceError) {
      setStatus(workspaceError.message || 'Kontot skapades men privat workspace kunde inte skapas.', true);
      return;
    }
  }

  window.location.assign(getRedirectTarget());
}

function setAuthMode(nextMode) {
  authMode = nextMode;
  modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.authMode === authMode);
  });
  const passwordField = document.querySelector('[data-password-field]');
  if (authMode === 'reset') {
    submitButton.textContent = 'Skicka återställningslänk';
    passwordInput.required = false;
    if (passwordField) passwordField.hidden = true;
  } else {
    submitButton.textContent = authMode === 'signup' ? 'Skapa konto' : 'Logga in';
    passwordInput.required = true;
    if (passwordField) passwordField.hidden = false;
    passwordInput.autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
  }
  setStatus('');
}

if (form) {
  form.addEventListener('submit', handleLogin);
}

const googleButton = document.querySelector('[data-google-signin]');
if (googleButton) {
  googleButton.addEventListener('click', async () => {
    if (!requireSupabaseConfig(statusElement)) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/vault.html' }
    });
    if (error) setStatus(error.message || 'Kunde inte starta Google-inloggning.', true);
  });
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
});

if (requireSupabaseConfig(statusElement)) {
  redirectIfAuthenticated(getRedirectTarget()).catch((error) => {
    setStatus(error.message || 'Kunde inte kontrollera session.', true);
  });
}
```

- [ ] **Step 3: Manuell verifiering**

```bash
npm run web:dev
```
Öppna `http://localhost:5173/login.html` (behöver `.env.local` med `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` mot **staging**-projektet — samma nycklar som `promptbanken`-repots `.env.local`, eftersom det är samma Supabase-projekt). Skapa ett test-konto, bekräfta att det försöker navigera till `vault.html` (404 är förväntat än — den finns inte förrän Task 3).

- [ ] **Step 4: Commit**

```bash
git add login.html src/login.js
git commit -m "feat: add login/signup page"
```

---

### Task 3: `vault.html`-skalet och kärnan i `vault.js`

**Files:**
- Create: `vault.html`
- Create: `src/vault.js`

**Interfaces:**
- Consumes: `requireSession()`, `supabase` (Task 1/2).
- Produces: modul-lokalt `state`-objekt (`{ session, user, workspace, items }`), `setStatus(msg, isError)`, `switchView(name)`, `sha256Hex(value)`, `randomToken()`, `slugify(value)` — Task 4–7 bygger vidare på dessa.

**Vy-namn:** `mina` (Mina insättningar + Ny insättning/Redigera), `sok` (Sök), `arkiv` (Arkiv), `mcp` (MCP-nyckel + installationsguide).

- [ ] **Step 1: `vault.html`**

```html
<!doctype html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Valvet</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header class="app-header">
    <strong>Valvet</strong>
    <nav class="app-nav">
      <button type="button" data-view-tab="mina" class="active">Mina insättningar</button>
      <button type="button" data-view-tab="sok">Sök</button>
      <button type="button" data-view-tab="arkiv">Arkiv</button>
      <button type="button" data-view-tab="mcp">MCP-nyckel</button>
    </nav>
    <span style="margin-left:auto; display:flex; align-items:center; gap:1rem;">
      <span class="counter-badge" data-item-counter></span>
      <button type="button" class="secondary" data-sign-out>Logga ut</button>
    </span>
  </header>

  <main>
    <section data-view-panel="mina">
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Mina insättningar</h2>
          <button type="button" class="primary" data-new-item-button>+ Ny insättning</button>
        </div>
      </div>

      <div class="card" data-item-form-card hidden>
        <h3 data-item-form-title>Ny insättning</h3>
        <form class="item-form" data-item-form>
          <input type="hidden" data-item-id />
          <label for="item-type">Typ</label>
          <select id="item-type" name="type" data-item-type required>
            <option value="prompt">Prompt</option>
            <option value="assistant">Assistent</option>
          </select>

          <label for="item-title">Titel</label>
          <input id="item-title" name="title" data-item-title required maxlength="200" />

          <label for="item-category">Kategori (valfritt)</label>
          <input id="item-category" name="category" data-item-category maxlength="100" />

          <label for="item-content">Innehåll</label>
          <textarea id="item-content" name="content" data-item-content required maxlength="20000"></textarea>

          <p class="status-message" data-item-form-status></p>

          <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
            <button type="submit" class="primary" data-item-form-submit>Spara</button>
            <button type="button" class="secondary" data-item-form-cancel>Avbryt</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div data-item-list></div>
        <p class="status-message" data-item-list-empty hidden>Du har inga insättningar än. Klicka "+ Ny insättning" för att skapa din första.</p>
      </div>
    </section>

    <section data-view-panel="sok" hidden>
      <div class="card">
        <label for="search-query">Sök i mina insättningar</label>
        <input id="search-query" type="search" data-search-input placeholder="Titel, kategori eller innehåll..." />
      </div>
      <div class="card">
        <div data-search-results></div>
        <p class="status-message" data-search-empty hidden>Inga träffar.</p>
      </div>
    </section>

    <section data-view-panel="arkiv" hidden>
      <div class="card">
        <h2 style="margin-top:0;">Arkiv</h2>
        <div data-archive-list></div>
        <p class="status-message" data-archive-empty hidden>Arkivet är tomt.</p>
      </div>
    </section>

    <section data-view-panel="mcp" hidden>
      <div class="card">
        <h2 style="margin-top:0;">MCP-nyckel</h2>
        <p>Använd en MCP-nyckel för att komma åt ditt Valvet direkt från ChatGPT eller Claude.</p>
        <form data-mcp-key-form>
          <label for="mcp-key-name">Namn på nyckeln</label>
          <input id="mcp-key-name" name="name" required maxlength="60" placeholder="T.ex. Min bärbara dator" />
          <button type="submit" class="primary" style="margin-top:0.5rem;">Skapa nyckel</button>
        </form>
        <div data-new-mcp-key-panel hidden>
          <strong>Din nya nyckel (visas bara en gång):</strong>
          <code class="secret-value" data-new-mcp-key></code>
        </div>
        <p class="status-message" data-mcp-key-status></p>
        <div data-mcp-key-list style="margin-top:1rem;"></div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">Installationsguide</h3>
        <p>Lägg till Valvet i din MCP-klients konfiguration:</p>
        <pre style="background:#f3f4f6; padding:0.75rem; border-radius:6px; overflow-x:auto;"><code>{
  "mcpServers": {
    "valvet": {
      "url": "https://mcp.promptbanken.se/mcp",
      "headers": { "X-MCP-Key": "DIN_NYCKEL_HÄR" }
    }
  }
}</code></pre>
        <p>Verktygen <code>list_my_items</code>, <code>search_my_items</code>, <code>get_my_item</code> fungerar direkt.
        <code>save_my_item</code> är tillgängligt för alla (Free: 5 nya/månad via MCP).
        <code>update_my_item</code> och <code>archive_my_item</code> kräver Pro.</p>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">Export</h3>
        <button type="button" class="secondary" data-export-button>Exportera mina insättningar (JSON)</button>
      </div>
    </section>
  </main>

  <script type="module" src="/src/vault.js"></script>
</body>
</html>
```

- [ ] **Step 2: `src/vault.js`** — kärnan (bootstrap, state, vy-växling, delade helpers)

```javascript
import { requireSession } from './auth.js';
import { supabase } from './supabaseClient.js';

export const state = {
  session: null,
  user: null,
  workspace: null,
  items: [],       // aktiva "Mina insättningar"
  archived: []      // arkiverade
};

const statusTargets = new Map();

export function setStatus(selector, message, isError = false) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', isError);
  el.classList.toggle('is-success', !isError && Boolean(message));
}

export function setErrorStatus(selector, error, fallbackMessage) {
  setStatus(selector, error?.message || fallbackMessage, true);
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function slugify(value) {
  const base = (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return base || `insattning-${randomToken().slice(0, 8)}`;
}

export function vaultItemLimit() {
  return state.workspace?.plan === 'free' ? 50 : 1000;
}

const VIEW_NAMES = ['mina', 'sok', 'arkiv', 'mcp'];

export function switchView(name) {
  VIEW_NAMES.forEach((view) => {
    const panel = document.querySelector(`[data-view-panel="${view}"]`);
    if (panel) panel.hidden = view !== name;
    const tab = document.querySelector(`[data-view-tab="${view}"]`);
    if (tab) tab.classList.toggle('active', view === name);
  });
}

document.querySelectorAll('[data-view-tab]').forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.viewTab));
});

const signOutButton = document.querySelector('[data-sign-out]');
if (signOutButton) {
  signOutButton.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.replace('login.html');
  });
}

export async function bootstrap() {
  const session = await requireSession();
  if (!session) return false; // requireSession redirectar redan till login.html

  state.session = session;
  state.user = session.user;

  const { data: workspaceId, error: wsError } = await supabase.rpc('ensure_personal_workspace');
  if (wsError) {
    setStatus('[data-item-list-empty]', wsError.message || 'Kunde inte ladda workspace.', true);
    return false;
  }

  const { data: workspace, error: loadError } = await supabase
    .from('workspaces')
    .select('id, plan, mcp_enabled')
    .eq('id', workspaceId)
    .single();

  if (loadError) {
    setStatus('[data-item-list-empty]', loadError.message || 'Kunde inte ladda workspace.', true);
    return false;
  }

  state.workspace = workspace;
  return true;
}
```

**Not om `bootstrap()`:** `ensure_personal_workspace()` returnerar workspacets `id` (redan byggd funktion, se `promptbanken/supabase/migrations/20260629100000_mcp_rpc_functions.sql`) — den skapar workspacet om det inte redan finns. Detta är samma RPC som `promptbanken`-repots `admin.js`/`login.js` redan anropar; ingen ny databaskod behövs för detta steg.

- [ ] **Step 3: Manuell verifiering**

```bash
npm run web:dev
```
Öppna `http://localhost:5173/vault.html` utan att vara inloggad → ska redirecta till `login.html?redirect=vault.html`. Logga in → ska landa på `vault.html`, flikarna ska gå att klicka mellan (även om innehållet är tomt än).

- [ ] **Step 4: Commit**

```bash
git add vault.html src/vault.js
git commit -m "feat: add vault.html shell with tab navigation and workspace bootstrap"
```

---

### Task 4: Mina insättningar — lista, skapa, redigera

**Files:**
- Modify: `src/vault.js` (lägg till, ändra inget i Task 3:s kod)

**Interfaces:**
- Consumes: `state`, `setStatus`, `setErrorStatus`, `slugify`, `vaultItemLimit`, `bootstrap` (Task 3).
- Produces: `loadItems()`, `renderItems()`, `openItemForm(item?)`, `closeItemForm()`, `saveItem(event)`, `startArchive(item)` (används även av Task 6, definieras här eftersom arkivera-knappen ligger i listraden på "Mina insättningar").

- [ ] **Step 1: Lägg till i `src/vault.js`**

```javascript
function renderItemRow(item, { showRestoreOnly = false } = {}) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <div class="item-meta">
      <div class="item-title">${escapeHtml(item.title)} <span style="font-weight:400; color:var(--muted);">(${item.type === 'assistant' ? 'Assistent' : 'Prompt'})</span></div>
      <div class="item-sub">${item.category ? escapeHtml(item.category) + ' — ' : ''}Ändrad ${new Date(item.updated_at).toLocaleString('sv-SE')}</div>
    </div>
    <div class="item-actions"></div>
  `;

  const actions = row.querySelector('.item-actions');

  if (showRestoreOnly) {
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'secondary';
    restoreBtn.textContent = 'Återställ';
    restoreBtn.addEventListener('click', () => restoreItem(item));
    actions.appendChild(restoreBtn);
    return row;
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'secondary';
  editBtn.textContent = 'Redigera';
  editBtn.addEventListener('click', () => openItemForm(item));
  actions.appendChild(editBtn);

  const archiveBtn = document.createElement('button');
  archiveBtn.type = 'button';
  archiveBtn.className = 'danger';
  archiveBtn.textContent = 'Arkivera';
  archiveBtn.addEventListener('click', () => confirmThenArchive(archiveBtn, item));
  actions.appendChild(archiveBtn);

  return row;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

export async function loadItems() {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, type, title, content, category, status, updated_at')
    .eq('workspace_id', state.workspace.id)
    .eq('module', 'valvet')
    .eq('owner_user_id', state.user.id)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });

  if (error) {
    setErrorStatus('[data-item-list-empty]', error, 'Kunde inte ladda insättningar.');
    return;
  }

  state.items = data || [];
  renderItems();
}

function renderItems() {
  const list = document.querySelector('[data-item-list]');
  const empty = document.querySelector('[data-item-list-empty]');
  list.innerHTML = '';

  if (!state.items.length) {
    empty.hidden = false;
    empty.classList.remove('is-error');
    empty.textContent = 'Du har inga insättningar än. Klicka "+ Ny insättning" för att skapa din första.';
  } else {
    empty.hidden = true;
    state.items.forEach((item) => list.appendChild(renderItemRow(item)));
  }

  const counter = document.querySelector('[data-item-counter]');
  const limit = vaultItemLimit();
  counter.textContent = `${state.items.length} av ${limit} insättningar`;
  counter.classList.toggle('is-limit', state.items.length >= limit);
}

let editingItemId = null;

export function openItemForm(item = null) {
  editingItemId = item?.id ?? null;
  document.querySelector('[data-item-form-card]').hidden = false;
  document.querySelector('[data-item-form-title]').textContent = item ? 'Redigera insättning' : 'Ny insättning';
  document.querySelector('[data-item-id]').value = item?.id ?? '';
  document.querySelector('[data-item-type]').value = item?.type ?? 'prompt';
  document.querySelector('[data-item-title]').value = item?.title ?? '';
  document.querySelector('[data-item-category]').value = item?.category ?? '';
  document.querySelector('[data-item-content]').value = item?.content ?? '';
  setStatus('[data-item-form-status]', '');
}

export function closeItemForm() {
  editingItemId = null;
  document.querySelector('[data-item-form-card]').hidden = true;
  document.querySelector('[data-item-form]').reset();
}

async function saveItem(event) {
  event.preventDefault();

  const type = document.querySelector('[data-item-type]').value;
  const title = document.querySelector('[data-item-title]').value.trim();
  const category = document.querySelector('[data-item-category]').value.trim() || null;
  const content = document.querySelector('[data-item-content]').value.trim();

  if (!title || !content) {
    setStatus('[data-item-form-status]', 'Titel och innehåll krävs.', true);
    return;
  }

  if (editingItemId) {
    const { error } = await supabase
      .from('content_items')
      .update({ title, category, content })
      .eq('id', editingItemId);

    if (error) {
      setErrorStatus('[data-item-form-status]', error, 'Kunde inte uppdatera insättningen.');
      return;
    }
  } else {
    if (state.items.length >= vaultItemLimit()) {
      setStatus('[data-item-form-status]', `Du har nått gränsen på ${vaultItemLimit()} insättningar.`, true);
      return;
    }

    const baseSlug = slugify(title);
    const slug = `${baseSlug}-${randomToken().slice(0, 6)}`;

    const { error } = await supabase.from('content_items').insert({
      workspace_id: state.workspace.id,
      owner_user_id: state.user.id,
      created_by: state.user.id,
      type,
      module: 'valvet',
      title,
      slug,
      category,
      content,
      status: 'draft',
      visibility: 'private'
    });

    if (error) {
      setErrorStatus('[data-item-form-status]', error, 'Kunde inte spara insättningen.');
      return;
    }
  }

  closeItemForm();
  await loadItems();
}

document.querySelector('[data-new-item-button]')?.addEventListener('click', () => openItemForm());
document.querySelector('[data-item-form-cancel]')?.addEventListener('click', () => closeItemForm());
document.querySelector('[data-item-form]')?.addEventListener('submit', saveItem);
```

**Not om `slug`:** kolumnen kräver global unikhet per `workspace_id` (se `content_items_workspace_slug_key` i `promptbanken`-repots initiala schema). `slugify(title) + '-' + randomToken().slice(0,6)` räcker i praktiken (kollisionsrisk försumbar för en enskild användares eget workspace) — ingen kollisions-loop mot databasen behövs här, till skillnad från de server-side RPC:erna i Plan A som medvetet har en (de körs över alla möjliga race conditions från flera samtidiga klienter/MCP-anrop).

- [ ] **Step 2: Koppla ihop bootstrap med initial render**

Lägg till längst ner i `src/vault.js`:

```javascript
bootstrap().then((ok) => {
  if (!ok) return;
  loadItems();
});
```

- [ ] **Step 3: Manuell verifiering**

Skapa en prompt och en assistent via UI:t, se dem i listan, redigera en, se ändringen reflekteras direkt. Försök skapa en 51:a om du (manuellt, via SQL) satt räknaren nära gränsen — bekräfta felmeddelandet visas snyggt, inte som en rå Postgres-exception.

- [ ] **Step 4: Commit**

```bash
git add src/vault.js
git commit -m "feat: add create/edit/list for Mina insättningar"
```

---

### Task 5: Sök

**Files:**
- Modify: `src/vault.js`

**Interfaces:**
- Consumes: `renderItemRow`, `escapeHtml`, `state`, `setStatus` (Task 4).

- [ ] **Step 1: Lägg till**

```javascript
let searchDebounceTimer = null;

async function runSearch(query) {
  const results = document.querySelector('[data-search-results]');
  const empty = document.querySelector('[data-search-empty]');

  if (!query.trim()) {
    results.innerHTML = '';
    empty.hidden = true;
    return;
  }

  const like = `%${query.trim()}%`;
  const { data, error } = await supabase
    .from('content_items')
    .select('id, type, title, content, category, status, updated_at')
    .eq('workspace_id', state.workspace.id)
    .eq('module', 'valvet')
    .eq('owner_user_id', state.user.id)
    .neq('status', 'archived')
    .or(`title.ilike.${like},content.ilike.${like},category.ilike.${like}`)
    .order('updated_at', { ascending: false });

  if (error) {
    results.innerHTML = '';
    setErrorStatus('[data-search-empty]', error, 'Sökningen misslyckades.');
    empty.hidden = false;
    return;
  }

  results.innerHTML = '';
  if (!data.length) {
    empty.hidden = false;
    empty.classList.remove('is-error');
    empty.textContent = 'Inga träffar.';
  } else {
    empty.hidden = true;
    data.forEach((item) => results.appendChild(renderItemRow(item)));
  }
}

document.querySelector('[data-search-input]')?.addEventListener('input', (event) => {
  clearTimeout(searchDebounceTimer);
  const query = event.target.value;
  searchDebounceTimer = setTimeout(() => runSearch(query), 250);
});
```

**Not:** Supabase JS-klientens `.or()` med `ilike` tar råa mönster — `query` kommer direkt från ett `<input>`-värde och interpoleras i en template-sträng utan escaping av `%`/`,`/`)`-tecken. Det är **inte** en SQL-injektionsrisk (PostgREST bygger frågan via sin egen URL-baserade filter-syntax, inte rå SQL-konkatenering), men ett `,` eller `)` i söktexten kan göra att PostgREST tolkar filtret fel och returnerar en 400 istället för sökträffar. Detta fångas redan av `if (error)`-grenen ovan (visar ett fel istället för att krascha), så inget ytterligare skydd krävs för Fas 1 — men var medveten om begränsningen om sökfältet börjar användas mycket och detta blir en UX-klagopunkt.

- [ ] **Step 2: Manuell verifiering**

Sök på ett ord som finns i en titel, ett som finns i innehåll, ett som inte finns alls. Bekräfta arkiverade poster aldrig dyker upp i sökresultat.

- [ ] **Step 3: Commit**

```bash
git add src/vault.js
git commit -m "feat: add search for Mina insättningar"
```

---

### Task 6: Arkiv

**Files:**
- Modify: `src/vault.js`

**Interfaces:**
- Consumes: `renderItemRow`, `state`, `loadItems` (Task 4).
- Produces: `confirmThenArchive(button, item)` (används av Task 4:s arkivera-knapp), `restoreItem(item)`, `loadArchive()`.

- [ ] **Step 1: Lägg till**

```javascript
const pendingArchiveConfirms = new WeakMap();

function confirmThenArchive(button, item) {
  if (pendingArchiveConfirms.has(button)) {
    clearTimeout(pendingArchiveConfirms.get(button));
    pendingArchiveConfirms.delete(button);
    archiveItem(item);
    return;
  }

  const originalText = button.textContent;
  button.textContent = 'Bekräfta arkivering?';
  const timer = setTimeout(() => {
    button.textContent = originalText;
    pendingArchiveConfirms.delete(button);
  }, 4000);
  pendingArchiveConfirms.set(button, timer);
}

async function archiveItem(item) {
  const { error } = await supabase
    .from('content_items')
    .update({ status: 'archived' })
    .eq('id', item.id);

  if (error) {
    setErrorStatus('[data-item-list-empty]', error, 'Kunde inte arkivera insättningen.');
    return;
  }

  await loadItems();
}

export async function loadArchive() {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, type, title, content, category, status, updated_at')
    .eq('workspace_id', state.workspace.id)
    .eq('module', 'valvet')
    .eq('owner_user_id', state.user.id)
    .eq('status', 'archived')
    .order('updated_at', { ascending: false });

  const list = document.querySelector('[data-archive-list]');
  const empty = document.querySelector('[data-archive-empty]');
  list.innerHTML = '';

  if (error) {
    setErrorStatus('[data-archive-empty]', error, 'Kunde inte ladda arkivet.');
    empty.hidden = false;
    return;
  }

  state.archived = data || [];

  if (!state.archived.length) {
    empty.hidden = false;
    empty.classList.remove('is-error');
    empty.textContent = 'Arkivet är tomt.';
  } else {
    empty.hidden = true;
    state.archived.forEach((item) => list.appendChild(renderItemRow(item, { showRestoreOnly: true })));
  }
}

async function restoreItem(item) {
  if (state.items.length >= vaultItemLimit()) {
    setErrorStatus('[data-archive-empty]', { message: `Du har nått gränsen på ${vaultItemLimit()} insättningar — arkivera något annat först.` }, '');
    document.querySelector('[data-archive-empty]').hidden = false;
    return;
  }

  const { error } = await supabase
    .from('content_items')
    .update({ status: 'draft' })
    .eq('id', item.id);

  if (error) {
    setErrorStatus('[data-archive-empty]', error, 'Kunde inte återställa insättningen.');
    return;
  }

  await Promise.all([loadItems(), loadArchive()]);
}

document.querySelector('[data-view-tab="arkiv"]')?.addEventListener('click', () => loadArchive());
```

**Not om `restoreItem`s klientsidiga gränskoll:** detta är bara en snabb UX-genväg (undviker en onödig tur-och-retur om gränsen redan är uppenbart nådd) — den **riktiga** spärren sitter i `enforce_vault_item_limit`-triggern (Plan A, Task 3), som körs server-side oavsett vad klienten trodde. Om klientens `state.items.length` råkar vara inaktuellt (t.ex. en annan flik redan skapat fler poster) avvisar databasen ändå försöket, och `error`-grenen i UPDATE-anropet ovan fångar det felet precis som vilket annat databasfel som helst.

- [ ] **Step 2: Manuell verifiering**

Arkivera en post från "Mina insättningar" (bekräfta tvåstegsknappen — första klick byter text, andra klick inom 4 sekunder utför arkiveringen, väntar man längre återgår knappen). Gå till Arkiv-fliken, se posten där, återställ den, bekräfta den dyker upp i "Mina insättningar" igen.

- [ ] **Step 3: Commit**

```bash
git add src/vault.js
git commit -m "feat: add archive/restore with two-step confirmation"
```

---

### Task 7: MCP-nyckel, installationsguide, export

**Files:**
- Modify: `src/vault.js`

**Interfaces:**
- Consumes: `sha256Hex`, `randomToken`, `state`, `setStatus`, `setErrorStatus` (Task 3/4).

- [ ] **Step 1: Lägg till**

```javascript
const MCP_KEY_LIMITS = { free: 1, pro: 3 };

function mcpKeyLimit() {
  return MCP_KEY_LIMITS[state.workspace?.plan] ?? 1;
}

async function loadMcpKeys() {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, revoked_at, created_at')
    .eq('workspace_id', state.workspace.id)
    .contains('scopes', ['mcp'])
    .order('created_at', { ascending: false });

  const container = document.querySelector('[data-mcp-key-list]');
  container.innerHTML = '';

  if (error) {
    setErrorStatus('[data-mcp-key-status]', error, 'Kunde inte ladda MCP-nycklar.');
    return;
  }

  (data || []).forEach((key) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const status = key.revoked_at ? 'Återkallad' : 'Aktiv';
    row.innerHTML = `
      <div class="item-meta">
        <div class="item-title">${escapeHtml(key.name)}</div>
        <div class="item-sub">${escapeHtml(key.key_prefix)}... — ${status}</div>
      </div>
      <div class="item-actions"></div>
    `;
    if (!key.revoked_at) {
      const revokeBtn = document.createElement('button');
      revokeBtn.type = 'button';
      revokeBtn.className = 'danger';
      revokeBtn.textContent = 'Återkalla';
      revokeBtn.addEventListener('click', async () => {
        const { error: revokeError } = await supabase
          .from('api_keys')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', key.id);
        if (revokeError) {
          setErrorStatus('[data-mcp-key-status]', revokeError, 'Kunde inte återkalla nyckeln.');
          return;
        }
        await loadMcpKeys();
      });
      row.querySelector('.item-actions').appendChild(revokeBtn);
    }
    container.appendChild(row);
  });
}

async function createMcpKey(event) {
  event.preventDefault();

  const nameInput = document.querySelector('#mcp-key-name');
  const name = nameInput.value.trim();
  if (!name) {
    setStatus('[data-mcp-key-status]', 'Namn krävs.', true);
    return;
  }

  const { count } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', state.workspace.id)
    .contains('scopes', ['mcp'])
    .is('revoked_at', null);

  if ((count ?? 0) >= mcpKeyLimit()) {
    setStatus('[data-mcp-key-status]', `Du har nått gränsen på ${mcpKeyLimit()} aktiva MCP-nyckel(ar) för din plan.`, true);
    return;
  }

  const rawKey = `pb_mcp_${randomToken()}`;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = await sha256Hex(rawKey);

  const { error } = await supabase.from('api_keys').insert({
    workspace_id: state.workspace.id,
    created_by: state.user.id,
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    scopes: ['mcp']
  });

  if (error) {
    setErrorStatus('[data-mcp-key-status]', error, 'Kunde inte skapa MCP-nyckel.');
    return;
  }

  document.querySelector('[data-mcp-key-form]').reset();
  document.querySelector('[data-new-mcp-key-panel]').hidden = false;
  document.querySelector('[data-new-mcp-key]').textContent = rawKey;
  setStatus('[data-mcp-key-status]', 'Nyckeln skapades. Kopiera den nu, den visas bara en gång.');
  await loadMcpKeys();
}

document.querySelector('[data-mcp-key-form]')?.addEventListener('submit', createMcpKey);
document.querySelector('[data-view-tab="mcp"]')?.addEventListener('click', () => loadMcpKeys());

function exportItems() {
  const all = [...state.items, ...state.archived];
  if (!all.length) {
    setStatus('[data-mcp-key-status]', 'Du har inga insättningar att exportera än.', true);
    return;
  }

  const payload = all.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    category: item.category,
    status: item.status,
    updated_at: item.updated_at
  }));

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `valvet-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.querySelector('[data-export-button]')?.addEventListener('click', async () => {
  await loadArchive(); // säkerställ att arkivet är laskat innan export inkluderar det
  exportItems();
});
```

**Not:** exportformatet matchar exakt `docs/superpowers/specs/2026-07-16-valvet-design.md`s spec (samma fält, samma filnamnsmönster).

- [ ] **Step 2: Manuell verifiering**

Skapa en MCP-nyckel, bekräfta den bara visas en gång (ladda om sidan, den ska inte synas i klartext igen — bara `key_prefix`). Återkalla den, bekräfta status ändras. Testa gränsen (skapa fler än `mcpKeyLimit()` aktiva). Klicka Exportera, bekräfta nedladdad JSON-fil har rätt format och innehåller både aktiva och arkiverade poster.

- [ ] **Step 3: Commit**

```bash
git add src/vault.js
git commit -m "feat: add MCP key management, install guide, and export"
```

---

### Task 8: Fullständig manuell end-to-end-verifiering + deploy-koll

**Förutsättning:** Plan A applicerad mot **staging**. GitHub-repots secrets `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` satta (Settings → Secrets and variables → Actions) mot samma Supabase-projekt som `promptbanken`-repot använder i produktion (detta är **samma konto/databas**, se spec).

- [ ] **Step 1: Full klick-igenom lokalt**

```bash
npm run build
npm run preview
```
Gå igenom hela flödet i webbläsaren: signup → logga in → skapa prompt → skapa assistent → redigera → sök → arkivera → återställ → skapa MCP-nyckel → exportera → logga ut → logga in igen → allt kvar.

- [ ] **Step 2: Testa Free-taket på riktigt**

Sätt (manuellt via SQL i staging) ett test-workspaces `plan` till `'free'` om det inte redan är det, skapa insättningar tills gränsen (50) nås, bekräfta felmeddelandet i UI:t är begripligt, inte en rå databas-exception.

- [ ] **Step 3: Push och verifiera GitHub Pages-deploy**

```bash
git push origin main
```
Kontrollera Actions-fliken på GitHub — bygget ska lyckas och deploya. Besök `https://valvet.promptbanken.se` (kräver att DNS för subdomänen redan pekar mot GitHub Pages — om inte, detta är ett separat, utanför-repo steg att göra i domänleverantörens DNS-inställningar, inte en del av denna plan).

- [ ] **Step 4: Cross-check mot MCP-servern**

Skapa en insättning i webbappen, hämta den via `list_my_items`/`get_my_item` mot den hostade MCP-servern (Plan B, Task 4:s verifieringssteg) med samma nyckel — bekräfta att webben och MCP ser exakt samma data (delad databas, delad `module='valvet'`-tagg — detta är hela poängen med arkitekturen).

---

## Klart-kriterier för Plan C

- Alla sju logiska skärmar (Logga in, Mina insättningar, Ny insättning, Sök, Redigera, Arkiv, MCP-nyckel+guide) fungerar end-to-end mot staging.
- Free-taket (50), tvåstegsbekräftelsen vid arkivering, och exportformatet alla manuellt verifierade.
- GitHub Pages-deploy grön, `valvet.promptbanken.se` (efter DNS pekats dit, utanför scope) serverar appen.
- En insättning skapad i webben syns identisk via MCP-servern (Plan B) och vice versa.
