import type { DemoDepartment, DemoRole } from "@/lib/demo-types";

export const DEMO_COOKIE = "windsage_demo_session";
export const DEMO_SESSION_HOURS = 8;

export interface DemoSession {
  sub: string;
  email: string;
  name: string;
  role: DemoRole;
  department: DemoDepartment;
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// Simple demo mode session encoding without crypto (for performance)
export function signDemoSession(session: DemoSession): string {
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(session)));
  // No HMAC signing in demo mode - just use a simple delimiter
  return `${payload}.demo`;
}

export function verifyDemoSession(token: string): DemoSession | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, suffix] = parts;
  if (suffix !== "demo") return null; // Simple demo mode marker

  try {
    const parsed = JSON.parse(decoder.decode(base64UrlDecode(payload))) as DemoSession;
    if (
      !parsed.email ||
      !parsed.role ||
      !parsed.department ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
