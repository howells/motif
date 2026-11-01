import type { Metadata } from "next";
import Link from "next/link";

import { PageHead } from "@/components/app/page-head";
import { getViewer } from "@/lib/app/auth/viewer";
import {
  COMMAND_COUNT,
  COMMAND_GROUPS,
  LIBRARY_IDS,
  commandName,
  isAppTaskId,
  shortSummary,
} from "@/lib/site/commands";

export const metadata: Metadata = { title: "Commands" };

/** Every command, grouped by where it runs today. */
async function CommandsPage() {
  const viewer = await getViewer();
  const member = viewer.state === "member";
  return (
    <main>
      <PageHead
        standfirst={`${COMMAND_COUNT} commands. Every one runs in your terminal; the first six also run here.`}
        title="Commands"
      />
      <div className="px-4 pb-16 md:px-8">
        <table className="w-full border-collapse text-left">
          <thead className="max-md:sr-only">
            <tr className="border-border type-small text-faint border-b">
              <th className="py-3 md:w-44" scope="col">
                Command
              </th>
              <th className="py-3" scope="col">
                What it does
              </th>
              <th className="py-3 text-right" scope="col">
                Open
              </th>
            </tr>
          </thead>
          {COMMAND_GROUPS.map((group) => (
            <tbody key={group.name}>
              <tr>
                <th
                  className="border-border type-body border-b pt-6 pb-2 font-medium"
                  colSpan={3}
                  scope="colgroup"
                >
                  {group.name}
                </th>
              </tr>
              {group.entries.map((entry) => {
                const inApp =
                  isAppTaskId(entry.id) || LIBRARY_IDS.has(entry.id);
                const href =
                  LIBRARY_IDS.has(entry.id) && member
                    ? "/library"
                    : `/commands/${entry.id}`;
                return (
                  <tr className="border-border border-b" key={entry.id}>
                    <th className="py-0 align-middle" scope="row">
                      <Link
                        className="type-small min-h-control flex flex-col justify-center font-mono max-md:py-2"
                        href={href}
                      >
                        {commandName(entry)}
                        <span className="text-muted md:hidden">
                          {shortSummary(entry)}
                        </span>
                      </Link>
                    </th>
                    <td className="type-body text-muted py-2 align-middle max-md:hidden">
                      {shortSummary(entry)}
                    </td>
                    <td className="py-0 ps-4 text-right align-middle whitespace-nowrap">
                      <Link
                        className="type-body min-h-control inline-flex items-center"
                        href={href}
                      >
                        {inApp ? (member ? "Open" : "Open in the App") : "Read"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </main>
  );
}

export default CommandsPage;
