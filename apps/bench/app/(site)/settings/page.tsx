import type { Metadata } from "next";

import { MembersOnly } from "@/components/app/gate";
import { SettingsView } from "@/components/app/settings/settings-view";
import { getViewer } from "@/lib/app/auth/viewer";

export const metadata: Metadata = { title: "Settings" };

async function SettingsPage() {
  const viewer = await getViewer();
  return (
    <MembersOnly
      standfirst="Spending, people and this device"
      title="Settings"
      viewer={viewer}
    >
      {(member) => (
        <SettingsView
          me={{
            email: member.email,
            id: member.id,
            name: member.name,
            owner: member.role === "owner",
          }}
        />
      )}
    </MembersOnly>
  );
}

export default SettingsPage;
