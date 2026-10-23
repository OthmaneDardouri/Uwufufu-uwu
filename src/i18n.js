// UI strings. To add a language: copy the `en` block, translate it, add it to LANGS.
import { load, save } from "./services/storage.js";

const STRINGS = {
  it: {
    play: "Gioca", stats: "Classifiche", admin: "Admin",
    tagline: "Scegli il tuo preferito, uno scontro alla volta.",
    search: "Cerca una categoria…", all: "Tutte", entrants: "{n} partecipanti",
    resume: "Riprendi la partita", resumeOf: "{cat} · scontro {i} di {n}", discard: "Scarta",
    howMany: "Quanti partecipanti?", allN: "Tutti ({n})", start: "Inizia il torneo", back: "Indietro",
    rounds: "{n} turni · {m} scontri",
    preliminary: "Turno preliminare", final: "Finale", semi: "Semifinali", quarter: "Quarti di finale", roundOf16: "Ottavi di finale", roundOf32: "Sedicesimi di finale",
    roundOfN: "Turno a {n}", match: "Scontro {i} / {n}",
    hint: "← → per scegliere · Z per annullare", undo: "Annulla", quit: "Esci",
    champion: "Campione", podium: "Podio", fullRanking: "Classifica completa",
    again: "Gioca ancora", download: "Scarica immagine", toHome: "Categorie", seeStats: "Classifiche",
    noStats: "Ancora nessuna partita. Finisci un torneo e qui vedrai i tuoi campioni.",
    games: "Partite: {n}", titles: "Titoli", winRate: "Vittorie negli scontri", recent: "Ultime partite",
    adminTitle: "Pannello admin", adminIntro: "Solo il proprietario del server può creare categorie. Inserisci il token admin.",
    token: "Token admin", login: "Accedi", logout: "Esci", wrongToken: "Token non valido.",
    noServer: "Nessun server collegato: su questa copia del sito le funzioni admin non sono disponibili.",
    noAi: "Il server non ha una chiave Claude: puoi solo importare categorie in JSON.",
    newCategory: "Nuova categoria con Claude", idea: "Descrivi la categoria",
    ideaPh: "es. i boss più iconici dei giochi FromSoftware", count: "Numero di voci", generate: "Genera",
    generating: "Claude sta preparando la lista…", review: "Controlla e pubblica", publish: "Pubblica",
    published: "Pubblicata: ora la vedono tutti.", remove: "Rimuovi", cancel: "Annulla",
    importJson: "Importa JSON", exportJson: "Esporta JSON", yourCats: "Categorie pubblicate", delete: "Elimina",
    confirmDelete: "Eliminare «{name}» per tutti?", nameIt: "Nome (IT)", nameEn: "Nome (EN)",
    error: "Qualcosa è andato storto: {msg}", loading: "Caricamento…", language: "Lingua", theme: "Tema",
    offline: "Sei offline: le immagini potrebbero non caricarsi.",
    streamerMode: "Modalità streamer (Twitch)", streamerOn: "Fai votare la chat",
    streamerHelp: "La chat scrive 1 o 2 per votare; conta l'ultimo voto di ciascuno. Tu puoi sempre decidere cliccando. Nessun login: il sito legge solo la chat pubblica.",
    twitchChannel: "Canale Twitch", voteTimer: "Durata del voto", manual: "Manuale", badChannel: "Nome del canale non valido.",
    closeVote: "Chiudi il voto (V)", chatHint: "Chat di {channel}: scrivi 1 o 2 · clic per decidere tu",
    tieDecide: "Pareggio: decidi tu", voteLeft: "Votazione: {s} s", voteOpen: "Votazione aperta",
    chat_connecting: "Connessione alla chat…", chat_live: "Chat collegata", chat_retrying: "Riconnessione alla chat…", chat_closed: "Chat non disponibile",
    supportText: "Ti piace? Offrimi un caffè", disclaimer: "Progetto amatoriale non affiliato a Nintendo, Game Freak o The Pokémon Company. Nomi e immagini appartengono ai rispettivi proprietari.",
    styleTransfer: "Nuovo tema da un'immagine", styleTransferHelp: "Carica un'immagine dallo stile che ti piace: Claude ne ricava colori, font ed effetti.",
    styleHint: "Note (facoltative)", styleHintPh: "es. più scuro, titoli più sobri", generateTheme: "Crea tema",
    yourThemes: "Temi pubblicati", themePreview: "Anteprima tema", themePreviewHelp: "Il sito è già colorato con il nuovo tema: girati intorno e poi pubblica o annulla.",
  },
  en: {
    play: "Play", stats: "Rankings", admin: "Admin",
    tagline: "Pick your favourite, one duel at a time.",
    search: "Search a category…", all: "All", entrants: "{n} entrants",
    resume: "Resume game", resumeOf: "{cat} · duel {i} of {n}", discard: "Discard",
    howMany: "How many entrants?", allN: "All ({n})", start: "Start the bracket", back: "Back",
    rounds: "{n} rounds · {m} duels",
    preliminary: "Preliminary round", final: "Final", semi: "Semi-finals", quarter: "Quarter-finals", roundOf16: "Round of 16", roundOf32: "Round of 32",
    roundOfN: "Round of {n}", match: "Duel {i} / {n}",
    hint: "← → to pick · Z to undo", undo: "Undo", quit: "Quit",
    champion: "Champion", podium: "Podium", fullRanking: "Full ranking",
    again: "Play again", download: "Download image", toHome: "Categories", seeStats: "Rankings",
    noStats: "No games yet. Finish a bracket and your champions will show up here.",
    games: "Games: {n}", titles: "Titles", winRate: "Duel win rate", recent: "Recent games",
    adminTitle: "Admin panel", adminIntro: "Only the server owner can create categories. Enter the admin token.",
    token: "Admin token", login: "Sign in", logout: "Sign out", wrongToken: "Invalid token.",
    noServer: "No server connected: admin features are not available on this copy of the site.",
    noAi: "The server has no Claude key: you can only import categories as JSON.",
    newCategory: "New category with Claude", idea: "Describe the category",
    ideaPh: "e.g. the most iconic FromSoftware bosses", count: "Number of entries", generate: "Generate",
    generating: "Claude is putting the list together…", review: "Review and publish", publish: "Publish",
    published: "Published: everyone can see it now.", remove: "Remove", cancel: "Cancel",
    importJson: "Import JSON", exportJson: "Export JSON", yourCats: "Published categories", delete: "Delete",
    confirmDelete: "Delete “{name}” for everyone?", nameIt: "Name (IT)", nameEn: "Name (EN)",
    error: "Something went wrong: {msg}", loading: "Loading…", language: "Language", theme: "Theme",
    offline: "You are offline: pictures may not load.",
    streamerMode: "Streamer mode (Twitch)", streamerOn: "Let the chat vote",
    streamerHelp: "Chat types 1 or 2 to vote; each viewer's last vote counts. You can always decide by clicking. No login: the site only reads the public chat.",
    twitchChannel: "Twitch channel", voteTimer: "Vote duration", manual: "Manual", badChannel: "Invalid channel name.",
    closeVote: "Close the vote (V)", chatHint: "{channel}'s chat: type 1 or 2 · click to decide yourself",
    tieDecide: "Tie: you decide", voteLeft: "Voting: {s}s", voteOpen: "Voting open",
    chat_connecting: "Connecting to chat…", chat_live: "Chat connected", chat_retrying: "Reconnecting to chat…", chat_closed: "Chat unavailable",
    supportText: "Enjoying it? Buy me a coffee", disclaimer: "Fan project, not affiliated with Nintendo, Game Freak or The Pokémon Company. Names and pictures belong to their owners.",
    styleTransfer: "New theme from an image", styleTransferHelp: "Upload a picture in a style you like: Claude derives colours, fonts and effects from it.",
    styleHint: "Notes (optional)", styleHintPh: "e.g. darker, calmer titles", generateTheme: "Create theme",
    yourThemes: "Published themes", themePreview: "Theme preview", themePreviewHelp: "The whole site is already wearing the new theme: look around, then publish or cancel.",
  },
};

export const LANGS = ["it", "en"];
const browser = (navigator.language ?? "en").slice(0, 2);
export let lang = load("lang", LANGS.includes(browser) ? browser : "en");

export function setLang(l) {
  lang = LANGS.includes(l) ? l : "en";
  save("lang", lang);
  document.documentElement.lang = lang;
}

export function t(key, vars = {}) {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
