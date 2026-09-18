const STUDIO_MENU = [
  { description: "Make an image from a prompt", label: "Generate" },
  { description: "Change, upscale or remove the background", label: "Edit" },
  { description: "Browse generation history", label: "Gallery" },
  { description: "Aspect, resolution, API key", label: "Settings" },
] as const;

/** The Studio home screen, set as type rather than screenshotted. Labels,
 * descriptions and the ◆ selector are verbatim from the real Studio menu
 * (`apps/cli/src/studio/screens/home.tsx`); Generate carries the selection
 * as it does on launch. The conditional Last block is omitted — it only
 * renders against local history. A static specimen, not a control. */
export function StudioField() {
  return (
    <div className="site-studio">
      <ul className="site-studio-menu">
        {STUDIO_MENU.map((item, position) => {
          const selected = position === 0;
          return (
            <li
              aria-current={selected ? "true" : undefined}
              className="site-studio-row"
              key={item.label}
            >
              <span aria-hidden="true" className="site-studio-mark">
                {selected ? "◆" : ""}
              </span>
              <code
                className="type-small font-mono"
                style={{
                  color: "var(--ink)",
                  fontWeight: selected ? 600 : 400,
                }}
              >
                {item.label}
              </code>
              <span className="type-small" style={{ color: "var(--muted)" }}>
                {item.description}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
