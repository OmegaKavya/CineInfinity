// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// Hoisted so the module factories below can see it.
const state = vi.hoisted(() => ({ user: null }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: state.user, signIn: vi.fn(), signOut: vi.fn() }),
}));

// Mirrors the real hook's return shape; a partial mock made the component
// throw "isMine is not a function" rather than fail an assertion.
vi.mock('../../hooks/useReviews', () => ({
  useReviews: () => ({
    reviews: [
      { _id: 'r1', username: 'Someone', rating: 8, comment: 'Good', userId: 'other' },
    ],
    loading: false,
    error: '',
    add: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
    isMine: (review) => Boolean(state.user) && review.userId === state.user.uid,
    clearError: vi.fn(),
  }),
}));

const { default: ReviewSection } = await import('../ReviewSection');

afterEach(cleanup);
beforeEach(() => {
  state.user = null;
});

describe('ReviewSection', () => {
  it('shows existing reviews to a signed-out visitor', () => {
    // The whole app used to sit behind a sign-in, so nobody could read a
    // review without a Google account. Reading is open; only writing is not.
    render(<ReviewSection movieId="tt0110357" />);
    expect(screen.getByText(/Someone/)).toBeInTheDocument();
    expect(screen.getByText(/Good/)).toBeInTheDocument();
  });

  it('offers no way to write a review when signed out', () => {
    render(<ReviewSection movieId="tt0110357" />);
    expect(screen.queryByRole('button', { name: /add a review/i })).toBeNull();
    expect(screen.getByText(/sign in to leave a review/i)).toBeInTheDocument();
  });

  it('offers the compose button once signed in', () => {
    state.user = { uid: 'me', displayName: 'Kavya' };
    render(<ReviewSection movieId="tt0110357" />);
    expect(screen.getByRole('button', { name: /add a review/i })).toBeInTheDocument();
  });

  it('labels both rating fields in plain words, with no dash a visitor sees', () => {
    // Both labels put an en dash between 1 and 10, the last one on the site.
    state.user = { uid: 'other', displayName: 'Someone' };
    const { container } = render(<ReviewSection movieId="tt0110357" />);
    fireEvent.click(screen.getByRole('button', { name: /add a review/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getAllByLabelText('Rating (1 to 10)')).toHaveLength(2);
    expect(container.textContent).not.toMatch(/[\u2013\u2014]/);
  });
});
