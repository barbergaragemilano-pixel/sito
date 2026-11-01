# GitHub e Cloudflare: attivazione

Repository previsto: https://github.com/barbergaragemilano-pixel/sito
Amministratore previsto: barbergaragemilano@gmail.com

Il backend è pronto nel codice ma non è ancora distribuito. Non occorre Supabase.
Cloudflare Access autentica il proprietario; il Worker verifica firma JWT,
scadenza, issuer, audience e whitelist email su tutti i percorsi admin/API admin.
Senza configurazione o token valido, rifiuta l'accesso. Non esiste un bypass di
autenticazione per il backend, nemmeno in locale.

## 1. Conservare i dati locali

Aprire il pannello con lo stesso Go Live/browser usato finora. Premere
**Scarica catalogo e orari**. Conservare il JSON fuori dal repository: contiene
le modifiche e le foto locali. I file sorgente contengono solo il catalogo iniziale.

## 2. Repository e build

Caricare il CONTENUTO della cartella `versione-2` nella root del repository.
Non caricare dist, credenziali, .dev.vars, node_modules o esportazioni dei dati.
Il file .gitignore include le esclusioni essenziali.

Creare Cloudflare Pages e collegare il repository GitHub:

- Branch: main.
- Framework: nessuno.
- Comando build: `node build-cloud.mjs`.
- Output: `dist`.
- Node: versione 24 (variabile di build NODE_VERSION=24).
- Se si carica l'intero workspace, root: `Barber Garage Milano landing page/versione-2`.

La build è senza dipendenze npm. Include il Worker advanced-mode, il pannello,
gli asset selezionati e gli header. Il vecchio build-public.mjs resta solo per
una pubblicazione temporanea SENZA pannello: non usarlo per l'attivazione completa.
La build rifiuta una dist già presente per evitare file residui; Cloudflare usa
checkout puliti. Per una seconda build locale usare un checkout/cartella pulita.

## 3. Database e foto

Nel dashboard Cloudflare creare:

- Un database D1, ad esempio `barber-garage`.
- Un bucket R2 privato, ad esempio `barber-garage-foto`.

Nel database eseguire prima `server/schema.sql`, poi `server/seed.sql`.
Il seed inizializza catalogo e orari senza sovrascrivere documenti già esistenti.

In Pages > Settings > Bindings aggiungere:

- D1 binding **DB** → database appena creato.
- R2 binding **PHOTOS** → bucket appena creato.

Non rendere pubblico il bucket: le immagini vengono servite dal Worker tramite
`/media/<uuid>.jpg`. Non collegare preview non fidate al database di produzione.

## 4. Cloudflare Access

Nel dashboard Cloudflare One configurare il team e un'applicazione self-hosted
che protegga questi percorsi dello STESSO hostname Pages di produzione:

- `/admin` e `/admin/*`
- `/api/admin/*`

Usare una sola applicazione con questi percorsi, per condividere l'audience.
Configurare login con codice email (One-time PIN) e policy Allow limitata a
**barbergaragemilano@gmail.com**. Non impostare policy Bypass o Allow Everyone.
Il sito pubblico `/` e le letture `/api/catalog`, `/api/hours` restano pubblici.

In Pages > Settings > Variables aggiungere per l'ambiente Production:

| Nome | Valore |
|---|---|
| ACCESS_ISSUER | https://NOME-TEAM.cloudflareaccess.com (senza slash finale) |
| ACCESS_AUD | Application Audience (AUD) dell'applicazione Access |
| ADMIN_EMAILS | barbergaragemilano@gmail.com |

Questi valori non sono password. Non configurare preview con permessi di scrittura
sul database di produzione. Dopo i binding e le variabili, ridistribuire la build.
Un futuro dominio personalizzato dovrà avere gli stessi percorsi protetti da Access.

## 5. Trasferire i dati e verificare

1. Aprire `https://NOME-PROGETTO.pages.dev/admin/` e accedere con l'email autorizzata.
2. Importare il JSON tramite **Trasferisci i dati salvati dal pannello locale**.
3. Le foto sono caricate su R2; catalogo e orari vengono salvati in D1.
4. Aprire il sito in un altro browser senza login e verificare prezzi, foto e orari.
5. Verificare che il pannello richieda Access e che chiamate API senza token siano respinte.
6. Provare modifica di un servizio, foto e orari, quindi logout tramite **Esci**.

L'importazione salva prima il catalogo e poi gli orari; se il secondo passaggio
fallisce, il pannello lo segnala. Non chiudere la pagina durante il trasferimento.
Il normale catalogo locale resta utilizzabile con Go Live; il flag online viene
aggiunto solo dalla build, quindi online non si usa localStorage come database.

## Copie e limiti

Ogni modifica di un documento salva automaticamente la versione precedente in
`document_history`, nella stessa transazione tramite trigger D1. Questo storico
non sostituisce una copia esterna: esportare periodicamente D1 e conservare copie
del bucket R2. Le foto vecchie non vengono cancellate automaticamente, per non
rompere storico ed esportazioni. Le esportazioni online contengono URL delle foto,
non una copia completa del bucket.

Limiti: massimo 300 servizi e 300 prodotti, 2 MB per JPEG dopo ridimensionamento,
due fasce orarie per giorno, controllo della versione prima di sovrascrivere.
I testi del catalogo non vengono tradotti automaticamente.

## Test

`node --test server/worker.test.mjs` (Node 24; SQLite integrato).

I test usano firme RSA reali e un database SQLite in memoria. Coprono rifiuto
accessi anonimi/token falsi/scaduti/email errate, CSRF, prezzi e orari invalidi,
foto, conflitti e backup. Non sostituiscono la prova finale su D1/R2/Access reali.

Documentazione:
- https://developers.cloudflare.com/pages/functions/advanced-mode/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/d1/worker-api/
