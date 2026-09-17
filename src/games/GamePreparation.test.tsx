import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GamePreparation } from "./GamePreparation";

describe("GamePreparation", () => {
  it("준비 단계와 취소 명령을 제공한다", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <GamePreparation
        state="preparing"
        errorMessage={null}
        onCancel={onCancel}
        onRetry={vi.fn()}
        onEnter={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("플레이어 준비 중");
    expect(screen.getByText("02 프로필 준비")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("오류에서 재시도 명령을 제공한다", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <GamePreparation
        state="error"
        errorMessage="다시 준비해주세요."
        onCancel={vi.fn()}
        onRetry={onRetry}
        onEnter={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("다시 준비해주세요.");
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});