/*
 * Issues:
 *  1. Focus Mode Highlighting
 *    b. Highlight is cut off for some elements (analytics-fire-recent-pill,
 *       presentation-title)
 *
 * Todo:
 *  1. Implement volume control shortcuts on player screen
 */

"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type WaveSurfer from "wavesurfer.js";
import './KeyboardProvider.css'

/* =========================================================
    KEYBOARD MAPPINGS
========================================================= */
export const KEYMAP = {
  GLOBAL_BINDINGS: {
    SHOW_BINDS  : { key: "H",             desc: "Toggle List of Bindings"},
    SIGN_OUT    : { key: "Q",             desc: "Sign Out" },
    GO_BACK     : { key: "B",             desc: "Back to Previous Page"},
    ESCAPE      : { key: "Escape",        desc: "Cancel" },
    ROUTES: {
      D         : { key: "D",             desc: "Dashboard",  route: "/dashboard"},
      L         : { key: "L",             desc: "Library",    route: "/library"},
      C         : { key: "C",             desc: "Classes",    route: "/classes" },
      S         : { key: "S",             desc: "Search",     route: "/search" },
      A         : { key: "A",             desc: "Analytics",  route: "/analytics"},
      P         : { key: "P",             desc: "Profile",    route: "/profile"},
    },
  },

  NORMAL_MODE: {
    ENTER_FOCUS : { key: "f",             desc: "Enter Focus Mode" },
    SCROLL_DOWN : { key: "j",             desc: "Scroll Down" },
    SCROLL_UP   : { key: "k",             desc: "Scroll Up" },
    SCROLL_TOP  : { key: "t",             desc: "Top of Screen" },
    SCROLL_MID  : { key: "m",             desc: "Middle of Screen" },
    SCROLL_BOT  : { key: "b",             desc: "Bottom of Screen" },
  },

  FOCUS_MODE: {
    EXIT_FOCUS  : { key: ["f", "Escape"], desc: "Exit Focus Mode" },
    NEXT        : { key: "j",             desc: "Next Element" },
    PREV        : { key: "k",             desc: "Previous Element" },
    TOP         : { key: "t",             desc: "Top Visible Element" },
    MIDDLE      : { key: "m",             desc: "Middle Visble Element" },
    BOTTOM      : { key: "b",             desc: "Bottom Visible Element" },
    SELECT      : { key: "Enter",         desc: "Select Element" },
  },

  LIBRARY: {
    NEWEST      : { key: "n",             desc: "Newest First"},
    OLDEST      : { key: "o",             desc: "Oldest First"},
    ALPHA       : { key: "a",             desc: "Alphabetical Order"},
    SMALLEST    : { key: "s",             desc: "Smallest First"},
    LARGEST     : { key: "l",             desc: "Largest First"},
  },

  AUDIO_PLAYER: {
    PLAY_PAUSE  : { key: " ",             desc: "Play / Pause" },
    FORWARD     : { key: [".", ">"],      desc: "Fast Forward" },
    REWIND      : { key: [",", "<"],      desc: "Rewind" },
    VIEW_GRADE  : { key: "v",             desc: "View Grading"},
    GRADE_PRES  : { key: "g",             desc: "Grade Presentation"},
    AUTO_SCROLL : { key: "a",             desc: "Toggle Auto-Scroll"},
  },
} as const;

export default function KeyboardProvider({ children }: { children: React.ReactNode }) {  const router = useRouter();
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  /* =========================================================
      STATE
  ========================================================= */
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusables, setFocusables] = useState<HTMLElement[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [lastFocusedByScope, setLastFocusedByScope] = useState<Record<string, number>>({});
  const [showKeybindings, setShowKeybindings] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  /* =========================================================
      DOM HELPERS
  ========================================================= */

  const getActiveModal = (): HTMLElement | null => {
    return document.querySelector<HTMLElement>(
      ".modal-overlay, .grading-modal-overlay, .rubric-selector-overlay"
    );
  };

  const getScrollContainer = (): HTMLElement | null => {
    const modal = getActiveModal();

    const modalSelectors = [
      ".grading-modal-body",
      ".rubric-form",
      ".rubric-selector-content",
      ".transcript-content-new"
    ];

    const pageSelectors = [
      ".transcript-content-new"
    ];

    const selectors = modal ? modalSelectors : pageSelectors;

    return (
      selectors 
        .map(sel => document.querySelector<HTMLElement>(sel))
        .find(Boolean)
      ?? window
    );
  };

  const getPlayerActionButton = (label: string): HTMLButtonElement | null => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button")
    );

    return buttons.find(
      btn => btn.textContent?.trim() === label
    ) ?? null;
  };

  /* =========================================================
      FOCUSABLE ELEMENTS
  ========================================================= */

  /*
   * Get every HTML element that should be focusable in Focus Mode
   */
  const getFocusableElements = () => {
    const modal = getActiveModal();
    const root: ParentNode = modal ?? document;

    // Excluded HTML Elements
    const excludedSelectors= [
      ".site-header",
      ".modal-header",
      ".modal-close-icon",
      ".player-header-bar",
      ".player-panel",
      ".transcript-controls",
      ".library-b-file-input",
      "input[accept]",
      "input[type='search']"
    ];
    
    // Pre-fetch all excluded containers
    const excludedContainers = excludedSelectors.flatMap(selector =>
      Array.from(document.querySelectorAll(selector))
    );

    return Array.from(
      // Included HTML Elements
      root.querySelectorAll<HTMLElement>(`
        button, 
        a, 
        [role='button'], 
        input:not([type='hidden']), 
        textarea, 
        .library-b-search,
        .library-b-drop,
        .grading-card.completed, 
        .transcript-word-new,
        .rubric-card,
        .search-result-card,
        .grading-dash-card,
        .class-card,
        .class-dash-card,
        .presentation-row
      `)
    ).filter(el => 
      !el.hasAttribute("disabled") &&
      !excludedContainers.some(container => container.contains(el))
    );
  };

  /* =========================================================
      VISIBILITY & VIEWPORT LOGIC
  ========================================================= */

  /*
   * For knowing when a focusable element is hidden 
   * behind a (site or modal) header or the compact hint bar.
   */
  const getViewportOffsets = () => {
    const modal = getActiveModal();

    const header = document.querySelector<HTMLElement>(".site-header");
    const hintBar = document.querySelector<HTMLElement>(".keyboard-hint-bar");

    let topOffset = 0;

    if (modal) {
      const modalHeader = modal.querySelector<HTMLElement>(".modal-header");
      const rubricHeader = document.querySelector<HTMLElement>(".rubric-selector-header");
      const gradingHeader = document.querySelector<HTMLElement>(".grading-modal-header");
      topOffset = Math.max(
        modalHeader?.getBoundingClientRect().bottom ?? 0,
        rubricHeader?.getBoundingClientRect().bottom ?? 0,
        gradingHeader?.getBoundingClientRect().bottom ?? 0
      );
    } else {
      const transcriptHeader = document.querySelector<HTMLElement>(".transcript-controls");

      topOffset = Math.max(
        header?.getBoundingClientRect().bottom ?? 0,
        transcriptHeader?.getBoundingClientRect().bottom ?? 0
      );
    }

    const bottomOffset = hintBar?.offsetHeight ?? 0;

    return { topOffset, bottomOffset };
  };

  /*
   * Check if an HTML element is visible.
   * At least 2/3 of element height must appear within viewport.
   */
  const isElementVisible = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const { topOffset, bottomOffset } = getViewportOffsets();
    const maxHiddenHeight = 0.33 * rect.height;

    return (
      rect.top + maxHiddenHeight > topOffset &&
      rect.bottom - maxHiddenHeight < window.innerHeight - bottomOffset &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  };

  /*
   * Get indicies of HTML elements that are focusable and visible
   */
  const getVisibleIndicies = (elements: HTMLElement[]) => {
    return elements
      .map((el, index) => ({ el, index}))
      .filter(({ el }) => isElementVisible(el))
      .map(({ index }) => index);
  };

  /* =========================================================
      FOCUS MODE CONTROL
  ========================================================= */

  const saveFocusIndex = () => {
    const modal = getActiveModal();
    const scopeKey = modal ? "modal" : pathname;

    if (!modal || (modal && isFocusMode)) {
      setLastFocusedByScope(prev => ({
        ...prev,
        [scopeKey]: focusedIndex
      }));
    }
  };

  const enterFocusMode = () => {
    const els = getFocusableElements();
    if (els.length === 0) return;

    setFocusables(els);

    const modal = getActiveModal();
    const scopeKey = modal ? "modal" : pathname;

    const savedIndex = lastFocusedByScope[scopeKey];

    let nextIndex = 0;

    if (savedIndex !== undefined && savedIndex < els.length) {
      if (isElementVisible(els[savedIndex])) {
        nextIndex = savedIndex;
      } else {
        const visible = getVisibleIndicies(els);
        nextIndex = visible.length > 0 ? visible[0] : 0;
      }
    } else {
      const visible = getVisibleIndicies(els);
      nextIndex = visible.length > 0 ? visible[0] : 0;
    }

    setFocusedIndex(nextIndex);
    setIsFocusMode(true);
  };

  const exitFocusMode = () => {
    setIsFocusMode(false);
    focusables.forEach(el => el.classList.remove("focus-highlight"));
  };

  /* =========================================================
      EFFECTS
  ========================================================= */

  /* 
  * Highlight focused element 
  */
  useEffect(() => {
    if (!isFocusMode || focusables.length === 0) return;

    focusables.forEach(el => el.classList.remove("focus-highlight"));
    const active = focusables[focusedIndex];
    active?.classList.add("focus-highlight");

    const scrollContainer = 
      getScrollContainer() 
      ?? window;

    const visible = getVisibleIndicies(focusables);

    // Scroll element into view only when no elements are visible
    if (visible.length === 0 && active) scrollIntoViewIfNeeded(active, scrollContainer);
  }, [isFocusMode, focusedIndex, focusables]);

  /*
   * Update visible elements when screen moves
   */
  useEffect(() => {
    if (!isFocusMode) return;

    const handleScroll = () => {
      const visible = getVisibleIndicies(focusables);

      // Move to first visible focusable element
      // if last focused index is offscreen
      if (!isElementVisible(focusables[focusedIndex])) {
        if (visible.length > 0) {
          setFocusedIndex(visible[0]);
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isFocusMode, focusables, focusedIndex]);

  /*
   * Reset focused index when route changes
   */
  useEffect(() => {
    if (prevPathRef.current && prevPathRef.current !== pathname) {
      // Clear stored focus index when leaving a screen
      setLastFocusedByScope({});
      setIsFocusMode(false);
    }

    prevPathRef.current = pathname;
  }, [pathname]);

  /*
   * Exit Focus Mode on mouse click or wheel
   */
  useEffect(() => {
    if (!isFocusMode) return;

    const exitOnMouseAction = (e: Event) => {
      exitFocusMode();
    };

    window.addEventListener("mousedown", exitOnMouseAction);
    window.addEventListener("wheel", exitOnMouseAction, { passive: true });

    return () => {
      window.removeEventListener("mousedown", exitOnMouseAction);
      window.removeEventListener("wheel", exitOnMouseAction);
    };
  }, [isFocusMode, focusables]);

  /*
   * Modal open/close detection
   */
  useEffect(() => {
    const checkModal = () => {
      const modal = getActiveModal();

      const isVisible = !!(
        modal &&
        modal.getBoundingClientRect().height > 0
      );

      setIsModalOpen(!!isVisible);
    };

    window.addEventListener("click", checkModal);
    window.addEventListener("keydown", checkModal);

    checkModal();

    return () => {
      window.removeEventListener("click", checkModal);
      window.removeEventListener("keydown", checkModal);
    };
  }, []);

  /*
   * Reset modal index when closed
   */
  useEffect(() => {
    if (!isModalOpen) {
      setLastFocusedByScope(prev => {
        const next = { ...prev };
        delete next["modal"];
        return next;
      });

      exitFocusMode();
    }
  }, [isModalOpen]);

  /* =========================================================
      SCROLL LOGIC
  ========================================================= */

  /*
   * Scroll page if focused element is offscreen
   */
  const scrollIntoViewIfNeeded = (
    el: HTMLElement, 
    container: HTMLElement | Window = window
  ) => {
    const rect = el.getBoundingClientRect();

    const isWindow = container instanceof Window;

    const containerRect = isWindow
      ? { top: 0, bottom: window.innerHeight }
      : container.getBoundingClientRect();

    const scrollTop = isWindow ? window.scrollY : container.scrollTop;

    const viewportTop = isWindow
      ? getViewportOffsets().topOffset
      : containerRect.top + (
          container.querySelector<HTMLElement>(".modal-header")?.offsetHeight ?? 0
        );

    const viewportBottom = isWindow
      ? window.innerHeight - getViewportOffsets().bottomOffset
      : containerRect.bottom;

    const offsetTop = rect.top - containerRect.top + scrollTop;

    // Above viewport
    if (rect.top < viewportTop) {
      const scrollTo = offsetTop - (viewportTop - containerRect.top);
      isWindow
        ? window.scrollBy({ top: scrollTo - scrollTop, behavior: "smooth" })
        : container.scrollTo({ top: scrollTo, behavior: "smooth" });
    }

    // Below viewport
    else if (rect.bottom > viewportBottom) {
      const scrollTo = offsetTop - (viewportBottom - containerRect.top) + rect.height;
      isWindow
        ? window.scrollBy({ top: scrollTo - scrollTop, behavior: "smooth" })
        : container.scrollTo({ top: scrollTo, behavior: "smooth" });
    }
  };

  /* =========================================================
     KEYBOARD HANDLER 
  ========================================================= */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      const modal = getActiveModal();

      /*
       * Escape Key
       */
      if (e.key === KEYMAP.GLOBAL_BINDINGS.ESCAPE.key && !isFocusMode) {
        if (isTyping) {
          e.preventDefault();

          // Exit text box
          target.blur();

          return;
        }
        if (modal) {
          e.preventDefault();

          // Close modal
          modal?.dispatchEvent(
            new MouseEvent("click", { bubbles: true })
          );

          return;
        }
      }

      /* =========================================================
         SHIFT+KEY GLOBAL SHORTCUTS
      ========================================================= */
      if (e.shiftKey && !isTyping) {
        // Jump to route in GLOBAL_BINDINGS.ROUTES
        const routeObj = KEYMAP.GLOBAL_BINDINGS.ROUTES[
          e.key.toUpperCase() as keyof typeof KEYMAP.GLOBAL.ROUTES
        ];

        if (routeObj) {
          e.preventDefault();
          const routePath = routeObj.route;
          if (pathname !== routePath) router.push(routePath);
          return;
        }

        // Go back
        if (e.key.toUpperCase() === KEYMAP.GLOBAL_BINDINGS.GO_BACK.key) {
          e.preventDefault();

          if (isFocusMode) exitFocusMode();

          router.back();
          return;
        }

        // Sign out
        if (e.key.toUpperCase() === KEYMAP.GLOBAL_BINDINGS.SIGN_OUT.key) {
          e.preventDefault();

          const signOutButton = Array.from(
            document.querySelectorAll<HTMLButtonElement>(".auth-button")
          ).find(btn => btn.textContent?.trim().includes("Sign out"));
          signOutButton?.click();

          exitFocusMode();
          return;
        }

        // Show keybindings
        if (e.key.toUpperCase() === KEYMAP.GLOBAL_BINDINGS.SHOW_BINDS.key) {
            setShowKeybindings(v => !v);
            return;
        }
      }

      /* =========================================================
         FOCUS MODE SHORTCUTS
      ========================================================= */
      if (isFocusMode) {
        const active = focusables[focusedIndex];
        if (!active) return;

        switch (e.key) {
          case KEYMAP.FOCUS_MODE.EXIT_FOCUS.key[0]:
          case KEYMAP.FOCUS_MODE.EXIT_FOCUS.key[1]:
            e.preventDefault();
            saveFocusIndex();

            exitFocusMode();
            break;

          case KEYMAP.FOCUS_MODE.NEXT.key: {
            e.preventDefault();
            // Jump to next visible focusable element
            const visible = getVisibleIndicies(focusables);

            setFocusedIndex(current => {
              const i = visible.indexOf(current);
              return visible[(i + 1) % visible.length];
            });
            break;
          }

          case KEYMAP.FOCUS_MODE.PREV.key: {
            e.preventDefault();
            // Jump to previous visible focusable element
            const visible = getVisibleIndicies(focusables);

            setFocusedIndex(current => {
              const i = visible.indexOf(current);
              return visible[(i - 1 + visible.length) % visible.length];
            });
            break;
          }

          case KEYMAP.FOCUS_MODE.TOP.key: {
            e.preventDefault();
            // Jump to first visible focusable element
            const visible = getVisibleIndicies(focusables);
            if (visible.length > 0) {
              setFocusedIndex(visible[0]);
            }
            break;
          }

          case KEYMAP.FOCUS_MODE.MIDDLE.key: {
            e.preventDefault();
            // Jump to middle visible focusable element
            const visible = getVisibleIndicies(focusables);
            if (visible.length > 0) {
              const mid = Math.floor(visible.length / 2);
              setFocusedIndex(visible[mid]);
            }
            break;
          }

          case KEYMAP.FOCUS_MODE.BOTTOM.key: {
            e.preventDefault();
            // Jump to bottom visible focusable element
            const visible = getVisibleIndicies(focusables);
            if (visible.length > 0) {
              setFocusedIndex(visible[visible.length - 1]);
            }
            break;
          }

          case KEYMAP.FOCUS_MODE.SELECT.key:
            e.preventDefault();
            saveFocusIndex();

            if (active.tagName === "INPUT" || active.tagName === "TEXTAREA") {
              // Enter text
              (active as HTMLInputElement | HTMLTextAreaElement).focus();
            } else {
              // Select focused element
              active.click();
            }

            exitFocusMode();
            break;
        }

        return;
      }

      /*
       *  Entering Focus Mode
       */
      if (e.key === KEYMAP.NORMAL_MODE.ENTER_FOCUS.key 
          && !isTyping && !isFocusMode) {
        e.preventDefault();
        enterFocusMode();
        return;
      }

      /* =========================================================
          LIBRARY SCREEN SHORTCUTS
      ========================================================= */
      if (!isTyping && !isFocusMode && pathname.startsWith("/library")) {
        const sortSelect = document.querySelector<HTMLSelectElement>(".library-b-sort");
        if (sortSelect) {
          switch (e.key) {
            case KEYMAP.LIBRARY.NEWEST.key:
              e.preventDefault();
              sortSelect.value = "newest";
              sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
              break;

            case KEYMAP.LIBRARY.OLDEST.key:
              e.preventDefault();
              sortSelect.value = "oldest";
              sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
              break;

            case KEYMAP.LIBRARY.ALPHA.key:
              e.preventDefault();
              sortSelect.value = "alphabetical";
              sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
              break;

            case KEYMAP.LIBRARY.SMALLEST.key:
              e.preventDefault();
              sortSelect.value = "smallest";
              sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
              break;

            case KEYMAP.LIBRARY.LARGEST.key:
              e.preventDefault();
              sortSelect.value = "largest";
              sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
              break;
          }
        }
      }

      /* =========================================================
          PLAYER SCREEN SHORTCUTS
      ========================================================= */
      if (!isTyping && !isFocusMode && pathname.startsWith("/player")) {
        const ws: WaveSurfer | null = (window as any).wavesurferInstance;
        const playButton = document.querySelector<HTMLButtonElement>(".play-btn");

        switch (e.key) {
          case KEYMAP.AUDIO_PLAYER.PLAY_PAUSE.key:
            // Pause/play
            e.preventDefault();
            if (ws) ws.playPause();
            else playButton?.click();
            break;

          case KEYMAP.AUDIO_PLAYER.FORWARD.key[0]:
          case KEYMAP.AUDIO_PLAYER.FORWARD.key[1]:
            // Fast forward 10s
            e.preventDefault();
            if (ws) {
              const time = ws.getCurrentTime() + 10;
              const duration = ws.getDuration();
              ws.seekTo(Math.min(time / duration, 1));
            }
            break;

          case KEYMAP.AUDIO_PLAYER.REWIND.key[0]:
          case KEYMAP.AUDIO_PLAYER.REWIND.key[1]:
            // Rewind 10s
            e.preventDefault();
            if (ws) {
              const time = ws.getCurrentTime() - 10;
              const duration = ws.getDuration();
              ws.seekTo(Math.max(time / duration, 0));
            }
            break;

          case KEYMAP.AUDIO_PLAYER.VIEW_GRADE.key: {
            e.preventDefault();
            const btn = getPlayerActionButton("View Grading");
            btn?.click();
            break;
          }

          case KEYMAP.AUDIO_PLAYER.GRADE_PRES.key: {
            e.preventDefault();
            let btn = getPlayerActionButton("Grade Presentation");
            if (!btn) btn = getPlayerActionButton("Practice Grade");
            btn?.click();
            break;
          }

          case KEYMAP.AUDIO_PLAYER.AUTO_SCROLL.key: {
            e.preventDefault();
            const btn = document.querySelector<HTMLButtonElement>(".auto-scroll-toggle");
            btn?.click();
            break;
          }
        }
      }

      /* =========================================================
         PAGE NAVIGATION
      ========================================================= */
      if (!isTyping && !isFocusMode) {
          const scrollContainer = getScrollContainer() 
            ?? document.scrollingElement ?? document.body;

        switch (e.key) {
          case KEYMAP.NORMAL_MODE.SCROLL_DOWN.key:
            e.preventDefault();
            scrollContainer.scrollBy({ top: 120, behavior: "smooth" });
            break;

          case KEYMAP.NORMAL_MODE.SCROLL_UP.key:
            e.preventDefault();
            scrollContainer.scrollBy({ top: -120, behavior: "smooth" });
            break;

          case KEYMAP.NORMAL_MODE.SCROLL_TOP.key:
            e.preventDefault();
            scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
            break;

          case KEYMAP.NORMAL_MODE.SCROLL_MID.key:
            e.preventDefault();
            if (scrollContainer === window) {
              const scrollHeight = document.documentElement.scrollHeight;
              const clientHeight = window.innerHeight;

              window.scrollTo({
                top: (scrollHeight - clientHeight) / 2,
                behavior: "smooth",
              });
            } else {
              const el = scrollContainer as HTMLElement;

              el.scrollTo({
                top: (el.scrollHeight - el.clientHeight) / 2,
                behavior: "smooth",
              });
            }
            break;

          case KEYMAP.NORMAL_MODE.SCROLL_BOT.key:
            e.preventDefault();
            scrollContainer.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pathname, router, isFocusMode, focusables, focusedIndex]);

  /* =========================================================
     UI
  ========================================================= */

  function ShortcutRow({
    desc,
    keys,
  }: {
    desc: string;
    keys: string[];
  }) {
    return (
      <div className="shortcut-row">
        <div className="shortcut-desc">{desc}</div>

        <div className="shortcut-keys">
          {keys.map((key, i) => (
            <span key={i} className="shortcut-key-group">
              <kbd>{key}</kbd>
              {i < keys.length - 1 && (
                <span className="shortcut-slash">/</span>
              )}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {children}

      {/* Compact Hint Bar*/}
      <div className="keyboard-hint-bar">
        <span className="hint-toggle">
          <span className="hint-text">Press</span>
          <kbd>{KEYMAP.GLOBAL_BINDINGS.SHOW_BINDS.key}</kbd>
          <span className="hint-text">to toggle the full list of keyboard shortcuts</span>
        </span>

        <span className="hint-separator">•</span>
        <span className="mode-label">
          {isFocusMode ? "Focus Mode" : "Normal Mode"}
        </span>
      </div>

      {/* Shortcuts Panel */}
      {showKeybindings && (
        <div className="shortcuts-overlay">
          <div className="shortcuts-container">
            <h2 className="shortcuts-title">Keyboard Shortcuts</h2>

            <div className="shortcuts-grid">
              {Object.entries(KEYMAP).map(([modeKey, modeObj]) => (
                <div key={modeKey} className="shortcut-section">
                  <div className="section-title">
                    {modeKey.replace(/_/g, " ")}
                  </div>
                  <div className="section-divider" />

                  {modeKey === "GLOBAL_BINDINGS" ? (
                    <>
                      {Object.entries(modeObj.ROUTES).map(([k, v]) => (
                        <ShortcutRow
                          key={k}
                          desc={v.desc}
                          keys={[v.key]}
                        />
                      ))}
                      <ShortcutRow
                        desc={modeObj.GO_BACK.desc}
                        keys={[modeObj.GO_BACK.key]}
                      />
                      <ShortcutRow
                        desc={modeObj.SIGN_OUT.desc}
                        keys={[modeObj.SIGN_OUT.key]}
                      />
                    </>
                  ) : (
                    Object.entries(modeObj).map(([k, v]) => {
                      const keyArray = Array.isArray(v.key)
                        ? v.key
                        : [v.key];

                      return (
                        <ShortcutRow
                          key={k}
                          desc={v.desc}
                          keys={keyArray.map(kItem =>
                            kItem === " " ? "Space" : kItem
                          )}
                        />
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
