import type {
	Blob,
	Content,
	GenerateContentConfig,
	GenerateContentParameters,
	Part,
} from "@google/genai";
import { HarmBlockThreshold, HarmCategory } from "@google/genai";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionContentPart,
	ChatCompletionContentPartText,
	ChatCompletionCreateParamsBase,
} from "openai/resources/chat/completions";
import type { ModelName } from "./consts.js";
import {
	type CaGenerateContentRequest,
	type CaGenerateContentResponse,
	toGenerateContentRequest,
} from "./gemini_cli/convert.js";

const BASE64_SPLIT_REGEX = /[:;,]/;

export function generateGeminiRequest(
	model: ModelName,
	projectId: string,
	oaiReq: ChatCompletionCreateParamsBase,
): CaGenerateContentRequest {
	const developerMessages: (string | ChatCompletionContentPartText[])[] = [];
	const userMessageOrHistory: (string | ChatCompletionContentPart[])[] = [];

	// assistant: string | Array<ChatCompletionContentPartText | ChatCompletionContentPartRefusal> | null
	// user: string | Array<ChatCompletionContentPart>

	for (const msg of oaiReq.messages) {
		if (msg.role === "developer" || msg.role === "system") {
			developerMessages.push(msg.content);
		} else if (msg.role === "user" || msg.role === "assistant") {
			if (msg.content == null || msg.content === "") {
				continue; // Skip messages without content
			}

			if (typeof msg.content === "string") {
				userMessageOrHistory.push(msg.content);
			} else {
				const parts = [];
				for (const part of msg.content) {
					// ignore refusal, as it won't happen
					if (part.type !== "refusal") {
						parts.push(part);
					}
				}
				userMessageOrHistory.push(parts);
			}
		} else {
			throw new Error(
				`Unsupported message role: ${msg.role}. Only 'user' and 'developer' roles are supported.`,
			);
		}
	}

	const systemInstruction = developerMessages
		.map((msg: string | ChatCompletionContentPartText[]): string => {
			if (typeof msg === "string") {
				return msg;
			}
			return msg
				.map((part: ChatCompletionContentPartText) => part.text)
				.join("\n");
		})
		.join("\n")
		.trim();

	const contents: Content[] = userMessageOrHistory.map(
		(msg: string | ChatCompletionContentPart[]) => {
			if (typeof msg === "string") {
				return {
					role: "user",
					parts: [{ text: msg }],
				};
			}
			// convert parts
			const parts: Part[] = msg.map((part: ChatCompletionContentPart): Part => {
				if (part.type === "text") {
					return {
						text: part.text,
					} as Part;
				}
				if (part.type === "image_url") {
					// image_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
					const base64UrlParts = part.image_url.url.split(BASE64_SPLIT_REGEX);
					const mimeType = base64UrlParts[1];
					const data = base64UrlParts[3];

					return {
						inlineData: {
							mimeType,
							data,
						} as Blob,
					};
				}
				throw new Error(
					`Unsupported content part type: ${part.type}. Only 'text' and 'image_url' are supported.`,
				);
			});
			return {
				role: "user",
				parts,
			};
		},
	);

	const config: GenerateContentConfig = {
		// TODO: accept more OpenAI parameters
		systemInstruction:
			systemInstruction.length > 0 ? systemInstruction : undefined,
		safetySettings: [
			{
				category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
				threshold: HarmBlockThreshold.BLOCK_NONE,
			},
			{
				category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
				threshold: HarmBlockThreshold.BLOCK_NONE,
			},
			{
				category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
				threshold: HarmBlockThreshold.BLOCK_NONE,
			},
			{
				category: HarmCategory.HARM_CATEGORY_HARASSMENT,
				threshold: HarmBlockThreshold.BLOCK_NONE,
			},
			{
				category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
				threshold: HarmBlockThreshold.BLOCK_NONE,
			},
		],
	};

	const req: GenerateContentParameters = {
		model,
		contents,
		config,
	};

	return toGenerateContentRequest(req, projectId);
}

export function generateOaiResponse(
	model: ModelName,
	geminiResponse: CaGenerateContentResponse,
): ChatCompletion {
	if (!geminiResponse.response.candidates) {
		// No candidates in the response
		// TODO: send promptFeedback
		throw new Error("Gemini response contains no candidates");
	}

	if (geminiResponse.response.candidates.length !== 1) {
		throw new Error("Expected exactly one candidate in Gemini response");
	}

	const geminiData = geminiResponse.response.candidates[0];

	if (!geminiData.content?.parts || geminiData.content.parts.length === 0) {
		throw new Error("Gemini response contains no content");
	}

	const oaiMessages = geminiData.content.parts
		.map((part: Part): string | undefined => part.text)
		.join()
		.trim();

	const finishReason =
		geminiData.finishReason === "MAX_TOKENS" ? "length" : "stop";
	console.log(`Generation finished: ${finishReason}`);

	const oaiOutput: ChatCompletion.Choice = {
		message: {
			content: oaiMessages,
			role: "assistant",
			refusal: null,
		},
		// biome-ignore lint/style/useNamingConvention: External Library
		finish_reason: finishReason,
		index: 0,
		logprobs: null,
	};

	const oaiResponse: ChatCompletion = {
		id: "",
		model,
		choices: [oaiOutput],
		created: 0,
		object: "chat.completion",
	};

	return oaiResponse;
}

export function generateOaiChunk(
	model: ModelName,
	geminiChunk: CaGenerateContentResponse,
): ChatCompletionChunk {
	if (!geminiChunk.response) {
		throw new Error("Gemini response is empty");
	}

	if (!geminiChunk.response.candidates) {
		// No candidates in the response
		// TODO: send promptFeedback
		throw new Error("Gemini response contains no candidates");
	}

	if (geminiChunk.response.candidates.length !== 1) {
		throw new Error("Expected exactly one candidate in Gemini response");
	}

	const geminiData = geminiChunk.response.candidates[0];

	if (!geminiData.content?.parts || geminiData.content.parts.length === 0) {
		throw new Error("Gemini response contains no content");
	}

	const oaiMessages = geminiData.content.parts
		.map((part: Part): string | undefined => part.text)
		.join()
		.trim();

	let finishReason: "length" | "stop" | null = null;
	if (geminiData.finishReason) {
		finishReason = geminiData.finishReason === "MAX_TOKENS" ? "length" : "stop";
		console.log(`Generation finished: ${finishReason}`);
	}

	const oaiOutput: ChatCompletionChunk.Choice = {
		delta: {
			content: oaiMessages,
			role: "assistant",
			refusal: null,
		},
		// biome-ignore lint/style/useNamingConvention: External Library
		finish_reason: finishReason,
		index: 0,
		logprobs: null,
	};

	const oaiChunk: ChatCompletionChunk = {
		id: "",
		model,
		choices: [oaiOutput],
		created: 0,
		object: "chat.completion.chunk",
	};

	return oaiChunk;
}
