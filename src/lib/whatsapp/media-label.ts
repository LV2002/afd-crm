/** "🎤 Voice note", "📷 Photo", "🎥 Video", "📄 Document" — what a file is, from its type. */
export function mediaLabel(mimeType: string | null): string {
  const type = mimeType ?? "";
  if (type.startsWith("audio/")) return type.includes("ogg") ? "🎤 Voice note" : "🎵 Audio";
  if (type.startsWith("image/")) return "📷 Photo";
  if (type.startsWith("video/")) return "🎥 Video";
  if (type) return "📄 Document";
  return "Attachment";
}
