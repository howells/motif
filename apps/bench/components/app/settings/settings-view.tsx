"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHead } from "@/components/app/page-head";
import { InstallApp } from "@/components/app/settings/install-app";
import { api, messageOf } from "@/lib/app/client/api";
import { BudgetReply, Ignored, PeopleSchema } from "@/lib/app/client/schemas";
import { formatCap, formatUsd, monthName, resetDay } from "@/lib/app/money";

interface Person {
  readonly createdAt: string;
  readonly email: string;
  readonly id: string;
  readonly name: string | null;
  readonly role: "member" | "owner";
  readonly status: "active" | "revoked";
}

interface People {
  readonly invitations: readonly {
    readonly createdAt: string;
    readonly email: string;
    readonly id: string;
  }[];
  readonly people: readonly Person[];
}

export interface SettingsMember {
  readonly email: string;
  readonly id: string;
  readonly name: string | null;
  readonly owner: boolean;
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

function Spending({
  me,
  names,
}: {
  readonly me: SettingsMember;
  readonly names: ReadonlyMap<string, string>;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const budget = useQuery({
    queryFn: async () => {
      const body = await api("/api/app/budget", BudgetReply);
      return body.budget;
    },
    queryKey: ["budget"],
  });
  const [cap, setCap] = useState<string | null>(null);
  const saveCap = useMutation({
    mutationFn: async (dollars: number) =>
      await api("/api/app/settings/cap", Ignored, {
        body: { capCents: Math.round(dollars * 100) },
      }),
    onSuccess: async () => {
      setCap(null);
      await queryClient.invalidateQueries({ queryKey: ["budget"] });
      router.refresh();
    },
  });

  if (budget.isPending) {
    return <p className="type-small text-muted">Loading spending…</p>;
  }
  if (budget.isError) {
    return <p className="type-small text-bad">{messageOf(budget.error)}</p>;
  }
  const data = budget.data;
  const total = Math.max(data.capMicros, 1);
  const retained = data.members.reduce((sum, line) => sum + line.retained, 0);
  const typed = cap ?? (data.capMicros / 1_000_000).toFixed(2);
  const dollars = Number(typed);

  return (
    <section aria-labelledby="spending" className="flex flex-col gap-4">
      <h2 className="type-title" id="spending">
        Spending in {monthName(data.month)}
      </h2>
      <div className="flex flex-col gap-2">
        <p className="flex items-baseline justify-between">
          <span className="app-value">
            {formatUsd(data.spentMicros + data.heldMicros)} of{" "}
            {formatCap(data.capMicros)}
          </span>
          <span className="type-small text-muted">
            Resets {resetDay(data.month)}
          </span>
        </p>
        <span className="sr-only">
          {formatUsd(data.spentMicros)} spent, {formatUsd(data.heldMicros)} held
        </span>
        <span aria-hidden="true" className="app-meter">
          <span
            style={{
              inlineSize: `${Math.min(100, (data.spentMicros / total) * 100)}%`,
            }}
          />
          <span
            style={{
              inlineSize: `${Math.min(100, (data.heldMicros / total) * 100)}%`,
            }}
          />
        </span>
      </div>
      <ul className="border-border border-t">
        {data.members.map((line) => (
          <li
            className="border-border flex min-h-11 items-center justify-between border-b"
            key={line.memberId}
          >
            <span className="type-body">
              {line.memberId === me.id
                ? "You"
                : (names.get(line.memberId) ?? "Someone removed")}
              , {line.runs} {line.runs === 1 ? "run" : "runs"}
            </span>
            <span className="app-value">
              {formatUsd(line.spentMicros + line.heldMicros)}
            </span>
          </li>
        ))}
        {data.heldMicros > 0 ? (
          <li className="border-border text-muted flex min-h-11 items-center justify-between border-b">
            <span className="type-small">Held for runs still going</span>
            <span className="app-value">{formatUsd(data.heldMicros)}</span>
          </li>
        ) : null}
        {retained > 0 ? (
          <li className="border-border text-muted flex min-h-11 items-center justify-between border-b">
            <span className="type-small">Runs with no price yet</span>
            <span className="type-small">
              {retained}, counted at their full hold
            </span>
          </li>
        ) : null}
      </ul>
      {me.owner ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (Number.isFinite(dollars) && dollars >= 0) {
              saveCap.mutate(dollars);
            }
          }}
        >
          <label className="app-label" htmlFor="cap">
            Monthly cap for everyone
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="app-input app-value max-w-[10rem]"
              id="cap"
              inputMode="decimal"
              onChange={(event) => {
                setCap(event.target.value);
              }}
              value={typed}
            />
            <button
              className="app-button"
              disabled={saveCap.isPending || cap === null}
              type="submit"
            >
              Save cap
            </button>
            <span className="type-small text-muted">
              Runs stop for everyone at the cap.
            </span>
          </div>
          {saveCap.error === null ? null : (
            <p className="type-small text-bad">{messageOf(saveCap.error)}</p>
          )}
        </form>
      ) : (
        <p className="type-small text-muted">
          Everyone shares one cap of {formatCap(data.capMicros)} a month. Daniel
          sets it.
        </p>
      )}
    </section>
  );
}

/** Removing someone takes two presses: the first says what will happen. */
function RemoveAccess({
  busy,
  name,
  onRemove,
}: {
  readonly busy: boolean;
  readonly name: string;
  readonly onRemove: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        aria-label={`Remove ${name}’s access`}
        className="app-button is-danger"
        onClick={() => {
          setAsking(true);
        }}
        type="button"
      >
        Remove access
      </button>
    );
  }
  return (
    <div className="flex basis-full flex-wrap items-center justify-end gap-2 md:basis-auto">
      <span className="type-small text-muted" role="alert">
        Their Library stays, readable by no one.
      </span>
      <button
        className="app-button is-quiet"
        onClick={() => {
          setAsking(false);
        }}
        type="button"
      >
        Keep
      </button>
      <button
        className="app-button is-danger"
        disabled={busy}
        onClick={onRemove}
        type="button"
      >
        Remove {name}
      </button>
    </div>
  );
}

function PeopleSection({
  me,
  people,
}: {
  readonly me: SettingsMember;
  readonly people: People;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["people"] });
    await queryClient.invalidateQueries({ queryKey: ["budget"] });
  };
  const invite = useMutation({
    mutationFn: async () =>
      await api("/api/app/people", Ignored, { body: { email: email.trim() } }),
    onSuccess: async () => {
      setEmail("");
      await refresh();
    },
  });
  const act = useMutation({
    mutationFn: async (path: string) => await api(path, Ignored, { body: {} }),
    onSettled: refresh,
  });
  const active = people.people.filter((person) => person.status === "active");

  return (
    <section aria-labelledby="people" className="flex flex-col gap-4">
      <h2 className="type-title" id="people">
        People
      </h2>
      <ul className="border-border border-t">
        {active.map((person) => (
          <li
            className="border-border flex min-h-16 items-center gap-3 border-b py-2"
            key={person.id}
          >
            <span
              aria-hidden="true"
              className="bg-surface type-small flex size-8 shrink-0 items-center justify-center rounded-full"
            >
              {(person.name ?? person.email).slice(0, 1).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-body truncate">
                {person.name ?? person.email}
              </span>
              <span className="type-small text-muted truncate">
                {person.role === "owner"
                  ? `Owner${person.id === me.id ? " · you" : ""}`
                  : `Joined ${dateOf(person.createdAt)} · own Library`}
              </span>
            </span>
            {person.role === "owner" ? null : (
              <RemoveAccess
                busy={act.isPending}
                name={person.name ?? person.email}
                onRemove={() => {
                  act.mutate(`/api/app/people/${person.id}/revoke`);
                }}
              />
            )}
          </li>
        ))}
        {people.invitations.map((invitation) => (
          <li
            className="border-border flex min-h-16 flex-wrap items-center gap-3 border-b py-2"
            key={invitation.id}
          >
            <span
              aria-hidden="true"
              className="border-border size-8 shrink-0 rounded-full border"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-body truncate">{invitation.email}</span>
              <span className="type-small text-muted">
                Invited {dateOf(invitation.createdAt)} · not accepted
              </span>
            </span>
            <button
              className="app-button is-quiet"
              disabled={act.isPending}
              onClick={() => {
                act.mutate(`/api/app/invitations/${invitation.id}/resend`);
              }}
              type="button"
            >
              Resend
            </button>
            <button
              className="app-button"
              disabled={act.isPending}
              onClick={() => {
                act.mutate(`/api/app/invitations/${invitation.id}/cancel`);
              }}
              type="button"
            >
              Cancel invite
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <label className="sr-only" htmlFor="invite">
          Email address
        </label>
        <input
          autoComplete="off"
          className="app-input"
          id="invite"
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          placeholder="Email address"
          type="email"
          value={email}
        />
        <button
          className="app-button is-primary"
          disabled={invite.isPending || email.trim() === ""}
          type="submit"
        >
          Send invitation
        </button>
      </form>
      {invite.error === null && act.error === null ? (
        <p className="type-small text-muted">
          Only you can invite or remove people. Everyone shares the one cap.
        </p>
      ) : (
        <p className="type-small text-bad" role="alert">
          {messageOf(invite.error ?? act.error)}
        </p>
      )}
    </section>
  );
}

/** Spending, people and this device. The owner sets the cap and decides
 * who is in; everyone else sees their own spending and the shared total. */
export function SettingsView({ me }: { readonly me: SettingsMember }) {
  const people = useQuery({
    enabled: me.owner,
    queryFn: async () => await api("/api/app/people", PeopleSchema),
    queryKey: ["people"],
  });
  const names = new Map(
    (people.data?.people ?? []).map((person) => [
      person.id,
      person.name ?? person.email,
    ])
  );

  return (
    <main>
      <PageHead
        actions={
          <form action="/auth/sign-out" method="post">
            <button className="app-button" type="submit">
              Sign out
            </button>
          </form>
        }
        standfirst="Spending, people and this device"
        title="Settings"
      />
      <div className="grid gap-12 px-4 py-8 md:px-10 lg:grid-cols-[minmax(0,40rem)_minmax(0,22rem)] lg:gap-10">
        <div className="flex flex-col gap-12">
          <Spending me={me} names={names} />
          {me.owner ? (
            people.data === undefined ? (
              <p className="type-small text-muted">
                {people.isError ? messageOf(people.error) : "Loading people…"}
              </p>
            ) : (
              <PeopleSection me={me} people={people.data} />
            )
          ) : null}
        </div>
        <div className="flex flex-col gap-10">
          <section aria-labelledby="install" className="flex flex-col gap-3">
            <h2 className="type-title" id="install">
              Install the App
            </h2>
            <InstallApp />
          </section>
          <section
            aria-labelledby="account"
            className="border-border flex flex-col gap-3 border-t pt-8"
          >
            <h2 className="type-title" id="account">
              Account
            </h2>
            <p className="flex flex-wrap justify-between gap-2">
              <span className="type-body text-muted">Signed in as</span>
              <span className="type-body">{me.email}</span>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
