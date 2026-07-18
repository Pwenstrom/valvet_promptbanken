# Plansida för Valvet — design

## Syfte
`login.html` länkar idag till `https://promptbanken.se/planer.html`, som 404:ar (den siten har byggts om till en ekosystem-väljare utan egen planer-sida). Valvet behöver en egen plansida med sina faktiska gränser, och länken behöver fixas.

## Omfattning
- Ny statisk sida `planer.html` i repo-roten, samma mönster som `login.html` (fristående head, `style.css`, ingen koppling till vault-SPA:n).
- Länkas bara från `login.html`. Ingen länk läggs till i `vault.html`/app-headern.
- Innehåll återanvänder exakt de gränser som redan står i `login.html`s `.auth-plan-compare`:
  - **Free**: 50 insättningar, 1 MCP-nyckel, spara via MCP (5/månad), ej uppdatera/arkivera via MCP.
  - **Pro**: 1000 insättningar, 3 MCP-nycklar, spara obegränsat via MCP, uppdatera & arkivera via MCP.
- Ingen betallogik finns i kodbasen (ingen tier-kontroll, ingen Stripe/checkout) — Pro är alltså inte köpbart idag.

## Layout
- Header: vault-mark + "Valvet"-wordmark, länk till `login.html`.
- Rubrik "Planer och priser" + kort ingress.
- Två kort sida vid sida (Free, Pro), i stil med `kommun.promptbanken.se/planer.html` men bara två tier (inte fem — de andra tierna hör till kommun-produkten, inte Valvet):
  - Pris, kort pitch-mening, full feature-lista (✓/✗), CTA-knapp.
  - Pro-kortet har en "Kommer snart"-badge och dess CTA är disabled med texten "Kommer snart".
  - Free-kortets CTA "Skapa konto" länkar till `login.html` (signup-läge, dvs `login.html#signup` eller motsvarande hook som `auth-mode-switch` redan lyssnar på).

## Styling
- Ny CSS-sektion i `style.css`, byggd på befintliga tokens (`--brass`, `--brass-light`, `--panel`, `--border`, `--radius`) — ingen ny palett.
- Pro-kortets guldaccent återanvänder samma `rgba(217,184,118, …)`-mönster som redan lagts till för `.auth-plan-col--pro` på login-sidan.

## Ändring i login.html
- `<a href="https://promptbanken.se/planer.html">` → `<a href="planer.html">`.

## Utanför scope
- Ingen betal-/uppgraderingslogik.
- Ingen länk från vault.html eller app-headern.
- Ingen ändring av de faktiska Free/Pro-gränserna (siffrorna är redan produktbeslut, tas som givna).
