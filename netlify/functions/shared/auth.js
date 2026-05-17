/**
 * Server-side authentication helpers for Netlify Functions.
 *
 * Netlify Identity issues JWTs signed with your site's JWT secret.
 * Set `JWT_SECRET` in Netlify → Site settings → Environment variables
 * (copy from Identity → Settings → JWT secret in the Netlify UI).
 *
 * This module only runs in Netlify Functions — secrets stay on the server.
 */

const jwt = require("jsonwebtoken");

/**
 * Reads the Bearer token from the Authorization header.
 * @param {import('@netlify/functions').HandlerEvent} event
 * @returns {string|null} Raw JWT string or null if missing/invalid format
 */
function getBearerToken(event) {
  const header =
    event.headers?.Authorization ||
    event.headers?.authorization ||
    event.headers?.AUTHORIZATION;

  if (!header || typeof header !== "string") {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Verifies a Netlify Identity JWT and returns decoded claims.
 * @param {string} token
 * @returns {{ sub: string, email?: string, app_metadata?: object, user_metadata?: object, [key: string]: unknown }}
 */
function verifyNetlifyIdentityToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Missing JWT_SECRET. Add it from Netlify Identity settings so functions can verify users."
    );
  }

  /** @type {jwt.JwtPayload} */
  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
  });

  if (!decoded || typeof decoded.sub !== "string") {
    throw new Error("Invalid token payload");
  }

  return decoded;
}

/**
 * Authenticates the request and returns user info for your handlers.
 * @param {import('@netlify/functions').HandlerEvent} event
 * @returns {{ userId: string, email: string | null, claims: jwt.JwtPayload }}
 */
function requireAuthUser(event) {
  const token = getBearerToken(event);
  if (!token) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }

  try {
    const claims = verifyNetlifyIdentityToken(token);
    const email =
      typeof claims.email === "string"
        ? claims.email
        : typeof claims.user_metadata?.email === "string"
          ? claims.user_metadata.email
          : null;

    return {
      userId: claims.sub,
      email,
      claims,
    };
  } catch (e) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    err.cause = e;
    throw err;
  }
}

/**
 * Standard JSON response for Netlify Functions.
 * @param {number} statusCode
 * @param {object} body
 */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

module.exports = {
  getBearerToken,
  verifyNetlifyIdentityToken,
  requireAuthUser,
  jsonResponse,
};
