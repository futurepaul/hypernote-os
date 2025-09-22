import { expect, test, describe } from "bun:test";
import { compileMarkdownDoc } from "./compiler";
import { defaultApps } from "./apps/app";
import { decompile } from "./decompiler";

describe("compiler", () => {
  test("wallet compiles to AST with hstack and buttons", async () => {
    const md = defaultApps.wallet;
    const { ast, meta } = compileMarkdownDoc(md);
    expect(meta.name).toBe("Wallet");
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

  test("profile compiles input and button with yaml payloads", async () => {
    const md = defaultApps.profile;
    const { ast, meta } = compileMarkdownDoc(md);
    expect(meta.name).toBe("Profile");
    const input = ast.find(n => n.type === "input");
    const button = ast.find(n => n.type === "button");
    expect(input?.data?.text).toContain("nsec or npub");
    expect(button?.data?.text).toBe("Load Profile");
    expect(button?.data?.action).toBe("@load_profile");
  });
  test("rejects raw html", () => {
    const bad = `---\nname: Bad\n---\n<div>html</div>`;
    expect(() => compileMarkdownDoc(bad)).toThrow(/HTML is not supported/);
  });

  test("preserves yaml arrays in frontmatter", () => {
    const md = `---\nname: Test\n"$items":\n  authors: [$user.pubkey]\n---\nhi\n`;
    const compiled = compileMarkdownDoc(md);
    expect(Array.isArray(compiled.meta["$items"]?.authors)).toBe(true);
    const roundtrip = compileMarkdownDoc(decompile(compiled));
    expect(roundtrip.meta["$items"].authors).toEqual(['$user.pubkey']);
  });

  test("app store markdown normalizes inline image references", () => {
    const { ast } = compileMarkdownDoc(defaultApps["app-store"]);
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

  test("legacy each blocks without suffix still compile", () => {
    const md = `---\nname: LegacyEach\n---\n\n\`\`\`each\nfrom: $items\nas: item\n\`\`\`\nLegacy: {{ $item.name }}\n\`\`\`each.end\n\`\`\`\n`;
    const compiled = compileMarkdownDoc(md);
    const eachNode = compiled.ast.find(n => n.type === "each");
    expect(eachNode).toBeTruthy();
    const decompiled = decompile(compiled);
    expect(decompiled).toContain("```each.start");
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
