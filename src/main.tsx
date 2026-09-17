import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// @ts-expect-error virtual module
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA only in production outside iframes
if (typeof window !== 'undefined') {
  if (window.self === window.top && import.meta.env.PROD) {
    registerSW({ 
      immediate: true,
      onRegistered(r: any) {
        console.log('SW Registered:', r);
      },
      onRegisterError(error: any) {
        console.error('SW Registration Error:', error);
      }
    });
  } else if ('serviceWorker' in navigator && (!import.meta.env.PROD || window.self !== window.top)) {
    // Unregister any zombie service workers in dev or preview to prevent stale cache / page not found
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
