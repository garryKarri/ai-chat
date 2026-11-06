import type { ReactNode } from "react";

import styles from "./messageBubble.module.scss";

type MessageBubbleProps = {
  role: "user" | "assistant";
  text: string;
  modelLabel?: string;
};

const IMAGE_MD_RE = /!\[([^\]]*)]\(([^)\s]+)\)/g;

function renderMessageContent(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(IMAGE_MD_RE)) {
    const matchIndex = match.index ?? 0;
    const [full, alt = "", src = ""] = match;

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      // eslint-disable-next-line @next/next/no-img-element -- локальные /img/generated и внешние URL от Polza
      <img
        key={`${src}-${matchIndex}`}
        className={styles.image}
        src={src}
        alt={alt ?? "Сгенерированное изображение"}
      />,
    );

    lastIndex = matchIndex + full.length;
  }

  if (lastIndex === 0) {
    return <p className={styles.text}>{text}</p>;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <div className={styles.content}>{nodes}</div>;
}

export function MessageBubble({ role, text, modelLabel }: MessageBubbleProps) {
  const isOwn = role === "user";

  return (
    <div
      className={[styles.row, isOwn ? styles.own : styles.other].join(" ")}
    >
      <div
        className={[
          styles.bubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
        ].join(" ")}
      >
        {!isOwn && modelLabel ? (
          <div className={styles.modelLabel}>{modelLabel}</div>
        ) : null}
        {renderMessageContent(text)}
      </div>
    </div>
  );
}
