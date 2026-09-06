/* Behaviour for the "Copy page" control.
 *
 * Every handler is delegated from `document`, because the theme swaps the
 * content in place when instant navigation is on: a listener bound to an
 * element of one page would not survive the move to the next.
 */
(function () {
  "use strict";

  var RESET_AFTER_MS = 2000;

  /* Where the Markdown of a page is written, as an absolute URL. Two data
     attributes say how far the site root is from here and where this page sits
     below it; scripts/emit_markdown.py writes the file to match. The site's own
     name is a third, so this file is the same in every project that carries it. */
  function markdownUrl(widget) {
    var base = (widget.dataset.copyBase || ".").replace(/\/$/, "");
    var page = widget.dataset.copyPage || "";
    var relative = page === "" ? "index.md" : page.replace(/\/$/, "") + ".md";
    return new URL(base + "/" + relative, window.location.href).href;
  }

  function prompt(widget) {
    var title = widget.dataset.copyTitle || document.title;
    var site = widget.dataset.copySite || "project";
    return (
      "Read " +
      markdownUrl(widget) +
      ' -- the "' +
      title +
      '" page of the ' +
      site +
      " documentation -- so I can ask questions about it."
    );
  }

  function destination(widget, name) {
    var question = encodeURIComponent(prompt(widget));
    switch (name) {
      case "markdown":
        return markdownUrl(widget);
      case "chatgpt":
        return "https://chatgpt.com/?hints=search&q=" + question;
      case "claude":
        return "https://claude.ai/new?q=" + question;
      case "perplexity":
        return "https://www.perplexity.ai/search?q=" + question;
      default:
        return markdownUrl(widget);
    }
  }

  function write(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    /* Insecure origins have no clipboard API; the old selection dance still
       works there, which keeps a local preview usable. */
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(area);
      ok ? resolve() : reject(new Error("copy refused"));
    });
  }

  function announce(widget, label, state) {
    var slot = widget.querySelector("[data-copy-label]");
    if (slot) slot.textContent = label;
    if (state) {
      widget.dataset.copyState = state;
    } else {
      delete widget.dataset.copyState;
    }
  }

  function copy(widget) {
    var reset = function () {
      window.setTimeout(function () {
        announce(widget, "Copy page", null);
      }, RESET_AFTER_MS);
    };
    fetch(markdownUrl(widget))
      .then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then(write)
      .then(function () {
        announce(widget, "Copied", "copied");
        reset();
      })
      .catch(function () {
        announce(widget, "Copy failed", null);
        reset();
      });
  }

  function close(widget) {
    var menu = widget.querySelector("[data-copy-menu]");
    var toggle = widget.querySelector("[data-copy-toggle]");
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function closeAll(except) {
    var widgets = document.querySelectorAll(".md-copy-page");
    for (var i = 0; i < widgets.length; i++) {
      if (widgets[i] !== except) close(widgets[i]);
    }
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var widget = target.closest(".md-copy-page");
    if (!widget) {
      closeAll(null);
      return;
    }
    closeAll(widget);

    if (target.closest("[data-copy-action]")) {
      event.preventDefault();
      close(widget);
      copy(widget);
      return;
    }

    var toggle = target.closest("[data-copy-toggle]");
    if (toggle) {
      event.preventDefault();
      var menu = widget.querySelector("[data-copy-menu]");
      if (!menu) return;
      /* The destinations are filled in on the way out rather than at load:
         the page under the widget may have changed since. */
      var links = menu.querySelectorAll("[data-copy-open]");
      for (var i = 0; i < links.length; i++) {
        links[i].href = destination(widget, links[i].dataset.copyOpen);
      }
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
      return;
    }

    if (target.closest("[data-copy-open]")) close(widget);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeAll(null);
  });
})();
