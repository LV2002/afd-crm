"use client";

import { useTransition } from "react";

import { Switch } from "@/components/ui/switch";

import { setCourseActive } from "./actions";

/** Switches a course on or off. Off hides it from pickers; nothing is deleted. */
export function CourseToggle({ courseValue, isActive }: { courseValue: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      aria-label={isActive ? "Turn this course off" : "Turn this course on"}
      checked={isActive}
      disabled={pending}
      onCheckedChange={(next) => startTransition(() => void setCourseActive(courseValue, next))}
    />
  );
}
