import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = { signal: null, loading: false, error: '' };
vi.mock('../../hooks/useSignal', () => ({ useSignal: () => state }));

const Signal = (await import('../Signal')).default;

const base = {
  total: 12, mean: 7.4, spread: 1.8, highest: 10, lowest: 3,
  comparedOn: 6, bias: 0.8,
  histogram: Array.from({ length: 10 }, (_, i) => ({ rating: i + 1, count: i === 7 ? 5 : 0 })),
  contrarian: [
    { movieId: 'tt1', title: 'Tenet', mine: 9, crowd: 7.2, delta: 1.8, crowdCount: 4 },
    { movieId: 'tt2', title: 'Interstellar', mine: 6, crowd: 8.6, delta: -2.6, crowdCount: 9 },
  ],
  decades: [{ decade: 1990, count: 4 }, { decade: 2010, count: 8 }],
  verdict: 'You are more generous than the crowd.',
};

beforeEach(() => {
  Object.assign(state, { signal: null, loading: false, error: '' });
});

describe('Your Signal', () => {
  it('reports the verdict in words, not just numbers', () => {
    state.signal = base;
    render(<Signal />);
    expect(screen.getByText(/more generous than the crowd/)).toBeInTheDocument();
  });

  it('shows the bias with its sign, so direction is readable', () => {
    state.signal = base;
    render(<Signal />);
    // "+0.8" and "0.8" mean opposite things about this person.
    expect(screen.getByText('+0.8')).toBeInTheDocument();
  });

  it('says there is nothing yet rather than drawing an empty chart', () => {
    state.signal = { ...base, total: 0, verdict: 'No ratings yet. Review something and this fills in.' };
    render(<Signal />);
    expect(screen.getByText(/No ratings yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Distribution of your ratings/)).not.toBeInTheDocument();
  });

  it('omits the divergence panel when nobody else has rated the same films', () => {
    state.signal = { ...base, contrarian: [], comparedOn: 0, bias: null };
    render(<Signal />);
    expect(screen.queryByText(/Where you stand alone/)).not.toBeInTheDocument();
    // A missing comparison is shown as absent, not as a bias of zero, which
    // would claim the user agrees with a crowd that does not exist.
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('renders every rating bucket, including the ones never used', () => {
    state.signal = base;
    render(<Signal />);
    const list = screen.getByLabelText(/Distribution of your ratings/);
    expect(list.querySelectorAll('li')).toHaveLength(10);
    // The gap is the point: it shows where this person never rates.
    expect(list.querySelectorAll('li.is-used')).toHaveLength(1);
  });

  it('surfaces an error instead of rendering a blank panel', () => {
    state.error = 'Could not build your signal.';
    render(<Signal />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not build your signal.');
  });
});
