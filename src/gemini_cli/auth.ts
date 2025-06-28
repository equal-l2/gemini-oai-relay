// Adopted from https://github.com/google-gemini/gemini-cli/blob/c55b15f705d083e3dadcfb71494dcb0d6043e6c6/packages/core/src/code_assist/oauth2.ts
// with some change.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { OAuth2Client } from "google-auth-library";

//  OAuth Client ID used to initiate OAuth2Client class.
const OAUTH_CLIENT_ID =
	"681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";

// OAuth Secret value used to initiate OAuth2Client class.
// Note: It's ok to save this in git because this is an installed application
// as described here: https://developers.google.com/identity/protocols/oauth2#installed
// "The process results in a client ID and, in some cases, a client secret,
// which you embed in the source code of your application. (In this context,
// the client secret is obviously not treated as a secret.)"
const OAUTH_CLIENT_SECRET = "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";

const GEMINI_DIR = ".gemini";
const CREDENTIAL_FILENAME = "oauth_creds.json";

function getCachedCredentialPath(): string {
	return path.join(os.homedir(), GEMINI_DIR, CREDENTIAL_FILENAME);
}

export async function getOauthClient(): Promise<OAuth2Client> {
	const client = new OAuth2Client({
		clientId: OAUTH_CLIENT_ID,
		clientSecret: OAUTH_CLIENT_SECRET,
	});

	const cacheIsValid = await loadCachedCredentials(client);

	if (cacheIsValid) {
		// Found valid cached credentials.
		return client;
	}

	throw new Error("Cached credentials are invalid");
}

async function loadCachedCredentials(client: OAuth2Client): Promise<boolean> {
	try {
		const keyFile = getCachedCredentialPath();

		const creds = await fs.readFile(keyFile, "utf-8");
		client.setCredentials(JSON.parse(creds));

		// This will verify locally that the credentials look good.
		const { token } = await client.getAccessToken();
		if (!token) {
			return false;
		}

		// This will check with the server to see if it hasn't been revoked.
		await client.getTokenInfo(token);

		return true;
	} catch (_) {
		return false;
	}
}
