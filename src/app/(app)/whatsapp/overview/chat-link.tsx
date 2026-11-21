"use client";

import QRCode from "qrcode";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clickToChatLink } from "@/lib/whatsapp/click-to-chat";

/** Builds a wa.me link (and a printable QR) that opens a chat with a message already typed. */
export function ChatLinkBuilder({ defaultPhone }: { defaultPhone: string }) {
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState("Hi, I'd like to know more about the courses.");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const link = digits.length >= 10 ? clickToChatLink(phone, message) : "";

  useEffect(() => {
    if (!link) {
      setQr("");
      return;
    }
    QRCode.toDataURL(link, { width: 220, margin: 1 }).then(setQr, () => setQr(""));
  }, [link]);

  return (
    <div className="flex flex-col gap-3">
      <Input className="h-9 w-64" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Number with country code, 9198…" aria-label="WhatsApp number" />
      <Input className="h-9 w-full max-w-xl" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message they start with" aria-label="Pre-filled message" />
      {link ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-col gap-2">
            <code className="max-w-md break-all rounded-md bg-muted p-2 text-xs">{link}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                navigator.clipboard.writeText(link).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              <Copy className="size-4" /> {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for this chat link" width={220} height={220} className="rounded-md border" />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Type the number with country code to get a link.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Put the link on posters, your website or Instagram bio, or print the QR. Whoever taps it
        lands in a chat with you, and their message becomes a lead like any other.
      </p>
    </div>
  );
}
