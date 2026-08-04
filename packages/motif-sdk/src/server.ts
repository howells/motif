import { setTimeout as sleep } from "node:timers/promises";

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { estimateCost, estimateVideoCost } from "./cost";
import { buildGenerateBody } from "./generate";
import { GENERATION_MODELS, MODELS, UTILITY_MODELS } from "./models";
import { buildFalToolRequest, FAL_TOOLS } from "./tools";
import type { FalToolRequest } from "./tools";
import type {
  GenerateOptions,
  JobStatus,
  MotifImage,
  MotifResponse,
  MotifServerConfig,
  QueuedJob,
  RemoveBackgroundOptions,
  Resolution,
  ToolResponse,
  ToolRunOptions,
  UpscaleOptions,
  VideoOptions,
  VideoResponse,
} from "./types";

// This file intentionally keeps MotifServer and MotifError together: the
// error type only exists to be thrown/caught by this class's own methods,
// and this is a published package (@howells/motif-sdk) whose consumers
// import both from "./server" — moving MotifError to its own module would
// mean re-exporting it here anyway for backward compatibility, with no
// real separation-of-concerns benefit.
export class MotifError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "MotifError";
    this.status = status;
    this.code = code;
  }
}

const FAL_BASE_URL = "https://fal.run";
const FAL_QUEUE_URL = "https://queue.fal.run";
const FAL_API_URL = "https://api.fal.ai";
const FAL_REST_URL = "https://rest.alpha.fal.ai";

const QUEUE_URL_REQUEST_ID_REGEX = /^\/(?<endpoint>.+)\/requests\//u;

const endpointFromQueueUrl = (
  url: string | undefined,
  fallback: string
): string => {
  if (url === undefined || url === "") {
    return fallback;
  }
  try {
    const parsed = new URL(url);
    const match = QUEUE_URL_REQUEST_ID_REGEX.exec(parsed.pathname);
    return match?.groups?.endpoint ?? fallback;
  } catch {
    return fallback;
  }
};

// fal.ai's REST/queue APIs are untyped JSON over the wire (no shared schema
// package); every response body needs a cast at the trust boundary where it
// enters this SDK. Isolating the cast in one small generic helper — instead
// of repeating `(await res.json()) as {...}` at every call site below — keeps
// that boundary in one documented place.
const parseJsonResponse = async <T>(response: Response): Promise<T> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-parameters -- see comment above
  (await response.json()) as T;

/**
 * Motif Server SDK
 *
 * Server-side SDK for AI image generation via fal.ai.
 * All async methods return `Result<T, MotifError>` — no thrown exceptions.
 *
 * @example
 * ```typescript
 * import { MotifServer } from "./fal";
 *
 * const motif = new MotifServer(process.env.FAL_KEY!);
 * const result = await motif.generate({ prompt: "a red balloon", model: "banana" });
 *
 * if (result.isOk()) {
 *   console.log(result.value.images[0].url);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
// oxlint-disable-next-line max-classes-per-file -- see MotifError's comment above
export class MotifServer {
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: MotifServerConfig | string) {
    if (typeof config === "string") {
      this.apiKey = config;
      this.timeout = 120_000;
      this.retries = 3;
    } else {
      this.apiKey = config.apiKey;
      this.timeout = config.timeout ?? 120_000;
      this.retries = config.retries ?? 3;
    }

    if (!this.apiKey) {
      throw new MotifError("API key is required", 0);
    }
  }

  /** ─── Synchronous Generation ──────────────────────────────── */

  /** Generate images synchronously (blocks until fal.ai returns). */
  async generate(
    options: GenerateOptions
  ): Promise<Result<MotifResponse, MotifError>> {
    const config = MODELS[options.model];
    if (config?.useQueue === true) {
      return await this.generateQueued(options);
    }

    const { endpoint, body } = buildGenerateBody(options);
    const response = await this.request(`${FAL_BASE_URL}/${endpoint}`, {
      body: JSON.stringify(body),
      headers: this.ephemeralHeaders(options),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return this.normalizeResponse(data);
  }

  private async generateQueued(
    options: GenerateOptions
  ): Promise<Result<MotifResponse, MotifError>> {
    const job = await this.submitGeneration(options);
    if (job.isErr()) {
      return err(job.error);
    }

    const pollIntervalMs = 3000;
    const maxAttempts = 160;

    // Sequential by necessity: this polls one job's status until it settles,
    // waiting between attempts — each iteration depends on the previous
    // one's result, so there is nothing to run in `Promise.all()`.
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- see comment above
      const status = await this.getJobStatus(
        job.value.endpoint,
        job.value.requestId
      );
      if (status.isErr()) {
        return err(status.error);
      }

      if (status.value.status === "completed") {
        // oxlint-disable-next-line no-await-in-loop -- see comment above
        return await this.getJobResult(job.value.endpoint, job.value.requestId);
      }

      if (status.value.status === "failed") {
        return err(
          new MotifError(status.value.error ?? "Queued generation failed", 0)
        );
      }

      // oxlint-disable-next-line no-await-in-loop -- see comment above
      await sleep(pollIntervalMs);
    }

    return err(new MotifError("Queued generation timed out", 0));
  }

  /** ─── Queue-Based Generation ──────────────────────────────── */

  /** Submit a generation to the fal.ai queue (returns immediately). */
  async submitGeneration(
    options: GenerateOptions
  ): Promise<Result<QueuedJob, MotifError>> {
    const { endpoint, body } = buildGenerateBody(options);

    const response = await this.request(`${FAL_QUEUE_URL}/${endpoint}`, {
      body: JSON.stringify(body),
      headers: this.ephemeralHeaders(options),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data = await parseJsonResponse<{
      request_id: string;
      response_url: string;
    }>(response.value);

    return ok({
      endpoint: endpointFromQueueUrl(data.response_url, endpoint),
      estimatedCost: estimateCost(
        options.model,
        options.resolution,
        options.numImages
      ),
      requestId: data.request_id,
    });
  }

  /** Check the status of a queued generation. */
  async getJobStatus(
    endpoint: string,
    requestId: string
  ): Promise<Result<JobStatus, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}/status?logs=1`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data = await parseJsonResponse<{
      detail?: string;
      error?: string;
      status: string;
      queue_position?: number;
      logs?: { message: string; timestamp: string }[];
    }>(response.value);

    let status: JobStatus["status"];
    if (data.status === "IN_QUEUE") {
      status = "queued";
    } else if (data.status === "IN_PROGRESS") {
      status = "processing";
    } else if (data.status === "COMPLETED") {
      status = "completed";
    } else if (
      data.status === "FAILED" ||
      data.status === "ERROR" ||
      data.status === "CANCELED"
    ) {
      status = "failed";
    } else {
      return err(new MotifError(`Unknown job status: ${data.status}`, 0));
    }

    return ok({
      error: data.error ?? data.detail,
      logs: data.logs,
      queuePosition: data.queue_position,
      status,
    });
  }

  /** Fetch the completed result from the queue. */
  async getJobResult(
    endpoint: string,
    requestId: string
  ): Promise<Result<MotifResponse, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return this.normalizeResponse(data, requestId);
  }

  /** ─── Processing ──────────────────────────────────────────── */

  /** Upscale an image using clarity or crystal upscaler. */
  // Branches on model ("crystal" vs "clarity") and maps each of that
  // model's own optional parameters onto the request body; the two
  // branches don't share fields to factor out, and splitting per-field
  // would multiply methods without reducing real complexity.
  /* oxlint-disable complexity, sonarjs/cognitive-complexity -- see comment above */
  async upscale(
    options: UpscaleOptions
  ): Promise<Result<MotifResponse, MotifError>> {
    const {
      imageUrl,
      model = "clarity",
      scaleFactor,
      creativity,
      resemblance,
      prompt: upscalePrompt,
      negativePrompt,
      numInferenceSteps,
      guidanceScale,
    } = options;

    const config = MODELS[model];
    if (!config || config.type !== "utility") {
      return err(new MotifError(`Invalid upscale model: ${model}`, 0));
    }

    const body: Record<string, unknown> = { image_url: imageUrl };

    if (model === "crystal") {
      if (scaleFactor !== undefined) {
        body.scale_factor = scaleFactor;
      }
      if (creativity !== undefined) {
        body.creativity = creativity;
      }
    } else {
      // clarity (default)
      if (scaleFactor !== undefined) {
        body.upscale_factor = scaleFactor;
      }
      if (creativity !== undefined) {
        body.creativity = creativity;
      }
      if (resemblance !== undefined) {
        body.resemblance = resemblance;
      }
      if (upscalePrompt !== undefined && upscalePrompt !== "") {
        body.prompt = upscalePrompt;
      }
      if (negativePrompt !== undefined && negativePrompt !== "") {
        body.negative_prompt = negativePrompt;
      }
      if (numInferenceSteps !== undefined) {
        body.num_inference_steps = numInferenceSteps;
      }
      if (guidanceScale !== undefined) {
        body.guidance_scale = guidanceScale;
      }
    }

    const response = await this.request(`${FAL_BASE_URL}/${config.endpoint}`, {
      body: JSON.stringify(body),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return this.normalizeResponse(data);
  }
  /* oxlint-enable complexity, sonarjs/cognitive-complexity */

  /** Remove the background from an image. */
  async removeBackground(
    options: RemoveBackgroundOptions
  ): Promise<Result<MotifResponse, MotifError>> {
    const {
      imageUrl,
      model = "rmbg",
      variant,
      operatingResolution,
      outputFormat,
      refineForeground,
      outputMask,
    } = options;

    const config = MODELS[model];
    if (!config) {
      return err(
        new MotifError(`Invalid background removal model: ${model}`, 0)
      );
    }

    const rbBody: Record<string, unknown> = { image_url: imageUrl };
    if (model === "rmbg") {
      // birefnet model supports these extra params
      if (variant) {
        rbBody.model = variant;
      }
      if (operatingResolution) {
        rbBody.operating_resolution = operatingResolution;
      }
      if (outputFormat) {
        rbBody.output_format = outputFormat;
      }
      if (refineForeground !== undefined) {
        rbBody.refine_foreground = refineForeground;
      }
      if (outputMask !== undefined) {
        rbBody.output_mask = outputMask;
      }
    }

    const response = await this.request(`${FAL_BASE_URL}/${config.endpoint}`, {
      body: JSON.stringify(rbBody),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return this.normalizeResponse(data);
  }

  /** ─── Video Generation ───────────────────────────────────── */

  /**
   * Generate a video from an image using Kling v3 Pro.
   * This uses the queue API since video generation takes 30-120s.
   * Returns immediately with a job — poll with getJobStatus/getVideoResult.
   */
  async submitVideo(
    options: VideoOptions
  ): Promise<Result<QueuedJob, MotifError>> {
    const {
      imageUrl,
      prompt,
      duration = 5,
      generateAudio = true,
      endImageUrl,
      negativePrompt,
      cfgScale,
    } = options;

    const config = MODELS.kling;
    if (!config) {
      return err(new MotifError("Kling video model not found", 0));
    }

    const body: Record<string, unknown> = {
      duration: String(duration),
      generate_audio: generateAudio,
      prompt,
      start_image_url: imageUrl,
    };

    if (endImageUrl !== undefined && endImageUrl !== "") {
      body.end_image_url = endImageUrl;
    }
    if (negativePrompt !== undefined && negativePrompt !== "") {
      body.negative_prompt = negativePrompt;
    }
    if (cfgScale !== undefined) {
      body.cfg_scale = cfgScale;
    }

    const response = await this.request(`${FAL_QUEUE_URL}/${config.endpoint}`, {
      body: JSON.stringify(body),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data = await parseJsonResponse<{
      request_id: string;
      response_url: string;
    }>(response.value);

    return ok({
      endpoint: endpointFromQueueUrl(data.response_url, config.endpoint),
      estimatedCost: estimateVideoCost(duration, generateAudio),
      requestId: data.request_id,
    });
  }

  /** Fetch the completed video result from the queue. */
  async getVideoResult(
    endpoint: string,
    requestId: string
  ): Promise<Result<VideoResponse, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data = await parseJsonResponse<{
      video?: {
        url: string;
        content_type: string;
        file_name: string;
        file_size: number;
      };
    }>(response.value);

    if (!data.video) {
      return err(new MotifError("No video in response", 0));
    }

    return ok({
      contentType: data.video.content_type,
      fileName: data.video.file_name,
      fileSize: data.video.file_size,
      url: data.video.url,
    });
  }

  /** ─── File Upload ─────────────────────────────────────────── */

  /**
   * Upload a file to fal.ai CDN storage and return the public URL.
   * Uses the two-step initiate + PUT flow.
   */
  async uploadToFalCdn(
    file: ArrayBuffer | Uint8Array,
    options: { contentType: string; fileName: string }
  ): Promise<Result<string, MotifError>> {
    const initiateResponse = await this.request(
      `${FAL_REST_URL}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      {
        body: JSON.stringify({
          content_type: options.contentType,
          file_name: options.fileName,
        }),
        method: "POST",
      }
    );
    if (initiateResponse.isErr()) {
      return err(initiateResponse.error);
    }

    const { file_url, upload_url } = await parseJsonResponse<{
      file_url: string;
      upload_url: string;
    }>(initiateResponse.value);

    let putResponse: Response;
    try {
      const body = Buffer.from(
        file instanceof Uint8Array ? file : new Uint8Array(file)
      );
      putResponse = await fetch(upload_url, {
        body,
        headers: { "Content-Type": options.contentType },
        method: "PUT",
      });
    } catch (error) {
      return err(
        new MotifError(
          `Upload PUT failed: ${error instanceof Error ? error.message : String(error)}`,
          0
        )
      );
    }

    if (!putResponse.ok) {
      return err(
        new MotifError(
          `Upload PUT failed: ${putResponse.status}`,
          putResponse.status
        )
      );
    }

    return ok(file_url);
  }

  /** ─── Utilities ───────────────────────────────────────────── */

  /** Run a registered fal utility/tool endpoint. */
  async runTool(
    options: ToolRunOptions
  ): Promise<Result<ToolResponse, MotifError>> {
    let request: FalToolRequest;
    try {
      request = buildFalToolRequest(options);
    } catch (error) {
      return err(
        new MotifError(
          error instanceof Error ? error.message : String(error),
          0
        )
      );
    }

    const response = await this.request(`${FAL_BASE_URL}/${request.endpoint}`, {
      body: JSON.stringify(request.body),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    return ok(await parseJsonResponse<ToolResponse>(response.value));
  }

  /**
   * Delete fal's stored IO payloads for a completed request.
   *
   * This removes request input/output payload files exposed by fal's payloads
   * API. It does not remove billing/account metadata or input files separately
   * uploaded to fal storage before a request.
   */
  async deletePayloads(requestId: string): Promise<Result<void, MotifError>> {
    const response = await this.request(
      `${FAL_API_URL}/v1/models/requests/${encodeURIComponent(requestId)}/payloads`,
      { method: "DELETE" }
    );
    if (response.isErr()) {
      return err(response.error);
    }
    return ok();
  }

  /**
   * Estimate cost for a generation (no API call).
   *
   * This and the members below don't read instance state — they're kept as
   * instance methods/getters (not `static`) because published consumers
   * (e.g. `@howells/motif-mcp`) already call them as `motif.estimateCost(...)`
   * off a `MotifServer` instance; `static` isn't reachable that way in
   * JS/TS, so switching would be a breaking API change.
   */
  // oxlint-disable-next-line class-methods-use-this -- see comment above
  estimateCost(
    model: string,
    resolution?: Resolution,
    numImages?: number
  ): number {
    return estimateCost(model, resolution, numImages);
  }

  /** Build the fal.ai request body without sending it. */
  // oxlint-disable-next-line class-methods-use-this -- see estimateCost's comment above
  buildRequestBody(options: GenerateOptions): {
    endpoint: string;
    body: Record<string, unknown>;
  } {
    return buildGenerateBody(options);
  }

  /** Model registry. */
  // oxlint-disable-next-line class-methods-use-this -- see estimateCost's comment above
  get models() {
    return MODELS;
  }

  /** Generation model keys. */
  // oxlint-disable-next-line class-methods-use-this -- see estimateCost's comment above
  get generationModels() {
    return GENERATION_MODELS;
  }

  /** Utility model keys. */
  // oxlint-disable-next-line class-methods-use-this -- see estimateCost's comment above
  get utilityModels() {
    return UTILITY_MODELS;
  }

  /** Registered fal utility/tool endpoints. */
  // oxlint-disable-next-line class-methods-use-this -- see estimateCost's comment above
  get tools() {
    return FAL_TOOLS;
  }

  /** ─── Private ─────────────────────────────────────────────── */

  /** Authenticated fetch to fal.ai APIs with retry logic. */
  // Every call site in this file passes headers as a plain string-keyed
  // object (never the array-of-tuples form `RequestInit["headers"]` also
  // allows) — narrowing the type here to match actual usage is what makes
  // spreading `options.headers` below safe, rather than papering over the
  // array case with a disable comment.
  private async request(
    url: string,
    options: Omit<RequestInit, "headers"> & {
      headers?: Record<string, string>;
    } = {}
  ): Promise<Result<Response, MotifError>> {
    let lastError: MotifError | null = null;

    // Sequential by necessity: each attempt retries the same request after
    // waiting out a backoff delay, so there is nothing to run in parallel.
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeout);

      try {
        // oxlint-disable-next-line no-await-in-loop -- see comment above
        const response = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Key ${this.apiKey}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < this.retries
        ) {
          // Backoff: 1s, 2s, 4s.
          const delay = 1000 * 2 ** attempt;
          // oxlint-disable-next-line no-await-in-loop -- see comment above
          await sleep(delay);
          continue;
        }

        if (!response.ok) {
          // Reads the body of the response just fetched on this same
          // iteration, immediately before returning; there is no next
          // iteration to parallelize with.
          // oxlint-disable-next-line no-await-in-loop -- see comment above
          const text = await response.text();
          return err(
            new MotifError(
              `Request failed: ${response.status} ${text}`,
              response.status
            )
          );
        }

        return ok(response);
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof MotifError) {
          return err(error);
        }

        lastError = new MotifError(
          error instanceof Error ? error.message : String(error),
          0
        );

        // Retry on network errors
        if (attempt < this.retries) {
          const delay = 1000 * 2 ** attempt;
          // oxlint-disable-next-line no-await-in-loop -- see comment above
          await sleep(delay);
        }
      }
    }

    return err(lastError ?? new MotifError("Request failed after retries", 0));
  }

  // oxlint-disable-next-line class-methods-use-this -- see estimateCost's comment above
  private ephemeralHeaders(options: {
    ephemeral?: boolean;
  }): Record<string, string> {
    return options.ephemeral === true ? { "X-Fal-Store-IO": "0" } : {};
  }

  /**
   * Normalize fal.ai responses.
   * Some APIs return `{ image: {...} }` instead of `{ images: [...] }`.
   *
   * `data` is an untyped fal.ai JSON payload (see parseJsonResponse's
   * comment above) — narrowing it into MotifResponse's known shape is the
   * one job of this method, so every cast below is that same unavoidable
   * trust boundary, not a one-off shortcut.
   */
  // oxlint-disable-next-line class-methods-use-this -- see estimateCost's comment above
  private normalizeResponse(
    data: unknown,
    fallbackRequestId?: string
  ): Result<MotifResponse, MotifError> {
    /* oxlint-disable typescript/no-unsafe-type-assertion -- see method doc comment above */
    const obj = data as Record<string, unknown>;
    const requestId =
      (obj.request_id as string | undefined) ??
      (obj.requestId as string | undefined) ??
      fallbackRequestId;

    if ("detail" in obj) {
      return err(
        new MotifError((obj as { detail: string }).detail, 0, "FAL_ERROR")
      );
    }

    if ("image" in obj && !("images" in obj)) {
      return ok({
        images: [obj.image as MotifImage],
        prompt: obj.prompt as string | undefined,
        requestId,
        seed: obj.seed as number | undefined,
      });
    }

    return ok({
      ...(obj as unknown as MotifResponse),
      requestId,
    });
    /* oxlint-enable typescript/no-unsafe-type-assertion */
  }
}
