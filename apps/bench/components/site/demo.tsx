import Image from "next/image";

import { CodeBlock } from "@/components/site/code-block";
import { mayBeTransparent, Picture } from "@/components/site/picture";
import { SeriesView } from "@/components/site/series";
import type { Asset, Demo } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

function Label({ children }: { readonly children: string }) {
  return (
    <figcaption className="text-[14px] text-(--site-muted)">
      {children}
    </figcaption>
  );
}

function Labelled({
  asset,
  label,
}: {
  readonly asset: Asset;
  readonly label: string;
}) {
  return (
    <figure className="m-0 flex flex-col gap-2">
      <Picture asset={asset} />
      <Label>{label}</Label>
    </figure>
  );
}

/** A square frame that letterboxes any output, so a row of layers or maps
 * lines up without cropping any of them. */
function Framed({ asset }: { readonly asset: Asset }) {
  return (
    <div
      className={`relative aspect-square ${
        mayBeTransparent(asset) ? styles.checker : "bg-(--site-plate)"
      }`}
    >
      <Image
        alt={asset.alt}
        className="absolute inset-0 h-full w-full object-contain"
        height={asset.height}
        src={asset.src}
        unoptimized
        width={asset.width}
      />
    </div>
  );
}

const frameColumns = (count: number) => {
  switch (count) {
    case 2: {
      return "grid-cols-2";
    }
    case 3: {
      return "grid-cols-3";
    }
    case 4: {
      return "grid-cols-2 sm:grid-cols-4";
    }
    case 5: {
      return "grid-cols-3 sm:grid-cols-5";
    }
    default: {
      return "grid-cols-2 sm:grid-cols-3";
    }
  }
};

function SetView({
  outputs,
  source,
}: {
  readonly outputs: Asset[];
  readonly source?: Asset;
}) {
  if (source === undefined && outputs.length === 1) {
    const [output] = outputs;
    return output === undefined ? null : <Picture asset={output} />;
  }

  // A square or upright source joins the outputs as one row of equal frames;
  // at full width it would push them a whole screen down.
  if (source !== undefined && source.width <= source.height) {
    const frames = [
      { asset: source, label: "Source" },
      ...outputs.map((asset) => ({ asset, label: "Output" })),
    ];
    return (
      <div className={`grid gap-3 ${frameColumns(frames.length)}`}>
        {frames.map((frame) => (
          <figure className="m-0 flex flex-col gap-2" key={frame.asset.src}>
            <Framed asset={frame.asset} />
            <Label>{frame.label}</Label>
          </figure>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {source === undefined ? null : <Labelled asset={source} label="Source" />}
      <figure className="m-0 flex flex-col gap-2">
        <div className={`grid gap-3 ${frameColumns(outputs.length)}`}>
          {outputs.map((output) => (
            <Framed asset={output} key={output.src} />
          ))}
        </div>
        <Label>Output</Label>
      </figure>
    </div>
  );
}

export function DemoView({ demo }: { readonly demo: Demo }) {
  switch (demo.kind) {
    case "pair": {
      return (
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
            <Labelled asset={demo.before} label="Before" />
            <Labelled asset={demo.after} label="After" />
          </div>
          {demo.detail === undefined ? null : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Labelled
                asset={demo.detail.before}
                label="Detail at full size, before"
              />
              <Labelled
                asset={demo.detail.after}
                label="Detail at full size, after"
              />
            </div>
          )}
        </div>
      );
    }
    case "set": {
      return <SetView outputs={demo.outputs} source={demo.source} />;
    }
    case "boxes": {
      return (
        <figure className="m-0 flex flex-col gap-4">
          <div className="relative">
            <Picture asset={demo.source} />
            {demo.boxes.map((box) => (
              <span
                className="absolute border-2 border-(--site-accent)"
                key={`${box.x0}-${box.y0}`}
                style={{
                  height: `${(box.y1 - box.y0) * 100}%`,
                  left: `${box.x0 * 100}%`,
                  top: `${box.y0 * 100}%`,
                  width: `${(box.x1 - box.x0) * 100}%`,
                }}
              >
                <span className="absolute -top-px left-0 -translate-y-full bg-(--site-accent) px-1 text-[10px] leading-[1.5] text-(--site-paper) sm:px-1.5 sm:text-[12px]">
                  {box.label}
                </span>
              </span>
            ))}
          </div>
          {demo.answer === undefined ? null : (
            <p className={`${styles.display} text-[1.75rem] leading-tight`}>
              {demo.answer}
            </p>
          )}
          {demo.output === undefined ? null : (
            <CodeBlock label="Output">{demo.output}</CodeBlock>
          )}
        </figure>
      );
    }
    case "series": {
      return <SeriesView demo={demo} />;
    }
    case "terminal": {
      return (
        <CodeBlock label={demo.label} wrap={demo.wrap}>
          {demo.output}
        </CodeBlock>
      );
    }
    case "video": {
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
          {demo.source === undefined ? null : (
            <Labelled asset={demo.source} label="Source" />
          )}
          <figure className="m-0 flex flex-col gap-2">
            {/* No sound, so there is nothing to caption. */}
            <video
              aria-label={demo.poster.alt}
              className="block h-auto w-full bg-(--site-plate)"
              controls
              height={demo.poster.height}
              muted
              playsInline
              poster={demo.poster.src}
              preload="none"
              src={demo.src}
              width={demo.poster.width}
            />
            <Label>{demo.label}</Label>
          </figure>
        </div>
      );
    }
    case "text": {
      return (
        <div className="flex flex-col gap-4 sm:gap-6">
          {demo.source === undefined ? null : (
            <Labelled asset={demo.source} label="Source" />
          )}
          <figure className="m-0 flex flex-col gap-2 border-l-2 border-(--site-accent) pl-5">
            <Label>Output</Label>
            <p
              className={`${styles.display} text-[1.75rem] leading-tight sm:text-[2.25rem]`}
            >
              {demo.output}
            </p>
          </figure>
        </div>
      );
    }
    default: {
      return null;
    }
  }
}
