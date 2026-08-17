import './setup';

import { Telemetry } from '@affine/core/components/telemetry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

function mountApp() {
  // oxlint-disable-next-line typescript/no-non-null-assertion
  const root = document.getElementById('app')!;
  createRoot(root).render(
    <StrictMode>
      <Telemetry />
      <App />
    </StrictMode>
  );
}

/**
 * A local workspace lives entirely in IndexedDB, which the browser is free to
 * evict under storage pressure. Asking for persistent storage takes that right
 * away. Chromium decides silently from site engagement, so a denial is normal
 * and only worth logging.
 */
function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    return;
  }
  navigator.storage
    .persisted()
    .then(already => (already ? true : navigator.storage.persist()))
    .then(granted => {
      console.info(
        `[affine] persistent storage: ${granted ? 'granted' : 'denied'}`
      );
    })
    .catch(err => {
      console.warn('[affine] failed to request persistent storage', err);
    });
}

try {
  mountApp();
} catch (err) {
  console.error('Failed to bootstrap app', err);
}

requestPersistentStorage();
