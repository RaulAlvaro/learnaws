import { notFound } from "next/navigation";
import { getEvent } from "@/lib/events";
import { EventClient } from "@/components/event/event-client";

export async function generateMetadata({ params }: PageProps<"/events/[slug]">) {
  const e = getEvent((await params).slug);
  return { title: e ? `${e.name} · Learn AWS` : "Evento · Learn AWS" };
}

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  if (!getEvent(slug)) notFound();
  return <EventClient slug={slug} />;
}
