const reports = document.querySelector("#reports");
const message = document.querySelector("#message");
const error = document.querySelector("#error");
const refreshButton = document.querySelector("#refresh");
const kind = document.querySelector("#kind");

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

async function request(path, options) {
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Inbox request failed. Try refreshing.");
    return result;
}

function showError(problem) {
    error.textContent = problem.message || "Could not reach the inbox. Reopen the canvas and try again.";
    error.hidden = false;
}

function render(report) {
    const article = element("article");
    article.append(element("h2", `${report.kind === "complaint" ? "Complaint" : "Suggestion"}${report.resolved ? " / Resolved" : ""}`));
    article.append(element("p", report.summary, "body"));
    if (report.fix) article.append(element("p", `Suggested improvement: ${report.fix}`, "fix"));
    article.append(element("p", `${new Date(report.timestamp).toLocaleString()} / Session ${report.sessionId}`, "meta"));
    article.append(element("p", `Report ${report.id}`, "meta"));
    if (report.note) article.append(element("p", `Review note: ${report.note}`, "note"));
    if (report.resolved) return article;
    const form = element("form", undefined, "triage");
    const label = element("label", "Resolution note (optional)");
    const note = element("textarea");
    note.maxLength = 1000;
    note.rows = 2;
    label.append(note);
    const resolve = element("button", "Resolve");
    resolve.type = "submit";
    form.append(label, resolve);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        resolve.disabled = true;
        error.hidden = true;
        try {
            await request("resolve", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: report.id, ...(note.value.trim() ? { note: note.value } : {}) }),
            });
            await refresh();
            refreshButton.focus();
        } catch (problem) {
            showError(problem);
        } finally {
            resolve.disabled = false;
        }
    });
    article.append(form);
    return article;
}

async function refresh() {
    refreshButton.disabled = true;
    kind.disabled = true;
    reports.setAttribute("aria-busy", "true");
    error.hidden = true;
    try {
        const result = await request("reports");
        const filtered = result.filter((report) => !kind.value || report.kind === kind.value);
        reports.replaceChildren(...filtered.map(render));
        message.textContent = filtered.length ? `${filtered.length} report${filtered.length === 1 ? "" : "s"}` :
            "Nothing here yet. Agents can leave feedback as they encounter friction.";
    } catch (problem) {
        message.textContent = "Inbox could not refresh. Any reports below are from the previous load.";
        showError(problem);
    } finally {
        reports.setAttribute("aria-busy", "false");
        refreshButton.disabled = false;
        kind.disabled = false;
    }
}

refreshButton.addEventListener("click", refresh);
kind.addEventListener("change", refresh);
refresh();
