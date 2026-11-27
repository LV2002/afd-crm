import * as React from "react";

/**
 * Message text the way WhatsApp draws it: *bold*, _italic_, ~strikethrough~,
 * ```monospace```, links you can tap, and line breaks kept.
 *
 * Built as React nodes, never as HTML, so a message can never inject markup.
 */
const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
const STYLE_PATTERN = /(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

function styled(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(STYLE_PATTERN).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("```") && part.endsWith("```") && part.length > 6) return <code key={key} className="font-mono text-[0.85em]">{part.slice(3, -3)}</code>;
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <strong key={key}>{part.slice(1, -1)}</strong>;
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.length > 2 && part.startsWith("~") && part.endsWith("~")) return <s key={key}>{part.slice(1, -1)}</s>;
    return part;
  });
}

export function FormattedText({ text }: { text: string }) {
  const pieces = text.split(URL_PATTERN);
  return (
    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {pieces.map((piece, index) =>
        index % 2 === 1 ? (
          <a key={index} href={piece} target="_blank" rel="noopener noreferrer" className="text-[#027eb5] underline dark:text-[#53bdeb]">
            {piece}
          </a>
        ) : (
          <React.Fragment key={index}>{styled(piece, String(index))}</React.Fragment>
        ),
      )}
    </span>
  );
}
