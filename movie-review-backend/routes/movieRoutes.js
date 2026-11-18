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

module.exports = router;
