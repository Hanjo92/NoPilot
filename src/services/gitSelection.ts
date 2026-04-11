import path from 'node:path';

function normalizeFsPath(value: string): string {
  return path.resolve(value);
}

export function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  const normalizedFilePath = normalizeFsPath(filePath);
  const normalizedRootPath = normalizeFsPath(rootPath);
  const relativePath = path.relative(normalizedRootPath, normalizedFilePath);

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function chooseRepositoryIndex(
  repositoryRootPaths: string[],
  activeFilePath?: string
): number {
  if (repositoryRootPaths.length === 0) {
    return -1;
  }

  if (!activeFilePath) {
    return 0;
  }

  let bestIndex = -1;
  let bestRootLength = -1;

  repositoryRootPaths.forEach((rootPath, index) => {
    if (isPathInsideRoot(activeFilePath, rootPath) && rootPath.length > bestRootLength) {
      bestIndex = index;
      bestRootLength = rootPath.length;
    }
  });

  return bestIndex === -1 ? 0 : bestIndex;
}

export function collectRepositoryRootPaths(
  repositories: Array<{ rootUri?: { fsPath: string; scheme?: string } }>
): string[] {
  return repositories
    .filter((repository) => repository.rootUri?.scheme === 'file')
    .map((repository) => repository.rootUri!.fsPath);
}
