import type { BunPlugin } from "bun";

const mdLoader: BunPlugin = {
  name: "md-loader",
  setup(builder) {
    builder.onLoad({ filter: /\.md$/ }, async (args) => {
      const text = await Bun.file(args.path).text();
      const contents = `export default ${JSON.stringify(text)};`;
      return { contents, loader: "js" };
    });
  },
};

export default mdLoader;

