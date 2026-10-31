import { formatUsd } from "@/lib/app/money";
import type { GenerationView } from "@/lib/app/views";

/** What a run's hold means, in a sentence. */
export const chargeLine = (generation: GenerationView): string => {
  switch (generation.costStatus) {
    case "released": {
      return "Nothing was charged. The hold was released.";
    }
    case "retained": {
      return `fal may have charged for this, so ${formatUsd(generation.boundMicros)} stays counted until a cost is known.`;
    }
    case "settled": {
      return `Charged ${formatUsd(generation.costMicros ?? 0)}.`;
    }
    case "held": {
      return `Holding up to ${formatUsd(generation.boundMicros)} against the shared cap.`;
    }
    default: {
      throw new TypeError("Unknown cost status.");
    }
  }
};
