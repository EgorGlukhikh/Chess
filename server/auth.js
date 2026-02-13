const jwt = require("jsonwebtoken");

function createAuthHelpers(jwtSecret) {
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required");
  }

  function signToken(userId) {
    return jwt.sign({ uid: userId }, jwtSecret, { expiresIn: "30d" });
  }

  function verifyToken(token) {
    return jwt.verify(token, jwtSecret);
  }

  function extractToken(req) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return null;
    return header.slice("Bearer ".length);
  }

  function authMiddleware(req, res, next) {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const payload = verifyToken(token);
      req.auth = { userId: payload.uid };
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  return {
    signToken,
    verifyToken,
    authMiddleware,
  };
}

module.exports = { createAuthHelpers };
