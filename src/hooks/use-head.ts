import { useEffect } from "react";

export type HeadMeta =
  { title: string } | { name: string; content: string } | { property: string; content: string };

// Client-side replacement for TanStack Router's per-route `head()`:
// sets document.title and upserts <meta> tags while the page is mounted,
// restoring the previous values (the defaults in index.html) on unmount.
export function useHead(meta: HeadMeta[]) {
  const key = JSON.stringify(meta);

  useEffect(() => {
    const restore: Array<() => void> = [];

    for (const m of meta) {
      if ("title" in m) {
        const prev = document.title;
        document.title = m.title;
        restore.push(() => (document.title = prev));
        continue;
      }

      const [attr, value] = "name" in m ? ["name", m.name] : ["property", m.property];
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${value}"]`);
      if (el) {
        const prev = el.content;
        const node = el;
        node.content = m.content;
        restore.push(() => (node.content = prev));
      } else {
        el = document.createElement("meta");
        el.setAttribute(attr, value);
        el.content = m.content;
        document.head.appendChild(el);
        const node = el;
        restore.push(() => node.remove());
      }
    }

    return () => restore.reverse().forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
