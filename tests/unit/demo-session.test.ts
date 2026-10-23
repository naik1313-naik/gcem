import { beforeAll, describe, expect, it } from "vitest";

import {
  DEMO_COOKIE,
  DEMO_SESSION_HOURS,
  signDemoSession,
  verifyDemoSession,
} from "@/lib/demo-session";

const session = {
  sub: "demo-admin",
  email: "admin@windsage.demo",
  name: "Demo Admin",
  role: "Admin" as const,
  department: "Operations" as const,
  exp: Math.floor(Date.now() / 1000) + DEMO_SESSION_HOURS * 60 * 60,
};

beforeAll(() => {
  process.env.DEMO_SESSION_SECRET = "unit-test-demo-secret";
});

describe("demo session cookie", () => {
  it("signs and verifies a demo session", async () => {
    const token = await signDemoSession(session);
    expect(token).toContain(".");
    expect(DEMO_COOKIE).toBe("windsage_demo_session");
    expect(verifyDemoSession(token)).toMatchObject({
      email: "admin@windsage.demo",
      role: "Admin",
    });
  });

  it("rejects a tampered payload or signature", async () => {
    const token = await signDemoSession(session);
    const [payload, signature] = token.split(".");
    expect(verifyDemoSession(`${payload}x.${signature}`)).toBeNull();
    expect(verifyDemoSession(`${payload}.${signature}x`)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const token = await signDemoSession({ ...session, exp: Math.floor(Date.now() / 1000) - 1 });
    expect(verifyDemoSession(token)).toBeNull();
  });
});
