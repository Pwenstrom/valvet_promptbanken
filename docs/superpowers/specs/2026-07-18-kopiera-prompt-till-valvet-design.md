# Kopiera prompt → Valvet — design

## Syfte

Delprojekt 2 av 6 i den större Promptbanken/Valvet-visionen (se
[2026-07-18-plans-page-design.md](2026-07-18-plans-page-design.md) för
bakgrund om planerna, och konversationens brainstorm för hela
prioritetslistan). Promptbanken är den kurerade katalogen; Valvet är
användarens privata arbetsbank. Detta delprojekt låter en Valvet-användare
kopiera en enskild post ur katalogen till sitt eget valv som en fristående,
redigerbar kopia — utan synk tillbaka till originalet.

Ur scope: aktivera/avaktivera promptpaket (delprojekt 3), MCP-exponering av
katalogsökning (delprojekt 4), rollbaserade rekommendationer (delprojekt 5).

## Bakgrund: bekräftad datamodell

Verifierat direkt mot `promptbanken`-repots migrationer (inte antaget):

- `public.content_items` är en delad tabell över hela ekosystemet, med en
  `module`-kolumn begränsad till `'kommun'` eller `'valvet'`
  (`20260716100000_valvet_module_and_write_log.sql`). Katalogens modul heter
  historiskt `'kommun'`, inte `'promptbanken'`.
- Katalogposter: `module='kommun'`, `status='published'`, `visibility` är
  `'public'` eller `'workspace'`.
- Två read-views finns redan och är redan grant:ade
  (`20260612122000_public_views.sql`):
  - `public.published_public_content` — bara `visibility='public'`, grant till
    `anon, authenticated`.
  - `public.published_workspace_content` — `visibility in ('workspace',
    'public')`, grant till `authenticated`. Detta är en superset av
    public-vyn.
- Valvets egna poster: `module='valvet'`, `visibility='private'` (enda
  tillåtna värdet, `20260716101000_valvet_item_limit_trigger.sql`), gräns
  50 (free) / 1000 (pro) aktiva poster, redan enforced av triggern
  `enforce_vault_item_limit`.
- `content_items.source` finns redan (`'manual' | 'chat_extraction'`,
  `20260712100000_save_prompt_for_key.sql`) och används för proveniens.
- Etablerat RPC-mönster: `SECURITY DEFINER`, `set search_path = ''`, alla
  referenser i funktionskroppen fullt schemakvalificerade
  (`public.content_items`, `app_private.xxx`) — se
  `20260717090000_valvet_write_rpcs_search_path_hardening.sql`. Inbyggda
  funktioner (`now`, `date_trunc`, `gen_random_uuid`, `coalesce`, `trim`,
  `length`) ligger i `pg_catalog`, alltid implicit sökbara oavsett
  `search_path`.
- Två auktoriseringsmönster finns i kodbasen: nyckelhash-baserat (MCP-anrop,
  t.ex. `save_my_item_for_key`) och `auth.uid()`-baserat (inloggad
  webb-session, t.ex. `ensure_personal_workspace()`). Denna funktion är
  webb-UI-triggad, så den använder `auth.uid()`-mönstret.

## Affärsmodell (redan bekräftad i tidigare beslut)

- **Free**: ser bara `published_public_content`. Kopior begränsade till
  5/månad, separat räknare från MCP:s "spara 5/månad"-kvot.
- **Pro**: ser `published_workspace_content` (superset). Obegränsad
  kopiering.
- 50/1000-gränsen för aktiva Valvet-poster gäller redan alla nya poster
  oavsett källa (befintlig trigger), ingen ändring behövs där.

## Datamodellsändring (ny migration i `promptbanken`-repot)

```sql
alter table public.content_items
    add column if not exists source_content_item_id uuid
        references public.content_items(id) on delete set null;

alter table public.content_items
    drop constraint if exists content_items_source_check;
alter table public.content_items
    add constraint content_items_source_check
        check (source in ('manual', 'chat_extraction', 'catalog_copy'));
```

`source_content_item_id` är nullable och `on delete set null` — om
originalposten senare tas bort förlorar kopian bara spårningen, den
förblir intakt. Kolumnen behövs redan nu för en uttalad framtida Pro-funktion
("jämförelse mellan egen kopia och uppdaterat original") — billigare att
lägga till nu än att backfilla senare.

## Ny RPC: `public.copy_catalog_item_to_valvet(p_source_item_id uuid)`

`SECURITY DEFINER`, `set search_path = ''`, `auth.uid()`-baserad, grant till
`authenticated` (inte `anon` — kräver inloggad session).

Steg:

1. **Workspace-koppling**: slå upp anroparens personliga arbetsyta via
   `profiles`/`workspaces`-join på `auth.uid()` — samma mönster som
   `ensure_personal_workspace()` — inte bara lita på `auth.uid()` direkt:
   ```sql
   select w.* into v_ws
     from public.workspaces w
     join public.profiles p on p.workspace_id = w.id
    where p.user_id = auth.uid() and w.type = 'personal' and w.status = 'active'
    order by p.created_at limit 1;
   if not found then raise exception 'Inget personligt workspace hittades.'; end if;
   ```
2. **Källrad + åtkomst**: slå upp `p_source_item_id` i `content_items` där
   `module='kommun'` och `status='published'`, och antingen
   `visibility='public'`, eller `visibility='workspace'` och
   `v_ws.plan='pro'`. Annars: `raise exception 'Den här posten finns inte
   eller kräver Pro.'`.
3. **Dubblettkontroll**: om en icke-arkiverad rad redan finns i `v_ws.id`
   med `source_content_item_id = p_source_item_id`, returnera den existerande
   raden direkt (ingen ny insert). Samma idempotens-anda som
   `save_my_item_for_key`s `idempotency_key`, men nyckeln är källraden i
   stället för ett klientgenererat UUID. Arkiverar användaren kopian går det
   att kopiera in på nytt.
4. **Kvot (bara free)**: om `v_ws.plan = 'free'`, räkna `content_items` där
   `workspace_id = v_ws.id`, `module='valvet'`, `source='catalog_copy'`,
   `created_at >= date_trunc('month', now())`. Om `>= 5`: `raise exception`.
   `date_trunc('month', now())` utan explicit tidszon — identisk konstruktion
   som `save_my_item_for_key`s befintliga 5/månad-kvot, databasens
   defaulttidszon (UTC på Supabase) avgör, medvetet konsekvent med befintlig
   kod snarare än en ny konvention.
5. **Typmappning**: källans `type = 'assistant'` → `'assistant'`, alla andra
   katalogtyper (`prompt`, `routine`, `checklist`, `guide`, `faq`,
   `document`, `template`) → `'prompt'`. Katalogen behåller sina egna typer
   overkligen; bara Valv-kopian förenklas till Valvets tvåtypersmodell.
6. **Fältkopiering**: bara `title`, `content`, `category` och (mappad)
   `type` kopieras. `summary`/`audience` finns på källraden men Valvets UI
   visar dem aldrig (`vault.js`s `loadItems`/`renderItemRow` hämtar och
   renderar aldrig de fälten) — kopieras inte, skulle bli osynlig död data.
7. **Insert**: `module='valvet'`, `visibility='private'`, `status='draft'`,
   `owner_user_id`/`created_by = v_ws.owner_user_id`, `source='catalog_copy'`,
   `source_content_item_id = p_source_item_id`, slug via befintligt
   `app_private.slugify_candidate(title, 'valv')`-mönster (samma
   kollisionsloop som `save_my_item_for_key`). Den befintliga
   `enforce_vault_item_limit`-triggern körs automatiskt och stoppar vid
   50/1000-gränsen — ingen dubblerad kontroll i denna funktion.
8. Returnerar den nya (eller vid dubblett: existerande) `content_items`-raden.

## Valvet UI (detta repo)

- Ny flik **"Bläddra i Promptbanken"** i `vault.html`, femte posten i
  `VIEW_NAMES` (`vault.js`) vid sidan av `mina`/`sok`/`arkiv`/`mcp`.
- Läser `published_public_content` (free) eller `published_workspace_content`
  (pro — superset, ingen extra fråga behövs för att inkludera public).
- Textsökning: samma `ilike`-mönster på titel/innehåll/kategori som
  befintlig `runSearch`, men mot katalogvyn i stället för `content_items`
  direkt.
- Per rad: titel, katalogens egen typ som badge (t.ex. "Guide",
  "Checklista" — inte tvingad till prompt/assistant i visningen), knappen
  **"Kopiera till mitt Valv"**.
- Knappen anropar `supabase.rpc('copy_catalog_item_to_valvet', {
  p_source_item_id })`. Vid lyckat svar: statusmeddelande, uppdatera "Mina
  insättningar"-räknaren (samma `loadItems()`-anrop som redan finns).
- Free-läge visar "X av 5 kopior denna månad" ovanför listan, beräknat
  klientsidan från samma count-logik som RPC:n använder (eller ett enkelt
  extra RPC-anrop om exakthet krävs — avgörs i implementationsplanen).

## Felhantering

Alla `raise exception`-meddelanden i RPC:n är redan på svenska och
användarvänliga (mönster från övriga Valvet-RPC:er). `vault.js` fångar
Supabase-felet och visar `error.message` direkt via befintlig
`setErrorStatus`-hjälpfunktion — inget nytt felhanteringsmönster behövs.

## Utanför scope

- Ingen synk tillbaka till originalet — kopian är en engångssnapshot.
  "Jämförelse mot uppdaterat original" är en uttalad framtida Pro-funktion,
  förberedd via `source_content_item_id` men inte byggd nu.
- Ingen ändring av `content_item_type`-enumen eller Valvets egen
  save/redigerings-UI — kopian mappas ner till Valvets befintliga
  tvåtypersmodell vid infogning.
- Promptpaket (aktivera/avaktivera) är delprojekt 3, separat spec.
- MCP-exponering av kopieringsfunktionen är delprojekt 4, separat spec —
  denna RPC är `auth.uid()`-baserad (webb-session) och skulle behöva en
  nyckelhash-baserad syskonfunktion för MCP, i linje med hur
  `save_my_item_for_key` skiljer sig från `ensure_personal_workspace()`.
