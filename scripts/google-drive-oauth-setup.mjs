#!/usr/bin/env node
/**
 * One-time local helper to obtain a Google Drive OAuth refresh token for PKL.
 *
 * Prerequisites:
 * 1. Google Cloud project with Drive API enabled
 * 2. OAuth Desktop client credentials (Client ID + Secret)
 * 3. Authorized redirect URI: http://localhost:53682/oauth2callback
 *
 * Usage:
 *   GOOGLE_DRIVE_CLIENT_ID=... GOOGLE_DRIVE_CLIENT_SECRET=... node scripts/google-drive-oauth-setup.mjs
 *
 * Paste the resulting refresh token into local .env as GOOGLE_DRIVE_REFRESH_TOKEN.
 * Never commit tokens. Never expose them to the browser.
 */

import http from "node:http";
import { URL } from "node:url";

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = encodeURIComponent(
  process.env.GOOGLE_DRIVE_SCOPES?.trim() ||
    "https://www.googleapis.com/auth/drive.file",
);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET before running.",
  );
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&response_type=code` +
  `&scope=${SCOPE}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\nOpen this URL in a browser signed in as the PKL Drive account:\n");
console.log(authUrl);
console.log("\nWaiting for OAuth callback on", REDIRECT, "…\n");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    if (err || !code) {
      res.writeHead(400);
      res.end(`OAuth failed: ${err ?? "missing code"}`);
      server.close();
      process.exit(1);
    }

    const body = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok || !json.refresh_token) {
      res.writeHead(500);
      res.end("Token exchange failed — see terminal.");
      console.error("Token exchange failed:", {
        status: tokenRes.status,
        error: json.error,
        description: json.error_description,
      });
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Drive authorization complete. You can close this tab.");

    console.log("\nAdd these to your local .env (never commit):\n");
    console.log(`GOOGLE_DRIVE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_DRIVE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${json.refresh_token}`);
    console.log(
      "\nOptional: GOOGLE_DRIVE_ROOT_FOLDER_ID=<reports root folder id>\n",
    );
    server.close();
    process.exit(0);
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Error");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT);
