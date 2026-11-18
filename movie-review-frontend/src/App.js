import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import MovieCard from "./components/MovieCard";
import "./App.css";
import { auth, signInWithGoogle, logout } from "./firebase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://movie-review-webapp-vyps.onrender.com/api";

const movieImages = [
  "https://image.tmdb.org/t/p/original/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg", // Tenet
  "https://image.tmdb.org/t/p/original/q719jXXEzOoYaps6babgKnONONX.jpg", // Interstellar
  "https://image.tmdb.org/t/p/original/2CAL2433ZeIihfX1Hb2139CX0pW.jpg", // La La Land
  "https://image.tmdb.org/t/p/original/kqjL17yufvn9OVLyXYpvtyrFfak.jpg", // Jurassic World
  "https://image.tmdb.org/t/p/original/9O7gLzmreU0nGkIB6K3BsJbzvNv.jpg", // Inception
  "https://image.tmdb.org/t/p/original/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg", // The Matrix
  "https://image.tmdb.org/t/p/original/2u7zbn8EudG6kLlBzUYqP5nbEw6.jpg", // The Batman
  "https://image.tmdb.org/t/p/original/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", // The Dark Knight
  "https://image.tmdb.org/t/p/original/mDfJG3LC3Dqb67AZ52x3Z0jU0uB.jpg", // Avengers: Endgame
  "https://image.tmdb.org/t/p/original/4q2hz2m8hubgvijz8Ez0T2Os2Yv.jpg", // Spider-Man: No Way Home
];

const App = () => {
  const [movieTitle, setMovieTitle] = useState("");
  const [movieData, setMovieData] = useState(null);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [newReview, setNewReview] = useState({ rating: 1, comment: "" });
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editReviewData, setEditReviewData] = useState({ rating: 1, comment: "" });
  const [darkMode, setDarkMode] = useState(false); // State for dark mode
  const [showDropdown, setShowDropdown] = useState(false); // State for dropdown menu
  const [suggestions, setSuggestions] = useState([]); // Stores autocomplete suggestions
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1); // Tracks keyboard navigation
  const [showSuggestions, setShowSuggestions] = useState(false); // Toggles suggestion dropdown

  const authenticatedConfig = async () => {
    const token = await user?.getIdToken();
    if (!token) throw new Error("You must be signed in");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.body.classList.toggle("dark-mode", !darkMode);
  };

  // Handle dropdown visibility
  const toggleDropdown = () => setShowDropdown(!showDropdown);

  // Debounce function to delay API calls
  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  // Fetch movie suggestions from OMDB
  const fetchSuggestions = async (query) => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await axios.get(
        `${API_BASE_URL}/movies/omdb/search`, { params: { query } }
      );

      if (response.data.Search && response.data.Search.length > 0) {
        const formattedSuggestions = response.data.Search.map((movie) => ({
          imdbID: movie.imdbID,
          Title: movie.Title,
          Year: movie.Year,
          source: "omdb",
        }));
        setSuggestions(formattedSuggestions);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (err) {
      console.error("Error fetching suggestions:", err);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Debounced version of fetchSuggestions
  const debouncedFetchSuggestions = useCallback(
    debounce((query) => {fetchSuggestions(query);}, 300),
    [fetchSuggestions]
  );

  // Fetch full movie details from OMDB
  const fetchMovieDetails = async (imdbID) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/movies/omdb/details`, { params: { imdbID } }
      );
      if (response.data) {
        setMovieData(response.data); // Display the selected movie
        setError("");
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (err) {
      console.error("Error fetching movie details:", err);
      setError("Failed to fetch movie details. Please try again.");
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    const query = e.target.value;
    setMovieTitle(query);
    debouncedFetchSuggestions(query); // Fetch suggestions as the user types
  };

  // Handle suggestion click
  const handleSuggestionClick = (imdbID) => {
    fetchMovieDetails(imdbID); // Fetch and display the selected movie
    setMovieTitle(""); // Clear the search bar
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      setActiveSuggestionIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      setActiveSuggestionIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      if (activeSuggestionIndex >= 0) {
        fetchMovieDetails(suggestions[activeSuggestionIndex].imdbID);
      } else if (movieTitle.trim()) {
        fetchMovie(); // Fetch movie details directly if no suggestion is selected
      }
      setMovieTitle(""); // Clear the search bar
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // Handle user authentication and scrolling effects
  useEffect(() => {
    auth.onAuthStateChanged((currentUser) => setUser(currentUser));

    const handleScroll = () => setScrolling(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Automatic slideshow for the login page
  useEffect(() => {
    const slideInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % movieImages.length);
    }, 5000);
    return () => clearInterval(slideInterval);
  }, []);

  // Fetch movie details and reviews
  const fetchMovie = async () => {
    if (!movieTitle.trim()) {
      setError("Please enter a movie title.");
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/movies/omdb/${encodeURIComponent(movieTitle)}`);
      if (response.data && response.data.Title) {
        setMovieData(response.data);
        setError("");

        // Fetch reviews for the movie
        const reviewsResponse = await axios.get(`${API_BASE_URL}/reviews/${encodeURIComponent(response.data.imdbID)}`);
        setReviews(reviewsResponse.data);
      } else {
        setMovieData(null);
        setError("Movie not found. Please try another title.");
      }
    } catch (err) {
      console.error("Error fetching movie or reviews:", err);
      setMovieData(null);
      setError("An error occurred. Please check your connection and try again.");
    }
  };

  // Add a new review
  const handleAddReview = async () => {
    if (!newReview.comment.trim()) {
      setError("Please write a review.");
      return;
    }

    try {
      const reviewData = {
        movieId: movieData.imdbID,
        rating: newReview.rating,
        comment: newReview.comment,
      };

      const response = await axios.post(`${API_BASE_URL}/reviews`, reviewData, await authenticatedConfig());
      setReviews([response.data.review, ...reviews]);
      setNewReview({ rating: 1, comment: "" });
      setShowReviewForm(false);
      setError("");
    } catch (error) {
      setError("Failed to add review. Please try again.");
    }
  };

  // Edit an existing review
  const handleEditReview = async (reviewId) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/reviews/${reviewId}`, editReviewData, await authenticatedConfig());
      const updatedReviews = reviews.map((review) =>
        review._id === reviewId ? response.data.review : review
      );
      setReviews(updatedReviews);
      setEditingReviewId(null);
      setEditReviewData({ rating: 1, comment: "" });
      setError("");
    } catch (error) {
      setError("Failed to update review. Please try again.");
    }
  };

  // Delete a review
  const handleDeleteReview = async (reviewId) => {
    try {
      await axios.delete(`${API_BASE_URL}/reviews/${reviewId}`, await authenticatedConfig());
      const updatedReviews = reviews.filter((review) => review._id !== reviewId);
      setReviews(updatedReviews);
      setError("");
    } catch (error) {
      setError("Failed to delete review. Please try again.");
    }
  };

  return (
    <div className={`app-container ${darkMode ? "dark-mode" : ""}`}>
      {/* Navbar */}
      <nav className={`navbar ${scrolling ? "navbar-scrolled" : ""}`}>
        <h1 className="logo">CineInfinity 🎬</h1>
        <div className="navbar-features">
          {/* Search Bar */}
          {user && ( // Only show the search bar if the user is logged in
            <div className="search-bar-container">
              <input
                type="text"
                className="navbar-search"
                placeholder="🔍 Search movies..."
                value={movieTitle}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowSuggestions(true)}
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions-dropdown">
                  {suggestions.map((suggestion, index) => (
                    <li
                      key={suggestion.imdbID}
                      className={`suggestion-item ${
                        index === activeSuggestionIndex ? "active" : ""
                      }`}
                      onClick={() => handleSuggestionClick(suggestion.imdbID)}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                    >
                      {suggestion.Title} ({suggestion.Year})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* Dark Mode Toggle */}
          <button className="dark-mode-toggle" onClick={toggleDarkMode}>
            {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </button>
          {/* User Profile */}
          <div className="profile-container">
            {user ? (
              <>
                <img
                  src={user.photoURL}
                  alt="User Profile"
                  className="profile-pic"
                  onClick={toggleDropdown}
                />
                {showDropdown && (
                  <div className="dropdown-menu">
                    <button onClick={logout}>Logout</button>
                    <button onClick={() => alert("Profile feature coming soon!")}>
                      Profile
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button className="auth-button" onClick={signInWithGoogle}>
                Login
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Login Page */}
      {!user ? (
        <div className="login-page fade-in">
          <div className="slideshow">
            {movieImages.map((image, index) => (
              <div
                key={index}
                className={`slide ${index === currentSlide ? "active" : ""}`}
                style={{ backgroundImage: `url(${image})` }}
              ></div>
            ))}
          </div>
          <div className="overlay"></div>
          <div className="login-content">
            <h1>Welcome to CineInfinity 🎬</h1>
            <p>Your ultimate destination for movie reviews.</p>
            <button className="auth-button pulse-effect" onClick={signInWithGoogle}>
              Sign in to Continue
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Movie Search Section */}
          <div className="search-section smooth-scroll">
            <h2 className="search-title">Find Your Favorite Movie</h2>
            <div className="search-container">
              <input
                type="text"
                className="search-input"
                placeholder="🔍 Search for a movie..."
                value={movieTitle}
                onChange={(e) => setMovieTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && movieTitle.trim()) {
                    fetchMovie(); // Fetch movie details when Enter is pressed
                  }
                }}
              />
              <button className="search-button" onClick={fetchMovie}>🎥 Find</button>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          {movieData && <MovieCard movie={movieData} />}

          {/* Reviews Section */}
          {movieData && (
            <div className="reviews-section">
              <h3>Reviews</h3>
              <button onClick={() => setShowReviewForm(!showReviewForm)} className="add-review-button">
                {showReviewForm ? "Cancel" : "Add a Review"}
              </button>
              {showReviewForm && (
                <div className="review-form">
                  <label>Rating (1-10):</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newReview.rating}
                    onChange={(e) => setNewReview({ ...newReview, rating: e.target.value })}
                  />
                  <label>Comment:</label>
                  <textarea
                    value={newReview.comment}
                    onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                    placeholder="Write your review..."
                    rows="4"
                  />
                  <button onClick={handleAddReview}>Submit Review</button>
                </div>
              )}
              {reviews.length > 0 ? (
                reviews.map((review) => (
                  <div key={review._id} className="review-item">
                    {editingReviewId === review._id ? (
                      <div className="edit-review-form">
                        <label>Rating (1-10):</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={editReviewData.rating}
                          onChange={(e) => setEditReviewData({ ...editReviewData, rating: e.target.value })}
                        />
                        <label>Comment:</label>
                        <textarea
                          value={editReviewData.comment}
                          onChange={(e) => setEditReviewData({ ...editReviewData, comment: e.target.value })}
                          placeholder="Edit your review..."
                          rows="4"
                        />
                        <button onClick={() => handleEditReview(review._id)}>Save</button>
                        <button onClick={() => setEditingReviewId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <p>
                          <strong>{review.username}</strong> rated it {review.rating}/10
                        </p>
                        <p>{review.comment}</p>
                        <p>
                          <small>
                            Reviewed on {new Date(review.createdAt).toLocaleDateString()}
                          </small>
                        </p>
                        {review.userId === user?.uid && (
                          <div className="review-actions">
                            <button onClick={() => {
                              setEditingReviewId(review._id);
                              setEditReviewData({ rating: review.rating, comment: review.comment });
                            }}>
                              Edit
                            </button>
                            <button onClick={() => handleDeleteReview(review._id)}>Delete</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              ) : (
                <p>No reviews yet. Be the first to review!</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;
