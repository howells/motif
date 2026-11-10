import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";

import { loadConfig, loadHistory, saveConfig } from "../utils/config";
import type { History, MotifConfig, TotalCost } from "../utils/config";
import { formatTotal } from "../utils/cost";
import { hasText } from "../utils/text";
import { EditScreen } from "./screens/edit";
import { GalleryScreen } from "./screens/gallery";
import { GenerateScreen } from "./screens/generate";
import { HomeScreen } from "./screens/home";
import { SettingsScreen } from "./screens/settings";

export type Screen = "home" | "generate" | "gallery" | "settings" | "edit";

interface AppProps {
  /** The config in effect when Studio starts. */
  config: MotifConfig;
  /** The saved history when Studio starts. */
  history: History;
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Running spend across the three windows.
 *
 * Each figure carries the count of runs it could not price, so a session that
 * spent real money on metered endpoints does not read as free.
 */
function SpendFooter({ totals }: { totals: TotalCost }) {
  return (
    <Box marginTop={1}>
      <Text color="magenta">◆</Text>
      <Text dimColor>
        {" "}
        {formatTotal(totals.session, totals.unknown.session)} session │{" "}
        {formatTotal(totals.today, totals.unknown.today)} today │{" "}
        {formatTotal(totals.allTime, totals.unknown.allTime)} total
      </Text>
    </Box>
  );
}

/**
 * Studio. It owns the config and the history: Settings writes through
 * `saveConfig` and the new config is read back, so a saved key reaches the
 * screens straight away, and a finished run reloads the history for the spend
 * footer and the gallery.
 */
export function App({
  config: initialConfig,
  history: initialHistory,
}: AppProps) {
  const { exit } = useApp();
  const [config, setConfig] = useState(initialConfig);
  const [history, setHistory] = useState(initialHistory);
  const [screen, setScreen] = useState<Screen>("home");
  const [error, setError] = useState<string | null>(null);
  const [editFromGenerate, setEditFromGenerate] = useState(false);

  useInput((input, key) => {
    if (input === "q" && screen === "home") {
      exit();
    }
    if (key.escape && screen !== "home") {
      setScreen("home");
    }
  });

  const handleError = (err: Error) => {
    setError(err.message);
    setTimeout(() => {
      setError(null);
    }, 5000);
  };

  const saveSettings = async (edits: Partial<MotifConfig>) => {
    try {
      if (Object.keys(edits).length > 0) {
        await saveConfig(edits);
      }
      setConfig(await loadConfig());
      setScreen("home");
    } catch (error) {
      handleError(toError(error));
    }
  };

  // A run just finished: the callers cannot await, so a failed reload is shown
  // in the error banner instead of being dropped.
  const reloadHistory = () => {
    loadHistory()
      .then(setHistory)
      .catch((error: unknown) => {
        handleError(toError(error));
      });
  };

  const renderScreen = () => {
    switch (screen) {
      case "home": {
        return <HomeScreen history={history} onNavigate={setScreen} />;
      }
      case "generate": {
        return (
          <GenerateScreen
            config={config}
            onBack={() => {
              setScreen("home");
            }}
            onComplete={(nextScreen?: Screen) => {
              reloadHistory();
              if (nextScreen === "edit") {
                setEditFromGenerate(true);
              }
              setScreen(nextScreen ?? "home");
            }}
            onError={handleError}
          />
        );
      }
      case "edit": {
        return (
          <EditScreen
            config={config}
            onBack={() => {
              setEditFromGenerate(false);
              setScreen("home");
            }}
            onComplete={() => {
              setEditFromGenerate(false);
              reloadHistory();
              setScreen("home");
            }}
            onError={handleError}
            skipToOperation={editFromGenerate}
          />
        );
      }
      case "gallery": {
        return (
          <GalleryScreen
            history={history}
            onBack={() => {
              setScreen("home");
            }}
          />
        );
      }
      case "settings": {
        return (
          <SettingsScreen
            config={config}
            onBack={() => {
              setScreen("home");
            }}
            onSave={saveSettings}
          />
        );
      }
      default: {
        return <HomeScreen history={history} onNavigate={setScreen} />;
      }
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">
          ◆ motif
        </Text>
        <Text dimColor>
          {" "}
          │{" "}
          {screen === "home"
            ? "↑↓ navigate  enter select  q quit"
            : "esc back  q quit"}
        </Text>
      </Box>

      {hasText(error) && (
        <Box marginBottom={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {renderScreen()}

      <SpendFooter totals={history.totalCost} />
    </Box>
  );
}
