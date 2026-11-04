import { login } from '../actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  invalid: 'That token is not right.',
  unconfigured: 'Set COURIER_CONSOLE_TOKEN in .env to use the console in live mode.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Operator sign-in</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Approving purchases and reading the vault is for the human only. The assistant has no route
        here.
      </p>
      {error && ERRORS[error] && <p className="mt-3 text-sm text-rose-700">{ERRORS[error]}</p>}
      <form action={login} className="mt-4 space-y-3">
        <input
          name="token"
          type="password"
          required
          placeholder="Console token"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
          Sign in
        </button>
      </form>
    </div>
  );
}
