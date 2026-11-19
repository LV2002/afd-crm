import { z } from 'zod';

// A pop-up the owner puts on the website for a while: a small landscape picture, some words and a short form. It is data, edited in
// Marketing Brain and sent to the website's feed, so switching one off there takes it off every page without touching the site.
export const POPUP_FIELD_KEYS = ['email', 'exam', 'city', 'studying', 'message'] as const;
export type PopupFieldKey = (typeof POPUP_FIELD_KEYS)[number];

// Name and phone are always asked: they are what a lead needs. The owner chooses which of these to add, and how each is worded.
export const POPUP_FIELD_DEFAULTS: Record<PopupFieldKey, string> = {
  email: 'Email', exam: 'Exam you are preparing for', city: 'City', studying: 'Studying in', message: 'Your question',
};
export const STUDYING_OPTIONS = ['Class 9 or 10', 'Class 11', 'Class 12', 'Gap year', 'College'] as const;

const Text = (max: number) => z.string().trim().min(1).max(max);

export const PopupSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
  // Only for the owner's list.
  name: Text(60),
  enabled: z.boolean(),
  archived: z.boolean().default(false),
  title: Text(80),
  body: z.string().trim().max(280),
  button: Text(40),
  thanks: Text(200),
  fields: z.array(z.object({ key: z.enum(POPUP_FIELD_KEYS), label: Text(60), required: z.boolean() })).max(5),
  delaySeconds: z.number().int().min(0).max(120),
  // After a visitor closes it, how long before it can come back. 0 means once per visit.
  repeatDays: z.number().int().min(0).max(60),
  pages: z.object({ mode: z.enum(['all', 'only', 'except']), paths: z.array(z.string().regex(/^\/[A-Za-z0-9/_\-.]*$/)).max(40) }),
  image: z.object({ hash: z.string().regex(/^[a-f0-9]{16}$/), type: z.enum(['image/jpeg', 'image/png']), width: z.number().int(), height: z.number().int() }).optional(),
  updatedAt: z.string(),
});
export type Popup = z.infer<typeof PopupSchema>;

// What the website's script receives for one pop-up. Nothing the website does not need.
export const PopupFeedItemSchema = z.object({
  id: z.string(), v: z.string(), title: z.string(), body: z.string(), button: z.string(), thanks: z.string(),
  fields: z.array(z.object({ key: z.enum(POPUP_FIELD_KEYS), label: z.string(), required: z.boolean(), options: z.array(z.string()).optional() })),
  delaySeconds: z.number(), repeatDays: z.number(), pages: PopupSchema.shape.pages,
  // Set by the website's script after it stores the picture; the app sends the picture itself as imageB64 and imageType.
  imageB64: z.string().optional(), imageType: z.string().optional(), imageHash: z.string().optional(),
});
export type PopupFeedItem = z.infer<typeof PopupFeedItemSchema>;

export const PopupsPayloadSchema = z.object({ version: z.literal(1), publishedAt: z.iso.datetime({ offset: true }), popups: z.array(PopupFeedItemSchema) });
export type PopupsPayload = z.infer<typeof PopupsPayloadSchema>;

// Only pop-ups that are on go to the website. Off means absent from the feed, so a page cannot show it.
export function buildPopupPayload(popups: readonly Popup[], exams: readonly string[], images: ReadonlyMap<string, { b64: string }>, now: Date): PopupsPayload {
  const live = popups.filter((p) => p.enabled && !p.archived).map((p): PopupFeedItem => {
    const pic = p.image === undefined ? undefined : images.get(p.id);
    return {
      id: p.id, v: p.updatedAt, title: p.title, body: p.body, button: p.button, thanks: p.thanks,
      fields: p.fields.map((f) => (f.key === 'exam' ? { ...f, options: [...exams] } : f.key === 'studying' ? { ...f, options: [...STUDYING_OPTIONS] } : f)),
      delaySeconds: p.delaySeconds, repeatDays: p.repeatDays, pages: p.pages,
      ...(p.image !== undefined && pic !== undefined ? { imageB64: pic.b64, imageType: p.image.type, imageHash: p.image.hash } : {}),
    };
  });
  return { version: 1, publishedAt: now.toISOString(), popups: live };
}

export const MAX_IMAGE_BYTES = 300_000;

// Reads the size and type from the picture's own header, so a wrong file is refused before it goes anywhere.
export function imageInfo(bytes: Uint8Array): { type: 'image/jpeg' | 'image/png'; width: number; height: number } | undefined {
  const b = bytes;
  const u32 = (i: number): number => (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', width: u32(16), height: u32(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1] ?? 0;
      const size = ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { type: 'image/jpeg', height: ((b[i + 5] ?? 0) << 8) | (b[i + 6] ?? 0), width: ((b[i + 7] ?? 0) << 8) | (b[i + 8] ?? 0) };
      i += 2 + size;
    }
  }
  return undefined;
}

// Why a picture cannot be used, in the owner's words; undefined when it can.
export function imageProblem(bytes: Uint8Array): string | undefined {
  if (bytes.length > MAX_IMAGE_BYTES) return `The picture is ${String(Math.round(bytes.length / 1000))} KB. Please keep it under ${String(MAX_IMAGE_BYTES / 1000)} KB.`;
  const info = imageInfo(bytes);
  if (info === undefined) return 'Please upload a JPEG or PNG picture.';
  if (info.width < 300) return 'The picture is too small. Please use one at least 300 pixels wide.';
  if (info.width < info.height * 1.3) return 'The picture should be landscape (clearly wider than it is tall).';
  return undefined;
}
