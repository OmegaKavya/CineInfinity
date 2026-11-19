const { auth, authError } = require("../config/firebase");

async function requireAuth(req, res, next) {
  // Firebase is initialised lazily and may have failed; without this the
  // proxy in config/firebase throws and the client sees an opaque 500.
  const configFault = authError();
  if (configFault) {
    return res.status(503).json({
      error: "Authentication is temporarily unavailable on this server.",
    });
  }

  const authorization = req.get("authorization");
  const token = authorization && authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication is required" });
  }

  try {
    req.user = await auth.verifyIdToken(token, true);
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}

module.exports = { requireAuth };
