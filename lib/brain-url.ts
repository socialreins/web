// Server only: brain's public URL, read at request time so one image serves any domain.
// An unset or malformed BRAIN_URL fails loudly in production instead of quietly pointing at localhost.
export const brainUrl = () => {
  const raw = process.env.BRAIN_URL;
  if (!raw && process.env.NODE_ENV === "production") throw new Error("BRAIN_URL is not set");
  const url = new URL(raw || "http://localhost:8080");
  return url.origin + url.pathname.replace(/\/+$/, "");
};
