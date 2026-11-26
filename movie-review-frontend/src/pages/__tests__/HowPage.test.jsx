// @vitest-environment happy-dom
//
// The How page loads one preset at a time from a live API, so it has to cope
// with a slow load being overtaken, a load that returns nothing, and a
// visitor asking for the same preset again after a failure.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');

const anilist = vi.hoisted(() => ({ fetchEntry: vi.fn(), searchAnime: vi.fn() }));
vi.mock('../../api/anilist', () => anilist);

const { default: HowPage } = await import('../HowPage');

const entry = (id, title) => ({ id, title, format: 'TV', startDate: { year: 2000 + id }, relations: [] });

/** A promise this test controls the timing of. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  anilist.fetchEntry.mockReset();
  anilist.searchAnime.mockReset();
});

describe('HowPage', () => {
  it('treats a franchise that loaded nothing as an error, and Try again reloads it', async () => {
    anilist.searchAnime.mockResolvedValue([entry(1, 'Bakemonogatari')]);
    anilist.fetchEntry.mockResolvedValue(null);
    render(<HowPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load this franchise/);
    expect(screen.queryByText(/The graph, as fetched/)).not.toBeInTheDocument();

    anilist.fetchEntry.mockImplementation(async (id) => entry(id, 'Bakemonogatari'));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/The graph, as fetched/)).toBeInTheDocument();
  });

  it('reloads the active preset when it is chosen again after a failure', async () => {
    anilist.searchAnime.mockRejectedValueOnce(new Error('Network Error'));
    render(<HowPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    anilist.searchAnime.mockResolvedValue([entry(1, 'Bakemonogatari')]);
    anilist.fetchEntry.mockImplementation(async (id) => entry(id, 'Bakemonogatari'));
    await userEvent.click(screen.getByRole('button', { name: /Monogatari/ }));

    expect(await screen.findByText(/The graph, as fetched/)).toBeInTheDocument();
  });

  it('draws the preset chosen last, even when an earlier load finishes after it', async () => {
    const slow = deferred();
    anilist.searchAnime.mockImplementation((query) =>
      query === 'Bakemonogatari' ? slow.promise : Promise.resolve([entry(2, 'Fate/Zero')])
    );
    anilist.fetchEntry.mockImplementation(async (id) => entry(id, id === 1 ? 'Bakemonogatari' : 'Fate/Zero'));
    render(<HowPage />);

    await userEvent.click(screen.getByRole('button', { name: /Fate/ }));
    expect(await screen.findByText('Fate/Zero', { selector: '.how__title' })).toBeInTheDocument();

    slow.resolve([entry(1, 'Bakemonogatari')]);
    // Let the abandoned load run to completion before checking it was ignored.
    await waitFor(() => expect(anilist.fetchEntry).toHaveBeenCalledWith(1));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('Fate/Zero', { selector: '.how__title' })).toBeInTheDocument();
    expect(screen.queryByText('Bakemonogatari', { selector: '.how__title' })).not.toBeInTheDocument();
  });
});
