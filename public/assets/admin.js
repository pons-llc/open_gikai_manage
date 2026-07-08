// 管理側 JS（フォームの出し分け・資料アップロード等の UX 向上用）。
// サーバ側バリデーションで担保するため、JS 無効時も送信自体は成立させる（design.md §6.3）。

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
