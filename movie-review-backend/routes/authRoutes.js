const express = require("express");
const { auth } = require("../config/firebase");

const router = express.Router();

// Verify the Firebase token. The verified Firebase token remains the API credential;
// do not mint a second, independent JWT with a separate secret and lifecycle.
router.post("/login", async (req, res) => {
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
