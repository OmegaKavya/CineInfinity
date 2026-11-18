# 🎥 CineInfinity 🎬 - Your Ultimate Movie Review Platform

Welcome to **CineInfinity**, a modern web application where movie enthusiasts can search for movies, view detailed information, and share their reviews. Powered by **OMDb** and **TMDb**, CineInfinity ensures you get the most comprehensive movie details and an engaging user experience.

---

## ✨ Features

- 🔍 **Search Movies**: Use the intuitive search bar with auto-suggestions powered by TMDb to find your favorite movies.
- 📝 **Movie Details**: View detailed information about movies, including:
  - 🎞️ Title
  - 📅 Release Date
  - 🖼️ Poster
  - 📖 Overview
- ⭐ **User Reviews**: Share your thoughts by adding reviews, editing them, or deleting them. Reviews are tied to your account.
- 🔐 **Authentication**: Securely log in using Google authentication to manage your reviews.
- 🌙 **Dark Mode**: Switch between light and dark modes for a personalized experience.

---

## 🚀 Getting Started

Follow these steps to set up and run the application locally:

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/your-repo/movie-review-webapp.git
cd movie-review-webapp
```

### 2️⃣ Install Dependencies
```bash
npm install
```

### 3️⃣ Start the Frontend
```bash
npm start
```
This will start the frontend on [http://localhost:3000](http://localhost:3000).

### 4️⃣ Start the Backend
Navigate to the backend directory and start the server:
```bash
cd ../movie-review-backend
npm install
npm start
```
The backend will run on [http://localhost:5000](http://localhost:5000).

---

## 🌐 API Endpoints

The backend provides the following endpoints:

### 🎬 Movie Endpoints
- `/api/movies/omdb/search` - Fetch movie suggestions from OMDb.
- `/api/movies/tmdb/search` - Fetch movie suggestions from TMDb.
- `/api/movies/omdb/:title` - Fetch movie details from OMDb.
- `/api/movies/tmdb/:title` - Fetch movie details from TMDb.

### 📝 Review Endpoints
- `/api/reviews/:movieId` - Fetch reviews for a specific movie.
- `/api/reviews` - Add a new review.
- `/api/reviews/:reviewId` - Edit or delete a review.

---

## ⚙️ Environment Variables

To run the app, ensure the following environment variables are configured in the backend:

- `OMDB_API_KEY`: Your OMDb API key.
- `TMDB_API_KEY`: Your TMDb API key.

---

## 🛠️ Available Scripts

In the project directory, you can run:

### `npm start`
Starts the app in development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### `npm test`
Launches the test runner in interactive watch mode.

### `npm run build`
Builds the app for production to the `build` folder.\
Optimized for the best performance.

### `npm run eject`
**Note**: This is a one-way operation. Once you `eject`, you can't go back!

---

## 💡 How to Use

1. **Login**: Use the Google login button to authenticate.
2. **Search**: Type in the search bar to find movies with auto-suggestions.
3. **View Details**: Click on a movie to view its details, including the poster, release date, and overview.
4. **Add Reviews**: Share your thoughts by adding reviews. You can also edit or delete your reviews.

---

## 📚 Learn More

- Learn more about **React**: [React Documentation](https://reactjs.org/)
- Explore **TMDb API**: [TMDb API Documentation](https://developers.themoviedb.org/3/getting-started)
- Explore **OMDb API**: [OMDb API Documentation](https://www.omdbapi.com/)

---

## 🎉 Contribute

We welcome contributions! Feel free to fork the repository and submit a pull request. Let's make CineInfinity even better together!

---

## 🖼️ Screenshots

### 🔍 Search Movies
![Search Movies](https://via.placeholder.com/800x400?text=Search+Movies)

### 🎞️ Movie Details
![Movie Details](https://via.placeholder.com/800x400?text=Movie+Details)

### ⭐ User Reviews
![User Reviews](https://via.placeholder.com/800x400?text=User+Reviews)

---
