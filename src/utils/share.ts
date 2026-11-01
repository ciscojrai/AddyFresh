/**
 * Safely share content using Web Share API with graceful handling
 * of user cancellation (AbortError) and clipboard fallback.
 */
export async function safeShare(data: ShareData): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (err: unknown) {
      // User cancelling the share sheet rejects with AbortError - this is expected behavior
      if (
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message.toLowerCase().includes('abort') ||
          err.message.toLowerCase().includes('cancel'))
      ) {
        return;
      }
    }
  }

  // Fallback to copying URL or text to clipboard if navigator.share is unavailable or failed
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    const textToCopy = data.url || data.text || data.title;
    if (textToCopy) {
      try {
        await navigator.clipboard.writeText(textToCopy);
      } catch {
        // Silently catch clipboard errors (e.g. inside restricted sandboxes)
      }
    }
  }
}
