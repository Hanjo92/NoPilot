export interface ModelSelectionTarget {
  info: {
    currentModel: string;
  };
  setCurrentModel(model: string): void;
}

export function applyModelSelection(
  target: ModelSelectionTarget,
  model: string
): string {
  target.setCurrentModel(model);
  return target.info.currentModel;
}
