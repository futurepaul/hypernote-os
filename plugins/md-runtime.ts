// Runtime loader to import .md files as plain strings during dev (`bun --hot`).
// Register a runtime loader for .md files so importing Markdown returns the
// file contents (string) instead of an asset URL in dev.
Bun.plugin({
  name: "md-runtime-loader",
  loaders: {
    ".md": {
      async load({ path }) {
        const text = await Bun.file(path).text();
        return {
          loader: "js",
          contents: `export default ${JSON.stringify(text)};`,
        };
      },
    },
  },
});
