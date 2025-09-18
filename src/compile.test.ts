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
