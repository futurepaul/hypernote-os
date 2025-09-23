import { expect, test, describe } from "bun:test";
import { compileMarkdownDoc, DOC_VERSION } from "./compiler";
import { decompile } from "./decompiler";
import { validateDoc } from "./types/doc";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadMarkdown(name: string) {
  const path = join(__dirname, `../sample_apps/${name}.md`);
  return Bun.file(path).text();
}

describe("compiler", () => {
  test("wallet compiles to AST with hstack and buttons", async () => {
    const md = await loadMarkdown("wallet");
    const { ast, meta } = compileMarkdownDoc(md);
    expect(meta.hypernote?.name).toBe("Wallet");
    expect(Array.isArray(ast)).toBe(true);

    // Expect first markdown node to include the price text
    const markdownNode = ast.find(n => n.type === "markdown");
    expect(markdownNode).toBeTruthy();
    expect(markdownNode!.text || "").toContain("$60");

    // Expect an hstack with two button children
    const row = ast.find(n => n.type === "hstack");
    expect(row).toBeTruthy();
    expect((row!.children || []).length).toBeGreaterThanOrEqual(2);
    const labels = (row!.children || []).filter(n => n.type === "button").map(b => b.data?.text);
    expect(labels).toContain("Send");
    expect(labels).toContain("Receive");
  });

  test("profile compiles modern queries block", async () => {
    const md = await loadMarkdown("profile");
    const { ast, meta } = compileMarkdownDoc(md);
    expect(meta.hypernote?.name).toBe("Profile");
    const inputs = collectNodesOfType(ast, 'input');
    const buttons = collectNodesOfType(ast, 'button');
    expect(inputs.length).toBe(1);
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(meta.forms?.pubkey).toBe('user.pubkey');
    expect(meta.state?.profile_target).toBe('user.pubkey');
  });
  test("rejects raw html", () => {
    const bad = `---\nname: Bad\n---\n<div>html</div>`;
    expect(() => compileMarkdownDoc(bad)).toThrow(/HTML is not supported/);
  });

  test("compiled docs expose version and pass schema validation", async () => {
    const doc = compileMarkdownDoc(await loadMarkdown("app-store"));
    expect(doc.version).toBe(DOC_VERSION);
    expect(() => validateDoc(doc)).not.toThrow();
  });

  test("nodes capture dependency metadata", () => {
    const md = `---\nhypernote:\n  name: Deps\nqueries:\n  feed:\n    kinds: [1]\n---\nStatus: {{ queries.feed[0].content || user.pubkey }}`;
    const compiled = compileMarkdownDoc(md);
    const markdownNodes = collectNodesOfType(compiled.ast, 'markdown');
    expect(markdownNodes.some(n => n.deps?.queries?.includes("feed"))).toBe(true);
    expect(markdownNodes.some(n => n.deps?.globals?.includes("user"))).toBe(true);
    expect(compiled.meta.dependencies?.queries).toContain('feed');
    expect(compiled.meta.dependencies?.globals).toContain('user');

    const eachDoc = `---\nhypernote:\n  name: EachDeps\nqueries:\n  feed:\n    kinds: [1]\n---\n\`\`\`each.start\nfrom: queries.feed\nas: item\n\`\`\`\n- {{ item.content }}\n\`\`\`each.end\n`;
    const compiledEach = compileMarkdownDoc(eachDoc);
    const eachNode = compiledEach.ast.find(n => n.type === "each");
    expect(eachNode?.deps?.queries).toContain("feed");
    expect(compiledEach.meta.dependencies?.queries).toContain('feed');

    const buttonDoc = `---\nhypernote:\n  name: ButtonDeps\nqueries:\n  feed:\n    kinds: [1]\n---\n\`\`\`button\ntext: "{{ queries.feed[0].content }}"\n\`\`\`\n`;
    const compiledButton = compileMarkdownDoc(buttonDoc);
    const buttonNodes = collectNodesOfType(compiledButton.ast, 'button');
    expect(buttonNodes.length).toBeGreaterThan(0);
    expect(buttonNodes.some(n => n.deps?.queries?.includes('feed'))).toBe(true);
    expect(compiledButton.meta.dependencies?.queries).toContain('feed');
  });

  test("doc dependencies include time when referenced", () => {
    const md = `---\nhypernote:\n  name: Clock\n---\nCurrent: {{ time.now }}`;
    const compiled = compileMarkdownDoc(md);
    expect(compiled.meta.dependencies?.globals).toContain('time');
  });

  test("validateDoc rejects unexpected node types", async () => {
    const doc = compileMarkdownDoc(await loadMarkdown("wallet"));
    const mutated = {
      ...doc,
      ast: [{ ...doc.ast[0], type: "unknown" as any }],
    };
    expect(() => validateDoc(mutated)).toThrow();
  });

  test("preserves yaml arrays in frontmatter", () => {
    const md = `---\nhypernote:\n  name: Test\nqueries:\n  items:\n    authors:\n      - user.pubkey\n---\nhi\n`;
    const compiled = compileMarkdownDoc(md);
    expect(Array.isArray(compiled.meta.queries?.items?.authors)).toBe(true);
    const roundtrip = compileMarkdownDoc(decompile(compiled));
    expect(roundtrip.meta.queries?.items?.authors).toEqual(['user.pubkey']);
  });

  test("app store markdown normalizes inline image references", async () => {
    const { ast } = compileMarkdownDoc(await loadMarkdown("app-store"));
    expect(astContainsImageNode(ast)).toBe(true);
  });

  test("stack nodes support pixel dimensions", () => {
    const md = `---\nname: Sized\n---\n\n\`\`\`hstack.start\nwidth: 80px\nheight: 120\n\`\`\`\ncontent\n\`\`\`hstack.end\n\`\`\`\n`;
    const compiled = compileMarkdownDoc(md);
    const stack = compiled.ast.find(n => n.type === "hstack");
    expect(stack?.data?.width).toBe("80px");
    expect(stack?.data?.height).toBe("120px");

    const roundtripped = compileMarkdownDoc(decompile(compiled));
    const rtStack = roundtripped.ast.find(n => n.type === "hstack");
    expect(rtStack?.data?.width).toBe("80px");
    expect(rtStack?.data?.height).toBe("120px");
  });

  test("mustache variables survive underscores without emphasis", () => {
    const md = `---\nname: Feed\n---\n\n{{ $feed.1.display_name }} - {{ $feed.0.created_at }}`;
    const compiled = compileMarkdownDoc(md);
    const markdownNode = compiled.ast.find(n => n.type === "markdown");
    expect(markdownNode).toBeTruthy();
    const paragraph = (markdownNode as any)?.markdown?.find((child: any) => child.type === "paragraph");
    expect(paragraph).toBeTruthy();
    const emphasisNodes = collectNodesOfType(paragraph, 'emphasis');
    expect(emphasisNodes.length).toBe(0);
    const textContent = collectNodesOfType(paragraph, 'text').map(n => n.value).join('');
    expect(textContent.trim()).toBe('{{ $feed.1.display_name }} - {{ $feed.0.created_at }}');

    const roundtripped = compileMarkdownDoc(decompile(compiled));
    const rtParagraph = roundtripped.ast
      .find(n => n.type === "markdown")?.markdown?.find((child: any) => child.type === "paragraph");
    const rtText = collectNodesOfType(rtParagraph, 'text').map(n => n.value).join('');
    expect(rtText.trim()).toBe('{{ $feed.1.display_name }} - {{ $feed.0.created_at }}');
  });

  test("mustache variables inside image urls are preserved", () => {
    const md = `---\nname: Img\n---\n\n![avatar]({{ $feed.1.picture }}?w=48)`;
    const compiled = compileMarkdownDoc(md);
    const imageNode = compiled.ast
      .find(n => n.type === "markdown")?.markdown?.[0]?.children?.find((child: any) => child.type === 'image');
    expect(imageNode).toBeTruthy();
    expect(imageNode?.url).toBe('{{ $feed.1.picture }}?w=48');

    const roundtripped = compileMarkdownDoc(decompile(compiled));
    const rtImageNode = roundtripped.ast
      .find(n => n.type === "markdown")?.markdown?.[0]?.children?.find((child: any) => child.type === 'image');
    expect(rtImageNode?.url).toBe('{{ $feed.1.picture }}?w=48');
  });

  test("each blocks accept .start and decompile with .start", () => {
    const md = `---\nname: Items\n---\n\n\`\`\`each.start\nfrom: $items\nas: item\n\`\`\`\nItem: {{ $item.name }}\n\`\`\`each.end\n\`\`\`\n`;
    const compiled = compileMarkdownDoc(md);
    const eachNode = compiled.ast.find(n => n.type === "each");
    expect(eachNode).toBeTruthy();
    expect(eachNode?.data?.as).toBe("item");
    const decompiled = decompile(compiled);
    expect(decompiled).toContain("```each.start");
  });

  test("unknown fenced code becomes literal", () => {
    const md = `---\nname: Literal\n---\n\n\`\`\`js\nconsole.log('hello');\n\`\`\`\n`;
    const compiled = compileMarkdownDoc(md);
    const literal = compiled.ast.find(n => (n as any).type === 'literal_code') as any;
    expect(literal).toBeTruthy();
    expect(literal.text).toContain("console.log");
    expect(literal.data?.lang).toBe('js');

    const roundtrip = compileMarkdownDoc(decompile(compiled));
    const rtLiteral = roundtrip.ast.find(n => (n as any).type === 'literal_code') as any;
    expect(rtLiteral?.text).toContain("console.log");
    expect(rtLiteral?.data?.lang).toBe('js');
  });

  test("markdown viewer blocks compile to viewer nodes", () => {
    const md = `---\nname: Viewer\n---\n\n\`\`\`markdown.viewer\nvalue: {{ state.docs.snippet }}\n\`\`\`\n`;
    const compiled = compileMarkdownDoc(md);
    const viewer = compiled.ast.find(n => (n as any).type === 'markdown_viewer') as any;
    expect(viewer).toBeTruthy();
    expect(viewer.data?.value).toBe('{{ state.docs.snippet }}');

    const roundtrip = compileMarkdownDoc(decompile(compiled));
    const rtViewer = roundtrip.ast.find(n => (n as any).type === 'markdown_viewer') as any;
    expect(rtViewer?.data?.value).toBe('{{ state.docs.snippet }}');
  });


  test("button payload retains moustache templates", () => {
    const md = `---\nname: Button\n---\n\n\`\`\`button\ntext: Install\naction: "@install_app"\npayload:\n  naddr: "{{ $app.0.naddr }}"\n\`\`\`\n`;
    const compiled = compileMarkdownDoc(md);
    const button = compiled.ast.find(n => n.type === "button");
    expect(button?.data?.payload?.naddr).toBe('{{ $app.0.naddr }}');
    const decompiled = decompile(compiled);
    expect(decompiled).toContain('{{ $app.0.naddr }}');
  });

  test("ensure blank line before fences is auto-inserted", () => {
    const md = `---\nname: Fence\n---\n\n\`\`\`vstack.start\n\`\`\`\n{{ $feed.0.content }}\n\`\`\`vstack.end\n\`\`\`\n`;
    const compiled = compileMarkdownDoc(md);
    const markdownNodes = collectNodesOfType(compiled.ast, 'markdown');
    expect(markdownNodes.length).toBeGreaterThan(0);
    expect(markdownNodes[0]?.text).toContain('{{ $feed.0.content }}');
    expect(markdownNodes[0]?.text).not.toContain('vstack.end');
  });
});

function astContainsImageNode(ast: any): boolean {
  if (Array.isArray(ast)) return ast.some(node => astContainsImageNode(node));
  if (ast && typeof ast === 'object') {
    if (ast.type === 'image') return true;
    if (ast.type === 'markdown' && Array.isArray(ast.markdown) && astContainsImageNode(ast.markdown)) return true;
    if (Array.isArray(ast.children) && astContainsImageNode(ast.children)) return true;
  }
  return false;
}

function collectNodesOfType(node: any, type: string): any[] {
  const out: any[] = [];
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(n => out.push(...collectNodesOfType(n, type)));
    return out;
  }
  if (node.type === type) out.push(node);
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => {
      out.push(...collectNodesOfType(child, type));
    });
  }
  return out;
}
