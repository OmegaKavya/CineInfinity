// @vitest-environment happy-dom
//
// The hook itself, with the HTTP client mocked rather than the hook. The
// component tests above mock useReviews, so without this the logic that
// actually decides what is stored, what is rolled back and what the user is
// told is never executed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
const auth = vi.hoisted(() => ({ user: { uid: 'me' } }));

vi.mock('../../api/client', () => ({
  api,
  authHeaders: vi.fn(async (user) => {
    if (!user) throw new Error('You must be signed in to do that.');
    return { headers: { Authorization: 'Bearer test-token' } };
  }),
  readableError: (err, fallback) => err?.response?.data?.error || fallback,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user }),
}));

const { useReviews } = await import('../useReviews');

const existing = {
  _id: 'r1',
  movieId: 'tt1',
  userId: 'me',
  username: 'Kavya',
  rating: 7,
  comment: 'Held up.',
};

beforeEach(() => {
  auth.user = { uid: 'me' };
  api.get.mockReset().mockResolvedValue({ data: [existing] });
  api.post.mockReset();
  api.put.mockReset();
  api.delete.mockReset();
});
afterEach(cleanup);

describe('loading', () => {
  it('fetches the reviews for the film it was given', async () => {
    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(api.get).toHaveBeenCalledWith('/reviews/tt1');
    expect(result.current.reviews).toHaveLength(1);
  });

  it('encodes an id rather than pasting it into the path raw', async () => {
    renderHook(() => useReviews('tt1/../admin'));
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get.mock.calls[0][0]).toBe('/reviews/tt1%2F..%2Fadmin');
  });

  it('asks for nothing when there is no film', () => {
    renderHook(() => useReviews(undefined));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('survives a response that is not an array', async () => {
    api.get.mockResolvedValue({ data: { oops: true } });
    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reviews).toEqual([]);
  });

  it('reports a failed load without throwing', async () => {
    api.get.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.reviews).toEqual([]);
  });
});

describe('adding', () => {
  it('refuses an empty comment before troubling the server', async () => {
    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.add({ rating: 8, comment: '   ' });
    });

    expect(returned).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it('sends the film id with the review and prepends the result', async () => {
    const created = { ...existing, _id: 'r2', comment: 'New one.' };
    api.post.mockResolvedValue({ data: { review: created } });

    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add({ rating: 9, comment: 'New one.' });
    });

    const [path, body, config] = api.post.mock.calls[0];
    expect(path).toBe('/reviews');
    expect(body).toMatchObject({ movieId: 'tt1', rating: 9, comment: 'New one.' });
    expect(config.headers.Authorization).toBe('Bearer test-token');
    expect(result.current.reviews[0]._id).toBe('r2');
  });

  it('leaves the list untouched when the server refuses', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Invalid review' } } });

    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.add({ rating: 9, comment: 'New one.' });
    });

    expect(returned).toBe(false);
    expect(result.current.reviews).toHaveLength(1);
    expect(result.current.error).toBe('Invalid review');
  });

  it('does not post when signed out', async () => {
    auth.user = null;
    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add({ rating: 9, comment: 'New one.' });
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });
});

describe('editing and removing', () => {
  it('replaces only the edited review', async () => {
    api.put.mockResolvedValue({ data: { review: { ...existing, rating: 10 } } });

    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.edit('r1', { rating: 10, comment: 'Held up.' });
    });

    expect(result.current.reviews[0].rating).toBe(10);
    expect(result.current.reviews).toHaveLength(1);
  });

  it('keeps the old value when an edit fails', async () => {
    api.put.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.edit('r1', { rating: 10, comment: 'x' });
    });

    expect(result.current.reviews[0].rating).toBe(7);
    expect(result.current.error).toBeTruthy();
  });

  it('removes a review only after the server confirms', async () => {
    api.delete.mockResolvedValue({});

    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('r1');
    });

    expect(result.current.reviews).toHaveLength(0);
  });

  it('keeps the review when the delete fails', async () => {
    api.delete.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('r1');
    });

    expect(result.current.reviews).toHaveLength(1);
    expect(result.current.error).toBeTruthy();
  });
});

describe('ownership', () => {
  it('matches on the stored userId, not the display name', async () => {
    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isMine(existing)).toBe(true);
    expect(result.current.isMine({ ...existing, userId: 'someone-else' })).toBe(false);
  });

  it('claims nothing when signed out', async () => {
    auth.user = null;
    const { result } = renderHook(() => useReviews('tt1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isMine(existing)).toBe(false);
  });
});
