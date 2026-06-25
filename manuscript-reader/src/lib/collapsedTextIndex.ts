// One-pass whitespace-collapsed index for a DOM subtree — reused for many needle lookups.

export interface CollapsedTextIndex {
  findRange(needle: string): Range | null;
}

export function buildCollapsedTextIndex(root: HTMLElement): CollapsedTextIndex {
  const map: { node: Text; offset: number }[] = [];
  let lastWasSpace = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    for (let i = 0; i < node.nodeValue!.length; i++) {
      const ch = node.nodeValue![i];
      if (/\s/.test(ch)) {
        if (lastWasSpace) continue;
        lastWasSpace = true;
        map.push({ node, offset: i });
      } else {
        lastWasSpace = false;
        map.push({ node, offset: i });
      }
    }
  }
  const collapsed = map.map(m => (/\s/.test(m.node.nodeValue![m.offset]) ? ' ' : m.node.nodeValue![m.offset])).join('');

  return {
    findRange(needle: string): Range | null {
      const normNeedle = needle.replace(/\s+/g, ' ').trim();
      if (normNeedle.length < 4) return null;
      const hitStart = collapsed.indexOf(normNeedle);
      if (hitStart === -1) return null;
      const hitEnd = hitStart + normNeedle.length;
      if (hitEnd > map.length) return null;
      const range = document.createRange();
      const startM = map[hitStart];
      const endM = map[hitEnd - 1];
      range.setStart(startM.node, startM.offset);
      range.setEnd(endM.node, endM.offset + 1);
      return range;
    },
  };
}
