import { Box, Text, useInput } from "ink";
import { useState } from "react";

export interface SelectItem {
  /** A second column, dimmed unless the row is the cursor's. */
  detail?: string;
  label: string;
}

interface SelectProps {
  /** Where the cursor starts. Mount with a new `key` to move it. */
  initialIndex?: number;
  items: readonly SelectItem[];
  /** Pad the label to this width so details line up. */
  labelWidth?: number;
  /** Called with the chosen item's position on Enter. */
  onSelect: (index: number) => void;
}

/** A list with a `◆` cursor: up and down move it (wrapping), Enter chooses. */
export function Select({
  initialIndex = 0,
  items,
  labelWidth = 0,
  onSelect,
}: SelectProps) {
  const [cursor, setCursor] = useState(initialIndex);

  useInput((_input, key) => {
    if (key.upArrow) {
      setCursor((i) => (i > 0 ? i - 1 : items.length - 1));
    } else if (key.downArrow) {
      setCursor((i) => (i < items.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      onSelect(cursor);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isSelected = index === cursor;
        return (
          <Box key={`${item.label}-${index}`}>
            <Text bold={isSelected} color={isSelected ? "magenta" : undefined}>
              {isSelected ? "◆ " : "  "}
              {item.label.padEnd(labelWidth)}
            </Text>
            {item.detail !== undefined && (
              <Text dimColor={!isSelected}>{item.detail}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
