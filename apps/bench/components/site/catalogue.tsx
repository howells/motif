import { Field } from "@/components/site/catalogue-fields";
import type { CatalogueEntry, CatalogueGroup } from "@/lib/site/catalogue";
import { CATALOGUE } from "@/lib/site/catalogue";

function Rail({ entry }: { readonly entry: CatalogueEntry }) {
  return (
    <div className="site-rail">
      <h3 className="type-body">{entry.verb}</h3>
      <code className="site-rail-usage type-small font-mono">
        {entry.usage}
      </code>
      <p className="site-rail-summary type-body">{entry.summary}</p>
    </div>
  );
}

function Band({ entry }: { readonly entry: CatalogueEntry }) {
  return (
    <article className="site-band" id={entry.id}>
      <Rail entry={entry} />
      <div className="site-field">
        <Field entry={entry} />
      </div>
    </article>
  );
}

function Group({ group }: { readonly group: CatalogueGroup }) {
  const bands = [];
  for (const entry of group.entries) {
    bands.push(<Band entry={entry} key={entry.id} />);
  }
  return (
    <div>
      <div className="site-band-chapter">
        <h2 className="type-title site-chapter-name">{group.name}</h2>
        <p className="type-body site-chapter-standfirst">{group.body}</p>
        <p className="type-small site-chapter-count font-mono">{group.count}</p>
      </div>
      {bands}
    </div>
  );
}

/** Every command Motif has, as a full-width band.
 *
 * The rail on the left carries the name, the exact command and one sentence.
 * The field to the right takes the shape the
 * command's result actually comes in, and runs off the right edge of the
 * page. */
export function Catalogue() {
  const groups = [];
  for (const group of CATALOGUE) {
    groups.push(<Group group={group} key={group.name} />);
  }
  return (
    <section className="site-catalogue" id="commands">
      {groups}
    </section>
  );
}
