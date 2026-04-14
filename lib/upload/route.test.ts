import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/bills/upload/route";

function makeRequestWithFiles(files: File[]): Request {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return new Request("http://localhost:3000/api/bills/upload", {
    method: "POST",
    body: formData,
  });
}

test("upload route rejects more than 10 files", async () => {
  const files = Array.from({ length: 11 }, (_, index) => new File([new Uint8Array([1, 2, 3])], `f-${index}.png`, { type: "image/png" }));
  const response = await POST(makeRequestWithFiles(files));
  assert.equal(response.status, 400);
  const json = await response.json();
  assert.equal(json.code, "UPLOAD_TOO_MANY_FILES");
});

test("upload route returns partial success for mixed file validity", async () => {
  process.env.VISION_PROVIDER_MODE = "stub";
  process.env.VISION_LABEL_AI_ENABLED = "false";

  const files = [
    new File([new Uint8Array([1, 2, 3])], "grocer-receipt.png", { type: "image/png" }),
    new File([new Uint8Array([1, 2, 3])], "notes.txt", { type: "text/plain" }),
  ];
  const response = await POST(makeRequestWithFiles(files));
  assert.equal(response.status, 200);

  const json = await response.json();
  assert.equal(Array.isArray(json.successes), true);
  assert.equal(Array.isArray(json.failures), true);
  assert.equal(json.successes.length, 1);
  assert.equal(json.failures.length, 1);
  assert.equal(json.failures[0].code, "UPLOAD_UNSUPPORTED_MIME");
});

test("upload route returns error when all files fail", async () => {
  const files = [new File([new Uint8Array([1, 2, 3])], "bad-a.txt", { type: "text/plain" })];
  const response = await POST(makeRequestWithFiles(files));
  assert.equal(response.status, 400);
  const json = await response.json();
  assert.equal(json.code, "UPLOAD_UNSUPPORTED_MIME");
  assert.equal(json.successes.length, 0);
  assert.equal(json.failures.length, 1);
});
