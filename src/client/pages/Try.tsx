import { useEffect } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useAuth } from "../lib/auth";
import { useRouter } from "../lib/router";
import { Editor } from "./Editor";
import { Templates } from "./Templates";
import { GUEST_PREFIX } from "../lib/guest";
import { TEMPLATES } from "../../shared/templates";

/**
 * /try and /try/<template>: the real editor, no account. The draft lives in this browser until
 * Send, which asks for an email; the magic link then turns the draft into a real proposal.
 */
export function Try({ template }: { template: string | null }) {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const known = template && TEMPLATES.some((t) => t.id === template) ? template : null;
  // Signed in already: the same template, for real.
  useEffect(() => {
    if (!user) return;
    navigate(known ? `/app/templates?use=${known}` : "/app/templates", { replace: true });
  }, [user, known, navigate]);
  useEffect(() => {
    if (template && !known) navigate("/try", { replace: true });
  }, [template, known, navigate]);
  if (user) return null;
  if (!known) return <Templates guest />;
  return (
    <>
      <Editor key={known} id={GUEST_PREFIX + known} />
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 sm:bottom-5" data-test="guest-banner">
        <p className="pointer-events-auto max-w-[640px] rounded-full bg-stone-900 px-4 py-2.5 text-center text-[13px] leading-snug text-white shadow-[0_12px_32px_-12px_rgba(25,24,22,.5)] dark:bg-white dark:text-stone-900">
          You are trying the editor. Everything you change stays in this browser until you press <PaperPlaneTilt size={13} weight="bold" className="mx-0.5 inline align-[-2px]" /> Send, which asks for your email. No card, no password.
        </p>
      </div>
    </>
  );
}
