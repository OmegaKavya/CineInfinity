import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { WatchlistProvider } from './context/WatchlistContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import reportWebVitals from './reportWebVitals';

/**
 * Providers wrap the app here rather than inside it, so App has no setup
 * responsibilities of its own and a test can mount it with whatever auth or
 * theme state that test needs.
 */
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <WatchlistProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </WatchlistProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();
