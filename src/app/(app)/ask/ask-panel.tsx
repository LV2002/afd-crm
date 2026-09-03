"use client";

import { Loader2, Send, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Exchange {
  question: string;
  answer?: string;
  toolsUsed?: string[];
  error?: string;
}

export function AskPanel({
  configured,
  suggestions,
}: {
  configured: boolean;
  suggestions: string[];
}) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(question: string) {
    if (!question.trim() || pending) return;
    setPending(true);
    // Show the question immediately; the answer fills in when it arrives,
    // so the page never looks like it swallowed the input.
    setExchanges((current) => [...current, { question }]);

    try {
      const response = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      setExchanges((current) =>
        current.map((exchange, index) =>
          index === current.length - 1
            ? response.ok
              ? { ...exchange, answer: data.answer, toolsUsed: data.toolsUsed }
              : { ...exchange, error: data.error ?? "Something went wrong." }
            : exchange,
        ),
      );
    } catch {
      setExchanges((current) =>
        current.map((exchange, index) =>
          index === current.length - 1
            ? { ...exchange, error: "Couldn't reach the analyst. Check your connection." }
            : exchange,
        ),
      );
    } finally {
      setPending(false);
    }
  }

  if (!configured) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
        <Sparkles className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">The analyst isn&apos;t switched on yet.</p>
        <p className="max-w-prose text-xs text-muted-foreground">
          Get a free key at <span className="font-mono">aistudio.google.com/apikey</span> and set it
          as <code className="font-mono">GEMINI_API_KEY</code> — locally in{" "}
          <code className="font-mono">.env.local</code>, and on Vercel under Project Settings →
          Environment Variables — then restart. The model is picked automatically from whatever
          your key can use; set <code className="font-mono">GEMINI_MODEL</code> only if you want a
          specific one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {exchanges.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => ask(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {exchanges.map((exchange, index) => (
          <div key={index} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{exchange.question}</p>
            {exchange.error ? (
              <FormMessage error={exchange.error} />
            ) : exchange.answer ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="whitespace-pre-wrap text-sm">{exchange.answer}</p>
                {exchange.toolsUsed && exchange.toolsUsed.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Looked at: {[...new Set(exchange.toolsUsed)].join(", ").replace(/_/g, " ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Working it out…
              </p>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const question = inputRef.current?.value ?? "";
          if (inputRef.current) inputRef.current.value = "";
          void ask(question);
        }}
      >
        <Input ref={inputRef} placeholder="Ask about your leads…" disabled={pending} />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        The analyst can only read aggregate counts, and only for data you already have access to. It
        never sees names or phone numbers.
      </p>
    </div>
  );
}
