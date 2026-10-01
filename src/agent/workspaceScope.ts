import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Cancellation, checkCancellation } from './cancellation';

const EXCLUDED = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'Library', 'Temp']);
export const MAX_FILE_BYTES = 65_536;

export function validateRelativePath(value: string): string[] {
  const parts = value.split('/');
  if (!value || value.length > 500 || /[\\:]/.test(value) || [...value].some(character => character.charCodeAt(0) < 32) || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value) || parts.some(part => !part || part.startsWith('.') || EXCLUDED.has(part))
    || /\.(?:pem|key|p12|pfx|keystore)$/i.test(value)) {
    throw new Error('Path must be a visible, repository-relative file outside dependency/build folders and credential files.');
  }
  return parts;
}

export function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Local file tools are confined to one canonical root; symlinks are never followed. */
export class WorkspaceScope {
  private constructor(readonly root: string) {}
  static async create(root: string): Promise<WorkspaceScope> {
    const canonical = await fs.realpath(root);
    if (!(await fs.stat(canonical)).isDirectory()) { throw new Error('Select a local workspace folder.'); }
    return new WorkspaceScope(canonical);
  }
  private async assertRoot(): Promise<void> {
    if (await fs.realpath(this.root) !== this.root || (await fs.lstat(this.root)).isSymbolicLink()) {
      throw new Error('The selected workspace root changed. Start a new Agent run.');
    }
  }
  async resolve(relative: string): Promise<string> {
    await this.assertRoot();
    const parts = validateRelativePath(relative);
    let current = this.root;
    for (const part of parts) {
      current = path.join(current, part);
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) { throw new Error('Symlinks are outside the agent file-tool scope.'); }
    }
    const real = await fs.realpath(current);
    if (!isWithinRoot(this.root, real)) { throw new Error('Path escaped the selected workspace.'); }
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) { throw new Error('Only regular files up to 64 KiB are supported.'); }
    return real;
  }
  relative(absolute: string): string {
    const relative = path.relative(this.root, absolute).split(path.sep).join('/');
    validateRelativePath(relative);
    return relative;
  }
  async list(query: string, token: Cancellation): Promise<{ paths: string[]; truncated: boolean }> {
    await this.assertRoot();
    const paths: string[] = [];
    const pending = [''];
    let visited = 0;
    while (pending.length && visited < 2000 && paths.length < 200) {
      checkCancellation(token);
      const directory = pending.shift()!;
      // Revalidate each directory component to avoid traversing a replaced symlink.
      let current = this.root;
      for (const part of directory.split('/').filter(Boolean)) {
        current = path.join(current, part);
        if ((await fs.lstat(current)).isSymbolicLink()) { throw new Error('Workspace directory changed to a symlink.'); }
      }
      const entries = (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      if (await fs.realpath(current) !== current) { throw new Error('Workspace directory changed during listing.'); }
      for (const entry of entries) {
        if (++visited > 2000 || paths.length >= 200) { break; }
        const relative = directory ? `${directory}/${entry.name}` : entry.name;
        try { validateRelativePath(relative); } catch { continue; }
        if (entry.isSymbolicLink()) { continue; }
        if (entry.isDirectory()) { pending.push(relative); }
        else if (entry.isFile() && relative.toLowerCase().includes(query.toLowerCase())) { paths.push(relative); }
      }
    }
    return { paths, truncated: pending.length > 0 || visited >= 2000 || paths.length >= 200 };
  }
}
