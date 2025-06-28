import { createInterface } from "node:readline";
import type { PassThrough } from "node:stream";
import type { OAuth2Client } from "google-auth-library";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ModelName } from "./consts.js";
import { GEMINI_INTERNAL_ENDPOINT } from "./consts.js";
import type {
	CaGenerateContentRequest,
	CaGenerateContentResponse,
} from "./gemini_cli/convert.js";
import { generateOaiChunk, generateOaiResponse } from "./transport_convert.js";

// heavily based on https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/server.ts

export async function handleNonStreamingRequest(
	c: Context,
	auth: OAuth2Client,
	model: ModelName,
	body: CaGenerateContentRequest,
): Promise<Response> {
	const geminiResponse = (
		await auth.request<CaGenerateContentResponse>({
			url: `${GEMINI_INTERNAL_ENDPOINT}:generateContent`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			responseType: "json",
			body: JSON.stringify(body),
		})
	).data as CaGenerateContentResponse;

	const oaiResponse = generateOaiResponse(model, geminiResponse);
	return c.json(oaiResponse);
}

export async function handleStreamingRequest(
	c: Context,
	auth: OAuth2Client,
	model: ModelName,
	body: CaGenerateContentRequest,
): Promise<Response> {
	const geminiResponseStream = await auth.request<CaGenerateContentResponse>({
		url: `${GEMINI_INTERNAL_ENDPOINT}:streamGenerateContent`,
		method: "POST",
		params: {
			alt: "sse",
		},
		headers: {
			"Content-Type": "application/json",
		},
		responseType: "stream",
		body: JSON.stringify(body),
	});

	return streamSSE(c, async (stream) => {
		const rl = createInterface({
			input: geminiResponseStream.data as unknown as PassThrough,
			crlfDelay: Number.POSITIVE_INFINITY, // Recognizes '\r\n' and '\n' as line breaks
		});

		let bufferedLines: string[] = [];
		for await (const line of rl) {
			// blank lines are used to separate JSON objects in the stream
			if (line === "") {
				if (bufferedLines.length === 0) {
					continue; // no data to yield
				}
				const geminiChunk = JSON.parse(
					bufferedLines.join("\n"),
				) as CaGenerateContentResponse;
				bufferedLines = []; // Reset the buffer
				await stream.writeSSE({
					data: JSON.stringify(generateOaiChunk(model, geminiChunk)),
				});
			} else if (line.startsWith("data: ")) {
				// N.B.: trim removed, check if something is wrong
				bufferedLines.push(line.slice(6));
			} else {
				throw new Error(`Unexpected line format in response: ${line}`);
			}
		}
	});
}

export async function getProjectId(auth: OAuth2Client): Promise<string> {
	const loadResult = (
		await auth.request<{ cloudaicompanionProject?: string | null }>({
			url: `${GEMINI_INTERNAL_ENDPOINT}:loadCodeAssist`,
			method: "POST",
		})
	).data;

	if (loadResult.cloudaicompanionProject == null) {
		throw new Error("Failed to load Cloud AI Companion project.");
	}

	return loadResult.cloudaicompanionProject;
}
