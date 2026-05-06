import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":  ["react", "react-dom", "react-router-dom"],
          "vendor-ui":     ["@radix-ui/react-label", "@radix-ui/react-slot", "class-variance-authority", "clsx", "tailwind-merge"],
          "vendor-charts": ["recharts"],
          "vendor-pdf":    ["jspdf", "jspdf-autotable"],
          "vendor-icons":  ["lucide-react"],
        },
      },
    },
  },
}));
