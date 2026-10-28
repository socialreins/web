// Server only: brain's public URL, read at request time so one image serves any domain.
export const brainUrl = () => (process.env.BRAIN_URL || "http://localhost:8080").replace(/\/+$/, "");
