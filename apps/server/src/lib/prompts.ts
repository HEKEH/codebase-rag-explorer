import { ChatPromptTemplate } from "@langchain/core/prompts";

export const ASK_SYSTEM_PROMPT = [
  "你是一个资深代码助手。你的目标是基于给定代码上下文，准确回答用户问题。",
  "请严格遵循以下要求：",
  "1. 只根据提供的上下文回答，不要编造不存在的实现细节。",
  "2. 如果上下文不足，明确说明信息不足并建议用户补充问题。",
  "3. 回答尽量简洁，优先给出结论，再补充必要依据。"
].join("\n");

export const ASK_USER_PROMPT_TEMPLATE = [
  "问题：",
  "{question}",
  "",
  "可用代码上下文：",
  "{context}",
  "",
  "请基于以上上下文作答。"
].join("\n");

export function createAskPrompt(): ChatPromptTemplate<{
  question: string;
  context: string;
}> {
  return ChatPromptTemplate.fromMessages([
    ["system", ASK_SYSTEM_PROMPT],
    ["human", ASK_USER_PROMPT_TEMPLATE]
  ]);
}
