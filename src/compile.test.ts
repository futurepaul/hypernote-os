import { expect, test, describe } from "bun:test";
import { compileMarkdownDoc } from "./compiler";

async function load(path: string) {
  const url = new URL(path, import.meta.url);
  return await Bun.file(url).text();
}

describe("compiler", () => {
  test("wallet compiles to AST with hstack and buttons", async () => {
    const md = await load("./apps/wallet.md");
    const { ast, meta } = compileMarkdownDoc(md);
    expect(meta.name).toBe("Wallet");
    expect(Array.isArray(ast)).toBe(true);

    // Expect first node to be HTML containing the H1 "$60"
    const htmlNode = ast.find(n => n.type === "html");
    expect(htmlNode).toBeTruthy();
    expect(htmlNode!.html || "").toContain("$60");

    // Expect an hstack with two button children
    const row = ast.find(n => n.type === "hstack");
    expect(row).toBeTruthy();
    expect((row!.children || []).length).toBeGreaterThanOrEqual(2);
    const labels = (row!.children || []).filter(n => n.type === "button").map(b => b.data?.text);
    expect(labels).toContain("Send");
    expect(labels).toContain("Receive");
  });

  test("profile compiles input and button with yaml payloads", async () => {
    const md = await load("./apps/profile.md");
    const { ast, meta } = compileMarkdownDoc(md);
    expect(meta.name).toBe("Profile");
    const input = ast.find(n => n.type === "input");
    const button = ast.find(n => n.type === "button");
    expect(input?.data?.text).toContain("nsec or npub");
    expect(button?.data?.text).toBe("Load Profile");
    expect(button?.data?.action).toBe("@load_profile");
  });
});

