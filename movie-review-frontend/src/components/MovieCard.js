import "./MovieCard.css";

/**
 * One film: poster on the left, everything known about it on the right.
 *
 * The previous layout stacked a poster above centred text in a column about
 * 300px wide, so on a desktop it was a thin strip floating in the middle of
 * an empty page, and it showed three of the fifteen fields OMDb returns.
 * Director, cast, runtime, certificate and vote count were all fetched and
 * discarded.
 */

/** OMDb writes "N/A" rather than omitting a field. */
const has = (value) => value && value !== "N/A";

function MovieCard({ movie }) {
  const imdbUrl = `https://www.imdb.com/title/${movie.imdbID}`;
  const trailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${movie.Title} ${has(movie.Year) ? movie.Year : ""} trailer`
  )}`;

  const facts = [
    has(movie.Rated) && movie.Rated,
    has(movie.Runtime) && movie.Runtime,
    has(movie.Released) && movie.Released,
    has(movie.Language) && movie.Language.split(",")[0].trim(),
  ].filter(Boolean);

  const genres = has(movie.Genre)
    ? movie.Genre.split(",").map((g) => g.trim())
    : [];

  const credits = [
    has(movie.Director) && { label: "Director", value: movie.Director },
    has(movie.Writer) && { label: "Writer", value: movie.Writer },
    has(movie.Actors) && { label: "Starring", value: movie.Actors },
    has(movie.Awards) && { label: "Awards", value: movie.Awards },
  ].filter(Boolean);

  return (
    <article className="film">
      <div className="film__poster-wrap">
        {has(movie.Poster) ? (
          <img
            src={movie.Poster}
            alt={`Poster for ${movie.Title}`}
            className="film__poster"
          />
        ) : (
          <div className="film__poster film__poster--missing" aria-hidden="true">
            🎬
          </div>
        )}
      </div>

      <div className="film__body">
        <header className="film__head">
          <h2 className="film__title">
            {movie.Title || "Title unavailable"}
            {has(movie.Year) && <span className="film__year">{movie.Year}</span>}
          </h2>

          {facts.length > 0 && (
            <p className="film__facts">
              {facts.map((fact, i) => (
                <span key={fact}>
                  {i > 0 && <i aria-hidden="true">·</i>}
                  {fact}
                </span>
              ))}
            </p>
          )}
        </header>

        {genres.length > 0 && (
          <ul className="film__genres">
            {genres.map((genre) => (
              <li key={genre}>{genre}</li>
            ))}
          </ul>
        )}

        {has(movie.imdbRating) && (
          <div className="film__score">
            <span className="film__score-value">{movie.imdbRating}</span>
            <span className="film__score-of">/ 10</span>
            {has(movie.imdbVotes) && (
              <span className="film__score-votes">
                {movie.imdbVotes} votes on IMDb
              </span>
            )}
          </div>
        )}

        <p className="film__plot">
          {has(movie.Plot) ? movie.Plot : "No synopsis available for this title."}
        </p>

        {credits.length > 0 && (
          <dl className="film__credits">
            {credits.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="film__actions">
          <a
            className="film__button film__button--primary"
            href={imdbUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on IMDb
          </a>
          <a
            className="film__button"
            href={trailerUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Find the trailer
          </a>
        </div>
      </div>
    </article>
  );
}

export default MovieCard;
