import React from "react";
import "./MovieCard.css";

const MovieCard = ({ movie }) => {
  // Open IMDb page in a new tab
  const handleLearnMore = () => {
    const imdbUrl = `https://www.imdb.com/title/${movie.imdbID}`;
    window.open(imdbUrl, "_blank");
  };

  // Open YouTube search for the trailer in a new tab
  const handleWatchTrailer = () => {
    const trailerSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      movie.Title + " trailer"
    )}`;
    window.open(trailerSearchUrl, "_blank");
  };

  return (
    <div className="movie-card modern-card">
      {/* Movie Poster */}
      <img
        src={movie.Poster !== "N/A" ? movie.Poster : "/default-poster.jpg"}
        alt={movie.Title || "Movie Poster"}
        className="movie-poster"
      />

      {/* Movie Details */}
      <div className="movie-details">
        <h2 className="movie-title">{movie.Title || "Title Unavailable"}</h2>

        {movie.Genre && (
          <p className="movie-genre">
            <strong>Genre:</strong> {movie.Genre}
          </p>
        )}

        {/* IMDb Rating */}
        {movie.imdbRating && (
          <p className="movie-rating">
            <strong>IMDb Rating:</strong> ⭐ {movie.imdbRating}/10
          </p>
        )}

        {/* Plot */}
        <p className="movie-plot">
          {movie.Plot && movie.Plot !== "N/A"
            ? movie.Plot
            : "Plot details not available."}
        </p>

        {/* Buttons */}
        <div className="movie-buttons">
          <button className="modern-button learn-more" onClick={handleLearnMore}>
            Learn More
          </button>
          <button className="modern-button watch-trailer" onClick={handleWatchTrailer}>
            Watch Trailer
          </button>
        </div>
      </div>
    </div>
  );
};

export default MovieCard;