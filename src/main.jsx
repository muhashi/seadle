import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@mantine/core/styles.css';
import { createTheme, MantineProvider } from '@mantine/core';

const theme = createTheme({
  // todo
});

createRoot(document.getElementById('root')).render(
  <MantineProvider>
    <App />
  </MantineProvider>,
)
