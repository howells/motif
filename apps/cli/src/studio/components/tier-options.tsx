import { Box, Text } from "ink";

import { TIER_OPTIONS } from "../task";

/** The three Tiers, each with the line saying what it trades. */
export function TierOptions({ selectedIndex }: { selectedIndex: number }) {
  return (
    <Box flexDirection="column">
      {TIER_OPTIONS.map((option, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={option.tier}>
            <Text bold={isSelected} color={isSelected ? "magenta" : undefined}>
              {isSelected ? "◆ " : "  "}
              {option.tier.padEnd(10)}
            </Text>
            <Text dimColor={!isSelected}>{option.note}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
