// What a visitor sees when our free-tier backend is asleep or down.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');

describe('readableError', () => {
  let readableError;
  beforeEach(async () => {
    ({ readableError } = await import('../client'));
  });

  it('keeps the message of an error our own code raised', () => {
    expect(readableError(new Error('The server was asleep and did not wake in time.')))
      .toBe('The server was asleep and did not wake in time.');
  });

  it('does not blame the visitor when the server is silent', () => {
    const message = readableError({ isAxiosError: true, message: 'Network Error' });
    expect(message).not.toMatch(/check your connection/i);
    expect(message).toMatch(/free host|give it a minute/i);
  });

  it('says offline only when the browser is offline', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(readableError({ isAxiosError: true })).toMatch(/offline/i);
    spy.mockRestore();
  });

  it('explains a 503 as the server starting, not as a generic failure', () => {
    expect(readableError({ isAxiosError: true, response: { status: 503, data: {} } }))
      .toMatch(/starting up/i);
  });
});

describe('fetchEntry', () => {
  it('does not remember a failure, so a retry after the server wakes can succeed', async () => {
    vi.resetModules();
    const post = vi.fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({ data: { data: { Media: {
        id: 7, title: { english: 'Seven' }, format: 'TV', relations: { edges: [] },
      } } } });
    vi.doMock('../client', () => ({
      api: { post },
      looksAsleep: () => false,
      wakeBackend: async () => false,
    }));
    const { fetchEntry } = await import('../anilist');
    expect(await fetchEntry(7)).toBeNull();
    const second = await fetchEntry(7);
    expect(second).not.toBeNull();
    expect(post).toHaveBeenCalledTimes(2);
  });
});
