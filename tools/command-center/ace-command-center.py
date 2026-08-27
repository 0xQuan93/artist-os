"""Launch the pinned ACE-Step app with the optional QUIL embed treatment.

This adapter deliberately lives outside the ACE-Step checkout. It adds only
presentation and parent-frame sizing behavior; generation, queueing, models,
uploads, and output handling continue to run in the pinned upstream app.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

import gradio as gr


QUIL_EMBED_CSS = r"""
:root {
  color-scheme: dark;
  --quil-mint: 121, 238, 226;
  --quil-line: rgba(190, 244, 238, 0.10);
  --quil-glass: rgba(13, 22, 25, 0.58);
}

html {
  background: #05090a !important;
  scrollbar-color: rgba(var(--quil-mint), 0.28) transparent;
  scrollbar-width: thin;
}

html, body, gradio-app, .gradio-container {
  background-color: #05090a !important;
}

body {
  background:
    radial-gradient(circle at 50% 0%, rgba(var(--quil-mint), 0.035), transparent 34rem),
    linear-gradient(180deg, #070c0e 0%, #05090a 72%) !important;
}

*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(var(--quil-mint), 0.24);
  background-clip: padding-box;
}

.gradio-container {
  max-width: none !important;
  padding: clamp(20px, 3vw, 46px) clamp(18px, 5vw, 76px) 34px !important;
}

.main-header { margin: 0 0 1.15rem !important; }
.main-header h1 {
  margin-bottom: .35rem !important;
  font-size: clamp(1.7rem, 2.4vw, 2.35rem) !important;
  font-weight: 560 !important;
  letter-spacing: -.035em !important;
}
.main-header p { opacity: .52; }

.block, .panel, .form, .accordion, .tabs, .tabitem,
[class*="container"]:has(> .block) {
  border-color: var(--quil-line) !important;
}

.block, .panel, .form, .accordion {
  background: linear-gradient(145deg, rgba(255,255,255,.032), rgba(255,255,255,.012)) !important;
  box-shadow: inset 1px 1px 0 rgba(255,255,255,.035) !important;
  backdrop-filter: blur(22px) saturate(112%);
}

button, .button-primary, .button-secondary {
  border-color: var(--quil-line) !important;
  box-shadow: inset 1px 1px 0 rgba(255,255,255,.035) !important;
}

input, textarea, select {
  border-color: var(--quil-line) !important;
  background-color: rgba(2, 7, 8, .46) !important;
}

@media (max-width: 720px) {
  .gradio-container { padding: 16px 10px 26px !important; }
}
"""


QUIL_EMBED_HEAD = r"""
<meta name="color-scheme" content="dark">
"""


def _install_embed_treatment() -> None:
    """Extend Gradio Blocks without changing ACE-Step's application code."""

    original_init = gr.Blocks.__init__
    original_launch = gr.Blocks.launch
    if getattr(original_init, "_quil_embed", False):
        return

    def embedded_init(self, *args, **kwargs):
        # ACE v0.1.8 still supplies these at Blocks construction time. Gradio
        # 6.2 moved them to launch(), so retain and forward them there.
        css = kwargs.pop("css", None) or ""
        head = kwargs.pop("head", None) or ""
        theme = kwargs.pop("theme", None)
        kwargs["fill_width"] = True
        result = original_init(self, *args, **kwargs)
        self._quil_embed_css = f"{css}\n{QUIL_EMBED_CSS}"
        self._quil_embed_head = f"{head}\n{QUIL_EMBED_HEAD}"
        self._quil_embed_theme = theme
        return result

    def embedded_launch(self, *args, **kwargs):
        launch_css = kwargs.get("css") or ""
        launch_head = kwargs.get("head") or ""
        kwargs["css"] = f"{launch_css}\n{self._quil_embed_css}"
        kwargs["head"] = f"{launch_head}\n{self._quil_embed_head}"
        if kwargs.get("theme") is None and self._quil_embed_theme is not None:
            kwargs["theme"] = self._quil_embed_theme
        return original_launch(self, *args, **kwargs)

    embedded_init._quil_embed = True
    embedded_launch._quil_embed = True
    gr.Blocks.__init__ = embedded_init
    gr.Blocks.launch = embedded_launch


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("ACE-Step pipeline path is required")

    pipeline_path = Path(sys.argv[1]).resolve()
    if pipeline_path.name != "acestep_v15_pipeline.py" or not pipeline_path.is_file():
        raise SystemExit("ACE-Step pipeline path is invalid")

    _install_embed_treatment()
    sys.argv = [str(pipeline_path), *sys.argv[2:]]
    runpy.run_path(str(pipeline_path), run_name="__main__")


if __name__ == "__main__":
    main()
