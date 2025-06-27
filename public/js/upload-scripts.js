/**
 * Bamboo UI - Upload Scripts
 *
 * This file consolidates all client-side JavaScript for the upload pages.
 * It uses modern JS practices, including event delegation for performance and
 * robustness, and is compliant with a strict Content Security Policy (CSP)
 * by avoiding inline scripts entirely.
 *
 * Following 2025 best practices for:
 * - Event delegation patterns
 * - Accessibility (WCAG 2.2)
 * - Error handling
 * - Performance optimization
 */
document.addEventListener('DOMContentLoaded', () => {
  // --- A. UPLOAD FORM HANDLING ---
  // Handles file input changes and form submission for the upload form page
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    const fileInput = document.getElementById('file');
    const submitBtn = document.getElementById('submitBtn');
    const fileLabelText = document.getElementById('file-label-text');

    if (fileInput && submitBtn && fileLabelText) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
          fileLabelText.textContent = fileInput.files[0].name;
          submitBtn.disabled = false;
        } else {
          fileLabelText.textContent = 'Click to browse or drag file here';
          submitBtn.disabled = true;
        }
      });

      uploadForm.addEventListener('submit', () => {
        if (fileInput.files.length > 0) {
          submitBtn.setAttribute('aria-busy', 'true');
          submitBtn.disabled = true;
        }
      });
    }
  }

  // --- B. AI COPY-TO-CLIPBOARD FUNCTIONALITY ---
  // Shared status element for accessibility (ARIA live region)
  let copyStatusElement = null;

  function getCopyStatusElement() {
    if (!copyStatusElement) {
      copyStatusElement = document.createElement('div');
      copyStatusElement.className = 'copy-status';
      copyStatusElement.setAttribute('role', 'status');
      copyStatusElement.setAttribute('aria-live', 'polite');
      copyStatusElement.setAttribute('aria-atomic', 'true');
      document.body.appendChild(copyStatusElement);
    }
    return copyStatusElement;
  }

  // Fallback copy method for older browsers (execCommand approach)
  function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // Prevent screen readers from announcing the temporary text area
    textArea.setAttribute('aria-hidden', 'true');

    // Styles to make the element minimally intrusive
    Object.assign(textArea.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '2em',
      height: '2em',
      padding: '0',
      border: 'none',
      outline: 'none',
      boxShadow: 'none',
      background: 'transparent',
      opacity: '0',
    });

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (!successful) {
        throw new Error('execCommand returned false');
      }
    } finally {
      document.body.removeChild(textArea);
    }
  }

  // Provides visual and ARIA feedback for copy actions
  function showCopyFeedback(button, message, isError = false) {
    const originalText = button.textContent;
    const originalAriaLabel = button.getAttribute('aria-label');
    const statusElement = getCopyStatusElement();

    button.textContent = message;
    button.setAttribute('aria-label', message);
    button.classList.toggle('copied', !isError);
    button.disabled = true;

    // Update ARIA live region for screen readers
    statusElement.textContent = isError
      ? 'Copy failed. Please try again.'
      : 'Message copied to clipboard';

    setTimeout(() => {
      button.textContent = originalText;
      button.setAttribute('aria-label', originalAriaLabel || 'Copy message');
      button.classList.remove('copied');
      button.disabled = false;
      statusElement.textContent = ''; // Clear status
    }, 2000);
  }

  // --- C. EVENT DELEGATION FOR ALL BUTTON INTERACTIONS ---

  // Handler for copy button functionality
  async function handleCopyButtonClick(target) {
    const targetSelector = target.dataset.copyTarget;
    const textElement = document.querySelector(targetSelector);
    if (!textElement) {
      console.warn('Copy target element not found:', targetSelector);
      return;
    }

    const textToCopy = textElement.textContent.trim();

    try {
      // Try modern Clipboard API first
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        fallbackCopyToClipboard(textToCopy);
      }
      showCopyFeedback(target, 'Copied!');
    } catch (err) {
      console.error('Copy failed:', err);
      showCopyFeedback(target, 'Copy failed', true);
    }
  }

  // Handler for reload button functionality
  function handleReloadButtonClick() {
    window.location.reload();
  }

  // Single event listener using modern event delegation pattern
  document.body.addEventListener('click', async (event) => {
    const target = event.target;

    // Handle "Copy for AI" button clicks
    if (target.matches?.('.copy-btn')) {
      event.preventDefault();
      await handleCopyButtonClick(target);
      return;
    }

    // Handle "Try Again" or "Reload" button clicks
    if (target.id === 'tryAgainBtn' || target.id === 'reloadBtn') {
      event.preventDefault();
      handleReloadButtonClick();
      return;
    }
  });

  // Note: Initialization happens automatically through event delegation above.
  // The status element for copy feedback is created just-in-time when first needed.
});
