/**
 * 入力ファイルの受け口。
 *
 * ドラッグ＆ドロップ（クリックでも選べる）で受けて、ファイル名から役割を当て、
 * 外れていれば画面で直せるようにする。
 */

import { readInputFile } from "../io/decode.js";
import { guessRole, ROLE_LABELS, ROLES, type FileRole, type SourceFile } from "../io/intake.js";

export interface DropZone {
  /** 今読み込まれているファイル */
  files(): SourceFile[];
  /** 中身が変わったら呼ばれる */
  onChange(listener: () => void): void;
}

export function createDropZone(root: HTMLElement): DropZone {
  root.innerHTML = `
    <div id="drop" class="drop">
      <p>入力ファイルをここにドロップ<span class="hint">（クリックして選ぶこともできます）</span></p>
      <p class="hint">CSV・Excel (.xlsx)・eClass の書き出し (.txt)</p>
      <input id="picker" type="file" multiple accept=".csv,.txt,.xlsx" hidden />
    </div>
    <p id="dropError" class="error" hidden></p>
    <table id="fileTable" class="files" hidden>
      <thead><tr><th>ファイル</th><th>種類</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  `;

  const drop = root.querySelector<HTMLElement>("#drop")!;
  const picker = root.querySelector<HTMLInputElement>("#picker")!;
  const table = root.querySelector<HTMLTableElement>("#fileTable")!;
  const body = table.querySelector("tbody")!;
  const error = root.querySelector<HTMLElement>("#dropError")!;

  const files: SourceFile[] = [];
  const listeners: Array<() => void> = [];
  const changed = (): void => {
    redraw();
    for (const listener of listeners) listener();
  };

  async function add(list: FileList | null): Promise<void> {
    if (list === null) return;
    error.hidden = true;
    try {
      for (const file of Array.from(list)) {
        const content = await readInputFile(file);
        // 同じ名前で入れ直したときは置き換える
        const at = files.findIndex((entry) => entry.name === file.name);
        const entry: SourceFile = { name: file.name, role: guessRole(file.name), ...content };
        if (at < 0) files.push(entry);
        else files[at] = entry;
      }
    } catch (cause) {
      error.textContent = `読み込めませんでした: ${message(cause)}`;
      error.hidden = false;
    }
    changed();
  }

  function redraw(): void {
    table.hidden = files.length === 0;
    body.innerHTML = files
      .map(
        (file, index) => `<tr>
          <td>${escapeHtml(file.name)}</td>
          <td>
            <select data-index="${index}">
              ${ROLES.map(
                (role) =>
                  `<option value="${role}"${role === file.role ? " selected" : ""}>${
                    ROLE_LABELS[role]
                  }</option>`
              ).join("")}
            </select>
          </td>
          <td><button type="button" data-remove="${index}">外す</button></td>
        </tr>`
      )
      .join("");
  }

  drop.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => {
    void add(picker.files);
    picker.value = "";
  });

  for (const type of ["dragenter", "dragover"]) {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add("over");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    drop.addEventListener(type, () => drop.classList.remove("over"));
  }
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    void add((event as DragEvent).dataTransfer?.files ?? null);
  });

  body.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    const index = Number(select.dataset["index"]);
    const file = files[index];
    if (file !== undefined) {
      file.role = select.value as FileRole;
      changed();
    }
  });

  body.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove]");
    if (button === null) return;
    files.splice(Number(button.dataset["remove"]), 1);
    changed();
  });

  return {
    files: () => files.map((file) => ({ ...file })),
    onChange: (listener) => listeners.push(listener),
  };
}

export function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
