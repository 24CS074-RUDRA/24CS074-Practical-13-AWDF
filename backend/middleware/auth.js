const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it using jwt.verify() wrapped in try/catch,
 * and sets req.user with the decoded payload.
 *
 * Returns 401 on missing, invalid, or expired token.
 */
const auth = (req, res, next) => {
  try {
    // Extract token from "Authorization: Bearer <token>"
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token — jwt.verify() throws on invalid/expired tokens
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach decoded user data to the request object
    req.user = decoded;

    next();
  } catch (err) {
    // Handle specific JWT errors
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired. Please login again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Access denied.' });
    }
    return res.status(401).json({ error: 'Authentication failed.' });
  }
};

module.exports = auth;
