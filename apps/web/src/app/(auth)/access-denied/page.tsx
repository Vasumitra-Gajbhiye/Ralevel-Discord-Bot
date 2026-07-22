import { SignOutButton } from "@clerk/nextjs";

export default function AccessDeniedPage() {
  return (
    <div className="access-denied-card">
      <h1>Access restricted</h1>
      <p>
        Your account is signed in, but this email is not on the dashboard
        allowlist. Contact an administrator if you need access.
      </p>
      <SignOutButton>
        <button type="button" className="btn btn-primary">
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}
