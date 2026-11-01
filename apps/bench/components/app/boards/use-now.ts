"use client";

import { useEffect, useState } from "react";

/** The time, ticking each second while `active`, for elapsed times. */
export const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      if (active) {
        setNow(Date.now());
      }
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [active]);
  return now;
};
