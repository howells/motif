/**
 * What a Task form holds, and the request it sends. Pure, so the shape the
 * browser sends can be tested against the server's own schema.
 */
import type { AppTaskId } from "@/lib/site/commands";

export interface PickedImage {
  readonly assetId: string;
  readonly height: number;
  readonly url: string;
  readonly width: number;
}

export interface Box {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export type EraseMode = "boxes" | "describe" | "paint" | "text";
export type ReframeMode = "margin" | "ratio";
export type UpscaleDetail = "creative" | "faithful" | "generative";

export interface Margin {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface Draft {
  readonly aspect: string;
  readonly boxes: readonly Box[];
  readonly count: number;
  readonly detail: UpscaleDetail;
  readonly eraseMode: EraseMode;
  readonly fill: string;
  readonly look: string;
  readonly margin: Margin;
  readonly maskAssetId: string | null;
  readonly model: string | null;
  readonly mood: string;
  readonly prompt: string;
  readonly ratio: string;
  readonly references: readonly PickedImage[];
  readonly reframeMode: ReframeMode;
  readonly scale: 2 | 4;
  readonly source: PickedImage | null;
  readonly tier: string;
  readonly transparent: boolean;
}

export const emptyDraft = (source: PickedImage | null = null): Draft => ({
  aspect: "",
  boxes: [],
  count: 1,
  detail: "faithful",
  eraseMode: "describe",
  fill: "",
  look: "",
  margin: { bottom: 0, left: 0, right: 0, top: 0 },
  maskAssetId: null,
  model: null,
  mood: "",
  prompt: "",
  ratio: "16:9",
  references: [],
  reframeMode: "ratio",
  scale: 2,
  source,
  tier: "",
  transparent: false,
});

export type Built =
  | { readonly ok: true; readonly request: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly reason: string };

const missing = (reason: string): Built => ({ ok: false, reason });

/** The request body for this Task, without its idempotency key, or what is
 * still missing before it can run. */
export const buildRequest = (task: AppTaskId, draft: Draft): Built => {
  const common = {
    ...(draft.model === null ? {} : { model: draft.model }),
    ...(draft.tier === "" ? {} : { tier: draft.tier }),
  };
  if (task === "generate") {
    if (draft.prompt.trim() === "") {
      return missing("Write a prompt.");
    }
    return {
      ok: true,
      request: {
        ...common,
        count: draft.count,
        prompt: draft.prompt.trim(),
        referenceAssetIds: draft.references.map((image) => image.assetId),
        task,
        ...(draft.aspect === "" ? {} : { aspect: draft.aspect }),
        ...(draft.look === "" ? {} : { look: draft.look }),
        ...(draft.mood === "" ? {} : { mood: draft.mood }),
      },
    };
  }
  if (draft.source === null) {
    return missing("Choose a Source.");
  }
  const withSource = { ...common, sourceAssetId: draft.source.assetId, task };
  switch (task) {
    case "vary": {
      return {
        ok: true,
        request: {
          ...withSource,
          count: draft.count,
          ...(draft.prompt.trim() === ""
            ? {}
            : { prompt: draft.prompt.trim() }),
        },
      };
    }
    case "erase": {
      switch (draft.eraseMode) {
        case "describe": {
          return draft.prompt.trim() === ""
            ? missing("Say what to remove.")
            : {
                ok: true,
                request: {
                  ...withSource,
                  mode: "describe",
                  prompt: draft.prompt.trim(),
                },
              };
        }
        case "paint": {
          return draft.maskAssetId === null
            ? missing("Paint over what to remove.")
            : {
                ok: true,
                request: {
                  ...withSource,
                  maskAssetId: draft.maskAssetId,
                  mode: "paint",
                  ...(draft.fill.trim() === ""
                    ? {}
                    : { fill: draft.fill.trim() }),
                },
              };
        }
        case "boxes": {
          return draft.boxes.length === 0
            ? missing("Draw a box around what to remove.")
            : {
                ok: true,
                request: { ...withSource, boxes: draft.boxes, mode: "boxes" },
              };
        }
        case "text": {
          return { ok: true, request: { ...withSource, mode: "text" } };
        }
        default: {
          throw new TypeError("Unknown erase mode.");
        }
      }
    }
    case "reframe": {
      if (draft.reframeMode === "ratio") {
        return {
          ok: true,
          request: { ...withSource, aspect: draft.ratio, mode: "ratio" },
        };
      }
      const { bottom, left, right, top } = draft.margin;
      return bottom + left + right + top === 0
        ? missing("Add some space on at least one side.")
        : {
            ok: true,
            request: { ...withSource, margin: draft.margin, mode: "margin" },
          };
    }
    case "cutout": {
      return { ok: true, request: withSource };
    }
    case "upscale": {
      return {
        ok: true,
        request: {
          ...withSource,
          detail: draft.detail,
          scale: draft.scale,
          transparent: draft.transparent,
        },
      };
    }
    default: {
      throw new TypeError("Unknown Task.");
    }
  }
};
