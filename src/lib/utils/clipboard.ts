export function copyToClipboard(text: string, label?: string) {
    if (!text) return;
    try {
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(
                () => {
                    if (label) {
                        console.log(`Copied ${label} to clipboard`);
                    }
                },
                (err) => {
                    console.warn("Clipboard write failed", err);
                    alert("Failed to copy to clipboard");
                }
            );
            return;
        }
    } catch {
        // fall through
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
        document.execCommand("copy");
        if (label) console.log(`Copied ${label} to clipboard (fallback)`);
    } catch (err) {
        console.warn("execCommand copy failed", err);
        alert("Failed to copy to clipboard");
    } finally {
        document.body.removeChild(ta);
    }
}
