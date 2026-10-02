import Link from "next/link";
import { connection } from "next/server";
import { EVENTS, eventStatus } from "@/lib/events";
import { requireUser } from "@/lib/auth";
import { EventHero } from "@/components/event/event-client";

export const metadata = { title: "Eventos · Learn AWS" };

export default async function EventsPage() {
  await connection();
  await requireUser();
  const order = { live: 0, upcoming: 1, ended: 2 } as const;
  const events = [...EVENTS].sort((a, b) => order[eventStatus(a)] - order[eventStatus(b)]);
  return (
    <div className="space-y-4">
      <h1 className="display text-4xl text-white [text-shadow:0_3px_0_var(--ink)]">Eventos</h1>
      {events.map((e) => (
        <Link key={e.slug} href={`/events/${e.slug}`} className="press block">
          <EventHero event={e} status={eventStatus(e)} />
        </Link>
      ))}
    </div>
  );
}
