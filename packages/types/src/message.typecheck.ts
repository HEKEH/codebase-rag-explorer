import type { Message } from "./models";

const validUserMessage: Message = {
  id: "msg-1",
  timestamp: Date.now(),
  role: "user",
  content: "hello",
};

const validErrorNotice: Message = {
  id: "msg-2",
  timestamp: Date.now(),
  role: "error",
  content: "问答失败",
};

void validUserMessage;
void validErrorNotice;
