import { ChatAnthropic } from "@langchain/anthropic";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { pipeline } from "@xenova/transformers";
import { BaseMessage } from "@langchain/core/messages";
import "@langchain/community";
import "langchain";

const depsSmokeCheck = {
  ChatAnthropic,
  HuggingFaceTransformersEmbeddings,
  RecursiveCharacterTextSplitter,
  pipeline,
  BaseMessage
};

void depsSmokeCheck;
