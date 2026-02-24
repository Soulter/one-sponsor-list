import test from "node:test";
import assert from "node:assert/strict";
import { sortSponsors } from "../src/core/sorter.js";

test("sort by amount desc", () => {
  const sorted = sortSponsors(
    [
      { id: "a", amount: 10, lastPaidAt: "2024-01-01" },
      { id: "b", amount: 30, lastPaidAt: "2023-01-01" },
      { id: "c", amount: 20, lastPaidAt: "2025-01-01" }
    ],
    { by: "amount", order: "desc" }
  );
  assert.deepEqual(
    sorted.map((s) => s.id),
    ["b", "c", "a"]
  );
});

test("sort by time desc", () => {
  const sorted = sortSponsors(
    [
      { id: "a", amount: 10, lastPaidAt: "2024-01-01T00:00:00Z" },
      { id: "b", amount: 30, lastPaidAt: null },
      { id: "c", amount: 20, lastPaidAt: "2025-01-01T00:00:00Z" }
    ],
    { by: "time", order: "desc" }
  );
  assert.deepEqual(
    sorted.map((s) => s.id),
    ["c", "a", "b"]
  );
});
