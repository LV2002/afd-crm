"use client";

import { useState, useTransition } from "react";

import { addTransactionComment, editTransactionComment } from "@/lib/finance/comment-actions";

export interface CommentView {
  id: string;
  body: string;
  edited: boolean;
}

/**
 * The notes on one transaction, with room to add another or fix a word.
 * Notes are the part of the record that can be corrected; the row itself
 * never is, and every edit keeps the words it replaced in the audit log.
 */
export function TransactionComments({ transactionId, comments, canEdit }: { transactionId: string; comments: CommentView[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = (result: { error?: string }) => {
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setAdding(false);
    setEditing(null);
    setText("");
  };

  return (
    <div className="mt-1 flex flex-col gap-1 text-xs">
      {comments.map((c) =>
        editing === c.id ? (
          <div key={c.id} className="flex items-center gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className="h-7 w-72 rounded border bg-background px-2" aria-label="Edit comment" />
            <button type="button" disabled={pending} className="underline" onClick={() => start(async () => finish(await editTransactionComment(c.id, text)))}>
              Save
            </button>
            <button type="button" className="underline" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <div key={c.id} className="flex items-start gap-2 text-muted-foreground">
            <span>💬 {c.body}{c.edited && <span className="ml-1 opacity-70">(edited)</span>}</span>
            {canEdit && (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setEditing(c.id);
                  setText(c.body);
                }}
              >
                Edit
              </button>
            )}
          </div>
        ),
      )}
      {canEdit &&
        (adding ? (
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder="e.g. Simi's second mobile, October"
              className="h-7 w-72 rounded border bg-background px-2"
              aria-label="New comment"
            />
            <button type="button" disabled={pending || !text.trim()} className="underline" onClick={() => start(async () => finish(await addTransactionComment(transactionId, text)))}>
              Add
            </button>
            <button type="button" className="underline" onClick={() => { setAdding(false); setText(""); }}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="w-fit text-muted-foreground underline" onClick={() => { setAdding(true); setEditing(null); setText(""); }}>
            + Comment
          </button>
        ))}
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
