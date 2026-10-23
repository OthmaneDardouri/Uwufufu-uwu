# Neon Bracket

Un gioco di tornei "scegli il tuo preferito", in stile uwufufu: due candidati alla volta, clicchi quello che preferisci, finché ne resta uno solo.
Contiene categorie Pokémon (generazioni, leggendari, mitici, starter e loro evoluzioni, megaevoluzioni, Gigamax, forme regionali, Ultracreature, Paradosso, tipi…), videogiochi Pokémon, fantasy, sci-fi/cyberpunk, anime (serie più amate, personaggi di One Piece, Naruto, Dragon Ball, Demon Slayer, Jujutsu Kaisen, cattivi, protagonisti shōnen), anime per intenditori (Frutti del Diavolo, archi di One Piece, tecniche e jinchūriki di Naruto, trasformazioni e tecniche di Dragon Ball, respirazioni, espansioni del dominio), film d'animazione (classici Disney, Pixar, DreamWorks, Studio Ghibli, cattivi dei cartoni) e tutte le categorie che l'admin aggiunge con Claude.

- **10 temi** selezionabili (Pixel Retrò predefinito) + temi nuovi creati da un'immagine ("style transfer" con Claude)
- **Info sulle voci**: passando il cursore su una carta vedi cosa fa (un Frutto del Diavolo, una tecnica…); su telefono l'info è sempre visibile
- **Modalità streamer**: la chat di Twitch vota scrivendo 1 o 2, con timer e barre live; nessun login né server, il browser legge solo la chat pubblica
- Torneo da 8 a 128 partecipanti o "tutti", con turno preliminare automatico quando il numero non è una potenza di 2
- Annulla, scorciatoie da tastiera (← → / A D / 1 2, Z per annullare), partita salvata se chiudi la pagina
- Classifiche personali: titoli, % vittorie negli scontri, ultime partite
- Immagine del risultato da scaricare o condividere
- Installabile come app (PWA), italiano e inglese

## Avvio rapido

Serve solo **Node.js 20+**, nessuna dipendenza da installare.

```bash
cp .env.example .env        # poi metti ADMIN_TOKEN (e ANTHROPIC_API_KEY se vuoi l'AI)
set -a; . ./.env; set +a
npm start                   # http://localhost:8080
npm test                    # test con node:test, nessuna dipendenza
```

Con Docker:

```bash
cp .env.example .env
docker compose up -d                    # http://localhost:8787
docker compose --profile tunnel up -d   # anche pubblico via Cloudflare Tunnel
```

## Link di supporto (facoltativo)

Metti l'indirizzo della tua pagina donazioni (es. Ko-fi) in `config.json`:

```json
{ "apiBase": "", "supportUrl": "https://ko-fi.com/tuonome" }
```

Compare un link discreto nel footer e sotto il campione. Vuoto = nessun link. Niente pubblicità né abbonamenti.

## Dove gira

| Modalità | Cosa ottieni |
|---|---|
| **Server sul tuo PC** (Docker) | Sito completo + pannello admin + AI. Pubblico tramite Cloudflare Tunnel, senza aprire porte. |
| **GitHub Pages** (automatico ad ogni push) | Copia statica sempre online e gratuita: si gioca con le categorie della repo. Con `apiBase` in `config.json` può usare anche il tuo server. |

## Admin

Il pannello è su `#/admin`. Il link compare solo sui dispositivi dove hai fatto login.
Tutto ciò che è admin passa dal server, che verifica il token: chi non lo ha non può creare né cancellare nulla, e la chiave di Claude non lascia mai il server.

- **Nuova categoria con Claude**: descrivi l'idea, scegli quante voci, controlla la bozza, togli quello che non ti piace, pubblica.
- **Nuovo tema da un'immagine**: carichi un'immagine, Claude ne ricava palette, font ed effetti, il sito si colora in anteprima, pubblichi.
- **Usa Claude.ai (senza chiave API)**: il pannello scrive il prompt, apre Claude.ai già compilato, tu invii con il tuo abbonamento e incolli la risposta. Funziona per categorie e temi.
- **Importa/esporta JSON** di categorie e temi.

## Aggiungere cose a mano

- **Categoria**: un file JSON in `categories/` + una riga in `categories/index.json`. Formato in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#aggiungere-una-categoria).
- **Tema**: un oggetto in `themes/index.json`.
- **Nuova generazione Pokémon**: `npm run build:pokemon` rigenera `data/pokemon.json` da PokeAPI.

I test controllano che ogni categoria e ogni tema siano validi, quindi un errore di battitura non arriva in produzione.

## Documentazione

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) spiega struttura, scelte architetturali, sicurezza e come estendere.

## Note legali

Progetto amatoriale non affiliato a Nintendo, Game Freak o The Pokémon Company. Pokémon e i nomi dei personaggi sono marchi dei rispettivi proprietari. Gli artwork sono caricati dal repository pubblico [PokeAPI/sprites](https://github.com/PokeAPI/sprites), le copertine dei videogiochi da Wikipedia: nessuna immagine è inclusa in questa repo.
Codice sotto licenza MIT. Font sotto SIL Open Font License (vedi `assets/fonts/LICENSE.md`).
