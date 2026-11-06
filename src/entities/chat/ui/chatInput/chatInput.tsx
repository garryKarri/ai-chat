import { FormEvent, KeyboardEvent } from "react";

import styles from "./chatInput.module.scss";

type ChatInputProps = {
  value: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ChatInput({
  value,
  disabled = false,
  submitDisabled = false,
  placeholder = "Напиши сообщение…",
  onChange,
  onSubmit,
}: ChatInputProps) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form onSubmit={onSubmit} className={styles.composer}>
      <div className={styles.composerInner}>
        <textarea
          className={styles.input}
          placeholder={placeholder}
          value={value}
          rows={1}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          disabled={submitDisabled}
          className={styles.send}
        >
          Отправить
        </button>
      </div>
    </form>
  );
}
