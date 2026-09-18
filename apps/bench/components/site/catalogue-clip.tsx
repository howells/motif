"use client";

import { useRef, useState } from "react";

import type { Plate } from "@/lib/site/catalogue";

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes)}:${String(rest).padStart(2, "0")}`;
}

/** The clip, held on its poster until someone plays it.
 *
 * Nothing advances on its own. The scrubber under the picture is how the
 * duration is read, and how a reader moves through the five seconds. */
export function MotionClip({
  duration,
  poster,
  video,
}: {
  readonly duration: string;
  readonly poster: Plate;
  readonly video: string;
}) {
  const player = useRef<HTMLVideoElement | null>(null);
  const [current, setCurrent] = useState(0);
  const [length, setLength] = useState(5);

  function onTime() {
    const node = player.current;
    if (node === null) {
      return;
    }
    setCurrent(node.currentTime);
    if (Number.isFinite(node.duration) && node.duration > 0) {
      setLength(node.duration);
    }
  }

  function onScrub(value: number) {
    const node = player.current;
    if (node === null) {
      return;
    }
    node.currentTime = value;
    setCurrent(value);
  }

  const ratio = length <= 0 ? 0 : current / length;

  return (
    <div className="site-clip">
      <video
        aria-label={poster.alt}
        className="site-clip-video"
        controls={false}
        loop
        muted
        onClick={() => {
          const node = player.current;
          if (node === null) {
            return;
          }
          if (node.paused) {
            void node.play();
          } else {
            node.pause();
          }
        }}
        onLoadedMetadata={onTime}
        onTimeUpdate={onTime}
        playsInline
        poster={poster.src}
        preload="metadata"
        ref={player}
        src={video}
      >
        <track kind="captions" />
      </video>
      <div className="site-carousel-controls">
        <label className="site-progress">
          <span className="sr-only">Position in the clip</span>
          <span
            className="site-progress-fill"
            style={{ width: `${String(ratio * 100)}%` }}
          />
          <input
            aria-valuemax={length}
            aria-valuemin={0}
            aria-valuenow={current}
            aria-valuetext={`${formatTime(current)} of ${duration}`}
            className="site-clip-input"
            max={length}
            min={0}
            onChange={(event) => {
              onScrub(Number(event.target.value));
            }}
            step={0.05}
            type="range"
            value={current}
          />
        </label>
        <p className="type-small font-mono" style={{ color: "var(--faint)" }}>
          {`${formatTime(current)} / ${duration}`}
        </p>
      </div>
    </div>
  );
}
