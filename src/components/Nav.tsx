import NavLinks from "@/components/NavLinks";
import SettingsMenu from "@/components/SettingsMenu";
import { getSession } from "@/lib/session";
import { getMyUserId } from "@/lib/my-user-id";

export default async function Nav() {
  const session = await getSession();
  if (!session) return null;

  const userId = await getMyUserId(session.uid);

  return (
    <nav className="relative z-40 border-b border-[#ffffff14] bg-[#0c0c0eb3] backdrop-blur-[20px]">
      <div className="mx-auto flex w-full items-center justify-between px-[clamp(1rem,3vw,4rem)] py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-[#fafafa]">
            Snap<span className="text-[#10b981]">Back</span>
          </span>
          <NavLinks />
        </div>
        <SettingsMenu email={session.email} userId={userId} />
      </div>
    </nav>
  );
}
