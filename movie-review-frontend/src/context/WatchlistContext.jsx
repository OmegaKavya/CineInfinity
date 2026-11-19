import { createContext, useContext } from 'react';
import { useWatchlist } from '../hooks/useWatchlist';

/**
 * One watchlist for the whole app.
 *
 * Every poster can ask whether it is saved. With the hook called per
 * component that would be one request per card; shared through context it is
 * one request per sign-in, and a save made on a film page is immediately
 * reflected by a card on the home page.
 */
const WatchlistContext = createContext(null);

export function WatchlistProvider({ children }) {
  const watchlist = useWatchlist();
  return (
    <WatchlistContext.Provider value={watchlist}>{children}</WatchlistContext.Provider>
  );
}

export function useWatchlistContext() {
  const value = useContext(WatchlistContext);
  if (!value) throw new Error('useWatchlistContext must be used inside a WatchlistProvider');
  return value;
}
