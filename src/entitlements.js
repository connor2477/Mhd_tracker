const KEY = "mhd_entitlements";
export const FREE_LIMIT = 25;

export function isPro() {
  try { return !!JSON.parse(localStorage.getItem(KEY) || "{}").token; }
  catch { return false; }
}

export function setProToken(token) {
  try {
    const cur = JSON.parse(localStorage.getItem(KEY) || "{}");
    localStorage.setItem(KEY, JSON.stringify({ ...cur, token, plan: "pro", limit: 100000 }));
  } catch {
    localStorage.setItem(KEY, JSON.stringify({ token, plan: "pro", limit: 100000 }));
  }
}
