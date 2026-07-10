import { create } from "zustand";

export type View =
  | "home"
  | "viewer"
  | "queue"
  | "history"
  | "usage"
  | "settings";

export type ServiceId = "vl16" | "pp_ocr_v6" | "structure_v3";

export interface TaskSummary {
  id: string;
  service?: ServiceId;
  status?: string;
  input_path?: string;
  options_json?: string;
  progress_page?: number;
  total_pages?: number;
  error_kind?: string | null;
  error_msg?: string | null;
  created_at?: number;
}

type TaskField = Exclude<keyof TaskSummary, "id">;
type TaskFieldRevisions = Partial<Record<TaskField, number>>;

export interface AppState {
  view: View;
  setView: (view: View) => void;
  service: ServiceId;
  setService: (service: ServiceId) => void;
  tasks: TaskSummary[];
  taskRevision: number;
  taskRevisions: Record<string, number>;
  taskFieldRevisions: Record<string, TaskFieldRevisions>;
  upsertTask: (task: TaskSummary) => void;
  mergeTasks: (tasks: TaskSummary[], baseRevision: number) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  view: "home",
  setView: (view) => set({ view }),
  service: "vl16",
  setService: (service) => set({ service }),
  tasks: [],
  taskRevision: 0,
  taskRevisions: {},
  taskFieldRevisions: {},
  upsertTask: (task) =>
    set((state) => {
      const revision = state.taskRevision + 1;
      const fieldRevisions = {
        ...state.taskFieldRevisions[task.id],
      };
      for (const field of Object.keys(task) as (keyof TaskSummary)[]) {
        if (field !== "id") {
          fieldRevisions[field] = revision;
        }
      }
      const index = state.tasks.findIndex(({ id }) => id === task.id);
      if (index === -1) {
        return {
          tasks: [...state.tasks, task],
          taskRevision: revision,
          taskRevisions: { ...state.taskRevisions, [task.id]: revision },
          taskFieldRevisions: {
            ...state.taskFieldRevisions,
            [task.id]: fieldRevisions,
          },
        };
      }

      const tasks = [...state.tasks];
      tasks[index] = { ...tasks[index], ...task };
      return {
        tasks,
        taskRevision: revision,
        taskRevisions: { ...state.taskRevisions, [task.id]: revision },
        taskFieldRevisions: {
          ...state.taskFieldRevisions,
          [task.id]: fieldRevisions,
        },
      };
    }),
  mergeTasks: (incoming, baseRevision) =>
    set((state) => {
      const current = new Map(state.tasks.map((task) => [task.id, task]));
      const tasks = incoming.map((task) => {
        const merged = { ...task };
        const currentTask = current.get(task.id);
        const revisions = state.taskFieldRevisions[task.id];

        if (currentTask && revisions) {
          for (const field of Object.keys(revisions) as TaskField[]) {
            if ((revisions[field] ?? 0) > baseRevision) {
              Object.assign(merged, { [field]: currentTask[field] });
            }
          }
        }

        return merged;
      });
      const incomingIds = new Set(incoming.map(({ id }) => id));
      return {
        tasks: [
          ...tasks,
          ...state.tasks.filter(
            ({ id }) =>
              !incomingIds.has(id) &&
              (state.taskRevisions[id] ?? 0) > baseRevision,
          ),
        ],
      };
    }),
  selectedTaskId: null,
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
}));
