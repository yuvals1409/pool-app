import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

function base64url(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.toString("base64url");
}

export function loadServiceAccountFromEnv() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  return JSON.parse(json);
}

export async function getGoogleAccessToken(serviceAccount) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claim = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signInput = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256")
    .update(signInput)
    .sign(serviceAccount.private_key);
  const jwt = `${signInput}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(json.error || "google_auth_failed");
  return json.access_token;
}

export async function readSheetTab(token, spreadsheetId, tab, rangeEnd = "AZ") {
  const range = encodeURIComponent(`${tab}!A:${rangeEnd}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`sheet_read_failed:${tab}:${res.status}`);
  const json = await res.json();
  return (json.values || []);
}

export async function clearSheetTab(token, spreadsheetId, tab) {
  const range = encodeURIComponent(`${tab}!A:ZZ`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`sheet_clear_failed:${tab}:${res.status}`);
}

export async function writeSheetTab(token, spreadsheetId, tab, rows, startCell = "A1") {
  const range = encodeURIComponent(`${tab}!${startCell}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`sheet_write_failed:${tab}:${res.status}`);
}

export async function batchUpdateSpreadsheet(token, spreadsheetId, requests) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`batch_update_failed:${res.status}:${text}`);
  }
  return res.json();
}

export async function createSpreadsheet(token, title) {
  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title, locale: "he_IL" },
      sheets: [{ properties: { title: "מאסטר_סנכרון" } }],
    }),
  });
  if (!res.ok) throw new Error(`create_spreadsheet_failed:${res.status}`);
  return res.json();
}

export async function addSheetTab(token, spreadsheetId, title) {
  return batchUpdateSpreadsheet(token, spreadsheetId, [{
    addSheet: { properties: { title } },
  }]);
}

export function loadServiceAccountFromFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function getSpreadsheetMetadata(token, spreadsheetId, fields = "sheets(properties(sheetId,title))") {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=${encodeURIComponent(fields)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`spreadsheet_meta_failed:${res.status}`);
  return res.json();
}

export function sheetIdByTitle(meta, title) {
  const sheet = (meta.sheets || []).find((s) => s.properties?.title === title);
  return sheet?.properties?.sheetId ?? null;
}
