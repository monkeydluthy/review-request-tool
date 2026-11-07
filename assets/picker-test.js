(function () {
  const out = document.getElementById("out");
  const log = (m) => { out.textContent += "\n" + m; };
  out.textContent =
    "contacts in navigator: " + ("contacts" in navigator) +
    "\nContactsManager in window: " + ("ContactsManager" in window) +
    "\nsecure context: " + window.isSecureContext +
    "\nbrowser: " + navigator.userAgent;
  if (navigator.contacts && navigator.contacts.getProperties) {
    navigator.contacts.getProperties().then((p) => log("supported properties: " + p.join(", ")))
      .catch((e) => log("getProperties error: " + e));
  }
  async function run(props, multiple) {
    log("\n--- picking " + props.join("+") + " multiple=" + multiple);
    try {
      const r = await navigator.contacts.select(props, { multiple });
      log("returned " + r.length + " contact(s)");
      log(JSON.stringify(r));
    } catch (e) {
      log("error: " + (e && e.name) + " - " + (e && e.message));
    }
  }
  document.getElementById("a").onclick = () => run(["name", "tel"], false);
  document.getElementById("b").onclick = () => run(["name", "tel"], true);
  document.getElementById("c").onclick = () => run(["tel"], false);
})();
