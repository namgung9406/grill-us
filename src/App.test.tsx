import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("최소 앱을 렌더한다", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "게임을 준비하고 있습니다" })).toBeVisible();
  });
});