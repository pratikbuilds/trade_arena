import { useEffect, useState } from "react";

export type Route =
  | { name: "discovery" }
  | { name: "game"; gamePubkey: string }
  | { name: "landing1" }
  | { name: "landing2" };

export function routeFromPath(pathname: string): Route {
  if (pathname.startsWith("/landing1")) return { name: "landing1" };
  if (pathname.startsWith("/landing2")) return { name: "landing2" };

  const gameMatch = /^\/game\/([^/]+)\/?$/.exec(pathname);
  if (gameMatch?.[1]) {
    return {
      name: "game",
      gamePubkey: decodeURIComponent(gameMatch[1]),
    };
  }

  return { name: "discovery" };
}

export function useRoute(): [Route, (path: string) => void] {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState(null, "", path);
    setPathname(window.location.pathname);
  };

  return [routeFromPath(pathname), navigate];
}
