import { LoaderCircle, MoveRight } from "lucide-react";
import type { FormEvent } from "react";

import type {
  AccessMode,
  AuthDraft,
  AuthSubmission,
} from "@/app/contracts";
import { LiquidButton } from "@/components/actions/LiquidButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const content: Record<
  AccessMode,
  { title: string; previewTitle: string; preview: string; action: string }
> = {
  guest: {
    title: "Host a table",
    previewTitle: "No account required",
    preview:
      "Create one live GT code, then read it to the players around the physical board.",
    action: "Host table",
  },
  join: {
    title: "Join a table",
    previewTitle: "Find the host’s code",
    preview:
      "Enter the GT code shown on the host screen or printed beside the board QR.",
    action: "Join session",
  },
  login: {
    title: "Log in",
    previewTitle: "Saved host identity",
    preview:
      "Use your verified host account to create another Supabase-backed table.",
    action: "Log in",
  },
  signup: {
    title: "Create account",
    previewTitle: "A reusable host identity",
    preview:
      "Create a verified identity for hosting. Players still join without accounts.",
    action: "Create account",
  },
};

export function AccessForm({
  mode,
  draft,
  pending,
  error,
  onDraftChange,
  onSubmit,
}: {
  mode: AccessMode;
  draft: AuthDraft;
  pending: boolean;
  error: string | null;
  onDraftChange(patch: Partial<AuthDraft>): void;
  onSubmit(input: AuthSubmission): void;
}) {
  const item = content[mode];
  const needsEmail = mode === "login" || mode === "signup";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      mode,
      name: draft.name.trim(),
      code: mode === "join" ? draft.code.trim().toUpperCase() : undefined,
      email: needsEmail ? draft.email.trim() : undefined,
      password: needsEmail ? draft.password : undefined,
    });
  };

  return (
    <form
      className="access-form"
      onSubmit={submit}
      aria-busy={pending}
      aria-label={item.title}
    >
      <p className="access-form__mode">
        <strong>{item.title}</strong>
        <span>{item.previewTitle}</span>
      </p>

      {(mode === "guest" || mode === "join" || mode === "signup") && (
        <div className="field">
          <Label htmlFor={`${mode}-name`}>
            {mode === "guest" ? "Host name" : mode === "join" ? "Player name" : "Name"}
          </Label>
          <Input
            id={`${mode}-name`}
            name="name"
            value={draft.name}
            autoComplete="name"
            required
            disabled={pending}
            onChange={(event) => onDraftChange({ name: event.target.value })}
          />
          <small>Use the name people at the table will recognize.</small>
        </div>
      )}

      {mode === "join" && (
        <div className="field">
          <Label htmlFor="join-code">Session code</Label>
          <Input
            id="join-code"
            className="code-input"
            name="code"
            value={draft.code}
            inputMode="text"
            autoComplete="off"
            pattern="GT-[0-9]{4}"
            maxLength={7}
            required
            disabled={pending}
            aria-describedby="join-code-help"
            onChange={(event) =>
              onDraftChange({ code: event.target.value.toUpperCase() })
            }
          />
          <small id="join-code-help">Format: GT-0000.</small>
        </div>
      )}

      {needsEmail && (
        <>
          <div className="field">
            <Label htmlFor={`${mode}-email`}>Email</Label>
            <Input
              id={`${mode}-email`}
              name="email"
              type="email"
              value={draft.email}
              autoComplete="email"
              required
              disabled={pending}
              onChange={(event) => onDraftChange({ email: event.target.value })}
            />
          </div>
          <div className="field">
            <Label htmlFor={`${mode}-password`}>Password</Label>
            <Input
              id={`${mode}-password`}
              name="password"
              type="password"
              value={draft.password}
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              disabled={pending}
              onChange={(event) => onDraftChange({ password: event.target.value })}
            />
            {mode === "signup" && <small>Use at least six characters.</small>}
          </div>
        </>
      )}

      <p className="entry-preview">{item.preview}</p>

      <p className="backend-note">
        <span aria-hidden="true" />
        Supabase session sync is required for shared tables.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <LiquidButton type="submit" disabled={pending} className="access-submit">
        {pending ? (
          <>
            <LoaderCircle className="spin" aria-hidden="true" /> Working…
          </>
        ) : (
          <>
            {item.action} <MoveRight aria-hidden="true" />
          </>
        )}
      </LiquidButton>
    </form>
  );
}
