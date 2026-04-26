import { ChatAnthropic } from "@langchain/anthropic";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { pipeline } from "@xenova/transformers";
import { BaseMessage } from "@langchain/core/messages";
import "@langchain/community";
import "langchain";

const depsSmokeCheck = {
  ChatAnthropic,
  RecursiveCharacterTextSplitter,
  pipeline,
  BaseMessage
};

void depsSmokeCheck;
