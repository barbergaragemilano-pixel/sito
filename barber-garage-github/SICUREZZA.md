# Stato delle protezioni

La landing non usa più support.js, React o Babel. Tema e lingua sono gestiti da
site.js; gli effetti hover sono CSS. Il vecchio support.js non è caricato e non
è incluso nel pacchetto pubblico.

Il file _headers configura Cloudflare Pages per consentire solo script locali,
senza eval o script inline; impedisce embedding in frame, interpretazione MIME
alternativa e accesso a fotocamera, microfono e geolocalizzazione. Google Fonts
e l'iframe di Google Maps restano consentiti. Gli stili inline sono ancora
necessari al layout. Questi header NON sono applicati da VS Code Live Server:
vanno verificati sulle risposte HTTP dopo la pubblicazione su Cloudflare.

## Pubblicazione provvisoria del solo sito

Usare `node build-public.mjs` e pubblicare esclusivamente `dist`.
In Cloudflare Pages: root della versione-2, comando `node build-public.mjs`,
output `dist`. Lo script richiede una directory dist non ancora esistente per
evitare di includere vecchi file per errore.

La build esclude pannello admin, runtime precedente, file di lavoro e impostazioni
locali. Disabilita gli override localStorage nel sito distribuito. Include una
pagina 404 esplicita. Non sostituisce autenticazione o autorizzazione.

ATTENZIONE: la build provvisoria usa il catalogo iniziale e gli orari predefiniti,
non le modifiche del browser. Prima di pubblicarla devono essere confermati o
trasferiti i dati aggiornati. La build provvisoria non è stata pubblicata. Per il backend operativo usare la build completa descritta sotto.

## Backend online preparato

Il backend in server/worker.mjs verifica firma dei token Cloudflare Access,
email autorizzata, origine delle scritture, dati e limiti upload. D1 conserva
dati e storico; R2 conserva le foto. La build completa è `node build-cloud.mjs`.
Senza configurazione Access o token valido il pannello e le API admin restano
inaccessibili. Vedere CLOUDFLARE.md per attivare i servizi. I test con firme RSA
e SQLite sono passati; la build completa è stata eseguita. Restano la verifica
su Cloudflare reale e la prova browser. Nessuna credenziale va nel repository.

Verifiche eseguite: struttura HTML, file collegati, assenza di direttive del vecchio
runtime, comportamento tema/lingua con DOM simulato. Restano la prova browser e
la verifica degli header nell'ambiente Cloudflare. Non è un penetration test.
