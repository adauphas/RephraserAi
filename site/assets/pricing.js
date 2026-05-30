document.querySelectorAll(".plan-extra").forEach((details) => {
  details.addEventListener("mouseenter", () => {
    details.open = true;
  });

  details.addEventListener("mouseleave", () => {
    details.open = false;
  });

  details.addEventListener("focusin", () => {
    details.open = true;
  });

  details.addEventListener("focusout", (event) => {
    if (!details.contains(event.relatedTarget)) {
      details.open = false;
    }
  });
});
