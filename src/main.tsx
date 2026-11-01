import { createRoot } from 'react-dom/client';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { initMapLibreWorker } from './maplibreWorker.ts';
import App from './App.tsx';
import './index.css';

try {
  // Initialize MapLibre Web Worker securely before any map instance initializes
  initMapLibreWorker();
} catch (err) {
  console.warn('[main] MapLibre worker pre-init caught:', err);
}

// Provide global maplibregl for mapPins and custom scripts
if (typeof window !== 'undefined') {
  (window as any).maplibregl = maplibregl;

  // Intercept generic unhandled cross-origin or third-party script errors
  window.addEventListener('error', (event) => {
    if (event.message === 'Script error.' || !event.message) {
      // Suppress silent cross-origin opaque script error notifications
      event.preventDefault();
      console.warn('[Global] Suppressed cross-origin script error:', event);
    }
  });

  // Intercept benign abort rejections (e.g., user cancellation of native Web Share)
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (
      reason &&
      (reason.name === 'AbortError' ||
        (typeof reason.message === 'string' &&
          (reason.message.includes('cancellation of share') ||
            reason.message.toLowerCase().includes('abort'))))
    ) {
      event.preventDefault();
      console.warn('[Global] Handled expected share cancellation / abort:', reason);
    }
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
} else {
  console.error('[main] Fatal: #root element not found in DOM.');
}
