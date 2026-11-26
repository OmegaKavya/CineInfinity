// @vitest-environment happy-dom
//
// The watch-order panel when AniList, or our server in front of it, fails.
// Each case here once rendered as a confident, complete-looking answer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');

const fetchEntry = vi.hoisted(() => vi.fn());
vi.mock('../../api/anilist', () => ({ fetchEntry }));
vi.mock('../SimilarAnime', () => ({ default: () => null }));

const { default: WatchOrder } = await import('../WatchOrder');

const FRANCHISE = {
  1: { id: 1, title: 'First', format: 'TV', startDate: { year: 2009 },
       relations: [{ id: 2, relationType: 'SEQUEL', type: 'ANIME' }] },
  2: { id: 2, title: 'Second', format: 'TV', startDate: { year: 2011 },
       relations: [{ id: 1, relationType: 'PREQUEL', type: 'ANIME' }] },
};
const loads = async (id) => FRANCHISE[id];

const open = () => render(<WatchOrder anime={{ id: 1, title: 'First' }} onClose={() => {}} />);

beforeEach(() => fetchEntry.mockReset());

describe('WatchOrder', () => {
  it('reports a franchise that did not load at all, and recovers on Try again', async () => {
    fetchEntry.mockResolvedValue(null);
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load this franchise/);
    expect(screen.queryByText(/happen to agree/)).not.toBeInTheDocument();

    fetchEntry.mockImplementation(loads);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when an entry failed partway, instead of showing the rest as complete', async () => {
    fetchEntry.mockImplementation(async (id) => (id === 2 ? null : FRANCHISE[id]));
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent(/1 entry could not be loaded/);
    expect(screen.queryByText(/happen to agree/)).not.toBeInTheDocument();

    fetchEntry.mockImplementation(loads);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not show the text of an internal failure', async () => {
    // Malformed data makes the traversal itself throw a TypeError.
    fetchEntry.mockResolvedValue({ ...FRANCHISE[1], relations: 5 });
    open();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not work out the order.');
    expect(alert).not.toHaveTextContent(/not iterable/);
  });

  it('colours the arrow of a prequel released after the series it precedes', async () => {
    const late = {
      1: { id: 1, title: 'Series', format: 'TV', startDate: { year: 2009 },
           relations: [{ id: 2, relationType: 'PREQUEL', type: 'ANIME' }] },
      2: { id: 2, title: 'Prequel', format: 'TV', startDate: { year: 2016 },
           relations: [{ id: 1, relationType: 'SEQUEL', type: 'ANIME' }] },
    };
    fetchEntry.mockImplementation(async (id) => late[id]);
    const { container } = open();

    await userEvent.click(await screen.findByRole('tab', { name: 'Graph' }));
    await screen.findByRole('img', { name: /Dependency graph/ });
    expect(container.querySelectorAll('.fgraph__edge')).toHaveLength(1);
    expect(container.querySelectorAll('.fgraph__edge.is-backwards')).toHaveLength(1);
  });
});
