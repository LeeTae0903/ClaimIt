import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Shell, ShellAction } from "@/components/Shell";

const STEPS = [
  {
    n: "01",
    title: "Escrow the amount",
    body: "You pick an amount and authorise the transfer once. The USDC moves into escrow before the link exists, so a link is never a promise — it's funded from the moment it's created.",
  },
  {
    n: "02",
    title: "Send the link",
    body: "Share it like any message. Add a password or an expiry if the money shouldn't be claimable by whoever happens to see the screen.",
  },
  {
    n: "03",
    title: "They claim it",
    body: "The first person to open it and claim receives the exact amount you set. No wallet needed beforehand — one gets created inline if they don't have one.",
  },
];

const FACTS = [
  {
    title: "They receive exactly what you sent",
    body: "Gas is absorbed as an operating cost, never deducted. The number you type is the number that lands.",
  },
  {
    title: "First to open, first to claim",
    body: "One link, one claim, enforced at the database level. A race between two people fails safely instead of paying twice.",
  },
  {
    title: "No wallet required to receive",
    body: "Recipients without a wallet get a non-custodial one created during the claim, secured by their own PIN.",
  },
  {
    title: "Password and expiry, optional",
    body: "Lock a link behind a password, or let it expire on its own. Unclaimed funds stay in escrow, never stranded.",
  },
];

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <Shell
      width="wide"
      account={!!session}
      action={
        session ? (
          <ShellAction href="/dashboard" label="Activity" />
        ) : (
          <ShellAction href="/sign-in" label="Sign in" />
        )
      }
    >
      <section className="grid items-center gap-14 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        <div>
          <span className="eyebrow">USDC · Arc Testnet</span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl">
            Send USDC as a link.
            <br />
            <span className="bg-gradient-to-r from-accent to-[#8fc4f7] bg-clip-text text-transparent">
              Whoever opens it, claims it.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted">
            Escrow an exact amount behind a link and send it like a message.
            The first person to open it receives the full amount — from a
            wallet they&apos;ve never seen, without needing one of their own.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/links/new" className="btn btn-primary sm:w-auto sm:px-7">
              Create a claim link
            </Link>
            <Link
              href={session ? "/dashboard" : "/sign-in"}
              className="btn btn-ghost sm:w-auto sm:px-7"
            >
              {session ? "View activity" : "Sign in"}
            </Link>
          </div>
        </div>

        <ClaimPreview />
      </section>

      <section className="border-t border-line py-14">
        <span className="eyebrow">How it works</span>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-surface p-6">
              <span className="numeric text-sm text-accent">{s.n}</span>
              <h3 className="mt-3 font-medium tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-14">
        <span className="eyebrow">What makes it different</span>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {FACTS.map((f) => (
            <div key={f.title} className="card p-6">
              <h3 className="font-medium tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line py-14 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          Ready to send some USDC?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          It takes one authorisation. The link is claimable the moment the
          deposit confirms.
        </p>
        <Link
          href="/links/new"
          className="btn btn-primary mx-auto mt-7 sm:w-auto sm:px-8"
        >
          Create a claim link
        </Link>
      </section>
    </Shell>
  );
}

/** Static mock of a funded link — shows the product without needing data. */
function ClaimPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent/10 blur-3xl" />
      <div className="card overflow-hidden shadow-[0_24px_70px_-30px_#000]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="eyebrow">claimIT / claim</span>
          <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-wider text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            claimable
          </span>
        </div>

        <div className="px-5 py-10 text-center">
          <p className="text-sm text-muted">You&apos;ve been sent</p>
          <p className="numeric mt-2 text-5xl font-semibold text-ink">
            50.00
            <span className="ml-2 text-xl font-normal text-muted">USDC</span>
          </p>
          <div className="btn btn-primary mt-8 cursor-default">
            Claim 50.00 USDC
          </div>
          <p className="mt-4 text-xs text-faint">
            Arriving on Arc Testnet · finality under a second
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
          {[
            ["Escrowed", "yes"],
            ["Claims left", "1"],
            ["Fee to you", "0.00"],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-3 py-3.5 text-center">
              <p className="eyebrow">{k}</p>
              <p className="numeric mt-1 text-sm text-ink">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
