const express = require("express");
const axios = require("axios");
const { validateMovieQuery } = require("../middleware/validate");

const router = express.Router();

// Fetch movie details from OMDB API
const omdb = axios.create({ baseURL: "https://www.omdbapi.com/", timeout: 8000, maxRedirects: 0 });
const tmdb = axios.create({ baseURL: "https://api.themoviedb.org/3", timeout: 8000, maxRedirects: 0 });

router.get("/omdb/details", validateMovieQuery, async (req, res) => {
  try {
    const response = await omdb.get("/", { params: { i: req.query.imdbID, apikey: process.env.OMDB_API_KEY } });
    if (response.data.Response === "False") return res.status(404).json({ error: "Movie not found" });
    return res.json(response.data);
  } catch (_error) {
    return res.status(502).json({ error: "Failed to fetch movie details from OMDb" });
  }
});

router.get("/omdb/:title", validateMovieQuery, async (req, res) => {
  try {
    const { title } = req.params;
    const response = await omdb.get("/", { params: { t: title, apikey: process.env.OMDB_API_KEY } });
    
    if (response.data.Response === "False") {
      return res.status(404).json({ error: "Movie not found" });
    }
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movie details from OMDb" });
  }
});

// Fetch movie details from TMDB API
router.get("/tmdb/:title", validateMovieQuery, async (req, res) => {
  try {
    const { title } = req.params;
    const response = await tmdb.get("/search/movie", { params: { query: title, api_key: process.env.TMDB_API_KEY } });

    if (!response.data.results || response.data.results.length === 0) {
      return res.status(404).json({ error: "Movie not found" });
    }

    res.json(response.data.results[0]); // Return the first matching result
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movie details from TMDb" });
  }
});

// Fetch movie suggestions from OMDB API
router.get("/omdb/search", validateMovieQuery, async (req, res) => {
  try {
    const { query } = req.query;
    const response = await omdb.get("/", { params: { s: query, apikey: process.env.OMDB_API_KEY } });
    
    if (response.data.Response === "False") {
      return res.status(404).json({ error: "No movies found" });
    }
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movie suggestions from OMDb" });
  }
});

// Fetch movie suggestions from TMDB API
router.get("/tmdb/search", validateMovieQuery, async (req, res) => {
  try {
    const { query } = req.query;
    const response = await tmdb.get("/search/movie", { params: { query, api_key: process.env.TMDB_API_KEY } });

    if (!response.data.results || response.data.results.length === 0) {
      return res.status(404).json({ error: "No movies found" });
    }

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movie suggestions from TMDb" });
  }
});

// Unified endpoint to fetch movie suggestions from both OMDb and TMDb
router.get("/search", validateMovieQuery, async (req, res) => {
  try {
    const { query } = req.query;

    // Fetch suggestions from OMDb
    const omdbResponse = await omdb.get("/", { params: { s: query, apikey: process.env.OMDB_API_KEY } });

    // Fetch suggestions from TMDb
    const tmdbResponse = await tmdb.get("/search/movie", { params: { query, api_key: process.env.TMDB_API_KEY } });

    const omdbSuggestions = omdbResponse.data.Search || [];
    const tmdbSuggestions = (tmdbResponse.data.results || []).map((movie) => ({
      imdbID: movie.id, // TMDb uses `id` instead of `imdbID`
      Title: movie.title,
      Year: movie.release_date ? movie.release_date.split("-")[0] : "N/A",
      source: "tmdb",
    }));

    const combinedSuggestions = [...omdbSuggestions, ...tmdbSuggestions];

    if (combinedSuggestions.length === 0) {
      return res.status(404).json({ error: "No movies found" });
    }

    res.json(combinedSuggestions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movie suggestions" });
  }
});

/**
 * Browse a catalogue, rather than search for one title.
 *
 * The frontend's three sections need lists of films to show before anyone has
 * typed anything, and every existing route here requires a query. TMDb's
 * discover endpoint does this, filtered by original language, which is what
 * actually separates a Hollywood catalogue from a Bollywood one - region
 * codes describe where a film was released, not what it is.
 *
 * Anime is deliberately absent: the frontend fetches it from AniList, whose
 * API needs no key, allows browser requests, and carries the relation edges
 * the watch-order feature depends on. Proxying it here would add a hop for
 * nothing.
 */
const CATALOGUES = {
  hollywood: { with_original_language: "en", sort_by: "popularity.desc" },
  bollywood: { with_original_language: "hi", sort_by: "popularity.desc" },
};

router.get("/discover/:catalogue", async (req, res) => {
  const preset = CATALOGUES[String(req.params.catalogue).toLowerCase()];
  if (!preset) {
    return res.status(400).json({
      error: `Unknown catalogue. Choose one of: ${Object.keys(CATALOGUES).join(", ")}.`,
    });
  }

  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 50);

  try {
    const response = await tmdb.get("/discover/movie", {
      params: {
        ...preset,
        page,
        include_adult: false,
        "vote_count.gte": 50, // keeps the list to films enough people have seen
        api_key: process.env.TMDB_API_KEY,
      },
    });

    // Return only what the cards render. The raw TMDb payload is roughly ten
    // times this size, and shipping fields nobody reads is just bandwidth.
    res.json({
      page: response.data.page,
      totalPages: Math.min(response.data.total_pages || 1, 50),
      results: (response.data.results || []).map((film) => ({
        id: film.id,
        title: film.title,
        overview: film.overview,
        year: (film.release_date || "").slice(0, 4),
        rating: film.vote_average,
        poster: film.poster_path
          ? `https://image.tmdb.org/t/p/w500${film.poster_path}`
          : null,
        backdrop: film.backdrop_path
          ? `https://image.tmdb.org/t/p/original${film.backdrop_path}`
          : null,
      })),
    });
  } catch (error) {
    const status = error.response?.status === 401 ? 500 : 502;
    res.status(status).json({
      error:
        error.response?.status === 401
          ? "TMDB_API_KEY is missing or invalid on the server."
          : "Could not reach TMDb.",
    });
  }
});

module.exports = router;
