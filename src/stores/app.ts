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

export interface AppState {
  view: View;
  setView: (view: View) => void;
  service: ServiceId;
  setService: (service: ServiceId) => void;
  tasks: TaskSummary[];
  upsertTask: (task: TaskSummary) => void;
  mergeTasks: (tasks: TaskSummary[]) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  view: "home",
  setView: (view) => set({ view }),
  service: "vl16",
  setService: (service) => set({ service }),
  tasks: [],
  upsertTask: (task) =>
    set((state) => {
      const index = state.tasks.findIndex(({ id }) => id === task.id);
      if (index === -1) {
        return { tasks: [...state.tasks, task] };
      }

      const tasks = [...state.tasks];
      tasks[index] = { ...tasks[index], ...task };
      return { tasks };
    }),
  mergeTasks: (incoming) =>
    set((state) => {
      const current = new Map(state.tasks.map((task) => [task.id, task]));
      const tasks = incoming.map((task) => ({
        ...task,
        ...current.get(task.id),
      }));
      const incomingIds = new Set(incoming.map(({ id }) => id));
      return {
        tasks: [
          ...tasks,
          ...state.tasks.filter(({ id }) => !incomingIds.has(id)),
        ],
      };
    }),
  selectedTaskId: null,
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
}));
