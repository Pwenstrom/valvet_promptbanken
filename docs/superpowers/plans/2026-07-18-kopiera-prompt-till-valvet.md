# Kopiera prompt → Valvet Implementation Plan

**Status 2026-07-27:** Implementerad. Dokumentet bevaras som historik, men
aktuell kod använder `published_public_content` och
`valvet_catalog_copy_quota`; äldre namn och okryssade genomförandesteg nedan
ska inte användas som ny implementation.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Valvet user browse the Promptbanken catalog from inside Valvet and copy a single catalog item into their own vault as an independent, editable draft.

**Architecture:** A new `SECURITY DEFINER` Postgres RPC (`copy_catalog_item_to_valvet`) in the `promptbanken` repo does the cross-module read (catalog → Valvet) and write atomically, including plan-based access, monthly quota, and duplicate-copy dedup. A new "Bläddra i Promptbanken" tab in the `valvet_promptbanken` repo's `vault.html`/`vault.js` calls that RPC and renders the catalog using the existing `.item-row`/`.card` component classes — no new CSS.

**Tech Stack:** Postgres/Supabase (plpgsql RPC, RLS-backed views), vanilla JS + `@supabase/supabase-js` (no framework), Vite static build.

## Global Constraints

- Free plan: sees only `published_public_content`; 5 copies/calendar month (separate counter from the existing MCP save quota); month boundary via bare `date_trunc('month', now())` — no explicit timezone, matching `save_my_item_for_key`'s existing quota.
- Pro plan: sees `published_workspace_content` (superset of public); unlimited copies.
- The existing 50 (free) / 1000 (pro) active-item trigger (`enforce_vault_item_limit`) already fires on every `content_items` insert regardless of source — do not duplicate that check in the new RPC.
- Type mapping on copy: catalog `type = 'assistant'` → Valvet `'assistant'`; every other catalog type (`prompt`, `routine`, `checklist`, `guide`, `faq`, `document`, `template`) → Valvet `'prompt'`.
- Only `title`, `content`, `category`, and the mapped `type` are copied. `summary`/`audience` exist on the source row but are never copied — Valvet's UI never reads those fields.
- Duplicate copies of the same source (while an active, non-archived copy exists) return the existing row instead of inserting a new one.
- All new/modified `SECURITY DEFINER` functions use `set search_path = ''` with every reference fully schema-qualified (`public.content_items`, `app_private.slugify_candidate`, etc.) — matches `20260717090000_valvet_write_rpcs_search_path_hardening.sql`.
- Full design: `docs/superpowers/specs/2026-07-18-kopiera-prompt-till-valvet-design.md` in this repo.

---

### Task 1: Database migration — `copy_catalog_item_to_valvet` RPC

**Repo:** `promptbanken` (absolute path on this machine: `C:\Users\petwen\OneDrive - Höglandsförbundet\Projekt\promptbanken`)

**Files:**
- Create: `supabase/tests/verify_copy_catalog_item_to_valvet.sql`
- Create: `supabase/migrations/20260718100000_copy_catalog_item_to_valvet.sql`

**Interfaces:**
- Consumes: `app_private.slugify_candidate(p_name text, p_fallback_prefix text) returns text` (existing, defined in `20260703120000_create_pro_order.sql`). `enforce_vault_item_limit` trigger (existing, `20260716101000_valvet_item_limit_trigger.sql`) fires automatically on insert — no call needed. `enforce_content_access_model` trigger already exempts `module = 'valvet'` rows (`20260716100500_valvet_bypass_kommun_trigger.sql`) — no call needed.
- Produces: `public.copy_catalog_item_to_valvet(p_source_item_id uuid) returns public.content_items`, granted to `authenticated`. Task 2 calls this via `supabase.rpc('copy_catalog_item_to_valvet', { p_source_item_id })`.

- [ ] **Step 1: Write the verify checklist (documents expected behavior before the fix exists)**

This repo has no automated test runner for SQL — verification is a manually-run checklist against a staging Supabase project, run through the REST API or SQL editor while authenticated as a real test user (same convention as `supabase/tests/rls_test_plan.sql` and `supabase/tests/verify_valvet_rpcs.sql`). Write the checklist file now, before the migration exists, so step 2 can confirm the "before" state.

Create `supabase/tests/verify_copy_catalog_item_to_valvet.sql`:

```sql
-- supabase/tests/verify_copy_catalog_item_to_valvet.sql
-- Manuellt körbart end-to-end-flöde mot staging. copy_catalog_item_to_valvet
-- är auth.uid()-baserad (vanlig inloggad webb-session), INTE nyckelhash-
-- baserad -- kör varje block genom Supabase REST API eller SQL-editorns
-- role-impersonation medan du är autentiserad som respektive testanvändare
-- (samma metod som rls_test_plan.sql), inte som postgres-superuser.
--
-- Fixturer som behövs innan du kör:
-- 1. En Free-personlig-workspace-användare och en Pro-personlig-workspace-
--    användare (samma två som i verify_valvet_rpcs.sql går bra).
-- 2. Minst 6 publicerade, publika (visibility='public') content_items-rader
--    med module='kommun' -- byt in deras riktiga id:n nedan.
-- 3. Minst 1 publicerad, workspace-synlig (visibility='workspace')
--    content_items-rad med module='kommun'.

-- 1. Som Free: kopiera en publik katalogpost.
select * from public.copy_catalog_item_to_valvet('<public-item-1>');
-- Förväntat (FÖRE migrationen): ERROR function public.copy_catalog_item_to_valvet(uuid) does not exist.
-- Förväntat (EFTER migrationen): 1 rad. module='valvet', visibility='private',
-- status='draft', source='catalog_copy', source_content_item_id='<public-item-1>'.

-- 2. Som Free: samma anrop igen, utan att arkivera kopian -> dubblettskydd.
select * from public.copy_catalog_item_to_valvet('<public-item-1>');
-- Förväntat: returnerar SAMMA rad (samma id) som steg 1. Ingen ny rad skapas.

-- 3. Som Free: försök kopiera en workspace-synlig (icke-publik) katalogpost.
select * from public.copy_catalog_item_to_valvet('<workspace-visible-item>');
-- Förväntat: ERROR 'Den här posten finns inte eller kräver Pro.'

-- 4. Som Free: kopiera 4 ytterligare UNIKA publika katalogposter (steg 1 var
-- den första, så detta är kopia 2-5 denna kalendermånad), sedan en sjätte.
select * from public.copy_catalog_item_to_valvet('<public-item-2>');
select * from public.copy_catalog_item_to_valvet('<public-item-3>');
select * from public.copy_catalog_item_to_valvet('<public-item-4>');
select * from public.copy_catalog_item_to_valvet('<public-item-5>');
select * from public.copy_catalog_item_to_valvet('<public-item-6>');
-- Förväntat: item-2 t.o.m. item-5 lyckas (totalt 5 unika kopior denna
-- månad, inklusive steg 1). item-6 ger ERROR 'Månadskvoten på 5 kopior är
-- förbrukad. Uppgradera till Pro för obegränsad kopiering.'

-- 5. Som Pro: kopiera samma workspace-synliga post som i steg 3 -- ska gå bra.
select * from public.copy_catalog_item_to_valvet('<workspace-visible-item>');
-- Förväntat: 1 rad, samma fält som steg 1 fast source_content_item_id pekar
-- på <workspace-visible-item>.

-- 6. Som Pro: upprepa kopiering 6+ gånger (unika källor) -- ingen kvotfel.
-- Förväntat: alla lyckas, ingen ERROR om månadskvot.

-- 7. Typmappning: kopiera en katalogpost med type='guide' eller
-- 'checklist' (byt in ett sådant id nedan).
select * from public.copy_catalog_item_to_valvet('<guide-or-checklist-item>');
-- Förväntat: den nya raden har type='prompt' (inte 'guide'/'checklist').

-- 8. Typmappning: kopiera en katalogpost med type='assistant'.
select * from public.copy_catalog_item_to_valvet('<assistant-item>');
-- Förväntat: den nya raden har type='assistant'.
```

- [ ] **Step 2: Confirm the "before" state**

Run the first query from the checklist file (step 1's `select * from public.copy_catalog_item_to_valvet(...)`) against staging, authenticated as the Free test user, via the Supabase SQL editor or REST API.

Expected: `ERROR: function public.copy_catalog_item_to_valvet(uuid) does not exist` (or PostgREST `PGRST202`). This confirms the function genuinely doesn't exist yet before you write it.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260718100000_copy_catalog_item_to_valvet.sql`:

```sql
-- 20260718100000_copy_catalog_item_to_valvet.sql
-- Delprojekt 2 (kopiera prompt -> Valvet) av Promptbanken/Valvet-katalog-
-- integrationen. Se docs/superpowers/specs/2026-07-18-kopiera-prompt-till-
-- valvet-design.md i valvet_promptbanken-repot för fullständig design.

-- 1. Källspårning: nullable, on delete set null så en borttagen katalogpost
-- inte förstör kopian, bara spårningen.
alter table public.content_items
    add column if not exists source_content_item_id uuid
        references public.content_items(id) on delete set null;

-- 2. Utöka source-taggen med 'catalog_copy' (fanns sen tidigare: 'manual',
-- 'chat_extraction', se 20260712100000_save_prompt_for_key.sql).
alter table public.content_items
    drop constraint if exists content_items_source_check;
alter table public.content_items
    add constraint content_items_source_check
        check (source in ('manual', 'chat_extraction', 'catalog_copy'));

-- 3. copy_catalog_item_to_valvet: auth.uid()-baserad (vanlig inloggad
-- webb-session, inte MCP-nyckel -- samma mönster som ensure_personal_workspace()).
create or replace function app_private.copy_catalog_item_to_valvet(
    p_source_item_id uuid
)
returns public.content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_ws          public.workspaces%rowtype;
    v_source      public.content_items%rowtype;
    v_existing    public.content_items%rowtype;
    v_row         public.content_items%rowtype;
    v_copy_count  integer;
    v_mapped_type public.content_item_type;
    v_slug        text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    -- 1. Anroparens personliga arbetsyta (samma join-mönster som
    -- ensure_personal_workspace()) -- inte bara lita på auth.uid() blint.
    select w.* into v_ws
      from public.workspaces w
      join public.profiles p on p.workspace_id = w.id
     where p.user_id = auth.uid()
       and w.type = 'personal'
       and w.status = 'active'
     order by p.created_at
     limit 1;

    if not found then
        raise exception 'Inget personligt workspace hittades.';
    end if;

    -- 2. Källrad + åtkomst: publik för alla, workspace-synlig kräver pro.
    select * into v_source
      from public.content_items
     where id = p_source_item_id
       and module = 'kommun'
       and status = 'published'
       and (
           visibility = 'public'
           or (visibility = 'workspace' and v_ws.plan = 'pro')
       );

    if not found then
        raise exception 'Den här posten finns inte eller kräver Pro.';
    end if;

    -- 3. Dubblettkontroll: samma källa redan kopierad och inte arkiverad ->
    -- returnera den befintliga i stället för att skapa en ny.
    select * into v_existing
      from public.content_items
     where workspace_id = v_ws.id
       and module = 'valvet'
       and source_content_item_id = p_source_item_id
       and status <> 'archived';

    if found then
        return v_existing;
    end if;

    -- 4. Kvot: bara free räknas, samma icke-tidszon-explicita
    -- date_trunc('month', now()) som save_my_item_for_key redan använder.
    if v_ws.plan = 'free' then
        select count(*) into v_copy_count
          from public.content_items
         where workspace_id = v_ws.id
           and module = 'valvet'
           and source = 'catalog_copy'
           and created_at >= date_trunc('month', now());

        if v_copy_count >= 5 then
            raise exception 'Månadskvoten på 5 kopior är förbrukad. Uppgradera till Pro för obegränsad kopiering.';
        end if;
    end if;

    -- 5. Typmappning: katalogen behåller sina egna typer, bara Valv-kopian
    -- förenklas till Valvets tvåtypersmodell.
    v_mapped_type := case when v_source.type = 'assistant'
                          then 'assistant'::public.content_item_type
                          else 'prompt'::public.content_item_type end;

    -- 6. Slug, samma kollisionsloop som save_my_item_for_key.
    v_slug := app_private.slugify_candidate(v_source.title, 'valv');
    while exists (select 1 from public.content_items where workspace_id = v_ws.id and slug = v_slug) loop
        v_slug := app_private.slugify_candidate(v_source.title, 'valv') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end loop;

    perform set_config('request.jwt.claim.sub', v_ws.owner_user_id::text, true);

    -- 7. Insert: bara title/content/category/typ kopieras -- summary/audience
    -- finns på källraden men Valvets UI visar dem aldrig.
    insert into public.content_items (
        workspace_id, owner_user_id, created_by, type, module, title, slug,
        content, category, status, visibility, source, source_content_item_id
    ) values (
        v_ws.id, v_ws.owner_user_id, v_ws.owner_user_id, v_mapped_type, 'valvet',
        v_source.title, v_slug, v_source.content, v_source.category,
        'draft', 'private', 'catalog_copy', p_source_item_id
    )
    returning * into v_row;

    return v_row;
end;
$$;

revoke all on function app_private.copy_catalog_item_to_valvet(uuid) from public;

create or replace function public.copy_catalog_item_to_valvet(p_source_item_id uuid)
returns public.content_items
language sql
security definer
set search_path = ''
as $$
    select * from app_private.copy_catalog_item_to_valvet(p_source_item_id);
$$;

revoke all on function public.copy_catalog_item_to_valvet(uuid) from public;
grant execute on function public.copy_catalog_item_to_valvet(uuid) to authenticated;
```

- [ ] **Step 4: Apply the migration to staging and run the full checklist**

Apply `supabase/migrations/20260718100000_copy_catalog_item_to_valvet.sql` to the staging Supabase project (SQL editor or CLI, per this repo's existing manual-apply convention — there is no CI step that does this automatically). Then run every numbered block in `supabase/tests/verify_copy_catalog_item_to_valvet.sql` in order, substituting real staging row ids for every `<placeholder>`, authenticated as the Free test user for steps 1-4 and 7-8, and the Pro test user for steps 5-6.

Expected: every block matches its documented "Förväntat" outcome. If step 4's sixth call doesn't raise the quota error, or step 2's duplicate call inserts a second row, the migration has a bug — fix it and re-run the whole checklist before continuing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718100000_copy_catalog_item_to_valvet.sql supabase/tests/verify_copy_catalog_item_to_valvet.sql
git commit -m "feat: add copy_catalog_item_to_valvet RPC"
```

---

### Task 2: "Bläddra i Promptbanken" tab in Valvet

**Repo:** `valvet_promptbanken` (this repo)

**Files:**
- Modify: `vault.html`
- Modify: `src/vault.js`

**Interfaces:**
- Consumes: `public.copy_catalog_item_to_valvet(p_source_item_id uuid) returns public.content_items` (Task 1, called via `supabase.rpc('copy_catalog_item_to_valvet', { p_source_item_id })`). `public.published_public_content` / `public.published_workspace_content` views (existing, columns: `id, type, title, content, category, published_at` used here). Existing `state`, `setStatus`, `setErrorStatus`, `escapeHtml`, `loadItems` from `src/vault.js`.
- Produces: nothing new consumed elsewhere — this is the terminal UI for this sub-project.

**Prerequisite:** Task 1's migration must already be applied to whichever Supabase project `VITE_SUPABASE_URL` in this repo's `.env.local` points at, or the RPC call in step 3 below will fail with "function does not exist."

- [ ] **Step 1: Add the nav tab and view panel markup**

In `vault.html`, add the tab button. Find this block (around line 24-29):

```html
    <nav class="app-nav">
      <button type="button" data-view-tab="mina" class="active">Mina insättningar</button>
      <button type="button" data-view-tab="sok">Sök</button>
      <button type="button" data-view-tab="arkiv">Arkiv</button>
      <button type="button" data-view-tab="mcp">MCP-nyckel</button>
    </nav>
```

Replace it with:

```html
    <nav class="app-nav">
      <button type="button" data-view-tab="mina" class="active">Mina insättningar</button>
      <button type="button" data-view-tab="sok">Sök</button>
      <button type="button" data-view-tab="arkiv">Arkiv</button>
      <button type="button" data-view-tab="katalog">Bläddra i Promptbanken</button>
      <button type="button" data-view-tab="mcp">MCP-nyckel</button>
    </nav>
```

Then add the new view panel. Find the closing of the `arkiv` section (around line 99-110):

```html
    <section data-view-panel="arkiv" hidden>
      <div class="view-heading">
        <div>
          <h2>Arkiv</h2>
          <p class="view-heading__lede">Arkiverade insättningar ligger kvar här tills du återställer dem.</p>
        </div>
      </div>
      <div class="card">
        <div data-archive-list></div>
        <p class="status-message empty-state" data-archive-empty hidden>Arkivet är tomt.</p>
      </div>
    </section>

    <section data-view-panel="mcp" hidden>
```

Insert a new section between them, so it reads:

```html
    <section data-view-panel="arkiv" hidden>
      <div class="view-heading">
        <div>
          <h2>Arkiv</h2>
          <p class="view-heading__lede">Arkiverade insättningar ligger kvar här tills du återställer dem.</p>
        </div>
      </div>
      <div class="card">
        <div data-archive-list></div>
        <p class="status-message empty-state" data-archive-empty hidden>Arkivet är tomt.</p>
      </div>
    </section>

    <section data-view-panel="katalog" hidden>
      <div class="view-heading">
        <div>
          <h2>Bläddra i Promptbanken</h2>
          <p class="view-heading__lede">Kopiera prompts och assistenter från katalogen till ditt eget valv.</p>
        </div>
      </div>
      <div class="card">
        <div class="field" style="margin-bottom:0;">
          <label for="catalog-search">Sökterm</label>
          <input id="catalog-search" type="search" data-catalog-search-input placeholder="Titel, kategori eller innehåll..." />
        </div>
      </div>
      <p class="status-message" data-catalog-quota></p>
      <p class="status-message" data-catalog-status></p>
      <div class="card">
        <div data-catalog-list></div>
        <p class="status-message empty-state" data-catalog-empty hidden>Inga träffar.</p>
      </div>
    </section>

    <section data-view-panel="mcp" hidden>
```

No CSS changes needed — `.card`, `.field`, `.status-message`, `.item-row` etc. already exist in `style.css` and are reused as-is.

- [ ] **Step 2: Register the new view name**

In `src/vault.js`, find (around line 56):

```js
const VIEW_NAMES = ['mina', 'sok', 'arkiv', 'mcp'];
```

Replace with:

```js
const VIEW_NAMES = ['mina', 'sok', 'arkiv', 'katalog', 'mcp'];
```

- [ ] **Step 3: Add the catalog loading, rendering, copy, and quota functions**

In `src/vault.js`, find the existing search wiring block (around line 317-321):

```js
document.querySelector('[data-search-input]')?.addEventListener('input', (event) => {
  clearTimeout(searchDebounceTimer);
  const query = event.target.value;
  searchDebounceTimer = setTimeout(() => runSearch(query), 250);
});
```

Immediately after that block (and before `bootstrap().then(...)`), insert:

```js
const CATALOG_TYPE_LABELS = {
  prompt: 'Prompt',
  routine: 'Rutin',
  checklist: 'Checklista',
  guide: 'Guide',
  faq: 'FAQ',
  document: 'Dokument',
  template: 'Mall',
  assistant: 'Assistent'
};

function renderCatalogRow(item) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <div class="item-meta">
      <div class="item-title">${escapeHtml(item.title)} <span style="font-weight:400; color:var(--muted);">(${escapeHtml(CATALOG_TYPE_LABELS[item.type] || item.type)})</span></div>
      <div class="item-sub">${item.category ? escapeHtml(item.category) + ' — ' : ''}Publicerad ${new Date(item.published_at).toLocaleDateString('sv-SE')}</div>
    </div>
    <div class="item-actions"></div>
  `;

  const actions = row.querySelector('.item-actions');
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary';
  copyBtn.textContent = 'Kopiera till mitt Valv';
  copyBtn.addEventListener('click', () => copyToValvet(copyBtn, item));
  actions.appendChild(copyBtn);

  return row;
}

async function copyToValvet(button, item) {
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Kopierar...';

  const { error } = await supabase.rpc('copy_catalog_item_to_valvet', { p_source_item_id: item.id });

  button.disabled = false;
  button.textContent = originalText;

  if (error) {
    setErrorStatus('[data-catalog-status]', error, 'Kunde inte kopiera posten.');
    return;
  }

  setStatus('[data-catalog-status]', `"${item.title}" kopierad till ditt valv.`);
  await Promise.all([loadItems(), updateCatalogQuota()]);
}

async function updateCatalogQuota() {
  const quotaEl = document.querySelector('[data-catalog-quota]');
  if (!quotaEl) return;

  if (state.workspace?.plan !== 'free') {
    quotaEl.textContent = 'Obegränsad kopiering (Pro).';
    return;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', state.workspace.id)
    .eq('module', 'valvet')
    .eq('source', 'catalog_copy')
    .gte('created_at', startOfMonth.toISOString());

  if (error) {
    quotaEl.textContent = '';
    return;
  }

  quotaEl.textContent = `${count ?? 0} av 5 kopior denna månad.`;
}

async function loadCatalog(query = '') {
  const view = state.workspace?.plan === 'pro' ? 'published_workspace_content' : 'published_public_content';
  let request = supabase.from(view).select('id, type, title, content, category, published_at');

  const trimmed = query.trim();
  if (trimmed) {
    const like = `%${trimmed}%`;
    request = request.or(`title.ilike.${like},content.ilike.${like},category.ilike.${like}`);
  }

  const { data, error } = await request.order('published_at', { ascending: false });

  const list = document.querySelector('[data-catalog-list]');
  const empty = document.querySelector('[data-catalog-empty]');
  list.innerHTML = '';

  if (error) {
    setErrorStatus('[data-catalog-empty]', error, 'Kunde inte ladda katalogen.');
    empty.hidden = false;
    return;
  }

  if (!data.length) {
    empty.hidden = false;
    empty.classList.remove('is-error');
    empty.textContent = 'Inga träffar.';
  } else {
    empty.hidden = true;
    data.forEach((item) => list.appendChild(renderCatalogRow(item)));
  }

  await updateCatalogQuota();
}

let catalogSearchDebounceTimer = null;

document.querySelector('[data-catalog-search-input]')?.addEventListener('input', (event) => {
  clearTimeout(catalogSearchDebounceTimer);
  const query = event.target.value;
  catalogSearchDebounceTimer = setTimeout(() => loadCatalog(query), 250);
});

document.querySelector('[data-view-tab="katalog"]')?.addEventListener('click', () => {
  loadCatalog(document.querySelector('[data-catalog-search-input]')?.value || '');
});
```

- [ ] **Step 4: Manual verification against a real Supabase project**

This codebase has no automated JS test runner (`package.json` has no `test` script) — UI verification is manual, via the dev server and a browser, same as done earlier in this session for `login.html`/`planer.html`.

Start the dev server:

```bash
npm run web:dev
```

Expected output includes a `Local:` URL (e.g. `http://localhost:5175/`).

In a browser: log in with a Free-plan test account, navigate to `vault.html`, click the "Bläddra i Promptbanken" tab. Confirm:
- The catalog list loads (rows from `published_public_content`) with a type badge and a "Kopiera till mitt Valv" button per row.
- "0 av 5 kopior denna månad." shows above the list.
- Typing in the search box filters the list after ~250ms.
- Clicking "Kopiera till mitt Valv" on a row shows `"<title>" kopierad till ditt valv.`, the quota line increments, and the copied item now appears under "Mina insättningar".
- Clicking the same row's copy button again still shows the success message (dedup returns the existing row) and does **not** create a second entry in "Mina insättningar".

Log in with a Pro-plan test account and confirm the quota line instead reads "Obegränsad kopiering (Pro)." and the list includes workspace-visible (non-public) catalog rows.

Stop the dev server when done (matches how earlier verification in this session was cleaned up — find and stop the `node` process running `vite` for this repo, not any other project's dev server).

- [ ] **Step 5: Commit**

```bash
git add vault.html src/vault.js
git commit -m "feat: add Bläddra i Promptbanken tab for copying catalog items into Valvet"
```
