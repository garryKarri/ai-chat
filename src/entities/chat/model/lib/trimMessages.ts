import { MESSAGE_LIMIT } from "../constants";

export function trimMessages<T>(messages: T[]): T[] {
  return messages.slice(-MESSAGE_LIMIT);
}
