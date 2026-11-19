// Express matches routes in the order they are declared, so a parameterised
// path registered first will swallow every literal path that follows it.
//
// This is not hypothetical here: "/omdb/search" was declared after
// "/omdb/:title", which made it unreachable. A search request matched the
// detail handler with title="search", and OMDb was asked for a film by that
// name. The frontend called that endpoint, so the bug was live.
//
// Asserting the invariant on the router stack keeps the check free of network
// calls and covers every route at once, including ones added later.
const test = require("node:test");
const assert = require("node:assert");

const router = require("../routes/movieRoutes");
const reviewRouter = require("../routes/reviewRoutes");

/** Every GET path this router declares, in declaration order. */
function declaredPaths(r = router) {
  return r.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));
}

/** Would `pattern` (possibly parameterised) match the literal `path`? */
function shadows(pattern, path) {
  if (!pattern.includes(":")) return false;
  const patternParts = pattern.split("/");
  const pathParts = path.split("/");
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every(
    (part, i) => part.startsWith(":") || part === pathParts[i]
  );
}

test("no literal route is shadowed by an earlier parameterised route", () => {
  const routes = declaredPaths();

  routes.forEach((route, index) => {
    if (route.path.includes(":")) return;
    const shadowedBy = routes
      .slice(0, index)
      .find((earlier) => shadows(earlier.path, route.path));

    assert.strictEqual(
      shadowedBy,
      undefined,
      `"${route.path}" is unreachable: "${shadowedBy && shadowedBy.path}" is ` +
        `declared before it and matches the same requests. Move the literal ` +
        `path above the parameterised one.`
    );
  });
});

test("the search endpoints the frontend calls are reachable", () => {
  const paths = declaredPaths().map((r) => r.path);
  ["/omdb/search", "/tmdb/search", "/omdb/details"].forEach((p) => {
    assert.ok(paths.includes(p), `${p} is not declared at all`);
  });

  const order = (p) => paths.indexOf(p);
  assert.ok(
    order("/omdb/search") < order("/omdb/:title"),
    "/omdb/search must be declared before /omdb/:title"
  );
  assert.ok(
    order("/tmdb/search") < order("/tmdb/:title"),
    "/tmdb/search must be declared before /tmdb/:title"
  );
});

// The review router has the same hazard and more literal routes: /feed/recent,
// /search, /me/signal and the rest all sit alongside "/:movieId", which
// matches any single segment. Declared after it, every one of them would
// resolve to "fetch the reviews for a film called 'search'".
test("no review route is shadowed by an earlier parameterised route", () => {
  const routes = declaredPaths(reviewRouter);

  routes.forEach((route, index) => {
    if (route.path.includes(":")) return;
    const shadowedBy = routes
      .slice(0, index)
      .find((earlier) => shadows(earlier.path, route.path));

    assert.strictEqual(
      shadowedBy,
      undefined,
      `"${route.path}" is unreachable: "${shadowedBy && shadowedBy.path}" is ` +
        `declared before it. Move the literal path above the parameterised one.`
    );
  });
});

test("every review endpoint the frontend calls is declared", () => {
  const paths = declaredPaths(reviewRouter).map((r) => r.path);
  ["/feed/recent", "/feed/trending", "/search", "/me/reviews", "/me/signal"].forEach((p) => {
    assert.ok(paths.includes(p), `${p} is not declared at all`);
  });
});
