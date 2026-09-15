import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Container, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, LinearProgress, Paper,
  Stack, SvgIcon, TextField, Typography,
} from '@mui/material';
import type { GameSettings, GameView } from './types';
import { useLobby } from './useLobby';

type IconName = 'arrow' | 'people' | 'audio' | 'check' | 'copy' | 'exit' | 'eye' | 'clock' | 'shield';
function Icon({ name, ...props }: { name: IconName; fontSize?: 'small' | 'medium' | 'large' }) {
  const paths: Record<IconName, string> = {
    arrow: 'M5 12h14M13 6l6 6-6 6',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    audio: 'M3 14v-3a9 9 0 0 1 18 0v3M3 13h3v7H3zM18 13h3v7h-3z',
    check: 'M5 12l4 4L19 6',
    copy: 'M9 9h11v12H9zM15 5V2H2v14h3',
    exit: 'M9 21H3V3h6M10 12h11M16 7l5 5-5 5',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    shield: 'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6',
  };
  return <SvgIcon {...props}><path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>;
}

function Panel({ children, sx }: { children: ReactNode; sx?: object }) {
  return <Paper sx={{ p: { xs: 2.5, sm: 3.5 }, border: '1px solid', borderColor: 'divider', ...sx }}>{children}</Paper>;
}

function Eyebrow({ children, color = 'text.secondary' }: { children: ReactNode; color?: string }) {
  return <Typography className="eyebrow" color={color}>{children}</Typography>;
}

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>One word. Plenty of suspicion.</DialogTitle>
    <DialogContent>
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {[
          ['Get your friends together', 'Join the same Discord voice channel, then share your five-character lobby code. No chat setup is needed here.'],
          ['Keep your secret', 'Crew members receive the same secret word. Impostors receive a related hint. Keep your role and your word to yourself.'],
          ['Give a clue, one at a time', 'On your turn, say a word on voice chat without saying the secret word. Confirm when you are done, or the timer moves play along.'],
          ['Make your accusation', 'After the configured rounds, everyone privately votes for one other player. Votes are revealed once everyone has voted.'],
          ['The last chance', 'Impostors share one chance to guess the secret word. A tie for the most votes gives them three chances. A correct guess wins for the impostors, regardless of the vote. If they run out of guesses, the crew wins.'],
        ].map(([title, body], index) => <Stack key={title} direction="row" spacing={2}>
          <Avatar sx={{ width: 30, height: 30, bgcolor: '#aaa0ff18', color: 'primary.main', fontSize: 14 }}>{index + 1}</Avatar>
          <Box><Typography fontWeight={700} gutterBottom>{title}</Typography><Typography variant="body2" color="text.secondary">{body}</Typography></Box>
        </Stack>)}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ p: 3 }}><Button onClick={onClose} variant="contained">Got it</Button></DialogActions>
  </Dialog>;
}

function Home({ busy, connect }: { busy: boolean; connect: (nickname: string, code?: string) => Promise<void> }) {
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const validName = nickname.trim().length > 0 && nickname.trim().length <= 24;
  const join = (event: FormEvent) => {
    event.preventDefault();
    if (validName && /^[A-Z0-9]{5}$/.test(code) && !busy) void connect(nickname, code);
  };

  return <Box className="entrance">
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, gap: { xs: 5, md: 9 }, alignItems: 'center', py: { xs: 3, md: 7 } }}>
      <Box>
        <Chip size="small" label="The party game of little white lies" sx={{ bgcolor: '#aaa0ff12', color: '#c3baff', border: '1px solid #aaa0ff30', mb: 3 }} />
        <Typography component="h1" variant="h1" sx={{ fontSize: { xs: 52, sm: 68, md: 74 }, lineHeight: 1.04 }}>Trust your<br />friends.<br /><Box component="span" sx={{ color: 'primary.main' }}>Or don't.</Box></Typography>
        <Typography color="text.secondary" sx={{ fontSize: 17, lineHeight: 1.8, mt: 3, maxWidth: 390 }}>A secret word. A suspicious clue. Someone in your group is making it all up.</Typography>
        <Stack direction="row" spacing={3} sx={{ mt: 3.5, flexWrap: 'wrap', rowGap: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center"><Icon name="people" fontSize="small" /><Typography variant="body2" color="text.secondary">3-16 friends</Typography></Stack>
          <Stack direction="row" spacing={1} alignItems="center"><Icon name="audio" fontSize="small" /><Typography variant="body2" color="text.secondary">Bring your voice chat</Typography></Stack>
        </Stack>
      </Box>
      <Panel sx={{ background: 'linear-gradient(145deg, #202034, #191b2b)', position: 'relative' }}>
        <Box className="hero-art" aria-hidden="true"><Box className="secret-card left"><Box className="dot-grid" /></Box><Box className="secret-card right"><Box className="dot-grid" /></Box><Box className="secret-card center"><Box className="mask" /></Box></Box>
        <Typography component="h2" variant="h5" textAlign="center">Everyone's a little suspicious.</Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 1, mb: 3 }}>Pick a name. Pull up a chair.</Typography>
        <TextField label="Your nickname" placeholder="What should we call you?" fullWidth value={nickname} onChange={event => setNickname(event.target.value)} autoComplete="nickname" slotProps={{ htmlInput: { maxLength: 24 } }} helperText="A nickname is required to create or join a lobby." />
        <Button fullWidth variant="contained" size="large" endIcon={<Icon name="arrow" />} disabled={!validName || busy} onClick={() => void connect(nickname)} sx={{ mt: 2 }}>{busy ? 'Connecting...' : 'Create a lobby'}</Button>
        <Divider sx={{ my: 3, color: 'text.secondary', fontSize: 12 }}>OR JOIN YOUR FRIENDS</Divider>
        <Box component="form" onSubmit={join} sx={{ display: 'flex', gap: 1.5 }}>
          <TextField label="Lobby code" placeholder="ABCDE" value={code} onChange={event => setCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 5))} fullWidth autoComplete="off" slotProps={{ htmlInput: { maxLength: 5, 'aria-label': 'Five-character lobby code', style: { letterSpacing: '0.16em', textTransform: 'uppercase' } } }} />
          <Button type="submit" variant="outlined" disabled={!validName || code.length !== 5 || busy} sx={{ minWidth: 116, whiteSpace: 'nowrap' }}>Join lobby</Button>
        </Box>
        <Typography variant="caption" color="text.secondary" component="p" textAlign="center" sx={{ mt: 2.5 }}>No account. Just good company and questionable clues.</Typography>
      </Panel>
    </Box>
    <Divider sx={{ mb: 4, mt: 2 }} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 3 }}>
      {[
        ['01', 'Know your word', 'Get a secret word or an impostor hint. Keep it close.'],
        ['02', 'Play it cool', 'Take turns giving clues. Sound convincing. Listen closely.'],
        ['03', 'Call their bluff', 'Cast your vote. Can the impostor guess the word?'],
      ].map(([number, title, description]) => <Stack key={number} direction="row" spacing={2}>
        <Typography sx={{ color: '#777188', fontFamily: 'monospace', fontSize: 13, mt: 0.5 }}>{number}</Typography>
        <Box><Typography fontWeight={700} gutterBottom>{title}</Typography><Typography variant="body2" color="text.secondary" lineHeight={1.7}>{description}</Typography></Box>
      </Stack>)}
    </Box>
  </Box>;
}

type Mutate = (path: string, body?: unknown, method?: string) => Promise<boolean>;

function PlayerList({ view }: { view: GameView }) {
  const colors = ['#b5a4ef', '#81cbb5', '#e0ad91', '#8fb6e8', '#d597bc', '#c6c47f'];
  return <Stack spacing={1.1}>
    {view.players.map((player, index) => <Stack key={player.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, bgcolor: player.id === view.currentPlayerId && view.phase === 'Playing' ? '#aaa0ff14' : '#ffffff03', borderRadius: 2, border: '1px solid', borderColor: player.id === view.currentPlayerId && view.phase === 'Playing' ? '#aaa0ff55' : 'transparent' }}>
      <Avatar sx={{ width: 37, height: 37, bgcolor: `${colors[index % colors.length]}20`, color: colors[index % colors.length], fontWeight: 700, fontSize: 15 }}>{player.nickname.slice(0, 2).toUpperCase()}</Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{player.nickname}{player.id === view.self.id && <Box component="span" sx={{ ml: 0.6, color: 'text.secondary', fontWeight: 400 }}>(you)</Box>}</Typography>
        {view.phase === 'Finished' && <Typography variant="caption" color={player.isImpostor ? 'primary.main' : 'secondary.main'}>{player.isImpostor ? 'Impostor' : 'Crew'}</Typography>}
      </Box>
      {view.phase === 'Lobby' && player.isHost && <Chip size="small" label="Host" variant="outlined" sx={{ height: 24, fontSize: 11 }} />}
      {view.phase === 'Playing' && player.id === view.currentPlayerId && <Chip size="small" label="Speaking" color="primary" sx={{ height: 24, fontSize: 11 }} />}
      {view.phase === 'Voting' && player.hasVoted && <Box aria-label={`${player.nickname} has voted`} sx={{ color: 'secondary.main', display: 'flex' }}><Icon name="check" fontSize="small" /></Box>}
      {(view.phase === 'Guessing' || view.phase === 'Finished') && <Typography variant="caption" color="text.secondary">{player.voteCount ?? 0} {(player.voteCount ?? 0) === 1 ? 'vote' : 'votes'}</Typography>}
    </Stack>)}
  </Stack>;
}

function LobbySettings({ view, busy, mutate }: { view: GameView; busy: boolean; mutate: Mutate }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(Object.entries(view.settings).map(([key, value]) => [key, String(value)])));
  const settings = view.settings;
  useEffect(() => {
    setDraft(Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])));
  }, [settings.impostorCount, settings.extraImpostorChancePercent, settings.roundCount, settings.turnSeconds]);
  const isHost = view.hostId === view.self.id;
  const fields: { key: keyof GameSettings; label: string; min: number; max: number; help: string }[] = [
    { key: 'impostorCount', label: 'Impostors', min: 1, max: 5, help: 'The number of guaranteed impostors.' },
    { key: 'extraImpostorChancePercent', label: 'Extra impostor chance (%)', min: 0, max: 100, help: 'Chance of adding one more impostor.' },
    { key: 'roundCount', label: 'Rounds', min: 1, max: 10, help: 'Everyone gives one clue each round.' },
    { key: 'turnSeconds', label: 'Seconds per turn', min: 10, max: 180, help: 'The timer starts with each player.' },
  ];
  const valid = fields.every(({ key, min, max }) => draft[key] !== '' && Number.isInteger(Number(draft[key])) && Number(draft[key]) >= min && Number(draft[key]) <= max);
  const dirty = fields.some(({ key }) => Number(draft[key]) !== settings[key] || draft[key] === '');
  const minPlayers = Math.max(3, settings.impostorCount + (settings.extraImpostorChancePercent > 0 ? 1 : 0) + 1);
  const enoughPlayers = view.players.length >= minPlayers;
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (valid && dirty) void mutate('/settings', Object.fromEntries(fields.map(({ key }) => [key, Number(draft[key])])), 'PUT');
  };
  return <Panel>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}><Typography component="h2" variant="h6">Make it your game</Typography><Chip size="small" label={isHost ? 'Host controls' : 'Lobby settings'} variant="outlined" /></Stack>
    <Box component="form" onSubmit={save}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
        {fields.map(field => <TextField key={field.key} label={field.label} type="number" value={draft[field.key]} disabled={!isHost || busy} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} helperText={`${field.help} ${field.min}-${field.max}.`} slotProps={{ htmlInput: { min: field.min, max: field.max, step: 1 } }} />)}
      </Box>
      {isHost && dirty && <Button sx={{ mt: 2 }} type="submit" variant="outlined" disabled={!valid || busy}>Save settings</Button>}
    </Box>
    <Divider sx={{ my: 3 }} />
    <Stack direction="row" spacing={1.5} sx={{ mb: 3, color: 'text.secondary' }}><Icon name="audio" /><Typography variant="body2">Hop into your Discord voice channel before you start. Your clues happen there.</Typography></Stack>
    {isHost ? <>
      <Button fullWidth size="large" variant="contained" endIcon={<Icon name="arrow" />} disabled={busy || !enoughPlayers || dirty} onClick={() => void mutate('/start')}>Start game</Button>
      <Typography variant="caption" color="text.secondary" component="p" textAlign="center" sx={{ mt: 1.5 }}>{dirty ? 'Save your settings before starting.' : enoughPlayers ? 'Everyone is in? Let the suspicion begin.' : `Waiting for ${minPlayers - view.players.length} more ${minPlayers - view.players.length === 1 ? 'player' : 'players'}. These settings need at least ${minPlayers}.`}</Typography>
    </> : <Alert severity="info" icon={<Icon name="clock" />}>Your host will start the game when everyone is ready.</Alert>}
  </Panel>;
}

function SecretCard({ view }: { view: GameView }) {
  const [visible, setVisible] = useState(false);
  return <Panel sx={{ background: 'linear-gradient(135deg, #29243e, #1d1f30)', borderColor: '#61517b', textAlign: 'center' }}>
    <Eyebrow color="primary.main">For your eyes only</Eyebrow>
    {visible ? <Box sx={{ py: 2 }}>
      <Chip size="small" label={view.self.isImpostor ? 'You are an impostor' : 'You are crew'} color={view.self.isImpostor ? 'primary' : 'secondary'} variant="outlined" sx={{ mb: 2 }} />
      <Typography variant="body2" color="text.secondary">{view.self.isImpostor ? 'Your hint word' : 'Your secret word'}</Typography>
      <Typography className="secret-word" variant="h4" sx={{ my: 1 }}>{view.self.word}</Typography>
      <Typography variant="caption" color="text.secondary">{view.self.isImpostor ? 'Blend in and figure out the crew word.' : 'Give a clue without saying this word.'}</Typography>
    </Box> : <Box sx={{ py: 3 }}><Box sx={{ color: 'primary.main', mb: 1 }}><Icon name="shield" fontSize="large" /></Box><Typography variant="h6">Your secret is safe.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Make sure nobody is looking.</Typography></Box>}
    <Button size="small" variant="outlined" startIcon={<Icon name="eye" fontSize="small" />} onClick={() => setVisible(current => !current)} aria-pressed={visible}>{visible ? 'Hide my secret' : 'Reveal my secret'}</Button>
  </Panel>;
}

function TurnPanel({ view, serverOffset, busy, mutate }: { view: GameView; serverOffset: number; busy: boolean; mutate: Mutate }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil(((view.turnEndsAt ? Date.parse(view.turnEndsAt) : now) - now - serverOffset) / 1000));
  const ownTurn = view.currentPlayerId === view.self.id;
  const currentPlayer = view.players.find(player => player.id === view.currentPlayerId);
  const currentIndex = view.players.findIndex(player => player.id === view.currentPlayerId);
  return <Panel sx={{ textAlign: 'center', py: { xs: 4, sm: 5 } }}>
    <Eyebrow color="secondary.main">Round {view.roundNumber} of {view.settings.roundCount}</Eyebrow>
    <Typography component="h2" variant="h4" sx={{ mt: 2 }}>{ownTurn ? "You're up." : `${currentPlayer?.nickname ?? 'Next player'} is up.`}</Typography>
    <Typography color="text.secondary" sx={{ mt: 1 }}>{ownTurn ? 'Say your clue on voice chat. Make it count.' : 'Listen closely. Does their clue add up?'}</Typography>
    <Box role="timer" aria-label={`${seconds} seconds remaining`} sx={{ width: 142, height: 142, border: '5px solid', borderColor: seconds <= 5 ? 'error.main' : '#aaa0ff55', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', mx: 'auto', my: 3.5, bgcolor: '#aaa0ff08' }}>
      <Typography sx={{ fontSize: 48, lineHeight: 1.1, fontWeight: 750, fontVariantNumeric: 'tabular-nums', color: seconds <= 5 ? 'error.main' : 'text.primary' }}>{seconds}</Typography><Typography variant="caption" color="text.secondary">seconds left</Typography>
    </Box>
    {ownTurn ? <Button size="large" variant="contained" color="secondary" startIcon={<Icon name="check" />} disabled={busy || seconds === 0} onClick={() => void mutate('/turn', { turnNumber: view.turnNumber })}>I've said my clue</Button> : <Chip icon={<Icon name="audio" fontSize="small" />} label="Listen on voice chat" variant="outlined" />}
    <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>{seconds === 0 ? 'Moving to the next turn...' : `Player ${currentIndex + 1} of ${view.players.length}. The timer moves play along automatically.`}</Typography>
    <LinearProgress aria-label="Round progress" variant="determinate" value={Math.max(0, currentIndex) / view.players.length * 100} sx={{ mt: 3, height: 5, borderRadius: 3, bgcolor: '#aaa0ff15' }} />
  </Panel>;
}

function VotingPanel({ view, busy, mutate }: { view: GameView; busy: boolean; mutate: Mutate }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <Panel>
    <Eyebrow color="primary.main">Time to decide</Eyebrow>
    <Typography component="h2" variant="h4" sx={{ mt: 1.5 }}>Who's the impostor?</Typography>
    <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Think back to the clues. Choose one player. Your vote is final.</Typography>
    {view.self.hasVoted ? <Alert severity="success" sx={{ mb: 3 }}>Your vote is locked in. Waiting for the others.</Alert> : <>
      <Box role="group" aria-label="Choose a player to vote for" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {view.players.filter(player => player.id !== view.self.id).map(player => <Button key={player.id} variant={selected === player.id ? 'contained' : 'outlined'} aria-pressed={selected === player.id} disabled={busy} onClick={() => setSelected(player.id)} sx={{ justifyContent: 'flex-start', py: 2, overflowWrap: 'anywhere', textAlign: 'left' }}>{player.nickname}</Button>)}
      </Box>
      <Button fullWidth variant="contained" disabled={!selected || busy} onClick={() => void mutate('/votes', { targetId: selected })} sx={{ mt: 3 }}>Lock in my vote</Button>
    </>}
    <Divider sx={{ my: 3 }} />
    <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Votes cast</Typography><Typography variant="body2" fontWeight={700}>{view.votesCast} / {view.players.length}</Typography></Stack>
    <LinearProgress aria-label="Votes cast" variant="determinate" value={view.votesCast / view.players.length * 100} sx={{ my: 1.5, height: 5, borderRadius: 3 }} />
    <Typography variant="caption" color="text.secondary">Votes stay private until everyone has chosen.</Typography>
  </Panel>;
}

function GuessPanel({ view, busy, mutate }: { view: GameView; busy: boolean; mutate: Mutate }) {
  const [word, setWord] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (word.trim() && !busy && await mutate('/guesses', { word: word.trim() })) setWord('');
  };
  return <Panel>
    <Eyebrow color="primary.main">The final bluff</Eyebrow>
    <Typography component="h2" variant="h4" sx={{ mt: 1.5 }}>{view.self.isImpostor ? 'Name the secret word.' : 'One last chance to fool you.'}</Typography>
    <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>{view.self.isImpostor ? 'You have heard the clues. A correct guess wins for your team.' : 'The impostors are guessing the secret word. Keep it to yourself until the reveal.'}</Typography>
    {view.isVoteTie && <Alert severity="info" sx={{ mb: 3 }}>The vote was tied. The impostors share three attempts.</Alert>}
    <Chip label={`${view.guessesRemaining} ${view.guessesRemaining === 1 ? 'guess' : 'guesses'} remaining`} variant="outlined" sx={{ mb: 3 }} />
    {view.self.isImpostor ? <Box component="form" onSubmit={event => void submit(event)}>
      <TextField fullWidth label="Your guess" value={word} onChange={event => setWord(event.target.value)} disabled={busy} autoComplete="off" slotProps={{ htmlInput: { maxLength: 80 } }} helperText="All impostors share the remaining attempts. Agree before you submit." />
      <Button fullWidth type="submit" variant="contained" disabled={busy || !word.trim() || view.guessesRemaining === 0} sx={{ mt: 2 }}>Confirm guess</Button>
    </Box> : <Alert severity="info" icon={<Icon name="clock" />}>Waiting for an impostor to submit a guess...</Alert>}
    {view.guesses.length > 0 && <Box sx={{ mt: 3 }}><Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Previous attempts</Typography>{view.guesses.map((guess, index) => <Stack key={index} direction="row" justifyContent="space-between" sx={{ py: 1, gap: 2 }}><Typography sx={{ overflowWrap: 'anywhere' }}>{guess.word}</Typography><Typography color={guess.isCorrect ? 'secondary.main' : 'text.secondary'} variant="body2">{guess.isCorrect ? 'Correct' : 'Incorrect'}</Typography></Stack>)}</Box>}
  </Panel>;
}

function ResultsPanel({ view, busy, mutate }: { view: GameView; busy: boolean; mutate: Mutate }) {
  const impostorsWon = view.winningTeam === 'Impostors';
  return <Panel sx={{ textAlign: 'center', py: { xs: 4, sm: 5 }, background: 'linear-gradient(145deg, #29243e, #191b2b)' }}>
    <Eyebrow color={impostorsWon ? 'primary.main' : 'secondary.main'}>The truth is out</Eyebrow>
    <Box sx={{ color: impostorsWon ? 'primary.main' : 'secondary.main', my: 2.5 }}><Icon name="shield" fontSize="large" /></Box>
    <Typography component="h2" variant="h3">{impostorsWon ? 'Impostors win.' : 'The crew wins.'}</Typography>
    <Typography color="text.secondary" sx={{ mt: 1.5 }}>{impostorsWon ? 'A convincing bluff goes a long way.' : 'Nothing gets past this group.'}</Typography>
    <Box sx={{ my: 4, py: 3, px: 2, bgcolor: '#10111c88', borderRadius: 3, border: '1px solid #aaa0ff30' }}><Eyebrow>The secret word was</Eyebrow><Typography className="secret-word" variant="h3" sx={{ mt: 1.5, color: 'primary.main' }}>{view.revealedWord}</Typography></Box>
    <Typography variant="body2" fontWeight={700}>The impostors</Typography>
    <Stack direction="row" spacing={1} justifyContent="center" useFlexGap flexWrap="wrap" sx={{ mt: 1.5, mb: 3 }}>{view.players.filter(player => player.isImpostor).map(player => <Chip key={player.id} label={player.nickname} color="primary" variant="outlined" />)}</Stack>
    {view.guesses.length > 0 && <Box sx={{ mb: 3 }}><Typography variant="caption" color="text.secondary">Their guesses</Typography>{view.guesses.map((guess, index) => <Typography key={index} sx={{ mt: 0.5, overflowWrap: 'anywhere' }} color={guess.isCorrect ? 'secondary.main' : 'text.secondary'}>{guess.word} - {guess.isCorrect ? 'correct' : 'incorrect'}</Typography>)}</Box>}
    {view.hostId === view.self.id ? <Button fullWidth variant="contained" size="large" onClick={() => void mutate('/restart')} disabled={busy} endIcon={<Icon name="arrow" />}>Back to lobby for a rematch</Button> : <Alert severity="info">Your host can bring everyone back to the lobby for a rematch.</Alert>}
  </Panel>;
}

function Game({ view, busy, serverOffset, mutate }: { view: GameView; busy: boolean; serverOffset: number; mutate: Mutate }) {
  const [copyStatus, setCopyStatus] = useState('');
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(view.code); setCopyStatus('Code copied. Share it with your friends.'); }
    catch { setCopyStatus(`Your lobby code is ${view.code}. Select the code to copy it.`); }
  };
  const phaseLabel = { Lobby: 'Waiting room', Playing: 'Clue rounds', Voting: 'The vote', Guessing: 'Last chance', Finished: 'The reveal' }[view.phase];
  return <Box className="entrance" sx={{ py: { xs: 2, md: 4 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 4 }}>
      <Box><Eyebrow color="secondary.main">{phaseLabel}</Eyebrow><Typography component="h1" variant="h3" sx={{ mt: 1, fontSize: { xs: 32, sm: 38 } }}>{view.phase === 'Lobby' ? 'Good company. Bad alibis.' : 'Keep your poker face.'}</Typography></Box>
      {(view.phase === 'Lobby' || view.phase === 'Finished') && <Button size="small" color="inherit" startIcon={<Icon name="exit" fontSize="small" />} disabled={busy} onClick={() => void mutate('/players/me', undefined, 'DELETE')}>Leave lobby</Button>}
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(265px, 0.7fr) minmax(0, 1.3fr)' }, gap: 3, alignItems: 'start' }}>
      <Stack spacing={3} sx={{ order: { xs: view.phase === 'Lobby' ? 1 : 2, md: 1 } }}>
        <Panel>
          <Stack direction="row" justifyContent="space-between" alignItems="center"><Eyebrow>Lobby code</Eyebrow>{view.phase === 'Lobby' && <Button size="small" onClick={() => void copyCode()} startIcon={<Icon name="copy" fontSize="small" />}>Copy</Button>}</Stack>
          <Typography className="lobby-code" variant="h4" sx={{ mt: 1, color: 'primary.main', userSelect: 'all' }}>{view.code}</Typography>
          {copyStatus && <Typography role="status" variant="caption" color="secondary.main">{copyStatus}</Typography>}
          <Divider sx={{ my: 2.5 }} />
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 1.5 }}><Typography fontWeight={700}>The lineup</Typography><Typography variant="body2" color="text.secondary">{view.players.length} / 16</Typography></Stack>
          <PlayerList view={view} />
          {view.phase === 'Lobby' && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>Share the code and let the usual suspects in.</Typography>}
        </Panel>
        {(view.phase === 'Playing' || view.phase === 'Voting' || view.phase === 'Guessing') && <Box sx={{ order: { xs: -1, md: 1 } }}><SecretCard view={view} /></Box>}
      </Stack>
      <Box sx={{ order: { xs: view.phase === 'Lobby' ? 2 : 1, md: 2 } }}>
        {view.phase === 'Lobby' && <LobbySettings view={view} busy={busy} mutate={mutate} />}
        {view.phase === 'Playing' && <TurnPanel view={view} busy={busy} serverOffset={serverOffset} mutate={mutate} />}
        {view.phase === 'Voting' && <VotingPanel view={view} busy={busy} mutate={mutate} />}
        {view.phase === 'Guessing' && <GuessPanel view={view} busy={busy} mutate={mutate} />}
        {view.phase === 'Finished' && <ResultsPanel view={view} busy={busy} mutate={mutate} />}
      </Box>
    </Box>
  </Box>;
}

export default function App() {
  const lobby = useLobby();
  const [rulesOpen, setRulesOpen] = useState(false);
  return <Box className="site-shell">
    <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 4 } }}>
      <Box component="header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1.2} alignItems="center"><Box sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: 'primary.main', display: 'grid', placeItems: 'center', color: '#191426', fontWeight: 900, fontSize: 23 }}>i</Box><Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.04em' }}>impostor<Box component="span" sx={{ color: 'primary.main' }}>.</Box></Typography></Stack>
        <Stack direction="row" spacing={2} alignItems="center"><Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}><Box component="span" className="status-dot" />{lobby.session ? 'Private lobby' : 'Made for your friend group'}</Typography><Button color="inherit" size="small" onClick={() => setRulesOpen(true)}>How to play</Button></Stack>
      </Box>
      <Box component="main" sx={{ minHeight: 'calc(100vh - 198px)' }}>
        {lobby.error && <Alert severity="error" onClose={lobby.clearError} sx={{ mt: 3 }}>{lobby.error}</Alert>}
        {lobby.connectionError && <Alert severity="warning" sx={{ mt: 3 }}>{lobby.connectionError}</Alert>}
        {lobby.session ? lobby.view ? <Game view={lobby.view} serverOffset={lobby.serverOffset} busy={lobby.busy || Boolean(lobby.connectionError)} mutate={lobby.mutate} /> : <Stack alignItems="center" spacing={2} sx={{ py: 12 }}><CircularProgress /><Typography color="text.secondary">Rejoining your lobby...</Typography></Stack> : <Home busy={lobby.busy} connect={lobby.connect} />}
      </Box>
      <Box component="footer" sx={{ py: 4, mt: 3, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}><Typography variant="caption" color="text.secondary">A little suspicion brings everyone together.</Typography><Typography variant="caption" color="text.secondary">Voice on Discord. Drama right here.</Typography></Box>
    </Container>
    <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
  </Box>;
}
