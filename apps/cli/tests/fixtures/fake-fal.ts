// Preloaded into a spawned CLI (`node --import tsx --import <this file>`):
// answers every fal request with the result in FAKE_FAL_RESULT and serves
// downloads from https://cdn.fake/ as a 1x1 PNG, so a run can be driven end to
// end with no network. Every request is appended to FAKE_FAL_LOG when it is set.
import { appendFileSync } from "node:fs";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// oxlint-disable-next-line no-restricted-properties -- a test fixture reading the variables its spawning test sets
const {
  FAKE_FAL_LOG: log,
  FAKE_FAL_POST_STATUS: postStatus,
  FAKE_FAL_RESULT: result = "{}",
} = process.env;

const realFetch = globalThis.fetch;

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (input instanceof Request) {
    return input.url;
  }
  return input.toString();
}

globalThis.fetch = async (input, init) => {
  const url = requestUrl(input);
  if (!url.startsWith("https://")) {
    return await realFetch(input, init);
  }
  if (log !== undefined && log !== "") {
    appendFileSync(
      log,
      `${JSON.stringify({ body: init?.body ?? null, method: init?.method ?? "GET", url })}\n`
    );
  }
  if (url.startsWith("https://cdn.fake/broken")) {
    return new Response("broken", { status: 500 });
  }
  if (url.startsWith("https://cdn.fake/")) {
    return new Response(PNG_1X1, { headers: { "content-type": "image/png" } });
  }
  if (init?.method === "POST" && postStatus !== undefined) {
    return new Response("", { status: Number(postStatus) });
  }
  const parsed: unknown = JSON.parse(result);
  if (typeof parsed !== "object" || parsed === null) {
    throw new TypeError("FAKE_FAL_RESULT must be a JSON object");
  }
  let body: object = parsed;
  if (init?.method === "POST") {
    body = { request_id: "fake-request", ...parsed };
  } else if (url.includes("/status")) {
    body = { status: "COMPLETED" };
  }
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
};
