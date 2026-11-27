"use client";

import { Mic, Pause, Play } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A voice recording the way WhatsApp shows one: a round play button, a
 * seek bar, the length, and a speed button (1×, 1.5×, 2×).
 */
export function VoiceNote({ src, outbound }: { src: string; outbound: boolean }) {
  const audio = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [rate, setRate] = React.useState(1);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };
  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  return (
    <div className="flex min-w-56 items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={current}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (audio.current) audio.current.currentTime = value;
            setCurrent(value);
          }}
          aria-label="Seek"
          className="h-1 w-full cursor-pointer accent-[#00a884]"
        />
        <span className={cn("text-[0.6875rem]", outbound ? "text-[#667781] dark:text-[#8696a0]" : "text-[#667781] dark:text-[#8696a0]")}>
          {clock(playing || current > 0 ? current : duration)}
        </span>
      </div>
      <button type="button" onClick={cycleRate} className="rounded-full bg-black/10 px-2 py-0.5 text-[0.6875rem] font-medium dark:bg-white/10">
        {rate}×
      </button>
      <Mic className="size-4 shrink-0 text-[#667781] dark:text-[#8696a0]" />
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
    </div>
  );
}
