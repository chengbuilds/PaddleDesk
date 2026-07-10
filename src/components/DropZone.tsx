import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

import { filterSupported } from "../lib/files";

const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "pdf"];

interface DropZoneProps {
  onPaths: (paths: string[]) => void | Promise<void>;
}

export function DropZone({ onPaths }: DropZoneProps) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);

  const submit = useCallback(
    (paths: string[]) => {
      const supported = filterSupported(paths);
      if (supported.length === 0) return;
      setError(false);
      void Promise.resolve(onPaths(supported)).catch(() => setError(true));
    },
    [onPaths],
  );

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const handleDragDrop = ({ payload }: { payload: DragDropEvent }) => {
      if (payload.type === "drop") submit(payload.paths);
    };

    void getCurrentWebview().onDragDropEvent(handleDragDrop).then(
      (unlisten) => {
        if (disposed) unlisten();
        else cleanup = unlisten;
      },
      () => {
        if (!disposed) setError(true);
      },
    );

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [submit]);

  const chooseFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: t("home.supportedFiles"), extensions: EXTENSIONS }],
      });
      submit(selected ?? []);
    } catch {
      setError(true);
    }
  };

  return (
    <section className="drop-zone" aria-labelledby="drop-zone-title">
      <span className="drop-zone-mark" aria-hidden="true" />
      <h2 id="drop-zone-title">{t("home.dropTitle")}</h2>
      <p>{t("home.dropDescription")}</p>
      <p className="cloud-disclosure">{t("home.cloudDisclosure")}</p>
      <button className="secondary-button" type="button" onClick={chooseFiles}>
        {t("actions.chooseFiles")}
      </button>
      {error && <p role="alert">{t("home.submitFailed")}</p>}
    </section>
  );
}
