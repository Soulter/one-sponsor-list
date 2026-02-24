import test from "node:test";
import assert from "node:assert/strict";
import { md5 } from "../src/edge/md5.js";

test("md5 hash matches known vectors", () => {
  assert.equal(md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(md5("message digest"), "f96b697d7cb7938d525a2f31aaf161d0");
});
