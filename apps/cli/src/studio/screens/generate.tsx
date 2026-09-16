import { resolve } from "node:path";

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

import { addGeneration, generateId } from "../../utils/config";
import type { MotifConfig } from "../../utils/config";
import {
  generateFilename,
  getFileSize,
  getImageDimensions,
  openImage,
} from "../../utils/image";
import { motifClient } from "../../utils/motif-client";
import { Spinner } from "../components/spinner";
import { TierOptions } from "../components/tier-options";
import {
  acceptsResolution,
  planCost,
  runTask,
  saveFirstFile,
  TIER_OPTIONS,
  tierMatters,
} from "../task";

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

interface Preset {
  aspect: AspectRatio;
  description: string;
  key: string;
  label: string;
  resolution?: Resolution;
}

const PRESETS: Preset[] = [
  { aspect: "1:1", description: "1:1", key: "square", label: "Square" },
  { aspect: "16:9", description: "16:9", key: "landscape", label: "Landscape" },
  { aspect: "2:3", description: "2:3", key: "portrait", label: "Portrait" },
  {
    aspect: "9:16",
    description: "9:16 vertical",
    key: "story",
    label: "Story/Reel",
  },
  {
    aspect: "21:9",
    description: "21:9 ultra-wide",
    key: "wide",
    label: "Cinematic",
  },
  {
    aspect: "2:3",
    description: "2:3 @ 2K",
    key: "cover",
    label: "Book Cover",
    resolution: "2K",
  },
  {
    aspect: "16:9",
    description: "16:9 OG image",
    key: "og",
    label: "Social Share",
  },
];

type PostAction =
  | "edit"
  | "variations"
  | "upscale"
  | "rmbg"
  | "regenerate"
  | "new"
  | "home";

const POST_ACTIONS: { key: PostAction; label: string; description: string }[] =
  [
    { description: "Change it with a new prompt", key: "edit", label: "Edit" },
    {
      description: "Make similar images",
      key: "variations",
      label: "Variations",
    },
    { description: "Make it larger", key: "upscale", label: "Upscale" },
    { description: "Transparent PNG", key: "rmbg", label: "Remove Background" },
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
  const [result, setResult] = useState<{
    path: string;
    dims: string;
    size: string;
  } | null>(null);

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

  const handleListNavigation = <T extends string>(
    items: readonly T[],
    onSelect: (item: T) => void,
    key: { upArrow?: boolean; downArrow?: boolean; return?: boolean }
  ) => {
    if (key.upArrow === true) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1));
    } else if (key.downArrow === true) {
      setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
    } else if (key.return === true) {
      // biome-ignore lint/style/noNonNullAssertion: index guaranteed within bounds
      onSelect(items[selectedIndex]!);
      setSelectedIndex(0);
    }
  };

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

  const handlePresetInput = (key: {
    upArrow?: boolean;
    downArrow?: boolean;
    return?: boolean;
    tab?: boolean;
  }) => {
    if (key.upArrow === true && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow === true && selectedIndex < PRESETS.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    } else if (key.return === true) {
      // biome-ignore lint/style/noNonNullAssertion: index guaranteed within bounds
      const preset = PRESETS[selectedIndex]!;
      setAspect(preset.aspect);
      if (preset.resolution) {
        setResolution(preset.resolution);
      }
      goToConfirm();
    } else if (key.tab === true) {
      setSelectedIndex(0);
      setStep(showTier ? "tier" : "aspect");
    }
  };

  const handleTierInput = (key: {
    upArrow?: boolean;
    downArrow?: boolean;
    return?: boolean;
  }) => {
    handleListNavigation(
      TIERS,
      (t) => {
        setTier(t);
        setStep("aspect");
      },
      key
    );
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

  const handleResolutionInput = (key: {
    upArrow?: boolean;
    downArrow?: boolean;
    return?: boolean;
  }) => {
    handleListNavigation(
      RESOLUTIONS,
      (r) => {
        setResolution(r);
        goToConfirm();
      },
      key
    );
  };

  const handleConfirmFieldEdit = (key: {
    escape?: boolean;
    upArrow?: boolean;
    downArrow?: boolean;
    return?: boolean;
  }) => {
    const close = () => {
      setConfirmField(null);
      setSelectedIndex(0);
    };
    if (key.escape === true) {
      close();
    } else if (confirmField === "tier") {
      handleListNavigation(
        TIERS,
        (t) => {
          setTier(t);
          close();
        },
        key
      );
    } else if (confirmField === "aspect") {
      handleListNavigation(
        ASPECT_RATIOS,
        (a) => {
          setAspect(a);
          close();
        },
        key
      );
    } else if (confirmField === "resolution") {
      handleListNavigation(
        RESOLUTIONS,
        (r) => {
          setResolution(r);
          close();
        },
        key
      );
    }
  };

  const confirmFields: ConfirmField[] = [
    ...(showTier ? (["tier"] as const) : []),
    "aspect",
    ...(showResolution ? (["resolution"] as const) : []),
  ];

  const getFieldSelectedIndex = (field: ConfirmField): number => {
    const indexMap: Record<ConfirmField, number> = {
      aspect: ASPECT_RATIOS.indexOf(aspect),
      resolution: RESOLUTIONS.indexOf(resolution),
      tier: TIERS.indexOf(tier),
    };
    return indexMap[field];
  };

  const handleConfirmInput = (
    input: string,
    key: { upArrow?: boolean; downArrow?: boolean; return?: boolean }
  ) => {
    if (confirmField) {
      handleConfirmFieldEdit(key);
      return;
    }

    if (key.upArrow === true) {
      setConfirmIndex((i) => (i > 0 ? i - 1 : confirmFields.length - 1));
    } else if (key.downArrow === true) {
      setConfirmIndex((i) => (i < confirmFields.length - 1 ? i + 1 : 0));
    } else if (key.return === true) {
      const field = confirmFields[confirmIndex];
      if (field !== undefined) {
        setConfirmField(field);
        setSelectedIndex(getFieldSelectedIndex(field));
      }
    } else if (input === "y" && "cost" in planned) {
      // Fire-and-forget: ink input handlers are synchronous, and
      // runGeneration reports failures through its own try/catch + onError.
      void runGeneration();
    } else if (input === "n") {
      onBack();
    }
  };

  const handleDoneInput = (key: {
    upArrow?: boolean;
    downArrow?: boolean;
    return?: boolean;
  }) => {
    if (key.upArrow === true) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : POST_ACTIONS.length - 1));
    } else if (key.downArrow === true) {
      setSelectedIndex((i) => (i < POST_ACTIONS.length - 1 ? i + 1 : 0));
    } else if (key.return === true) {
      const action = POST_ACTIONS[selectedIndex]?.key;
      switch (action) {
        case "edit":
        case "variations":
        case "upscale":
        case "rmbg": {
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
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      handleEscapeKey();
      return;
    }

    if (step === "preset") {
      handlePresetInput(key);
    } else if (step === "tier") {
      handleTierInput(key);
    } else if (step === "aspect") {
      handleAspectInput(key);
    } else if (step === "resolution") {
      handleResolutionInput(key);
    } else if (step === "confirm") {
      handleConfirmInput(input, key);
    } else if (step === "done") {
      handleDoneInput(key);
    }
  });

  const runGeneration = async () => {
    setStep("generating");
    setStatus("Generating...");

    try {
      const output = await runTask(client, "generate", input);

      setStatus("Downloading...");
      const outputPath = await saveFirstFile(output, generateFilename());

      const dims = await getImageDimensions(outputPath);
      const size = getFileSize(outputPath);

      await addGeneration({
        aspect,
        cost: output.cost.usd,
        id: generateId(),
        model: output.model,
        output: resolve(outputPath),
        prompt,
        resolution,
        timestamp: new Date().toISOString(),
      });

      const fullPath = resolve(outputPath);

      setResult({
        dims: dims ? `${dims.width}x${dims.height}` : "?",
        path: fullPath,
        size,
      });

      if (config.openAfterGenerate) {
        openImage(fullPath);
      }

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

  const renderOptions = (options: readonly string[]) => (
    <Box flexDirection="column">
      {options.map((option, i) => (
        <Box key={option}>
          <Text
            bold={i === selectedIndex}
            color={i === selectedIndex ? "magenta" : undefined}
          >
            {i === selectedIndex ? "◆ " : "  "}
            {option}
          </Text>
        </Box>
      ))}
    </Box>
  );

  const renderConfirmField = (field: ConfirmField) => {
    if (confirmField === field) {
      if (field === "tier") {
        return <TierOptions selectedIndex={selectedIndex} />;
      }
      return renderOptions(field === "aspect" ? ASPECT_RATIOS : RESOLUTIONS);
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
        {POST_ACTIONS.map((action, i) => (
          <Box key={action.key} marginLeft={1}>
            <Text
              bold={i === selectedIndex}
              color={i === selectedIndex ? "magenta" : undefined}
            >
              {i === selectedIndex ? "◆ " : "  "}
              {action.label.padEnd(14)}
            </Text>
            <Text dimColor={i !== selectedIndex}>{action.description}</Text>
          </Box>
        ))}
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
          <Box flexDirection="column" marginTop={1}>
            {PRESETS.map((preset, i) => (
              <Box key={preset.key} marginLeft={1}>
                <Text
                  bold={i === selectedIndex}
                  color={i === selectedIndex ? "magenta" : undefined}
                >
                  {i === selectedIndex ? "◆ " : "  "}
                  {preset.label.padEnd(14)}
                </Text>
                <Text dimColor={i !== selectedIndex}>{preset.description}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {step === "tier" && (
        <Box flexDirection="column">
          <Text bold>Speed or quality:</Text>
          <Box flexDirection="column" marginLeft={1} marginTop={1}>
            <TierOptions selectedIndex={selectedIndex} />
          </Box>
        </Box>
      )}

      {step === "aspect" && renderAspectStep()}

      {step === "resolution" && (
        <Box flexDirection="column">
          <Text bold>Select resolution:</Text>
          <Box flexDirection="column" marginTop={1}>
            {renderOptions(RESOLUTIONS)}
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
