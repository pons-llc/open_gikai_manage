// 管理側 JS（フォームの出し分け・資料アップロード等の UX 向上用）。
// サーバ側バリデーションで担保するため、JS 無効時も送信自体は成立させる（design.md §6.3）。

// P1-1: フラッシュ表示後、リロードで再表示されないよう ?flash= 系クエリを URL から消す。
if (document.querySelector("[data-flash]")) {
  const url = new URL(window.location.href);
  if (url.searchParams.has("flash")) {
    url.searchParams.delete("flash");
    window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
  }
}

// ナビのグループメニュー: <details> は素の HTML でも開閉できるが、
// 1つ開いたら他は閉じる・外側クリックで閉じる、という一般的なメニューの挙動を JS で補う。
const navGroupDetails = Array.from(document.querySelectorAll(".nav-group details"));
navGroupDetails.forEach((details) => {
  details.addEventListener("toggle", () => {
    if (!details.open) return;
    navGroupDetails.forEach((other) => {
      if (other !== details) other.open = false;
    });
  });
});
document.addEventListener("click", (e) => {
  navGroupDetails.forEach((details) => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
});

document.querySelectorAll("form[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (e) => {
    const message = form.getAttribute("data-confirm");
    if (message && !window.confirm(message)) {
      e.preventDefault();
    }
  });
});

// 議題登録フォーム: 種類(category)に応じて議案種別/委員会セレクトを出し分ける。
// JS無効時は design.md §6.3 のとおり両方表示したままにし、サーバ側バリデーションで担保する。
document.querySelectorAll("form[data-agenda-item-form]").forEach((form) => {
  const categorySelect = form.querySelector("[data-agenda-item-category]");
  if (!categorySelect) return;
  const fields = form.querySelectorAll("[data-agenda-item-field]");
  const sync = () => {
    fields.forEach((field) => {
      const relevantCategory = field.getAttribute("data-agenda-item-field") === "bill" ? "bill" : "committee";
      field.style.display = categorySelect.value === relevantCategory ? "" : "none";
    });
  };
  categorySelect.addEventListener("change", sync);
  sync();
});

// 日程登録フォーム: 会議種別(本会議/委員会)・開始方法(時刻指定/前の会議終了後)に応じてフィールドを出し分け、
// 「前の会議終了後」選択時は開催日が変わるたびに同日会議を fetch して候補を更新する(design.md §6.3)。
document.querySelectorAll("form[data-meeting-form]").forEach((form) => {
  const typeRadios = form.querySelectorAll("[data-meeting-type]");
  const startTypeRadios = form.querySelectorAll("[data-meeting-start-type]");
  const dateInput = form.querySelector("[data-meeting-date]");
  const previousSelect = form.querySelector("[data-meeting-previous-select]");
  const meetingId = form.getAttribute("data-meeting-id") || "0";

  const checkedValue = (radios) => {
    for (const r of radios) if (r.checked) return r.value;
    return undefined;
  };

  const syncFieldVisibility = () => {
    const meetingType = checkedValue(typeRadios);
    const startType = checkedValue(startTypeRadios);
    form.querySelectorAll("[data-meeting-field]").forEach((field) => {
      const key = field.getAttribute("data-meeting-field");
      const visible = key === "committee" ? meetingType === "committee" : key === startType;
      field.style.display = visible ? "" : "none";
    });
  };

  const refreshPreviousMeetingOptions = async () => {
    if (!previousSelect || !dateInput || !dateInput.value) return;
    const currentValue = previousSelect.value;
    try {
      const res = await fetch(
        `/api/admin/meetings?date=${encodeURIComponent(dateInput.value)}&exclude=${encodeURIComponent(meetingId)}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return;
      const data = await res.json();
      previousSelect.innerHTML = "";
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "選択してください";
      previousSelect.appendChild(emptyOption);
      for (const item of data.items || []) {
        const option = document.createElement("option");
        option.value = String(item.id);
        option.textContent = item.label;
        previousSelect.appendChild(option);
      }
      if ([...previousSelect.options].some((o) => o.value === currentValue)) {
        previousSelect.value = currentValue;
      }
    } catch {
      // fetch 失敗時はサーバ側で最終検証されるため、候補更新をあきらめて既存の選択肢のままにする。
    }
  };

  typeRadios.forEach((r) => r.addEventListener("change", syncFieldVisibility));
  startTypeRadios.forEach((r) =>
    r.addEventListener("change", () => {
      syncFieldVisibility();
      refreshPreviousMeetingOptions();
    })
  );
  if (dateInput) dateInput.addEventListener("change", refreshPreviousMeetingOptions);

  syncFieldVisibility();
});

// P3-1: 日程フォームの議題・資料チェックリストのインクリメンタル絞り込み(client-side, fetch不要)。
// チェック済み行は絞り込みに関係なく常に表示する。JS無効時は現状どおり全件表示のまま。
document.querySelectorAll("[data-filter-list]").forEach((list) => {
  const key = list.getAttribute("data-filter-list");
  const input = document.querySelector(`[data-filter-input="${key}"]`);
  if (!input) return;
  input.addEventListener("input", () => {
    const term = input.value.trim().toLowerCase();
    list.querySelectorAll("[data-filter-row]").forEach((row) => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const checked = !!checkbox && checkbox.checked;
      const matches = term === "" || row.textContent.toLowerCase().includes(term);
      row.style.display = checked || matches ? "" : "none";
    });
    if (term !== "") {
      list.querySelectorAll("details").forEach((details) => {
        details.open = true;
      });
    }
  });
});

// P3-2: チェックを入れた時点で表示順が 0/空なら「現在のチェック済み最大値 + 1」を自動セットする。
// 外したら 0 に戻す。手入力での上書きは従来どおり可能(数値 input は残るため JS 無効でも成立)。
document.addEventListener("change", (e) => {
  const checkbox = e.target.closest && e.target.closest("[data-order-checkbox]");
  if (!checkbox) return;
  const targetId = checkbox.getAttribute("data-order-target");
  const orderInput = targetId && document.getElementById(targetId);
  if (!orderInput) return;
  if (!checkbox.checked) {
    orderInput.value = "0";
    return;
  }
  if ((Number(orderInput.value) || 0) !== 0) return;
  const scope = checkbox.closest("[data-filter-list]") || document;
  let max = 0;
  scope.querySelectorAll("[data-order-checkbox]:checked").forEach((cb) => {
    const otherId = cb.getAttribute("data-order-target");
    const otherInput = otherId && document.getElementById(otherId);
    if (otherInput) max = Math.max(max, Number(otherInput.value) || 0);
  });
  orderInput.value = String(max + 1);
});

// P3-3: 会議資料のその場アップロード。既存 POST /api/admin/documents(Accept: application/json)を再利用し、
// 日程フォーム自体は未送信のまま、成功したらチェックリストに行を動的追加してチェック済み+表示順自動採番にする。
document.querySelectorAll("[data-inline-upload]").forEach((panel) => {
  panel.hidden = false;
  const fileInput = panel.querySelector("[data-inline-upload-file]");
  const agendaSelect = panel.querySelector("[data-inline-upload-agenda]");
  const submitButton = panel.querySelector("[data-inline-upload-submit]");
  const errorEl = panel.querySelector("[data-inline-upload-error]");
  const list = document.querySelector('[data-filter-list="document"]');
  if (!fileInput || !submitButton || !errorEl || !list) return;

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.style.display = "";
  };

  submitButton.addEventListener("click", async () => {
    errorEl.style.display = "none";
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      showError("ファイルを選択してください");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    if (agendaSelect && agendaSelect.value) formData.append("agenda_item_id", agendaSelect.value);

    submitButton.disabled = true;
    try {
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        showError((data && data.error && data.error.message) || "アップロードに失敗しました");
        return;
      }

      const emptyHint = list.querySelector("[data-document-empty-hint]");
      if (emptyHint) emptyHint.remove();

      const row = document.createElement("div");
      row.className = "checkbox-list__row";
      row.setAttribute("data-filter-row", "");

      const label = document.createElement("label");
      label.className = "checkbox-list__checkbox";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "document_ids";
      checkbox.value = String(data.id);
      checkbox.checked = true;
      checkbox.setAttribute("data-order-checkbox", "");
      checkbox.setAttribute("data-order-target", `document_order_${data.id}`);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(" " + data.file_name));

      const orderInput = document.createElement("input");
      orderInput.type = "number";
      orderInput.className = "checkbox-list__order";
      orderInput.id = `document_order_${data.id}`;
      orderInput.name = `document_order_${data.id}`;
      orderInput.value = "0";
      orderInput.setAttribute("data-order-input", "");
      orderInput.setAttribute("aria-label", `${data.file_name} の表示順`);

      row.appendChild(label);
      row.appendChild(orderInput);
      list.appendChild(row);
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));

      fileInput.value = "";
      if (agendaSelect) agendaSelect.value = "";
    } catch {
      showError("通信エラーが発生しました");
    } finally {
      submitButton.disabled = false;
    }
  });
});

// P3-4: 議題のクイック作成。既存 POST /api/admin/agenda-items(JSON, requireAuth 済み)を再利用し、
// 成功したら議題チェックリストへ動的追加してチェック済み+表示順自動採番にする(P3-3 と同型)。
// クイック作成は即時公開固定(予約公開したい場合は議題管理画面を使う)。
document.querySelectorAll("[data-inline-agenda-create]").forEach((panel) => {
  panel.hidden = false;
  const titleInput = panel.querySelector("[data-inline-agenda-title]");
  const yearInput = panel.querySelector("[data-inline-agenda-fiscal-year]");
  const numberInput = panel.querySelector("[data-inline-agenda-number]");
  const categorySelect = panel.querySelector("[data-inline-agenda-category]");
  const typeSelect = panel.querySelector("[data-inline-agenda-type]");
  const typeField = panel.querySelector("[data-inline-agenda-type-field]");
  const submitButton = panel.querySelector("[data-inline-agenda-submit]");
  const errorEl = panel.querySelector("[data-inline-agenda-error]");
  const list = document.querySelector('[data-filter-list="agenda"]');
  if (!titleInput || !yearInput || !numberInput || !categorySelect || !submitButton || !errorEl || !list) return;

  const syncTypeField = () => {
    if (typeField) typeField.style.display = categorySelect.value === "bill" ? "" : "none";
  };
  categorySelect.addEventListener("change", syncTypeField);
  syncTypeField();

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.style.display = "";
  };

  submitButton.addEventListener("click", async () => {
    errorEl.style.display = "none";
    const title = titleInput.value.trim();
    if (!title) {
      showError("議題名を入力してください");
      return;
    }
    const payload = {
      title,
      fiscal_year: Number(yearInput.value) || 0,
      number: Number(numberInput.value) || 0,
      category: categorySelect.value,
      agenda_type_id: categorySelect.value === "bill" && typeSelect ? typeSelect.value : null,
    };

    submitButton.disabled = true;
    try {
      const res = await fetch("/api/admin/agenda-items", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showError((data && data.error && data.error.message) || "作成に失敗しました");
        return;
      }

      const emptyHint = list.querySelector("[data-agenda-empty-hint]");
      if (emptyHint) emptyHint.remove();

      const details = document.createElement("details");
      details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = `${data.fiscal_year}年度`;
      details.appendChild(summary);

      const row = document.createElement("div");
      row.className = "checkbox-list__row";
      row.setAttribute("data-filter-row", "");

      const label = document.createElement("label");
      label.className = "checkbox-list__checkbox";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "agenda_item_ids";
      checkbox.value = String(data.id);
      checkbox.checked = true;
      checkbox.setAttribute("data-order-checkbox", "");
      checkbox.setAttribute("data-order-target", `agenda_item_order_${data.id}`);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(" " + data.title));

      const orderInput = document.createElement("input");
      orderInput.type = "number";
      orderInput.className = "checkbox-list__order";
      orderInput.id = `agenda_item_order_${data.id}`;
      orderInput.name = `agenda_item_order_${data.id}`;
      orderInput.value = "0";
      orderInput.setAttribute("data-order-input", "");
      orderInput.setAttribute("aria-label", `${data.title} の表示順`);

      row.appendChild(label);
      row.appendChild(orderInput);
      details.appendChild(row);
      list.insertBefore(details, list.firstChild);
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));

      titleInput.value = "";
      numberInput.value = "";
    } catch {
      showError("通信エラーが発生しました");
    } finally {
      submitButton.disabled = false;
    }
  });
});

// 賛否記録グリッド: 行(議題)の「全員○○」ボタンで、その行のセレクトを一括変更する(design.md §6.3)。
// JS無効時はボタンが出ないだけで、セレクトを1つずつ選んで通常送信すれば同じ結果になる。
document.querySelectorAll("[data-vote-row-fill] [data-vote-fill]").forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.getAttribute("data-vote-fill");
    const row = button.closest("tr");
    if (!row) return;
    row.querySelectorAll("select[data-vote-cell]").forEach((select) => {
      select.value = value;
    });
  });
});
