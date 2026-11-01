"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
} from "@/components/app/boards/icons";
import { MediaImage } from "@/components/app/media-image";
import type { TaskOptions } from "@/components/app/task/fields";
import { SourcePicker } from "@/components/app/task/source-picker";
import { MAKE_ASPECTS } from "@/lib/app/boards/make-schema";
import type { MakeAspect, MakeStart } from "@/lib/app/boards/make-schema";
import { api, messageOf, newKey } from "@/lib/app/client/api";
import { MakeQuoteSchema, RunReply } from "@/lib/app/client/board-schemas";
import type { MakeQuoteData } from "@/lib/app/client/board-schemas";
import type { PickedImage } from "@/lib/app/client/task-draft";
import { formatCap, formatUsd } from "@/lib/app/money";

/** Wait until typing stops before asking for a price. */
const useSettled = <T,>(value: T, ms: number): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return settled;
};

function Row({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <div className="board-rule-bottom relative flex min-h-13 items-center gap-3">
      <span className="type-small text-muted w-18 shrink-0">{label}</span>
      {children}
    </div>
  );
}

/** A row that opens the phone's own picker: the select covers the row. */
function SelectRow({
  choices,
  disabled = false,
  label,
  none,
  onChange,
  value,
}: {
  readonly choices: readonly { readonly id: string; readonly label: string }[];
  readonly disabled?: boolean;
  readonly label: string;
  readonly none: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const current = choices.find((choice) => choice.id === value);
  return (
    <Row label={label}>
      <span
        className={`flex-1 truncate text-sm leading-5 ${current === undefined ? "text-muted" : ""}`}
      >
        {current?.label ?? none}
      </span>
      <ChevronRightIcon className="text-muted shrink-0" />
      <select
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      >
        <option value="">{none}</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

/** What the price line says: why it can't run, or which Model will. */
const priceLine = (
  prompt: string,
  look: string,
  price: MakeQuoteData | undefined
): string => {
  if (prompt.trim() === "") {
    return "Write a prompt to see the price.";
  }
  if (price === undefined) {
    return "Pricing…";
  }
  if (price.reason !== null) {
    return price.reason;
  }
  if (price.micros > price.availableMicros) {
    return `More than the ${formatUsd(price.availableMicros)} left this month.`;
  }
  const by = look === "" ? "Motif’s choice" : "from the Look";
  const billed = price.usage ? " Billed by usage." : "";
  return `${price.modelName ?? "Motif’s choice"}, ${by}.${billed} Lands in Inbox.`;
};

function PhotoRow({
  onClear,
  onPick,
  photo,
}: {
  readonly onClear: () => void;
  readonly onPick: () => void;
  readonly photo: PickedImage | null;
}) {
  return (
    <Row label="Photo">
      {photo === null ? (
        <button
          className="text-muted flex min-h-13 flex-1 items-center justify-between text-left text-sm leading-5"
          onClick={onPick}
          type="button"
        >
          None
          <PlusIcon className="text-muted" />
        </button>
      ) : (
        <>
          <button
            className="flex min-h-13 flex-1 items-center gap-3 text-left text-sm leading-5"
            onClick={onPick}
            type="button"
          >
            <span className="relative size-8 overflow-hidden rounded">
              <MediaImage alt="" sizes="32px" src={photo.url} />
            </span>
            Your photo
          </button>
          <button
            aria-label="Remove the photo"
            className="flex size-11 items-center justify-center"
            onClick={onClear}
            type="button"
          >
            <CloseIcon className="text-muted" />
          </button>
        </>
      )}
    </Row>
  );
}

function AspectRow({
  onChange,
  value,
}: {
  readonly onChange: (value: MakeAspect) => void;
  readonly value: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 pt-4">
      <span className="type-small text-muted">Aspect</span>
      <fieldset className="board-segmented">
        <legend className="sr-only">Aspect</legend>
        {MAKE_ASPECTS.map((aspect) => (
          <button
            aria-pressed={value === aspect}
            key={aspect}
            onClick={() => {
              onChange(aspect);
            }}
            type="button"
          >
            {aspect}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function MakeHeader({ memberName }: { readonly memberName: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between pr-2 pl-5">
      <h1 className="app-screen-title">Make</h1>
      <Link
        aria-label="Settings"
        className="flex size-11 items-center justify-center"
        href="/settings"
      >
        <span className="bg-surface type-small flex size-7 items-center justify-center rounded-full">
          {memberName.slice(0, 1).toUpperCase()}
        </span>
      </Link>
    </header>
  );
}

const isBlocked = (price: MakeQuoteData | undefined): boolean =>
  price !== undefined &&
  (price.reason !== null || price.micros > price.availableMicros);

function MakeFooter({
  error,
  line,
  pending,
  price,
}: {
  readonly error: string | null;
  readonly line: string;
  readonly pending: boolean;
  readonly price: MakeQuoteData | undefined;
}) {
  const blocked = isBlocked(price);
  return (
    <div className="mt-auto flex flex-col gap-3 px-5 pt-6 pb-4">
      <p className="flex items-baseline justify-between gap-3">
        <span className={`type-small ${blocked ? "text-bad" : "text-muted"}`}>
          {line}
        </span>
        <span className="board-mono shrink-0">
          {price === undefined || price.reason !== null
            ? ""
            : price.usage
              ? `Up to ${formatCap(price.listMicros)}`
              : formatUsd(price.listMicros)}
        </span>
      </p>
      {error === null ? null : (
        <p className="type-small text-bad" role="alert">
          {error}
        </p>
      )}
      <button
        className="bg-ink text-background flex h-13 items-center justify-center rounded text-base font-medium disabled:opacity-40"
        disabled={price === undefined || blocked || pending}
        type="submit"
      >
        {pending ? "Starting…" : "Make"}
      </button>
    </div>
  );
}

/** The price of what the form asks for, once typing has stopped; nothing
 * while the answer on screen would be for an older draft. */
const useMakeQuote = (body: MakeBody): MakeQuoteData | undefined => {
  const wanted = JSON.stringify(body);
  const asked = useSettled(wanted, 500);
  const quote = useQuery({
    enabled: body.prompt !== "",
    queryFn: async () =>
      await api("/api/app/make/quote", MakeQuoteSchema, {
        // SAFETY: `asked` is always the JSON of a `MakeBody` made above;
        // widening to `unknown` only stops JSON.parse's `any` spreading.
        body: JSON.parse(asked) as unknown,
      }),
    queryKey: ["make-quote", asked],
  });
  return asked === wanted ? quote.data : undefined;
};

interface MakeBody {
  readonly aspect?: string;
  readonly look?: string;
  readonly mood?: string;
  readonly prompt: string;
  readonly references: readonly string[];
}

/** Make on a phone: a prompt, a Look and a Mood, an optional photo, the
 * shape, and the price before anything is spent. Lands in the Inbox. */
export function MakeForm({
  initial,
  memberName,
  options,
}: {
  /** Where the form starts: empty, or the last Make when making again. */
  readonly initial: MakeStart;
  readonly memberName: string;
  readonly options: TaskOptions;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const { aspect, look, mood, prompt } = draft;
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [picking, setPicking] = useState(false);
  const [key, setKey] = useState(newKey);

  const lookEntry = options.looks.find((entry) => entry.id === look);
  const moodAllowed = lookEntry === undefined || lookEntry.acceptsMood;
  const body: MakeBody = {
    ...(aspect !== null && { aspect }),
    ...(look !== "" && { look }),
    ...(mood !== "" && moodAllowed && { mood }),
    prompt: prompt.trim(),
    references: photo === null ? [] : [photo.assetId],
  };
  const price = useMakeQuote(body);

  const make = useMutation({
    mutationFn: async () => {
      if (price === undefined) {
        throw new Error("Wait for the price.");
      }
      return await api("/api/app/make", RunReply, {
        body: { ...body, approvedMicros: price.micros, idempotencyKey: key },
      });
    },
    onSuccess: async (reply) => {
      setKey(newKey());
      router.push(`/make/${reply.run.id}`);
      await queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });

  const openPicker = () => {
    setPicking(true);
  };

  return (
    <div className="app-screen flex flex-col">
      <MakeHeader memberName={memberName} />
      <form
        className="flex flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (price !== undefined && !isBlocked(price) && !make.isPending) {
            make.mutate();
          }
        }}
      >
        <div className="flex flex-col px-5">
          <textarea
            aria-label="Prompt"
            className="placeholder:text-faint app-prompt min-h-31 w-full resize-none rounded px-3.5 py-3 text-base leading-6"
            maxLength={4000}
            onChange={(event) => {
              setDraft({ ...draft, prompt: event.target.value });
            }}
            placeholder="What do you want to see?"
            value={prompt}
          />
          <div className="pt-2">
            <SelectRow
              choices={options.looks}
              label="Look"
              none="None"
              onChange={(value) => {
                setDraft({ ...draft, look: value });
              }}
              value={look}
            />
            <SelectRow
              choices={options.moods}
              disabled={!moodAllowed}
              label="Mood"
              none={moodAllowed ? "None" : "Set by the Look"}
              onChange={(value) => {
                setDraft({ ...draft, mood: value });
              }}
              value={moodAllowed ? mood : ""}
            />
            <PhotoRow
              onClear={() => {
                setPhoto(null);
              }}
              onPick={openPicker}
              photo={photo}
            />
            <AspectRow
              onChange={(value) => {
                setDraft({ ...draft, aspect: value });
              }}
              value={aspect ?? lookEntry?.aspect ?? null}
            />
          </div>
        </div>
        <MakeFooter
          error={make.isError ? messageOf(make.error) : null}
          line={priceLine(prompt, look, price)}
          pending={make.isPending}
          price={price}
        />
      </form>
      <SourcePicker
        label="Choose a photo"
        onPick={(image) => {
          setPhoto(image);
        }}
        open={picking}
        setOpen={setPicking}
      />
    </div>
  );
}
