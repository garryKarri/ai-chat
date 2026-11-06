import type { ChatModel } from "@shared/lib/models";

import styles from "./chatRoomHeader.module.scss";

type ChatRoomHeaderProps = {
  title: string;
  subtitle: string;
  models: ChatModel[];
  modelId: string;
  disabled?: boolean;
  onModelChange: (modelId: string) => void;
};

export function ChatRoomHeader({
  title,
  subtitle,
  models,
  modelId,
  disabled = false,
  onModelChange,
}: ChatRoomHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>

        <label className={styles.modelLabel}>
          <span className={styles.modelLabelText}>Модель</span>
          <select
            className={styles.modelSelect}
            value={modelId}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={disabled}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
