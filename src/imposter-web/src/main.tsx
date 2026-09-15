import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';
import './styles.css';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#aaa0ff', contrastText: '#171426' },
    secondary: { main: '#82e8c1', contrastText: '#0d2a21' },
    background: { default: '#10111c', paper: '#191b2b' },
    text: { primary: '#f3f2fa', secondary: '#aaaabd' },
    divider: '#303246',
    error: { main: '#ff929e' },
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.065em' },
    h2: { fontWeight: 750, letterSpacing: '-0.045em' },
    h3: { fontWeight: 750, letterSpacing: '-0.04em' },
    h4: { fontWeight: 700, letterSpacing: '-0.035em' },
    h5: { fontWeight: 700, letterSpacing: '-0.025em' },
    h6: { fontWeight: 650 },
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 11, padding: '11px 20px' } } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: '#131522' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode><ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider></StrictMode>,
);
