/**
 * M0: the scaffold's smoke test.
 *
 * It solves one hand-written instance to show that the toolchain works —
 * that `hospital-resident-matching` bundles into the browser, `node:fs` and
 * `node:path` included (see nodeStub.ts).  M1 replaces this with the domain
 * layer, and M2 with the real page.
 */

import { stableMatch, type Hospital, type Resident } from "hospital-resident-matching";

const students: Resident[] = [
  { id: "s1", preferences: ["A", "B", "C"] },
  { id: "s2", preferences: ["A", "C", "B"] },
  { id: "s3", preferences: ["A", "B", "C"] },
  { id: "s4", preferences: ["B", "A", "C"] },
  { id: "s5", preferences: ["B", "A", "C"] },
];

// Ranked as the total score would rank them, highest first
const labs: Hospital[] = [
  { id: "A", capacity: 2, preferences: ["s3", "s1", "s2", "s5", "s4"] },
  { id: "B", capacity: 2, preferences: ["s1", "s4", "s2", "s5", "s3"] },
  { id: "C", capacity: 1, preferences: ["s2", "s5", "s1", "s3", "s4"] },
];

const result = stableMatch(students, labs);

/** Which choice the student got, 1 for their first, or null when unmatched. */
function choiceOf(student: Resident, lab: string | undefined): number | null {
  if (lab === undefined) return null;
  const rank = student.preferences.indexOf(lab);
  return rank < 0 ? null : rank + 1;
}

const rows = students
  .map((student) => {
    const lab = result.residents[student.id];
    const choice = choiceOf(student, lab);
    return `<tr>
      <td><code>${student.id}</code></td>
      <td>${student.preferences.join(" &gt; ")}</td>
      <td${lab === undefined ? ' class="unmatched"' : ""}>${lab ?? "未配属"}</td>
      <td>${choice === null ? "-" : `第${choice}希望`}</td>
    </tr>`;
  })
  .join("");

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("#app is missing from index.html");

app.innerHTML = `
  <h2>疎通確認 (M0)</h2>
  <p>固定のインスタンスを <code>stableMatch()</code> で解いた結果です。</p>
  <table>
    <thead>
      <tr><th>学生</th><th>希望順位</th><th>配属先</th><th>希望順位</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
`;
