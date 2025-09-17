import { memo, useState } from "react";
import { DraggableWindow } from "./DraggableWindow";
import type { WindowId } from "../store/windows";
import { useWindows } from "../store/windows";
import { AppView } from "./AppView";
import { nip19, getPublicKey, SimplePool, type Event } from "nostr-tools";

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
];

export const ProfileWindow = memo(function ProfileWindow() {
  const { windows } = useWindows();
  const [nsec, setNsec] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ name?: string; about?: string; picture?: string } | null>(null);

  async function loadProfile() {
    setError(null);
    setLoading(true);
    setProfile(null);
    try {
      const decoded = nip19.decode(nsec.trim());
      if (decoded.type !== "nsec") throw new Error("Please paste a valid nsec");
      const sk = decoded.data as string;
      const pk = getPublicKey(sk);

      const pool = new SimplePool();
      const events: Event[] = await pool.querySync(RELAYS, { kinds: [0], authors: [pk], limit: 1 });
      pool.close(RELAYS);
      if (events.length === 0) {
        setError("No profile found on relays");
      } else {
        try {
          const content = JSON.parse(events[0].content);
          setProfile({ name: content.name, about: content.about, picture: content.picture });
        } catch {
          setError("Invalid profile content");
        }
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <DraggableWindow id={"profile" as WindowId} title={windows.profile.title}>
      <AppView id="profile" />
    </DraggableWindow>
  );
});
