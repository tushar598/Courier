import { login } from '../actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  invalid: 'That token does not match COURIER_CONSOLE_TOKEN.',
  unconfigured: 'Live mode needs a console token. Set COURIER_CONSOLE_TOKEN in .env and restart.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-rule bg-surface p-7">
      <h1 className="text-[20px] font-semibold tracking-tight">Sign in to approve purchases</h1>
      <p className="mt-2 text-sm text-muted">
        Approving orders and opening the vault happen only here. Your assistant has no way in.
      </p>
      {error && ERRORS[error] && (
        <p className="mt-4 rounded-lg bg-bad-tint px-3 py-2 text-sm text-bad">{ERRORS[error]}</p>
      )}
      <form action={login} className="mt-5 space-y-3">
        <label className="block text-sm font-medium" htmlFor="token">
          Console token
        </label>
        <input
          id="token"
          name="token"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
        />
        <button className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-on-ink hover:opacity-90">
          Sign in
        </button>
      </form>
    </div>
  );
}
