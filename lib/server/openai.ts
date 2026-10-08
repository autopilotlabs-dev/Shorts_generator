import OpenAI from "openai";

let client: OpenAI | null = null;
export const openaiConfigured = () => Boolean(process.env.OPENAI_API_KEY);
export function openai(): OpenAI {
  client ??= new OpenAI(); // reads OPENAI_API_KEY
  return client;
}
