import { Box, Text, useInput } from "ink";
import { useState } from "react";

import type { History } from "../../utils/config";
import type { Screen } from "../app";
import { costLabel } from "../task";

function getMenuItemColor(
  isDisabled: boolean,
  isSelected: boolean
): string | undefined {
  if (isDisabled) {
    return "gray";
  }
  if (isSelected) {
    return "magenta";
  }
  return undefined;
}

interface MenuItem {
  description: string;
  key: Screen;
  label: string;
  requiresLast?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    description: "Make an image from a prompt",
    key: "generate",
    label: "Generate",
  },
  {
    description: "Change, upscale or remove the background",
    key: "edit",
    label: "Edit",
  },
  {
    description: "Browse generation history",
    key: "gallery",
    label: "Gallery",
  },
  {
    description: "Aspect, resolution, API key",
    key: "settings",
    label: "Settings",
  },
];

interface HomeScreenProps {
  history: History;
  onNavigate: (screen: Screen) => void;
}

export function HomeScreen({ history, onNavigate }: HomeScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const hasLast = history.generations.length > 0;
  const last = history.generations.at(-1);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : MENU_ITEMS.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < MENU_ITEMS.length - 1 ? i + 1 : 0));
    }
    if (key.return) {
      // biome-ignore lint/style/noNonNullAssertion: index guaranteed within bounds
      const item = MENU_ITEMS[selectedIndex]!;
      if (item.requiresLast === true && !hasLast) {
        return; // Can't select this item
      }
      onNavigate(item.key);
    }
  });

  return (
    <Box flexDirection="column">
      {MENU_ITEMS.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isDisabled = item.requiresLast === true && !hasLast;

        return (
          <Box key={item.key} marginLeft={1}>
            <Text
              bold={isSelected}
              color={getMenuItemColor(isDisabled, isSelected)}
              dimColor={isDisabled}
            >
              {isSelected ? "◆ " : "  "}
              {item.label.padEnd(14)}
            </Text>
            <Text dimColor={isDisabled || !isSelected}>{item.description}</Text>
          </Box>
        );
      })}

      {last && (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          <Box>
            <Text dimColor>────────────────────────────</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Last </Text>
            <Text color="cyan">
              {last.prompt.slice(0, 40)}
              {last.prompt.length > 40 ? "..." : ""}
            </Text>
          </Box>
          <Box>
            <Text dimColor>
              {new Date(last.timestamp).toLocaleDateString()} ·{" "}
              {costLabel(last.cost)}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
