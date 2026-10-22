// Supabase Auth returns English messages; show the common ones in Chinese and
// fall back to the original text for anything unrecognised.
const known: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/invalid login credentials/i, "信箱或密碼錯誤。"],
  [/email not confirmed/i, "信箱尚未認證，請先到信箱點擊認證連結。"],
  [/user already registered|already been registered/i, "這個信箱已經註冊過，請直接登入。"],
  [/password should be at least (\d+)/i, (m) => `密碼至少需要 ${m[1]} 個字元。`],
  [/new password should be different/i, "新密碼不能和舊密碼相同。"],
  [/after (\d+) seconds?/i, (m) => `為了安全，請等 ${m[1]} 秒後再試一次。`],
  [/rate limit/i, "嘗試次數太多，請稍後再試。"],
  [/unable to validate email|invalid email|email address .* is invalid/i, "信箱格式不正確。"],
  [/signups? not allowed/i, "目前暫停開放註冊。"],
  [/oauth state not found|state.*expired/i, "登入逾時，請重新點一次登入按鈕。"],
  [/error getting user profile/i, "無法從登入服務取得帳號資料，請再試一次。"],
  [/access_denied|user denied|cancel/i, "已取消登入。"],
  [/failed to fetch|network/i, "網路連線失敗，請檢查網路後再試。"],
];

export function authErrorText(message: string): string {
  for (const [re, out] of known) {
    const m = message.match(re);
    if (m) return typeof out === "string" ? out : out(m);
  }
  return message;
}
