// ============================================================
// 電話発信ユーティリティ（Zoom Phone）
// ============================================================
export const dialPhone = (phoneNumber) => {
  const num = phoneNumber.replace(/[-\s]/g, "");
  const uri = "zoomphonecall://" + num;
  const a = document.createElement("a");
  a.href = uri;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
