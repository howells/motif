import type { ReactNode } from "react";

/** A page's name, a line saying what it holds, and its actions on the right. */
export function PageHead({
  actions,
  back,
  standfirst,
  title,
}: {
  readonly actions?: ReactNode;
  readonly back?: ReactNode;
  readonly standfirst?: string;
  readonly title: string;
}) {
  return (
    <header className="app-head">
      <div className="flex min-w-0 flex-col gap-1">
        {back}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1>{title}</h1>
          {standfirst === undefined ? null : (
            <p className="type-body text-muted">{standfirst}</p>
          )}
        </div>
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap gap-2">{actions}</div>
      )}
    </header>
  );
}
