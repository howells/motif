import { ASPECT_RATIOS, RESOLUTIONS } from "@howells/motif-sdk";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

import type { MotifConfig } from "../../utils/config";

type SettingKey = Exclude<keyof MotifConfig, "tasks">;

interface SettingItem {
  key: SettingKey;
  label: string;
  options?: readonly string[];
  type: "select" | "toggle" | "text";
}

const SETTINGS: SettingItem[] = [
  {
    key: "defaultAspect",
    label: "Default Aspect",
    options: ASPECT_RATIOS,
    type: "select",
  },
  {
    key: "defaultResolution",
    label: "Default Resolution",
    options: RESOLUTIONS,
    type: "select",
  },
  { key: "openAfterGenerate", label: "Open After Generate", type: "toggle" },
  { key: "apiKey", label: "API Key", type: "text" },
];

function readSetting(config: MotifConfig, key: SettingKey): unknown {
  return config[key];
}

function writeSetting(
  config: MotifConfig,
  key: SettingKey,
  value: unknown
): MotifConfig {
  return { ...config, [key]: value };
}

interface SettingsScreenProps {
  config: MotifConfig;
  onBack: () => void;
  onSave: (config: Partial<MotifConfig>) => Promise<void>;
}

export function SettingsScreen({
  config,
  onSave,
  onBack,
}: SettingsScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [localConfig, setLocalConfig] = useState<MotifConfig>({ ...config });

  // biome-ignore lint/style/noNonNullAssertion: index guaranteed within bounds
  const currentSetting = SETTINGS[selectedIndex]!;

  useInput((input, key) => {
    if (key.escape) {
      if (editing) {
        setEditing(false);
      } else {
        onBack();
      }
      return;
    }

    if (editing) {
      return; // Let TextInput handle input
    }

    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : SETTINGS.length - 1));
    }

    if (key.downArrow) {
      setSelectedIndex((i) => (i < SETTINGS.length - 1 ? i + 1 : 0));
    }

    if (key.return) {
      // biome-ignore lint/style/noNonNullAssertion: index guaranteed within bounds
      const setting = SETTINGS[selectedIndex]!;
      if (setting.type === "toggle") {
        // Toggle boolean value
        setLocalConfig((c) =>
          writeSetting(c, setting.key, readSetting(c, setting.key) !== true)
        );
      } else if (setting.type === "text") {
        const raw = readSetting(localConfig, setting.key);
        setEditValue(typeof raw === "string" ? raw : "");
        setEditing(true);
      } else if (setting.type === "select" && setting.options) {
        // Cycle through options
        const rawValue = readSetting(localConfig, setting.key);
        const currentValue = typeof rawValue === "string" ? rawValue : "";
        const currentIdx = setting.options.indexOf(currentValue);
        const nextIdx = (currentIdx + 1) % setting.options.length;
        setLocalConfig((c) =>
          writeSetting(c, setting.key, setting.options?.[nextIdx])
        );
      }
    }

    if (input === "s") {
      // Save settings — useInput handlers cannot be async, so the promise is
      // not awaited here; the parent's onSave catches failures and surfaces
      // them through the shared error banner.
      void onSave(localConfig);
    }
  });

  const handleTextSubmit = (value: string) => {
    setLocalConfig((c) => writeSetting(c, currentSetting.key, value));
    setEditing(false);
  };

  const formatValue = (setting: SettingItem): string => {
    const value = readSetting(localConfig, setting.key);
    if (setting.type === "toggle") {
      return value === true ? "Yes" : "No";
    }
    if (typeof value !== "string" || value === "") {
      return "Not set";
    }
    if (setting.key === "apiKey") {
      return `${value.slice(0, 8)}...${value.slice(-4)}`;
    }
    return value;
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Settings</Text>
        <Text dimColor> (Enter to edit, S to save)</Text>
      </Box>

      {SETTINGS.map((setting, index) => {
        const isSelected = index === selectedIndex;
        const isEditing = editing && isSelected;

        return (
          <Box key={setting.key} marginLeft={1}>
            <Text bold={isSelected} color={isSelected ? "magenta" : undefined}>
              {isSelected ? "◆ " : "  "}
              {setting.label.padEnd(20)}
            </Text>
            {isEditing && setting.type === "text" ? (
              <TextInput
                mask="*"
                onChange={setEditValue}
                onSubmit={handleTextSubmit}
                value={editValue}
              />
            ) : (
              <Text color={isSelected ? "green" : "gray"}>
                {formatValue(setting)}
              </Text>
            )}
          </Box>
        );
      })}

      <Box flexDirection="column" marginTop={2}>
        <Text dimColor>────────────────────────────</Text>
        <Box marginTop={1}>
          <Text dimColor>enter toggle/edit │ s save │ esc cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
