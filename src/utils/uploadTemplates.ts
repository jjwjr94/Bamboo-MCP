/**
 * Upload template utilities for rendering HTML responses and categorizing upload errors.
 * This module contains all the HTML template generation and error categorization logic
 * for the creative asset upload functionality.
 */

import { escapeHtml } from './securityUtils.js';

export type UploadSuccessResult = {
  assetType: string;
  metaAssetId: string;
};

// CSS styles for the Copy-to-AI functionality
const AI_COPY_STYLES = `
  .ai-copy-container {
    margin: var(--bamboo-space-6) 0;
    padding: var(--bamboo-space-4);
    background-color: var(--bamboo-color-background);
    border: var(--bamboo-border-width) solid var(--bamboo-color-border);
    border-radius: var(--bamboo-border-radius);
  }
  .ai-copy-container h2 {
    margin-top: 0;
    margin-bottom: var(--bamboo-space-3);
    color: var(--bamboo-color-primary);
    font-size: var(--bamboo-font-size-lg);
    font-weight: var(--bamboo-font-weight-semibold);
  }
  .ai-copy-container h3 {
    margin-top: 0;
    margin-bottom: var(--bamboo-space-3);
    color: var(--bamboo-color-secondary);
    font-size: var(--bamboo-font-size-base);
  }
  .ai-copy-container p {
    font-size: var(--bamboo-font-size-sm);
    color: var(--bamboo-color-text-light);
    margin-bottom: var(--bamboo-space-4);
  }
  .ai-message-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--bamboo-space-3);
    background-color: var(--bamboo-color-surface);
    border: var(--bamboo-border-width) solid var(--bamboo-color-border);
    border-radius: var(--bamboo-border-radius);
    padding: var(--bamboo-space-4);
    box-shadow: var(--bamboo-shadow);
    transition: box-shadow 0.2s ease;
  }
  .ai-message-card:hover {
    box-shadow: var(--bamboo-shadow-lg);
  }
  .ai-message-text {
    flex-grow: 1;
    font-family: var(--bamboo-font-family);
    font-size: var(--bamboo-font-size-base);
    line-height: 1.6;
    color: var(--bamboo-color-text);
    word-wrap: break-word;
    margin-right: var(--bamboo-space-3);
  }
  .copy-btn {
    flex-shrink: 0;
    padding: var(--bamboo-space-2) var(--bamboo-space-4);
    font-size: var(--bamboo-font-size-sm);
    transition: background-color 0.2s ease, transform 0.2s ease;
  }
  .copy-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .copy-btn.copied {
    background-color: var(--bamboo-color-success) !important;
    color: var(--bamboo-color-background) !important;
  }
  .copy-status {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  @media (max-width: 640px) {
    .ai-message-card {
      flex-direction: column;
      align-items: stretch;
      gap: var(--bamboo-space-3);
    }
    .ai-message-text {
      margin-right: 0;
      margin-bottom: var(--bamboo-space-3);
    }
    .copy-btn {
      align-self: center;
      min-width: 120px;
    }
  }
`;

// JavaScript functionality for copy-to-clipboard
const AI_COPY_SCRIPT = `
  const initializeMessageCopy = () => {
    const copyButtons = document.querySelectorAll('.copy-btn');
    if (copyButtons.length === 0) return;

    // Create a single status element for all buttons
    const statusElement = document.createElement('div');
    statusElement.className = 'copy-status';
    statusElement.setAttribute('role', 'status');
    statusElement.setAttribute('aria-live', 'polite');
    statusElement.setAttribute('aria-atomic', 'true');
    document.body.appendChild(statusElement);

    copyButtons.forEach(copyButton => {
      const targetSelector = copyButton.dataset.copyTarget;
      const textElement = document.querySelector(targetSelector);
      if (!textElement) return;

      copyButton.addEventListener('click', async () => {
        const text = textElement.textContent.trim();
        
        try {
          // Try modern clipboard API first
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            fallbackCopyToClipboard(text);
          }
          showCopyFeedback(copyButton, statusElement, 'Copied!');
        } catch (err) {
          console.error('Copy failed:', err);
          showCopyFeedback(copyButton, statusElement, 'Copy failed', true);
        }
      });
    });
  };
  
  function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('aria-hidden', 'true');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
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
  
  function showCopyFeedback(button, statusElement, message, isError = false) {
    const originalText = button.textContent;
    const originalAriaLabel = button.getAttribute('aria-label');
    
    button.textContent = message;
    button.setAttribute('aria-label', message);
    button.classList.toggle('copied', !isError);
    button.disabled = true;
    
    // Update status for screen readers
    statusElement.textContent = isError ? 'Copy failed. Please try again.' : 'Message copied to clipboard';

    setTimeout(() => {
      button.textContent = originalText;
      button.setAttribute('aria-label', originalAriaLabel || 'Copy message');
      button.classList.remove('copied');
      button.disabled = false;
      statusElement.textContent = '';
    }, 2000);
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMessageCopy);
  } else {
    initializeMessageCopy();
  }
`;

// Troubleshooting blocks broken out to avoid inline cognitive overload
export const TROUBLESHOOTING_TEMPLATES = {
  // NEW: Template for Meta App Development Mode issues
  appDevelopmentMode: `
    <div class="troubleshooting">
      <h3>Meta App Is In Development Mode</h3>
      <p>The Meta application used by this tool is currently in "Development Mode". To upload assets, your Facebook profile must have a "Tester" role on the app.</p>
      <ul>
        <li><strong>For Users:</strong> Please contact your administrator and ask them to add your Facebook account as a Tester in the Meta App Dashboard under the "Roles" section.</li>
        <li><strong>For Admins:</strong> To resolve this, you must either add the user as a Tester or complete the App Review process for the 'ads_management' permission to move the app to "Live Mode".</li>
      </ul>
      <p><strong>Reference:</strong> <a href="https://developers.facebook.com/docs/development/app-modes" target="_blank" rel="noopener noreferrer">Meta App Modes Documentation</a></p>
    </div>
  `,
  // NEW: Template for personal vs. business account issues
  personalBusinessAccount: `
    <div class="troubleshooting">
      <h3>Personal or Business Account Issue</h3>
      <p>This error can occur if the ad account is not configured for advertising or if there's a mismatch between the account type (Personal vs. Business) and the API call.</p>
      <ul>
        <li><strong>Check Ad Account Status:</strong> The ad account may be disabled or restricted. Please verify its status in Meta Ads Manager. Personal ad accounts must have a valid payment method to be active.</li>
        <li><strong>Verify Business Association:</strong> If using a business-managed ad account, ensure it is correctly associated with your Meta Business Portfolio and that your user has permissions within that portfolio.</li>
        <li><strong>Account Type Mismatch:</strong> Some operations require business-managed accounts. If you're using a personal account, consider creating a Business Portfolio.</li>
      </ul>
      <p><strong>Next Steps:</strong> Please check your account settings in <a href="https://adsmanager.facebook.com/adsmanager/" target="_blank" rel="noopener noreferrer">Meta Ads Manager</a> or contact your account administrator.</p>
    </div>
  `,
  // REFINED: More focused template for account access and status
  metaApi: `
    <div class="troubleshooting">
      <h3>Ad Account Access or Status Issue</h3>
      <ul>
        <li><strong>Check Ad Account Access:</strong> Verify the ad account (ID) still exists and that your user has been granted access to it in Meta Business Settings</li>
        <li><strong>Verify Permissions:</strong> Ensure your user has an "Admin" or "Advertiser" role on the ad account</li>
        <li><strong>Check Account Status:</strong> The ad account may be disabled, under review, or have spending caps. Please check its status in Meta Ads Manager</li>
        <li><strong>Token Issues:</strong> Your access token may have expired or been revoked. Try re-authenticating with the tool</li>
      </ul>
      <p><strong>Next Steps:</strong> Please check your Meta Business Manager and try again, or contact your account administrator.</p>
    </div>
  `,
  // REFINED: More specific permission guidance
  permission: `
    <div class="troubleshooting">
      <h3>Permission Issue Detected</h3>
      <p>Your account lacks the necessary permissions to perform this action.</p>
      <ul>
        <li>Ensure you have the 'ads_management' permission scope granted to the application</li>
        <li>Verify you have the required role (e.g., Admin, Advertiser) for this specific ad account in Meta Business Settings</li>
        <li>Your access token may be invalid or expired. Please try re-authenticating</li>
        <li>If using a business account, check that your business is verified and in good standing</li>
      </ul>
      <p><strong>Reference:</strong> <a href="https://developers.facebook.com/docs/marketing-api/access" target="_blank" rel="noopener noreferrer">Meta Marketing API Access Documentation</a></p>
    </div>
  `,
  fileFormat: `
    <div class="troubleshooting">
      <h3>File Format Issue</h3>
      <ul>
        <li><strong>Supported Image Formats:</strong> JPEG, PNG, GIF, WebP</li>
        <li><strong>Supported Video Formats:</strong> MP4, MOV</li>
        <li>Check that your file is not corrupted and that the file extension matches the actual file type</li>
        <li>Ensure the file size meets Meta's requirements (typically under 30MB for images, 4GB for videos)</li>
      </ul>
    </div>
  `,
  network: `
    <div class="troubleshooting">
      <h3>Network Issue</h3>
      <ul>
        <li>Check your internet connection</li>
        <li>The file may be too large. Try compressing it or using a smaller file</li>
        <li>The upload may have timed out. Please try uploading again in a few minutes</li>
        <li>Meta's servers may be experiencing temporary issues. Check <a href="https://developers.facebook.com/status/" target="_blank" rel="noopener noreferrer">Meta Developer Status</a></li>
      </ul>
    </div>
  `,
  general: `
    <div class="troubleshooting">
      <h3>General Troubleshooting</h3>
      <ul>
        <li>Try refreshing the page and uploading again</li>
        <li>Check that your file is not corrupted</li>
        <li>Ensure you have a stable internet connection</li>
        <li>If the problem persists, please copy the error details and contact support with the error details</li>
      </ul>
    </div>
  `,
} as const;

/**
 * Generates the HTML markup for a successful upload response.
 */
export function renderUploadSuccessPage({ assetType, metaAssetId }: UploadSuccessResult): string {
  const aiPrompt = `I successfully uploaded creative asset ${metaAssetId}, please verify it.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload Complete | Bamboo</title>
  <link rel="stylesheet" href="/bamboo-ui.css">
  <style>${AI_COPY_STYLES}</style>
</head>
<body>
  <main class="container">
    <article>
      <div class="status-header">
        <div class="status-icon status-icon--success" aria-hidden="true">&#10003;</div>
        <h1>Upload Complete</h1>
        <p class="subtitle">Your creative asset has been successfully uploaded to Meta.</p>
      </div>

      <div class="asset-info-card">
        <dl>
          <dt>Asset Type</dt>
          <dd>${escapeHtml(assetType)}</dd>
          <dt>Meta Asset ID</dt>
          <dd><code>${escapeHtml(metaAssetId)}</code></dd>
        </dl>
      </div>

      <div class="ai-copy-container">
        <h2>Next Step: Validate with AI</h2>
        <p>Copy the message below and send it to your AI assistant to confirm the upload and continue your workflow.</p>
        <div class="ai-message-card">
          <div id="ai-prompt" class="ai-message-text">${escapeHtml(aiPrompt)}</div>
          <button class="copy-btn" data-copy-target="#ai-prompt" aria-label="Copy message to AI assistant">Copy for AI</button>
        </div>
      </div>

      <div class="actions">
        <button id="closeBtn" class="secondary">Close Window</button>
      </div>
      
      <div id="close-fallback" style="display: none; text-align: center; margin-top: var(--bamboo-space-4); padding: var(--bamboo-space-3); background-color: var(--bamboo-color-surface); border-radius: var(--bamboo-border-radius);">
        <p style="margin: 0; font-size: var(--bamboo-font-size-sm); color: var(--bamboo-color-text-light);">You can now safely close this tab or window.</p>
      </div>
    </article>
  </main>
  <script>
    document.getElementById('closeBtn')?.addEventListener('click', () => {
      window.close();
      setTimeout(() => {
        const fallback = document.getElementById('close-fallback');
        if (fallback) fallback.style.display = 'block';
      }, 500);
    });
    ${AI_COPY_SCRIPT}
  </script>
</body>
</html>`;
}

/**
 * Determines the error category and corresponding troubleshooting steps from an error message.
 */
export function categorizeUploadError(errorMessage: string): {
  errorCategory: string;
  troubleshootingSteps: string;
} {
  const lowerCaseMsg = errorMessage.toLowerCase();

  // Order matters – first match wins. More specific checks go first.
  const checks: Array<{ predicate: (msg: string) => boolean; category: string; steps: string }> = [
    {
      // NEW: Check for Meta App development mode errors
      predicate: (msg) =>
        msg.includes('Application does not have permission for this action') ||
        msg.includes('not been approved for use by this app') ||
        msg.includes('This app is in development mode') ||
        lowerCaseMsg.includes('app review') ||
        lowerCaseMsg.includes('development mode'),
      category: 'Meta App Development Mode Issue',
      steps: TROUBLESHOOTING_TEMPLATES.appDevelopmentMode,
    },
    {
      // NEW: Check for issues related to personal accounts or business ownership
      predicate: (msg) =>
        msg.includes('ad account is not enabled for advertising') ||
        msg.includes('is not owned by the business') ||
        lowerCaseMsg.includes('business verification') ||
        lowerCaseMsg.includes('personal account'),
      category: 'Personal or Business Account Issue',
      steps: TROUBLESHOOTING_TEMPLATES.personalBusinessAccount,
    },
    {
      // REFINED: Specific check for a common permission/existence error
      predicate: (msg) =>
        msg.includes('does not exist, cannot be loaded due to missing permissions'),
      category: 'Ad Account Access or Status Issue',
      steps: TROUBLESHOOTING_TEMPLATES.metaApi,
    },
    {
      // General permission check
      predicate: (msg) => {
        const lower = msg.toLowerCase();
        return lower.includes('permission') || lower.includes('access');
      },
      category: 'Permission Error',
      steps: TROUBLESHOOTING_TEMPLATES.permission,
    },
    {
      // File format check
      predicate: (msg) => {
        const lower = msg.toLowerCase();
        return lower.includes('unsupported file type') || lower.includes('mime type');
      },
      category: 'File Format Error',
      steps: TROUBLESHOOTING_TEMPLATES.fileFormat,
    },
    {
      // Network/timeout check
      predicate: (msg) => {
        const lower = msg.toLowerCase();
        return lower.includes('timeout') || lower.includes('network') || lower.includes('fetch');
      },
      category: 'Network Error',
      steps: TROUBLESHOOTING_TEMPLATES.network,
    },
  ];

  for (const check of checks) {
    if (check.predicate(errorMessage)) {
      return { errorCategory: check.category, troubleshootingSteps: check.steps };
    }
  }

  // Default case for any other error
  return {
    errorCategory: 'Upload Error',
    troubleshootingSteps: TROUBLESHOOTING_TEMPLATES.general,
  };
}

/**
 * Generates the HTML markup for a failed upload response.
 */
export function renderUploadFailedPage(
  errorCategory: string,
  errorMessage: string,
  troubleshootingSteps: string
): string {
  const aiPrompt = `My attempt to upload a creative asset failed with the error: "${errorMessage}". Could you please provide a new upload link?`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload Failed | Bamboo</title>
  <link rel="stylesheet" href="/bamboo-ui.css">
  <style>${AI_COPY_STYLES}</style>
</head>
<body>
  <main class="container">
    <article>
      <div class="status-header">
        <div class="status-icon status-icon--error" aria-hidden="true">&times;</div>
        <h1>Upload Failed</h1>
        <p class="subtitle">${escapeHtml(errorCategory)}</p>
      </div>

      <div class="asset-info-card">
        <h3>Error Details</h3>
        <p><code>${escapeHtml(errorMessage)}</code></p>
      </div>

      <div class="ai-copy-container">
        <h2>Request Assistance from AI</h2>
        <p>To get a new upload link, copy the message below and send it to your AI assistant.</p>
        <div class="ai-message-card">
          <div id="ai-prompt" class="ai-message-text">${escapeHtml(aiPrompt)}</div>
          <button class="copy-btn" data-copy-target="#ai-prompt" aria-label="Copy message to AI assistant">Copy for AI</button>
        </div>
      </div>
      
      ${troubleshootingSteps}
      
      <div class="asset-info-card">
        <h3>Need Additional Help?</h3>
        <p>If you continue to experience issues, please:</p>
        <ul>
          <li>Copy the error details above</li>
          <li>Note the time when the error occurred</li>
          <li>Contact your system administrator or support team</li>
        </ul>
      </div>

      <div class="actions">
        <button id="tryAgainBtn">Try Again</button>
        <button id="closeBtn" class="secondary">Close Window</button>
      </div>
      
      <div id="close-fallback" style="display: none; text-align: center; margin-top: var(--bamboo-space-4); padding: var(--bamboo-space-3); background-color: var(--bamboo-color-surface); border-radius: var(--bamboo-border-radius);">
        <p style="margin: 0; font-size: var(--bamboo-font-size-sm); color: var(--bamboo-color-text-light);">You can now safely close this tab or window.</p>
      </div>
    </article>
  </main>
  <script>
    document.getElementById('tryAgainBtn')?.addEventListener('click', () => window.location.reload());
    document.getElementById('closeBtn')?.addEventListener('click', () => {
      window.close();
      setTimeout(() => {
        const fallback = document.getElementById('close-fallback');
        if (fallback) fallback.style.display = 'block';
      }, 500);
    });
    ${AI_COPY_SCRIPT}
  </script>
</body>
</html>`;
}

/**
 * Generates the HTML markup for the "Upload In Progress" (409) page.
 */
export function renderUploadInProgressPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10">
  <title>Upload In Progress | Bamboo</title>
  <link rel="stylesheet" href="/bamboo-ui.css">
</head>
<body>
  <main class="container">
    <article>
      <div class="status-header">
        <div class="status-icon status-icon--progress"><div class="spinner"></div></div>
        <h1>Upload in Progress</h1>
        <p class="subtitle">Your file is being uploaded to Meta. This may take a few moments.</p>
      </div>
      
      <div class="asset-info-card">
        <p style="text-align: center;">This page will automatically refresh every 10 seconds to check the status.</p>
        <p style="text-align: center;">You can safely close this window; the process will continue in the background.</p>
      </div>
    </article>
  </main>
</body>
</html>`;
}

/**
 * Generates the HTML markup for the "Upload Session Not Found" (404) page.
 */
export function renderUploadSessionNotFoundPage(): string {
  const aiPrompt =
    'My upload link is invalid, expired, or has already been used. Could you please provide a new upload link?';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload Session Not Found | Bamboo</title>
  <link rel="stylesheet" href="/bamboo-ui.css">
  <style>${AI_COPY_STYLES}</style>
</head>
<body>
  <main class="container">
    <article>
      <div class="status-header">
        <div class="status-icon status-icon--error" aria-hidden="true">!</div>
        <h1>Session Not Found</h1>
        <p class="subtitle">This upload link is invalid, expired, or has already been used.</p>
      </div>
      
      <div class="ai-copy-container">
        <h2>Request a New Link</h2>
        <p>Copy the message below and send it to your AI assistant to get a new upload link.</p>
        <div class="ai-message-card">
          <div id="ai-prompt" class="ai-message-text">${escapeHtml(aiPrompt)}</div>
          <button class="copy-btn" data-copy-target="#ai-prompt" aria-label="Copy message to request new upload link">Copy for AI</button>
        </div>
      </div>

      <div class="actions">
        <button id="closeBtn" class="secondary">Close Window</button>
      </div>
      
      <div id="close-fallback" style="display: none; text-align: center; margin-top: var(--bamboo-space-4); padding: var(--bamboo-space-3); background-color: var(--bamboo-color-surface); border-radius: var(--bamboo-border-radius);">
        <p style="margin: 0; font-size: var(--bamboo-font-size-sm); color: var(--bamboo-color-text-light);">You can now safely close this tab or window.</p>
      </div>
    </article>
  </main>
  <script>
    document.getElementById('closeBtn')?.addEventListener('click', () => {
      window.close();
      setTimeout(() => {
        const fallback = document.getElementById('close-fallback');
        if (fallback) fallback.style.display = 'block';
      }, 500);
    });
    ${AI_COPY_SCRIPT}
  </script>
</body>
</html>`;
}

/**
 * Generates the HTML markup for the main upload form page.
 * @param uploadId The UUID for the upload session.
 */
export function renderUploadFormPage(uploadId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload Creative Asset | Bamboo</title>
  <link rel="stylesheet" href="/bamboo-ui.css">
</head>
<body>
  <main class="container">
    <article>
      <div class="status-header">
        <div class="status-icon status-icon--info" aria-hidden="true">&#8593;</div>
        <h1>Upload Creative Asset</h1>
        <p class="subtitle">Select a file to upload. The asset type will be automatically detected.</p>
      </div>

      <form id="uploadForm" action="/v1/assets/upload/${escapeHtml(uploadId)}" method="post" enctype="multipart/form-data">
        <div class="file-input-wrapper">
          <label for="file" class="file-input-label">
            <span class="label-text" id="file-label-text">Click to browse or drag file here</span>
            <span class="label-instructions">Supported: JPG, PNG, GIF, WebP, MP4, MOV</span>
          </label>
          <input type="file" id="file" name="file" class="visually-hidden" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/mov,video/quicktime" required>
        </div>
        
        <div class="actions">
          <button id="submitBtn" type="submit" disabled>Upload File</button>
        </div>
      </form>
    </article>
  </main>
  <script>
    const form = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submitBtn');
    const fileInput = document.getElementById('file');
    const fileLabelText = document.getElementById('file-label-text');
    
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        fileLabelText.textContent = fileInput.files[0].name;
        submitBtn.disabled = false;
      } else {
        fileLabelText.textContent = 'Click to browse or drag file here';
        submitBtn.disabled = true;
      }
    });

    form.addEventListener('submit', () => {
      if (fileInput.files.length > 0) {
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.disabled = true;
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Generates the HTML markup for a generic server error (500) page.
 * @param customMessage An optional, user-facing error message to display.
 */
export function renderServerErrorPage(customMessage?: string): string {
  const displayMessage = customMessage
    ? escapeHtml(customMessage)
    : 'An unexpected error occurred. Our team has been notified and is looking into it.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Server Error | Bamboo</title>
  <link rel="stylesheet" href="/bamboo-ui.css">
</head>
<body>
  <main class="container">
    <article>
      <div class="status-header">
        <div class="status-icon status-icon--error" aria-hidden="true">&times;</div>
        <h1>Server Error</h1>
        <p class="subtitle">We've encountered a problem.</p>
      </div>
      
      <div class="asset-info-card">
        <p style="text-align: center;">${displayMessage}</p>
      </div>
      
      <div class="actions">
        <button id="reloadBtn">Try Again</button>
        <button id="closeBtn" class="secondary">Close Window</button>
      </div>
      
      <div id="close-fallback" style="display: none; text-align: center; margin-top: var(--bamboo-space-4); padding: var(--bamboo-space-3); background-color: var(--bamboo-color-surface); border-radius: var(--bamboo-border-radius);">
        <p style="margin: 0; font-size: var(--bamboo-font-size-sm); color: var(--bamboo-color-text-light);">You can now safely close this tab or window.</p>
      </div>
    </article>
  </main>
  <script>
    document.getElementById('reloadBtn')?.addEventListener('click', () => window.location.reload());
    document.getElementById('closeBtn')?.addEventListener('click', () => {
      window.close();
      setTimeout(() => {
        const fallback = document.getElementById('close-fallback');
        if (fallback) fallback.style.display = 'block';
      }, 500);
    });
  </script>
</body>
</html>`;
}
