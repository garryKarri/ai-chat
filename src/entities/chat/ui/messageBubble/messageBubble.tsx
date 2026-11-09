import type { ReactNode } from "react";

import styles from "./messageBubble.module.scss";

type MessageBubbleProps = {
  role: "user" | "assistant";
  text: string;
  modelLabel?: string;
};

const IMAGE_MD_RE = /!\[([^\]]*)]\(([^)\s]+)\)/g;
const LINK_MD_RE = /(?<!!)\[([^\]]*)]\(([^)\s]+)\)/g;
const AUDIO_EXT_RE = /\.(mp3|wav|opus|ogg|aac|flac|m4a)(?:\?|#|$)/i;

function isAudioUrl(url: string): boolean {
  return AUDIO_EXT_RE.test(url) || url.includes("/audio/");
}

function renderMessageContent(text: string): ReactNode {
  type MatchItem = {
    index: number;
    length: number;
    kind: "image" | "audio" | "link";
    alt: string;
    src: string;
  };

  const matches: MatchItem[] = [];

  for (const match of text.matchAll(IMAGE_MD_RE)) {
    matches.push({
      index: match.index ?? 0,
      length: match[0].length,
      kind: "image",
      alt: match[1] ?? "",
      src: match[2] ?? "",
    });
  }

  for (const match of text.matchAll(LINK_MD_RE)) {
    const index = match.index ?? 0;
    const overlapsImage = matches.some(
      (item) =>
        item.kind === "image" &&
        index >= item.index &&
        index < item.index + item.length,
    );
    if (overlapsImage) {
      continue;
    }

    const src = match[2] ?? "";
    matches.push({
      index,
      length: match[0].length,
      kind: isAudioUrl(src) ? "audio" : "link",
      alt: match[1] ?? "",
      src,
    });
  }

  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) {
    return <p className={styles.text}>{text}</p>;
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const item of matches) {
    if (item.index < lastIndex) {
      continue;
    }

    if (item.index > lastIndex) {
      nodes.push(text.slice(lastIndex, item.index));
    }

    if (item.kind === "image") {
      nodes.push(
        // eslint-disable-next-line @next/next/no-img-element -- локальные /img/generated и внешние URL от Polza
        <img
          key={`img-${item.src}-${item.index}`}
          className={styles.image}
          src={item.src}
          alt={item.alt || "Сгенерированное изображение"}
        />,
      );
    } else if (item.kind === "audio") {
      nodes.push(
        <audio
          key={`audio-${item.src}-${item.index}`}
          className={styles.audio}
          controls
          preload="metadata"
          src={item.src}
        >
          <a href={item.src}>{item.alt || "Слушать аудио"}</a>
        </audio>,
      );
    } else {
      nodes.push(
        <a
          key={`link-${item.src}-${item.index}`}
          className={styles.link}
          href={item.src}
          target="_blank"
          rel="noreferrer"
        >
          {item.alt || item.src}
        </a>,
      );
    }

    lastIndex = item.index + item.length;
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
