import { Fragment } from "react";

/** Plain text with its web links made clickable (trailing punctuation stays text). */
export function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]*[^\s.,;:!?)])/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
