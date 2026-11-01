import { formatUsd } from "@/lib/app/money";
import type { GenerationView } from "@/lib/app/views";

/** What a run's hold means, in a sentence. */
export const chargeLine = (generation: GenerationView): string => {
  switch (generation.costStatus) {
    case "released": {
      return "Nothing was charged. The hold was released.";
    }
    case "retained": {
      return `fal didn’t say what this cost, so ${formatUsd(generation.boundMicros)} stays counted as an estimate.`;
    }
    case "settled": {
      return `Charged ${formatUsd(generation.costMicros ?? 0)}.`;
    }
    case "held": {
      return `Holding up to ${formatUsd(generation.boundMicros)} against this month’s cap.`;
    }
    default: {
      throw new TypeError("Unknown cost status.");
    }
  }
};
