import type { Command } from "@/lib/site/home/types";

/** A command as the reader would type it, linked to its docs page. Set in
 * DM Mono, the only place on the page that face appears. */
export function CommandLink({ command }: { readonly command: Command }) {
  return (
    <a className="home-command" href={command.docs}>
      <code>{command.text}</code>
    </a>
  );
}
