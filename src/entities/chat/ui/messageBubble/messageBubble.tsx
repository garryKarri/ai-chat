import styles from "./messageBubble.module.scss";

type MessageBubbleProps = {
  role: "user" | "assistant";
  text: string;
  modelLabel?: string;
};

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
        <p className={styles.text}>{text}</p>
      </div>
    </div>
  );
}
