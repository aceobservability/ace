import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Ace Docs",
  description: "Documentation for the Ace observability platform",
  appearance: "dark",
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API Reference", link: "/api/" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Design System", link: "/guide/design-system" },
            { text: "Style Guide", link: "/guide/style-guide" },
            { text: "Security", link: "/guide/security" },
            { text: "Release Process", link: "/guide/release-process" },
            { text: "Contributing", link: "/guide/contributing" },
            { text: "Changelog", link: "/guide/changelog" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "Overview", link: "/api/" },
            { text: "Routes", link: "/api/routes" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/aceobservability/ace" },
    ],

    search: {
      provider: "local",
    },
  },
});
