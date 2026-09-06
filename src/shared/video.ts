/** A YouTube, Vimeo or Loom link becomes a privacy-friendly embed; anything else is refused. */
export function videoEmbed(url: string): { src: string; host: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : null);
    return id && /^[\w-]{6,}$/.test(id) ? { src: `https://www.youtube-nocookie.com/embed/${id}`, host: "youtube" } : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{6,}$/.test(id) ? { src: `https://www.youtube-nocookie.com/embed/${id}`, host: "youtube" } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return /^\d{6,}$/.test(id) ? { src: `https://player.vimeo.com/video/${id}`, host: "vimeo" } : null;
  }
  if (host === "loom.com") {
    const id = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return /^[a-f0-9]{20,}$/i.test(id) ? { src: `https://www.loom.com/embed/${id}`, host: "loom" } : null;
  }
  return null;
}
