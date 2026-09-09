import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

test("production build artifacts include compiled server and UI", () => {
  assert.equal(existsSync("dist/src/server.js"), true);
  assert.equal(existsSync("dist/public/index.html"), true);
});
