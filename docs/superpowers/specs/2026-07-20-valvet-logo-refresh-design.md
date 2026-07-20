# Valvet logo refresh — design

## Syfte
Nuvarande Valvet-symbol riskerar att läsas som en könssymbol i stället för ett valv/lås. Symbolen behöver därför bytas ut utan att ordmärket `Valvet` eller den övriga visuella identiteten görs om.

## Mål
- Ge Valvet en tydligare symbol som direkt läses som ett valv.
- Behålla nuvarande ordmärke och typografi.
- Behålla den befintliga guldfärgen och den övergripande premiumkänslan.
- Säkerställa att symbolen fungerar i liten storlek i header och loginvy.

## Omfattning
- Byt endast symbolen i den inline-SVG som idag används tillsammans med ordmärket `Valvet`.
- Uppdatera alla ställen i kodbasen där samma Valvet-symbol används.
- Ingen ändring av texten `Valvet`.
- Ingen ändring av färgpalett, layout eller övrig branding.

## Designriktning
Den nya symbolen ska föreställa en faktisk valvdörr i frontvy.

### Form
- Ytterformen ska vara en valvdörr med tydlig ram.
- Formen får gärna vara lätt rundad i hörnen, men ska inte uppfattas som en medaljong eller fristående cirkelsymbol.

### Kärnmotiv
- Symbolen ska ha en liten, tydlig nyckel placerad centralt i dörren.
- Nyckeln ska ritas geometriskt och enkelt.
- Nyckeln ska vara horisontell eller lätt vinklad för att undvika att läsas som en kroppslik eller könskodad ikon.

### Detaljnivå
- Symbolen ska vara strikt och enkel.
- Högst 3–4 huvudelement bör användas:
  - yttre dörrform
  - inre ram eller dörrpanel
  - central nyckel
  - eventuellt 1–2 små mekaniska detaljer som bultar eller gångjärnspunkter
- Undvik ornament, skuggor och små detaljer som försvinner i liten storlek.

### Stil
- Samma guldfärg som nuvarande symbol används.
- Linjearbetet ska vara rent och konsekvent, med tunn till medelgrov stroke.
- Symbolen ska kännas modern, strikt och förtroendeingivande snarare än dekorativ.

## Tekniska krav
- Symbolen implementeras som inline-SVG, i samma användningsmönster som den nuvarande loggan.
- SVG:n ska fungera i befintliga containers utan att nya layoutregler krävs.
- Samma symbol ska användas konsekvent i `login.html`, `vault.html` och eventuella övriga återanvändningar av Valvet-märket.

## Acceptanskriterier
- Symbolen läses tydligt som en valvdörr vid första anblick.
- Symbolen kan inte rimligen förväxlas med en könssymbol.
- Ordmärket `Valvet` är oförändrat.
- Symbolen fungerar visuellt både i större hero-/loginläge och i liten headerstorlek.
- Ingen övrig branding eller sidlayout behöver justeras för att den ska fungera.

## Utanför scope
- Ny typografi eller nytt ordmärke.
- Ny färgpalett.
- Full varumärkesöversyn.
- Nya illustrationer eller ikonfamiljer för resten av produkten.
