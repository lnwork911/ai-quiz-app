import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadBrowserScript() {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const script = html.match(/<script>\n([\s\S]*)<\/script>/)[1];
  const elements = {
    source: { value: "  Photosynthesis uses sunlight.  " },
    difficulty: { value: "easy" },
    quizArea: { innerText: "", innerHTML: "" },
    creditDisplay: { innerText: "" },
    userEmail: { innerText: "" },
    roleSelect: { value: "teacher" },
    classInput: { value: "" },
    classDisplay: { innerText: "" },
  };
  const handlers = {};
  const fetchCalls = [];
  const context = {
    console,
    alert() {},
    location: { reload() {} },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    document: {
      getElementById: id => elements[id],
      addEventListener() {},
    },
    netlifyIdentity: {
      on: (name, callback) => {
        handlers[name] = callback;
      },
      close() {},
      logout() {},
    },
    html2pdf() {
      return { from: () => ({ save() {} }) };
    },
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        json: async () => ({
          quiz: {
            questions: [{
              question: "What does photosynthesis use?",
              options: ["Sunlight", "Granite", "Plastic", "Smoke"],
              correctIndex: 0,
              explanation: "Plants use sunlight.",
            }],
          },
        }),
      };
    },
    quizArea: elements.quizArea,
    creditDisplay: elements.creditDisplay,
    timer: { innerText: "" },
  };

  vm.createContext(context);
  vm.runInContext(script, context);

  return { context, handlers, fetchCalls };
}

test("generate sends trimmed lesson text to the Netlify function", async () => {
  const { context, handlers, fetchCalls } = loadBrowserScript();

  await handlers.login({ id: "user-1", email: "teacher@example.com" });
  await context.generate();

  const generateCall = fetchCalls.find(call => call.url === "/.netlify/functions/generate");
  assert.ok(generateCall);
  assert.deepEqual(JSON.parse(generateCall.opts.body), {
    source: "Photosynthesis uses sunlight.",
    userId: "user-1",
    difficulty: "easy",
  });
});
