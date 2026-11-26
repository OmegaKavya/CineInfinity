const express = require("express");
const axios = require("axios");
const { validateMovieQuery, validateImdbId } = require("../middleware/validate");
const { createCache } = require("../lib/cache");
const { UPSTREAM_UNAVAILABLE } = require("../lib/upstream");

const router = express.Router();

// Fetch movie details from OMDB API
const omdb = axios.create({ baseURL: "https://www.omdbapi.com/", timeout: 8000, maxRedirects: 0 });
const tmdb = axios.create({ baseURL: "https://api.themoviedb.org/3", timeout: 8000, maxRedirects: 0 });

// Upstream responses are cached because the free OMDb tier allows 1,000
// requests a day and every home page load costs two TMDb calls on its own.
// Film details are effectively immutable, so they are held far longer than a
// popularity list, which moves over hours.
const TTL = {
  details: 24 * 60 * 60 * 1000,
  search: 60 * 60 * 1000,
  discover: 30 * 60 * 1000,
};

const cache = createCache({ max: 1000, ttlMs: TTL.search });

/** Exposed so /health can report whether the cache is doing its job. */
router.cacheStats = () => cache.stats();

router.get("/omdb/details", validateImdbId, async (req, res) => {
  try {
    const response = await cache.wrap(
      `omdb:details:${req.query.imdbID}`,
      () => omdb.get("/", { params: { i: req.query.imdbID, apikey: process.env.OMDB_API_KEY } }),
      TTL.details
    );
    if (response.data.Response === "False") return res.status(404).json({ error: "Movie not found" });
    return res.json(response.data);
  } catch (error) {
    console.error("OMDb details request failed:", error.message);
    return res.status(502).json({ error: "Failed to fetch movie details from OMDb", code: UPSTREAM_UNAVAILABLE });
  }
});

// Express matches routes in declaration order, so every literal path has to
// be declared before the ":title" patterns below. Previously "/omdb/search"
// sat after "/omdb/:title" and was unreachable: a search request matched the
// detail route with title="search", and OMDb was asked for a film called
// "search".
router.get("/omdb/search", validateMovieQuery, async (req, res) => {
  try {
    const { query } = req.query;
    const response = await cache.wrap(
      `omdb:search:${query.toLowerCase()}`,
      () => omdb.get("/", { params: { s: query, apikey: process.env.OMDB_API_KEY } }),
      TTL.search
    );
    
    if (response.data.Response === "False") {
      return res.status(404).json({ error: "No movies found" });
    }
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movie suggestions from OMDb" });
  }
});

router.get("/tmdb/search", validateMovieQuery, async (req, res) => {
  try {
    const { query } = req.query;
    const response = await cache.wrap(
      `tmdb:search:${query.toLowerCase()}`,
      () => tmdb.get("/search/movie", { params: { query, api_key: process.env.TMDB_API_KEY } }),
      TTL.search
    );

    if (!response.data.results || response.data.results.length === 0) {
      return res.status(404).json({ error: "No movies found" });
    }

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movie suggestions from TMDb" });
  }
});

// An optional ?year= disambiguates titles that belong to more than one film.
// Without it OMDb returns its own preferred match, which is how clicking the
// 2019 Lion King poster opened the 1994 film: different films, different IMDb
// ids, and reviews are keyed by that id, so the review landed on the wrong
// one. Verified against OMDb: "The Lion King" alone returns tt0110357 (1994),
// with y=2019 it returns tt6105098.
router.get("/omdb/:title", validateMovieQuery, async (req, res) => {
  try {
    const { title } = req.params;
    const year = /^\d{4}$/.test(String(req.query.year || "")) ? req.query.year : undefined;

    const lookup = (params) =>
      cache.wrap(
        `omdb:title:${title.toLowerCase()}:${params.y || ""}`,
        () => omdb.get("/", { params: { t: title, apikey: process.env.OMDB_API_KEY, ...params } }),
        TTL.details
      );

    let response = await lookup(year ? { y: year } : {});

    // A year that OMDb disagrees with should not turn a findable film into a
    // 404, so fall back to the title alone and let the client see which year
    // actually came back.
    if (year && response.data.Response === "False") {
      response = await lookup({});
    }

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
    const response = await cache.wrap(
      `tmdb:title:${title.toLowerCase()}`,
      () => tmdb.get("/search/movie", { params: { query: title, api_key: process.env.TMDB_API_KEY } }),
      TTL.search
    );

    if (!response.data.results || response.data.results.length === 0) {
      return res.status(404).json({ error: "Movie not found" });
    }

    res.json(response.data.results[0]); // Return the first matching result
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movie details from TMDb" });
  }
});

// Fetch movie suggestions from OMDB API

// Fetch movie suggestions from TMDB API

// Unified endpoint to fetch movie suggestions from both OMDb and TMDb
router.get("/search", validateMovieQuery, async (req, res) => {
  try {
    const { query } = req.query;

    // Both cached, under the same keys the single-source routes use, so this
    // route and /omdb/search share one OMDb budget instead of each spending it.
    const key = query.toLowerCase();
    const omdbResponse = await cache.wrap(
      `omdb:search:${key}`,
      () => omdb.get("/", { params: { s: query, apikey: process.env.OMDB_API_KEY } }),
      TTL.search
    );
    const tmdbResponse = await cache.wrap(
      `tmdb:search:${key}`,
      () => tmdb.get("/search/movie", { params: { query, api_key: process.env.TMDB_API_KEY } }),
      TTL.search
    );

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
    const response = await cache.wrap(
      `tmdb:discover:${String(req.params.catalogue).toLowerCase()}:${page}`,
      () =>
        tmdb.get("/discover/movie", {
          params: {
            ...preset,
            page,
            include_adult: false,
            "vote_count.gte": 50, // keeps the list to films enough people have seen
            api_key: process.env.TMDB_API_KEY,
          },
        }),
      TTL.discover
    );

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
    if (error.response?.status === 401) {
      return res.status(500).json({ error: "TMDB_API_KEY is missing or invalid on the server." });
    }
    console.error("TMDb discover request failed:", error.message);
    res.status(502).json({ error: "Could not reach TMDb.", code: UPSTREAM_UNAVAILABLE });
  }
});

module.exports = router;
