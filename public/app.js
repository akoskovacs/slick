// Slick's own behaviour in the page, as Metro hooks (`data-live-hook`): the
// server renders, and these only add what a browser has to do itself.
// Kept small and shaped as plain lifecycle objects, so each can be written
// in Kex once Kex compiles to JavaScript.
(function () {
  "use strict";

  const Metro = (window.Metro = window.Metro || {});
  Metro.hooks = Metro.hooks || {};

  // How many suggestions are shown at once.
  const SHOWN = 8;

  // The message box: `@` suggests who to mention, a `/` at the start of a
  // message suggests a slash command. What it may suggest is the form's
  // `data-mentions` and `data-commands`, JSON the server renders — read on
  // every keystroke, so it is always what the page says now.
  //
  // Arrows move, Enter or Tab takes the suggestion, Escape closes. The
  // list lives on `document.body`: a patch would take it out of the form.
  Metro.hooks.Composer = {
    mounted() {
      this.menu = document.createElement("ul");
      this.menu.className = "completions";
      this.menu.hidden = true;
      this.menu.setAttribute("role", "listbox");
      document.body.appendChild(this.menu);
      this.options = [];
      this.chosen = 0;

      this.onInput = () => this.suggest();
      this.onKey = (key) => this.steer(key);
      this.onLeave = () => setTimeout(() => this.close(), 150);
      this.menu.addEventListener("mousedown", (press) => {
        const item = press.target.closest("li");
        if (!item) return;
        press.preventDefault();
        this.take(Number(item.dataset.index));
      });
      this.attach();
    },

    updated() {
      // The box is the same element after a patch; if not, follow the new one.
      if (this.field !== this.box()) this.attach();
    },

    destroyed() {
      this.detach();
      this.menu.remove();
    },

    box() {
      return this.el.querySelector("textarea");
    },

    attach() {
      this.detach();
      this.field = this.box();
      if (!this.field) return;
      this.field.addEventListener("input", this.onInput);
      this.field.addEventListener("keydown", this.onKey);
      this.field.addEventListener("blur", this.onLeave);
    },

    detach() {
      if (!this.field) return;
      this.field.removeEventListener("input", this.onInput);
      this.field.removeEventListener("keydown", this.onKey);
      this.field.removeEventListener("blur", this.onLeave);
      this.field = null;
    },

    listed(name) {
      try {
        return JSON.parse(this.el.dataset[name] || "[]");
      } catch (broken) {
        return [];
      }
    },

    // What is being typed before the caret, and what it could become.
    suggest() {
      const before = this.field.value.slice(0, this.field.selectionStart);
      const command = before.match(/^\/([a-z0-9-]*)$/);
      const mention = before.match(/(^|\s)@([^@\n]{0,40})$/);
      if (command) {
        const typed = command[1];
        this.offer(
          before.length,
          this.listed("commands")
            .filter((each) => each.name.startsWith(typed))
            .map((each) => ({
              label: "/" + each.name,
              detail: [each.bot && "@" + each.bot, each.description].filter(Boolean).join(" — "),
              insert: each.insert,
            }))
        );
      } else if (mention) {
        const typed = mention[2].toLowerCase();
        this.offer(
          typed.length + 1,
          this.listed("mentions")
            .filter((each) => each.name.toLowerCase().startsWith(typed))
            .map((each) => ({ label: "@" + each.name, detail: each.bot ? "bot" : "", insert: "@" + each.name + " " }))
        );
      } else {
        this.close();
      }
    },

    // Shows `options`, each replacing the `replacing` characters before the caret.
    offer(replacing, options) {
      this.options = options.slice(0, SHOWN);
      this.replacing = replacing;
      this.chosen = 0;
      if (this.options.length === 0) return this.close();
      this.menu.replaceChildren(
        ...this.options.map((option, index) => {
          const item = document.createElement("li");
          item.dataset.index = String(index);
          item.setAttribute("role", "option");
          const label = document.createElement("strong");
          label.textContent = option.label;
          item.appendChild(label);
          if (option.detail) {
            const detail = document.createElement("span");
            detail.textContent = option.detail;
            item.appendChild(detail);
          }
          return item;
        })
      );
      this.highlight();
      const place = this.field.getBoundingClientRect();
      this.menu.style.left = place.left + "px";
      this.menu.style.bottom = window.innerHeight - place.top + 6 + "px";
      this.menu.style.minWidth = Math.min(place.width, 420) + "px";
      this.menu.hidden = false;
    },

    highlight() {
      Array.from(this.menu.children).forEach((item, index) => {
        item.classList.toggle("chosen", index === this.chosen);
        item.setAttribute("aria-selected", String(index === this.chosen));
      });
    },

    // Keys while the list is open; before Metro's own, so Enter takes a
    // suggestion rather than sending the message.
    steer(key) {
      if (this.menu.hidden) return;
      const moves = { ArrowDown: 1, ArrowUp: -1 };
      if (key.key in moves) {
        this.chosen = (this.chosen + moves[key.key] + this.options.length) % this.options.length;
        this.highlight();
      } else if (key.key === "Enter" || key.key === "Tab") {
        this.take(this.chosen);
      } else if (key.key === "Escape") {
        this.close();
      } else {
        return;
      }
      key.preventDefault();
      key.stopPropagation();
    },

    take(index) {
      const option = this.options[index];
      if (!option) return;
      const end = this.field.selectionStart;
      const start = end - this.replacing;
      this.field.value = this.field.value.slice(0, start) + option.insert + this.field.value.slice(end);
      const caret = start + option.insert.length;
      this.field.setSelectionRange(caret, caret);
      this.field.focus();
      this.close();
      // Like typing: the draft is kept, and others see somebody typing.
      this.field.dispatchEvent(new Event("input", { bubbles: true }));
    },

    close() {
      this.menu.hidden = true;
      this.options = [];
    },
  };
})();
