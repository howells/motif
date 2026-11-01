/**
 * The choices a form offers, read from the SDK on the server so the browser
 * never imports it: Looks and Moods by their real names, the ratios, and
 * the per-run limits.
 */
import { CREATIVE_TAXONOMY, LOOKS } from "@howells/motif-sdk";

import type { TaskOptions } from "@/components/app/task/fields";
import { MAX_IMAGES_PER_RUN, MAX_REFERENCES } from "@/lib/app/budget/policy";
import { APP_ASPECTS } from "@/lib/app/tasks/request";

export const TASK_OPTIONS: TaskOptions = {
  aspects: APP_ASPECTS,
  looks: LOOKS.map((look) => ({
    acceptsMood: look.acceptsMood,
    aspect: look.aspect,
    id: look.id,
    label: look.label,
  })),
  maxImages: MAX_IMAGES_PER_RUN,
  maxReferences: MAX_REFERENCES,
  moods: CREATIVE_TAXONOMY.mood.map((mood) => ({
    id: mood.id,
    label: mood.label,
  })),
};
