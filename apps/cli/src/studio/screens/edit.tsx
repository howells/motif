import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

import { DEFAULT_TIER } from "@howells/motif-sdk";
import type {
  AspectRatio,
  Resolution,
  TaskInput,
  Tier,
} from "@howells/motif-sdk";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useMemo, useState } from "react";

import { loadHistory } from "../../utils/config";
import type { Generation, MotifConfig } from "../../utils/config";
import { imageSource, motifClient } from "../../utils/motif-client";
import { hasText } from "../../utils/text";
import { Select } from "../components/select";
import { Spinner } from "../components/spinner";
import {
  OPERATIONS,
  outputPathFor,
  promptLabelFor,
  STATUS_FOR_MODE,
  TASK_FOR_MODE,
} from "../edit-modes";
import type { Mode } from "../edit-modes";
import { planCost, runTask, saveRun, TIER_OPTIONS, tierMatters } from "../task";
import type { RunResult } from "../task";

type Step =
  | "select"
  | "operation"
  | "prompt"
  | "scale"
  | "tier"
  | "confirm"
  | "processing"
  | "done";

interface EditScreenProps {
  config: MotifConfig;
  onBack: () => void;
  onComplete: () => void;
  onError: (err: Error) => void;
  skipToOperation?: boolean;
}

export function EditScreen({
  config,
  onBack,
  onComplete,
  onError,
  skipToOperation = false,
}: EditScreenProps) {
  const [step, setStep] = useState<Step>("select");
  const [mode, setMode] = useState<Mode | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selectedGen, setSelectedGen] = useState<Generation | null>(null);
  const [customPath, setCustomPath] = useState("");
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [scale, setScale] = useState(2);
  const [tier, setTier] = useState<Tier>(DEFAULT_TIER);
  const [image, setImage] = useState<string | null>(null);
  const client = useMemo(() => motifClient(config), [config]);
  const showTier = tierMatters(config, "upscale", { source: "image" });
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  // For custom path mode, create a pseudo-generation object
  const getSourceImage = (): {
    output: string;
    prompt: string;
    fromHistory: boolean;
    aspect: AspectRatio;
    resolution: Resolution;
  } | null => {
    if (useCustomPath && hasText(customPath)) {
      return {
        aspect: config.defaultAspect,
        fromHistory: false,
        output: customPath.trim(),
        prompt: basename(customPath),
        resolution: config.defaultResolution,
      };
    }
    return selectedGen === null ? null : { ...selectedGen, fromHistory: true };
  };

  /**
   * Read the source image, then go to the operations. The cost can only be
   * worked out from the image, so nothing past this step runs until it has
   * loaded; a file that cannot be read goes through onError and the screen
   * stays where it is.
   */
  const loadSource = useCallback(
    async (path: string) => {
      try {
        setImage(await imageSource(path));
        setStep("operation");
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [onError]
  );

  useEffect(() => {
    const loadGenerations = async () => {
      try {
        const history = await loadHistory();
        if (history.generations.length === 0) {
          setUseCustomPath(true);
          return;
        }
        const latest = history.generations.at(-1) ?? null;
        setGenerations([...history.generations].reverse());
        setSelectedGen(latest);
        if (skipToOperation && latest !== null) {
          await loadSource(latest.output);
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    };
    // Fire-and-forget: useEffect callbacks cannot be async, so a failed load
    // reaches the error banner through onError instead of an unhandled rejection.
    void loadGenerations();
  }, [skipToOperation, loadSource, onError]);

  const proceedFromCustomPath = () => {
    const path = customPath.trim();
    if (!path) {
      return;
    }
    if (!existsSync(path)) {
      onError(new Error(`File not found: ${path}`));
      return;
    }
    void loadSource(path);
  };

  const proceedFromOperation = (selectedMode: Mode) => {
    setMode(selectedMode);

    if (selectedMode === "edit") {
      setStep("prompt");
    } else if (selectedMode === "variations") {
      const source = getSourceImage();
      if (source !== null) {
        setPrompt(source.prompt);
      }
      setStep("confirm");
    } else if (selectedMode === "upscale") {
      setStep("scale");
    } else if (selectedMode === "rmbg") {
      setStep("confirm");
    }
  };

  const handleEscape = () => {
    if (step === "processing") {
      return;
    }
    if (step === "done") {
      onComplete();
    } else if (step === "select") {
      onBack();
    } else if (step === "operation") {
      setStep("select");
    } else {
      setStep("operation");
    }
  };

  const handleSelectInput = (
    input: string,
    key: {
      tab?: boolean;
      ctrl?: boolean;
      meta?: boolean;
      return?: boolean;
      upArrow?: boolean;
      downArrow?: boolean;
    }
  ) => {
    if (useCustomPath) {
      if (key.tab === true && generations.length > 0) {
        setUseCustomPath(false);
      }
    } else if (key.tab === true) {
      setUseCustomPath(true);
    } else if (
      hasText(input) &&
      key.return !== true &&
      key.upArrow !== true &&
      key.downArrow !== true &&
      key.ctrl !== true &&
      key.meta !== true
    ) {
      setCustomPath(input);
      setUseCustomPath(true);
    }
  };

  const handleScaleInput = (key: {
    upArrow?: boolean;
    downArrow?: boolean;
    return?: boolean;
  }) => {
    if (key.upArrow === true && scale < 8) {
      setScale(scale + 1);
    } else if (key.downArrow === true && scale > 1) {
      setScale(scale - 1);
    } else if (key.return === true) {
      setStep(showTier ? "tier" : "confirm");
    }
  };

  const handleConfirmInput = (input: string, key: { return?: boolean }) => {
    if (
      (key.return === true || input === "y") &&
      planned !== null &&
      "cost" in planned
    ) {
      // Fire-and-forget: useInput handlers cannot be async; runProcess drives its
      // own status/error UI and calls onError on failure.
      void runProcess();
    } else if (input === "n") {
      setStep("operation");
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      handleEscape();
      return;
    }

    if (step === "select") {
      handleSelectInput(input, key);
    } else if (step === "scale") {
      handleScaleInput(key);
    } else if (step === "confirm") {
      handleConfirmInput(input, key);
    } else if (step === "done" && key.return) {
      onComplete();
    }
  });

  const handlePromptSubmit = (value: string) => {
    if (value.trim()) {
      setPrompt(value.trim());
      setStep("confirm");
    }
  };

  const taskInput = (
    source: NonNullable<ReturnType<typeof getSourceImage>>,
    image: string,
    mode: Mode
  ): TaskInput => {
    if (mode === "edit") {
      return { prompt, references: [image] };
    }
    if (mode === "variations") {
      return source.fromHistory ? { image, prompt: source.prompt } : { image };
    }
    if (mode === "upscale") {
      return { image, scale, ...(showTier && { tier }) };
    }
    return { image };
  };

  const runProcess = async () => {
    const source = getSourceImage();
    if (source === null || mode === null || image === null) {
      return;
    }

    setStep("processing");

    try {
      setStatus(STATUS_FOR_MODE[mode]);
      const output = await runTask(
        client,
        TASK_FOR_MODE[mode],
        taskInput(source, image, mode)
      );

      setStatus("Saving...");
      setResult(
        await saveRun(output, outputPathFor(source.output, mode), {
          aspect: source.aspect,
          editedFrom: resolve(source.output),
          prompt: promptLabelFor(mode, { edit: prompt, source: source.prompt }),
          resolution: source.resolution,
        })
      );

      setStep("done");
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      onBack();
    }
  };

  const source = step === "select" ? null : getSourceImage();
  const planned: { cost: string } | { error: string } | null =
    source === null || mode === null || image === null
      ? null
      : planCost(client, TASK_FOR_MODE[mode], taskInput(source, image, mode));

  return (
    <Box flexDirection="column">
      <Text bold>Edit</Text>

      {/* Image selection step */}
      {step === "select" && (
        <Box flexDirection="column" marginTop={1}>
          {useCustomPath ? (
            <>
              <Text dimColor>
                Enter path or drag file
                {generations.length > 0 ? " (tab for history)" : ""}
              </Text>
              <Box marginTop={1}>
                <Text color="magenta">◆ </Text>
                <TextInput
                  onChange={setCustomPath}
                  onSubmit={proceedFromCustomPath}
                  placeholder="/path/to/image.png"
                  value={customPath}
                />
              </Box>
            </>
          ) : (
            <>
              <Text dimColor>
                Select image (↑↓ navigate, tab for custom path)
              </Text>
              <Box flexDirection="column" marginLeft={1} marginTop={1}>
                <Select
                  items={generations.slice(0, 8).map((gen) => ({
                    detail: basename(gen.output).slice(0, 20),
                    label: `${gen.prompt.slice(0, 32)}${gen.prompt.length > 32 ? "..." : ""}`,
                  }))}
                  labelWidth={36}
                  onSelect={(index) => {
                    const gen = generations[index];
                    if (gen !== undefined) {
                      setSelectedGen(gen);
                      void loadSource(gen.output);
                    }
                  }}
                />
              </Box>
              {generations.length > 8 && (
                <Box marginLeft={1} marginTop={1}>
                  <Text dimColor>
                    +{generations.length - 8} more in gallery
                  </Text>
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {/* Operation selection step */}
      {step === "operation" && source && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Source: {basename(source.output)}</Text>
          <Box flexDirection="column" marginLeft={1} marginTop={1}>
            <Select
              items={OPERATIONS.map((op) => ({
                detail: op.description,
                label: op.label,
              }))}
              labelWidth={18}
              onSelect={(index) => {
                const op = OPERATIONS[index];
                if (op !== undefined) {
                  proceedFromOperation(op.key);
                }
              }}
            />
          </Box>
        </Box>
      )}

      {/* Show source after operation selection */}
      {step !== "select" && step !== "operation" && source && (
        <Box marginBottom={1} marginTop={1}>
          <Text dimColor>Source: {basename(source.output)}</Text>
        </Box>
      )}

      {/* Prompt input for edit mode */}
      {step === "prompt" && (
        <Box flexDirection="column">
          <Text>Describe the edit:</Text>
          <Box marginTop={1}>
            <Text color="magenta">◆ </Text>
            <TextInput
              onChange={setPrompt}
              onSubmit={handlePromptSubmit}
              placeholder="Change the background to a beach..."
              value={prompt}
            />
          </Box>
        </Box>
      )}

      {/* Scale selection for upscale */}
      {step === "scale" && (
        <Box flexDirection="column">
          <Text>Select upscale factor:</Text>
          <Box marginTop={1}>
            <Text bold color="magenta">
              ◆ {scale}x
            </Text>
            <Text dimColor> (↑↓ to adjust, enter to confirm)</Text>
          </Box>
        </Box>
      )}

      {step === "tier" && (
        <Box flexDirection="column">
          <Text>Speed or quality:</Text>
          <Box flexDirection="column" marginLeft={1} marginTop={1}>
            <Select
              initialIndex={TIER_OPTIONS.findIndex(
                (option) => option.tier === tier
              )}
              items={TIER_OPTIONS.map((option) => ({
                detail: option.note,
                label: option.tier,
              }))}
              labelWidth={10}
              onSelect={(index) => {
                setTier(TIER_OPTIONS[index]?.tier ?? DEFAULT_TIER);
                setStep("confirm");
              }}
            />
          </Box>
        </Box>
      )}

      {/* Confirmation */}
      {step === "confirm" && source && mode && (
        <Box flexDirection="column">
          <Text bold>Ready to process:</Text>
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {mode === "edit" && (
              <Text>
                Edit:{" "}
                <Text color="cyan">
                  {prompt.slice(0, 40)}
                  {prompt.length > 40 ? "..." : ""}
                </Text>
              </Text>
            )}
            {mode === "variations" && (
              <Text>
                {source.fromHistory ? "Prompt: " : "Variation of "}
                <Text color="cyan">{source.prompt.slice(0, 40)}</Text>
              </Text>
            )}
            {mode === "upscale" && (
              <>
                <Text>
                  Scale: <Text color="cyan">{scale}x</Text>
                </Text>
                {showTier && (
                  <Text>
                    Tier: <Text color="green">{tier}</Text>
                  </Text>
                )}
              </>
            )}
            {mode === "rmbg" && <Text>Remove the background</Text>}
            {planned === null && <Text dimColor>Working out the cost...</Text>}
            {planned !== null && "cost" in planned && (
              <Text>
                Est. cost: <Text color="yellow">{planned.cost}</Text>
              </Text>
            )}
            {planned !== null && "error" in planned && (
              <Text color="red">Cannot run this: {planned.error}</Text>
            )}
          </Box>
          <Box marginTop={1}>
            <Text>Proceed? </Text>
            <Text bold color="green">
              [Y]es
            </Text>
            <Text> / </Text>
            <Text color="red">[N]o</Text>
          </Box>
        </Box>
      )}

      {/* Processing */}
      {step === "processing" && (
        <Box>
          <Spinner text={status} />
        </Box>
      )}

      {/* Done */}
      {step === "done" && result && (
        <Box flexDirection="column">
          <Text bold color="green">
            ◆ Complete
          </Text>
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            <Text>
              Saved: <Text color="cyan">{result.path}</Text>
            </Text>
            <Text dimColor>
              {result.dims} · {result.size}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>enter to continue</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
