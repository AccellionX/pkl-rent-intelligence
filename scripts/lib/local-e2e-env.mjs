/**
 * Shared helpers for local engineering / browser e2e scripts.
 * Credentials and client source paths come from the environment — never hardcode secrets.
 */
import fs from "node:fs";
import path from "node:path";

export function loadDotEnv(filePath = ".env") {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * Staff test login for local Playwright / Supabase Auth scripts.
 * Required: PKL_E2E_EMAIL, PKL_E2E_PASSWORD (local .env only).
 */
export function requireE2eAdmin() {
  const email = process.env.PKL_E2E_EMAIL?.trim();
  const password = process.env.PKL_E2E_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      "Set PKL_E2E_EMAIL and PKL_E2E_PASSWORD in local .env (never commit these values).",
    );
  }
  return { email, password };
}

/**
 * Root directory for confidential client source packages (PDFs/XLSX/photos).
 * Required when a script needs real client files: PKL_CLIENT_SOURCE_DIR.
 */
export function clientSourceRoot() {
  const root = process.env.PKL_CLIENT_SOURCE_DIR?.trim();
  if (!root) {
    throw new Error(
      "Set PKL_CLIENT_SOURCE_DIR to the local folder that holds client source packages (never commit those files).",
    );
  }
  return root;
}

export function clientSourcePath(...parts) {
  return path.join(clientSourceRoot(), ...parts);
}

export function optionalClientSourcePath(...parts) {
  const root = process.env.PKL_CLIENT_SOURCE_DIR?.trim();
  if (!root) return null;
  return path.join(root, ...parts);
}

export function requireExistingFile(filePath, label = "file") {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}. Expected at: ${filePath || "(unset)"}`);
  }
  return filePath;
}
