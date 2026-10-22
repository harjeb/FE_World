// Clipboard API requires a secure context; older/HTTP browsers can still offer copy.
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* Try the legacy path, but never claim success unless it succeeds. */ }
  const previous = document.activeElement as HTMLElement | null;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-9999px;top:0';
  try {
    document.body.appendChild(field);
    field.focus();
    field.select();
    if (!document.execCommand('copy')) throw new Error('复制失败，请显示令牌后手动选中复制');
  } finally {
    field.remove();
    previous?.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
