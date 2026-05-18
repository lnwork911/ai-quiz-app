/**
 * verifyUser — confirms the caller's Netlify Identity JWT is valid.
 * Use this from the dashboard on load to ensure tokens are fresh.
 *
 * Method: GET
 * Headers: Authorization: Bearer <identity-jwt>
 */

const { requireAuthUser, jsonResponse } = require("./shared/auth");

/**
 * @type {import('@netlify/functions').Handler}
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const { userId, email, claims } = requireAuthUser(event);

    return jsonResponse(200, {
      ok: true,
      user: {
        id: userId,
        email,
        /** Useful for future role-based features (teacher vs admin). */
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
      },
    });
  } catch (err) {
    const status = /** @type {{ statusCode?: number }} */ (err).statusCode || 500;
    const message =
      status === 401 ? "Unauthorized" : "Unable to verify user";
    return jsonResponse(status, { error: message });
  }
};
