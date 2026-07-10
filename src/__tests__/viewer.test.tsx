import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { convertFileSrcMock, invokeMock, saveMock, writeTextMock } = vi.hoisted(
  () => ({
    convertFileSrcMock: vi.fn((path: string) => `asset://${path}`),
    invokeMock: vi.fn(),
    saveMock: vi.fn(),
    writeTextMock: vi.fn(),
  }),
);

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: convertFileSrcMock,
  invoke: invokeMock,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }));

import { initI18n } from "../i18n";
import { useApp } from "../stores/app";
import { Viewer } from "../views/Viewer";

const result = {
  markdown: "# Mock 文档\n\n| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 2 |",
  page_count: 1,
  pages: [
    {
      width: 100,
      height: 200,
      blocks: [
        { id: "text", kind: "text", bbox: [10, 20, 90, 60], content: "Mock 文档" },
        { id: "table", kind: "table", bbox: [10, 70, 90, 140], content: "名称,数量\n苹果,2" },
        { id: "formula", kind: "formula", bbox: [10, 150, 90, 180], content: "E=mc^2" },
      ],
    },
  ],
};

beforeEach(async () => {
  invokeMock.mockReset().mockImplementation(async (command, args) => {
    if (command === "get_settings") return { language: "zh-CN" };
    if (command === "get_result") return result;
    if (command === "export_result") return args.path;
    throw new Error(`unexpected command: ${command}`);
  });
  saveMock.mockReset().mockResolvedValue("C:/exports/mock.md");
  writeTextMock.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });
  useApp.setState({
    view: "viewer",
    selectedTaskId: "task-1",
    tasks: [
      {
        id: "task-1",
        status: "done",
        input_path: "C:/docs/mock.png",
      },
    ],
  });
  await initI18n();
});

afterEach(cleanup);

test("loads a result, switches tabs, exports, and copies a formula", async () => {
  render(<Viewer />);

  expect(await screen.findByRole("heading", { name: "Mock 文档" })).toBeInTheDocument();
  expect(screen.getAllByTestId("bbox")).toHaveLength(3);

  fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
  expect(screen.getByText(/"page_count": 1/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
  fireEvent.click(screen.getByRole("button", { name: "导出 Markdown" }));
  await waitFor(() =>
    expect(invokeMock).toHaveBeenCalledWith("export_result", {
      taskId: "task-1",
      format: "md",
      path: "C:/exports/mock.md",
      blockId: null,
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "复制 LaTeX" }));
  await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("E=mc^2"));

  saveMock.mockRejectedValueOnce(new Error("dialog unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }));
  expect(await screen.findByText("导出失败，请重试。")).toBeInTheDocument();
});
