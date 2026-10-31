"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MediaImage } from "@/components/app/media-image";
import { api, messageOf } from "@/lib/app/client/api";
import { StacksReply } from "@/lib/app/client/schemas";
import type { PickedImage } from "@/lib/app/client/task-draft";
import { fitForUpload, uploadImage } from "@/lib/app/client/upload-image";
import type { StackView } from "@/lib/app/views";

type Cover = NonNullable<StackView["cover"]>;

/** The pixel size of a Library image, read from the image itself. */
const sizeOf = async (
  url: string
): Promise<{ height: number; width: number }> =>
  await new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    });
    image.addEventListener("error", () => {
      reject(new Error("That image couldn’t be opened."));
    });
    image.src = url;
  });

/** Choose an image: take a photo, pick one from the device, or use one from
 * the Library. Opens as a sheet on a phone and a dialog on a desktop. */
export function SourcePicker({
  label,
  onPick,
  open,
  setOpen,
}: {
  readonly label: string;
  readonly onPick: (image: PickedImage) => void;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const library = useQuery({
    enabled: open,
    queryFn: async () => {
      const body = await api("/api/app/library", StacksReply);
      return body.stacks;
    },
    queryKey: ["library", "picker"],
  });

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    }
    if (!open && element.open) {
      element.close();
    }
  }, [open]);

  const finish = (image: PickedImage) => {
    onPick(image);
    setOpen(false);
  };

  const fromDevice = async (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const blob = await fitForUpload(file);
      const asset = await uploadImage(blob, "image", file.name);
      finish({
        assetId: asset.id,
        height: asset.height,
        url: asset.url,
        width: asset.width,
      });
    } catch (error) {
      setProblem(messageOf(error));
    }
    setBusy(false);
  };

  const fromLibrary = async (cover: Cover) => {
    setBusy(true);
    setProblem(null);
    try {
      const size = await sizeOf(cover.url);
      finish({ assetId: cover.assetId, url: cover.url, ...size });
    } catch (error) {
      setProblem(messageOf(error));
    }
    setBusy(false);
  };

  const stacks = (library.data ?? []).flatMap((stack) =>
    stack.cover === null ? [] : [{ cover: stack.cover, stack }]
  );

  return (
    <dialog
      aria-label={label}
      className="app-sheet"
      onClose={() => {
        setOpen(false);
      }}
      ref={dialog}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="border-border flex items-center justify-between border-b py-2 pr-2 pl-5">
          <h2 className="type-body font-medium">{label}</h2>
          <button
            aria-label="Close"
            className="flex size-11 items-center justify-center"
            onClick={() => {
              setOpen(false);
            }}
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 p-5">
          <button
            className="app-button"
            disabled={busy}
            onClick={() => camera.current?.click()}
            type="button"
          >
            <Camera aria-hidden="true" size={18} strokeWidth={1.5} />
            Take a photo
          </button>
          <button
            className="app-button"
            disabled={busy}
            onClick={() => files.current?.click()}
            type="button"
          >
            <ImagePlus aria-hidden="true" size={18} strokeWidth={1.5} />
            Choose a photo
          </button>
          <input
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              void fromDevice(event.target.files?.[0]);
              event.target.value = "";
            }}
            ref={camera}
            tabIndex={-1}
            type="file"
          />
          <input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            onChange={(event) => {
              void fromDevice(event.target.files?.[0]);
              event.target.value = "";
            }}
            ref={files}
            tabIndex={-1}
            type="file"
          />
        </div>
        <p aria-live="polite" className="type-small text-bad px-5">
          {busy ? (
            <span className="text-muted">Getting the image ready…</span>
          ) : (
            problem
          )}
        </p>
        <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6">
          <h3 className="type-small text-muted pb-2">From your Library</h3>
          {library.isPending ? (
            <p className="type-small text-muted">Loading…</p>
          ) : library.isError ? (
            <p className="type-small text-bad">{messageOf(library.error)}</p>
          ) : stacks.length === 0 ? (
            <p className="type-small text-muted">
              Nothing in your Library yet.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-1 md:grid-cols-4">
              {stacks.map(({ cover, stack }) => (
                <li key={stack.stackId}>
                  <button
                    aria-label={
                      stack.prompt ?? `${stack.task} with ${stack.model}`
                    }
                    className="app-thumb w-full"
                    disabled={busy}
                    onClick={() => {
                      void fromLibrary(cover);
                    }}
                    type="button"
                  >
                    <MediaImage
                      alt=""
                      sizes="(max-width: 767px) 33vw, 8rem"
                      src={cover.url}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
