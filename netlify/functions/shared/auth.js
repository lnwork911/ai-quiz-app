/**
 * Server-side authentication helpers for Netlify Functions.
 *
 * Netlify Identity issues JWTs signed with your site's JWT secret.
 * Set the same value in Netlify → Site configuration → Environment variables as
 * **JWT_SECRET** (preferred), or **GOTRUE_JWT_SECRET** / **NETLIFY_JWT_SECRET**.
 * Copy the value from Identity → Services → Identity → **JWT secret**.
 *
 * This module only runs in Netlify Functions — secrets stay on the server.
 */

const jwt = require("jsonwebtoken");

/**
 * Netlify Identity signs GoTrue JWTs with your site’s JWT secret.
 * Set the same value in Functions env — try common variable names.
 * @returns {string}
 */
function getIdentityJwtSecret() {
  const s =
    process.env.JWT_SECRET ||
    process.env.GOTRUE_JWT_SECRET ||
    process.env.NETLIFY_JWT_SECRET ||
    "";
  return typeof s === "string" ? s.trim() : "";
}

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
  const secret = getIdentityJwtSecret();
  if (!secret) {
    const err = new Error(
      "Server misconfiguration: set JWT_SECRET (or GOTRUE_JWT_SECRET) in Netlify → Site configuration → Environment variables " +
        "to the same value as Identity → Services → Identity → JWT secret. Until then, functions cannot verify logins."
    );
    err.statusCode = 500;
    throw err;
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
    const err = new Error(
      "Not signed in (missing Authorization header). Open /login.html, sign in, then try again."
    );
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
    const status = /** @type {{ statusCode?: number }} */ (e).statusCode;
    if (status === 500) {
      throw e;
    }

    let msg = "Could not verify your session.";
    if (e instanceof jwt.TokenExpiredError) {
      msg = "Session expired. Sign out and sign in again, then generate a quiz.";
    } else if (e instanceof jwt.JsonWebTokenError) {
      msg =
        "Invalid session token (often wrong JWT_SECRET on the server, or an old session). " +
        "Confirm Netlify env JWT_SECRET matches Identity → JWT secret, then sign out and sign in again.";
    } else if (e instanceof Error) {
      msg = e.message;
    }

    const err = new Error(msg);
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
  getIdentityJwtSecret,
  verifyNetlifyIdentityToken,
  requireAuthUser,
  jsonResponse,
};
