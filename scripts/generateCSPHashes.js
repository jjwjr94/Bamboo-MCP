#!/usr/bin/env node

/**
 * CSP Hash Generator
 *
 * This utility automatically calculates SHA-256 hashes for inline scripts
 * used in upload templates. Run this after making changes to the script
 * constants in src/utils/uploadTemplates.ts to get the updated CSP hashes
 * that need to be placed in src/index.ts.
 *
 * Usage: node scripts/generateCSPHashes.js
 */

import crypto from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Calculate SHA-256 hash for CSP compliance
 */
function calculateHash(scriptContent) {
  const hash = crypto.createHash('sha256').update(scriptContent.trim()).digest('base64');
  return `'sha256-${hash}'`;
}

/**
 * Extract script constants from TypeScript source file
 */
async function loadScripts() {
  try {
    const fs = await import('node:fs/promises');
    const templatePath = join(__dirname, '../src/utils/uploadTemplates.ts');
    const sourceCode = await fs.readFile(templatePath, 'utf8');

    // Extract script constants using regex patterns
    const scripts = {};
    const scriptPatterns = [
      'UPLOAD_FORM_SCRIPT',
      'SUCCESS_SESSION_NOT_FOUND_SCRIPT',
      'FAILED_PAGE_SCRIPT',
      'SERVER_ERROR_SCRIPT',
    ];

    for (const scriptName of scriptPatterns) {
      // Match: const SCRIPT_NAME = `...`;
      const regex = new RegExp(`const ${scriptName} = \`([\\s\\S]*?)\`;`, 'g');
      const match = sourceCode.match(regex);

      if (match?.[0]) {
        // Extract just the content between backticks
        const content = match[0].replace(
          new RegExp(`const ${scriptName} = \`([\\s\\S]*?)\`;`),
          '$1'
        );
        scripts[scriptName] = content.trim();
      } else {
        console.warn(`⚠️  Could not find ${scriptName} in source file`);
        scripts[scriptName] = '';
      }
    }

    return scripts;
  } catch (error) {
    console.error('❌ Error reading TypeScript source file:', error.message);
    process.exit(1);
  }
}

/**
 * Generate and display CSP hashes
 */
async function generateHashes() {
  const scripts = await loadScripts();
  const hashes = {};

  for (const [scriptName, scriptContent] of Object.entries(scripts)) {
    if (scriptContent) {
      hashes[scriptName] = calculateHash(scriptContent);
    } else {
    }
  }
  for (const _hash of Object.values(hashes)) {
  }
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateHashes().catch(console.error);
}
