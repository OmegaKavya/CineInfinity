const { auth } = require("../config/firebase");

async function requireAuth(req, res, next) {
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
