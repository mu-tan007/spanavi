// ============================================================
// 電話発信ユーティリティ（Zoom Phone）
// ============================================================
export const dialPhone = (phoneNumber) => {
  const num = phoneNumber.replace(/[-\s]/g, "");
  const uri = "zoomphonecall://" + num;
  let iframe = document.getElementById("__dial_iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "__dial_iframe";
    iframe.style.display = "none";
    document.body.appendChild(iframe);
  }
  iframe.src = uri;
};
