// @vitest-environment happy-dom
//
// The search hook holds the subtlest logic in the app: a debounce that has to
// actually cancel, a sequence guard so a slow response cannot overwrite a
// newer one, and a selection index that must not survive the list changing
// underneath it. All three were bugs once.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../api/client', () => ({
  api,
  readableError: (err, fallback) => err?.response?.data?.error || fallback,
}));

const { useMovieSearch } = await import('../useMovieSearch');

const hit = (id, title, year) => ({
  imdbID: id,
  Title: title,
  Year: year,
  Poster: 'https://example.test/p.jpg',
  Type: 'movie',
});

/** A promise this test controls the timing of. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.get.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('suggestions', () => {
  it('waits for a pause before asking the API', async () => {
    api.get.mockResolvedValue({ data: { Search: [hit('tt1', 'Batman', '1989')] } });
    const { result } = renderHook(() => useMovieSearch());

    act(() => {
      'batman'.split('').forEach((_, i) => result.current.onQueryChange('batman'.slice(0, i + 1)));
    });

    // Six keystrokes, nothing sent yet.
    expect(api.get).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(350); });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get.mock.calls[0][1].params.query).toBe('batman');
  });

  it('keeps the poster and year the list needs to tell films apart', async () => {
    api.get.mockResolvedValue({ data: { Search: [hit('tt1', 'Dune', '2021')] } });
    const { result } = renderHook(() => useMovieSearch());

    act(() => result.current.onQueryChange('dune'));
    await act(async () => { vi.advanceTimersByTime(350); });

    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    expect(result.current.suggestions[0]).toMatchObject({
      imdbID: 'tt1',
      title: 'Dune',
      year: '2021',
      poster: 'https://example.test/p.jpg',
    });
  });

  it('drops a poster OMDb reports as N/A rather than rendering a broken image', async () => {
    api.get.mockResolvedValue({
      data: { Search: [{ ...hit('tt1', 'Obscure', '1970'), Poster: 'N/A' }] },
    });
    const { result } = renderHook(() => useMovieSearch());

    act(() => result.current.onQueryChange('obscure'));
    await act(async () => { vi.advanceTimersByTime(350); });

    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    expect(result.current.suggestions[0].poster).toBeNull();
  });

  it('clears the list when the box is emptied, without asking the API', async () => {
    const { result } = renderHook(() => useMovieSearch());
    act(() => result.current.onQueryChange('   '));
    await act(async () => { vi.advanceTimersByTime(350); });
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.showSuggestions).toBe(false);
  });

  it('ignores a slow response for a query that has been overtaken', async () => {
    // The original bug: a response for "bat" arriving after one for "batman"
    // replaced the newer list, so the box showed results for something the
    // user had finished typing.
    const slow = deferred();
    const fast = deferred();
    api.get
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise);

    const { result } = renderHook(() => useMovieSearch());

    act(() => result.current.onQueryChange('bat'));
    await act(async () => { vi.advanceTimersByTime(350); });

    act(() => result.current.onQueryChange('batman'));
    await act(async () => { vi.advanceTimersByTime(350); });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

    // Newer resolves first, then the stale one arrives late.
    await act(async () => {
      fast.resolve({ data: { Search: [hit('tt2', 'Batman', '1989')] } });
      slow.resolve({ data: { Search: [hit('tt9', 'Bat Thumb', '2001')] } });
    });

    expect(result.current.suggestions.map((s) => s.title)).toEqual(['Batman']);
  });
});

describe('keyboard', () => {
  async function withSuggestions() {
    api.get.mockResolvedValue({
      data: { Search: [hit('tt1', 'One', '2001'), hit('tt2', 'Two', '2002')] },
    });
    const view = renderHook(() => useMovieSearch());
    act(() => view.result.current.onQueryChange('t'));
    await act(async () => { vi.advanceTimersByTime(350); });
    await waitFor(() => expect(view.result.current.suggestions).toHaveLength(2));
    return view;
  }

  const press = (key) => ({ key, preventDefault: vi.fn() });

  it('moves down and stops at the last suggestion', async () => {
    const { result } = await withSuggestions();
    act(() => result.current.onKeyDown(press('ArrowDown')));
    expect(result.current.activeIndex).toBe(0);
    act(() => result.current.onKeyDown(press('ArrowDown')));
    act(() => result.current.onKeyDown(press('ArrowDown')));
    expect(result.current.activeIndex).toBe(1);
  });

  it('moves back up to nothing selected', async () => {
    const { result } = await withSuggestions();
    act(() => result.current.onKeyDown(press('ArrowDown')));
    act(() => result.current.onKeyDown(press('ArrowUp')));
    act(() => result.current.onKeyDown(press('ArrowUp')));
    expect(result.current.activeIndex).toBe(-1);
  });

  it('dismisses the list on Escape', async () => {
    const { result } = await withSuggestions();
    act(() => result.current.onKeyDown(press('Escape')));
    expect(result.current.showSuggestions).toBe(false);
    expect(result.current.activeIndex).toBe(-1);
  });

  it('forgets the highlighted row when the list changes', async () => {
    // Enter used to open whatever film now sat at the remembered position.
    const { result } = await withSuggestions();
    act(() => result.current.onKeyDown(press('ArrowDown')));
    expect(result.current.activeIndex).toBe(0);

    api.get.mockResolvedValue({ data: { Search: [hit('tt3', 'Three', '2003')] } });
    act(() => result.current.onQueryChange('th'));
    await act(async () => { vi.advanceTimersByTime(350); });

    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    expect(result.current.activeIndex).toBe(-1);
  });
});

describe('opening a film', () => {
  it('passes the year through so a reused title resolves correctly', async () => {
    api.get.mockResolvedValue({ data: { Title: 'The Lion King', imdbID: 'tt6105098' } });
    const { result } = renderHook(() => useMovieSearch());

    await act(async () => {
      await result.current.openMovieByTitle('The Lion King', '2019');
    });

    const [path, config] = api.get.mock.calls[0];
    expect(path).toBe('/movies/omdb/The%20Lion%20King');
    expect(config.params).toEqual({ year: '2019' });
  });

  it('omits the year when the catalogue did not supply one', async () => {
    api.get.mockResolvedValue({ data: { Title: 'Tenet' } });
    const { result } = renderHook(() => useMovieSearch());

    await act(async () => { await result.current.openMovieByTitle('Tenet'); });
    expect(api.get.mock.calls[0][1].params).toBeUndefined();
  });

  it('says so when a title matches nothing', async () => {
    api.get.mockResolvedValue({ data: { Response: 'False' } });
    const { result } = renderHook(() => useMovieSearch());

    await act(async () => { await result.current.openMovieByTitle('Nonexistent Film'); });
    expect(result.current.error).toMatch(/could not find/i);
    expect(result.current.movie).toBeNull();
  });
});
