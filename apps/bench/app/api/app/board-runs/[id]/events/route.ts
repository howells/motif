import { listRunEventsAfter } from "@/lib/app/boards/run-event-store";
import { afterOf, feedFrames } from "@/lib/app/boards/run-feed";
import { runStatus } from "@/lib/app/boards/run-store";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * A run's beats as server-sent events, for its owner only. The feed is
 * decoration and an early nudge to refresh: results still come from the
 * polled run. It closes before the host's limit and the browser reconnects
 * with `Last-Event-ID`; it says `end` when the run is over.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/app/board-runs/[id]/events">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brun")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  if ((await runStatus(auth.sql, auth.member.id, id)) === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const after = afterOf(
    request.headers.get("last-event-id"),
    new URL(request.url).searchParams.get("after")
  );
  let closed = false;
  const frames = feedFrames(
    {
      aborted: () => closed || request.signal.aborted,
      now: () => Date.now(),
      read: async (from, limit) =>
        await listRunEventsAfter(auth.sql, auth.member.id, id, from, limit),
      running: async () =>
        (await runStatus(auth.sql, auth.member.id, id)) === "running",
      sleep: async (ms) => {
        await new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
      },
    },
    after
  );
  const encoder = new TextEncoder();
  // A reader that has gone is not written to, even if a frame was in flight.
  const deliver = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    next: IteratorResult<string>
  ): void => {
    if (closed) {
      return;
    }
    if (next.done === true) {
      controller.close();
      return;
    }
    controller.enqueue(encoder.encode(next.value));
  };
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      closed = true;
    },
    async pull(controller) {
      deliver(controller, await frames.next());
    },
  });
  return new Response(body, {
    headers: {
      "cache-control": "no-store, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}
