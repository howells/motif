import { ASPECT_RATIOS, DEFAULT_TIER, RESOLUTIONS } from "@howells/motif-sdk";
import type {
  AspectRatio,
  Resolution,
  TaskInput,
  Tier,
} from "@howells/motif-sdk";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useMemo, useState } from "react";

import type { MotifConfig } from "../../utils/config";
import { generateFilename } from "../../utils/image";
import { motifClient } from "../../utils/motif-client";
import { findPreset } from "../../utils/presets";
import { Select } from "../components/select";
import { Spinner } from "../components/spinner";
import {
  acceptsResolution,
  planCost,
  runTask,
  saveRun,
  TIER_OPTIONS,
  tierMatters,
} from "../task";
import type { RunResult } from "../task";

type Step =
  | "prompt"
  | "preset"
  | "tier"
  | "aspect"
  | "resolution"
  | "confirm"
  | "generating"
  | "done";

type ConfirmField = "tier" | "aspect" | "resolution";

const TIERS: readonly Tier[] = TIER_OPTIONS.map(({ tier }) => tier);

/**
 * The presets Studio offers, as ids into the SDK's format table with Studio's
 * own labels. The table supplies each one's aspect and resolution.
 */
const PRESETS = [
  { description: "1:1", key: "square", label: "Square" },
  { description: "16:9", key: "landscape", label: "Landscape" },
  { description: "2:3", key: "portrait", label: "Portrait" },
  { description: "9:16 vertical", key: "story", label: "Story/Reel" },
  { description: "21:9 ultra-wide", key: "wide", label: "Cinematic" },
  { description: "2:3 @ 2K", key: "cover", label: "Book Cover" },
  { description: "16:9 OG image", key: "og", label: "Social Share" },
].map((entry) => {
  const preset = findPreset(entry.key);
  if (preset === undefined) {
    throw new Error(`No format preset named ${entry.key}`);
  }
  return { ...entry, aspect: preset.aspect, resolution: preset.resolution };
});

type PostAction = "edit" | "regenerate" | "new" | "home";

const POST_ACTIONS: { key: PostAction; label: string; description: string }[] =
  [
    {
      description: "Change it, vary it, upscale it or cut it out",
      key: "edit",
      label: "Edit",
    },
    {
      description: "Same prompt, new settings",
      key: "regenerate",
      label: "Regenerate",
    },
    { description: "Start fresh", key: "new", label: "New Prompt" },
    { description: "Back to home", key: "home", label: "Done" },
  ];

function tierNote(tier: Tier): string {
  return TIER_OPTIONS.find((option) => option.tier === tier)?.note ?? "";
}

interface GenerateScreenProps {
  config: MotifConfig;
  onBack: () => void;
  onComplete: (nextScreen?: "home" | "edit" | "generate") => void;
  onError: (err: Error) => void;
}

export function GenerateScreen({
  config,
  onBack,
  onComplete,
  onError,
}: GenerateScreenProps) {
  const client = useMemo(() => motifClient(config), [config]);
  const [step, setStep] = useState<Step>("prompt");
  const [prompt, setPrompt] = useState("");
  const [tier, setTier] = useState<Tier>(DEFAULT_TIER);
  const [aspect, setAspect] = useState<AspectRatio>(config.defaultAspect);
  const [resolution, setResolution] = useState<Resolution>(
    config.defaultResolution
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmField, setConfirmField] = useState<ConfirmField | null>(null);
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  const showTier = tierMatters(config, "generate", { aspect });
  const showResolution = acceptsResolution(client, "generate", {
    aspect,
    prompt,
    resolution,
    tier,
  });
  const input: TaskInput = {
    aspect,
    prompt,
    tier,
    ...(showResolution && { resolution }),
  };
  const planned = planCost(client, "generate", input);

  const goToConfirm = () => {
    setSelectedIndex(0);
    setConfirmIndex(0);
    setConfirmField(null);
    setStep("confirm");
  };

  const manualSteps = (): Step[] => [
    "prompt",
    "preset",
    ...(showTier ? (["tier"] as const) : []),
    "aspect",
    ...(showResolution ? (["resolution"] as const) : []),
    "confirm",
  ];

  const handleEscapeKey = () => {
    if (step === "generating") {
      return;
    }
    if (step === "confirm" && confirmField) {
      setConfirmField(null);
      setSelectedIndex(0);
      return;
    }
    if (step === "prompt") {
      onBack();
    } else if (step === "done") {
      onComplete();
    } else if (step === "confirm") {
      setStep("preset");
      setSelectedIndex(0);
    } else {
      const steps = manualSteps();
      const currentIdx = steps.indexOf(step);
      if (currentIdx > 0) {
        // biome-ignore lint/style/noNonNullAssertion: index guaranteed within bounds
        setStep(steps[currentIdx - 1]!);
        setSelectedIndex(0);
      }
    }
  };

  const handlePresetInput = (key: { tab?: boolean }) => {
    if (key.tab === true) {
      setSelectedIndex(0);
      setStep(showTier ? "tier" : "aspect");
    }
  };

  const handleAspectInput = (key: {
    leftArrow?: boolean;
    rightArrow?: boolean;
    upArrow?: boolean;
    downArrow?: boolean;
    return?: boolean;
  }) => {
    const cols = 5;
    const total = ASPECT_RATIOS.length;
    const row = Math.floor(selectedIndex / cols);
    const col = selectedIndex % cols;

    if (key.leftArrow === true) {
      setSelectedIndex((i) => (col > 0 ? i - 1 : i));
    } else if (key.rightArrow === true) {
      setSelectedIndex((i) => (col < cols - 1 && i < total - 1 ? i + 1 : i));
    } else if (key.upArrow === true) {
      setSelectedIndex((i) => (row > 0 ? i - cols : i));
    } else if (key.downArrow === true) {
      const newIndex = selectedIndex + cols;
      if (newIndex < total) {
        setSelectedIndex(newIndex);
      }
    } else if (key.return === true) {
      // biome-ignore lint/style/noNonNullAssertion: index guaranteed within bounds
      const chosen = ASPECT_RATIOS[selectedIndex]!;
      setAspect(chosen);
      if (
        acceptsResolution(client, "generate", {
          aspect: chosen,
          prompt,
          resolution,
          tier,
        })
      ) {
        setSelectedIndex(0);
        setStep("resolution");
      } else {
        goToConfirm();
      }
    }
  };

  const confirmFields: ConfirmField[] = [
    ...(showTier ? (["tier"] as const) : []),
    "aspect",
    ...(showResolution ? (["resolution"] as const) : []),
  ];

  const handleConfirmInput = (
    input: string,
    key: { upArrow?: boolean; downArrow?: boolean; return?: boolean }
  ) => {
    if (confirmField) {
      return; // the field's own list is handling the keys
    }

    if (key.upArrow === true) {
      setConfirmIndex((i) => (i > 0 ? i - 1 : confirmFields.length - 1));
    } else if (key.downArrow === true) {
      setConfirmIndex((i) => (i < confirmFields.length - 1 ? i + 1 : 0));
    } else if (key.return === true) {
      const field = confirmFields[confirmIndex];
      if (field !== undefined) {
        setConfirmField(field);
      }
    } else if (input === "y" && "cost" in planned) {
      // Fire-and-forget: ink input handlers are synchronous, and
      // runGeneration reports failures through its own try/catch + onError.
      void runGeneration();
    } else if (input === "n") {
      onBack();
    }
  };

  const handleDoneAction = (action: PostAction | undefined) => {
    switch (action) {
      case "edit": {
        onComplete("edit");
        break;
      }
      case "regenerate": {
        setStep("preset");
        setSelectedIndex(0);
        break;
      }
      case "new": {
        setPrompt("");
        setResult(null);
        setStep("prompt");
        setSelectedIndex(0);
        break;
      }
      case "home": {
        onComplete("home");
        break;
      }
      case undefined: {
        break;
      }
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      handleEscapeKey();
      return;
    }

    if (step === "preset") {
      handlePresetInput(key);
    } else if (step === "aspect") {
      handleAspectInput(key);
    } else if (step === "confirm") {
      handleConfirmInput(input, key);
    }
  });

  const runGeneration = async () => {
    setStep("generating");
    setStatus("Generating...");

    try {
      const output = await runTask(client, "generate", input);

      setStatus("Saving...");
      setResult(
        await saveRun(output, generateFilename(), {
          aspect,
          prompt,
          resolution,
        })
      );

      setSelectedIndex(0);
      setStep("done");
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      onBack();
    }
  };

  const handlePromptSubmit = (value: string) => {
    if (value.trim()) {
      setPrompt(value.trim());
      setSelectedIndex(0);
      setStep("preset");
    }
  };

  const renderConfirmField = (field: ConfirmField) => {
    if (confirmField === field) {
      const done = () => {
        setConfirmField(null);
      };
      if (field === "tier") {
        return (
          <Select
            initialIndex={TIERS.indexOf(tier)}
            items={TIER_OPTIONS.map((option) => ({
              detail: option.note,
              label: option.tier,
            }))}
            labelWidth={10}
            onSelect={(index) => {
              setTier(TIERS[index] ?? tier);
              done();
            }}
          />
        );
      }
      if (field === "aspect") {
        return (
          <Select
            initialIndex={ASPECT_RATIOS.indexOf(aspect)}
            items={ASPECT_RATIOS.map((label) => ({ label }))}
            onSelect={(index) => {
              setAspect(ASPECT_RATIOS[index] ?? aspect);
              done();
            }}
          />
        );
      }
      return (
        <Select
          initialIndex={RESOLUTIONS.indexOf(resolution)}
          items={RESOLUTIONS.map((label) => ({ label }))}
          onSelect={(index) => {
            setResolution(RESOLUTIONS[index] ?? resolution);
            done();
          }}
        />
      );
    }
    const isActive =
      confirmFields[confirmIndex] === field && confirmField === null;
    const labels: Record<ConfirmField, string> = {
      aspect: "Aspect",
      resolution: "Resolution",
      tier: "Tier",
    };
    const values: Record<ConfirmField, string> = {
      aspect,
      resolution,
      tier,
    };
    return (
      <Text>
        {isActive ? "◆ " : "  "}
        {labels[field]}:{" "}
        <Text color={isActive ? "magenta" : "green"}>{values[field]}</Text>
        {field === "tier" && <Text dimColor> · {tierNote(tier)}</Text>}
      </Text>
    );
  };

  const renderConfirmStep = () => (
    <Box flexDirection="column">
      <Text bold>Ready to generate:</Text>
      {confirmField && <Text dimColor>esc cancel</Text>}
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        <Text>
          {"  "}Prompt:{" "}
          <Text color="cyan">
            {prompt.slice(0, 50)}
            {prompt.length > 50 ? "..." : ""}
          </Text>
        </Text>
        {confirmFields.map((field) => (
          <Box key={field}>{renderConfirmField(field)}</Box>
        ))}
        {"cost" in planned ? (
          <Text>
            {"  "}Est. cost: <Text color="yellow">{planned.cost}</Text>
          </Text>
        ) : (
          <Text color="red">
            {"  "}Cannot generate: {planned.error}
          </Text>
        )}
      </Box>
      {!confirmField && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>↑↓ select, enter to edit</Text>
          <Box>
            <Text>Generate? </Text>
            <Text bold color="green">
              [Y]es
            </Text>
            <Text> / </Text>
            <Text color="red">[N]o</Text>
          </Box>
        </Box>
      )}
    </Box>
  );

  const renderDoneStep = () => (
    <Box flexDirection="column">
      <Text bold color="green">
        ◆ Image ready
      </Text>
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        <Text>
          Saved: <Text color="cyan">{result?.path}</Text>
        </Text>
        <Text dimColor>
          {result?.dims} · {result?.size}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Continue</Text>
        <Box flexDirection="column" marginLeft={1}>
          <Select
            items={POST_ACTIONS.map((action) => ({
              detail: action.description,
              label: action.label,
            }))}
            labelWidth={14}
            onSelect={(index) => {
              handleDoneAction(POST_ACTIONS[index]?.key);
            }}
          />
        </Box>
      </Box>
    </Box>
  );

  const renderAspectStep = () => (
    <Box flexDirection="column">
      <Text bold>Select aspect ratio:</Text>
      <Text dimColor>↑↓←→ to navigate</Text>
      <Box flexDirection="column" marginTop={1}>
        {[0, 1].map((row) => (
          <Box flexDirection="row" key={row}>
            {ASPECT_RATIOS.slice(row * 5, row * 5 + 5).map((a, colIdx) => {
              const i = row * 5 + colIdx;
              return (
                <Box key={a} width={12}>
                  <Text
                    bold={i === selectedIndex}
                    color={i === selectedIndex ? "magenta" : undefined}
                  >
                    {i === selectedIndex ? "◆" : " "}
                    {a.padEnd(6)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );

  return (
    <Box flexDirection="column">
      {step === "prompt" && (
        <Box flexDirection="column">
          <Text bold>Enter your prompt:</Text>
          <Box marginTop={1}>
            <Text color="magenta">◆ </Text>
            <TextInput
              onChange={setPrompt}
              onSubmit={handlePromptSubmit}
              placeholder="A cat sitting on a windowsill..."
              value={prompt}
            />
          </Box>
        </Box>
      )}

      {step === "preset" && (
        <Box flexDirection="column">
          <Text bold>Quick presets</Text>
          <Text dimColor>↑↓ select, enter apply, tab for manual</Text>
          <Box flexDirection="column" marginLeft={1} marginTop={1}>
            <Select
              items={PRESETS.map((preset) => ({
                detail: preset.description,
                label: preset.label,
              }))}
              labelWidth={14}
              onSelect={(index) => {
                const preset = PRESETS[index];
                if (preset !== undefined) {
                  setAspect(preset.aspect);
                  if (preset.resolution) {
                    setResolution(preset.resolution);
                  }
                  goToConfirm();
                }
              }}
            />
          </Box>
        </Box>
      )}

      {step === "tier" && (
        <Box flexDirection="column">
          <Text bold>Speed or quality:</Text>
          <Box flexDirection="column" marginLeft={1} marginTop={1}>
            <Select
              items={TIER_OPTIONS.map((option) => ({
                detail: option.note,
                label: option.tier,
              }))}
              labelWidth={10}
              onSelect={(index) => {
                setTier(TIERS[index] ?? DEFAULT_TIER);
                setSelectedIndex(0);
                setStep("aspect");
              }}
            />
          </Box>
        </Box>
      )}

      {step === "aspect" && renderAspectStep()}

      {step === "resolution" && (
        <Box flexDirection="column">
          <Text bold>Select resolution:</Text>
          <Box flexDirection="column" marginTop={1}>
            <Select
              items={RESOLUTIONS.map((option) => ({ label: option }))}
              onSelect={(index) => {
                setResolution(RESOLUTIONS[index] ?? resolution);
                goToConfirm();
              }}
            />
          </Box>
        </Box>
      )}

      {step === "confirm" && renderConfirmStep()}

      {step === "generating" && (
        <Box>
          <Spinner text={status} />
        </Box>
      )}

      {step === "done" && result && renderDoneStep()}
    </Box>
  );
}
