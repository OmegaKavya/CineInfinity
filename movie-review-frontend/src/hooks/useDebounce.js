import { useEffect, useRef, useCallback } from 'react';

/**
 * Debounce a callback.
 *
 * Why this exists as a hook
 * -------------------------
 * The previous implementation defined its `debounce` helper inside the
 * component body:
 *
 *   const debounce = (fn, delay) => { let timeout; return (...) => {...} };
 *   const debounced = useCallback(debounce(fetchSuggestions, 300), [fetchSuggestions]);
 *
 * Both `debounce` and `fetchSuggestions` were new function objects on every
 * render, so the dependency array always differed, so `useCallback` handed
 * back a fresh debounced function each time - and each one closed over its
 * own `timeout` variable. Nothing was ever cancelled. Typing ten characters
 * fired ten requests to the search API, which is precisely the behaviour the
 * debounce was added to prevent.
 *
 * Keeping the timer in a ref fixes it: the identity of the returned function
 * is stable, and the timer it clears is the same one the previous call set.
 *
 * @param {Function} callback
 * @param {number} delay milliseconds of quiet before the callback runs
 */
export function useDebounce(callback, delay = 300) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // Keep the latest callback without changing the identity of the debounced
  // function, so callers can close over fresh state safely.
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // A pending timer must not fire after the component has gone.
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const debounced = useCallback(
    (...args) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay]
  );

  const cancel = useCallback(() => clearTimeout(timeoutRef.current), []);

  return [debounced, cancel];
}
