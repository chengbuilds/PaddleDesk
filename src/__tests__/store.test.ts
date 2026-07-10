import { beforeEach, expect, test } from "vitest";

import { useApp } from "../stores/app";

beforeEach(() => {
  useApp.setState({
    view: "home",
    service: "vl16",
    tasks: [],
    selectedTaskId: null,
  });
});

test("selects the task prepared for the result viewer", () => {
  useApp.getState().setSelectedTaskId("task-1");

  expect(useApp.getState().selectedTaskId).toBe("task-1");
});

test("merges list snapshots without reverting newer task events", () => {
  useApp.getState().upsertTask({ id: "task-1", status: "done" });

  useApp.getState().mergeTasks([
    {
      id: "task-1",
      status: "pending",
      input_path: "C:/docs/task-1.png",
      created_at: 1,
    },
  ]);

  expect(useApp.getState().tasks).toEqual([
    {
      id: "task-1",
      status: "done",
      input_path: "C:/docs/task-1.png",
      created_at: 1,
    },
  ]);
});

test("upsertTask merges updates for the same task id", () => {
  useApp.getState().upsertTask({
    id: "task-1",
    status: "processing",
    progress_page: 2,
    total_pages: 5,
  });
  useApp.getState().upsertTask({ id: "task-1", status: "done" });

  expect(useApp.getState().tasks).toEqual([
    {
      id: "task-1",
      status: "done",
      progress_page: 2,
      total_pages: 5,
    },
  ]);
});
