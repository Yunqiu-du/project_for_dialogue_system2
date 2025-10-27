import type { SpeechStateExternalEvent } from "speechstate";
import type { AnyActorRef } from "xstate";

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: string;
  // nextUtterance: string;
  informationState: { latestMove: string };
  messages: Message[];
  ollamaModels: String[];
}

export type DMEvents =
  | SpeechStateExternalEvent
  | { type: "CLICK" }
  | { type: "SAYS"; value: string }
  | { type: "NEXT_MOVE"; value: string }
  | { type: "DONE" };

export type Message = {
  role: "assistant" | "user" | "system";
  content: string;
}