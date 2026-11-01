# Pannello locale

Aprire `admin/index.html` con Live Server (Go Live). Non serve installare dipendenze.

Gestisce servizi e prodotti: aggiunta, modifica, eliminazione con conferma, nome,
descrizione, sezione e prezzo. Per creare una sezione basta scriverne il nome.
Le sezioni senza voci scompaiono automaticamente. Le foto dei prodotti vengono
ridimensionate a un massimo di 1000 pixel e salvate come JPEG.

Il catalogo iniziale contiene le voci della landing page, inclusa la promozione
del mattino. Le categorie dei prodotti sono iniziali e modificabili.

I dati vengono conservati in localStorage sul browser e sull'indirizzo usato
(host e porta). Aggiornano la landing page locale nello stesso browser, host e porta, anche nelle schede aperte. Usare il collegamento Apri sito del pannello. Non modificano gli HTML o il sito pubblico remoto. I testi del catalogo sono mostrati come inseriti, senza traduzione automatica. Cancellare i dati
del browser elimina le modifiche locali. Il pulsante di esportazione scarica
un JSON con dati e immagini; non è ancora previsto il ripristino dal pannello.

In Go Live questa pagina funziona senza autenticazione e salva nel browser.
Per l'uso online eseguire `build-cloud.mjs` e seguire `../CLOUDFLARE.md`:
il backend usa Cloudflare Access, D1 e R2. Non pubblicare direttamente i sorgenti
come sito statico con admin operativo. Il pulsante “Scarica catalogo e orari”
esporta entrambi; il pannello online permette di importare questo file.
