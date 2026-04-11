import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyModelSelection,
  type ModelSelectionTarget,
} from './modelSelection';

class FakeProvider implements ModelSelectionTarget {
  private currentModel = 'gpt-4o-mini';

  get info(): { currentModel: string } {
    return { currentModel: this.currentModel };
  }

  setCurrentModel(model: string): void {
    this.currentModel = model;
  }
}

test('applyModelSelection updates provider state even when info is a snapshot', () => {
  const provider = new FakeProvider();

  const selectedModel = applyModelSelection(provider, 'gpt-4o');

  assert.equal(selectedModel, 'gpt-4o');
  assert.equal(provider.info.currentModel, 'gpt-4o');
});
