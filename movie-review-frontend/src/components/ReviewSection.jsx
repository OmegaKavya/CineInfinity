import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useReviews } from '../hooks/useReviews';

const BLANK = { rating: 7, comment: '' };

/**
 * Reviews for one film: the list, the compose form, and inline editing.
 *
 * Changes from the version embedded in App.js:
 *
 * Ratings are sent as numbers. A number input yields a string, and the old
 * code passed it straight through, so the API received "8" where the schema
 * expects 8. Mongoose coerced it, which is why nobody noticed - but anything
 * doing arithmetic on a rating would have been concatenating strings.
 *
 * The compose form starts at 7 rather than 1. Defaulting to the lowest
 * possible score meant every review posted without touching the slider was a
 * one-star review.
 *
 * Buttons are typed and disabled while a submission is in flight, so a double
 * click cannot post the same review twice.
 */
export default function ReviewSection({ movieId, film }) {
  const { user } = useAuth();
  const {
    reviews, loading, loadingMore, error, add, edit, remove, isMine,
    loadMore, total, average, hasMore,
  } = useReviews(movieId, film);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const ok = await add({ rating: Number(draft.rating), comment: draft.comment });
    setBusy(false);
    if (ok) {
      setDraft(BLANK);
      setComposing(false);
    }
  };

  const saveEdit = async (reviewId) => {
    setBusy(true);
    const ok = await edit(reviewId, {
      rating: Number(editDraft.rating),
      comment: editDraft.comment,
    });
    setBusy(false);
    if (ok) setEditingId(null);
  };

  return (
    <section className="reviews-section">
      <header className="reviews-header">
        <h3>Reviews {total > 0 && <small>({total})</small>}</h3>
        {/* Number.isFinite rather than a null check: the server sends null
            for a film nobody has rated, and an absent field reads as
            undefined, which "!== null" lets through and then crashes on
            .toFixed. */}
        {Number.isFinite(average) && (
          <span className="reviews-average" title="Average of every rating here">
            <b>{average.toFixed(1)}</b> average
          </span>
        )}
      </header>

      {error && <p className="error-text" role="alert">{error}</p>}

      {user ? (
        <button
          type="button"
          className="add-review-button"
          onClick={() => setComposing((open) => !open)}
        >
          {composing ? 'Cancel' : 'Add a review'}
        </button>
      ) : (
        <p>Sign in to leave a review.</p>
      )}

      {composing && (
        <div className="review-form">
          <label htmlFor="new-rating">Rating (1 to 10)</label>
          <input
            id="new-rating"
            type="number"
            min="1"
            max="10"
            value={draft.rating}
            onChange={(event) => setDraft({ ...draft, rating: event.target.value })}
          />
          <label htmlFor="new-comment">Your review</label>
          <textarea
            id="new-comment"
            rows="4"
            value={draft.comment}
            placeholder="What did you make of it?"
            onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
          />
          <button type="button" onClick={submit} disabled={busy}>
            {busy ? 'Posting…' : 'Post review'}
          </button>
        </div>
      )}

      {loading && <p>Loading reviews…</p>}

      {!loading && reviews.length === 0 && <p>No reviews yet. Be the first.</p>}

      {reviews.map((review) => (
        <article key={review._id} className="review-item">
          {editingId === review._id ? (
            <div className="edit-review-form">
              <label htmlFor={`edit-rating-${review._id}`}>Rating (1 to 10)</label>
              <input
                id={`edit-rating-${review._id}`}
                type="number"
                min="1"
                max="10"
                value={editDraft.rating}
                onChange={(event) => setEditDraft({ ...editDraft, rating: event.target.value })}
              />
              <label htmlFor={`edit-comment-${review._id}`}>Your review</label>
              <textarea
                id={`edit-comment-${review._id}`}
                rows="4"
                value={editDraft.comment}
                onChange={(event) => setEditDraft({ ...editDraft, comment: event.target.value })}
              />
              <button type="button" onClick={() => saveEdit(review._id)} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <p>
                <strong>{review.username}</strong> rated it {review.rating}/10
              </p>
              <p>{review.comment}</p>
              <p>
                <small>
                  <time dateTime={review.createdAt}>
                    {new Date(review.createdAt).toLocaleDateString()}
                  </time>
                  {review.updatedAt ? ' (edited)' : ''}
                </small>
              </p>

              {isMine(review) && (
                <div className="review-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(review._id);
                      setEditDraft({ rating: review.rating, comment: review.comment });
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(review._id)}>Delete</button>
                </div>
              )}
            </>
          )}
        </article>
      ))}

      {hasMore && (
        <button
          type="button"
          className="reviews-more"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : `Show more (${total - reviews.length} left)`}
        </button>
      )}
    </section>
  );
}
