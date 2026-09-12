import fs from "fs";
import path from "path";

/**
 * Safely deletes a file from the filesystem if it exists.
 * Does not throw if the file is already gone.
 * @param {string} filePath - Absolute path to the file
 */
export async function safeDeleteFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    console.warn(`[FileUtil] Warning: Unable to delete temporary file ${filePath}:`, err.message);
  }
}

/**
 * Ensures required directories exist on the filesystem.
 * @param {string[]} directories - Array of directory paths
 */
export function ensureDirectoriesExist(directories) {
  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
