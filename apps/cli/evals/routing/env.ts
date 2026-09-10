/**
 * The routing eval's one environment read: the Anthropic API key. Env holds
 * keys only; everything else is a command-line option.
 */

export function anthropicApiKey(): string | undefined {
  const key = process.env.ANTHROPIC_API_KEY;
  return key === undefined || key === "" ? undefined : key;
}
