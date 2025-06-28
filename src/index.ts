import { serve } from "@hono/node-server";
import { GaxiosError } from "gaxios";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";
import { AVAILABLE_MODELS, type ModelName } from "./consts.js";
import { getOauthClient } from "./gemini_cli/auth.js";
import {
	getProjectId,
	handleNonStreamingRequest,
	handleStreamingRequest,
} from "./handlers.js";
import { generateGeminiRequest } from "./transport_convert.js";

const PROJECT_ID = await (async () => {
	const auth = await getOauthClient();
	return await getProjectId(auth);
})();

const app = new Hono();
const logWithTimestamp = (message: string, ...rest: string[]) => {
	console.log(`[${new Date().toISOString()}] ${message}`, ...rest);
};
app.use(logger(logWithTimestamp));

app.post("/v1/chat/completions", async (c) => {
	try {
		const requestBody = (await c.req.json()) as ChatCompletionCreateParamsBase;

		const requestedModel = requestBody.model;
		if (!AVAILABLE_MODELS.includes(requestedModel)) {
			return c.json(
				{ error: `Model ${requestedModel} is not supported.` },
				400,
			);
		}
		const model = requestedModel as ModelName;
		console.log("Model in use:", model);

		const geminiRequest = generateGeminiRequest(model, PROJECT_ID, requestBody);
		const auth = await getOauthClient();

		if (requestBody.stream === true) {
			return handleStreamingRequest(c, auth, model, geminiRequest);
		}

		requestBody.stream = undefined; // Ensure streaming is turned off
		return handleNonStreamingRequest(c, auth, model, geminiRequest);
	} catch (e) {
		if (e instanceof GaxiosError && e.status === 429) {
			const message = e.response?.data || "Rate limit exceeded";
			console.error("Rate limit error:", message);
			return c.json({ error: message }, 429);
		}

		console.error("Error:", e);
		return c.json(
			{ error: "An error occurred while processing the request." },
			500,
		);
	}
});
app.get("/v1/models", (c) => {
	return c.json({
		object: "list",
		data: AVAILABLE_MODELS.map((id) => ({
			id,
			object: "model",
		})),
	});
});

serve(
	{
		fetch: app.fetch,
		port: 6666,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);
