import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui's class combiner: `clsx` for conditionals, `tailwind-merge` so a
 * caller's utility wins over a component's default rather than both landing
 * in the class list and letting source order decide. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
