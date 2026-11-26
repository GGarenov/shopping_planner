import { useTranslations } from "next-intl";
import type { AccountStatus } from "@/lib/auth/guest";
import { SocialButtons } from "./SocialButtons";

/**
 * "Save your plan — continue with Google" for guests (taylor_the_app/loginless.md, part 3). Also shows the result
 * once (?account=saved|failed) — to everyone, since after saving the user is no longer a guest.
 */
export function SaveAccount({
  guest,
  next,
  variant,
  status,
}: {
  guest: boolean;
  /** Where to come back to after signing in. */
  next: string;
  variant: "plan" | "ebag";
  status: AccountStatus | null;
}) {
  const t = useTranslations("account");
  return (
    <>
      {status === "saved" && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
          {t("saved")}
        </p>
      )}
      {guest && (
        <section className="card flex flex-col gap-3" aria-labelledby="save-account-title">
          <h2 id="save-account-title" className="text-lg font-semibold">
            {t(`${variant}.title`)}
          </h2>
          <p className="text-sm text-subtle">{t(`${variant}.text`)}</p>
          <SocialButtons mode="link" next={next} failed={status === "failed"} />
        </section>
      )}
    </>
  );
}
