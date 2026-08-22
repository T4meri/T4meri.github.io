(function () {
  const BLOCK_TOKEN = /(?:<p>)?@@SPARKBLOCK(\d+)@@(?:<\/p>)?/g;

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function inline(text) {
    return text
      .replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function renderBlocks(source) {
    const html = [];
    let list = null;
    let paragraph = [];

    function flushParagraph() {
      if (paragraph.length === 0) return;
      html.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }

    function flushList() {
      if (!list) return;
      const items = list.items.map((item) => `<li>${inline(item)}</li>`).join('');
      html.push(`<${list.tag}>${items}</${list.tag}>`);
      list = null;
    }

    for (const line of source.split('\n')) {
      const trimmed = line.trim();

      if (trimmed === '') {
        flushParagraph();
        flushList();
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = Math.min(heading[1].length + 1, 6);
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        continue;
      }

      const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
      const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);

      if (bullet || numbered) {
        flushParagraph();
        const tag = bullet ? 'ul' : 'ol';
        if (!list || list.tag !== tag) {
          flushList();
          list = { tag, items: [] };
        }
        list.items.push((bullet || numbered)[1]);
        continue;
      }

      flushList();
      paragraph.push(trimmed);
    }

    flushParagraph();
    flushList();
    return html.join('');
  }

  function render(markdown) {
    const blocks = [];

    const withPlaceholders = String(markdown == null ? '' : markdown).replace(
      /```([\w+-]*)[^\S\n]*\n?([\s\S]*?)(?:```|$)/g,
      (_, lang, code) => {
        const index = blocks.length;
        const attribute = ` data-lang="${escapeHtml(lang || 'code')}"`;
        blocks.push(`<pre${attribute}><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
        return `\n\n@@SPARKBLOCK${index}@@\n\n`;
      }
    );

    const html = renderBlocks(escapeHtml(withPlaceholders));
    return html.replace(BLOCK_TOKEN, (_, index) => blocks[Number(index)]);
  }

  window.SparkMarkdown = { render };
})();
