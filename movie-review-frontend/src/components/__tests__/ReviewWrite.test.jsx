// @vitest-environment happy-dom
//
// The write path: composing, editing and deleting a review. This is the only
// place a visitor can change stored data, so it is worth driving through the
// real component rather than trusting the hook in isolation.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = vi.hoisted(() => ({ user: { uid: 'me', displayName: 'Kavya' } }));
const hook = vi.hoisted(() => ({
  add: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
  reviews: [],
  error: '',
  loading: false,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: state.user, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('../../hooks/useReviews', () => ({
  useReviews: () => ({
    reviews: hook.reviews,
    loading: hook.loading,
    error: hook.error,
    add: hook.add,
    edit: hook.edit,
    remove: hook.remove,
    isMine: (review) => Boolean(state.user) && review.uid === state.user.uid,
    clearError: vi.fn(),
  }),
}));

const { default: ReviewSection } = await import('../ReviewSection');

const mine = {
  _id: 'r1',
  uid: 'me',
  username: 'Kavya',
  rating: 7,
  comment: 'Held up better than I expected.',
  createdAt: '2026-01-02T00:00:00.000Z',
};
const theirs = { ...mine, _id: 'r2', uid: 'someone-else', username: 'Ravi' };

beforeEach(() => {
  state.user = { uid: 'me', displayName: 'Kavya' };
  hook.reviews = [];
  hook.error = '';
  hook.loading = false;
  hook.add.mockReset();
  hook.edit.mockReset();
  hook.remove.mockReset();
});
afterEach(cleanup);

describe('composing a review', () => {
  it('stays closed until asked for', () => {
    render(<ReviewSection movieId="tt1" />);
    expect(screen.queryByLabelText(/your review/i)).toBeNull();
  });

  it('submits what was typed', async () => {
    render(<ReviewSection movieId="tt1" />);
    await userEvent.click(screen.getByRole('button', { name: /add a review/i }));

    const rating = screen.getByLabelText(/rating/i);
    await userEvent.clear(rating);
    await userEvent.type(rating, '9');
    await userEvent.type(screen.getByLabelText(/your review/i), 'Genuinely good.');
    await userEvent.click(screen.getByRole('button', { name: /post review/i }));

    expect(hook.add).toHaveBeenCalledTimes(1);
    const payload = hook.add.mock.calls[0][0];
    expect(String(payload.rating)).toBe('9');
    expect(payload.comment).toBe('Genuinely good.');
  });

  it('bounds the rating input at the extremes the API accepts', async () => {
    render(<ReviewSection movieId="tt1" />);
    await userEvent.click(screen.getByRole('button', { name: /add a review/i }));
    const rating = screen.getByLabelText(/rating/i);
    expect(rating).toHaveAttribute('min', '1');
    expect(rating).toHaveAttribute('max', '10');
  });

  it('can be cancelled without posting', async () => {
    render(<ReviewSection movieId="tt1" />);
    await userEvent.click(screen.getByRole('button', { name: /add a review/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByLabelText(/your review/i)).toBeNull();
    expect(hook.add).not.toHaveBeenCalled();
  });
});

describe('editing and deleting', () => {
  it('offers edit and delete only on my own review', () => {
    hook.reviews = [mine, theirs];
    render(<ReviewSection movieId="tt1" />);

    const articles = screen.getAllByRole('article');
    expect(within(articles[0]).getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(within(articles[1]).queryByRole('button', { name: /edit/i })).toBeNull();
    expect(within(articles[1]).queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('offers neither once signed out', () => {
    state.user = null;
    hook.reviews = [mine];
    render(<ReviewSection movieId="tt1" />);
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('opens the editor pre-filled with the existing review', async () => {
    hook.reviews = [mine];
    render(<ReviewSection movieId="tt1" />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));

    expect(screen.getByLabelText(/rating/i)).toHaveValue(7);
    expect(screen.getByLabelText(/your review/i)).toHaveValue(mine.comment);
  });

  it('saves an edit through the hook', async () => {
    hook.reviews = [mine];
    render(<ReviewSection movieId="tt1" />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));

    const comment = screen.getByLabelText(/your review/i);
    await userEvent.clear(comment);
    await userEvent.type(comment, 'Changed my mind.');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(hook.edit).toHaveBeenCalledTimes(1);
    expect(hook.edit.mock.calls[0][0]).toBe('r1');
  });

  it('leaves the review untouched when an edit is cancelled', async () => {
    hook.reviews = [mine];
    render(<ReviewSection movieId="tt1" />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(hook.edit).not.toHaveBeenCalled();
    expect(screen.getByText(mine.comment)).toBeInTheDocument();
  });
});

describe('states', () => {
  it('reports an error without hiding the reviews', () => {
    hook.reviews = [mine];
    hook.error = 'Could not save that.';
    render(<ReviewSection movieId="tt1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save that.');
    expect(screen.getByText(mine.comment)).toBeInTheDocument();
  });

  it('says so when there is nothing to show', () => {
    render(<ReviewSection movieId="tt1" />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });
});
