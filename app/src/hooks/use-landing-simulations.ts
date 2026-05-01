import { useEffect, useRef, useState } from "react";

import {
  BOARD_INIT,
  BOOT_LINES,
  type BoardRow,
  type FeedRow,
  type TerminalLine,
  makeFeedRow,
  updateBoard,
} from "@/lib/landing-simulation";

export function useLanding1Simulation() {
  const [feed, setFeed] = useState<FeedRow[]>(() =>
    Array.from({ length: 8 }, (_, index) => makeFeedRow(index))
  );
  const [board, setBoard] = useState<BoardRow[]>(BOARD_INIT);
  const [countdown, setCountdown] = useState(1421);
  const [mounted, setMounted] = useState(false);
  const [barsIn, setBarsIn] = useState(false);
  const idRef = useRef(100);

  useEffect(() => {
    const mountFrame = window.requestAnimationFrame(() => setMounted(true));
    const barsTimer = window.setTimeout(() => setBarsIn(true), 600);
    const feedTimer = window.setInterval(
      () =>
        setFeed((previous) => [
          makeFeedRow(++idRef.current),
          ...previous.slice(0, 8),
        ]),
      1800
    );
    const clockTimer = window.setInterval(
      () => setCountdown((seconds) => Math.max(0, seconds - 1)),
      1000
    );
    const boardTimer = window.setInterval(
      () => setBoard((previous) => updateBoard(previous)),
      2200
    );

    return () => {
      window.cancelAnimationFrame(mountFrame);
      window.clearTimeout(barsTimer);
      window.clearInterval(feedTimer);
      window.clearInterval(clockTimer);
      window.clearInterval(boardTimer);
    };
  }, []);

  return {
    feed,
    board,
    countdown,
    mounted,
    barsIn,
  };
}

export function useLanding2Simulation() {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [done, setDone] = useState(false);
  const [gameCount, setGameCount] = useState(23);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handles = BOOT_LINES.map(({ delay, ...line }, index) =>
      window.setTimeout(() => {
        setLines((previous) => [...previous, line]);
        if (index === BOOT_LINES.length - 1) setDone(true);
      }, delay)
    );
    const ticker = window.setInterval(() => {
      setGameCount((count) => count + (Math.random() > 0.7 ? 1 : 0));
    }, 4000);

    return () => {
      handles.forEach(window.clearTimeout);
      window.clearInterval(ticker);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return {
    lines,
    done,
    gameCount,
    endRef,
  };
}
