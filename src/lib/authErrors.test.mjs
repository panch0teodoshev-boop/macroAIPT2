import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorBg } from "./authErrors.mjs";
test("преводи на грешки от Supabase Auth", () => {
  assert.match(authErrorBg("email rate limit exceeded"), /лимитът за изпращане на имейли/);
  assert.equal(authErrorBg("Invalid login credentials"), "Грешен имейл или парола.");
  assert.equal(authErrorBg("For security purposes, you can only request this after 42 seconds."), "От съображения за сигурност опитай отново след 42 секунди.");
  assert.equal(authErrorBg("Password should be at least 8 characters."), "Паролата трябва да е поне 8 символа.");
  assert.equal(authErrorBg("New password should be different from the old password."), "Новата парола трябва да е различна от старата.");
  assert.equal(authErrorBg("Auth session missing!"), "Линкът или сесията са изтекли. Поискай нов линк.");
  assert.equal(authErrorBg("Нещо непознато"), "Нещо непознато", "непознатото се показва както е");
});
