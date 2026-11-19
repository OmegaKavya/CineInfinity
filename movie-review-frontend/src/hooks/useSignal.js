import { useCallback, useEffect, useState } from 'react';
import { api, authHeaders, readableError } from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Your Signal: the signed-in user's rating profile.
 *
 * Everything judgemental is computed on the server, over every review the
 * user has written rather than whatever page happens to be loaded, so this
 * hook only fetches and holds it.
 */
export function useSignal() {
  const { user } = useAuth();
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) {
      setSignal(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/reviews/me/signal', await authHeaders(user));
      setSignal(data);
      setError('');
    } catch (err) {
      setError(readableError(err, 'Could not build your signal.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { signal, loading, error, reload: load };
}
