import { useState, useCallback, useEffect, useRef } from "react";
import { PlayerId } from "@/game/types";
import { ChatMessage, ChatPhraseId } from "@/game/phrases";

const DEFAULT_MESSAGE_DURATION_MS = 4500;
const MIN_MESSAGE_GAP_MS = 1000;

type QueuedChatMessage = ChatMessage & { durationMs: number };

export function usePlayerChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const nextVisibleAtRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const pendingRef = useRef<QueuedChatMessage[]>([]);
  const drainingRef = useRef(false);

  const reset = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    pendingRef.current = [];
    drainingRef.current = false;
    nextVisibleAtRef.current = 0;
    setMessages([]);
  }, []);

  useEffect(() => () => {
    reset();
  }, [reset]);

  const drainQueue = useCallback(() => {
    if (drainingRef.current) return;

    const drainNext = () => {
      pendingRef.current.sort((a, b) => a.timestamp - b.timestamp);
      const msg = pendingRef.current.shift();
      if (!msg) {
        drainingRef.current = false;
        return;
      }

      drainingRef.current = true;
      const now = Date.now();
      const showAt = Math.max(now, nextVisibleAtRef.current);
      nextVisibleAtRef.current = showAt + MIN_MESSAGE_GAP_MS;
      const showTimer = window.setTimeout(() => {
        setMessages(prev => [...prev.filter(m => m.player !== msg.player), msg].sort((a, b) => a.timestamp - b.timestamp));
        const hideTimer = window.setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== msg.id));
        }, msg.durationMs) as unknown as number;
        timersRef.current.push(hideTimer);
        drainingRef.current = false;
        drainNext();
      }, showAt - now) as unknown as number;
      timersRef.current.push(showTimer);
    };

    drainNext();
  }, []);

  const say = useCallback((
    player: PlayerId,
    phraseId: ChatPhraseId,
    durationMs: number = DEFAULT_MESSAGE_DURATION_MS,
    vars?: Record<string, string | number>,
  ) => {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      player,
      phraseId,
      timestamp: Date.now(),
      vars,
    };
    pendingRef.current.push({ ...msg, durationMs });
    drainQueue();
  }, [drainQueue]);

  return { messages, say, reset };
}