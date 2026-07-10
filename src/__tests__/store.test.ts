import { beforeEach, expect, test } from "vitest";

import { useApp } from "../stores/app";

beforeEach(() => {
  useApp.setState({
    view: "home",
    service: "vl16",
    tasks: [],
    taskRevision: 0,
    taskRevisions: {},
    taskFieldRevisions: {},
    selectedTaskId: null,
  });
});

test("selects the task prepared for the result viewer", () => {
  useApp.getState().setSelectedTaskId("task-1");

  expect(useApp.getState().selectedTaskId).toBe("task-1");
});

test("lets a snapshot repair state when no event arrived during the request", () => {
  useApp.getState().upsertTask({ id: "task-1", status: "pending" });
  const baseRevision = useApp.getState().taskRevision;

  useApp.getState().mergeTasks(
    [
      {
        id: "task-1",
        status: "done",
        input_path: "C:/docs/task-1.png",
        created_at: 1,
      },
    ],
    baseRevision,
  );

  expect(useApp.getState().tasks).toEqual([
    {
      id: "task-1",
      status: "done",
      input_path: "C:/docs/task-1.png",
      created_at: 1,
    },
  ]);
});

test("does not let a late snapshot revert an event received during its request", () => {
  const baseRevision = useApp.getState().taskRevision;
  useApp.getState().upsertTask({ id: "task-1", status: "done" });

  expect(useApp.getState().taskRevision).toBe(baseRevision + 1);
  useApp.getState().mergeTasks(
    [
      {
        id: "task-1",
        status: "pending",
        input_path: "C:/docs/task-1.png",
        created_at: 1,
      },
    ],
    baseRevision,
  );

  expect(useApp.getState().tasks).toEqual([
    {
      id: "task-1",
      status: "done",
      input_path: "C:/docs/task-1.png",
      created_at: 1,
    },
  ]);
});

test("fills snapshot metadata for a new id without losing its concurrent event", () => {
  const baseRevision = useApp.getState().taskRevision;
  useApp.getState().upsertTask({
    id: "new-task",
    status: "processing",
    progress_page: 1,
    total_pages: 2,
  });

  useApp.getState().mergeTasks(
    [
      {
        id: "new-task",
        service: "vl16",
        status: "pending",
        input_path: "C:/docs/new-task.png",
        created_at: 2,
      },
    ],
    baseRevision,
  );

  expect(useApp.getState().tasks).toEqual([
    {
      id: "new-task",
      service: "vl16",
      status: "processing",
      input_path: "C:/docs/new-task.png",
      progress_page: 1,
      total_pages: 2,
      created_at: 2,
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
