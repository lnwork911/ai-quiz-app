import assert from "node:assert/strict";
import test from "node:test";

import { parseStoredValue } from "../netlify/functions/redisValue.js";

test("parseStoredValue accepts values already decoded by Upstash", () => {
  const user = { role: "teacher", email: "teacher@example.com" };

  assert.equal(parseStoredValue(user), user);
});

test("parseStoredValue decodes raw JSON strings from older stored values", () => {
  assert.deepEqual(parseStoredValue("{\"role\":\"student\"}"), { role: "student" });
});

test("parseStoredValue returns the fallback for missing Redis values", () => {
  assert.deepEqual(parseStoredValue(null, []), []);
});
