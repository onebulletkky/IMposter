import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type Language = 'en' | 'it';
export const languageStorageKey = 'impostor.language.v1';

const italian = {
  'Language': 'Lingua',
  'Updates paused while you were away. Resume to catch up with your lobby.': 'Gli aggiornamenti sono stati sospesi durante la tua assenza. Riprendili per aggiornare la stanza.',
  'Resume updates': 'Riprendi aggiornamenti',
  'Catching up with your lobby...': 'Aggiornamento della stanza in corso...',
  'The first connection may take a moment.': 'La prima connessione potrebbe richiedere un po\u0027 di tempo.',

  'Impostor - Trust your instincts': 'Impostor - Fidati del tuo istinto',
  'A secret word. A suspicious friend. Play Impostor with your friends on voice chat.': 'Una parola segreta. Un amico sospetto. Gioca a Impostor con i tuoi amici in chat vocale.',
  'One word. Plenty of suspicion.': 'Una parola. Tanti sospetti.',
  'Get your friends together': 'Raduna i tuoi amici',
  'Join the same Discord voice channel, then share your five-character lobby code. No chat setup is needed here.': 'Entrate nello stesso canale vocale Discord e condividete il codice della stanza di cinque caratteri. Qui non serve configurare una chat.',
  'Keep your secret': 'Custodisci il tuo segreto',
  'Crew members receive the same secret word. Impostors receive a related hint. Keep your role and your word to yourself.': 'I membri del gruppo ricevono la stessa parola segreta. Gli impostori ricevono un indizio collegato. Non rivelare il tuo ruolo o la tua parola.',
  'Give a clue, one at a time': 'Date un indizio, uno alla volta',
  'On your turn, say a word on voice chat without saying the secret word. Confirm when you are done, or the timer moves play along.': 'Al tuo turno, di\u0027 una parola in chat vocale senza pronunciare quella segreta. Conferma quando hai finito, oppure il timer passer\u00e0 al giocatore successivo.',
  'Make your accusation': 'Esprimi il tuo sospetto',
  'After the configured rounds, everyone privately votes for one other player. Votes are revealed once everyone has voted.': 'Dopo il numero di giri scelto, ognuno vota in privato un altro giocatore. I voti vengono mostrati quando tutti hanno votato.',
  'The last chance': 'L\u0027ultima occasione',
  'Impostors share one chance to guess the secret word. A tie for the most votes gives them three chances. A correct guess wins for the impostors, regardless of the vote. If they run out of guesses, the crew wins.': 'Gli impostori condividono un tentativo per indovinare la parola segreta. In caso di parit\u00e0 al primo posto nei voti, hanno tre tentativi. Se indovinano vincono, qualunque sia il risultato del voto. Se esauriscono i tentativi, vince il gruppo.',
  'Got it': 'Ho capito',
  'The party game of little white lies': 'Il gioco delle piccole bugie tra amici',
  'Trust your': 'Fidati dei',
  'friends.': 'tuoi amici.',
  "Or don't.": 'Oppure no.',
  'A secret word. A suspicious clue. Someone in your group is making it all up.': 'Una parola segreta. Un indizio sospetto. Qualcuno nel tuo gruppo si sta inventando tutto.',
  '3-16 friends': '3-16 amici',
  'Bring your voice chat': 'Usate la vostra chat vocale',
  "Everyone's a little suspicious.": 'Tutti sono un po\u0027 sospetti.',
  'Pick a name. Pull up a chair.': 'Scegli un nome. Accomodati.',
  'Your nickname': 'Il tuo soprannome',
  'What should we call you?': 'Come ti chiami?',
  'A nickname is required to create or join a lobby.': 'Serve un soprannome per creare una stanza o entrare.',
  'Connecting...': 'Connessione in corso...',
  'Create a lobby': 'Crea una stanza',
  'OR JOIN YOUR FRIENDS': 'OPPURE UNISCITI AI TUOI AMICI',
  'Lobby code': 'Codice della stanza',
  'Five-character lobby code': 'Codice della stanza di cinque caratteri',
  'Join lobby': 'Entra nella stanza',
  'No account. Just good company and questionable clues.': 'Non serve un account. Solo buona compagnia e indizi discutibili.',
  'Know your word': 'Scopri la tua parola',
  'Get a secret word or an impostor hint. Keep it close.': 'Ricevi una parola segreta o un indizio da impostore. Tienilo per te.',
  'Play it cool': 'Mantieni la calma',
  'Take turns giving clues. Sound convincing. Listen closely.': 'Date indizi a turno. Sii convincente. Ascolta con attenzione.',
  'Call their bluff': 'Smaschera il bluff',
  'Cast your vote. Can the impostor guess the word?': 'Vota. L\u0027impostore riuscir\u00e0 a indovinare la parola?',
  '(you)': '(tu)',
  'Impostor': 'Impostore',
  'Crew': 'Gruppo',
  'Host': 'Organizzatore',
  'Speaking': 'Sta parlando',
  '{name} has voted': '{name} ha votato',
  '{count} vote': '{count} voto',
  '{count} votes': '{count} voti',
  'Impostors': 'Impostori',
  'The number of guaranteed impostors.': 'Il numero fisso di impostori.',
  'Extra impostor chance (%)': 'Probabilit\u00e0 di un impostore extra (%)',
  'Chance of adding one more impostor.': 'Probabilit\u00e0 di aggiungere un altro impostore.',
  'Rounds': 'Giri',
  'Everyone gives one clue each round.': 'Ogni giocatore d\u00e0 un indizio per giro.',
  'Seconds per turn': 'Secondi per turno',
  'The timer starts with each player.': 'Il timer riparte a ogni giocatore.',
  'Make it your game': 'Personalizza la partita',
  'Host controls': 'Comandi organizzatore',
  'Lobby settings': 'Impostazioni stanza',
  'Save settings': 'Salva impostazioni',
  'Hop into your Discord voice channel before you start. Your clues happen there.': 'Entrate nel vostro canale vocale Discord prima di iniziare. Date gli indizi l\u00ec.',
  'Start game': 'Inizia partita',
  'Save your settings before starting.': 'Salva le impostazioni prima di iniziare.',
  'Everyone is in? Let the suspicion begin.': 'Ci siete tutti? Che inizino i sospetti.',
  'Waiting for {count} more player. These settings need at least {minimum}.': 'Manca {count} giocatore. Queste impostazioni richiedono almeno {minimum} giocatori.',
  'Waiting for {count} more players. These settings need at least {minimum}.': 'Mancano {count} giocatori. Queste impostazioni richiedono almeno {minimum} giocatori.',
  'Your host will start the game when everyone is ready.': 'L\u0027organizzatore inizier\u00e0 la partita quando tutti saranno pronti.',
  'For your eyes only': 'Solo per i tuoi occhi',
  'You are an impostor': 'Sei un impostore',
  'You are crew': 'Sei nel gruppo',
  'Your hint word': 'Il tuo indizio',
  'Your secret word': 'La tua parola segreta',
  'Blend in and figure out the crew word.': 'Mimetizzati e scopri la parola del gruppo.',
  'Give a clue without saying this word.': 'Dai un indizio senza pronunciare questa parola.',
  'Your secret is safe.': 'Il tuo segreto \u00e8 al sicuro.',
  'Make sure nobody is looking.': 'Assicurati che nessuno stia guardando.',
  'Hide my secret': 'Nascondi il mio segreto',
  'Reveal my secret': 'Mostra il mio segreto',
  'Round {round} of {total}': 'Giro {round} di {total}',
  "You're up.": 'Tocca a te.',
  'Next player': 'Il prossimo giocatore',
  '{name} is up.': 'Tocca a {name}.',
  'Say your clue on voice chat. Make it count.': 'Dai il tuo indizio in chat vocale. Scegli bene.',
  'Listen closely. Does their clue add up?': 'Ascolta con attenzione. L\u0027indizio ti convince?',
  '{count} seconds remaining': '{count} secondi rimasti',
  'seconds left': 'secondi rimasti',
  "I've said my clue": 'Ho detto il mio indizio',
  'Listen on voice chat': 'Ascolta in chat vocale',
  'Moving to the next turn...': 'Passaggio al turno successivo...',
  'Player {player} of {total}. The timer moves play along automatically.': 'Giocatore {player} di {total}. Il timer fa avanzare la partita automaticamente.',
  'Round progress': 'Avanzamento del giro',
  'Time to decide': '\u00c8 ora di decidere',
  "Who's the impostor?": 'Chi \u00e8 l\u0027impostore?',
  'Think back to the clues. Choose one player. Your vote is final.': 'Ripensa agli indizi. Scegli un giocatore. Il tuo voto \u00e8 definitivo.',
  'Your vote is locked in. Waiting for the others.': 'Il tuo voto \u00e8 confermato. Aspettiamo gli altri.',
  'Choose a player to vote for': 'Scegli il giocatore da votare',
  'Lock in my vote': 'Conferma il mio voto',
  'Votes cast': 'Voti espressi',
  'Votes stay private until everyone has chosen.': 'I voti restano segreti finch\u00e9 tutti hanno scelto.',
  'The final bluff': 'L\u0027ultimo bluff',
  'Name the secret word.': 'Indovina la parola segreta.',
  'One last chance to fool you.': 'Un\u0027ultima occasione per ingannarti.',
  'You have heard the clues. A correct guess wins for your team.': 'Hai ascoltato gli indizi. Se indovini, vince la tua squadra.',
  'The impostors are guessing the secret word. Keep it to yourself until the reveal.': 'Gli impostori stanno cercando la parola segreta. Non rivelarla fino alla fine.',
  'The vote was tied. The impostors share three attempts.': 'Il voto \u00e8 finito in parit\u00e0. Gli impostori condividono tre tentativi.',
  '{count} guess remaining': '{count} tentativo rimasto',
  '{count} guesses remaining': '{count} tentativi rimasti',
  'Your guess': 'Il tuo tentativo',
  'All impostors share the remaining attempts. Agree before you submit.': 'Tutti gli impostori condividono i tentativi rimasti. Mettetevi d\u0027accordo prima di confermare.',
  'Confirm guess': 'Conferma tentativo',
  'Waiting for an impostor to submit a guess...': 'In attesa del tentativo di un impostore...',
  'Previous attempts': 'Tentativi precedenti',
  'Correct': 'Corretto',
  'Incorrect': 'Errato',
  'correct': 'corretto',
  'incorrect': 'errato',
  'The truth is out': 'La verit\u00e0 \u00e8 svelata',
  'Impostors win.': 'Vincono gli impostori.',
  'The crew wins.': 'Vince il gruppo.',
  'A convincing bluff goes a long way.': 'Un bluff convincente fa la differenza.',
  'Nothing gets past this group.': 'A questo gruppo non sfugge nulla.',
  'The secret word was': 'La parola segreta era',
  'The impostors': 'Gli impostori',
  'Their guesses': 'I loro tentativi',
  'Back to lobby for a rematch': 'Torna alla stanza per la rivincita',
  'Your host can bring everyone back to the lobby for a rematch.': 'L\u0027organizzatore pu\u00f2 riportare tutti nella stanza per una rivincita.',
  'Code copied. Share it with your friends.': 'Codice copiato. Condividilo con i tuoi amici.',
  'Your lobby code is {code}. Select the code to copy it.': 'Il codice della stanza \u00e8 {code}. Selezionalo per copiarlo.',
  'Waiting room': 'Sala d\u0027attesa',
  'Clue rounds': 'Giri di indizi',
  'The vote': 'Il voto',
  'Last chance': 'Ultima occasione',
  'The reveal': 'La rivelazione',
  'Good company. Bad alibis.': 'Buona compagnia. Pessimi alibi.',
  'Keep your poker face.': 'Non lasciar trapelare nulla.',
  'Leave lobby': 'Esci dalla stanza',
  'Copy': 'Copia',
  'The lineup': 'I giocatori',
  'Share the code and let the usual suspects in.': 'Condividi il codice e fai entrare i soliti sospetti.',
  'Private lobby': 'Stanza privata',
  'Made for your friend group': 'Pensato per il tuo gruppo di amici',
  'How to play': 'Come si gioca',
  'Rejoining your lobby...': 'Rientro nella stanza...',
  'A little suspicion brings everyone together.': 'Un po\u0027 di sospetto unisce tutti.',
  'Voice on Discord. Drama right here.': 'La voce su Discord. I colpi di scena qui.',
  'Close': 'Chiudi',
  'This lobby session has ended. Create a new lobby or join your friends again.': 'La sessione della stanza \u00e8 terminata. Crea una nuova stanza o rientra con i tuoi amici.',
  'Connection interrupted. Reconnecting automatically...': 'Connessione interrotta. Riconnessione automatica in corso...',
  'Cannot reach the game server. Check your connection and try again.': 'Impossibile contattare il server di gioco. Controlla la connessione e riprova.',
  'The request could not be completed.': 'Impossibile completare la richiesta.',
  'Too many lobby attempts. Wait a minute and try again.': 'Troppi tentativi di accesso alle stanze. Aspetta un minuto e riprova.',
  'Check the request fields and try again.': 'Controlla i campi inseriti e riprova.',
  'Lobby storage is temporarily unavailable. Please try again.': 'I dati delle stanze non sono al momento disponibili. Riprova.',
  'An unexpected error occurred. Please try again.': 'Si \u00e8 verificato un errore imprevisto. Riprova.',
  'A player session is required.': 'Devi entrare in una stanza prima di continuare.',
  'Could not allocate a lobby code. Please try again.': 'Impossibile generare un codice per la stanza. Riprova.',
  'Settings are required.': 'Le impostazioni sono obbligatorie.',
  'Only the host can start a waiting lobby.': 'Solo l\u0027organizzatore pu\u00f2 avviare una stanza in attesa.',
  'Unknown game action.': 'Azione di gioco sconosciuta.',
  'Lobby not found. Check the code or create a new lobby.': 'Stanza non trovata. Controlla il codice o crea una nuova stanza.',
  'Enter a five-character lobby code using letters and numbers.': 'Inserisci un codice della stanza di cinque lettere e numeri.',
  'Your player session is invalid. Join the lobby again.': 'La tua sessione non \u00e8 valida. Rientra nella stanza.',
  'Your player session is no longer in this lobby.': 'La tua sessione non fa pi\u00f9 parte di questa stanza.',
  'The word catalog is unavailable or empty. Add words before starting a game.': 'Il catalogo delle parole non \u00e8 disponibile o \u00e8 vuoto. Aggiungi parole prima di iniziare una partita.',
  'The word catalog returned an invalid word pair.': 'Il catalogo ha restituito una coppia di parola e indizio non valida.',
  'The word service is unavailable. Please try again shortly.': 'Il servizio delle parole non \u00e8 disponibile. Riprova tra poco.',
  'The word catalog returned an invalid response.': 'Il catalogo delle parole ha restituito una risposta non valida.',
  'The word service timed out. Please try again shortly.': 'Il servizio delle parole ha impiegato troppo tempo a rispondere. Riprova tra poco.',
  'Lobby codes must contain five uppercase letters or digits.': 'I codici delle stanze devono contenere cinque lettere maiuscole o cifre.',
  'This lobby is full.': 'Questa stanza \u00e8 piena.',
  'You have already joined this lobby.': 'Sei gi\u00e0 in questa stanza.',
  'That nickname is already in use in this lobby.': 'Questo soprannome \u00e8 gi\u00e0 in uso nella stanza.',
  'A game needs between {minimum} and {maximum} players.': 'Una partita richiede da {minimum} a {maximum} giocatori.',
  'Leave at least one regular player, including when an extra impostor is selected.': 'Deve esserci almeno un giocatore del gruppo, anche quando viene aggiunto un impostore extra.',
  'A common word of at most 80 characters is required.': 'Serve una parola comune di massimo 80 caratteri.',
  'A hint of at most 160 characters is required.': 'Serve un indizio di massimo 160 caratteri.',
  'The hint must differ from the common word.': 'L\u0027indizio deve essere diverso dalla parola comune.',
  'Every selected impostor must be a different lobby player.': 'Ogni impostore selezionato deve essere un giocatore diverso della stanza.',
  'The selected impostors do not match the lobby settings.': 'Gli impostori selezionati non corrispondono alle impostazioni della stanza.',
  'This turn has already changed. Refresh the game.': 'Il turno \u00e8 gi\u00e0 cambiato. Aggiorna la partita.',
  "It is another player's turn.": '\u00c8 il turno di un altro giocatore.',
  'Your turn has expired.': 'Il tuo turno \u00e8 scaduto.',
  'You cannot vote for yourself.': 'Non puoi votare te stesso.',
  'You have already voted.': 'Hai gi\u00e0 votato.',
  'Only impostors can guess the common word.': 'Solo gli impostori possono provare a indovinare la parola comune.',
  'Enter a guess between 1 and 80 characters.': 'Inserisci un tentativo da 1 a 80 caratteri.',
  'Players can leave between games.': 'I giocatori possono uscire tra una partita e l\u0027altra.',
  'A player identifier is required.': 'Serve un identificativo del giocatore.',
  'Enter a nickname between 1 and 24 characters.': 'Inserisci un soprannome da 1 a 24 caratteri.',
  'Nicknames cannot contain control characters.': 'I soprannomi non possono contenere caratteri di controllo.',
  'Choose between 1 and 5 impostors.': 'Scegli da 1 a 5 impostori.',
  'The extra impostor chance must be between 0 and 100 percent.': 'La probabilit\u00e0 di un impostore extra deve essere tra 0 e 100 percento.',
  'Choose between 1 and 10 rounds.': 'Scegli da 1 a 10 giri.',
  'Turns must last between 10 and 180 seconds.': 'I turni devono durare da 10 a 180 secondi.',
  'You are not a player in this lobby.': 'Non fai parte dei giocatori di questa stanza.',
  'Only the lobby host can do that.': 'Solo l\u0027organizzatore della stanza pu\u00f2 farlo.',
  'This action is only available during lobby.': 'Questa azione \u00e8 disponibile solo nella sala d\u0027attesa.',
  'This action is only available during playing.': 'Questa azione \u00e8 disponibile solo durante i giri di indizi.',
  'This action is only available during voting.': 'Questa azione \u00e8 disponibile solo durante il voto.',
  'This action is only available during guessing.': 'Questa azione \u00e8 disponibile solo durante i tentativi degli impostori.',
  'This action is only available during finished.': 'Questa azione \u00e8 disponibile solo a partita finita.',
} as const;

export type TranslationKey = keyof typeof italian;
type Values = Record<string, string | number>;

export function translate(language: Language, key: TranslationKey, values: Values = {}): string {
  const message: string = language === 'it' ? italian[key] : key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}

export function translateError(language: Language, message: string): string {
  if (Object.hasOwn(italian, message)) return translate(language, message as TranslationKey);
  const playerRange = /^A game needs between (\d+) and (\d+) players\.$/.exec(message);
  if (playerRange) return translate(language, 'A game needs between {minimum} and {maximum} players.', { minimum: playerRange[1], maximum: playerRange[2] });
  return language === 'en' ? message : translate(language, 'The request could not be completed.');
}

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(languageStorageKey);
    if (saved === 'en' || saved === 'it') return saved;
  } catch { /* Language switching also works with browser storage disabled. */ }
  const preferred = navigator.languages?.[0] || navigator.language;
  return /^it(?:-|$)/i.test(preferred) ? 'it' : 'en';
}

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
} | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translate(language, 'Impostor - Trust your instincts');
    document.querySelector('meta[name="description"]')?.setAttribute('content', translate(language, 'A secret word. A suspicious friend. Play Impostor with your friends on voice chat.'));
    try { localStorage.setItem(languageStorageKey, language); }
    catch { /* In-memory preference still works when storage is unavailable. */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage requires LanguageProvider.');
  return {
    ...context,
    t: (key: TranslationKey, values?: Values) => translate(context.language, key, values),
    translateError: (message: string) => translateError(context.language, message),
  };
}
