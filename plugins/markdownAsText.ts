import type { BunPlugin } from "bun";

const markdownAsTextPlugin: BunPlugin = {
  name: "markdown-as-text",
  setup(build) {
    build.onLoad({ filter: /\.md$/ }, async (args) => {
      const text = await Bun.file(args.path).text();
      return {
        contents: `export default ${JSON.stringify(text)}`,
        loader: "js",
      };
    });
  },
};

export default markdownAsTextPlugin;

