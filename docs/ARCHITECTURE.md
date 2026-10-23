# Neon Bracket — architettura

## 1. Obiettivi

- Gioco pubblico, giocabile da qualsiasi dispositivo, senza account.
- Solo il proprietario può aggiungere contenuti (categorie, temi) e usare l'AI.
- Facile da estendere: aggiungere una categoria o un tema non deve richiedere codice.
- Niente over-engineering: zero dipendenze runtime, niente build step, un solo processo.

## 2. Struttura

```
index.html            entry point (carica src/main.js come ES module)
src/
  core/               logica pura, senza DOM né rete → testata con node:test
    bracket.js        torneo a eliminazione diretta (replay delle scelte)
    catalog.js        modello categoria: validazione, filtri Pokémon, normalizzazione voci
    stats.js          statistiche del giocatore
    votes.js          voto della chat Twitch: parsing IRC, un voto per spettatore
    theme.js          modello tema: validazione, variabili CSS
  services/           I/O del browser
    api.js            client del server (tutto "fail soft")
    catalog.js        carica categorie da /categories + server
    themes.js         carica e applica i temi
    images.js         risolve le immagini (PokeAPI, Wikipedia con batch + cache)
    twitch.js         connessione anonima in sola lettura alla chat Twitch
    storage.js        localStorage JSON, mai eccezioni
  ui/
    dom.js            html`` con escaping automatico, immagini lazy, toast
    share.js          immagine del risultato su canvas
    views/            una vista per schermata: home, setup, match, result, stats, admin
  game.js             partita in corso (persistita)
  i18n.js             testi IT/EN
  main.js             shell + router su hash
server/
  index.mjs           avvio e configurazione da variabili d'ambiente
  app.mjs             handler HTTP: file statici + API JSON
  store.mjs           collezioni su file JSON con scrittura atomica
  claude.mjs          integrazione Claude (categorie, style transfer)
categories/           categorie incluse (JSON) + index.json
themes/index.json     i 10 temi inclusi (JSON)
data/pokemon.json     dataset Pokémon precalcolato (1214 voci, ~80 KB)
scripts/build_pokemon.py  rigenera il dataset dai CSV di PokeAPI
assets/               CSS, font self-hosted, icone
tests/                node --test, nessuna dipendenza
```

## 3. Come si parlano i pezzi

```
                 ┌─────────────────────── tuo PC (Docker) ───────────────────────┐
 browser ──HTTPS──► Cloudflare Tunnel ──► server Node ──► storage/*.json        │
   │                                         │  (statici + /api)                 │
   │                                         └──► api.anthropic.com (solo admin) │
   │             └────────────────────────────────────────────────────────────────┘
   ├──► raw.githubusercontent.com  (artwork Pokémon)
   └──► en.wikipedia.org / upload.wikimedia.org  (copertine dei giochi)

 GitHub Pages: stessa app statica, senza /api → si gioca con le categorie della repo.
```

## 4. Scelte e motivazioni

**JavaScript "vanilla" con ES modules, senza framework né build.**
L'interfaccia ha sei schermate e poco stato. Un framework aggiungerebbe dipendenze, un build step e aggiornamenti da inseguire. Il codice gira così com'è nel browser e su Node, e si legge senza conoscere un framework. La sicurezza dell'HTML è garantita da `html```, che fa l'escaping di ogni valore interpolato.

**Il torneo è `{ entrants, choices }` e tutto il resto si ricava rifacendo le scelte.**
Round corrente, scontro, classifica e statistiche sono funzioni pure di quell'oggetto. Ne seguono quattro vantaggi: l'annulla è `choices.pop()`; lo stato salvato è minuscolo e non può diventare incoerente; i test sono deterministici; riprendere la partita dopo un refresh è gratis. Quando i partecipanti non sono una potenza di 2 c'è un turno preliminare, così i turni successivi sono sempre bilanciati.

**Dati Pokémon precalcolati, non chiamate a PokeAPI.**
Filtrare per tipo richiederebbe oltre mille chiamate. Uno script trasforma i CSV pubblici di PokeAPI in un JSON da 80 KB con id, nome, generazione, tipi e tag (`legendary`, `mythical`, `starter1/2/3`, `pseudo`, `ultrabeast`, `paradox`, `mega`, `gmax`, `regional`…). Il browser filtra in locale in pochi millisecondi. I gruppi che PokeAPI non segnala (starter, pseudo, paradosso…) sono liste esplicite e commentate nello script.

**Categorie come dati.**
Una categoria è un filtro sul dataset Pokémon (`source`) oppure una lista di voci (`items`). Le voci hanno un'immagine diretta, un id Pokémon o un titolo Wikipedia. La stessa funzione `validateCategory` gira nei test, nel browser e nel server: un solo contratto.

**Temi come dati, non come CSS.**
Un tema sceglie 8 colori, 2 font tra quelli inclusi e alcuni effetti da un elenco chiuso (sfondo, titolo, ombre, angoli, bordi). Ogni effetto è scritto una sola volta in `style.css` ed è attivato da attributi `data-*` su `<html>`. Questo rende lo style transfer sicuro: Claude non può iniettare CSS, perché i colori devono essere `#rrggbb` e tutto il resto viene da elenchi. Rende anche facile aggiungere un tema: basta scrivere un JSON.

**Server Node senza dipendenze.**
`node:http` basta per file statici e sei endpoint JSON. Niente Express significa niente `npm install`, un'immagine Docker piccola e meno superficie d'attacco. `createApp` riceve storage, config e client AI come parametri (dependency injection), quindi nei test si usa un Claude finto.

**Storage su file JSON.**
Le categorie e i temi pubblicati dall'admin sono al massimo centinaia di record. Un file per collezione, con scrittura atomica (file temporaneo + rename) e scritture serializzate, è sufficiente e si fa il backup copiando un file. Se un giorno servisse di più, `store.mjs` ha un'interfaccia da 4 metodi da reimplementare con SQLite.

**Statistiche locali per giocatore.**
Ogni giocatore vede le proprie classifiche, salvate nel suo browser. Niente account, niente dati personali sul server, niente GDPR da gestire.

**AI solo per l'admin, chiave solo sul server.**
Ogni chiamata a Claude costa. Il browser non vede mai la chiave: manda il token admin al server, che lo verifica e poi chiama Claude. Le risposte dell'AI passano dalla stessa validazione di qualsiasi altro input, e l'admin rivede la bozza prima di pubblicarla.

**Immagini caricate a runtime, non nella repo.**
Nella repo non c'è nessuna immagine protetta. Gli artwork arrivano da PokeAPI/sprites, le copertine da Wikipedia: richieste a blocchi da 50 titoli, con `pilicense=any` per includere le copertine non libere, e risultati in cache in localStorage. Le immagini dello scontro successivo vengono precaricate. Se un'immagine manca, compare un monogramma nello stile del tema.

**Modalità streamer senza server.**
La chat di Twitch si legge via WebSocket con il login anonimo `justinfan`, direttamente dal browser dello streamer: niente OAuth, niente costi, niente carico sul tuo PC. Vale un voto per spettatore per scontro (conta l'ultimo); alla scadenza vince la maggioranza, e in caso di pareggio decide lo streamer. Il parsing e il conteggio sono funzioni pure in `core/votes.js`, testate anche con un WebSocket finto.

**Guadagno leggero.**
Un solo link opzionale a una pagina donazioni (`supportUrl` in `config.json`), mostrato nel footer e sotto il campione. Niente pubblicità né abbonamenti: monetizzare direttamente contenuti Pokémon è esattamente ciò che attira l'attenzione dei detentori dei diritti. Il footer mostra sempre il disclaimer "progetto amatoriale non affiliato".

**Immagini cercate dal server.**
Per le voci senza immagine fissa (Frutti del Diavolo, tecniche, personaggi) il browser chiede a `/api/image`. Il server prova in ordine la wiki Fandom della serie (titolo inglese della pagina, poi il personaggio), MyAnimeList via Jikan e Wikipedia. Salva le risposte in `storage/images.json` e serve l'immagine tramite `/api/img`, un proxy limitato a tre host noti, così il browser non dipende da CORS o da limiti sui link diretti. Senza server (GitHub Pages) il browser fa da solo una versione ridotta della stessa ricerca. Se tutte le fonti falliscono compare un'immagine generata, quindi una carta non resta mai vuota. Per capire perché un'immagine manca si apre `/api/image?...&debug=1`, che mostra cosa ha risposto ogni fonte.

**PWA.**
Il service worker usa la rete come prima scelta per i file dell'app, così gli aggiornamenti arrivano subito, e la cache come prima scelta per le immagini, che non cambiano mai. Non mette mai in cache `/api`.

## 5. Sicurezza

- Token admin confrontato a tempo costante (hash SHA-256 + `timingSafeEqual`); almeno 16 caratteri, altrimenti il server non parte.
- Limite di 10 tentativi falliti ogni 15 minuti per IP.
- Il server serve solo una whitelist di cartelle; `server/`, `.git`, `storage/` e `.env` non sono raggiungibili. Il path traversal è coperto da test.
- I body JSON hanno un limite di 256 KB (6 MB per l'immagine dello style transfer); i campi delle categorie e dei temi sono filtrati da una whitelist prima di essere salvati.
- CORS chiuso di default; si apre solo alle origini elencate in `ALLOWED_ORIGINS`.
- Header `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- Tutto l'HTML è generato con escaping automatico.
- Il link "Admin" compare solo dove il token è salvato, ma la protezione vera è sul server.

## 6. Come estendere

### Aggiungere una categoria

Crea `categories/mia-categoria.json` e aggiungilo a `files` in `categories/index.json`:

```json
[
  {
    "id": "boss-souls",
    "group": "games",
    "name": { "it": "Boss dei Souls", "en": "Souls bosses" },
    "description": { "it": "I più iconici.", "en": "The most iconic ones." },
    "cover": { "wiki": "Dark Souls (video game)" },
    "items": [
      { "name": "Artorias", "sub": "Dark Souls", "wiki": "Dark Souls (video game)" },
      { "name": "Malenia", "sub": "Elden Ring", "image": "https://…/malenia.png" },
      { "name": "Pikachu", "pokemon": 25 },
      { "name": "Gura Gura no Mi", "sub": "Barbabianca", "info": "Crea terremoti.", "wiki": "Edward Newgate" }
    ]
  }
]
```

Una categoria Pokémon è solo un filtro:

```json
{ "id": "drago-gen4", "group": "pokemon-special", "name": "Draghi di Sinnoh",
  "cover": { "pokemon": 445 },
  "source": { "type": "pokemon", "filter": { "gens": [4], "types": ["dragon"] } } }
```

Il filtro accetta `gens`, `types`, `tagsAny` e `tagsNone`. Le forme alternative (mega, gmax, regionali) compaiono solo se un filtro le chiede esplicitamente.

`info` (facoltativo) è la frase che compare passando il cursore sulla carta. Per oggetti, poteri e tecniche conviene mettere in `wiki` il personaggio più legato alla voce, così la carta mostra lui.

Oppure dal pannello admin: con Claude, oppure importando il JSON.

### Aggiungere un gruppo Pokémon speciale
Aggiungi la lista di id in `scripts/build_pokemon.py`, rilancia `npm run build:pokemon` e crea la categoria con `tagsAny: ["nuovo-tag"]`.

### Aggiungere un tema
Un oggetto in più in `themes/index.json` (vedi gli esistenti), oppure lo style transfer dal pannello admin. `default` sceglie il tema iniziale.

### Aggiungere un effetto grafico
Aggiungi il valore in `EFFECTS` (`src/core/theme.js`) e la regola CSS in `style.css` (es. `[data-bg="stelle"] .bg-fx { … }`). Da quel momento lo possono usare anche i temi generati dall'AI.

### Aggiungere una lingua
Copia il blocco `en` in `src/i18n.js`, traducilo e aggiungi il codice a `LANGS`.

### Pubblicare un nuovo tipo di contenuto dal pannello admin
Aggiungi una voce a `COLLECTIONS` in `server/app.mjs` con la sua funzione `clean` e uno store in `server/index.mjs`. Gli endpoint `GET /api/<nome>` e `PUT/DELETE /api/admin/<nome>/:id` arrivano senza scrivere altro codice.

## 7. Deploy

**Sul tuo PC con Docker**
1. `cp .env.example .env` e compila `ADMIN_TOKEN` (`openssl rand -hex 24`) e, se vuoi l'AI, `ANTHROPIC_API_KEY`.
2. `docker compose up -d` → http://localhost:8787 (porta cambiabile con `HOST_PORT` in `.env`). I dati pubblicati stanno nel volume `bracket-data`.

**Renderlo pubblico (Cloudflare Tunnel, gratuito)**
1. Su dash.cloudflare.com → Zero Trust → Networks → Tunnels → crea un tunnel e copia il token.
2. Nel tunnel aggiungi un "public hostname" che punta a `http://app:8080`. Ti serve un dominio su Cloudflare, ma anche uno da pochi euro va bene.
3. Metti `TUNNEL_TOKEN` in `.env` e lancia `docker compose --profile tunnel up -d`.
Il router resta chiuso: è il PC ad aprire la connessione verso Cloudflare. Il sito è raggiungibile solo quando il PC è acceso. Per averlo sempre online va bene anche un mini-PC o un VPS da pochi euro al mese.

**Senza dominio (gratis)**: `docker compose --profile quick up -d` crea un indirizzo `https://….trycloudflare.com` (lo leggi con `docker compose logs quicktunnel`); cambia a ogni riavvio. Per un indirizzo gratuito e fisso: Tailscale Funnel (`tailscale funnel 8787`) dà `https://<pc>.<rete>.ts.net`.

**Solo per i tuoi dispositivi**: in alternativa al tunnel, con Tailscale il server è raggiungibile solo dai dispositivi della tua rete privata.

**GitHub Pages**: attivalo una volta in Settings → Pages → Source "GitHub Actions". Da lì ogni push su `main` pubblica la copia statica.

## 8. Test

`npm test` lancia `node --test`. I test coprono:
- il torneo: potenze di 2 e numeri dispari, annulla, etichette dei turni, campionamento;
- il catalogo: ogni categoria e tema inclusi sono validi, il conteggio dei filtri Pokémon è corretto, le forme sono escluse di default;
- le statistiche: calcolo e immutabilità;
- il voto Twitch: parsing delle righe IRC, un voto per spettatore, login anonimo, PONG, chiusura pulita;
- il server end-to-end su una porta locale: file privati non raggiungibili, autenticazione, genera → pubblica → elenca → cancella, style transfer, rifiuto di temi con CSS iniettato, CORS.

La CI su GitHub li esegue a ogni push; il deploy su Pages parte solo se passano.

## 9. Limiti noti e idee

- Le statistiche non si sincronizzano tra i tuoi dispositivi. Si può aggiungere un endpoint admin `profile` riusando `COLLECTIONS`.
- Le copertine di Wikipedia a volte sono loghi invece della box art.
- Possibili sviluppi: classifica globale anonima (aggregati sul server), modalità "tier list", torneo condiviso via link con lo stesso seed, una categoria del giorno.
