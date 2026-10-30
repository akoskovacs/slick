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

  // The message box: `@` suggests who to mention — a person, a bot or a
  // team, each with a word on what it is — a `/` at the start of a
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
            .map((each) => ({ label: "@" + each.name, detail: each.detail, insert: "@" + each.name + " " }))
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

  // A message arriving, sounded: the lists of messages — the pane's and
  // the thread's — keep their element across patches, so a message that
  // appears in one, written by somebody else, has just been received. The
  // list says which conversation or thread it shows (`data-room`); a new
  // one — a conversation opened, a thread opened — is where listening
  // starts, not a message, even when the one before was empty. A browser
  // lets a page make sound only after its person has touched it; the
  // promise `play` returns says no, and is let go.
  let chime = null;

  Metro.hooks.Chime = {
    mounted() {
      this.room = this.el.dataset.room;
      this.seen = new Set(this.read());
    },

    updated() {
      const present = this.read();
      const fresh = present.filter((id) => !this.seen.has(id));
      const moved = this.el.dataset.room !== this.room;
      this.room = this.el.dataset.room;
      this.seen = new Set(present);
      if (moved || fresh.length === 0) return;
      const arrived = fresh.some((id) => {
        const said = document.getElementById(id);
        return said && !said.classList.contains("own");
      });
      if (arrived) this.ring();
    },

    read() {
      return Array.from(this.el.querySelectorAll("article.message")).map((each) => each.id);
    },

    ring() {
      chime = chime || new Audio("/notification.mp3");
      chime.currentTime = 0;
      chime.play().catch(() => {});
    },
  };

  // A form sent as soon as a choice in it changes, as Slack saves a
  // role the moment it is picked: its submit button stays for the
  // keyboard, out of sight.
  Metro.hooks.Instant = {
    mounted() {
      this.el.addEventListener("change", () => this.el.requestSubmit());
    },
  };

  // A moment, `data-at` milliseconds since 1970, shown in the viewer's own
  // time: the time of day (`data-shows="clock"`, "14:51") or the day with
  // it ("day", "2026-10-21 14:51"). The server writes it in UTC, which a
  // patch may put back: it is shown again after every one.
  Metro.hooks.Moment = {
    mounted() {
      this.show();
    },

    updated() {
      this.show();
    },

    show() {
      const at = Number(this.el.dataset.at);
      if (!at) return;
      const moment = new Date(at);
      const two = (number) => String(number).padStart(2, "0");
      const clock = `${two(moment.getHours())}:${two(moment.getMinutes())}`;
      const day = `${moment.getFullYear()}-${two(moment.getMonth() + 1)}-${two(moment.getDate())}`;
      const shown = this.el.dataset.shows === "day" ? `${day} ${clock}` : clock;
      if (this.el.textContent !== shown) this.el.textContent = shown;
      this.el.setAttribute("datetime", moment.toISOString());
    },
  };
})();
