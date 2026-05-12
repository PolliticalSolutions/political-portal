import { useLocation } from "react-router-dom";
import Seo from "./Seo.jsx";
import { getSeoForPath } from "./seoRoutes.js";

const formatTitle = (title) => `${title} | Political Solutions`;

export default function RouteSeo() {
  const { pathname } = useLocation();
  const routeSeo = getSeoForPath(pathname);

  return (
    <Seo
      title={formatTitle(routeSeo.title)}
      description={routeSeo.description}
      path={routeSeo.path}
      canonical={routeSeo.canonical}
      noindex={routeSeo.noindex}
      robots={routeSeo.noindex ? undefined : "index,follow"}
    />
  );
}
