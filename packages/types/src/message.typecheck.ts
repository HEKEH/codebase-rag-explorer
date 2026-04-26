import type { Message } from "./models";

const validMessage: Message = {
  id: "msg-1",
  timestamp: Date.now(),
  role: "user",
  content: "hello"
};

void validMessage;
