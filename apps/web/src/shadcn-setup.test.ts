import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readFromWebRoot(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

describe("shadcn setup", () => {
  test("has components.json configured for Vite + Tailwind v4", () => {
    const raw = readFromWebRoot("components.json");
    const config = JSON.parse(raw) as {
      style: string;
      tailwind: { css: string; baseColor: string };
      aliases: Record<string, string>;
    };

    expect(config.style).toBe("new-york");
    expect(config.tailwind.css).toBe("src/styles/globals.css");
    expect(config.tailwind.baseColor).toBe("neutral");
    expect(config.aliases.components).toBe("@/components");
    expect(config.aliases.utils).toBe("@/lib/utils");
  });

  test("has Tailwind v4 global stylesheet entry", () => {
    const css = readFromWebRoot("src", "styles", "globals.css");
    expect(css).toContain('@import "tailwindcss";');
  });

  test("has shadcn cn utility helper", () => {
    const utils = readFromWebRoot("src", "lib", "utils.ts");
    expect(utils).toContain("export function cn");
    expect(utils).toContain("clsx");
    expect(utils).toContain("twMerge");
  });
});
