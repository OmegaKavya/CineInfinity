// What a visitor sees when our free-tier backend is asleep or down.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');

// Each test gets a fresh client. Some replace it or axios with a mock, and a
// mock left registered answers every later import instead of the real one.
beforeEach(() => {
  vi.resetModules();
  vi.doUnmock('../client');
  vi.doUnmock('axios');
});

describe('readableError', () => {
  let readableError;
  let visitorError;
  beforeEach(async () => {
    ({ readableError, visitorError } = await import('../client'));
  });

  it('keeps the message of an error our own code raised for visitors', () => {
    expect(readableError(visitorError('The server was asleep and did not wake in time.')))
      .toBe('The server was asleep and did not wake in time.');
  });

  it('never shows the text of an internal failure', () => {
    expect(readableError(new Error('getaddrinfo ENOTFOUND graphql.anilist.co'), 'Could not load.'))
      .toBe('Could not load.');
    expect(readableError(new TypeError("Cannot read properties of undefined (reading 'Page')"), 'Could not load.'))
      .toBe('Could not load.');
  });

  it('reports a failing upstream as that, not as the server starting up', () => {
    const message = readableError({
      isAxiosError: true,
      response: { status: 502, data: { error: 'Could not reach the film database.', code: 'UPSTREAM_UNAVAILABLE' } },
    });
    expect(message).not.toMatch(/starting up/i);
    expect(message).toMatch(/service this site depends on/i);
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

  it('asks for a fresh sign-in when Firebase cannot refresh the token', () => {
    const firebase = (code) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });
    expect(readableError(firebase('auth/user-token-expired'), 'Could not post that review.'))
      .toBe('You need to sign in again to do that.');
    // Offline, signing in again would fail as well.
    expect(readableError(firebase('auth/network-request-failed'), 'Could not post that review.'))
      .toMatch(/check your connection/i);
  });

  it('does not ask for a sign-in that would fail the same way', () => {
    const firebase = (code) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });
    for (const code of ['auth/too-many-requests', 'auth/internal-error', 'auth/quota-exceeded']) {
      expect(readableError(firebase(code), 'Could not post that review.')).toBe('Could not post that review.');
    }
    for (const code of ['auth/invalid-user-token', 'auth/invalid-refresh-token', 'auth/user-disabled']) {
      expect(readableError(firebase(code), 'Could not post that review.'))
        .toBe('You need to sign in again to do that.');
    }
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

  it('stops a traversal at a rate limit and says so, rather than listing entries as failed', async () => {
    vi.resetModules();
    // Our own limiter's 429 partway through: the seed loads, its sequel is refused.
    const post = vi.fn(async (_url, { variables }) => {
      if (variables.id !== 1) {
        throw { isAxiosError: true, response: { status: 429, data: { error: 'Too many requests. Please try again shortly.' } } };
      }
      return { data: { data: { Media: {
        id: 1, title: { english: 'One' }, format: 'TV',
        relations: { edges: [{ relationType: 'SEQUEL', node: { id: 2, type: 'ANIME' } }] },
      } } } };
    });
    vi.doMock('../client', async (importOriginal) => ({ ...(await importOriginal()), api: { post } }));
    const { fetchEntry } = await import('../anilist');
    const { collectFranchise } = await import('../../lib/franchiseGraph');

    const error = await collectFranchise(1, fetchEntry).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.forVisitor).toBe(true);
    expect(error.message).toMatch(/rate-limiting/);
  });
});

describe('looksAsleep', () => {
  it('does not take a tagged upstream failure for a sleeping server', async () => {
    const { looksAsleep } = await import('../client');
    expect(looksAsleep({ response: { status: 502, data: { code: 'UPSTREAM_UNAVAILABLE' } } })).toBe(false);
    // Render's own 502 while the instance starts carries no tag.
    expect(looksAsleep({ response: { status: 502, data: '<html>' } })).toBe(true);
  });
});

describe('wakeBackend', () => {
  const withHealth = async (get) => {
    vi.doMock('axios', () => ({ default: { create: () => ({}), get } }));
    const { wakeBackend } = await import('../client');
    return wakeBackend;
  };

  it('counts a degraded server as awake', async () => {
    // /health answers 503 "degraded" while the database is still connecting.
    const wakeBackend = await withHealth(vi.fn().mockRejectedValue({
      response: { status: 503, data: { status: 'degraded', database: 'connecting' } },
    }));
    expect(await wakeBackend()).toBe(true);
  });

  it('still counts a 503 that is not from our server as asleep', async () => {
    const wakeBackend = await withHealth(vi.fn().mockRejectedValue({ response: { status: 503, data: '' } }));
    expect(await wakeBackend()).toBe(false);
  });
});

describe('AniList through the backend', () => {
  const withClient = async (overrides) => {
    vi.doMock('../client', async (importOriginal) => ({ ...(await importOriginal()), ...overrides }));
    return import('../anilist');
  };

  it('wakes a sleeping server and retries once, with a longer timeout', async () => {
    const post = vi.fn()
      .mockRejectedValueOnce({ isAxiosError: true, code: 'ERR_NETWORK' })
      .mockResolvedValueOnce({ data: { data: { Media: {
        id: 8, title: { english: 'Eight' }, format: 'TV', relations: { edges: [] },
      } } } });
    const wakeBackend = vi.fn(async () => true);
    const { fetchEntry } = await withClient({ api: { post }, wakeBackend });

    expect((await fetchEntry(8)).title).toBe('Eight');
    expect(wakeBackend).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][2]).toEqual({ timeout: 45000 });
  });

  it('reports a failing AniList without waking the server, and without its error text', async () => {
    const post = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: { status: 502, data: { error: 'getaddrinfo ENOTFOUND graphql.anilist.co', code: 'UPSTREAM_UNAVAILABLE' } },
    });
    const wakeBackend = vi.fn(async () => true);
    const { searchAnime } = await withClient({ api: { post }, wakeBackend });

    const error = await searchAnime('Fate').catch((e) => e);
    expect(wakeBackend).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
    expect(error.message).not.toMatch(/ENOTFOUND/);
    expect(error.forVisitor).toBe(true);
  });
});
