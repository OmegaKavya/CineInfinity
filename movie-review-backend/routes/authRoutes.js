const express = require("express");
const { auth, authError } = require("../config/firebase");

const router = express.Router();

// Verify the Firebase token. The verified Firebase token remains the API credential;
// do not mint a second, independent JWT with a separate secret and lifecycle.
router.post("/login", async (req, res) => {
  // A server without a working Firebase credential cannot verify anything.
  // Reporting that as "Invalid Token" sends the user to re-enter a password
  // that was never the problem, so it is separated out.
  const configFault = authError();
  if (configFault) {
    return res.status(503).json({
      error: "Authentication is temporarily unavailable on this server.",
    });
  }

  const { token } = req.body;
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const user = { uid: decodedToken.uid, email: decodedToken.email };

    // Keep the response contract compatible for existing callers.
    res.json({ user, token });
  } catch (error) {
    res.status(401).json({ error: "Invalid Token" });
  }
});

module.exports = router;
