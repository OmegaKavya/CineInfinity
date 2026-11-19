# CineInfinity, frontend

React 19 and Vite. See the [root README](../README.md) for what the project
is, how to run both halves, and how the pieces fit together.

```bash
npm install
cp .env.example .env
npm run dev      # http://localhost:5173
npm test
npm run build
```

The two files worth reading are `src/lib/franchiseGraph.js`, which resolves
anime watch order from AniList's relation graph, and `src/lib/similarity.js`,
which recommends related series by tag overlap and explains each suggestion.
