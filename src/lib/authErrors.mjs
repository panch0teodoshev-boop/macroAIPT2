// Превод на най-честите грешки от Supabase Auth на български (иначе се показват на английски).
const RULES = [
  [/invalid login credentials/i, "Грешен имейл или парола."],
  [/email rate limit exceeded|over_email_send_rate_limit/i, "Достигнат е лимитът за изпращане на имейли. Опитай отново по-късно."],
  [/for security purposes, you can only request this after (\d+) seconds?/i, (m) => `От съображения за сигурност опитай отново след ${m[1]} секунди.`],
  [/rate limit|too many requests/i, "Твърде много опити. Изчакай малко и опитай отново."],
  [/new password should be different from the old password/i, "Новата парола трябва да е различна от старата."],
  [/password should be at least (\d+) characters/i, (m) => `Паролата трябва да е поне ${m[1]} символа.`],
  [/password is known to be weak|weak password/i, "Паролата е твърде лесна. Избери по-сложна."],
  [/email not confirmed/i, "Имейлът не е потвърден."],
  [/unable to validate email address|invalid format/i, "Невалиден имейл адрес."],
  [/auth session missing|jwt expired|session.*expired|token has expired|invalid.*token/i, "Линкът или сесията са изтекли. Поискай нов линк."],
  [/user not found/i, "Няма акаунт с този имейл."],
  [/failed to fetch|network/i, "Няма връзка със сървъра. Провери интернет връзката."],
];
export function authErrorBg(message) {
  const s = String(message || "");
  for (const [re, out] of RULES) { const m = s.match(re); if (m) return typeof out === "function" ? out(m) : out; }
  return s || "Възникна грешка.";
}
