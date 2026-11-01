import Link from "next/link";
import type { ReactNode } from "react";

import { PageHead } from "@/components/app/page-head";
import type { Member } from "@/lib/app/auth/members";
import type { Viewer } from "@/lib/app/auth/viewer";

function Notice({
  action,
  body,
  title,
}: {
  readonly action?: ReactNode;
  readonly body: string;
  readonly title: string;
}) {
  return (
    <div className="flex max-w-[34rem] flex-col gap-4 px-4 py-12 md:px-8">
      <h2 className="type-title">{title}</h2>
      <p className="type-body text-muted">{body}</p>
      {action}
    </div>
  );
}

/** What someone who isn't a member sees where the App would be. */
export function NotAMember({ viewer }: { readonly viewer: Viewer }) {
  switch (viewer.state) {
    case "sign-in-unavailable": {
      return (
        <Notice
          body="This copy of Motif has no sign-in set up, so the App can’t open here. Every command still runs in your terminal."
          title="Sign-in isn’t set up"
          action={
            <Link className="app-button self-start" href="/setup">
              Set up the CLI
            </Link>
          }
        />
      );
    }
    case "signed-out": {
      return (
        <Notice
          body="The App is invitation only. Sign in with the address your invitation went to."
          title="Sign in to use the App"
          action={
            <form action="/auth/sign-in" className="self-start" method="get">
              <button className="app-button is-primary" type="submit">
                Sign in
              </button>
            </form>
          }
        />
      );
    }
    case "app-unavailable": {
      return (
        <Notice
          body={`You’re signed in as ${viewer.email}, but this server has no database for the App yet.`}
          title="The App isn’t available here"
        />
      );
    }
    case "no-access": {
      return (
        <Notice
          body={
            viewer.revoked
              ? `${viewer.email} no longer has access. Ask Daniel if that’s a mistake.`
              : `${viewer.email} hasn’t been invited. Ask Daniel for an invitation, then sign in with that address.`
          }
          title={
            viewer.revoked
              ? "Your access was removed"
              : "No invitation for this account"
          }
          action={
            <form action="/auth/sign-out" method="post">
              <button className="app-button" type="submit">
                Sign out
              </button>
            </form>
          }
        />
      );
    }
    case "member": {
      return null;
    }
    default: {
      throw new TypeError("Unknown sign-in state.");
    }
  }
}

/** Render a members-only page, or the reason it can't open. */
export function MembersOnly({
  children,
  standfirst,
  title,
  viewer,
}: {
  readonly children: (member: Member) => ReactNode;
  readonly standfirst?: string;
  readonly title: string;
  readonly viewer: Viewer;
}): ReactNode {
  if (viewer.state === "member") {
    return children(viewer.member);
  }
  return (
    <>
      <PageHead standfirst={standfirst} title={title} />
      <NotAMember viewer={viewer} />
    </>
  );
}
