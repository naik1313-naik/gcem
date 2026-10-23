"use client";

import { ArrowRight, LogIn } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction } from "@/app/login/actions";
import type { ActionState } from "@/lib/types";

const initial: ActionState = { ok: false, message: "" };

export interface DemoAccountView {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  department: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary" style={{ width: "100%" }}>
      <LogIn className="h-4 w-4" />
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({
  demoMode = false,
  demoAccounts = [],
}: {
  demoMode?: boolean;
  demoAccounts?: DemoAccountView[];
}) {
  const [state, formAction] = useActionState(loginAction, initial);

  return (
    <div>
      {demoMode ? (
        <>
          <div className="demo-list">
            {demoAccounts.map((account) => (
              <form key={account.id} action="/demo-login" method="get">
                <input type="hidden" name="email" value={account.email} />
                <button type="submit" className="demo-account">
                  <span className="demo-account-main">
                    <span className="demo-account-name">
                      {account.name}
                      <span className="chip chip-minor">{account.role}</span>
                    </span>
                    <span className="demo-account-meta">
                      {account.department} · {account.email}
                    </span>
                    <span className="demo-account-meta">
                      Password: <b>{account.password}</b>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 9 }}>
            Click a demo account to enter instantly, or use the manual form below.
          </p>
          <div className="drawer-section">
            <h4>Manual sign-in</h4>
          </div>
        </>
      ) : (
        <p className="small muted">
          Use a Supabase Auth user created for your team. Public sign-up should remain disabled.
        </p>
      )}

      <form action={formAction} className="login-form">
        <div className="field">
          <label htmlFor="email">Operator email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="operator@example.com"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </div>

        {state.message ? (
          <p className="form-message error" role="alert">
            {state.message}
          </p>
        ) : null}

        <SubmitButton />
      </form>
    </div>
  );
}
