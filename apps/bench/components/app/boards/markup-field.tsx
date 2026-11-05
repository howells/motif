"use client";

import { useEffect, useRef, useState } from "react";

import { useBoard } from "@/components/app/boards/board-context";
import { Section } from "@/components/app/boards/inspector-controls";
import { MarkupEditor } from "@/components/app/boards/markup-editor";
import type { MarkupImage } from "@/components/app/boards/markup-editor";
import { MediaImage } from "@/components/app/media-image";
import type { NodeViewOf } from "@/lib/app/boards/canvas";
import { messageOf } from "@/lib/app/client/api";
import { uploadImage } from "@/lib/app/client/upload-image";
import { mediaUrl } from "@/lib/app/views";

/** The Pick wired into a node, when it has one with a known size. */
const useWiredImage = (
  nodeId: string
): ({ readonly assetId: string } & MarkupImage) | null => {
  const { view } = useBoard();
  const from = view.wires.find((wire) => wire.to === nodeId)?.from;
  const pick = view.nodes.find((node) => node.id === from)?.pick ?? null;
  return pick === null || pick.width === null || pick.height === null
    ? null
    : {
        assetId: pick.assetId,
        height: pick.height,
        url: pick.url,
        width: pick.width,
      };
};

function MarkupDialog({
  image,
  onClose,
  onSave,
}: {
  readonly image: MarkupImage;
  readonly onClose: () => void;
  readonly onSave: (markup: Blob) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [markup, setMarkup] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const use = async (drawn: Blob) => {
    setSaving(true);
    setProblem(null);
    try {
      await onSave(drawn);
      onClose();
    } catch (error) {
      setSaving(false);
      setProblem(messageOf(error));
    }
  };

  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) {
      element.showModal();
    }
  }, []);

  return (
    <dialog
      aria-labelledby="markup-title"
      className="board-dialog m-auto h-[min(860px,calc(100dvh-2rem))] w-[min(1080px,calc(100vw-2rem))]"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialog}
    >
      <div className="flex h-full flex-col gap-3 p-4">
        <header className="flex flex-col gap-1">
          <h2 className="type-title" id="markup-title">
            Mark up the image
          </h2>
          <p className="type-small text-muted">
            Circle what should change, point at it, or write a note beside it.
            The edit follows the marks; the marks themselves aren’t drawn into
            the result.
          </p>
        </header>
        <MarkupEditor image={image} onChange={setMarkup} />
        <footer className="flex items-center justify-end gap-2">
          {problem === null ? null : (
            <span className="type-small text-bad mr-auto">{problem}</span>
          )}
          <button className="board-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="board-button is-ink"
            disabled={markup === null || saving}
            onClick={() => {
              if (markup !== null) {
                void use(markup);
              }
            }}
            type="button"
          >
            {saving ? "Saving…" : "Use this markup"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

/**
 * Markup on a Vary: marks drawn over the wired-in image that guide the
 * edit. Markup belongs to the image it was drawn on; a new Pick upstream
 * asks for it to be drawn again.
 */
export function MarkupField({ node }: { readonly node: NodeViewOf<"vary"> }) {
  const { editSettings } = useBoard();
  const [drawing, setDrawing] = useState(false);
  const image = useWiredImage(node.id);
  const { markupAssetId, markupDrawnOn } = node.settings;
  const current =
    markupAssetId !== undefined &&
    image !== null &&
    markupDrawnOn === image.assetId;

  const clear = () => {
    editSettings(node, { markupAssetId: undefined, markupDrawnOn: undefined });
  };

  const save = async (markup: Blob) => {
    if (image === null) {
      return;
    }
    const asset = await uploadImage(markup, "markup");
    editSettings(node, {
      markupAssetId: asset.id,
      markupDrawnOn: image.assetId,
    });
  };

  return (
    <Section label="Markup">
      {image === null ? (
        <p className="type-small text-muted">
          Wire in an image to draw arrows, circles and notes on it.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {current ? (
            <div
              className="bg-surface rounded-panel relative overflow-hidden"
              style={{ aspectRatio: `${image.width} / ${image.height}` }}
            >
              <MediaImage
                alt="The image being edited"
                fit="contain"
                sizes="312px"
                src={image.url}
              />
              <MediaImage
                alt="The markup drawn on it"
                fit="contain"
                sizes="312px"
                src={mediaUrl(markupAssetId)}
              />
            </div>
          ) : markupAssetId === undefined ? null : (
            <p className="type-small text-bad">
              The markup was drawn on a different image. Draw it again on this
              one, or clear it.
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="board-button flex-1"
              onClick={() => {
                setDrawing(true);
              }}
              type="button"
            >
              {markupAssetId === undefined ? "Draw markup" : "Draw again"}
            </button>
            {markupAssetId === undefined ? null : (
              <button className="board-button" onClick={clear} type="button">
                Clear
              </button>
            )}
          </div>
        </div>
      )}
      {drawing && image !== null ? (
        <MarkupDialog
          image={image}
          onClose={() => {
            setDrawing(false);
          }}
          onSave={save}
        />
      ) : null}
    </Section>
  );
}
