import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { AuthProvider } from './state/auth';
import { ToastProvider } from './state/toast';
import { applyStoredTheme } from './components/ui';

applyStoredTheme(); // set <html data-theme> from storage before first paint

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
);
