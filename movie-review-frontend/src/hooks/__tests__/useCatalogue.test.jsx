// @vitest-environment happy-dom
//
// A catalogue row against a backend that sleeps when idle: the first request
// after a quiet spell meets a cold start, and the row has to wait it out
// rather than report a broken feature.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');

const client = vi.hoisted(() => ({ get: vi.fn(), wakeBackend: vi.fn() }));
vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  api: { get: client.get },
  wakeBackend: client.wakeBackend,
}));
vi.mock('../../api/anilist', () => ({ popularAnime: vi.fn() }));

const { useCatalogue } = await import('../useCatalogue');

const film = { id: 1, title: 'Lagaan' };
const asleep = { isAxiosError: true, code: 'ERR_NETWORK' };

beforeEach(() => {
  client.get.mockReset();
  client.wakeBackend.mockReset();
});

describe('useCatalogue', () => {
  it('wakes a sleeping server and retries once, with a longer timeout', async () => {
    client.get.mockRejectedValueOnce(asleep).mockResolvedValueOnce({ data: { results: [film] } });
    client.wakeBackend.mockResolvedValue(true);

    const { result } = renderHook(() => useCatalogue('bollywood'));

    await waitFor(() => expect(result.current.items).toEqual([film]));
    expect(result.current.error).toBe('');
    expect(client.wakeBackend).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenLastCalledWith('/movies/discover/bollywood', { timeout: 45000 });
  });

  it('does not try to wake the server over a failing upstream', async () => {
    client.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 502, data: { error: 'Could not reach the film database.', code: 'UPSTREAM_UNAVAILABLE' } },
    });

    const { result } = renderHook(() => useCatalogue('bollywood'));

    await waitFor(() => expect(result.current.error).not.toBe(''));
    expect(client.wakeBackend).not.toHaveBeenCalled();
    expect(result.current.error).not.toMatch(/starting up/i);
  });

  it('loads the row again on retry', async () => {
    client.get
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } })
      .mockResolvedValueOnce({ data: { results: [film] } });

    const { result } = renderHook(() => useCatalogue('bollywood'));
    await waitFor(() => expect(result.current.error).not.toBe(''));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.items).toEqual([film]));
    expect(result.current.error).toBe('');
  });
});
