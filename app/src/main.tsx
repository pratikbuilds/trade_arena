import { StrictMode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element #root was not found.");
}

const root = createRoot(container);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
