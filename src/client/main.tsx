import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from './router';
import { App } from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
