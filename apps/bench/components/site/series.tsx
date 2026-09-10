import { CodeBlock } from "@/components/site/code-block";
import { CommandLine } from "@/components/site/command-line";
import { Picture } from "@/components/site/picture";
import type { SeriesDemo } from "@/lib/site/content";

const sentenceCase = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** The scene prompt with its framing underlined. */
function ScenePrompt({
  prompt,
  slot,
}: {
  readonly prompt: string;
  readonly slot: string;
}) {
  const at = prompt.indexOf(slot);
  return (
    <p className="max-w-[46rem] text-[15px] leading-[1.6] text-(--site-muted)">
      {prompt.slice(0, at)}
      <mark className="bg-transparent text-(--site-ink) underline decoration-(--site-accent) decoration-2 underline-offset-4">
        {slot}
      </mark>
      {prompt.slice(at + slot.length)}
    </p>
  );
}

/** A series run: the images as one numbered set, the prompt behind the first,
 * the contact sheet, then the run as the series history records it. */
export function SeriesView({ demo }: { readonly demo: SeriesDemo }) {
  const [first] = demo.scenes;

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      <div className="flex flex-col gap-6 sm:gap-8">
        <ol className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-5 p-0 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-6">
          {demo.scenes.map((scene, index) => (
            <li key={scene.image.src}>
              <figure className="m-0 flex flex-col gap-2">
                <Picture asset={scene.image} />
                <figcaption className="text-[14px] leading-[1.4] text-(--site-muted)">
                  {index + 1}. {sentenceCase(scene.slot)}
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
        {first === undefined ? null : (
          <figure className="m-0 flex flex-col gap-2 border-l-2 border-(--site-accent) pl-5">
            <figcaption className="text-[14px] text-(--site-muted)">
              Scene prompt for image 1. Only the image number and the underlined
              framing change between images.
            </figcaption>
            <ScenePrompt prompt={demo.scenePrompt} slot={first.slot} />
          </figure>
        )}
      </div>

      <figure className="m-0 flex flex-col gap-3">
        <Picture asset={demo.sheet.image} />
        <figcaption className="flex flex-col gap-2">
          <span className="text-[14px] text-(--site-muted)">
            The run on a contact sheet
          </span>
          <CommandLine quiet>{demo.sheet.command}</CommandLine>
        </figcaption>
      </figure>

      <div className="grid grid-cols-1 gap-10 sm:gap-12">
        {[demo.list, demo.show].map((transcript) => (
          <div className="flex min-w-0 flex-col gap-3" key={transcript.command}>
            <CodeBlock>{transcript.command}</CodeBlock>
            <CodeBlock label="Output, shortened">{transcript.output}</CodeBlock>
          </div>
        ))}
      </div>
    </div>
  );
}
