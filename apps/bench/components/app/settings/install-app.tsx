"use client";

import { useEffect, useState } from "react";

interface InstallPrompt extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

const isInstallPrompt = (event: Event): event is InstallPrompt =>
  "prompt" in event && typeof event.prompt === "function";

const MANUAL = [
  {
    how: "Tap Share, then Add to Home Screen.",
    where: "iPhone and iPad, in Safari",
  },
  {
    how: "Open the ⋮ menu, then Add to home screen or Install app.",
    where: "Android, in Chrome",
  },
  {
    how: "Use the install icon in the address bar, or File, then Add to Dock in Safari.",
    where: "On a desktop",
  },
] as const;

/** Install Motif as an app: the browser's own prompt where it offers one,
 * and the menu path everywhere else. */
export function InstallApp() {
  const [offer, setOffer] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    setInstalled(standalone.matches);
    const onOffer = (event: Event) => {
      if (isInstallPrompt(event)) {
        event.preventDefault();
        setOffer(event);
      }
    };
    const onInstalled = () => {
      setInstalled(true);
      setOffer(null);
    };
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async (prompt: InstallPrompt) => {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setOffer(null);
  };

  if (installed) {
    return (
      <p className="type-small text-muted">
        Motif is installed on this device.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {offer === null ? null : (
        <button
          className="app-button"
          onClick={() => {
            void install(offer);
          }}
          type="button"
        >
          Install Motif
        </button>
      )}
      <dl className="flex flex-col gap-3">
        {MANUAL.map((step) => (
          <div key={step.where}>
            <dt className="type-small font-medium">{step.where}</dt>
            <dd className="type-small text-muted">{step.how}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
