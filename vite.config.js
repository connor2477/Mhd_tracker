import { defineConfig } from "vite";

export default defineConfig({
  preview: {
    host: true,
    port: 4175,
    allowedHosts: [
      "ngrok-free.app",
      "896ecd14e35b.ngrok-free.app", // deine exakte ngrok-Subdomain
      ".ngrok-free.app"             // alle ngrok-Subdomains erlauben
    ]
  }
});
